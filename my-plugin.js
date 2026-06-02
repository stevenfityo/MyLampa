try {
    Lampa.Listener.follow('full', function (event) {
        if (event.type !== 'complite') return;

        setTimeout(function () {
            var html    = event.object.render();
            var classes = [];

            html.find('*').each(function () {
                var c = $(this).attr('class');
                if (c) c.split(' ').forEach(function (name) {
                    if (name && classes.indexOf(name) === -1) classes.push(name);
                });
            });

            // Show first 10 class names found inside the full screen
            Lampa.Noty.show(classes.slice(0, 10).join(', '));
        }, 300);
    });
} catch(e) {
    console.error('UAkino:', e);
}
