export function resolveReps(repsStr, setIndex) {
  if (!repsStr) return "";
  const s = String(repsStr);
  if (s.includes(",")) {
    const parts = s.split(",").map(p => p.trim());
    return parts[setIndex] || parts[parts.length - 1];
  }
  return s;
}

export function uid(str){
  let h = 2166136261;
  for (let i=0; i<str.length; i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "id_" + (h >>> 0).toString(16);
}

export function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

export function cleanWorkoutTitle(title, programName){
  let t = String(title || "").trim();
  if (!t) return t;
  if (programName){
    const progRe = new RegExp("\\s*-\\s*" + String(programName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b.*$", "i");
    if (progRe.test(t)) t = t.replace(progRe, "").trim();
  }
  t = t.replace(/\s*-\s*WEEK\s*\d+\b.*$/i, "").trim();
  t = t.replace(/\s*-\s*Week\s*\d+\b.*$/i, "").trim();
  t = t.replace(/\s*-\s*SESSION\s*\d+\b.*$/i, "").trim();
  return t;
}

export function toIntMaybe(v){
  if (v == null) return null;
  const s = String(v).trim();
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export function fmtTime(sec){
  sec = Math.max(0, Math.floor(sec));
  const m = String(Math.floor(sec/60)).padStart(2,"0");
  const s = String(sec%60).padStart(2,"0");
  return `${m}:${s}`;
}

export function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Timer Logic
let timerState = { total: 120, left: 120, running: false, t: null, endAt: null };

export function getTimerState() { return timerState; }

export function setTimer(sec) {
  timerState.total = sec;
  timerState.left = sec;
  timerState.running = false;
  timerState.endAt = null;
  stopTimerLoop();
  renderTimerDisplay();
}

function renderTimerDisplay() {
  const elDisplay = document.getElementById("timerDisplay");
  if(elDisplay) elDisplay.textContent = fmtTime(timerState.left);
}

function stopTimerLoop() {
  if (timerState.t) {
    clearInterval(timerState.t);
    timerState.t = null;
  }
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.start();
    setTimeout(()=>{ o.stop(); ctx.close(); }, 250);
  } catch {}
}

export function tickTimer() {
  if (!timerState.running) return;
  const now = Date.now();
  const left = Math.max(0, Math.ceil((timerState.endAt - now) / 1000));
  timerState.left = left;
  renderTimerDisplay();

  if (left <= 0) {
    timerState.running = false;
    timerState.endAt = null;
    stopTimerLoop();
    beep();
  }
}

export function startTimer() {
  if (timerState.left <= 0) timerState.left = timerState.total;
  timerState.endAt = Date.now() + timerState.left * 1000;
  timerState.running = true;
  if (!timerState.t) timerState.t = setInterval(tickTimer, 250);
  tickTimer();
}

export function pauseTimer() {
  if (!timerState.running) return;
  renderTimerDisplay();
  timerState.running = false;
  timerState.endAt = null;
  stopTimerLoop();
}

export function resetTimer() {
  setTimer(timerState.total);
}