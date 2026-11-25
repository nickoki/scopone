import { describe, expect, it } from 'vitest';
import { readyOrder } from './ready';

describe('ready order on a shared phone', () => {
  it('nobody to wait for when every seat is a computer', () => {
    expect(readyOrder([false, false, false, false], 2)).toEqual([]);
  });

  it('a single person just gets ready', () => {
    expect(readyOrder([true, false, false, false], 3)).toEqual([0]);
    expect(readyOrder([false, false, true, false], 0)).toEqual([2]);
  });

  it('the first person to play gets ready last, so the phone ends in their hands', () => {
    // Leader is seat 1; people sit at 0 and 1 -> seat 1 plays first, so seat 0 looks first.
    expect(readyOrder([true, true, false, false], 1)).toEqual([0, 1]);
    // Leader is seat 2 (a computer); of the people, seat 3 plays first.
    expect(readyOrder([true, false, false, true], 2)).toEqual([0, 3]);
  });

  it('four people: everyone once, the leader last', () => {
    for (let leader = 0; leader < 4; leader++) {
      const order = readyOrder([true, true, true, true], leader);
      expect([...order].sort()).toEqual([0, 1, 2, 3]);
      expect(order[3]).toBe(leader);
      expect(order[0]).toBe((leader + 1) & 3);
    }
  });
});
