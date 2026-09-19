import { freqToMidi, midiToName, midiToSolfege } from './music';
import type { AnalysisParams, Note } from '../types';

/**
 * Onset 驱动的音符构建（对齐参考实现 librosa onset_detect + pyin 中位数方案）：
 * 每个 onset 到下一个 onset 是一个音符段；段内有声帧 f0 中位数 → MIDI；
 * 音量 = 段内峰值 dB；最后合并同音短碎片。
 */

/** 逐帧 YIN 结果（worker 内部传递） */
export interface Frame {
  /** 帧中心时间（秒） */
  t: number;
  freq: number | null;
  clarity: number;
  rms: number;
}

export interface BuildNotesInput {
  frames: Frame[];
  hopSec: number;
  /** backtrack 后的 onset 帧下标（升序，与 frames 同一帧网格） */
  onsetIdx: number[];
  /** 音频总时长（秒） */
  totalSec: number;
  /** 取 [t0, t1) 内的峰值 |x| */
  peakOf: (t0: number, t1: number) => number;
  params: AnalysisParams;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function buildNotes(input: BuildNotesInput): Note[] {
  const { frames, hopSec, onsetIdx, totalSec, peakOf, params } = input;
  if (frames.length === 0 || onsetIdx.length === 0) return [];

  // 有声判定以周期性（清晰度）为主，对齐 pYIN voiced 思路；
  // 能量仅设纯静音地板，避免密集演奏时自适应门限误杀衰减中的弱音
  const voiced = frames.map(
    (f) => f.freq !== null && f.clarity >= params.clarityGate && f.rms >= params.silenceRms,
  );

  const notes: Note[] = [];
  for (let i = 0; i < onsetIdx.length; i++) {
    const f0 = onsetIdx[i];
    const f1 = i + 1 < onsetIdx.length ? onsetIdx[i + 1] : frames.length;
    const t0 = f0 * hopSec;
    const t1 = i + 1 < onsetIdx.length ? f1 * hopSec : totalSec;

    // 段内有声帧 f0 中位数 → 音高
    const freqs: number[] = [];
    for (let f = f0; f < Math.min(f1, frames.length); f++) {
      if (voiced[f]) freqs.push(frames[f].freq!);
    }
    if (freqs.length < params.minVoicedFrames) continue;

    const midi = Math.round(freqToMidi(median(freqs)));
    const peak = peakOf(t0, t1);
    const peakDb = 20 * Math.log10(peak + 1e-9);

    notes.push({
      start: t0,
      duration: Math.max(t1 - t0, 0.01),
      midi,
      name: midiToName(midi),
      solfege: midiToSolfege(midi),
      peakDb,
    });
  }

  // 合并同音短碎片（onset 误触发产生的小段并回相邻同音段）
  const merged: Note[] = [];
  for (const n of notes) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.midi === n.midi &&
      (n.duration < params.mergeFragmentSec || prev.duration < params.mergeFragmentSec)
    ) {
      const end = Math.max(prev.start + prev.duration, n.start + n.duration);
      prev.duration = end - prev.start;
      prev.peakDb = Math.max(prev.peakDb, n.peakDb);
    } else {
      merged.push({ ...n });
    }
  }
  return merged;
}
