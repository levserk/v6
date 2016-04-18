'use strict';

let moduleName = 'Memory',
    RedisMemory = require('../../lib/memory.js'),
    socketsMemory = require('../../modules/socket_manager/sockets_memory.js'),
    usersMemory = require('../../modules/user_manager/users_memory.js'),
    invitesMemory = require('../../modules/invite_manager/invites_memory.js'),
    roomsMemory = require('../../modules/room_manager/rooms_memory.js'),
    mixin = require('es6-class-mixin');

let logger, log, err, wrn;

let defaultConf = {};

module.exports = class Memory extends mixin(RedisMemory,  socketsMemory, usersMemory, invitesMemory, roomsMemory) {
    constructor(server, conf) {
        logger = server.logger.getLogger(moduleName);
        log = logger.log;
        wrn = logger.wrn;
        err = logger.err;

        conf = Object.assign(defaultConf, conf);

        super(server, conf);

        this.games = this.server.conf.games;
    }
};