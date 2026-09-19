/**
 * 真实录音回归脚本：读取 WAV（用 afconvert 从 m4a 转出），跑完整管线，
 * 与 Python librosa 版（206 个音符）对比。
 *
 * 准备：afconvert -f WAVE -d LEI16@22050 -c 1 "亲爱的蜂蜜茶 338.m4a" /tmp/piano.wav
 * 运行：npx tsx scripts/test-real.ts /tmp/piano.wav
 */
import { readFileSync } from 'node:fs';
import { analyzePcm } from '../src/analysis/pipeline';
import { computeOnsetEnvelope, pickPeaks, backtrackOnsets } from '../src/analysis/onset';
import { detectPitch } from '../src/analysis/yin';
import { HOP_SIZE, N_FFT, TAU_MAX, TAU_MIN, WINDOW_SIZE } from '../src/analysis/framing';
import { DEFAULT_ANALYSIS_PARAMS } from '../src/types';

const wavPath = process.argv[2];
if (!wavPath) {
  console.error('用法: npx tsx scripts/test-real.ts <wav文件>');
  process.exit(1);
}

/** 解析 16-bit PCM mono WAV */
function readWav(path: string): { pcm: Float32Array; sampleRate: number } {
  const buf = readFileSync(path);
  let offset = 12;
  let sampleRate = 22050;
  let dataOff = 44;
  let dataLen = buf.length - 44;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') sampleRate = buf.readUInt32LE(offset + 12);
    if (id === 'data') {
      dataOff = offset + 8;
      dataLen = size;
      break;
    }
    offset += 8 + size;
  }
  const n = Math.floor(dataLen / 2);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pcm[i] = buf.readInt16LE(dataOff + i * 2) / 32768;
  }
  return { pcm, sampleRate };
}

const { pcm, sampleRate } = readWav(wavPath);
const dur = pcm.length / sampleRate;
console.log(`音频: ${dur.toFixed(2)}s @ ${sampleRate}Hz`);

// ---- onset 统计 ----
const env = computeOnsetEnvelope(pcm, N_FFT, HOP_SIZE);
const waitFrames = Math.round(DEFAULT_ANALYSIS_PARAMS.onsetWaitSec / (HOP_SIZE / sampleRate));
const peaks = pickPeaks(env, DEFAULT_ANALYSIS_PARAMS.onsetDelta, waitFrames);
const onsets = backtrackOnsets(peaks, env);
console.log(`onset 包络: max=${Math.max(...env).toFixed(2)} mean=${(env.reduce((a, b) => a + b, 0) / env.length).toFixed(3)}`);
console.log(`onset 数: ${onsets.length}  [Python 版音符数: 206]`);

// ---- YIN 有声帧统计（新规则：清晰度 + 静音地板）----
const padded = new Float32Array(pcm.length + WINDOW_SIZE);
padded.set(pcm, WINDOW_SIZE / 2);
let voiced = 0;
for (let i = 0; i < env.length; i++) {
  const r = detectPitch(padded, i * HOP_SIZE, WINDOW_SIZE, sampleRate, DEFAULT_ANALYSIS_PARAMS.yinThreshold, TAU_MIN, TAU_MAX);
  if (r.freq !== null && r.clarity >= DEFAULT_ANALYSIS_PARAMS.clarityGate && r.rms >= DEFAULT_ANALYSIS_PARAMS.silenceRms) voiced++;
}
console.log(`YIN 有声帧: ${voiced}/${env.length}（${((voiced / env.length) * 100).toFixed(0)}%）`);

// ---- 完整管线 ----
const t0 = performance.now();
const { notes } = analyzePcm(pcm, sampleRate, DEFAULT_ANALYSIS_PARAMS);
const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
console.log(`\n管线结果: ${notes.length} 个音符，耗时 ${elapsed}s  [目标: ~206]`);

console.log('前 10 个音符:');
for (const n of notes.slice(0, 10)) {
  console.log(`  ${n.name.padEnd(4)} start=${n.start.toFixed(3)} dur=${n.duration.toFixed(3)} peak=${n.peakDb.toFixed(1)}dB`);
}

// 回归断言：数量在 Python 版的 ±30% 以内
if (notes.length >= 144 && notes.length <= 268) {
  console.log(`\n✓ 音符数 ${notes.length} 在目标范围 [144, 268] 内（Python: 206）`);
  process.exit(0);
} else {
  console.error(`\n✗ 音符数 ${notes.length} 偏离目标范围 [144, 268]（Python: 206）`);
  process.exit(1);
}
