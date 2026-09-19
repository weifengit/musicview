"""
分析钢琴录音，导出 ECharts 交互式单轨音量区块图 (notes_chart.html)
- x 轴 = 时间(s)，区块宽度 = 音符时长，高度 = 峰值音量(dB)
- 每个区块标注音名（如 C4 / 哆）
- dataZoom 支持滚轮缩放 + 底部滑块
"""
import json
import numpy as np
import librosa
import av

# ---------- 1. 读取 M4A ----------
def load_audio(path, sr=22050):
    container = av.open(path)
    stream = container.streams.audio[0]
    chunks = [frame.to_ndarray() for frame in container.decode(stream)]
    y = np.concatenate(chunks, axis=1)
    y = y.mean(axis=0).astype(np.float64)
    if sr and sr != stream.rate:
        y = librosa.resample(y, orig_sr=stream.rate, target_sr=sr)
    return y, sr

y, sr = load_audio("亲爱的蜂蜜茶 338.m4a", sr=22050)

# ---------- 2. 音符分割 + 音高识别 ----------
# wait: 两次 onset 的最小间隔(帧)，delta: 触发阈值
# 默认值过于敏感，会对钢琴击弦重复触发，把一个音劈成多段
hop = 512
onset_frames = librosa.onset.onset_detect(
    y=y, sr=sr, hop_length=hop, backtrack=True, units='frames',
    wait=int(0.05 * sr / hop),   # 最小间隔 50ms
    delta=0.10                   # 触发阈值（默认 0.07，经网格调参选定）
)
onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop)

f0, voiced_flag, voiced_prob = librosa.pyin(
    y, fmin=librosa.note_to_hz('A0'),
    fmax=librosa.note_to_hz('C8'),
    sr=sr, hop_length=hop
)
times = librosa.times_like(f0, sr=sr, hop_length=hop)

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
# 固定唱名：C=哆 D=来 E=咪 F=发 G=唆 A=拉 B=西
SOLFEGE = ['哆', '升哆', '来', '升来', '咪', '发', '升发', '唆', '升唆', '拉', '升拉', '西']

def midi_to_name(midi):
    pc = midi % 12
    octave = midi // 12 - 1
    return f"{NOTE_NAMES[pc]}{octave}", SOLFEGE[pc]

notes = []
for i, t0 in enumerate(onset_times):
    t1 = onset_times[i+1] if i+1 < len(onset_times) else times[-1]
    mask = (times >= t0) & (times < t1) & voiced_flag
    if mask.sum() < 3:
        continue
    f0_med = np.nanmedian(f0[mask])
    if np.isnan(f0_med):
        continue
    midi = int(round(librosa.hz_to_midi(f0_med)))

    seg = y[int(t0*sr):int(t1*sr)]
    if len(seg) == 0:
        continue
    peak = float(np.max(np.abs(seg)))
    peak_db = 20 * np.log10(peak + 1e-9)
    name, solfege = midi_to_name(midi)
    notes.append({
        "start": round(float(t0), 3),
        "end": round(float(t1), 3),
        "peak_db": round(float(peak_db), 2),
        "midi": midi,
        "name": name,
        "solfege": solfege,
    })

# 合并残余的同音短碎片（onset 误触发产生的 <100ms 小段并回相邻同音段）
merged = []
for n in notes:
    if (merged and merged[-1]["midi"] == n["midi"]
            and (n["end"] - n["start"] < 0.10
                 or merged[-1]["end"] - merged[-1]["start"] < 0.10)):
        prev = merged[-1]
        prev["end"] = n["end"]
        prev["peak_db"] = max(prev["peak_db"], n["peak_db"])
    else:
        merged.append(dict(n))
n_merged = len(notes) - len(merged)
notes = merged

print(f"识别到 {len(notes)} 个音符（合并了 {n_merged} 个同音短碎片）")

# ---------- 3. 生成 ECharts HTML ----------
base = min(n["peak_db"] for n in notes)
data = [
    [n["start"], n["end"], round(base, 2), n["peak_db"], n["name"], n["solfege"], n["midi"]]
    for n in notes
]

html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>钢琴音符音量时间线</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
  body {{ font-family: sans-serif; margin: 20px; }}
  #chart {{ width: 100%; height: 82vh; }}
  .tip {{ color: #666; margin-bottom: 8px; }}
</style>
</head>
<body>
<div class="tip">滚轮缩放 / 拖动底部滑块查看细节 · 区块宽度=时长，高度=峰值音量(dB)，标签=音名(唱名) · 颜色：同音级同色系（升降音同族），颜色越深音量越大</div>
<div id="legend" style="margin-bottom:6px;font-size:13px;"></div>
<div id="chart"></div>
<script>
const BASE = {round(base, 2)};
const rawData = {json.dumps(data, ensure_ascii=False)};
// rawData 项: [start, end, base, peak_db, 音名, 唱名, midi]

// ---- 颜色维度 ----
// 7 个音级族（升降音与自然音同族）：C D E F G A B
const FAMILY = [0,0,1,1,2,3,3,4,4,5,5,6];   // 半音 -> 族序号
const HUES   = [0, 28, 55, 120, 185, 222, 268]; // 各族色相：红 橙 黄 绿 青 蓝 紫
const dbMax = Math.max(...rawData.map(d => d[3]));
// 音量 -> 明度：越响颜色越深（弱=78% 浅，强=38% 深），低饱和度配色
function noteColor(midi, db, lightness) {{
  const t = (db - BASE) / (dbMax - BASE + 1e-9);
  const l = lightness !== undefined ? lightness : 78 - t * 40;
  return `hsl(${{HUES[FAMILY[midi % 12]]}}, 48%, ${{l}}%)`;
}}

const chart = echarts.init(document.getElementById('chart'));
chart.setOption({{
  animation: false,
  tooltip: {{
    formatter: p => {{
      const d = p.data;
      return `音名: <b>${{d[4]}}</b>（${{d[5]}}） MIDI ${{d[6]}}<br>` +
             `时间: ${{d[0]}}s ~ ${{d[1]}}s（时长 ${{(d[1]-d[0]).toFixed(3)}}s）<br>` +
             `峰值: ${{d[3]}} dB`;
    }}
  }},
  xAxis: {{ type: 'value', name: '时间 (s)', min: 0, scale: true }},
  yAxis: {{
    type: 'value', name: '峰值音量 (dB)',
    min: Math.floor(BASE - 3), max: 0
  }},
  dataZoom: [
    {{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }},
    {{ type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 24, bottom: 8 }}
  ],
  series: [{{
    type: 'custom',
    renderItem: (params, api) => {{
      const start = api.coord([api.value(0), api.value(3)]);   // 左上
      const end   = api.coord([api.value(1), api.value(2)]);   // 右下
      const w = end[0] - start[0];
      const h = end[1] - start[1];
      const children = [{{
        type: 'rect',
        shape: {{ x: start[0], y: start[1], width: Math.max(w, 1), height: h }},
        style: {{
          fill: noteColor(api.value(6), api.value(3)),
          stroke: noteColor(api.value(6), api.value(3), 25),
          lineWidth: 0.5
        }}
      }}];
      // 柱子足够宽时在上方标注音名（缩放到局部即可见）
      if (w > 26) {{
        children.push({{
          type: 'text',
          style: {{
            text: api.value(4) + '\\n' + api.value(5),
            x: start[0] + w / 2,
            y: start[1] - 4,
            textAlign: 'center',
            textVerticalAlign: 'bottom',
            fontSize: 10,
            lineHeight: 11,
            fill: '#222'
          }}
        }});
      }} else if (w > 13) {{
        children.push({{
          type: 'text',
          style: {{
            text: api.value(4),
            x: start[0] + w / 2,
            y: start[1] - 3,
            textAlign: 'center',
            textVerticalAlign: 'bottom',
            fontSize: 10,
            fill: '#222'
          }}
        }});
      }}
      return {{ type: 'group', children: children }};
    }},
    encode: {{ x: [0, 1], y: [2, 3] }},
    data: rawData
  }}]
}});
window.addEventListener('resize', () => chart.resize());

// 图例：7 个音级族
const legend = document.getElementById('legend');
['C 哆','D 来','E 咪','F 发','G 唆','A 拉','B 西'].forEach((label, i) => {{
  legend.innerHTML += `<span style="display:inline-flex;align-items:center;margin-right:12px;">` +
    `<span style="display:inline-block;width:14px;height:14px;background:hsl(${{HUES[i]}},48%,55%);` +
    `border:1px solid hsl(${{HUES[i]}},48%,28%);margin-right:4px;border-radius:2px;"></span>${{label}}</span>`;
}});
legend.innerHTML += `<span style="color:#888;margin-left:8px;">明度渐变：浅=弱 → 深=强</span>`;
</script>
</body>
</html>
"""

with open("notes_chart.html", "w", encoding="utf-8") as f:
    f.write(html)
print("已生成 notes_chart.html")
