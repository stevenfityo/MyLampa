(function () {

    // ── Helpers ──────────────────────────────────────────────────────────────

    function searchUakino(title, onFound, onError) {
        var url = 'https://uakino.best/index.php?do=search&subaction=search&q=' + encodeURIComponent(title);
        fetch(url)
            .then(function (r) { return r.text(); })
            .then(function (html) {
                var m = html.match(/href="(https?:\/\/uakino\.best\/[^"]+\.html)"/);
                if (m) onFound(m[1]);
                else onError('Film not found on UAkino');
            })
            .catch(function (e) { onError('UAkino fetch: ' + e.message); });
    }

    function getAshdiId(filmUrl, onFound, onError) {
        fetch(filmUrl)
            .then(function (r) { return r.text(); })
            .then(function (html) {
                var m = html.match(/ashdi\.vip\/vod\/(\d+)/);
                if (m) onFound(m[1]);
                else onError('Ashdi ID not found');
            })
            .catch(function (e) { onError('Film page fetch: ' + e.message); });
    }

    function getM3u8(ashdiId, onFound, onError) {
        fetch('https://ashdi.vip/vod/' + ashdiId)
            .then(function (r) { return r.text(); })
            .then(function (html) {
                var matches = html.match(/https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/g);
                if (matches && matches.length) onFound(matches[0]);
                else onError('M3U8 not found');
            })
            .catch(function (e) { onError('Ashdi fetch: ' + e.message); });
    }

    function parseQualities(masterUrl, onDone) {
        fetch(masterUrl)
            .then(function (r) { return r.text(); })
            .then(function (text) {
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
            })
            .catch(function () { onDone([{ title: 'Play', url: masterUrl }]); });
    }

    function playStream(card, url) {
        Lampa.Player.play({
            title: card.title || card.name || '',
            url: url
        });
        Lampa.Player.playlist([{ title: card.title || card.name || '', url: url }]);
    }

    function showQualityPicker(card, streams) {
        Lampa.Select.show({
            title: 'UAkino — оберіть якість',
            items: streams.map(function (s) { return { title: s.title, stream: s }; }),
            onSelect: function (item) {
                playStream(card, item.stream.url);
            },
            onBack: function () {
                Lampa.Controller.toggle('full');
            }
        });
    }

    function startSearch(card) {
        var title = card.title || card.name || card.original_title || '';
        if (!title) { Lampa.Noty.show('No title found'); return; }

        Lampa.Noty.show('Шукаємо: ' + title);

        searchUakino(title,
            function (filmUrl) {
                getAshdiId(filmUrl,
                    function (ashdiId) {
                        getM3u8(ashdiId,
                            function (masterUrl) {
                                parseQualities(masterUrl, function (streams) {
                                    showQualityPicker(card, streams);
                                });
                            },
                            function (e) { Lampa.Noty.show('M3U8: ' + e); }
                        );
                    },
                    function (e) { Lampa.Noty.show('AshdiID: ' + e); }
                );
            },
            function (e) { Lampa.Noty.show('Search: ' + e); }
        );
    }

    // ── Button injection ──────────────────────────────────────────────────────

    function injectButton(component, card) {
        if (document.querySelector('.uakino-btn')) return;

        var btn = document.createElement('div');
        btn.className = 'full-start__button uakino-btn';
        btn.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:6px;padding:8px 16px;background:rgba(255,255,255,0.1);border-radius:4px;margin:4px;';
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>UAkino</span>';
        btn.addEventListener('click', function () { startSearch(card); });

        var selectors = [
            '.full-start__buttons',
            '.details__buttons',
            '.full__buttons',
            '.card-full__buttons',
            '.full-start__footer',
            '.full-start'
        ];

        var container = null;
        for (var i = 0; i < selectors.length; i++) {
            container = document.querySelector(selectors[i]);
            if (container) break;
        }

        if (!container && component && typeof component.render === 'function') {
            var root = component.render();
            if (root && root[0]) container = root[0];
            else if (root && root.querySelector) container = root;
        }

        if (container) {
            container.appendChild(btn);
        } else {
            Lampa.Noty.show('UAkino: container not found');
        }
    }

    // ── Entry point ───────────────────────────────────────────────────────────

    function init() {
        Lampa.Listener.follow('full', function (event) {
            if (event.type !== 'complite') return;

            var component = event.object;
            var card = (component && component.activity && component.activity.get)
                ? component.activity.get('card')
                : (component && component.card ? component.card : {});

            setTimeout(function () {
                injectButton(component, card || {});
            }, 400);
        });
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') init();
        });
    }

})();
