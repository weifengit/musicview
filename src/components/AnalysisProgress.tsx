import { useAppStore } from '../store/appStore';
import { cancelAnalysis } from '../store/analyzeController';

/** 分析进度条（含取消） */
export function AnalysisProgress() {
  const analyzingFileId = useAppStore((s) => s.analyzingFileId);
  const progress = useAppStore((s) => s.analyzeProgress);

  if (!analyzingFileId) return null;

  return (
    <div className="analysis-progress">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <span>{Math.round(progress * 100)}%</span>
      <button onClick={cancelAnalysis}>取消</button>
    </div>
  );
}
