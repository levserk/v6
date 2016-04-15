'use strict';

let Manager = require('../../lib/manager.js');
let APIRequest = require('./httpRequest.js');

let moduleName = 'TransportManager';
let logger, log, err, wrn;
let co = require('co');

const SENDER_USER = 'user';
const SENDER_SERVER = 'server';

module.exports = class Transport extends Manager {

    constructor(server, conf) {
        logger = server.logger.getLogger(moduleName);
        log = logger.log;
        wrn = logger.wrn;
        err = logger.err;

        super(server, conf);

        this.server = server;
        this.apiRequest = new APIRequest(server, {});
        this.taskQueue = server.taskQueue;
        this.memory = server.memory;
        this.eventBus = server.eventBus;
        this.conf = conf;
        this.subscribes = new Map();
        this.isRunning = false;
        this.pendingTasks = 0;
        this.errors = 0;

        log('constructor', `${moduleName} created `, 3);
    }

    *init() {
        try {
            yield this.test();
            yield this.initEvents();
            this.isRunning = true;
            log(`init`, `init success`, 3);
        }
        catch (e) {
            this.isRunning = false;
            //TODO wrn api connect econnrefused
            err(`init, test error: ${e.stack}`, 1);
            throw Error(`test failed`);
        }
    }

    *test() {
        log(`test`, `start`);
        let path = `/test/testGame/?v1=1&v2=2`;
        let data = yield this.apiRequest.sendRequest(path, 'GET');
        log(`test`, `get path: ${path}, response: ${data.data}`);

        path = `/test/testGame/`;
        data = yield this.apiRequest.sendRequest(path, 'POST', {v1:1,v2:2});
        log(`test`, `post path: ${path}, response: ${data.result}`);

        log(`test`, `end`);
        return true;
    }

    *initEvents() {
        yield this.subscribe(`socket_send`, this.onSocketMessage.bind(this));
        yield this.subscribe(`socket_disconnect`, (message) => {
            if (message.socket) {
                return this.onSocketDisconnect(message.socket);
            }
            if (message.sockets) {
                let promises = [];
                for (let socketId of message.sockets) {
                    promises.push(this.onSocketDisconnect({
                        socketId: socketId,
                        serverId: message.serverId
                    }));
                }
                return Promise.all(promises);
            }
            return Promise.reject(`wrong task: ${JSON.stringify(message)}`);
        });

        this.eventBus.on(`system.send_to_socket`, (socket, message) => {
            return this.sendToSocket(socket, message);
        });

        this.eventBus.on(`system.send_to_sockets`, (game, message) => {
            return this.sendToSockets(game, message);
        });

        this.eventBus.on(`system.send_to_user`, (game, userId, message) => {
            return this.sendToUser(game, userId, message);
        });

        this.eventBus.on(`system.send_in_room`, (room, message) => {
            return this.sendInRoom(room, message);
        });

        this.eventBus.on(`system.load_user_data`, (game, userId) => {
            return this.apiRequest.sendRequest(`/users/${game}/user?userId=${userId}`, 'GET');
        });
        this.eventBus.on(`system.load_user_ranks`, (game, mode) => {
            return this.apiRequest.sendRequest(`/users/${game}/ranks?mode=${mode}`, 'GET');
        });
        this.eventBus.on(`system.save_user`, (game, user) => {
            return this.apiRequest.sendRequest(`/users/${game}/user?userId=${user.userId}`, 'POST', user.getDataToSend());
        });
        this.eventBus.on(`system.save_settings`, (game, userId, settings) => {
            return this.apiRequest.sendRequest(`/users/${game}/settings?userId=${userId}`, 'POST', settings);
        });
        this.eventBus.on(`system.save_game`, (game, result) => {
            return this.apiRequest.sendRequest(`/history/${game}/game`, 'POST', result);
        });
        this.eventBus.on(`system.save_chat_message`, (game, chatMessage) => {
            return this.apiRequest.sendRequest(`/chat/${game}/message`, 'POST', chatMessage);
        });
        this.eventBus.on(`system.save_ban`, (game, ban) => {
            return this.apiRequest.sendRequest(`/chat/${game}/ban`, 'POST', ban);
        });
        this.eventBus.on(`system.delete_chat_message`, (game, msgId) => {
            return this.apiRequest.sendRequest(`/chat/${game}/message?messageId=${msgId}`, 'DEL');
        });
    }

    onSocketMessage(task) {
        let self = this;
        log(`onSocketMessage`, `message: ${task.message}`);
        return co(function* () {
            let socket = task.socket,
                message = JSON.parse(task.message),
                socketData,
                user = null,
                game = null;

            if (typeof message.type !== "string" || typeof message.module !== "string" || !message.data || !message.target) {
                wrn('onSocketMessage', `wrong income message: ${message} socket: ${socket}`, 1);
                return false;
            }

            // get userId for this socket
            socketData = yield self.memory.getSocketData(socket.socketId);
            if (socketData) {
                user = {
                    userId: socketData['userId'],
                    userName: socketData['userName']
                };
                game = socketData['game'];
            }

            if (message.type === 'login') {
                if (user) {
                    wrn(`onSocketMessage`, `user ${user.userId}, ${user.userName} already auth in game ${game}`);
                    return false;
                }
                game = message.data.game;
                socket.userId = message.data.userId;
                if (!game || !socket.userId) {
                    wrn(`onSocketMessage`, ` can not login user ${socket.socketId}, message: ${JSON.stringify(message.data)}`);
                    return false;
                }
                message.game = game;
                message.user = socket;
                message.sender = SENDER_USER;
            } else {
                if (user && user.userId && game) {
                    message.game = game;
                    message.user = user;
                    message.sender = SENDER_USER;
                } else {
                    wrn(`onSocketMessage`, `user ${JSON.stringify(socket)} message ${message.type} without auth, game: ${game}, userId: ${user.userId}`);
                    return false;
                }
            }

            // deprecated message module names
            if (message.module === 'server') {
                message.module = 'user_manager';
            }
            if (message.module === 'game_manager'){
                message.module = 'room_manager';
            }

            let eventType = `${message.module}.action_${message.type}`;

            yield self.eventBus.emit(eventType, message);
        });
    }

    onSocketDisconnect(socket) {
        let self = this;
        log(`onSocketDisconnect`, `socket: ${socket.socketId}, serverId: ${socket.serverId}`);
        return co(function* () {
            let socketData = yield self.memory.getSocketData(socket.socketId);
            if (!socketData) {
                log(`onSocketDisconnect`, `no user for socket ${socket.socketId}`);
                return true;
            }

            yield self.memory.removeSocketData(socket.socketId);

            let eventType = `system.socket_disconnect`;

            yield self.eventBus.emit(eventType, {
                game: socketData.game,
                user: {
                    userId: socketData.userId,
                    userName: socketData.userName
                },
                sender: SENDER_SERVER,
                type: 'disconnect',
                data: socket
            });

            return true;
        });
    }

    sendToSockets(game, message) {
        let self = this;
        return co(function* () {
            if (typeof message !== "string") {
                message = JSON.stringify(message);
            }
            let sockets = yield self.memory.getGameSockets(game);
            log(`sendToSockets`, `game: ${game}, ${JSON.stringify(sockets)}`);
            for (let socket in sockets) {
                if (sockets.hasOwnProperty(socket)) {
                    yield self.sendToSocket(JSON.parse(sockets[socket]), message);
                }
            }
            return true;
        });
    }

    sendToSocket(socket, message) {
        //TODO: check socket server and id;
        log(`sendToSocket`, `socket:  ${JSON.stringify(socket)}, ${socket.serverId}`, 3);
        return this.publish(`send_to_socket_${socket.serverId}`, {
            socket: socket,
            //message: `{ "module": "server","type": "error","data": "${error}" }`
            message: message
        });
    }

    sendToUser(game, userId, message) {
        log(`sendToUser`, `userId:  ${userId}, game: ${game}`, 3);
        return this.memory.getUserSocket(game, userId)
            .then((socketData)=> {
                if (socketData) {
                    if (typeof message !== "string") {
                        message = JSON.stringify(message);
                    }
                    return this.publish(`send_to_socket_${socketData.serverId}`, {
                        socket: socketData,
                        message: message
                    });
                }
            });
    }

    sendInRoom(room, message) {
        let self = this, game = room.game;
        message = JSON.stringify(message);
        log(`sendInRoom`, `${game}, ${room.id}, message: ${message}`);
        return co(function*() {
            for (let userId of room.players) {
                yield self.sendToUser(game, userId, message);
            }
            for (let userId of room.spectators) {
                yield self.sendToUser(game, userId, message);
            }
            return true;
        });
    }
};