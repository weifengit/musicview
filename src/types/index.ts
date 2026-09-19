/** 单个识别出的音符（onset 驱动：start 到下一 onset 为一个音符） */
export interface Note {
  /** 起始时间（秒） */
  start: number;
  /** 持续时长（秒）= 到下一 onset 的间隔 */
  duration: number;
  /** MIDI 音高（整数，A4=69），由段内有声帧 f0 中位数得到 */
  midi: number;
  /** 音名，如 "F#4" */
  name: string;
  /** 唱名，如 "升发" */
  solfege: string;
  /** 段内峰值音量 dB（20·log10(max|x|)） */
  peakDb: number;
}

/** 分析参数，随结果入库便于版本化重分析 */
export interface AnalysisParams {
  /** YIN 绝对阈值 */
  yinThreshold: number;
  /** 有声判定的清晰度下限（周期性判据，对齐 pYIN voiced 思路；不做全局能量门限） */
  clarityGate: number;
  /** 纯静音地板：rms 低于此值判无声（-60dBFS），仅拒绝数字静音 */
  silenceRms: number;
  /** onset 峰值触发阈值（谱通量 dB 均值），对齐 librosa delta */
  onsetDelta: number;
  /** 两次 onset 最小间隔（秒），对齐 librosa wait */
  onsetWaitSec: number;
  /** 段内最少有声帧数（不足则跳过该段） */
  minVoicedFrames: number;
  /** 同音短碎片合并阈值（秒）：任一段短于此则并回相邻同音段 */
  mergeFragmentSec: number;
}

export const DEFAULT_ANALYSIS_PARAMS: AnalysisParams = {
  yinThreshold: 0.15,
  clarityGate: 0.6,
  silenceRms: 1e-3,
  onsetDelta: 0.1,
  onsetWaitSec: 0.05,
  minVoicedFrames: 3,
  mergeFragmentSec: 0.1,
};

/** 一次分析的完整结果（analyses 表行） */
export interface AnalysisRecord {
  id: string;
  name: string;
  durationSec: number;
  mime: string;
  noteCount: number;
  params: AnalysisParams;
  notes: Note[];
  createdAt: number;
}

/** 文件夹中检测到的音频文件引用（payload 由具体 source 实现决定） */
export interface AudioFileRef {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  payload: unknown;
}

export type AnalysisStatus = 'none' | 'analyzing' | 'done' | 'error';
