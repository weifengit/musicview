import { detectPitch } from './yin';
import { computeOnsetEnvelope, pickPeaks, backtrackOnsets } from './onset';
import { buildNotes, type Frame } from './segment';
import { HOP_SIZE, N_FFT, TAU_MAX, TAU_MIN, WINDOW_SIZE } from './framing';
import type { AnalysisParams, Note } from '../types';

/**
 * 完整分析管线（纯计算，worker 与 Node 测试共用）：
 * STFT 谱通量 onset 检测 → 逐帧 YIN → onset 驱动音符构建。
 */

export interface PipelineResult {
  notes: Note[];
  onsetCount: number;
}

export function analyzePcm(
  pcm: Float32Array,
  sampleRate: number,
  params: AnalysisParams,
  onProgress?: (ratio: number) => void,
): PipelineResult {
  const hopSec = HOP_SIZE / sampleRate;

  // 1) Onset 检测（STFT 快，占进度前 10%）
  const envelope = computeOnsetEnvelope(pcm, N_FFT, HOP_SIZE);
  const waitFrames = Math.round(params.onsetWaitSec / hopSec);
  const peaks = pickPeaks(envelope, params.onsetDelta, waitFrames);
  const onsetIdx = backtrackOnsets(peaks, envelope);
  onProgress?.(0.1);

  // 2) 逐帧 YIN（与 onset 同一帧网格：center 对齐，帧 i 中心 = i*hop）
  //    center 模式：帧 i 覆盖样本 [i*hop - N/2, i*hop + N/2)，两侧零填充
  const n = pcm.length;
  const half = WINDOW_SIZE / 2;
  const frameCount = envelope.length;
  const padded = new Float32Array(n + WINDOW_SIZE);
  padded.set(pcm, half);
  const frames: Frame[] = new Array(frameCount);
  const progressEvery = Math.max(1, Math.floor(frameCount / 40)); // 约 40 次进度上报
  for (let i = 0; i < frameCount; i++) {
    const r = detectPitch(padded, i * HOP_SIZE, WINDOW_SIZE, sampleRate, params.yinThreshold, TAU_MIN, TAU_MAX);
    frames[i] = { t: i * hopSec, freq: r.freq, clarity: r.clarity, rms: r.rms };
    if (i % progressEvery === 0) {
      onProgress?.(0.1 + (0.85 * i) / frameCount);
    }
  }

  // 3) onset 驱动音符构建
  const peakOf = (t0: number, t1: number): number => {
    const s0 = Math.max(0, Math.floor(t0 * sampleRate));
    const s1 = Math.min(n, Math.ceil(t1 * sampleRate));
    let peak = 0;
    for (let i = s0; i < s1; i++) {
      const v = Math.abs(pcm[i]);
      if (v > peak) peak = v;
    }
    return peak;
  };

  const notes = buildNotes({
    frames,
    hopSec,
    onsetIdx,
    totalSec: n / sampleRate,
    peakOf,
    params,
  });

  onProgress?.(1);
  return { notes, onsetCount: onsetIdx.length };
}
