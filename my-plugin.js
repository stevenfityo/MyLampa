(function () {

    function startPlugin() {
        Lampa.Listener.follow('full', function (event) {
            if (event.type !== 'complite') return;

            var btn = $('<div class="full-start__button selector"><svg height="70" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>UAkino</span></div>');

            btn.on('hover:enter', function () {
                Lampa.Noty.show('UAkino plugin works!');
            });

            setTimeout(function () {
                var row = event.object.render().find('.full-start__buttons');
                row.append(btn);
            }, 200);
        });
    }

    if (window.Lampa) {
        startPlugin();
    } else {
        document.addEventListener('lampa:ready', startPlugin);
    }

})();
