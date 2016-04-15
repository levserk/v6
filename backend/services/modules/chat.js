'use strict';
let Base = require('./base.js');
let moduleName = 'Chat', logger, log, err, wrn;

module.exports = class Chat extends Base {
    constructor(server, conf) {
        logger = server.logger.getLogger(moduleName);
        log = logger.log;
        wrn = logger.wrn;
        err = logger.err;
        super(server, conf);
    }

    initRouter() {
        let self = this;
        this.router = this.router();

        this.get('chat/:game/messages', self.getMessages);
        this.del('chat/:game/message', self.delMessage);
        this.post('chat/:game/message', self.saveMessage);
        this.get('chat/:game/ban', self.getBan);
        this.post('chat/:game/ban', self.saveBan);

    }

    getMessages(game, query) {
        if (!query || !game) {
            return Promise.resolve(null);
        }
        let count = +query.count,
            time = +query.time,
            target = query.target || game,
            sender = query.sender,
            type = target === game ? 'public' : null;
        if (!time) {
            time = Date.now();
        }
        if (!count || count > 100 || count < 0) {
            count = 10;
        }

        log(`getData`, `get chat ${game}, ${target} ${type ? null : sender} `, 3);
        return this.storage.getMessages(game, count, time, target, type ? null : sender);
    }

    saveMessage(game, message) {
        if (!game || !message || !message.target || !message.sender || !message.time) {
            return Promise.resolve(null);
        }

        return this.storage.saveMessage(game, message);
    }

    delMessage(game, query) {
        if (!game || !query || !query.id) {
            return Promise.resolve(null);
        }

        return this.storage.deleteMessage(game, query.id);
    }

    saveBan(game, ban) {
        if (!game || !ban || !ban.userId) {
            return Promise.resolve(null);
        }

        return this.storage.saveBan(game, ban);
    }

    getBan(game, query) {
        if (!game || !query || !query.userId) {
            return Promise.resolve(null);
        }

        return this.storage.getBan(game, query.userId);
    }

};