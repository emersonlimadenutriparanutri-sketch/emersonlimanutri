'use strict';

const express = require('express');

const session = require('./../session');
const { asyncHandler } = require('./../http');
const { toChatId } = require('./../numbers');

const router = express.Router();

function limitOf(req, fallback = 50) {
  const parsed = Number.parseInt(req.query.limit, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 500);
}

router.get(
  '/chats',
  asyncHandler(async (req, res) => {
    const client = session.getClient();
    const chats = await client.getAllChats();

    res.json({
      total: chats.length,
      chats: chats.slice(0, limitOf(req)).map((chat) => ({
        id: chat.id,
        name: chat.name || chat.formattedTitle,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        timestamp: chat.t,
      })),
    });
  })
);

router.get(
  '/chats/:chatId/messages',
  asyncHandler(async (req, res) => {
    const client = session.getClient();
    const chatId = toChatId(req.params.chatId);
    const messages = await client.loadAndGetAllMessagesInChat(chatId, true, false);

    res.json({
      chatId,
      total: messages.length,
      messages: messages.slice(-limitOf(req)).map((message) => ({
        id: message.id,
        fromMe: message.fromMe,
        from: message.from,
        type: message.type,
        body: message.body,
        caption: message.caption,
        timestamp: message.timestamp,
      })),
    });
  })
);

router.get(
  '/contacts',
  asyncHandler(async (req, res) => {
    const client = session.getClient();
    const contacts = await client.getAllContacts();

    res.json({
      total: contacts.length,
      contacts: contacts.slice(0, limitOf(req)).map((contact) => ({
        id: contact.id,
        name: contact.name || contact.formattedName,
        pushname: contact.pushname,
        isMyContact: contact.isMyContact,
        isBusiness: contact.isBusiness,
      })),
    });
  })
);

/** Confere se um numero tem WhatsApp e devolve o id correto para envio. */
router.get(
  '/numbers/:number',
  asyncHandler(async (req, res) => {
    const client = session.getClient();
    const chatId = toChatId(req.params.number);
    const check = await client.checkNumberStatus(chatId);

    res.json({
      input: req.params.number,
      chatId: typeof check?.id === 'string' ? check.id : check?.id?._serialized || chatId,
      exists: Boolean(check?.numberExists),
      canReceiveMessage: Boolean(check?.canReceiveMessage),
    });
  })
);

module.exports = router;
