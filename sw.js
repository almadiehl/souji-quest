// 塵界のそうじクエスト — オフライン対応
// 方針: まずキャッシュから即座に返し、裏で最新版を取り直す（次に開いたときに反映される）
var CACHE = "souji-quest";
var SHELL = ["./", "./index.html", "./manifest.json", "./icon-180.png", "./icon-512.png"];

self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return c.addAll(SHELL).catch(function(){ /* 1つ失敗しても止めない */ });
    })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch(err){ return; }

  var isFont = (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com");
  if(url.origin !== self.location.origin && !isFont) return;

  e.respondWith(
    caches.open(CACHE).then(function(cache){
      return cache.match(req, { ignoreSearch: true }).then(function(hit){
        var fresh = fetch(req).then(function(res){
          if(res && (res.ok || res.type === "opaque")){
            try { cache.put(req, res.clone()); } catch(err){}
          }
          return res;
        }).catch(function(){
          // 通信できないときはキャッシュを返す
          return hit || (req.mode === "navigate" ? cache.match("./index.html") : undefined);
        });
        return hit || fresh;
      });
    })
  );
});
