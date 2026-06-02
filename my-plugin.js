(function () {

    var UAKINO = 'https://uakino.best';

    // GET raw text via Lampa's native request (bypasses CORS on the TV app).
    function get(url, headers, onSuccess, onError) {
        var network = new Lampa.Reguest();
        network.timeout(20000);
        network['native'](url, onSuccess, function (a, c) {
            onError(network.errorDecode ? network.errorDecode(a, c) : 'request failed');
        }, false, { dataType: 'text', headers: headers || {} });
    }

    // ── Step 1: search uakino, return first film page URL ───────────────────────

    function searchUakino(title, onFound, onError) {
        var url = UAKINO + '/index.php?do=search&subaction=search&q=' + encodeURIComponent(title);
        get(url, {}, function (html) {
            var m = html.match(/href="(https?:\/\/uakino\.best\/[^"]+\.html)"/);
            if (m) onFound(m[1]);
            else onError('Не знайдено на UAkino');
        }, onError);
    }

    // ── Step 2: read news_id from film page, call playlists.php for ashdi url ────

    function getAshdiUrl(filmUrl, onFound, onError) {
        var idMatch = filmUrl.match(/\/(\d+)-[^/]+\.html/);
        if (!idMatch) { onError('news_id не знайдено в URL'); return; }
        var newsId = idMatch[1];

        var ajax = UAKINO + '/engine/ajax/playlists.php?news_id=' + newsId +
                   '&xfield=playlist&time=' + Date.now();

        get(ajax, { 'X-Requested-With': 'XMLHttpRequest', 'Referer': filmUrl }, function (text) {
            var data;
            try { data = typeof text === 'string' ? JSON.parse(text) : text; }
            catch (e) { onError('playlists.php: невалідний JSON'); return; }

            var resp = (data && data.response) || '';
            var files = [];
            var re = /data-file="(https?:\/\/[^"]*ashdi\.vip\/[a-z]+\/\d+[^"]*)"/g, mm;
            while ((mm = re.exec(resp)) !== null) files.push(mm[1]);

            if (files.length) onFound(files[0]);
            else onError('ashdi-лінк не знайдено');
        }, onError);
    }

    // ── Step 3: ashdi player page → master m3u8 ─────────────────────────────────

    function getM3u8(ashdiUrl, onFound, onError) {
        get(ashdiUrl, { 'Referer': UAKINO + '/' }, function (html) {
            var matches = html.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/g);
            if (matches && matches.length) onFound(matches[0]);
            else onError('m3u8 не знайдено');
        }, onError);
    }

    // ── Step 4: parse qualities from master playlist ────────────────────────────

    function parseQualities(masterUrl, onDone) {
        get(masterUrl, { 'Referer': 'https://ashdi.vip/' }, function (text) {
            var lines = text.split('\n');
            var streams = [];
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].indexOf('#EXT-X-STREAM-INF') === 0) {
                    var res = lines[i].match(/RESOLUTION=\d+x(\d+)/);
                    var label = res ? res[1] + 'p' : 'Stream ' + (streams.length + 1);
                    var next = lines[i + 1] ? lines[i + 1].trim() : '';
                    if (next && next.indexOf('#') !== 0) {
                        var streamUrl = next.indexOf('http') === 0
                            ? next
                            : masterUrl.replace(/\/[^/]+$/, '/') + next;
                        streams.push({ title: label, url: streamUrl });
                    }
                }
            }
            if (!streams.length) streams.push({ title: 'Play', url: masterUrl });
            onDone(streams);
        }, function () {
            onDone([{ title: 'Play', url: masterUrl }]);
        });
    }

    // ── Playback + UI ───────────────────────────────────────────────────────────

    function playStream(card, url) {
        var title = card.title || card.name || '';
        Lampa.Player.play({ title: title, url: url });
        Lampa.Player.playlist([{ title: title, url: url }]);
    }

    function showQualityPicker(card, streams) {
        Lampa.Select.show({
            title: 'UAkino — якість',
            items: streams.map(function (s) { return { title: s.title, stream: s }; }),
            onSelect: function (item) { playStream(card, item.stream.url); },
            onBack: function () { Lampa.Controller.toggle('full'); }
        });
    }

    function startSearch(card) {
        var title = card.title || card.name || card.original_title || '';
        if (!title) { Lampa.Noty.show('Немає назви фільму'); return; }

        Lampa.Noty.show('[1] Шукаємо: ' + title);

        searchUakino(title, function (filmUrl) {
            Lampa.Noty.show('[2] Фільм: ' + filmUrl);
            getAshdiUrl(filmUrl, function (ashdiUrl) {
                Lampa.Noty.show('[3] Ashdi: ' + ashdiUrl);
                getM3u8(ashdiUrl, function (masterUrl) {
                    Lampa.Noty.show('[4] m3u8 OK');
                    parseQualities(masterUrl, function (streams) {
                        Lampa.Noty.show('[5] Якостей: ' + streams.length);
                        showQualityPicker(card, streams);
                    });
                }, function (e) { Lampa.Noty.show('[X3] m3u8: ' + e); });
            }, function (e) { Lampa.Noty.show('[X2] ashdi: ' + e); });
        }, function (e) { Lampa.Noty.show('[X1] пошук: ' + e); });
    }

    // ── Button injection ────────────────────────────────────────────────────────

    var button = '<div class="full-start__button selector view--uakino">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512" fill="currentColor">' +
        '<path d="M8 5v14l11-7z"/></svg>' +
        '<span>UAkino</span>' +
        '</div>';

    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite') return;

        var card = e.data && e.data.movie ? e.data.movie : {};
        var btn = $(button);

        btn.on('hover:enter', function () { startSearch(card); });

        e.object.activity.render().find('.view--torrent').after(btn);
    });

})();
