'use strict';

/**
 * service/watchdog.js — Monitors and restarts the Electron launcher process.
 *
 * Production:  spawns C:\ProgramData\KunekAgent\launcher\kunek-launcher.exe
 * Dev mode:    set env KUNEK_DEV=1 — spawns `electron .` from the launcher dir
 *              so you can edit renderer files without rebuilding the exe.
 *
 * On each Electron exit:
 *  - recordWindowKill() is called (increments tamper counter)
 *  - The launcher is restarted after RELAUNCH_DELAY_MS
 */

const { spawn }           = require('child_process');
const path                = require('path');
const { recordWindowKill } = require('./tamper');
const logger              = require('./logger');

const PROD_LAUNCHER_EXE  = 'C:\\ProgramData\\KunekAgent\\launcher\\KunekLauncher.exe';
const DEV_LAUNCHER_DIR   = path.join(__dirname, '..', 'launcher');
const RELAUNCH_DELAY_MS  = 1000;

let launcherProcess = null;
let _stopping       = false;  // set to true on clean shutdown to suppress tamper

/**
 * Start the Electron launcher (called once from index.js).
 */
function startWatchdog() {
  _stopping = false;
  _launch();
}

/**
 * Signal a clean shutdown — prevents tamper recording on expected exit.
 */
function stopWatchdog() {
  _stopping = true;
  if (launcherProcess) launcherProcess.kill();
}

function _launch() {
  if (_stopping) return;

  let child;

  if (process.env.KUNEK_DEV === '1') {
    // Dev: run electron from the local devDependency binary
    const electronBin = path.join(DEV_LAUNCHER_DIR, 'node_modules', '.bin', 'electron');
    child = spawn(electronBin, ['.'], {
      cwd:   DEV_LAUNCHER_DIR,
      stdio: 'inherit',
      shell: true,           // needed on Windows for PATH resolution
    });
    logger.info(`Watchdog: launched Electron (dev) from ${DEV_LAUNCHER_DIR}`);
  } else {
    // Production: run the built exe
    child = spawn(PROD_LAUNCHER_EXE, [], { stdio: 'inherit' });
    logger.info(`Watchdog: launched ${PROD_LAUNCHER_EXE}`);
  }

  launcherProcess = child;

  child.on('exit', (code, signal) => {
    launcherProcess = null;

    if (_stopping) {
      logger.info('Watchdog: launcher exited cleanly (shutdown)');
      return;
    }

    logger.warn(`Electron exited (code=${code}, signal=${signal}). Relaunching in ${RELAUNCH_DELAY_MS}ms`);
    recordWindowKill();
    setTimeout(_launch, RELAUNCH_DELAY_MS);
  });

  child.on('error', (err) => {
    logger.error(`Watchdog: failed to spawn launcher — ${err.message}`);
    // Retry after a longer delay so we don't spin-loop on a bad path
    setTimeout(_launch, 5000);
  });
}

module.exports = { startWatchdog, stopWatchdog };
