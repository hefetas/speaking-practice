(function (root) {
  'use strict';

  // Traditional tongue twisters (public domain) plus a few of our own.
  var TWISTERS = [
    'Peter Piper picked a peck of pickled peppers.',
    'She sells seashells by the seashore.',
    'How much wood would a woodchuck chuck if a woodchuck could chuck wood?',
    'Red lorry, yellow lorry, red lorry, yellow lorry.',
    "Betty Botter bought some butter, but she said the butter's bitter.",
    'Fuzzy Wuzzy was a bear. Fuzzy Wuzzy had no hair.',
    'I scream, you scream, we all scream for ice cream.',
    'A proper copper coffee pot.',
    'Six slippery snails slid slowly seaward.',
    'Which witch switched the Swiss wristwatches?',
    'Unique New York, you know you need unique New York.',
    'Thirty-three thirsty thieves thought they thrilled the throne throughout Thursday.',
    'Black background, brown background, black background, brown background.',
    'Eleven benevolent elephants.',
    'Three free throws.',
    'Big brown bears bring breakfast to blue boats.',
    'Cheap sheep sleep deep in the sheep shop.',
    'Real rock wall, real rock wall, real rock wall.'
  ];

  function P(prompt, a, b, c) { return { prompt: prompt, points: [a, b, c] }; }
  var PITCHES = [
    P('You are in a job interview. Introduce yourself in one minute.', 'who you are', 'what you study or do', 'why you want this job'),
    P('Why should we hire you for this internship?', 'your skills', 'one example from your experience', 'what you want to learn'),
    P('Tell us about a project you are proud of.', 'what the project was', 'what you did yourself', 'what you learned'),
    P('What is your greatest strength, and how have you used it?', 'the strength', 'a real situation', 'the result'),
    P('Describe a time you solved a difficult problem.', 'the problem', 'the steps you took', 'how it ended'),
    P('Where do you see yourself in five years?', 'your goals', 'the skills you will build', 'how this role helps'),
    P('Introduce yourself to new teammates on your first day.', 'your name and background', 'what you will work on', 'something personal'),
    P('Pitch an app idea to a friendly investor.', 'the problem', 'your solution', 'why people will use it'),
    P('Introduce your hometown to a foreign visitor.', 'where it is', 'what to see and eat', 'the best time to visit'),
    P('Tell a new classmate about your studies and goals.', 'what you study', 'why you chose it', 'what you want to do next'),
    P('Describe your dream job and explain why you want it.', 'the job', 'a typical day', 'why it suits you'),
    P('Explain a hobby to someone who has never tried it.', 'what the hobby is', 'how to start', 'why it is fun')
  ];

  var SCENES = [
    { emoji: '🏖️ 👨‍👩‍👧 🍦 ☂️', title: 'A day at the beach' },
    { emoji: '🚉 🧳 ⏰ 😅', title: 'Running late for a train' },
    { emoji: '🍳 👩‍🍳 🔥 😱', title: 'A kitchen surprise' },
    { emoji: '🏫 📚 ✏️ 😴', title: 'A long day at school' },
    { emoji: '🎂 🎈 👫 🎁', title: 'A birthday party' },
    { emoji: '🌧️ 🚌 👟 💦', title: 'Caught in the rain' },
    { emoji: '🛒 🥦 🍎 👵', title: 'At the market' },
    { emoji: '🏥 🩺 🤒 💊', title: 'A visit to the doctor' },
    { emoji: '🏔️ ⛺ 🔥 🌌', title: 'Camping in the mountains' },
    { emoji: '🚗 🛑 🚦 ⏳', title: 'Stuck in traffic' },
    { emoji: '💻 ☕ 🌙 📑', title: 'Working late at night' },
    { emoji: '🎤 🎸 👏 🎶', title: 'A live concert' }
  ];

  // Minimal-pair drills: speech recognition only matches the word you actually said.
  var PAIRS = [
    'ship sheep, bit beat, live leave, full fool, sit seat, pull pool',
    'light right, lock rock, load road, long wrong, lead read, collect correct',
    'think sink, three free, thank tank, thought sought, thin fin, path pass',
    'very berry, vest best, van ban, vine wine, vale bale, veal wheel',
    'cat cut, hat hut, ran run, bag bug, cap cup, match much',
    'bad bed, man men, pan pen, sat set, pat pet, bat bet',
    'day die, may my, say sigh, pay pie, way why, lay lie',
    'coat caught, boat bought, note not, cold called, road rod, goat got',
    'walk work, bird bard, turn torn, hurt heart, firm farm, shirt short',
    'chair share, cheap sheep, chip ship, watch wash, catch cash, chose shows',
    'bridge breach, edge etch, age ache, jest chest, joke choke, gin chin',
    'bin pin, bat pat, bill pill, bear pear, bay pay, buy pie'
  ];

  var api = { TWISTERS: TWISTERS, PITCHES: PITCHES, SCENES: SCENES, PAIRS: PAIRS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PracticeBank = api;
})(typeof window !== 'undefined' ? window : globalThis);
