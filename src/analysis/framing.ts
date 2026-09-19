/** 音频解码与预处理：Blob → 单声道 → 重采样到 22050Hz */

export const ANALYSIS_SAMPLE_RATE = 22050;

export const WINDOW_SIZE = 4096; // ≈186ms @22050Hz，需覆盖 A0 周期(802 采样)
export const HOP_SIZE = 256; // ≈11.6ms 时间分辨率

// 钢琴音域 A0(27.5Hz)–C8(4186Hz)，留有余量
export const TAU_MIN = Math.floor(ANALYSIS_SAMPLE_RATE / 2000); // 上限 2000Hz
export const TAU_MAX = Math.ceil(ANALYSIS_SAMPLE_RATE / 27.5); // A0

/** 多声道混合为单声道（直接平均） */
function toMono(buffer: AudioBuffer): Float32Array<ArrayBuffer> {
  const channels = buffer.numberOfChannels;
  const len = buffer.length;
  if (channels === 1) return buffer.getChannelData(0);
  const mono = new Float32Array(len);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) mono[i] += data[i] / channels;
  }
  return mono;
}

/**
 * 解码音频 Blob 并重采样到分析采样率。
 * 重采样用 OfflineAudioContext 渲染（高质量内置重采样，避免手写插值）。
 */
export async function decodeAndPrepare(
  blob: Blob,
): Promise<{ pcm: Float32Array; sampleRate: number; durationSec: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }

  const mono = toMono(decoded);
  const targetLen = Math.ceil((decoded.duration * ANALYSIS_SAMPLE_RATE));

  const offline = new OfflineAudioContext(1, targetLen, ANALYSIS_SAMPLE_RATE);
  const src = offline.createBufferSource();
  const srcBuffer = offline.createBuffer(1, decoded.length, decoded.sampleRate);
  srcBuffer.copyToChannel(mono, 0);
  src.buffer = srcBuffer;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();

  return {
    pcm: rendered.getChannelData(0),
    sampleRate: ANALYSIS_SAMPLE_RATE,
    durationSec: decoded.duration,
  };
}
