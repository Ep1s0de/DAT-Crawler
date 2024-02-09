const moment = require('moment');
const app = require('../main');
const sessionService = require('../services/sessionService');
const userService = require('../services/userService');
const Session = require('../lib/Session');

module.exports = async (req, res, next) => {
  if (!req.cookies) {
    res.redirect('/sign-in');
    return;
  }

  const sessionToken = req.cookies['session_token'];

  if (!sessionToken) {
    res.redirect('/auth/sign-in');
    return;
  }

  let userSession = app.sessions[sessionToken];

  if (!userSession) {
    const session = await sessionService.getSessionByToken(sessionToken);
    if (session && moment(session.expiration_date).diff(moment()) > 0) {
      const user = await userService.getUserById(session.user_id);
      delete user.password;
      userSession = new Session(user, sessionToken, session.expiration_date);
      app.sessions[sessionToken] = userSession;
    } else {
      res.redirect('/auth/sign-in');
      return;
    }
  }

  if (userSession.isExpired()) {
    delete app.sessions[sessionToken];

    res.clearCookie('session_token');
    res.redirect('/auth/sign-in');
    return;
  }

  req.user = app.sessions[sessionToken].user;

  next();
};
