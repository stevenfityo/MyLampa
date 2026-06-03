(function () {
    'use strict';

    /**
     * UAkino online плагін для Lampa.
     *
     * Архітектура побудована за best-practice прикладу online_mod.js:
     *   - нативний UI (Explorer + Filter + Scroll);
     *   - коректна навігація пультом через Lampa.Controller + Navigator;
     *   - повна інтеграція з плеєром: Lampa.Player.play/playlist;
     *   - історія перегляду (Lampa.Favorite) та прогрес/відмітки (Lampa.Timeline);
     *   - реєстр джерел (sources registry) — зараз лише UAkino, але додати
     *     HDrezka / Kodik можна, дописавши новий модуль у масив `all_sources`.
     */

    var PREFIX = 'uakino_online';
    var UAKINO = 'https://uakino.best';

    // ----------------------------------------------------------------------
    // Допоміжні рядкові функції (ES5-safe, без залежностей)
    // ----------------------------------------------------------------------
    function startsWith(str, search) {
        return (str || '').lastIndexOf(search, 0) === 0;
    }

    /**
     * Обгортка над мережевим запитом Lampa. Повертає текст сторінки.
     * @param {Lampa.Reguest} network
     */
    function requestText(network, url, headers, onSuccess, onError) {
        network.clear();
        network.timeout(20000);
        network['native'](url, function (str) {
            onSuccess(str || '');
        }, function (a, c) {
            onError(network.errorDecode ? network.errorDecode(a, c) : 'request failed');
        }, false, {
            dataType: 'text',
            headers: headers || {}
        });
    }

    // ----------------------------------------------------------------------
    // Джерело: UAkino (uakino.best)
    // ----------------------------------------------------------------------
    function uakino(component, object) {
        var network = new Lampa.Reguest();
        var select_title = '';

        /**
         * Старт пошуку. Викликається головним компонентом.
         * Знаходить сторінку фільму → news_id → плейлист.
         */
        this.search = function (movie_object) {
            object = movie_object || object;
            select_title = object.search || object.movie.title || object.movie.name ||
                object.movie.original_title || object.movie.original_name || '';

            if (!select_title) {
                component.empty('Немає назви для пошуку');
                return;
            }

            var url = UAKINO + '/index.php?do=search&subaction=search&q=' + encodeURIComponent(select_title);

            requestText(network, url, {}, function (html) {
                var m = html.match(/href="(https?:\/\/uakino\.best\/[^"]+\.html)"/);
                if (m) {
                    loadFilm(m[1]);
                } else {
                    component.emptyForQuery(select_title);
                }
            }, function (e) {
                component.empty(e);
            });
        };

        /**
         * Завантажує сторінку фільму, дістає news_id і тягне плейлист.
         */
        function loadFilm(filmUrl) {
            var idMatch = filmUrl.match(/\/(\d+)-[^/]+\.html/);
            if (!idMatch) {
                component.empty('news_id не знайдено в URL');
                return;
            }

            var newsId = idMatch[1];
            var ajax = UAKINO + '/engine/ajax/playlists.php?news_id=' + newsId +
                '&xfield=playlist&time=' + Date.now();

            requestText(network, ajax, {
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': filmUrl
            }, function (text) {
                var data;
                try {
                    data = typeof text === 'string' ? JSON.parse(text) : text;
                } catch (e) {
                    data = null;
                }

                var resp = (data && data.response) || '';
                var items = parsePlaylist(resp, filmUrl);

                if (items.length) {
                    component.draw(items);
                } else {
                    component.empty('Відео-лінки не знайдено');
                }
            }, function (e) {
                component.empty(e);
            });
        }

        /**
         * Парсить HTML плейлиста у плоский список елементів.
         * Кожен елемент → один файл/озвучення/серія.
         */
        function parsePlaylist(resp, filmUrl) {
            var items = [];
            var re = /<li[^>]*data-file="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;
            var mm;

            while ((mm = re.exec(resp)) !== null) {
                var fileUrl = mm[1];
                var name = mm[2].replace(/<[^>]+>/g, '').trim();

                if (startsWith(fileUrl, '//')) {
                    fileUrl = 'https:' + fileUrl;
                } else if (startsWith(fileUrl, '/')) {
                    fileUrl = UAKINO + fileUrl;
                }

                var looksLikeVideo = fileUrl.indexOf('ashdi') !== -1 ||
                    fileUrl.indexOf('video') !== -1 ||
                    fileUrl.indexOf('iframe') !== -1 ||
                    fileUrl.indexOf('.mp4') !== -1 ||
                    fileUrl.indexOf('.m3u8') !== -1 ||
                    startsWith(fileUrl, 'http');

                if (looksLikeVideo) {
                    items.push({
                        title: name || select_title,
                        url: fileUrl,
                        referer: filmUrl
                    });
                }
            }

            return items;
        }

        /**
         * Отримати фінальний потік для елемента.
         * Резолвить iframe/плеєр-сторінку → m3u8 (з мапою якостей) або mp4.
         * @param {function} call  - call(element) коли element.stream готовий
         * @param {function} error
         */
        this.getStream = function (element, call, error) {
            if (element.stream) return call(element);

            // Прямі посилання — віддаємо одразу.
            if (element.url.indexOf('.m3u8') !== -1 || element.url.indexOf('.mp4') !== -1) {
                element.stream = element.url;
                return call(element);
            }

            requestText(network, element.url, { 'Referer': element.referer || (UAKINO + '/') }, function (html) {
                // 1) Прямий master.m3u8 на сторінці плеєра.
                var m3u8 = html.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/g);
                if (m3u8 && m3u8.length) {
                    resolveM3U8(m3u8[0], element, call, error);
                    return;
                }

                // 2) mp4.
                var mp4 = html.match(/https?:\/\/[^"'\s]*\.mp4[^"'\s]*/g);
                if (mp4 && mp4.length) {
                    element.stream = mp4[0];
                    return call(element);
                }

                // 3) "file":"..." всередині конфігу плеєра.
                var fileMatch = html.match(/"file"\s*:\s*"([^"]+)"/);
                if (fileMatch) {
                    var fileUrl = fileMatch[1].replace(/\\/g, '');
                    if (startsWith(fileUrl, '//')) {
                        fileUrl = 'https:' + fileUrl;
                    } else if (startsWith(fileUrl, '/')) {
                        var domain = element.url.match(/^(https?:\/\/[^\/]+)/);
                        if (domain) fileUrl = domain[1] + fileUrl;
                    }

                    if (fileUrl.indexOf('.m3u8') !== -1) {
                        resolveM3U8(fileUrl, element, call, error);
                        return;
                    }
                    if (fileUrl.indexOf('.mp4') !== -1 || startsWith(fileUrl, 'http')) {
                        element.stream = fileUrl;
                        return call(element);
                    }
                }

                error();
            }, function () {
                error();
            });
        };

        /**
         * Завантажує master.m3u8 і будує мапу якостей {label: url}.
         */
        function resolveM3U8(masterUrl, element, call, error) {
            requestText(network, masterUrl, { 'Referer': element.url }, function (text) {
                var quality = {};
                var lines = text.split('\n');

                for (var i = 0; i < lines.length; i++) {
                    if (lines[i].indexOf('#EXT-X-STREAM-INF') === 0) {
                        var res = lines[i].match(/RESOLUTION=\d+x(\d+)/);
                        var label = res ? res[1] + 'p' : 'Auto';
                        var next = lines[i + 1] ? lines[i + 1].trim() : '';
                        if (next && next.indexOf('#') !== 0) {
                            var streamUrl = startsWith(next, 'http') ? next :
                                masterUrl.replace(/\/[^/]+$/, '/') + next;
                            quality[label] = streamUrl;
                        }
                    }
                }

                element.stream = masterUrl;
                if (Object.keys(quality).length) element.qualitys = quality;
                call(element);
            }, function () {
                // Майстер не вдалось розпарсити — віддаємо як є.
                element.stream = masterUrl;
                call(element);
            });
        }

        // Заглушки для уніфікованого інтерфейсу джерела.
        this.reset = function () {};
        this.filter = function () {};
        this.destroy = function () {
            network.clear();
            network = null;
        };
    }

    // ----------------------------------------------------------------------
    // Головний компонент: UI, навігація, плеєр
    // ----------------------------------------------------------------------
    function component(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var last;

        // -------- реєстр джерел (готовий до розширення) --------
        var all_sources = [{
            name: 'uakino',
            title: 'UAkino',
            source: new uakino(this, object)
        }];
        var source_names = all_sources.map(function (s) { return s.name; });
        var sources = {};
        all_sources.forEach(function (s) { sources[s.name] = s.source; });

        var balanser = Lampa.Storage.get(PREFIX + '_balanser', source_names[0]) + '';
        if (source_names.indexOf(balanser) === -1) balanser = source_names[0];

        scroll.body().addClass('torrent-list');
        scroll.minus(files.render().find('.explorer__files-head'));

        // ---------------- Життєвий цикл ----------------
        this.create = function () {
            var _this = this;
            this.activity.loader(true);

            filter.onSearch = function (value) {
                Lampa.Activity.replace({ search: value, clarification: true });
            };
            filter.onBack = function () { _this.start(); };
            filter.onSelect = function (type, a, b) {
                if (type === 'sort') {
                    _this.changeBalanser(a.source);
                } else if (type === 'filter' && a.stype === 'source') {
                    _this.changeBalanser(source_names[b.index]);
                } else if (type === 'filter' && a.reset) {
                    _this.start();
                }
            };

            filter.render().find('.filter--sort span').text('Балансер');
            files.appendHead(filter.render());
            files.appendFiles(scroll.render());

            this.search();
            return this.render();
        };

        this.search = function () {
            this.activity.loader(true);
            this.buildFilter();
            this.reset();
            sources[balanser].search(object);
        };

        this.changeBalanser = function (name) {
            if (source_names.indexOf(name) === -1) return;
            balanser = name;
            Lampa.Storage.set(PREFIX + '_balanser', balanser);
            this.search();
            setTimeout(this.closeFilter, 10);
        };

        // ---------------- Фільтр (балансер) ----------------
        this.buildFilter = function () {
            var source_titles = all_sources.map(function (s) { return s.title; });

            filter.set('filter', [{
                title: Lampa.Lang.translate('torrent_parser_reset'),
                reset: true
            }, {
                title: 'Балансер',
                subtitle: source_titles[source_names.indexOf(balanser)],
                stype: 'source',
                items: source_titles.map(function (title, i) {
                    return { title: title, selected: source_names[i] === balanser, index: i };
                })
            }]);

            filter.set('sort', all_sources.map(function (s) {
                return { source: s.name, title: s.title, selected: s.name === balanser };
            }));

            var current = all_sources[source_names.indexOf(balanser)];
            filter.chosen('sort', [current ? current.title : balanser]);
        };

        this.closeFilter = function () {
            if ($('body').hasClass('selectbox--open')) Lampa.Select.close();
        };

        // ---------------- Малювання списку ----------------
        this.reset = function () {
            last = false;
            scroll.clear();
        };

        /**
         * Малює список елементів від джерела з прогрес-баром, відмітками
         * перегляду, контекст-меню та запуском плеєра.
         */
        this.draw = function (items) {
            var _this = this;
            this.reset();

            var viewed = Lampa.Storage.cache('online_view', 5000, []);

            items.forEach(function (element) {
                if (!element.quality) element.quality = '';
                if (!element.info) element.info = '';

                var hash = Lampa.Utils.hash([
                    (object.movie.original_title || object.movie.original_name || ''),
                    element.title, balanser
                ].join(''));
                var hash_file = hash;
                var view = Lampa.Timeline.view(hash);

                var item = Lampa.Template.get(PREFIX + '_item', element);
                element.timeline = view;
                item.append(Lampa.Timeline.render(view));

                if (Lampa.Timeline.details) {
                    item.find('.online__quality').append(Lampa.Timeline.details(view, ' / '));
                }

                if (viewed.indexOf(hash_file) !== -1) {
                    item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                }

                item.on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });

                item.on('hover:enter', function () {
                    if (element.loading) return;
                    element.loading = true;
                    _this.activity.loader(true);

                    if (object.movie.id) Lampa.Favorite.add('history', object.movie, 100);

                    sources[balanser].getStream(element, function (el) {
                        el.loading = false;
                        _this.activity.loader(false);
                        _this.play(el, hash_file, item, viewed);
                    }, function () {
                        element.loading = false;
                        _this.activity.loader(false);
                        Lampa.Noty.show('Не вдалося знайти відео-потік');
                    });
                });

                _this.contextmenu(item, view, viewed, hash_file);
                scroll.append(item);
            });

            this.start(true);
        };

        /**
         * Запуск плеєра + плейлист + відмітка перегляду.
         */
        this.play = function (element, hash_file, item, viewed) {
            var first = {
                url: getDefaultQuality(element.qualitys, element.stream),
                quality: element.qualitys,
                timeline: element.timeline,
                title: element.title
            };

            Lampa.Player.play(first);
            Lampa.Player.playlist([first]);

            if (viewed.indexOf(hash_file) === -1) {
                viewed.push(hash_file);
                item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                Lampa.Storage.set('online_view', viewed);
            }
        };

        // ---------------- Контекст-меню (довге натискання) ----------------
        this.contextmenu = function (item, view, viewed, hash_file) {
            item.on('hover:long', function () {
                var enabled = Lampa.Controller.enabled().name;
                var menu = [
                    { title: 'Скинути час перегляду', timeclear: true }
                ];

                if (viewed.indexOf(hash_file) !== -1) {
                    menu.unshift({ title: 'Прибрати відмітку перегляду', clearmark: true });
                } else {
                    menu.unshift({ title: 'Позначити переглянутим', mark: true });
                }

                Lampa.Select.show({
                    title: Lampa.Lang.translate('title_action'),
                    items: menu,
                    onBack: function () { Lampa.Controller.toggle(enabled); },
                    onSelect: function (a) {
                        if (a.mark) {
                            viewed.push(hash_file);
                            item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_star', {}, true) + '</div>');
                            Lampa.Storage.set('online_view', viewed);
                        }
                        if (a.clearmark) {
                            Lampa.Arrays.remove(viewed, hash_file);
                            Lampa.Storage.set('online_view', viewed);
                            item.find('.torrent-item__viewed').remove();
                        }
                        if (a.timeclear) {
                            view.percent = 0;
                            view.time = 0;
                            view.duration = 0;
                            Lampa.Timeline.update(view);
                        }
                        Lampa.Controller.toggle(enabled);
                    }
                });
            });
        };

        // ---------------- Порожні стани ----------------
        this.empty = function (msg) {
            var empty = Lampa.Template.get('list_empty');
            if (msg) empty.find('.empty__descr').text(msg);
            scroll.clear();
            scroll.append(empty);
            this.activity.loader(false);
            this.start();
        };

        this.emptyForQuery = function (query) {
            this.empty('За запитом "' + query + '" нічого не знайдено');
        };

        // ---------------- Навігація (виправлено: Controller + Navigator) ----------------
        this.start = function (first) {
            if (Lampa.Activity.active().activity !== this.activity) return;

            if (first) {
                last = scroll.render().find('.selector').eq(0)[0];
            }

            Lampa.Background.immediately(Lampa.Utils.cardImgBackground(object.movie));

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    if (Navigator.canmove('down')) Navigator.move('down');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                    else filter.show(Lampa.Lang.translate('title_filter'), 'filter');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: this.back
            });

            this.activity.loader(false);
            Lampa.Controller.toggle('content');
        };

        this.back = function () {
            Lampa.Activity.backward();
        };

        this.render = function () {
            return files.render();
        };

        this.pause = function () {};
        this.stop = function () {};

        this.destroy = function () {
            network.clear();
            all_sources.forEach(function (s) { s.source.destroy(); });
            files.destroy();
            scroll.destroy();
            network = null;
        };
    }

    /**
     * Обирає посилання найближчої до бажаної якості з мапи {label: url}.
     */
    function getDefaultQuality(qualityMap, defValue) {
        if (!qualityMap) return defValue;

        var preferably = (Lampa.Storage.get('video_quality_default', '1080') + 'p');
        var order = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
        var idx = order.indexOf(preferably);

        if (idx !== -1) {
            for (var i = idx; i < order.length; i++) {
                if (qualityMap[order[i]]) return qualityMap[order[i]];
            }
            for (var j = idx - 1; j >= 0; j--) {
                if (qualityMap[order[j]]) return qualityMap[order[j]];
            }
        }

        for (var label in qualityMap) {
            if (qualityMap[label]) return qualityMap[label];
        }

        return defValue;
    }

    // ----------------------------------------------------------------------
    // Шаблони, кнопка, реєстрація
    // ----------------------------------------------------------------------
    function addTemplates() {
        Lampa.Template.add(PREFIX + '_item',
            '<div class="online selector">' +
                '<div class="online__body">' +
                    '<div style="position:absolute;left:0;top:-0.3em;width:2.4em;height:2.4em">' +
                        '<svg style="height:2.4em;width:2.4em;" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                            '<circle cx="64" cy="64" r="56" stroke="white" stroke-width="16"/>' +
                            '<path d="M90.5 64.3827L50 87.7654L50 41L90.5 64.3827Z" fill="white"/>' +
                        '</svg>' +
                    '</div>' +
                    '<div class="online__title" style="padding-left:2.1em;">{title}</div>' +
                    '<div class="online__quality" style="padding-left:3.4em;">{quality}{info}</div>' +
                '</div>' +
            '</div>');
    }

    function openActivity(movie) {
        Lampa.Component.add(PREFIX, component);
        Lampa.Activity.push({
            url: '',
            title: 'UAkino',
            component: PREFIX,
            search: movie.title || movie.name,
            movie: movie,
            page: 1
        });
    }

    function startPlugin() {
        if (window.uakino_online_plugin) return;
        window.uakino_online_plugin = true;

        addTemplates();
        Lampa.Component.add(PREFIX, component);

        var button =
            '<div class="full-start__button selector view--uakino_online">' +
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512" fill="currentColor">' +
                    '<path d="M8 5v14l11-7z"/>' +
                '</svg>' +
                '<span>UAkino</span>' +
            '</div>';

        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;

            var movie = (e.data && e.data.movie) ? e.data.movie : {};
            var btn = $(button);

            btn.on('hover:enter', function () {
                openActivity(movie);
            });

            var root = e.object.activity.render();
            var anchor = root.find('.view--torrent');
            if (anchor.length) anchor.after(btn);
            else root.find('.full-start__buttons').append(btn);
        });
    }

    if (window.Lampa) {
        startPlugin();
    } else {
        var iv = setInterval(function () {
            if (window.Lampa) {
                clearInterval(iv);
                startPlugin();
            }
        }, 200);
    }

})();
