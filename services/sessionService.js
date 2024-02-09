const app = require('../main');

class SessionService {
  constructor() {}

  async createSession(data) {
    return app.mongo.collection('sessions').insertOne(data);
  }

  async getSessionByToken(sessionToken) {
    return app.mongo
      .collection('sessions')
      .findOne({ session_token: sessionToken });
  }
}

module.exports = new SessionService();
