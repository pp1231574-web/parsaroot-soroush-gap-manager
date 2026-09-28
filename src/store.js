const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class Store {
  constructor(filename) {
    const dir = path.dirname(filename);
    if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
    this.db = new sqlite3.Database(filename);
    this.db.serialize(() => {
      this.db.run(`CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, name TEXT, role TEXT DEFAULT 'member', banned INTEGER DEFAULT 0, muted_until INTEGER DEFAULT 0)`);
      this.db.run(`CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT, user_id TEXT, by_id TEXT, reason TEXT, created_at INTEGER)`);
      this.db.run(`CREATE TABLE IF NOT EXISTS settings (chat_id TEXT PRIMARY KEY, rules TEXT DEFAULT '', warn_limit INTEGER DEFAULT 3, block_links INTEGER DEFAULT 0)`);
      this.db.run(`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT, actor_id TEXT, action TEXT, target_id TEXT, details TEXT, created_at INTEGER)`);
    });
  }
  run(sql, params = []) { return new Promise((resolve, reject) => this.db.run(sql, params, function (e) { e ? reject(e) : resolve(this); })); }
  get(sql, params = []) { return new Promise((resolve, reject) => this.db.get(sql, params, (e, row) => e ? reject(e) : resolve(row))); }
  all(sql, params = []) { return new Promise((resolve, reject) => this.db.all(sql, params, (e, rows) => e ? reject(e) : resolve(rows))); }
  async ensureUser(id, name) { await this.run('INSERT INTO users(user_id,name) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name', [id, name || 'کاربر']); }
  async settings(chatId) { await this.run('INSERT OR IGNORE INTO settings(chat_id) VALUES(?)', [chatId]); return this.get('SELECT * FROM settings WHERE chat_id=?', [chatId]); }
  async event(chatId, actor, action, target, details = '') { return this.run('INSERT INTO events(chat_id,actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,?)', [chatId, actor, action, target || '', details, Date.now()]); }
}
module.exports = Store;
