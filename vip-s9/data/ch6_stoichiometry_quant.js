/* =============================================================================
 * data/ch6_stoichiometry_quant.js — 第6章 · 初升高/定量专训：化学计量与分步反应
 * -----------------------------------------------------------------------------
 * S12-Step2 新增 4 张定量硬核卡带（总卡带数 22 → 26），直击化学计量与分步反应：
 *   1) 极限反应物与过量残留   3H₂ + O₂ → 2H₂O + H₂[过量]   （计量比 2:1 定量消耗）
 *   2) 变价铁的氧化剂强弱博弈 2Fe + 3Cl₂ → 2FeCl₃ vs Fe + 2H⁺ → Fe²⁺（强/弱氧化剂）
 *   3) CO₂ 通入 NaOH 分步吸收 CO₃²⁻ → HCO₃⁻ 连续转化       （分步定量吸收）
 *   4) 强酸强碱中和滴定       HCl + NaOH → NaCl + H₂O        （计量点 pH 突跃）
 *
 * 挂载方式（file:// 可用，禁用 ES Module）：
 *   window.CHEM_CARTRIDGES = window.CHEM_CARTRIDGES || [];
 *   window.CHEM_CARTRIDGES.push(...);
 *
 * 元素固定配色（与引擎 ATOM_STYLE 一致，图例用）：
 *   H 淡蓝 #7fd4ff · O 红 #ff6b6b · C 灰黑 #4a5568 · Fe 钢灰 #78909c
 *   Cl 青绿 #26a69a · Na 金橙 #ffa726 · 电子金 #ffd54f
 *
 * 坐标约定：start / mid / end 均为 0~1 归一化画布坐标（x 向右，y 向下）。
 *   时间 t：0~1（0%~100%）
 *     0.00~0.25 反应前稳态 | 0.25~0.50 激发与断键 | 0.50~0.75 重组与成键 | 0.75~1.00 新稳态
 *   旁观粒子：atom.spectator = true（聚焦反应实质时降噪）或图例/离子标签含「旁观」。
 * ========================================================================== */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* 章节（初升高/定量专训单元 · S12-Step2 新增分组）                          */
  /* ---------------------------------------------------------------------- */
  var CH_QUANT = { id: 'g9quant', name: '【高中拓展·非沪教版九年级考纲】化学计量与分步反应', order: 7 };

  /** 派生章节对象：seq = 单元内教学顺序（定量专训学习阶梯） */
  function ch(base, seq) {
    return { id: base.id, name: base.name, order: base.order, seq: seq };
  }

  var C = {
    H: '#7fd4ff',
    O: '#ff6b6b',
    C: '#4a5568',
    Fe: '#78909c',
    Cl: '#26a69a',
    Na: '#ffa726',
    bond: '#9ae6ff',
    pair: '#ffe082',
    electron: '#ffd54f',
    ion: '#ffb74d'
  };

  function legendBase(extra) {
    var list = [
      { kind: 'bond', label: '化学键 = 手拉手', color: C.bond },
      { kind: 'pair', label: '共用电子对', color: C.pair },
      { kind: 'electron', label: '电子（e⁻）', color: C.electron },
      { kind: 'ion', label: '静电吸引 / 离子作用 = 虚线（得失电子与电性吸引）', color: C.ion }
    ];
    return (extra || []).concat(list);
  }

  /* ====================================================================== */
  /* 卡带 23：极限反应物与过量残留（3H₂ + O₂ → 2H₂O + H₂[过量]）            */
  /* ====================================================================== */

  var limitingH2O2 = {
    id: 'limiting_h2_o2',
    badge: 'syn',
    chapter: ch(CH_QUANT, 1),
    name: '极限反应物与过量残留：按化学计量比定量消耗',
    shortName: '极限反应物',
    icon: '⚖️',
    equation: '2H₂ + O₂  ══点燃══  2H₂O   （副注：投料 3H₂ + 1O₂，过量 H₂ 残留）',
    type: '合成反应（极限反应物）',
    typeDesc: '摩尔比 2:1 定量消耗 · 过量物不计入生成物',
    summary:
      '密闭量气管里投入 3 体积 H₂ 与 1 体积 O₂ 点火引爆：只有 2 个 H₂ 与 1 个 O₂ 按 2:1 化学计量比断键重组生成 2 个 H₂O，' +
      '第 3 个 H₂ 分子作为过量反应物（Excess Reactant）全程参与热运动却始终不断键，反应后原样残留。' +
      '宏观读数很诚实：4 体积混合气 → 1 体积残余气，液面恰好上升 3 体积——生成物的量由限量反应物（Limiting Reactant）决定，过量残留物不计入生成物质量。',
    energyProfile: { dh: -571.6, ea: 165 },
    relatedTerms: ['mole_stoichiometry'],
    legend: legendBase([
      { kind: 'atom', el: 'H', label: '氢原子 H（个头小、跑得快）', color: C.H },
      { kind: 'atom', el: 'O', label: '氧原子 O（被 H 争夺的核心）', color: C.O },
      { kind: 'bond', label: 'H—H / O=O 旧键断裂 → H—O 新键生成', color: C.bond },
      { kind: 'pair', label: '过量 H₂ 残留（旁观不断键 · 不计入生成物）', color: C.pair }
    ]),

    /* ---------------- L1 宏观实验台 ---------------- */
    macro: {
      scene: 'limiting_h2_o2',
      conditions: '密闭量气管 · 点火引爆（示意装置，严禁在密闭容器点火）',
      vesselLabel: '3 体积 H₂ + 1 体积 O₂（共 4 体积）',
      productLabel: '残留 1 体积无色 H₂（过量）',
      phenomena: [
        { at: 0.18, label: '量气管内 3 体积 H₂ 与 1 体积 O₂ 混合（共 4 体积）' },
        { at: 0.36, label: '点火引爆，管内闪过爆鸣火光' },
        { at: 0.62, label: '液面定量上升 3 体积（2H₂+O₂→2H₂O）' },
        { at: 0.86, label: '管顶残留 1 体积无色气体——过量 H₂' }
      ]
    },

    /* ---------------- L2 分子动力学层 ---------------- */
    /* 3 个 H₂ + 1 个 O₂：其中 2 H₂ + 1 O₂ 断键重组为 2 H₂O，第 3 个 H₂ 过量旁观 */
    molecular: {
      atoms: [
        // H₂ 分子 #1（参战）
        { id: 'h1a', el: 'H', jitter: 1.15, start: [0.20, 0.30], mid: [0.32, 0.38], end: [0.36, 0.34] },
        { id: 'h1b', el: 'H', jitter: 1.15, start: [0.28, 0.34], mid: [0.38, 0.48], end: [0.60, 0.38] },
        // H₂ 分子 #2（参战）
        { id: 'h2a', el: 'H', jitter: 1.15, start: [0.20, 0.68], mid: [0.32, 0.60], end: [0.34, 0.62] },
        { id: 'h2b', el: 'H', jitter: 1.15, start: [0.28, 0.72], mid: [0.40, 0.62], end: [0.66, 0.62] },
        // O₂ 分子（参战）
        { id: 'o1', el: 'O', jitter: 0.65, start: [0.52, 0.42], mid: [0.46, 0.48], end: [0.36, 0.48] },
        { id: 'o2', el: 'O', jitter: 0.65, start: [0.58, 0.56], mid: [0.52, 0.52], end: [0.62, 0.50] },
        // H₂ 分子 #3（过量反应物 · 全程不断键）
        { id: 'h3a', el: 'H', jitter: 1.15, spectator: true, start: [0.84, 0.26], mid: [0.86, 0.30], end: [0.85, 0.28] },
        { id: 'h3b', el: 'H', jitter: 1.15, spectator: true, start: [0.88, 0.36], mid: [0.90, 0.40], end: [0.89, 0.38] }
      ],
      bonds: [
        // 旧键断裂：2 个 H—H 与 1 个 O=O
        { a: 'h1a', b: 'h1b', order: 1, breakAt: [0.28, 0.46] },
        { a: 'h2a', b: 'h2b', order: 1, breakAt: [0.28, 0.46] },
        { a: 'o1', b: 'o2', order: 2, breakAt: [0.28, 0.46] },
        // 过量 H₂：全程旁观，键永不断
        { a: 'h3a', b: 'h3b', order: 1 },
        // 新键形成：2 个 H₂O（每个 O 牵 2 个 H）
        { a: 'o1', b: 'h1a', order: 1, formAt: [0.52, 0.70] },
        { a: 'o1', b: 'h2a', order: 1, formAt: [0.53, 0.71] },
        { a: 'o2', b: 'h1b', order: 1, formAt: [0.52, 0.70] },
        { a: 'o2', b: 'h2b', order: 1, formAt: [0.53, 0.71] }
      ],
      captions: [
        { from: 0.00, to: 0.25, text: '3 个 H₂ 与 1 个 O₂ 在密闭量气管中热运动（共 4 体积）' },
        { from: 0.25, to: 0.50, text: '点火！H—H 与 O=O 旧键被拉伸断裂（仅 2 个 H₂ 与 1 个 O₂ 参战）' },
        { from: 0.50, to: 0.75, text: '原子重组生成 2 个 H₂O；第 3 个 H₂ 仍不断键' },
        { from: 0.75, to: 1.01, text: '过量 H₂ 残留（旁观）——生成物只算 2:1 计量比消耗的部分' }
      ]
    },

    /* ---------------- L3 原子/电子重排层（共用电子对重组 + 过量旁观） ---------------- */
    atomic: {
      atoms: [
        { id: 'h1a', el: 'H', shells: [1], start: [0.30, 0.30], mid: [0.34, 0.34], end: [0.34, 0.32] },
        { id: 'h1b', el: 'H', shells: [1], start: [0.36, 0.34], mid: [0.44, 0.42], end: [0.60, 0.42] },
        { id: 'h2a', el: 'H', shells: [1], start: [0.30, 0.66], mid: [0.32, 0.60], end: [0.32, 0.62] },
        { id: 'h2b', el: 'H', shells: [1], start: [0.38, 0.70], mid: [0.46, 0.60], end: [0.64, 0.68] },
        { id: 'o1', el: 'O', shells: [2, 6], start: [0.46, 0.46], mid: [0.44, 0.48], end: [0.42, 0.48] },
        { id: 'o2', el: 'O', shells: [2, 6], start: [0.58, 0.54], mid: [0.56, 0.52], end: [0.58, 0.54] },
        {
          id: 'h3a', el: 'H', shells: [1], spectator: true,
          start: [0.82, 0.28], mid: [0.83, 0.30], end: [0.82, 0.29],
          ion: { label: '过量 H₂ 残留（旁观 · 不计入生成物）', from: 0.62 }
        },
        {
          id: 'h3b', el: 'H', shells: [1], spectator: true,
          start: [0.86, 0.38], mid: [0.87, 0.40], end: [0.86, 0.39],
          ion: { label: '过量 H₂ 残留（旁观 · 不计入生成物）', from: 0.62 }
        }
      ],
      bonds: [
        // 旧键断裂（共用电子对散伙）
        { a: 'h1a', b: 'h1b', order: 1, pairs: 1, breakAt: [0.28, 0.46] },
        { a: 'h2a', b: 'h2b', order: 1, pairs: 1, breakAt: [0.28, 0.46] },
        { a: 'o1', b: 'o2', order: 2, pairs: 2, breakAt: [0.28, 0.46] },
        // 过量 H₂：一对共用电子对全程抱紧
        { a: 'h3a', b: 'h3b', order: 1, pairs: 1 },
        // 新键形成（O—H 共用电子对）
        { a: 'o1', b: 'h1a', order: 1, pairs: 1, formAt: [0.52, 0.70] },
        { a: 'o1', b: 'h2a', order: 1, pairs: 1, formAt: [0.53, 0.71] },
        { a: 'o2', b: 'h1b', order: 1, pairs: 1, formAt: [0.52, 0.70] },
        { a: 'o2', b: 'h2b', order: 1, pairs: 1, formAt: [0.53, 0.71] }
      ],
      transfers: [
        {
          id: 'pair-break',
          window: [0.30, 0.50],
          from: [0.50, 0.42], to: [0.42, 0.34],
          label: '共用电子对散伙：旧键断裂'
        },
        {
          id: 'pair-form',
          window: [0.52, 0.72],
          from: [0.30, 0.50], to: [0.42, 0.48],
          label: 'H 的电子与 O 配对成 O—H 共用电子对'
        }
      ],
      labels: [
        { at: 0.22, text: '投入 3 H₂ + 1 O₂：摩尔比 3:1 > 计量比 2:1', pos: [0.50, 0.10] },
        { at: 0.44, text: '只有 2 个 H₂ 与 1 个 O₂ 断键参战', pos: [0.50, 0.90] },
        { at: 0.66, text: '生成 2 个 H₂O（O—H 新键落定）', pos: [0.16, 0.16], anchor: [0.42, 0.48] },
        { at: 0.86, text: '过量 H₂ 残留（旁观）——不计入生成物质量！', pos: [0.70, 0.14], anchor: [0.84, 0.32] }
      ],
      takeaway:
        '化学反应是“按份配餐”：2 个 H₂ 与 1 个 O₂ 合为一份（计量比 2:1），点火后每一份都精确重组为 2 个 H₂O。' +
        '投入 3 个 H₂ 时只有 2 个能配上对，第 3 个 H₂ 是过量反应物（Excess Reactant）——它全程参与热运动，但统计上平均 2 个 H₂ 配 1 个 O₂，它没有配对对象，反应后原样残留。' +
        '因此生成物的量由限量反应物（Limiting Reactant）决定，过量残留物的质量绝不计入生成物；量气管液面只上升 3 体积而非 4 体积，就是这个道理的宏观铁证。'
    },

    /* ---------------- 人话解说卡片 ---------------- */
    narration: [
      {
        from: 0.00, to: 0.25,
        title: '① 反应前 · 超额投料',
        text:
          '密闭量气管里装进 3 体积氢气和 1 体积氧气，一共 4 体积混合气，管外水槽的水面平静。' +
          '按方程式 2H₂ + O₂ → 2H₂O 算一算：1 体积 O₂ 只够“吃掉”2 体积 H₂——第 3 体积氢气注定无处可去。' +
          '多投的这一份，就是过量反应物。'
      },
      {
        from: 0.25, to: 0.50,
        title: '② 点火 · 定额断键',
        text:
          '点火引爆！但断键不是随机的：统计上平均 2 个 H₂ 配 1 个 O₂，只有 2 个 H₂ 分子和 1 个 O₂ 分子被拉伸、断裂成 H 原子与 O 原子。' +
          '第 3 个 H₂ 分子在旁边热运动得起劲，H—H 键却纹丝不动——它没有配对对象。' +
          '“统计上平均 2 个 H₂ 配 1 个 O₂”，就是化学计量比。'
      },
      {
        from: 0.50, to: 0.75,
        title: '③ 重组 · 生成两份水',
        text:
          '4 个 H 原子与 2 个 O 原子重新牵手，恰好拼成 2 个 H₂O 分子；过量的 H₂ 还是那副“手拉手”的样子。' +
          '量气管里液面定量上升 3 体积——被消耗的正是 2 体积 H₂ + 1 体积 O₂，一分不多、一分不少。'
      },
      {
        from: 0.75, to: 1.01,
        title: '④ 新稳态 · 过量残留',
        text:
          '反应结束：管顶残留 1 体积无色气体，那正是过量的 H₂。' +
          '记住定量分析的铁律：生成物的质量只按限量反应物计算，过量残留物不计入生成物。' +
          '工业投料常常故意让廉价原料过量，只为榨干昂贵的限量试剂——极限反应物思维，就是成本与收率的算盘。'
      }
    ]
  };

  /* ====================================================================== */
  /* 卡带 24：变价铁的氧化剂强弱博弈（Fe³⁺ vs Fe²⁺）                        */
  /* ====================================================================== */

  var feOxidantGame = {
    id: 'fe_oxidant_game',
    badge: 'mix',
    chapter: ch(CH_QUANT, 2),
    name: '变价铁的氧化剂强弱博弈：Fe³⁺ 与 Fe²⁺ 之辨',
    shortName: '变价铁博弈',
    icon: '⚔️',
    equation: '2Fe + 3Cl₂  ══点燃══  2FeCl₃   ·   对照 Fe + 2H⁺ === Fe²⁺ + H₂↑',
    type: '氧化还原反应（变价）',
    typeDesc: '强氧化剂 Cl₂ → Fe³⁺ · 弱氧化剂 H⁺ → Fe²⁺',
    summary:
      '同是铁，终点价态由氧化剂“投票”决定：电负性高达 3.16 的强氧化剂 Cl₂ 能突破 Fe 的 3d⁶4s² 价层，' +
      '把 Fe⁰ 直接抽干 3 个电子氧化为棕黄色 Fe³⁺（2Fe+3Cl₂→2FeCl₃，剧烈燃烧、棕褐色烟）；' +
      '而弱氧化剂 H⁺ 只夺走 2 个 4s 电子便止步于浅绿色 Fe²⁺（Fe+2H⁺→Fe²⁺+H₂↑，缓慢冒泡）。' +
      '对照实验一眼看穿：氧化剂越强，越能把变价金属推向高价。',
    energyProfile: { dh: -799.0, ea: 85 },
    relatedTerms: ['redox', 'electronegativity'],
    legend: legendBase([
      { kind: 'atom', el: 'Fe', label: '铁原子 Fe（钢灰 · 变价主角）', color: C.Fe },
      { kind: 'atom', el: 'Cl', label: '氯原子 Cl（青绿 · 强氧化剂）', color: C.Cl },
      { kind: 'electron', label: '电子 e⁻（Fe 失 3 个 → Cl 各得 1 个）', color: C.electron },
      { kind: 'pair', label: '对照：弱氧化剂 H⁺ 只夺 2e⁻ → Fe²⁺（浅绿色）', color: C.pair }
    ]),

    /* ---------------- L1 宏观实验台 ---------------- */
    macro: {
      scene: 'fe_oxidant_game',
      conditions: '左：常温稀盐酸 · 右：点燃 Cl₂',
      vesselLabel: '左 Fe+稀盐酸 | 右 Fe+Cl₂',
      productLabel: '左浅绿 Fe²⁺ | 右棕黄 Fe³⁺',
      phenomena: [
        { at: 0.18, label: '左侧铁粉浸入稀盐酸，缓慢冒气泡' },
        { at: 0.40, label: '左侧溶液渐呈浅绿色（Fe²⁺ 特征色）' },
        { at: 0.58, label: '右侧炽热铁丝在黄绿 Cl₂ 中剧烈燃烧、棕褐色烟' },
        { at: 0.84, label: '右侧得到棕黄色溶液（Fe³⁺）——强氧化剂赢下 3 个电子' }
      ]
    },

    /* ---------------- L2 分子动力学层 ---------------- */
    /* 主舞台 2Fe + 3Cl₂ → 2FeCl₃；对照 Fe + 2H⁺ → Fe²⁺ + H₂↑ 在胶囊中呈现 */
    molecular: {
      atoms: [
        // 2 个 Fe 原子
        { id: 'fe1', el: 'Fe', jitter: 0.35, start: [0.28, 0.44], mid: [0.32, 0.46], end: [0.32, 0.48] },
        { id: 'fe2', el: 'Fe', jitter: 0.35, start: [0.72, 0.52], mid: [0.68, 0.52], end: [0.68, 0.50] },
        // 3 个 Cl₂ 分子
        { id: 'c1', el: 'Cl', jitter: 0.7, start: [0.14, 0.22], mid: [0.24, 0.32], end: [0.22, 0.34] },
        { id: 'c2', el: 'Cl', jitter: 0.7, start: [0.22, 0.18], mid: [0.30, 0.28], end: [0.78, 0.34] },
        { id: 'c3', el: 'Cl', jitter: 0.7, start: [0.46, 0.18], mid: [0.40, 0.32], end: [0.26, 0.60] },
        { id: 'c4', el: 'Cl', jitter: 0.7, start: [0.54, 0.14], mid: [0.48, 0.28], end: [0.82, 0.52] },
        { id: 'c5', el: 'Cl', jitter: 0.7, start: [0.84, 0.78], mid: [0.76, 0.64], end: [0.34, 0.68] },
        { id: 'c6', el: 'Cl', jitter: 0.7, start: [0.92, 0.72], mid: [0.84, 0.60], end: [0.74, 0.68] }
      ],
      bonds: [
        // 旧键断裂：3 个 Cl—Cl
        { a: 'c1', b: 'c2', order: 1, breakAt: [0.28, 0.46] },
        { a: 'c3', b: 'c4', order: 1, breakAt: [0.28, 0.46] },
        { a: 'c5', b: 'c6', order: 1, breakAt: [0.28, 0.46] },
        // 新键形成：2 个 FeCl₃（每个 Fe 牵 3 个 Cl）
        { a: 'fe1', b: 'c1', order: 1, formAt: [0.52, 0.70] },
        { a: 'fe1', b: 'c3', order: 1, formAt: [0.53, 0.71] },
        { a: 'fe1', b: 'c5', order: 1, formAt: [0.54, 0.72] },
        { a: 'fe2', b: 'c2', order: 1, formAt: [0.52, 0.70] },
        { a: 'fe2', b: 'c4', order: 1, formAt: [0.53, 0.71] },
        { a: 'fe2', b: 'c6', order: 1, formAt: [0.54, 0.72] }
      ],
      captions: [
        { from: 0.00, to: 0.25, text: '铁原子与黄绿 Cl₂ 分子相遇（对照：Fe + 2H⁺ 只生成浅绿 Fe²⁺）' },
        { from: 0.25, to: 0.50, text: '强氧化剂 Cl₂ 拉断 Cl—Cl，直扑 Fe 的 3d⁶4s² 价层' },
        { from: 0.50, to: 0.75, text: 'Fe 被抽干 3 个电子，与 Cl 重组为 FeCl₃（棕黄色）' },
        { from: 0.75, to: 1.01, text: 'Fe³⁺ 落定：强氧化剂才推得动 +3 价；H⁺ 止步 Fe²⁺' }
      ]
    },

    /* ---------------- L3 原子/电子重排层（失 3e⁻ vs 失 2e⁻） ---------------- */
    atomic: {
      atoms: [
        {
          id: 'fe', el: 'Fe', shells: [2, 8, 14, 2],
          start: [0.34, 0.50], mid: [0.34, 0.50], end: [0.34, 0.50],
          ion: { label: 'Fe³⁺（棕黄色 · 被抽干 3e⁻）', from: 0.62 }
        },
        {
          id: 'c1', el: 'Cl', shells: [2, 8, 7],
          start: [0.62, 0.28], mid: [0.58, 0.32], end: [0.58, 0.32],
          ion: { label: 'Cl⁻（得 1e⁻）', from: 0.62 }
        },
        {
          id: 'c2', el: 'Cl', shells: [2, 8, 7],
          start: [0.72, 0.50], mid: [0.68, 0.50], end: [0.68, 0.50],
          ion: { label: 'Cl⁻（得 1e⁻）', from: 0.62 }
        },
        {
          id: 'c3', el: 'Cl', shells: [2, 8, 7],
          start: [0.62, 0.72], mid: [0.58, 0.68], end: [0.58, 0.68],
          ion: { label: 'Cl⁻（得 1e⁻）', from: 0.62 }
        }
      ],
      bonds: [
        // FeCl₃ 中 Fe—Cl 离子性成分（虚线静电引力）
        { a: 'fe', b: 'c1', order: 1, ionic: true, formAt: [0.55, 0.72] },
        { a: 'fe', b: 'c2', order: 1, ionic: true, formAt: [0.56, 0.73] },
        { a: 'fe', b: 'c3', order: 1, ionic: true, formAt: [0.57, 0.74] }
      ],
      transfers: [
        {
          id: 'e1', window: [0.32, 0.52],
          from: [0.40, 0.40], to: [0.58, 0.32],
          label: '第 1 个 e⁻：Fe → Cl'
        },
        {
          id: 'e2', window: [0.38, 0.58],
          from: [0.40, 0.50], to: [0.66, 0.50],
          label: '第 2 个 e⁻：Fe → Cl'
        },
        {
          id: 'e3', window: [0.44, 0.64],
          from: [0.40, 0.60], to: [0.58, 0.68],
          label: '第 3 个 e⁻：Fe → Cl（只有强氧化剂做得到）'
        }
      ],
      labels: [
        { at: 0.20, text: 'Fe：3d⁶4s² 价层藏着 2+1 个可失电子', pos: [0.28, 0.12] },
        { at: 0.46, text: '对照：弱氧化剂 H⁺ 只夺 2 个 4s 电子 → 浅绿 Fe²⁺', pos: [0.50, 0.90] },
        { at: 0.66, text: '强氧化剂 Cl₂（电负性 3.16）再夺 1 个 3d 电子', pos: [0.72, 0.16], anchor: [0.44, 0.42] },
        { at: 0.86, text: 'Fe³⁺（棕黄）vs Fe²⁺（浅绿）——价态是氧化剂定的', pos: [0.50, 0.14] }
      ],
      takeaway:
        '变价金属的终点价态，由氧化剂的“胃口”决定：Fe 的价层是 3d⁶4s²，弱氧化剂 H⁺ 电负性仅 2.20，' +
        '只能夺走 2 个 4s 电子止步 Fe²⁺（浅绿色）；强氧化剂 Cl₂ 电负性高达 3.16，能突破 3d 门槛再抽走 1 个电子，直达 Fe³⁺（棕黄色）。' +
        '注意：水溶液中氧化性强弱以电极电势判，电负性仅作定性参考。' +
        '这就是 2Fe+3Cl₂→2FeCl₃ 与 Fe+2H⁺→Fe²⁺+H₂↑ 的本质差别。对照记牢：氧化剂越强，变价金属被推得越高——Fe³⁺/Fe²⁺ 的颜色分野，就是氧化剂强弱的可视化判决。'
    },

    /* ---------------- 人话解说卡片 ---------------- */
    narration: [
      {
        from: 0.00, to: 0.25,
        title: '① 反应前 · 双场对照',
        text:
          '左边试管：铁粉浸在稀盐酸里，H⁺ 是弱氧化剂，虎视眈眈却力道有限。' +
          '右边集气瓶：黄绿色氯气里悬着炽热铁丝，Cl₂ 电负性 3.16，是个不折不扣的强氧化剂。' +
          '同一种铁，即将被两种氧化剂“开”出两种价态。'
      },
      {
        from: 0.25, to: 0.50,
        title: '② 断键 · 价层攻防',
        text:
          '右边 Cl—Cl 键被拉断，氯原子直扑铁的 3d⁶4s² 价层；左边 H⁺ 也围了上来。' +
          '关键差别在“胃口”：H⁺ 只够夺走 2 个 4s 电子，Cl₂ 却能连 3d 电子一并抽走。' +
          '电子被夺走的深度，决定了铁最终的价态。'
      },
      {
        from: 0.50, to: 0.75,
        title: '③ 变价 · 颜色分野',
        text:
          '左边铁慢慢溶解、缓慢冒泡，溶液变成浅绿色——Fe²⁺ 登场。' +
          '右边铁丝剧烈燃烧、棕褐色的烟弥漫，最终得到棕黄色溶液——Fe³⁺ 登场。' +
          '3 个电子 vs 2 个电子的差距，被两种颜色一眼钉死。'
      },
      {
        from: 0.75, to: 1.01,
        title: '④ 新稳态 · 强弱定档',
        text:
          'FeCl₃（棕黄）与 FeCl₂（浅绿）就是这场博弈的两份判决书。' +
          '工业上顺势而为：酸洗除锈产物视条件为 Fe³⁺/Fe²⁺，蚀刻与混凝剂却用 Fe³⁺ 的强氧化性与高电荷。' +
          '记住口诀（前提：氧化剂足量）：氧化剂越强，变价金属价态越高——先判氧化剂强弱，再写生成物。'
      }
    ]
  };

  /* ====================================================================== */
  /* 卡带 25：CO₂ 通入 NaOH 的分步定量吸收（CO₃²⁻ → HCO₃⁻）                 */
  /* ====================================================================== */

  var co2NaohStepwise = {
    id: 'co2_naoh_stepwise',
    badge: 'mix',
    chapter: ch(CH_QUANT, 3),
    name: 'CO₂ 通入 NaOH 的分步定量吸收：CO₃²⁻ → HCO₃⁻',
    shortName: 'CO₂ 分步吸收',
    icon: '🌀',
    equation: 'CO₂ + OH⁻ === HCO₃⁻   （分步：2OH⁻+CO₂→CO₃²⁻+H₂O → CO₃²⁻+CO₂+H₂O→2HCO₃⁻）',
    type: '分步反应（连续质子化）',
    typeDesc: '先升 CO₃²⁻ · 后起 HCO₃⁻ · 定量吸收',
    summary:
      '向 NaOH 溶液中通入过量 CO₂，吸收分两段接力：先是 2OH⁻ + CO₂ → CO₃²⁻ + H₂O，平面三角的 CO₃²⁻ 浓度先升后降；' +
      '随后过量 CO₂ 把 CO₃²⁻ 再质子化：CO₃²⁻ + CO₂ + H₂O → 2HCO₃⁻，HCO₃⁻ 在后半程持续升起。' +
      '总反应 CO₂ + OH⁻ === HCO₃⁻，Na⁺ 全程旁观只维持电中性（开启聚焦实质即弱化）——' +
      '碳氧粒子从平面三角 CO₃²⁻ 结合质子转变为两个 HCO₃⁻，这就是分步定量吸收的微观剧本。',
    energyProfile: { dh: -68.5, ea: 52 },
    relatedTerms: ['mole_stoichiometry', 'radical_group'],
    legend: legendBase([
      { kind: 'atom', el: 'C', label: '碳原子 C（CO₃²⁻ / HCO₃⁻ 的骨架）', color: C.C },
      { kind: 'atom', el: 'O', label: '氧原子 O（碳酸根与水的骨架）', color: C.O },
      { kind: 'atom', el: 'H', label: '氢原子 H（质子 H⁺ 的载体）', color: C.H },
      { kind: 'atom', el: 'Na', label: '钠离子 Na⁺（旁观离子 · 全程不参与）', color: C.Na }
    ]),

    /* ---------------- L1 宏观实验台 ---------------- */
    macro: {
      scene: 'co2_naoh_stepwise',
      conditions: '常温 · 过量 CO₂ 持续通入',
      vesselLabel: 'CO₂ → NaOH 溶液（洗气瓶）',
      productLabel: 'HCO₃⁻（后半程主导）',
      phenomena: [
        { at: 0.18, label: 'CO₂ 持续鼓入 NaOH 溶液，气泡翻腾' },
        { at: 0.40, label: '第一阶段：CO₃²⁻ 摩尔分数快速攀升至峰值' },
        { at: 0.62, label: '过量 CO₂ 反攻：CO₃²⁻ 先升后降、HCO₃⁻ 后半程升起' },
        { at: 0.86, label: '双曲线交汇——HCO₃⁻ 成为溶液中的主导碳物种' }
      ]
    },

    /* ---------------- L2 分子动力学层 ---------------- */
    /* 2OH⁻ + CO₂ → CO₃²⁻ + H₂O，随后过量 CO₂ + CO₃²⁻ + H₂O → 2HCO₃⁻ */
    molecular: {
      atoms: [
        // CO₂ #1（第一阶段被吸收）
        { id: 'c1', el: 'C', jitter: 0.55, start: [0.18, 0.42], mid: [0.28, 0.46], end: [0.34, 0.50] },
        { id: 'o1', el: 'O', jitter: 0.65, start: [0.10, 0.30], mid: [0.20, 0.34], end: [0.28, 0.34] },
        { id: 'o2', el: 'O', jitter: 0.65, start: [0.10, 0.54], mid: [0.20, 0.56], end: [0.30, 0.66] },
        // OH⁻ #1（o3-h1）
        { id: 'o3', el: 'O', jitter: 0.65, start: [0.42, 0.24], mid: [0.40, 0.34], end: [0.38, 0.42] },
        { id: 'h1', el: 'H', jitter: 1.15, start: [0.50, 0.18], mid: [0.54, 0.28], end: [0.60, 0.48] },
        // OH⁻ #2（o4-h2）
        { id: 'o4', el: 'O', jitter: 0.65, start: [0.58, 0.72], mid: [0.58, 0.62], end: [0.64, 0.56] },
        { id: 'h2', el: 'H', jitter: 1.15, start: [0.64, 0.80], mid: [0.62, 0.72], end: [0.26, 0.30] },
        // CO₂ #2（过量 CO₂ · 第二阶段反攻）
        { id: 'c2', el: 'C', jitter: 0.55, start: [0.82, 0.30], mid: [0.78, 0.40], end: [0.72, 0.46] },
        { id: 'o5', el: 'O', jitter: 0.65, start: [0.90, 0.20], mid: [0.86, 0.28], end: [0.80, 0.32] },
        { id: 'o6', el: 'O', jitter: 0.65, start: [0.90, 0.42], mid: [0.86, 0.48], end: [0.78, 0.60] },
        // Na⁺ 旁观离子 ×2（2OH⁻ 配 2Na⁺，维持电中性）
        { id: 'na', el: 'Na', jitter: 0.5, spectator: true, start: [0.88, 0.70], mid: [0.86, 0.74], end: [0.88, 0.72] },
        { id: 'na2', el: 'Na', jitter: 0.5, spectator: true, start: [0.76, 0.86], mid: [0.78, 0.88], end: [0.76, 0.86] }
      ],
      bonds: [
        // 第一阶段：2OH⁻ + CO₂ → CO₃²⁻ + H₂O
        { a: 'c1', b: 'o1', order: 2 },                                   // C=O 保留为羰基
        { a: 'c1', b: 'o2', order: 2, breakAt: [0.30, 0.44] },            // C=O 双键削弱
        { a: 'c1', b: 'o2', order: 1, formAt: [0.52, 0.66] },             // 重建为 C-O 单键
        { a: 'o3', b: 'h1', order: 1, breakAt: [0.28, 0.46] },            // OH⁻#1 的 O-H 断裂
        { a: 'c1', b: 'o3', order: 1, formAt: [0.50, 0.66] },             // C-O：CO₃²⁻ 平面三角落定
        { a: 'o4', b: 'h1', order: 1, formAt: [0.52, 0.68] },             // H₁ 并入 OH⁻#2 → H₂O
        // 第二阶段：过量 CO₂ + CO₃²⁻ + H₂O → 2HCO₃⁻
        { a: 'o4', b: 'h2', order: 1, breakAt: [0.62, 0.78] },            // H₂O 的 O-H 断裂
        { a: 'o3', b: 'h2', order: 1, formAt: [0.70, 0.86] },             // HCO₃⁻ #1 的 O-H（质子落到单键氧）
        { a: 'c2', b: 'o5', order: 2 },                                   // C=O 保留为羰基
        { a: 'c2', b: 'o6', order: 2, breakAt: [0.62, 0.78] },            // C=O 双键削弱
        { a: 'c2', b: 'o6', order: 1, formAt: [0.72, 0.88] },             // 重建为 C-O 单键（HCO₃⁻ 中碳键级=4）
        { a: 'c2', b: 'o4', order: 1, formAt: [0.72, 0.88] }              // HCO₃⁻ #2 的 C-O
      ],
      captions: [
        { from: 0.00, to: 0.25, text: '过量 CO₂ 通入 NaOH 溶液：CO₂、OH⁻ 与旁观 Na⁺ 各自漂游' },
        { from: 0.25, to: 0.50, text: '第一阶段：2OH⁻ + CO₂ → CO₃²⁻ + H₂O（断 O—H，成 C—O）' },
        { from: 0.50, to: 0.75, text: 'CO₃²⁻（平面三角）峰值过后，过量 CO₂ 反攻：CO₃²⁻ + CO₂ + H₂O → 2HCO₃⁻' },
        { from: 0.75, to: 1.01, text: '两个 HCO₃⁻ 落定；Na⁺ 全程旁观——分步定量吸收完成' }
      ]
    },

    /* ---------------- L3 原子/电子重排层（CO₃²⁻ 结合质子 → 2HCO₃⁻） ---------------- */
    atomic: {
      atoms: [
        // 左侧 CO₃²⁻（平面三角）→ HCO₃⁻ #1
        { id: 'c1', el: 'C', shells: [2, 4], start: [0.22, 0.48], mid: [0.22, 0.48], end: [0.22, 0.48] },
        {
          id: 'o1', el: 'O', shells: [2, 6], start: [0.10, 0.32], mid: [0.10, 0.32], end: [0.10, 0.32],
          ion: { label: 'O（结合质子 → HCO₃⁻）', from: 0.62 }
        },
        { id: 'o2', el: 'O', shells: [2, 6], start: [0.10, 0.64], mid: [0.10, 0.64], end: [0.10, 0.64] },
        { id: 'o3', el: 'O', shells: [2, 6], start: [0.32, 0.48], mid: [0.32, 0.48], end: [0.32, 0.48] },
        { id: 'h1', el: 'H', shells: [1], start: [0.22, 0.16], mid: [0.16, 0.22], end: [0.10, 0.24] },
        // 右侧第二个碳氧单元 → HCO₃⁻ #2
        { id: 'c2', el: 'C', shells: [2, 4], start: [0.72, 0.48], mid: [0.72, 0.48], end: [0.72, 0.48] },
        {
          id: 'o4', el: 'O', shells: [2, 6], start: [0.60, 0.32], mid: [0.60, 0.32], end: [0.60, 0.32],
          ion: { label: 'O（结合质子 → HCO₃⁻）', from: 0.62 }
        },
        { id: 'o5', el: 'O', shells: [2, 6], start: [0.60, 0.64], mid: [0.60, 0.64], end: [0.60, 0.64] },
        { id: 'o6', el: 'O', shells: [2, 6], start: [0.84, 0.48], mid: [0.84, 0.48], end: [0.84, 0.48] },
        { id: 'h2', el: 'H', shells: [1], start: [0.72, 0.16], mid: [0.66, 0.22], end: [0.60, 0.24] },
        // Na⁺ 旁观 ×2（维持电中性）
        {
          id: 'na', el: 'Na', shells: [2, 8], spectator: true,
          start: [0.50, 0.86], mid: [0.50, 0.86], end: [0.50, 0.86],
          ion: { label: 'Na⁺（旁观离子 · 只维持电中性）', from: 0.30 }
        },
        {
          id: 'na2', el: 'Na', shells: [2, 8], spectator: true,
          start: [0.32, 0.88], mid: [0.32, 0.88], end: [0.32, 0.88],
          ion: { label: 'Na⁺（旁观离子 · 只维持电中性）', from: 0.30 }
        }
      ],
      bonds: [
        // 平面三角 CO₃²⁻ 骨架
        { a: 'c1', b: 'o1', order: 1, pairs: 1 },
        { a: 'c1', b: 'o2', order: 1, pairs: 1 },
        { a: 'c1', b: 'o3', order: 2, pairs: 2 },
        { a: 'c2', b: 'o4', order: 1, pairs: 1 },
        { a: 'c2', b: 'o5', order: 1, pairs: 1 },
        { a: 'c2', b: 'o6', order: 2, pairs: 2 },
        // 质子化：H⁺ 落到 O 上 → HCO₃⁻
        { a: 'o1', b: 'h1', order: 1, pairs: 1, formAt: [0.55, 0.72] },
        { a: 'o4', b: 'h2', order: 1, pairs: 1, formAt: [0.58, 0.75] }
      ],
      transfers: [
        {
          id: 'proton-1', window: [0.36, 0.58],
          from: [0.22, 0.16], to: [0.10, 0.28],
          label: '质子 H⁺ 扑向 CO₃²⁻ 的氧端（第一步质子化，粒子迁移，非电子转移）'
        },
        {
          id: 'proton-2', window: [0.56, 0.76],
          from: [0.72, 0.16], to: [0.60, 0.28],
          label: 'H₂O 供出质子 / CO₂ 与 OH⁻ 结合（第二步质子化，粒子迁移，非电子转移）'
        }
      ],
      labels: [
        { at: 0.20, text: 'CO₃²⁻：平面三角（C 牵 3 个 O）', pos: [0.24, 0.12] },
        { at: 0.46, text: 'CO₃²⁻ 先升后降 · HCO₃⁻ 后半程升起', pos: [0.50, 0.92] },
        { at: 0.66, text: 'H⁺ 落到 O 上 → HCO₃⁻', pos: [0.18, 0.82], anchor: [0.12, 0.34] },
        { at: 0.86, text: '2 个 HCO₃⁻ 落定（Na⁺ 旁观）——定量吸收收口', pos: [0.50, 0.12] }
      ],
      takeaway:
        'CO₂ 通入 NaOH 是典型的分步定量吸收：第一阶段 2OH⁻ + CO₂ → CO₃²⁻ + H₂O，碳氧粒子拼出平面三角的 CO₃²⁻（摩尔分数先升后降）；' +
        '第二阶段 H₂O 供出质子、CO₂ 与 OH⁻ 结合，CO₃²⁻ + CO₂ + H₂O → 2HCO₃⁻，HCO₃⁻ 在后半程持续升起并最终主导。' +
        '总反应 CO₂ + OH⁻ === HCO₃⁻ 的背后，是“CO₃²⁻ → HCO₃⁻ 连续质子化”的两段接力；Na⁺ 全程旁观只维持电中性（聚焦实质时弱化）。' +
        '工业脱碳塔按这条双曲线设计 pH 窗口与液气比，实验室“先沉淀后溶解”的石灰水变清现象，也是同一分步剧本的宏观回声。'
    },

    /* ---------------- 人话解说卡片 ---------------- */
    narration: [
      {
        from: 0.00, to: 0.25,
        title: '① 反应前 · 碱液待命',
        text:
          '洗气瓶里是 NaOH 溶液：OH⁻ 与旁观的 Na⁺ 在水里漂游，CO₂ 正从长导管鼓进来。' +
          '注意 Na⁺——它从头到尾不参与反应，只负责维持电中性，是标准的旁观离子。' +
          '接下来的吸收，会分成两段接力完成。'
      },
      {
        from: 0.25, to: 0.50,
        title: '② 第一阶段 · 生出碳酸根',
        text:
          'OH⁻ 过量时，CO₂ 被两个 OH⁻ 夹击：2OH⁻ + CO₂ → CO₃²⁻ + H₂O。' +
          '碳原子牵起 3 个氧，拼出平面三角的 CO₃²⁻——它的摩尔分数一路攀升到峰值。' +
          '宏观上这就是“碱过量、只生成正盐”的阶段。'
      },
      {
        from: 0.50, to: 0.75,
        title: '③ 第二阶段 · 碳酸根再质子化',
        text:
          '继续通过量 CO₂，剧情反转：CO₃²⁻ + CO₂ + H₂O → 2HCO₃⁻。' +
          'CO₃²⁻ 被质子“点名”，平面三角的碳酸根结合质子，一个接一个转变为 HCO₃⁻。' +
          '双曲线指示条上 CO₃²⁻ 先升后降、HCO₃⁻ 后半程升起，正是这段接力的实时心电图。'
      },
      {
        from: 0.75, to: 1.01,
        title: '④ 新稳态 · 碳酸氢根主导',
        text:
          '最终溶液里的主导碳物种是 HCO₃⁻：总反应 CO₂ + OH⁻ === HCO₃⁻，但微观上走了两段。' +
          '记住分步反应的分析法：先写第一步的正盐，再写过量试剂推动的第二步，最后叠加消去中间产物。' +
          '从实验室石灰水“先浑后清”，到火电厂脱碳塔的 pH 窗口控制，全是这条分步曲线的工程延伸。'
      }
    ]
  };

  /* ====================================================================== */
  /* 卡带 26：强酸强碱中和滴定与计量点 pH 突跃（HCl + NaOH）                 */
  /* ====================================================================== */

  var acidBaseTitration = {
    id: 'acid_base_titration',
    badge: 'dbl',
    chapter: ch(CH_QUANT, 4),
    name: '强酸强碱中和滴定：计量点 pH 突跃',
    shortName: '中和滴定突跃',
    icon: '🎯',
    equation: 'HCl + NaOH === NaCl + H₂O   （离子实质：H⁺ + OH⁻ === H₂O）',
    type: '复分解反应（中和滴定）',
    typeDesc: '1:1 精准捕获 · 计量点 pH 跨数量级突跃',
    summary:
      '滴定管里的 OH⁻ 逐滴滴入锥形瓶，与游离的 H⁺（或 H₃O⁺）按 1:1 精准捕获结合为 H₂O 分子；' +
      'Cl⁻ 与 Na⁺ 是旁观离子（spectator），只维持电中性。当最后一个 H⁺ 在 t ≈ 0.75 计量点被中和的瞬间，' +
      '体系 pH 发生跨数量级突跃（0.1 mol/L、25℃ 为例：pH 1.0 → 2.3 → 7.00（计量点）→ 9.8）；' +
      '计量点之后半滴至一滴，pH 冲过 8.2，酚酞指示剂分子构型翻转显色、溶液由无色突变为浅粉红——这才是滴定终点（与计量点相差半滴至一滴）。',
    energyProfile: { dh: -57.3, ea: 18 },
    relatedTerms: ['ph_titration_jump'],
    legend: legendBase([
      { kind: 'atom', el: 'H', label: '氢原子 H（H⁺ / OH⁻ 的主角）', color: C.H },
      { kind: 'atom', el: 'O', label: '氧原子 O（OH⁻ 与 H₂O 的骨架）', color: C.O },
      { kind: 'atom', el: 'Na', label: '钠离子 Na⁺（旁观离子 · 全程不参与）', color: C.Na },
      { kind: 'atom', el: 'Cl', label: '氯离子 Cl⁻（旁观离子 · 全程不参与）', color: C.Cl }
    ]),

    /* ---------------- L1 宏观实验台 ---------------- */
    macro: {
      scene: 'acid_base_titration',
      conditions: '常温 · 边滴边振摇 · 酚酞指示',
      vesselLabel: '酸式/碱式滴定管 + 锥形瓶',
      productLabel: '计量点：无色 → 浅粉红（pH 突跃）',
      phenomena: [
        { at: 0.18, label: '碱式滴定管逐滴滴下 NaOH，锥形瓶持续振摇' },
        { at: 0.42, label: 'H⁺ 被 OH⁻ 1:1 捕获，pH 缓升（1.0 → 2.3）' },
        { at: 0.75, label: '最后一个 H⁺ 被中和：pH 突跃至 7.00！' },
        { at: 0.88, label: '酚酞翻转显色，溶液突变为浅粉红（终点）' }
      ]
    },

    /* ---------------- L2 分子动力学层 ---------------- */
    /* 2H⁺ + 2OH⁻ → 2H₂O（离子反应瞬时完成）；Na⁺ / Cl⁻ 旁观 */
    molecular: {
      atoms: [
        // 游离 H⁺（逐批被滴入的 OH⁻ 捕获）
        { id: 'h1', el: 'H', jitter: 1.15, start: [0.26, 0.30], mid: [0.32, 0.38], end: [0.34, 0.42] },
        { id: 'h2', el: 'H', jitter: 1.15, start: [0.72, 0.24], mid: [0.68, 0.36], end: [0.62, 0.58] },
        // OH⁻ #1（o1-h3）
        { id: 'o1', el: 'O', jitter: 0.65, start: [0.42, 0.42], mid: [0.42, 0.42], end: [0.42, 0.44] },
        { id: 'h3', el: 'H', jitter: 1.15, start: [0.50, 0.32], mid: [0.50, 0.32], end: [0.50, 0.34] },
        // OH⁻ #2（o2-h4）
        { id: 'o2', el: 'O', jitter: 0.65, start: [0.56, 0.62], mid: [0.56, 0.62], end: [0.56, 0.64] },
        { id: 'h4', el: 'H', jitter: 1.15, start: [0.48, 0.72], mid: [0.48, 0.72], end: [0.48, 0.74] },
        // 旁观离子：2 Na⁺ 配 2 OH⁻、2 Cl⁻ 配 2 H⁺
        { id: 'na', el: 'Na', jitter: 0.5, spectator: true, start: [0.18, 0.72], mid: [0.20, 0.76], end: [0.18, 0.74] },
        { id: 'na2', el: 'Na', jitter: 0.5, spectator: true, start: [0.10, 0.88], mid: [0.12, 0.90], end: [0.10, 0.88] },
        { id: 'cl', el: 'Cl', jitter: 0.5, spectator: true, start: [0.84, 0.68], mid: [0.82, 0.72], end: [0.84, 0.70] },
        { id: 'cl2', el: 'Cl', jitter: 0.5, spectator: true, start: [0.92, 0.86], mid: [0.90, 0.88], end: [0.92, 0.86] }
      ],
      bonds: [
        // OH⁻ 的 O—H 键全程保留（进入 H₂O）
        { a: 'o1', b: 'h3', order: 1 },
        { a: 'o2', b: 'h4', order: 1 },
        // 无旧键断裂：H⁺ 直接被 O 的孤对电子捕获（离子反应，Ea 极低）
        { a: 'o1', b: 'h1', order: 1, formAt: [0.30, 0.50] },
        // 最后一个 H⁺ 在计量点 t≈0.75 被中和
        { a: 'o2', b: 'h2', order: 1, formAt: [0.55, 0.75] }
      ],
      captions: [
        { from: 0.00, to: 0.25, text: 'H⁺（或 H₃O⁺）在酸液中游离，OH⁻ 逐滴滴入；Na⁺ / Cl⁻ 旁观' },
        { from: 0.25, to: 0.50, text: 'OH⁻ 的 O 亮出孤对电子，1:1 精准捕获 H⁺ 结合为 H₂O' },
        { from: 0.50, to: 0.75, text: '最后一个 H⁺ 在计量点被中和——pH 跨数量级突跃！' },
        { from: 0.75, to: 1.01, text: '酚酞构型翻转显色（浅粉红）；Na⁺ / Cl⁻ 全程旁观' }
      ]
    },

    /* ---------------- L3 原子/电子重排层（孤对电子捕获 H⁺） ---------------- */
    atomic: {
      atoms: [
        {
          id: 'h1', el: 'H', shells: [],
          start: [0.30, 0.28], mid: [0.34, 0.36], end: [0.36, 0.40],
          ion: { label: 'H⁺（酸中游离）', from: 0.12 }
        },
        {
          id: 'h2', el: 'H', shells: [],
          start: [0.72, 0.24], mid: [0.66, 0.38], end: [0.62, 0.58],
          ion: { label: '最后一个 H⁺ · 计量点中和', from: 0.62 }
        },
        {
          id: 'o1', el: 'O', shells: [2, 6],
          start: [0.42, 0.46], mid: [0.42, 0.46], end: [0.42, 0.46],
          ion: { label: 'O（孤对电子捕获 H⁺）', from: 0.62 }
        },
        { id: 'h3', el: 'H', shells: [1], start: [0.52, 0.34], mid: [0.52, 0.34], end: [0.52, 0.34] },
        { id: 'o2', el: 'O', shells: [2, 6], start: [0.58, 0.64], mid: [0.58, 0.64], end: [0.58, 0.64] },
        { id: 'h4', el: 'H', shells: [1], start: [0.48, 0.76], mid: [0.48, 0.76], end: [0.48, 0.76] },
        // 旁观离子：2 Na⁺、2 Cl⁻（配平系数）
        {
          id: 'na', el: 'Na', shells: [2, 8], spectator: true,
          start: [0.18, 0.78], mid: [0.18, 0.78], end: [0.18, 0.78],
          ion: { label: 'Na⁺（旁观离子）', from: 0.30 }
        },
        {
          id: 'na2', el: 'Na', shells: [2, 8], spectator: true,
          start: [0.10, 0.90], mid: [0.10, 0.90], end: [0.10, 0.90],
          ion: { label: 'Na⁺（旁观离子）', from: 0.30 }
        },
        {
          id: 'cl', el: 'Cl', shells: [2, 8, 8], spectator: true,
          start: [0.84, 0.78], mid: [0.84, 0.78], end: [0.84, 0.78],
          ion: { label: 'Cl⁻（旁观离子）', from: 0.30 }
        },
        {
          id: 'cl2', el: 'Cl', shells: [2, 8, 8], spectator: true,
          start: [0.92, 0.90], mid: [0.92, 0.90], end: [0.92, 0.90],
          ion: { label: 'Cl⁻（旁观离子）', from: 0.30 }
        }
      ],
      bonds: [
        // OH⁻ 内部共价键（保留进水）
        { a: 'o1', b: 'h3', order: 1, pairs: 1 },
        { a: 'o2', b: 'h4', order: 1, pairs: 1 },
        // O 的孤对电子捕获 H⁺（配位式成键，离子反应瞬时完成）
        { a: 'o1', b: 'h1', order: 1, pairs: 1, formAt: [0.30, 0.50] },
        { a: 'o2', b: 'h2', order: 1, pairs: 1, formAt: [0.55, 0.75] }
      ],
      transfers: [
        {
          id: 'lone-pair-1', window: [0.28, 0.48],
          from: [0.38, 0.52], to: [0.33, 0.34],
          label: 'OH⁻ 的孤对电子扑向 H⁺（1:1 捕获）'
        },
        {
          id: 'lone-pair-2', window: [0.55, 0.75],
          from: [0.54, 0.70], to: [0.60, 0.56],
          label: '最后一个 H⁺ 被捕获 → 计量点 pH 突跃'
        }
      ],
      labels: [
        { at: 0.20, text: '酸中游离 H⁺（或 H₃O⁺）与 OH⁻ 1:1 待命', pos: [0.50, 0.12] },
        { at: 0.46, text: 'OH⁻ 的 O 孤对电子捕获 H⁺ → H₂O', pos: [0.50, 0.92] },
        { at: 0.74, text: '最后一个 H⁺ 被中和！pH: 2.3 → 7.00 突跃', pos: [0.24, 0.16], anchor: [0.40, 0.42] },
        { at: 0.88, text: 'Na⁺ / Cl⁻ 旁观——离子实质只有 H⁺ + OH⁻ → H₂O', pos: [0.50, 0.14] }
      ],
      takeaway:
        '中和滴定的微观实质只有一句话：H⁺ + OH⁻ → H₂O。Na⁺ 与 Cl⁻ 全程旁观（spectator），只维持电中性；' +
        'OH⁻ 的氧原子亮出孤对电子，把游离的 H⁺ 按 1:1 精准捕获结合成极弱电解质水——离子反应活化能极低，瞬时完成。' +
        '当最后一个 H⁺ 在计量点（t≈0.75）被中和，体系失去缓冲能力，pH 从 2.3 跨数量级突跃到 7.00 再冲向 9.8；' +
        '酚酞分子构型随之翻转显色，溶液由无色突变为浅粉红。看懂这条突跃曲线，就看懂了滴定分析“差一滴定乾坤”的全部物理化学。'
    },

    /* ---------------- 人话解说卡片 ---------------- */
    narration: [
      {
        from: 0.00, to: 0.25,
        title: '① 反应前 · 酸液待滴',
        text:
          '锥形瓶里是稀盐酸与酚酞（此刻无色）：H⁺（或 H₃O⁺）在水中游离，Cl⁻ 陪跑。' +
          '头顶的碱式滴定管里装着 NaOH，OH⁻ 正准备逐滴滴落，Na⁺ 同样只是旁观。' +
          '一场 1:1 的精准捕获即将开场。'
      },
      {
        from: 0.25, to: 0.50,
        title: '② 逐滴捕获 · pH 缓升',
        text:
          'OH⁻ 每滴一滴就被 H⁺ 迎头撞上：O 的孤对电子把 H⁺ 捕获结合成 H₂O。' +
          '因为是 1:1 反应，H⁺ 浓度稳步下降、pH 缓升（1.0 → 2.3），但只要还有 H⁺ 剩余，酚酞仍保持无色。' +
          '注意 Na⁺ 与 Cl⁻——它们全程袖手旁观。'
      },
      {
        from: 0.50, to: 0.75,
        title: '③ 计量点 · pH 突跃',
        text:
          '当最后一个 H⁺ 被中和的瞬间（t ≈ 0.75 计量点），体系里既无剩余 H⁺ 也几乎无过量 OH⁻，' +
          'pH 发生跨数量级突跃：2.3 → 7.00（计量点突跃!）→ 9.8。' +
          '一滴 NaOH 之差，就能让 pH 跳好几个单位——滴定分析的全部张力都在这一跳里。'
      },
      {
        from: 0.75, to: 1.01,
        title: '④ 终点 · 显色收口',
        text:
          'pH 冲过酚酞变色域（8~10），指示剂分子构型瞬间翻转，溶液由无色突变为浅粉红色——滴定终点到了！' +
          '此时读出滴定管读数，就能按 HCl ~ NaOH 的 1:1 计量关系算出酸的准确浓度。' +
          '从实验室滴定管到工业 AWT 中和池的 pH 闭环，同一套“计量点突跃”原理在守着排放红线。'
      }
    ]
  };

  /* ---------------------------------------------------------------------- */
  /* 挂载到全局卡带注册表                                                    */
  /* ---------------------------------------------------------------------- */

  root.CHEM_CARTRIDGES = root.CHEM_CARTRIDGES || [];
  root.CHEM_CARTRIDGES.push(limitingH2O2, feOxidantGame, co2NaohStepwise, acidBaseTitration);
})(typeof window !== 'undefined' ? window : globalThis);
