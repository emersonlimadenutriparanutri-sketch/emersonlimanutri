'use strict';

const express = require('express');

const { config } = require('./config');
const logger = require('./logger');
const queue = require('./queue');
const session = require('./session');
const webhook = require('./webhook');
const { requireApiKey, notFound, errorHandler } = require('./http');

function createServer() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '25mb' }));

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.debug('Requisicao concluida', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - startedAt,
      });
    });
    next();
  });

  // Aberto: healthcheck do Docker e monitoramento externo. Responde 200 mesmo
  // com o WhatsApp desconectado — o processo esta vivo e serve o QR Code.
  app.get('/health', (req, res) => {
    const snapshot = session.snapshot();
    res.json({
      status: 'ok',
      session: snapshot.status,
      connected: snapshot.connected,
      queue: queue.size,
      webhook: webhook.enabled,
      uptimeSec: Math.floor(process.uptime()),
    });
  });

  // Para load balancer / alerta: so fica verde com o WhatsApp pareado.
  app.get('/health/ready', (req, res) => {
    const snapshot = session.snapshot();
    res.status(snapshot.connected ? 200 : 503).json({
      status: snapshot.connected ? 'ready' : 'not_ready',
      session: snapshot.status,
    });
  });

  app.use('/api', requireApiKey);
  app.use('/api/session', require('./routes/session'));
  app.use('/api/messages', require('./routes/messages'));
  app.use('/api', require('./routes/chats'));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

function start() {
  const app = createServer();

  return new Promise((resolve) => {
    const server = app.listen(config.port, config.host, () => {
      logger.info('API HTTP no ar', { host: config.host, port: config.port });
      resolve(server);
    });
  });
}

module.exports = { createServer, start };
