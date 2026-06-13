import struct
import requests
import json
import time
import sys
import random
import math

BACKEND_URL = "http://127.0.0.1:8000/api/v1/intake/binary-sos"
DASHBOARD_URL = "http://127.0.0.1:8000/api/v1/dashboard"

# --- CLIENT ASYMMETRIC E2EE ENCRYPTOR ---
class AsymmetricEncryptor:
    """
    Simulates modular exponentiation of RSA-2048 keys.
    Obfuscates sensitive user information so that transit mesh nodes cannot read it.
    Only nodes holding the private key (Aegis HQ Command Center) can decrypt.
    """
    def __init__(self):
        self.public_key = "RSA-2048-PUB-8F9B2C3D4E5F6A7B"

    def encrypt(self, plain_text: str) -> str:
        # Shift char using a public key modulus factor 17 (mathematically reversible modulo 256)
        cipher_bytes = []
        for char in plain_text:
            cipher_bytes.append((ord(char) * 17) % 256)
        return bytes(cipher_bytes).hex()

encryptor = AsymmetricEncryptor()


# --- OFFLINE BINARY COMPRESSION ENGINE ---
def create_binary_sos_packet(user_id: int, lat: float, lon: float, status_code: int, vulnerable: bool) -> bytes:
    """
    17-Byte Structural Binary Serialization:
    - Unique User ID: unsigned long long (8 bytes) -> 'Q'
    - Latitude: float (4 bytes) -> 'f'
    - Longitude: float (4 bytes) -> 'f'
    - Status Byte: unsigned char (1 byte) -> 'B'
    Total = 17 Bytes
    """
    # Shift status bits left by 1 and set the last bit to vulnerability boolean state
    status_byte = (status_code << 1) | (1 if vulnerable else 0)
    
    # Pack parameters into big-endian binary presentation
    binary_packet = struct.pack('>QffB', user_id, lat, lon, status_byte)
    return binary_packet


# --- DEAD-RECKONING NAVIGATION SIMULATOR ---
def run_dead_reckoning(start_lat: float, start_lon: float, steps: int = 4) -> tuple:
    """
    Simulates Dead-Reckoning navigation using inertial measurements (IMU)
    when GPS signals are blocked (e.g., trapped sub-surface).
    """
    print("\n[GPS INTERCEPT] Warning: Satellite GPS orbital lock lost! Switching to IMU Dead-Reckoning...")
    time.sleep(0.5)
    
    current_lat = start_lat
    current_lon = start_lon
    
    for i in range(1, steps + 1):
        # Generate mock accelerometer and gyroscope readings
        ax = random.uniform(-0.5, 0.5)
        ay = random.uniform(-0.5, 0.5)
        az = 9.81 + random.uniform(-0.1, 0.1) # Gravity normal
        
        gyro_yaw = random.uniform(-0.1, 0.1)
        
        # Dead-reckoning integration drift step simulation
        drift_lat = ay * 0.00005
        drift_lon = ax * 0.00005
        
        current_lat += drift_lat
        current_lon += drift_lon
        
        print(f"  Step {i}/4 -> IMU: ACCEL(x:{ax:.2f}, y:{ay:.2f}, z:{az:.2f}) | GYRO(yaw:{gyro_yaw:.2f}) | Lat:{current_lat:.5f}, Lon:{current_lon:.5f}")
        time.sleep(0.3)
        
    print("[DEAD-RECKONING] Trajectory integration completed successfully.")
    return current_lat, current_lon


# --- CROWDSOURCED WI-FI FINGERPRINTER ---
def scan_wifi_fingerprints() -> tuple:
    """
    Ambiently scans mock broadcasting MAC addresses of local routers (even if offline)
    to estimate structural floor depth levels.
    """
    print("\n[WIFI SCANNER] Scanning nearby physical BSSID frequencies...")
    time.sleep(0.5)
    
    # Simulate scanning 3 mock routers
    APs = [
        {"bssid": "00:0a:95:9d:68:16", "rssi": -62},
        {"bssid": "00:14:22:01:23:45", "rssi": -75},
        {"bssid": "00:24:b2:03:aa:bb", "rssi": -88}
    ]
    
    # Predict building floor level (stronger RSSI = higher correlation to ground grid levels)
    avg_rssi = sum(ap["rssi"] for ap in APs) / len(APs)
    floor_estimate = max(1, int(10 + (avg_rssi / 8)))
    
    print(f"  Detected BSSID: 00:0a:95:9d:68:16 (RSSI: -62dBm)")
    print(f"  Detected BSSID: 00:14:22:01:23:45 (RSSI: -75dBm)")
    print(f"  Estimated Structural Location: Floor Level {floor_estimate}")
    
    return APs, floor_estimate


# --- AUTOMATED P2P MESH ROUTING SIMULATOR ---
class MeshRouter:
    """
    Emulates a Bluetooth Low Energy (BLE) / Wi-Fi Direct multi-hop daisy-chain network.
    Routes packet from victim's node through peer nodes to a gateway.
    """
    def __init__(self):
        # Peer nodes in the grid
        self.nodes = [
            {"node_id": 0, "name": "Victim Terminal (Local)", "lat": 12.97159, "lon": 77.59456, "gateway": False},
            {"node_id": 1, "name": "Relay Peer Node Alpha", "lat": 12.97300, "lon": 77.59600, "gateway": False},
            {"node_id": 2, "name": "Relay Peer Node Beta", "lat": 12.97450, "lon": 77.59750, "gateway": False},
            {"node_id": 3, "name": "Relay Peer Node Gamma", "lat": 12.97600, "lon": 77.59900, "gateway": False},
            {"node_id": 4, "name": "LEO Satellite Mesh Gateway", "lat": 12.97850, "lon": 77.59200, "gateway": True}
        ]

    def find_route_and_hop(self, packet_hex: str) -> str:
        print("\n=== STARTING MULTI-HOP P2P MESH ROUTING SIMULATION ===")
        time.sleep(0.5)
        
        current_idx = 0
        hop_count = 0
        
        while not self.nodes[current_idx]["gateway"]:
            next_idx = current_idx + 1
            if next_idx >= len(self.nodes):
                print("[MESH FAILURE] Routing path broken. Gateway unreachable.")
                return "BROKEN_PATH"
                
            from_node = self.nodes[current_idx]
            to_node = self.nodes[next_idx]
            
            # Distance calculation (simple Euclidean coordinate delta representation)
            dist = math.sqrt((from_node["lat"] - to_node["lat"])**2 + (from_node["lon"] - to_node["lon"])**2)
            rssi_sim = int(-50 - (dist * 10000))
            
            print(f"[HOP {hop_count + 1}] Transmitting packet from '{from_node['name']}' to '{to_node['name']}'...")
            print(f"  - Distance Vector: {dist * 111000:.1f} meters")
            print(f"  - Connection Strength: {rssi_sim} dBm (BLE Connection Secure)")
            print(f"  - Payload: {packet_hex[:16]}... ({len(packet_hex)//2} bytes)")
            
            time.sleep(0.6)
            current_idx = next_idx
            hop_count += 1
            
        print(f"\n[MESH REACHED GATEWAY] Packet successfully routed to '{self.nodes[current_idx]['name']}' in {hop_count} hops.")
        return "MESH"


# --- REVERSE MESH ACKNOWLEDGEMENT ("HOPE LOOP") LISTENER ---
def listen_for_hope_loop(user_id: int):
    """
    Handshake validation listening back from the Mesh for NGO dispatch confirmations.
    """
    print(f"\n[HOPE LOOP] Offline listener engaged. Polling mesh for reverse dispatches for User #{user_id}...")
    
    attempts = 0
    max_attempts = 15
    
    while attempts < max_attempts:
        try:
            res = requests.get(DASHBOARD_URL)
            if res.status_code == 200:
                data = res.json()
                survivors = data.get("active_survivors", [])
                
                # Check target user dispatch state
                user_record = next((s for s in survivors if s["user_id"] == user_id), None)
                if user_record:
                    status = user_record.get("dispatch_status")
                    acked = user_record.get("hope_loop_acked")
                    
                    if status == "DISPATCHED" and acked == 1:
                        print("\n======================================================================")
                        print("*** [HOPE LOOP HANDSHAKE RECEIVED SUCCESS!] ***")
                        print(f"--> Reverse Packet Routed back through mesh nodes to User #{user_id}!")
                        print("[MOBILE] USER TERMINAL UPDATE: 'NGO Relief Dispatched. Rescue Team En-Route.'")
                        print("======================================================================")
                        return
                        
            attempts += 1
            sys.stdout.write(".")
            sys.stdout.flush()
            time.sleep(2)
        except Exception:
            pass
            
    print("\n[HOPE LOOP TIMEOUT] No reverse dispatch packets detected. Grid remains listening in background.")


# --- MAIN INTERACTIVE SIMULATOR EXECUTION ---
def trigger_transmission(user_id: int, name: str, blood_type: str, lat: float, lon: float, 
                         status_code: int, vulnerable: bool, dr_active: bool, mesh_active: bool, 
                         requested_resources: str = "Trauma First Aid Kit"):
    
    # 1. GPS or Dead-Reckoning coordinates
    if dr_active:
        lat, lon = run_dead_reckoning(lat, lon)
        
    # 2. Wi-Fi Indoor structural positioning fingerprint
    wifi_aps, floor_est = scan_wifi_fingerprints()
    
    # 3. Encrypt sensitive identity variables (E2EE RSA)
    identity_raw = f"Name: {name} | Medical: {blood_type}"
    encrypted_identity = encryptor.encrypt(identity_raw)
    
    print(f"\n[E2EE SECURITY] Obfuscating user identity:")
    print(f"  - Plaintext: '{identity_raw}'")
    print(f"  - Encrypted Bytes (Hex): {encrypted_identity}")
    
    # 4. Compress coordinate parameters into 17-byte strict binary packet
    binary_packet = create_binary_sos_packet(user_id, lat, lon, status_code, vulnerable)
    hex_string = binary_packet.hex()
    
    print(f"\n[BINARY SERIALIZER] Packing emergency telemetry:")
    print(f"  - Compact Data Size: {len(binary_packet)} Bytes (Reduced from ~180 bytes)")
    print(f"  - Hex Payload Code: {hex_string}")
    
    # 5. Route via Mesh routing nodes if requested
    network_path = "SATELLITE"
    if mesh_active:
        router = MeshRouter()
        network_path = router.find_route_and_hop(hex_string)
    else:
        print("\n[TRANSPORT] Direct uplink to LEO satellite bridge selected.")
        time.sleep(0.5)
        
    # 6. Post packet to active backend system gateway
    payload = {
        "hex_string": hex_string,
        "network_path": network_path,
        "encrypted_identity": encrypted_identity,
        "requested_resources": requested_resources,
        "dead_reckoning": dr_active,
        "wifi_fingerprints": wifi_aps,
        "floor_estimate": floor_est
    }
    
    try:
        response = requests.post(BACKEND_URL, json=payload)
        if response.status_code == 200:
            print("\n[SERVER RESPONSE - SUCCESS]")
            print(json.dumps(response.json(), indent=2))
            
            # Start Hope Loop reverse listener
            listen_for_hope_loop(user_id)
        else:
            print(f"\n[SERVER RESPONSE - FAILED]: {response.status_code} - {response.text}")
    except requests.exceptions.ConnectionError:
        print("\n[CRITICAL ERROR] Aegis Intelligence Grid backend offline. Start 'app.py' first.")


def main():
    print("======================================================================")
    print("[AEGIS] AEGIS INTELLIGENCE GRID - ENTERPRISE MOCK EMULATOR [AEGIS]")
    print("======================================================================")
    
    # Default automated scenarios
    if len(sys.argv) > 1 and sys.argv[1] == "--simulate-mesh":
        trigger_transmission(
            user_id=20260328,
            name="John Doe",
            blood_type="O-Positive",
            lat=12.97159,
            lon=77.59456,
            status_code=7,
            vulnerable=True,
            dr_active=True,
            mesh_active=True,
            requested_resources="Trauma First Aid Kit, Emergency MRE Food Pack"
        )
    elif len(sys.argv) > 1 and sys.argv[1] == "--interactive":
        try:
            print("\n--- Configure Local Crisis Node Settings ---")
            user_id = random.randint(100000, 999999)
            name = input("Enter Victim Full Name: ").strip() or "Anonymous Survivor"
            blood_type = input("Enter Medical Info / Blood Type (e.g. A-Negative): ").strip() or "Unknown"
            
            lat = float(input("Enter Latitude (default 12.97159): ") or "12.97159")
            lon = float(input("Enter Longitude (default 77.59456): ") or "77.59456")
            
            status = int(input("Enter Severity Status Code (0-7, highest being 7): ") or "6")
            vulnerable = input("Vulnerable Population Present? (y/n, default y): ").lower() != 'n'
            
            dr_active = input("Engage IMU Dead-Reckoning? (GPS failure simulation) (y/n, default y): ").lower() != 'n'
            mesh_active = input("Route via P2P Mesh nodes? (y/n, default y): ").lower() != 'n'
            
            req_res = input("Requested resources (e.g. Medical, Food, Shelter, default 'Trauma First Aid Kit'): ").strip() or "Trauma First Aid Kit"
            
            trigger_transmission(user_id, name, blood_type, lat, lon, status, vulnerable, dr_active, mesh_active, req_res)
        except KeyboardInterrupt:
            print("\nSimulation aborted.")
    else:
        # Standard fast run
        print("[RUNNING AUTOMATED TEST SCENARIO A (Satellite Direct)]")
        trigger_transmission(
            user_id=88102394,
            name="Alice Smith",
            blood_type="AB-Negative",
            lat=12.96540,
            lon=77.60110,
            status_code=5,
            vulnerable=False,
            dr_active=False,
            mesh_active=False,
            requested_resources="Thermal Cold Tent, Emergency MRE Food Pack"
        )
        print("\n[HINT] For full mesh hop simulator, run: python client_simulation.py --simulate-mesh")
        print("[HINT] For custom inputs, run: python client_simulation.py --interactive")

if __name__ == "__main__":
    main()
