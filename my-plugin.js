try {
    Lampa.Listener.follow('full', function (event) {
        if (event.type !== 'complite') return;
        Lampa.Noty.show('UAkino plugin works!');
    });
} catch(e) {
    console.error('UAkino plugin error:', e);
}
