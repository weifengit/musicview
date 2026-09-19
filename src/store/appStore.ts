import { create } from 'zustand';
import type { AnalysisRecord, AnalysisStatus, AudioFileRef } from '../types';
import { AudioPlayer } from '../audio/player';
import type { Viewport } from '../chart/viewport';

/** 全局唯一播放引擎（非 React 状态，组件通过 hook 订阅） */
export const player = new AudioPlayer();

interface AppState {
  // ---- 文件夹与文件 ----
  dirToken: unknown | null;
  files: AudioFileRef[];
  fileStatus: Record<string, AnalysisStatus>;

  // ---- 当前展示 ----
  currentRecord: AnalysisRecord | null;
  currentFileId: string | null; // 来自文件夹的文件 id；历史记录恢复时为 null
  viewport: Viewport | null;
  follow: boolean;

  // ---- 播放 ----
  playing: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  customRate: number; // A/D 调整后的目标速度，S 键在 1.0 与它之间切换
  volume: number;

  // ---- 分析 ----
  analyzingFileId: string | null;
  analyzeProgress: number;
  error: string | null;

  // ---- 历史 ----
  historyVersion: number; // 历史记录变化时 +1，驱动 HistoryPanel 刷新

  // ---- 设置 UI ----
  settingsOpen: boolean;

  setDir: (token: unknown | null, files: AudioFileRef[]) => void;
  setFileStatus: (fileId: string, status: AnalysisStatus) => void;
  setCurrent: (record: AnalysisRecord | null, fileId: string | null) => void;
  setViewport: (vp: Viewport | null) => void;
  setFollow: (follow: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setRate: (rate: number) => void;
  setCustomRate: (rate: number) => void;
  setVolume: (v: number) => void;
  setAnalyzing: (fileId: string | null) => void;
  setAnalyzeProgress: (p: number) => void;
  setError: (msg: string | null) => void;
  bumpHistory: () => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  dirToken: null,
  files: [],
  fileStatus: {},

  currentRecord: null,
  currentFileId: null,
  viewport: null,
  follow: true,

  playing: false,
  currentTime: 0,
  duration: 0,
  rate: 1,
  customRate: 1,
  volume: 1,

  analyzingFileId: null,
  analyzeProgress: 0,
  error: null,

  historyVersion: 0,
  settingsOpen: false,

  setDir: (token, files) => set({ dirToken: token, files, fileStatus: {} }),
  setFileStatus: (fileId, status) =>
    set((s) => ({ fileStatus: { ...s.fileStatus, [fileId]: status } })),
  setCurrent: (record, fileId) =>
    set({ currentRecord: record, currentFileId: fileId, viewport: null, follow: true, currentTime: 0 }),
  setViewport: (viewport) => set({ viewport }),
  setFollow: (follow) => set({ follow }),
  setPlaying: (playing) => set({ playing }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setRate: (rate) => set({ rate }),
  setCustomRate: (customRate) => set({ customRate }),
  setVolume: (volume) => set({ volume }),
  setAnalyzing: (analyzingFileId) => set({ analyzingFileId, analyzeProgress: 0 }),
  setAnalyzeProgress: (analyzeProgress) => set({ analyzeProgress }),
  setError: (error) => set({ error }),
  bumpHistory: () => set((s) => ({ historyVersion: s.historyVersion + 1 })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
