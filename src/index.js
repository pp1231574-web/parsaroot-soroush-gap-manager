require('dotenv').config();
const express = require('express');
const Store = require('./store');
const Soroush = require('./soroush');
const Moderation = require('./moderation');

const config = {
  port: Number(process.env.PORT || 3000),
  webhookSecret: process.env.WEBHOOK_SECRET || 'change-me',
  ownerIds: new Set((process.env.OWNER_IDS || '').split(',').map(x => x.trim()).filter(Boolean)),
  bannedWords: (process.env.BANNED_WORDS || '').split(',').map(x => x.trim()).filter(Boolean),
  floodLimit: Number(process.env.FLOOD_LIMIT || 6),
  floodWindow: Number(process.env.FLOOD_WINDOW_SECONDS || 10) * 1000
};
const store = new Store(process.env.DB_PATH || './data/parsaroot.sqlite');
const api = new Soroush({ baseUrl: process.env.SOROUSH_API_BASE, token: process.env.BOT_TOKEN, sendPath: process.env.SOROUSH_SEND_PATH || '/sendMessage' });
const moderation = new Moderation(store, api, config);
const app = express(); app.use(express.json({ limit: '256kb' }));
app.get('/health', (_req, res) => res.json({ ok: true, name: 'پارسا روت' }));
app.post(`/webhook/${config.webhookSecret}`, async (req, res) => { res.json({ ok: true }); try { await moderation.process(req.body.message || req.body); } catch (e) { console.error('webhook:', e); } });
app.listen(config.port, () => console.log(`پارسا روت روی پورت ${config.port} اجرا شد`));
