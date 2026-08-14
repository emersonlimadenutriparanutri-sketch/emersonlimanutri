'use strict';

const path = require('path');

function str(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value.trim();
}

function int(name, fallback) {
  const value = str(name);
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`A variavel ${name} precisa ser um numero inteiro (recebido: "${value}")`);
  }
  return parsed;
}

function bool(name, fallback) {
  const value = str(name);
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'sim'].includes(value.toLowerCase());
}

const config = {
  port: int('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  logLevel: str('LOG_LEVEL', 'info'),

  // Chave usada no header X-API-Key para falar com esta API.
  apiKey: str('API_KEY'),

  session: {
    id: str('SESSION_ID', 'default'),
    dataPath: path.resolve(str('SESSION_DATA_PATH', './data/sessions')),
    // Chromium do sistema (imagem Docker). Vazio = puppeteer baixa o proprio.
    chromeExecutable: str('CHROME_EXECUTABLE_PATH'),
    // Licenca opcional do OpenWA (necessaria apenas para recursos pagos).
    licenseKey: str('WA_LICENSE_KEY'),
    // Segundos ate desistir de uma autenticacao pendente. 0 = sem limite.
    authTimeoutSec: int('AUTH_TIMEOUT_SEC', 90),
    // Tentativas de reinicio automatico quando a sessao cai.
    maxRestarts: int('SESSION_MAX_RESTARTS', 5),
    restartDelayMs: int('SESSION_RESTART_DELAY_MS', 10000),
  },

  webhook: {
    url: str('WEBHOOK_URL'),
    secret: str('WEBHOOK_SECRET'),
    timeoutMs: int('WEBHOOK_TIMEOUT_MS', 10000),
    maxRetries: int('WEBHOOK_MAX_RETRIES', 3),
    // Eventos enviados ao webhook: message, ack, state, call.
    events: str('WEBHOOK_EVENTS', 'message,ack,state,call')
      .split(',')
      .map((event) => event.trim())
      .filter(Boolean),
    // Ignora mensagens enviadas pelo proprio numero.
    ignoreFromMe: bool('WEBHOOK_IGNORE_FROM_ME', true),
    // Ignora mensagens de grupos.
    ignoreGroups: bool('WEBHOOK_IGNORE_GROUPS', false),
  },

  queue: {
    // Intervalo aleatorio entre envios, para reduzir risco de bloqueio.
    minDelayMs: int('SEND_MIN_DELAY_MS', 1500),
    maxDelayMs: int('SEND_MAX_DELAY_MS', 4000),
    // Digitando... antes de enviar texto.
    simulateTyping: bool('SIMULATE_TYPING', true),
  },

  defaultCountryCode: str('DEFAULT_COUNTRY_CODE', '55'),

  // Consulta o WhatsApp antes de enviar para confirmar que o numero existe e
  // descobrir o id correto (resolve o problema do 9o digito em numeros BR).
  checkNumberBeforeSend: bool('CHECK_NUMBER_BEFORE_SEND', true),
};

function validate() {
  const errors = [];

  if (!config.apiKey) {
    errors.push('API_KEY nao definida. Gere uma chave com: openssl rand -hex 24');
  } else if (config.apiKey.length < 16) {
    errors.push('API_KEY muito curta: use pelo menos 16 caracteres.');
  }

  if (config.webhook.url) {
    try {
      const parsed = new URL(config.webhook.url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push('WEBHOOK_URL precisa usar http:// ou https://');
      }
    } catch {
      errors.push(`WEBHOOK_URL invalida: "${config.webhook.url}"`);
    }
  }

  if (config.queue.minDelayMs > config.queue.maxDelayMs) {
    errors.push('SEND_MIN_DELAY_MS nao pode ser maior que SEND_MAX_DELAY_MS');
  }

  if (errors.length > 0) {
    throw new Error(`Configuracao invalida:\n  - ${errors.join('\n  - ')}`);
  }
}

module.exports = { config, validate };
