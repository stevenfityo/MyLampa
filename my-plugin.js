(function () {
    'use strict';

    var PLUGIN_ID   = 'uakino_plugin';
    var PLUGIN_NAME = 'UAkino';
    var UAKINO_HOST = 'https://uakino.best';
    var ASHDI_HOST  = 'https://ashdi.vip';

    // ─── HTTP helper using native fetch ───────────────────────────────────────
    function httpGet(url, onSuccess, onError) {
        fetch(url)
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(onSuccess)
            .catch(function (e) {
                onError(e && e.message ? e.message : String(e));
            });
    }

    // ─── Step 1: Search uakino.best ───────────────────────────────────────────
    function searchUakino(card, onFound, onError) {
        var query = card.original_title || card.title || '';
        var url   = UAKINO_HOST + '/index.php?do=search&subaction=search&q=' + encodeURIComponent(query);

        httpGet(url, function (html) {
            var match = html.match(/href="(https?:\/\/uakino\.best\/[^"]+\.html)"/);
            if (!match) { onError('Not found on UAkino: ' + query); return; }
            onFound(match[1]);
        }, onError);
    }

    // ─── Step 2: Extract ashdi ID from uakino film page ───────────────────────
    function getAshdiId(filmPageUrl, onFound, onError) {
        httpGet(filmPageUrl, function (html) {
            var match = html.match(/ashdi\.vip\/vod\/(\d+)/);
            if (!match) { onError('ashdi player not found on page.'); return; }
            onFound(match[1]);
        }, onError);
    }

    // ─── Step 3: Extract m3u8 from ashdi.vip/vod/{id} ────────────────────────
    function getM3u8(ashdiId, onFound, onError) {
        httpGet(ASHDI_HOST + '/vod/' + ashdiId, function (html) {
            var matches = html.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/g);
            if (!matches || !matches.length) { onError('No stream on ashdi page.'); return; }
            var unique = matches.filter(function (v, i, a) { return a.indexOf(v) === i; });
            onFound(unique[0]);
        }, onError);
    }

    // ─── Step 4: Parse master m3u8 for quality levels ─────────────────────────
    function parseQualities(masterUrl, onDone) {
        httpGet(masterUrl, function (text) {
            var lines   = text.split('\n');
            var streams = [];

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
                    var res  = line.match(/RESOLUTION=\d+x(\d+)/);
                    var next = (lines[i + 1] || '').trim();
                    if (next && next.indexOf('http') === 0) {
                        streams.push({ title: res ? res[1] + 'p' : 'Stream', url: next });
                    }
                }
            }

            if (!streams.length) streams.push({ title: 'Play', url: masterUrl });
            onDone(streams);
        }, function () {
            onDone([{ title: 'Play', url: masterUrl }]);
        });
    }

    // ─── Step 5: Show quality selector and play ───────────────────────────────
    function showSelector(card, streams) {
        Lampa.Select.show({
            title: PLUGIN_NAME,
            items: streams.map(function (s) { return { title: s.title, stream: s }; }),
            onBack: function () { Lampa.Controller.toggle('full'); },
            onSelect: function (item) {
                Lampa.Player.play({ title: card.title || '', url: item.stream.url });
                Lampa.Player.playlist([{ title: card.title || '', url: item.stream.url }]);
            }
        });
    }

    // ─── Main: chain all steps ────────────────────────────────────────────────
    function findAndPlay(card) {
        Lampa.Noty.show(PLUGIN_NAME + ': searching...');

        searchUakino(card, function (filmPageUrl) {
            getAshdiId(filmPageUrl, function (ashdiId) {
                getM3u8(ashdiId, function (masterUrl) {
                    parseQualities(masterUrl, function (streams) {
                        showSelector(card, streams);
                    });
                }, function (err) { Lampa.Noty.show('ashdi: ' + err); });
            }, function (err) { Lampa.Noty.show('uakino page: ' + err); });
        }, function (err) { Lampa.Noty.show('search: ' + err); });
    }

    // ─── Add button to film detail screen ────────────────────────────────────
    function startPlugin() {
        Lampa.Listener.follow('full', function (event) {
            if (event.type !== 'complite') return;

            var activity = Lampa.Activity.active();
            var card     = activity && activity.card;
            if (!card) return;

            // Build button DOM and inject into the action buttons row
            var btn = $([
                '<div class="full-start__button selector" data-plugin="' + PLUGIN_ID + '">',
                    '<svg height="70" viewBox="0 0 24 24" fill="currentColor">',
                        '<path d="M8 5v14l11-7z"/>',
                    '</svg>',
                    '<span>' + PLUGIN_NAME + '</span>',
                '</div>'
            ].join(''));

            btn.on('hover:enter', function () { findAndPlay(card); });

            // Wait one tick for the full screen DOM to be ready
            setTimeout(function () {
                var row = event.object.render().find('.full-start__buttons');
                if (row.length && !row.find('[data-plugin="' + PLUGIN_ID + '"]').length) {
                    row.append(btn);
                }
            }, 100);
        });
    }

    if (window.Lampa) {
        startPlugin();
    } else {
        document.addEventListener('lampa:ready', startPlugin);
    }

})();
