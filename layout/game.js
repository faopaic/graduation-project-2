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
function employeeStatValue(employee, skill) {
  if (!employee) return 0;
  const statKey = EMPLOYEE_SPECIALTY_STATS[skill];
  return statKey ? clamp(Number(employee.stats?.[statKey]) || 0, 0, 100) : 0;
}
function employeeAbility(employee, skill) {
  if (!employee || employee.skill !== skill) return 0;
  return employeeStatValue(employee, skill);
}
function abilityTotal(employees, skill) {
  return employees.reduce((total, employee) => total + employeeAbility(employee, skill), 0);
}
function abilityTotalWithoutSkillMatch(employees, skill) {
  return employees.reduce((total, employee) => total + employeeStatValue(employee, skill), 0);
}
function meetsRequirement(job, skill, employees) {
  const required = Number(job.requirements?.[skill]) || 0;
  if (required <= 0) return true;
  return abilityTotal(employees, skill) >= required;
}
const remainDays = (job) => job.deadline - S.day;
const monthlyCost = () => S.employees.reduce((s, e) => s + e.salary, 0) + CONFIG.officeCost;
const newId = () => S.nextId++;
const addMoney = (n) => { S.money += n; };
const addRep = (n) => { S.rep = Math.max(0, S.rep + n); };
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
function newGame(
  employeeDatabase,
  eventDatabase,
  projectDatabase,
  missionDatabase
) {
  const difficulty = S?.difficulty || 'normal';
  S = {
    day: 0, 
    money: getStartMoney(CONFIG.startMoney,difficulty),
    rep: CONFIG.startRep, level: 1,
    done: 0, successes: 0, advancedSuccesses: 0, experience: 0, big: 0,
    difficulty,
    employees: [], jobs: [], offers: [], candidates: [],
    invest: { backup: 0, security: 0, qa: 0 },
    boost: {}, schedule: [], queue: [], pending: null, over: null, dirty: true,
    nextIncidentDay: CONFIG.firstIncidentDay, nextOfferDay: 14, nextCandDay: 60,
    log: [], notices: [], marks: [], recruitmentEvent: false, recruiting: false, recruitStage: 'confirm', assignmentJobId: null,
    tally: { honest: 0, hide: 0, incidents: 0 },
    counts: { accepted: 0, hired: 0, handled: 0 },
    missionRewards: {},
    nextId: 1, playing: false, speedIdx: CONFIG.defaultSpeed, missionsOpen: false, missionUnlockNotices: {},
    employeeView: 'staff', employeeDatabase, eventDatabase, projectDatabase, missionDatabase
  };
  MISSIONS = missionDatabase.map((mission) => ({
    ...mission,
    met: (state) => missionProgress(mission.conditionType, state) >= mission.target
  }));
  console.log('newGame難易度', difficulty);
  console.log('開始資金', S.money);
  const initialStaff = selectInitialStaff(employeeDatabase);
  initialStaff.forEach((s) => addEmployee(s.name, s.skill, s.salesSkill, s.stats, s.id || s.sourceId, s.salary, false));
  const developmentProject = projectDatabase.find((template) => template.skills.includes('dev'));
  const designProject = projectDatabase.find((template) => template.skills.includes('design'));
  const initialProjects = [];
  if (developmentProject) initialProjects.push({ template: developmentProject });
  if (designProject && designProject.id !== developmentProject?.id) {
    initialProjects.push({ template: designProject });
  } else {
    const fallbackDesignProject = projectDatabase.find((template) =>
      !initialProjects.some((initial) => initial.template.id === template.id)
    );
    if (fallbackDesignProject) initialProjects.push({
      template: fallbackDesignProject,
      skills: ['design']
    });
  }

  function missionProgress(conditionType, state) {
    const progress = {
      accepted: state.counts.accepted,
      hired: state.counts.hired,
      handled: state.counts.handled,
      done: state.done,
      completed: state.done,
      level: state.level,
      successes: state.successes,
      invest_total: Object.values(state.invest).reduce((sum, level) => sum + level, 0),
      investments: Object.values(state.invest).reduce((sum, level) => sum + level, 0),
      employees: state.employees.length,
      big: state.big,
      advanced_successes: state.advancedSuccesses,
      advancedSuccesses: state.advancedSuccesses
    };
    if (conditionType === 'max_investments' || conditionType === 'all_investments_max') {
      return Object.keys(INVEST).every((key) => state.invest[key] >= INVEST[key].costs.length) ? 1 : 0;
    }
    return Number(progress[conditionType]) || 0;
  }
  const remainingProjects = projectDatabase.filter((template) =>
    !initialProjects.some((initial) => initial.template.id === template.id)
  );
  const randomProject = remainingProjects.length ? pick(remainingProjects) : null;
  if (randomProject) initialProjects.push({ template: randomProject });
  initialProjects.slice(0, 3).forEach(({ template, skills }) => newOffer(template.id, skills));
  refreshCandidates();
  log('PEACE株式会社を設立した。まずは案件を受注しよう。');
  return S;
}
function selectInitialStaff(employeeDatabase) {
  const available = employeeDatabase.slice();
  const takeBySkill = (skill) => {
    const matches = available.filter((employee) => employee.skill === skill);
    if (!matches.length) return null;
    const employee = pick(matches);
    available.splice(available.indexOf(employee), 1);
    return employee;
  };
  const initial = [takeBySkill('dev'), takeBySkill('design')].filter(Boolean);
  while (initial.length < 3) {
    const nonSales = available.filter((employee) => !employee.sales && employee.skill !== 'sales');
    if (!nonSales.length) break;
    const employee = pick(nonSales);
    available.splice(available.indexOf(employee), 1);
    initial.push(employee);
  }
  return initial;
}

function addEmployee(name, skill, salesSkill, stats, sourceId, salary, sales) {
  const rawStats = { ...DEFAULT_EMPLOYEE_STATS, ...(stats || {}) };
  const e = {
    id: newId(), sourceId, name, skill, salary: salary ?? SALARY[1], job: null, sales: Boolean(sales),
    salesSkill: salesSkill ?? DEFAULT_SALES_SKILL, salesCooldownUntil: 0,
    stats: Object.fromEntries(Object.keys(DEFAULT_EMPLOYEE_STATS).map((key) => [
      key, clamp(Number(rawStats[key]) || 0, 0, 100)
    ])),
    absentUntil: 0, coveredUntil: 0
  };
  S.employees.push(e);
  return e;
}

function checkMissionRewards() {
  MISSIONS.forEach((mission) => {
    if (!mission.met(S) || S.missionRewards[mission.id]) return;
    S.missionRewards[mission.id] = true;
    const reward = mission.rewardAmount;
    if (mission.rewardType === 'money') S.money += reward;
    else S.experience += reward;
    const rewardLabel = mission.rewardType === 'money' ? `資金 +${yen(reward)}` : `経験値 +${reward}`;
    log(`ミッション「${mission.label}」達成。${rewardLabel}`, 'good');
    notify(`ミッション達成: ${mission.label} (${rewardLabel})`, 'good');
  });
  const tiers = ['初級', '中級', '上級'];
  tiers.slice(0, -1).forEach((tier, index) => {
    const nextTier = tiers[index + 1];
    const complete = MISSIONS
      .filter((mission) => mission.tier === tier)
      .every((mission) => mission.met(S));
    if (complete && !S.missionUnlockNotices[nextTier]) {
      S.missionUnlockNotices[nextTier] = true;
      notify(`${nextTier}ミッションが解放されました`, 'good');
    }
  });
}

// ----- 案件の募集 -----
function newOffer(tid, skillsOverride) {
  let t;
  if (tid) {
    t = S.projectDatabase.find((x) => x.id === tid);
  } else {
    const ok = S.projectDatabase.filter((x) => x.minRep <= S.rep + 30 && S.offers.filter((o) => o.tid === x.id).length < 2);
    if (!ok.length) return;
    t = pick(ok);
  }
  if (!t) return;
  const reward = Math.round(t.reward * (0.9 + rand() * 0.2) / 10000) * 10000;
  S.offers.push({
    id: newId(), tid: t.id, name: t.name, diff: t.diff, reward, days: t.days, work: t.work,
    skills: skillsOverride || t.skills, requirements: t.requirements || {},
    minRep: t.minRep, risk: t.risk, expires: S.day + 45
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
    progress: 0, start: S.day, deadline: S.day + o.days, skills: o.skills, requirements: o.requirements || {},
    staff: [], late: false, warned: false, qDebt: 0, qBonus: 0
  };
  S.jobs.push(job);
  S.counts.accepted++;
  checkMissionRewards();
  log(`「${job.name}」を受注した`);
  S.dirty = true;
  return { ok: true, msg: `「${job.name}」を受注した。納期は${job.deadline - S.day}日後` };
}

// ----- 担当の割り振り -----
function assign(job, e) {
  if (e.sales) return;
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

function toggleSales(empId) {
  const e = empById(empId);
  if (!e) return;
  if (e.sales) {
    e.sales = false;
  } else {
    unassign(e);
    e.sales = true;
  }
  S.dirty = true;
}

function salesSuccessRate(salesSkill) {
  const skill = clamp(salesSkill, 0, 100);
  return clamp(
    SALES_BASE_SUCCESS_RATE + (skill - SALES_SKILL_REFERENCE) * SALES_SKILL_RATE_PER_POINT,
    0,
    100
  );
}

// 手が空いている社員を、スキルが合う案件に割り振る
function autoAssign(targetJob) {
  const jobs = targetJob ? [targetJob] : S.jobs;
  const idle = S.employees
    .filter((e) => !e.job && !e.sales)
    .sort((a, b) => (b.lv || 0) - (a.lv || 0));

  jobs.forEach((job) => {
    const assignedSkills = new Set(
      job.staff.map((id) => empById(id)).filter(Boolean).map((e) => e.skill)
    );
    const requiredSkills = [...new Set(job.skills)];

    requiredSkills.forEach((skill) => {
      if (assignedSkills.has(skill)) return;
      const employeeIndex = idle.findIndex((e) => e.skill === skill);
      if (employeeIndex < 0) return;
      const [employee] = idle.splice(employeeIndex, 1);
      assign(job, employee);
      assignedSkills.add(skill);
    });
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
  const available = S.employeeDatabase.filter((candidate) =>
    !S.employees.some((e) => e.sourceId === candidate.id)
    && !S.candidates.some((c) => c.sourceId === candidate.id)
  );
  const record = pick(available.length ? available : S.employeeDatabase);
  return {
    id: newId(), sourceId: record.id, name: record.name, skill: record.skill,
    salary: record.salary, salesSkill: record.salesSkill, sales: record.sales,
    stats: { ...DEFAULT_EMPLOYEE_STATS, ...(record.stats || {}) }
  };
}
function hire(id) {
  const c = S.candidates.find((x) => x.id === id);
  if (!c) return { ok: false, msg: 'この人は、ほかの会社に決まった' };
  if (S.employees.length >= levelInfo().slots) return { ok: false, msg: '席がいっぱい。会社Lvが上がると、席が増える' };
  S.candidates = S.candidates.filter((x) => x.id !== id);
  addEmployee(c.name, c.skill, c.salesSkill, c.stats, c.sourceId, c.salary, c.sales);
  S.counts.hired++;
  checkMissionRewards();
  log(`${c.name}(${SKILLS[c.skill]})を採用した`);
  autoAssign();
  S.dirty = true;
  return { ok: true, msg: `${c.name}が入社した。月の支出が${yen(c.salary)}増える` };
}

function runSales() {
  S.employees.filter((e) => e.sales && S.day >= e.salesCooldownUntil).forEach((e) => {
    if (rand() * 100 >= salesSuccessRate(e.salesSkill)) return;
    const count = ri(1, 3);
    let added = 0;
    for (let i = 0; i < count; i++) {
      const before = S.offers.length;
      newOffer();
      if (S.offers.length > before) added++;
    }
    e.salesCooldownUntil = S.day + ri(30, 90);
    if (added) {
      log(`${e.name}が営業で案件を${added}件獲得した`, 'good');
      notify(`${e.name}が営業で案件を${added}件獲得した`, 'good');
      S.dirty = true;
    }
  });
}

// ----- 投資 -----
function buyInvest(key) {
  const inv = INVEST[key], lv = S.invest[key];
  if (lv >= inv.costs.length) return { ok: false, msg: 'もう最大まで強化している' };
  const cost = inv.costs[lv];
  if (S.money < cost) return { ok: false, msg: `資金が足りない(${yen(cost)}必要)` };
  S.money -= cost;
  S.invest[key]++;
  checkMissionRewards();
  log(`${inv.name}を強化した(Lv.${S.invest[key]})`);
  S.dirty = true;
  return { ok: true, msg: `${inv.name}が Lv.${S.invest[key]} になった` };
}

function strengthenEmployee(id) {
  const e = empById(id);
  if (!e) return { ok: false, msg: 'この社員は見つからない' };
  const statKey = EMPLOYEE_SPECIALTY_STATS[e.skill];
  if (!statKey) return { ok: false, msg: 'この社員の得意ステータスが設定されていない' };
  const currentStat = e.stats[statKey];
  if (currentStat >= 100) return { ok: false, msg: 'この社員の得意ステータスは最大になっている' };
  const cost = EMPLOYEE_STAT_UPGRADE_COST;
  if (S.money < cost) return { ok: false, msg: `資金が足りない(${yen(cost)}必要)` };
  S.money -= cost;
  const chance = employeeUpgradeChance(currentStat);
  if (rand() >= chance) {
    log(`${e.name}の強化に失敗した`, 'bad');
    S.dirty = true;
    return { ok: false, msg: `${e.name}の強化に失敗した(成功率${Math.round(chance * 100)}%)` };
  }
  const beforeStat = statKey ? e.stats[statKey] : null;
  if (statKey) e.stats[statKey] = clamp(e.stats[statKey] + EMPLOYEE_STAT_UPGRADE_AMOUNT, 0, 100);
  const statMessage = statKey ? `、${EMPLOYEE_STAT_LABELS[statKey]} ${beforeStat}→${e.stats[statKey]}` : '';
  const otherMessages = Object.keys(e.stats)
    .filter((key) => key !== statKey && rand() < EMPLOYEE_OTHER_STAT_UPGRADE_CHANCE)
    .map((key) => {
      const before = e.stats[key];
      e.stats[key] = clamp(before + EMPLOYEE_OTHER_STAT_UPGRADE_AMOUNT, 0, 100);
      return `${EMPLOYEE_STAT_LABELS[key]} ${before}→${e.stats[key]}`;
    });
  const otherStatMessage = otherMessages.length ? `（低確率成長: ${otherMessages.join('、')}）` : '';
  log(`${e.name}を強化した${statMessage}${otherStatMessage}`, 'good');
  S.dirty = true;
  return { ok: true, msg: `${e.name}の${EMPLOYEE_STAT_LABELS[statKey]}が上がった${statMessage}${otherStatMessage}` };
}

function employeeUpgradeChance(stat) {
  const value = clamp(stat, 0, 100);
  for (let i = 1; i < EMPLOYEE_STAT_UPGRADE_RATE_POINTS.length; i++) {
    const upper = EMPLOYEE_STAT_UPGRADE_RATE_POINTS[i];
    if (value <= upper.stat) {
      const lower = EMPLOYEE_STAT_UPGRADE_RATE_POINTS[i - 1];
      const ratio = (value - lower.stat) / (upper.stat - lower.stat);
      return lower.rate + (upper.rate - lower.rate) * ratio;
    }
  }
  return EMPLOYEE_STAT_UPGRADE_RATE_POINTS[EMPLOYEE_STAT_UPGRADE_RATE_POINTS.length - 1].rate;
}

// ----- 1日ぶんの進行 -----
function jobPower(job) {
  let p = 0;
  const staff = job.staff.map(empById).filter(Boolean);
  job.staff.forEach((id) => {
    const e = empById(id);
    if (!e || !isWorking(e)) return;
    if (!job.skills.includes(e.skill)) {
      p += 0.5;
      return;
    }
    const statKey = EMPLOYEE_SPECIALTY_STATS[e.skill];
    const stat = statKey ? clamp(Number(e.stats?.[statKey]) || 0, 0, 100) : 50;
    const basePower = 0.5 + stat / 100;
    const required = Number(job.requirements?.[e.skill]) || 0;
    const abilityShortage = required > 0 && abilityTotal(staff, e.skill) < required;
    p += basePower * (abilityShortage ? 0.7 : 1);
  });
  if (S.boost[job.id] && S.day < S.boost[job.id]) p *= 1.4;
  return p;
}

function tick() {
  if (!S || S.over || S.pending) return;
  S.day++;
  const date = dateOf(S.day);

  S.employees.forEach((e) => {
    if (e.absentUntil > 0 && S.day === e.absentUntil) { S.dirty = true; log(`${e.name}が復帰した`); }
  });

  // 開発の進行
  S.jobs.slice().forEach((job) => {
    job.progress += jobPower(job);
    if (job.progress >= job.work) { completeJob(job); return; }
    const left = job.deadline - S.day;
    if (!job.late && left < 0) {
      job.late = true;
      addRep(-8);
      S.marks.push({ day: S.day, kind: 'late' });
      log(`「${job.name}」が納期を過ぎた(評判 -8)`, 'bad');
      notify(`「${job.name}」が納期を過ぎた。評判 -8`, 'bad');
      S.dirty = true;
    }
  });

  // 給料日
  if (date.getDate() === CONFIG.paydayOfMonth) {
    const c = monthlyCost();
    S.money -= c;
    log(`給料と運営費 ${yen(c)} を支払った`);
    runSales();
  }

  // 案件の募集と求職者
  const before = S.offers.length;
  S.offers = S.offers.filter((o) => o.expires > S.day);
  if (S.offers.length !== before) S.dirty = true;
  if (S.day >= S.nextOfferDay) { newOffer(); S.nextOfferDay = S.day + ri(14, 24); }
  if (S.day >= S.nextCandDay) {
    refreshCandidates();
    S.nextCandDay = S.day + 60;
    S.recruitmentEvent = true;
    S.recruiting = true;
    S.recruitStage = 'confirm';
    notify('新しい求職者が来た', 'info');
  }

  // DBイベント
  if (S.day >= S.nextIncidentDay && S.jobs.length > 0) {
    const inc = makeIncident();
    if (inc) {
      raise(inc);
      S.marks.push({ day: S.day, kind: 'incident' });
      S.nextIncidentDay = S.day + ri(CONFIG.incidentGap[0], CONFIG.incidentGap[1]);
    }
  }

  checkLevel();
  checkEnd();
  if (!S.pending && S.queue.length) advance();
}

function makeIncident(forceId) {
  if (!S.jobs.length || !S.eventDatabase.length) return null;
  const job = pick(S.jobs);
  const event = pickWeighted(S.eventDatabase, (item) => item.occurrenceRate);
  return event ? buildDatabaseEvent(event, job) : null;
}

function pickWeighted(items, weightOf) {
  const weighted = items.map((item) => Math.max(0, Number(weightOf(item)) || 0));
  const total = weighted.reduce((sum, weight) => sum + weight, 0);
  if (!total) return null;
  let value = rand() * total;
  const index = weighted.findIndex((weight) => (value -= weight) < 0);
  return items[index] || null;
}

function applyDatabaseEventEffects(effects, job) {
  const applied = [];
  const money = Number(effects?.money || 0) + Number(effects?.sales || 0) + Number(effects?.profit || 0);
  if (money) {
    addMoney(money);
    applied.push(`資金 ${money >= 0 ? '+' : ''}${yen(money)}`);
  }
  const reputation = Number(effects?.reputation || 0);
  if (reputation) {
    addRep(reputation);
    applied.push(`評判 ${reputation >= 0 ? '+' : ''}${reputation}`);
  }
  const workload = Number(effects?.workload || 0);
  if (job && workload) {
    job.work = Math.max(job.progress + 1, job.work + workload);
    applied.push(`仕事量 ${workload >= 0 ? '+' : ''}${workload}`);
  }
  const quality = Number(effects?.development || 0) + Number(effects?.security || 0) + Number(effects?.efficiency || 0);
  if (job && quality) {
    job.qBonus += Math.round(quality / 10);
    applied.push(`品質 ${quality >= 0 ? '+' : ''}${Math.round(quality / 10)}`);
  }
  return applied;
}

function buildDatabaseEvent(event, job) {
  return {
    kind: 'incident',
    id: `database-event-${event.id}`,
    badge: event.type === 'incident' ? 'インシデント' : '会社イベント',
    title: event.name,
    body: `${event.description}${event.triggerCondition ? `（発生条件: ${event.triggerCondition}）` : ''}`,
    choices: event.choices.map((choice) => ({
      label: choice.label,
      tag: 'other',
      apply() {
        const applied = applyDatabaseEventEffects(choice.effects || {}, job);
        return applied.length ? `${choice.label}。${applied.join('、')}。` : `${choice.label}。`;
      }
    })),
    lesson: 'データベースに登録されたイベントです。選択肢の結果を確認して、会社への影響を判断してください。'
  };
}

// ----- 案件の完成 -----
function completeJob(job) {
  const staff = job.staff.map(empById).filter(Boolean);
  const have = new Set(job.skills.filter((skill) => meetsRequirement(job, skill, staff)));
  const missing = job.skills.filter((sk) => !have.has(sk));
  const covered = job.skills.length - missing.length;
  const mismatchedRequirements = job.skills.filter((skill) =>
    abilityTotalWithoutSkillMatch(staff, skill) >= (Number(job.requirements?.[skill]) || 0)
    && !meetsRequirement(job, skill, staff)
  ).length;

  let q = 55 + 35 * covered / job.skills.length + S.invest.qa * 5 + (have.has('test') ? 5 : 0) + job.qBonus - job.qDebt - mismatchedRequirements * 10;
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
  if (success) {
    S.successes++;
    if (job.diff >= 2) S.advancedSuccesses++;
    S.experience += job.diff * 10;
  }
  if (job.diff === 3 && success) S.big++;
  checkMissionRewards();

  staff.forEach((e) => { e.job = null; });
  S.jobs = S.jobs.filter((j) => j.id !== job.id);
  log(`「${job.name}」が完成した。報酬 ${yen(pay)}`, 'good');
  S.dirty = true;

  const label = q >= 80 ? '良い' : q >= 60 ? 'ふつう' : '低い';
  const lines = [
    lateDays === 0 ? `納期: 間に合った(${job.deadline - S.day}日前)` : `納期: ${lateDays}日遅れた(報酬が${Math.round((1 - rf) * 100)}%減った)`,
    `品質: ${q}点(${label})${qf < 1 ? ` 報酬が${Math.round((1 - qf) * 100)}%減った` : ''}`,
    `報酬: ${yen(pay)}`,
    `評判: ${rep >= 0 ? '+' : ''}${rep}`,
    success ? `案件成功: 経験値 +${job.diff * 10}` : '案件成功にならなかった'
  ];
  if (missing.length) lines.push(`スキル不足: ${missing.map((sk) => SKILLS[sk]).join('、')}の担当がいなかったため、品質が下がった`);
  if (mismatchedRequirements) lines.push(`職種不一致: 要求能力値は満たしていたが、職種が一致しないスキルが${mismatchedRequirements}件あり、品質が${mismatchedRequirements * 10}点下がった`);
  if (job.qDebt > 0) lines.push('バグを残したまま納品したため、品質が下がった');
  raise({
    kind: 'report', badge: '案件完了', title: `「${job.name}」が完成した`, lines,
    choices: [{ label: 'OK', tag: 'other', apply() { autoAssign(); return ''; } }]
  });
}

// ----- 会社レベル -----
function checkLevel() {
  const next = LEVELS[S.level];
  if (next && S.successes >= next.needSuccess && S.experience >= next.needExp) {
    S.experience -= next.needExp;
    S.level++;
    checkMissionRewards();
    S.dirty = true;
    log(`会社が Lv.${S.level} になった`, 'good');
    raise({
      kind: 'notice', badge: 'レベルアップ', title: `会社が Lv.${S.level} に成長した`,
      body: `案件の成功と経験が認められた。社員の席が${next.slots}つに、同時に受けられる案件が${next.jobs}件に増えた。`,
      choices: [{ label: 'やった', tag: 'other', apply() { return ''; } }]
    });
  }
}

// ----- クリア判定 -----
function goalList() {
  const g = CONFIG.goals;
  const goalMoney = getGoalMoney(g.money,S.difficulty);
  const goalRep = getGoalReputation(g.rep,S.difficulty);
  const list = [
    { key: 'money', label: '資金', cur: S.money, target: goalMoney, fmt: yen },
    { key: 'rep', label: '評判', cur: S.rep, target: goalRep, fmt: (n) => String(n) },
    { key: 'big', label: '大規模案件の成功', cur: S.big, target: g.big, fmt: (n) => n + '件' }
  ];
  list.forEach((x) => { x.met = x.cur >= x.target; x.ratio = clamp(x.cur / x.target, 0, 1); });
  return list;
}
const goalsMet = () => goalList().every((x) => x.met);

// ----- クリア評価 -----
function getClearRank() {
  const years = S.day / 365;
  if (years < 5) return 'A';
  if (years < 6) return 'B';
  if (years < 8) return 'C';
  return 'D';
}
function checkEnd() {
  if (S.over) return;
  if (S.money < 0) {
    S.over = { type: 'bankrupt' };
  }
  else if (goalsMet()) {
    S.over = { type: 'clear' };
  }
  else if (S.day >= 365 * 15) {
    S.over = { type: 'retire' };
  }
  if (S.over) S.over.day = S.day;
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
  }
  checkMissionRewards();
  S.dirty = true;
  checkEnd();
  return { text, lesson: p.lesson || '', title: p.title, kind: p.kind };
}
