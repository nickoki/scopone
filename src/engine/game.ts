import { DECK_SIZE, HIDDEN, fullDeck, rankOf, type CardId } from './cards';
import { moveError } from './captures';
import { makeRng, shuffle } from './rng';
import { matchWinner, scoreHand } from './scoring';
import {
  nextSeat,
  teamOf,
  type HandState,
  type MatchState,
  type Move,
  type Rules,
  type Seat,
} from './types';

export function cardsPerPlayer(rules: Rules): number {
  return rules.variant === 'classico' ? 9 : 10;
}

/**
 * Deal a new hand. The player to the dealer's right (dealer + 1) leads.
 * Classico: if three or more Kings land on the table the deal is void and
 * the cards are reshuffled (a table like that can never be swept).
 */
export function dealHand(
  rules: Rules,
  rngState: number,
  dealer: Seat,
): { hand: HandState; rngState: number } {
  const rng = makeRng(rngState);
  const perPlayer = cardsPerPlayer(rules);
  for (;;) {
    const deck = shuffle(fullDeck(), rng);
    const hands: CardId[][] = [[], [], [], []];
    let p = 0;
    for (let i = 0; i < perPlayer; i++) {
      for (let k = 1; k <= 4; k++) hands[(dealer + k) & 3]!.push(deck[p++]!);
    }
    const table = deck.slice(p);
    if (table.filter((c) => rankOf(c) === 10).length >= 3) continue;
    return {
      rngState: rng.state,
      hand: {
        hands,
        table,
        captured: [[], []],
        scope: [0, 0],
        turn: nextSeat(dealer),
        dealer,
        lastCaptureTeam: null,
        history: [],
        initialTable: table.slice(),
        leftover: null,
        done: false,
      },
    };
  }
}

export function cloneHand(hand: HandState): HandState {
  return {
    hands: [hand.hands[0]!.slice(), hand.hands[1]!.slice(), hand.hands[2]!.slice(), hand.hands[3]!.slice()],
    table: hand.table.slice(),
    captured: [hand.captured[0].slice(), hand.captured[1].slice()],
    scope: [hand.scope[0], hand.scope[1]],
    turn: hand.turn,
    dealer: hand.dealer,
    lastCaptureTeam: hand.lastCaptureTeam,
    history: hand.history.slice(),
    initialTable: hand.initialTable,
    leftover: hand.leftover,
    done: hand.done,
  };
}

/**
 * Apply a move in place WITHOUT validating it (callers pass moves obtained
 * from `legalMoves`, or validate with `moveError` first). This is the single
 * implementation of capture resolution used by the UI, the AI search and
 * the online host. `record` can be disabled by search code that does not
 * need the public history.
 */
export function applyMoveMut(hand: HandState, move: Move, rules: Rules, record = true): boolean {
  const seat = hand.turn;
  const team = teamOf(seat);
  const cards = hand.hands[seat]!;
  const at = cards.indexOf(move.card);
  cards.splice(at >= 0 ? at : cards.indexOf(HIDDEN), 1);
  const tableBefore = record ? hand.table.slice() : hand.table;

  const isLastCard =
    hand.hands[0]!.length + hand.hands[1]!.length + hand.hands[2]!.length + hand.hands[3]!.length === 0;
  let scopa = false;

  if (move.capture.length === 0) {
    hand.table.push(move.card);
  } else {
    const pile = hand.captured[team];
    const table = hand.table;
    for (let i = 0; i < move.capture.length; i++) {
      const c = move.capture[i]!;
      table.splice(table.indexOf(c), 1);
      pile.push(c);
    }
    pile.push(move.card);
    hand.lastCaptureTeam = team;
    if (table.length === 0 && !(isLastCard && rules.lastCardScopaExcluded)) {
      scopa = true;
      hand.scope[team]++;
    }
  }

  if (record) {
    hand.history.push({ seat, card: move.card, captured: move.capture.slice(), scopa, tableBefore });
  }

  if (isLastCard) {
    // Cards left on the table go to the last team that captured.
    const rest = hand.table;
    hand.leftover = { team: hand.lastCaptureTeam, cards: rest.slice() };
    if (hand.lastCaptureTeam !== null) {
      const pile = hand.captured[hand.lastCaptureTeam];
      for (let i = 0; i < rest.length; i++) pile.push(rest[i]!);
    }
    hand.table = [];
    hand.done = true;
  } else {
    hand.turn = nextSeat(seat);
  }
  return scopa;
}

/** Start a new match. The first dealer is drawn from the seed unless given. */
export function createMatch(rules: Rules, seed: number, firstDealer?: Seat): MatchState {
  const rng = makeRng(seed);
  const dealer = firstDealer ?? (rng.int(4) as Seat);
  const dealt = dealHand(rules, rng.state, dealer);
  return {
    rules: { ...rules },
    seed,
    rngState: dealt.rngState,
    handNumber: 1,
    scores: [0, 0],
    hand: dealt.hand,
    phase: 'playing',
    handScores: [],
    winner: null,
  };
}

/** Pure: returns the match after `move`. Throws on an illegal move. */
export function playMove(match: MatchState, move: Move): MatchState {
  if (match.phase !== 'playing') throw new Error('Illegal move: no hand in progress');
  const err = moveError(match.hand, move);
  if (err) throw new Error(`Illegal move: ${err}`);
  const hand = cloneHand(match.hand);
  applyMoveMut(hand, move, match.rules);
  if (!hand.done) return { ...match, hand };

  const score = scoreHand(hand.captured, hand.scope, match.rules);
  const scores: [number, number] = [match.scores[0] + score.total[0], match.scores[1] + score.total[1]];
  const winner = matchWinner(scores, match.rules.target);
  return {
    ...match,
    hand,
    scores,
    handScores: [...match.handScores, score],
    winner,
    phase: winner === null ? 'handEnd' : 'matchEnd',
  };
}

/** Pure: deal the next hand. The deal passes to the right (counter-clockwise). */
export function nextHand(match: MatchState): MatchState {
  if (match.phase !== 'handEnd') throw new Error('Cannot deal: the hand is not over');
  const dealt = dealHand(match.rules, match.rngState, nextSeat(match.hand.dealer));
  return {
    ...match,
    rngState: dealt.rngState,
    handNumber: match.handNumber + 1,
    hand: dealt.hand,
    phase: 'playing',
  };
}

/**
 * What a set of seats is allowed to see: every other hand is replaced by
 * HIDDEN placeholders and the RNG is stripped so the deck cannot be derived.
 */
export function viewFor(match: MatchState, seats: readonly number[]): MatchState {
  const hand = cloneHand(match.hand);
  for (let s = 0; s < 4; s++) {
    if (!seats.includes(s)) hand.hands[s] = hand.hands[s]!.map(() => HIDDEN);
  }
  return { ...match, seed: 0, rngState: 0, hand };
}

/** Sanity check used by tests and the simulator: all 40 cards exactly once. */
export function handIntegrityError(hand: HandState): string | null {
  const seen = new Uint8Array(DECK_SIZE);
  const all = [...hand.hands.flat(), ...hand.table, ...hand.captured[0], ...hand.captured[1]];
  if (hand.done && hand.leftover && hand.leftover.team === null) all.push(...hand.leftover.cards);
  if (all.length !== DECK_SIZE) return `expected 40 cards, found ${all.length}`;
  for (const c of all) {
    if (c < 0 || c >= DECK_SIZE) return `invalid card ${c}`;
    if (seen[c]) return `duplicate card ${c}`;
    seen[c] = 1;
  }
  return null;
}
