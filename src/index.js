'use strict';

const { config, validate } = require('./config');
const logger = require('./logger');
const server = require('./server');
const session = require('./session');

async function main() {
  validate();

  logger.info('Subindo o servico OpenWA', {
    sessionId: config.session.id,
    sessionDataPath: config.session.dataPath,
    webhook: config.webhook.url ? 'configurado' : 'desativado',
  });

  // A API sobe primeiro para que /api/session/qr ja responda enquanto o
  // WhatsApp ainda esta abrindo o navegador.
  const httpServer = await server.start();

  session.start().catch((error) => {
    logger.error('Sessao do WhatsApp nao iniciou na primeira tentativa', error);
  });

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;

    logger.info('Encerrando o servico', { signal });
    session.markShuttingDown();

    const timer = setTimeout(() => {
      logger.warn('Encerramento demorou demais; finalizando a forca');
      process.exit(1);
    }, 20000);
    timer.unref();

    await new Promise((resolve) => httpServer.close(resolve));
    await session.stop();

    logger.info('Servico encerrado');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Promise rejeitada sem tratamento', reason instanceof Error ? reason : { reason });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Excecao nao capturada', error);
    shutdown('uncaughtException');
  });
}

main().catch((error) => {
  logger.error('Falha fatal na inicializacao', error);
  process.exit(1);
});
