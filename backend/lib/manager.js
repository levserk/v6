'use strict';

let moduleName = 'Manager';
let logger, log, err, wrn;

/**
 * Base class Manager
 * publisher and subscriber
 * @type {Manager}
 */
module.exports = class Manager {
    /**
     * constructor
     * @param server {Server} server with module taskQueue
     * @param conf {*|Object}
     */
    constructor(server, conf) {
        logger = server.logger.getLogger(moduleName);
        log = logger.log;
        wrn = logger.wrn;
        err = logger.err;

        this.server = server;
        this.memory = server.memory;
        this.conf = conf;

        log('constructor', 'manager created ', 4);
    }

    /**
     * test and run manager
     * @returns {Promise}
     */
    init() {
        return this.test()
            .then(() => {
                this.isRunning = true;
                log(`init`, `init success`, 4);
                return true;
            })
            .catch((e) => {
                this.isRunning = false;
                err(`init, test error: ${e.stack}`);
                throw Error(`test failed`);
            });
    }

    /**
     * test module
     * @returns {Promise}
     */
    test() {
        log(`test`, `start test`, 4);
        return new Promise((res, rej) => {
            if (this.server) {
                res(true);
            } else {
                err(`test`, `check server and taskQueue`);
                rej(true);
            }
        });
    }
};