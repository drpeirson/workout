import { state, getAllWorkoutsForSession, countLoggedInSession, ensureWorkoutLog, countWorkoutLogged, sessionKey, getCustomWorkouts } from './store.js';
import { escapeHtml, cleanWorkoutTitle, resolveReps } from './utils.js';

export function setAuthUI(signedIn, email) {
  const elStatus = document.getElementById("authStatus");
  const elIn = document.getElementById("signInGoogle");
  const elOut = document.getElementById("signOut");
  const elAv = document.getElementById("authAvatar");
  if (!elStatus) return;
  
  const meta = state._user?.user_metadata || {};
  const avatar = meta.avatar_url || meta.picture || "";
  
  if (signedIn){
    elStatus.textContent = email ? email : "Signed in";
    elIn.style.display="none"; elOut.style.display="inline-flex";
    if(elAv && avatar){ elAv.src=avatar; elAv.style.display="inline-block"; }
    else if(elAv) elAv.style.display="none";
  } else {
    elStatus.textContent = "Not signed in";
    elIn.style.display="inline-flex"; elOut.style.display="none";
    if(elAv) elAv.style.display="none";
  }
}

export function renderAll() {
  renderProgramSelect();
  renderSessionSelect();
  renderSessionsList();
  renderActiveSession();
}

function renderProgramSelect() {
  const elProg = document.getElementById("programSelect");
  if(!elProg) return;
  elProg.innerHTML = state.programs.map(p =>
    `<option value="${p.id}" ${p.id===state.activeProgramId?"selected":""}>${escapeHtml(p.name)}</option>`
  ).join("");
}

function renderSessionSelect() {
  const elSess = document.getElementById("sessionSelect");
  if(!elSess) return;
  const p = state.programById.get(state.activeProgramId);
  const sessions = p?.sessions || [];
  elSess.innerHTML = sessions.map(s =>
    `<option value="${s.id}" ${s.id===state.activeSessionId?"selected":""}>${escapeHtml(s.title)}</option>`
  ).join("");
}

export function renderSessionsList() {
  const elList = document.getElementById("sessions");
  const elCount = document.getElementById("sessionCount");
  if(!elList || !elCount) return;
  
  const p = state.programById.get(state.activeProgramId);
  const q = document.getElementById("search").value.trim().toLowerCase();
  
  const sessions = (p?.sessions || []).filter(s => {
    if (!q) return true;
    if (s.title.toLowerCase().includes(q)) return true;
    return s.workouts.some(w => w.title.toLowerCase().includes(q));
  });

  elCount.textContent = `${(p?.sessions||[]).length} sessions`;
  
  elList.innerHTML = sessions.map(s => {
    const total = s.workouts.length;
    const done = countLoggedInSession(s);
    const active = s.id === state.activeSessionId ? "active" : "";
    return `
      <div class="session-item ${active}" onclick="window.pickSession('${s.id}')">
        <div class="name">${escapeHtml(s.title)}</div>
        <div class="meta"><span class="badge">${total} workouts</span><span class="badge">${done}/${total} logged</span></div>
      </div>
    `;
  }).join("");
}

function renderSetRow(session, workout, workoutIndex, row) {
  const doneClass = row.done ? "done" : "";
  const smartTarget = resolveReps(workout.targetReps, row.set - 1);
  let displayValue = row.targetReps;
  if (!displayValue || displayValue === workout.targetReps || displayValue.includes(",")) {
    displayValue = smartTarget;
  }

  return `
    <div class="set-row ${doneClass}">
      <div class="grid">
        <div class="mono">#${row.set}</div>
        <input type="text" placeholder="${escapeHtml(smartTarget)}" value="${escapeHtml(displayValue)}" oninput="window.updateSet(this, ${workoutIndex}, ${row.set}, 'targetReps')">
        <input type="text" inputmode="decimal" placeholder="kg" value="${escapeHtml(row.weight||"")}" oninput="window.updateSet(this, ${workoutIndex}, ${row.set}, 'weight')">
        <input type="text" inputmode="numeric" placeholder="reps" value="${escapeHtml(row.reps||"")}" oninput="window.updateSet(this, ${workoutIndex}, ${row.set}, 'reps')">
        <input type="checkbox" ${row.done?"checked":""} onchange="window.updateSet(this, ${workoutIndex}, ${row.set}, 'done')">
      </div>
      <div style="margin-top:8px">
        <input type="text" placeholder="Set note (optional)" value="${escapeHtml(row.note||"")}" oninput="window.updateSet(this, ${workoutIndex}, ${row.set}, 'note')">
      </div>
    </div>
  `;
}

export function renderActiveSession() {
  const elMain = document.getElementById("content");
  const elHead = document.getElementById("activeTitle");
  const session = state.sessionsById.get(state.activeSessionId);
  
  if (!session){
    if(elHead) elHead.textContent = "No session loaded";
    document.getElementById("activeMeta").textContent = "Check sources";
    document.getElementById("activePill").textContent = "—";
    elMain.innerHTML = `<div class="muted">Nothing selected.</div>`;
    return;
  }

  elHead.textContent = `${session.programName} • ${session.title}`;
  updateActiveProgress();
  updateSessionFunFact();

  const allWorkouts = getAllWorkoutsForSession(session);
  const workoutsHtml = allWorkouts.map((w, idx) => {
    const wlog = ensureWorkoutLog(session, w, idx);
    const logged = countWorkoutLogged(session.programName, session.title, w, idx);
    const badge = logged ? '<span class="pill" style="margin-left:8px;border-color:rgba(53,208,127,.35);background:rgba(53,208,127,.10);color:#c8ffe2">logged</span>' : '';
    const requiredLabel = `Required: Sets ${escapeHtml(w.setsStr||String(w.setCount))} • Reps ${escapeHtml(w.repsStr||w.targetReps||"")}`;
    
    const deleteBtn = w._isCustom 
      ? `<button class="btn danger small" onclick="window.removeCustomWorkout(${w._customIndex}); event.stopPropagation();" style="margin-right:8px;">Remove</button>`
      : '';

    return `
      <div class="workout" data-wi="${idx}">
        <div class="workout-head" onclick="window.toggleWorkout(this)">
          <div>
            <div class="workout-title" id="title_${idx}">${escapeHtml(cleanWorkoutTitle(w.title, session.programName))} ${badge}</div>
            <div class="workout-sub">${requiredLabel}</div>
          </div>
          <div style="display:flex;align-items:center;">
            ${deleteBtn}
            <button class="btn small">Toggle</button>
          </div>
        </div>
        <div class="workout-body">
          ${w.notes?.length ? `<div class="small-note"><b>Plan notes</b><br>${w.notes.map(n=>escapeHtml(n)).join("<br>")}</div><div class="divider"></div>` : ""}
          <div class="grid"><div class="h">Set</div><div class="h">Target</div><div class="h">Kg</div><div class="h">Reps</div><div class="h">Done</div></div>
          <div id="sets_${idx}">${wlog.sets.map(r=>renderSetRow(session,w,idx,r)).join("")}</div>
          <div class="footer-actions">
            <button class="btn small" onclick="window.modSet(${idx}, 1)">+ Set</button>
            <button class="btn small danger" onclick="window.modSet(${idx}, -1)">− Set</button>
            <button class="btn small" onclick="window.startRest(120)">Start 120s rest</button>
            <button class="btn small" onclick="window.startRest(90)">Start 90s rest</button>
            <button class="btn small" onclick="window.startRest(60)">Start 60s rest</button>
          </div>
          <div class="divider"></div>
          <label class="muted">Workout notes</label>
          <textarea oninput="window.updateWorkoutNote(this, ${idx})" placeholder="Notes...">${escapeHtml(wlog.workoutNote||"")}</textarea>
        </div>
      </div>
    `;
  }).join("");

  const addBoxHtml = `
    <div class="workout">
      <div class="workout-head" onclick="window.toggleWorkout(this)">
        <div><div class="workout-title">Add exercise</div><div class="workout-sub">Custom exercise</div></div>
        <button class="btn small">Toggle</button>
      </div>
      <div class="workout-body">
        <div class="grid" style="grid-template-columns: 1fr 90px 120px;">
          <div class="h">Exercise</div><div class="h">Sets</div><div class="h">Target reps</div>
          <input id="customTitle" type="text" placeholder="e.g. Arnold press" />
          <input id="customSets" type="number" min="1" step="1" value="3" />
          <input id="customReps" type="text" placeholder="e.g. 8-12" />
        </div>
        <div class="footer-actions"><button class="btn small primary" onclick="window.handleCustomAdd()">Add</button></div>
      </div>
    </div>
  `;
  elMain.innerHTML = workoutsHtml + addBoxHtml;
}

export function updateActiveProgress() {
  const session = state.sessionsById.get(state.activeSessionId);
  if (!session) return;
  const all = getAllWorkoutsForSession(session);
  const total = all.length;
  let done = 0;
  all.forEach((w, idx) => {
    if (countWorkoutLogged(session.programName, session.title, w, idx)) done++;
  });
  document.getElementById("activeMeta").textContent = `Workouts: ${total} • Logged: ${done}/${total}`;
  document.getElementById("activePill").textContent = `${done}/${total}`;
}

// Fun Fact Logic
function numFloat(v){ const n=parseFloat(String(v).trim()); return Number.isFinite(n)?n:null; }
function numInt(v){ const n=parseInt(String(v).trim(),10); return Number.isFinite(n)?n:null; }
function fmtInt(n){ try{return new Intl.NumberFormat().format(Math.round(n));}catch{return String(Math.round(n));} }
function hashInt(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0);
}

function sessionLogPrefix(session){ return `${session.programName}|||${session.title}|||`; }

function computeSessionVolumeKg(session){
  if (!session) return 0;
  const prefix = sessionLogPrefix(session);
  let total = 0;
  for (const k of Object.keys(state.logs || {})){
    if (k.startsWith("__") || !k.startsWith(prefix)) continue;
    const wlog = state.logs[k];
    const sets = Array.isArray(wlog?.sets) ? wlog.sets : [];
    for (const s of sets){
      const w = numFloat(s?.weight);
      const r = numInt(s?.reps);
      if (w != null && r != null) total += (w * r);
    }
  }
  return total;
}

function updateSessionFunFact(){
  const session = state.sessionsById.get(state.activeSessionId);
  const elFact = document.getElementById("activeFunFact");
  if (!elFact || !session) {
    if(elFact) elFact.textContent = "";
    return;
  }
  const kg = computeSessionVolumeKg(session);
  if (!kg || kg <= 0){ elFact.textContent = ""; return; }
  
  let picks = [
    { label: '3.5" floppy disks', unitKg: 0.02 },
    { label: 'Raspberry Pi boards', unitKg: 0.045 },
    { label: 'desktop PCs', unitKg: 8.0 }
  ];
  if (state.funFacts && state.funFacts.length > 0) picks = state.funFacts;

  const h = hashInt(`${session.programName}::${session.title}`);
  const pick = picks[h % picks.length];
  const count = Math.max(1, Math.round(kg / pick.unitKg));
  elFact.textContent = `You lifted ${fmtInt(kg)}kg today — about the same weight as ${fmtInt(count)} ${pick.label}.`;
}