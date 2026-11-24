/// <reference lib="webworker" />
import { chooseMove } from './index';
import type { AiRequest, AiResponse } from './types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<AiRequest>) => {
  const { id, view, seat, options } = ev.data;
  let res: AiResponse;
  try {
    res = { id, move: chooseMove(view, seat, options) };
  } catch (err) {
    res = { id, error: err instanceof Error ? err.message : String(err) };
  }
  ctx.postMessage(res);
};
