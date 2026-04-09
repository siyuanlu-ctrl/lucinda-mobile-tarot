import type { TarotDeck } from '../../types/tarot';
import { mysticEchoDeck } from './mysticEcho';
import { riderWaiteDeck } from './riderWaite';

export const tarotDecks: TarotDeck[] = [riderWaiteDeck, mysticEchoDeck];

export function getDeckById(deckId: string): TarotDeck {
  return tarotDecks.find((deck) => deck.id === deckId) ?? tarotDecks[0];
}
