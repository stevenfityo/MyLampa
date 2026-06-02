(function () {
    'use strict';

    var PLUGIN_ID   = 'uakino_plugin';
    var PLUGIN_NAME = 'UAkino';
    var UAKINO_HOST = 'https://uakino.best';
    var ASHDI_HOST  = 'https://ashdi.vip';

    // ─── Step 1: Search uakino.best for a film by title ───────────────────────
    // DLE (DataLife Engine) standard search endpoint used by uakino.best
    function searchUakino(card, onFound, onError) {
        var query = card.original_title || card.title || '';
        var url   = UAKINO_HOST + '/index.php?do=search&subaction=search&q=' + encodeURIComponent(query);

        Lampa.Ajax.get(
            url,
            function (html) {
                // Parse search results — each result is an <article> or <div> with a link
                // Find the first result URL that looks like a film page
                var match = html.match(/href="(https?:\/\/uakino\.best\/[^"]+\.html)"/);
                if (!match) {
                    onError('Film not found on UAkino: ' + query);
                    return;
                }
                onFound(match[1]); // e.g. https://uakino.best/33170-avatar-vogon-i-popil.html
            },
            onError
        );
    }

    // ─── Step 2: Fetch the uakino film page and extract the ashdi.vip ID ──────
    function getAshdiId(filmPageUrl, onFound, onError) {
        Lampa.Ajax.get(
            filmPageUrl,
            function (html) {
                // The page embeds the ashdi player as:
                //   ashdi.vip/vod/245141   or   ashdi.vip/vod/245141?nopl=...
                var match = html.match(/ashdi\.vip\/vod\/(\d+)/);
                if (!match) {
                    onError('Could not find ashdi player on this page.');
                    return;
                }
                onFound(match[1]); // e.g. "245141"
            },
            onError
        );
    }

    // ─── Step 3: Fetch ashdi.vip/vod/{id} and extract the m3u8 URL ───────────
    function getM3u8(ashdiId, onFound, onError) {
        var url = ASHDI_HOST + '/vod/' + ashdiId;

        Lampa.Ajax.get(
            url,
            function (html) {
                // The m3u8 URL is embedded directly in the page HTML
                var matches = html.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/g);
                if (!matches || !matches.length) {
                    onError('No stream found on ashdi page.');
                    return;
                }

                // De-duplicate (same URL appears twice in the page)
                var unique = matches.filter(function (v, i, a) { return a.indexOf(v) === i; });
                onFound(unique);
            },
            onError
        );
    }

    // ─── Step 4: Parse master m3u8 for quality levels ─────────────────────────
    // ashdi returns a master playlist with multiple resolutions.
    // Format:
    //   #EXT-X-STREAM-INF:BANDWIDTH=...,RESOLUTION=1920x1080
    //   https://...ashdi.vip/.../hls/1080/index.m3u8
    function parseQualities(masterUrl, onDone, onError) {
        Lampa.Ajax.get(
            masterUrl,
            function (text) {
                var lines    = text.split('\n');
                var streams  = [];
                var qualityRe = /RESOLUTION=\d+x(\d+)/;

                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
                        var resMatch = line.match(qualityRe);
                        var height   = resMatch ? resMatch[1] : null;
                        var nextLine = (lines[i + 1] || '').trim();

                        if (nextLine && nextLine.indexOf('http') === 0) {
                            streams.push({
                                title: height ? height + 'p' : 'Stream',
                                url:   nextLine
                            });
                        }
                    }
                }

                // If no multi-quality found, treat the URL itself as the only stream
                if (!streams.length) {
                    streams.push({ title: 'Default', url: masterUrl });
                }

                onDone(streams);
            },
            onError
        );
    }

    // ─── Step 5: Show quality selector and play ───────────────────────────────
    function showSelector(card, streams) {
        var items = streams.map(function (s) {
            return { title: s.title, stream: s };
        });

        Lampa.Select.show({
            title: PLUGIN_NAME,
            items: items,
            onBack: function () {
                Lampa.Controller.toggle('full');
            },
            onSelect: function (item) {
                Lampa.Player.play({ title: card.title || '', url: item.stream.url });
                Lampa.Player.playlist([{ title: card.title || '', url: item.stream.url }]);
            }
        });
    }

    // ─── Main entry: orchestrate steps 1–5 ───────────────────────────────────
    function findAndPlay(card) {
        Lampa.Loading.start(PLUGIN_NAME + '...');

        searchUakino(
            card,
            function (filmPageUrl) {
                getAshdiId(
                    filmPageUrl,
                    function (ashdiId) {
                        getM3u8(
                            ashdiId,
                            function (m3u8Urls) {
                                var masterUrl = m3u8Urls[0];

                                parseQualities(
                                    masterUrl,
                                    function (streams) {
                                        Lampa.Loading.stop();
                                        showSelector(card, streams);
                                    },
                                    function () {
                                        // Parsing failed — play master directly
                                        Lampa.Loading.stop();
                                        showSelector(card, [{ title: 'Play', url: masterUrl }]);
                                    }
                                );
                            },
                            function (err) {
                                Lampa.Loading.stop();
                                Lampa.Noty.show(err || 'Stream not found.');
                            }
                        );
                    },
                    function (err) {
                        Lampa.Loading.stop();
                        Lampa.Noty.show(err || 'Film page not found.');
                    }
                );
            },
            function (err) {
                Lampa.Loading.stop();
                Lampa.Noty.show(err || 'Search failed.');
            }
        );
    }

    // ─── Hook into Lampa film detail screen ──────────────────────────────────
    function startPlugin() {
        Lampa.Listener.follow('full', function (event) {
            if (event.type !== 'complite') return;

            var activity = Lampa.Activity.active();
            var card     = activity && activity.card;
            if (!card) return;

            event.object.addButton({
                id:    PLUGIN_ID + '_watch',
                icon:  'play',
                title: PLUGIN_NAME,
                onSelect: function () {
                    findAndPlay(card);
                }
            });
        });
    }

    // ─── Bootstrap ───────────────────────────────────────────────────────────
    if (window.Lampa) {
        startPlugin();
    } else {
        document.addEventListener('lampa:ready', startPlugin);
    }

})();
