(function (root) {
  'use strict';

  var LEVELS = ['easy', 'medium', 'hard'];
  var SECONDS = { easy: 45, medium: 60, hard: 90 };

  function D(theme, themeTr, emoji, words, easy, medium, hard) {
    return {
      theme: theme,
      themeTr: themeTr,
      emoji: emoji,
      words: words.split('|'),
      questions: { easy: easy, medium: medium, hard: hard }
    };
  }

  var DAILY = [
    D("Travel plans", "Seyahat planları", "✈️", "destination|book|itinerary|pack|souvenir",
      "Where would you like to travel next, and why?",
      "Describe a trip you would love to plan. Who would you go with and what would you do there?",
      "Some people plan every detail of a trip, others prefer to improvise. Which style is better, and what have you learned from your own experience?"),
    D("Favorite food", "Favori yemek", "🍕", "delicious|recipe|ingredient|taste|portion",
      "What is your favorite food and when do you eat it?",
      "Describe a dish you love. What does it taste like, and who usually makes it?",
      "Do you think food culture is changing too fast? Explain how eating habits have changed in your lifetime."),
    D("Morning routine", "Sabah rutini", "⏰", "wake up|alarm|get ready|commute|breakfast",
      "What do you do in the morning before you leave home?",
      "Describe your ideal morning. What would you change about your current routine?",
      "Is it true that successful people have special morning routines? Give your opinion with examples."),
    D("Weekend plans", "Hafta sonu planları", "🛋️", "relax|catch up|hang out|errand|spare time",
      "What do you usually do on weekends?",
      "Tell me about your last weekend and what made it good or bad.",
      "Should weekends be for rest only, or is it better to stay productive? Defend your view."),
    D("Technology in daily life", "Günlük hayatta teknoloji", "📱", "device|update|battery|download|screen time",
      "Which app or device do you use the most, and why?",
      "How has your phone changed the way you live? Give two examples.",
      "Are we too dependent on technology? Discuss both the benefits and the risks."),
    D("Health and sleep", "Sağlık ve uyku", "😴", "tired|schedule|habit|energy|rest",
      "How many hours do you sleep, and do you feel rested?",
      "What habits help you sleep well, and what keeps you awake?",
      "Why do many people ignore sleep when they are busy, and what could be done about it?"),
    D("Movies and series", "Film ve diziler", "🎬", "plot|episode|character|recommend|ending",
      "What is a movie or series you enjoyed recently?",
      "Describe the plot of a story you loved without spoiling the ending.",
      "Do movies and series shape how we see the world? Explain with examples."),
    D("Music", "Müzik", "🎵", "lyrics|playlist|melody|concert|genre",
      "What kind of music do you like to listen to?",
      "Tell me about a song that reminds you of a special time in your life.",
      "Can music change people's mood or behavior? Give reasons and examples."),
    D("Shopping", "Alışveriş", "🛍️", "afford|discount|receipt|browse|bargain",
      "Do you like shopping? What do you buy most often?",
      "Describe the last time you bought something you really wanted. Was it worth it?",
      "Is online shopping better than going to a store? Compare both and give your conclusion."),
    D("Weather", "Hava durumu", "☔", "forecast|humid|breeze|drizzle|temperature",
      "What is the weather like today, and how does it make you feel?",
      "What is your favorite season and what do you do in it?",
      "How does weather affect people's mood and daily plans? Share your thoughts."),
    D("Hobbies", "Hobiler", "🎨", "pastime|skill|practice|enjoy|passion",
      "What is your favorite hobby and how did you start it?",
      "Describe a hobby you would like to try. What attracts you to it?",
      "Do hobbies matter for a person's happiness? Support your opinion with examples."),
    D("Learning languages", "Dil öğrenme", "🗣️", "vocabulary|fluent|accent|mistake|improve",
      "Why are you learning English?",
      "Describe the biggest difficulty in learning a language and how you deal with it.",
      "Will translation technology make learning languages unnecessary? Argue your position."),
    D("Friends", "Arkadaşlar", "🤝", "trust|support|close|get along|loyal",
      "Tell me about your best friend.",
      "What makes a good friend? Give an example from your life.",
      "Is it harder to make friends as an adult? Explain what changes over time."),
    D("Family", "Aile", "👨‍👩‍👧", "relative|grow up|generation|tradition|gather",
      "Who is in your family, and what do you like doing together?",
      "Describe a family tradition that is important to you.",
      "How has the role of the family changed in modern life? Share examples."),
    D("Work and careers", "İş ve kariyer", "💼", "colleague|deadline|promotion|responsibility|salary",
      "What kind of job would you like to have in the future?",
      "Describe your dream career and the steps you need to reach it.",
      "Is job satisfaction more important than salary? Discuss with examples."),
    D("University life", "Üniversite hayatı", "🎓", "lecture|assignment|semester|campus|major",
      "What do you study and why did you choose it?",
      "Describe a typical week at university. What do you enjoy and what is difficult?",
      "Should universities focus more on practical skills than theory? Give your opinion."),
    D("Cooking at home", "Evde yemek yapmak", "🍳", "chop|boil|season|stir|leftovers",
      "Can you cook? What is the easiest meal you can make?",
      "Explain how to make a simple dish step by step.",
      "Is cooking at home really healthier and cheaper than eating out? Explain your view."),
    D("City vs village", "Şehir ve köy", "🏙️", "crowded|peaceful|noise|convenient|rural",
      "Do you prefer living in a city or in a small town? Why?",
      "Compare life in a big city with life in the countryside.",
      "Why are so many people moving to cities, and what problems does this create?"),
    D("Public transport", "Toplu taşıma", "🚌", "ticket|route|delay|rush hour|station",
      "How do you usually get to school or work?",
      "Describe a problem you had while using public transport and how you solved it.",
      "How could cities improve public transport to reduce traffic? Suggest ideas."),
    D("Social media", "Sosyal medya", "💬", "post|follower|scroll|privacy|influence",
      "Which social media do you use and how often?",
      "What are the good and bad sides of social media in your life?",
      "Should there be age limits for social media? Explain why or why not."),
    D("Sports", "Spor", "🏃", "match|train|compete|team|win",
      "What sports do you like to watch or play?",
      "Describe an exciting sports moment you remember.",
      "Do sports teach important life lessons? Discuss using examples."),
    D("Books", "Kitaplar", "📚", "author|chapter|borrow|bookmark|bestseller",
      "Do you like reading? What was the last book you read?",
      "Describe a book that changed the way you think.",
      "Will printed books disappear in the future? Give your opinion."),
    D("Money and saving", "Para ve tasarruf", "💰", "budget|save|expense|invest|afford",
      "Do you save money? What do you want to save for?",
      "How do you manage your money each month? Give some tips.",
      "Should schools teach financial education? Explain how it could help young people."),
    D("Holidays and celebrations", "Bayram ve kutlamalar", "🎉", "celebrate|decorate|feast|guest|custom",
      "What is your favorite holiday and why?",
      "Describe how you celebrate an important day with your family or friends.",
      "Are traditional celebrations losing their meaning today? Share your view."),
    D("Pets", "Evcil hayvanlar", "🐶", "adopt|feed|loyal|stray|cuddle",
      "Do you have a pet, or would you like one? Which animal?",
      "Describe the responsibilities of having a pet.",
      "Should people adopt animals from shelters instead of buying them? Argue your opinion."),
    D("Environment", "Çevre", "🌍", "recycle|pollution|waste|renewable|climate",
      "What do you do at home to protect the environment?",
      "What is the biggest environmental problem in your city and what can be done?",
      "Who should do more about the environment: individuals or governments? Explain."),
    D("Fashion", "Moda", "👗", "outfit|trend|style|comfortable|wardrobe",
      "What kind of clothes do you like to wear?",
      "Describe your favorite outfit and where you wear it.",
      "Does fashion help people express themselves, or does it pressure them? Discuss."),
    D("Coffee and cafes", "Kahve ve kafeler", "☕", "brew|menu|cozy|order|barista",
      "Do you like coffee or tea? Where do you usually drink it?",
      "Describe your ideal cafe. What would it look like?",
      "Why have cafes become popular places to study and work? Share your thoughts."),
    D("Childhood memories", "Çocukluk anıları", "🧸", "childhood|remember|playground|neighborhood|innocent",
      "What did you like to do as a child?",
      "Tell me about a happy memory from your childhood.",
      "How is childhood today different from when you were young? Compare them."),
    D("Dreams and goals", "Hayaller ve hedefler", "🎯", "achieve|ambition|goal|determined|plan",
      "What is one goal you have for this year?",
      "Describe a big dream you have and what you are doing to reach it.",
      "Is it better to follow your dream or choose a safe path? Give reasons."),
    D("Online learning", "Online öğrenme", "💻", "course|lesson|platform|self-paced|certificate",
      "Have you ever taken an online course? What was it about?",
      "What are the advantages and disadvantages of studying online?",
      "Can online education fully replace classrooms? Explain your position."),
    D("Neighbors", "Komşular", "🏘️", "neighbor|borrow|noisy|polite|community",
      "Do you know your neighbors? What are they like?",
      "Describe a time a neighbor helped you or you helped a neighbor.",
      "Why do people in big cities often not know their neighbors, and does it matter?"),
    D("Restaurants", "Restoranlar", "🍽️", "reservation|waiter|bill|tip|service",
      "What is your favorite restaurant and what do you order there?",
      "Describe a good or bad experience you had in a restaurant.",
      "What makes a restaurant truly successful: food, service, or atmosphere? Explain."),
    D("Gifts", "Hediyeler", "🎁", "present|wrap|surprise|thoughtful|occasion",
      "What was the best gift you ever received?",
      "How do you choose a gift for someone? Give an example.",
      "Is giving experiences better than giving objects? Explain your opinion."),
    D("Time management", "Zaman yönetimi", "⏳", "prioritize|procrastinate|schedule|distraction|productive",
      "Are you good at managing your time? Why or why not?",
      "What do you do when you have too many tasks at once?",
      "Why do so many people procrastinate, and what are effective ways to stop?"),
    D("Stress and relaxing", "Stres ve dinlenme", "🧘", "stressed|overwhelmed|unwind|breathe|balance",
      "What do you do to relax after a long day?",
      "Describe a stressful situation and how you handled it.",
      "How can schools and workplaces help people manage stress better?"),
    D("Video games", "Video oyunları", "🎮", "level|player|console|online|challenge",
      "Do you play video games? Which ones do you like?",
      "Describe a game you enjoyed and explain why it was fun.",
      "Are video games a waste of time or a useful skill-builder? Discuss both sides."),
    D("Photography", "Fotoğrafçılık", "📷", "capture|angle|lighting|portrait|memory",
      "Do you like taking photos? What do you usually photograph?",
      "Describe a photo that is special to you and why.",
      "Do we enjoy moments less because we are always taking pictures? Give your opinion."),
    D("Nature and hiking", "Doğa ve yürüyüş", "🥾", "trail|scenery|summit|fresh air|wildlife",
      "Do you like spending time in nature? Where do you go?",
      "Describe a walk or hike you remember and what you saw.",
      "Why do people feel better after spending time in nature? Explain."),
    D("Beach and sea", "Plaj ve deniz", "🏖️", "sand|wave|sunscreen|swim|shore",
      "Do you like the sea? What do you do at the beach?",
      "Describe your perfect day by the sea.",
      "How does mass tourism affect beaches and coastal towns? Share your thoughts."),
    D("Technology of the future", "Geleceğin teknolojisi", "🤖", "artificial|automate|breakthrough|innovation|replace",
      "What technology would you like to see in the future?",
      "How do you think daily life will be different in 20 years?",
      "Will robots and AI take over most jobs? Explain what people should do to prepare."),
    D("Job interviews", "İş görüşmeleri", "🧑‍💼", "resume|qualification|strength|weakness|experience",
      "Have you ever had a job interview? How did it feel?",
      "What would you say if an interviewer asked you to describe yourself?",
      "What makes a candidate stand out in an interview? Give advice with examples."),
    D("Teamwork", "Takım çalışması", "👥", "cooperate|contribute|conflict|role|share",
      "Do you like working in a team or alone?",
      "Describe a time you worked in a group. What was your role?",
      "How should a team deal with a member who does not do their share?"),
    D("Customer service", "Müşteri hizmetleri", "☎️", "complaint|refund|helpful|wait|solution",
      "Have you ever called a customer service line? Why?",
      "Describe a time you made a complaint and what happened.",
      "What are the qualities of excellent customer service? Give your view."),
    D("Hotels and trips", "Oteller ve konaklama", "🏨", "check in|reception|suite|view|stay",
      "What do you look for in a good hotel?",
      "Describe a place you stayed at that you liked or disliked.",
      "Are homestays and apartments better than hotels? Compare the options."),
    D("Airports", "Havalimanları", "🛫", "boarding|luggage|gate|customs|flight",
      "How do you feel about flying?",
      "Describe what happens from arriving at the airport until you sit on the plane.",
      "What would improve the airport experience for travelers? Suggest ideas."),
    D("Doctor visit", "Doktor ziyareti", "🩺", "symptom|appointment|prescription|checkup|recover",
      "When did you last visit a doctor, and why?",
      "How do you take care of yourself when you feel sick?",
      "Should people see a doctor regularly even when they feel fine? Explain."),
    D("Home and furniture", "Ev ve mobilya", "🛋️", "cozy|furniture|decorate|spacious|tidy",
      "Describe your room or home.",
      "How would you decorate your dream home?",
      "Do people spend too much money on their homes? Share your thoughts."),
    D("Moving to a new place", "Yeni bir yere taşınmak", "📦", "relocate|settle in|unpack|adapt|homesick",
      "Have you ever moved to a new place? How was it?",
      "What would you miss most if you moved to another country?",
      "What is the hardest part of adapting to a new city or culture, and how can it be made easier?"),
    D("Volunteering", "Gönüllülük", "🙌", "volunteer|charity|donate|community|rewarding",
      "Would you like to volunteer? What would you do?",
      "Describe a cause you care about and how you could help.",
      "Should volunteering be required at school? Argue your opinion."),
    D("News", "Haberler", "📰", "headline|breaking|reliable|source|report",
      "How do you follow the news?",
      "Describe a news story that interested you recently.",
      "How can we tell whether a news source is reliable? Give advice."),
    D("Art and museums", "Sanat ve müzeler", "🖼️", "exhibit|painting|sculpture|admire|gallery",
      "Do you like museums or art? What do you enjoy?",
      "Describe a museum or an artwork you would recommend.",
      "Is art important for society, or is it a luxury? Explain your view."),
    D("Festivals", "Festivaller", "🎪", "crowd|performance|ticket|atmosphere|lineup",
      "Have you ever been to a festival or a big event?",
      "Describe the atmosphere at an event you attended.",
      "Why are festivals so popular, and who benefits from them?"),
    D("Cars and driving", "Araba ve sürüş", "🚗", "traffic|license|fuel|parking|accident",
      "Do you drive, or would you like to learn?",
      "Describe the traffic in your city and how it affects you.",
      "Will electric and self-driving cars change how we live? Share your thoughts."),
    D("Fitness", "Spor ve zindelik", "💪", "workout|stamina|muscle|healthy|routine",
      "Do you exercise? What do you do to stay active?",
      "How could you build a regular fitness routine? Describe your plan.",
      "Why do many people stop exercising after a few weeks, and how can they stay motivated?"),
    D("Breakfast", "Kahvaltı", "🥐", "toast|cereal|skip|filling|brunch",
      "What do you usually eat for breakfast?",
      "Describe the perfect breakfast and where you would eat it.",
      "Is breakfast really the most important meal of the day? Give your opinion."),
    D("Inventions", "İcatlar", "💡", "invention|invent|device|useful|discover",
      "Which invention could you not live without?",
      "Describe an invention that changed the world and how.",
      "If you could invent something to solve a daily problem, what would it be and how would it work?"),
    D("Role models", "Rol modeller", "🌟", "admire|inspire|role model|achievement|example",
      "Who do you admire and why?",
      "Describe a person who has inspired you and what you learned from them.",
      "Should public figures be role models for young people? Explain your view."),
    D("Mistakes and learning", "Hatalar ve öğrenme", "🔄", "mistake|lesson|regret|improve|fail",
      "Tell me about a mistake you made and what happened.",
      "How do you react when you fail at something? Give an example.",
      "Is failure necessary for success? Discuss with real-life examples."),
    D("Cultures and traditions", "Kültürler ve gelenekler", "🎎", "culture|custom|heritage|ritual|respect",
      "What is a tradition from your country that you like?",
      "Describe a custom from another country that you find interesting.",
      "How can we preserve traditions in a globalized world? Share your thoughts.")
  ];

  function ext(name, file) {
    return (typeof module !== 'undefined' && module.exports && typeof require === 'function') ? require(file) : root[name];
  }
  DAILY = DAILY.concat(ext('DailyMore1', './daily-more-1.js'), ext('DailyMore2', './daily-more-2.js'));
  var IELTS = ext('IeltsBank', './ielts.js');

  function lvl(l) { return SECONDS[l] || 60; }

  var TESTS = [
    {
      id: 'free',
      titleTr: 'Serbest konuşma',
      build: function (d, l) {
        return {
          promptEn: d.questions[l],
          hintTr: 'Cevabını bir örnekle destekle ve fikirlerini “because” ile bağla.',
          seconds: lvl(l)
        };
      }
    },
    {
      id: 'describe',
      titleTr: 'Görsel betimleme',
      build: function (d, l) {
        var extra = l === 'easy' ? 'Say what you see and what people are doing.'
          : l === 'medium' ? 'Say what you see, what people are doing, and how it makes you feel.'
          : 'Describe the scene in detail, imagine what happened before and after, and say how you feel about it.';
        return {
          promptEn: 'Imagine this scene about “' + d.theme + '”: ' + d.emoji + '  ' + extra,
          hintTr: 'Gördüklerini sırayla anlat: önce genel manzara, sonra detaylar.',
          seconds: lvl(l)
        };
      }
    },
    {
      id: 'opinion',
      titleTr: 'Katıl ya da karşı çık',
      build: function (d, l) {
        var n = l === 'easy' ? 'one reason' : l === 'medium' ? 'two reasons' : 'two reasons and a counter-argument';
        return {
          promptEn: 'Do you agree or disagree? “' + d.theme + '” has a bigger effect on our lives than most people think. Give ' + n + '.',
          hintTr: 'Önce görüşünü söyle (I agree / I disagree), sonra nedenlerini ver.',
          seconds: lvl(l)
        };
      }
    },
    {
      id: 'story',
      titleTr: 'Hikâye tamamlama',
      build: function (d, l) {
        return {
          promptEn: 'Continue the story: “It was an ordinary day, but something unexpected happened that had to do with ' + d.theme.toLowerCase() + '…”',
          hintTr: 'Kim, nerede, ne oldu, sonunda ne oldu? Geçmiş zaman kullan.',
          seconds: lvl(l)
        };
      }
    },
    {
      id: 'targets',
      titleTr: 'Hedef kelimelerle konuş',
      build: function (d, l) {
        return {
          promptEn: 'Talk about “' + d.theme + '” and try to use all of these words or phrases: ' + d.words.join(', ') + '.',
          hintTr: 'Her kelimeyi bir cümlede kullanmaya çalış. Sonuçta hangilerini kullandığını göreceksin.',
          seconds: lvl(l),
          targets: d.words.slice()
        };
      }
    },
    {
      id: 'roleplay',
      titleTr: 'Rol yapma',
      build: function (d, l) {
        return {
          promptEn: 'You are talking to a friend about “' + d.theme + '”. Your friend asks: “' + d.questions[l] + '” Answer naturally and ask your friend a question back.',
          hintTr: 'Sanki gerçekten sohbet ediyormuşsun gibi konuş; sonda karşı soru sor.',
          seconds: lvl(l)
        };
      }
    },
    {
      id: 'repeat',
      titleTr: 'Dinle ve tekrar et',
      build: function (d, l) {
        return {
          promptEn: 'Listen to the sentence, repeat it as clearly as you can, then answer it in one or two more sentences.',
          hintTr: 'Dinle, aynen tekrar et, sonra cümleyi kendi cevabınla devam ettir.',
          seconds: 30,
          speakText: d.questions[l]
        };
      }
    }
  ];

  TESTS.push({
    id: 'rapid',
    titleTr: 'Hız turu',
    build: function (d, l) {
      var rs = { easy: 12, medium: 10, hard: 8 }[l] || 10;
      return {
        promptEn: 'Quick round! A new prompt appears every ' + rs + ' seconds. Say one sentence for each.',
        hintTr: 'Her kelime için tek bir cümle kur; takılırsan hemen sonrakine geç.',
        seconds: rs * 5,
        roundSeconds: rs,
        prompts: d.words.map(function (w) { return 'Say a sentence with “' + w + '”'; }),
        targets: d.words.slice()
      };
    }
  });

  TESTS.push({
    id: 'shadow',
    titleTr: 'Gölgeleme (tempoyla oku)',
    build: function (d, l) {
      var wpm = { easy: 100, medium: 130, hard: 150 }[l] || 130;
      var passage = 'Today we are talking about ' + d.theme.toLowerCase() + '. ' + d.questions[l];
      var n = passage.split(/\s+/).length;
      return {
        promptEn: 'Read the text aloud and keep up with the highlighted words.',
        hintTr: 'Vurgulanan kelimeyi takip ederek yüksek sesle oku; tempoyu kaçırma.',
        seconds: Math.ceil(n / wpm * 60) + 4,
        passage: passage,
        passageWpm: wpm
      };
    }
  });

  function cardCtx(ctx) { return ctx && ctx.card ? ctx : { card: IELTS[0], i: 0 }; }

  var IELTS_TESTS = [
    {
      id: 'ielts1',
      titleTr: 'IELTS Part 1',
      build: function (d, l, ctx) {
        var c = cardCtx(ctx);
        return {
          promptEn: c.card.part1[c.i % 3],
          hintTr: 'Part 1: 2-3 cümleyle doğal ve kısa cevap ver; bir örnek ekle.',
          seconds: 40
        };
      }
    },
    {
      id: 'ielts2',
      titleTr: 'IELTS Part 2',
      build: function (d, l, ctx) {
        var c = cardCtx(ctx);
        return {
          promptEn: c.card.part2.prompt,
          points: c.card.part2.points.slice(),
          hintTr: 'Part 2: 30 sn hazırlan, sonra 1-2 dakika kesintisiz konuş; maddeleri sırayla kullan.',
          seconds: 120,
          prepSeconds: 30
        };
      }
    },
    {
      id: 'ielts3',
      titleTr: 'IELTS Part 3',
      build: function (d, l, ctx) {
        var c = cardCtx(ctx);
        return {
          promptEn: c.card.part3[c.i % 2],
          hintTr: 'Part 3: Fikrini söyle, nedenini açıkla ve genel bir örnek ver.',
          seconds: 60
        };
      }
    }
  ];

  var api = { LEVELS: LEVELS, DAILY: DAILY, TESTS: TESTS, IELTS: IELTS, IELTS_TESTS: IELTS_TESTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Content = api;
})(typeof window !== 'undefined' ? window : globalThis);
