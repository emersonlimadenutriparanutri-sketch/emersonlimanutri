'use strict';

const fs = require('fs');

const { create } = require('@open-wa/wa-automate');

const { config } = require('./config');
const logger = require('./logger');
const webhook = require('./webhook');

class SessionNotReadyError extends Error {
  constructor(status) {
    super(
      status === 'qr'
        ? 'Sessao aguardando leitura do QR Code. Acesse GET /api/session/qr.'
        : `Sessao do WhatsApp indisponivel (status: ${status}).`
    );
    this.name = 'SessionNotReadyError';
    this.status = 503;
  }
}

const state = {
  status: 'stopped', // stopped | starting | qr | connected | disconnected | error
  qr: null, // data URI (image/png) do QR atual
  qrAscii: null,
  qrAttempts: 0,
  qrUpdatedAt: null,
  connectedAt: null,
  lastStateChange: null,
  lastError: null,
  me: null,
  restarts: 0,
};

let client = null;
let starting = null;
let shuttingDown = false;

function setStatus(next, extra = {}) {
  if (state.status !== next) {
    logger.info('Status da sessao mudou', { from: state.status, to: next, ...extra });
  }
  state.status = next;
  state.lastStateChange = new Date().toISOString();
  webhook.emit('state', { status: next, ...extra });
}

function launchOptions() {
  fs.mkdirSync(config.session.dataPath, { recursive: true });

  const options = {
    sessionId: config.session.id,
    sessionDataPath: config.session.dataPath,
    multiDevice: true,
    headless: true,
    qrTimeout: 0, // nunca desiste de esperar a leitura do QR
    authTimeout: config.session.authTimeoutSec,
    autoRefresh: true,
    cacheEnabled: false,
    blockCrashLogs: true,
    disableSpins: true,
    logConsole: false,
    popup: false,
    killProcessOnBrowserClose: true,
    throwErrorOnTosBlock: false,
    qrLogSkip: true,
    chromiumArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--aggressive-cache-discard',
    ],
    catchQR: (base64Qr, asciiQR, attempt) => {
      state.qr = base64Qr;
      state.qrAscii = asciiQR;
      state.qrAttempts = attempt;
      state.qrUpdatedAt = new Date().toISOString();
      setStatus('qr', { attempt });
      logger.info('Novo QR Code disponivel em GET /api/session/qr', { attempt });
    },
    statusFind: (statusFind) => {
      logger.info('Evento statusFind do OpenWA', { statusFind });
      if (['desconnectedMobile', 'deviceNotConnected', 'autocloseCalled'].includes(statusFind)) {
        setStatus('disconnected', { reason: statusFind });
        scheduleRestart(statusFind);
      }
    },
  };

  if (config.session.chromeExecutable) {
    options.executablePath = config.session.chromeExecutable;
    options.useChrome = true;
  }

  if (config.session.licenseKey) {
    options.licenseKey = config.session.licenseKey;
  }

  return options;
}

function registerListeners(waClient) {
  waClient.onMessage(async (message) => {
    logger.debug('Mensagem recebida', { from: message.from, type: message.type });

    if (config.webhook.ignoreFromMe && message.fromMe) return;
    if (config.webhook.ignoreGroups && message.isGroupMsg) return;

    webhook.emit('message', {
      id: message.id,
      chatId: message.chatId,
      from: message.from,
      to: message.to,
      author: message.author,
      fromMe: message.fromMe,
      isGroupMsg: message.isGroupMsg,
      type: message.type,
      mimetype: message.mimetype,
      body: message.body,
      caption: message.caption,
      timestamp: message.timestamp,
      quotedMsgId: message.quotedMsgObj ? message.quotedMsgObj.id : undefined,
      sender: message.sender
        ? {
            id: message.sender.id,
            pushname: message.sender.pushname,
            formattedName: message.sender.formattedName,
            isMyContact: message.sender.isMyContact,
          }
        : undefined,
    });
  });

  waClient.onAck((ack) => {
    webhook.emit('ack', { id: ack.id, to: ack.to, ack: ack.ack });
  });

  waClient.onIncomingCall((call) => {
    webhook.emit('call', { id: call.id, peerJid: call.peerJid, isVideo: call.isVideo });
  });

  waClient.onStateChanged((waState) => {
    logger.info('Estado do WhatsApp Web mudou', { waState });

    if (waState === 'CONNECTED') {
      setStatus('connected', { waState });
      return;
    }

    if (['CONFLICT', 'UNLAUNCHED', 'UNPAIRED', 'UNPAIRED_IDLE'].includes(waState)) {
      // CONFLICT = WhatsApp Web aberto em outro lugar. Reassume a sessao.
      if (waState === 'CONFLICT') {
        waClient.forceRefocus().catch(() => undefined);
        return;
      }
      setStatus('disconnected', { waState });
      scheduleRestart(waState);
    }
  });
}

function scheduleRestart(reason) {
  if (shuttingDown) return;

  if (state.restarts >= config.session.maxRestarts) {
    logger.error('Limite de reinicios da sessao atingido; intervencao manual necessaria', {
      reason,
      restarts: state.restarts,
    });
    setStatus('error', { reason: 'max_restarts_reached' });
    return;
  }

  state.restarts += 1;
  const delay = config.session.restartDelayMs;
  logger.warn('Reiniciando a sessao', { reason, attempt: state.restarts, delayMs: delay });

  setTimeout(() => {
    restart().catch((error) => logger.error('Falha ao reiniciar a sessao', error));
  }, delay);
}

async function start() {
  if (client) return client;
  if (starting) return starting;

  setStatus('starting');
  state.lastError = null;

  starting = (async () => {
    try {
      const waClient = await create(launchOptions());
      client = waClient;
      registerListeners(waClient);

      state.qr = null;
      state.qrAscii = null;
      state.connectedAt = new Date().toISOString();
      state.restarts = 0;
      setStatus('connected');

      try {
        const me = await waClient.getMe();
        const hostNumber = await waClient.getHostNumber();
        state.me = { number: hostNumber, pushname: me?.pushname ?? me?.me?.user ?? null };
        logger.info('WhatsApp conectado', state.me);
      } catch (error) {
        logger.warn('Nao foi possivel ler os dados do numero conectado', error);
      }

      return waClient;
    } catch (error) {
      state.lastError = { message: error.message, at: new Date().toISOString() };
      setStatus('error', { reason: error.message });
      logger.error('Falha ao iniciar a sessao do WhatsApp', error);
      scheduleRestart('start_failed');
      throw error;
    } finally {
      starting = null;
    }
  })();

  return starting;
}

async function stop() {
  const current = client;
  client = null;
  if (!current) return;

  try {
    await current.kill();
  } catch (error) {
    logger.warn('Erro ao encerrar o navegador da sessao', error);
  }
}

async function restart() {
  await stop();
  return start();
}

async function logout() {
  const current = getClient();
  await current.logout();
  await stop();
  setStatus('disconnected', { reason: 'logout' });
}

function getClient() {
  if (!client || state.status !== 'connected') {
    throw new SessionNotReadyError(state.status);
  }
  return client;
}

function snapshot() {
  return {
    sessionId: config.session.id,
    status: state.status,
    connected: state.status === 'connected',
    me: state.me,
    connectedAt: state.connectedAt,
    lastStateChange: state.lastStateChange,
    qrAvailable: Boolean(state.qr),
    qrUpdatedAt: state.qrUpdatedAt,
    qrAttempts: state.qrAttempts,
    restarts: state.restarts,
    lastError: state.lastError,
  };
}

function qr() {
  return { qr: state.qr, ascii: state.qrAscii, updatedAt: state.qrUpdatedAt, attempts: state.qrAttempts };
}

function markShuttingDown() {
  shuttingDown = true;
}

module.exports = {
  start,
  stop,
  restart,
  logout,
  getClient,
  snapshot,
  qr,
  markShuttingDown,
  SessionNotReadyError,
};
