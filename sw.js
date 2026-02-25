self.addEventListener("install", event => {
    event.waitUntil(
        caches.open("clario-cache").then(cache => {
            return cache.addAll([
                "./",
                "./index.html",
                "./styles.css",
                "./app.js",
                "./clario_hero_banner.png"
            ]);
        })
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});
