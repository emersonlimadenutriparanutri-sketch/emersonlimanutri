'use strict';

const { ValidationError } = require('./numbers');

const MAX_MEDIA_BYTES = Number.parseInt(process.env.MAX_MEDIA_MB || '16', 10) * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = Number.parseInt(process.env.MEDIA_DOWNLOAD_TIMEOUT_MS || '30000', 10);

const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
};

function filenameFromUrl(url, mimetype) {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (last && last.includes('.')) return last;
  } catch {
    // url invalida cai no nome generico
  }
  const ext = EXTENSION_BY_MIME[mimetype] || 'bin';
  return `arquivo.${ext}`;
}

async function fromUrl(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (error) {
    throw new ValidationError(`Nao consegui baixar a midia de "${url}": ${error.message}`);
  }

  if (!response.ok) {
    throw new ValidationError(`Download da midia falhou (HTTP ${response.status}) em "${url}".`);
  }

  const declared = Number.parseInt(response.headers.get('content-length') || '0', 10);
  if (declared > MAX_MEDIA_BYTES) {
    throw new ValidationError(`Midia maior que o limite de ${MAX_MEDIA_BYTES / 1024 / 1024} MB.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_MEDIA_BYTES) {
    throw new ValidationError(`Midia maior que o limite de ${MAX_MEDIA_BYTES / 1024 / 1024} MB.`);
  }

  const mimetype = (response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();

  return {
    dataUrl: `data:${mimetype};base64,${buffer.toString('base64')}`,
    mimetype,
    filename: filenameFromUrl(url, mimetype),
    bytes: buffer.byteLength,
  };
}

function fromBase64(base64, mimetypeHint) {
  const value = String(base64).trim();

  if (value.startsWith('data:')) {
    const mimetype = value.slice(5, value.indexOf(';'));
    const payload = value.slice(value.indexOf(',') + 1);
    const bytes = Math.floor((payload.length * 3) / 4);
    if (bytes > MAX_MEDIA_BYTES) {
      throw new ValidationError(`Midia maior que o limite de ${MAX_MEDIA_BYTES / 1024 / 1024} MB.`);
    }
    return { dataUrl: value, mimetype, filename: `arquivo.${EXTENSION_BY_MIME[mimetype] || 'bin'}`, bytes };
  }

  if (!mimetypeHint) {
    throw new ValidationError(
      'Base64 sem prefixo data:. Envie "data:image/jpeg;base64,..." ou informe "mimetype".'
    );
  }

  const bytes = Math.floor((value.length * 3) / 4);
  if (bytes > MAX_MEDIA_BYTES) {
    throw new ValidationError(`Midia maior que o limite de ${MAX_MEDIA_BYTES / 1024 / 1024} MB.`);
  }

  return {
    dataUrl: `data:${mimetypeHint};base64,${value}`,
    mimetype: mimetypeHint,
    filename: `arquivo.${EXTENSION_BY_MIME[mimetypeHint] || 'bin'}`,
    bytes,
  };
}

/** Resolve o corpo da requisicao (url ou base64) em um data URI pronto para o OpenWA. */
async function resolve(body) {
  if (body.url) return fromUrl(body.url);
  if (body.base64) return fromBase64(body.base64, body.mimetype);
  throw new ValidationError('Envie "url" ou "base64" com a midia.');
}

module.exports = { resolve, MAX_MEDIA_BYTES };
