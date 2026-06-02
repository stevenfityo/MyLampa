try {
    Lampa.Listener.follow('full', function (event) {
        if (event.type !== 'complite') return;

        setTimeout(function () {
            try {
                var keys = Object.keys(event.object).join(', ');
                Lampa.Noty.show('keys: ' + keys.slice(0, 200));
            } catch(e) {
                Lampa.Noty.show('inner error: ' + e.message);
            }
        }, 300);
    });
} catch(e) {
    Lampa.Noty.show('outer: ' + e.message);
}
