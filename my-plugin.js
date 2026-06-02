(function () {
    // Safely execute plugin code once Lampa is fully initialized
    function init() {
        try {
            Lampa.Listener.follow('full', function (event) {
                // Lampa uses the event type 'complite' (with typo) to signal complete loading of movie details page
                if (event.type !== 'complite') return;

                setTimeout(function () {
                    try {
                        var notificationParts = [];
                        
                        // event.data contains the content payload (movie metadata)
                        if (event.data) {
                            var dataKeys = Object.keys(event.data).join(', ');
                            notificationParts.push('data keys: ' + dataKeys.slice(0, 120));
                            
                            if (event.data.movie) {
                                var movieKeys = Object.keys(event.data.movie).join(', ');
                                notificationParts.push('movie keys: ' + movieKeys.slice(0, 120));
                                
                                // Show movie title if available
                                var title = event.data.movie.title || event.data.movie.name;
                                if (title) {
                                    notificationParts.unshift('Movie: ' + title);
                                }
                            }
                        } else if (event.object) {
                            // Fallback to component keys if event.data is absent
                            var objectKeys = Object.keys(event.object).join(', ');
                            notificationParts.push('object keys: ' + objectKeys.slice(0, 120));
                        }

                        var message = notificationParts.join('\n');
                        Lampa.Noty.show(message || 'Keys not found');
                    } catch (e) {
                        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                            Lampa.Noty.show('Plugin inner error: ' + e.message);
                        } else {
                            console.error('Plugin inner error: ', e);
                        }
                    }
                }, 300);
            });
        } catch (e) {
            if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                Lampa.Noty.show('Plugin init error: ' + e.message);
            } else {
                console.error('Plugin init error: ', e);
            }
        }
    }

    // Register plugin execution based on application readiness state
    if (window.appready) {
        init();
    } else {
        // If Lampa object isn't ready yet, subscribe to its initialization event
        try {
            Lampa.Listener.follow('app', function (event) {
                if (event.type === 'ready') {
                    init();
                }
            });
        } catch (e) {
            // Fallback for environment loading issues
            console.error('Lampa.Listener.follow failed during bootstrap: ', e);
        }
    }
})();
