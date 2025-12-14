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
  getAutoSelectedSessionId // <--- IMPORTED HERE
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