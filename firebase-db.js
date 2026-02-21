/* ================================================================
   firebase-db.js  —  TANAW shared Firebase module
   Import this BEFORE app.js / feed.js / admin scripts
   ================================================================ */

// ── Firebase Config ──────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAAsLl_P9ix3mXEDkMcKh8aiEwD5RCPvSU",
  authDomain:        "my-naga-trip-map.firebaseapp.com",
  databaseURL:       "https://my-naga-trip-map-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "my-naga-trip-map",
  storageBucket:     "my-naga-trip-map.firebasestorage.app",
  messagingSenderId: "559902406851",
  appId:             "1:559902406851:web:ebae10deeca705ceea0a76",
  measurementId:     "G-K8XGZ160HE"
};

// Initialize (guard against double-init)
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const DB = firebase.database();

// ── DB Refs ──────────────────────────────────────────────────────
const REFS = {
  pending:       DB.ref("pending_alerts"),
  alerts:        DB.ref("alerts"),
  violations:    DB.ref("violations"),
  help:          DB.ref("drrm_help"),
  announcements: DB.ref("announcements"),
  dpwh:          DB.ref("dpwh_closures"),
  points:        DB.ref("points_log"),
};

// ── Helpers ──────────────────────────────────────────────────────
/**
 * Convert Firebase snapshot (object keyed by push-id) → sorted array (newest first).
 * Each item gets a _key property so we can reference it later.
 */
function snapToArray(snapshot) {
  if (!snapshot.exists()) return [];
  const obj = snapshot.val();
  return Object.entries(obj)
    .map(([k, v]) => ({ ...v, _key: k }))
    .sort((a, b) => (b.time || 0) - (a.time || 0));
}

/**
 * Push a new item to a ref. Returns the new Firebase key.
 */
async function fbPush(ref, data) {
  const newRef = ref.push();
  const { _key, ...cleanData } = data; // strip _key properly before storing
  await newRef.set(cleanData);
  return newRef.key;
}

/**
 * Update an existing item by its _key inside a ref.
 */
function fbUpdate(ref, key, data) {
  return ref.child(key).update(data);
}

/**
 * Remove an item by _key.
 */
function fbRemove(ref, key) {
  return ref.child(key).remove();
}

/**
 * One-time read from a ref → array.
 */
function fbRead(ref) {
  return ref.once("value").then(snapToArray);
}

/**
 * Real-time listener → calls callback(array) on every change.
 * Returns the unsubscribe function.
 */
function fbListen(ref, callback) {
  const handler = snapshot => callback(snapToArray(snapshot));
  ref.on("value", handler);
  return () => ref.off("value", handler);
}

// ── Connection monitor ───────────────────────────────────────────
DB.ref(".info/connected").on("value", snap => {
  const connected = snap.val();
  console.log(connected ? "✅ Firebase connected" : "❌ Firebase NOT connected");

  let banner = document.getElementById("_fb_status_banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "_fb_status_banner";
    banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;padding:6px 12px;font-size:12px;font-weight:700;text-align:center;letter-spacing:.4px;transition:opacity .5s";
    document.body.appendChild(banner);
  }

  if (connected) {
    banner.style.background = "#2e7d32";
    banner.style.color = "#fff";
    banner.style.opacity = "1";
    banner.textContent = "✅ Firebase connected";
    setTimeout(() => { banner.style.opacity = "0"; }, 3000);
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 3500);
  } else {
    banner.style.background = "#d32f2f";
    banner.style.color = "#fff";
    banner.style.opacity = "1";
    banner.textContent = "❌ Firebase not connected — reports cannot be saved";
  }
});
