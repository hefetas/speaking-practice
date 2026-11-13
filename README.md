# Konuş – İngilizce Speaking Pratik

Ücretsiz, hesapsız, sunucusuz bir konuşma pratiği sitesi. Her gün yeni bir konu, her ziyarette farklı bir test; arkadaşlarla link üzerinden sıralı "meydan okuma".

## Geliştirme

```bash
node build.js                      # dist/ içine tek dosyalık index.html + PWA dosyaları
node --test tests/*.test.js        # birim + build testleri (klasör değil, glob!)
node tests/e2e-check.js            # tarayıcı testi (Playwright + Chrome, ~7 dk)
```

`app/` kaynak, `dist/` çıktı. GitHub Pages kökten yayın yapar: yayın için `dist/*` dosyalarını (index.html, manifest.webmanifest, sw.js, icon-*.png) repo köküne kopyalayın.

## Mimari (kısa)

- Tek HTML dosyası (CSS+JS içeride), sunucu yok, ağ çağrısı yok (CSP `connect-src 'none'`).
- İlerleme yalnızca `localStorage`'da. Onay verilmeden hiçbir şey yazılmaz.
- Meydan okuma: sonuçlar (takma ad + sayılar) URL `#c=` parçasında taşınır; metin/ses asla linke girmez. Link girdileri `challenge.js` içinde doğrulanır, ekrana `esc()` ile basılır.
- Yedek kodu: `backup.js` (checksum + beyaz liste doğrulaması).
- Dil: `i18n.js` (TR/EN, anahtar eşitliği testle korunur). Hukuki metinler: `legal.js`.

## Yayın öncesi kontrol listesi (halka açılmadan önce)

Şu an site **noindex** (arama motorlarına kapalı). Halka açmak için:

1. `app/config.json` içinde `operator` ve `contact` alanlarını doldurun (gizlilik/şartlar metinleri bunları kullanır).
2. Hukuki metinleri (`app/legal.js`) bir hukukçuya okutun; bunlar taslaktır. KVKK kapsamında veri sorumlusu bilgisi ve iletişim adresi gerçek olmalı.
3. Kendi alan adınızı bağlayın (reklam ağları `github.io` adreslerini genelde kabul etmez).
4. `LAUNCH=1 node build.js` ile derleyin (robots → `index,follow`, taslak uyarısı kalkar). `og:image` ve `canonical` için mutlak adres eklemek gerekir.
5. Reklam eklenecekse: gizlilik metnini güncelleyin, çerez/rıza kategorisi ekleyin, CSP'ye reklam ağı alanlarını ekleyin, `ads.txt` ekleyin, onay gelmeden kod koymayın.
6. İsteğe bağlı sayaç: çerezsiz bir servis (ör. GoatCounter) eklenirse gizlilik metni ve CSP güncellenmeli.
7. `consentVersion` değerini (config.json) metinler önemli ölçüde değişince artırın; kullanıcılardan yeniden onay istenir.

## Hukuki / güvenlik notları

- IELTS tescilli bir markadır; site "IELTS tarzı" ifadesini kullanır ve bağlantılı olmadığını belirtir.
- Konuşma tanıma tarayıcıdan gelir (Chrome/Edge sesi sağlayıcının sunucusuna gönderebilir); onay ekranı ve gizlilik metni bunu açıkça söyler.
- "Verilerimi sil" düğmesi tüm yerel veriyi siler (KVKK md. 11 uyumu).
- Hiçbir ekran girdi/link içeriğini `innerHTML` ile ham basmaz; test: `tests/e2e-check.js` #12.


## Sherlock series (first-person episodes)

- `app/series.js`: original scripts (episode data, scoring with contraction/digit tolerance, summary). Add an episode by appending to `EPISODES`; the test suite checks line lengths, no contractions in lines the player must say, and that every key phrase occurs in the script.
- `app/stage.js`: the animation engine. Pure math (two-link IK for arms, critically damped springs, mouth envelope, mood poses) is unit-tested; `mount()` draws the SVG rig and runs the requestAnimationFrame loop. Add a mood by adding a full pose to `POSES`.
- Characters: Sherlock Holmes and Dr. Watson are public-domain (Conan Doyle). Dialogue, plots and artwork are original; the About page says so. Do not copy dialogue or scenes from films/TV adaptations.
- `app/stage3d.js`: the 3D crime-scene stage (hand-written WebGL 1, no libraries, no network). A Baker Street kitchen lit through the window with a real shadow map, a jointed Sherlock who walks between clues (steering around furniture), and a camera that travels to a shot per beat (`shot` field in `series.js`, names in `SHOTS`). Viewers can drag to look around. Falls back to the SVG stage when WebGL is missing. `ctl._advance(sec)` fast-forwards the simulation for headless screenshots.
- Browser check: `node build.js && node tests/e2e-series.js` (runs the 3D scene on SwiftShader and the SVG fallback with WebGL disabled).
