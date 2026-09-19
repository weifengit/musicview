/**
 * YIN 基频检测（单帧）。
 * 参考：de Cheveigné & Kawahara, "YIN, a fundamental frequency estimator
 * for speech and music", JASA 2002。
 */

export interface YinResult {
  /** 基频 Hz；该帧判定为无声时 null */
  freq: number | null;
  /** 清晰度 1 - d'(tau0)，越高越可靠 */
  clarity: number;
  /** 该帧 RMS 能量 */
  rms: number;
}

/**
 * 对一帧 PCM 做 YIN 检测。
 * @param frame   帧数据（长度 windowSize）
 * @param offset  帧在 frame 数组中的起始偏移
 * @param windowSize 分析窗口长度
 * @param sampleRate 采样率
 * @param threshold 绝对阈值（典型 0.1–0.2）
 * @param tauMin/tauMax 周期搜索范围（采样点数）
 */
export function detectPitch(
  frame: Float32Array,
  offset: number,
  windowSize: number,
  sampleRate: number,
  threshold: number,
  tauMin: number,
  tauMax: number,
): YinResult {
  // 帧 RMS
  let sumSq = 0;
  for (let i = 0; i < windowSize; i++) {
    const v = frame[offset + i];
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / windowSize);

  const W = windowSize - tauMax; // 差函数可用的样本数
  const d = new Float64Array(tauMax + 1);

  // 1) 差函数 d(tau) = sum_j (x[j] - x[j+tau])^2
  for (let tau = 1; tau <= tauMax; tau++) {
    let acc = 0;
    for (let j = 0; j < W; j++) {
      const diff = frame[offset + j] - frame[offset + j + tau];
      acc += diff * diff;
    }
    d[tau] = acc;
  }

  // 2) 累积均值归一化差函数（CMND）d'(tau)
  const cmnd = new Float64Array(tauMax + 1);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    runningSum += d[tau];
    cmnd[tau] = runningSum === 0 ? 1 : (d[tau] * tau) / runningSum;
  }

  // 3) 绝对阈值：取最小合格 tau 的局部极小值（抗次谐波八度错误的关键）
  let tau0 = -1;
  const start = Math.max(2, tauMin);
  for (let tau = start; tau <= tauMax; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      tau0 = tau;
      break;
    }
  }
  if (tau0 < 0) {
    return { freq: null, clarity: 0, rms };
  }

  // 4) 抛物线插值精化 tau
  let betterTau = tau0;
  if (tau0 > 0 && tau0 < tauMax) {
    const s0 = cmnd[tau0 - 1];
    const s1 = cmnd[tau0];
    const s2 = cmnd[tau0 + 1];
    const denom = 2 * (s0 - 2 * s1 + s2);
    if (Math.abs(denom) > 1e-9) {
      betterTau = tau0 + (s0 - s2) / denom;
    }
  }

  const clarity = Math.max(0, 1 - cmnd[tau0]);
  return { freq: sampleRate / betterTau, clarity, rms };
}
