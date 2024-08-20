const Joi = require('joi');
const app = require('../../main');
const authMiddleware = require('../../middlewares/auth');

module.exports = Router => {
  const router = new Router({ mergeParams: true });

  router.post('/start', async (req, res) => {
    const account = req.body;
    const sessionToken = req.body.email;
    try {
      await app.browser.runCPTab(sessionToken, account);
      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('Error running cpTab:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.put("/cp-otp", async (req, res) => {
    await app.otp.setCPCurrent(req.body);
    return res.json({});
  });

  router.put("/next", async (req, res) => {
    await app.nextCommand.setNext(req.body);
    return res.json({});
  });

  return router;
};
