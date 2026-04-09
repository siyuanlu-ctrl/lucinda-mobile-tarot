import type { TarotCard, TarotDeck } from '../../types/tarot';

const majorArcanaNames = [
  '愚者',
  '魔术师',
  '女祭司',
  '皇后',
  '皇帝',
  '教皇',
  '恋人',
  '战车',
  '力量',
  '隐士',
  '命运之轮',
  '正义',
  '倒吊人',
  '死神',
  '节制',
  '恶魔',
  '高塔',
  '星星',
  '月亮',
  '太阳',
  '审判',
  '世界',
] as const;

const suitDefinitions = [
  { suit: 'wands', label: '权杖' },
  { suit: 'cups', label: '圣杯' },
  { suit: 'swords', label: '宝剑' },
  { suit: 'pentacles', label: '星币' },
] as const;

const pipRanks = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
const courtRanks = ['Page', 'Knight', 'Queen', 'King'] as const;

const courtRankLabelMap: Record<(typeof courtRanks)[number], string> = {
  Page: '侍从',
  Knight: '骑士',
  Queen: '王后',
  King: '国王',
};

export interface DeckThemeConfig {
  deckId: string;
  deckName: string;
  cardImageBasePath?: string;
  backImage?: string;
  blankCardImage?: string;
  majorMeaningSuffix?: string;
  minorMeaningSuffix?: string;
  blankMeaningUp?: string;
  blankMeaningReversed?: string;
}

function buildImagePath(basePath: string | undefined, filename: string): string {
  if (!basePath) {
    return '';
  }

  return `${basePath.replace(/\/$/, '')}/${filename}`;
}

export function createStandardTarotDeck(config: DeckThemeConfig): TarotDeck {
  const majorArcana: TarotCard[] = majorArcanaNames.map((name, index) => ({
    id: `major-${index}`,
    name,
    arcana: 'major',
    suit: 'none',
    rank: String(index),
    image: buildImagePath(config.cardImageBasePath, `major-${index}.jpg`),
    meaningUp: `${name}${config.majorMeaningSuffix ?? '正位牌义待配置'}`,
    meaningReversed: `${name}逆位提示：${config.majorMeaningSuffix ?? '牌义待配置'}`,
  }));

  const minorArcana: TarotCard[] = suitDefinitions.flatMap(({ suit, label }) => {
    const pipCards: TarotCard[] = pipRanks.map((rank, index) => ({
      id: `${suit}-${rank.toLowerCase()}`,
      name: `${label}${index === 0 ? '王牌' : index + 1}`,
      arcana: 'minor',
      suit,
      rank,
      image: buildImagePath(config.cardImageBasePath, `${suit}-${rank.toLowerCase()}.jpg`),
      meaningUp: `${label}${index === 0 ? '王牌' : index + 1}${config.minorMeaningSuffix ?? '正位牌义待配置'}`,
      meaningReversed: `${label}${index === 0 ? '王牌' : index + 1}逆位提示：${config.minorMeaningSuffix ?? '牌义待配置'}`,
    }));

    const courtCards: TarotCard[] = courtRanks.map((rank) => ({
      id: `${suit}-${rank.toLowerCase()}`,
      name: `${label}${courtRankLabelMap[rank]}`,
      arcana: 'minor',
      suit,
      rank,
      image: buildImagePath(config.cardImageBasePath, `${suit}-${rank.toLowerCase()}.jpg`),
      meaningUp: `${label}${courtRankLabelMap[rank]}${config.minorMeaningSuffix ?? '正位牌义待配置'}`,
      meaningReversed: `${label}${courtRankLabelMap[rank]}逆位提示：${config.minorMeaningSuffix ?? '牌义待配置'}`,
    }));

    return [...pipCards, ...courtCards];
  });

  const blankCard: TarotCard = {
    id: 'blank-special',
    name: '空白牌',
    arcana: 'blank',
    suit: 'none',
    rank: 'blank',
    image: config.blankCardImage ?? buildImagePath(config.cardImageBasePath, 'blank-special.jpg'),
    meaningUp: config.blankMeaningUp ?? '空白牌正位牌义待配置',
    meaningReversed: config.blankMeaningReversed ?? '空白牌逆位牌义待配置',
  };

  return {
    id: config.deckId,
    name: config.deckName,
    backImage: config.backImage ?? buildImagePath(config.cardImageBasePath, 'back.jpg'),
    cards: [...majorArcana, ...minorArcana, blankCard],
  };
}
