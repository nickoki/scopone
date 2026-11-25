/**
 * Plain, checkable facts about a move, and the reasons one move is better than
 * another. Everything is computed from the player's own view of the position.
 */
import { RE_BELLO, SCORE_CATEGORIES, SETTEBELLO, isDenari, rankOf, type HandState, type Move, type Rules, type ScoreCategory } from '../engine';
import type { MoveOption, OptionFacts, Reason } from './types';

/**
 * `pos` must be the mover's own view (other hands hidden). `others[r]` = cards
 * of rank r the mover has not seen; `nextHolds(r)` = chance that the next
 * player holds one.
 */
export function factsFor(
  pos: HandState,
  seat: number,
  rules: Rules,
  move: Move,
  others: ArrayLike<number>,
  nextHolds: (rank: number) => number,
): OptionFacts {
  void seat;
  const taking = move.capture.length > 0;
  const won = taking ? [...move.capture, move.card] : [];
  const left = taking ? pos.table.filter((c) => !move.capture.includes(c)) : [...pos.table, move.card];
  const leftSum = left.reduce((sum, c) => sum + rankOf(c), 0);

  let cardsInHands = 0;
  for (let s = 0; s < 4; s++) cardsInHands += pos.hands[s]!.length;
  const lastCardOfHand = cardsInHands === 1;
  const nextPlaysLastCard = cardsInHands === 2;

  const sweepable = left.length > 0 && leftSum <= 10 && !lastCardOfHand && !(nextPlaysLastCard && rules.lastCardScopaExcluded);
  const isNapolaCard = (c: number) => rules.napola && isDenari(c) && rankOf(c) <= 3;
  return {
    scopa: taking && left.length === 0 && !(lastCardOfHand && rules.lastCardScopaExcluded),
    cards: won.length,
    denari: won.filter(isDenari).length,
    settebello: won.includes(SETTEBELLO),
    sevens: won.filter((c) => rankOf(c) === 7).length,
    reBello: rules.reBello && won.includes(RE_BELLO),
    napola: won.filter(isNapolaCard).length,
    leftSum,
    leftCount: left.length,
    sweepRank: sweepable ? leftSum : 0,
    sweepOut: sweepable ? others[leftSum]! : 0,
    sweepChance: sweepable ? nextHolds(leftSum) : 0,
    laidDenari: !taking && isDenari(move.card),
    laidSeven: !taking && rankOf(move.card) === 7,
    laidSettebello: !taking && move.card === SETTEBELLO,
    laidNapola: !taking && isNapolaCard(move.card),
  };
}

const pct = (p: number) => Math.round(p * 100);

/** Which scoring categories a kind of reason should show up in. */
const SCOPA_CATS: ScoreCategory[] = ['scope'];
const SETTEBELLO_CATS: ScoreCategory[] = ['settebello', 'primiera', 'denari'];
const CARD_CATS: ScoreCategory[] = ['carte', 'denari', 'primiera', 'settebello', 'reBello', 'napola'];

/**
 * Up to two reasons why `best` is preferred to `played`, biggest first.
 *
 * Three guards keep an explanation honest:
 *  - apart from certain, immediate points (a scopa, the settebello, the Re
 *    bello), it is dropped when the simulation contradicts it (the matching
 *    scoring categories go the other way);
 *  - it must account for a real share of the loss (at least a third of
 *    `loss`): a detail worth a tenth of a point does not explain a mistake
 *    that costs a whole one;
 *  - points that are already decided (one side has 21 cards, or 6 Coins) are
 *    not mentioned.
 * When nothing survives, the answer is the honest fallback: the category the
 * simulation loses most in, or simply "the rest of the hand".
 */
export function reasonsFor(
  played: MoveOption,
  best: MoveOption,
  decided: { carte: boolean; denari: boolean } = { carte: false, denari: false },
  loss = 0,
): Reason[] {
  const p = played.facts;
  const b = best.facts;
  const gap = (cats: ScoreCategory[]): number | null => {
    if (!played.byCategory || !best.byCategory) return null;
    return cats.reduce((sum, c) => sum + best.byCategory![c] - played.byCategory![c], 0);
  };
  // A fact is dropped only when the simulation contradicts it (the matching categories go the other way):
  // the category averages are too noisy to demand that they confirm it.
  const agrees = (cats: ScoreCategory[]) => {
    const g = gap(cats);
    return g === null || g > -0.05;
  };

  /** Candidate reasons with roughly how many points each accounts for. */
  const found: { reason: Reason; impact: number; extra?: Reason }[] = [];
  const add = (reason: Reason, impact: number, extra?: Reason) => found.push({ reason, impact, extra });

  // Certain, immediate points need no confirmation from the simulation.
  if (b.scopa && !p.scopa) add({ code: 'missedScopa' }, 1);
  if (p.sweepChance >= 0.2 && p.sweepChance - b.sweepChance >= 0.15 && agrees(SCOPA_CATS)) {
    add(
      { code: 'sweepGift', sum: p.sweepRank, out: p.sweepOut, pct: pct(p.sweepChance), bestPct: pct(b.sweepChance) },
      p.sweepChance - b.sweepChance,
      b.leftCount > 0 && b.leftSum > 10 ? { code: 'tableSafe', sum: b.leftSum } : undefined,
    );
  }
  if (b.settebello && !p.settebello) add({ code: 'missedSettebello' }, 1);
  // (laying the settebello / a valuable card is judged below, from what the playouts saw happen to it)
  if (b.reBello && !p.reBello) add({ code: 'missedReBello' }, 1);
  if (b.napola > p.napola && agrees(['napola'])) add({ code: 'missedNapola', n: b.napola - p.napola }, b.napola - p.napola);

  // What the simulation sees happen before the player's next turn.
  const pn = played.near;
  const bn = best.near;
  if (pn && bn) {
    const sweepSaid = found.some((f) => f.reason.code === 'sweepGift' || f.reason.code === 'missedScopa');
    if (!sweepSaid && pn.oppScopa - bn.oppScopa >= 0.15 && agrees(SCOPA_CATS)) {
      add({ code: 'nearScopa', pct: pct(pn.oppScopa), bestPct: pct(bn.oppScopa) }, pn.oppScopa - bn.oppScopa);
    }
    if (!b.scopa && bn.ownScopa - pn.ownScopa >= 0.15 && agrees(SCOPA_CATS)) {
      add({ code: 'partnerScopa', pct: pct(bn.ownScopa), playedPct: pct(pn.ownScopa) }, bn.ownScopa - pn.ownScopa);
    }
    const settebelloGap = pn.oppSettebello - bn.oppSettebello;
    if (settebelloGap >= 0.15 && agrees(SETTEBELLO_CATS) && !found.some((f) => f.reason.code === 'missedSettebello')) {
      const numbers = { pct: pct(pn.oppSettebello), bestPct: pct(bn.oppSettebello) };
      add(p.laidSettebello ? { code: 'laidSettebello', ...numbers } : { code: 'nearSettebello', ...numbers }, settebelloGap);
    }
    // A valuable card laid on the table and then taken by the opponents.
    const laidGap = pn.oppLaid - (b.cards === 0 ? bn.oppLaid : 0);
    if ((p.laidDenari || p.laidSeven || p.laidNapola) && !p.laidSettebello && pn.oppLaid >= 0.3 && laidGap >= 0.15 && agrees(CARD_CATS)) {
      add({ code: 'exposedCard', pct: pct(pn.oppLaid), bestPct: pct(b.cards === 0 ? bn.oppLaid : 0) }, laidGap * (p.laidNapola ? 1 : p.laidSeven && p.laidDenari ? 0.5 : 0.3));
    }
  }

  const settebelloExplains = found.some((f) => f.reason.code === 'missedSettebello');
  if (!decided.denari && b.denari - p.denari >= (settebelloExplains ? 2 : 1) && agrees(CARD_CATS)) add({ code: 'moreDenari', n: b.denari - p.denari }, 0.17 * (b.denari - p.denari));
  if (b.sevens - p.sevens >= (settebelloExplains ? 2 : 1) && agrees(['primiera'])) add({ code: 'missedSeven' }, 0.22 * (b.sevens - p.sevens));
  if (!decided.carte && b.cards - p.cards >= 2 && agrees(['carte'])) add({ code: 'moreCards', n: b.cards - p.cards }, 0.05 * (b.cards - p.cards));

  const enough = Math.max(0.08, loss / 3);
  const kept = found.filter((f) => f.impact >= enough).sort((x, y) => y.impact - x.impact);
  if (kept.length > 0) {
    const out: Reason[] = [];
    for (const f of kept) {
      out.push(f.reason);
      if (f.extra) out.push(f.extra);
    }
    return out.slice(0, 2);
  }

  // Nothing concrete: say where the simulation sees the difference, if it can.
  if (played.byCategory && best.byCategory) {
    let top: ScoreCategory | null = null;
    let delta = 0.05;
    for (const c of SCORE_CATEGORIES) {
      const d = best.byCategory[c] - played.byCategory[c];
      if (d > delta) {
        delta = d;
        top = c;
      }
    }
    if (top) return [{ code: 'category', category: top, delta }];
  }
  return [{ code: 'longTerm' }];
}

/** True when a reason is a concrete, checkable fact (not just "the simulation says so"). */
export function isConcrete(reason: Reason): boolean {
  return reason.code !== 'category' && reason.code !== 'longTerm';
}

/** A word on why a good move was good; only for decisions that mattered. */
export function praiseFor(played: MoveOption, alternatives: readonly MoveOption[]): Reason[] {
  const f = played.facts;
  if (f.scopa) return [{ code: 'tookScopa' }];
  if (f.settebello) return [{ code: 'tookSettebello' }];
  const others = alternatives.filter((o) => o !== played);
  if (others.length === 0) return [];
  const riskiest = Math.max(...others.map((o) => o.facts.sweepChance));
  if (f.sweepChance === 0 && f.leftCount > 0 && f.leftSum > 10 && riskiest >= 0.3) return [{ code: 'keptSafe', sum: f.leftSum }];
  const safestOther = Math.min(...others.map((o) => o.facts.sweepChance));
  if (f.sweepChance > 0 && safestOther - f.sweepChance >= 0.15) {
    return [{ code: 'leastRisk', pct: pct(f.sweepChance), otherPct: pct(safestOther) }];
  }
  return [];
}
