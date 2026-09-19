# MusicView

钢琴录音 → 音符识别 → 可视化图表 + 联动播放的 Web 应用（规划最终用 Tauri 打包成桌面小应用）。

## 功能

- **音符识别**：纯前端 Web Audio 解码 + YIN 基频检测（Worker 内运行，不卡 UI），识别音名、起止时间、音量
- **可视化图表**：X 轴=时间，Y 轴=归一化音量；柱宽=音符时长；12 个音名各一个色相；同音名按音量做同色系深浅渐变；柱上标注音名
- **图表交互**：滚轮缩放（锚定鼠标）、拖拽 / Shift+滚轮平移、双击回到全局
- **播放联动**：播放指针（playhead）随音乐前进，与缩放/平移精确适配；指针越界自动翻页跟随；手动缩放/平移后解除跟随，可一键恢复
- **文件管理**：选择文件夹自动列出音频文件（m4a/mp3/wav/aac/flac/ogg），逐文件生成图表
- **历史记录**：识别结果 + 音频副本存 IndexedDB，可恢复查看（无需原文件夹）、单条删除、一键清空
- **快捷键**：全部可自定义（默认：空格=播放/暂停，A/D=速度增减，S=1.0↔自定义速度切换，Z/X=后退/前进 5s，F=恢复跟随）；梯度、跳跃秒数、速度范围可调；设置持久化到 localStorage

## 开发

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
├── analysis/    纯算法层：YIN 音高检测、音符分段、freq↔MIDI↔音名（不依赖 React）
├── audio/       播放引擎（HTMLAudioElement 封装，perf.now 插值平滑时间）
├── chart/       双层 Canvas 图表：视口变换、渲染、颜色映射、交互
├── files/       文件夹来源抽象（Tauri 适配层）：webSource 已实现，tauriSource 留桩
├── db/          Dexie/IndexedDB：analyses（结果）+ blobs（音频副本）两表
├── settings/    快捷键定义 + zustand persist 设置存储
├── store/       zustand 应用状态 + action 分发 + 分析编排
├── hooks/       useShortcuts（全局快捷键）、usePlaybackSync（播放同步）
└── components/  FileList / PlayerBar / HistoryPanel / SettingsDialog / AnalysisProgress
```

## Tauri 打包路径

业务代码只依赖 `src/files/source.ts` 的 `AudioDirSource` 接口（返回 Blob）。加壳时：

1. `npm run tauri init`（或 `cargo create-tauri-app` 方式接入）
2. 实现 `src/files/tauriSource.ts`（plugin-dialog 选目录、plugin-fs readDir/readFile、convertFileSrc 播放）
3. 在 capabilities 中配置 fs/dialog 权限
4. `getSource()` 已按 `__TAURI_INTERNALS__` 自动切换实现，业务代码零改动

## 已知限制

- 和弦只识别最强基频（单旋律钢琴场景优化）；同音重复通过能量 onset 切分
- m4a/AAC 解码依赖浏览器/系统 codec（Chrome、Safari、macOS WKWebView 均支持）
- 项目根目录的示例文件 `亲爱的蜂蜜茶 338.m4a` 内容全为零字节，不是有效音频，请用真实录音测试
