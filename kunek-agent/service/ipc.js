'use strict';

/**
 * service/ipc.js — Named-pipe IPC server.
 *
 * The Electron launcher (client) connects here.
 * All messages are newline-delimited JSON: { type, payload }\n
 *
 * On new connection the service immediately re-sends the current LOCK state
 * so the launcher is always in sync even if it connected after boot.
 */

const net = require('net');
const logger = require('./logger');
const { authenticateMember, updateMemberPassword } = require('./member');
const { startMemberSession } = require('./firestore');
const { getConfig } = require('./config');

const IPC_PIPE_NAME = '\\\\.\\pipe\\KunekAgent';

const messageTypes = {
  LOCK: 'LOCK',
  UNLOCK: 'UNLOCK',
  SESSION_UPDATE: 'SESSION_UPDATE',
  TIMER_TICK: 'TIMER_TICK',
  WARNING: 'WARNING',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  LOGIN_RESPONSE: 'LOGIN_RESPONSE',
  PASSWORD_CHANGE_RESPONSE: 'PASSWORD_CHANGE_RESPONSE',
};

let server = null;
let clients = [];

// Track the last known lock state so new connections get an immediate sync
let _lastLockState = messageTypes.LOCK;

function startIPCServer() {
  server = net.createServer((socket) => {
    clients.push(socket);
    logger.info('IPC client connected');

    // Send current lock/unlock state immediately so the window syncs on connect
    _write(socket, _lastLockState, {});

    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const raw = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (raw) {
          try {
            const msg = JSON.parse(raw);
            logger.debug(`IPC ← ${msg.type}`);

            if (msg.type === 'MEMBER_LOGIN') {
              const { username, password } = msg.payload || {};
              authenticateMember(username, password).then(res => {
                _write(socket, messageTypes.LOGIN_RESPONSE, res);
              });
            } else if (msg.type === 'MEMBER_CHANGE_PASSWORD') {
              const { memberId, newPassword } = msg.payload || {};
              updateMemberPassword(memberId, newPassword).then(res => {
                _write(socket, messageTypes.PASSWORD_CHANGE_RESPONSE, res);
              });
            } else if (msg.type === 'MEMBER_RESUME_SESSION') {
              const { member } = msg.payload || {};
              const { stationId } = getConfig();
              startMemberSession(stationId, member).catch(err => {
                logger.error(`Failed to resume member session: ${err.message}`);
              });
            }
          } catch (err) {
            logger.error(`IPC parse/handle error: ${err.message}`);
          }
        }
      }
    });

    socket.on('end', () => {
      clients = clients.filter((c) => c !== socket);
      logger.info('IPC client disconnected');
    });

    socket.on('error', (err) => {
      clients = clients.filter((c) => c !== socket);
      logger.warn(`IPC socket error: ${err.message}`);
    });
  });

  server.listen(IPC_PIPE_NAME, () => {
    logger.info(`IPC pipe server listening at ${IPC_PIPE_NAME}`);
  });

  server.on('error', (err) => {
    logger.error(`IPC server error: ${err.message}`);
  });
}

function _write(socket, type, payload) {
  try {
    socket.write(JSON.stringify({ type, payload }) + '\n');
  } catch { /* socket may have closed */ }
}

/**
 * Broadcast a message to all connected Electron windows.
 */
function sendMessage(type, payload) {
  // Track last lock/unlock for new-connection sync
  if (type === messageTypes.LOCK || type === messageTypes.UNLOCK) {
    _lastLockState = type;
  }

  logger.debug(`IPC → ${type}`);

  for (const client of clients) {
    _write(client, type, payload);
  }
}

module.exports = { startIPCServer, sendMessage, messageTypes };
