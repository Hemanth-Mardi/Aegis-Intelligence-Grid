import struct
import sqlite3
import json
import os
import random
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import uvicorn

app = FastAPI(
    title="Aegis Intelligence Grid",
    description="Enterprise-Grade Offline-First Crisis Command Center Backend"
)

# File Paths
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(CURRENT_DIR, "static")
os.makedirs(STATIC_DIR, exist_ok=True)
DB_PATH = os.path.join(CURRENT_DIR, "aegis_grid.db")

# --- DATABASE MANAGEMENT & DDL INITIALIZATION ---
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Drop existing tables to guarantee schema compatibility on restart
    cursor.execute("DROP TABLE IF EXISTS survivor_requests;")
    cursor.execute("DROP TABLE IF EXISTS historical_alerts;")
    
    # 1. Survivor Requests Table with requested_resources
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS survivor_requests (
        user_id INTEGER PRIMARY KEY,
        lat REAL,
        lon REAL,
        status_code INTEGER,
        vulnerable INTEGER,
        ai_score REAL,
        ai_triage TEXT,
        transport TEXT,
        raw_hex TEXT,
        encrypted_identity TEXT,
        decrypted_identity TEXT,
        requested_resources TEXT DEFAULT 'Medical Kit',
        dead_reckoning_used INTEGER,
        wifi_fingerprint TEXT,
        floor_estimate INTEGER,
        hitl_verified INTEGER DEFAULT 0, -- 0: Pending, 1: Verified, -1: Spoofed
        sar_image_url TEXT,
        dispatch_status TEXT DEFAULT 'PENDING', -- PENDING, DISPATCHED, RESOLVED
        hope_loop_acked INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # 2. Historical Alerts & Environmental Threats Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS historical_alerts (
        alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT,
        type TEXT,
        lat REAL,
        lon REAL,
        severity TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # 3. Resource Inventory Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS resource_inventory (
        resource_id TEXT PRIMARY KEY,
        name TEXT,
        category TEXT, -- Medical, Food, Shelter
        quantity INTEGER,
        allocated_to INTEGER DEFAULT NULL
    );
    """)
    
    # Pre-populate static resource inventory for demo
    resources = [
        ("MEDIKIT_01", "Trauma First Aid Kit", "Medical", 25),
        ("MEDIKIT_02", "Burn Care Module", "Medical", 25),
        ("RATION_01", "Emergency MRE Food Pack", "Food", 25),
        ("RATION_02", "Purification Water Pack", "Food", 25),
        ("SHELTER_01", "Thermal Cold Tent", "Shelter", 25),
        ("SHELTER_02", "Inflatable Rescue Cot", "Shelter", 25),
    ]
    for r_id, name, cat, qty in resources:
        cursor.execute("""
        INSERT OR IGNORE INTO resource_inventory (resource_id, name, category, quantity)
        VALUES (?, ?, ?, ?);
        """, (r_id, name, cat, qty))
        
    conn.commit()
    conn.close()

# Initialize DB structure on load
init_db()


# --- ASYMMETRIC END-TO-END DECRYPTION ENGINE ---
class AsymmetricDecrypter:
    """
    Simulates modular inverse operations of RSA-2048 keys.
    Obfuscates sensitive user information so that it's unreadable to transit nodes.
    Only nodes holding the private key (HQ Backend) can decrypt.
    """
    def __init__(self):
        self.public_key = "RSA-2048-PUB-8F9B2C3D4E5F6A7B"
        self.private_key = "RSA-2048-PRIV-9A8B7C6D5E4F3A2B"

    def decrypt(self, cipher_hex: str) -> str:
        if not cipher_hex:
            return "UNKNOWN SENSITIVE DATA"
        try:
            cipher_bytes = bytes.fromhex(cipher_hex)
            plain_chars = []
            for b in cipher_bytes:
                # 17 is simulated public modulus factor, 241 is the modular inverse (17 * 241 = 4097 = 1 mod 256)
                plain_chars.append(chr((b * 241) % 256))
            return "".join(plain_chars)
        except Exception as e:
            return f"[DECRYPTION FAULT: {str(e)}]"

decrypter = AsymmetricDecrypter()


# --- AI TRIAGE SCORE CLASSIFIER ---
def run_enterprise_ai_triage(status_code: int, vulnerability_bit: int) -> tuple:
    """
    Dual-engine Triage Classifier:
    Calculates a precise emergency index based on severity mapping and vulnerable status.
    Returns: (Triage Score: float, Category String: str)
    """
    base_score = float(status_code * 12.5) # Scale to 100 max
    
    # Vulnerability modifier
    if vulnerability_bit == 1:
        base_score += 15.0
        
    # Cap score
    final_score = min(base_score, 100.0)
    
    # Categorization
    if final_score >= 75.0:
        category = "CRITICAL (Immediate Dispatch Required)"
    elif final_score >= 40.0:
        category = "HIGH (Priority Response)"
    else:
        category = "STANDARD (Monitor Status)"
        
    return final_score, category


# --- INTAKE MODELS ---
class WifiAccessPoint(BaseModel):
    bssid: str
    rssi: int

class BinaryPayloadSchema(BaseModel):
    hex_string: str # 17-byte hex SOS
    network_path: str # "MESH" or "SATELLITE"
    encrypted_identity: Optional[str] = ""
    requested_resources: Optional[str] = "Medical Kit"
    dead_reckoning: Optional[bool] = False
    wifi_fingerprints: Optional[List[WifiAccessPoint]] = []
    floor_estimate: Optional[int] = 0


# --- REAL-TIME EVENT STREAM (SSE) CONTROLLER ---
ACTIVE_CONNECTIONS = []

@app.get("/api/v1/stream")
async def message_stream():
    """
    Establish Server-Sent Events (SSE) connection to push real-time database updates to dashboards instantly.
    """
    async def event_generator():
        queue = asyncio.Queue()
        ACTIVE_CONNECTIONS.append(queue)
        try:
            # Send initial connected ping
            yield f"data: {json.dumps({'event': 'connected'})}\n\n"
            while True:
                data = await queue.get()
                yield f"data: {json.dumps(data)}\n\n"
        except asyncio.CancelledError:
            if queue in ACTIVE_CONNECTIONS:
                ACTIVE_CONNECTIONS.remove(queue)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

async def notify_clients(event_type: str, details: dict = None):
    payload = {"event": event_type, "details": details or {}}
    for queue in ACTIVE_CONNECTIONS:
        await queue.put(payload)


# --- API ENDPOINTS ---

# 1. Binary Intake
@app.post("/api/v1/intake/binary-sos")
async def process_binary_sos(payload: BinaryPayloadSchema):
    try:
        binary_data = bytes.fromhex(payload.hex_string)
        
        # Unpack structural binary data (17-Byte Schema: QffB)
        user_id, lat, lon, status_byte = struct.unpack('>QffB', binary_data)
        
        # Bit-unpack status byte (First 7 bits: status severity, Last 1 bit: vulnerability)
        status_code = status_byte >> 1
        vulnerability_bit = status_byte & 1
        
        # Local Decryption of Sensitive Identity payload (E2EE)
        decrypted_identity = decrypter.decrypt(payload.encrypted_identity)
        
        # Run AI Triage Engine
        ai_score, triage_tier = run_enterprise_ai_triage(status_code, vulnerability_bit)
        
        # Generate mock SAR image url for human verification check
        mock_sar_imgs = [
            "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=400&q=80",
            "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=80",
            "https://images.unsplash.com/photo-1547082299-de196ea013d6?auto=format&fit=crop&w=400&q=80"
        ]
        sar_image_url = random.choice(mock_sar_imgs)
        
        wifi_json = json.dumps([ap.model_dump() for ap in payload.wifi_fingerprints])
        
        # Insert or Update SQLite database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
        INSERT OR REPLACE INTO survivor_requests (
            user_id, lat, lon, status_code, vulnerable, ai_score, ai_triage, 
            transport, raw_hex, encrypted_identity, decrypted_identity, 
            requested_resources, dead_reckoning_used, wifi_fingerprint, floor_estimate, sar_image_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            user_id, round(lat, 5), round(lon, 5), status_code, vulnerability_bit,
            ai_score, triage_tier, payload.network_path, payload.hex_string,
            payload.encrypted_identity, decrypted_identity, payload.requested_resources,
            1 if payload.dead_reckoning else 0, wifi_json, payload.floor_estimate,
            sar_image_url
        ))
        
        conn.commit()
        conn.close()
        
        # Push instant SSE update notification to all dashboards
        await notify_clients("telemetry", {"user_id": user_id, "ai_triage": triage_tier})
        
        return {
            "status": "processed",
            "user_id": user_id,
            "ai_score": ai_score,
            "ai_triage": triage_tier,
            "decrypted_identity": decrypted_identity,
            "requested_resources": payload.requested_resources,
            "hope_loop": "ACK_QUEUED"
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ingestion decryption error: {str(e)}")

# 2. Simulated Environment API Aggregator
@app.get("/api/v1/environmental-hazards")
def get_environmental_hazards():
    """
    Pulls data streams from simulated structural APIs (NASA FIRMS & Government Hydrology Network)
    Inserts feeds into active alerts tables.
    """
    simulated_feeds = [
        {
            "source": "NASA FIRMS Satellite Stream",
            "type": "Wildfire Thermal Hazard",
            "lat": 12.9785, "lon": 77.5920,
            "severity": "HIGH"
        },
        {
            "source": "Central Hydrology River Gauge Network",
            "type": "Flash Flood Level 3 Alert",
            "lat": 12.9611, "lon": 77.6142,
            "severity": "CRITICAL"
        }
    ]
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    for f in simulated_feeds:
        cursor.execute("""
        INSERT INTO historical_alerts (source, type, lat, lon, severity)
        SELECT ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
            SELECT 1 FROM historical_alerts 
            WHERE source = ? AND type = ? AND lat = ? AND lon = ?
        );
        """, (f["source"], f["type"], f["lat"], f["lon"], f["severity"],
              f["source"], f["type"], f["lat"], f["lon"]))
        
    conn.commit()
    conn.close()
    
    return {"status": "success", "feeds": simulated_feeds}

# 3. Main Command Dashboard API
@app.get("/api/v1/dashboard")
def get_dashboard_summary():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Fetch Survivors
    cursor.execute("SELECT * FROM survivor_requests ORDER BY timestamp DESC;")
    survivors = [dict(row) for row in cursor.fetchall()]
    
    # Parse BSSIDs in results
    for s in survivors:
        try:
            s["wifi_fingerprint"] = json.loads(s["wifi_fingerprint"]) if s["wifi_fingerprint"] else []
        except Exception:
            s["wifi_fingerprint"] = []
            
    # Fetch Hazards
    cursor.execute("SELECT * FROM historical_alerts ORDER BY timestamp DESC LIMIT 15;")
    hazards = [dict(row) for row in cursor.fetchall()]
    
    # Fetch Inventory
    cursor.execute("SELECT * FROM resource_inventory;")
    inventory = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return {
        "active_survivors": survivors,
        "total_active_cases": len(survivors),
        "hazards": hazards,
        "inventory": inventory
    }

# 4. Human-in-the-Loop Validation Action
class HITLSchema(BaseModel):
    user_id: int
    validation_status: int # 1: Verified, -1: Spoofed

@app.post("/api/v1/verify-hitl")
async def verify_hitl_action(payload: HITLSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    UPDATE survivor_requests 
    SET hitl_verified = ? 
    WHERE user_id = ?;
    """, (payload.validation_status, payload.user_id))
    
    conn.commit()
    conn.close()
    
    # Push update
    await notify_clients("verify", {"user_id": payload.user_id, "status": payload.validation_status})
    
    status_msg = "VERIFIED" if payload.validation_status == 1 else "SPOOF_ALERT"
    return {"status": "success", "message": f"Survivor request flagged as {status_msg}"}

# 5. Inventory Dispatch & Reverse Mesh "Hope Loop" Handshake
class DispatchSchema(BaseModel):
    user_id: int
    resource_ids: List[str] # Support multiple items at once

@app.post("/api/v1/dispatch")
async def dispatch_resource(payload: DispatchSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    dispatched_items = []
    for r_id in payload.resource_ids:
        # Check item availability
        cursor.execute("SELECT name, quantity FROM resource_inventory WHERE resource_id = ?;", (r_id,))
        item = cursor.fetchone()
        
        if item and item["quantity"] > 0:
            # Deduct inventory quantity by 1
            cursor.execute("UPDATE resource_inventory SET quantity = quantity - 1 WHERE resource_id = ?;", (r_id,))
            dispatched_items.append(item["name"])
            
    if not dispatched_items:
        conn.close()
        raise HTTPException(status_code=400, detail="No selected resources are available in inventory")
        
    items_str = ", ".join(dispatched_items)
    
    # Update survivor request (Dispatch Status & Hope Loop Handshake ack)
    cursor.execute("""
    UPDATE survivor_requests 
    SET dispatch_status = 'DISPATCHED', hope_loop_acked = 1 
    WHERE user_id = ?;
    """, (payload.user_id,))
    
    conn.commit()
    conn.close()
    
    # Push SSE notification update
    await notify_clients("dispatch", {"user_id": payload.user_id, "resources": items_str})
    
    return {
        "status": "success",
        "message": f"Resources [{items_str}] successfully dispatched to survivor {payload.user_id}."
    }

# 6. Database reset
@app.post("/api/v1/clear")
async def clear_telemetry_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM survivor_requests;")
    cursor.execute("DELETE FROM historical_alerts;")
    # Reset default inventory quantities
    cursor.execute("UPDATE resource_inventory SET quantity = 25;")
    conn.commit()
    conn.close()
    
    # Push update
    await notify_clients("clear")
    
    return {"status": "success", "message": "Relational DB records cleared"}

# Serve Dashboard HTML View
@app.get("/")
def get_web_dashboard():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

# Mount static files safely. Fallback to current directory relative mount
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
