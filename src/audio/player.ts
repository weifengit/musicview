/**
 * 播放引擎：HTMLAudioElement 封装。
 * - playbackRate 变速不变调（preservesPitch）
 * - Blob objectURL / 直给 URL 加载
 * - currentTime 粒度粗（部分浏览器 ~250ms），对外提供 perf.now 插值的平滑时间
 */

export interface PlayerEvents {
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onLoaded?: (duration: number) => void;
}

export class AudioPlayer {
  private audio: HTMLAudioElement;
  private objectUrl: string | null = null;
  /** 平滑时间锚点：事件时刻的真实播放时间 + 当时的 perf 时钟 */
  private anchorTime = 0;
  private anchorPerf = 0;
  private events: PlayerEvents = {};

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.resetAnchor();

    this.audio.addEventListener('play', () => {
      this.resetAnchor();
      this.events.onPlay?.();
    });
    this.audio.addEventListener('pause', () => {
      this.resetAnchor();
      this.events.onPause?.();
    });
    this.audio.addEventListener('ended', () => {
      this.resetAnchor();
      this.events.onEnded?.();
    });
    this.audio.addEventListener('timeupdate', () => this.resetAnchor());
    this.audio.addEventListener('seeked', () => this.resetAnchor());
    this.audio.addEventListener('ratechange', () => this.resetAnchor());
    this.audio.addEventListener('loadedmetadata', () => {
      this.events.onLoaded?.(this.audio.duration);
    });
  }

  setEvents(events: PlayerEvents) {
    this.events = events;
  }

  private resetAnchor() {
    this.anchorTime = this.audio.currentTime || 0;
    this.anchorPerf = performance.now();
  }

  /** 当前播放时间（秒），播放中用 perf.now 插值实现 60fps 平滑 */
  getTime(): number {
    if (this.audio.paused) return this.audio.currentTime || 0;
    const elapsed = ((performance.now() - this.anchorPerf) / 1000) * this.audio.playbackRate;
    const t = this.anchorTime + elapsed;
    const dur = this.audio.duration;
    return Number.isFinite(dur) ? Math.min(t, dur) : t;
  }

  getDuration(): number {
    return this.audio.duration || 0;
  }

  isPlaying(): boolean {
    return !this.audio.paused;
  }

  loadBlob(blob: Blob) {
    this.unloadUrl();
    this.objectUrl = URL.createObjectURL(blob);
    this.audio.src = this.objectUrl;
    this.audio.load();
  }

  loadUrl(url: string) {
    this.unloadUrl();
    this.audio.src = url;
    this.audio.load();
  }

  private unloadUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  play() {
    void this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  toggle() {
    if (this.audio.paused) this.play();
    else this.pause();
  }

  seek(sec: number) {
    const dur = this.getDuration();
    const target = Number.isFinite(dur) ? Math.min(Math.max(0, sec), dur) : Math.max(0, sec);
    this.audio.currentTime = target;
    this.resetAnchor();
  }

  setRate(rate: number) {
    this.audio.playbackRate = rate;
    // 变速不变调（Safari 旧版用 webkit 前缀）
    const a = this.audio as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
    a.preservesPitch = true;
    if ('webkitPreservesPitch' in a) a.webkitPreservesPitch = true;
    this.resetAnchor();
  }

  getRate(): number {
    return this.audio.playbackRate;
  }

  setVolume(v: number) {
    this.audio.volume = Math.min(1, Math.max(0, v));
  }

  getVolume(): number {
    return this.audio.volume;
  }

  destroy() {
    this.audio.pause();
    this.unloadUrl();
    this.audio.src = '';
  }
}
