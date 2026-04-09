import { createStandardTarotDeck } from './factory';

export const mysticEchoDeck = createStandardTarotDeck({
  deckId: 'mystic-echo-demo',
  deckName: '秘语回响示例牌组',
  cardImageBasePath: '/assets/decks/mystic-echo',
  majorMeaningSuffix: '的主题说明待替换',
  minorMeaningSuffix: '的主题说明待替换',
  blankMeaningUp: '空白牌正位：可由你替换成自定义引导语',
  blankMeaningReversed: '空白牌逆位：可由你替换成自定义引导语',
});
