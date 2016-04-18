'use strict';
let Base = require('../../lib/router.js');
let moduleName = 'History', logger, log, err, wrn;

module.exports = class History extends Base {
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

        this.get('history/:game/games', self.getHistory);
        this.get('history/:game/game', self.getGame);
        this.get('history/:game/score', self.getScore);
        this.post('history/:game/game', self.saveGame);
    }

    getHistory(game, query) {
        let mode = query.mode,
            userId = query.userId,
            count = +query.count,
            offset = +query.offset,
            filter = query.filter;

        if (!userId || !mode) {
            return Promise.resolve(null);
        }
        if (!count || count < 0 || count > 1000) {
            count = 50;
        }
        if (!offset || offset < 0) {
            offset = 0;
        }
        if (typeof filter !== "string" || (filter = filter.trim()).length < 1) {
            filter = false;
        }

        log(`getData`, `get history ${game}, ${mode} ${userId}`, 3);
        return this.storage.getHistory(game, userId, mode, count, offset, filter)
            .then((data) => {
                return data ? JSON.stringify({
                    mode: mode,
                    history: data.history,
                    penalties: data.penalties,
                    userId: userId
                }) : null;
            }).catch((e)=> {
                err(`getData`, `error: ${e.stack || e}`, 1);
                return null;
            });
    }

    getGame(game, query) {
        let mode = query.mode,
            userId = query.userId,
            gameId = query.gameId;

        if (!gameId) {
            return Promise.resolve(null);
        }

        log(`getData`, `get game ${game}, ${mode}`, 1);
        return this.storage.getGame(game, userId, gameId)
            .then((game) => {
                return JSON.stringify({
                    mode: mode,
                    game: game
                });
            }).catch((e)=> {
                err(`getData`, `error: ${e.stack || e}`);
                return null;
            });
    }

    getScore(game, query) {
        return this.storage.getScore(game, query.users);
    }

    saveGame(game, save) {
        log(`saveGame`, `data to save: ${JSON.stringify(save)}`);
        if (!game || !save || !save.mode || !save.action || !save.players || !save.timeStart){
            return Promise.resolve(null);
        }
        return Promise.resolve(true);

        //return this.storage.saveGame(game, save);
    }
};