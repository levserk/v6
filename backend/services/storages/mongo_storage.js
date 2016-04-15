'use strict';
let Storage = require('./storage.js'),
    MongoClient = require('mongodb').MongoClient,
    ObjectId = require('mongodb').ObjectID,
    co = require('co');

let moduleName = 'MongoStorage', logger, log, err, wrn;

module.exports = class MongoStorage extends Storage {
    constructor(server, conf) {
        logger = server.logger.getLogger(moduleName);
        log = logger.log;
        wrn = logger.wrn;
        err = logger.err;

        super(server, conf);

        this.databases = new Map();
        this.MAX_RANK = this.conf.maxRank || 10;
    }

    init() {
        let self = this;
        return self.initDatabases(self.conf.games);
    }

    initDatabases(games) {
        let self = this, db, mongoDb;
        return co(function* () {
            for (let game of Object.keys(games)) {
                db = Object.assign(self.conf.default, games[game]);
                db.database = game;
                if (!db.host || !db.port || !db.database) {
                    throw Error(`wrong mongo database parameters, host:${db.host}, port:${db.port}, database:${db.database}`);
                }
                mongoDb = yield MongoClient.connect('mongodb://' + db.host + ':' + db.port + '/' + db.database);
                self.databases.set(db.database, mongoDb);
            }
            self.isRunning = true;
            log(`initDatabases`, `db connected, count: ${self.databases.size}`, 1);
        });
    }

    getUserData(game, userId) {
        let data = {},
            db = this.databases.get(game);

        if (!db) {
            err(`getUserData`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        return db.collection(`users`).find({userId: userId}).limit(1).next().then((userData) => {
            data.userData = userData;
            return this.getSettings(game, userId);
        }).then((settings) => {
            data.settings = settings;
            return this.getBan(game, userId);
        }).then((ban) => {
            data.ban = ban || false;
            data.isBanned = data.ban !== false; // ????
            return data;
        }).catch((e) => {
            err(`getUserData`, `mongo error: ${e}`);
            return null;
        });
    }

    getRatings(game, mode, count, offset, column, sortDir, filter) {
        let timeStart = Date.now(), query = {}, sort = {}, db;

        db = this.databases.get(game);
        if (!db) {
            err(`getRatings`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        column = column !== 'dateCreate' ? `${mode}.${column}` : column;
        query[`${mode}.games`] = { '$gt': 0 };
        if (filter) {
            query['userName'] = { $regex: '^' + filter, $options: 'i' };
        }
        sort[column] = sortDir;

        return db.collection(`users`).find(query).sort(sort).skip(offset).limit(count).toArray()
            .then((docs) => {
                log(`getRatings`, `query: db.users.find(${JSON.stringify(query)})
                .sort(${JSON.stringify(sort)}).skip(${offset}).limit(${count})
                time: ${Date.now() - timeStart}`, 4);
                return docs;
            })
            .catch((e) => {
                err(`getRatings`, `mongo error: ${e}`);
                return null;
            });
    }

    getRanks(game, mode) {
        let db = this.databases.get(game);

        if (!db) {
            err(`getSettings`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        let query = {},
            sort = {},
            fields = {};
        //TODO: start game rank in conf
        query[`${mode}.ratingElo`] = {'$gte': 1600};
        sort[`${mode}.ratingElo`] = -1;
        fields.userId = 1;
        fields[`${mode}.ratingElo`] = 1;
        fields['_id'] = 0;

        return db.collection(`users`).find(query, fields).sort(sort).limit(this.MAX_RANK).toArray();
    }

    getSettings(game, userId) {
        let db = this.databases.get(game);

        if (!db) {
            err(`getSettings`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        return db.collection(`settings`).find({userId: userId}).limit(1).next();
    }

    saveUser(game, userData) {
        let db = this.databases.get(game);

        if (!db) {
            err(`saveUser`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        return db.collection('users').updateOne({userId: userData.userId}, userData, {upsert: true, w: 1}).then((result) => {
            log(`saveUser`, `userId: ${userData.userId}, update: ${result.modifiedCount}, insert: ${result.upsertedCount}`);
            return true;
        }).catch((e) => {
            err(`saveUser`, `mongo error: ${e.stack || e}`);
            return false;
        });
    }

    saveSettings(game, userId, settings) {
        let db = this.databases.get(game);

        if (!db) {
            err(`saveSettings`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        return db.collection('settings').updateOne({userId: userId}, {userId: userId, settings: settings}, {upsert: true, w: 1}).then((result) => {
            log(`saveSettings`, `userId: ${userId}, update: ${result.modifiedCount}, insert: ${result.upsertedCount}`);
            return true;
        }).catch((e) => {
            err(`saveSettings`, `mongo error: ${e.stack || e}`);
            return false;
        });
    }



    getHistory(game, userId, mode, count, offset, filter) {
        let self = this, timeStart = Date.now(), query = {}, sort, db;

        db = self.databases.get(game);
        if (!db) {
            err(`getHistory`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        query = { players: { $in: [userId] }, mode: mode };
        if (filter) {
            query['userData'] = { $regex: '"userName":"' + filter, $options: 'i' };
        }
        sort = { timeEnd: -1 };

        return co(function* () {
            let history = yield db.collection(`history`).find(query).sort(sort).skip(offset).limit(count).toArray();
            log(`getHistory`, `query: db.history.find(${JSON.stringify(query)})
                .sort(${JSON.stringify(sort)}).skip(${offset}).limit(${count})
                time: ${Date.now() - timeStart}`, 4);

            query = { userId: userId, mode: mode };
            sort = { time: -1 };
            // TODO: use timeStart and timeEnd from history
            let penalties = yield db.collection(`penalties`).find(query).sort(sort).skip(0).limit(100).toArray();
            log(`getHistory`, `query: db.penalties.find(${JSON.stringify(query)})
                .sort(${JSON.stringify(sort)}).skip(${offset}).limit(${count})
                time: ${Date.now() - timeStart}`, 4);
            return {
                history: history,
                penalties: penalties
            };
        }).catch((e) => {
            err(`getHistory`, `mongo error: ${e}`);
            return null;
        });
    }

    getGame(game, userId, gameId) {
        let self = this, timeStart = Date.now(), query = {}, db;

        db = self.databases.get(game);
        if (!db) {
            err(`getGame`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        query = { _id: new ObjectId(gameId) };

        return db.collection(`games`).find(query).next()
            .then((game) => {
                log(`getGame`, `query: db.games.find(${JSON.stringify(query)})
                time: ${Date.now() - timeStart}`, 4);
                return game;
            })
            .catch((e) => {
                err(`getGame`, `mongo error: ${e}`);
                return null;
            });
    }

    getUsersScore(game, users) {
        return Promise.resolve(null);
    }

    saveGame (game, save){
        let db = this.databases.get(game), historySave = false;

        if (!db) {
            err(`getSettings`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        return db.collection('games').insertOne(save).then((result) => {
            log(`saveGame`, `game saved, _id: ${result.insertedId}`);
            historySave = {
                    _id: result.insertedId,
                    timeStart: save.timeStart,
                    timeEnd: save.timeEnd,
                    players: save.players,
                    mode: save.mode,
                    winner: save.winner,
                    action: save.action,
                    userData: save.userData
                };
            return db.collection('history').insertOne(historySave);
        }).catch((e)=> {
            err(`saveGame`, `mongo error: ${e.stack || e}`);
            return false;
        });
    }



    getMessages(game, count, time, target, sender) {
        let self = this, timeStart = Date.now(), query = {}, sort, db;

        db = self.databases.get(game);
        if (!db) {
            err(`getMessages`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        query = { time: { $lt: time } };
        if (!sender) { // public
            query['target'] = target;
        }
        else { // private
            query['$or'] = [{ target: target, userId: sender }, { target: sender, userId: target }];
        }
        sort = { time: -1 };

        log(`getMessages`, `query: db.messages.find(${JSON.stringify(query)})`);

        return db.collection(`messages`).find(query).sort(sort).limit(count).toArray()
            .then((messages) => {
                log(`getMessages`, `query: db.messages.find(${JSON.stringify(query)})
                 .sort(${JSON.stringify(sort)}).limit(${count})
                time: ${Date.now() - timeStart}`, 4);
                return messages;
            })
            .catch((e) => {
                err(`getMessages`, `mongo error: ${e}`);
                return null;
            });
    }

    getBan(game, userId) {
        let db = this.databases.get(game);

        if (!db) {
            err(`getSettings`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        return db.collection(`bans`).find({userId: userId, timeEnd: {'$gt': Date.now()}}).limit(1).next();
    }

    saveMessage (game, message){
        let db = this.databases.get(game);

        if (!db) {
            err(`getSettings`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        return db.collection('messages').insertOne(message);
    }

    saveBan (game, userId, ban) {
        let db = this.databases.get(game);

        if (!db) {
            err(`saveBan`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        return db.collection('bans').insertOne(ban);
    }


    deleteMessage(game, id){
        let db = this.databases.get(game);

        if (!db) {
            err(`getSettings`, `game ${game} have not connection to db`, 1);
            return Promise.resolve(null);
        }

        return db.collection('messages').deleteOne({time: id});
    }
};
