/* ================================================================
   app.js  —  TANAW Map (Leaflet + OpenStreetMap, Firebase-powered)
   Features: search with autocomplete, trip routing with OSRM,
             auto-reroute when off route, incident markers
================================================================ */

const CHANNEL      = new BroadcastChannel("TANAW_ALERTS");
const VIOLATION_CH = new BroadcastChannel("TANAW_VIOLATIONS");
const HELP_CH      = new BroadcastChannel("TANAW_HELP");

const INCIDENT_TYPES = {
  Roadwork:    { color:"#f9a825", icon:"🚧" },
  Traffic:     { color:"#fbc02d", icon:"🚦" },
  Flood:       { color:"#1976d2", icon:"🌊" },
  Crash:       { color:"#d32f2f", icon:"🚗" },
  Fire:        { color:"#f57c00", icon:"🔥" },
  Earthquake:  { color:"#6d4c41", icon:"🌏" },
  Typhoon:     { color:"#0288d1", icon:"🌀" },
  Landslide:   { color:"#5d4037", icon:"🪨" },
  Others:      { color:"#616161", icon:"⚠️" },
  Evacuation:  { color:"#ffeb3b", icon:"🏠" },
  NotPassable: { color:"#d32f2f", icon:"⛔" }
};
const CALAMITY_TYPES = ["Earthquake","Typhoon","Landslide","Others"];

let activeTypes = {
  Roadwork:true, Traffic:true, Flood:true, Crash:true,
  Fire:true, Earthquake:true, Typhoon:true, Landslide:true,
  Evacuation:true, NotPassable:true, Others:true
};

let map, userMarker, routeLayer, rerouteTimer;
let reportMarker    = null;
let reportPosition  = null;
let userLatLng      = null;
let mapInitialized  = false;
let incidentMarkers = [];
let drrmMarkers     = [];
let helpMarkers     = [];
let evacuationData  = [];
let searchMarker    = null;

// Active trip state
let tripActive      = false;
let tripDestLatLng  = null;
let tripDestName    = "";
let tripStartLatLng = null;

let _liveAlerts     = [];
let _liveViolations = [];
let _liveAnnounce   = [];
let _liveHelp       = [];

/* ================================================================
   POINTS
================================================================ */
function getPoints() { return parseInt(localStorage.getItem("tanaw_points") || "0"); }
function updatePointsBadge() {
  const badge = document.getElementById("pointsBadge");
  if (!badge) return;
  const p = getPoints();
  badge.textContent = p;
  badge.style.display = p > 0 ? "flex" : "none";
}

/* ================================================================
   LEAFLET ICONS
================================================================ */
function makeLeafletIcon(emoji, color, size=38) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.42)}px;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:pointer;">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -(size/2+4)]
  });
}
function makeEvacIcon() {
  return L.divIcon({
    className:"",
    html:`<div style="display:flex;flex-direction:column;align-items:center;"><div style="width:36px;height:36px;border-radius:50%;background:#ef5a3c;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 2px 8px rgba(0,0,0,.3);">🏠</div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid #ef5a3c;margin-top:-1px;"></div></div>`,
    iconSize:[36,45], iconAnchor:[18,45], popupAnchor:[0,-45]
  });
}
function makeSOSIcon() {
  return L.divIcon({
    className:"",
    html:`<div style="width:44px;height:44px;border-radius:50%;background:#1565c0;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.4);font-family:system-ui;">SOS</div>`,
    iconSize:[44,44], iconAnchor:[22,22], popupAnchor:[0,-22]
  });
}
function makeUserIcon() {
  return L.divIcon({
    className:"",
    html:`<div style="width:18px;height:18px;border-radius:50%;background:#ef5a3c;border:3px solid #fff;box-shadow:0 0 0 3px rgba(239,90,60,.35);"></div>`,
    iconSize:[18,18], iconAnchor:[9,9]
  });
}
function makePinIcon(color="#1565c0") {
  return L.divIcon({
    className:"",
    html:`<div style="display:flex;flex-direction:column;align-items:center;"><div style="width:28px;height:28px;border-radius:50%;background:${color};border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.3);">📍</div><div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${color};margin-top:-1px;"></div></div>`,
    iconSize:[28,36], iconAnchor:[14,36], popupAnchor:[0,-36]
  });
}

/* ================================================================
   MAP INIT
================================================================ */
function initMap() {
  mapInitialized = true;

  map = L.map("map", {
    center: [13.6218, 123.1948],
    zoom: 15,
    zoomControl: false,
    attributionControl: true
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);

  userMarker = L.marker([13.6218, 123.1948], { icon: makeUserIcon(), zIndexOffset: 1000 }).addTo(map);

  // Tap map to place report pin
  map.on("click", e => {
    reportPosition = e.latlng;
    if (!reportMarker) {
      reportMarker = L.marker(e.latlng, { icon: makePinIcon("#1565c0"), zIndexOffset: 900 })
        .addTo(map).bindPopup("Report location").openPopup();
    } else {
      reportMarker.setLatLng(e.latlng);
      reportMarker.openPopup();
    }
    updatePinStatus();
  });

  setupSearch();
  getUserLocation();
  setupUIFixes();
  setupTripRouting();
  setupFABSheet();
  updateReportOptions();
  updatePointsBadge();
  loadEvacuationFromExcel();
  setupFirebaseListeners();

  if ("Notification" in window && Notification.permission === "default")
    Notification.requestPermission();

  focusIncidentFromFeed();
}

/* ================================================================
   GEOCODE helper (Nominatim)
================================================================ */
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=ph&accept-language=en`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  return res.json();
}

/* ================================================================
   SEARCH with live autocomplete dropdown
================================================================ */
function setupSearch() {
  const input = document.getElementById("searchInput");
  if (!input) return;
  input.placeholder = "Search location…";

  // Create dropdown
  const dropdown = document.createElement("div");
  dropdown.id = "_searchDrop";
  dropdown.style.cssText = `
    position:absolute;top:100%;left:0;right:0;margin-top:6px;
    background:#fff;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.15);
    overflow:hidden;display:none;z-index:500;max-height:220px;overflow-y:auto;`;
  input.parentElement.parentElement.style.position = "relative";
  input.parentElement.parentElement.appendChild(dropdown);

  let debounce;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 3) { dropdown.style.display = "none"; return; }
    debounce = setTimeout(async () => {
      try {
        const results = await geocode(q);
        if (!results.length) { dropdown.style.display = "none"; return; }
        dropdown.innerHTML = results.map((r,i) => `
          <div data-i="${i}" style="padding:11px 14px;cursor:pointer;font-size:13px;color:#1a1a1a;border-bottom:1px solid #f0f0f0;line-height:1.3;">
            <span style="font-size:15px;margin-right:6px;">📍</span>${r.display_name}
          </div>`).join("");
        dropdown.style.display = "block";
        dropdown.querySelectorAll("div[data-i]").forEach((el, i) => {
          // hover highlight
          el.addEventListener("mouseenter", () => el.style.background = "#f5f5f5");
          el.addEventListener("mouseleave", () => el.style.background = "");
          el.addEventListener("click", () => {
            const r = results[i];
            goToLocation(+r.lat, +r.lon, r.display_name);
            input.value = r.display_name.split(",")[0];
            dropdown.style.display = "none";
          });
        });
      } catch(e) { dropdown.style.display = "none"; }
    }, 350);
  });

  // Enter key
  input.addEventListener("keydown", async e => {
    if (e.key !== "Enter") return;
    dropdown.style.display = "none";
    const q = input.value.trim();
    if (!q) return;
    try {
      const results = await geocode(q);
      if (!results.length) { showToast("Location not found."); return; }
      const r = results[0];
      goToLocation(+r.lat, +r.lon, r.display_name);
      input.value = r.display_name.split(",")[0];
    } catch { showToast("Search failed. Check connection."); }
  });

  // Close dropdown on outside click
  document.addEventListener("click", e => {
    if (!input.parentElement.parentElement.contains(e.target))
      dropdown.style.display = "none";
  });
}

function goToLocation(lat, lng, name) {
  if (searchMarker) { searchMarker.remove(); searchMarker = null; }
  map.setView([lat, lng], 16);
  searchMarker = L.marker([lat, lng], { icon: makePinIcon("#9c27b0"), zIndexOffset: 800 })
    .addTo(map)
    .bindPopup(`<div style="font-family:system-ui;font-size:13px;">${name}</div>`)
    .openPopup();
}

/* ================================================================
   ROUTING helpers (OSRM)
================================================================ */
async function getRoute(fromLat, fromLng, toLat, toLng) {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;
  const res  = await fetch(url);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes.length) throw new Error("No route found.");
  return data.routes[0];
}

function drawRoute(geojson, fitBounds=true) {
  if (routeLayer) { routeLayer.remove(); routeLayer = null; }
  routeLayer = L.geoJSON(geojson, {
    style: { color:"#1976d2", weight:5, opacity:0.82, lineCap:"round", lineJoin:"round" }
  }).addTo(map);
  if (fitBounds) map.fitBounds(routeLayer.getBounds(), { padding:[50,50] });
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Check if user is close enough to the route polyline
function isOnRoute(latlng, geojson, thresholdM=60) {
  if (!geojson) return true;
  const coords = geojson.coordinates;
  for (let i=0; i<coords.length-1; i++) {
    const d = distToSegment(latlng.lat, latlng.lng,
      coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0]);
    if (d < thresholdM) return true;
  }
  return false;
}

function distToSegment(px,py, ax,ay, bx,by) {
  const dx=bx-ax, dy=by-ay;
  if (dx===0 && dy===0) return distanceMeters(px,py,ax,ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)));
  return distanceMeters(px, py, ax+t*dx, ay+t*dy);
}

/* ================================================================
   TRIP ROUTING UI
================================================================ */
function setupTripRouting() {
  const btn    = document.querySelector(".save-trip-btn");
  const inputs = document.querySelectorAll("#tripForm input");
  if (!btn) return;

  btn.onclick = async () => {
    const startVal = inputs[0]?.value.trim();
    const endVal   = inputs[1]?.value.trim();
    if (!startVal || !endVal) { alert("Enter both start and destination."); return; }

    btn.textContent = "Routing…"; btn.disabled = true;

    try {
      // Geocode start — if "My Location" use GPS
      let sLat, sLng;
      if (/my loc/i.test(startVal) && userLatLng) {
        sLat = userLatLng.lat; sLng = userLatLng.lng;
      } else {
        const sr = await geocode(startVal);
        if (!sr.length) { alert("Start location not found."); return; }
        sLat = +sr[0].lat; sLng = +sr[0].lon;
      }

      // Geocode destination
      const er = await geocode(endVal);
      if (!er.length) { alert("Destination not found."); return; }
      const eLat = +er[0].lat, eLng = +er[0].lon;

      const route = await getRoute(sLat, sLng, eLat, eLng);
      drawRoute(route.geometry);

      // Store trip state for auto-reroute
      tripActive      = true;
      tripStartLatLng = { lat:sLat, lng:sLng };
      tripDestLatLng  = { lat:eLat, lng:eLng };
      tripDestName    = er[0].display_name.split(",")[0];
      window._activeRouteGeometry = route.geometry;

      const dist = (route.distance/1000).toFixed(1);
      const mins = Math.round(route.duration/60);

      // Show trip info banner
      showTripBanner(dist, mins, tripDestName);

      // Check incidents along route
      checkIncidentsAlongRoute(route.geometry);

      // Close the sheet
      document.querySelector(".app")?.classList.remove("sheet-up");

    } catch(e) {
      alert("Routing failed: " + (e.message || "Check connection."));
    } finally {
      btn.textContent = "Get Route"; btn.disabled = false;
    }
  };

  // Autocomplete for trip inputs
  setupTripInputAutocomplete(inputs[0]);
  setupTripInputAutocomplete(inputs[1]);
}

function setupTripInputAutocomplete(input) {
  if (!input) return;
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:relative;flex:1;";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const drop = document.createElement("div");
  drop.style.cssText = `position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#fff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.15);overflow:hidden;display:none;z-index:600;max-height:180px;overflow-y:auto;`;
  wrap.appendChild(drop);

  let deb;
  input.addEventListener("input", () => {
    clearTimeout(deb);
    const q = input.value.trim();
    if (q.length < 3) { drop.style.display="none"; return; }
    deb = setTimeout(async () => {
      try {
        const results = await geocode(q);
        if (!results.length) { drop.style.display="none"; return; }
        drop.innerHTML = results.slice(0,4).map((r,i)=>
          `<div data-i="${i}" style="padding:10px 12px;cursor:pointer;font-size:12px;color:#1a1a1a;border-bottom:1px solid #f0f0f0;line-height:1.3;">📍 ${r.display_name.split(",").slice(0,2).join(", ")}</div>`
        ).join("");
        drop.style.display = "block";
        drop.querySelectorAll("div[data-i]").forEach((el,i) => {
          el.addEventListener("mouseenter", ()=>el.style.background="#f5f5f5");
          el.addEventListener("mouseleave", ()=>el.style.background="");
          el.addEventListener("click", ()=>{
            input.value = results[i].display_name.split(",").slice(0,2).join(", ");
            drop.style.display="none";
          });
        });
      } catch { drop.style.display="none"; }
    }, 350);
  });
  document.addEventListener("click", e => { if(!wrap.contains(e.target)) drop.style.display="none"; });
}

/* ================================================================
   TRIP BANNER
================================================================ */
function showTripBanner(dist, mins, dest) {
  let banner = document.getElementById("_tripBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "_tripBanner";
    banner.style.cssText = `
      position:fixed;bottom:calc(var(--nav-h, 68px) + 12px);
      left:50%;transform:translateX(-50%);
      background:#1976d2;color:#fff;
      padding:10px 16px;border-radius:16px;
      font-family:system-ui;font-size:13px;font-weight:600;
      box-shadow:0 4px 18px rgba(25,118,210,.45);
      z-index:450;display:flex;align-items:center;gap:12px;
      white-space:nowrap;`;
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <span>🗺️ ${dest}</span>
    <span style="opacity:.7;">|</span>
    <span>${dist} km · ~${mins} min</span>
    <button onclick="cancelTrip()" style="
      background:rgba(255,255,255,.2);border:none;color:#fff;
      border-radius:50px;padding:3px 10px;font-size:12px;
      cursor:pointer;font-family:system-ui;margin-left:4px;">✕ End</button>`;
  banner.style.display = "flex";
}

function hideTripBanner() {
  const b = document.getElementById("_tripBanner");
  if (b) b.style.display = "none";
}

function cancelTrip() {
  tripActive = false;
  tripDestLatLng = null;
  window._activeRouteGeometry = null;
  if (routeLayer) { routeLayer.remove(); routeLayer = null; }
  if (rerouteTimer) { clearTimeout(rerouteTimer); rerouteTimer = null; }
  hideTripBanner();
  showToast("Trip ended.");
}

/* ================================================================
   CHECK INCIDENTS ALONG ROUTE
================================================================ */
function checkIncidentsAlongRoute(geojson) {
  if (!_liveAlerts.length) return;
  const nearby = _liveAlerts.filter(a => {
    if (!a.lat || !a.lng) return false;
    return !isOnRoute({ lat:a.lat, lng:a.lng }, geojson, 200) === false
      && distanceMeters(a.lat, a.lng,
        geojson.coordinates[0][1], geojson.coordinates[0][0]) < 5000;
  });
  // simple check: any alert within 150m of route
  const onRoute = _liveAlerts.filter(a => {
    if (!a.lat || !a.lng) return false;
    const coords = geojson.coordinates;
    for (let i=0; i<coords.length-1; i++) {
      const d = distToSegment(a.lat, a.lng,
        coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0]);
      if (d < 150) return true;
    }
    return false;
  });
  if (onRoute.length) {
    showToast(`⚠️ ${onRoute.length} incident${onRoute.length>1?"s":""} on your route!`);
  }
}

/* ================================================================
   AUTO-REROUTE — watches GPS, rereoutes if off route >60m
================================================================ */
function startAutoReroute() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(async pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    userLatLng = { lat, lng };
    userMarker.setLatLng([lat, lng]);

    if (!tripActive || !tripDestLatLng || !window._activeRouteGeometry) return;

    // Check if off route
    if (!isOnRoute({ lat, lng }, window._activeRouteGeometry, 60)) {
      clearTimeout(rerouteTimer);
      rerouteTimer = setTimeout(async () => {
        // Double-check still off route
        if (!isOnRoute({ lat:userLatLng.lat, lng:userLatLng.lng }, window._activeRouteGeometry, 60)) {
          showToast("📍 Off route — recalculating…");
          try {
            const route = await getRoute(lat, lng, tripDestLatLng.lat, tripDestLatLng.lng);
            drawRoute(route.geometry, false); // don't re-fit bounds while navigating
            window._activeRouteGeometry = route.geometry;
            const dist = (route.distance/1000).toFixed(1);
            const mins = Math.round(route.duration/60);
            showTripBanner(dist, mins, tripDestName);
            checkIncidentsAlongRoute(route.geometry);
          } catch(e) {
            showToast("Reroute failed — check connection.");
          }
        }
      }, 5000); // wait 5s before rerouting to avoid false triggers
    }

    // Check if arrived (within 50m of destination)
    if (tripDestLatLng) {
      const dToDest = distanceMeters(lat, lng, tripDestLatLng.lat, tripDestLatLng.lng);
      if (dToDest < 50) {
        showToast("✅ You have arrived at your destination!");
        cancelTrip();
      }
    }
  }, err => console.warn("GPS watch error:", err), {
    enableHighAccuracy: true, maximumAge: 3000, timeout: 10000
  });
}

/* ================================================================
   AUTO-EXPIRY — remove resolved alerts from Firebase after 10 min
================================================================ */
function startExpiryCleanup() {
  const RESOLVED_TTL = 10 * 60 * 1000; // 10 minutes
  const DPWH_CHECK   = true;

  async function runCleanup() {
    const now = Date.now();
    const snap = await REFS.alerts.once("value");
    if (!snap.exists()) return;
    const obj = snap.val();
    const removals = [];
    Object.entries(obj).forEach(([key, val]) => {
      // Resolved alerts: remove 10 min after resolvedAt
      if (val.resolvedAt && (now - val.resolvedAt) >= RESOLVED_TTL) {
        removals.push(REFS.alerts.child(key).remove());
      }
      // DPWH closures with explicit expiresAt
      if (DPWH_CHECK && val.dpwh && val.expiresAt && now >= val.expiresAt) {
        removals.push(REFS.alerts.child(key).remove());
      }
    });
    if (removals.length) {
      await Promise.all(removals);
      console.log(`🗑️ Auto-removed ${removals.length} expired alert(s)`);
    }
  }

  // Run immediately, then every 60 seconds
  runCleanup();
  setInterval(runCleanup, 60 * 1000);
}

/* ================================================================
   FIREBASE LISTENERS
================================================================ */
function setupFirebaseListeners() {
  fbListen(REFS.alerts, alerts => {
    _liveAlerts = alerts;
    if (mapInitialized) loadIncidentMarkers();
    updateAnnouncementBadge();
  });
  fbListen(REFS.help, help => {
    _liveHelp = help;
    if (mapInitialized) loadHelpMarkers();
  });
  fbListen(REFS.violations, v => { _liveViolations = v; updateAnnouncementBadge(); });
  fbListen(REFS.announcements, a => { _liveAnnounce = a; updateAnnouncementBadge(); });

  // Start auto-expiry cleanup loop
  startExpiryCleanup();
}

/* ================================================================
   NOTIFICATIONS
================================================================ */
function sendNotification(alert) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const isDRRM = localStorage.getItem("drrm") === "1";
  const isCalamity = CALAMITY_TYPES.includes(alert.type);
  if (!isDRRM && isCalamity) return;
  new Notification(isCalamity ? "🚨 CALAMITY ALERT" : "⚠️ Incident Reported", {
    body:`${alert.type} – ${alert.area}`, icon:"icon-192.png"
  });
}

/* ================================================================
   ANNOUNCEMENT BADGE + PANEL
================================================================ */
function updateAnnouncementBadge() {
  const seen  = parseInt(localStorage.getItem("announce_seen") || "0");
  const total = _liveAnnounce.length + _liveViolations.length;
  const count = Math.max(0, total - seen);
  const badge = document.getElementById("announceBadge");
  if (!badge) return;
  badge.textContent   = count > 9 ? "9+" : count;
  badge.style.display = count > 0 ? "flex" : "none";
}

function openAnnouncementPanel() {
  const total = _liveAnnounce.length + _liveViolations.length;
  localStorage.setItem("announce_seen", total);
  updateAnnouncementBadge();
  const list = document.getElementById("announceList");
  list.innerHTML = "";
  if (!_liveAnnounce.length && !_liveViolations.length) {
    list.innerHTML = `<p class="announce-empty">No announcements yet.</p>`;
  }
  _liveAnnounce.forEach(a => {
    const el = document.createElement("div");
    el.className = "announce-item";
    el.innerHTML = `<div class="announce-icon">📢</div><div class="announce-body"><strong>${a.title}</strong><p>${a.message}</p><small>${new Date(a.time).toLocaleString()}</small></div>`;
    list.appendChild(el);
  });
  _liveViolations.forEach(v => {
    const el = document.createElement("div");
    el.className = "announce-item violation-item";
    el.innerHTML = `<div class="announce-icon">🚨</div><div class="announce-body"><strong>${v.violationType}</strong><p>${v.details||"No details."}</p>${v.photo?`<img src="${v.photo}" style="width:100%;border-radius:8px;margin-top:6px">`:""}  <small>${new Date(v.time).toLocaleString()}</small></div>`;
    list.appendChild(el);
  });
  document.getElementById("announcePanel").classList.remove("hidden");
}
function closeAnnouncePanel() { document.getElementById("announcePanel").classList.add("hidden"); }

/* ================================================================
   EVACUATION DATA
================================================================ */
function loadEvacuationFromExcel() {
  if (evacuationData.length > 0) { loadStaticDRRMData(); return; }
  evacuationData = [
    { barangay:"ABELLA", name:"ABELLA BRGY. HALL", address:"Urban Site, Roco Comp., Abella", capFamilies:150, capPersons:750, manager:"APOLINARIO C. MALANA JR.", designation:"BRGY. CAPTAIN", contact:"09124333583", lat:13.6200, lng:123.1800 },
    { barangay:"BAG SUR", name:"STA. CRUZ EVENT CENTER", address:"Urban, Sta. Cruz", capFamilies:50, capPersons:250, manager:"AUGUSTO BORROMEO", designation:"BRGY.KAGAWAD", contact:"09463333113", lat:13.6167, lng:123.1833 },
    { barangay:"BAG SUR", name:"BAG SUR BARANGAY HALL", address:"P. Santos St., Bag. Sur", capFamilies:50, capPersons:250, manager:"ALBERT CAO", designation:"BRGY. KAGAWAD", contact:"09484894973", lat:13.6200, lng:123.1805 },
    { barangay:"BAG. NORTE", name:"BAG NORTE BARANGAY HALL", address:"ZONE 5", capFamilies:100, capPersons:500, manager:"RIC G. REYES", designation:"BRGY. KAGAWAD", contact:"09461103495", lat:13.6320, lng:123.2075 },
    { barangay:"BALATAS", name:"PAGCOR Multi Purpose Building", address:"Zone 5, Balatas", capFamilies:50, capPersons:250, manager:"ALLEN REONDANGA", designation:"DEPARTMENT HEAD", contact:"09178121442", lat:13.6320, lng:123.2075 },
    { barangay:"CALAUAG", name:"STARVILLE COVERED COURT", address:"N/A", capFamilies:200, capPersons:1000, manager:"KRESHA MAE C. PELAGIO", designation:"N/A", contact:"09706239900", lat:13.6320, lng:123.2075 },
    { barangay:"CAROLINA", name:"CAROLINA BRGY. HALL", address:"Zone 3 Carolina", capFamilies:20, capPersons:100, manager:"MARITES S. SAROL", designation:"BRGY. TREASURER", contact:"09177909563", lat:13.6300, lng:123.2000 },
    { barangay:"PEÑAFRANCIA", name:"PEÑAFRANCIA PARISH", address:"Zone 5b Peñafrancia", capFamilies:200, capPersons:1000, manager:"JOEL T. TRESVALLES", designation:"BRGY. KAGAWAD", contact:"09998353465", lat:13.6215, lng:123.1820 },
    { barangay:"SABANG", name:"NAGA CITY MARKET (2nd Floor)", address:"Zamora St., Sabang", capFamilies:100, capPersons:500, manager:"MARIA CRESTINA S. MENDOZA", designation:"BRGY. KAGAWAD", contact:"09674181751", lat:13.6240, lng:123.1758 },
    { barangay:"TRIANGULO", name:"JMR COLISEUM", address:"CBD II, Triangulo", capFamilies:100, capPersons:500, manager:"DIANA F. COLCUERA", designation:"BRGY. HEALTH WORKER", contact:"09631778260", lat:13.6300, lng:123.1900 },
  ];
  loadStaticDRRMData();
}

function loadStaticDRRMData() {
  drrmMarkers.forEach(m=>m.remove()); drrmMarkers=[];
  if (localStorage.getItem("drrm") !== "1") return;
  if (evacuationData.length === 0) { loadEvacuationFromExcel(); return; }
  evacuationData.forEach(center => {
    const m = L.marker([center.lat,center.lng],{icon:makeEvacIcon(),zIndexOffset:800}).addTo(map);
    m.on("click",()=>showEvacCard(center));
    drrmMarkers.push(m);
  });
}

function showEvacCard(c) {
  document.getElementById("evacCardName").textContent     = c.name;
  document.getElementById("evacCardBarangay").textContent = "Brgy. " + c.barangay;
  document.getElementById("evacCardAddress").textContent  = c.address;
  document.getElementById("evacCardManager").textContent  = c.manager + (c.designation?" · "+c.designation:"");
  document.getElementById("evacCardContact").textContent  = c.contact;
  document.getElementById("evacCardCapacity").textContent = c.capFamilies+" families  /  "+c.capPersons+" persons";
  document.getElementById("evacCard").classList.remove("hidden");
}
function closeEvacCard() { document.getElementById("evacCard").classList.add("hidden"); }

/* ================================================================
   INCIDENT MARKERS
================================================================ */
function loadIncidentMarkers() {
  incidentMarkers.forEach(m=>m.remove()); incidentMarkers=[];
  const isDRRM = localStorage.getItem("drrm") === "1";

  // Always load regular alert markers
  _liveAlerts.forEach(a => {
    if (!a.lat||!a.lng||!activeTypes[a.type]) return;
    if (a.dpwh&&a.expiresAt&&Date.now()>=a.expiresAt) return;
    const isResolved = !!a.resolvedAt;
    const color = isResolved?"#2e7d32":(INCIDENT_TYPES[a.type]?.color||"#616161");
    const emoji = isResolved?"✓":(INCIDENT_TYPES[a.type]?.icon||"⚠️");
    const msAgo = isResolved?Date.now()-a.resolvedAt:0;
    const minLeft = Math.max(0,Math.ceil((10*60*1000-msAgo)/60000));
    const marker = L.marker([a.lat,a.lng],{icon:makeLeafletIcon(emoji,color),zIndexOffset:isResolved?600:700}).addTo(map);
    marker.bindPopup(isResolved
      ?`<div style='font-family:system-ui;min-width:160px'><strong style='color:#2e7d32'>✅ Resolved: ${a.type}</strong><br><span style='color:#555'>${a.area}</span><br><small style='color:#f57c00'>Auto-removes in ~${minLeft} min</small></div>`
      :`<div style='font-family:system-ui;min-width:160px'><strong>${a.type}</strong><br><span style='color:#555'>${a.area}</span><br><small style='color:#999'>${new Date(a.time).toLocaleTimeString()}</small></div>`);
    incidentMarkers.push(marker);
  });

  // In DRRM mode also load evacuation centers and SOS help markers
  if (isDRRM) {
    loadStaticDRRMData();
    loadHelpMarkers();
  } else {
    // Clear DRRM markers when mode is off
    drrmMarkers.forEach(m=>m.remove()); drrmMarkers=[];
    helpMarkers.forEach(m=>m.remove()); helpMarkers=[];
  }

  // Re-check incidents if trip is active
  if (tripActive && window._activeRouteGeometry) checkIncidentsAlongRoute(window._activeRouteGeometry);
}

function toggleType(type,value) { activeTypes[type]=value; loadIncidentMarkers(); }

/* ================================================================
   HELP MARKERS
================================================================ */
function loadHelpMarkers() {
  helpMarkers.forEach(m=>m.remove()); helpMarkers=[];
  if (localStorage.getItem("drrm")!=="1") return;
  _liveHelp.forEach(h=>{
    if(!h.lat||!h.lng)return;
    const m=L.marker([h.lat,h.lng],{icon:makeSOSIcon(),zIndexOffset:900}).addTo(map);
    m.bindPopup(`<div style="font-family:system-ui;min-width:180px"><div style="font-weight:bold;color:#d32f2f;margin-bottom:4px">🆘 HELP NEEDED</div><p style="margin:4px 0">${h.message}</p>${h.photo?`<img src="${h.photo}" style="width:100%;border-radius:8px;margin:4px 0">`:""}<div>📞 <strong>${h.contact}</strong></div><small style="color:#999">${new Date(h.time).toLocaleString()}</small></div>`);
    helpMarkers.push(m);
  });
}

/* ================================================================
   GEOLOCATION
================================================================ */
function getUserLocation() {
  navigator.geolocation?.getCurrentPosition(pos => {
    userLatLng = { lat:pos.coords.latitude, lng:pos.coords.longitude };
    userMarker.setLatLng([userLatLng.lat,userLatLng.lng]);
    map.setView([userLatLng.lat,userLatLng.lng],16);
    startAutoReroute();
  }, ()=>console.warn("Geolocation unavailable."));
}

/* ================================================================
   UI FIXES
================================================================ */
function setupUIFixes() {
  const app=document.querySelector(".app"), sheet=document.getElementById("bottomSheet"),
        handle=document.getElementById("sheetHandle"), tripsTab=document.getElementById("tripsTab"),
        incTab=document.getElementById("incidentsTab"), tripsIntro=document.getElementById("tripsIntro"),
        incidentsContent=document.getElementById("incidentsContent"),
        tripForm=document.getElementById("tripForm"), createTripBtn=document.getElementById("createTripBtn"),
        filterBtn=document.getElementById("filterBtn"), filterPanel=document.getElementById("filterPanel"),
        drrmToggle=document.getElementById("drrmToggle");

  document.getElementById("gpsBtn")?.addEventListener("click",()=>{
    if(!userLatLng)return;
    map.setView([userLatLng.lat,userLatLng.lng],17);
  });

  let startY=0,curY=0,drag=false;
  sheet.addEventListener("touchstart",e=>{startY=e.touches[0].clientY;drag=true;});
  sheet.addEventListener("touchmove",e=>{if(drag)curY=e.touches[0].clientY;});
  sheet.addEventListener("touchend",()=>{
    if(!drag)return;drag=false;
    const d=curY-startY;
    if(d<-50)app.classList.add("sheet-up");
    if(d>50)app.classList.remove("sheet-up");
  });
  handle?.addEventListener("click",()=>app.classList.toggle("sheet-up"));

  function hideTripForm(){tripForm?.classList.remove("active");tripsIntro?.classList.add("active");}
  tripsTab?.addEventListener("click",()=>{
    hideTripForm();tripsTab.classList.add("active");incTab.classList.remove("active");
    tripsIntro.classList.add("active");incidentsContent.classList.remove("active");app.classList.add("sheet-up");
  });
  incTab?.addEventListener("click",()=>{
    hideTripForm();incTab.classList.add("active");tripsTab.classList.remove("active");
    incidentsContent.classList.add("active");tripsIntro.classList.remove("active");app.classList.add("sheet-up");
  });
  createTripBtn?.addEventListener("click",()=>{
    hideTripForm();tripsIntro.classList.remove("active");tripForm.classList.add("active");app.classList.add("sheet-up");
  });
  filterBtn?.addEventListener("click",()=>filterPanel?.classList.toggle("open"));

  if(drrmToggle){
    const isDRRM = localStorage.getItem("drrm")==="1";
    drrmToggle.checked = isDRRM;
    // Apply active state to chip on load
    document.querySelector(".drrm-top")?.classList.toggle("active", isDRRM);
    // Apply drrm-active class to filter items on load
    document.querySelectorAll(".filter-item.drrm-only").forEach(el => {
      el.classList.toggle("drrm-active", isDRRM);
    });
    drrmToggle.addEventListener("change",()=>{
      const on = drrmToggle.checked;
      localStorage.setItem("drrm", on ? "1" : "0");
      document.querySelector(".drrm-top")?.classList.toggle("active", on);
      // Show/hide DRRM filter items properly
      document.querySelectorAll(".filter-item.drrm-only").forEach(el => {
        el.classList.toggle("drrm-active", on);
      });
      loadIncidentMarkers();
      updateReportOptions();
    });
  }
  app.classList.remove("sheet-up");
}

/* ================================================================
   TOAST
================================================================ */
function showToast(msg) {
  const t=document.getElementById("toast"); if(!t)return;
  t.textContent=msg; t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),3000);
}

/* ================================================================
   SHARED
================================================================ */
function clearReportMarker() {
  if(reportMarker){reportMarker.remove();reportMarker=null;}
  reportPosition=null;
}
function updateReportOptions() {
  const isDRRM = localStorage.getItem("drrm") === "1";
  const drrmTypes = ["Earthquake","Typhoon","Landslide"];

  // Update hidden select
  const sel = document.getElementById("incidentType");
  if (sel) {
    Array.from(sel.options).forEach(o => {
      const hide = !isDRRM && drrmTypes.includes(o.value);
      o.style.display = hide ? "none" : "";
    });
  }

  // Update type cards grid
  document.querySelectorAll(".type-card.drrm-only").forEach(card => {
    card.style.display = isDRRM ? "flex" : "none";
  });

  // If current selection is now hidden, reset to first visible
  const activeCard = document.querySelector(".type-card.active");
  if (activeCard && activeCard.style.display === "none") {
    const first = document.querySelector(".type-card:not([style*='display:none'])");
    if (first) { first.classList.add("active"); if (sel) sel.value = first.dataset.value; }
    activeCard.classList.remove("active");
  }

  // Show/hide DRRM-only filter items in the incidents filter panel
  document.querySelectorAll(".filter-item.drrm-only").forEach(el => {
    el.classList.toggle("drrm-active", isDRRM);
  });

  // Show/hide other drrm-only elements (not type-cards or filter-items)
  document.querySelectorAll(".drrm-only").forEach(el => {
    if (!el.classList.contains("type-card") && !el.classList.contains("filter-item")) {
      el.style.display = isDRRM ? "flex" : "none";
    }
  });

  updateFABDRRM();
}
function focusIncidentFromFeed() {
  const key=localStorage.getItem("focusIncident"); if(!key)return;
  const a=_liveAlerts.find(x=>x._key===key); if(!a)return;
  map.setView([a.lat,a.lng],17);
  localStorage.removeItem("focusIncident");
}

/* ================================================================
   FAB SHEET
================================================================ */
function setupFABSheet() {
  document.getElementById("addBtn").onclick=e=>{
    e.stopPropagation();updateFABDRRM();
    document.getElementById("fabSheetOverlay").classList.remove("hidden");
    document.getElementById("fabSheet").classList.add("open");
  };
  document.getElementById("fabSheetOverlay").addEventListener("click",closeFABSheet);
}
function closeFABSheet(){
  document.getElementById("fabSheetOverlay").classList.add("hidden");
  document.getElementById("fabSheet").classList.remove("open");
}
function updateFABDRRM(){
  const isDRRM=localStorage.getItem("drrm")==="1";
  const row=document.getElementById("fabHelpRow");
  if(row)row.style.display=isDRRM?"flex":"none";
}

/* ================================================================
   MODAL 1 — INCIDENT REPORT
================================================================ */
function openReportModal() {
  closeFABSheet();
  // Reset form
  document.querySelectorAll(".type-card").forEach(c => c.classList.remove("active"));
  const first = document.querySelector(".type-card:not([style*='display:none'])");
  if (first) {
    first.classList.add("active");
    document.getElementById("incidentType").value = first.dataset.value;
  }
  document.getElementById("incidentNote").value = "";
  document.getElementById("othersConcern") && (document.getElementById("othersConcern").value = "");
  document.getElementById("othersConcernWrap").style.display = "none";
  updatePinStatus();
  document.getElementById("reportModal").classList.remove("hidden");
}
function closeReport() {
  document.getElementById("reportModal").classList.add("hidden");
}

function selectType(btn) {
  document.querySelectorAll(".type-card").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
  const val = btn.dataset.value;
  document.getElementById("incidentType").value = val;
  // Show/hide Others concern field
  const wrap = document.getElementById("othersConcernWrap");
  if (wrap) wrap.style.display = val === "Others" ? "block" : "none";
  if (val === "Others") {
    setTimeout(() => document.getElementById("othersConcern")?.focus(), 100);
  }
}

function updatePinStatus() {
  const bar  = document.getElementById("pinStatus");
  const text = document.getElementById("pinStatusText");
  const icon = bar?.querySelector(".pin-status-icon");
  if (!bar) return;
  if (reportPosition) {
    bar.classList.add("pinned");
    if (text) text.textContent = "Location pinned ✓";
    if (icon) icon.textContent = "location_on";
  } else {
    bar.classList.remove("pinned");
    if (text) text.textContent = "No location pinned — tap the map";
    if (icon) icon.textContent = "location_off";
  }
}

async function submitReport() {
  if (!reportPosition) {
    alert("Tap the map first to pin the incident location.");
    return;
  }
  const type = document.getElementById("incidentType").value;
  const note = document.getElementById("incidentNote").value.trim();

  // Handle Others — use the custom concern as the type label
  let finalType = type;
  let finalMessage = note || "User report";
  if (type === "Others") {
    const concern = document.getElementById("othersConcern")?.value.trim();
    if (!concern) {
      alert("Please describe your concern for 'Others'.");
      document.getElementById("othersConcern")?.focus();
      return;
    }
    finalType = "Others";
    finalMessage = concern + (note ? " — " + note : "");
  }

  const report = {
    type: finalType,
    area: "User reported area",
    message: finalMessage,
    lat: reportPosition.lat,
    lng: reportPosition.lng,
    time: Date.now(),
    reportedBy: "user",
    likes: 0
  };

  const btn = document.querySelector("#reportModal .btn-primary");
  const orig = btn ? btn.innerHTML : "";
  if (btn) { btn.innerHTML = "Submitting…"; btn.disabled = true; }
  const timeout = new Promise((_,reject) => setTimeout(() => reject(new Error("Request timed out. Check your connection.")), 8000));
  try {
    await Promise.race([fbPush(REFS.pending, report), timeout]);
    if (btn) { btn.innerHTML = orig; btn.disabled = false; }
    closeReport(); clearReportMarker();
    showToast("✅ Report submitted — awaiting admin verification");
  } catch(e) {
    console.error("submitReport:", e);
    if (btn) { btn.innerHTML = orig; btn.disabled = false; }
    showToast("❌ " + (e.message || "Could not submit. Check connection."));
  }
}

/* ================================================================
   MODAL 2 — VIOLATION
================================================================ */
let violationPhoto=null;
function openViolationModal(){
  closeFABSheet();violationPhoto=null;
  document.getElementById("violationPhotoPreview").style.display="none";
  document.getElementById("violationPhotoInput").value="";
  document.getElementById("violationDetails").value="";
  document.getElementById("violationModal").classList.remove("hidden");
}
function closeViolationModal(){document.getElementById("violationModal").classList.add("hidden");}
function handleViolationPhoto(input){
  const file=input.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=e=>{violationPhoto=e.target.result;const p=document.getElementById("violationPhotoPreview");p.src=violationPhoto;p.style.display="block";};
  r.readAsDataURL(file);
}
async function submitViolation(){
  const v={violationType:document.getElementById("violationType").value,details:document.getElementById("violationDetails").value,photo:violationPhoto||null,time:Date.now()};
  const btn=document.querySelector("#violationModal .btn-primary");
  const orig=btn?btn.textContent:"";
  if(btn){btn.textContent="Submitting…";btn.disabled=true;}
  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error("Request timed out.")),8000));
  try{
    await Promise.race([fbPush(REFS.violations,v),timeout]);
    if(btn){btn.textContent=orig;btn.disabled=false;}
    closeViolationModal();violationPhoto=null;
    document.getElementById("announceBell")?.classList.add("bell-ring");
    setTimeout(()=>document.getElementById("announceBell")?.classList.remove("bell-ring"),700);
    showToast("Violation reported 🚨");
  }catch(e){
    if(btn){btn.textContent=orig;btn.disabled=false;}
    showToast("❌ "+(e.message||"Could not submit."));
  }
}

/* ================================================================
   MODAL 3 — HELP
================================================================ */
let helpPhoto=null;
function openHelpModal(){
  closeFABSheet();
  if(!userLatLng){alert("GPS not ready yet. Please wait.");return;}
  helpPhoto=null;
  document.getElementById("helpPhotoPreview").style.display="none";
  document.getElementById("helpPhotoInput").value="";
  document.getElementById("helpMessage").value="";
  document.getElementById("helpContact").value="";
  document.getElementById("helpModal").classList.remove("hidden");
}
function closeHelpModal(){document.getElementById("helpModal").classList.add("hidden");}
function handleHelpPhoto(input){
  const file=input.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=e=>{helpPhoto=e.target.result;const p=document.getElementById("helpPhotoPreview");p.src=helpPhoto;p.style.display="block";};
  r.readAsDataURL(file);
}
async function submitHelp(){
  const message=document.getElementById("helpMessage").value.trim();
  const contact=document.getElementById("helpContact").value.trim();
  if(!message){alert("Describe what help you need.");return;}
  if(!contact){alert("Enter your contact number.");return;}
  const btn=document.querySelector("#helpModal .btn-primary");
  const orig=btn?btn.textContent:"";
  if(btn){btn.textContent="Sending…";btn.disabled=true;}
  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error("Request timed out.")),8000));
  try{
    await Promise.race([fbPush(REFS.help,{message,contact,photo:helpPhoto||null,lat:userLatLng.lat,lng:userLatLng.lng,time:Date.now()}),timeout]);
    if(btn){btn.textContent=orig;btn.disabled=false;}
    closeHelpModal();helpPhoto=null;
    showToast("Help request sent 🆘");
  }catch(e){
    if(btn){btn.textContent=orig;btn.disabled=false;}
    showToast("❌ "+(e.message||"Could not submit."));
  }
}

/* ================================================================
   RESET
================================================================ */
async function resetAllData(){
  if(!confirm("Reset ALL reports for ALL users? This cannot be undone."))return;
  try{
    await Promise.all([REFS.pending.remove(),REFS.alerts.remove(),REFS.violations.remove(),REFS.help.remove(),REFS.announcements.remove(),REFS.dpwh.remove()]);
    ["focusIncident","announce_seen","tanaw_points","drrm"].forEach(k=>localStorage.removeItem(k));
    showToast("All data cleared.");location.reload();
  }catch(e){showToast("❌ Reset failed.");}
}

if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js");
document.addEventListener("DOMContentLoaded", initMap);
