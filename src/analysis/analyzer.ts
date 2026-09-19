import { decodeAndPrepare } from './framing';
import type { AnalyzeRequest, WorkerMessage } from './pitch.worker';
import { DEFAULT_ANALYSIS_PARAMS, type AnalysisParams, type Note } from '../types';

export interface AnalyzeHandle {
  promise: Promise<{ notes: Note[]; durationSec: number }>;
  cancel: () => void;
}

/**
 * 分析一个音频 Blob：解码（主线程异步）→ Worker 跑 YIN + 分段。
 * onProgress 回调 [0, 1]；cancel() 通过 terminate 粗暴取消。
 */
export function analyzeAudio(
  blob: Blob,
  onProgress?: (ratio: number) => void,
  params: AnalysisParams = DEFAULT_ANALYSIS_PARAMS,
): AnalyzeHandle {
  let worker: Worker | null = null;
  let cancelled = false;

  const promise = (async () => {
    const { pcm, sampleRate, durationSec } = await decodeAndPrepare(blob);
    if (cancelled) throw new Error('已取消');

    return new Promise<{ notes: Note[]; durationSec: number }>((resolve, reject) => {
      worker = new Worker(new URL('./pitch.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          onProgress?.(msg.ratio);
        } else if (msg.type === 'done') {
          onProgress?.(1);
          worker?.terminate();
          worker = null;
          resolve({ notes: msg.notes, durationSec });
        } else {
          worker?.terminate();
          worker = null;
          reject(new Error(msg.message));
        }
      };
      worker.onerror = (e) => {
        worker?.terminate();
        worker = null;
        reject(new Error(e.message || '分析失败'));
      };
      const req: AnalyzeRequest = { pcm, sampleRate, params };
      // Transferable 零拷贝传入 PCM
      worker.postMessage(req, [pcm.buffer]);
    });
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      worker?.terminate();
      worker = null;
    },
  };
}
