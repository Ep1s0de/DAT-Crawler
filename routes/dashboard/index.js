const Joi = require('joi');
const app = require('../../main');
const authMiddleware = require('../../middlewares/auth');

module.exports = Router => {
  const router = new Router({ mergeParams: true });

  router.get('/', authMiddleware, (req, res) => {
    res.render('dashboard', {
      title: 'Dashboard',
      fistName: req.user.first_name,
      lastName: req.user.last_name,
      role: req.user.role,
      hasOpenTab: app.sessions[req.cookies['session_token']]?.getTab(),
      isIdle: app.sessions[req.cookies['session_token']]?.getIsIdle(),
      lastFilter: app.sessions[req.cookies['session_token']]?.getLastFilter(),
      moment: require('moment')
    });
  });

  router.post('/sessions/new', authMiddleware, async (req, res) => {
    const sessionToken = req.cookies['session_token'];

    const schema = Joi.object().keys({
      pickup_from_date: Joi.date().allow(null, ''),
      pickup_to_date: Joi.date().allow(null, ''),
      origin: Joi.string().required(),
      destination: Joi.string(),
      max_weight: Joi.number(),
      min_rpl: Joi.number(),
      min_rpm: Joi.number(),
      min_amount: Joi.number().required(),
      truck_types: Joi.array().items(Joi.string()),
    });

    const { error } = schema.validate(req.body);

    if (error) {
      res.status(400).end(JSON.stringify(error));
      return;
    }

    await app.browser.initHistory(sessionToken);
    const crawler = await app.browser.initCrawler(
      sessionToken,
      req.body,
      req.headers
    );

    if (!crawler) {
      res.status(409).end();
      return;
    }
    res.end(
      JSON.stringify({
        status: 'success'
      })
    );

    await crawler.startCrawling();

  });

  router.post('/orders/:id', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const action = req.body.action;
    const sessionToken = req.cookies['session_token'];

    let status = '';

    switch (action) {
      case 'confirm':
        status = 'confirmed';
        break;
      case 'reject':
        status = 'rejected';
        break;
    }

    await app.mongo.collection('orders').updateOne(
      {
        order_id: id
      },
      {
        $set: {
          status
        }
      }
    );

    if (action === 'reject') {
      app.sessions[sessionToken].setIsIdle(false);
    }

    return res.json({});
  });

  router.post('/sessions', authMiddleware, async (req, res) => {
    const sessionToken = req.cookies['session_token'];

    await app.sessions[sessionToken].setIsIdle(false);

    res.end(
      JSON.stringify({
        status: 'success'
      })
    );
  });

  router.delete('/sessions', authMiddleware, async (req, res) => {
    const sessionToken = req.cookies['session_token'];

    await app.browser.killTab(sessionToken);

    await app.mongo.collection('orders').updateMany(
      {
        user_id: req.user._id,
        status: 'pending'
      },
      {
        $set: {
          status: 'rejected'
        }
      }
    );

    res.end(
      JSON.stringify({
        status: 'success'
      })
    );
  });

  router.patch('/sessions', authMiddleware, async (req, res) => {
    const sessionToken = req.cookies['session_token'];

    await app.sessions[sessionToken].setIsIdle(true);

    res.end(
      JSON.stringify({
        status: 'success'
      })
    );
  });

  return router;
};
