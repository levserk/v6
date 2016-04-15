'use strict';
let Base = require('./base.js');
let moduleName = 'Test', logger, log, err, wrn;

module.exports = class Test extends Base {
    constructor(server, conf) {
        logger = server.logger.getLogger(moduleName);
        log = logger.log;
        wrn = logger.wrn;
        err = logger.err;
        super(server, conf);
    }

    initRouter() {
        this.router = this.router();

        this.get('test/:game/', this.getData);
        this.post('test/:game/', this.save);
    }

    getData(game, query) {
        log(`get`, `get test ${game}`, 3);
        return Promise.resolve({
                query: query,
                game: game,
                data: 'ok'
            }
        );
    }

    save(game, query, data) {
        log(`save`, `game: ${game}, query: ${JSON.stringify(query)}, data: ${JSON.stringify(data)}`);
        return Promise.resolve({
            query: query,
            game: game,
            postData: data,
            result: "ok"
        });
    }

};