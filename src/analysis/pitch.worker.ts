/// <reference lib="webworker" />
import { analyzePcm } from './pipeline';
import type { AnalysisParams, Note } from '../types';

export interface AnalyzeRequest {
  pcm: Float32Array;
  sampleRate: number;
  params: AnalysisParams;
}

export type WorkerMessage =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; notes: Note[]; onsetCount: number }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const { pcm, sampleRate, params } = e.data;
  try {
    const { notes, onsetCount } = analyzePcm(pcm, sampleRate, params, (ratio) => {
      const msg: WorkerMessage = { type: 'progress', ratio };
      self.postMessage(msg);
    });
    const msg: WorkerMessage = { type: 'done', notes, onsetCount };
    self.postMessage(msg);
  } catch (err) {
    const msg: WorkerMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};
