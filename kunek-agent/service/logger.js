'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = 'C:\\ProgramData\\KunekAgent\\logs';
// LOG_FILE is now calculated dynamically in write()

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function write(level, message) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const logFile = path.join(LOG_DIR, `agent-${dateStr}.log`);
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  process.stdout.write(line); // node-windows captures stdout to its own log files
  try {
    ensureLogDir();
    fs.appendFileSync(logFile, line);
  } catch {
    // ignore write errors (e.g., during shutdown)
  }
}

module.exports = {
  info: (msg) => write('INFO ', msg),
  warn: (msg) => write('WARN ', msg),
  error: (msg) => write('ERROR', msg),
  debug: (msg) => { if (process.env.KUNEK_DEBUG) write('DEBUG', msg); },
};
