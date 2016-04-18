'use strict';

let apiConf = {
    port: 8081,
    allowOrigin: true,
    logger: {
        priority: 3
    },
    mongoStorage: {
        default: {
            host: 'localhost',
            port: 27017
        },
        games: {
            test: {},
            test2: {}
        }
    }
};

let ApiServer = require('../server.js'),
    apiServer = new ApiServer(apiConf);
apiServer.start();