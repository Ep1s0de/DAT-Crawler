const { Router } = require('express');

module.exports = () => {
  const router = new Router();

  router.use('/auth', require('./auth')(Router));
  router.use('/dashboard', require('./dashboard')(Router));

  router.get('*', (req, res) => {
    res.status(404).render('404', {
      title: '404',
      layout: 'simple-layout'
    });
  });

  router.use((err, req, res, next) => {
    if (err) {
      res.render('500', {
        title: 'Error',
        layout: 'simple-layout'
      });
    }
  });

  return router;
};
