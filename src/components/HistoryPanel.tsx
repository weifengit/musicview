import { useCallback, useEffect, useState } from 'react';
import { clearAll, deleteOne, getWithBlob, listAnalyses, totalSize } from '../db/db';
import { useAppStore } from '../store/appStore';
import { showRecord } from '../store/analyzeController';
import type { AnalysisRecord } from '../types';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 历史记录面板：恢复查看 / 单条删除 / 一键清空 */
export function HistoryPanel() {
  const historyVersion = useAppStore((s) => s.historyVersion);
  const currentRecord = useAppStore((s) => s.currentRecord);
  const setError = useAppStore((s) => s.setError);
  const [items, setItems] = useState<AnalysisRecord[]>([]);
  const [size, setSize] = useState(0);

  const refresh = useCallback(async () => {
    setItems(await listAnalyses());
    setSize(await totalSize());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, historyVersion]);

  const restore = async (id: string) => {
    const result = await getWithBlob(id);
    if (!result) {
      setError('该历史记录已不存在');
      void refresh();
      return;
    }
    showRecord(result.record, result.blob, null);
  };

  const remove = async (id: string) => {
    await deleteOne(id);
    void refresh();
  };

  const clear = async () => {
    if (!window.confirm(`确定清空全部 ${items.length} 条历史记录吗？此操作不可撤销。`)) return;
    await clearAll();
    void refresh();
  };

  return (
    <div className="panel history-panel">
      <div className="panel-header">
        <h2>历史记录</h2>
        {items.length > 0 && <button onClick={clear}>一键清空</button>}
      </div>
      {items.length === 0 ? (
        <div className="panel-empty">暂无历史记录</div>
      ) : (
        <>
          <ul>
            {items.map((r) => (
              <li key={r.id} className={r.id === currentRecord?.id ? 'current' : ''}>
                <div className="history-info">
                  <span className="file-name" title={r.name}>
                    {r.name}
                  </span>
                  <span className="history-meta">
                    {r.noteCount} 个音符 · {formatDate(r.createdAt)}
                  </span>
                </div>
                <button onClick={() => restore(r.id)}>查看</button>
                <button className="danger" onClick={() => remove(r.id)}>
                  删除
                </button>
              </li>
            ))}
          </ul>
          <div className="history-footer">共 {items.length} 条，占用约 {formatSize(size)}</div>
        </>
      )}
    </div>
  );
}
