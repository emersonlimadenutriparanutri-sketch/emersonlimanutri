'use strict';

const crypto = require('crypto');

const { config } = require('./config');
const logger = require('./logger');

const enabled = Boolean(config.webhook.url);

function wants(event) {
  return enabled && config.webhook.events.includes(event);
}

function sign(body) {
  if (!config.webhook.secret) return undefined;
  return crypto.createHmac('sha256', config.webhook.secret).update(body).digest('hex');
}

async function deliver(event, data) {
  if (!wants(event)) return;

  const body = JSON.stringify({
    event,
    sessionId: config.session.id,
    timestamp: new Date().toISOString(),
    data,
  });

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'openwa-service/1.0',
    'X-OpenWA-Event': event,
    'X-OpenWA-Session': config.session.id,
  };

  const signature = sign(body);
  if (signature) headers['X-OpenWA-Signature'] = `sha256=${signature}`;

  for (let attempt = 1; attempt <= config.webhook.maxRetries; attempt += 1) {
    try {
      const response = await fetch(config.webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(config.webhook.timeoutMs),
      });

      if (response.ok) {
        logger.debug('Webhook entregue', { event, attempt, status: response.status });
        return;
      }

      // 4xx (fora 408/429) e erro do destino: repetir nao adianta.
      const retriable = response.status >= 500 || response.status === 408 || response.status === 429;
      logger.warn('Webhook respondeu com erro', { event, attempt, status: response.status, retriable });
      if (!retriable) return;
    } catch (error) {
      logger.warn('Falha ao chamar webhook', { event, attempt, error: error.message });
    }

    if (attempt < config.webhook.maxRetries) {
      const backoff = 1000 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  logger.error('Webhook descartado apos esgotar as tentativas', {
    event,
    retries: config.webhook.maxRetries,
  });
}

/** Dispara sem bloquear o fluxo de quem chamou. */
function emit(event, data) {
  if (!wants(event)) return;
  deliver(event, data).catch((error) => logger.error('Erro inesperado no webhook', error));
}

module.exports = { emit, enabled, wants };
