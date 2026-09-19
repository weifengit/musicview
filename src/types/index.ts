/** 单个识别出的音符 */
export interface Note {
  /** 起始时间（秒） */
  start: number;
  /** 持续时长（秒） */
  duration: number;
  /** MIDI 音高（整数，A4=69） */
  midi: number;
  /** 音名，如 "F#4" */
  name: string;
  /** 归一化音量 [0.05, 1]，由段内最大 RMS 全曲归一化得到 */
  velocity: number;
}

/** 分析参数，随结果入库便于版本化重分析 */
export interface AnalysisParams {
  yinThreshold: number;
  clarityGate: number;
  /** 噪音门限系数：全局 rms 第 10 百分位 × 此系数 */
  gateFactor: number;
  /** 同音段合并的最大空隙（秒） */
  mergeGapSec: number;
  /** onset 能量上升倍率 */
  onsetRatio: number;
  /** onset 不应期（秒） */
  onsetRefractorySec: number;
  /** 最短音符时长（秒） */
  minNoteSec: number;
}

export const DEFAULT_ANALYSIS_PARAMS: AnalysisParams = {
  yinThreshold: 0.15,
  clarityGate: 0.6,
  gateFactor: 2.5,
  mergeGapSec: 0.06,
  onsetRatio: 1.8,
  onsetRefractorySec: 0.08,
  minNoteSec: 0.09,
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
