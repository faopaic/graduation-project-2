// ===== ゲームの仕組み =====
// 画面とは別に、数字や出来事の計算だけを書いています。
// S = ゲームの今の状態(資金、日付、社員、案件など)

let rand = Math.random;

// テスト用: 同じ乱数の並びで再現できるようにする
function setSeed(seed) {
  let a = seed >>> 0;
  rand = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const yen = (n) => (n < 0 ? '-' : '') + '¥' + Math.abs(Math.round(n)).toLocaleString('en-US');

let S = null;

// ----- 便利な関数 -----
const levelInfo = () => LEVELS[S.level - 1];
const empById = (id) => S.employees.find((e) => e.id === id);
const jobById = (id) => S.jobs.find((j) => j.id === id);
const isAbsent = (e) => S.day < e.absentUntil;
const isWorking = (e) => !isAbsent(e) || S.day < e.coveredUntil;
const remainDays = (job) => job.deadline - S.day;
const monthlyCost = () => S.employees.reduce((s, e) => s + e.salary, 0) + CONFIG.officeCost;
const newId = () => S.nextId++;
const addMoney = (n) => { S.money += n; };
const addRep = (n) => { S.rep = clamp(S.rep + n, 0, 100); };   // 評判は 0〜100
const addProgress = (job, frac) => { job.progress = clamp(job.progress + frac * job.work, 0, job.work * 0.99); };
const schedule = (afterDays, type, data) => { S.schedule.push(Object.assign({ day: S.day + afterDays, type }, data)); };

function dateOf(day) { return new Date(CONFIG.startYear, CONFIG.startMonth, 1 + day); }
function dateLabel(day) {
  const d = dateOf(day);
  const yearNo = Math.min(5, Math.floor(day / 365) + 1);
  return `${yearNo}年目 ${d.getMonth() + 1}月${d.getDate()}日`;
}

function log(text, kind) {
  S.log.unshift({ day: S.day, text, kind: kind || '' });
  if (S.log.length > 60) S.log.pop();
}
function notify(text, kind) { S.notices.push({ text, kind: kind || 'info' }); }
function raise(p) { S.queue.push(p); }
function advance() { S.pending = S.queue.length ? S.queue.shift() : null; S.dirty = true; return S.pending; }

// ----- ゲーム開始 -----
function newGame() {
  S = {
    day: 0, money: CONFIG.startMoney, rep: CONFIG.startRep, level: 1,
    done: 0, big: 0,
    employees: [], jobs: [], offers: [], candidates: [],
    invest: { backup: 0, security: 0, qa: 0 },
    boost: {}, schedule: [], queue: [], pending: null, over: null, dirty: true,
    nextIncidentDay: CONFIG.firstIncidentDay, nextOfferDay: 14, nextCandDay: 60, firstDone: false,
    log: [], notices: [], marks: [], history: [{ day: 0, money: CONFIG.startMoney, rep: CONFIG.startRep }], turns: [], lvFx: false,
    tally: { honest: 0, hide: 0, incidents: 0 },
    counts: { accepted: 0, hired: 0, handled: 0 },
    stats: { promos: 0, learned: 0 },
    nextId: 1, playing: false, speedIdx: CONFIG.defaultSpeed
  };
  START_STAFF.forEach((s) => addEmployee(s.name, s.skill, s.lv));
  ['web', 'lp', 'inv'].forEach((id) => newOffer(id));
  refreshCandidates();
  log('会社を設立した。まずは案件を受注しよう。');
  return S;
}

function addEmployee(name, skill, lv) {
  const e = {
    id: newId(), name, skill, lv, salary: SALARY[lv], job: null, absentUntil: 0, coveredUntil: 0,
    skills: [skill],                                   // できるスキル(本職 + 覚えたもの)
    exp: lv === 1 ? 0 : CONFIG.levelExp[lv],           // 案件で働いた日数
    learn: {}                                          // スキルごとの勉強の進み具合(日数)
  };
  S.employees.push(e);
  return e;
}

// ----- 社員の成長 -----
const xpPct = (e) => {
  if (e.lv >= 3) return 100;
  const prev = e.lv === 1 ? 0 : CONFIG.levelExp[e.lv];
  const next = CONFIG.levelExp[e.lv + 1];
  return clamp(Math.floor((e.exp - prev) / (next - prev) * 100), 0, 100);
};
function growText(e) {
  let t = e.lv >= 3 ? 'Lv.3(最高)' : `経験 ${xpPct(e)}% → Lv.${e.lv + 1}`;
  let best = null;
  Object.keys(e.learn).forEach((sk) => { if (!best || e.learn[sk] > e.learn[best]) best = sk; });
  if (best && !e.skills.includes(best) && e.skills.length < CONFIG.maxSkills) t += ` / ${SKILLS[best]}を勉強中 ${Math.floor(e.learn[best] / CONFIG.learnDays * 100)}%`;
  return t;
}
const skillsLabel = (e) => e.skills.map((sk) => SKILLS[sk]).join('・');

// 案件で働いた社員は、経験がたまり、昇進したり、新しいスキルを覚えたりする
function trainStaff(job) {
  job.staff.forEach((id) => {
    const e = empById(id);
    if (!e || !isWorking(e)) return;
    e.exp++;
    if (e.lv < 3 && e.exp >= CONFIG.levelExp[e.lv + 1]) {
      e.lv++;
      e.salary = SALARY[e.lv];
      S.stats.promos++;
      S.dirty = true;
      log(`${e.name}が Lv.${e.lv} に昇進した(月給 ${yen(e.salary)})`, 'good');
      notify(`${e.name}が Lv.${e.lv} に昇進した。月給が${yen(e.salary)}に上がった`, 'good');
    }
    if (e.skills.length < CONFIG.maxSkills) {
      job.skills.forEach((sk) => {
        if (e.skills.includes(sk) || e.skills.length >= CONFIG.maxSkills) return;
        e.learn[sk] = (e.learn[sk] || 0) + 1;
        if (e.learn[sk] >= CONFIG.learnDays) {
          e.skills.push(sk);
          S.stats.learned++;
          S.dirty = true;
          log(`${e.name}が「${SKILLS[sk]}」もできるようになった`, 'good');
          notify(`${e.name}が「${SKILLS[sk]}」もできるようになった!`, 'good');
        }
      });
    }
  });
}

// ----- 案件の募集 -----
function newOffer(tid) {
  let t;
  if (tid) {
    t = JOB_TEMPLATES.find((x) => x.id === tid);
  } else {
    const ok = JOB_TEMPLATES.filter((x) => x.minRep <= S.rep + 30 && S.offers.filter((o) => o.tid === x.id).length < 2);
    if (!ok.length) return;
    t = pick(ok);
  }
  const reward = Math.round(t.reward * (0.9 + rand() * 0.2) / 10000) * 10000;
  S.offers.push({
    id: newId(), tid: t.id, name: t.name, diff: t.diff, reward, days: t.days, work: t.work,
    skills: t.skills, minRep: t.minRep, risk: t.risk, expires: S.day + 45
  });
  if (S.offers.length > 6) S.offers.shift();
  S.dirty = true;
}

function acceptOffer(id) {
  const o = S.offers.find((x) => x.id === id);
  if (!o) return { ok: false, msg: 'この案件は、募集が終わった' };
  if (S.rep < o.minRep) return { ok: false, msg: `評判が${o.minRep}になると受注できる` };
  if (S.jobs.length >= levelInfo().jobs) return { ok: false, msg: `同時に受けられるのは${levelInfo().jobs}件まで` };
  S.offers = S.offers.filter((x) => x.id !== id);
  const job = {
    id: newId(), tid: o.tid, name: o.name, diff: o.diff, reward: o.reward, work: o.work,
    progress: 0, start: S.day, deadline: S.day + o.days, skills: o.skills,
    staff: [], late: false, warned: false, qDebt: 0, qBonus: 0
  };
  S.jobs.push(job);
  S.counts.accepted++;
  log(`「${job.name}」を受注した`);
  autoAssign();
  S.dirty = true;
  return { ok: true, msg: `「${job.name}」を受注した。納期は${job.deadline - S.day}日後` };
}

// ----- 担当の割り振り -----
function assign(job, e) {
  unassign(e);
  e.job = job.id;
  job.staff.push(e.id);
}
function unassign(e) {
  if (!e.job) return;
  const j = jobById(e.job);
  if (j) j.staff = j.staff.filter((id) => id !== e.id);
  e.job = null;
}
function toggleAssign(jobId, empId) {
  const job = jobById(jobId), e = empById(empId);
  if (!job || !e) return;
  if (e.job === job.id) unassign(e); else assign(job, e);
  S.dirty = true;
}

// 手が空いている社員を、スキルが合う案件に割り振る
function autoAssign() {
  const idle = S.employees.filter((e) => !e.job).sort((a, b) => b.lv - a.lv);
  idle.forEach((e) => {
    const covered = (job, sk) => job.staff.some((id) => empById(id).skills.includes(sk));
    const needing = S.jobs.filter((j) => j.skills.some((sk) => e.skills.includes(sk) && !covered(j, sk)));
    const fitting = S.jobs.filter((j) => j.skills.some((sk) => e.skills.includes(sk)));
    // 合う案件がなければ、人手が少ない案件を手伝う(スキルが合わないので、力は半分)
    const target = needing[0]
      || fitting.sort((a, b) => a.staff.length - b.staff.length)[0]
      || S.jobs.slice().sort((a, b) => a.staff.length - b.staff.length)[0];
    if (target) assign(target, e);
  });
  S.dirty = true;
}

// 「おまかせ配置」ボタン: 全員を配置し直して、進行中のすべての案件に人を入れる
function autoAssignAll() {
  if (!S.jobs.length) return;
  S.employees.forEach((e) => unassign(e));
  const left = () => S.employees.filter((e) => !e.job).sort((a, b) => b.lv - a.lv);
  const covered = (job, sk) => job.staff.some((id) => empById(id).skills.includes(sk));
  const urgent = S.jobs.slice().sort((a, b) => (a.deadline - S.day) - (b.deadline - S.day));
  // 1) まず、どの案件にも1人ずつ(納期が近い案件から、合うスキルの人を優先)
  urgent.forEach((job) => {
    const pool = left();
    if (!pool.length) return;
    const e = pool.find((x) => job.skills.some((sk) => x.skills.includes(sk))) || pool[pool.length - 1];
    assign(job, e);
  });
  // 2) 残りの人は、足りないスキルがある案件 → 仕事が多く残っている案件の順に入れる
  left().forEach((e) => {
    const remain = (j) => (j.work - j.progress) / Math.max(1, j.staff.length);
    const needing = S.jobs.filter((j) => j.skills.some((sk) => e.skills.includes(sk) && !covered(j, sk)));
    const fitting = S.jobs.filter((j) => j.skills.some((sk) => e.skills.includes(sk)));
    const pool = needing.length ? needing : fitting.length ? fitting : S.jobs;
    assign(pool.slice().sort((a, b) => remain(b) - remain(a))[0], e);
  });
  S.dirty = true;
}

// ----- 採用 -----
function refreshCandidates() {
  S.candidates = [];
  for (let i = 0; i < 4; i++) S.candidates.push(makeCandidate());
  S.dirty = true;
}
function makeCandidate() {
  const used = S.employees.map((e) => e.name).concat(S.candidates.map((c) => c.name));
  const names = CANDIDATE_NAMES.filter((n) => !used.includes(n));
  const skills = ['dev', 'dev', 'dev', 'design', 'design', 'test', 'test', 'infra', 'infra', 'security'];
  const r = rand();
  const lv = r < 0.5 ? 1 : r < 0.85 ? 2 : 3;
  return { id: newId(), name: pick(names.length ? names : CANDIDATE_NAMES), skill: pick(skills), lv, salary: SALARY[lv] };
}
function hire(id) {
  const c = S.candidates.find((x) => x.id === id);
  if (!c) return { ok: false, msg: 'この人は、ほかの会社に決まった' };
  if (S.employees.length >= levelInfo().slots) return { ok: false, msg: '席がいっぱい。会社Lvが上がると、席が増える' };
  S.candidates = S.candidates.filter((x) => x.id !== id);
  addEmployee(c.name, c.skill, c.lv);
  S.counts.hired++;
  log(`${c.name}(${SKILLS[c.skill]})を採用した`);
  autoAssign();
  S.dirty = true;
  return { ok: true, msg: `${c.name}が入社した。月の支出が${yen(c.salary)}増える` };
}

// ----- 投資 -----
function buyInvest(key) {
  const inv = INVEST[key], lv = S.invest[key];
  if (lv >= inv.costs.length) return { ok: false, msg: 'もう最大まで強化している' };
  const cost = inv.costs[lv];
  if (S.money < cost) return { ok: false, msg: `資金が足りない(${yen(cost)}必要)` };
  S.money -= cost;
  S.invest[key]++;
  log(`${inv.name}を強化した(Lv.${S.invest[key]})`);
  S.dirty = true;
  return { ok: true, msg: `${inv.name}が Lv.${S.invest[key]} になった` };
}

// ----- 1日ぶんの進行 -----
// 本職のスキルが合えば1、覚えたスキルが合えば0.8、合わなければ0.5(手伝うだけ)
function skillFit(e, job) {
  if (job.skills.includes(e.skill)) return 1;
  if (job.skills.some((sk) => e.skills.includes(sk))) return CONFIG.learnedPower;
  return 0.5;
}

function jobPower(job) {
  let p = 0;
  job.staff.forEach((id) => {
    const e = empById(id);
    if (e && isWorking(e)) p += e.lv * skillFit(e, job);
  });
  if (S.boost[job.id] && S.day < S.boost[job.id]) p *= 1.4;
  return p;
}

function tick() {
  if (!S || S.over || S.pending) return;
  S.day++;
  const date = dateOf(S.day);
  if (S.day % 15 === 0) S.history.push({ day: S.day, money: S.money, rep: S.rep });

  S.employees.forEach((e) => {
    if (e.absentUntil > 0 && S.day === e.absentUntil) { S.dirty = true; log(`${e.name}が復帰した`); }
  });

  // 開発の進行
  S.jobs.slice().forEach((job) => {
    job.progress += jobPower(job);
    trainStaff(job);
    if (job.progress >= job.work) { completeJob(job); return; }
    const left = job.deadline - S.day;
    if (!job.late && left < 0) {
      job.late = true;
      addRep(-8);
      S.marks.push({ day: S.day, kind: 'late' });
      log(`「${job.name}」が納期を過ぎた(評判 -8)`, 'bad');
      notify(`「${job.name}」が納期を過ぎた。評判 -8`, 'bad');
      S.dirty = true;
    } else if (!job.warned && left >= 0 && left <= 7) {
      const projected = job.progress + jobPower(job) * left;
      if (projected < job.work * 0.95) {
        job.warned = true;
        raise(INCIDENTS.delay.build({ job }));
        S.marks.push({ day: S.day, kind: 'incident' });
      }
    }
  });

  // 給料日
  if (date.getDate() === CONFIG.paydayOfMonth) {
    const c = monthlyCost();
    S.money -= c;
    log(`給料と運営費 ${yen(c)} を支払った`);
  }

  // 案件の募集と求職者
  const before = S.offers.length;
  S.offers = S.offers.filter((o) => o.expires > S.day);
  if (S.offers.length !== before) S.dirty = true;
  if (S.day >= S.nextOfferDay) { newOffer(); S.nextOfferDay = S.day + ri(14, 24); }
  if (S.day >= S.nextCandDay) { refreshCandidates(); S.nextCandDay = S.day + 60; notify('新しい求職者が来た', 'info'); }

  // 隠していたことの発覚
  const due = S.schedule.filter((s) => s.day <= S.day);
  S.schedule = S.schedule.filter((s) => s.day > S.day);
  due.forEach((s) => { raise(SCHEDULED[s.type](s)); S.marks.push({ day: S.day, kind: 'incident' }); });

  // ランダムな障害
  if (S.day >= S.nextIncidentDay && S.jobs.length > 0) {
    const inc = makeIncident(S.firstDone ? null : 'server');
    if (inc) {
      raise(inc);
      S.marks.push({ day: S.day, kind: 'incident' });
      S.firstDone = true;
      S.nextIncidentDay = S.day + ri(CONFIG.incidentGap[0], CONFIG.incidentGap[1]);
    }
  }

  checkLevel();
  checkEnd();
  if (!S.pending && S.queue.length) advance();
}

function makeIncident(forceId) {
  if (!S.jobs.length) return null;
  const job = pick(S.jobs);
  const emp = pick(S.employees.filter((e) => !isAbsent(e)).concat([null]).filter(Boolean)) || null;
  let id = forceId;
  if (!id) {
    const ids = Object.keys(INCIDENTS).filter((k) => k !== 'delay' && (k !== 'absence' || emp));
    const ws = ids.map((k) => Math.max(0.2, INCIDENTS[k].weight()));
    let r = rand() * ws.reduce((a, b) => a + b, 0);
    id = ids[ws.findIndex((w) => (r -= w) < 0)] || ids[0];
  }
  return INCIDENTS[id].build({ job, emp });
}

// ----- 案件の完成 -----
function completeJob(job) {
  const staff = job.staff.map(empById).filter(Boolean);
  const have = new Set(staff.flatMap((e) => e.skills));
  const missing = job.skills.filter((sk) => !have.has(sk));
  const covered = job.skills.length - missing.length;

  let q = 55 + 35 * covered / job.skills.length + S.invest.qa * 5 + (have.has('test') ? 5 : 0) + job.qBonus - job.qDebt;
  q = clamp(Math.round(q), 0, 100);

  const lateDays = Math.max(0, S.day - job.deadline);
  const rf = lateDays === 0 ? 1 : Math.max(0.3, 1 - 0.03 * lateDays);
  const qf = q >= 80 ? 1 : q >= 60 ? 0.9 : 0.7;
  const pay = Math.round(job.reward * rf * qf / 1000) * 1000;

  const base = { 1: 6, 2: 10, 3: 16 }[job.diff];
  let rep;
  if (lateDays === 0) rep = q >= 80 ? base : q >= 60 ? Math.round(base * 0.5) : -2;
  else rep = q >= 60 ? 0 : -3;

  addMoney(pay);
  addRep(rep);
  S.done++;
  const success = lateDays === 0 && q >= 60;
  if (job.diff === 3 && success) S.big++;

  staff.forEach((e) => { e.job = null; });
  S.jobs = S.jobs.filter((j) => j.id !== job.id);
  log(`「${job.name}」が完成した。報酬 ${yen(pay)}`, 'good');
  S.dirty = true;

  const label = q >= 80 ? '良い' : q >= 60 ? 'ふつう' : '低い';
  const lines = [
    lateDays === 0 ? `納期: 間に合った(${job.deadline - S.day}日前)` : `納期: ${lateDays}日遅れた(報酬が${Math.round((1 - rf) * 100)}%減った)`,
    `品質: ${q}点(${label})${qf < 1 ? ` 報酬が${Math.round((1 - qf) * 100)}%減った` : ''}`,
    `報酬: ${yen(pay)}`,
    `評判: ${rep >= 0 ? '+' : ''}${rep}`
  ];
  if (missing.length) lines.push(`スキル不足: ${missing.map((sk) => SKILLS[sk]).join('、')}の担当がいなかったため、品質が下がった`);
  if (job.qDebt > 0) lines.push('バグを残したまま納品したため、品質が下がった');
  raise({
    kind: 'report', badge: '案件完了', title: `「${job.name}」が完成した`, lines,
    choices: [{ label: 'OK', tag: 'other', apply() { autoAssign(); return ''; } }]
  });
}

// ----- 会社レベル -----
function checkLevel() {
  const next = LEVELS[S.level];
  if (next && S.rep >= next.needRep && S.done >= next.needDone) {
    S.level++;
    S.dirty = true;
    S.lvFx = true;
    S.turns.push({ day: S.day, kind: 'level', title: `会社が Lv.${S.level} に成長`, note: `評判${S.rep}・完成${S.done}件で成長した` });
    log(`会社が Lv.${S.level} になった`, 'good');
    raise({
      kind: 'notice', badge: 'レベルアップ', title: `会社が Lv.${S.level} に成長した`,
      body: `評判と実績が認められた。社員の席が${next.slots}つに、同時に受けられる案件が${next.jobs}件に増えた。`,
      choices: [{ label: 'やった', tag: 'other', apply() { return ''; } }]
    });
  }
}

// ----- 目標とランク -----
function goalList() {
  const g = CONFIG.goals;
  const list = [
    { key: 'money', label: '資金', cur: S.money, target: g.money, fmt: yen },
    { key: 'rep', label: '評判', cur: S.rep, target: g.rep, fmt: (n) => String(n) },
    { key: 'staff', label: '従業員', cur: S.employees.length, target: g.staff, fmt: (n) => n + '人' },
    { key: 'big', label: '大規模案件の成功', cur: S.big, target: g.big, fmt: (n) => n + '件' }
  ];
  list.forEach((x) => { x.met = x.cur >= x.target; x.ratio = clamp(x.cur / x.target, 0, 1); });
  return list;
}
// ランク: 目標を4つすべて達成 = A / 2〜3つ = B / 0〜1つ = C
function rankOf() {
  const list = goalList();
  const n = list.filter((x) => x.met).length;
  return n === list.length ? 'A' : n >= 2 ? 'B' : 'C';
}

function checkEnd() {
  if (S.over) return;
  if (S.money < 0) S.over = { type: 'bankrupt' };
  else if (S.day >= CONFIG.totalDays) S.over = { type: 'timeup', rank: rankOf() };
  if (S.over) { S.over.day = S.day; S.history.push({ day: S.day, money: S.money, rep: S.rep }); }
}

// ----- 決断画面で選んだとき -----
function resolve(idx) {
  const p = S.pending;
  if (!p || p.done) return null;
  const c = p.choices[idx];
  const text = c.apply() || '';
  p.done = true;
  if (p.kind === 'incident') {
    S.tally.incidents++;
    S.counts.handled++;
    if (c.tag === 'hide') S.tally.hide++;
    if (c.tag === 'honest') S.tally.honest++;
    S.turns.push({ day: S.day, kind: 'incident', tag: c.tag, title: p.badge, label: c.label });
  }
  S.dirty = true;
  checkEnd();
  return { text, lesson: p.lesson || '', title: p.title, kind: p.kind };
}
