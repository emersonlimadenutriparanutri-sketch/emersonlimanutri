'use strict';

const { config } = require('./config');
const logger = require('./logger');

/**
 * Fila serial de envios.
 *
 * O WhatsApp bloqueia contas que disparam muitas mensagens em paralelo, entao
 * todo envio passa por aqui: uma mensagem por vez, com um intervalo aleatorio
 * entre elas.
 */
class SendQueue {
  constructor() {
    this.chain = Promise.resolve();
    this.pending = 0;
    this.lastSentAt = 0;
  }

  get size() {
    return this.pending;
  }

  enqueue(label, task) {
    this.pending += 1;

    const result = this.chain.then(async () => {
      await this.#respectDelay();
      logger.debug('Executando envio da fila', { label, pending: this.pending });
      try {
        return await task();
      } finally {
        this.lastSentAt = Date.now();
      }
    });

    // A corrente nunca pode quebrar: erro de um envio nao trava os proximos.
    this.chain = result.then(
      () => undefined,
      () => undefined
    ).finally(() => {
      this.pending -= 1;
    });

    return result;
  }

  async #respectDelay() {
    const { minDelayMs, maxDelayMs } = config.queue;
    if (this.lastSentAt === 0 || maxDelayMs <= 0) return;

    const wanted = minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
    const elapsed = Date.now() - this.lastSentAt;
    const remaining = Math.ceil(wanted - elapsed);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
}

module.exports = new SendQueue();
