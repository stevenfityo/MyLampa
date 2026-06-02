try {
    Lampa.Listener.follow('full', function (event) {
        if (event.type !== 'complite') return;

        setTimeout(function () {
            try {
                var candidates = [
                    '.full-start__buttons',
                    '.details__buttons',
                    '.full__buttons',
                    '.card-full__buttons',
                    '.full-start',
                    '.details',
                    '.full',
                    '.card-full'
                ];

                var found = candidates.filter(function (s) {
                    return document.querySelector(s);
                });

                Lampa.Noty.show(found.length ? 'found: ' + found.join(' | ') : 'no selectors found');
            } catch (e) {
                Lampa.Noty.show('err: ' + e.message);
            }
        }, 600);
    });
} catch (e) {
    Lampa.Noty.show('outer: ' + e.message);
}
