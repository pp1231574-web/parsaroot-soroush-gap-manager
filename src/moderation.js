const link = /(?:https?:\/\/|www\.)\S+/i;

function parseCommand(text) {
  if (!text || !text.trim().startsWith('/')) return null;
  const parts = text.trim().slice(1).split(/\s+/);
  return { name: (parts.shift() || '').toLowerCase(), args: parts };
}

class Moderation {
  constructor(store, api, config) {
    this.store = store; this.api = api; this.config = config;
    this.recent = new Map();
  }
  id(message) { return message.from_user_id || message.sender_id || message.user_id; }
  name(message) { return message.from_user_name || message.sender_name || 'کاربر'; }
  chat(message) { return message.chat_id || message.group_id || message.chat?.id; }
  isAdmin(message) {
    const id = String(this.id(message));
    return this.config.ownerIds.has(id) || message.sender_is_admin === true || message.is_admin === true;
  }
  target(args) { return args[0]?.replace(/^[@#]/, ''); }
  async send(chat, text) { try { await this.api.sendMessage(chat, text); } catch (e) { console.error('sendMessage:', e.message); } }
  async process(message) {
    const chat = this.chat(message), user = this.id(message), name = this.name(message), text = String(message.text || '').trim();
    if (!chat || !user) return;
    await this.store.ensureUser(user, name);
    const current = await this.store.get('SELECT * FROM users WHERE user_id=?', [user]);
    if (current?.banned) return;
    if (current?.muted_until > Date.now() && text) return;
    if (!text) return;

    const settings = await this.store.settings(chat);
    const hits = (this.config.bannedWords || []).some(word => word && text.toLowerCase().includes(word.toLowerCase()));
    const violatesLink = settings.block_links && link.test(text);
    if (hits || violatesLink) {
      await this.warn(chat, user, user, hits ? 'کلمه ممنوع' : 'ارسال لینک');
      return;
    }
    if (!text.startsWith('/')) { this.rateLimit(chat, user); return; }
    const command = parseCommand(text); if (!command) return;
    if (command.name === 'help') return this.send(chat, '🤖 پارسا روت\n/help راهنما\n/rules قوانین گپ\n/warn شناسه دلیل\n/warnings شناسه\n/ban شناسه دلیل\n/unban شناسه\n/mute شناسه دقیقه\n/unmute شناسه\n/setrules متن قوانین\n/settings');
    if (command.name === 'rules') return this.send(chat, settings.rules || '📜 هنوز قانونی ثبت نشده است.');
    if (!this.isAdmin(message)) return this.send(chat, '⛔ این دستور فقط برای مدیران گپ است.');
    const target = this.target(command.args);
    if (command.name === 'warn') return this.warn(chat, target, user, command.args.slice(1).join(' ') || 'بدون دلیل');
    if (command.name === 'warnings') { const rows = await this.store.all('SELECT reason,created_at FROM warnings WHERE chat_id=? AND user_id=? ORDER BY id DESC LIMIT 20', [chat, target]); return this.send(chat, `⚠️ تعداد اخطارهای ${target}: ${rows.length}\n${rows.map((r, i) => `${i + 1}. ${r.reason}`).join('\n') || 'ندارد'}`); }
    if (command.name === 'ban' && target) { await this.store.run('UPDATE users SET banned=1 WHERE user_id=?', [target]); await this.store.event(chat, user, 'ban', target, command.args.slice(1).join(' ')); return this.send(chat, `⛔ کاربر ${target} مسدود شد.`); }
    if (command.name === 'unban' && target) { await this.store.run('UPDATE users SET banned=0 WHERE user_id=?', [target]); return this.send(chat, `✅ مسدودی ${target} برداشته شد.`); }
    if (command.name === 'mute' && target) { const minutes = Math.max(1, Number(command.args[1]) || 10); await this.store.run('UPDATE users SET muted_until=? WHERE user_id=?', [Date.now() + minutes * 60000, target]); await this.store.event(chat, user, 'mute', target, `${minutes} دقیقه`); return this.send(chat, `🔇 کاربر ${target} برای ${minutes} دقیقه ساکت شد.`); }
    if (command.name === 'unmute' && target) { await this.store.run('UPDATE users SET muted_until=0 WHERE user_id=?', [target]); return this.send(chat, `🔊 سکوت ${target} برداشته شد.`); }
    if (command.name === 'setrules') { const rules = command.args.join(' '); await this.store.run('UPDATE settings SET rules=? WHERE chat_id=?', [rules, chat]); return this.send(chat, '✅ قوانین گپ ذخیره شد.'); }
    if (command.name === 'settings') return this.send(chat, `⚙️ سقف اخطار: ${settings.warn_limit}\nفیلتر لینک: ${settings.block_links ? 'فعال' : 'خاموش'}`);
  }
  async warn(chat, target, actor, reason) {
    if (!target) return this.send(chat, 'نحوه استفاده: /warn شناسه کاربر دلیل');
    const settings = await this.store.settings(chat);
    await this.store.ensureUser(target, target);
    await this.store.run('INSERT INTO warnings(chat_id,user_id,by_id,reason,created_at) VALUES(?,?,?,?,?)', [chat, target, actor, reason, Date.now()]);
    const count = (await this.store.get('SELECT COUNT(*) AS n FROM warnings WHERE chat_id=? AND user_id=?', [chat, target])).n;
    await this.store.event(chat, actor, 'warn', target, reason);
    if (count >= settings.warn_limit) { await this.store.run('UPDATE users SET banned=1 WHERE user_id=?', [target]); return this.send(chat, `⛔ ${target} به ${count} اخطار رسید و مسدود شد.`); }
    return this.send(chat, `⚠️ ${target} اخطار گرفت (${count}/${settings.warn_limit})\nدلیل: ${reason}`);
  }
  rateLimit(chat, user) { const key = `${chat}:${user}`, now = Date.now(), list = (this.recent.get(key) || []).filter(x => now - x < this.config.floodWindow); list.push(now); this.recent.set(key, list); if (list.length > this.config.floodLimit) this.store.run('UPDATE users SET muted_until=? WHERE user_id=?', [now + 60000, user]).catch(console.error); }
}
module.exports = Moderation;
