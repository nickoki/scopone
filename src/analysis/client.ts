/**
 * Main-thread handle on the analysis worker. Requests are answered one at a
 * time, in order. If the worker cannot start (not expected on any supported
 * device), the very same analysis runs on the UI thread: slower and it can
 * make the interface stutter, but the marks stay on the same scale.
 */
import type { Rules } from '../engine';
import { analyseDecision } from './analyze';
import type { Decision } from './positions';
import type { MoveReview } from './types';
import type { AnalysisRequest, AnalysisResponse } from './worker';

let worker: Worker | null = null;
let broken = false;
let nextId = 1;
const pending = new Map<number, { resolve: (r: MoveReview) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (broken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<AnalysisResponse>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.review) p.resolve(ev.data.review);
      else p.reject(new Error(ev.data.error ?? 'analysis failed'));
    };
    worker.onerror = () => {
      broken = true;
      worker = null;
      for (const p of pending.values()) p.reject(new Error('analysis worker failed'));
      pending.clear();
    };
    return worker;
  } catch {
    broken = true;
    return null;
  }
}

/** Analyse one decision. */
export function requestAnalysis(decision: Decision, rules: Rules, scores: [number, number]): Promise<MoveReview> {
  const onMainThread = () =>
    new Promise<MoveReview>((resolve, reject) => {
      setTimeout(() => {
        try {
          const review = analyseDecision(decision, rules, scores);
          if (review) resolve(review);
          else reject(new Error('inconsistent record'));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }, 30);
    });
  const w = getWorker();
  if (!w) return onMainThread();
  return new Promise<MoveReview>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const req: AnalysisRequest = { id, decision, rules, scores };
    w.postMessage(req);
  }).catch((err: Error) => (broken ? onMainThread() : Promise.reject(err)));
}
