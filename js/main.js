import { 
  state, 
  initAuth, 
  handleSignIn, 
  handleSignOut,
  saveLogs, 
  saveLogsDebounced,
  loadAllPrograms,
  loadLogsAsync,
  loadFunFacts,
  savePrefs,
  ensureWorkoutLog,
  addCustomWorkout,
  getAllWorkoutsForSession,
  sessionKey,
  getAutoSelectedSessionId,
  wakeUpSync // NEW
} from './store.js';

import { 
  renderAll, 
  renderSessionsList, 
  renderActiveSession, 
  updateActiveProgress,
  setAuthUI 
} from './ui.js';

import { 
  startTimer, 
  pauseTimer, 
  resetTimer, 
  setTimer, 
  tickTimer,
  cleanWorkoutTitle,
  escapeHtml,
  resolveReps,
  normalizeName,
  calculate1RM,
  calculatePlates,
  getPlateArray
} from './utils.js';

// --- VISIBILITY & CONNECTION SYNC ---

const performSync = async () => {
  const synced = await wakeUpSync();
  if (synced) {
    // If we successfully synced with cloud, re-render to show updates
    renderAll(); 
  }
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    // 1. Save local immediately on hide/lock
    saveLogs(true);
  } else if (document.visibilityState === "visible") {
    // 2. Resume timers
    tickTimer();
    // 3. Force reconnect, sync, and render
    performSync();
  }
});

window.addEventListener("online", () => {
  console.log("Back online. Syncing...");
  performSync();
});

// --- BRIDGE ---
function handleAppUpdate(user) {
    setAuthUI(!!user, user?.email);
    renderAll();
}

// --- STATS/EXPORT ---

function renderPlanStats() {
  let totalVol = 0; let totalSets = 0;
  let sessMap = new Set(); let exMap = new Set();
  const volBySession = {};

  Object.values(state.logs).forEach(log => {
    if(!log.program || !log.session) return;
    const sKey = `${log.program}|||${log.session}`;
    sessMap.add(sKey);
    if(log.workout) exMap.add(log.workout);

    let logVol = 0;
    if(log.sets && Array.isArray(log.sets)) {
      log.sets.forEach(s => {
        const w = parseFloat(s.weight||0);
        const r = parseFloat(s.reps||0);
        if(w > 0 && r > 0) {
          const v = w * r;
          totalVol += v;
          logVol += v;
        }
        if(s.done || (w>0 && r>0)) totalSets++;
      });
    }
    if (logVol > 0) volBySession[sKey] = (volBySession[sKey] || 0) + logVol;
  });

  document.getElementById("planTotalVolume").textContent = Math.round(totalVol).toLocaleString();
  document.getElementById("planLoggedSessions").textContent = sessMap.size;
  document.getElementById("planLoggedSets").textContent = totalSets;
  document.getElementById("planUniqueExercises").textContent = exMap.size;
  renderSimpleChart(volBySession);
  renderTopExercises();
}

function renderSimpleChart(dataObj) {
  const canvas = document.getElementById("planSessionChart");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width; const h = canvas.height;
  ctx.clearRect(0,0,w,h);
  const values = Object.values(dataObj);
  if(values.length === 0) return;
  const max = Math.max(...values) * 1.1;
  const barW = Math.min(40, (w - 20) / values.length);
  const gap = 4;
  ctx.fillStyle = "#f4c300";
  values.forEach((val, i) => {
    const barH = (val / max) * (h - 20);
    ctx.fillRect(10 + i * (barW + gap), h - barH - 10, barW, barH);
  });
}

function renderTopExercises() {
  const el = document.getElementById("planTopExercises");
  if(!el) return;
  const exVol = {};
  Object.values(state.logs).forEach(log => {
    if(!log.workout || !log.sets) return;
    log.sets.forEach(s => {
       const w = parseFloat(s.weight||0);
       const r = parseFloat(s.reps||0);
       if(w>0 && r>0) exVol[log.workout] = (exVol[log.workout]||0) + (w*r);
    });
  });
  const sorted = Object.entries(exVol).sort((a,b)=>b[1]-a[1]).slice(0,5);
  el.innerHTML = sorted.map(([name, vol]) => `<div class="topitem"><span>${escapeHtml(name)}</span><b class="mono">${Math.round(vol).toLocaleString()} kg</b></div>`).join("");
}

function downloadFile(content, fileName, mimeType) {
  const a = document.createElement("a");
  const file = new Blob([content], {type: mimeType});
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
}

function handleExportJSON() {
  const json = JSON.stringify(state.logs, null, 2);
  downloadFile(json, `bolt_backup_${new Date().toISOString().slice(0,10)}.json`, "application/json");
}

function handleExportCSV() {
  let csv = "Date,Program,Session,Exercise,Set,Reps,Weight,Note\n";
  const dateStr = new Date().toISOString().slice(0,10);
  Object.values(state.logs).forEach(log => {
    if(!log.sets) return;
    log.sets.forEach(s => {
      if(s.weight || s.reps || s.done || s.note) {
        const note = (s.note||"").replace(/"/g, '""'); 
        csv += `"${dateStr}","${log.program}","${log.session}","${log.workout}",${s.set},"${s.reps||""}","${s.weight||""}","${note}"\n`;
      }
    });
  });
  downloadFile(csv, `bolt_export_${dateStr}.csv`, "text/csv");
}

function handleImportJSON(e) {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      if(typeof imported === 'object' && imported !== null) {
        state.logs = { ...state.logs, ...imported };
        await saveLogs(true); renderAll();
        alert(`Imported successfully.`);
      }
    } catch(err) { console.error(err); alert("Failed to parse."); }
  };
  reader.readAsText(file);
}

// --- NEW HISTORY & PLATE LOGIC ---

window.showHistory = (exerciseName) => {
  const modal = document.getElementById("historyModal");
  const list = document.getElementById("historyList");
  const title = document.getElementById("historyTitle");
  
  if(!modal || !list) return;
  
  title.textContent = "History: " + exerciseName;
  list.innerHTML = "";
  
  const targetNorm = normalizeName(exerciseName);
  const historyItems = [];

  Object.values(state.logs).forEach(log => {
    if (!log.workout || !log.sets) return;
    const logClean = cleanWorkoutTitle(log.workout, log.program);
    const logNorm = normalizeName(logClean);
    
    if (logNorm.includes(targetNorm) || targetNorm.includes(logNorm)) {
      let best1RM = 0;
      let topSet = null;
      
      log.sets.forEach(s => {
        const w = parseFloat(s.weight);
        const r = parseFloat(s.reps);
        if (w > 0 && r > 0) {
          const e1rm = calculate1RM(w, r);
          if (e1rm > best1RM) {
            best1RM = e1rm;
            topSet = `${w}kg x ${r}`;
          }
        }
      });

      if (best1RM > 0) {
        historyItems.push({
          session: log.session,
          program: log.program,
          topSet: topSet,
          e1rm: Math.round(best1RM)
        });
      }
    }
  });

  if (historyItems.length === 0) {
    list.innerHTML = `<div class="muted" style="padding:10px;">No history found.</div>`;
  } else {
    list.innerHTML = historyItems.map(h => `
      <div class="session-item" style="cursor:default;">
        <div class="name">${escapeHtml(h.program)}</div>
        <div class="subtitle">${escapeHtml(h.session)}</div>
        <div class="row" style="margin-top:6px; font-family:var(--mono);">
          <span>🏆 ${h.topSet}</span>
          <span style="color:var(--accent);">E1RM: ${h.e1rm}kg</span>
        </div>
      </div>
    `).join("");
  }

  modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
};

// Plate Calc Input & Visuals
const renderPlateVisuals = (weight) => {
  const visualEl = document.getElementById("plateVisual");
  const textEl = document.getElementById("plateResult");
  if(!visualEl || !textEl) return;

  textEl.textContent = weight ? calculatePlates(weight) : "";

  const plates = getPlateArray(weight || 0);
  
  const htmlPlates = plates.map(p => {
    const cls = "p-" + String(p).replace(".","-");
    return `<div class="plate ${cls}">${p}</div>`;
  }).join("");

  visualEl.innerHTML = `
    <div class="plate-stack">
      <div class="bar-collar"></div>
      ${htmlPlates}
    </div>
  `;
};

window.showPlateCalc = () => {
  document.getElementById("plateModal").classList.add("open");
  document.getElementById("plateModal").setAttribute("aria-hidden", "false");
  const el = document.getElementById("plateTarget");
  if(el) el.dispatchEvent(new Event('input'));
};

// --- GLOBAL EXPORTS ---
window.pickSession = (sid) => {
  state.activeSessionId = sid; savePrefs(); renderAll();
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("content")?.scrollIntoView({ behavior: "smooth", block: "start" });
};
window.toggleWorkout = (el) => { if(event.target.tagName !== "BUTTON") el.closest('.workout').classList.toggle('open'); };
window.modSet = (wIdx, delta) => {
  const session = state.sessionsById.get(state.activeSessionId);
  const w = getAllWorkoutsForSession(session)[wIdx];
  const wlog = ensureWorkoutLog(session, w, wIdx);
  if(delta > 0) {
    wlog.sets.push({ set: wlog.sets.length+1, targetReps: resolveReps(w.targetReps, wlog.sets.length), weight:"", reps:"", done:false, note:"" });
  } else if (wlog.sets.length > 1) wlog.sets.pop();
  saveLogs(); renderActiveSession();
};
window.startRest = (sec) => { setTimer(sec); startTimer(); };
window.updateWorkoutNote = (el, wIdx) => {
  const session = state.sessionsById.get(state.activeSessionId);
  const w = getAllWorkoutsForSession(session)[wIdx];
  const wlog = ensureWorkoutLog(session, w, wIdx);
  wlog.workoutNote = el.value; saveLogsDebounced();
};
window.updateSet = (el, wIdx, setNum, field) => {
  const session = state.sessionsById.get(state.activeSessionId);
  const w = getAllWorkoutsForSession(session)[wIdx];
  const wlog = ensureWorkoutLog(session, w, wIdx);
  const row = wlog.sets.find(r => r.set === setNum);
  if(!row) return;
  if(field === 'done') {
    row.done = el.checked;
    el.closest('.set-row').classList.toggle('done', row.done);
    saveLogs(); 
    const isLogged = wlog.sets.some(s=>s.done||s.weight||s.reps);
    const tEl = document.getElementById(`title_${wIdx}`);
    if(tEl) {
       const cleanTitle = escapeHtml(cleanWorkoutTitle(w.title, session.programName));
       const badge = isLogged ? '<span class="pill" style="margin-left:8px;border-color:rgba(53,208,127,.35);background:rgba(53,208,127,.10);color:#c8ffe2">logged</span>' : '';
       tEl.innerHTML = `${cleanTitle} ${badge}`;
    }
    updateActiveProgress();
  } else {
    row[field] = el.value; saveLogsDebounced();
  }
};
window.handleCustomAdd = () => {
  const session = state.sessionsById.get(state.activeSessionId);
  const title = document.getElementById("customTitle")?.value||"";
  const sets = parseInt(document.getElementById("customSets")?.value||"3",10);
  const reps = document.getElementById("customReps")?.value||"";
  if(!String(title).trim()) return alert("Enter exercise name.");
  addCustomWorkout(session, title, sets, reps); renderAll();
};
window.removeCustomWorkout = (index) => {
  if(!confirm("Remove?")) return;
  const session = state.sessionsById.get(state.activeSessionId);
  const key = sessionKey(session);
  const arr = state.logs.__custom_sessions[key];
  if(arr && arr[index]) { arr.splice(index, 1); saveLogs(); renderAll(); }
};

// --- LISTENERS ---
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("signInGoogle")?.addEventListener("click", handleSignIn);
  document.getElementById("signOut")?.addEventListener("click", async () => { await handleSignOut(); handleAppUpdate(null); alert("Signed out."); });
  
  // js/main.js
document.getElementById("resetStartDate")?.addEventListener("click", () => {
  if(!confirm("Clear start date for this program? Auto-jump will stop working for this plan.")) return;
  
  // Remove the date for the current program
  delete state.programStartDates[state.activeProgramId]; 
  savePrefs();
  
  // Clear the input and notify
  document.getElementById("programStartDate").value = "";
  alert("Start date cleared.");
});

  document.getElementById("programSelect").addEventListener("change", (e)=>{
    state.activeProgramId = e.target.value;
    const p = state.programById.get(state.activeProgramId);
    state.activeSessionId = p?.sessions[0]?.id || null;
    const autoId = getAutoSelectedSessionId();
    if (autoId) state.activeSessionId = autoId;
    savePrefs(); renderAll();
  });
  document.getElementById("sessionSelect").addEventListener("change", (e)=>{ state.activeSessionId = e.target.value; savePrefs(); renderAll(); });
  document.getElementById("search").addEventListener("input", renderSessionsList);
  
  document.getElementById("openSessions").addEventListener("click", () => {
    const d = document.getElementById("drawer");
    const dList = document.getElementById("sessionsDrawer");
    const src = document.getElementById("sessions");
    if(src) dList.innerHTML = src.innerHTML;
    d.classList.add("open"); d.setAttribute("aria-hidden", "false");
  });
  document.getElementById("closeSessions").addEventListener("click", () => { document.getElementById("drawer").classList.remove("open"); });

  document.getElementById("timerStart")?.addEventListener("click", startTimer);
  document.getElementById("timerPause")?.addEventListener("click", pauseTimer);
  document.getElementById("timerReset")?.addEventListener("click", resetTimer);
  document.getElementById("setCustom")?.addEventListener("click", () => { const val = parseInt(document.getElementById("customSeconds").value, 10); if(val) setTimer(val); });
  document.getElementById("preset")?.addEventListener("change", (e) => { setTimer(parseInt(e.target.value, 10)); });
  
  document.getElementById("emergencyResetBtn")?.addEventListener("click", async () => {
    if(!confirm("⚠️ Force Update? This will reload the latest version. Your logs are safe.")) return;
    document.getElementById("emergencyResetBtn").textContent = "Updating...";
    if('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for(let reg of regs) await reg.unregister();
    }
    if('caches' in window) {
      const keys = await caches.keys();
      for(let key of keys) await caches.delete(key);
    }
    window.location.reload(true);
  });

  // BUTTON LISTENERS (Footer)
  document.getElementById("reloadBtn")?.addEventListener("click", async () => {
    if(!confirm("Reload program data?")) return;
    await loadAllPrograms();
    renderAll();
    alert("Reloaded.");
  });

  document.getElementById("clearBtn")?.addEventListener("click", () => {
    if(!confirm("Delete all logs? This cannot be undone.")) return;
    state.logs = {};
    saveLogs(true);
    renderAll();
  });

  document.getElementById("exportLogs")?.addEventListener("click", handleExportJSON);
  document.getElementById("exportCSV")?.addEventListener("click", handleExportCSV);
  document.getElementById("importLogs")?.addEventListener("click", () => document.getElementById("importFile").click());
  document.getElementById("importFile")?.addEventListener("change", handleImportJSON);
  
  // Plan Stats Button
// Update this listener in js/main.js
  document.getElementById("openPlanStats")?.addEventListener("click", () => {
  document.getElementById("planStatsModal").classList.add("open");
  const saved = state.programStartDates[state.activeProgramId];
  // Changed from || "2025-11-24" to empty string
  document.getElementById("programStartDate").value = saved || ""; 
  renderPlanStats();
});
  document.getElementById("closePlanStats")?.addEventListener("click", () => document.getElementById("planStatsModal").classList.remove("open"));
  document.getElementById("applyStartDate")?.addEventListener("click", () => {
    const val = document.getElementById("programStartDate").value;
    if(val){
      state.programStartDates[state.activeProgramId] = val; savePrefs();
      const autoId = getAutoSelectedSessionId();
      if(autoId) { state.activeSessionId = autoId; savePrefs(); renderAll(); alert("Jumped!"); document.getElementById("planStatsModal").classList.remove("open"); }
    }
  });

  // NEW MODALS
  document.getElementById("closeHistory").addEventListener("click", () => document.getElementById("historyModal").classList.remove("open"));
  document.getElementById("closePlate").addEventListener("click", () => document.getElementById("plateModal").classList.remove("open"));
  
  // Plate Calc Input
  document.getElementById("plateTarget")?.addEventListener("input", (e) => {
    renderPlateVisuals(parseFloat(e.target.value));
  });

  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  await loadAllPrograms();
  await loadLogsAsync();
  loadFunFacts();
  
  const autoId = getAutoSelectedSessionId();
  if (autoId) state.activeSessionId = autoId;

  initAuth(handleAppUpdate);
});
