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
  getAutoSelectedSessionId
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
  resolveReps
} from './utils.js';

// --- VISIBILITY FIX (SAVE ON LOCK) ---
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    // Force immediate local save
    saveLogs(true);
    console.log("App hidden: Forced immediate local save.");
  } else if (document.visibilityState === "visible") {
    tickTimer();
  }
});

// --- UI UPDATE BRIDGE ---
function handleAppUpdate(user) {
    setAuthUI(!!user, user?.email);
    renderAll();
}

// --- STATS & EXPORT LOGIC ---

function renderPlanStats() {
  let totalVol = 0;
  let totalSets = 0;
  let sessMap = new Set();
  let exMap = new Set();
  const volBySession = {}; // For chart

  Object.values(state.logs).forEach(log => {
    if(!log.program || !log.session) return;
    
    // Track unique sessions
    const sKey = `${log.program}|||${log.session}`;
    sessMap.add(sKey);
    
    // Track unique exercises
    if(log.workout) exMap.add(log.workout);

    let logVol = 0;
    if(log.sets && Array.isArray(log.sets)) {
      log.sets.forEach(s => {
        const w = parseFloat(s.weight||0);
        const r = parseFloat(s.reps||0); // simple parsing
        if(w > 0 && r > 0) {
          const v = w * r;
          totalVol += v;
          logVol += v;
        }
        if(s.done || (w>0 && r>0)) totalSets++;
      });
    }
    
    if (logVol > 0) {
      volBySession[sKey] = (volBySession[sKey] || 0) + logVol;
    }
  });

  // Update Text
  document.getElementById("planTotalVolume").textContent = Math.round(totalVol).toLocaleString();
  document.getElementById("planLoggedSessions").textContent = sessMap.size;
  document.getElementById("planLoggedSets").textContent = totalSets;
  document.getElementById("planUniqueExercises").textContent = exMap.size;

  // Render Chart
  renderSimpleChart(volBySession);
  
  // Render Top Exercises
  renderTopExercises();
}

function renderSimpleChart(dataObj) {
  const canvas = document.getElementById("planSessionChart");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0,0,w,h);
  
  const values = Object.values(dataObj);
  if(values.length === 0) {
    ctx.fillStyle = "#5f5a42"; ctx.font="14px monospace"; ctx.fillText("No data yet", 20, 50);
    return;
  }
  
  const max = Math.max(...values) * 1.1;
  const barW = Math.min(40, (w - 20) / values.length);
  const gap = 4;
  
  ctx.fillStyle = "#f4c300";
  values.forEach((val, i) => {
    const barH = (val / max) * (h - 20);
    const x = 10 + i * (barW + gap);
    const y = h - barH - 10;
    ctx.fillRect(x, y, barW, barH);
  });
}

function renderTopExercises() {
  const el = document.getElementById("planTopExercises");
  if(!el) return;
  
  // Aggregate volume by exercise name
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
  el.innerHTML = sorted.map(([name, vol]) => `
    <div class="topitem">
      <span>${escapeHtml(name)}</span>
      <b class="mono">${Math.round(vol).toLocaleString()} kg</b>
    </div>
  `).join("");
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
      // Only export rows with data
      if(s.weight || s.reps || s.done || s.note) {
        // Escape quotes
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
        await saveLogs(true); // Force save
        renderAll();
        alert(`Imported successfully. Merged ${Object.keys(imported).length} records.`);
      }
    } catch(err) {
      alert("Failed to parse JSON file.");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

// --- GLOBAL EXPORTS FOR HTML HANDLERS ---
window.pickSession = (sid) => {
  state.activeSessionId = sid;
  savePrefs();
  renderAll();
  const drawer = document.getElementById("drawer");
  if(drawer.classList.contains("open")){
      drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true");
  }
  document.getElementById("content")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.toggleWorkout = (el) => {
  if(event.target.tagName !== "BUTTON") el.closest('.workout').classList.toggle('open');
};

window.modSet = (wIdx, delta) => {
  const session = state.sessionsById.get(state.activeSessionId);
  const w = getAllWorkoutsForSession(session)[wIdx];
  const wlog = ensureWorkoutLog(session, w, wIdx);
  if(delta > 0) {
    wlog.sets.push({
      set: wlog.sets.length+1, targetReps: resolveReps(w.targetReps, wlog.sets.length),
      weight:"", reps:"", done:false, note:""
    });
  } else if (wlog.sets.length > 1) {
    wlog.sets.pop();
  }
  saveLogs();
  renderActiveSession();
};

window.startRest = (sec) => { setTimer(sec); startTimer(); };

window.updateWorkoutNote = (el, wIdx) => {
  const session = state.sessionsById.get(state.activeSessionId);
  const w = getAllWorkoutsForSession(session)[wIdx];
  const wlog = ensureWorkoutLog(session, w, wIdx);
  wlog.workoutNote = el.value;
  saveLogsDebounced();
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
    saveLogs(); // Immediate save on check
    const isLogged = wlog.sets.some(s=>s.done||s.weight||s.reps);
    const tEl = document.getElementById(`title_${wIdx}`);
    if(tEl) {
       const cleanTitle = escapeHtml(cleanWorkoutTitle(w.title, session.programName));
       const badge = isLogged ? '<span class="pill" style="margin-left:8px;border-color:rgba(53,208,127,.35);background:rgba(53,208,127,.10);color:#c8ffe2">logged</span>' : '';
       tEl.innerHTML = `${cleanTitle} ${badge}`;
    }
    updateActiveProgress();
  } else {
    row[field] = el.value;
    saveLogsDebounced();
  }
};

window.handleCustomAdd = () => {
  const session = state.sessionsById.get(state.activeSessionId);
  const title = document.getElementById("customTitle")?.value||"";
  const sets = parseInt(document.getElementById("customSets")?.value||"3",10);
  const reps = document.getElementById("customReps")?.value||"";
  if(!String(title).trim()) return alert("Enter exercise name.");
  addCustomWorkout(session, title, sets, reps);
  renderAll();
};

window.removeCustomWorkout = (index) => {
  if(!confirm("Remove this custom exercise?")) return;
  const session = state.sessionsById.get(state.activeSessionId);
  const key = sessionKey(session);
  const arr = state.logs.__custom_sessions[key];
  if(arr && arr[index]) {
    arr.splice(index, 1);
    saveLogs();
    renderAll();
  }
};

// --- EVENT LISTENERS ---

document.addEventListener("DOMContentLoaded", async () => {
  // Global buttons
  document.getElementById("signInGoogle")?.addEventListener("click", handleSignIn);
  
  // UPDATED SIGN OUT LOGIC
  document.getElementById("signOut")?.addEventListener("click", async () => {
      await handleSignOut();
      handleAppUpdate(null); // Manual UI update
      alert("Signed out and local data cleared.");
  });
  
  document.getElementById("programSelect").addEventListener("change", (e)=>{
    state.activeProgramId = e.target.value;
    const p = state.programById.get(state.activeProgramId);
    state.activeSessionId = p?.sessions[0]?.id || null;
    
    // If we switch programs, check if we have a saved start date for it and jump
    const autoId = getAutoSelectedSessionId();
    if (autoId) state.activeSessionId = autoId;

    savePrefs(); renderAll();
  });
  
  document.getElementById("sessionSelect").addEventListener("change", (e)=>{
    state.activeSessionId = e.target.value;
    savePrefs(); renderAll();
  });
  
  document.getElementById("search").addEventListener("input", renderSessionsList);
  
  document.getElementById("openSessions").addEventListener("click", () => {
    const d = document.getElementById("drawer");
    const dList = document.getElementById("sessionsDrawer");
    const src = document.getElementById("sessions");
    if(src) dList.innerHTML = src.innerHTML;
    d.classList.add("open"); d.setAttribute("aria-hidden", "false");
  });

  document.getElementById("closeSessions").addEventListener("click", () => {
    const d = document.getElementById("drawer");
    d.classList.remove("open"); d.setAttribute("aria-hidden", "true");
  });

  document.getElementById("timerStart")?.addEventListener("click", startTimer);
  document.getElementById("timerPause")?.addEventListener("click", pauseTimer);
  document.getElementById("timerReset")?.addEventListener("click", resetTimer);
  
  document.getElementById("setCustom")?.addEventListener("click", () => {
      const val = parseInt(document.getElementById("customSeconds").value, 10);
      if(val) setTimer(val);
  });
  
  document.getElementById("preset")?.addEventListener("change", (e) => {
      setTimer(parseInt(e.target.value, 10));
  });
  
  document.getElementById("emergencyResetBtn")?.addEventListener("click", () => {
    if(!confirm("Reset app? This clears cached code. Your logs are safe.")) return;
    if('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) { registration.unregister(); }
        window.location.reload(true);
      });
    } else {
      window.location.reload(true);
    }
  });

  // --- STATS & EXPORT LISTENERS ---
  // Restoring functionality here
  document.getElementById("exportLogs")?.addEventListener("click", handleExportJSON);
  document.getElementById("exportCSV")?.addEventListener("click", handleExportCSV);
  document.getElementById("importLogs")?.addEventListener("click", () => document.getElementById("importFile").click());
  document.getElementById("importFile")?.addEventListener("change", handleImportJSON);

  // --- START DATE LOGIC ---
  const elDate = document.getElementById("programStartDate");
  const btnJump = document.getElementById("applyStartDate");

  document.getElementById("openPlanStats")?.addEventListener("click", () => {
    const d = document.getElementById("planStatsModal");
    d.classList.add("open"); d.setAttribute("aria-hidden", "false");
    
    // Fill input
    const saved = state.programStartDates[state.activeProgramId];
    if(saved) elDate.value = saved;
    else elDate.value = "2025-11-24"; // Default for you
    
    // Refresh stats when modal opens
    renderPlanStats();
  });
  
  document.getElementById("closePlanStats")?.addEventListener("click", () => {
    document.getElementById("planStatsModal").classList.remove("open");
  });

  btnJump?.addEventListener("click", () => {
    if(elDate.value){
      state.programStartDates[state.activeProgramId] = elDate.value;
      savePrefs();
      const autoId = getAutoSelectedSessionId();
      if(autoId) {
         state.activeSessionId = autoId;
         savePrefs();
         renderAll();
         alert("Jumped to correct week based on date!");
         document.getElementById("planStatsModal").classList.remove("open");
      } else {
         alert("Could not calculate session (Date might be in future or program too short).");
      }
    }
  });

  // Start Loading
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  await loadAllPrograms();
  await loadLogsAsync();
  loadFunFacts();
  
  // --- AUTO-SELECT ON LOAD ---
  // If we have a stored date, or if we want to force the default you requested:
  if (!state.programStartDates[state.activeProgramId]) {
      // Hardcode default for your immediate use case
      state.programStartDates[state.activeProgramId] = "2025-11-24";
  }
  
  const autoId = getAutoSelectedSessionId();
  if (autoId) {
      state.activeSessionId = autoId;
      console.log("Auto-selected session:", autoId);
  }

  // UPDATED INIT AUTH (Pass the bridge function)
  initAuth(handleAppUpdate);
});