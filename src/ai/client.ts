/**
 * Main-thread handle on the AI worker. All AI thinking happens off the UI
 * thread; if the worker cannot start (very old browser, test environment)
 * we fall back to computing on the main thread with a reduced budget.
 */
import type { MatchState, Move, Seat } from '../engine';
import { chooseMove } from './index';
import type { AiOptions, AiRequest, AiResponse } from './types';

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, { resolve: (m: Move) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<AiResponse>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.move) p.resolve(ev.data.move);
      else p.reject(new Error(ev.data.error ?? 'AI error'));
    };
    worker.onerror = () => {
      workerBroken = true;
      worker = null;
      for (const p of pending.values()) p.reject(new Error('AI worker failed'));
      pending.clear();
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** Ask the AI for a move. `view` must already be masked for `seat`. */
export function requestAiMove(view: MatchState, seat: Seat, options: AiOptions): Promise<Move> {
  const w = getWorker();
  if (!w) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(chooseMove(view, seat, { ...options, budgetMs: Math.min(options.budgetMs ?? 200, 200) })), 0);
    });
  }
  return new Promise<Move>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const req: AiRequest = { id, view, seat, options };
    w.postMessage(req);
  }).catch(() => chooseMove(view, seat, { ...options, budgetMs: 150 }));
}
