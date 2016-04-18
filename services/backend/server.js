'use strict';

let Logger = require('./lib/logger.js'),
    DataStorage = require('./lib/storages/storage.js'),
    MongoStorage = require('./lib/storages/mongo_storage.js'),
    Users = require('./modules/users/users.js'),
    History = require('./modules/history/history.js'),
    Chat = require('./modules/chat/chat.js'),
    Test = require('./modules/test/test.js'),
    http = require('http'),
    Url = require("url"),
    defaultConf = require('./conf.js'),
    co = require('co'),
    koa = require('koa'),
    koaLogger = require('koa-logger'),
    router = require('koa-router')(),
    bodyparser = require('koa-bodyparser');

let logger, log, err, wrn;

module.exports = class ApiServer {
    constructor(conf) {
        this.conf = Object.assign({}, defaultConf, conf);
        this.logger = Logger(this, this.conf.logger);

        logger = this.logger.getLogger('ApiServer');
        log = logger.log;
        wrn = logger.wrn;
        err = logger.err;

        log(`constructor`, `${JSON.stringify(this.conf)}`);

        this.isRunnig = false;
    }

    start() {
        log(`start`, `starting server`);
        return this.init().then(()=> {
                log(`start`, `server started`);
                this.isRunnig = true;
            })
            .catch((e)=> {
                err(`start`, `starting server failed with error: ${e.stack}`);
                throw Error(`starting server failed`);
            });
    }

    init() {
        let self = this;

        return co(function* () {
            yield self.initStorage();
            yield self.initServices();
            yield self.createWebServer(self.conf.port);
        })
            .then(()=> {
                log(`init`, `api service run`, 1);
            })
            .catch((e)=> {
                err(`init`, `error: ${e.stack}`, 1);
            });
    }

    initServices() {
        this.users = new Users(this, this.conf);
        this.history = new History(this, this.conf);
        this.chat = new Chat(this, this.conf);
        this.test = new Test(this, this.conf);

        router.use('/', this.users.routes);
        router.use('/', this.chat.routes);
        router.use('/', this.history.routes);
        router.use('/', this.test.routes);

        return Promise.resolve(true);
    }

    initStorage() {
        if (this.conf.mongoStorage) {
            this.storage = new MongoStorage(this, this.conf.mongoStorage);
        } else {
            this.storage = new DataStorage(this, this.conf.storage);
        }

        return this.storage.init();
    }

    createWebServer(port) {
        // TODO: add post data, checking role
        this.app = new koa()
            .use(koaLogger())
            .use(bodyparser({
                extendTypes: {
                    json: ['application/x-javascript']
                }
            }))
            .use((ctx, next) => {
                if (this.conf.allowOrigin) {
                    ctx.response.set('Access-Control-Allow-Origin', '*');
                    return next();
                }
            })
            .use(router.routes())

            .listen(port);
        return Promise.resolve(true);
    }
};