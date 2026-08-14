'use strict';

const express = require('express');

const { config } = require('./../config');
const logger = require('./../logger');
const media = require('./../media');
const queue = require('./../queue');
const session = require('./../session');
const { asyncHandler } = require('./../http');
const { toChatId, isGroup, ValidationError } = require('./../numbers');

const router = express.Router();

/**
 * Descobre o chatId real do destinatario.
 *
 * Numeros brasileiros antigos existem no WhatsApp sem o 9 na frente; o proprio
 * WhatsApp sabe qual e o id correto, entao perguntamos antes de enviar.
 */
async function resolveRecipient(client, to) {
  const chatId = toChatId(to);

  if (isGroup(chatId) || !config.checkNumberBeforeSend) return chatId;

  let check;
  try {
    check = await client.checkNumberStatus(chatId);
  } catch (error) {
    logger.warn('Nao consegui validar o numero; seguindo com o id calculado', {
      chatId,
      error: error.message,
    });
    return chatId;
  }

  if (!check || check.numberExists === false || check.canReceiveMessage === false) {
    throw new ValidationError(`O numero ${to} nao tem WhatsApp ativo.`);
  }

  const resolved = typeof check.id === 'string' ? check.id : check.id?._serialized;
  return resolved || chatId;
}

function requireString(body, field) {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`O campo "${field}" e obrigatorio.`);
  }
  return value;
}

function sent(res, id, chatId, extra = {}) {
  res.status(202).json({ status: 'sent', id, to: chatId, ...extra });
}

router.post(
  '/text',
  asyncHandler(async (req, res) => {
    const client = session.getClient();
    const message = requireString(req.body, 'message');
    const chatId = await resolveRecipient(client, req.body.to);

    const id = await queue.enqueue(`text:${chatId}`, async () => {
      if (config.queue.simulateTyping) {
        await client.simulateTyping(chatId, true).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, Math.min(3000, message.length * 30)));
        await client.simulateTyping(chatId, false).catch(() => undefined);
      }

      if (req.body.quotedMsgId) {
        return client.reply(chatId, message, req.body.quotedMsgId);
      }
      return client.sendText(chatId, message);
    });

    sent(res, id, chatId);
  })
);

router.post(
  '/image',
  asyncHandler(async (req, res) => {
    const client = session.getClient();
    const chatId = await resolveRecipient(client, req.body.to);
    const file = await media.resolve(req.body);

    const id = await queue.enqueue(`image:${chatId}`, () =>
      client.sendImage(chatId, file.dataUrl, req.body.filename || file.filename, req.body.caption || '')
    );

    sent(res, id, chatId, { bytes: file.bytes, mimetype: file.mimetype });
  })
);

router.post(
  '/file',
  asyncHandler(async (req, res) => {
    const client = session.getClient();
    const chatId = await resolveRecipient(client, req.body.to);
    const file = await media.resolve(req.body);

    const id = await queue.enqueue(`file:${chatId}`, () =>
      client.sendFile(chatId, file.dataUrl, req.body.filename || file.filename, req.body.caption || '')
    );

    sent(res, id, chatId, { bytes: file.bytes, mimetype: file.mimetype });
  })
);

router.post(
  '/audio',
  asyncHandler(async (req, res) => {
    const client = session.getClient();
    const chatId = await resolveRecipient(client, req.body.to);
    const file = await media.resolve(req.body);

    // O WhatsApp so trata como audio de voz o que chega em ogg/opus; outros
    // formatos viram anexo de audio comum.
    const id = await queue.enqueue(`audio:${chatId}`, () => client.sendPtt(chatId, file.dataUrl));

    sent(res, id, chatId, { bytes: file.bytes, mimetype: file.mimetype });
  })
);

router.post(
  '/location',
  asyncHandler(async (req, res) => {
    const client = session.getClient();
    const chatId = await resolveRecipient(client, req.body.to);
    const { lat, lng } = req.body;

    if (lat === undefined || lng === undefined) {
      throw new ValidationError('Informe "lat" e "lng".');
    }

    const id = await queue.enqueue(`location:${chatId}`, () =>
      client.sendLocation(chatId, String(lat), String(lng), req.body.address || '')
    );

    sent(res, id, chatId);
  })
);

router.post(
  '/seen',
  asyncHandler(async (req, res) => {
    const client = session.getClient();
    const chatId = toChatId(req.body.to);
    await client.sendSeen(chatId);
    res.json({ status: 'ok', to: chatId });
  })
);

router.post(
  '/typing',
  asyncHandler(async (req, res) => {
    const client = session.getClient();
    const chatId = toChatId(req.body.to);
    const on = req.body.on !== false;
    await client.simulateTyping(chatId, on);
    res.json({ status: 'ok', to: chatId, typing: on });
  })
);

module.exports = router;
