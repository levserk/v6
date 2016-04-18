'use strict';
let Server = require('./lib/server.js');
let TransportManager = require('./modules/transport_manager/transport_manager.js');
let SocketManager = require('./modules/socket_manager/socket_manager.js');
let UserManager = require('./modules/user_manager/user_manager.js');
let ChatManager = require('./modules/chat_manager/chat_manager.js');
let InviteManager = require('./modules/invite_manager/invite_manager.js');
let GameManager = require('./modules/room_manager/room_manager.js');
let EventBus = require('./lib/event_bus.js');
let Memory = require('./lib/memory/memory.js');
let TaskQueue = require('./lib/task_queue.js');

let logger, log, err, wrn;
let co = require('co');


let defaultConf = {
    gamesConf: {
        games: {
            test1: {
                modes: {
                    default: {}
                }
            },
            test2: {
                modes: {
                    mode_1: {},
                    mode_2: {}
                },
                clientOpts: {
                    modes: ['mode_1', 'mode_2']
                }
            }
        },
        modes: {
            default: {}
        },
        modeData: {
            win: 0,
            lose: 0,
            draw: 0,
            games: 0,
            rank: 0,
            ratingElo: 1600,
            timeLastGame: 0
        },
        initData: {
            saveHistory: true,
            saveRating: true,
            turnTime: 20000,
            timeMode: 'reset_every_switch',
            timeStartMode: 'after_round_start',
            addTime: 0,
            takeBacks: 0,
            maxTimeouts: 1,
            minTurns: 0
        },
        clientOpts: {
            modes: ['default']
        }
    }
};

module.exports = class GameServer extends Server {
    constructor(conf) {
        conf = Object.assign(defaultConf, conf);
        super(conf);

        logger = this.logger.getLogger('GameServer');
        log = logger.log;
        wrn = logger.wrn;
        err = logger.err;

        this.conf.games = {};
        this.eventBus = new EventBus(this, conf);
        log(`constructor`, `${JSON.stringify(this.conf)}`);
    }

    init() {
        this.initGamesConf();
        return super.init().then(() => {
            return this.initManagers();
        });
    }

    initModules() {
        let self = this, conf = self.conf;
        return co(function* () {
            if (conf.taskQueue) {
                self.taskQueue = new TaskQueue(self, conf.taskQueue);
                yield self.taskQueue.init();
            }
            if (conf.memory) {
                self.memory = new Memory(self, conf.memory);
                yield self.memory.init();
            }
        })
            .then(()=> {
                log(`initModules`, `init modules complete`);
            })
            .catch((e)=> {
                err(`initModules`, `init modules failed with error: ${e.stack}`);
                throw Error(`init modules failed`);
            });
    }

    initManagers() {
        let self = this, conf = self.conf;
        return co(function* () {

            for (let mg of conf.managers) {
                let manager;
                switch (mg.name) {
                    case 'socketManager':
                        manager = new SocketManager(self, mg.conf);
                        self.socketManager = manager;
                        break;
                    case 'userManager':
                        manager = new UserManager(self, mg.conf);
                        self.userManager = manager;
                        break;
                    case 'chatManager':
                        manager = new ChatManager(self, mg.conf);
                        self.chatManager = manager;
                        break;
                    case 'inviteManager':
                        manager = new InviteManager(self, mg.conf);
                        self.inviteManager = manager;
                        break;
                    case 'gameManager':
                        manager = new GameManager(self, mg.conf);
                        self.gameManager = manager;
                        break;
                }
                if (!manager) {
                    err(`initManagers`, `no class for manager: ${mg.name}, ${mg}`);
                    continue;
                }
                yield manager.init();
            }
            self.transportManager = new TransportManager(self, conf);
            yield self.transportManager.init();
        }).then(()=> {
                log(`initManagers`, `init managers complete`);
            })
            .catch((e)=> {
                err(`initManagers`, `init managers failed with error: ${e.stack}`);
                throw Error(`init managers failed`);
            });
    }

    initGamesConf() {
        let games = {}, conf = this.conf.gamesConf;
        for (let gameKey of Object.keys(conf.games)) {
            let game = Object.assign(conf.games[gameKey] || {});
            let modes = Object.assign(game.modes || conf.modes);
            game.modes = {};
            for (let modeKey of Object.keys(modes)) {
                let mode = game.mode || {};
                mode = Object.assign(conf.modeData, modes[modeKey] || {});
                game.modes[modeKey] = mode;
            }
            game.initData = Object.assign(conf.initData, game.initData);
            game.clientOpts = Object.assign(conf.clientOpts, game.clientOpts);
            game.clientOpts.game = gameKey;
            games[gameKey] = game;
        }

        log(`initGamesConf`, `conf: ${JSON.stringify(games)}`);
        this.conf.games = games;
    }
};