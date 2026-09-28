const axios = require('axios');

class Soroush {
  constructor(config) {
    this.config = config;
    this.http = axios.create({ baseURL: config.baseUrl, timeout: 10000, headers: { Authorization: `Bearer ${config.token}` } });
  }
  async sendMessage(chatId, text) {
    const payload = { chat_id: chatId, text };
    const response = await this.http.post(this.config.sendPath, payload);
    return response.data;
  }
}
module.exports = Soroush;
