# İngilizce Speaking Pratik

Her gün değişen içerik ve her girişte farklı bir konuşma testi sunan, ücretsiz ve sunucusuz bir İngilizce konuşma pratiği sitesi.

- Canlı site: GitHub Pages (kök dizindeki `index.html`)
- Konuşma tanıma: Chrome / Edge (Web Speech API). Desteklenmeyen tarayıcılarda yazarak cevap verilir.
- Ses kaydı saklanmaz, cihazdan çıkmaz.

## Geliştirme

```
node --test tests/*.test.js   # mantık, içerik ve derleme testleri
node build.js                 # app/ -> dist/index.html (tek dosya)
cp dist/index.html index.html # yayın dosyası
```

İçerik `app/content.js` içindeki `DAILY` listesinde (60 gün, sonra başa sarar).
