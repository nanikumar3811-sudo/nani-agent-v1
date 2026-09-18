const CACHE='nani-pro-x-shell-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/index.html','/manifest.webmanifest']))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(r=>r||caches.match('/index.html'))));
});
