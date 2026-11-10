/* =============================================================================
 * engine.js — 宏微观三层穿透显微镜 · 纯渲染与交互引擎（S2 模块化版）
 * -----------------------------------------------------------------------------
 * 职责：读取标准化「反应卡带数据」（data/*.js 通过 window.CHEM_CARTRIDGES 挂载），
 *       按当前视界（L1/L2/L3）与时间轴进度 t(0~1) 绘制 2D 动画，
 *       处理时间轴拖拽、播放、视界切换、左侧目录栏切换，并同步「人话解说卡片」。
 *
 * 引擎不包含任何具体化学反应数据（原子坐标 / 化学键 / 解说词），
 * 一切内容都来自卡带。引擎只自带：
 *   1) 元素视觉字典 ATOM_STYLE（固定配色）
 *   2) L1 宏观场景视觉库 MACRO_SCENES（实验台通用仪器画法，由卡带 macro.scene 选用）
 *   3) 卡带 Schema 校验（CHEM_SCHEMA / validateChemCartridge）
 *
 * 加载顺序（双击 index.html 即可运行，禁用 ES Module）：
 *   data/ch1_water.js → data/ch2_oxygen_carbon.js → data/ch3_metals.js → data/ch4_acids_bases_salts.js → engine.js
 *   各卡带文件执行：window.CHEM_CARTRIDGES = window.CHEM_CARTRIDGES || [] 再 push。
 * ========================================================================== */
(function () {
  'use strict';

  /* ====================================================================== */
  /* 0. 小工具                                                              */
  /* ====================================================================== */

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function invLerp(a, b, v) { return b === a ? 0 : clamp01((v - a) / (b - a)); }
  function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function easeOut(t) { t = clamp01(t); return 1 - (1 - t) * (1 - t); }

  /** 在 [a,b] 窗口内平滑 0→1 */
  function windowT(t, a, b) { return smoothstep(invLerp(a, b, t)); }

  function dist(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 确定性伪随机（同一 seed 永远同结果，避免画面乱跳） */
  function seeded(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /* ====================================================================== */
  /* 0.5 安全净空区（Safe Y-Zone）与坐标映射                                 */
  /*     画布顶部留给固定标题、底部留给解说框/相位条，                        */
  /*     归一化坐标 y∈[0,1] 只映射进中间的“纯净绘制带”，                      */
  /*     粒子与浮动胶囊从此不再与标题/解说框发生任何重叠。                     */
  /* ====================================================================== */

  var TITLE_ZONE = 66;      // 左上角两行层标题占用高度（含呼吸空间）
  var PHASE_BAR_ZONE = 28;  // 底部相位条 / 播放头占用高度
  var SAFE_GAP = 8;         // 解说框与内容区之间的呼吸空间
  var PILL_PAD = 12;        // 胶囊距画布左右边缘的安全边距

  var safe = { top: 0, bottom: 0 };

  function mapX(nx) { return nx * viewW; }

  function mapY(ny) {
    var h = viewH - safe.top - safe.bottom;
    if (h < 40) h = 40;
    return safe.top + clamp01(ny) * h;
  }

  /* ====================================================================== */
  /* 1. 原子视觉字典（引擎级固定配色，卡带只说元素符号）                     */
  /* ====================================================================== */

  var ATOM_STYLE = {
    H:  { color: '#7fd4ff', glow: '#b7e9ff', r: 15, label: 'H' },   // 氢 · 淡蓝
    O:  { color: '#ff6b6b', glow: '#ffb3b3', r: 23, label: 'O' },   // 氧 · 红
    C:  { color: '#4a5568', glow: '#a0aec0', r: 21, label: 'C' },   // 碳 · 灰黑（木炭）
    Mg: { color: '#cfd8dc', glow: '#ffffff', r: 26, label: 'Mg' },  // 镁 · 银白
    Mn: { color: '#7e57c2', glow: '#b39ddb', r: 24, label: 'Mn' },  // 锰 · 紫（二氧化锰）
    Ca: { color: '#8d6e63', glow: '#bcaaa4', r: 25, label: 'Ca' },  // 钙 · 棕（石灰石）
    Cl: { color: '#26a69a', glow: '#80cbc4', r: 21, label: 'Cl' },  // 氯 · 青绿
    Fe: { color: '#78909c', glow: '#b0bec5', r: 25, label: 'Fe' },  // 铁 · 钢灰
    Cu: { color: '#c2704e', glow: '#e8a58a', r: 24, label: 'Cu' },  // 铜 · 紫红
    S:  { color: '#e6c84e', glow: '#fff1a8', r: 21, label: 'S' },   // 硫 · 淡黄
    Zn: { color: '#9aa7b5', glow: '#d5dee6', r: 25, label: 'Zn' },  // 锌 · 银白
    Na: { color: '#ffa726', glow: '#ffcc80', r: 24, label: 'Na' },  // 钠 · 金橙
    Ba: { color: '#9ccc65', glow: '#c5e1a5', r: 25, label: 'Ba' },  // 钡 · 苹果绿
    e:  { color: '#ffd54f', glow: '#fff3b0', r: 5, label: 'e' }     // 电子 · 金
  };

  function atomStyle(el) {
    return ATOM_STYLE[el] || { color: '#cccccc', glow: '#eeeeee', r: 18, label: el };
  }

  /* ====================================================================== */
  /* 2. 全局状态                                                            */
  /* ====================================================================== */

  var canvas, ctx, viewW = 900, viewH = 520;
  var state = {
    cartridgeId: 'h2_combustion',
    layer: 'L1',          // 'L1' | 'L2' | 'L3'
    t: 0,                 // 0~1 时间轴进度
    playing: false,
    duration: 14,         // 播放一遍所需的秒数
    clock: 0              // 动画时钟（驱动热运动）
  };

  function currentCartridge() {
    var list = window.CHEM_CARTRIDGES || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === state.cartridgeId) return list[i];
    }
    return list[0];
  }

  /* ====================================================================== */
  /* 2.5 卡带 Schema（标准化对接口文档 + 校验器）                           */
  /* ====================================================================== */

  var CHEM_SCHEMA = {
    version: '1.1',
    name: 'Reaction Cartridge Schema',
    description:
      '一张卡带 = 一个完整化学反应的可视化剧本。引擎只认这个结构，不认具体化学内容。',
    topLevelFields: [
      'id', 'name', 'shortName', 'icon', 'equation', 'type', 'typeDesc',
      'summary', 'legend', 'macro', 'molecular', 'atomic', 'narration'
    ],
    optionalFields: ['badge', 'chapter'],
    timing: {
      t: '0~1，对应时间轴 0%~100%',
      phases: [
        { range: '0.00~0.25', label: '反应前稳态' },
        { range: '0.25~0.50', label: '激发与化学键断裂 / 活化能垒' },
        { range: '0.50~0.75', label: '原子重组与电子转移' },
        { range: '0.75~1.00', label: '生成物新稳态' }
      ]
    },
    chapter: '{ id, name, order } 目录栏章节分组',
    badge: "类型徽章配色：'syn' 化合 | 'dec' 分解 | 'dbl' 复分解 | 'mix' 其他",
    atomFields: {
      id: '字符串，全卡带唯一',
      el: '元素符号，如 H / O / C / Mg（决定颜色与半径）',
      start: '[x, y] 归一化起点',
      mid: '[x, y] 归一化碰撞/过渡点',
      end: '[x, y] 归一化终点',
      jitter: '热运动幅度系数，轻原子（H）应更大',
      shells: '仅 L3 需要：电子层排布，如 [2, 6]',
      label: '可选：球内文字覆盖（如催化剂 MnO₂）',
      ion: '可选 L3：{ label: "Mg²⁺", from: 0.62 } 生成离子后显示电荷',
      catalyst: '可选：true 则画催化剂光环与徽标'
    },
    bondFields: {
      a: '相连原子 id',
      b: '相连原子 id',
      order: '键级：1=单键，2=双键（视觉上画两道）',
      breakAt: '[t0, t1] 断裂窗口（旧键拉伸→消失）',
      formAt: '[t0, t1] 形成窗口（新键从远处聚拢→稳定）',
      pairs: '仅 L3 需要：共用电子对数量',
      ionic: '可选 L3：true 则画虚线静电引力（离子键），不画共用电子对'
    }
  };

  function validateCartridge(c) {
    var errors = [];
    if (!c || typeof c !== 'object') {
      return { ok: false, errors: ['卡带不是对象'] };
    }
    CHEM_SCHEMA.topLevelFields.forEach(function (f) {
      if (!(f in c)) errors.push('缺少字段: ' + f);
    });
    if (c.molecular && c.molecular.atoms) {
      c.molecular.atoms.forEach(function (a) {
        ['id', 'el', 'start', 'mid', 'end'].forEach(function (f) {
          if (!(f in a)) errors.push('molecular.atom ' + (a.id || '?') + ' 缺少 ' + f);
        });
      });
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* ====================================================================== */
  /* 3. 绘图基元                                                            */
  /* ====================================================================== */

  function roundRectPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGlowCircle(x, y, r, color, glow, alpha) {
    alpha = alpha == null ? 1 : alpha;
    var g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 2.1);
    g.addColorStop(0, glow);
    g.addColorStop(0.45, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha;
    var g2 = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g2.addColorStop(0, '#ffffff');
    g2.addColorStop(0.28, glow);
    g2.addColorStop(1, color);
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** 带符号的原子球 */
  function drawAtom(x, y, el, radiusMul, alpha, label) {
    var st = atomStyle(el);
    var r = st.r * (radiusMul == null ? 1 : radiusMul);
    var a = alpha == null ? 1 : alpha;

    var g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r * 1.9);
    g.addColorStop(0, st.glow);
    g.addColorStop(0.5, st.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
    ctx.fill();

    var g2 = ctx.createRadialGradient(x - r * 0.38, y - r * 0.38, r * 0.08, x, y, r);
    g2.addColorStop(0, '#ffffff');
    g2.addColorStop(0.22, st.glow);
    g2.addColorStop(1, st.color);
    ctx.globalAlpha = a;
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(12,20,36,0.85)';
    var txt = label || st.label;
    var fontPx = r * (String(txt).length > 2 ? 0.58 : 0.85);
    ctx.font = 'bold ' + Math.round(fontPx) + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 1);
    ctx.globalAlpha = 1;
  }

  function drawElectron(x, y, r, alpha) {
    r = r || 5;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, '#fff8d6');
    g.addColorStop(0.35, '#ffd54f');
    g.addColorStop(1, 'rgba(255,213,79,0)');
    ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.85;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** 化学键（可带断裂/形成动画） */
  function drawBond(ax, ay, bx, by, order, opts) {
    opts = opts || {};
    var alpha = opts.alpha == null ? 1 : opts.alpha;
    if (alpha <= 0.01) return;
    var stretch = opts.stretch == null ? 1 : opts.stretch;
    var mx = (ax + bx) / 2, my = (ay + by) / 2;
    var tx = mx + (mx - ax) * (stretch - 1);
    var ty = my + (my - ay) * (stretch - 1);
    // stretch 沿连线方向拉长
    var dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    var ex = ax + ux * len * stretch, ey = ay + uy * len * stretch;

    var glow = opts.glow || '#9ae6ff';
    ctx.save();
    ctx.lineCap = 'round';
    if (opts.dashed) ctx.setLineDash([9, 7]);
    ctx.globalAlpha = alpha * 0.35;
    ctx.strokeStyle = glow;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = opts.color || '#d7f3ff';
    ctx.lineWidth = opts.dashed ? 4 : (order === 2 ? 5 : 7);
    if (order === 2 && !opts.dashed) {
      var ox = -uy * 5, oy = ux * 5;
      ctx.beginPath(); ctx.moveTo(ax + ox, ay + oy); ctx.lineTo(ex + ox, ey + oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax - ox, ay - oy); ctx.lineTo(ex - ox, ey - oy); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** 断键火花 */
  function drawBreakSpark(x, y, strength, time) {
    if (strength <= 0.01 || strength >= 0.99) return;
    var n = 9;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2 + time * 1.4;
      var r0 = 8 + Math.sin(time * 6 + i) * 3;
      var r1 = r0 + 12 + strength * 16;
      ctx.globalAlpha = (1 - Math.abs(strength - 0.5) * 2) * 0.85;
      ctx.strokeStyle = '#ffe082';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
      ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 圆角胶囊标签 —— 统一入队，由 flushPills() 在单帧最顶层绘制 */
  var pillQueue = [];

  function drawPill(x, y, text, color, alpha, align) {
    alpha = alpha == null ? 1 : alpha;
    if (alpha <= 0.01 || !text) return;
    pillQueue.push({
      x: x, y: y, text: String(text), color: color, alpha: alpha, align: align
    });
  }

  /** 胶囊实际绘制（含边界钳制，防止贴边截断 / 撞上标题与底部解说框） */
  function drawPillNow(x, y, text, color, alpha, align) {
    alpha = alpha == null ? 1 : alpha;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '600 13px "Microsoft YaHei", "PingFang SC", sans-serif';
    var w = ctx.measureText(text).width + 22;
    var h = 26;
    var pad = PILL_PAD;

    // x 轴钳制：任何文字绝不超出画布边框
    if (align === 'left') {
      x = Math.max(pad, Math.min(viewW - pad - w, x));
    } else if (align === 'right') {
      x = Math.max(pad + w, Math.min(viewW - pad, x));
    } else {
      x = Math.max(pad + w / 2, Math.min(viewW - pad - w / 2, x));
    }

    // y 轴安全区钳制：不撞左上角标题，也不压底部解说框 / 相位条
    var minY = safe.top + h / 2;
    var maxY = viewH - safe.bottom - h / 2;
    if (maxY < minY) {
      minY = maxY = Math.max(h / 2, Math.min(viewH - h / 2, y));
    }
    y = Math.max(minY, Math.min(maxY, y));

    var left = align === 'right' ? x - w : align === 'left' ? x : x - w / 2;
    roundRectPath(left, y - h / 2, w, h, 13);
    ctx.fillStyle = 'rgba(12,20,36,0.90)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#eef4ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + w / 2, y + 1);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /**
   * 单帧胶囊总出口：同文本 36px 内合并居中（防同类键标签堆叠），
   * 然后统一绘制在最顶层。
   */
  function flushPills() {
    if (!pillQueue.length) return;
    var kept = [];
    pillQueue.forEach(function (p) {
      for (var i = 0; i < kept.length; i++) {
        var k = kept[i];
        if (k.text === p.text && dist(k.x, k.y, p.x, p.y) < 36) {
          k.x = (k.x + p.x) / 2;
          k.y = (k.y + p.y) / 2;
          k.alpha = Math.max(k.alpha, p.alpha);
          return;
        }
      }
      kept.push(p);
    });
    kept.forEach(function (p) {
      drawPillNow(p.x, p.y, p.text, p.color, p.alpha, p.align);
    });
    pillQueue.length = 0;
  }

  function drawText(text, x, y, size, color, align, alpha, weight) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = (weight || '600') + ' ' + (size || 15) +
      'px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillStyle = color || '#e8eef7';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawLeaderLine(x1, y1, x2, y2, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 0.55 : alpha;
    ctx.strokeStyle = color || '#8fa3c8';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ====================================================================== */
  /* 4. L1 宏观实验台 · 场景视觉库（MACRO_SCENES）                           */
  /*     卡带用 macro.scene 指定场景名；通用仪器画法复用，化学内容在数据里  */
  /* ====================================================================== */

  var MACRO_SCENES = {};

  function renderMacro(cartridge, t, time) {
    var m = cartridge.macro;

    // L1 无画布内标题：只避开底部相位条
    safe.top = 4;
    safe.bottom = PHASE_BAR_ZONE;

    // 背景
    var bg = ctx.createLinearGradient(0, 0, 0, viewH);
    bg.addColorStop(0, '#0b1220');
    bg.addColorStop(0.55, '#122036');
    bg.addColorStop(1, '#1a2b45');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);

    var sceneFn = MACRO_SCENES[m.scene] || MACRO_SCENES.combustion;
    sceneFn(m, t, time);

    // 现象清单（左下角，逐条亮起）
    var ph = m.phenomena || [];
    drawText('实验现象', 18, viewH - 118 - (ph.length - 1) * 34, 12, '#b39ddb', 'left', 0.85);
    for (var i = 0; i < ph.length; i++) {
      var a = windowT(t, ph[i].at - 0.02, ph[i].at + 0.06);
      drawPill(18, viewH - 92 - (ph.length - 1 - i) * 34,
        (a > 0.5 ? '✓ ' : '· ') + ph[i].label, '#b39ddb', 0.32 + a * 0.68, 'left');
    }

    // 全部胶囊置顶统一绘制
    flushPills();
  }

  /** 氢气燃烧：集气瓶 + 点火 + 火焰 + 水雾 + 温度计 */
  function drawMacroCombustion(m, t, time) {
    var cx = viewW * 0.42;
    var baseY = viewH * 0.78;

    // 实验台
    var bench = ctx.createLinearGradient(0, baseY, 0, viewH);
    bench.addColorStop(0, '#2a3a55');
    bench.addColorStop(1, '#1b2940');
    ctx.fillStyle = bench;
    ctx.fillRect(0, baseY, viewW, viewH - baseY);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, baseY, viewW, 3);

    // 铁架台
    ctx.fillStyle = '#243449';
    ctx.fillRect(viewW * 0.12, baseY - 24, viewW * 0.28, 24);
    ctx.fillRect(viewW * 0.18, baseY - 330, 14, 310);
    ctx.fillStyle = '#3d5473';
    ctx.fillRect(viewW * 0.18 + 14, baseY - 300, viewW * 0.12, 10);

    // 集气瓶（瓶身）
    var jarW = 190, jarH = 250;
    var jarX = cx - jarW / 2, jarY = baseY - jarH - 18;
    ctx.save();
    roundRectPath(jarX, jarY, jarW, jarH, 26);
    var glass = ctx.createLinearGradient(jarX, jarY, jarX + jarW, jarY + jarH);
    glass.addColorStop(0, 'rgba(150,190,230,0.18)');
    glass.addColorStop(0.5, 'rgba(120,170,220,0.10)');
    glass.addColorStop(1, 'rgba(150,190,230,0.20)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,215,255,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 瓶内气体
    var gasAlpha = 0.10 + 0.10 * (1 - windowT(t, 0.35, 0.85));
    ctx.globalAlpha = gasAlpha;
    ctx.fillStyle = '#9fd8ff';
    roundRectPath(jarX + 12, jarY + 14, jarW - 24, jarH - 28, 20);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 反应火焰 / 闪光
    var flash = windowT(t, 0.24, 0.30) * (1 - windowT(t, 0.30, 0.42));
    if (flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = flash * 0.85;
      var fg = ctx.createRadialGradient(cx, jarY + jarH * 0.45, 10, cx, jarY + jarH * 0.45, 280);
      fg.addColorStop(0, '#fffbe6');
      fg.addColorStop(0.35, '#ffd54f');
      fg.addColorStop(1, 'rgba(255,213,79,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.restore();
    }

    var flame = windowT(t, 0.28, 0.42) * (1 - windowT(t, 0.80, 0.98));
    if (flame > 0.01) {
      drawFlame(cx, jarY + jarH * 0.52, 1.0 + 0.12 * Math.sin(time * 5), flame);
    }

    // 水雾 / 水珠
    var drops = Math.floor(windowT(t, 0.55, 0.88) * 14);
    for (var i = 0; i < drops; i++) {
      var side = i % 2 === 0 ? 1 : -1;
      var dx = cx + side * (jarW * 0.38);
      var dy = jarY + 30 + seeded(i * 3.1) * (jarH - 70);
      var dr = 3 + seeded(i * 7.7) * 4;
      ctx.save();
      ctx.globalAlpha = 0.75;
      var dg = ctx.createRadialGradient(dx - dr * 0.3, dy - dr * 0.3, 0.5, dx, dy, dr);
      dg.addColorStop(0, '#ffffff');
      dg.addColorStop(0.4, '#b7e9ff');
      dg.addColorStop(1, 'rgba(120,190,240,0.25)');
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(dx, dy, dr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 热浪
    var heat = windowT(t, 0.35, 0.55) * (1 - windowT(t, 0.85, 1.0));
    if (heat > 0.01) {
      ctx.save();
      ctx.globalAlpha = heat * 0.5;
      ctx.strokeStyle = '#ffd9a0';
      ctx.lineWidth = 2;
      for (var k = 0; k < 3; k++) {
        ctx.beginPath();
        for (var px = 0; px <= 40; px++) {
          var xx = cx - 120 + px * 6;
          var yy = jarY - 26 - k * 16 + Math.sin(px * 0.55 + time * 3 + k) * 5;
          if (px === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 温度计
    drawThermometer(viewW * 0.78, viewH * 0.22, viewH * 0.52, windowT(t, 0.25, 0.85));

    // 条件标签
    drawPill(cx, jarY - 34, '条件：' + (m.conditions || '点燃'), '#ffb74d', 0.95);
    drawPill(cx, baseY + 26, m.vesselLabel || '', '#90caf9', 0.9);
  }

  function drawFlame(x, y, scale, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    var flicker = 1 + Math.sin(state.clock * 7.3) * 0.08 + Math.sin(state.clock * 3.1) * 0.05;

    // 柔和外发光
    ctx.globalAlpha = alpha * 0.32;
    var g1 = ctx.createRadialGradient(0, 0, 8, 0, 0, 110);
    g1.addColorStop(0, '#ffca6b');
    g1.addColorStop(0.5, 'rgba(255,140,60,0.45)');
    g1.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(0, 0, 110, 0, Math.PI * 2);
    ctx.fill();

    // 外焰（泪滴形）
    ctx.globalAlpha = alpha * 0.85;
    var w1 = 46 * flicker, h1 = 110 * flicker;
    var g2 = ctx.createLinearGradient(0, -h1, 0, h1 * 0.6);
    g2.addColorStop(0, '#fff3c4');
    g2.addColorStop(0.35, '#ffb74d');
    g2.addColorStop(1, '#ff7043');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.moveTo(0, -h1);
    ctx.bezierCurveTo(w1 * 0.9, -h1 * 0.45, w1, h1 * 0.15, 0, h1 * 0.62);
    ctx.bezierCurveTo(-w1, h1 * 0.15, -w1 * 0.9, -h1 * 0.45, 0, -h1);
    ctx.closePath();
    ctx.fill();

    // 内焰（淡蓝）
    ctx.globalAlpha = alpha * 0.95;
    var w2 = 24 * flicker, h2 = 58 * flicker;
    var g3 = ctx.createLinearGradient(0, -h2, 0, h2 * 0.7);
    g3.addColorStop(0, '#eaf7ff');
    g3.addColorStop(0.45, '#7fd4ff');
    g3.addColorStop(1, '#4aa3e8');
    ctx.fillStyle = g3;
    ctx.beginPath();
    ctx.moveTo(0, -h2);
    ctx.bezierCurveTo(w2 * 0.95, -h2 * 0.4, w2, h2 * 0.2, 0, h2 * 0.75);
    ctx.bezierCurveTo(-w2, h2 * 0.2, -w2 * 0.95, -h2 * 0.4, 0, -h2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawThermometer(x, y, h, fill) {
    var w = 34;
    // 管
    roundRectPath(x - w / 2, y, w, h, 16);
    ctx.fillStyle = 'rgba(220,235,255,0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,215,250,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 灯泡
    ctx.beginPath();
    ctx.arc(x, y + h + 16, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6b6b';
    ctx.fill();
    // 水银柱
    var top = y + h - (h - 20) * fill;
    var hg = ctx.createLinearGradient(0, top, 0, y + h);
    hg.addColorStop(0, '#ff8a80');
    hg.addColorStop(1, '#ff5252');
    ctx.fillStyle = hg;
    roundRectPath(x - 9, top, 18, y + h - top + 10, 9);
    ctx.fill();
    // 刻度
    for (var i = 0; i <= 5; i++) {
      var yy = y + 18 + (h - 36) * (i / 5);
      ctx.fillStyle = 'rgba(220,235,255,0.55)';
      ctx.fillRect(x + 10, yy, 12, 2);
    }
    drawText('室温 → 高温', x, y - 16, 13, '#ffd9a0', 'center');
    drawText(Math.round(25 + fill * 375) + '℃', x, y + h + 52, 15, '#ffb3b3', 'center');
  }

  /** 水电解：烧杯 + 电极 + 电池 + 气泡 + 收集试管 */
  function drawMacroElectrolysis(m, t, time) {
    var cx = viewW * 0.5;
    var baseY = viewH * 0.82;

    // 实验台
    var bench = ctx.createLinearGradient(0, baseY, 0, viewH);
    bench.addColorStop(0, '#2a3a55');
    bench.addColorStop(1, '#1b2940');
    ctx.fillStyle = bench;
    ctx.fillRect(0, baseY, viewW, viewH - baseY);

    var beakerW = viewW * 0.52;
    var beakerH = viewH * 0.46;
    var beakerX = cx - beakerW / 2;
    var beakerY = baseY - beakerH;

    // 烧杯
    ctx.save();
    roundRectPath(beakerX, beakerY, beakerW, beakerH, 18);
    var glass = ctx.createLinearGradient(beakerX, beakerY, beakerX + beakerW, beakerY + beakerH);
    glass.addColorStop(0, 'rgba(150,190,230,0.16)');
    glass.addColorStop(1, 'rgba(150,190,230,0.08)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,215,255,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 水
    var waterTop = beakerY + 36;
    var wg = ctx.createLinearGradient(0, waterTop, 0, baseY);
    wg.addColorStop(0, 'rgba(80,160,220,0.34)');
    wg.addColorStop(1, 'rgba(40,110,180,0.50)');
    ctx.fillStyle = wg;
    roundRectPath(beakerX + 10, waterTop, beakerW - 20, baseY - waterTop - 12, 12);
    ctx.fill();
    // 水面波纹
    ctx.strokeStyle = 'rgba(180,225,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var px = 0; px <= 36; px++) {
      var xx = beakerX + 14 + px * ((beakerW - 28) / 36);
      var yy = waterTop + Math.sin(px * 0.55 + time * 2.2) * 3;
      if (px === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();

    // 电极
    var elY = waterTop - 10;
    var elH = baseY - waterTop - 40;
    var cathodeX = cx - beakerW * 0.22;
    var anodeX = cx + beakerW * 0.22;
    drawElectrode(cathodeX, elY, elH, '−', '负极（阴极）', '#7fd4ff');
    drawElectrode(anodeX, elY, elH, '＋', '正极（阳极）', '#ff8a80');

    // 电池
    drawBattery(cx, baseY - 6, t, time);

    // 气泡
    var bubblePower = windowT(t, 0.24, 0.55);
    if (bubblePower > 0.01) {
      drawBubbles(cathodeX, waterTop, baseY - 60, bubblePower * 2.0, time, 0);
      drawBubbles(anodeX, waterTop, baseY - 60, bubblePower, time, 1);
    }

    // 收集气体的试管（倒置）
    drawGasTube(cathodeX, beakerY + 6, windowT(t, 0.35, 1.0) * 1.0, 'H₂', '#7fd4ff');
    drawGasTube(anodeX, beakerY + 6, windowT(t, 0.35, 1.0) * 0.5, 'O₂', '#ff8a80');

    drawPill(cx, beakerY - 74, '条件：' + (m.conditions || '通电'), '#ffe082', 0.95);
    drawPill(cx, baseY + 26, 'V(H₂) : V(O₂) ≈ 2 : 1', '#90caf9', windowT(t, 0.55, 0.7));
  }

  function drawElectrode(x, y, h, sign, label, color) {
    var w = 18;
    ctx.save();
    roundRectPath(x - w / 2, y, w, h, 5);
    var g = ctx.createLinearGradient(x - w / 2, y, x + w / 2, y);
    g.addColorStop(0, '#2b3648');
    g.addColorStop(0.5, '#4a5b73');
    g.addColorStop(1, '#2b3648');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,220,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 接线柱
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - 4, 9, 0, Math.PI * 2);
    ctx.fill();
    drawText(sign, x, y - 4, 13, '#0b1220', 'center', 1, 'bold');
    drawText(label, x, y - 30, 13, color, 'center');
    ctx.restore();
  }

  function drawBattery(x, y, t, time) {
    var w = 150, h = 44;
    roundRectPath(x - w / 2, y - h, w, h, 8);
    var g = ctx.createLinearGradient(0, y - h, 0, y);
    g.addColorStop(0, '#31425e');
    g.addColorStop(1, '#1d2c44');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(170,200,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawText('电源（通电）', x, y - h / 2, 14, '#cfe2ff', 'center');

    // 导线到电极
    ctx.strokeStyle = 'rgba(160,190,230,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 18, y - h);
    ctx.lineTo(x - w / 2 + 18, y - h - 40);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 18, y - h);
    ctx.lineTo(x + w / 2 - 18, y - h - 40);
    ctx.stroke();

    // 电流光点
    var on = windowT(t, 0.22, 0.32);
    if (on > 0.02) {
      for (var i = 0; i < 3; i++) {
        var phase = (time * 0.55 + i / 3) % 1;
        var lx = lerp(x - w / 2 + 18, x + w / 2 - 18, phase);
        ctx.save();
        ctx.globalAlpha = on * (0.4 + 0.6 * Math.sin(phase * Math.PI));
        drawElectron(lx, y - h - 20, 4, 1);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBubbles(x, yTop, yBottom, power, time, seedOffset) {
    var count = Math.min(26, Math.floor(6 + power * 22));
    for (var i = 0; i < count; i++) {
      var r0 = seeded(i * 3.7 + seedOffset * 11);
      var speed = 0.16 + r0 * 0.16;
      var phase = (time * speed + seeded(i * 5.3 + seedOffset)) % 1;
      var y = lerp(yBottom, yTop + 8, phase);
      var xj = x + (seeded(i * 9.1 + seedOffset * 3) - 0.5) * 18;
      var r = (2.2 + r0 * 3.2) * (0.7 + power * 0.5);
      var alpha = (1 - phase) * 0.75 * Math.min(1, power * 1.6);
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      var g = ctx.createRadialGradient(xj - r * 0.35, y - r * 0.35, r * 0.1, xj, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.55, '#b7e9ff');
      g.addColorStop(1, 'rgba(160,220,255,0.15)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(xj, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawGasTube(x, yTop, fill, label, color) {
    var w = 52, h = 150;
    ctx.save();
    roundRectPath(x - w / 2, yTop - h, w, h + 12, 14);
    ctx.fillStyle = 'rgba(160,200,240,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(185,215,255,0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 气体部分（在试管顶部）
    var gasH = (h - 26) * fill;
    if (gasH > 2) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = color;
      roundRectPath(x - w / 2 + 6, yTop - h + 8, w - 12, gasH, 10);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawText(label, x, yTop - h - 16, 14, color, 'center');
    if (fill > 0.25) {
      drawText(Math.round(fill * 100) + '%', x, yTop - h + 22 + gasH * 0.2, 12, '#eef4ff', 'center');
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ---------------- L1 通用仪器画法 ---------------- */

  function drawBench(baseY) {
    var bench = ctx.createLinearGradient(0, baseY, 0, viewH);
    bench.addColorStop(0, '#2a3a55');
    bench.addColorStop(1, '#1b2940');
    ctx.fillStyle = bench;
    ctx.fillRect(0, baseY, viewW, viewH - baseY);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, baseY, viewW, 3);
  }

  function drawBeaker(x, y, w, h, liquidRatio, liquidColor) {
    ctx.save();
    roundRectPath(x, y, w, h, 10);
    var glass = ctx.createLinearGradient(x, y, x + w, y + h);
    glass.addColorStop(0, 'rgba(150,190,230,0.16)');
    glass.addColorStop(1, 'rgba(150,190,230,0.07)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,215,255,0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    var ratio = liquidRatio == null ? 0.62 : liquidRatio;
    if (ratio > 0.02) {
      var lh = (h - 16) * ratio;
      ctx.fillStyle = liquidColor || 'rgba(80,160,220,0.32)';
      roundRectPath(x + 7, y + h - 8 - lh, w - 14, lh, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,225,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 7, y + h - 8 - lh);
      ctx.lineTo(x + w - 7, y + h - 8 - lh);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 锥形瓶（梯形轮廓） */
  function drawConicalFlask(x, y, w, h, liquidRatio, liquidColor) {
    // x,y = 瓶口中心坐标；h = 瓶身主体高度
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - w * 0.16, y);
    ctx.lineTo(x - w * 0.16, y + h * 0.16);
    ctx.lineTo(x - w * 0.5, y + h);
    ctx.lineTo(x + w * 0.5, y + h);
    ctx.lineTo(x + w * 0.16, y + h * 0.16);
    ctx.lineTo(x + w * 0.16, y);
    ctx.closePath();
    var glass = ctx.createLinearGradient(x - w / 2, y, x + w / 2, y + h);
    glass.addColorStop(0, 'rgba(150,190,230,0.17)');
    glass.addColorStop(1, 'rgba(150,190,230,0.07)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,215,255,0.55)';
    ctx.lineWidth = 2.8;
    ctx.stroke();
    var ratio = liquidRatio == null ? 0.55 : liquidRatio;
    if (ratio > 0.02) {
      var lh = (h - h * 0.2) * ratio;
      ctx.beginPath();
      var yTop = y + h - lh;
      var spread = 0.5 - 0.34 * (lh / h);
      ctx.moveTo(x - w * spread, yTop);
      ctx.lineTo(x - w * 0.5, y + h - 4);
      ctx.lineTo(x + w * 0.5, y + h - 4);
      ctx.lineTo(x + w * spread, yTop);
      ctx.closePath();
      ctx.fillStyle = liquidColor || 'rgba(80,160,220,0.34)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,225,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - w * spread, yTop);
      ctx.lineTo(x + w * spread, yTop);
      ctx.stroke();
    }
    // 瓶口翻边
    ctx.fillStyle = 'rgba(190,220,255,0.35)';
    roundRectPath(x - w * 0.22, y - 8, w * 0.44, 10, 5);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 耀眼白光 / 星芒爆发 */
  function drawStarburst(x, y, radius, alpha, time, color) {
    if (alpha <= 0.01) return;
    ctx.save();
    var col = color || '#fffbe6';
    var g = ctx.createRadialGradient(x, y, 2, x, y, radius);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.18, col);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    // 放射线
    var rays = 12;
    ctx.lineCap = 'round';
    for (var i = 0; i < rays; i++) {
      var ang = (i / rays) * Math.PI * 2 + time * 0.25;
      var r0 = radius * 0.16;
      var r1 = radius * (0.72 + 0.28 * Math.abs(Math.sin(time * 2.2 + i * 1.7)));
      ctx.globalAlpha = alpha * 0.75;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
      ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 坩埚钳（两根细臂 + 夹头），夹点在 (x, y) */
  function drawTongs(x, y, angle, length) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = '#8fa3c8';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(-length, -16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(-length, 16); ctx.stroke();
    // 夹头
    ctx.fillStyle = '#b7c6de';
    roundRectPath(-4, -9, 18, 18, 5);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 红热木炭块 */
  function drawCharcoal(x, y, glowK, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#20262e';
    roundRectPath(-16, -11, 32, 22, 8);
    ctx.fill();
    ctx.strokeStyle = '#3a4656';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (glowK > 0.01) {
      var g = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
      g.addColorStop(0, '#fff7d9');
      g.addColorStop(0.3, '#ffb74d');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.globalAlpha = 0.35 + glowK * 0.65;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 34 + Math.sin(time * 5) * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffca7a';
      roundRectPath(-10, -6, 20, 12, 5);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 镁条（银白色亮条） */
  function drawMgRibbon(x, y, angle, length, glowK, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    var g = ctx.createLinearGradient(0, -5, 0, 5);
    g.addColorStop(0, '#f4f7fa');
    g.addColorStop(0.5, '#cfd8dc');
    g.addColorStop(1, '#9aa7b0');
    ctx.fillStyle = g;
    roundRectPath(-length / 2, -5, length, 10, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (glowK > 0.01) {
      var tipG = ctx.createRadialGradient(length / 2, 0, 1, length / 2, 0, 26);
      tipG.addColorStop(0, '#ffffff');
      tipG.addColorStop(0.4, '#ffe9a8');
      tipG.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.globalAlpha = glowK;
      ctx.fillStyle = tipG;
      ctx.beginPath();
      ctx.arc(length / 2, 0, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 粉末下落 / 堆积 */
  function drawPowderFall(x, yTop, spread, count, k, time, color) {
    if (k <= 0.01) return;
    ctx.save();
    for (var i = 0; i < count; i++) {
      var phase = (k * 1.3 + seeded(i * 3.3) * 0.6) % 1;
      var px = x + (seeded(i * 5.1) - 0.5) * spread;
      var py = yTop + phase * 130;
      var alpha = (1 - phase * 0.55) * Math.min(1, k * 1.5);
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = color || '#3a3f46';
      var r = 2.2 + seeded(i * 7.7) * 2.6;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 带火星 / 燃烧的木条 */
  function drawSplint(x, y, angle, litK, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    var g = ctx.createLinearGradient(0, -4, 0, 4);
    g.addColorStop(0, '#c8a165');
    g.addColorStop(1, '#8a6b3f');
    ctx.fillStyle = g;
    roundRectPath(-6, -4, 120, 8, 4);
    ctx.fill();
    if (litK > 0.01) {
      var eg = ctx.createRadialGradient(0, 0, 1, 0, 0, 30);
      eg.addColorStop(0, '#fff3c4');
      eg.addColorStop(0.35, '#ff8a65');
      eg.addColorStop(1, 'rgba(255,110,60,0)');
      ctx.globalAlpha = 0.35 + litK * 0.65;
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(0, 0, 30 + Math.sin(time * 6) * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(0, 0, 5 + litK * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 澄清石灰水（cloudiness 0=澄清 → 1=乳白浑浊） */
  function drawLimewater(x, y, w, h, cloudiness) {
    drawBeaker(x, y, w, h, 0.7, 'rgba(120,190,235,0.16)');
    if (cloudiness > 0.02) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.85, cloudiness);
      ctx.fillStyle = 'rgba(238,240,235,0.92)';
      roundRectPath(x + 7, y + h * 0.34, w - 14, h * 0.6, 7);
      ctx.fill();
      // 乳白色絮状感
      for (var i = 0; i < 10; i++) {
        ctx.globalAlpha = cloudiness * 0.35;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x + 14 + seeded(i * 2.7) * (w - 28),
          y + h * 0.38 + seeded(i * 4.3) * h * 0.5,
          3 + seeded(i * 6.1) * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    drawText('澄清石灰水', x + w / 2, y + h + 18, 12, '#9fd8ff', 'center', 0.9);
    if (cloudiness > 0.55) {
      drawText('变浑浊（CO₂）', x + w / 2, y + h + 38, 12, '#ffd54f', 'center', 0.95);
    }
    ctx.globalAlpha = 1;
  }

  /** 导气管（圆角折线） */
  function drawDeliveryTube(x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(190,220,255,0.6)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1, (y1 + y2) / 2 - 26);
    ctx.quadraticCurveTo(x1, y2 - 26, x1 + 26, y2 - 26);
    ctx.lineTo(x2 - 18, y2 - 26);
    ctx.quadraticCurveTo(x2, y2 - 26, x2, y2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,240,255,0.35)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 大理石碎块 */
  function drawChip(x, y, r, seed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(seeded(seed) * Math.PI);
    var g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#f2efe8');
    g.addColorStop(1, '#c9c2b4');
    ctx.fillStyle = g;
    roundRectPath(-r, -r * 0.72, r * 2, r * 1.44, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,110,95,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ---------------- L1 新增场景：碳燃烧 / 镁燃烧 / 双氧水 / 大理石盐酸 ---------------- */

  /** 碳在氧气中充分燃烧：木炭白光 + 澄清石灰水变浑浊 */
  function drawMacroCarbonBurn(m, t, time) {
    var baseY = viewH * 0.80;
    drawBench(baseY);

    var cx = viewW * 0.38;
    var jarW = 190, jarH = 240;
    var jarX = cx - jarW / 2, jarY = baseY - jarH - 16;

    // 集气瓶
    roundRectPath(jarX, jarY, jarW, jarH, 24);
    var glass = ctx.createLinearGradient(jarX, jarY, jarX + jarW, jarY + jarH);
    glass.addColorStop(0, 'rgba(150,190,230,0.18)');
    glass.addColorStop(0.5, 'rgba(120,170,220,0.10)');
    glass.addColorStop(1, 'rgba(150,190,230,0.20)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,215,255,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 氧气（淡蓝）
    ctx.globalAlpha = 0.12 + 0.06 * (1 - windowT(t, 0.3, 0.8));
    ctx.fillStyle = '#9fd8ff';
    roundRectPath(jarX + 12, jarY + 14, jarW - 24, jarH - 28, 18);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 坩埚钳 + 木炭（钳子从右上伸入瓶中央）
    var coalX = cx, coalY = jarY + jarH * 0.48;
    drawTongs(coalX + 20, coalY - 6, -0.5, 120);
    var glowK = windowT(t, 0.22, 0.38) * (1 - windowT(t, 0.78, 0.95));
    drawCharcoal(coalX, coalY, glowK, time);

    // 耀眼白光（碳在氧气中：发出白光）
    var burst = windowT(t, 0.28, 0.38) * (1 - windowT(t, 0.58, 0.74));
    if (burst > 0.01) {
      drawStarburst(coalX, coalY, 150 + 26 * Math.sin(time * 4), burst * 0.95, time, '#fff6da');
    }

    // 热浪
    var heat = windowT(t, 0.35, 0.55) * (1 - windowT(t, 0.85, 1.0));
    if (heat > 0.01) {
      ctx.save();
      ctx.globalAlpha = heat * 0.5;
      ctx.strokeStyle = '#ffd9a0';
      ctx.lineWidth = 2;
      for (var k = 0; k < 3; k++) {
        ctx.beginPath();
        for (var px = 0; px <= 30; px++) {
          var xx = cx - 110 + px * 7;
          var yy = jarY - 22 - k * 15 + Math.sin(px * 0.55 + time * 3 + k) * 5;
          if (px === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 温度计
    drawThermometer(viewW * 0.66, viewH * 0.22, viewH * 0.5, windowT(t, 0.25, 0.85));

    // 澄清石灰水（检验 CO₂）
    var cloud = windowT(t, 0.72, 0.94);
    drawLimewater(viewW * 0.82, baseY - 150, 110, 120, cloud);

    drawPill(cx, jarY - 32, '条件：' + (m.conditions || '点燃'), '#ffb74d', 0.95);
    drawPill(cx, baseY + 26, m.vesselLabel || '木炭（碳）在氧气中', '#90caf9', 0.9);
  }

  /** 镁条在空气中燃烧：耀眼白光 + 白色固体 */
  function drawMacroMgBurn(m, t, time) {
    var baseY = viewH * 0.80;
    drawBench(baseY);

    // 酒精灯
    var lampX = viewW * 0.30, lampY = baseY;
    ctx.fillStyle = '#2f4a63';
    roundRectPath(lampX - 34, lampY - 74, 68, 74, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,215,255,0.5)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#42627f';
    roundRectPath(lampX - 12, lampY - 96, 24, 26, 7);
    ctx.fill();
    // 灯焰
    var flameK = windowT(t, 0.10, 0.22) * (1 - windowT(t, 0.88, 1.0)) + 0.25;
    drawFlame(lampX, lampY - 112, 0.72 + 0.06 * Math.sin(time * 6), Math.min(1, flameK));

    // 镁条 + 坩埚钳（伸向灯焰上方）
    var ribbonX = lampX + 30, ribbonY = lampY - 138;
    drawTongs(ribbonX + 128, ribbonY - 26, -0.32, 120);
    var glowK = windowT(t, 0.18, 0.32) * (1 - windowT(t, 0.72, 0.9));
    drawMgRibbon(ribbonX, ribbonY, -0.18, 110, glowK, time);

    // 耀眼白光（比碳更刺眼的星芒）
    var burst = windowT(t, 0.28, 0.38) * (1 - windowT(t, 0.58, 0.72));
    if (burst > 0.01) {
      drawStarburst(ribbonX + 46, ribbonY - 10, 190 + 30 * Math.sin(time * 5), burst, time, '#ffffff');
      drawText('耀眼白光 · 不能直视！', ribbonX + 46, ribbonY - 128, 14, '#fff3c4', 'center', burst);
    }

    // 白色固体粉末落到表面皿
    var dishX = viewW * 0.62, dishY = baseY - 16;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(190,220,250,0.22)';
    ctx.beginPath();
    ctx.ellipse(dishX, dishY, 86, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(185,215,255,0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
    var powderK = windowT(t, 0.52, 0.86);
    drawPowderFall(ribbonX + 46, ribbonY + 8, 60, 16, powderK, time, '#f5f5f0');
    if (powderK > 0.05) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, powderK) * 0.95;
      ctx.fillStyle = '#f2f2ec';
      ctx.beginPath();
      ctx.ellipse(dishX, dishY - 6, 46 * powderK, 10 * powderK + 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 温度计
    drawThermometer(viewW * 0.86, viewH * 0.24, viewH * 0.48, windowT(t, 0.22, 0.82));

    drawPill(lampX, baseY + 26, m.vesselLabel || '银白色镁条', '#b0bec5', 0.9);
    drawPill(ribbonX + 46, jarSafeY(ribbonY - 168), '条件：' + (m.conditions || '点燃'), '#ffe082', 0.95);
    drawPill(dishX, baseY + 26, m.productLabel || '白色固体 MgO', '#e0e0e0', 0.8 + powderK * 0.2);
  }

  function jarSafeY(y) { return y < 30 ? 34 : y; }

  /** 过氧化氢催化分解：MnO₂ 催化 + 气泡 + 带火星木条复燃 */
  function drawMacroH2O2(m, t, time) {
    var baseY = viewH * 0.82;
    drawBench(baseY);

    var cx = viewW * 0.42, flaskW = 240, flaskH = 210;
    var flaskTop = baseY - flaskH - 30;

    // 锥形瓶
    drawConicalFlask(cx, flaskTop, flaskW, flaskH, 0.62, 'rgba(120,190,235,0.30)');

    // 二氧化锰（黑色粉末）落入
    var powderK = windowT(t, 0.16, 0.30);
    drawPowderFall(cx, flaskTop - 30, 70, 14, powderK, time, '#2e2e34');

    // 瓶内气泡
    var bubblePower = windowT(t, 0.26, 0.55);
    if (bubblePower > 0.01) {
      drawBubbles(cx - 40, flaskTop + flaskH * 0.34, baseY - 30, bubblePower * 1.8, time, 3);
      drawBubbles(cx + 36, flaskTop + flaskH * 0.38, baseY - 26, bubblePower * 1.5, time, 5);
    }

    // 瓶口向上逸出的气体（O₂）
    var gasK = windowT(t, 0.42, 0.7);
    if (gasK > 0.02) {
      ctx.save();
      ctx.globalAlpha = gasK * 0.32;
      var gg = ctx.createRadialGradient(cx, flaskTop - 12, 4, cx, flaskTop - 12, 120);
      gg.addColorStop(0, '#b7e9ff');
      gg.addColorStop(1, 'rgba(120,190,240,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(cx, flaskTop - 12, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 带火星木条（在瓶口复燃）
    var splintX = cx + 120, splintY = flaskTop - 24;
    var litK = windowT(t, 0.50, 0.60) * (1 - windowT(t, 0.88, 1.0));
    drawSplint(splintX, splintY, -0.35, litK, time);
    if (litK > 0.01) {
      drawStarburst(splintX + 4, splintY - 8, 70, litK * 0.8, time, '#ffe9a8');
      drawText('带火星木条复燃（O₂！）', splintX + 10, splintY - 64, 13, '#ffe082', 'center', litK);
    }

    // 催化剂标注
    drawPill(cx - 130, flaskTop + flaskH * 0.42, 'MnO₂ 催化剂（只帮忙、不消耗）', '#b39ddb', 0.92);

    drawPill(cx, baseY + 26, m.vesselLabel || '过氧化氢溶液（双氧水）', '#90caf9', 0.9);
    drawPill(cx, flaskTop - 74, '条件：' + (m.conditions || 'MnO₂ 催化'), '#ffe082', 0.95);
  }

  /** 大理石与稀盐酸制 CO₂：冒气泡 + 石灰水变浑浊 */
  function drawMacroMarbleAcid(m, t, time) {
    var baseY = viewH * 0.82;
    drawBench(baseY);

    // 左：锥形瓶 + 大理石 + 稀盐酸
    var cx = viewW * 0.30, flaskW = 230, flaskH = 200;
    var flaskTop = baseY - flaskH - 26;
    drawConicalFlask(cx, flaskTop, flaskW, flaskH, 0.55, 'rgba(120,190,235,0.26)');

    // 大理石碎块（白色）
    var chipK = 1 - windowT(t, 0.30, 0.85) * 0.55;
    for (var i = 0; i < 5; i++) {
      var chX = cx - 52 + i * 26 + (seeded(i * 3.7) - 0.5) * 12;
      var chY = baseY - 22 - seeded(i * 5.1) * 14;
      drawChip(chX, chY, 13 * (0.65 + chipK * 0.35), i);
    }

    // 气泡
    var bubblePower = windowT(t, 0.20, 0.5);
    if (bubblePower > 0.01) {
      drawBubbles(cx - 30, flaskTop + flaskH * 0.32, baseY - 44, bubblePower * 1.7, time, 2);
      drawBubbles(cx + 30, flaskTop + flaskH * 0.36, baseY - 40, bubblePower * 1.4, time, 6);
    }

    // 导管 → 右侧石灰水
    var beakerX = viewW * 0.72, beakerY = baseY - 150;
    drawDeliveryTube(cx + 30, flaskTop + 6, beakerX + 40, beakerY + 34);

    // 石灰水变浑浊
    var cloud = windowT(t, 0.58, 0.92);
    drawLimewater(beakerX, beakerY, 130, 140, cloud);

    drawPill(cx, flaskTop - 60, '条件：' + (m.conditions || '常温 · 不加热'), '#ffe082', 0.95);
    drawPill(cx, baseY + 26, m.vesselLabel || '大理石 + 稀盐酸', '#90caf9', 0.9);
  }

  /* ---------------- L1 新增场景（S3 · 金属与氧化还原）：铁丝燃烧 / 铁+盐酸 / CO还原氧化铁 / 铁+硫酸铜 ---------------- */

  /** 螺旋状铁丝（弹簧圈投影：竖直正弦带） */
  function drawSpiralWire(x, yTop, yBottom, turns, glowK, time) {
    ctx.save();
    ctx.lineCap = 'round';
    var segs = turns * 14;
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (var i = 0; i <= segs; i++) {
        var k = i / segs;
        var yy = yTop + (yBottom - yTop) * k;
        var xx = x + Math.sin(k * turns * Math.PI * 2) * 16;
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      if (pass === 0) {
        ctx.strokeStyle = glowK > 0.01 ? 'rgba(255,170,80,' + (0.35 + glowK * 0.5) + ')' : 'rgba(120,140,165,0.35)';
        ctx.lineWidth = 9;
      } else {
        var wg = ctx.createLinearGradient(x - 16, yTop, x + 16, yBottom);
        wg.addColorStop(0, glowK > 0.3 ? '#ffd9a0' : '#aeb9c4');
        wg.addColorStop(0.5, glowK > 0.3 ? '#ffca7a' : '#78909c');
        wg.addColorStop(1, glowK > 0.3 ? '#ffb74d' : '#5c7482');
        ctx.strokeStyle = wg;
        ctx.lineWidth = 5;
      }
      ctx.stroke();
    }
    // 燃烧红热头（沿铁丝上下游走）
    if (glowK > 0.01) {
      var headK = 0.5 + 0.45 * Math.sin(time * 2.2);
      var hy = yTop + (yBottom - yTop) * headK;
      var hx = x + Math.sin(headK * turns * Math.PI * 2) * 16;
      var hg = ctx.createRadialGradient(hx, hy, 2, hx, hy, 30);
      hg.addColorStop(0, '#fff3c4');
      hg.addColorStop(0.35, '#ff9d4d');
      hg.addColorStop(1, 'rgba(255,120,50,0)');
      ctx.globalAlpha = glowK;
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(hx, hy, 30, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 火星四射（从点向四周飞溅的细亮线） */
  function drawSparks(x, y, strength, time) {
    if (strength <= 0.01) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (var i = 0; i < 18; i++) {
      var ang = seeded(i * 1.31) * Math.PI * 2 + time * 0.6;
      var fly = (seeded(i * 2.17) + time * (0.55 + seeded(i * 3.7) * 0.8)) % 1;
      var r0 = 14 + fly * 88;
      var len = 7 + (1 - fly) * 16;
      var alpha = (1 - fly) * strength;
      if (alpha <= 0.02) continue;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = i % 3 === 0 ? '#fff3c4' : '#ffb74d';
      ctx.lineWidth = i % 3 === 0 ? 2.4 : 1.6;
      var sx = x + Math.cos(ang) * r0, sy = y + Math.sin(ang) * r0 * 0.9;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len + fly * 6);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 铁钉（竖直：钉帽 + 钉身 + 钉尖） */
  function drawNail(x, yTop, len, copperK, glowK) {
    ctx.save();
    var w = 13;
    // 钉帽
    ctx.fillStyle = '#9fb0bd';
    roundRectPath(x - 15, yTop - 10, 30, 14, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,235,250,0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 钉身（渐变钢灰）
    var g = ctx.createLinearGradient(x - w / 2, yTop, x + w / 2, yTop + len);
    g.addColorStop(0, '#b8c4ce');
    g.addColorStop(0.5, '#78909c');
    g.addColorStop(1, '#546a78');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, yTop);
    ctx.lineTo(x + w / 2, yTop);
    ctx.lineTo(x + w / 2, yTop + len - 16);
    ctx.lineTo(x, yTop + len);
    ctx.lineTo(x - w / 2, yTop + len - 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,235,250,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 铜镀层（紫红色，自下而上生长）
    if (copperK > 0.02) {
      var ch = (len - 10) * Math.min(1, copperK);
      var cg = ctx.createLinearGradient(x - w / 2, yTop + len, x + w / 2, yTop + len - ch);
      cg.addColorStop(0, '#a3543a');
      cg.addColorStop(0.5, '#c2704e');
      cg.addColorStop(1, '#e8a58a');
      ctx.globalAlpha = Math.min(1, copperK * 1.2);
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(x - w / 2 - 3, yTop + len);
      ctx.lineTo(x + w / 2 + 3, yTop + len);
      ctx.lineTo(x + w / 2 + 3, yTop + len - ch);
      ctx.lineTo(x, yTop + len - Math.max(0, ch - 6));
      ctx.lineTo(x - w / 2 - 3, yTop + len - ch);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (glowK > 0.01) {
      var gg = ctx.createRadialGradient(x, yTop + len * 0.75, 3, x, yTop + len * 0.75, 44);
      gg.addColorStop(0, 'rgba(255,220,160,0.55)');
      gg.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.globalAlpha = glowK;
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, yTop + len * 0.75, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 铁丝在氧气中剧烈燃烧：火星四射 + 黑色固体 + 瓶底铺细沙 */
  function drawMacroFeBurn(m, t, time) {
    var baseY = viewH * 0.80;
    drawBench(baseY);

    var cx = viewW * 0.40;
    var jarW = 200, jarH = 250;
    var jarX = cx - jarW / 2, jarY = baseY - jarH - 14;

    // 集气瓶
    roundRectPath(jarX, jarY, jarW, jarH, 24);
    var glass = ctx.createLinearGradient(jarX, jarY, jarX + jarW, jarY + jarH);
    glass.addColorStop(0, 'rgba(150,190,230,0.18)');
    glass.addColorStop(0.5, 'rgba(120,170,220,0.10)');
    glass.addColorStop(1, 'rgba(150,190,230,0.20)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,215,255,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 氧气（淡蓝）
    ctx.globalAlpha = 0.13 + 0.05 * (1 - windowT(t, 0.3, 0.8));
    ctx.fillStyle = '#9fd8ff';
    roundRectPath(jarX + 12, jarY + 12, jarW - 24, jarH - 26, 18);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 瓶底铺水 / 细沙（防炸裂）
    ctx.fillStyle = 'rgba(210,190,150,0.55)';
    roundRectPath(jarX + 12, jarY + jarH - 34, jarW - 24, 22, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,190,235,0.30)';
    roundRectPath(jarX + 12, jarY + jarH - 38, jarW - 24, 12, 6);
    ctx.fill();
    drawText('瓶底铺水 / 细沙（防炸裂）', cx, jarY + jarH - 52, 11, '#ffd9a0', 'center', 0.9);

    // 螺旋状铁丝 + 坩埚钳
    var wireX = cx, wireTop = jarY + 42, wireBottom = jarY + jarH - 66;
    drawTongs(wireX + 22, jarY + 36, -0.28, 108);
    var glowK = windowT(t, 0.20, 0.34) * (1 - windowT(t, 0.78, 0.94));
    drawSpiralWire(wireX, wireTop, wireBottom, 5, glowK, time);

    // 火星四射 + 火光
    var burst = windowT(t, 0.24, 0.36) * (1 - windowT(t, 0.62, 0.78));
    if (burst > 0.01) {
      drawStarburst(wireX, wireTop + (wireBottom - wireTop) * 0.5, 130 + 22 * Math.sin(time * 5), burst * 0.85, time, '#ffe9a8');
      drawSparks(wireX, wireTop + (wireBottom - wireTop) * 0.5, burst, time);
      drawText('火星四射 · 剧烈燃烧', wireX, jarY - 34, 13, '#ffd54f', 'center', burst);
    }

    // 黑色固体（Fe₃O₄）落入细沙上
    var blackK = windowT(t, 0.52, 0.88);
    if (blackK > 0.03) {
      drawPowderFall(wireX, wireBottom - 8, 70, 12, blackK, time, '#171b21');
      ctx.save();
      ctx.globalAlpha = Math.min(0.95, blackK);
      ctx.fillStyle = '#1b2027';
      ctx.beginPath();
      ctx.ellipse(wireX, jarY + jarH - 44, 46 * blackK + 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawPill(cx, jarY - 32, '条件：' + (m.conditions || '点燃'), '#ffb74d', 0.95);
    drawPill(cx, baseY + 26, m.vesselLabel || '螺旋状铁丝（纯氧）', '#b0bec5', 0.9);
    if (blackK > 0.55) {
      drawPill(viewW * 0.80, baseY - 40, m.productLabel || '黑色固体 Fe₃O₄', '#90a4ae', 0.9);
    }
  }

  /** 铁与稀盐酸：缓慢气泡 + 溶液变浅绿色 */
  function drawMacroFeAcid(m, t, time) {
    var baseY = viewH * 0.82;
    drawBench(baseY);

    var cx = viewW * 0.36, beakerW = 230, beakerH = 220;
    var beakerY = baseY - beakerH - 18;

    // 溶液颜色：无色 → 浅绿色（Fe²⁺）
    var greenK = windowT(t, 0.34, 0.86);
    var liq = 'rgba(' + Math.round(120 - 20 * greenK) + ',' + Math.round(190 + 20 * greenK) +
      ',' + Math.round(235 - 80 * greenK) + ',' + (0.24 + greenK * 0.18) + ')';
    drawBeaker(cx, beakerY, beakerW, beakerH, 0.62, liq);

    // 铁钉（斜插在溶液里）
    drawNail(cx - 18, beakerY - 6, 175, 0, windowT(t, 0.2, 0.5) * 0.35);

    // 铁钉表面缓慢气泡
    var bubblePower = windowT(t, 0.18, 0.52) * 0.55;
    if (bubblePower > 0.01) {
      drawBubbles(cx - 34, beakerY + 82, beakerY + beakerH - 30, bubblePower, time, 4);
      drawBubbles(cx - 4, beakerY + 96, beakerY + beakerH - 26, bubblePower * 0.8, time, 7);
    }

    // 氢气气泡升出液面
    var gasK = windowT(t, 0.30, 0.7);
    if (gasK > 0.02) {
      drawBubbles(cx - 12, beakerY - 46, beakerY + 8, gasK * 0.5, time, 9);
    }

    // 浅绿色提示
    if (greenK > 0.25) {
      drawText('溶液由无色 → 浅绿色（Fe²⁺ 特征色）', cx, beakerY + beakerH + 30, 12, '#b9e4a8', 'center', greenK);
    }

    drawPill(cx, beakerY - 52, '条件：' + (m.conditions || '常温 · 不加热'), '#ffe082', 0.95);
    drawPill(cx, baseY + 26, m.vesselLabel || '铁钉 + 稀盐酸', '#90caf9', 0.9);
    drawPill(viewW * 0.80, baseY - 120, m.productLabel || 'FeCl₂ 浅绿色 + H₂↑', '#b9e4a8', 0.85 + greenK * 0.15);
  }

  /** 一氧化碳高温还原氧化铁：红棕 → 黑色铁粉 + 石灰水 + 尾气点燃 */
  function drawMacroCoReduction(m, t, time) {
    var baseY = viewH * 0.82;
    drawBench(baseY);

    // 硬质玻璃管（横放）
    var tubeY = baseY - 150, tubeX = viewW * 0.10, tubeW = viewW * 0.48, tubeH = 54;
    ctx.save();
    roundRectPath(tubeX, tubeY, tubeW, tubeH, tubeH / 2);
    var glass = ctx.createLinearGradient(tubeX, tubeY, tubeX, tubeY + tubeH);
    glass.addColorStop(0, 'rgba(150,190,230,0.22)');
    glass.addColorStop(0.5, 'rgba(120,170,220,0.10)');
    glass.addColorStop(1, 'rgba(150,190,230,0.22)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,215,255,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 管内粉末：Fe₂O₃ 红棕色 → Fe 黑色
    var blackK = windowT(t, 0.36, 0.86);
    for (var i = 0; i < 14; i++) {
      var px = tubeX + 42 + i * (tubeW - 100) / 13;
      var turn = windowT(t, 0.30 + i * 0.028, 0.46 + i * 0.028);
      var pr = 7 + seeded(i * 2.2) * 6;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = turn > 0.5 ? '#1c2126' : '#9c4a2e';
      ctx.beginPath();
      ctx.ellipse(px, tubeY + tubeH * 0.62, pr * 1.5, pr, 0, 0, Math.PI * 2);
      ctx.fill();
      if (turn > 0.1 && turn < 0.9) {
        ctx.globalAlpha = 0.5 * Math.sin(turn * Math.PI);
        ctx.fillStyle = '#ff9d5c';
        ctx.beginPath();
        ctx.ellipse(px, tubeY + tubeH * 0.62, pr, pr * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    drawText('红棕色 Fe₂O₃', tubeX + 70, tubeY - 16, 11, '#d98a63', 'center', 0.9 - blackK * 0.7);
    drawText('黑色铁粉 Fe（能被磁铁吸引）', tubeX + tubeW * 0.62, tubeY - 16, 11, '#b0bec5', 'center', blackK);

    // 酒精喷灯 / 高温火焰
    var lampX = tubeX + tubeW * 0.42, lampY = tubeY + tubeH + 20;
    var flameK = windowT(t, 0.12, 0.26) * (1 - windowT(t, 0.88, 1.0)) + 0.2;
    drawFlame(lampX, lampY + 12, 1.15 + 0.08 * Math.sin(time * 6), Math.min(1, flameK));
    drawText('高温', lampX, lampY + 46, 12, '#ffab6b', 'center', 0.9);

    // CO 进气（左侧箭头）
    var coK = windowT(t, 0.08, 0.30) * (1 - windowT(t, 0.82, 0.98));
    ctx.save();
    ctx.globalAlpha = 0.35 + coK * 0.55;
    ctx.strokeStyle = '#b7e9ff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(tubeX - 64, tubeY + tubeH / 2);
    ctx.lineTo(tubeX + 2, tubeY + tubeH / 2);
    ctx.stroke();
    ctx.fillStyle = '#b7e9ff';
    ctx.beginPath();
    ctx.moveTo(tubeX + 2, tubeY + tubeH / 2);
    ctx.lineTo(tubeX - 14, tubeY + tubeH / 2 - 10);
    ctx.lineTo(tubeX - 14, tubeY + tubeH / 2 + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    drawText('CO 通入', tubeX - 44, tubeY + tubeH / 2 - 22, 11, '#9fd8ff', 'center', 0.9);

    // 导管 → 澄清石灰水
    var beakerX = viewW * 0.70, beakerY = baseY - 156;
    drawDeliveryTube(tubeX + tubeW - 8, tubeY + tubeH / 2, beakerX + 44, beakerY + 30);
    var cloud = windowT(t, 0.52, 0.92);
    drawLimewater(beakerX, beakerY, 130, 140, cloud);

    // 尾气燃烧处理（防 CO 中毒）
    var tailK = windowT(t, 0.58, 0.80);
    var tailX = viewW * 0.92, tailY = beakerY + 26;
    ctx.save();
    ctx.globalAlpha = 0.30 + tailK * 0.5;
    ctx.strokeStyle = '#b7e9ff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(beakerX + 130, tailY);
    ctx.lineTo(tailX - 8, tailY);
    ctx.stroke();
    ctx.restore();
    if (tailK > 0.02) {
      drawFlame(tailX, tailY - 8, 0.5 + 0.05 * Math.sin(time * 7), tailK);
      drawText('尾气点燃（防 CO 中毒）', tailX - 18, tailY + 52, 11, '#ffb74d', 'center', tailK);
    }

    drawPill(viewW * 0.30, tubeY - 52, '条件：' + (m.conditions || '高温'), '#ffe082', 0.95);
    drawPill(viewW * 0.30, baseY + 26, m.vesselLabel || 'CO + Fe₂O₃（高炉炼铁）', '#90caf9', 0.9);
    if (cloud > 0.55) {
      drawPill(beakerX + 65, beakerY - 30, m.productLabel || 'CO₂ 使石灰水变浑浊', '#ffd54f', 0.92);
    }
  }

  /** 铁钉与硫酸铜：紫红色铜析出 + 蓝色溶液变浅绿色 */
  function drawMacroFeCuso4(m, t, time) {
    var baseY = viewH * 0.82;
    drawBench(baseY);

    var cx = viewW * 0.38, beakerW = 240, beakerH = 225;
    var beakerY = baseY - beakerH - 16;

    // 溶液颜色：蓝色 Cu²⁺ → 浅绿色 Fe²⁺
    var greenK = windowT(t, 0.36, 0.88);
    var lr = Math.round(70 + 70 * greenK), lg = Math.round(130 + 60 * greenK), lb = Math.round(220 - 90 * greenK);
    drawBeaker(cx, beakerY, beakerW, beakerH, 0.64, 'rgba(' + lr + ',' + lg + ',' + lb + ',0.42)');

    // 铁钉 + 铜镀层（紫红色）
    var copperK = windowT(t, 0.30, 0.82);
    drawNail(cx - 10, beakerY - 4, 180, copperK, 0);

    // 标注颜色变化
    drawText('蓝色溶液（Cu²⁺）', cx, beakerY + beakerH + 28, 12, '#7fb3ff', 'center', 0.95 - greenK * 0.85);
    if (greenK > 0.2) {
      drawText('浅绿色溶液（Fe²⁺）', cx, beakerY + beakerH + 28, 12, '#b9e4a8', 'center', greenK);
    }
    if (copperK > 0.3) {
      drawText('铁钉表面附着紫红色铜', cx + 96, beakerY + 88, 12, '#e8a58a', 'center', copperK);
    }

    drawPill(cx, beakerY - 50, '条件：' + (m.conditions || '常温 · 不加热'), '#ffe082', 0.95);
    drawPill(cx, baseY + 26, m.vesselLabel || '铁钉 + 硫酸铜溶液', '#90caf9', 0.9);
    drawPill(viewW * 0.82, baseY - 120, m.productLabel || 'Cu（紫红色）+ FeSO₄', '#e8a58a', 0.82 + copperK * 0.18);
  }

  /* ---------------- L1 新增场景（S4 · 酸、碱、盐与离子反应）：中和滴定 / 蓝色沉淀 / 白色沉淀 / 碳酸钠剧烈产气 ---------------- */

  /** 胶头滴管（尖嘴朝下，squeezeK 表示捏胶头挤出液滴的程度），尖端在 (x, y) */
  function drawDropper(x, y, squeezeK, liquidColor) {
    ctx.save();
    // 胶头（被捏扁一点）
    var bg = ctx.createLinearGradient(x - 15, y - 100, x + 15, y - 60);
    bg.addColorStop(0, '#9e7d6c');
    bg.addColorStop(1, '#5d4037');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(x, y - 80 + squeezeK * 4, 15, 18 - squeezeK * 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 玻璃管
    var glass = ctx.createLinearGradient(x - 7, y - 66, x + 7, y - 8);
    glass.addColorStop(0, 'rgba(190,220,250,0.55)');
    glass.addColorStop(0.5, 'rgba(140,185,225,0.32)');
    glass.addColorStop(1, 'rgba(190,220,250,0.55)');
    ctx.fillStyle = glass;
    roundRectPath(x - 7, y - 66, 14, 56, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(185,215,255,0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 尖嘴
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 10);
    ctx.lineTo(x + 5, y - 10);
    ctx.lineTo(x + 1.6, y);
    ctx.lineTo(x - 1.6, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(190,220,250,0.65)';
    ctx.fill();
    // 管内液柱
    if (liquidColor) {
      ctx.fillStyle = liquidColor;
      roundRectPath(x - 4, y - 62 + squeezeK * 10, 8, 48 - squeezeK * 10, 3);
      ctx.fill();
    }
    // 尖端悬滴
    if (squeezeK > 0.15 && squeezeK < 0.92) {
      var dr = 4.2 + squeezeK * 2.2;
      ctx.beginPath();
      ctx.arc(x, y + dr * 0.8, dr, 0, Math.PI * 2);
      ctx.fillStyle = liquidColor || 'rgba(160,215,245,0.9)';
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 滴落的液滴（自上而下，与 drawBubbles 相反） */
  function drawDrip(x, yTop, yBottom, power, time, seedOffset, color) {
    if (power <= 0.01) return;
    var count = Math.min(9, Math.floor(2 + power * 8));
    for (var i = 0; i < count; i++) {
      var r0 = seeded(i * 3.7 + seedOffset * 11);
      var speed = 0.24 + r0 * 0.24;
      var phase = (time * speed + seeded(i * 5.3 + seedOffset)) % 1;
      var y = lerp(yTop, yBottom - 8, phase);
      var xj = x + (seeded(i * 9.1 + seedOffset * 3) - 0.5) * 10;
      var r = 3.2 + r0 * 2.4;
      var alpha = Math.sin(phase * Math.PI) * 0.9 * Math.min(1, power * 1.6);
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color || 'rgba(170,215,245,0.95)';
      // 上尖下圆的水滴形
      ctx.beginPath();
      ctx.moveTo(xj, y - r * 2.0);
      ctx.quadraticCurveTo(xj + r, y - r * 0.2, xj, y + r);
      ctx.quadraticCurveTo(xj - r, y - r * 0.2, xj, y - r * 2.0);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** 玻璃搅拌棒（斜插微摆） */
  function drawStirRod(x, yTop, yBottom, angle, time) {
    ctx.save();
    ctx.translate(x, (yTop + yBottom) / 2);
    ctx.rotate(angle + Math.sin(time * 1.6) * 0.035);
    var g = ctx.createLinearGradient(-7, 0, 7, 0);
    g.addColorStop(0, 'rgba(195,225,250,0.28)');
    g.addColorStop(0.5, 'rgba(230,245,255,0.55)');
    g.addColorStop(1, 'rgba(195,225,250,0.28)');
    ctx.fillStyle = g;
    roundRectPath(-6, yTop - (yTop + yBottom) / 2, 12, yBottom - yTop, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,230,255,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 沉淀层（底部堆积）+ 缓缓下沉的颗粒；flocculent=true 絮状，false 晶粒 */
  function drawPrecipitate(x, yBottom, w, k, color, flocculent, time) {
    if (k <= 0.02) return;
    ctx.save();
    // 堆积层
    var layerH = 12 + k * 26;
    ctx.globalAlpha = 0.55 + k * 0.42;
    ctx.fillStyle = color;
    roundRectPath(x - w / 2, yBottom - layerH, w, layerH, 9);
    ctx.fill();
    // 堆积面颗粒
    ctx.globalAlpha = 0.35 + k * 0.4;
    for (var i = 0; i < 14; i++) {
      var px = x - w / 2 + 10 + seeded(i * 3.3) * (w - 20);
      var py = yBottom - layerH - seeded(i * 5.1) * 9;
      var pr = (flocculent ? 5.5 : 3.2) + seeded(i * 7.7) * (flocculent ? 6 : 3);
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    // 下沉中的颗粒
    var fall = Math.min(1, k * 1.25);
    for (var j = 0; j < 12; j++) {
      var phase = (time * (0.10 + seeded(j * 2.9) * 0.12) + seeded(j * 4.1)) % 1;
      var fy = lerp(yBottom - layerH - 130, yBottom - layerH, phase * fall);
      var fx = x + (seeded(j * 6.3) - 0.5) * (w - 30);
      var alpha = (0.12 + 0.55 * phase) * fall;
      if (alpha <= 0.02) continue;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(fx, fy, (flocculent ? 4.5 : 2.6) + seeded(j * 8.3) * (flocculent ? 5 : 2.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 试管（竖直圆底），x 为中轴，yBottom 为管底 */
  function drawTestTube(x, yBottom, w, h, liquidRatio, liquidColor) {
    var r = w / 2;
    ctx.save();
    roundRectPath(x - r, yBottom - h, w, h, r);
    ctx.fillStyle = 'rgba(160,200,240,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(185,215,255,0.55)';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    if (liquidRatio > 0.02) {
      var lh = (h - 22) * liquidRatio;
      ctx.fillStyle = liquidColor || 'rgba(120,190,235,0.30)';
      roundRectPath(x - r + 5, yBottom - 12 - lh, w - 10, lh, (w - 10) / 2.4);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 微热温度计（25→35℃，中和放热专用；fill 0~1） */
  function drawMildThermometer(x, y, h, fill) {
    var w = 30;
    roundRectPath(x - w / 2, y, w, h, 14);
    ctx.fillStyle = 'rgba(220,235,255,0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,215,250,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 球部
    ctx.beginPath();
    ctx.arc(x, y + h + 14, 19, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6b6b';
    ctx.fill();
    // 水银柱
    var top = y + h - (h - 18) * fill;
    var hg = ctx.createLinearGradient(0, top, 0, y + h);
    hg.addColorStop(0, '#ff8a80');
    hg.addColorStop(1, '#ff5252');
    ctx.fillStyle = hg;
    roundRectPath(x - 8, top, 16, y + h - top + 8, 8);
    ctx.fill();
    // 刻度
    for (var i = 0; i <= 5; i++) {
      var yy = y + 16 + (h - 32) * (i / 5);
      ctx.fillStyle = 'rgba(220,235,255,0.55)';
      ctx.fillRect(x + 9, yy, 10, 2);
    }
    drawText('温度计 · 微热', x, y - 14, 12, '#ffd9a0', 'center');
    drawText(Math.round(25 + fill * 10) + '℃', x, y + h + 46, 14, '#ffb3b3', 'center');
    drawText('中和反应放热', x, y + h + 68, 11, '#ffb74d', 'center', 0.45 + fill * 0.55);
  }

  /** 氢氧化钠与盐酸中和：酚酞红 → 无色突变 + 温度计微热 */
  function drawMacroNaohHcl(m, t, time) {
    var baseY = viewH * 0.82;
    drawBench(baseY);

    var cx = viewW * 0.38, beakerW = 250, beakerH = 230;
    var beakerY = baseY - beakerH - 16;

    // 溶液：滴有酚酞的 NaOH（红色）→ 恰好中和后无色（终点突变窗）
    var clearK = windowT(t, 0.55, 0.63);
    var pr = Math.round(255 - 130 * clearK);
    var pg = Math.round(115 + 70 * clearK);
    var pb = Math.round(165 + 65 * clearK);
    drawBeaker(cx, beakerY, beakerW, beakerH, 0.62,
      'rgba(' + pr + ',' + pg + ',' + pb + ',' + (0.50 - clearK * 0.24) + ')');

    // 玻璃棒搅拌
    drawStirRod(cx + 18, beakerY - 6, beakerY + beakerH - 36, 0.16, time);

    // 胶头滴管逐滴加入稀盐酸
    var dripK = windowT(t, 0.16, 0.52) * (1 - windowT(t, 0.55, 0.68));
    drawDropper(cx + 72, beakerY - 4, dripK, 'rgba(150,210,240,0.8)');
    if (dripK > 0.02) {
      drawDrip(cx + 72, beakerY + 8, beakerY + 62, dripK, time, 3, 'rgba(165,215,245,0.9)');
    }

    // 颜色突变标注
    drawText('滴有酚酞的 NaOH 溶液（红色）', cx, beakerY + beakerH + 30, 12, '#ff9bb5', 'center', 0.95 - clearK * 0.9);
    if (clearK > 0.3) {
      drawText('红色突变为无色（恰好完全中和！）', cx, beakerY + beakerH + 30, 12, '#b7e9ff', 'center', clearK);
    }

    // 温度计（微热）
    drawMildThermometer(viewW * 0.82, viewH * 0.15, viewH * 0.42, windowT(t, 0.30, 0.80) * 0.55);

    drawPill(cx, beakerY - 52, '条件：' + (m.conditions || '常温 · 边滴边搅拌'), '#ffe082', 0.95);
    drawPill(cx, baseY + 26, m.vesselLabel || 'NaOH 溶液 + 稀盐酸', '#90caf9', 0.9);
    if (clearK > 0.55) {
      drawPill(viewW * 0.82, baseY - 30, m.productLabel || 'NaCl + H₂O（微热）', '#b7e9ff', 0.9);
    }
  }

  /** 硫酸铜与氢氧化钠：蓝色絮状沉淀 Cu(OH)₂ */
  function drawMacroNaohCuso4(m, t, time) {
    var baseY = viewH * 0.82;
    drawBench(baseY);

    var cx = viewW * 0.40, beakerW = 250, beakerH = 235;
    var beakerY = baseY - beakerH - 16;

    // 溶液：蓝色 Cu²⁺ → 蓝色褪去（Cu²⁺ 被 OH⁻ 沉淀掉）
    var fadeK = windowT(t, 0.32, 0.86);
    var br = Math.round(70 + 95 * fadeK), bg2 = Math.round(130 + 75 * fadeK), bb = Math.round(220 - 45 * fadeK);
    drawBeaker(cx, beakerY, beakerW, beakerH, 0.64,
      'rgba(' + br + ',' + bg2 + ',' + bb + ',' + (0.44 - fadeK * 0.16) + ')');

    // 胶头滴管滴加无色 NaOH 溶液
    var dripK = windowT(t, 0.14, 0.50) * (1 - windowT(t, 0.55, 0.68));
    drawDropper(cx + 72, beakerY - 4, dripK, 'rgba(210,235,250,0.75)');
    if (dripK > 0.02) {
      drawDrip(cx + 72, beakerY + 8, beakerY + 64, dripK, time, 5, 'rgba(215,238,250,0.85)');
    }

    // 蓝色絮状沉淀
    var pptK = windowT(t, 0.28, 0.80);
    drawPrecipitate(cx, beakerY + beakerH - 12, beakerW - 36, pptK, '#5c9fd6', true, time);

    // 标注
    drawText('蓝色溶液（Cu²⁺）', cx, beakerY + beakerH + 30, 12, '#7fb3ff', 'center', 0.95 - fadeK * 0.85);
    if (pptK > 0.25) {
      drawText('蓝色絮状沉淀 Cu(OH)₂↓', cx, beakerY + beakerH + 30, 12, '#8fc4f0', 'center', pptK);
    }
    if (fadeK > 0.5) {
      drawText('上层溶液蓝色褪去', cx + 24, beakerY + 38, 11, '#b7e9ff', 'center', fadeK);
    }

    drawPill(cx, beakerY - 52, '条件：' + (m.conditions || '常温 · 不加热'), '#ffe082', 0.95);
    drawPill(cx, baseY + 26, m.vesselLabel || 'CuSO₄ 溶液 + NaOH 溶液', '#90caf9', 0.9);
    if (pptK > 0.55) {
      drawPill(viewW * 0.83, baseY - 110, m.productLabel || '蓝色絮状沉淀 Cu(OH)₂↓', '#8fc4f0', 0.9);
    }
  }

  /** 氯化钡与硫酸钠：白色沉淀 BaSO₄（加稀硝酸不溶解） */
  function drawMacroBaCl2So4(m, t, time) {
    var baseY = viewH * 0.82;
    drawBench(baseY);

    // 左：混合烧杯（两种无色溶液 → 白色沉淀）
    var cx = viewW * 0.33, beakerW = 250, beakerH = 225;
    var beakerY = baseY - beakerH - 16;
    drawBeaker(cx, beakerY, beakerW, beakerH, 0.62, 'rgba(120,190,235,0.20)');

    // 滴加另一种无色溶液
    var dripK = windowT(t, 0.14, 0.48) * (1 - windowT(t, 0.52, 0.68));
    drawDropper(cx + 68, beakerY - 4, dripK, 'rgba(215,238,250,0.8)');
    if (dripK > 0.02) {
      drawDrip(cx + 68, beakerY + 8, beakerY + 62, dripK, time, 7, 'rgba(220,240,250,0.9)');
    }

    // 白色沉淀（瞬间产生、沉底）
    var pptK = windowT(t, 0.26, 0.66);
    drawPrecipitate(cx, beakerY + beakerH - 12, beakerW - 36, pptK, '#e8eef5', false, time);
    drawText('白色沉淀 BaSO₄↓（既不溶于水也不溶于酸）', cx, beakerY + beakerH + 30, 12, '#e8eef5', 'center', 0.35 + pptK * 0.65);

    // 右：稀硝酸检验（试管 + 滴管），沉淀不溶解
    var tubeX = viewW * 0.79, tubeY = baseY - 14;
    drawTestTube(tubeX, tubeY, 76, 195, 0.40, 'rgba(225,236,246,0.55)');
    var acidK = windowT(t, 0.62, 0.84);
    drawDropper(tubeX + 2, tubeY - 195 - 4, acidK, 'rgba(215,238,250,0.8)');
    if (acidK > 0.02 && acidK < 0.98) {
      drawDrip(tubeX + 2, tubeY - 192, tubeY - 130, acidK, time, 9, 'rgba(220,240,250,0.9)');
    }
    drawText('滴加稀硝酸', tubeX, tubeY - 232, 11, '#ffd9a0', 'center', 0.45 + acidK * 0.55);
    drawText('沉淀不溶解！', tubeX, tubeY + 34, 12, '#fff3c4', 'center', windowT(t, 0.72, 0.88));

    drawPill(cx, beakerY - 52, '条件：' + (m.conditions || '常温 · 两种无色溶液混合'), '#ffe082', 0.95);
    drawPill(cx, baseY + 26, m.vesselLabel || 'BaCl₂ 溶液 + Na₂SO₄ 溶液', '#90caf9', 0.9);
    if (pptK > 0.55) {
      drawPill(viewW * 0.33, beakerY - 88, m.productLabel || '白色沉淀 BaSO₄↓', '#e8eef5', 0.92);
    }
  }

  /** 碳酸钠与稀盐酸：瞬间剧烈冒泡（对比大理石平缓产气） */
  function drawMacroNa2co3Hcl(m, t, time) {
    var baseY = viewH * 0.82;
    drawBench(baseY);

    var cx = viewW * 0.34, beakerW = 250, beakerH = 235;
    var beakerY = baseY - beakerH - 16;

    // 碳酸钠溶液（无色，CO₃²⁻ 已自由游离）
    drawBeaker(cx, beakerY, beakerW, beakerH, 0.60, 'rgba(120,190,235,0.24)');
    drawText('Na₂CO₃ 溶液（纯碱 · CO₃²⁻ 已自由游离）', cx, beakerY + beakerH + 30, 11, '#9fd8ff', 'center', 0.92);

    // 迅速倒入稀盐酸（液流）
    var pourK = windowT(t, 0.10, 0.26);
    ctx.save();
    ctx.globalAlpha = 0.30 + pourK * 0.55;
    ctx.strokeStyle = 'rgba(180,220,250,0.85)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + 98, beakerY - 70);
    ctx.lineTo(cx + 52, beakerY + 24);
    ctx.stroke();
    ctx.restore();
    drawText('倒入稀盐酸', cx + 122, beakerY - 82, 11, '#b7e9ff', 'center', 0.45 + pourK * 0.55);

    // 剧烈气泡（功率远高于大理石的平缓产气）
    var bubblePower = windowT(t, 0.14, 0.30);
    if (bubblePower > 0.01) {
      drawBubbles(cx - 46, beakerY + 36, beakerY + beakerH - 32, bubblePower * 2.8, time, 2);
      drawBubbles(cx, beakerY + 28, beakerY + beakerH - 26, bubblePower * 3.2, time, 6);
      drawBubbles(cx + 46, beakerY + 36, beakerY + beakerH - 32, bubblePower * 2.6, time, 10);
      // 气泡冲出液面
      drawBubbles(cx - 12, beakerY - 54, beakerY + 6, bubblePower * 1.1, time, 14);
      drawBubbles(cx + 28, beakerY - 46, beakerY + 8, bubblePower * 0.9, time, 18);
    }

    // “剧烈！”爆闪
    var burst = windowT(t, 0.16, 0.26) * (1 - windowT(t, 0.42, 0.58));
    if (burst > 0.02) {
      drawStarburst(cx, beakerY + 62, 110 + 16 * Math.sin(time * 5), burst * 0.55, time, '#bfe8ff');
      drawText('瞬间剧烈冒泡！', cx, beakerY - 92, 14, '#7fd4ff', 'center', burst);
    }

    // 右侧对比卡：大理石 vs 纯碱
    var panelX = viewW * 0.78, panelY = viewH * 0.24;
    ctx.save();
    ctx.globalAlpha = 0.88;
    roundRectPath(panelX - 132, panelY - 44, 264, 178, 12);
    ctx.fillStyle = 'rgba(16,28,48,0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,212,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    drawText('对比实验室制 CO₂', panelX, panelY - 18, 13, '#ffd54f', 'center', 0.95);
    drawText('块状大理石：反应平缓、便于收集', panelX, panelY + 16, 12, '#b7e9ff', 'center', 0.9);
    drawText('纯碱粉末：反应太剧烈、难以收集', panelX, panelY + 48, 12, '#ff9b9b', 'center', 0.9);
    drawText('→ 所以实验室制 CO₂ 不用纯碱！', panelX, panelY + 88, 12, '#ffe082', 'center', 0.92);

    drawPill(cx, beakerY - 52, '条件：' + (m.conditions || '常温 · 不加热'), '#ffe082', 0.95);
    drawPill(cx, baseY + 26, m.vesselLabel || 'Na₂CO₃ + 稀盐酸', '#90caf9', 0.9);
  }

  // 场景注册表（卡带 macro.scene 选用）
  MACRO_SCENES.combustion = drawMacroCombustion;
  MACRO_SCENES.electrolysis = drawMacroElectrolysis;
  MACRO_SCENES.carbon_burn = drawMacroCarbonBurn;
  MACRO_SCENES.mg_burn = drawMacroMgBurn;
  MACRO_SCENES.h2o2 = drawMacroH2O2;
  MACRO_SCENES.marble_acid = drawMacroMarbleAcid;
  MACRO_SCENES.fe_burn = drawMacroFeBurn;
  MACRO_SCENES.fe_acid = drawMacroFeAcid;
  MACRO_SCENES.co_reduction = drawMacroCoReduction;
  MACRO_SCENES.fe_cuso4 = drawMacroFeCuso4;
  MACRO_SCENES.naoh_hcl = drawMacroNaohHcl;
  MACRO_SCENES.naoh_cuso4 = drawMacroNaohCuso4;
  MACRO_SCENES.bacl2_so4 = drawMacroBaCl2So4;
  MACRO_SCENES.na2co3_hcl = drawMacroNa2co3Hcl;

  /* ====================================================================== */
  /* 5. L2 分子动力学层                                                      */
  /* ====================================================================== */

  /** 原子在时间 t 的位置（start→mid→end 两段平滑插值）+ 热运动 */
  function atomPos(atom, t, time) {
    var x, y;
    if (t <= 0.5) {
      var k = smoothstep(invLerp(0, 0.5, t));
      x = lerp(atom.start[0], atom.mid[0], k);
      y = lerp(atom.start[1], atom.mid[1], k);
    } else {
      var k2 = smoothstep(invLerp(0.5, 1, t));
      x = lerp(atom.mid[0], atom.end[0], k2);
      y = lerp(atom.mid[1], atom.end[1], k2);
    }
    // 热运动：H 轻，抖得更明显
    var amp = (atom.jitter == null ? 1 : atom.jitter);
    var phase = (atom.id || 'a').charCodeAt(0) * 0.7 + (atom.id || '').length;
    x += Math.sin(time * 1.7 + phase) * 0.008 * amp;
    y += Math.cos(time * 1.45 + phase * 1.3) * 0.010 * amp;
    return [mapX(x), mapY(y)];
  }

  /** 计算键在 t 时刻的视觉状态（支持 formAt / breakAt 同时存在：先成后断） */
  function bondState(bond, t) {
    // 返回 {visible, alpha, stretch, breaking, forming}
    var alpha = 1;
    var stretch = 1;
    var breaking = false, forming = false, breakK, formK;

    if (bond.formAt) {
      var f0 = bond.formAt[0], f1 = bond.formAt[1];
      if (t <= f0) return { visible: false };
      if (t < f1) {
        formK = invLerp(f0, f1, t);
        alpha = formK;
        stretch = 1 + (1 - formK) * 0.75;
        forming = true;
      }
    }

    if (bond.breakAt) {
      var b0 = bond.breakAt[0], b1 = bond.breakAt[1];
      if (t >= b1) return { visible: false };
      if (t > b0) {
        breakK = invLerp(b0, b1, t);
        alpha = Math.min(alpha, 1 - breakK * 0.95);
        stretch = Math.max(stretch, 1 + breakK * 0.85);
        breaking = true;
      }
    }

    return {
      visible: true, alpha: alpha, stretch: stretch,
      breaking: breaking, forming: forming, breakK: breakK, formK: formK
    };
  }

  function renderMolecular(cartridge, t, time) {
    var mol = cartridge.molecular;

    // 安全净空区：顶部留给层标题，底部留给解说框 + 相位条
    safe.top = TITLE_ZONE;
    safe.bottom = PHASE_BAR_ZONE + 2 + 34 + SAFE_GAP;

    // ① 背景：微观“视场” + 网格光晕
    var bg = ctx.createRadialGradient(viewW / 2, viewH / 2, 40, viewW / 2, viewH / 2, viewW * 0.72);
    bg.addColorStop(0, '#13233c');
    bg.addColorStop(1, '#080e1a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);
    drawMicroscopeFrame();

    // 坐标映射缓存（已收敛进安全净空区）
    var pos = {};
    mol.atoms.forEach(function (a) {
      pos[a.id] = atomPos(a, t, time);
    });

    // ② 化学键连线 + 断键火花
    mol.bonds.forEach(function (b) {
      var st = bondState(b, t);
      if (!st.visible) return;
      var pa = pos[b.a], pb = pos[b.b];
      if (!pa || !pb) return;
      drawBond(pa[0], pa[1], pb[0], pb[1], b.order, {
        alpha: st.alpha,
        stretch: st.stretch,
        glow: '#7fd4ff'
      });
      if (st.breaking && st.breakK != null) {
        drawBreakSpark((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, st.breakK, time);
      }
      if (st.forming && st.formK != null && st.formK > 0.15 && st.formK < 0.9) {
        drawBreakSpark((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, 1 - st.formK, time * 0.7);
      }
    });

    // ③ 原子球体与符号（胶囊入队，稍后置顶）
    mol.atoms.forEach(function (a) {
      var p = pos[a.id];
      if (a.catalyst) drawCatalystRing(p[0], p[1], time, 1);
      drawAtom(p[0], p[1], a.el, 1, 1, a.label);
      if (a.catalyst) drawPill(p[0], p[1] - 52, '催化剂', '#b39ddb', 0.9);
    });

    // ⑤ HUD：左上角层标题 + 底部解说框（占独立底带，与内容零重叠）
    drawText('L2 · 分子动力学层', 22, 28, 15, '#7fd4ff', 'left', 0.9);
    drawText('看得见：分子热运动 · 有效碰撞 · 旧键断裂 · 新键形成', 22, 52, 12, '#8fa3c8', 'left', 0.85);
    drawCaption(mol.captions, t);

    // ⑤ 键标签与浮动解说胶囊永远在最顶层
    flushPills();
  }

  /** 催化剂光环（脉动虚线圈） */
  function drawCatalystRing(x, y, time, alpha) {
    ctx.save();
    ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.75;
    ctx.strokeStyle = '#b39ddb';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(x, y, 46 + Math.sin(time * 2.6) * 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawMicroscopeFrame() {
    ctx.save();
    ctx.strokeStyle = 'rgba(127,212,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.46, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(127,212,255,0.10)';
    for (var i = 0; i < 26; i++) {
      var x = seeded(i * 1.7) * viewW;
      var y = seeded(i * 2.9) * viewH;
      var r = 1 + seeded(i * 4.1) * 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawCaption(captions, t) {
    if (!captions || !captions.length) return;
    var cur = captions[0];
    for (var i = 0; i < captions.length; i++) {
      if (t >= captions[i].from && t < captions[i].to) cur = captions[i];
    }
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.font = '600 15px "Microsoft YaHei", "PingFang SC", sans-serif';
    var text = cur.text;
    var h = 34;
    var w = Math.min(ctx.measureText(text).width + 36, viewW - PILL_PAD * 2);
    // 独立底部解说带：位于相位条正上方，粒子映射区之外
    var boxTop = viewH - PHASE_BAR_ZONE - 2 - h;
    var left = Math.max(PILL_PAD, Math.min(viewW - PILL_PAD - w, viewW / 2 - w / 2));
    roundRectPath(left, boxTop, w, h, 17);
    ctx.fillStyle = 'rgba(10,18,32,0.80)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,212,255,0.45)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = '#e8f4ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + w / 2, boxTop + h / 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ====================================================================== */
  /* 6. L3 原子 / 电子重排层                                                 */
  /* ====================================================================== */

  function renderAtomic(cartridge, t, time) {
    var at = cartridge.atomic;

    // 先量出底部结论框高度，收敛出中间纯净绘制带
    var wrap = at.takeaway ? wrapText(at.takeaway, viewW - 80) : [];
    var boxH = wrap.length ? 26 + wrap.length * 20 : 0;
    safe.top = TITLE_ZONE;
    safe.bottom = PHASE_BAR_ZONE + 2 + boxH + (boxH > 0 ? SAFE_GAP : 0);

    // ① 背景网格 / 光晕
    var bg = ctx.createRadialGradient(viewW / 2, viewH / 2, 20, viewW / 2, viewH / 2, viewW * 0.8);
    bg.addColorStop(0, '#151033');
    bg.addColorStop(0.55, '#0c1026');
    bg.addColorStop(1, '#06080f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);
    drawMicroscopeFrame();

    // 坐标映射缓存（已收敛进安全净空区）
    var pos = {};
    at.atoms.forEach(function (a) {
      pos[a.id] = atomPos(a, t, time);
    });

    // ② 化学键连线 / 离子键虚线 + 断键火花（键标签入队，⑤ 置顶绘制）
    at.bonds.forEach(function (b) {
      var st = bondState(b, t);
      if (!st.visible) return;
      var pa = pos[b.a], pb = pos[b.b];
      if (!pa || !pb) return;

      if (b.ionic) {
        // 离子键：虚线静电引力，无共用电子对
        drawBond(pa[0], pa[1], pb[0], pb[1], 1, {
          alpha: st.alpha * 0.95,
          stretch: st.stretch,
          glow: '#ffb74d',
          color: '#ffd9a0',
          dashed: true
        });
        if (st.breaking && st.breakK != null) {
          drawBreakSpark((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, st.breakK, time);
        }
        if (st.alpha > 0.55 && !st.breaking) {
          drawPill((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 - 36, '静电引力（离子键）', '#ffb74d', 0.9);
        }
        return;
      }

      drawBond(pa[0], pa[1], pb[0], pb[1], b.order, {
        alpha: st.alpha * 0.9,
        stretch: st.stretch,
        glow: '#ffe082',
        color: '#ffe9a8'
      });
      if (st.breaking && st.breakK != null) {
        drawBreakSpark((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, st.breakK, time);
      }
      if (st.breaking && st.breakK > 0.2 && st.breakK < 0.95) {
        drawPill((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 - 34, '共用电子对散伙', '#ffd54f', 0.85);
      }
    });

    // ③ 原子球体与符号（含催化剂光环）
    at.atoms.forEach(function (a) {
      var p = pos[a.id];
      if (a.catalyst) drawCatalystRing(p[0], p[1], time, 1);
      drawAtom(p[0], p[1], a.el, 1, 1, a.catalyst ? a.label : undefined);
      if (a.catalyst) drawPill(p[0], p[1] - 52, '催化剂 MnO₂', '#b39ddb', 0.9);
    });

    // ④ 外层电子轨道与电子点（轨道线 → 共用电子对 → 转移电子 → 各层电子）
    at.atoms.forEach(function (a) {
      if (!a.catalyst) drawShellOrbits(a, pos[a.id]);
    });
    at.bonds.forEach(function (b) {
      if (b.ionic) return;
      var st = bondState(b, t);
      if (!st.visible) return;
      var pa = pos[b.a], pb = pos[b.b];
      if (!pa || !pb) return;
      // 共用电子对
      var pairs = b.pairs || (b.order === 2 ? 2 : 1);
      var pairAlpha = st.alpha;
      for (var p = 0; p < pairs; p++) {
        var offset = (p - (pairs - 1) / 2) * 16;
        var mx = (pa[0] + pb[0]) / 2;
        var my = (pa[1] + pb[1]) / 2;
        // 垂直于键方向的偏移
        var dx = pb[0] - pa[0], dy = pb[1] - pa[1];
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ox = (-dy / len) * offset, oy = (dx / len) * offset;
        var wob = Math.sin(time * 3 + p * 1.7) * 3;
        drawElectron(mx + ox + wob, my + oy, 5, pairAlpha);
        drawElectron(mx + ox - wob * 0.6, my + oy - wob, 5, pairAlpha);
      }
    });
    // 电子转移动画（电子点在④，说明胶囊入队在⑤）
    (at.transfers || []).forEach(function (tr) {
      var k = windowT(t, tr.window[0], tr.window[1]);
      if (k <= 0.01 || k >= 0.99) return;
      var x = mapX(lerp(tr.from[0], tr.to[0], k));
      var y = mapY(lerp(tr.from[1], tr.to[1], k));
      drawElectron(x, y, 6, 0.95);
      drawElectron(x - 12, y + 8, 4, 0.6);
      if (tr.label) {
        drawPill(x, y - 30, tr.label, '#ffd54f', 0.9);
      }
    });
    at.atoms.forEach(function (a) {
      if (!a.catalyst) drawShellElectrons(a, pos[a.id], t, time);
    });

    // ⑤ HUD：左上角层标题 + 底部结论框（独立底带，内容区零重叠）
    drawText('L3 · 原子 / 电子重排层', 22, 28, 15, '#ffe082', 'left', 0.9);
    drawText('看得见：价电子 · 共用电子对 · 化合价的由来', 22, 52, 12, '#a99bd8', 'left', 0.85);
    if (boxH > 0) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.font = '600 14px "Microsoft YaHei", "PingFang SC", sans-serif';
      var boxTop = viewH - PHASE_BAR_ZONE - 2 - boxH;
      roundRectPath(28, boxTop, viewW - 56, boxH, 12);
      ctx.fillStyle = 'rgba(10,18,32,0.82)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,224,130,0.4)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = '#ffe9b8';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (var i = 0; i < wrap.length; i++) {
        ctx.fillText(wrap[i], 48, boxTop + 14 + i * 20);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // 标注（限时显示：淡入后自动淡出，避免叠字）→ 入队，随⑤置顶
    (at.labels || []).forEach(function (lb) {
      var alpha = windowT(t, lb.at - 0.01, lb.at + 0.05) *
        (1 - windowT(t, lb.at + 0.18, lb.at + 0.28));
      if (alpha <= 0.01) return;
      var x = mapX(lb.pos[0]);
      var y = mapY(lb.pos[1]);
      if (lb.anchor) {
        drawLeaderLine(x, y, mapX(lb.anchor[0]), mapY(lb.anchor[1]), '#ffd54f', alpha * 0.7);
      }
      drawPill(x, y, lb.text, '#ffe082', alpha);
    });

    // ⑤ 键标签与浮动解说胶囊永远在最顶层
    flushPills();
  }

  /** ④ 电子层轨道（虚线圈，画在原子球之上） */
  function drawShellOrbits(atom, p) {
    if (atom.catalyst) return;
    var st = atomStyle(atom.el);
    var shells = atom.shells || [1];
    var x = p[0], y = p[1];
    for (var s = 0; s < shells.length; s++) {
      var rr = st.r + 22 + s * 26;
      ctx.save();
      ctx.globalAlpha = 0.30;
      ctx.strokeStyle = 'rgba(180,210,255,0.8)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  /** ④ 电子点（价电子高亮旋转 + 内层电子）；离子电荷徽标入队到⑤ */
  function drawShellElectrons(atom, p, t, time) {
    if (atom.catalyst) return;
    var st = atomStyle(atom.el);
    var shells = atom.shells || [1];
    var x = p[0], y = p[1];
    var maxR = st.r + 22 + (shells.length - 1) * 26;

    // 价电子（最外层）高亮旋转
    var outerCount = shells[shells.length - 1];
    var outerR = maxR;
    var spin = time * (0.6 + 0.35 * windowT(t, 0.25, 0.5));
    for (var i = 0; i < outerCount; i++) {
      var ang = spin + (i / outerCount) * Math.PI * 2;
      var ex = x + Math.cos(ang) * outerR;
      var ey = y + Math.sin(ang) * outerR;
      drawElectron(ex, ey, 5, 0.95);
    }

    // 内层电子（画小一点）
    for (var s2 = 0; s2 < shells.length - 1; s2++) {
      var cnt = shells[s2];
      var rr2 = st.r + 22 + s2 * 26;
      for (var j = 0; j < cnt; j++) {
        var ang2 = time * 0.8 + (j / cnt) * Math.PI * 2 + s2;
        drawElectron(x + Math.cos(ang2) * rr2, y + Math.sin(ang2) * rr2, 3, 0.55);
      }
    }

    // 离子电荷徽标（如 Mg²⁺ / O²⁻），t 到达 ion.from 后显示
    if (atom.ion && t >= (atom.ion.from == null ? 0 : atom.ion.from)) {
      var ionFrom = atom.ion.from == null ? 0 : atom.ion.from;
      var fade = windowT(t, ionFrom, ionFrom + 0.05);
      drawPill(x, y + maxR + 24, atom.ion.label, '#ffd54f', fade);
    }
  }

  function wrapText(text, maxWidth) {
    ctx.font = '600 14px "Microsoft YaHei", "PingFang SC", sans-serif';
    var lines = [];
    var line = '';
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = text[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /* ====================================================================== */
  /* 7. 主渲染分发                                                          */
  /* ====================================================================== */

  function render() {
    var cartridge = currentCartridge();
    if (!cartridge || !ctx) return;

    pillQueue.length = 0;
    ctx.clearRect(0, 0, viewW, viewH);

    if (state.layer === 'L1') {
      renderMacro(cartridge, state.t, state.clock);
    } else if (state.layer === 'L2') {
      renderMolecular(cartridge, state.t, state.clock);
    } else {
      renderAtomic(cartridge, state.t, state.clock);
    }

    // 全局时间轴相位条（画布底部细线）
    drawPhaseBar();
  }

  function drawPhaseBar() {
    var y = viewH - 6;
    var colors = ['#4dd0e1', '#ffb74d', '#ba68c8', '#81c784'];
    var names = ['稳态', '断键', '重组', '新稳态'];
    var seg = viewW / 4;
    for (var i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = colors[i];
      ctx.fillRect(i * seg, y, seg - 3, 5);
    }
    // 播放头
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(state.t * viewW - 1.5, y - 5, 3, 15);
    ctx.globalAlpha = 1;
    for (var j = 0; j < 4; j++) {
      drawText(names[j], seg * j + 8, y - 14, 10, colors[j], 'left', 0.8);
    }
  }

  /* ====================================================================== */
  /* 8. UI 绑定                                                             */
  /* ====================================================================== */

  var els = {};

  function $(id) { return document.getElementById(id); }

  /** 按章节分组构建左侧目录栏 */
  function buildSidebar() {
    if (!els.sidebarBody) return;
    var list = window.CHEM_CARTRIDGES || [];
    var groups = [];
    var byId = {};
    list.forEach(function (c) {
      var ch = c.chapter || { id: 'misc', name: '其他反应', order: 99 };
      if (!byId[ch.id]) {
        byId[ch.id] = { meta: ch, items: [] };
        groups.push(byId[ch.id]);
      }
      byId[ch.id].items.push(c);
    });
    groups.sort(function (a, b) { return (a.meta.order || 0) - (b.meta.order || 0); });

    var html = '';
    groups.forEach(function (g) {
      html += '<div class="sb-chapter"><div class="sb-ch-name">' + g.meta.name + '</div>';
      g.items.forEach(function (c) {
        html += '<button type="button" class="sb-item' + (c.id === state.cartridgeId ? ' active' : '') +
          '" data-cart="' + c.id + '">' +
          '<span class="sb-ico">' + (c.icon || '•') + '</span>' +
          '<span class="sb-txt"><span class="sb-name">' + c.shortName + '</span>' +
          '<span class="sb-eq">' + c.equation + '</span></span></button>';
      });
      html += '</div>';
    });
    els.sidebarBody.innerHTML = html;

    if (els.cartCount) els.cartCount.textContent = String(list.length);

    // 事件委托：切换卡带
    els.sidebarBody.querySelectorAll('[data-cart]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectCartridge(btn.getAttribute('data-cart'));
      });
    });
  }

  /** 切换卡带：时间轴归零、全部同步 */
  function selectCartridge(id) {
    state.cartridgeId = id;
    state.t = 0;
    state.playing = false;
    if (els.slider) els.slider.value = 0;
    refreshPlayButton();
    refreshCartridgeInfo();
    syncAll();
    render();
  }

  /** 折叠 / 展开目录栏 */
  function toggleSidebar() {
    if (!els.sidebar) return;
    var collapsed = els.sidebar.classList.toggle('collapsed');
    var shell = els.sidebar.parentElement;
    if (shell) shell.classList.toggle('sb-hidden', collapsed);
    if (els.sidebarToggle) {
      els.sidebarToggle.textContent = collapsed ? '»' : '«';
      els.sidebarToggle.title = collapsed ? '展开目录' : '收起目录';
    }
    if (els.sidebarToggleTop) {
      els.sidebarToggleTop.textContent = collapsed ? '📂 展开目录' : '📂 收起目录';
    }
    // 折叠动画后重排画布
    window.setTimeout(resizeCanvas, 280);
  }

  function bindUI() {
    canvas = $('viewport');
    ctx = canvas.getContext('2d');

    els.slider = $('timeline');
    els.playBtn = $('playBtn');
    els.tLabel = $('tLabel');
    els.layerBtns = document.querySelectorAll('[data-layer]');
    els.narrTitle = $('narrTitle');
    els.narrText = $('narrText');
    els.narrPhase = $('narrPhase');
    els.eqText = $('eqText');
    els.typeBadge = $('typeBadge');
    els.summaryText = $('summaryText');
    els.legendList = $('legendList');
    els.phaseLabels = document.querySelectorAll('.phase-label');
    els.sidebar = $('sidebar');
    els.sidebarBody = $('sidebarBody');
    els.sidebarToggle = $('sidebarToggle');
    els.sidebarToggleTop = $('sidebarToggleTop');
    els.cartCount = $('cartCount');
    els.curName = $('curName');
    els.curEq = $('curEq');

    buildSidebar();

    if (els.sidebarToggle) els.sidebarToggle.addEventListener('click', toggleSidebar);
    if (els.sidebarToggleTop) els.sidebarToggleTop.addEventListener('click', toggleSidebar);

    // 播放 / 暂停
    els.playBtn.addEventListener('click', function () {
      if (state.playing) {
        state.playing = false;
      } else {
        if (state.t >= 0.999) state.t = 0;
        state.playing = true;
      }
      refreshPlayButton();
    });

    // 时间轴拖拽
    els.slider.addEventListener('input', function () {
      state.t = clamp01(parseInt(els.slider.value, 10) / 1000);
      state.playing = false;
      refreshPlayButton();
      syncAll();
    });

    // 三层切换
    els.layerBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.layer = btn.getAttribute('data-layer');
        els.layerBtns.forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        render();
      });
    });

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    refreshCartridgeInfo();
    refreshPlayButton();
    syncAll();
  }

  function resizeCanvas() {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    viewW = rect.width;
    viewH = rect.height;
    render();
  }

  function refreshPlayButton() {
    if (!els.playBtn) return;
    els.playBtn.textContent = state.playing ? '⏸ 暂停' : '▶ 播放';
    els.playBtn.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
  }

  /** 徽章配色：优先取卡带 badge 字段，否则按反应类型推断 */
  function badgeClassOf(c) {
    if (c.badge) return c.badge;
    var t = c.type || '';
    if (t.indexOf('化合') >= 0) return 'syn';
    if (t.indexOf('分解') >= 0) return 'dec';
    if (t.indexOf('复分解') >= 0) return 'dbl';
    return 'mix';
  }

  function refreshCartridgeInfo() {
    var c = currentCartridge();
    if (!c) return;
    els.eqText.textContent = c.equation;
    els.typeBadge.textContent = c.type + ' · ' + c.typeDesc;
    els.typeBadge.className = 'type-badge ' + badgeClassOf(c);
    els.summaryText.textContent = c.summary;

    // 顶部当前反应名称与化学方程式
    if (els.curName) els.curName.textContent = c.name;
    if (els.curEq) els.curEq.textContent = c.equation;

    // 目录栏高亮
    if (els.sidebarBody) {
      els.sidebarBody.querySelectorAll('[data-cart]').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-cart') === c.id);
      });
    }

    // 图例
    els.legendList.innerHTML = '';
    (c.legend || []).forEach(function (item) {
      var li = document.createElement('li');
      var dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = item.color;
      li.appendChild(dot);
      li.appendChild(document.createTextNode(item.label));
      els.legendList.appendChild(li);
    });
  }

  /** 时间轴 / 解说卡片 / 滑杆数字 全同步 */
  function syncAll() {
    var c = currentCartridge();
    if (!c) return;
    var pct = Math.round(state.t * 100);
    if (els.slider && document.activeElement !== els.slider) {
      els.slider.value = Math.round(state.t * 1000);
    }
    els.tLabel.textContent = pct + '%';

    // 解说卡片
    var seg = c.narration[0];
    for (var i = 0; i < c.narration.length; i++) {
      var n = c.narration[i];
      if (state.t >= n.from && state.t < n.to) { seg = n; break; }
      if (state.t >= 1 && i === c.narration.length - 1) seg = n;
    }
    if (els.narrTitle.textContent !== seg.title) {
      els.narrTitle.textContent = seg.title;
      els.narrText.textContent = seg.text;
      els.narrPhase.textContent = '进度 ' + pct + '%';
    } else {
      els.narrPhase.textContent = '进度 ' + pct + '%';
    }

    // 相位标签高亮
    var idx = state.t < 0.25 ? 0 : state.t < 0.5 ? 1 : state.t < 0.75 ? 2 : 3;
    els.phaseLabels.forEach(function (el, i) {
      el.classList.toggle('active', i === idx);
    });
  }

  /* ====================================================================== */
  /* 9. 主循环                                                              */
  /* ====================================================================== */

  var lastTs = 0;
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    state.clock += dt;

    if (state.playing) {
      state.t += dt / state.duration;
      if (state.t >= 1) {
        state.t = 1;
        state.playing = false;
        refreshPlayButton();
      }
      syncAll();
    }

    render();
    requestAnimationFrame(loop);
  }

  function boot() {
    // 暴露 Schema 给卡带工具链 / 控制台
    window.CHEM_SCHEMA = CHEM_SCHEMA;
    window.validateChemCartridge = validateCartridge;

    // Schema 自检（若校验失败会在控制台提示）
    (window.CHEM_CARTRIDGES || []).forEach(function (c) {
      var r = validateCartridge(c);
      if (!r.ok && window.console) {
        console.warn('卡带校验未通过：' + c.id, r.errors);
      }
    });
    bindUI();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
