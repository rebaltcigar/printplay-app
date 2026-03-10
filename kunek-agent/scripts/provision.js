'use strict';

/**
 * scripts/provision.js — Write C:\ProgramData\KunekAgent\config.json
 *
 * Usage — from downloaded token file (recommended):
 *   node scripts/provision.js --from="C:\Users\You\Downloads\config.json"
 *   node scripts/provision.js --from="C:\Users\You\Downloads\config.json" --videoPath="C:\ProgramData\KunekAgent\bg.mp4"
 *
 * Usage (interactive):
 *   node scripts/provision.js
 *
 * Usage (non-interactive / scripted):
 *   node scripts/provision.js \
 *     --stationId=PC-01 \
 *     --agentEmail=pc01@kunek.internal \
 *     --agentPassword=<token> \
 *     --projectId=kunek-prod \
 *     --apiKey=AIza... \
 *     --authDomain=kunek-prod.firebaseapp.com \
 *     --videoPath="C:\ProgramData\KunekAgent\bg.mp4"
 *
 * The token file (config.json) is downloaded from the Admin console:
 *   Admin → Stations → [station] → Generate Token → Download config.json
 */

const fs   = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_DIR  = 'C:\\ProgramData\\KunekAgent';
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

// ─── Parse --key=value flags from argv ───────────────────────────────────────

function parseArgs() {
  const flags = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
  }
  return flags;
}

// ─── Interactive prompts ──────────────────────────────────────────────────────

function prompt(rl, question, defaultVal) {
  return new Promise((resolve) => {
    const hint = defaultVal ? ` [${defaultVal}]` : '';
    rl.question(`${question}${hint}: `, (answer) => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

async function promptAll(existing) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n── KunekAgent Provisioning ──────────────────────────────');
  console.log('  Config will be written to:', CONFIG_PATH);
  console.log('  (Get agentEmail + agentPassword from Admin → Stations → Generate Token)\n');

  const stationId    = await prompt(rl, 'Station ID (e.g. PC-01)',            existing.stationId);
  const agentEmail   = await prompt(rl, 'Agent email',                         existing.agentEmail);
  const agentPassword = await prompt(rl, 'Agent password',                     existing.agentPassword);
  const projectId    = await prompt(rl, 'Firebase project ID',                 existing.firestoreProjectId);
  const apiKey       = await prompt(rl, 'Firebase API key',                    existing.firebaseApiKey);
  const authDomain   = await prompt(rl, 'Firebase auth domain',                existing.firebaseAuthDomain);
  const videoPath    = await prompt(rl, 'Video background path (optional)',     existing.videoBackgroundPath);

  rl.close();

  return { stationId, agentEmail, agentPassword, projectId, apiKey, authDomain, videoPath };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();

  // ── --from mode: copy a downloaded token file straight into place ─────────
  if (flags.from) {
    if (!fs.existsSync(flags.from)) {
      console.error(`Error: file not found — ${flags.from}`);
      process.exit(1);
    }

    let token;
    try {
      token = JSON.parse(fs.readFileSync(flags.from, 'utf-8'));
    } catch (err) {
      console.error(`Error: could not parse token file — ${err.message}`);
      process.exit(1);
    }

    const required = ['stationId', 'agentEmail', 'agentPassword', 'firestoreProjectId', 'firebaseApiKey'];
    for (const f of required) {
      if (!token[f]) {
        console.error(`Error: token file is missing required field "${f}"`);
        process.exit(1);
      }
    }

    // Allow --videoPath override on top of the token file
    if (flags.videoPath) token.videoBackgroundPath = flags.videoPath;
    token.provisionedAt = new Date().toISOString();

    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(token, null, 2));

    console.log('\nProvisioning complete!');
    console.log('  Station:', token.stationId);
    console.log('  Config:  ', CONFIG_PATH);
    console.log('\nNext steps:');
    console.log('  Install the Windows service: node scripts/install.js');
    console.log('  (or dev mode: set KUNEK_DEV=1 && node service/index.js)');
    return;
  }

  // ── Manual / interactive mode ─────────────────────────────────────────────

  // Load existing config (if any) as defaults
  let existing = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      console.log('Existing config found — values will be used as defaults.');
    } catch { /* ignore parse errors */ }
  }

  let values;

  const hasAllFlags = flags.stationId && flags.agentEmail && flags.agentPassword &&
                      flags.projectId && flags.apiKey && flags.authDomain;

  if (hasAllFlags) {
    // Non-interactive mode
    values = {
      stationId:    flags.stationId,
      agentEmail:   flags.agentEmail,
      agentPassword: flags.agentPassword,
      projectId:    flags.projectId,
      apiKey:       flags.apiKey,
      authDomain:   flags.authDomain,
      videoPath:    flags.videoPath || existing.videoBackgroundPath || '',
    };
  } else {
    values = await promptAll(existing);
  }

  // Validate required fields
  const required = ['stationId', 'agentEmail', 'agentPassword', 'projectId', 'apiKey', 'authDomain'];
  for (const f of required) {
    if (!values[f]) {
      console.error(`\nError: ${f} is required.`);
      process.exit(1);
    }
  }

  const config = {
    stationId:            values.stationId,
    agentEmail:           values.agentEmail,
    agentPassword:        values.agentPassword,
    firestoreProjectId:   values.projectId,
    firebaseApiKey:       values.apiKey,
    firebaseAuthDomain:   values.authDomain,
    videoBackgroundPath:  values.videoPath || '',
    provisionedAt:        new Date().toISOString(),
  };

  // Write config
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  console.log('\nProvisioning complete!');
  console.log('  Station:', config.stationId);
  console.log('  Config:  ', CONFIG_PATH);
  console.log('\nNext steps:');
  console.log('  1. Copy keyboard-helper.exe to C:\\ProgramData\\KunekAgent\\keyboard-helper\\');
  console.log('  2. Copy kunek-launcher.exe to C:\\ProgramData\\KunekAgent\\launcher\\');
  console.log('  3. Install the Windows service: node scripts/install.js');
  console.log('     (or dev mode: set KUNEK_DEV=1 && node service/index.js)');
}

main().catch((err) => {
  console.error('Provision error:', err.message);
  process.exit(1);
});
