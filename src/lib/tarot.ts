import type { CardOrientation, DrawnCard, TarotCard, TarotDeck } from '../types/tarot';

export type CardFilter =
  | 'major'
  | 'minor-all'
  | 'minor-ace'
  | 'minor-court'
  | 'blank';

export function getRandomOrientation(): CardOrientation {
  return Math.random() < 0.5 ? 'upright' : 'reversed';
}

export function getRemainingCards(deck: TarotDeck, drawnCards: DrawnCard[]): TarotCard[] {
  const drawnIds = new Set(drawnCards.map((item) => item.card.id));
  return deck.cards.filter((card) => !drawnIds.has(card.id));
}

export function drawNextCard(deck: TarotDeck, drawnCards: DrawnCard[]): DrawnCard | null {
  const remainingCards = getRemainingCards(deck, drawnCards);

  if (remainingCards.length === 0) {
    return null;
  }

  const now = new Date();
  const second = now.getSeconds();
  const orientation = getRandomOrientation();
  const cardIndex = Math.floor(Math.random() * remainingCards.length);
  const card = remainingCards[cardIndex];

  return {
    order: drawnCards.length + 1,
    card,
    orientation,
    second,
    drawnAt: now.toLocaleString(),
  };
}

export function getOrientationLabel(orientation: CardOrientation): string {
  return orientation === 'upright' ? '正位' : '逆位';
}

export function drawMultipleCards(
  deck: TarotDeck,
  drawnCards: DrawnCard[],
  count: number,
): DrawnCard[] {
  const nextDraws: DrawnCard[] = [];
  let currentDraws = [...drawnCards];

  for (let index = 0; index < count; index += 1) {
    const nextCard = drawNextCard(deck, currentDraws);

    if (!nextCard) {
      break;
    }

    nextDraws.push(nextCard);
    currentDraws = [...currentDraws, nextCard];
  }

  return nextDraws;
}

export function isAceCard(card: TarotCard): boolean {
  return card.arcana === 'minor' && card.rank === 'Ace';
}

export function isCourtCard(card: TarotCard): boolean {
  return (
    card.arcana === 'minor' &&
    ['Page', 'Knight', 'Queen', 'King'].includes(card.rank)
  );
}

export function filterCardsByCategory(cards: TarotCard[], filter: CardFilter): TarotCard[] {
  switch (filter) {
    case 'major':
      return cards.filter((card) => card.arcana === 'major');
    case 'minor-all':
      return cards.filter((card) => card.arcana === 'minor');
    case 'minor-ace':
      return cards.filter(isAceCard);
    case 'minor-court':
      return cards.filter(isCourtCard);
    case 'blank':
      return cards.filter((card) => card.arcana === 'blank');
    default:
      return [];
  }
}

export function filterCardsByCategories(
  cards: TarotCard[],
  filters: CardFilter[],
): TarotCard[] {
  if (filters.length === 0) {
    return cards;
  }

  const seen = new Set<string>();
  const merged: TarotCard[] = [];

  for (const filter of filters) {
    for (const card of filterCardsByCategory(cards, filter)) {
      if (!seen.has(card.id)) {
        seen.add(card.id);
        merged.push(card);
      }
    }
  }

  return merged;
}
