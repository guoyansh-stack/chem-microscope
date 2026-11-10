/* =============================================================================
 * app.js — 宏微观三层穿透显微镜 · 渲染引擎
 * -----------------------------------------------------------------------------
 * 职责：读取 reactions.js 里的「卡带数据」，按当前缩放层（L1/L2/L3）
 *       与时间轴进度 t(0~1) 把画面画出来，并同步「人话解说卡片」。
 * 引擎不认识任何具体化学内容——一切内容都来自卡带。
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
  /* 1. 原子视觉字典（引擎级默认外观，卡带只说元素符号）                     */
  /* ====================================================================== */

  var ATOM_STYLE = {
    H: { color: '#7fd4ff', glow: '#b7e9ff', r: 15, label: 'H' },
    O: { color: '#ff6b6b', glow: '#ffb3b3', r: 23, label: 'O' },
    e: { color: '#ffd54f', glow: '#fff3b0', r: 5, label: 'e' }
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
    var list = window.ReactionCartridges || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === state.cartridgeId) return list[i];
    }
    return list[0];
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
    ctx.font = 'bold ' + Math.round(r * 0.85) + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label || st.label, x, y + 1);
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
    ctx.globalAlpha = alpha * 0.35;
    ctx.strokeStyle = glow;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = opts.color || '#d7f3ff';
    ctx.lineWidth = order === 2 ? 5 : 7;
    if (order === 2) {
      var ox = -uy * 5, oy = ux * 5;
      ctx.beginPath(); ctx.moveTo(ax + ox, ay + oy); ctx.lineTo(ex + ox, ey + oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax - ox, ay - oy); ctx.lineTo(ex - ox, ey - oy); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    }
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

  /** 圆角胶囊标签 */
  function drawPill(x, y, text, color, alpha, align) {
    alpha = alpha == null ? 1 : alpha;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '600 13px "Microsoft YaHei", "PingFang SC", sans-serif';
    var w = ctx.measureText(text).width + 22;
    var h = 26;
    var left = align === 'right' ? x - w : align === 'left' ? x : x - w / 2;
    roundRectPath(left, y - h / 2, w, h, 13);
    ctx.fillStyle = 'rgba(12,20,36,0.82)';
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
  /* 4. L1 宏观实验台                                                       */
  /* ====================================================================== */

  function renderMacro(cartridge, t, time) {
    var m = cartridge.macro;
    // 背景
    var bg = ctx.createLinearGradient(0, 0, 0, viewH);
    bg.addColorStop(0, '#0b1220');
    bg.addColorStop(0.55, '#122036');
    bg.addColorStop(1, '#1a2b45');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);

    if (m.scene === 'electrolysis') {
      drawMacroElectrolysis(m, t, time);
    } else {
      drawMacroCombustion(m, t, time);
    }

    // 现象清单（左下角，逐条亮起）
    var ph = m.phenomena || [];
    drawText('实验现象', 18, viewH - 118 - (ph.length - 1) * 34, 12, '#b39ddb', 'left', 0.85);
    for (var i = 0; i < ph.length; i++) {
      var a = windowT(t, ph[i].at - 0.02, ph[i].at + 0.06);
      drawPill(18, viewH - 92 - (ph.length - 1 - i) * 34,
        (a > 0.5 ? '✓ ' : '· ') + ph[i].label, '#b39ddb', 0.32 + a * 0.68, 'left');
    }
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
    return [x * viewW, y * viewH];
  }

  /** 计算键在 t 时刻的视觉状态 */
  function bondState(bond, t) {
    // 返回 {visible, alpha, stretch, breaking, forming}
    if (bond.breakAt) {
      var b0 = bond.breakAt[0], b1 = bond.breakAt[1];
      if (t >= b1) return { visible: false };
      if (t < b0) return { visible: true, alpha: 1, stretch: 1 };
      var k = invLerp(b0, b1, t);
      return {
        visible: true,
        alpha: 1 - k * 0.95,
        stretch: 1 + k * 0.85,
        breaking: true,
        breakK: k
      };
    }
    if (bond.formAt) {
      var f0 = bond.formAt[0], f1 = bond.formAt[1];
      if (t <= f0) return { visible: false };
      if (t >= f1) return { visible: true, alpha: 1, stretch: 1 };
      var k2 = invLerp(f0, f1, t);
      return {
        visible: true,
        alpha: k2,
        stretch: 1 + (1 - k2) * 0.75,
        forming: true,
        formK: k2
      };
    }
    return { visible: true, alpha: 1, stretch: 1 };
  }

  function renderMolecular(cartridge, t, time) {
    var mol = cartridge.molecular;

    // 背景：微观“视场”
    var bg = ctx.createRadialGradient(viewW / 2, viewH / 2, 40, viewW / 2, viewH / 2, viewW * 0.72);
    bg.addColorStop(0, '#13233c');
    bg.addColorStop(1, '#080e1a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);

    // 视场圆环 + 网格点
    drawMicroscopeFrame();

    // 坐标映射缓存
    var pos = {};
    mol.atoms.forEach(function (a) {
      pos[a.id] = atomPos(a, t, time);
    });

    // 键（先画键，再画原子，让原子盖在键上）
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

    // 原子
    mol.atoms.forEach(function (a) {
      var p = pos[a.id];
      drawAtom(p[0], p[1], a.el, 1, 1);
    });

    // 阶段字幕
    drawCaption(mol.captions, t);

    // 左上角缩放标识
    drawText('L2 · 分子动力学层', 22, 28, 15, '#7fd4ff', 'left', 0.9);
    drawText('看得见：分子热运动 · 有效碰撞 · 旧键断裂 · 新键形成', 22, 52, 12, '#8fa3c8', 'left', 0.85);
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
    var w = ctx.measureText(text).width + 36;
    roundRectPath(viewW / 2 - w / 2, viewH - 52, w, 34, 17);
    ctx.fillStyle = 'rgba(10,18,32,0.80)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,212,255,0.45)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = '#e8f4ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, viewW / 2, viewH - 35);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ====================================================================== */
  /* 6. L3 原子 / 电子重排层                                                 */
  /* ====================================================================== */

  function renderAtomic(cartridge, t, time) {
    var at = cartridge.atomic;

    var bg = ctx.createRadialGradient(viewW / 2, viewH / 2, 20, viewW / 2, viewH / 2, viewW * 0.8);
    bg.addColorStop(0, '#151033');
    bg.addColorStop(0.55, '#0c1026');
    bg.addColorStop(1, '#06080f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);

    drawMicroscopeFrame();

    var pos = {};
    at.atoms.forEach(function (a) {
      pos[a.id] = atomPos(a, t, time);
    });

    // 先画键与共用电子对
    at.bonds.forEach(function (b) {
      var st = bondState(b, t);
      if (!st.visible) return;
      var pa = pos[b.a], pb = pos[b.b];
      if (!pa || !pb) return;
      drawBond(pa[0], pa[1], pb[0], pb[1], b.order, {
        alpha: st.alpha * 0.9,
        stretch: st.stretch,
        glow: '#ffe082',
        color: '#ffe9a8'
      });
      if (st.breaking && st.breakK != null) {
        drawBreakSpark((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, st.breakK, time);
      }
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
      if (st.breaking && st.breakK > 0.2 && st.breakK < 0.95) {
        drawPill((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 - 34, '共用电子对散伙', '#ffd54f', 0.85);
      }
    });

    // 电子转移动画
    (at.transfers || []).forEach(function (tr) {
      var k = windowT(t, tr.window[0], tr.window[1]);
      if (k <= 0.01 || k >= 0.99) return;
      var x = lerp(tr.from[0], tr.to[0], k) * viewW;
      var y = lerp(tr.from[1], tr.to[1], k) * viewH;
      drawElectron(x, y, 6, 0.95);
      drawElectron(x - 12, y + 8, 4, 0.6);
      if (tr.label) {
        drawPill(x, y - 30, tr.label, '#ffd54f', 0.9);
      }
    });

    // 原子核 + 电子层
    at.atoms.forEach(function (a) {
      drawAtomWithShells(a, pos[a.id], t, time);
    });

    // 标注（限时显示：淡入后自动淡出，避免叠字）
    (at.labels || []).forEach(function (lb) {
      var alpha = windowT(t, lb.at - 0.01, lb.at + 0.05) *
        (1 - windowT(t, lb.at + 0.18, lb.at + 0.28));
      if (alpha <= 0.01) return;
      var x = lb.pos[0] * viewW;
      var y = lb.pos[1] * viewH;
      if (lb.anchor) {
        drawLeaderLine(x, y, lb.anchor[0] * viewW, lb.anchor[1] * viewH, '#ffd54f', alpha * 0.7);
      }
      drawPill(x, y, lb.text, '#ffe082', alpha);
    });

    drawText('L3 · 原子 / 电子重排层', 22, 28, 15, '#ffe082', 'left', 0.9);
    drawText('看得见：价电子 · 共用电子对 · 化合价的由来', 22, 52, 12, '#a99bd8', 'left', 0.85);

    // 底部结论条
    if (at.takeaway) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.font = '600 14px "Microsoft YaHei", "PingFang SC", sans-serif';
      var wrap = wrapText(at.takeaway, viewW - 80);
      var bh = 26 + wrap.length * 20;
      roundRectPath(28, viewH - bh - 30, viewW - 56, bh, 12);
      ctx.fillStyle = 'rgba(10,18,32,0.82)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,224,130,0.4)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = '#ffe9b8';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (var i = 0; i < wrap.length; i++) {
        ctx.fillText(wrap[i], 48, viewH - bh - 16 + i * 20);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawAtomWithShells(atom, p, t, time) {
    var st = atomStyle(atom.el);
    var shells = atom.shells || [1];
    var x = p[0], y = p[1];

    // 电子层轨道
    var maxR = 0;
    for (var s = 0; s < shells.length; s++) {
      var rr = st.r + 22 + s * 26;
      maxR = rr;
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

    // 原子核（带符号）
    drawAtom(x, y, atom.el, 1, 1);

    // 价电子（最外层）高亮旋转
    var outerCount = shells[shells.length - 1];
    var outerR = st.r + 22 + (shells.length - 1) * 26;
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

  function bindUI() {
    canvas = $('viewport');
    ctx = canvas.getContext('2d');

    els.slider = $('timeline');
    els.playBtn = $('playBtn');
    els.tLabel = $('tLabel');
    els.layerBtns = document.querySelectorAll('[data-layer]');
    els.cartBtns = document.querySelectorAll('[data-cart]');
    els.narrTitle = $('narrTitle');
    els.narrText = $('narrText');
    els.narrPhase = $('narrPhase');
    els.eqText = $('eqText');
    els.typeBadge = $('typeBadge');
    els.summaryText = $('summaryText');
    els.legendList = $('legendList');
    els.phaseLabels = document.querySelectorAll('.phase-label');

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

    // 卡带切换
    els.cartBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.cartridgeId = btn.getAttribute('data-cart');
        state.t = 0;
        state.playing = false;
        els.slider.value = 0;
        els.cartBtns.forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        refreshPlayButton();
        refreshCartridgeInfo();
        syncAll();
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

  function refreshCartridgeInfo() {
    var c = currentCartridge();
    if (!c) return;
    els.eqText.textContent = c.equation;
    els.typeBadge.textContent = c.type + ' · ' + c.typeDesc;
    els.typeBadge.className = 'type-badge ' + (c.id === 'h2_combustion' ? 'syn' : 'dec');
    els.summaryText.textContent = c.summary;

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
    // Schema 自检（若校验失败会在控制台提示）
    if (window.validateReactionCartridge && window.ReactionCartridges) {
      window.ReactionCartridges.forEach(function (c) {
        var r = window.validateReactionCartridge(c);
        if (!r.ok && window.console) {
          console.warn('卡带校验未通过：' + c.id, r.errors);
        }
      });
    }
    bindUI();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
