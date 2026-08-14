'use strict';

const { config } = require('./config');

/**
 * Converte o que o cliente da API mandou em um chatId do WhatsApp.
 *
 * Aceita: "5511999999999", "+55 (11) 99999-9999", "11999999999",
 * "5511999999999@c.us" e ids de grupo "1203...@g.us".
 */
function toChatId(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new ValidationError('Informe o destinatario em "to".');
  }

  const raw = input.trim();

  if (raw.endsWith('@c.us') || raw.endsWith('@g.us')) {
    return raw;
  }

  // Grupos tambem podem chegar como "1203630...-1600000000".
  if (/^\d+-\d+$/.test(raw)) {
    return `${raw}@g.us`;
  }

  let digits = raw.replace(/\D/g, '');

  if (digits === '') {
    throw new ValidationError(`Destinatario invalido: "${input}"`);
  }

  // Numero discado com 0 na frente (0 11 99999-9999).
  digits = digits.replace(/^0+/, '');

  // Sem codigo do pais: 10 digitos (DDD + 8) ou 11 (DDD + 9).
  if (digits.length === 10 || digits.length === 11) {
    digits = `${config.defaultCountryCode}${digits}`;
  }

  if (digits.length < 10 || digits.length > 15) {
    throw new ValidationError(
      `Destinatario invalido: "${input}". Use o formato internacional, ex: 5511999999999.`
    );
  }

  return `${digits}@c.us`;
}

function isGroup(chatId) {
  return typeof chatId === 'string' && chatId.endsWith('@g.us');
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

module.exports = { toChatId, isGroup, ValidationError };
