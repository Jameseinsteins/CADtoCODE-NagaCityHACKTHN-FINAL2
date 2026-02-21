const channel = new BroadcastChannel("TANAW_ALERTS");

// Show/hide DRRM menu items based on DRRM mode
function checkDRRM() {
  const isDRRM = localStorage.getItem("drrm") === "1";
  const drrmMenus = document.getElementById("drrmMenus");
  if (drrmMenus) drrmMenus.style.display = isDRRM ? "block" : "none";
}
checkDRRM();

// Reset all app data
function resetAllData() {
  const keys = ["alerts", "violations", "drrm_help", "announcements",
                "focusIncident", "announce_seen"];
  if (!confirm("Reset all reports and incidents? This cannot be undone.")) return;
  keys.forEach(k => localStorage.removeItem(k));
  showToast("All data cleared.");
}

// Emergency modal
function openEmergencyModal() {
  document.getElementById("emergModal").classList.remove("hidden");
}
function closeEmergencyModal() {
  document.getElementById("emergModal").classList.add("hidden");
}

// DRRM Info modal
function openDrrmInfo() {
  document.getElementById("drrmInfoModal").classList.remove("hidden");
}
function closeDrrmInfo() {
  document.getElementById("drrmInfoModal").classList.add("hidden");
}

// Close modals on overlay tap
document.getElementById("emergModal")?.addEventListener("click", function(e) {
  if (e.target === this) closeEmergencyModal();
});
document.getElementById("drrmInfoModal")?.addEventListener("click", function(e) {
  if (e.target === this) closeDrrmInfo();
});

// Toast helper
function showToast(msg) {
  let t = document.getElementById("moreToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "moreToast";
    t.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%) translateY(16px);
      background:#1a1a1a;color:#fff;padding:10px 20px;border-radius:50px;
      font-size:13px;font-weight:500;z-index:2000;opacity:0;
      transition:opacity .25s,transform .25s;pointer-events:none;white-space:nowrap;font-family:inherit`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  t.style.transform = "translateX(-50%) translateY(0)";
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(-50%) translateY(16px)";
  }, 2500);
}
