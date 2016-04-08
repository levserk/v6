'use strict';

module.exports = {
    getWaitingUsers(game) {
        return this.hashGetAll(`waiting:${game}`).then((waiting) => {
            return waiting || {};
        });
    },

    removeInvites(game) {
        return this.del(`invites_current:${game}`);
    }
};
