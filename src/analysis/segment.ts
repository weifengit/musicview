import { freqToMidi, midiToName } from './music';
import type { AnalysisParams, Note } from '../types';

/** 逐帧分析结果（Worker 内部传递） */
export interface Frame {
  /** 帧中心时间（秒） */
  t: number;
  freq: number | null;
  clarity: number;
  rms: number;
}

interface RawSegment {
  startIdx: number;
  endIdx: number; // 含
  midi: number;
}

/** 计算全局 rms 的第 p 百分位（p∈[0,100]） */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

/** 对浮点 midi 序列做窗口中值滤波（仅处理 voiced 帧，unvoiced 保持 NaN） */
function medianSmooth(midis: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  const out = new Array<number>(midis.length);
  for (let i = 0; i < midis.length; i++) {
    if (Number.isNaN(midis[i])) {
      out[i] = NaN;
      continue;
    }
    const vals: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(midis.length - 1, i + half); j++) {
      if (!Number.isNaN(midis[j])) vals.push(midis[j]);
    }
    vals.sort((a, b) => a - b);
    out[i] = vals.length ? vals[Math.floor(vals.length / 2)] : NaN;
  }
  return out;
}

/**
 * 逐帧音高 → 音符分段。
 * 流程：有声判定 → 中值平滑 → 量化成段 → 合并短空隙 → onset 切分同音重复 →
 *      最短时长过滤 → 孤立八度修正 → 音量归一化。
 */
export function segmentNotes(frames: Frame[], hopSec: number, params: AnalysisParams): Note[] {
  if (frames.length === 0) return [];

  // 1) 有声判定：自适应噪音门限（手机 AGC 底噪不可靠，用全局第 10 百分位推算）
  const allRms = frames.map((f) => f.rms);
  const gate = Math.max(percentile(allRms, 10) * params.gateFactor, Math.pow(10, -60 / 20));
  const midiFloat = frames.map((f) =>
    f.freq !== null && f.clarity >= params.clarityGate && f.rms >= gate
      ? freqToMidi(f.freq)
      : NaN,
  );

  // 2) 中值平滑消除单帧八度/半音毛刺
  const smoothed = medianSmooth(midiFloat, 5);

  // 3) 量化 + 连续同 MIDI 成段
  const quantized = smoothed.map((m) => (Number.isNaN(m) ? -1 : Math.round(m)));
  let segments: RawSegment[] = [];
  let cur: RawSegment | null = null;
  for (let i = 0; i < quantized.length; i++) {
    const m = quantized[i];
    if (m < 0) {
      if (cur) segments.push(cur);
      cur = null;
    } else if (cur && cur.midi === m && cur.endIdx === i - 1) {
      cur.endIdx = i;
    } else {
      if (cur) segments.push(cur);
      cur = { startIdx: i, endIdx: i, midi: m };
    }
  }
  if (cur) segments.push(cur);

  // 4) 同音段短空隙合并（短暂掉帧/衰减）
  const mergeGapFrames = Math.round(params.mergeGapSec / hopSec);
  const merged: RawSegment[] = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.midi === seg.midi && seg.startIdx - prev.endIdx - 1 <= mergeGapFrames) {
      prev.endIdx = seg.endIdx;
    } else {
      merged.push({ ...seg });
    }
  }

  // 5) Onset 切分：长同音段内能量上升沿处切开（同音重复弹）
  const refractoryFrames = Math.round(params.onsetRefractorySec / hopSec);
  const split: RawSegment[] = [];
  for (const seg of merged) {
    let segStart = seg.startIdx;
    let lastOnset = seg.startIdx;
    for (let i = seg.startIdx + 1; i <= seg.endIdx; i++) {
      const prev = frames[i - 1].rms;
      const cur2 = frames[i].rms;
      if (
        cur2 > prev * params.onsetRatio &&
        cur2 > gate * 1.5 &&
        i - lastOnset >= refractoryFrames
      ) {
        split.push({ startIdx: segStart, endIdx: i - 1, midi: seg.midi });
        segStart = i;
        lastOnset = i;
      }
    }
    split.push({ startIdx: segStart, endIdx: seg.endIdx, midi: seg.midi });
  }

  // 6) 最短时长过滤
  const minFrames = Math.max(1, Math.round(params.minNoteSec / hopSec));
  let kept = split.filter((s) => s.endIdx - s.startIdx + 1 >= minFrames);

  // 7) 孤立八度修正：比前后邻居恰好 ±12 且更短的段，吸附到邻居音高
  kept = kept.map((seg, i) => {
    const prev = kept[i - 1];
    const next = kept[i + 1];
    if (!prev || !next) return seg;
    const len = seg.endIdx - seg.startIdx + 1;
    const short = len * hopSec < 0.15;
    if (!short) return seg;
    if (Math.abs(seg.midi - prev.midi) === 12 && seg.midi - prev.midi === next.midi - seg.midi) {
      // prev 和 next 同音（如 C4 - C5 - C4 中的 C5 误判）
      if (prev.midi === next.midi) return { ...seg, midi: prev.midi };
    }
    return seg;
  });

  // 8) 音量：段内 maxRms → dB → 全曲归一化
  const withRms = kept.map((seg) => {
    let maxRms = 0;
    for (let i = seg.startIdx; i <= seg.endIdx; i++) {
      if (frames[i].rms > maxRms) maxRms = frames[i].rms;
    }
    return { seg, maxRms };
  });
  const dbs = withRms.map(({ maxRms }) => 20 * Math.log10(Math.max(maxRms, 1e-8)));
  const minDb = Math.min(...dbs);
  const maxDb = Math.max(...dbs);
  const range = Math.max(maxDb - minDb, 1e-6);

  return withRms.map(({ seg }, i) => {
    const velocity = Math.min(1, Math.max(0.05, (dbs[i] - minDb) / range));
    const start = frames[seg.startIdx].t - hopSec / 2;
    const end = frames[seg.endIdx].t + hopSec / 2;
    return {
      start: Math.max(0, start),
      duration: Math.max(hopSec, end - start),
      midi: seg.midi,
      name: midiToName(seg.midi),
      velocity,
    };
  });
}
