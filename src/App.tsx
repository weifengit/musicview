import { useEffect } from 'react';
import { FileList } from './components/FileList';
import { PlayerBar } from './components/PlayerBar';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { AnalysisProgress } from './components/AnalysisProgress';
import { NoteChart } from './chart/NoteChart';
import { useAppStore } from './store/appStore';
import { useShortcuts } from './hooks/useShortcuts';
import { usePlaybackSync } from './hooks/usePlaybackSync';

export default function App() {
  useShortcuts();
  usePlaybackSync();

  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  // 错误提示 5 秒后自动消失
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error, setError]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>MusicView</h1>
        <button onClick={() => setSettingsOpen(true)}>快捷键设置</button>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <FileList />
          <HistoryPanel />
        </aside>

        <main className="main">
          <AnalysisProgress />
          <NoteChart />
          <PlayerBar />
        </main>
      </div>

      {error && (
        <div className="toast" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <SettingsDialog />
    </div>
  );
}
