const app = require('../main');

class UserService {
  constructor() {}

  async createUser(data) {
    return app.mongo
      .collection('users')
      .insertOne({ ...data, date_created: new Date() });
  }

  async getUser(username) {
    return app.mongo.collection('users').findOne({ username });
  }

  async getUserById(id) {
    return app.mongo.collection('users').findOne({ _id: id });
  }
}

module.exports = new UserService();
