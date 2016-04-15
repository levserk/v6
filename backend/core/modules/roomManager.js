'use strict';

//require
let Manager = require('../../lib/manager.js');
let Room = require('../instances/room.js');
let Engine = require('./gameApplication.js');
let co = require('co');

let moduleName = 'RoomManager';
let logger, log, err, wrn;

let defaultConf = {
    games: {},
    defaultGameConf: {}
};

const TYPE_MULTI = 'multi';
const TYPE_SINGLE = 'single';
const ROLE_PLAYER = 'player';
const ROLE_SPECTATOR = 'spectator';

module.exports = class RoomManager extends Manager {
    /**
     *
     * @param server {GameServer}
     * @param conf {Object}
     */
    constructor(server, conf) {
        logger = server.logger.getLogger(moduleName);
        log = logger.log;
        wrn = logger.wrn;
        err = logger.err;

        conf = Object.assign(defaultConf, conf);
        super(server, conf);

        this.games = this.server.conf.games;
        this.eventBus = server.eventBus;

        this.gamesEngines = {};
        this.gamesConf = {};
        log(`constructor`, `${moduleName} created, conf: ${JSON.stringify(conf)}`);
    }

    *init() {
        try{
            yield this.test();
            // init engine and conf for each game
            for (let game of Object.keys(this.games)) {
                let conf =   this.conf.games[game] ? this.conf.games[game].conf : {},
                    engine = this.conf.games[game] ? this.conf.games[game].engine : false;
                this.gamesConf[game] = Object.assign(this.conf.defaultGameConf, conf);
                this.gamesEngines[game] = yield this.initGameEngine(engine, this.games[game].conf);
            }
            this.initEvents();
            this.isRunning = true;
            log(`init`, `init success`);
        } catch (e) {
            this.isRunning = false;
            err(`init`, `error: ${e}, stack: ${e.stack}`);
            throw e;
        }
    }

    initGameEngine(engineClass, conf) {
        engineClass = engineClass || Engine;
        let engine = new engineClass(this, conf);
        return engine.init().then(()=> {
            return engine;
        });
    }

    initEvents() {
        this.eventBus.on(`room_manager.*`, (message) => {
            return this.onNewMessage(message);
        });
        this.eventBus.on(`system.invite_accepted`,(game, socketId, ownerId, players, inviteData) => {
            this.createRoom(game, socketId, ownerId, players, inviteData, TYPE_MULTI);
        });
        this.eventBus.on(`system.user_relogin`, (game, userData) => {
            return this.onNewMessage({
                game: game,
                type: 'relogin',
                user: userData,
                sender: 'server'
            });
        });
        this.eventBus.on(`system.user_disconnect`, (user, userRoom) => {
            return this.onNewMessage({
                user: user,
                sender: 'server',
                game: user.game,
                userRoom: userRoom,
                type: 'disconnect' //disconnect
            });
        });
        this.eventBus.on(`game.round_end`, (game, room, result, players) => {
            let self = this;
            return co(function* (){
                log(`initEvents`, `on game.roundEnd, result: ${JSON.stringify(result)}`);
                log(`initEvents`, `on game.roundEnd, players: ${JSON.stringify(players)}`);
                for (let user of players) {
                    yield self.memory.updateUserRating(game, room.mode, user);
                    yield self.eventBus.emit(`system.save_user`, game, user, room.mode);
                }

                yield self.eventBus.emit(`system.save_game`, game, result);

                self.sendRoundEnd(room, result, players);
            });
        });
        this.eventBus.on(`game.game_end`, () => {
            // TODO: close room
        });
    }

    test() {
        log(`test`, `start test`);
        return super.test()
            .then(res => {
                return res;
            });
    }

    onNewMessage(message) {
        let self = this;
        return co(function* () {
            yield self.addToList(message);
        });
    }

    addToList(message) {
        let self = this, game = message.game, userRoom;
        return co(function* () {
            switch (message.type) {
                case 'spectate':
                    userRoom = {roomId: message.data.roomId, role: 'spectator'};
                    break;
                case 'leaved':
                    //TODO: check userRoom
                    userRoom = message.userRoom;
                    break;
                case 'timeout':
                    if (message.user) { // timeout not from server!! skip
                        yield self.removeCurrentMessage(game, message.roomId);
                        return self.doNextMessage(game, message.roomId);
                    }
                    userRoom = message.userRoom;
                    break;
                default:
                    userRoom = yield self.memory.getUserRoom(message.user.userId, game);
            }
            if (!userRoom || !userRoom.roomId) {
                if (message.type !== 'relogin') {
                    err(`addToList`, `no room, message: ${JSON.stringify(message)}`);
                }
                return false;
            }
            message.userRoom = userRoom;
            message = JSON.stringify(message);

            log(`addToList`, `obj: ${message}`);
            yield self.memory.listAdd(`game_events_list:${game}:${userRoom.roomId}`, message);

            return self.doNextMessage(game, userRoom.roomId);
        });
    }

    doNextMessage(game, roomId) {
        let self = this;
        return co(function* () {
            let message;
            while ((message = yield self.getCurrentMessage(game, roomId)) !== false) {
                if (message) {
                    yield self.onMessage(message);
                    yield self.removeCurrentMessage(game, roomId);
                }
            }
        });
    }

    getCurrentMessage(game, roomId) {
        log(`getCurrentMessage`, `game: ${game}, roomId: ${roomId} `);
        return this.memory.listGet(`game_events_list:${game}:${roomId}`, `game_events_current:${game}:${roomId}`)
            .then((message) => {
                if (message) {
                    message = JSON.parse(message);
                }
                return message ? message : false;
            });
    }

    removeCurrentMessage(game, roomId) {
        log(`removeCurrentMessage`, `game: ${game}, roomId: ${roomId} `);
        return this.memory.del(`game_events_current:${game}:${roomId}`);
    }

    createRoom(game, socketId, ownerId, players, inviteData, type) {
        log(`createRoom`, `invite: ${JSON.stringify(inviteData)}, game: ${game}`);
        let self = this, initData = self.games[game].initData;
        let room = Room.create(game, socketId, ownerId, players, initData, inviteData, type);
        return co(function* () {
            // check players in room
            for (let userId of players) {
                if (!self.leaveCurrentUserRoom(userId, game)) {
                    wrn(`createRoom`, `can't create new room for user ${userId}, he already in room`);
                    return false;
                }
            }

            // put created room in memory
            yield self.memory.hashAdd(`rooms:${game}`, room.id, room.getDataToSave());

            // set room for players
            for (let userId of players) {
                yield self.memory.setUserRoom(userId, game, room, ROLE_PLAYER);
            }

            // TODO: emit event game_start
            let engine = self.gamesEngines[game];
            yield self.onGameStart(engine, room);

            yield self.eventBus.emit(`system.send_to_sockets`, game, {
                module: 'server',
                type: 'new_game',
                data: room.getInfo()
            });

            return room;
        });
    }

    leaveCurrentUserRoom(userId, game) {
        // check user in room, and try leave it
        let self = this;
        return co(function* () {
            let userRoom = yield self.memory.getUserRoom(userId, game);
            if (!userRoom) {
                return false;
            }

            // check room closed, or created wrong and not exists
            let roomData = yield self.memory.hashGet(`rooms:${game}`, userRoom.roomId);
            if (!roomData) {
                err(`leaveCurrentUserRoom`, `user in removed room ${game}, ${userRoom.roomId}, ${userId} `);
                yield self.delUserRoom(userId, game);
                return true;
            }

            // check player can leave his current room
            if (userRoom.role === ROLE_PLAYER && userRoom.type === Room.TYPE_MULTY) {
                // user is player, we cant't start another game
                wrn(`leaveCurrentUserRoom`, `user ${userId} already in room, ${userRoom.roomId}`, 2);
                return false;
            } else {
                // leave spectator or single game
                wrn(`leaveCurrentUserRoom`, `user ${userId} spectate in room, ${userRoom.roomId}`, 2);
                let leaved = yield self.leaveUserRoom(userId, game, roomData.roomId);
                if (leaved) {
                    // send to gm user leaved room
                    yield self.eventBus.emit(`system.user_leaved`, game, userId, userRoom);
                }
            }
        });
    }

    leaveUserRoom(userId, game, roomId) {
        let self = this;
        log(`leaveUserRoom`, `user: ${userId}`);
        return co(function* () {
            let userRoom = yield self.memory.getUserRoom(userId, game);

            if (!userRoom) {
                return true;
            }
            if (userRoom.roomId !== roomId) {
                err(`leaveRoom`, `user in another room ${userRoom.roomId}, old room: ${roomId}`);
                return false;
            }
            else {
                yield self.delUserRoom(userId, game);
                return true;
            }
        });
    }

    closeRoom(room) {
        let self = this, game = room.game, roomId = room.id;
        log(`closeRoom`, `game: ${game}, roomId: ${roomId}`);
        return co(function* () {
            yield self.memory.hashRemove(`rooms:${game}`, roomId);
            // remove room messages
            yield self.memory.del(`game_events_list:${game}:${roomId}`);
            yield self.memory.del(`game_events_current:${game}:${roomId}`);

            for (let playerId of room.players) {
                yield self.eventBus.emit(`system.user_leave_room`, room.game, playerId, roomId);
                yield self.memory.delUserRoom(playerId, game);
            }

            yield self.eventBus.emit(`system.send_to_sockets`, game, {
                module: 'server',
                type: 'end_game',
                data: { players: room.players, room: room.id }
            });
        });
    }

    onMessage(message) {
        let self = this,
            game = message.game,
            userRoom = message.userRoom,
            data = message.data,
            room = null,
            user = message.user,
            sender = message.sender,
            engine = self.gamesEngines[game];

        log(`onMessage`, `message: ${JSON.stringify(message)}`);
        return co(function* () {

            //load room
            if (message.type === 'leave' || message.type === 'leaved' ||
                message.type === 'timeout' || userRoom.role === 'player') {
                room = yield self.memory.loadRoom(game, userRoom.roomId);
                if (!room) {
                    if (message.type !== 'timeout') {
                        // something going wrong
                        throw Error(`no room ${game}, ${userRoom.roomId}`);
                    } else {
                        // room closed
                        return false;
                    }
                }
            }

            log(`onMessage`, `start processing message ${message.type}, in room: ${room.id}`);

            switch (message.type) {
                case 'ready': // player ready to play
                    if (userRoom.role === 'player') {
                        yield self.onUserReady(engine, room, user, data);
                    }
                    break;
                case 'turn': // all players turns
                    if (userRoom.role === 'player') {
                        yield self.onUserTurn(engine, room, user, data);
                    }
                    break;
                case 'event': // all events, draw, throw, turn back, others
                    if (userRoom.role === 'player') {
                        yield self.onUserEvent(engine, room, user, data);
                    }
                    //this.onUserEvent(room, message.sender, message.data);
                    break;
                case 'spectate': // user begin spectate
                    if (userRoom.role === 'spectate') {
                        log();
                    }
                    //this.onUserSpectate(room, message.sender);
                    break;
                case 'leave': // user leave room
                    if (userRoom.role === 'player') {
                        yield self.onUserLeave(engine, room, user);
                    }
                    else {
                        // spectator leave;
                        yield self.onSpectatorLeave(engine, room, user);
                    }
                    break;
                case 'leaved':
                    if (userRoom.role === 'player') {
                        yield self.onUserLeave(engine, room, user);
                    }
                    else {
                        // spectator leave;
                        yield self.onSpectatorLeave(engine, room, user);
                    }
                    break;
                case 'disconnect':
                    if (userRoom.role === 'player') {
                        yield self.onUserDisconnect(engine, room, user);
                    }
                    else {
                        // spectator leave;
                        yield self.onSpectatorLeave(engine, room, user);
                    }
                    break;
                case 'relogin':
                        yield self.onUserRelogin(engine, room, user);
                    break;
                case 'timeout':
                    yield self.onUserTimeout(engine, room, data);
                    break;
            }

            log(`onMessage`, `complete, message ${message.type}, in room: ${room.id}`);

            //save room
            yield self.memory.saveRoom(room);

            return true;
        }).catch((e) => {
            err(`onMessage`, `error on message!
            message: ${JSON.stringify(message)},
            error: ${e.stack || e}`);
            // clear messages list
            return self.eventBus.emit(`system.close_room`, game, userRoom.roomId);
        });
    }

    onGameStart(engine, room) {
        return engine.onMessage(Engine.GAME_START, room, null, null);
    }

    onUserReady(engine, room, user, ready) {
        log(`onUserReady`, `roomId: ${room.id}, userId: ${user.userId} room: ${JSON.stringify(room.getDataToSave())}`);
        if (!room.isGameStateWaiting()) {
            wrn(`onUserReady`, `game already started!, ${room.roomId}, ${user.userId}`, 1);
            return Promise.resolve(true);
        }
        return engine.onMessage(Engine.USER_READY, room, user, ready);
    }

    onUserTurn(engine, room, user, turn) {
        let self = this, game = room.game, userId = user.userId;
        return co(function* () {
            if (!room.isGameStatePlaying()) {
                err(`onUserTurn`, `turn in not started game, room: ${room.id}, userId: ${user.userId}`, 1);
                yield self.sendError(game, user.userId, 'turn in not started game, room: ' + room.id);
                return false;
            }

            if (room.currentId !== userId) {
                err(`onUserTurn`, `not_your_turn, room: ${room.id}, userId: ${user.userId}`, 1);
                yield self.sendError(game, user.userId, 'not_your_turn, room: ' + room.id);
                return false;
            }

            if (turn.action === 'timeout' || turn.type || turn.nextPlayer || turn.userTurnTime) {
                wrn(`onUserTurn`, `usage some reserved properties in turn: ${turn}, ${userId}`, 1);
            }

            // remove server properties
            if (turn.action === 'timeout') {
                delete turn.action;
            }
            if (turn.userTurnTime) {
                delete turn.userTurnTime;
            }
            if (turn.nextPlayer) {
                delete turn.nextPlayer;
            }
            if (turn.type) {
                delete turn.type;
            }

            return engine.onMessage(Engine.USER_TURN, room, user, turn);
        });
    }

    onUserEvent(engine, room, user, event) {
        let game = room.game;
        if (!room.isGameStatePlaying()) {
            err(`onUserEvent`, `event in not started game room: ${room.id}, userId: ${user.userId}`, 1);
            this.sendError(game, user.userId, 'event in not started game room: ' + room.id);
            return Promise.resolve(false);
        }
        if (!event.type) {
            err(`onUserEvent`, `wrong event type,room: ${room.id}, user: ${user.userId}`, 1);
            this.sendError(game, user.userId, 'wrong event type room: ' + room.id);
            return Promise.resolve(false);
        }
        return engine.onMessage(Engine.USER_EVENT, room, user, event);
    }

    setTimeout(room, userId) {
        let time = room.getTurnTime(), game = room.game, userRoom = room.getPlayerRoom('player');
        log(`setTimeout`, `room: ${room.id}, ${userId}, ${room.currentId}, ${time}, ${room.timeout}`);
        setTimeout(()=> {
            this.onNewMessage({
                type: 'timeout',
                game: game,
                userRoom: userRoom,
                roomId: room.id,
                sender: 'server',
                data: {
                    turnStartTime: room.turnStartTime,
                    userId: userId,
                    roomId: room.id
                }
            });
        }, time);
        return Promise.resolve(true);
    }

    onUserTimeout(engine, room, timeout) {
        log(`onUserTimeout`, `room: ${room.id}, ${room.currentId}, ${room.turnStartTime},
        timeout: ${timeout.turnStartTime}, ${timeout.userId}`);
        if (!room.isGameStatePlaying()) {
            return Promise.resolve(false);
        }
        if (room.turnStartTime !== timeout.turnStartTime) {
            // old timeOut
            return Promise.resolve(false);
        } else {
            return this.memory.getUserSocket(room.game, timeout.userId).then((socket) => {
                if (socket) {
                    timeout.online = true;
                } else {
                    timeout.online = false;
                }
                return engine.onMessage(Engine.USER_TIMEOUT, room, {userId: timeout.userId}, timeout);
            });
        }
    }

    onUserLeave(engine, room, user) {
        log(`onUserLeave`, `user: ${user.userId}`);
        let self = this, game = room.game;

        if (!room.hasPlayer(user.userId)) {
            return Promise.resolve(false);
        }

        return co(function* () {
            yield engine.onMessage(Engine.USER_LEAVE, room, user);
            //yield self.server.leaveUserRoom(game, user.userId, room.id);
        });
    }

    onSpectatorLeave(engine, room, user) {
        let self = this, game = room.game;
        if (!room.leaveSpectator(user.userId)) {
            return Promise.resolve(false);
        }
        return co(function* () {
            yield self.eventBus.emit(`system.send_in_room`, room, {
                module: 'game_manager',
                type: 'spectator_leave',
                data: {
                    user: user.userId,
                    room: room.id
                }
            });
            // unset user current room
            yield self.eventBus.emit('system.leave_user_room', user.userId, room.id);
        });
    }

    onUserDisconnect(engine, room, user) {
        let self = this;
        log(`onUserDisconnect`, `room: ${room.id}, userId: ${user.userId}`);
        //return co(function* () {
            if (room.isGameStateWaiting()) {
                return self.onUserLeave(engine, room, user);
            } else {
                return Promise.resolve(true);
            }
            //TODO: engine on user disconnect
            //TODO send user offline
        //});
    }

    onUserRelogin(engine, room, user) {
        let self = this;
        return co(function* () {
            yield self.eventBus.emit(`system.send_to_user`,room.game, user.userId, {
                module: 'game_manager',
                type: 'game_restart',
                data: room.getGameData(user.userId)
            });
        });
    }

    sendUserReady(room, data) {
        return this.eventBus.emit(`system.send_in_room`, room, {
            module: 'game_manager',
            type: 'ready',
            data: data
        });
    }

    sendRoundStart(room) {
        return this.eventBus.emit(`system.send_in_room`, room, {
            module: 'game_manager',
            type: 'round_start',
            data: room.getInitData()
        });
    }

    sendUserTurn(room, userId, userTurn) {
        return this.eventBus.emit(`system.send_in_room`, room, {
            module: 'game_manager',
            type: 'turn',
            data: {user: userId, turn: userTurn}
        });
    }

    sendUserEvent(room, userId, event) {
        return this.eventBus.emit(`system.send_to_user`, room.game, userId, {
            module: 'game_manager',
            type: 'event',
            data: event
        });
    }

    sendEvent(room, event) {
        return this.eventBus.emit(`system.send_in_room`, room, {
            module: 'game_manager',
            type: 'event',
            data: event
        });
    }

    sendRoundEnd(room, result, players) {
        let self = this, game = room.game, mode = room.mode;
        return co(function* () {
            result.score = room.getScore();
            result.saveHistory = room.saveHistory;
            result.saveRating = room.saveRating;

            // TODO replace this in room
            for (let userId of room.players) {
                room.userData[userId].ready = false;
                room.userData[userId].timeouts = 0;
                room.userData[userId].takeBacks = 0;
            }

            yield self.saveGame(room, result);

            yield self.eventBus.emit(`system.send_in_room`, room, {
                module: 'game_manager',
                type: 'round_end',
                data: result
            });

            for (let playerId of room.players) {
                let socket = yield self.memory.getUserSocket(game, playerId);
                if (!socket) {
                    log(`sendRoundEnd`, `user: ${playerId} is offline, leave room`);
                    yield self.onNewMessage({
                        sender: 'server',
                        type: 'leave',
                        user: {userId: playerId},
                        game: game
                    }) ;
                }
            }

            //if (room.hasOnlinePlayer() || room.spectators.length > 0) // check room isn't empty
            //    try{ // users can leave room and room will be closed before round result send
            //        this.server.router.send({
            //            module: 'game_manager',
            //            type: 'round_end',
            //            target: room,
            //            data: result
            //        });
            //    } catch (e) {
            //        logger.err('GameManager.sendGameResult, err:', e, 1);
            //    }
            //else {
            //    logger.warn('GameManager.sendGameResult, room:', room.id, 'no players online', 1);
            //}
            //
            //if (callback) callback();
            //for (i = 0; i < room.players.length; i++) {
            //    if (!room.players[i].isConnected && !room.players[i].isRemoved) this.server.onUserLeave(room.players[i]);
            //}
        });
    }

    saveGame(room, result) {
        return Promise.resolve(result);
    }

    sendUserLeave(room, userId) {
        let self = this, game = room.game;
        return co(function* () {
            yield self.eventBus.emit(`system.send_in_room`,room, {
                module: 'game_manager',
                type: 'user_leave',
                data: userId
            });
        });
    }

    sendError(game, userId, error) {
        return this.eventBus.emit(`system.send_to_user`, game, userId, {
            module: 'game_manager',
            type: 'error',
            data: error
        });
    }
};