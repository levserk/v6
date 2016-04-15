'use strict';

module.exports = class Storage {
    constructor(server, conf) {
        this.server = server;
        this.conf = conf;
        this.isRunnig = false;
    }

    init() {
        let self = this;
        return new Promise((res)=> {
            self.isRunnig = true;
            res(true);
        });
    }

    getUserData(game, userId) {
        return new Promise((res, rej) => {
            let data = {};
            data.ban = false;
            data.isBanned = data.ban !== false;
            data.settings = {};
            res(data);
        });
    }

    getRatings(game, mode, count, offset, column, order, filter) {
        return new Promise((res) => {
            res(null);
        });
    }

    getRanks(game, mode) {
        return Promise.resolve(null);
    }

    saveUser(game, userData) {
        return Promise.resolve(true);
    }

    saveSettings(game, userId, settings) {
        return Promise.resolve(true);
    }



    getHistory(game, userId, mode, count, offset, filter) {
        return new Promise((res) => {
            res(null);
        });
    }

    getGame(game, userId, gameId) {
        return new Promise((res) => {
            res(null);
        });
    }

    getUsersScore(game, users) {
        return Promise.resolve(null);
    }

    saveGame (game, save){
        this.games.push(save);
        return Promise.resolve(true);
    }



    getMessages(game, count, time, target, sender) {
        return new Promise((res) => {
            res(null);
        });
    }

    getBan(game, userId) {

    }

    saveMessage (game, message){
        return Promise.resolve(true);
    }

    saveBan (game, userId, ban){
        return Promise.resolve(true);
    }

    deleteMessage(game, id){
        return Promise.resolve(true);
    }
};