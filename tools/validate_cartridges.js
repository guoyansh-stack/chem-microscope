#!/usr/bin/env node
/* =============================================================================
 * tools/validate_cartridges.js — 反应卡带静态 Schema 校验（不启动浏览器）
 * -----------------------------------------------------------------------------
 * 用法：node tools/validate_cartridges.js
 * 校验全部 data/*.js 卡带的：
 *   1) 顶层 Schema 完整性（id/name/…/narration 必填字段）
 *   2) 坐标：start/mid/end、labels 的 pos/anchor、transfers 的 from/to 全在 [0,1]
 *   3) 时序：breakAt/formAt/transfers.window 合法窗口；captions/narration 覆盖 0~1.01
 *   4) 色标注册表：原子 el 必须在引擎 ATOM_STYLE 中；图例色与 ATOM_STYLE 一致；
 *      macro.scene 必须已在 MACRO_SCENES 注册
 *   5) 解说完整性：narration 四段齐备、captions/takeaway/summary 非空
 * 引擎（engine.js）依赖 DOM，本脚本用正则静态提取 ATOM_STYLE / MACRO_SCENES，不加载它。
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var DATA_DIR = path.join(ROOT, 'data');
var ENGINE = path.join(ROOT, 'engine.js');

var errors = [];
var warnings = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function in01(v) { return isNum(v) && v >= 0 && v <= 1; }
function isNonEmptyStr(v) { return typeof v === 'string' && v.trim().length > 0; }
function isHex(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c); }

/** 校验归一化坐标 [x, y] */
function checkCoord(name, arr, where) {
  if (!Array.isArray(arr) || arr.length !== 2) {
    fail(where + '：' + name + ' 应为 [x, y] 二元组');
    return;
  }
  if (!in01(arr[0]) || !in01(arr[1])) {
    fail(where + '：' + name + ' 坐标越界 [' + arr[0] + ', ' + arr[1] + ']（应 0~1）');
  }
}

/** 校验时间窗 [t0, t1] */
function checkWindow(name, win, where, opts) {
  opts = opts || {};
  if (!Array.isArray(win) || win.length !== 2) {
    fail(where + '：' + name + ' 应为 [t0, t1] 二元组');
    return;
  }
  var t0 = win[0], t1 = win[1];
  if (!isNum(t0) || !isNum(t1)) {
    fail(where + '：' + name + ' 时间窗必须是数字');
    return;
  }
  if (t0 >= t1) fail(where + '：' + name + ' 时间窗起点必须小于终点 [' + t0 + ', ' + t1 + ']');
  var lo = opts.lo == null ? 0 : opts.lo;
  var hi = opts.hi == null ? 1 : opts.hi;
  if (t0 < lo - 1e-9 || t1 > hi + 1e-9) {
    fail(where + '：' + name + ' 时间窗越界 [' + t0 + ', ' + t1 + ']（应 ' + lo + '~' + hi + '）');
  }
}

/* ---------------------------------------------------------------------- */
/* 1. 从 engine.js 静态提取 ATOM_STYLE 与 MACRO_SCENES（色标注册表）        */
/* ---------------------------------------------------------------------- */

var engineSrc = fs.readFileSync(ENGINE, 'utf8');

var atomStyles = {};
var styleBlock = engineSrc.match(/var ATOM_STYLE = \{([\s\S]*?)\n\s*\};/);
if (!styleBlock) {
  fail('engine.js：未能定位 ATOM_STYLE 字典');
} else {
  var re = /([A-Za-z][A-Za-z0-9]*)\s*:\s*\{[^}]*color\s*:\s*'([^']+)'[^}]*glow\s*:\s*'([^']+)'/g;
  var m;
  while ((m = re.exec(styleBlock[1])) !== null) {
    atomStyles[m[1]] = { color: m[2], glow: m[3] };
  }
  if (Object.keys(atomStyles).length === 0) fail('engine.js：ATOM_STYLE 提取结果为空');
}

var macroScenes = {};
var regRe = /MACRO_SCENES\.([A-Za-z0-9_]+)\s*=\s*([A-Za-z0-9_]+)/g;
var rm;
while ((rm = regRe.exec(engineSrc)) !== null) {
  macroScenes[rm[1]] = rm[2];
}
if (Object.keys(macroScenes).length === 0) fail('engine.js：MACRO_SCENES 注册表提取结果为空');

/* ---------------------------------------------------------------------- */
/* 2. 加载全部卡带（data/*.js 在 Node 下挂到 globalThis）                  */
/* ---------------------------------------------------------------------- */

globalThis.CHEM_CARTRIDGES = [];
var dataFiles = fs.readdirSync(DATA_DIR).filter(function (f) { return f.endsWith('.js'); }).sort();
dataFiles.forEach(function (f) {
  require(path.join(DATA_DIR, f));
});

var carts = globalThis.CHEM_CARTRIDGES;
if (!Array.isArray(carts) || carts.length === 0) {
  fail('未加载到任何卡带（window.CHEM_CARTRIDGES 为空）');
  finish();
}

/* ---------------------------------------------------------------------- */
/* 3. 逐卡带校验                                                           */
/* ---------------------------------------------------------------------- */

var REQUIRED = ['id', 'name', 'shortName', 'icon', 'equation', 'type', 'typeDesc',
  'summary', 'legend', 'macro', 'molecular', 'atomic', 'narration'];
var BADGES = ['syn', 'dec', 'disp', 'dbl', 'mix'];
var seenIds = {};

carts.forEach(function (c) {
  var id = (c && c.id) ? c.id : '(无 id)';
  var where = '卡带 ' + id;

  /* 3.1 顶层字段 */
  REQUIRED.forEach(function (f) {
    if (!(f in c)) fail(where + '：缺少顶层字段 ' + f);
  });
  if (seenIds[id]) fail(where + '：id 重复');
  seenIds[id] = true;

  ['name', 'shortName', 'icon', 'equation', 'type', 'typeDesc', 'summary'].forEach(function (f) {
    if (f in c && !isNonEmptyStr(c[f])) fail(where + '：字段 ' + f + ' 不能为空');
  });

  if ('badge' in c && BADGES.indexOf(c.badge) < 0) {
    fail(where + '：badge 非法「' + c.badge + '」（应为 syn/dec/disp/dbl/mix）');
  }

  /* 3.2 chapter */
  if (c.chapter) {
    ['id', 'name'].forEach(function (f) {
      if (!isNonEmptyStr(c.chapter[f])) fail(where + '：chapter.' + f + ' 不能为空');
    });
    if (!isNum(c.chapter.order)) fail(where + '：chapter.order 必须是数字');
  } else {
    warn(where + '：缺 chapter（目录栏将归入未分组）');
  }

  /* 3.3 macro.scene 必须已注册（色标/场景注册表） */
  if (c.macro) {
    if (!isNonEmptyStr(c.macro.scene)) {
      fail(where + '：macro.scene 不能为空');
    } else if (!macroScenes[c.macro.scene]) {
      fail(where + '：macro.scene「' + c.macro.scene + '」未在 MACRO_SCENES 注册（已注册：' +
        Object.keys(macroScenes).join(', ') + '）');
    }
    (c.macro.phenomena || []).forEach(function (p, i) {
      if (!in01(p.at)) fail(where + '：macro.phenomena[' + i + '].at 越界 ' + p.at);
      if (!isNonEmptyStr(p.label)) fail(where + '：macro.phenomena[' + i + '].label 不能为空');
    });
  }

  /* 3.4 legend 完整性 + 色标一致 */
  if (!Array.isArray(c.legend) || c.legend.length === 0) {
    fail(where + '：legend 不能为空');
  } else {
    c.legend.forEach(function (item, i) {
      if (!isNonEmptyStr(item.label)) fail(where + '：legend[' + i + '].label 不能为空');
      if (!isHex(item.color)) fail(where + '：legend[' + i + '].color 非法「' + item.color + '」');
      if (item.kind === 'atom') {
        if (!atomStyles[item.el]) {
          fail(where + '：legend[' + i + '] 元素「' + item.el + '」未在 ATOM_STYLE 注册');
        } else if (isHex(item.color) && item.color.toLowerCase() !== atomStyles[item.el].color.toLowerCase()) {
          fail(where + '：legend[' + i + '] 元素「' + item.el + '」图例色 ' + item.color +
            ' 与 ATOM_STYLE 色 ' + atomStyles[item.el].color + ' 不一致');
        }
      }
    });
  }

  /* 3.5 molecular / atomic 原子与键 */
  ['molecular', 'atomic'].forEach(function (layerName) {
    var layer = c[layerName];
    if (!layer || !Array.isArray(layer.atoms) || layer.atoms.length === 0) {
      fail(where + '：' + layerName + '.atoms 不能为空');
      return;
    }
    var ids = {};
    layer.atoms.forEach(function (a, i) {
      var aw = where + '：' + layerName + '.atoms[' + i + '](' + (a.id || '?') + ')';
      ['id', 'el', 'start', 'mid', 'end'].forEach(function (f) {
        if (!(f in a)) fail(aw + ' 缺少字段 ' + f);
      });
      if (!isNonEmptyStr(a.id)) fail(aw + '：id 不能为空');
      if (ids[a.id]) fail(aw + '：原子 id 重复');
      ids[a.id] = true;
      if (!isNonEmptyStr(a.el)) fail(aw + '：el 不能为空');
      // 色标注册表：元素必须已在 ATOM_STYLE 注册
      if (isNonEmptyStr(a.el) && !atomStyles[a.el]) {
        fail(aw + '：元素「' + a.el + '」未在 ATOM_STYLE 注册（引擎将回退灰色）');
      }
      checkCoord('start', a.start, aw);
      checkCoord('mid', a.mid, aw);
      checkCoord('end', a.end, aw);
      if ('jitter' in a && (!isNum(a.jitter) || a.jitter < 0)) fail(aw + '：jitter 必须为非负数字');
      if ('ion' in a) {
        if (!a.ion || !isNonEmptyStr(a.ion.label)) fail(aw + '：ion.label 不能为空');
        if ('from' in a.ion && !in01(a.ion.from)) fail(aw + '：ion.from 越界 ' + a.ion.from);
      }
    });

    (layer.bonds || []).forEach(function (b, i) {
      var bw = where + '：' + layerName + '.bonds[' + i + '](' + b.a + '-' + b.b + ')';
      if (!ids[b.a]) fail(bw + '：端点 a「' + b.a + '」不存在');
      if (!ids[b.b]) fail(bw + '：端点 b「' + b.b + '」不存在');
      if (b.order !== 1 && b.order !== 2) fail(bw + '：order 必须为 1 或 2');
      if ('breakAt' in b) checkWindow('breakAt', b.breakAt, bw);
      if ('formAt' in b) checkWindow('formAt', b.formAt, bw);
      if ('pairs' in b && (!isNum(b.pairs) || b.pairs < 1)) fail(bw + '：pairs 必须为 ≥1 的数字');
    });

    // L2 阶段字幕
    if (layerName === 'molecular') {
      if (!Array.isArray(layer.captions) || layer.captions.length === 0) {
        fail(where + '：molecular.captions 不能为空');
      } else {
        layer.captions.forEach(function (cp, i) {
          if (!isNonEmptyStr(cp.text)) fail(where + '：molecular.captions[' + i + '].text 不能为空');
          checkWindow('captions[' + i + ']', [cp.from, cp.to], where + '（captions）', { lo: -0.01, hi: 1.05 });
        });
        if (layer.captions[0].from > 0.01) fail(where + '：molecular.captions 未从 0 开始覆盖');
        if (layer.captions[layer.captions.length - 1].to < 1.0) fail(where + '：molecular.captions 未覆盖到 1');
      }
    }

    // L3 转移 / 标注 / 结论
    if (layerName === 'atomic') {
      (layer.transfers || []).forEach(function (tr, i) {
        var tw = where + '：atomic.transfers[' + i + '](' + tr.id + ')';
        if (!isNonEmptyStr(tr.label)) fail(tw + '：label 不能为空');
        checkWindow('window', tr.window, tw);
        checkCoord('from', tr.from, tw);
        checkCoord('to', tr.to, tw);
      });
      (layer.labels || []).forEach(function (lb, i) {
        var lw = where + '：atomic.labels[' + i + ']';
        if (!isNonEmptyStr(lb.text)) fail(lw + '：text 不能为空');
        if (!in01(lb.at)) fail(lw + '：at 越界 ' + lb.at);
        checkCoord('pos', lb.pos, lw);
        if (lb.anchor) checkCoord('anchor', lb.anchor, lw);
      });
      if (!isNonEmptyStr(layer.takeaway)) fail(where + '：atomic.takeaway 不能为空');
    }
  });

  /* 3.6 narration 解说完整性（四段 0/0.25/0.50/0.75/1.01） */
  if (!Array.isArray(c.narration) || c.narration.length === 0) {
    fail(where + '：narration 不能为空');
  } else {
    c.narration.forEach(function (n, i) {
      if (!isNonEmptyStr(n.title)) fail(where + '：narration[' + i + '].title 不能为空');
      if (!isNonEmptyStr(n.text)) fail(where + '：narration[' + i + '].text 不能为空');
      checkWindow('narration[' + i + ']', [n.from, n.to], where, { lo: -0.01, hi: 1.05 });
    });
    if (c.narration[0].from > 0.01) fail(where + '：narration 未从 0 开始覆盖');
    if (c.narration[c.narration.length - 1].to < 1.0) fail(where + '：narration 未覆盖到 1');
    for (var i = 1; i < c.narration.length; i++) {
      if (c.narration[i].from > c.narration[i - 1].to + 0.02) {
        fail(where + '：narration[' + i + '] 与上一段之间有时间空洞');
      }
    }
    if (c.narration.length < 4) warn(where + '：narration 只有 ' + c.narration.length + ' 段（惯例为 4 段）');
  }
});

/* ---------------------------------------------------------------------- */
/* 4. 全局总量与章节覆盖                                                   */
/* ---------------------------------------------------------------------- */

if (carts.length !== 14) {
  fail('卡带总数 ' + carts.length + ' ≠ 14（S4 验收口径：S1~S3 共 10 + S4 新增 4）');
}
['ch1', 'ch2', 'ch3', 'ch4'].forEach(function (ch) {
  var n = carts.filter(function (c) { return c.chapter && c.chapter.id === ch; }).length;
  if (n === 0) fail('章节 ' + ch + ' 没有任何卡带');
});

/* ---------------------------------------------------------------------- */
/* 5. 报告                                                                 */
/* ---------------------------------------------------------------------- */

function finish() {
  console.log('==== 反应卡带静态 Schema 校验 ====');
  console.log('数据文件：' + dataFiles.join(', '));
  console.log('ATOM_STYLE 已注册元素：' + Object.keys(atomStyles).join(' '));
  console.log('MACRO_SCENES 已注册场景：' + Object.keys(macroScenes).join(' '));
  console.log('卡带总数：' + carts.length);

  carts.forEach(function (c) {
    console.log('  [' + (c.chapter ? c.chapter.id : '?') + '] ' + c.id +
      ' · ' + c.name + ' · scene=' + (c.macro && c.macro.scene) + ' · badge=' + (c.badge || '-'));
  });

  if (warnings.length) {
    console.log('\n-- 警告 ' + warnings.length + ' 条 --');
    warnings.forEach(function (w) { console.log('  ! ' + w); });
  }
  if (errors.length) {
    console.log('\n-- 错误 ' + errors.length + ' 条 --');
    errors.forEach(function (e) { console.log('  ✗ ' + e); });
    console.log('\nRESULT: FAIL');
    process.exit(1);
  } else {
    console.log('\nRESULT: VALID（14 张卡带坐标 / 时序 / 色标注册表 / 解说完整性全部通过）');
    process.exit(0);
  }
}

finish();
