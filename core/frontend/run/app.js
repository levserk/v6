require(['require-cnf'], function () {
    require(['../lib/jquery-ui'], function () {
        require(['main.js'], function (Client) {
            console.log('app start');

            var settingsTemplate = '<div><p>Цвет</p> <div> <label><input type="radio" name="color" value="red" >красный</label> <label><input type="radio" name="color" value="black" >черный</label> </div> </div> <p>Настройки игры</p> <div> <div class="option"> <label><input type="checkbox" name="sounds"> Включить звук</label> </div> <div class="option"> <label><input type="checkbox" name="disableInvite"> Запретить приглашать меня в игру</label> </div></div>';

            var userId = getCookie('userId') || Math.floor(Math.random()*10000);
            var userName = 'Гость ' + userId;
            var sign = userId + userName;
            var user = {
                userId: userId,
                userName: userName,
                sign: sign
            };
            window.$ = jQuery;
            window.LogicGame = {isSuperUser:function(){return true;}};

            window._client = new Client({
                game: 'test2',
                port: 8078,
                resultDialogDelay: 1000,
                autoShowProfile: true,
                idleTimeout: 0,
                shortGuestNames: false,
                newGameFormat: true,
                showSpectators: true,
                api: '//localhost:8080/',
                getUserParams: function(){
                    var inviteData = {
                        gameType:'Main Mode',
                        val: Math.random()* 1000 ^ 0
                    };
                    console.log('TEST!', inviteData);
                    return inviteData
                },
                generateInviteOptionsText: function(invite){
                    return ' в игру ' + invite.data.gameType
                },
                //generateInviteGameText: function(moed, locale){
                //    return 'режим ' + locale;
                //},
                initRating: function(conf, client){
                    conf.columns.splice(conf.columns.length-1, 0, {
                        id:'score', source:'score', title: client.locale.rating.columns.score, canOrder:true, undef: 100,
                        func: function(value) { return value * 10 }
                    });
                    return conf;
                },
                initHistory: function(conf, client){
                    conf.columns.push({
                        id:'score', source:'score', title: client.locale.history.columns.score, undef: 100
                    });
                    return conf;
                },
                generatePenaltyText: function(penalty){
                    if (penalty.type == 1){
                        return 'штраф за отсутствие игр в ' + Math.abs(penalty.value) + ' очков';
                    }
                    return '';
                },
                blocks:{
                    historyId: 'ratingDiv'
                },
                sounds: {
                        start: {
                            src: 'audio/v6-game-start.ogg'
                        },
                        turn: {
                            src: 'audio/v6-game-turn.ogg',
                            volume: 0.5,
                            enable: false
                        },
                        win: {
                            src: 'audio/v6-game-win.ogg'
                        },
                        lose: {
                            src: 'audio/v6-game-lose.ogg'
                        },
                        invite: {
                            src: 'audio/v6-invite.ogg'
                        },
                        timeout: {
                            src: 'audio/v6-timeout.ogg'
                        }
                },
                settings:{
                    color: 'red',
                    sounds: true
                },
                settingsTemplate: settingsTemplate,
                lang: 'ru',
                localization: {
                    "ru": {
                        "history": {
                            "columns": {
                                "score": "Очки"
                            }
                        },
                        "rating": {
                          "columns": {
                              "score": "Очки"
                          }
                        },
                        "modes": {
                            "mode_1": "Режим №1"
                        }
                    }
                }
            }).init(user);

            var _client = window._client;
            _client.on('login', function(data){
                console.log('main;', 'login', data.userId, data.userName);
                var you =  _client.getPlayer();
            });

            _client.gameManager.on('game_start', function(data){
                console.log('main;','game_start, room: ', data);
            });

            _client.gameManager.on('round_start', function(data){
                console.log('main;','round_start, room: ', data);
            });

            _client.gameManager.on('turn', function(data){
                console.log('main;','turn', data);
                if (Math.random()> 0.8) {
                    throw Error('test turn error');
                }
            });

            _client.gameManager.on('switch_player', function(data){
                console.log('main;','switch_player', 'next: ', data, 'your next: ', data.userId == _client.getPlayer().userId);
            });

            _client.gameManager.on('event', function(data){
                console.log('main;','event', data);
            });

            _client.gameManager.on('timeout', function(data){
                console.log('main;','timeout', 'user: ', data.user, 'is your timeout: ', data.user == _client.getPlayer());
            });

            _client.gameManager.on('round_end', function(data){
                console.log('main;','round_end', data, 'your win: ', data.winner == _client.getPlayer().userId);
            });

            _client.gameManager.on('game_leave', function(data){
                console.log('main;','game_leave room:', data);
            });

            _client.gameManager.on('game_load', function(data){
                console.log('main;','game_loaded, game history:', data);
            });

            _client.gameManager.on('take_back', function(data){
                console.log('main;','take_back user: ', data.user, 'history:', data.history);
            });

            _client.gameManager.on('time', function(data){
                var html = (data.user ? ((data.user.isPlayer ? 'Ваш ход' : 'Ход соперника')) : 'Time: ') + ' ' + data.userTimeFormat;
                html += '<br>';
                html += 'мое общее время: ' + data.userTotalTime.timeFormat;
                html += '<br>';
                html += 'Общее время: ' + data.totalTime.timeFormat;
                html += 'Время раунда: ' + data.roundTime.timeFormat;
                $('#time').html(html)
            });


            _client.gameManager.on('focus', function(data){
               //console.log('main;', 'user changed window focus, window has focus:', data.windowHasFocus, ' user: ', data.user);
            });


            _client.historyManager.on('game_load', function(game){
                console.log('main;','history game loaded, game:', game);
            });

            _client.on('show_profile', function(data){
                console.log('main;','show_profile user:', data);
            });

            _client.on('settings_changed', function(data){
                console.log('main;','settings_changed property:', data);
            });

            _client.on('settings_saved', function(data){
                console.log('main;','settings_changed settings:', data);
            });

            _client.on('full_screen', function(data){
                console.log('main;','fullscreen', data);
            });

            _client.soundManager.on('play', function(sound){
                console.log(sound);
            });


            // send events buttons example
            _generateEndGameBtn();

            function _generateEndGameBtn() {
                var bdiv = $('<div>');
                bdiv.addClass('v6-buttons');
                $('body').append(bdiv);

                var div = $('<div>');
                div.attr('id', 'endGameButton');
                div.html('<span>Выйти из игры</span>');
                div.on('click', function () {
                    window._client.gameManager.leaveGame();
                });
                bdiv.append(div);

                div = $('<div>');
                div.attr('id', 'drawButton');
                div.html('<span>Предложить ничью</span>');
                div.on('click', function () {
                    window._client.gameManager.sendDraw();
                });
                bdiv.append(div);

                div = $('<div>');
                div.attr('id', 'winButton');
                div.html('<span>Победный ход</span>');
                div.on('click', function () {
                    window._client.gameManager.sendTurn({result:1});
                });
                bdiv.append(div);

                div = $('<div>');
                div.attr('id', 'ratingButton');
                div.html('<span>Показать рейтинг</span>');
                div.on('click', function () {
                    window._client.ratingManager.getRatings();
                });
                bdiv.append(div);

                div = $('<div>');
                div.attr('id', 'historyButton');
                div.html('<span>Показать историю</span>');
                div.on('click', function () {
                    window._client.historyManager.getHistory(false, false, false);
                });
                bdiv.append(div);

                div = $('<div>');
                div.html('<span>Передать ход</span>');
                div.on('click', function () {
                    window._client.gameManager.sendTurn({'switch': true});
                });
                bdiv.append(div);

                div = $('<div>');
                div.html('<span>Сделать ход</span>');
                div.on('click', function () {
                    window._client.gameManager.sendTurn({'t': (new Date).getSeconds});
                });
                bdiv.append(div);

                div = $('<div>');
                div.html('<span>ход назад</span>');
                div.on('click', function () {
                    window._client.gameManager.sendTakeBack();
                });
                bdiv.append(div);

                div = $('<div>');
                div.attr('id', 'time');
                bdiv.append(div);

            }

            function getCookie(c_name)
            {
                if (document.cookie.length>0)
                {
                    c_start=document.cookie.indexOf(c_name + "=");
                    if (c_start!=-1)
                    {
                        c_start=c_start + c_name.length+1;
                        c_end=document.cookie.indexOf(";",c_start);
                        if (c_end==-1) c_end=document.cookie.length;
                        return unescape(document.cookie.substring(c_start,c_end));
                    }
                }
                return "";
            }
        });
    });
});