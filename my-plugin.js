(function () {
    Lampa.Noty.show('plugin loaded v2');

    Lampa.Listener.follow('full', function (event) {
        if (event.type !== 'complite') return;

        setTimeout(function () {
            var found = [];
            var list = ['.full-start__buttons', '.details__buttons', '.full__buttons',
                        '.card-full__buttons', '.full-start', '.details', '.full', '.card-full'];

            for (var i = 0; i < list.length; i++) {
                if (document.querySelector(list[i])) found.push(list[i]);
            }

            Lampa.Noty.show(found.length ? found.join(' | ') : 'no match');
        }, 600);
    });
})();
