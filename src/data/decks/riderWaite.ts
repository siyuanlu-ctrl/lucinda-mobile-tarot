import { createStandardTarotDeck } from './factory';

const riderWaiteDeckBase = createStandardTarotDeck({
  deckId: 'rider-waite-default',
  deckName: '标准塔罗牌 + 空白牌',
  cardImageBasePath: '',
  majorMeaningSuffix: '正位牌义待配置',
  minorMeaningSuffix: '正位牌义待配置',
});

const majorImageNames = [
  'RWS Tarot 00 Fool.jpg',
  'RWS Tarot 01 Magician.jpg',
  'RWS Tarot 02 High Priestess.jpg',
  'RWS Tarot 03 Empress.jpg',
  'RWS Tarot 04 Emperor.jpg',
  'RWS Tarot 05 Hierophant.jpg',
  'RWS Tarot 06 Lovers.jpg',
  'RWS Tarot 07 Chariot.jpg',
  'RWS Tarot 08 Strength.jpg',
  'RWS Tarot 09 Hermit.jpg',
  'RWS Tarot 10 Wheel of Fortune.jpg',
  'RWS Tarot 11 Justice.jpg',
  'RWS Tarot 12 Hanged Man.jpg',
  'RWS Tarot 13 Death.jpg',
  'RWS Tarot 14 Temperance.jpg',
  'RWS Tarot 15 Devil.jpg',
  'RWS Tarot 16 Tower.jpg',
  'RWS Tarot 17 Star.jpg',
  'RWS Tarot 18 Moon.jpg',
  'RWS Tarot 19 Sun.jpg',
  'RWS Tarot 20 Judgement.jpg',
  'RWS Tarot 21 World.jpg',
] as const;

const suitImagePrefixMap = {
  wands: 'Wands',
  cups: 'Cups',
  swords: 'Swords',
  pentacles: 'Pents',
} as const;

const rankImageCodeMap: Record<string, string> = {
  Ace: '01',
  '2': '02',
  '3': '03',
  '4': '04',
  '5': '05',
  '6': '06',
  '7': '07',
  '8': '08',
  '9': '09',
  '10': '10',
  Page: '11',
  Knight: '12',
  Queen: '13',
  King: '14',
};

function toCommonsImageUrl(filename: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
}

export const riderWaiteDeck = {
  ...riderWaiteDeckBase,
  cards: riderWaiteDeckBase.cards.map((card) => {
    if (card.arcana === 'major') {
      return {
        ...card,
        image: toCommonsImageUrl(majorImageNames[Number(card.rank)]),
      };
    }

    if (card.arcana === 'minor') {
      return {
        ...card,
        image: toCommonsImageUrl(
          `${suitImagePrefixMap[card.suit as keyof typeof suitImagePrefixMap]}${rankImageCodeMap[card.rank]}.jpg`,
        ),
      };
    }

    return card;
  }),
};
