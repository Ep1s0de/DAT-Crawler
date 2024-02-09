const path = require('path');
const App = require('./lib/App');

const app = new App('dat', {
  DEFAULT_LAYOUT_PATH: path.join(__dirname, 'views', 'default-layout'),
  DOT_ENV_PATH: path.join(__dirname, 'config', 'config.env'),
  ROUTES_ENTRYPOINT: path.join(__dirname, 'routes', 'index'),
  STATIC_DIR_PATH: path.join(__dirname, 'public'),
  VIEWS_PATH: path.join(__dirname, 'views'),
  VIEW_ENGINE: 'ejs'
});

app
  .run()
  .then(instance => {
    instance._app.use(require(process.env.ROUTES_ENTRYPOINT)());

    process.on('exit', code => {
      signOutConnections(() => console.log('> Process exited '));
    });

    function signOutConnections(cb) {
      const sockets = Object.values(instance.sessions).reduce(
        (acc, session) => [...acc, ...session.sockets],
        []
      );

      for (const socket of sockets) {
        socket.emit('logout');
      }

      setTimeout(() => {
        cb();
      }, 1000);
    }

    process.on('SIGINT', code => {
      signOutConnections(() => console.log('> Process exited '));
    });

    process.on('SIGTERM', code => {
      signOutConnections(() => console.log('> Process exited '));
    });

    process.on('SIGQUIT', code => {
      signOutConnections(() => console.log('> Process exited '));
    });

    process.on('SIGUSR2', () => {
      process.exit(process.pid);
    });
  })
  .catch(err => {
    console.error(err);
  });

module.exports = app;
