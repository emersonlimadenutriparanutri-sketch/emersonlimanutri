'use strict';

const crypto = require('crypto');

const { config } = require('./config');
const logger = require('./logger');

/** Envolve handlers async para que rejeicoes cheguem no error handler do Express. */
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function requireApiKey(req, res, next) {
  const header = req.get('X-API-Key') || '';
  const bearer = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const provided = header || bearer;

  if (!provided || !safeEqual(provided, config.apiKey)) {
    logger.warn('Requisicao sem credencial valida', { path: req.path, ip: req.ip });
    res.status(401).json({ error: { code: 'unauthorized', message: 'Chave de API invalida ou ausente.' } });
    return;
  }

  next();
}

function notFound(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `Rota ${req.method} ${req.path} nao existe.` } });
}

// eslint-disable-next-line no-unused-vars -- o Express so reconhece o error handler com 4 argumentos
function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const code = status === 500 ? 'internal_error' : error.name || 'error';

  if (status >= 500) {
    logger.error('Erro ao processar requisicao', { path: req.path, error: error.message, stack: error.stack });
  } else {
    logger.warn('Requisicao rejeitada', { path: req.path, status, error: error.message });
  }

  res.status(status).json({
    error: {
      code,
      message: status === 500 ? 'Erro interno ao processar a requisicao.' : error.message,
    },
  });
}

module.exports = { asyncHandler, requireApiKey, notFound, errorHandler };
