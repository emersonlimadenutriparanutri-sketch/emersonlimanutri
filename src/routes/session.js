'use strict';

const express = require('express');

const session = require('./../session');
const { asyncHandler } = require('./../http');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(session.snapshot());
});

/**
 * QR Code da sessao.
 *
 * ?format=png devolve a imagem (da para abrir direto no navegador);
 * ?format=ascii devolve o QR em texto, util pelo terminal via curl.
 */
router.get('/qr', (req, res) => {
  const current = session.qr();
  const snapshot = session.snapshot();

  if (!current.qr) {
    res.status(409).json({
      error: {
        code: 'qr_unavailable',
        message:
          snapshot.status === 'connected'
            ? 'A sessao ja esta conectada; nao ha QR Code pendente.'
            : `Nenhum QR Code disponivel no momento (status: ${snapshot.status}).`,
      },
      session: snapshot,
    });
    return;
  }

  const format = String(req.query.format || 'json').toLowerCase();

  if (format === 'png') {
    const base64 = current.qr.slice(current.qr.indexOf(',') + 1);
    const buffer = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
    return;
  }

  if (format === 'ascii') {
    res.type('text/plain').send(current.ascii || '');
    return;
  }

  res.json(current);
});

router.post(
  '/restart',
  asyncHandler(async (req, res) => {
    // Nao esperamos o create() terminar: ele pode levar minutos ate o QR sair.
    session.restart().catch(() => undefined);
    res.status(202).json({ status: 'restarting' });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await session.logout();
    res.json({ status: 'logged_out' });
  })
);

module.exports = router;
