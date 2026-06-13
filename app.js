// Aegis Intelligence Grid Web Application Engine

const AEGIS_HQ = [12.9730, 77.5900];
const BACKEND_URL = "/api/v1/intake/binary-sos";

// Global Maps
let militaryMap;
let hqMarker;
let survivorMarkers = {};
let hazardMarkers = [];
let networkLines = [];

// Local beacons state cache to match select lists
let activeSurvivorsLocalCache = [];
let localActiveUserId = null;

document.addEventListener('DOMContentLoaded', () => {
    try { initClock(); } catch(e) { console.error("Clock Init Error:", e); }
    try { initMilitaryMap(); } catch(e) { console.error("Map Init Error:", e); }
    try { pollData(); } catch(e) { console.error("Data Poll Error:", e); }
    // Fallback polling backup
    try { setInterval(pollData, 5000); } catch(e) { console.error(e); }
    // Real-time EventSource listener
    try { setupEventSource(); } catch(e) { console.error("SSE Connection Error:", e); }
    // Render Oscilloscope
    try { drawOscilloscope(); } catch(e) { console.error("Oscilloscope Error:", e); }
});

function setupEventSource() {
    const source = new EventSource('/api/v1/stream');
    source.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.event !== 'connected') {
                console.log(`Instant SSE event '${data.event}' received. Syncing commands.`);
                pollData();
                
                // If it is a dispatch event matching the user's phone beacon, print Hope Loop success log
                if (data.event === 'dispatch' && data.details && data.details.user_id === localActiveUserId) {
                    appendPhoneLog("======================================");
                    appendPhoneLog("*** [HOPE LOOP ACK RECEIVED SUCCESS!] ***");
                    appendPhoneLog(`--> Reverse mesh packet routed to user!`);
                    appendPhoneLog(`[MOBILE] RESPONSE: Aid Dispatched. Team en route.`);
                    appendPhoneLog("======================================");
                }
            }
        } catch (err) {
            console.error("Error parsing EventSource stream: ", err);
        }
    };
    source.onerror = (err) => {
        console.warn("SSE EventSource stream closed. Browser is auto-reconnecting.");
    };
}

// Tab navigation handler
window.switchTab = function(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    
    // Reset buttons
    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active', 'bg-white/5', 'text-cyanAccent', 'border-cyanAccent/30');
        el.classList.add('border-transparent', 'text-slate-400');
    });

    // Show active tab
    const activeView = document.getElementById(`view-${tabId}`);
    if (activeView) activeView.classList.remove('hidden');
    
    // Set button active
    const activeBtn = document.getElementById(`tab-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.add('active', 'bg-white/5', 'text-cyanAccent', 'border-cyanAccent/30');
        activeBtn.classList.remove('border-transparent', 'text-slate-400');
    }

    // Leaflet map refresh
    if (tabId === 'military-view' && militaryMap) {
        setTimeout(() => {
            militaryMap.invalidateSize();
        }, 150);
    }
};

// Initialize clock display
function initClock() {
    const clock = document.getElementById('clock-display');
    const update = () => {
        const now = new Date();
        clock.textContent = now.toUTCString().replace('GMT', 'UTC');
    };
    update();
    setInterval(update, 1000);
}

// Initialize Leaflet Tactical Map in Command Hub
function initMilitaryMap() {
    const tileLayerUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    try {
        militaryMap = L.map('military-map-container', {
            center: [12.9720, 77.6000],
            zoom: 13
        });

        L.tileLayer(tileLayerUrl, {
            attribution: tileAttribution,
            maxZoom: 20
        }).addTo(militaryMap);

        // HQ DivIcon
        const hqIcon = L.divIcon({
            className: 'hq-marker-icon',
            html: `<div style="
                background: #00e5ff;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                border: 3.5px solid #fff;
                box-shadow: 0 0 15px #00e5ff;
            "></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });

        hqMarker = L.marker(AEGIS_HQ, { icon: hqIcon }).addTo(militaryMap);
        hqMarker.bindPopup(`
            <div class="p-2 font-body text-slate-100">
                <h4 class="font-heading font-bold text-cyanAccent text-sm"><i class="fa-solid fa-building-shield"></i> AEGIS LOGISTICS HQ</h4>
                <p class="text-[10px] text-slate-400 mt-1">Satellite Ground Station Gateway</p>
            </div>
        `);
    } catch (err) {
        console.error("Leaflet Map Initialization Failed: ", err);
    }
}

// Fetch grid statuses
async function pollData() {
    try {
        const res = await fetch('/api/v1/dashboard?t=' + new Date().getTime());
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        const data = await res.json();
        
        activeSurvivorsLocalCache = data.active_survivors || [];
        
        // Update dashboard modules safely
        updateNgoDashboard(data);
        updateMilitaryDashboard(data);
        updateSatelliteTelemetry(data);
        
    } catch (err) {
        console.error("API Fetch Error during telemetry polling: ", err);
    }
}

// --- NGO TAB RENDERING ---
function updateNgoDashboard(data) {
    const survivors = data.active_survivors || [];
    const inventory = data.inventory || [];
    
    // Stats calculation
    let critical = 0;
    let dispatched = 0;
    survivors.forEach(s => {
        const triageStr = s.ai_triage || "";
        if (triageStr.includes("CRITICAL")) critical++;
        if (s.dispatch_status === "DISPATCHED") dispatched++;
    });
    
    let totalSupplies = 0;
    inventory.forEach(inv => totalSupplies += (inv.quantity || 0));
    
    const totalEl = document.getElementById('ngo-stat-total');
    if (totalEl) totalEl.textContent = survivors.length;
    
    const critEl = document.getElementById('ngo-stat-critical');
    if (critEl) critEl.textContent = critical;
    
    const dispEl = document.getElementById('ngo-stat-dispatched');
    if (dispEl) dispEl.textContent = dispatched;
    
    const suppEl = document.getElementById('ngo-stat-supplies');
    if (suppEl) suppEl.textContent = totalSupplies;
    
    const countLabel = document.getElementById('ngo-count-label');
    if (countLabel) countLabel.textContent = `${survivors.length} Incident Records found`;
    
    // Render survivor table
    const tableBody = document.getElementById('ngo-incidents-body');
    if (!tableBody) return;
    
    if (survivors.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="py-8 text-center text-slate-500">
                    <i class="fa-solid fa-box-archive text-2xl mb-2 block"></i>
                    No active survivor telemetry in SQLite database. Run client simulator.
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = survivors.map(s => {
            let triageClass = 'bg-greenAccent/15 text-greenAccent border border-greenAccent/30';
            const triageStr = s.ai_triage || "STANDARD";
            const scoreStr = s.ai_score !== undefined ? s.ai_score : 0;
            
            if (triageStr.includes("CRITICAL")) {
                triageClass = 'bg-redAccent/15 text-redAccent border border-redAccent/30';
            } else if (triageStr.includes("HIGH")) {
                triageClass = 'bg-orangeAccent/15 text-orangeAccent border border-orangeAccent/30';
            }
            
            let statusClass = 'text-slate-400 bg-slate-900 border border-white/5';
            if (s.dispatch_status === 'DISPATCHED') {
                statusClass = 'text-greenAccent bg-greenAccent/10 border border-greenAccent/20';
            }
            
            return `
                <tr class="border-b border-white/5 hover:bg-white/5 transition-all text-slate-300">
                    <td class="py-3 px-3 font-code font-bold text-cyanAccent">#${s.user_id}</td>
                    <td class="py-3 px-3">
                        <div class="flex flex-col">
                            <span class="font-semibold text-slate-200">${s.decrypted_identity || 'DECRYPTION PENDING'}</span>
                            <span class="text-[9px] text-slate-500 font-code truncate max-w-[150px]" title="${s.encrypted_identity}">Hex: ${s.encrypted_identity || ''}</span>
                        </div>
                    </td>
                    <td class="py-3 px-3">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${triageClass}">
                            ${triageStr.split(' ')[0]} (Score: ${scoreStr})
                        </span>
                    </td>
                    <td class="py-3 px-3 font-bold text-orangeAccent">
                        ${s.requested_resources || "Medical Kit"}
                    </td>
                    <td class="py-3 px-3">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${statusClass}">
                            ${s.dispatch_status || 'PENDING'}
                        </span>
                    </td>
                    <td class="py-3 px-3 font-code text-[10px]">
                        ${s.hope_loop_acked ? '<span class="text-greenAccent"><i class="fa-solid fa-square-check"></i> HOPE LOOP ACKED</span>' : '<span class="text-slate-500">PENDING</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    // Update dispatch user options
    const userSelect = document.getElementById('ngo-dispatch-user');
    if (userSelect) {
        const currentSelectedUser = userSelect.value;
        if (survivors.length === 0) {
            userSelect.innerHTML = `<option value="">-- No Active Cases --</option>`;
            const banner = document.getElementById('dispatch-requirements-banner');
            if (banner) banner.classList.add('hidden');
        } else {
            userSelect.innerHTML = `<option value="">-- Select Incident --</option>` + 
                survivors.map(s => `<option value="${s.user_id}">Survivor #${s.user_id} (${s.decrypted_identity ? s.decrypted_identity.split('|')[0].replace('Name:', '').trim() : 'Anonymous'})</option>`).join('');
            if (currentSelectedUser) userSelect.value = currentSelectedUser;
        }
    }
    
    // Update dispatch resource options
    const resContainer = document.getElementById('ngo-dispatch-resources-container');
    if (resContainer) {
        // We want to preserve checked status if they are already checked and still available
        const checkedIds = new Set(Array.from(resContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value));
        resContainer.innerHTML = inventory.map(i => {
            const isChecked = checkedIds.has(i.resource_id) && i.quantity > 0 ? 'checked' : '';
            const isDisabled = i.quantity <= 0 ? 'disabled' : '';
            const disabledClass = i.quantity <= 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer';
            return `
                <label class="flex items-center gap-2 ${disabledClass}">
                    <input type="checkbox" name="dispatch-resources" value="${i.resource_id}" ${isChecked} ${isDisabled} class="rounded bg-slate-950 border-white/10 text-greenAccent focus:ring-0">
                    <span>${i.name} (${i.quantity} left) <span class="text-[9px] text-slate-500 font-mono">[${i.category}]</span></span>
                </label>
            `;
        }).join('');
    }
}

// Handle Target Selected details display in NGO dashboard
window.onNgoTargetSelected = function(userId) {
    const banner = document.getElementById('dispatch-requirements-banner');
    const listEl = document.getElementById('dispatch-requirements-list');
    
    if (!userId || !banner || !listEl) {
        if (banner) banner.classList.add('hidden');
        return;
    }
    
    const survivor = activeSurvivorsLocalCache.find(s => s.user_id == userId);
    if (survivor) {
        banner.classList.remove('hidden');
        listEl.textContent = survivor.requested_resources || "None Specified";
    } else {
        banner.classList.add('hidden');
    }
};

// --- MILITARY/LOGISTICS TAB RENDERING ---
function updateMilitaryDashboard(data) {
    if (!militaryMap) return;
    
    const survivors = data.active_survivors || [];
    const hazards = data.hazards || [];
    
    // Render map markers
    const activeIds = new Set();
    
    survivors.forEach(s => {
        const id = s.user_id;
        activeIds.add(id);
        const lat = s.lat;
        const lon = s.lon;
        
        let color = '#00cc88';
        let glow = 'rgba(0, 204, 136, 0.4)';
        const triageStr = s.ai_triage || "STANDARD";
        
        if (triageStr.includes("CRITICAL")) {
            color = '#ff3366';
            glow = 'rgba(255, 51, 102, 0.5)';
        } else if (triageStr.includes("HIGH")) {
            color = '#ff9900';
            glow = 'rgba(255, 153, 0, 0.5)';
        }
        
        // Custom Leaflet Div Icon
        const divHtml = `<div class="pulse-marker" style="
            background-color: ${color};
            width: 13px;
            height: 13px;
            border-radius: 50%;
            border: 2px solid #fff;
            box-shadow: 0 0 10px ${color}, 0 0 20px ${glow};
        "></div>`;
        
        const customIcon = L.divIcon({
            className: `surv-marker-${id}`,
            html: divHtml,
            iconSize: [13, 13],
            iconAnchor: [6.5, 6.5]
        });

        if (survivorMarkers[id]) {
            survivorMarkers[id].setLatLng([lat, lon]);
        } else {
            const marker = L.marker([lat, lon], { icon: customIcon }).addTo(militaryMap);
            marker.bindPopup(`
                <div class="p-2 text-xs font-body text-slate-100 min-w-[200px]">
                    <h4 class="font-heading font-bold text-sm" style="color: ${color}"><i class="fa-solid fa-hospital-user"></i> Incident #${id}</h4>
                    <p class="mt-1"><strong>Triage:</strong> ${triageStr.split(' ')[0]}</p>
                    <p><strong>Decrypted ID:</strong> ${s.decrypted_identity || 'N/A'}</p>
                    <p><strong>Vector:</strong> ${s.transport || 'SATELLITE'}</p>
                    <p><strong>SAR Verification:</strong> ${s.hitl_verified === 1 ? 'Approved' : (s.hitl_verified === -1 ? 'SPOOFED' : 'PENDING')}</p>
                </div>
            `);
            survivorMarkers[id] = marker;
            
            // Draw mesh or satellite route path line
            drawTacticalRoute(id, [lat, lon], s.transport || 'SATELLITE', color);
        }
    });
    
    // Prune inactive survivor markers
    for (const id in survivorMarkers) {
        if (!activeIds.has(Number(id))) {
            militaryMap.removeLayer(survivorMarkers[id]);
            delete survivorMarkers[id];
            removeTacticalRoute(id);
        }
    }
    
    // Render hazard markers on map (NASA FIRMS & Gauge indicators)
    hazardMarkers.forEach(m => militaryMap.removeLayer(m));
    hazardMarkers = [];
    
    hazards.forEach((h, idx) => {
        const isFire = (h.type || "").includes("Wildfire") || (h.source || "").includes("FIRMS");
        const color = isFire ? '#e11d48' : '#2563eb';
        
        const iconHtml = `<div style="
            background-color: ${color};
            width: 14px;
            height: 14px;
            border-radius: 2px;
            border: 2px solid #fff;
            box-shadow: 0 0 10px ${color};
            transform: rotate(45deg);
        "></div>`;
        
        const customIcon = L.divIcon({
            className: `hazard-${idx}`,
            html: iconHtml,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
        
        const marker = L.marker([h.lat, h.lon], { icon: customIcon }).addTo(militaryMap);
        marker.bindPopup(`
            <div class="p-2 text-xs font-body text-slate-100">
                <h4 class="font-heading font-bold text-sm" style="color: ${color}"><i class="fa-solid fa-triangle-exclamation"></i> ${h.type || 'Hazard'}</h4>
                <p class="mt-1"><strong>Source:</strong> ${h.source || 'Satellite'}</p>
                <p><strong>Severity:</strong> ${h.severity || 'HIGH'}</p>
            </div>
        `);
        hazardMarkers.push(marker);
    });
    
    // Render HITL queue
    const hitlQueue = document.getElementById('hitl-queue-container');
    if (!hitlQueue) return;
    
    const pendingHitl = survivors.filter(s => s.hitl_verified === 0);
    
    if (pendingHitl.length === 0) {
        hitlQueue.innerHTML = `
            <div class="text-center py-12 text-slate-500 text-xs">
                <i class="fa-solid fa-circle-check text-3xl mb-2 text-greenAccent block"></i>
                All telemetry records cross-checked and approved by human command.
            </div>
        `;
    } else {
        hitlQueue.innerHTML = pendingHitl.map(s => `
            <div class="bg-slate-950/60 p-4 border border-white/5 rounded-xl flex flex-col gap-3">
                <div class="flex justify-between items-center text-xs font-semibold">
                    <span class="text-cyanAccent font-code">CASE #${s.user_id}</span>
                    <span class="text-slate-400 font-mono">${s.lat}, ${s.lon}</span>
                </div>
                
                <!-- SAR Imagery Mock Container -->
                <div class="relative h-36 rounded-lg overflow-hidden border border-white/10 group">
                    <img src="${s.sar_image_url || ''}" class="w-full h-full object-cover brightness-[0.7] group-hover:brightness-100 transition-all duration-300" alt="Satellite SAR Imaging">
                    <span class="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-cyanAccent font-mono border border-cyanAccent/30">SAT-SAR-IMAGE</span>
                    <span class="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-redAccent/80 text-[9px] text-white font-bold">CROSS-REFERENCE COORDINATES</span>
                </div>
                
                <div class="text-[11px] text-slate-400 flex flex-col gap-1">
                    <div><span>AI Category:</span> <strong class="text-slate-200">${s.ai_triage || 'STANDARD'}</strong></div>
                    <div><span>Dead-Reckoning:</span> <strong class="text-slate-300">${s.dead_reckoning_used ? 'ENGAGED (IMU Drift)' : 'NO (Orbital Lock Secure)'}</strong></div>
                    <div><span>Wifi Location:</span> <strong class="text-slate-300">${s.floor_estimate ? `Floor Level ${s.floor_estimate}` : 'N/A'}</strong></div>
                    <div><span>Requested Needs:</span> <strong class="text-orangeAccent">${s.requested_resources || 'Medical Kit'}</strong></div>
                </div>
                
                <div class="flex gap-2">
                    <button onclick="verifyIncident(${s.user_id}, 1)" class="flex-1 py-1.5 px-3 rounded bg-greenAccent/20 hover:bg-greenAccent/30 text-greenAccent text-xs font-bold border border-greenAccent/30 transition-all flex items-center justify-center gap-1.5">
                        <i class="fa-solid fa-circle-check"></i> APPROVE
                    </button>
                    <button onclick="verifyIncident(${s.user_id}, -1)" class="flex-1 py-1.5 px-3 rounded bg-redAccent/20 hover:bg-redAccent/30 text-redAccent text-xs font-bold border border-redAccent/30 transition-all flex items-center justify-center gap-1.5">
                        <i class="fa-solid fa-triangle-exclamation"></i> FLAG SPOOF
                    </button>
                </div>
            </div>
        `).join('');
    }
}

function drawTacticalRoute(id, survivorCoords, vectorType, color) {
    if (!militaryMap) return;
    removeTacticalRoute(id);
    let polyline;
    if (vectorType === 'DIRECT_TO_SATELLITE') {
        polyline = L.polyline([survivorCoords, AEGIS_HQ], {
            color: '#ffaa00',
            weight: 1.5,
            opacity: 0.7,
            dashArray: '4, 8'
        }).addTo(militaryMap);
    } else {
        // Multi hop visual route representation
        const midLat1 = survivorCoords[0] + (AEGIS_HQ[0] - survivorCoords[0]) * 0.3 + (Math.random() - 0.5) * 0.006;
        const midLon1 = survivorCoords[1] + (AEGIS_HQ[1] - survivorCoords[1]) * 0.3 + (Math.random() - 0.5) * 0.006;
        const midLat2 = survivorCoords[0] + (AEGIS_HQ[0] - survivorCoords[0]) * 0.7 + (Math.random() - 0.5) * 0.006;
        const midLon2 = survivorCoords[1] + (AEGIS_HQ[1] - survivorCoords[1]) * 0.7 + (Math.random() - 0.5) * 0.006;
        
        polyline = L.polyline([survivorCoords, [midLat1, midLon1], [midLat2, midLon2], AEGIS_HQ], {
            color: '#00e5ff',
            weight: 2,
            opacity: 0.8
        }).addTo(militaryMap);
    }
    networkLines.push({ id, line: polyline });
}

function removeTacticalRoute(id) {
    if (!militaryMap) return;
    const idx = networkLines.findIndex(n => n.id === id);
    if (idx !== -1) {
        militaryMap.removeLayer(networkLines[idx].line);
        networkLines.splice(idx, 1);
    }
}

// --- SATELLITE TAB RENDERING ---
function updateSatelliteTelemetry(data) {
    const survivors = data.active_survivors || [];
    
    // Raw Binary Hex Inspector
    const inspectorList = document.getElementById('raw-packet-inspector-list');
    if (inspectorList) {
        if (survivors.length === 0) {
            inspectorList.innerHTML = `
                <div class="text-center py-12 text-slate-500 text-xs">
                    <i class="fa-solid fa-file-code text-3xl mb-2 block"></i>
                    Awaiting incoming telemetry streams.
                </div>
            `;
        } else {
            inspectorList.innerHTML = survivors.map(s => {
                const transportStr = s.transport || 'SATELLITE';
                const isSat = transportStr === 'DIRECT_TO_SATELLITE';
                const icon = isSat ? 'fa-satellite' : 'fa-circle-nodes';
                const color = isSat ? 'text-orangeAccent border-orangeAccent/30 bg-orangeAccent/5' : 'text-cyanAccent border-cyanAccent/30 bg-cyanAccent/5';
                
                const rawHex = s.raw_hex || '0000000000000000000000000000000000';
                
                const bUserId = rawHex.substring(0, 16);
                const bLat = rawHex.substring(16, 24);
                const bLon = rawHex.substring(24, 32);
                const bStatus = rawHex.substring(32, 34);
                
                return `
                    <div class="bg-slate-950/40 p-4 border border-white/5 rounded-xl flex flex-col gap-2 font-code text-xs">
                        <div class="flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase font-body font-bold">
                            <span>User: ${s.user_id}</span>
                            <span class="px-2 py-0.5 rounded border ${color} flex items-center gap-1">
                                <i class="fa-solid ${icon}"></i> ${transportStr}
                            </span>
                        </div>
                        
                        <!-- Color Highlighted Byte Structural Breakdown -->
                        <div class="bg-black/50 border border-white/5 p-2 rounded text-[11px] flex flex-wrap gap-0 font-bold leading-relaxed select-none">
                            <span class="text-yellow-400 bg-yellow-500/10 px-0.5 rounded" title="Bytes 0-7: User ID = ${s.user_id}">${bUserId}</span>
                            <span class="text-blue-400 bg-blue-500/10 px-0.5 rounded" title="Bytes 8-11: Latitude Float = ${s.lat || 0}">${bLat}</span>
                            <span class="text-cyan-400 bg-cyan-500/10 px-0.5 rounded" title="Bytes 12-15: Longitude Float = ${s.lon || 0}">${bLon}</span>
                            <span class="text-red-400 bg-red-500/10 px-0.5 rounded" title="Byte 16: Status Byte (Sev: ${s.status_code || 0}, Vuln: ${s.vulnerable || 0})">${bStatus}</span>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-2 text-[10px] text-slate-400 font-body">
                            <div>Severity Index: <strong>${s.status_code !== undefined ? s.status_code : 0} / 7</strong></div>
                            <div>Vulnerable Flag: <strong>${s.vulnerable ? 'True' : 'False'}</strong></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
    
    // Cryptographic audit decrypter logs
    const cryptoLogs = document.getElementById('crypto-pipe-logs');
    if (cryptoLogs) {
        if (survivors.length === 0) {
            cryptoLogs.innerHTML = `
                <div class="text-center py-12 text-slate-500 text-xs">
                    <i class="fa-solid fa-lock text-3xl mb-2 block"></i>
                    Decryption log empty.
                </div>
            `;
        } else {
            cryptoLogs.innerHTML = survivors.map(s => `
                <div class="bg-slate-950/40 p-4 border border-white/5 rounded-xl flex flex-col gap-2 text-xs">
                    <div class="flex justify-between items-center font-code text-[10px] text-slate-500 font-bold">
                        <span>ASYMMETRIC RSA-2048 PIPE</span>
                        <span class="text-greenAccent"><i class="fa-solid fa-lock-open"></i> DECRYPTED SUCCESS</span>
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <div>
                            <span class="text-[10px] text-slate-500 uppercase block font-semibold">Ciphertext Received (Hex)</span>
                            <p class="font-code text-[11px] bg-redAccent/5 border border-redAccent/20 p-2 rounded text-red-200 word-break-all max-w-full overflow-x-auto">${s.encrypted_identity || 'N/A'}</p>
                        </div>
                        <div class="mt-1">
                            <span class="text-[10px] text-slate-500 uppercase block font-semibold">Decrypted Plaintext Output</span>
                            <p class="font-heading font-bold text-greenAccent text-sm bg-greenAccent/5 border border-greenAccent/20 p-2 rounded">${s.decrypted_identity || 'N/A'}</p>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }
}

// --- DISPATCH AID ACTION ---
window.dispatchAid = async function() {
    const userId = document.getElementById('ngo-dispatch-user').value;
    
    // Get checked resources
    const checkedCheckboxes = document.querySelectorAll('input[name="dispatch-resources"]:checked');
    const resourceIds = Array.from(checkedCheckboxes).map(cb => cb.value);
    
    if (!userId || resourceIds.length === 0) {
        alert("Verification Fail: Select an active Incident ID and at least one Relief Supply item before dispatching.");
        return;
    }
    
    try {
        const res = await fetch('/api/v1/dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: parseInt(userId), resource_ids: resourceIds })
        });
        
        if (res.ok) {
            alert(`Uplink broadcast success! Selected supplies dispatched. Reverse mesh Hope Loop acknowledgement packet queued back to user.`);
            // Uncheck checkboxes after successful dispatch
            document.querySelectorAll('input[name="dispatch-resources"]:checked').forEach(cb => cb.checked = false);
            pollData();
        } else {
            const err = await res.json();
            alert(`Dispatch Error: ${err.detail}`);
        }
    } catch (err) {
        console.error(err);
    }
};

// --- HITL SAR IMAGE ACTION ---
window.verifyIncident = async function(userId, status) {
    try {
        const res = await fetch('/api/v1/verify-hitl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: parseInt(userId), validation_status: status })
        });
        
        if (res.ok) {
            const msg = status === 1 ? "Incident Approved. Coordinates verified against SAR." : "Incident marked as Spoof Alert.";
            alert(msg);
            pollData();
        }
    } catch (err) {
        console.error(err);
    }
};

// --- CLEAR ALL SQL RECORDS ---
window.clearDatabase = async function() {
    if (!confirm("Are you sure you want to purge all active incidents from the SQLite database?")) return;
    try {
        const res = await fetch('/api/v1/clear', { method: 'POST' });
        if (res.ok) {
            alert("SQLite database tables purged successfully.");
            pollData();
        }
    } catch (err) {
        console.error(err);
    }
};

// --- CLIENT SIDE IN-BROWSER TRANSMITTER SIMULATOR ---
window.setVictimCoords = function(lat, lon, sectorName) {
    document.getElementById('victim-lat').value = lat;
    document.getElementById('victim-lon').value = lon;
    alert(`GPS coordinate locked on: ${sectorName} (${lat}, ${lon})`);
};

function appendPhoneLog(line) {
    const logger = document.getElementById('phone-terminal-logs');
    if (!logger) return;
    const isScrollBottom = logger.scrollHeight - logger.clientHeight <= logger.scrollTop + 5;
    logger.innerHTML += `<div>&gt; ${line}</div>`;
    if (isScrollBottom) {
        logger.scrollTop = logger.scrollHeight;
    }
}

window.transmitLocalBeacon = async function() {
    const logger = document.getElementById('phone-terminal-logs');
    logger.innerHTML = ''; // reset logs
    
    appendPhoneLog("Initializing beacon trigger sequence...");
    
    const name = document.getElementById('victim-name').value ? document.getElementById('victim-name').value.trim() : "Anonymous";
    const blood = document.getElementById('victim-blood').value;
    
    let lat = parseFloat(document.getElementById('victim-lat').value);
    let lon = parseFloat(document.getElementById('victim-lon').value);
    
    const severity = parseInt(document.getElementById('victim-severity-slider').value);
    const optDR = document.getElementById('opt-dr').checked;
    const optMesh = document.getElementById('opt-mesh').checked;
    
    const reqMed = document.getElementById('req-med').checked;
    const reqFood = document.getElementById('req-food').checked;
    const reqTent = document.getElementById('req-tent').checked;
    
    // Map requirements string
    let requirements = [];
    if (reqMed) requirements.push("Trauma First Aid Kit");
    if (reqFood) requirements.push("Emergency MRE Food Pack");
    if (reqTent) requirements.push("Thermal Cold Tent");
    const reqString = requirements.join(", ") || "None Specified";
    
    const isVulnerable = severity >= 6;
    
    // Generate simulated user ID
    const userId = Math.floor(10000000 + Math.random() * 90000000);
    localActiveUserId = userId; // set globally for Hope Loop updates
    
    // 1. Simulate Inertial Dead-Reckoning coordinates drift if checked
    if (optDR) {
        appendPhoneLog("[GPS LOSS] Warning: GPS lock lost! Switch to IMU Dead-Reckoning...");
        await sleep(600);
        appendPhoneLog("  IMU: Integrating Accel x:0.12, y:-0.18, z:9.81 | Gyro yaw:0.04...");
        lat += 0.00010;
        lon -= 0.00008;
        document.getElementById('victim-lat').value = lat.toFixed(5);
        document.getElementById('victim-lon').value = lon.toFixed(5);
        await sleep(500);
    }
    
    // 2. Scan broadcasting Wi-Fi BSSIDs for floor estimates
    appendPhoneLog("[WIFI] Scanning physical BSSIDs for structural depth...");
    await sleep(500);
    const floorEst = 1;
    appendPhoneLog(`  Detected BSSID: 00:0a:95:9d:68:16 | Floor Level: ${floorEst}`);
    
    // 3. E2EE RSA-2048 encryption simulation
    appendPhoneLog("[E2EE] Obfuscating sensitive parameters...");
    await sleep(500);
    
    // Decrypter math matches `app.py`
    const identityRaw = `Name: ${name} | Medical: ${blood} | Needs: ${reqString}`;
    const encryptedHex = encryptIdentityJS(identityRaw);
    appendPhoneLog(`  Ciphertext bytes (Hex): ${encryptedHex.substring(0, 24)}...`);
    
    // 4. Compact 17-Byte Big-Endian struct packing
    appendPhoneLog("[BINARY] Packing telemetry into 17-byte struct...");
    await sleep(500);
    const packetHex = packBinarySosJS(userId, lat, lon, severity, isVulnerable);
    appendPhoneLog(`  Payload Hex: ${packetHex}`);
    
    // 5. Route via multi-hop mesh nodes
    let networkPath = "SATELLITE";
    if (optMesh) {
        appendPhoneLog("=== STARTING P2P MESH SIMULATOR ===");
        await sleep(500);
        appendPhoneLog("[HOP 1] Relay: Victim -> Relay Node Alpha (RSSI -70dBm)");
        await sleep(400);
        appendPhoneLog("[HOP 2] Relay: Alpha -> Relay Node Beta (RSSI -71dBm)");
        await sleep(400);
        appendPhoneLog("[HOP 3] Relay: Beta -> Relay Node Gamma (RSSI -71dBm)");
        await sleep(400);
        appendPhoneLog("[HOP 4] Gateway Reach: Gamma -> LEO Satellite Mesh Gateway");
        await sleep(400);
        networkPath = "MESH";
    } else {
        appendPhoneLog("[TRANSPORT] Uplinking directly to LEO satellite footprint...");
        await sleep(600);
    }
    
    // Send request to server
    const payload = {
        hex_string: packetHex,
        network_path: networkPath,
        encrypted_identity: encryptedHex,
        requested_resources: reqString,
        dead_reckoning: optDR,
        wifi_fingerprints: [
            { bssid: "00:0a:95:9d:68:16", rssi: -62 },
            { bssid: "00:14:22:01:23:45", rssi: -75 }
        ],
        floor_estimate: floorEst
    };
    
    try {
        const res = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            appendPhoneLog("[SERVER] Ingestion success! Status: Processed");
            appendPhoneLog(`  AI Triage Category: ${(data.ai_triage || "STANDARD").split(' ')[0]}`);
            appendPhoneLog("[HOPE LOOP] Channel open. Listening for reverse NGO dispatch packets...");
        } else {
            appendPhoneLog(`[SERVER ERROR] Ingestion failed: ${res.statusText}`);
        }
    } catch (err) {
        appendPhoneLog("[CONNECTION FAILED] Gateway connection error. Start app.py first.");
    }
};

// JS binary packing matches >QffB struct format exactly
function packBinarySosJS(userId, lat, lon, statusCode, vulnerable) {
    const buffer = new ArrayBuffer(17);
    const view = new DataView(buffer);
    
    // Write User ID (uint64)
    view.setBigUint64(0, BigInt(userId), false); // false = big-endian
    
    // Write Lat/Lon (float32)
    view.setFloat32(8, lat, false);
    view.setFloat32(12, lon, false);
    
    // Write packed status byte (uint8)
    const statusByte = (statusCode << 1) | (vulnerable ? 1 : 0);
    view.setUint8(16, statusByte);
    
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// E2EE public key cryptosystem shift matches app.py modular inverse
function encryptIdentityJS(text) {
    const cipherBytes = [];
    for (let i = 0; i < text.length; i++) {
        cipherBytes.push((text.charCodeAt(i) * 17) % 256);
    }
    return cipherBytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- SATELLITE CANVAS OSCILLOSCOPE GRAPH ---
function drawOscilloscope() {
    const canvas = document.getElementById('canvas-oscilloscope');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = canvas.clientWidth;
    let height = canvas.height = canvas.clientHeight;
    
    let phase = 0;
    
    // Resize listener
    window.addEventListener('resize', () => {
        if (canvas) {
            width = canvas.width = canvas.clientWidth;
            height = canvas.height = canvas.clientHeight;
        }
    });

    function animate() {
        ctx.fillStyle = 'rgba(5, 7, 12, 0.25)'; // trailing blur
        ctx.fillRect(0, 0, width, height);
        
        ctx.beginPath();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.8;
        
        // Glow effect
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#00e5ff';
        
        for (let x = 0; x < width; x++) {
            // Generate clean sine wave with random high frequency telemetry noise
            const noise = (Math.random() - 0.5) * 1.5;
            const y = height / 2 + Math.sin(x * 0.04 + phase) * 16 + noise;
            
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
        
        phase += 0.08;
        
        // Randomize LEO SNR value slightly in dashboard
        const currentSnr = (23.5 + Math.sin(phase * 0.1) * 2 + Math.random() * 0.4).toFixed(1);
        const snrEl = document.getElementById('leo-signal-val');
        if (snrEl) snrEl.textContent = `SNR: ${currentSnr} dB`;
        
        requestAnimationFrame(animate);
    }
    animate();
}
