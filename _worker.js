// Closer Than Words: one Cloudflare Worker that serves the app, checks purchases,
// limits each purchase to 2 devices, delivers card images and receives Shopify orders.
//
// Bindings to add in Cloudflare (see the setup guide):
//   CARDS         = R2 bucket with your card folders and an "assets" folder
//   DB            = KV namespace
//   TOKEN_SECRET  = secret text (any long random text)
//   SHOPIFY_SECRET= secret text (the signing key Shopify shows for webhooks)

const CFG = {
  maxDevices: 2,
  shopUrl: "https://closerthanwords.store",
  // folder = exact folder name in the R2 bucket (same as your Drive folder name)
  // match  = lowercase text that must appear in the Shopify product title
  decks: [
    { id: "pc", folder: "Parents and Children - Conversation Card Deck", match: "parents and children", name: "Parents and Children", vi: "Cha mẹ và con cái", color: "#B7691F", por: false },
    { id: "fm", folder: "Family Members - Conversation Card Deck", match: "family members", name: "Family Members", vi: "Thành viên gia đình", color: "#B5472B", por: false },
    { id: "sb", folder: "Siblings - Conversation Card Deck", match: "siblings", name: "Siblings", vi: "Anh chị em", color: "#5B6B49", por: false },
    { id: "ed", folder: "Newly Dating Couples - Conversation Card Deck", match: "newly dating couples", name: "Newly Dating Couples", vi: "Mới yêu", color: "#B84B62", por: false },
    { id: "mc", folder: "Married Couples - Conversation Card Deck", match: "married couples", name: "Married Couples", vi: "Vợ chồng", color: "#8E3535", por: false },
    { id: "cl", folder: "Colleagues - Conversation Card Deck", match: "colleagues", name: "Colleagues", vi: "Đồng nghiệp", color: "#3F6F6D", por: false },
    { id: "fr", folder: "Friends - Conversation Card Deck", match: "friends", name: "Friends", vi: "Bạn bè", color: "#4F7F5E", por: true,
      piles: [{ id: "t", folder: "Truth", label: "Truth", vi: "Thật" }, { id: "d", folder: "Dare", label: "Dare", vi: "Thách" }] },
    { id: "dt", folder: "Dare or Truth for Family - Conversation Card Deck", match: "dare or truth for family", name: "Dare or Truth for Family", vi: "Thật hay thách (gia đình)", color: "#7B4B6A", por: true,
      piles: [{ id: "t", folder: "Truth", label: "Truth", vi: "Thật" }, { id: "d", folder: "Dare", label: "Dare", vi: "Thách" }] },
    { id: "ff", folder: "Feelings & Flames - Intimate Card Deck for Couples", match: "feelings & flames", name: "Feelings & Flames", vi: "Cảm xúc và lửa", color: "#7D2A38", por: false, adult: true,
      piles: [{ id: "f", folder: "Feeling", label: "Feeling", vi: "Cảm xúc" }, { id: "l", folder: "Flame", label: "Flame", vi: "Lửa" }] },
  ],
  bundleMatch: "complete collection", // a product whose title contains this unlocks every deck
};

const APP_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#B5472B\">\n<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n<meta name=\"apple-mobile-web-app-title\" content=\"Closer Than Words\">\n<title>Closer Than Words</title>\n<link rel=\"manifest\" href=\"/manifest.webmanifest\">\n<link rel=\"apple-touch-icon\" href=\"/assets/apple-touch-icon.png\">\n<link rel=\"icon\" href=\"/assets/icon-192.png\">\n<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;800&display=swap\">\n<style>\n\n:root{--bg:#F7EFE2;--ink:#3B1A12;--mute:#7A5F52;--card:#FFFBF3;--line:#E4D3BC;--c:#B5472B;\nbox-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){--bg:#1F1411;--ink:#F6EAD8;--mute:#BCA595;--card:#2D1E19;--line:#4A342B}}\n:root[data-theme=\"dark\"]{--bg:#1F1411;--ink:#F6EAD8;--mute:#BCA595;--card:#2D1E19;--line:#4A342B}\n*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}\nhtml,body{margin:0;min-height:100%;background:var(--bg);color:var(--ink);font-family:'Be Vietnam Pro',system-ui,-apple-system,'Segoe UI',sans-serif}\nmain{max-width:520px;margin:0 auto;padding:18px 16px 28px;min-height:100vh;display:flex;flex-direction:column}\nh1{font-size:25px;font-weight:800;margin:6px 0;line-height:1.2}\np{line-height:1.5;color:var(--mute);margin:0 0 14px}\n.hidden{display:none!important}\nbutton{font:inherit;cursor:pointer;border:0;color:inherit}\nbutton:focus-visible,input:focus-visible{outline:3px solid var(--c);outline-offset:2px}\ninput{width:100%;font:inherit;font-size:19px;letter-spacing:.1em;text-align:center;padding:15px;border-radius:14px;border:2px solid var(--line);background:var(--card);color:var(--ink)}\n.btn{width:100%;padding:15px;border-radius:14px;background:var(--c);color:#fff;font-weight:600;font-size:16px;margin-top:10px}\n.btn.ghost{background:transparent;border:2px solid var(--line);color:var(--ink)}\n.err{color:#D2383C;font-weight:600;min-height:22px;margin-top:8px}\n.logo{display:block;width:132px;height:132px;border-radius:26px;margin:4px auto 12px;box-shadow:0 6px 18px rgba(60,26,18,.22)}\n.logo.wide{width:min(80%,300px);height:auto;border-radius:0;box-shadow:none;margin:0 auto 6px}\n.lg-dark{display:none}\n@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]) .lg-light{display:none}:root:not([data-theme=\"light\"]) .lg-dark{display:block}}\n:root[data-theme=\"dark\"] .lg-light{display:none}:root[data-theme=\"dark\"] .lg-dark{display:block}\n.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}\n.logo.s{width:44px;height:44px;border-radius:11px;margin:0;box-shadow:none;object-fit:contain}\n.back-face .logo{width:84px;height:84px;border-radius:20px;margin:0 0 12px;box-shadow:0 4px 12px rgba(0,0,0,.25);object-fit:contain}\n#gate h1,#gate p{text-align:center}\n.hint{font-size:13px;color:var(--mute);background:var(--card);border:1px dashed var(--line);border-radius:12px;padding:10px 12px;margin-top:14px}\n.bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}\n.lang{background:var(--card);border:1px solid var(--line);border-radius:99px;padding:6px 12px;font-size:13px;font-weight:600}\n.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}\n.tile{position:relative;text-align:left;border-radius:16px;padding:14px 12px 12px;background:var(--card);border:1px solid var(--line);border-top:8px solid var(--c);min-height:104px;display:flex;flex-direction:column;justify-content:space-between}\n.tile b{font-size:15px;line-height:1.25}\n.tile small{color:var(--mute);font-size:12px}\n.tile.locked{opacity:.62}\n.tile svg{position:absolute;right:10px;top:16px;width:18px;height:18px;fill:none;stroke:var(--mute);stroke-width:2}\n.tag{display:inline-block;font-size:11px;font-weight:600;background:var(--c);color:#fff;border-radius:99px;padding:2px 8px;margin-top:6px}\n.top{display:flex;justify-content:space-between;align-items:center}\n.back{background:none;font-weight:600;font-size:15px;padding:8px 2px}\n.count{color:var(--mute);font-size:13px}\n.seg{display:flex;gap:6px;margin:8px 0 12px}\n.seg button{flex:1;padding:10px 6px;border-radius:12px;background:var(--card);border:2px solid var(--line);font-weight:600;font-size:14px}\n.seg button[aria-pressed=\"true\"]{background:var(--c);border-color:var(--c);color:#fff}\n.stage{flex:1;display:flex;align-items:center;justify-content:center;perspective:1100px;padding:6px 0 12px}\n.card{width:min(100%,var(--cw,460px));aspect-ratio:var(--ar,7/5);position:relative;transition:transform .5s;transform-style:preserve-3d}\n.card.flip{transform:rotateY(180deg)}\n.face{position:absolute;inset:0;border-radius:22px;backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:22px}\n.back-face{background:var(--c);color:#fff;font-weight:800;font-size:22px;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.1) 0 10px,transparent 10px 20px)}\n.front{background:var(--card);border:4px solid var(--c);transform:rotateY(180deg)}\n.front .ph{font-weight:800;font-size:20px;color:var(--c)}\n.front .sm{color:var(--mute);font-size:13px;margin-top:8px}\n.modal{position:fixed;inset:0;background:rgba(20,10,35,.6);display:flex;align-items:flex-end;justify-content:center;padding:16px;z-index:5}\n.sheet{background:var(--card);border-radius:20px;padding:20px;width:100%;max-width:480px}\nbutton{transition:transform .08s ease,filter .08s ease,box-shadow .08s ease}\nbutton:active{transform:scale(.95) translateY(3px);filter:brightness(.9)}\n.btn{box-shadow:0 4px 0 rgba(0,0,0,.22)}\n.btn:active{box-shadow:0 1px 0 rgba(0,0,0,.22)}\n.tile:active{transform:scale(.94) translateY(3px)}\n.snd{background:var(--card);border:1px solid var(--line);border-radius:50%;width:40px;height:40px;padding:0;display:inline-flex;align-items:center;justify-content:center;color:var(--ink)}\n.snd.off{color:var(--mute)}\n.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:99px;font-weight:600;font-size:14px;z-index:9;opacity:0;pointer-events:none;transition:opacity .2s}\n.toast.on{opacity:1}\n.card.shuf{animation:shuf .5s}\n@keyframes shuf{0%,100%{transform:translateX(0)}20%{transform:translateX(-12px) rotate(-3deg)}40%{transform:translateX(12px) rotate(3deg)}60%{transform:translateX(-8px)}80%{transform:translateX(8px)}}\n@media (prefers-reduced-motion:reduce){.card{transition:none}.card.shuf{animation:none}button{transition:none}}\n\n.lang{display:none!important}.front.img{padding:0;border:0;background:none}\n.front img{width:100%;height:100%;object-fit:contain;border-radius:22px;display:block}\n.logo.s,.back-face .logo{object-fit:contain}\n</style>\n</head>\n<body>\n<main>\n\n<section id=\"gate\">\n  <div class=\"bar\"><span></span><div style=\"display:flex;gap:6px;align-items:center\"><button class=\"snd\" id=\"snd0\"></button><button class=\"lang\" id=\"lang1\">VI</button></div></div>\n  <img class=\"logo wide lg-light\" src=\"/assets/logo-main.webp\" alt=\"Closer Than Words\"><img class=\"logo wide lg-dark\" src=\"/assets/logo-dark.webp\" alt=\"\">\n  <h1 class=\"sr\" data-t=\"title\"></h1>\n  <p data-t=\"gateText\"></p>\n  <input id=\"email\" type=\"email\" inputmode=\"email\" autocomplete=\"email\" data-ph=\"email\" style=\"letter-spacing:0;font-size:17px;margin-bottom:10px\">\n  <input id=\"order\" inputmode=\"numeric\" autocomplete=\"off\" data-ph=\"order\" style=\"letter-spacing:0;font-size:17px\">\n  <button class=\"btn\" id=\"unlock\" data-t=\"open\"></button>\n  <div class=\"err\" id=\"err\" role=\"alert\"></div>\n</section>\n\n<section id=\"home\" class=\"hidden\">\n  <div class=\"bar\"><div style=\"display:flex;align-items:center;gap:10px\"><img class=\"logo s\" src=\"/assets/icon-small.webp\" alt=\"\"><h1 data-t=\"pick\"></h1></div><div style=\"display:flex;gap:6px;align-items:center\"><button class=\"snd\" id=\"snd1\"></button><button class=\"lang\" id=\"lang2\">VI</button></div></div>\n  <p data-t=\"pickText\"></p>\n  <div class=\"grid\" id=\"grid\"></div>\n  <p class=\"hint\" data-t=\"tip\"></p>\n  <button class=\"btn ghost\" id=\"signout\" style=\"margin-top:14px\" data-t=\"signout\"></button>\n</section>\n\n<section id=\"play\" class=\"hidden\" style=\"flex:1;flex-direction:column\">\n  <div class=\"top\"><button class=\"back\" id=\"back\"></button><span class=\"count\" id=\"count\"></span><button class=\"snd\" id=\"snd2\"></button></div>\n  <div class=\"seg hidden\" id=\"seg\"></div>\n  <div class=\"stage\"><div class=\"card\" id=\"card\" role=\"button\" tabindex=\"0\">\n    <div class=\"face back-face\"><img class=\"logo\" src=\"/assets/icon-small.webp\" alt=\"\"><span id=\"backTxt\"></span></div>\n    <div class=\"face front\" id=\"front\"></div>\n  </div></div>\n  <button class=\"btn\" id=\"draw\"></button>\n  <button class=\"btn ghost\" id=\"reshuf\"></button>\n</section>\n\n<div class=\"toast\" id=\"toast\" role=\"status\"></div>\n<div class=\"modal hidden\" id=\"modal\"><div class=\"sheet\" id=\"sheet\"></div></div>\n</main>\n<script>\nvar T={en:{title:\"Closer Than Words\",gateText:\"Enter the email and the order number (or confirmation code) from your purchase. You only need to do this once on this device.\",open:\"Open my cards\",email:\"Email used at checkout\",order:\"Order number or confirmation code\",pick:\"Choose a deck\",pickText:\"Tap a deck to play. Locked decks can be added any time.\",signout:\"Sign out of this device\",bad:\"We could not find that purchase. Check the email and order number in your order confirmation.\",limit:\"This purchase is already open on 2 devices. Sign out on one of them first, or contact us.\",net:\"No connection. Please try again.\",locked:\"Not in your collection yet\",buy:\"Buy this deck\",close:\"Close\",tap:\"Tap to draw\",next:\"Draw next card\",shuffle:\"Shuffle again\",drawn:\"Drawn\",of:\"of\",back:\"‹ Decks\",done:\"You drew every card. Shuffle to start again.\",adultT:\"This deck is for adults only\",adultP:\"Please confirm you are 18 or older to continue.\",adultY:\"I am 18 or older\",adultN:\"Go back\",cards:\"cards\",mixed:\"Mixed\",sndOn:\"Sound: on\",sndOff:\"Sound: off\",shufd:\"Shuffled!\",tip:\"Tip: add this page to your home screen to play like an app. iPhone: Share, then Add to Home Screen. Android: menu, then Install app.\",imgErr:\"Could not load this card. Check your connection.\"},\nvi:{title:\"Closer Than Words\",gateText:\"Nhập email và mã đơn hàng (hoặc mã xác nhận) đã dùng khi mua. Bạn chỉ cần nhập một lần trên thiết bị này.\",open:\"Mở bộ bài\",email:\"Email dùng khi thanh toán\",order:\"Mã đơn hàng hoặc mã xác nhận\",pick:\"Chọn bộ bài\",pickText:\"Chạm vào một bộ để chơi. Bộ đang khóa có thể mua thêm bất cứ lúc nào.\",signout:\"Đăng xuất khỏi thiết bị này\",bad:\"Không tìm thấy đơn hàng này. Hãy kiểm tra email và mã đơn hàng trong email xác nhận.\",limit:\"Đơn hàng này đã mở trên 2 thiết bị. Hãy đăng xuất ở một thiết bị trước, hoặc liên hệ với chúng tôi.\",net:\"Không có kết nối. Hãy thử lại.\",locked:\"Bạn chưa có bộ này\",buy:\"Mua bộ này\",close:\"Đóng\",tap:\"Chạm để rút bài\",next:\"Rút lá tiếp theo\",shuffle:\"Xáo lại\",drawn:\"Đã rút\",of:\"/\",back:\"‹ Các bộ bài\",done:\"Bạn đã rút hết. Xáo lại để chơi vòng mới.\",adultT:\"Bộ này chỉ dành cho người lớn\",adultP:\"Vui lòng xác nhận bạn từ 18 tuổi trở lên.\",adultY:\"Tôi từ 18 tuổi\",adultN:\"Quay lại\",cards:\"lá\",mixed:\"Trộn cả hai\",sndOn:\"Âm thanh: bật\",sndOff:\"Âm thanh: tắt\",shufd:\"Đã xáo bài!\",tip:\"Mẹo: thêm trang này vào màn hình chính để chơi như một ứng dụng. iPhone: Chia sẻ, rồi Thêm vào Màn hình chính. Android: menu, rồi Cài đặt ứng dụng.\",imgErr:\"Không tải được lá bài này. Hãy kiểm tra kết nối.\"}};\nvar STORE=(location.search.indexOf(\"store=ms\")>-1)||ls(\"ctw_store\")===\"1\";if(location.search.indexOf(\"store=ms\")>-1)ls(\"ctw_store\",\"1\");\nvar L=\"en\",lib=null,cur=null,part=\"all\",seq=[],idx=0,total=0,shown=0,flipped=false,busy=false;\nvar $=function(i){return document.getElementById(i)};\nfunction t(k){return T[L][k]}\nfunction ls(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}}\nfunction nm(d){return L===\"vi\"?d.vi:d.name}\nfunction dev(){var d=ls(\"ctw_dev\");if(!d){d=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+\"-\"+Math.random().toString(36).slice(2));ls(\"ctw_dev\",d)}return d}\nfunction tok(){return ls(\"ctw_tok\")}\n/* sound */\nvar AC=null,SOUND=(ls(\"ctw_snd\")!==\"off\");\nfunction ac(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}}if(AC&&AC.state===\"suspended\")AC.resume();return AC}\nfunction tone(f,d,ty,vol,w){var a=ac();if(!a)return;var o=a.createOscillator(),g=a.createGain(),s=a.currentTime+(w||0);o.type=ty||\"sine\";o.frequency.setValueAtTime(f,s);g.gain.setValueAtTime(0.0001,s);g.gain.exponentialRampToValueAtTime(vol||0.15,s+0.01);g.gain.exponentialRampToValueAtTime(0.0001,s+d);o.connect(g);g.connect(a.destination);o.start(s);o.stop(s+d+0.02)}\nfunction sfx(k){if(!SOUND)return;\n if(k===\"tap\")tone(520,.07,\"triangle\",.12);\n else if(k===\"draw\"){tone(300,.09,\"triangle\",.14);tone(620,.14,\"sine\",.12,.07)}\n else if(k===\"shuffle\"){for(var i=0;i<6;i++)tone(220+Math.random()*260,.05,\"square\",.06,i*.055);tone(660,.15,\"sine\",.12,.38)}\n else if(k===\"ok\"){tone(523,.1,\"sine\",.14);tone(784,.18,\"sine\",.14,.09)}\n else if(k===\"no\")tone(180,.18,\"sawtooth\",.08)}\nfunction buzz(ms){if(!SOUND)return;try{if(navigator.vibrate)navigator.vibrate(ms)}catch(e){}}\nfunction toast(m){var e=$(\"toast\");e.textContent=m;e.classList.add(\"on\");clearTimeout(toast.h);toast.h=setTimeout(function(){e.classList.remove(\"on\")},1500)}\nvar IC_ON='<svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 9v6h4l5 4V5L8 9H4z\"/><path d=\"M16 9a4 4 0 0 1 0 6\"/><path d=\"M18.5 6.5a8 8 0 0 1 0 11\"/></svg>';\nvar IC_OFF='<svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 9v6h4l5 4V5L8 9H4z\"/><path d=\"M17 9l5 6M22 9l-5 6\"/></svg>';\nfunction updSnd(){[\"snd0\",\"snd1\",\"snd2\"].forEach(function(id){var b=$(id);b.innerHTML=SOUND?IC_ON:IC_OFF;b.classList.toggle(\"off\",!SOUND);b.setAttribute(\"aria-label\",t(SOUND?\"sndOn\":\"sndOff\"));b.setAttribute(\"title\",t(SOUND?\"sndOn\":\"sndOff\"));b.setAttribute(\"aria-pressed\",SOUND?\"true\":\"false\")})}\nfunction toggleSnd(){SOUND=!SOUND;ls(\"ctw_snd\",SOUND?\"on\":\"off\");updSnd();if(SOUND)sfx(\"tap\")}\n/* ui */\nfunction apply(){document.documentElement.lang=L;\n Array.prototype.forEach.call(document.querySelectorAll(\"[data-t]\"),function(e){e.textContent=t(e.getAttribute(\"data-t\"))});\n Array.prototype.forEach.call(document.querySelectorAll(\"[data-ph]\"),function(e){e.placeholder=t(e.getAttribute(\"data-ph\"))});\n $(\"lang1\").textContent=$(\"lang2\").textContent=(L===\"en\"?\"VI\":\"EN\");\n $(\"back\").textContent=t(\"back\");$(\"draw\").textContent=t(\"next\");$(\"reshuf\").textContent=t(\"shuffle\");$(\"backTxt\").textContent=t(\"tap\");updSnd();if(lib)buildGrid()}\nfunction show(id){[\"gate\",\"home\",\"play\"].forEach(function(s){$(s).classList.add(\"hidden\")});$(id).classList.remove(\"hidden\");if(id===\"play\")$(\"play\").style.display=\"flex\"}\nfunction esc(s){return String(s).replace(/[&<>\"]/g,function(c){return {\"&\":\"&amp;\",\"<\":\"&lt;\",\">\":\"&gt;\",'\"':\"&quot;\"}[c]})}\nfunction buildGrid(){var h=\"\";lib.decks.forEach(function(d){if(STORE&&d.adult)return;var sub=\"\";\n if(d.owned){sub=d.piles&&d.piles.length?'<small>'+d.piles.map(function(p){return L===\"vi\"?p.vi:p.label}).join(\" / \")+'</small>':'<small>'+d.count+' '+t(\"cards\")+'</small>'}\n var lock=d.owned?\"\":'<svg viewBox=\"0 0 24 24\" aria-label=\"locked\"><rect x=\"5\" y=\"11\" width=\"14\" height=\"9\" rx=\"2\"/><path d=\"M8 11V8a4 4 0 0 1 8 0v3\"/></svg>';\n h+='<button class=\"tile'+(d.owned?'':' locked')+'\" data-id=\"'+d.id+'\" style=\"--c:'+d.color+'\"><b>'+esc(nm(d))+'</b>'+sub+lock+'</button>'});\n $(\"grid\").innerHTML=h;\n Array.prototype.forEach.call(document.querySelectorAll(\".tile\"),function(b){b.onclick=function(){pick(b.getAttribute(\"data-id\"))}})}\nfunction modal(h){$(\"sheet\").innerHTML=h;$(\"modal\").classList.remove(\"hidden\")}\nfunction closeModal(){$(\"modal\").classList.add(\"hidden\")}\nfunction pick(id){var d=lib.decks.filter(function(x){return x.id===id})[0];if(!d)return;\n if(!d.owned){modal('<h1 style=\"font-size:20px\">'+esc(nm(d))+'</h1><p>'+t(\"locked\")+'</p><a class=\"btn\" style=\"display:block;text-align:center;text-decoration:none;background:'+d.color+'\" href=\"'+esc(d.buy)+'\" target=\"_blank\" rel=\"noopener\">'+t(\"buy\")+'</a><button class=\"btn ghost\" onclick=\"closeModal()\">'+t(\"close\")+'</button>');return}\n if(d.adult&&ls(\"ctw_adult\")!==\"1\"){modal('<h1 style=\"font-size:20px\">'+t(\"adultT\")+'</h1><p>'+t(\"adultP\")+'</p><button class=\"btn\" style=\"background:'+d.color+'\" id=\"yes\">'+t(\"adultY\")+'</button><button class=\"btn ghost\" onclick=\"closeModal()\">'+t(\"adultN\")+'</button>');\n  $(\"yes\").onclick=function(){ls(\"ctw_adult\",\"1\");closeModal();openDeck(d)};return}\n openDeck(d)}\nfunction shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),x=a[i];a[i]=a[j];a[j]=x}return a}\nfunction openDeck(d){cur=d;part=\"all\";$(\"play\").style.setProperty(\"--c\",d.color);\n var seg=$(\"seg\");\n if(d.piles&&d.piles.length){var h=\"\";d.piles.forEach(function(p){h+='<button data-p=\"'+p.id+'\" aria-pressed=\"false\">'+esc(L===\"vi\"?p.vi:p.label)+'</button>'});h+='<button data-p=\"all\" aria-pressed=\"true\">'+t(\"mixed\")+'</button>';seg.innerHTML=h;seg.classList.remove(\"hidden\");\n  Array.prototype.forEach.call(seg.querySelectorAll(\"button\"),function(b){b.onclick=function(){part=b.getAttribute(\"data-p\");Array.prototype.forEach.call(seg.querySelectorAll(\"button\"),function(x){x.setAttribute(\"aria-pressed\",x===b?\"true\":\"false\")});build()}})}\n else seg.classList.add(\"hidden\");\n build();show(\"play\")}\nfunction pickSet(){var e=cur.sets[part]||{cover:[],intro:[],cards:[]};if(L===\"vi\"&&cur.sets_vi){var v=cur.sets_vi[part];if(v&&(v.cover.length||v.intro.length||v.cards.length))return v}return e}function build(){var s=pickSet();\n seq=s.cover.concat(s.intro).map(function(x){return {k:x.k,v:x.v,fixed:1}}).concat(shuffle(s.cards.slice()).map(function(x){return {k:x.k,v:x.v}}));\n total=s.cards.length;idx=0;shown=0;flipped=false;busy=false;var c=$(\"card\");c.classList.remove(\"flip\");\n c.style.setProperty(\"--ar\",cur.por?\"5/7\":\"7/5\");c.style.setProperty(\"--cw\",cur.por?\"300px\":\"460px\");$(\"front\").className=\"face front\";$(\"front\").innerHTML=\"\";upd()}\nfunction upd(){$(\"count\").textContent=nm(cur)+\"  ·  \"+t(\"drawn\")+\" \"+shown+\" \"+t(\"of\")+\" \"+total}\nfunction url(it){return \"/api/img?k=\"+encodeURIComponent(it.k)+\"&v=\"+encodeURIComponent(it.v||\"\")+\"&t=\"+encodeURIComponent(tok()||\"\")}\nfunction draw(){if(busy)return;var c=$(\"card\");\n if(idx>=seq.length){sfx(\"no\");$(\"front\").className=\"face front\";$(\"front\").innerHTML='<p style=\"color:var(--ink);font-weight:600;text-align:center;padding:22px\">'+t(\"done\")+'</p>';c.classList.add(\"flip\");flipped=true;return}\n var it=seq[idx];busy=true;\n var im=new Image();\n im.onload=function(){idx++;if(!it.fixed)shown++;sfx(\"draw\");buzz(15);\n  var go=function(){var w=im.naturalWidth,h=im.naturalHeight,land=w>=h;\n   c.style.setProperty(\"--ar\",w+\"/\"+h);c.style.setProperty(\"--cw\",land?\"460px\":\"300px\");\n   $(\"front\").className=\"face front img\";$(\"front\").innerHTML='<img alt=\"\">';$(\"front\").firstChild.src=im.src;upd();c.classList.add(\"flip\");flipped=true;busy=false;\n   var nx=seq[idx];if(nx){var p=new Image();p.src=url(nx)}};\n  if(flipped){c.classList.remove(\"flip\");setTimeout(go,260)}else go()};\n im.onerror=function(){busy=false;sfx(\"no\");toast(t(\"imgErr\"))};\n im.src=url(it)}\n/* account */\nfunction loadLib(){return fetch(\"/api/library\",{headers:{\"Authorization\":\"Bearer \"+(tok()||\"\")}}).then(function(r){if(r.status===401){ls(\"ctw_tok\",null);ls(\"ctw_lib\",null);return null}return r.json()}).then(function(j){if(j){lib=j;ls(\"ctw_lib\",JSON.stringify(j))}return j}).catch(function(){var c=ls(\"ctw_lib\");lib=c?JSON.parse(c):null;return lib})}\nfunction login(){var email=$(\"email\").value.trim(),order=$(\"order\").value.trim();$(\"err\").textContent=\"\";\n fetch(\"/api/login\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({email:email,order:order,device:dev()})})\n .then(function(r){return r.json().then(function(j){return {s:r.status,j:j}})})\n .then(function(x){if(x.s===200){ls(\"ctw_tok\",x.j.token);sfx(\"ok\");loadLib().then(function(j){if(j){buildGrid();show(\"home\")}else $(\"err\").textContent=t(\"net\")})}\n  else{sfx(\"no\");$(\"err\").textContent=t(x.j.error===\"device_limit\"?\"limit\":\"bad\")}})\n .catch(function(){$(\"err\").textContent=t(\"net\")})}\nfunction signout(){fetch(\"/api/unlink\",{method:\"POST\",headers:{\"Authorization\":\"Bearer \"+(tok()||\"\")}}).catch(function(){}).then(function(){ls(\"ctw_tok\",null);ls(\"ctw_lib\",null);lib=null;show(\"gate\")})}\nfunction toggleLang(){L=(L===\"en\"?\"vi\":\"en\");ls(\"ctw_lang\",L);apply();if(cur&&!$(\"play\").classList.contains(\"hidden\"))openDeck(cur)}\n$(\"unlock\").onclick=login;$(\"order\").onkeydown=function(e){if(e.key===\"Enter\")login()};\n$(\"lang1\").onclick=toggleLang;$(\"lang2\").onclick=toggleLang;\n[\"snd0\",\"snd1\",\"snd2\"].forEach(function(id){$(id).onclick=toggleSnd});\n$(\"card\").onclick=draw;$(\"card\").onkeydown=function(e){if(e.key===\"Enter\"||e.key===\" \"){e.preventDefault();draw()}};\n$(\"draw\").onclick=draw;\n$(\"reshuf\").onclick=function(){build();sfx(\"shuffle\");buzz([20,30,20]);toast(t(\"shufd\"));var c=$(\"card\");c.classList.remove(\"shuf\");void c.offsetWidth;c.classList.add(\"shuf\")};\n$(\"back\").onclick=function(){show(\"home\")};\n$(\"signout\").onclick=signout;\n$(\"modal\").onclick=function(e){if(e.target===$(\"modal\"))closeModal()};\ndocument.addEventListener(\"click\",function(e){var b=e.target.closest&&e.target.closest(\"button\");if(b&&[\"draw\",\"reshuf\",\"unlock\",\"snd0\",\"snd1\",\"snd2\"].indexOf(b.id)<0)sfx(\"tap\")});\nL=\"en\";apply();\nif(\"serviceWorker\" in navigator)navigator.serviceWorker.register(\"/sw.js\").catch(function(){});\nvar cached=ls(\"ctw_lib\");\nif(tok()&&cached){try{lib=JSON.parse(cached);buildGrid();show(\"home\")}catch(e){show(\"gate\")}\n loadLib().then(function(j){if(j){buildGrid()}else if(!tok()){show(\"gate\")}})}\nelse if(tok()){loadLib().then(function(j){if(j){buildGrid();show(\"home\")}else show(\"gate\")})}\nelse show(\"gate\");\n</script>\n</body>\n</html>\n";
const SW_JS = "const C='ctw-v1';\nself.addEventListener('install',e=>{self.skipWaiting()});\nself.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});\nself.addEventListener('fetch',e=>{\n if(e.request.method!=='GET')return;\n const u=new URL(e.request.url);\n if(u.pathname==='/api/img'){\n  const key=u.origin+'/api/img?k='+encodeURIComponent(u.searchParams.get('k')||'')+'&v='+encodeURIComponent(u.searchParams.get('v')||'');\n  e.respondWith(caches.open(C).then(async c=>{const m=await c.match(key);if(m)return m;const r=await fetch(e.request);if(r.ok)c.put(key,r.clone());return r}));\n }else if(u.pathname==='/'||u.pathname.startsWith('/assets/')){\n  e.respondWith(fetch(e.request).then(r=>{const cl=r.clone();caches.open(C).then(c=>c.put(e.request,cl));return r}).catch(()=>caches.match(e.request)));\n }\n});\n";
const MANIFEST = "{\"name\": \"Closer Than Words\", \"short_name\": \"Closer\", \"start_url\": \"/\", \"scope\": \"/\", \"display\": \"standalone\", \"background_color\": \"#F7EFE2\", \"theme_color\": \"#B5472B\", \"icons\": [{\"src\": \"/assets/icon-192.png\", \"sizes\": \"192x192\", \"type\": \"image/png\"}, {\"src\": \"/assets/icon-512.png\", \"sizes\": \"512x512\", \"type\": \"image/png\"}]}";

const enc = new TextEncoder();
const MIME = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml" };

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
async function hmac(secret, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
function toB64(u8) { let s = ""; u8.forEach((b) => (s += String.fromCharCode(b))); return btoa(s); }
function b64url(s) { return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function same(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
// Order numbers ("1001") and Shopify confirmation codes ("WJGC1LYYT") are both accepted: keep letters and digits only.
const norm = (s) => String(s || "").replace(/[^a-z0-9]/gi, "").toUpperCase();

async function makeToken(env, email, dev) {
  const p = btoa(JSON.stringify({ e: email, d: dev }));
  return p + "." + b64url(toB64(await hmac(env.TOKEN_SECRET, p)));
}
async function auth(env, req) {
  const h = req.headers.get("Authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : new URL(req.url).searchParams.get("t");
  if (!t) return null;
  const [p, s] = t.split(".");
  if (!p || !s) return null;
  if (!same(b64url(toB64(await hmac(env.TOKEN_SECRET, p))), s)) return null;
  try {
    const o = JSON.parse(atob(p));
    const rec = JSON.parse((await env.DB.get("c:" + o.e)) || "null");
    if (!rec || !rec.devices.includes(o.d)) return null; // device was removed
    return { email: o.e, dev: o.d, rec };
  } catch (e) { return null; }
}

async function login(req, env) {
  let b; try { b = await req.json(); } catch (e) { return json({ error: "bad" }, 400); }
  const email = String(b.email || "").trim().toLowerCase();
  const order = norm(b.order);
  const dev = String(b.device || "").slice(0, 80);
  if (!email || !order || !dev) return json({ error: "bad" }, 401);
  const owner = await env.DB.get("o:" + order);
  if (!owner || owner !== email) return json({ error: "bad" }, 401);
  const rec = JSON.parse((await env.DB.get("c:" + email)) || "null");
  if (!rec) return json({ error: "bad" }, 401);
  if (!rec.devices.includes(dev)) {
    if (rec.devices.length >= CFG.maxDevices) return json({ error: "device_limit" }, 409);
    rec.devices.push(dev);
    await env.DB.put("c:" + email, JSON.stringify(rec));
  }
  return json({ token: await makeToken(env, email, dev) });
}

async function unlink(req, env) {
  const a = await auth(env, req);
  if (!a) return json({ ok: true });
  a.rec.devices = a.rec.devices.filter((d) => d !== a.dev);
  await env.DB.put("c:" + a.email, JSON.stringify(a.rec));
  return json({ ok: true });
}

function classify(objs) {
  const out = { cover: [], intro: [], cards: [] };
  objs.forEach((o) => {
    const base = o.key.split("/").pop();
    const ext = base.split(".").pop().toLowerCase();
    if (!MIME[ext] || ext === "svg") return;
    const item = { k: o.key, v: (o.etag || "").slice(0, 8), n: parseInt(base, 10), b: base };
    const low = base.toLowerCase();
    if (low.includes("cover")) out.cover.push(item);
    else if (low.includes("intro")) out.intro.push(item);
    else out.cards.push(item);
  });
  const nat = (a, b) => (isNaN(a.n) ? 9999 : a.n) - (isNaN(b.n) ? 9999 : b.n) || a.b.localeCompare(b.b);
  out.cover.sort(nat); out.intro.sort(nat);
  const clean = (arr) => arr.map((x) => ({ k: x.k, v: x.v }));
  return { cover: clean(out.cover), intro: clean(out.intro), cards: clean(out.cards) };
}
async function listAll(env, prefix) {
  let objs = [], cursor;
  do {
    const r = await env.CARDS.list({ prefix: prefix + "/", cursor });
    objs = objs.concat(r.objects);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return objs;
}

// One listing per deck. Folder layout inside a deck folder:
//   <deck>/…                 English cards (main set)
//   <deck>/<Truth|Dare|…>/…  English piles
//   <deck>/vi/…              Vietnamese main set      (optional)
//   <deck>/vi/<Truth|…>/…    Vietnamese piles         (optional)
function groupDeck(d, objs) {
  const prefix = d.folder + "/";
  const buckets = { en: {}, vi: {} };
  for (const o of objs) {
    const parts = o.key.slice(prefix.length).split("/");
    let lang = "en";
    if (parts.length > 1 && parts[0].toLowerCase() === "vi") { lang = "vi"; parts.shift(); }
    let set = "all";
    if (parts.length === 2) {
      const pile = (d.piles || []).find((p) => p.folder.toLowerCase() === parts[0].toLowerCase());
      if (!pile) continue;
      set = pile.id;
    } else if (parts.length !== 1) continue;
    (buckets[lang][set] = buckets[lang][set] || []).push(o);
  }
  const out = { sets: {}, sets_vi: {} };
  for (const lang of ["en", "vi"]) {
    const target = lang === "en" ? out.sets : out.sets_vi;
    for (const id of ["all"].concat((d.piles || []).map((p) => p.id))) {
      const c = classify(buckets[lang][id] || []);
      if (lang === "en" || c.cover.length || c.intro.length || c.cards.length) target[id] = c;
    }
  }
  return out;
}

async function library(req, env) {
  const a = await auth(env, req);
  if (!a) return json({ error: "auth" }, 401);
  const decks = await Promise.all(CFG.decks.map(async (d) => {
    const base = { id: d.id, name: d.name, vi: d.vi, color: d.color, por: d.por, adult: !!d.adult };
    if (!a.rec.decks.includes(d.id)) {
      return Object.assign(base, { owned: false, buy: CFG.shopUrl + "/search?q=" + encodeURIComponent(d.folder) });
    }
    const g = groupDeck(d, await listAll(env, d.folder));
    if (!g.sets.all) g.sets.all = { cover: [], intro: [], cards: [] };
    for (const p of d.piles || []) if (!g.sets[p.id]) g.sets[p.id] = { cover: [], intro: [], cards: [] };
    return Object.assign(base, { owned: true, count: g.sets.all.cards.length, piles: d.piles || [], sets: g.sets, sets_vi: g.sets_vi });
  }));
  return json({ decks });
}

async function img(req, env) {
  const a = await auth(env, req);
  if (!a) return new Response("Unauthorized", { status: 401 });
  const k = new URL(req.url).searchParams.get("k") || "";
  const ok = CFG.decks.some((d) => a.rec.decks.includes(d.id) && k.startsWith(d.folder + "/"));
  if (!ok || k.includes("..")) return new Response("Forbidden", { status: 403 });
  const o = await env.CARDS.get(k);
  if (!o) return new Response("Not found", { status: 404 });
  const ext = k.split(".").pop().toLowerCase();
  return new Response(o.body, { headers: { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable" } });
}

async function asset(env, name) {
  if (!name || name.includes("..")) return new Response("Not found", { status: 404 });
  const o = await env.CARDS.get("assets/" + name);
  if (!o) return new Response("Not found", { status: 404 });
  const ext = name.split(".").pop().toLowerCase();
  return new Response(o.body, { headers: { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "public, max-age=3600" } });
}

async function shopify(req, env) {
  const raw = await req.text();
  const sig = req.headers.get("X-Shopify-Hmac-Sha256") || "";
  if (!same(toB64(await hmac(env.SHOPIFY_SECRET, raw)), sig)) return new Response("Bad signature", { status: 401 });
  const order = JSON.parse(raw);
  const email = String(order.email || (order.customer && order.customer.email) || "").trim().toLowerCase();
  // Only the digital version counts: the product title or the variant name must contain the word "digital".
  // So a "Physical" variant never unlocks anything, while "Digital" and "Physical + Digital" do.
  const titles = (order.line_items || [])
    .filter((i) => /digital/i.test(String(i.title || "") + " " + String(i.variant_title || "")))
    .map((i) => String(i.title || "").toLowerCase());
  let granted = [];
  if (titles.some((t) => t.includes(CFG.bundleMatch))) granted = CFG.decks.map((d) => d.id);
  else granted = CFG.decks.filter((d) => titles.some((t) => t.includes(d.match))).map((d) => d.id);
  if (!email || !granted.length) return new Response("ok");
  const rec = JSON.parse((await env.DB.get("c:" + email)) || '{"decks":[],"orders":[],"devices":[]}');
  rec.decks = Array.from(new Set(rec.decks.concat(granted)));
  const nums = Array.from(new Set([norm(order.order_number), norm(order.name), norm(order.confirmation_number)].filter(Boolean)));
  rec.orders = Array.from(new Set(rec.orders.concat(nums)));
  await env.DB.put("c:" + email, JSON.stringify(rec));
  for (const n of nums) await env.DB.put("o:" + n, email);
  return new Response("ok");
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname;
    try {
      const storeBuild = u.searchParams.get("store") === "ms";
      if (p === "/") return new Response(storeBuild ? APP_HTML.replace('href="/manifest.webmanifest"', 'href="/manifest.webmanifest?store=ms"') : APP_HTML, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-cache" } });
      if (p === "/sw.js") return new Response(SW_JS, { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-cache" } });
      if (p === "/manifest.webmanifest") {
        let m = MANIFEST;
        if (storeBuild) { const o = JSON.parse(MANIFEST); o.start_url = "/?store=ms"; o.id = "/?store=ms"; m = JSON.stringify(o); }
        return new Response(m, { headers: { "Content-Type": "application/manifest+json" } });
      }
      if (p.startsWith("/assets/")) return asset(env, decodeURIComponent(p.slice(8)));
      if (p === "/api/login" && req.method === "POST") return login(req, env);
      if (p === "/api/library") return library(req, env);
      if (p === "/api/img") return img(req, env);
      if (p === "/api/unlink" && req.method === "POST") return unlink(req, env);
      if (p === "/api/shopify" && req.method === "POST") return shopify(req, env);
      return new Response("Not found", { status: 404 });
    } catch (e) {
      return json({ error: "server" }, 500);
    }
  },
};
