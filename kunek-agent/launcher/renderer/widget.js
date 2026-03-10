'use strict';

/**
 * Floating session widget renderer.
 *
 * IPC messages:
 *   session-update  — { session }           — load session details
 *   timer-tick      — prepaid: { secondsRemaining, minutesUsed }
 *                     postpaid: { elapsedSeconds, runningCost }
 *   warning         — { minutesRemaining }   — visual pulse
 *   session-cleared — session ended, reset to idle
 */

// ─── Elements ─────────────────────────────────────────────────────────────────

const pill = document.getElementById('pill');
const timerMain = document.getElementById('timer-main');
const timerLabel = document.getElementById('timer-label');
const customerName = document.getElementById('customer-name');
const secondary = document.getElementById('secondary');
const minimizeBtn = document.getElementById('minimize-btn');

// ─── State ────────────────────────────────────────────────────────────────────

let session = null;
let isPostpaid = false;
let ratePerMinute = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(totalSeconds) {
  if (!isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtCost(amount) {
  return `₱${amount.toFixed(2)}`;
}

function setColor(minutesRemaining) {
  timerMain.className = '';
  if (minutesRemaining <= 5) timerMain.classList.add('color-red');
  else if (minutesRemaining <= 15) timerMain.classList.add('color-yellow');
  else timerMain.classList.add('color-green');
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

window.kunek.on('init', () => {
  // Nothing to init for the widget
});

minimizeBtn.addEventListener('click', () => {
  window.kunek.send('minimize-widget');
});

window.kunek.on('session-update', (s) => {
  session = s;
  isPostpaid = s.openEnded || s.minutesAllotted == null;
  ratePerMinute = s.ratePerMinuteApplied || s.rateSnapshot?.ratePerMinute || 0;

  customerName.textContent = s.customerName || 'Walk-in';

  if (isPostpaid) {
    timerLabel.textContent = 'elapsed';
    secondary.textContent = `${fmtCost(0)} so far`;
    timerMain.textContent = fmtTime(0);
    timerMain.className = '';
  } else {
    timerLabel.textContent = 'remaining';
    const remainingSeconds = Math.max(0, (s.minutesAllotted - (s.minutesUsed || 0)) * 60);
    timerMain.textContent = fmtTime(remainingSeconds);
    setColor(s.minutesAllotted - (s.minutesUsed || 0));
  }
});

window.kunek.on('timer-tick', (data) => {
  if (!session) return;

  if (!isPostpaid) {
    // Prepaid: show remaining time
    const seconds = data.secondsRemaining ?? 0;
    const minutesRemaining = Math.floor(seconds / 60);

    timerMain.textContent = fmtTime(seconds);
    setColor(minutesRemaining);

    if (ratePerMinute > 0) {
      // Show amount remaining (credits)
      const minutesLeft = seconds / 60;
      const creditsLeft = minutesLeft * ratePerMinute;
      secondary.textContent = fmtCost(creditsLeft);
    }
  } else {
    // Postpaid: show elapsed + running cost
    const elapsed = data.elapsedSeconds ?? 0;
    const cost = data.runningCost ?? 0;

    timerMain.textContent = fmtTime(elapsed);
    secondary.textContent = `${fmtCost(cost)} so far`;
  }
});

window.kunek.on('warning', ({ minutesRemaining }) => {
  // Visual pulse on warning thresholds
  pill.style.opacity = '1';
  pill.style.boxShadow = minutesRemaining <= 5
    ? '0 8px 32px rgba(252, 129, 129, 0.4)'
    : '0 8px 32px rgba(246, 224, 94, 0.3)';

  setTimeout(() => {
    pill.style.boxShadow = '';
  }, 3000);
});

window.kunek.on('session-cleared', () => {
  session = null;
  isPostpaid = false;
  ratePerMinute = 0;

  timerMain.textContent = '--:--';
  timerMain.className = '';
  timerLabel.textContent = 'remaining';
  customerName.textContent = 'Walk-in';
  secondary.textContent = '';
  pill.style.boxShadow = '';
});
