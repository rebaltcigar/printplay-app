'use strict';

/**
 * Lock screen renderer.
 *
 * States:
 *   A1 — Idle: video + clock + "press any key"
 *   A2 — Active: member login panel visible
 *
 * Transitions:
 *   A1 → A2: any keydown or mousedown
 *   A2 → A1: INACTIVITY_MS of no input (default 30s from main)
 *
 * IPC messages handled:
 *   init        — { videoPath, stationId, inactivityMs }
 *   enter-idle  — force back to A1 (e.g. new session ended)
 *   warning     — { minutesRemaining } — reserved for future overlay
 */

// ─── Elements ─────────────────────────────────────────────────────────────────

const video = document.getElementById('bg-video');
const clockEl = document.getElementById('clock');
const dateEl = document.getElementById('date-display');
const shopNameEl = document.getElementById('shop-name');
const loginLayer = document.getElementById('login-layer');
const idleLayer = document.getElementById('idle-layer');
const inactivityBar = document.getElementById('inactivity-bar');

// --- Elements (Phase 2) ---
const memberBlock = document.getElementById('member-block');
const resetBlock = document.getElementById('reset-block');
const resumeBlock = document.getElementById('resume-block');

const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

const newPassInput = document.getElementById('new-password-input');
const confPassInput = document.getElementById('confirm-password-input');
const resetBtn = document.getElementById('reset-btn');
const resetError = document.getElementById('reset-error');

const resumeBtn = document.getElementById('resume-btn');
const resumeLaterBtn = document.getElementById('resume-later-btn');
const memberNameDisp = document.getElementById('member-name-display');
const memberBalDisp = document.getElementById('member-balance-display');

// ─── State ────────────────────────────────────────────────────────────────────

let state = 'INIT'; // 'A1' | 'A2'
let inactivityMs = 30_000;
let inactivityLeft = 0;
let inactivityTick = null;
let currentMember = null;

// ─── Clock ────────────────────────────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  clockEl.textContent = `${hh}:${mm}`;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
}

setInterval(updateClock, 1000);
updateClock();

// ─── State machine ────────────────────────────────────────────────────────────

function enterA1() {
  console.log('[lock] Entering A1 (Idle)');
  if (state === 'A1') return;
  state = 'A1';

  loginLayer.classList.remove('visible');
  idleLayer.classList.remove('hidden');
  inactivityBar.classList.remove('visible');
  stopInactivityTimer();
  inactivityBar.style.width = '100%';

  // Reset UI blocks
  showBlock('member');
  currentMember = null;
  clearInputs();
}

function enterA2() {
  console.log('[lock] Entering A2 (Active)');
  if (state === 'A2') return;
  state = 'A2';

  loginLayer.classList.add('visible');
  idleLayer.classList.add('hidden');
  inactivityBar.classList.add('visible');
  startInactivityTimer();
}

function startInactivityTimer() {
  stopInactivityTimer();
  inactivityLeft = inactivityMs;

  const totalMs = inactivityMs;

  inactivityTick = setInterval(() => {
    inactivityLeft -= 1000;
    const pct = Math.max(0, inactivityLeft / totalMs) * 100;
    inactivityBar.style.width = pct + '%';

    if (inactivityLeft <= 0) {
      enterA1();
    }
  }, 1000);
}

function stopInactivityTimer() {
  if (inactivityTick) {
    clearInterval(inactivityTick);
    inactivityTick = null;
  }
}

function resetInactivityTimer() {
  if (state === 'A2') {
    startInactivityTimer();
  }
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function showBlock(name) {
  [memberBlock, resetBlock, resumeBlock].forEach(b => b.style.display = 'none');
  const target = document.getElementById(`${name}-block`);
  if (target) {
    target.style.display = 'block';
    // Focus first input if any
    const firstInput = target.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }
}

function clearInputs() {
  [usernameInput, passwordInput, newPassInput, confPassInput].forEach(i => i.value = '');
  [loginError, resetError].forEach(e => e.style.display = 'none');
}

// ─── Input listeners ──────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  console.log('[lock] Keydown:', e.key);
  if (state === 'A1') enterA2();
  else {
    resetInactivityTimer();
    if (e.key === 'Enter') {
      if (memberBlock.style.display === 'block') handleLogin();
      else if (resetBlock.style.display === 'block') handleReset();
      else if (resumeBlock.style.display === 'block') handleResume();
    }
  }
});

enterA1();

document.addEventListener('mousedown', () => {
  if (state === 'A1') enterA2();
  else resetInactivityTimer();
});

loginBtn.onclick = () => handleLogin();
resetBtn.onclick = () => handleReset();
resumeBtn.onclick = () => handleResume();
resumeLaterBtn.onclick = () => enterA1();

function handleLogin() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) return;

  loginError.style.display = 'none';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Verifying...';

  window.kunek.send('MEMBER_LOGIN', { username, password });
}

function handleReset() {
  const p1 = newPassInput.value;
  const p2 = confPassInput.value;

  if (p1.length < 3) {
    resetError.textContent = 'Password too short (min 3 chars)';
    resetError.style.display = 'block';
    return;
  }
  if (p1 !== p2) {
    resetError.textContent = 'Passwords do not match';
    resetError.style.display = 'block';
    return;
  }

  resetError.style.display = 'none';
  resetBtn.disabled = true;
  resetBtn.textContent = 'Updating...';

  window.kunek.send('MEMBER_CHANGE_PASSWORD', { memberId: currentMember.id, newPassword: p1 });
}

function handleResume() {
  if (!currentMember) return;
  resumeBtn.disabled = true;
  resumeBtn.textContent = 'Starting...';
  window.kunek.send('MEMBER_RESUME_SESSION', { member: currentMember });
}

// ─── Video ────────────────────────────────────────────────────────────────────

function loadVideo(videoPath) {
  if (!videoPath) return;
  video.src = videoPath;
  video.addEventListener('canplay', () => video.classList.add('loaded'), { once: true });
  video.addEventListener('error', () => {
    // File not found or unsupported — gradient fallback is already visible
    console.warn('[lock] Video failed to load:', videoPath);
  }, { once: true });
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

window.kunek.on('init', ({ videoPath, stationId, inactivityMs: ms }) => {
  console.log('[lock] IPC init:', { videoPath, stationId, inactivityMs: ms });
  inactivityMs = ms || 30_000;
  loadVideo(videoPath);
  console.log('[lock] Station ID:', stationId);
});

window.kunek.on('enter-idle', () => {
  enterA1();
});

window.kunek.on('warning', ({ minutesRemaining }) => {
  // Reserved: could show a subtle overlay "N minutes remaining" on lock screen
  console.log('[lock] Warning:', minutesRemaining, 'min remaining');
});

// IPC Phase 2
window.kunek.on('LOGIN_RESPONSE', (res) => {
  loginBtn.disabled = false;
  loginBtn.textContent = 'Login';

  if (!res.success) {
    loginError.textContent = res.error || 'Invalid credentials';
    loginError.style.display = 'block';
    return;
  }

  currentMember = res.member;
  if (currentMember.forcePasswordChange) {
    showBlock('reset');
  } else if (currentMember.minutesRemaining > 0) {
    memberNameDisp.textContent = currentMember.fullName || currentMember.username;
    memberBalDisp.textContent = currentMember.minutesRemaining;
    showBlock('resume');
  } else {
    loginError.textContent = 'No remaining balance in your account.';
    loginError.style.display = 'block';
  }
});

window.kunek.on('PASSWORD_CHANGE_RESPONSE', (res) => {
  resetBtn.disabled = false;
  resetBtn.textContent = 'Update & Continue';

  if (!res.success) {
    resetError.textContent = res.error || 'Failed to update password';
    resetError.style.display = 'block';
    return;
  }

  // Reload member state or just proceed to resume if balance exists
  if (currentMember.minutesRemaining > 0) {
    memberNameDisp.textContent = currentMember.fullName || currentMember.username;
    memberBalDisp.textContent = currentMember.minutesRemaining;
    showBlock('resume');
  } else {
    enterA1();
  }
});
