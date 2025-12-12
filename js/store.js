import { PROGRAM_SOURCES, SUPABASE_URL, SUPABASE_ANON_KEY, LS_KEY, PREFS_KEY, CLOUD_SAVE_DEBOUNCE_MS } from './config.js';
import { uid, toIntMaybe, cleanWorkoutTitle, resolveReps, debounce } from './utils.js';

// Setup Supabase
const supabase = (typeof window.supabase !== 'undefined' && SUPABASE_ANON_KEY.length > 20) 
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : null;

export const state = {
  programs: [],
  programById: new Map(),
  sessionsById: new Map(),
  activeProgramId: null,
  activeSessionId: null,
  logs: {}, 
  funFacts: [],
  _user: null
};

let cloudSaveTimer = null;

// --- STORAGE ---

export async function saveLogs(force = false) {
  try {
    // Immediate Local Save
    if (typeof idbKeyval !== 'undefined') {
        // We use catch here to ensure main thread isn't blocked if IDB fails
        idbKeyval.set(LS_KEY, state.logs).catch(console.error);
    }
    localStorage.setItem(LS_KEY, JSON.stringify(state.logs));
    
    // Cloud Save
    if(force) {
        if(cloudSaveTimer) clearTimeout(cloudSaveTimer);
        cloudSaveNow().catch(console.error);
    } else {
        scheduleCloudSave();
    }
  } catch (e) { console.error("Save failed", e); }
}

export const saveLogsDebounced = debounce(() => saveLogs(false), 500);

export function scheduleCloudSave() {
  if(!supabase || !state._user) return;
  if(cloudSaveTimer) clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(()=>cloudSaveNow().catch(console.error), CLOUD_SAVE_DEBOUNCE_MS);
}

async function cloudSaveNow() {
  if(!supabase || !state._user) return;
  const payload = { user_id: state._user.id, logs: state.logs, updated_at: new Date().toISOString() };
  const {error} = await supabase.from("user_logs").upsert(payload, {onConflict:"user_id"});
  if(error) throw error;
  console.log("Cloud save complete");
}

export async function cloudLoad() {
  if(!supabase || !state._user) return;
  const {data, error} = await supabase.from("user_logs").select("logs").eq("user_id", state._user.id).maybeSingle();
  if(error){ console.warn("cloudLoad error", error); return; }
  const cloudLogs = data?.logs||{};
  if(typeof cloudLogs!=="object" || cloudLogs===null) return;
  state.logs = {...state.logs, ...cloudLogs};
  await saveLogs(true); // Persist merged logs locally
}

export function savePrefs() {
  try {
    const prefs = {
      programId: state.activeProgramId,
      sessionId: state.activeSessionId
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) { console.warn("Failed to save prefs", e); }
}

// --- INIT DATA ---

export async function loadFunFacts() {
  try {
    const res = await fetch("fun_facts.json");
    if(res.ok) state.funFacts = await res.json();
  } catch(e) { console.warn("Failed to load fun facts", e); }
}

export async function loadLogsAsync() {
  try {
    if (typeof idbKeyval === 'undefined') {
      console.warn("IDB missing");
      state.logs = JSON.parse(localStorage.getItem(LS_KEY)||"{}");
    } else {
      const dbLogs = await idbKeyval.get(LS_KEY);
      if (dbLogs) state.logs = dbLogs;
      else {
         const local = localStorage.getItem(LS_KEY);
         if(local) { state.logs = JSON.parse(local); await idbKeyval.set(LS_KEY, state.logs); }
      }
    }
  } catch(e) {
    console.error(e);
    // document.getElementById("content").innerHTML = "Error loading logs"; // UI concern
  }
}

export async function loadAllPrograms() {
  state.programs=[];
  for(const src of PROGRAM_SOURCES){
    const res = await fetch(src.url, {cache:"no-store"});
    if(!res.ok) throw new Error(res.statusText);
    const raw = await res.json();
    
    const prog = { 
      id: uid(`program::${raw.program}`), 
      name: raw.program, 
      sessions: (raw.sessions||[]).map((s,si)=>{
         const sTitle = s.session || `Session ${si+1}`;
         return {
           id: uid(`program::${raw.program}::session::${sTitle}::${si}`),
           title: sTitle,
           programName: raw.program,
           workouts: (s.workouts||[]).map((w,wi)=>{
             const wTitle = w.title || `Workout ${wi+1}`;
             const sStr = w.sets??""; const rStr=w.reps??"";
             let tReps = String(rStr).trim();
             if (tReps.toLowerCase() === cleanWorkoutTitle(wTitle, raw.program).toLowerCase()) tReps = "";
             return {
               id: uid(`w::${sTitle}::${wi}::${wTitle}`),
               title: wTitle,
               setCount: toIntMaybe(sStr) ?? 3,
               targetReps: tReps,
               setsStr: String(sStr), repsStr: String(rStr),
               notes: Array.isArray(w.notes)?w.notes:[]
             };
           })
         };
      })
    };
    state.programs.push(prog);
  }
  state.programById.clear(); state.sessionsById.clear();
  for(const p of state.programs){
    state.programById.set(p.id, p);
    for(const s of p.sessions) state.sessionsById.set(s.id, s);
  }
  
  let prefs = {};
  try{ prefs = JSON.parse(localStorage.getItem(PREFS_KEY)||"{}"); }catch{}
  if(prefs.programId && state.programById.has(prefs.programId)) state.activeProgramId = prefs.programId;
  else state.activeProgramId = state.programs[0]?.id || null;
  
  const actProg = state.programById.get(state.activeProgramId);
  if(actProg){
     const sessExists = actProg.sessions.some(s=>s.id===prefs.sessionId);
     state.activeSessionId = sessExists ? prefs.sessionId : actProg.sessions[0]?.id;
  }
}

// --- LOGIC ---

export function sessionKey(session){ return `${session.programName}|||${session.title}`; }

export function ensureCustomStore(){
  if (typeof state.logs !== "object" || state.logs === null) state.logs = {};
  if (!state.logs.__custom_sessions) state.logs.__custom_sessions = {};
}

export function getCustomWorkouts(session){
  ensureCustomStore();
  const key = sessionKey(session);
  return state.logs.__custom_sessions[key] || [];
}

export function addCustomWorkout(session, title, setCount, reps){
  ensureCustomStore();
  const key = sessionKey(session);
  const arr = getCustomWorkouts(session);
  arr.push({
    title: String(title||"").trim(),
    sets: Number(setCount)||3,
    reps: String(reps||"").trim(),
    notes: [],
    created_at: new Date().toISOString()
  });
  state.logs.__custom_sessions[key] = arr;
  saveLogs();
}

export function getAllWorkoutsForSession(session){
  const base = Array.isArray(session?.workouts) ? session.workouts : [];
  const custom = getCustomWorkouts(session).map((cw, i) => ({
    id: uid(`${session.programName}::${session.title}::custom::${i}::${cw.title}`),
    title: cw.title,
    index: base.length + i,
    setsStr: String(cw.sets),
    repsStr: String(cw.reps || ""),
    setCount: Number(cw.sets) || 3,
    targetReps: String(cw.reps || "").trim(),
    notes: Array.isArray(cw.notes) ? cw.notes : [],
    _isCustom: true,
    _customIndex: i
  }));
  return [...base, ...custom];
}

export function ensureWorkoutLog(session, workout, workoutIndex){
  const k = `${session.programName}|||${session.title}|||${workoutIndex}|||${workout.title}`;
  let wlog = state.logs[k];
  if(!wlog){
    wlog = {
      program: session.programName, session: session.title, workout: workout.title, workoutIndex,
      requiredSets: workout.setCount, requiredReps: workout.targetReps,
      sets: Array.from({length: workout.setCount}, (_,i) => ({
        set: i+1, targetReps: resolveReps(workout.targetReps, i),
        weight:"", reps:"", done:false, note:""
      })),
      workoutNote:""
    };
    state.logs[k] = wlog;
  } else {
    if(!Array.isArray(wlog.sets)) wlog.sets=[];
    while(wlog.sets.length < workout.setCount){
      const i = wlog.sets.length;
      wlog.sets.push({
        set: i+1, targetReps: resolveReps(workout.targetReps, i),
        weight:"", reps:"", done:false, note:""
      });
    }
  }
  return wlog;
}

export function countWorkoutLogged(programName, sessionTitle, workout, workoutIndex){
  const k = `${programName}|||${sessionTitle}|||${workoutIndex}|||${workout.title}`;
  const wlog = state.logs[k];
  if(!wlog || !Array.isArray(wlog.sets)) return false;
  return wlog.sets.some(r => (r.weight || r.reps || r.done));
}

export function countLoggedInSession(session){
  let done = 0;
  getAllWorkoutsForSession(session).forEach((w,idx)=>{
    if(countWorkoutLogged(session.programName, session.title, w, idx)) done++;
  });
  return done;
}

// --- AUTH ---

export async function initAuth(onAuthChange) {
  if(!supabase){ 
      if(onAuthChange) onAuthChange(null);
      return; 
  }

  // 1. Check initial session
  const {data:sessData} = await supabase.auth.getSession();
  state._user = sessData?.session?.user || null;
  
  if(state._user){ await cloudLoad(); }
  
  // Notify main.js that we are ready
  if(onAuthChange) onAuthChange(state._user);
  
  // 2. Listen for future changes
  supabase.auth.onAuthStateChange(async (_event, session)=>{
    state._user = session?.user || null;
    if(state._user){ 
        await cloudLoad(); 
        scheduleCloudSave(); 
    }
    // Notify main.js again
    if(onAuthChange) onAuthChange(state._user);
  });
}

export async function handleSignIn() {
  const redirectTo = new URL(".", window.location.href).toString();
  const {error} = await supabase.auth.signInWithOAuth({provider:"google", options:{redirectTo}});
  if(error) alert("Sign-in failed: "+error.message);
}

export async function handleSignOut() {
  await supabase.auth.signOut();
  state._user = null;
  state.logs = {}; 
  if (typeof idbKeyval !== 'undefined') await idbKeyval.del(LS_KEY); 
  localStorage.removeItem(LS_KEY); 
  // We return true to let the caller know we are done
  return true; 
}