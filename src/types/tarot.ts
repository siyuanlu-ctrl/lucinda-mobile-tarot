export type ArcanaType = 'major' | 'minor' | 'blank';

export type SuitType = 'wands' | 'cups' | 'swords' | 'pentacles' | 'none';

export type CardOrientation = 'upright' | 'reversed';

export interface TarotCard {
  id: string;
  name: string;
  arcana: ArcanaType;
  suit: SuitType;
  rank: string;
  image: string;
  meaningUp: string;
  meaningReversed: string;
}

export interface TarotDeck {
  id: string;
  name: string;
  backImage: string;
  cards: TarotCard[];
}

export interface DrawnCard {
  order: number;
  card: TarotCard;
  orientation: CardOrientation;
  second: number;
  drawnAt: string;
}
