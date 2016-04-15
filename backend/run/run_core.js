'use strict';

let gameConf = {
        logger: {
            priority: 3,
            showOnly: ['EventBus', 'Engine', 'RoomManager']
        },
        taskQueue: {},
        mongoStorage: {},
        memory: {
            clear: true
        },
        managers: [
            {
                name: 'socketManager',
                conf: {
                    port: '8078'
                }
            },
            {
                name: 'gameManager',
                conf: {}
            },
            {
                name: 'inviteManager',
                conf: {}
            },
            {
                name: 'userManager',
                conf: {}
            },
            {
                name: 'chatManager',
                conf: {}
            }
        ]
    };

let GameServer = require('../core/gameServer.js'),
    co = require('co');

let gameServer = new GameServer(gameConf);

co(function* () {
    yield gameServer.start();
});