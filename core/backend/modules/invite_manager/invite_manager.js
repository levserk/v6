'use strict';

//require
let Manager = require('../../lib/manager.js');
let Room = require('../room_manager/room.js');
let co = require('co');

let moduleName = 'InviteManager';
let logger, log, err, wrn;

const ROLE_PLAYER = 'player';
const ROLE_SPECTATOR = 'spectator';

let defaultConf = {};

module.exports = class InviteManager extends Manager {
    constructor(server, conf) {
        logger = server.logger.getLogger(moduleName);
        log = logger.log;
        wrn = logger.wrn;
        err = logger.err;

        conf = Object.assign(defaultConf, conf);
        super(server, conf);

        this.games = this.server.conf.games;
        this.eventBus = server.eventBus;

        log(`constructor`, `inviteManager created, conf: ${JSON.stringify(conf)}`);
    }

    *init() {
        let self = this;
        try {
            yield self.test();
            for (let game of Object.keys(self.games)) {
                yield this.memory.removeInvites(game);
            }
            this.initEvents();
            self.isRunning = true;
            log(`init`, `init success`);
        } catch(e) {
            this.isRunning = false;
            err(`init`, `error: ${e}, stack: ${e.stack}`);
        }
    }

    initEvents() {
        this.eventBus.on(`invite_manager.*`,(message) => {
            return this.onNewMessage(message);
        });

        this.eventBus.on(`system.user_disconnect`,(message) => {
            //return this.onNewMessage(message);
        });

        //this.eventBus.on(`system.close_room`, (game, roomId) => {
        //    return this.onNewMessage({
        //        game: game,
        //        type: 'close_room',
        //        data: {
        //            roomId: roomId
        //        }
        //    });
        //});
        //
        //this.eventBus.on(`system.leave_user_room`, (game, userId, roomId) => {
        //    return this.onNewMessage({
        //        game: game,
        //        type: 'user_leave_room',
        //        data: {
        //            userId: userId,
        //            roomId: roomId
        //        },
        //        sender: 'server'
        //    });
        //});
    }

    test() {
        log(`test`, `start test`);
        return super.test().then(res => {
            return res;
        });
    }

    onNewMessage(message) {
        let self = this;
        return co(function* () {
            message = yield self.addToList(message);
            if (!message) {
                return true;
            }
            else {
                return self.onMessage(message);
            }
        });
    }

    addToList(message) {
        let self = this, game = message.game;
        return co(function* () {
            message = JSON.stringify(message);
            log(`addToList`, `obj: ${message}`);
            yield self.memory.listAdd(`invites_list:${game}`, message);
            return self.getCurrentMessage(game);
        });
    }

    getCurrentMessage(game) {
        return this.memory.listGet(`invites_list:${game}`, `invites_current:${game}`).then((message) => {
            if (message) {
                message = JSON.parse(message);
            }
            return message;
        });
    }

    onMessage(message) {
        let self = this, game = message.game;
        log(`onMessage`, `message: ${JSON.stringify(message)}`);
        return co(function* () {
            switch (message.type) {
                case "invite":
                    yield self.onInvite(message.user, message.target, message.game, message.data);
                    break;
                case "cancel":
                    yield self.onInviteCancel(message.user, message.target, message.game, message.data);
                    break;
                case "accept":
                    yield self.onInviteAccepted(message.user, message.target, message.game, message.data);
                    break;
                case "reject":
                    yield self.onInviteRejected(message.user, message.target, message.game, message.data);
                    break;
                case "random":
                    yield self.onPlayRandom(message.user, message.game, message.data);
                    break;
                case "user_leave":
                    yield self.onUserLeave(message.user, message.game);
                    break;
                case "close_room":
                    yield self.closeRoom(message.game, message.data.roomId);
                    break;
                case "user_leave_room":
                    yield self.leaveUserRoom(message.data.userId, message.game, message.data.roomId);
                    break;
            }
            yield self.memory.del(`invites_current:${game}`);
            message = yield self.getCurrentMessage(game);
            if (!message) {
                return true;
            }
            else {
                return self.onMessage(message);
            }
        });
    }

    onInvite(user, target, game, invite) {
        log(`onInvite`, ` user ${user.userId}, target: ${target}, invite: ${JSON.stringify(invite)}`);
        let self = this, gameModes = this.games[game].modes, defaultMode = Object.keys(gameModes)[0];
        return co(function* () {
            if (target === user.userId) {
                wrn('onInvite', `user invite himself, ${user.userId}`, 1);
                return true;
            }
            invite = invite || {};
            invite.mode = invite.mode || defaultMode;
            invite.from = user.userId;
            let socket = yield self.memory.getUserSocket(game, invite.target);
            if (!socket) {
                return false;
            }
            // check user not in game
            yield self.memory.set(`invites:${game}:${user.userId}`, JSON.stringify(invite));
            yield self.eventBus.emit(`system.send_to_socket`, socket, JSON.stringify({
                module: "invite_manager",
                type: "invite",
                data: invite
            }));
        });
    }

    onInviteCancel(user, target, game, invite) {
        log(`onInviteCancel`, ` user ${user.userId}, target: ${target}, invite: ${JSON.stringify(invite)}`);
        let self = this, gameModes = this.games[game].modes, defaultMode = Object.keys(gameModes)[0];
        return co(function*() {
            yield self.memory.del(`invites:${game}:${user.userId}`);
            // todo: load this;
            invite = invite || {};
            invite.mode = invite.mode || defaultMode;
            invite.from = user.userId;
            let socket = yield self.memory.getUserSocket(game, target);
            if (!socket) {
                return false;
            }
            return self.eventBus.emit(`system.send_to_socket`, socket, JSON.stringify({
                module: "invite_manager",
                type: "cancel",
                data: invite
            }));
        });
    }

    onInviteAccepted(user, targetId, game, invite) {
        log(`onInviteAccepted`, ` user ${user.userId}, target: ${targetId}, invite: ${JSON.stringify(invite)}`);
        let self = this, gameModes = this.games[game].modes, defaultMode = Object.keys(gameModes)[0];
        return co(function* () {
            // get invitedata
            yield self.memory.del(`invites:${game}:${targetId}`);
            let targetSocket = yield self.memory.getUserSocket(game, targetId);
            let userSocket = yield self.memory.getUserSocket(game, user.userId);
            if (!targetSocket || !userSocket) {
                if (targetSocket) {
                    yield self.eventBus.emit(`system.send_to_socket`, targetSocket, JSON.stringify({
                        module: "invite_manager",
                        type: "reject",
                        data: invite
                    }));
                    return true;
                }
                return false;
            }
            yield self.removeWaitingUser(targetId, game);
            yield self.removeWaitingUser(user.userId, game);
            yield self.eventBus.emit(`system.invite_accepted`, game, targetSocket, targetId, [targetId, user.userId], invite);
            //yield self.createRoom(game, targetSocket, targetId, [targetId, user.userId], invite, 'multi');

            log(`onInviteAccepted`, `start game!!`);
        });
    }

    onInviteRejected(user, target, game, invite) {
        log(`onInviteRejected`, ` user ${user.userId}, target: ${target}, invite: ${JSON.stringify(invite)}`);
        let self = this, gameModes = this.games[game].modes, defaultMode = Object.keys(gameModes)[0];
        return co(function* () {
            yield self.memory.del(`invites:${game}:${target}`);
            invite = invite || {};
            invite.target = user.userId;
            let socket = yield self.memory.getUserSocket(game, target);
            if (!socket) {
                return false;
            }
            return self.eventBus.emit(`system.send_to_socket`, socket, JSON.stringify({
                module: "invite_manager",
                type: "reject",
                data: invite
            }));
        });
    }

    onPlayRandom(user, game, data) {
        log(`onPlayRandom`, ` user ${user.userId}, game: ${game}, data: ${JSON.stringify(data)}`);
        let self = this, gameModes = this.games[game].modes, defaultMode = Object.keys(gameModes)[0];
        return co(function* () {
            if (!user || !user.userId || !data || !game) {
                return false;
            }
            let modeBefore = yield self.removeWaitingUser(user.userId, game);
            if (modeBefore === data.mode || data === 'off') {
                return true;
            }

            if (!gameModes[data.mode]) {
                err(`onPlayRandom`, `InviteManager.onRandomPlay wrong game mode: ${data.mode} `, 1);
                return false;
            }

            let waitingId = yield self.memory.hashGet(`waiting:${game}`, data.mode);
            if (waitingId) {
                // todo: check waiting in room and remove he
                yield self.removeWaitingUser(waitingId, game);
                let targetSocket = yield self.memory.getUserSocket(game, waitingId);
                let userSocket = yield self.memory.getUserSocket(game, user.userId);
                if (!targetSocket || !userSocket) {
                    // TODO: check sockets not need hear
                    return false;
                }
                yield self.eventBus.emit(`system.invite_accepted`, game, targetSocket, waitingId, [waitingId, user.userId], data);
                //yield self.createRoom(game, targetSocket, waitingId, [waitingId, user.userId], data, Room.TYPE_MULTY);
                log(`onPlayRandom`, `start game!!`);
            } else {
                let sendData = {};
                sendData[data.mode] = user.userId;
                yield self.memory.hashAdd(`waiting:${game}`, data.mode, user.userId);
                yield self.eventBus.emit(`system.send_to_sockets`, game, JSON.stringify({
                    module: "invite_manager",
                    type: "random_wait",
                    data: sendData
                }));
            }
        });
    }

    onStartSingle(user, game, data) {
        log(`onStartSingle`, ` user ${user.userId}, game: ${game}, data: ${JSON.stringify(data)}`);
        let self = this, gameModes = this.games[game].modes, defaultMode = Object.keys(gameModes)[0];
        return co(function* () {
            if (!user || !user.userId || !data || !game) {
                return false;
            }

            if (!gameModes[data.mode]) {
                err(`onStartSingle`, `wrong game mode: ${data.mode} `, 1);
                return false;
            }

            let userSocket = yield self.memory.getUserSocket(game, user.userId);
            if (!userSocket) {
                return false;
            }
            yield self.createRoom(game, userSocket, user.userId, [user.userId], data, Room.TYPE_SINGLE);
            log(`onStartSingle`, `start game!!`);

        });
    }

    removeWaitingUser(userId, game) {
        log(`removeWaitingUser`, ` user ${userId}, game: ${game}`);
        let self = this, gameModes = this.games[game].modes, defaultMode = Object.keys(gameModes)[0];
        return co(function* () {
            let waiting = yield self.memory.hashGetAll(`waiting:${game}`);
            log(`removeWaitingUser`, ` waiting: ${JSON.stringify(waiting)}, game: ${game}`);
            if (!waiting) {
                return false;
            }
            for (let mode of Object.keys(gameModes)) {
                if (waiting[mode] === userId) {
                    let sendData = {};
                    sendData[mode] = null;
                    yield self.memory.hashRemove(`waiting:${game}`, mode);
                    yield self.eventBus.emit(`system.send_to_sockets`, game, JSON.stringify({
                        module: "invite_manager",
                        type: "random_cancel",
                        data: sendData
                    }));
                    return mode;
                }
            }
            return false;
        });
    }

    onUserLeave(user, game) {
        log(`onUserLeave`, `user: ${user.userId}, game: ${game}`);
        let self = this;
        return co(function* () {
            yield self.memory.del(`invites:${game}:${user.userId}`);
            yield self.removeWaitingUser(user.userId, game);
            let room = yield self.memory.getUserRoom(user.userId, game);
            log(`onUserLeave`, `room: ${JSON.stringify(room)}`);
            // TODO send to GM;
            if (!room) {
                return true;
            }
            if (room) {
                // send game manager user leave
                return yield self.closeRoom(game, room.roomId);
            }
        });
    }


};