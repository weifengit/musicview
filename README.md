# MusicView

钢琴录音 → 音符识别 → 可视化图表 + 联动播放的应用（Web 版 + Tauri 桌面版，CI 自动构建 Windows 安装包）。

## 功能

- **音符识别**：纯前端 Web Audio 解码 + onset 驱动分析（Worker 内运行，不卡 UI）：STFT 谱通量 onset 检测（对齐 librosa `delta=0.10, wait=50ms, backtrack`）切分音符 → 段内 YIN 基频中位数定音高 → 段内峰值 dB 定音量；音符无缝衔接，同音重复弹正确切分
- **可视化图表**：X 轴=时间，Y 轴=峰值音量(dB)；柱宽=音符时长（到下一 onset）；7 个音级族色系（升降音同族，红橙黄绿青蓝紫）；同族按音量做明度渐变（浅=弱→深=强）；柱上标注音名+唱名（如 F#4/升发）；顶部音级图例
- **图表交互**：滚轮缩放（锚定鼠标）、拖拽 / Shift+滚轮平移、双击回到全局
- **播放联动**：播放指针（playhead）随音乐前进，与缩放/平移精确适配；指针越界自动翻页跟随；手动缩放/平移后解除跟随，可一键恢复
- **文件管理**：选择文件夹自动列出音频文件（m4a/mp3/wav/aac/flac/ogg），逐文件生成图表
- **历史记录**：识别结果 + 音频副本存 IndexedDB，可恢复查看（无需原文件夹）、单条删除、一键清空
- **快捷键**：全部可自定义（默认：空格=播放/暂停，A/D=速度增减，S=1.0↔自定义速度切换，Z/X=后退/前进 5s，F=恢复跟随）；梯度、跳跃秒数、速度范围可调；设置持久化到 localStorage

## 开发

* [ ]
  ```bash
  npm install
  npm run dev        # http://localhost:5173
  ```

## 构建 / 检查

```bash
npm run build      # tsc --noEmit + vite build
```

## 测试

```bash
npx tsx scripts/test-synth.ts        # Node 端算法回归（合成音频 → YIN → 分段断言）
# 浏览器端到端（需 dev server 运行中）：打开 http://localhost:5173/test-e2e.html
# 标题显示 "E2E PASS" 即解码 + Worker 分析 + 图表渲染全链路通过
```

## 架构

```
src/
├── analysis/    纯算法层（不依赖 React）：fft/onset（STFT 谱通量 + 峰值检测 + 回退）、
│                yin（基频检测）、segment（onset 驱动音符构建）、pipeline（管线编排）
├── audio/       播放引擎（HTMLAudioElement 封装，perf.now 插值平滑时间）
├── chart/       双层 Canvas 图表：视口变换、渲染、颜色映射、交互
├── files/       文件夹来源抽象：webSource（File System Access API）、tauriSource（plugin-fs）
├── db/          Dexie/IndexedDB：analyses（结果）+ blobs（音频副本）两表
├── settings/    快捷键定义 + zustand persist 设置存储
├── store/       zustand 应用状态 + action 分发 + 分析编排
├── hooks/       useShortcuts（全局快捷键）、usePlaybackSync（播放同步）
└── components/  FileList / PlayerBar / HistoryPanel / SettingsDialog / AnalysisProgress
```

## 桌面打包（Tauri）

业务代码只依赖 `src/files/source.ts` 的 `AudioDirSource` 接口（返回 Blob）；`getSource()` 按 `__TAURI_INTERNALS__` 自动切换 web / tauri 实现，业务代码零改动。

```bash
npm run tauri:dev      # 桌面开发模式（需 Rust 工具链）
npm run tauri:build    # 本机打包（产物在 src-tauri/target/release/bundle/）
```

## 发布（GitHub Actions，仅 Windows）

`.github/workflows/release.yml`：推送 `v*` tag（或 Actions 页手动触发）→ 在 Windows  runner 上构建 → 生成 NSIS `.exe` 与 `.msi` 安装包 → 以草稿形式发布到 GitHub Releases（检查后再手动 Publish）。

```bash
git tag v0.1.0 && git push origin v0.1.0
```

版本号取自 `src-tauri/tauri.conf.json` 的 `version`，发版前记得与 `package.json` 一起 bump。

## 已知限制

- 和弦只识别最强基频（单旋律钢琴场景优化）；同音重复通过能量 onset 切分
- m4a/AAC 解码依赖浏览器/系统 codec（Chrome、Safari、macOS WKWebView、Windows WebView2 均支持）
