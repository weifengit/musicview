/// <reference lib="webworker" />
import { detectPitch } from './yin';
import { segmentNotes, type Frame } from './segment';
import { HOP_SIZE, TAU_MAX, TAU_MIN, WINDOW_SIZE } from './framing';
import type { AnalysisParams, Note } from '../types';

export interface AnalyzeRequest {
  pcm: Float32Array;
  sampleRate: number;
  params: AnalysisParams;
}

export type WorkerMessage =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; notes: Note[] }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const { pcm, sampleRate, params } = e.data;
  try {
    const hopSec = HOP_SIZE / sampleRate;
    const frameCount = Math.max(0, Math.floor((pcm.length - WINDOW_SIZE) / HOP_SIZE) + 1);
    const frames: Frame[] = new Array(frameCount);

    // 每处理约 200ms 音频上报一次进度
    const progressEvery = Math.max(1, Math.round(0.2 / hopSec));

    for (let i = 0; i < frameCount; i++) {
      const offset = i * HOP_SIZE;
      const r = detectPitch(
        pcm,
        offset,
        WINDOW_SIZE,
        sampleRate,
        params.yinThreshold,
        TAU_MIN,
        TAU_MAX,
      );
      frames[i] = {
        t: (offset + WINDOW_SIZE / 2) / sampleRate,
        freq: r.freq,
        clarity: r.clarity,
        rms: r.rms,
      };
      if (i % progressEvery === 0) {
        const msg: WorkerMessage = { type: 'progress', ratio: i / frameCount };
        self.postMessage(msg);
      }
    }

    const notes = segmentNotes(frames, hopSec, params);
    const msg: WorkerMessage = { type: 'done', notes };
    self.postMessage(msg);
  } catch (err) {
    const msg: WorkerMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};
