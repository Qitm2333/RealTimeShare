(function (root, factory) {
  const gifts = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = gifts;
    return;
  }

  root.LiveGifts = gifts;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const gifts = [
    {
      id: 'tomato',
      icon: '🍅',
      name: '番茄',
      action: '扔番茄',
      toast: '扔出一个番茄',
      combo: '番茄雨来了',
      motion: 'throw',
      colors: ['#d94841', '#fb7185']
    },
    {
      id: 'rose',
      icon: '🌹',
      name: '玫瑰',
      action: '送玫瑰',
      toast: '送出一朵玫瑰',
      combo: '玫瑰刷屏中',
      motion: 'bloom',
      colors: ['#b8326b', '#e879f9']
    },
    {
      id: 'clap',
      icon: '👏',
      name: '鼓掌',
      action: '鼓掌',
      toast: '送出一阵掌声',
      combo: '掌声响起来',
      motion: 'pulse',
      colors: ['#c47a1b', '#22c55e']
    },
    {
      id: 'heart',
      icon: '❤️',
      name: '喜欢',
      action: '点喜欢',
      toast: '点亮一个喜欢',
      combo: '爱心满屏',
      motion: 'float',
      colors: ['#c73555', '#f97316']
    },
    {
      id: 'star',
      icon: '✨',
      name: '星光',
      action: '撒星光',
      toast: '撒下一片星光',
      combo: '星光闪闪',
      motion: 'sparkle',
      colors: ['#3f6fbd', '#facc15']
    },
    {
      id: 'party',
      icon: '🎉',
      name: '庆祝',
      action: '放彩花',
      toast: '放出一束彩花',
      combo: '全场庆祝',
      motion: 'burst',
      colors: ['#5f56b3', '#14b8a6']
    }
  ];

  return {
    list: gifts,
    byId: Object.fromEntries(gifts.map((gift) => [gift.id, gift]))
  };
});
