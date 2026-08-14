'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel() {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[level] || LEVELS.info;
}

function write(level, message, meta) {
  if (LEVELS[level] < currentLevel()) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };

  if (meta instanceof Error) {
    entry.error = { message: meta.message, stack: meta.stack };
  } else if (meta && typeof meta === 'object') {
    Object.assign(entry, meta);
  } else if (meta !== undefined) {
    entry.detail = meta;
  }

  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

module.exports = {
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
