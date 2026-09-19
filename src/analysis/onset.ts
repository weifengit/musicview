import { fftRadix2 } from './fft';

/**
 * Onset 检测，对齐 librosa：
 * - onset_strength：STFT 幅度 → dB（全局 floor = max-80dB）→ 谱通量（正向差分按频取均值）
 * - onset_detect：peak_pick(pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta, wait)
 * - backtrack：峰值回退到能量局部极小点（对齐到击弦前谷底）
 */

/** 计算 onset 包络（谱通量），帧网格与 YIN 一致（center 对齐，帧 i 中心 = i*hop） */
export function computeOnsetEnvelope(
  pcm: Float32Array,
  nFft: number,
  hop: number,
): Float64Array {
  const half = nFft / 2;
  const padded = new Float64Array(pcm.length + nFft); // center 模式：两侧各补 nFft/2
  padded.set(pcm, half);
  const nFrames = 1 + Math.floor((padded.length - nFft) / hop);

  // 周期 Hann 窗（同 scipy 默认）
  const win = new Float64Array(nFft);
  for (let i = 0; i < nFft; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft);

  const bins = nFft / 2 + 1;
  const logMags = new Float32Array(nFrames * bins);
  let globalMax = -Infinity;

  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);
  for (let f = 0; f < nFrames; f++) {
    const off = f * hop;
    for (let i = 0; i < nFft; i++) {
      re[i] = padded[off + i] * win[i];
      im[i] = 0;
    }
    fftRadix2(re, im);
    const row = f * bins;
    for (let b = 0; b < bins; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      const db = 20 * Math.log10(Math.max(mag, 1e-10));
      logMags[row + b] = db;
      if (db > globalMax) globalMax = db;
    }
  }

  // librosa amplitude_to_db 的 top_db=80 全局下限
  const floor = globalMax - 80;
  const env = new Float64Array(nFrames);
  for (let f = 1; f < nFrames; f++) {
    const row = f * bins;
    const prevRow = (f - 1) * bins;
    let flux = 0;
    for (let b = 0; b < bins; b++) {
      const cur = Math.max(logMags[row + b], floor);
      const prev = Math.max(logMags[prevRow + b], floor);
      const diff = cur - prev;
      if (diff > 0) flux += diff;
    }
    env[f] = flux / bins;
  }
  return env;
}

/** librosa.util.peak_pick 风格峰值检测 */
export function pickPeaks(
  x: Float64Array,
  delta: number,
  wait: number,
  preMax = 3,
  postMax = 3,
  preAvg = 3,
  postAvg = 5,
): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < x.length; i++) {
    if (peaks.length > 0 && i <= peaks[peaks.length - 1] + wait) continue;

    // 移动最大值窗口 [i-preMax, i+postMax]
    let isMax = true;
    const lo = Math.max(0, i - preMax);
    const hi = Math.min(x.length - 1, i + postMax);
    for (let j = lo; j <= hi; j++) {
      if (x[j] > x[i]) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;

    // 移动均值窗口 [i-preAvg, i+postAvg]
    let sum = 0;
    let cnt = 0;
    const alo = Math.max(0, i - preAvg);
    const ahi = Math.min(x.length - 1, i + postAvg);
    for (let j = alo; j <= ahi; j++) {
      sum += x[j];
      cnt++;
    }
    if (x[i] >= sum / cnt + delta) peaks.push(i);
  }
  return peaks;
}

/**
 * onset_backtrack：从每个峰值沿下降坡走回最近的能量谷底（击弦前静音点）。
 * 用严格小于判断下降坡：平底（静音/噪声平台）立即停止，落点稳定不漂移。
 * 边界：不越过上一个 onset，最多回看 maxBackFrames 帧。
 */
export function backtrackOnsets(
  peaks: number[],
  energy: Float64Array,
  maxBackFrames = 13, // ≈300ms @hop512/22050
): number[] {
  const out: number[] = [];
  for (const p of peaks) {
    const lo = Math.max(out.length > 0 ? out[out.length - 1] + 1 : 0, p - maxBackFrames);
    let i = Math.min(p, energy.length - 1);
    while (i > lo && energy[i - 1] < energy[i]) i--;
    out.push(i);
  }
  return out;
}
