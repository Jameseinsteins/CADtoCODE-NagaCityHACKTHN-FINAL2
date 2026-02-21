/* ================================================================
   feed.js  —  TANAW Live Feed (Firebase-powered)
================================================================ */

const channel = new BroadcastChannel("TANAW_ALERTS");

const TYPE_META = {
  Roadwork:   { emoji:"🚧", color:"#f9a825", bg:"#fff8e1" },
  Traffic:    { emoji:"🚦", color:"#fbc02d", bg:"#fff9e6" },
  Flood:      { emoji:"🌊", color:"#1976d2", bg:"#e3f2fd" },
  Crash:      { emoji:"🚗", color:"#d32f2f", bg:"#ffebee" },
  Fire:       { emoji:"🔥", color:"#f57c00", bg:"#fff3e0" },
  Earthquake: { emoji:"🌏", color:"#6d4c41", bg:"#efebe9" },
  Typhoon:    { emoji:"🌀", color:"#0288d1", bg:"#e1f5fe" },
  Landslide:  { emoji:"🪨", color:"#5d4037", bg:"#efebe9" },
  Others:     { emoji:"⚠️", color:"#616161", bg:"#f5f5f5" },
};

// Local cache of live alerts
let _alerts = [];

function getPoints() { return parseInt(localStorage.getItem("tanaw_points") || "0"); }

function timeAgo(t) {
  const m = Math.floor((Date.now()-t)/60000);
  if (m<1)  return "Just now";
  if (m<60) return `${m} min ago`;
  const h = Math.floor(m/60);
  return h<24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`;
}

function updatePointsDisplay() {
  const el = document.getElementById("pointsCount");
  if (el) el.textContent = getPoints();
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* ── LIKES  (stored in Firebase on the alert itself) ── */
async function toggleLike(incidentKey) {
  const likedKey = `liked_${incidentKey}`;
  const already  = localStorage.getItem(likedKey);
  const ref      = REFS.alerts.child(incidentKey);
  const snap     = await ref.once("value");
  if (!snap.exists()) return;
  const current  = snap.val().likes || 0;
  if (already) {
    await ref.update({ likes: Math.max(0, current-1) });
    localStorage.removeItem(likedKey);
  } else {
    await ref.update({ likes: current+1 });
    localStorage.setItem(likedKey,"1");
  }
  // renderFeed is called automatically by the Firebase listener
}

/* ── COMMENTS ── */
function openComments(incidentKey) {
  const incident = _alerts.find(a => a._key === incidentKey);
  if (!incident) return;
  document.getElementById("commentPanelTitle").textContent = incident.type + " — Comments";
  document.getElementById("commentIncidentId").value = incidentKey;

  const comments = incident.comments ? Object.values(incident.comments) : [];
  comments.sort((a,b)=>(a.time||0)-(b.time||0));

  const list = document.getElementById("commentList");
  list.innerHTML = comments.length ? comments.map(c=>`
    <div class="comment-item">
      <div class="comment-avatar">${(c.name||"U")[0].toUpperCase()}</div>
      <div class="comment-body">
        <span class="comment-name">${escHtml(c.name||"Anonymous")}</span>
        <p class="comment-text">${escHtml(c.text)}</p>
        <span class="comment-time">${timeAgo(c.time)}</span>
      </div>
    </div>`).join("") :
    `<div class="comment-empty"><span class="material-symbols-rounded">chat_bubble</span>No comments yet. Be first!</div>`;

  const panel = document.getElementById("commentPanel");
  panel.classList.remove("hidden");
  requestAnimationFrame(()=>panel.classList.add("open"));
}

function closeComments() {
  const panel = document.getElementById("commentPanel");
  panel.classList.remove("open");
  setTimeout(()=>panel.classList.add("hidden"),300);
}

async function submitComment() {
  const incidentKey = document.getElementById("commentIncidentId").value;
  const nameEl = document.getElementById("commentName");
  const textEl = document.getElementById("commentText");
  const name   = (nameEl.value||"").trim() || "Anonymous";
  const text   = (textEl.value||"").trim();
  if (!text) return;

  // Push comment into alerts/{key}/comments/
  const commentRef = REFS.alerts.child(incidentKey).child("comments").push();
  await commentRef.set({ name, text, time: Date.now() });
  textEl.value = "";
  openComments(incidentKey); // re-render with updated comments
}

/* ── CARD ── */
function makeCard(a) {
  const meta   = TYPE_META[a.type] || TYPE_META.Others;
  const liked  = !!localStorage.getItem(`liked_${a._key}`);
  const likes  = a.likes || 0;
  const comments = a.comments ? Object.values(a.comments) : [];
  const cCount = comments.length;
  return `
    <div class="feed-card" style="--type-color:${meta.color}; --type-bg:${meta.bg}">
      <div class="feed-card-top" onclick="openIncident('${a._key}')">
        <div class="feed-icon-wrap">${meta.emoji}</div>
        <div class="feed-info">
          <h4>${a.type}</h4>
          <p>${a.area || "Reported location"}</p>
          <small>${timeAgo(a.time)}</small>
        </div>
        <div class="feed-arrow"><span class="material-symbols-rounded">chevron_right</span></div>
      </div>
      ${a.message && a.message !== "User report" ? `<div class="feed-desc">${escHtml(a.message)}</div>` : ""}
      <div class="feed-actions">
        <button class="action-btn like-btn ${liked?"liked":""}" onclick="toggleLike('${a._key}')">
          <span class="material-symbols-rounded">${liked?"favorite":"favorite_border"}</span>
          <span>${likes} ${likes===1?"Like":"Likes"}</span>
        </button>
        <button class="action-btn comment-btn" onclick="openComments('${a._key}')">
          <span class="material-symbols-rounded">chat_bubble_outline</span>
          <span>${cCount} ${cCount===1?"Comment":"Comments"}</span>
        </button>
      </div>
    </div>`;
}

/* ── RENDER ── */
function renderFeed() {
  const feedList = document.getElementById("feedList");
  updatePointsDisplay();
  if (!feedList) return;
  if (!_alerts.length) {
    feedList.innerHTML = `<div class="feed-empty">
      <span class="material-symbols-rounded">verified</span>
      No verified incidents yet.<br>Reports appear after admin review.
    </div>`;
    return;
  }
  feedList.innerHTML = _alerts.map(a=>makeCard(a)).join("");
}

function openIncident(key) {
  localStorage.setItem("focusIncident", key);
  location.href = "index.html";
}

/* ── CCTV (unchanged) ── */
const LIVE_AREAS = {
  "Magsaysay Ave":    { media:"CCTV_1.gif",      type:"image", sub:"Naga City, Camarines Sur" },
  "Maharlika Highway":{ media:"2131231.gif",      type:"image", sub:"Naga City, Camarines Sur" },
  "Diversion Road":   { media:"",                type:"image", sub:"Naga City, Camarines Sur" },
  "Almeda Highway":   { media:"",                type:"image", sub:"Naga City, Camarines Sur" },
  "Peñafrancia Ave":  { media:"",                type:"image", sub:"Naga City, Camarines Sur" }
};
let activeLiveArea = null;
function openLiveArea(name, pillEl) {
  const area = LIVE_AREAS[name]; if (!area) return;
  if (activeLiveArea===name) {
    activeLiveArea=null;
    document.getElementById("cctvViewer").classList.remove("visible");
    document.querySelectorAll(".cctv-pill").forEach(p=>p.classList.remove("active"));
    return;
  }
  activeLiveArea=name;
  const viewer=document.getElementById("cctvViewer"),
        mediaImg=document.getElementById("liveMediaImg"),
        mediaVid=document.getElementById("liveMediaVid");
  if (area.type==="video") {
    mediaImg.style.display="none"; mediaVid.src=area.media; mediaVid.style.display="block"; mediaVid.play();
  } else {
    mediaVid.pause(); mediaVid.style.display="none"; mediaImg.src=area.media; mediaImg.style.display="block";
  }
  document.getElementById("liveTitle").textContent=name;
  document.getElementById("liveSub").textContent=area.sub;
  viewer.classList.add("visible");
  document.querySelectorAll(".cctv-pill").forEach(p=>p.classList.remove("active"));
  if (pillEl) pillEl.classList.add("active");
  viewer.scrollIntoView({behavior:"smooth",block:"nearest"});
}

/* ── FIREBASE LISTENER ── */
fbListen(REFS.alerts, alerts => {
  _alerts = alerts; // already sorted newest-first by fbListen
  renderFeed();
});

/* ── EVENTS ── */
document.getElementById("commentPanelClose")?.addEventListener("click", closeComments);
document.getElementById("commentSubmitBtn")?.addEventListener("click", submitComment);
document.getElementById("commentText")?.addEventListener("keydown", e=>{
  if (e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); submitComment(); }
});
