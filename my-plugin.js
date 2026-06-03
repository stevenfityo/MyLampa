(function () {
    'use strict';

    var UAKINO = 'https://uakino.best';

    // ------------------------------------------------------------------
    // Мережевий запит через нативний механізм Lampa (обхід CORS)
    // ------------------------------------------------------------------
    function fetchText(url, headers, onSuccess, onError) {
        var net = new Lampa.Reguest();
        net.timeout(20000);
        net['native'](url, function (str) {
            onSuccess(str || '');
        }, function (a, c) {
            onError(net.errorDecode ? net.errorDecode(a, c) : 'network error');
        }, false, {
            dataType: 'text',
            headers: headers || {}
        });
    }

    // ------------------------------------------------------------------
    // Парсинг master.m3u8 → список якостей [{title, url}]
    // ------------------------------------------------------------------
    function parseM3U8(masterUrl, referer, callback) {
        fetchText(masterUrl, { 'Referer': referer }, function (text) {
            var qualities = [];
            var lines = text.split('\n');
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].indexOf('#EXT-X-STREAM-INF') === 0) {
                    var res = lines[i].match(/RESOLUTION=\d+x(\d+)/);
                    var label = res ? res[1] + 'p' : 'Auto';
                    var next = (lines[i + 1] || '').trim();
                    if (next && next[0] !== '#') {
                        var streamUrl = /^https?:/.test(next) ? next
                            : masterUrl.replace(/\/[^\/]+$/, '/') + next;
                        qualities.push({ title: label, url: streamUrl });
                    }
                }
            }
            if (!qualities.length) qualities.push({ title: 'Грати', url: masterUrl });
            callback(qualities);
        }, function () {
            callback([{ title: 'Грати', url: masterUrl }]);
        });
    }

    // ------------------------------------------------------------------
    // Визначити фінальний URL потоку зі сторінки плеєра
    // ------------------------------------------------------------------
    function resolveStream(pageUrl, referer, callback, onError) {
        // Прямі посилання — одразу повертаємо
        if (/\.mp4(\?|$)/i.test(pageUrl)) return callback([{ title: 'Грати', url: pageUrl }]);
        if (/\.m3u8(\?|$)/i.test(pageUrl)) return parseM3U8(pageUrl, referer, callback);

        fetchText(pageUrl, { 'Referer': referer }, function (html) {
            // 1. m3u8 URL прямо в HTML
            var m3u8 = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
            if (m3u8) return parseM3U8(m3u8[0], pageUrl, callback);

            // 2. mp4 URL прямо в HTML
            var mp4 = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/);
            if (mp4) return callback([{ title: 'Грати', url: mp4[0] }]);

            // 3. "file":"..." у конфігу плеєра
            var fileM = html.match(/"file"\s*:\s*"([^"]+)"/);
            if (fileM) {
                var fu = fileM[1].replace(/\\/g, '');
                if (fu.indexOf('//') === 0) fu = 'https:' + fu;
                else if (fu[0] === '/') fu = pageUrl.replace(/^(https?:\/\/[^\/]+).*/, '$1') + fu;

                if (/\.m3u8/i.test(fu)) return parseM3U8(fu, pageUrl, callback);
                return callback([{ title: 'Грати', url: fu }]);
            }

            onError('Відео-потік не знайдено на сторінці');
        }, onError);
    }

    // ------------------------------------------------------------------
    // Пошук фільму на UAkino → news_id → плейлист → стріми
    // ------------------------------------------------------------------
    function searchAndPlay(movie) {
        var title = movie.title || movie.name || movie.original_title || '';
        if (!title) return Lampa.Noty.show('Назва фільму не визначена');

        Lampa.Loading && Lampa.Loading.start ? Lampa.Loading.start() : null;

        var searchUrl = UAKINO + '/index.php?do=search&subaction=search&q=' + encodeURIComponent(title);

        fetchText(searchUrl, {}, function (html) {
            // Знаходимо перше посилання на сторінку фільму
            var m = html.match(/href="(https?:\/\/uakino\.best\/[^"]+\.html)"/);
            if (!m) {
                stopLoading();
                return Lampa.Noty.show('UAkino: фільм не знайдено — "' + title + '"');
            }

            var filmUrl = m[1];
            var idM = filmUrl.match(/\/(\d+)-[^\/]+\.html/);
            if (!idM) {
                stopLoading();
                return Lampa.Noty.show('UAkino: не вдалось визначити ID фільму');
            }

            var newsId = idM[1];
            var playlistUrl = UAKINO + '/engine/ajax/playlists.php?news_id=' + newsId +
                '&xfield=playlist&time=' + Date.now();

            fetchText(playlistUrl, {
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': filmUrl
            }, function (text) {
                var data;
                try { data = JSON.parse(text); } catch (e) { data = null; }

                var resp = (data && data.response) || '';
                var streams = parsePlaylistItems(resp, filmUrl);

                stopLoading();

                if (!streams.length) {
                    return Lampa.Noty.show('UAkino: стріми не знайдено');
                }

                showStreamList(streams, movie, filmUrl);
            }, function (e) {
                stopLoading();
                Lampa.Noty.show('UAkino: помилка плейлиста — ' + e);
            });
        }, function (e) {
            stopLoading();
            Lampa.Noty.show('UAkino: помилка пошуку — ' + e);
        });
    }

    // ------------------------------------------------------------------
    // Парсинг HTML плейлиста → [{title, url}]
    // ------------------------------------------------------------------
    function parsePlaylistItems(resp, filmUrl) {
        var items = [];
        var re = /<li[^>]*data-file="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;
        var m;
        while ((m = re.exec(resp)) !== null) {
            var url = m[1];
            var name = m[2].replace(/<[^>]+>/g, '').trim();

            if (url.indexOf('//') === 0) url = 'https:' + url;
            else if (url[0] === '/') url = UAKINO + url;

            // Беремо лише відео-посилання
            if (/ashdi|video|iframe|\.mp4|\.m3u8|^https?:/i.test(url)) {
                items.push({ title: name || 'Серія', url: url, referer: filmUrl });
            }
        }
        return items;
    }

    // ------------------------------------------------------------------
    // Показати стандартний список стрімів через Lampa.Select
    // ------------------------------------------------------------------
    function showStreamList(streams, movie, filmUrl) {
        Lampa.Select.show({
            title: 'UAkino — ' + (movie.title || movie.name || ''),
            items: streams.map(function (s) {
                return { title: s.title, stream: s };
            }),
            onSelect: function (item) {
                var s = item.stream;
                Lampa.Loading && Lampa.Loading.start ? Lampa.Loading.start() : null;

                resolveStream(s.url, s.referer || filmUrl, function (qualities) {
                    stopLoading();
                    if (movie.id) Lampa.Favorite.add('history', movie, 100);

                    if (qualities.length === 1) {
                        playVideo(qualities[0].url, s.title, movie);
                    } else {
                        // Вибір якості
                        Lampa.Select.show({
                            title: 'Якість — ' + s.title,
                            items: qualities.map(function (q) {
                                return { title: q.title, url: q.url };
                            }),
                            onSelect: function (q) {
                                playVideo(q.url, s.title, movie);
                            },
                            onBack: function () {
                                showStreamList(streams, movie, filmUrl);
                            }
                        });
                    }
                }, function (e) {
                    stopLoading();
                    Lampa.Noty.show('UAkino: ' + e);
                });
            },
            onBack: function () {}
        });
    }

    // ------------------------------------------------------------------
    // Запуск плеєра
    // ------------------------------------------------------------------
    function playVideo(url, title, movie) {
        var item = {
            url: url,
            title: title,
            poster: movie.poster_path
                ? 'https://image.tmdb.org/t/p/w500' + movie.poster_path : '',
            background_image: movie.backdrop_path
                ? 'https://image.tmdb.org/t/p/original' + movie.backdrop_path : ''
        };
        Lampa.Player.play(item);
        Lampa.Player.playlist([item]);
    }

    // ------------------------------------------------------------------
    // Зупинити loader (якщо він є)
    // ------------------------------------------------------------------
    function stopLoading() {
        Lampa.Loading && Lampa.Loading.stop ? Lampa.Loading.stop() : null;
    }

    // ------------------------------------------------------------------
    // Кнопка на сторінці фільму
    // ------------------------------------------------------------------
    function startPlugin() {
        if (window._uakino_plugin) return;
        window._uakino_plugin = true;

        var btn =
            '<div class="full-start__button selector view--uakino">' +
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
                    '<path d="M8 5v14l11-7z"/>' +
                '</svg>' +
                '<span>UAkino</span>' +
            '</div>';

        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;

            var movie = e.data && e.data.movie ? e.data.movie : {};
            var el = $(btn);

            el.on('hover:enter', function () {
                searchAndPlay(movie);
            });

            // Вставляємо кнопку після .view--torrent (як усі плагіни)
            // Якщо торент-кнопки нема — шукаємо будь-яку кнопку або просто додаємо в кінець
            var root = e.object.activity.render();
            var anchor = root.find('.view--torrent');
            if (anchor.length) {
                anchor.after(el);
            } else {
                var anyBtn = root.find('[class*="view--"]').last();
                if (anyBtn.length) anyBtn.after(el);
                else root.find('.full-start__buttons,.full-start__actions').append(el);
            }
        });
    }

    if (window.Lampa) {
        startPlugin();
    } else {
        var _iv = setInterval(function () {
            if (window.Lampa) { clearInterval(_iv); startPlugin(); }
        }, 200);
    }

})();
