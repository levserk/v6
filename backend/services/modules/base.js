'use strict';

/**
 * Base class
 */
let router = require('koa-router');

module.exports = class Base {

    constructor(server, conf) {
        this.server = server;
        this.storage = server.storage;
        this.conf = conf;
        this.isRunning = false;
        this.router = router;

        this.initRouter();
    }

    initRouter() {
        this.router = this.router();
        this.router.get('/', function* (next) {
            this.body = 'welcome';
            yield next;
        });
    }

    get (url, callback) {
        let self = this;
        this.router.get(url, (ctx, next) => {
            return callback.bind(self)(ctx.params.game, ctx.query).then((data) => {
                if (data) {
                    ctx.body = data;
                } else {
                    ctx.status = 404;
                }
                return next();
            }).catch((e) => {
                console.log(e);
                ctx.status = 500;
                return next();
            });
        });
    }

    del (url, callback) {
        let self = this;
        this.router.del(url, (ctx, next) => {
            return callback.bind(self)(ctx.params.game, ctx.query).then((data) => {
                if (data) {
                    ctx.body = data;
                } else {
                    ctx.status = 404;
                }
                return next();
            });
        });
    }

    post (url, callback) {
        let self = this;
        this.router.post(url, (ctx, next) => {
            return callback.bind(self)(ctx.params.game, ctx.query, ctx.request.body).then((data) => {
                if (data) {
                    ctx.body = data;
                } else {
                    ctx.status = 404;
                }
                next();
            });
        });
    }

    get routes() {
        return this.router.routes();
    }

    get allowedMethods() {
        return this.router.allowedMethods();
    }



};