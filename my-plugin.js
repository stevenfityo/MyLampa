(function () {
    var UAKINO = 'https://uakino.best';

    function get(url, headers, onSuccess, onError) {
        var network = new Lampa.Reguest();
        network.timeout(20000);
        network['native'](url, onSuccess, function (a, c) {
            onError(network.errorDecode ? network.errorDecode(a, c) : 'request failed');
        }, false, headers || {});
    }

    function UakinoComponent(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
        var items = [];
        var html = $('<div class="category-full"></div>');
        var self = this;

        this.create = function () {
            this.activity.loader(true);
            
            var title = object.movie.title || object.movie.name || object.movie.original_title || '';
            
            var url = UAKINO + '/index.php?do=search&subaction=search&q=' + encodeURIComponent(title);
            get(url, {}, function (html_res) {
                var m = html_res.match(/href="(https?:\/\/uakino\.best\/[^"]+\.html)"/);
                if (m) {
                    self.loadFilm(m[1]);
                } else {
                    self.empty('Не знайдено на UAkino');
                }
            }, function(e) { self.empty(e); });
            
            return this.render();
        };

        this.loadFilm = function (filmUrl) {
            var idMatch = filmUrl.match(/\/(\d+)-[^/]+\.html/);
            if (!idMatch) { self.empty('news_id не знайдено в URL'); return; }
            var newsId = idMatch[1];

            var ajax = UAKINO + '/engine/ajax/playlists.php?news_id=' + newsId + '&xfield=playlist&time=' + Date.now();

            get(ajax, { 'X-Requested-With': 'XMLHttpRequest', 'Referer': filmUrl }, function (text) {
                var data;
                try { data = typeof text === 'string' ? JSON.parse(text) : text; }
                catch (e) { self.empty('playlists.php: невалідний JSON'); return; }

                var resp = (data && data.response) || '';
                
                var parsed_items = [];
                var re = /<li[^>]*data-file="([^"]+)"[^>]*>(.*?)<\/li>/gi;
                var mm;
                while ((mm = re.exec(resp)) !== null) {
                    var fileUrl = mm[1];
                    var name = mm[2].replace(/<[^>]+>/g, '').trim();
                    if (fileUrl.indexOf('ashdi') !== -1 || fileUrl.indexOf('video') !== -1 || fileUrl.indexOf('iframe') !== -1) {
                        parsed_items.push({ title: name, url: fileUrl });
                    }
                }

                if (parsed_items.length) {
                    self.build(parsed_items);
                } else {
                    self.empty('Відео-лінки не знайдено');
                }
            }, function(e) { self.empty(e); });
        };

        this.build = function (data) {
            this.activity.loader(false);
            
            if (!Lampa.Template.get('uakino_item', true)) {
                Lampa.Template.add('uakino_item', '<div class="online selector"><div class="online__body"><div class="online__title" style="padding-left: 1em;">{title}</div></div></div>');
            }

            data.forEach(function(item) {
                var el = Lampa.Template.get('uakino_item', item);
                el.on('hover:enter', function() {
                    self.playItem(item);
                });
                html.append(el);
                items.push(el);
            });
            
            scroll.append(html);
            Lampa.Controller.toggle('content');
        };

        this.playItem = function(item) {
            this.activity.loader(true);
            
            if (item.url.indexOf('ashdi') !== -1) {
                get(item.url, { 'Referer': UAKINO + '/' }, function (html_res) {
                    var matches = html_res.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/g);
                    if (matches && matches.length) {
                        var masterUrl = matches[0];
                        get(masterUrl, { 'Referer': 'https://ashdi.vip/' }, function (text) {
                            self.activity.loader(false);
                            var streams = [];
                            var lines = text.split('\n');
                            for (var i = 0; i < lines.length; i++) {
                                if (lines[i].indexOf('#EXT-X-STREAM-INF') === 0) {
                                    var res = lines[i].match(/RESOLUTION=\d+x(\d+)/);
                                    var label = res ? res[1] + 'p' : 'Stream ' + (streams.length + 1);
                                    var next = lines[i + 1] ? lines[i + 1].trim() : '';
                                    if (next && next.indexOf('#') !== 0) {
                                        var streamUrl = next.indexOf('http') === 0 ? next : masterUrl.replace(/\/[^/]+$/, '/') + next;
                                        streams.push({ title: label, url: streamUrl });
                                    }
                                }
                            }
                            if (!streams.length) streams.push({ title: 'Play', url: masterUrl });
                            self.showQualities(item, streams);
                        }, function () {
                            self.activity.loader(false);
                            self.showQualities(item, [{ title: 'Play', url: masterUrl }]);
                        });
                    } else {
                        self.activity.loader(false);
                        Lampa.Noty.show('m3u8 не знайдено на ashdi');
                    }
                }, function(e) {
                    self.activity.loader(false);
                    Lampa.Noty.show('Помилка ashdi: ' + e);
                });
            } else {
                self.activity.loader(false);
                Lampa.Noty.show('Запуск зовнішнього плеєра...');
                Lampa.Player.play({ title: item.title, url: item.url, movie: object.movie });
                Lampa.Player.playlist([{ title: item.title, url: item.url, movie: object.movie }]);
            }
        };

        this.showQualities = function(item, streams) {
            Lampa.Select.show({
                title: 'Якість: ' + item.title,
                items: streams.map(function (s) { return { title: s.title, stream: s }; }),
                onSelect: function (q) {
                    Lampa.Player.play({ title: item.title, url: q.stream.url, movie: object.movie });
                    Lampa.Player.playlist([{ title: item.title, url: q.stream.url, movie: object.movie }]);
                },
                onBack: function () { Lampa.Controller.toggle('content'); }
            });
        };

        this.empty = function (msg) {
            this.activity.loader(false);
            var empty = $('<div class="empty__title">' + msg + '</div>');
            html.append(empty);
            scroll.append(html);
        };

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () { Lampa.Controller.collectionSet(scroll.render()); },
                left: function () { if (navigator.control.left) navigator.control.left(); else Lampa.Controller.toggle('menu'); },
                right: function () { if (navigator.control.right) navigator.control.right(); },
                up: function () { if (navigator.control.up) navigator.control.up(); },
                down: function () { if (navigator.control.down) navigator.control.down(); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};
        this.render = function () { return scroll.render(); };
        this.destroy = function () {
            network.clear();
            scroll.destroy();
            html.remove();
            items = [];
        };
    }

    try {
        Lampa.Component.add('uakino', UakinoComponent);
    } catch(e) {}

    var button = '<div class="full-start__button selector view--uakino">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512" fill="currentColor">' +
        '<path d="M8 5v14l11-7z"/></svg>' +
        '<span>UAkino</span>' +
        '</div>';

    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite') return;

        var card = e.data && e.data.movie ? e.data.movie : {};
        var btn = $(button);

        btn.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: 'UAkino',
                component: 'uakino',
                movie: card,
                page: 1
            });
        });

        e.object.activity.render().find('.view--torrent').after(btn);
    });

})();
