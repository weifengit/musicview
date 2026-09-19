import { useAppStore } from '../store/appStore';
import { getSource } from '../files/source';
import { runAnalysis } from '../store/analyzeController';
import type { AnalysisStatus } from '../types';

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  none: '未分析',
  analyzing: '分析中',
  done: '已完成',
  error: '失败',
};

/** 文件夹文件列表：选文件夹、逐文件"生成图表" */
export function FileList() {
  const files = useAppStore((s) => s.files);
  const fileStatus = useAppStore((s) => s.fileStatus);
  const analyzingFileId = useAppStore((s) => s.analyzingFileId);
  const currentFileId = useAppStore((s) => s.currentFileId);
  const setDir = useAppStore((s) => s.setDir);
  const setError = useAppStore((s) => s.setError);

  const pickFolder = async () => {
    try {
      const source = getSource();
      const token = await source.pickDirectory();
      if (!token) return;
      const list = await source.listFiles(token);
      setDir(token, list);
      if (list.length === 0) {
        setError('所选文件夹中没有找到音频文件（支持 m4a/mp3/wav/aac/flac/ogg）');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法读取文件夹');
    }
  };

  return (
    <div className="panel file-list">
      <div className="panel-header">
        <h2>文件夹</h2>
        <button onClick={pickFolder}>选择文件夹</button>
      </div>
      {files.length === 0 ? (
        <div className="panel-empty">尚未选择文件夹</div>
      ) : (
        <ul>
          {files.map((f) => {
            const status = fileStatus[f.id] ?? 'none';
            const isCurrent = f.id === currentFileId;
            return (
              <li key={f.id} className={isCurrent ? 'current' : ''}>
                <span className="file-name" title={f.name}>
                  {f.name}
                </span>
                <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
                <button
                  disabled={analyzingFileId !== null}
                  onClick={() => runAnalysis(f, getSource().readBlob)}
                >
                  {status === 'done' ? '重新生成' : '生成图表'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
