const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const Browser = require('./Browser');

class App {
  constructor(name, options) {
    this.name = name;
    this.options = options;

    this.configure();

    this._app = express();
    this._app.use(bodyParser.json());
    this._app.use(cookieParser());
    this._app.use(express.static(process.env.STATIC_DIR_PATH));
    this._app.use(expressLayouts);

    this._app.set('layout', process.env.DEFAULT_LAYOUT_PATH);
    this._app.set('view engine', process.env.VIEW_ENGINE);
    this._app.set('views', process.env.VIEWS_PATH);

    this.mongo = null;
    this.browser = null;
    this.sessions = {};
  }

  configure() {
    if (!process.env.IS_PRODUCTION) {
      require('dotenv').config({
        path: this.options.DOT_ENV_PATH
      });
    }

    process.env = {
      ...process.env,
      ...this.options
    };
  }

  async initMongo() {
    const client = new MongoClient(process.env.MONGO_DB_CONNECTION_STRING, {
      useNewUrlParser: true
    });
    this.mongo = (await client.connect()).db(process.env.MONGO_DB_NAME);
    this.mongo.ObjectId = require('mongodb').ObjectId;
  }

  async initSocketServer() {
    this._socketServer = require('http').createServer(this._app);

    this.io = new Server(this._socketServer);
    this.io.on('connection', socket => {
      const { session_token: sessionToken } = socket.handshake.query;
      if (this.sessions[sessionToken]) {
        this.sessions[sessionToken].addSocket(socket);
      }

      socket.on('disconnect', () => {
        if (this.sessions[sessionToken]) {
          this.sessions[sessionToken].removeSocket(socket);
        }
      });
    });
  }

  async initPortListeners() {
    this._socketServer.listen(
      parseInt(process.env.SOCKET_IO_PORT, 10),
      '0.0.0.0',
      () => {
        console.log(`listening on port ${process.env.SOCKET_IO_PORT}`);
      }
    );
    this._app.listen(
      parseInt(process.env.APPLICATION_PORT, 10),
      '0.0.0.0',
      () => {
        console.log(`listening on port ${process.env.APPLICATION_PORT}`);
      }
    );
  }

  async initBrowser() {
    this.browser = new Browser({
      sessions: this.sessions,
      mongo: this.mongo
    });

    await this.browser.init();
  }

  async run() {
    try {
      await this.initMongo();
      await this.initBrowser(this.sessions);
      await this.initSocketServer();
      await this.initPortListeners();
    } catch (err) {
      console.error(err);
    }

    return this;
  }
}

module.exports = App;
