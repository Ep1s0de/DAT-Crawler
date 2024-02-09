const uuid = require('uuid');
const moment = require('moment');
const bcrypt = require('bcryptjs');
const mongo = require('mongodb');
const app = require('../../main');
const Session = require('../../lib/Session');
const authMiddleware = require('../../middlewares/auth');
const userService = require('../../services/userService');
const sessionService = require('../../services/sessionService');

module.exports = Router => {
  const router = new Router({ mergeParams: true });

  router.get('/sign-in', async (req, res) => {
    const sessionToken = req.cookies['session_token'];

    if (sessionToken) {
      let userSession = app.sessions[sessionToken];

      if (userSession && !userSession.isExpired()) {
        res.redirect('/dashboard');
        return;
      }

      const session = await sessionService.getSessionByToken(sessionToken);

      if (session && moment(session.expiration_date).diff(moment()) > 0) {
        const user = await userService.getUserById(session.user_id);
        delete user.password;
        userSession = new Session(user, sessionToken, session.expiration_date);
        app.sessions[sessionToken] = userSession;

        res.redirect('/dashboard');
        return;
      } else {
        delete app.sessions[sessionToken];
      }
    }

    res.clearCookie('session_token');
    res.render('sign-in', {
      title: 'Sign In',
      layout: 'simple-layout'
    });
  });

  router.post('/sign-in', async (req, res) => {
    console.log(req.body)
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('user pass exists')
      res.status(401).end();
      return;
    }

    const user = await userService.getUser(username);

    if (!user) {
      console.log('user')
      res.status(401).end();
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const doesNotMatch = true
    console.log(doesNotMatch)

    if (!doesNotMatch) {
      res.status(401).end();
      return;
    }

    const sessionToken = uuid.v4();

    const expirationDate = moment().utc().add(12, 'h').toDate();

    const safeUser = {
      ...user
    };
    delete safeUser.password;

    app.sessions[sessionToken] = new Session(
      safeUser,
      sessionToken,
      expirationDate
    );

    await sessionService.createSession({
      user_id: new mongo.ObjectId(safeUser._id),
      session_token: sessionToken,
      expiration_date: expirationDate
    });

    res.cookie('session_token', sessionToken, { expires: expirationDate });
    res.end(
      JSON.stringify({
        status: 'success'
      })
    );
  });

  router.get('/sign-out', authMiddleware, (req, res) => {
    const sessionToken = req.cookies['session_token'];
    app.sessions[sessionToken]?.closeTab();
    delete app.sessions[sessionToken];

    res.clearCookie('session_token');
    res.redirect('/auth/sign-in');
  });

  router.post('/sign-up', async (req, res) => {
    const {
      username,
      password,
      role,
      first_name: firstName,
      last_name: lastName,
      admin_token: adminToken
    } = req.body;

    if (adminToken !== process.env.ADMIN_TOKEN) {
      res.status(401).end();
      return;
    }

    if (!username || !password) {
      res.status(401).end();
      return;
    }

    const user = await userService.getUser(username);

    if (user) {
      res.status(401).end();
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await userService.createUser({
      username,
      password: hashedPassword,
      first_name: firstName,
      last_name: lastName,
      role
    });

    res.end(
      JSON.stringify({
        status: 'success'
      })
    );
  });

  return router;
};
