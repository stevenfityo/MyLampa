try {
    Lampa.Listener.follow('full', function (event) {
        if (event.type !== 'complite') return;

        var activity = Lampa.Activity.active();
        var card     = activity && activity.card;
        if (!card) return;

        var btn = $('<div class="full-start__button selector" style="margin-top:1em"><svg height="70" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>UAkino</span></div>');

        btn.on('hover:enter', function () {
            Lampa.Noty.show('UAkino: ' + (card.title || card.original_title || 'unknown'));
        });

        setTimeout(function () {
            var row = event.object.render().find('.full-start__buttons');
            if (row.length) {
                row.append(btn);
            } else {
                Lampa.Noty.show('UAkino: buttons row not found');
            }
        }, 200);
    });
} catch(e) {
    console.error('UAkino plugin error:', e);
}
