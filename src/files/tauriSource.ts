import type { AudioFileRef } from '../types';
import { isAudioFile, type AudioDirSource } from './source';

/**
 * Tauri 端文件夹来源（第 11 步加壳时填充实现）。
 * 计划：
 * - pickDirectory: @tauri-apps/plugin-dialog 的 open({ directory: true })
 * - listFiles: @tauri-apps/plugin-fs 的 readDir
 * - readBlob: readFile → Blob（分析用）；播放可用 convertFileSrc(path) 零拷贝
 */
export const tauriSource: AudioDirSource = {
  async pickDirectory(): Promise<unknown | null> {
    throw new Error('Tauri 适配层尚未实现');
  },
  async listFiles(_token: unknown): Promise<AudioFileRef[]> {
    void _token;
    throw new Error('Tauri 适配层尚未实现');
  },
  async readBlob(ref: AudioFileRef): Promise<Blob> {
    void ref;
    throw new Error('Tauri 适配层尚未实现');
  },
};

// 保留导入以免文件为空模块时报错；实现后移除
void isAudioFile;
