import type { Seat } from '../engine';

/**
 * The order in which the people sharing one device get ready at the start of
 * a hand: turn order from the leader, but with the first of them to play going
 * last — so when everybody is ready the phone is already in the right hands.
 */
export function readyOrder(humanSeats: readonly boolean[], leader: number): Seat[] {
  const inTurnOrder: Seat[] = [];
  for (let i = 0; i < 4; i++) {
    const s = ((leader + i) & 3) as Seat;
    if (humanSeats[s]) inTurnOrder.push(s);
  }
  return inTurnOrder.length > 1 ? [...inTurnOrder.slice(1), inTurnOrder[0]!] : inTurnOrder;
}
