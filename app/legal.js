(function (root) {
  'use strict';

  // Draft legal texts. Placeholders {operator}, {contact}, {date} are filled from config at runtime.
  // These are templates and should be reviewed by a lawyer before a public launch.
  var tr = {
    privacy: [
      { h: '1. Veri sorumlusu ve kapsam', p: [
        'Bu site (“Konuş”), İngilizce konuşma pratiği yapmak için hazırlanmış ücretsiz bir web uygulamasıdır. İşletmeci: {operator}. İletişim: {contact}.',
        'Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) madde 10 kapsamındaki aydınlatma yükümlülüğünü yerine getirmek için hazırlanmıştır.',
        'Sitede hesap, üyelik veya sunucu tarafı kayıt yoktur. İşletmeci olarak kişisel verilerini sunucularımızda toplamıyor ve saklamıyoruz.'
      ] },
      { h: '2. Hangi veriler nerede işlenir', p: [
        'İlerleme verilerin (seri, XP, rütbe, rozetler, test sayıları, söylediğin kelime sayısı, kelime defteri, takma adın, dil ve seviye tercihin) yalnızca cihazındaki tarayıcının yerel depolamasında (localStorage) tutulur. Bu veriler bize iletilmez.',
        'Konuşma tanıma, tarayıcının kendi özelliğiyle yapılır. Chrome, Edge gibi tarayıcılarda ses, metne çevrilmek üzere tarayıcı sağlayıcısının (ör. Google, Microsoft) sunucularına gönderilebilir. Bu işleme ilgili tarayıcı sağlayıcısının kendi gizlilik politikası uygulanır; ses bize ulaşmaz. İstemezsen cevabını yazarak verebilirsin.',
        'İsteğe bağlı “sesimi kaydet” seçeneği varsayılan olarak kapalıdır. Açarsan kayıt yalnızca cihazının belleğinde tutulur, geri dinlemen için kullanılır ve sayfadan ayrıldığında silinir; hiçbir yere yüklenmez.',
        'Arkadaşlarınla meydan okuma linki oluşturursan linkin içine yalnızca takma adın ve sayısal sonuçların (kelime sayısı, farklı kelime sayısı, tempo, dolgu ifade sayısı) eklenir. Konuştuğun veya yazdığın metin ve ses linke eklenmez. Linki kime gönderirsen o kişiler bu bilgileri görebilir.'
      ] },
      { h: '3. İşleme amacı ve hukuki sebep', p: [
        'Veriler yalnızca uygulamanın çalışması, ilerlemeni göstermesi ve seni arkadaşlarınla yarıştırması için işlenir. Hukuki sebep, onay ekranında verdiğin açık rızan ile hizmetin sunulması için işlemenin zorunlu olmasıdır (KVKK md. 5).',
        'Takma ad olarak gerçek adını yazmak zorunda değilsin. Başkalarının kişisel verilerini (ad, telefon, adres vb.) takma ada veya linklere yazma.'
      ] },
      { h: '4. Aktarım, barındırma ve üçüncü taraflar', p: [
        'Verilerini üçüncü kişilere satmıyor veya aktarmıyoruz. Konuşma tanıma için tarayıcı sağlayıcısına yapılan aktarım yukarıda açıklanmıştır ve tarayıcının işleyişinden kaynaklanır.',
        'Site, bir barındırma hizmeti üzerinden yayınlanır. Barındırıcı, siteyi ziyaret ettiğinde IP adresi gibi standart erişim kayıtlarını kendi politikasına göre işleyebilir.',
        'Şu anda sitede reklam, analiz veya izleme aracı yoktur. İleride reklam eklenirse bu metin güncellenir ve gerekli onay ayrıca istenir.'
      ] },
      { h: '5. Çerezler ve yerel depolama', p: [
        'Çerez kullanmıyoruz. Yalnızca tarayıcının localStorage özelliğini, ilerlemeni hatırlamak için kullanıyoruz. İlerleme sekmesindeki “Verilerimi sil” düğmesiyle veya tarayıcı ayarlarından site verilerini silerek her şeyi kaldırabilirsin.'
      ] },
      { h: '6. Saklama süresi', p: [
        'Veriler, sen silene kadar yalnızca kendi cihazında kalır. Yedek kodu oluşturursan o kod senin kontrolündedir.'
      ] },
      { h: '7. KVKK madde 11 kapsamındaki haklarınız', p: [
        'KVKK Madde 11 uyarınca; verilerinin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, düzeltilmesini veya silinmesini isteme, işlemeye itiraz etme ve zarar oluşursa giderilmesini talep etme haklarına sahipsin.',
        'Verilerin sunucularımızda tutulmadığı için bu verileri “Verilerimi sil” düğmesiyle kendin silebilirsin. Başka talepler için {contact} adresine yazabilirsin. Ayrıca Kişisel Verileri Koruma Kurumu’na başvurma hakkın saklıdır.'
      ] },
      { h: '8. Yaş sınırı', p: [
        '13 yaşından küçükler siteyi kullanmamalıdır. 18 yaşından küçükler, siteyi ancak ebeveyn veya vasilerinin bilgisi ve onayıyla kullanmalıdır.'
      ] },
      { h: '9. Değişiklikler', p: [
        'Bu metin gerektiğinde güncellenir. Son güncelleme: {date}. Önemli değişikliklerde yeniden onayın istenebilir.'
      ] }
    ],
    terms: [
      { h: '1. Kabul', p: [
        'Siteyi kullanarak bu koşulları ve Gizlilik Politikası’nı kabul etmiş olursun. Kabul etmiyorsan siteyi kullanma.'
      ] },
      { h: '2. Hizmetin niteliği', p: [
        'Konuş, eğitim ve pratik amaçlı ücretsiz bir araçtır. Konuşma analizi, tempo etiketi, gramer ipuçları ve seviye veya band değerleri yalnızca tahmindir; yöntemleri basittir ve telaffuzu veya dilbilgisini tam olarak ölçmez. Gerçek bir sınav sonucunu veya öğretmen değerlendirmesini garanti etmez ve onların yerine geçmez.'
      ] },
      { h: '3. Markalar', p: [
        'IELTS, ilgili hak sahiplerinin tescilli markasıdır. Bu site onlarla bağlantılı değildir; onlar tarafından onaylanmamış, desteklenmemiş veya yetkilendirilmemiştir. “IELTS tarzı” ifadesi, yalnızca sınav formatına benzer pratik soruları anlatmak içindir. Diğer marka ve ürün adları kendi sahiplerine aittir.'
      ] },
      { h: '4. “Olduğu gibi” sunum ve sorumluluk', p: [
        'Hizmet “olduğu gibi” ve “mevcut haliyle” sunulur. Kesintisiz veya hatasız çalışacağı, tarayıcı ve cihazınla uyumlu olacağı garanti edilmez. Kanunların izin verdiği ölçüde, hizmetin kullanımından doğan dolaylı zararlardan sorumlu değiliz. Kanunen sınırlandırılamayacak haklarına dokunulmaz.'
      ] },
      { h: '5. Kullanım kuralları', p: [
        'Takma adlarda ve paylaştığın linklerde hakaret, nefret söylemi, müstehcen veya yasa dışı ifadeler ve başkalarının kişisel verileri bulunamaz. Siteyi otomatik araçlarla aşırı yüklemek, güvenliğini aşmaya çalışmak veya başkalarını rahatsız etmek yasaktır.',
        'Meydan okuma sıralamaları kullanıcı beyanına dayanır, doğrulanmaz ve eğlence amaçlıdır.'
      ] },
      { h: '6. Fikri haklar', p: [
        'Sitenin yazılımı ve özgün içerikleri {operator} tarafına aittir. Geleneksel dil dönmeleri kamu malıdır. Siteyi kişisel ve ticari olmayan amaçla kullanabilirsin; içeriği izinsiz çoğaltıp satamazsın.'
      ] },
      { h: '7. Değişiklik ve uygulanacak hukuk', p: [
        'Koşullar güncellenebilir; güncel hâli sitede yayınlanır. Bu koşullara Türkiye Cumhuriyeti hukuku uygulanır. Tüketici mevzuatından doğan zorunlu haklar saklıdır. İletişim: {contact}. Son güncelleme: {date}.'
      ] }
    ],
    about: [
      { h: 'Konuş nedir?', p: [
        'Her gün değişen bir konu ve her ziyarette farklı bir konuşma testiyle İngilizce konuşma alışkanlığı kazandırmak için yapılmış ücretsiz bir pratik sitesi.'
      ] },
      { h: 'Nasıl çalışır?', p: [
        'Günün konusunu ve seviyeni seç, testi başlat, konuş. Konuşma tanıma destekleyen tarayıcılarda (Chrome, Edge) söylediklerin yazıya dökülür ve basit bir analiz çıkar. Desteklemeyen tarayıcılarda cevabını yazabilirsin. Serin, XP’n ve rozetlerin cihazında saklanır.'
      ] },
      { h: 'Arkadaşlarınla oyna', p: [
        'Bir meydan okuma linki oluşturup arkadaşlarına gönder. Aynı konuyu sırayla konuşursunuz; sonuçlar linkin içinde taşınır ve sıralama herkeste görünür. Ses ve metin paylaşılmaz.'
      ] },
      { h: 'Sınırlar ve uyarılar', p: [
        'Analizler ve seviye tahminleri kabadır, resmi değildir. IELTS, ilgili hak sahiplerinin tescilli markasıdır ve bu site onlarla bağlantılı değildir.',
        'Sherlock Holmes ve Dr. Watson karakterleri Arthur Conan Doyle’un kamu malına geçmiş eserlerinden gelir. Dizideki tüm diyaloglar, hikâyeler ve çizimler bu sitenin özgün üretimidir; herhangi bir film, dizi ya da yayıncıyla bağlantısı yoktur.'
      ] },
      { h: 'İletişim', p: [
        'İşletmeci: {operator}. Geri bildirim ve talepler için: {contact}.'
      ] }
    ]
  };

  var en = {
    privacy: [
      { h: '1. Controller and scope', p: [
        'This site (“Konuş”) is a free web app for practicing spoken English. Operator: {operator}. Contact: {contact}.',
        'This notice is provided to meet the information duty under Article 10 of the Turkish Personal Data Protection Law No. 6698 (KVKK) and for general transparency.',
        'The site has no accounts, sign-up or server-side records. As the operator we do not collect or store your personal data on our servers.'
      ] },
      { h: '2. What data is processed and where', p: [
        'Your progress data (streak, XP, rank, badges, test counts, word counts, vocabulary notebook, nickname, language and level choices) is kept only in your browser’s local storage (localStorage) on your device. It is not sent to us.',
        'Speech recognition is done by your browser’s own feature. In browsers such as Chrome or Edge, audio may be sent to the browser vendor’s servers (for example Google or Microsoft) to be converted to text. The browser vendor’s own privacy policy applies to that processing; the audio does not reach us. You can type your answer instead.',
        'The optional “record my voice” setting is off by default. If you turn it on, the recording stays in your device’s memory only, is used for playback and is discarded when you leave the page; it is never uploaded.',
        'If you create a challenge link for friends, it contains only your nickname and numeric results (word count, unique words, pace, filler count). Your spoken or typed text and your audio are not included. Anyone you send the link to can see this information.'
      ] },
      { h: '3. Purpose and legal basis', p: [
        'Data is processed only so the app works, shows your progress and lets you compare results with friends. The legal basis is your explicit consent given on the consent screen and the need to provide the service (KVKK Art. 5).',
        'You do not have to use your real name as a nickname. Do not put other people’s personal data (names, phone numbers, addresses) in nicknames or links.'
      ] },
      { h: '4. Transfers, hosting and third parties', p: [
        'We do not sell or hand your data to third parties. The transfer to your browser vendor for speech recognition is described above and results from how the browser works.',
        'The site is served through a hosting provider. When you visit, the host may process standard access logs such as your IP address under its own policy.',
        'The site currently has no ads, analytics or tracking tools. If ads are added later, this notice will be updated and any required consent will be requested separately.'
      ] },
      { h: '5. Cookies and local storage', p: [
        'We do not use cookies. We only use the browser’s localStorage to remember your progress. You can remove everything with the “Delete my data” button on the Progress tab or by clearing site data in your browser settings.'
      ] },
      { h: '6. Retention', p: [
        'Data stays only on your device until you delete it. A backup code, if you create one, is under your control.'
      ] },
      { h: '7. Your rights under KVKK Article 11', p: [
        'Under KVKK Article 11 you may ask whether your data is processed, request information, learn whether it is used for its purpose, ask for correction or deletion, object to processing and claim compensation for damage.',
        'Because your data is not held on our servers, you can delete it yourself with the “Delete my data” button. For other requests write to {contact}. You also keep the right to complain to the Turkish Personal Data Protection Authority.'
      ] },
      { h: '8. Age limit', p: [
        'Children under 13 must not use the site. Users under 18 should use it only with the knowledge and consent of a parent or guardian.'
      ] },
      { h: '9. Changes', p: [
        'This notice may be updated. Last updated: {date}. For important changes we may ask for your consent again.'
      ] }
    ],
    terms: [
      { h: '1. Acceptance', p: [
        'By using the site you accept these terms and the Privacy Policy. If you do not accept them, do not use the site.'
      ] },
      { h: '2. Nature of the service', p: [
        'Konuş is a free tool for study and practice. The speech analysis, pace labels, grammar tips and level or band values are estimates only; their methods are simple and do not fully measure pronunciation or grammar. They do not guarantee or replace a real exam result or a teacher’s assessment.'
      ] },
      { h: '3. Trademarks', p: [
        'IELTS is a registered trademark of its respective owners. This site is not affiliated with, endorsed by, sponsored by or authorized by them. “IELTS-style” only describes practice questions that resemble the exam format. Other brand and product names belong to their owners.'
      ] },
      { h: '4. “As is” and liability', p: [
        'The service is provided “as is” and “as available”. We do not guarantee that it will be uninterrupted, error-free or compatible with your browser or device. To the extent permitted by law, we are not liable for indirect damages arising from its use. Rights that cannot be limited by law are not affected.'
      ] },
      { h: '5. Rules of use', p: [
        'Nicknames and links you share must not contain insults, hate speech, obscene or illegal content, or other people’s personal data. Do not overload the site with automated tools, try to break its security or harass others.',
        'Challenge rankings are self-reported, unverified and for fun.'
      ] },
      { h: '6. Intellectual property', p: [
        'The site’s software and original content belong to {operator}. Traditional tongue twisters are in the public domain. You may use the site for personal, non-commercial purposes; you may not copy and sell the content without permission.'
      ] },
      { h: '7. Changes and governing law', p: [
        'The terms may be updated; the current version is published on the site. These terms are governed by the laws of the Republic of Türkiye. Mandatory consumer rights remain unaffected. Contact: {contact}. Last updated: {date}.'
      ] }
    ],
    about: [
      { h: 'What is Konuş?', p: [
        'A free practice site that builds a speaking habit with a new topic every day and a different speaking test on every visit.'
      ] },
      { h: 'How does it work?', p: [
        'Pick the topic of the day and your level, start a test and speak. In browsers that support speech recognition (Chrome, Edge) your words are written out and a simple analysis is shown. In other browsers you can type your answer. Your streak, XP and badges are stored on your device.'
      ] },
      { h: 'Play with friends', p: [
        'Create a challenge link and send it to friends. You take turns on the same topic; results travel inside the link and everyone sees the ranking. No audio or text is shared.'
      ] },
      { h: 'Limits and notices', p: [
        'Analyses and level estimates are rough and unofficial. IELTS is a registered trademark of its respective owners and this site is not affiliated with them.',
        'The characters Sherlock Holmes and Dr. Watson come from Arthur Conan Doyle’s public-domain stories. All dialogue, plots and artwork in the series are original to this site and are not affiliated with any film, TV series or publisher.'
      ] },
      { h: 'Contact', p: [
        'Operator: {operator}. For feedback and requests: {contact}.'
      ] }
    ]
  };

  var api = { tr: tr, en: en };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Legal = api;
})(typeof window !== 'undefined' ? window : globalThis);
