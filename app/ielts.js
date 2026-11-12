(function (root) {
  'use strict';

  function T(id, topic, part1, prompt, points, part3) {
    return { id: id, topic: topic, part1: part1, part2: { prompt: prompt, points: points }, part3: part3 };
  }

  var DATA = [
    T('hometown', 'Hometown',
      ['Where is your hometown?', 'What do you like most about your hometown?', 'Has your hometown changed much in recent years?'],
      'Describe a place in your hometown that you like to visit.',
      ['where it is', 'how often you go there', 'what you do there', 'and explain why you like it'],
      ['Why do many young people leave small towns for big cities?', 'How might cities change in the next fifty years?']),
    T('work-study', 'Work and study',
      ['Do you work or are you a student?', 'Why did you choose your field of study or work?', 'What would you like to change about your daily work or study?'],
      'Describe a job that you think is interesting.',
      ['what the job is', 'what skills it needs', 'whether it is well paid', 'and explain why you find it interesting'],
      ['Is job satisfaction more important than a high salary?', 'How will technology change the kinds of jobs people do?']),
    T('free-time', 'Free time',
      ['What do you like to do in your free time?', 'Do you prefer spending free time alone or with others?', 'Did you have different hobbies when you were a child?'],
      'Describe a hobby or activity that you enjoy doing.',
      ['what it is', 'when you started it', 'how often you do it', 'and explain why you enjoy it'],
      ['Why do some people have more free time than others?', 'Should employers encourage workers to have hobbies?']),
    T('food', 'Food and cooking',
      ['What is your favorite food?', 'Do you often cook at home?', 'Are there any foods you do not like?'],
      'Describe a meal that you enjoyed eating with other people.',
      ['when it was', 'where you ate', 'who you were with', 'and explain why you enjoyed it'],
      ['How have eating habits changed in your country?', 'Should governments encourage people to eat healthier food?']),
    T('travel', 'Travel and holidays',
      ['Do you like traveling?', 'What was the last place you visited?', 'Do you prefer traveling alone or with other people?'],
      'Describe a trip that you remember very well.',
      ['where you went', 'who you went with', 'what you did there', 'and explain why you remember it so well'],
      ['Does tourism bring more benefits or problems to local people?', 'How will travel change in the future?']),
    T('technology', 'Technology',
      ['What technology do you use every day?', 'Do you find it easy to learn new technology?', 'Do you think you spend too much time on your phone?'],
      'Describe a piece of technology that you find useful.',
      ['what it is', 'how long you have used it', 'what you use it for', 'and explain why it is useful to you'],
      ['Do older people find it harder to use new technology?', 'Is technology making people less social?']),
    T('education', 'Education',
      ['What subjects did you enjoy at school?', 'Do you prefer studying alone or in a group?', 'Would you like to study something else in the future?'],
      'Describe a teacher who has influenced you.',
      ['who the teacher was', 'what he or she taught', 'what the teacher was like', 'and explain how this person influenced you'],
      ['What are the qualities of a good education system?', 'Should students be allowed to choose all their own subjects?']),
    T('health', 'Health and fitness',
      ['Do you do any exercise?', 'What do you do to stay healthy?', 'Do you think people in your country are healthy?'],
      'Describe a time when you tried to get healthier.',
      ['what you did', 'why you wanted to get healthier', 'how long you did it', 'and explain how you felt about it'],
      ['Why do some people find it hard to follow a healthy lifestyle?', 'Whose responsibility is public health: individuals or governments?']),
    T('environment', 'Environment',
      ['Is there much pollution where you live?', 'Do you recycle at home?', 'What do you do to protect the environment?'],
      'Describe a place with natural beauty that you would like to protect.',
      ['where it is', 'what it looks like', 'why it is special', 'and explain how it could be protected'],
      ['Who should do more for the environment: companies or ordinary people?', 'Will environmental problems get worse in the future?']),
    T('family-friends', 'Family and friends',
      ['Do you spend a lot of time with your family?', 'How often do you see your friends?', 'What do you usually do with your friends?'],
      'Describe a friend who you have known for a long time.',
      ['how you met', 'how long you have known each other', 'what you do together', 'and explain why you are still friends'],
      ['Why is it harder to make friends as an adult?', 'How have family relationships changed in modern society?']),
    T('shopping', 'Shopping',
      ['Do you like shopping?', 'Do you prefer shopping online or in a store?', 'What was the last thing you bought?'],
      'Describe something you bought that you were very happy with.',
      ['what it was', 'where you bought it', 'why you bought it', 'and explain why you were happy with it'],
      ['Do advertisements make people buy things they do not need?', 'How is online shopping changing city centers?']),
    T('media', 'News and media',
      ['How do you usually get the news?', 'Do you enjoy reading books or magazines?', 'Do you watch much television?'],
      'Describe a book, film or program that taught you something.',
      ['what it was', 'when you read or watched it', 'what it was about', 'and explain what you learned from it'],
      ['Is it important for people to follow the news every day?', 'How can people check whether information online is true?'])
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  root.IeltsBank = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
