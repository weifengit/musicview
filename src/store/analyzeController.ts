import { analyzeAudio, type AnalyzeHandle } from '../analysis/analyzer';
import { player, useAppStore } from './appStore';
import { saveAnalysis } from '../db/db';
import type { AnalysisRecord, AudioFileRef } from '../types';
import { DEFAULT_ANALYSIS_PARAMS } from '../types';

/** 当前进行中的分析（用于取消） */
let currentHandle: AnalyzeHandle | null = null;

export function cancelAnalysis() {
  currentHandle?.cancel();
  currentHandle = null;
  const s = useAppStore.getState();
  if (s.analyzingFileId) {
    s.setFileStatus(s.analyzingFileId, 'none');
    s.setAnalyzing(null);
  }
}

/**
 * 分析一个文件：读 Blob → Worker 分析 → 存历史（含音频副本）→ 设为当前展示。
 */
export async function runAnalysis(
  ref: AudioFileRef,
  readBlob: (ref: AudioFileRef) => Promise<Blob>,
): Promise<void> {
  const s = useAppStore.getState();
  if (s.analyzingFileId) cancelAnalysis();

  s.setAnalyzing(ref.id);
  s.setFileStatus(ref.id, 'analyzing');
  s.setError(null);

  try {
    const blob = await readBlob(ref);
    currentHandle = analyzeAudio(blob, (ratio) => {
      useAppStore.getState().setAnalyzeProgress(ratio);
    });
    const { notes, durationSec } = await currentHandle.promise;
    currentHandle = null;

    const record: AnalysisRecord = {
      id: crypto.randomUUID(),
      name: ref.name,
      durationSec,
      mime: blob.type || 'audio/*',
      noteCount: notes.length,
      params: DEFAULT_ANALYSIS_PARAMS,
      notes,
      createdAt: Date.now(),
    };

    // 存历史（含音频副本，历史可脱离原文件夹回放）
    try {
      await saveAnalysis(record, blob);
      useAppStore.getState().bumpHistory();
    } catch (dbErr) {
      // 配额不足等：分析结果仍展示，仅提示历史保存失败
      console.error('历史保存失败', dbErr);
      useAppStore.getState().setError('分析完成，但保存历史记录失败（存储空间可能不足）');
    }

    const st = useAppStore.getState();
    st.setFileStatus(ref.id, 'done');
    st.setAnalyzing(null);
    showRecord(record, blob, ref.id);
  } catch (err) {
    currentHandle = null;
    const st = useAppStore.getState();
    st.setFileStatus(ref.id, 'error');
    st.setAnalyzing(null);
    st.setError(err instanceof Error ? err.message : '分析失败');
  }
}

/** 将一条分析记录 + 音频设为当前展示，并加载进播放器 */
export function showRecord(record: AnalysisRecord, blob: Blob, fileId: string | null) {
  const s = useAppStore.getState();
  player.pause();
  player.loadBlob(blob);
  player.setRate(s.rate);
  player.setVolume(s.volume);
  s.setCurrent(record, fileId);
}
