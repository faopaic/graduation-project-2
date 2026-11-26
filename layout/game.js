// ===== ゲームの仕組み =====
// 画面とは別に、数字や出来事の計算だけを書いています。
// S = ゲームの今の状態(資金、日付、社員、案件など)

let rand = Math.random;
const INCIDENT_COOLDOWN_DAYS = 15;

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
const BACKUP_INCIDENTS = new Set([
  '重要データの誤削除',
  '災害による業務への影響'
]);
const SECURITY_INCIDENTS = new Set(['社用PCの紛失', 'メールの誤送信', 'ウイルス感染', 'パスワードの流出']);
const QA_INCIDENTS = new Set(['社員の業務ミス']);
const isBackupIncident = (event) => BACKUP_INCIDENTS.has(event?.name);
const isSecurityIncident = (event) => SECURITY_INCIDENTS.has(event?.name);
const isQaIncident = (event) => QA_INCIDENTS.has(event?.name);
function eventOccurrenceRate(event) {
  let rate = Math.max(0, Number(event.occurrenceRate) || 0);
  if (isBackupIncident(event)) rate *= 1 - 0.25 * S.invest.backup;
  if (isSecurityIncident(event)) rate *= 1 - 0.30 * S.invest.security;
  if (isQaIncident(event)) rate *= 1 - 0.25 * S.invest.qa;
  return rate;
}
function projectUnlockReason(project) {
  const requiredLevel = Math.min(3, Math.max(1, Number(project.diff) || 1));
  const requirements = [];
  if (S.level < requiredLevel) requirements.push(`会社レベル${requiredLevel}`);
  if (Number(project.diff) === 2 && S.lowDifficultySuccesses < 5) {
    requirements.push(`低難易度案件を5件成功（${S.lowDifficultySuccesses}/5）`);
  }
  if (Number(project.diff) >= 3 && S.mediumDifficultySuccesses < 3) {
    requirements.push(`中難易度案件を3件成功（${S.mediumDifficultySuccesses}/3）`);
  }
  return requirements.length ? `${requirements.join(' / ')}で解放` : '';
}
const isProjectUnlocked = (project) => !projectUnlockReason(project);
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
  const hasMatchingSkill = employees.some((employee) => employee?.skill === skill);
  return hasMatchingSkill && abilityTotalWithoutSkillMatch(employees, skill) >= required;
}
const remainDays = (job) => job.deadline - S.day;
const monthlyCost = () => S.employees.reduce((s, e) => s + e.salary, 0) + CONFIG.officeCost;
const averageEmployeeMorale = () => S.employees.length
  ? Math.round(S.employees.reduce((total, e) => total + e.morale, 0) / S.employees.length)
  : 0;
const newId = () => S.nextId++;
const addMoney = (n) => { S.money += n; };
const addRep = (n) => { S.rep = Math.max(0, S.rep + n); };
const addProgress = (job, frac) => { job.progress = clamp(job.progress + frac * job.work, 0, job.work * 0.99); };
const schedule = (afterDays, type, data) => { S.schedule.push(Object.assign({ day: S.day + afterDays, type }, data)); };

function adjustEmployeeMorale(employee, amount) {
  const current = employee ? empById(employee.id) : null;
  if (!current) return false;
  current.morale = clamp(current.morale + amount, 0, 100);
  S.dirty = true;
  return true;
}

function resignEmployee(employee) {
  const current = empById(employee.id);
  if (!current) return false;
  unassign(current);
  S.employees = S.employees.filter((e) => e.id !== current.id);
  const message = `${current.name}は士気の低下により退職した`;
  log(message, 'warn');
  notify(message, 'warn');
  S.dirty = true;
  return true;
}

function employeeResignationChance(employee) {
  const morale = clamp(Number(employee.morale) || 0, 0, 100);
  if (morale >= EMPLOYEE_RESIGN_MORALE_THRESHOLD) return 0;
  return clamp(
    (EMPLOYEE_RESIGN_MORALE_THRESHOLD - morale) * 0.01 + (Number(employee.retirementRisk) || 0) / 100,
    0,
    1
  );
}

function updateEmployeeMorale() {
  const salaryPaid = S.money >= 0;
  let changed = false;
  const resignationCandidates = [];
  S.employees.slice().forEach((e) => {
    const job = e.job ? jobById(e.job) : null;
    const activeWork = e.job || (e.sales && S.day >= e.salesCooldownUntil);
    const workloadChange = job?.late ? -5 : activeWork ? -2 : !isAbsent(e) ? 1 : 0;
    const previous = e.morale;
    e.morale = clamp(e.morale + (salaryPaid ? 1 : 0) + workloadChange, 0, 100);
    if (e.morale !== previous) changed = true;

    const resignationChance = employeeResignationChance(e);
    if (resignationChance > 0 && rand() < resignationChance) {
      resignationCandidates.push(e);
    }
  });
  if (changed) S.dirty = true;
  return resignationCandidates.length ? pick(resignationCandidates) : null;
}

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
  missionDatabase,
  companyName,
  selectedDifficulty
) {
  const difficulty = selectedDifficulty || S?.difficulty || 'normal';
  S = {
    day: 0, 
    money: getStartMoney(CONFIG.startMoney,difficulty),
    rep: CONFIG.startRep, level: 1,
    done: 0, successes: 0, advancedSuccesses: 0,
    lowDifficultySuccesses: 0, mediumDifficultySuccesses: 0,
    totalSuccessfulJobs: 0,
    pendingQualityBonus: 0, pendingQualityPenalty: 0,
    experience: 0, big: 0,
    companyName: companyName || '',
    recruitContractCount: 0,recruitContractActive: false,recruitContractJobType: null,recruitSelectingJob: false,
    difficulty,
    employees: [], jobs: [], offers: [], candidates: [],
    invest: { backup: 0, security: 0, qa: 0,recruitContract: 0 },
    lastEquipmentUpdate: 0,
    boost: {}, schedule: [], queue: [], pending: null, over: null, dirty: true,
    nextIncidentDay: CONFIG.firstIncidentDay,
    lastIncidentDay: -INCIDENT_COOLDOWN_DAYS,
    nextManagementDay: 10,
    nextOfferDay: 14,
    nextCandDay: 60,
    log: [], notices: [], marks: [], recruitmentEvent: false, recruiting: false, recruitStage: 'confirm', assignmentJobId: null,
    tally: {
      honest: 0,
      hide: 0,
      incidents: 0,
      managementEvents: 0,
      money: 0,
      rep: 0,
      morale: 0,
      employees: 0,
      jobProgress: 0,
      workload: 0
    },
    counts: { accepted: 0, hired: 0, handled: 0 },
    missionRewards: {},
    nextId: 1, playing: false, speedIdx: CONFIG.defaultSpeed, missionsOpen: false, missionUnlockNotices: {},
    employeeView: 'staff', employeeFiringArmed: null,
    employeeDatabase, eventDatabase, projectDatabase, missionDatabase
  };
  const challengeMissions = [...new Map(
    missionDatabase
      .filter((mission) => mission.tier === 'チャレンジ')
      .filter((mission) => ['exp', 'money', 'reputation'].includes(mission.rewardType))
      .map((mission) => [mission.id, mission])
  ).values()];
  for (let i = challengeMissions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [challengeMissions[i], challengeMissions[j]] = [challengeMissions[j], challengeMissions[i]];
  }
  const selectedChallengeMissions = challengeMissions
    .slice(0, 3)
    .map((mission) => ({ ...mission, tier: 'チャレンジ' }));

  MISSIONS = [...FIXED_MISSIONS, ...selectedChallengeMissions].map((mission) => ({
    ...mission,
    met: (state) => missionProgress(mission.conditionType, state) >= mission.target
  }));
  console.log('newGame難易度', difficulty);
  console.log('開始資金', S.money);
  const initialStaff = selectInitialStaff(employeeDatabase);
  initialStaff.forEach((s) => addEmployee(s.name, s.skill, s.salesSkill, s.stats, s.id || s.sourceId, s.salary, false));
  const availableProjects = projectDatabase.filter(isProjectUnlocked);
  const developmentProject = availableProjects.find((template) => template.skills.includes('dev'));
  const designProject = availableProjects.find((template) => template.skills.includes('design'));
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
      return ['backup', 'security', 'qa'].every((key) =>
        state.invest[key] >= INVEST[key].costs.length
      ) ? 1 : 0;
    }
    return Number(progress[conditionType]) || 0;
  }
  const remainingProjects = availableProjects.filter((template) =>
    !initialProjects.some((initial) => initial.template.id === template.id)
  );
  const randomProject = remainingProjects.length ? pick(remainingProjects) : null;
  if (randomProject) initialProjects.push({ template: randomProject });
  initialProjects.slice(0, 3).forEach(({ template, skills }) => newOffer(template.id, skills));
  refreshCandidates();
  log(`${S.companyName ? `「${S.companyName}」という会社を` : '会社を'}設立した。まずは案件を受注しよう。`);
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
    morale: EMPLOYEE_START_MORALE,
    retirementRisk: 0,
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
    else if (mission.rewardType === 'reputation') addRep(reward);
    else S.experience += reward;
    const rewardLabel = mission.rewardType === 'money'
      ? `資金 +${yen(reward)}`
      : mission.rewardType === 'reputation'
        ? `評判 +${reward}`
        : `経験値 +${reward}`;
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
    const ok = S.projectDatabase.filter((x) =>
      isProjectUnlocked(x)
      && x.minRep <= S.rep + 30
      && S.offers.filter((o) => o.tid === x.id).length < 2
    );
    if (!ok.length) return;
    t = pick(ok);
  }
  if (!t || !isProjectUnlocked(t)) return;
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
  if (!o) return { ok: false, msg: 'この案件の募集は終了しました。' };
  const unlockReason = projectUnlockReason(o);
  if (unlockReason) return { ok: false, msg: unlockReason };
  if (S.rep < o.minRep) return { ok: false, msg: `評判が${o.minRep}以上になると受注できます。` };
  if (S.jobs.length >= levelInfo().jobs) return { ok: false, msg: `同時に受注できる案件は${levelInfo().jobs}件までです。` };
  S.offers = S.offers.filter((x) => x.id !== id);
  const job = {
    id: newId(), tid: o.tid, name: o.name, diff: o.diff, reward: o.reward, work: o.work,
    progress: 0, start: S.day, deadline: S.day + o.days, skills: o.skills, requirements: o.requirements || {},
    staff: [],
    late: false,
    warned: false,
    qDebt: S.pendingQualityPenalty || 0,
    qBonus: S.pendingQualityBonus || 0
  };
  S.pendingQualityBonus = 0;
  S.pendingQualityPenalty = 0;
  S.jobs.push(job);
  S.counts.accepted++;
  checkMissionRewards();
  log(`「${job.name}」を受注した`);
  S.dirty = true;
  return { ok: true, msg: `「${job.name}」を受注しました。納期まで${job.deadline - S.day}日です。` };
}

// ----- 担当の割り振り -----
function assign(job, e) {
  if (e.sales || isAbsent(e)) return;
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
  if (e.job === job.id) {
    unassign(e);
  } else {
    if (isAbsent(e)) return;
    assign(job, e);
  }
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

function fireEmployee(empId) {
  const employee = empById(empId);
  if (!employee) return { ok: false, msg: '社員が見つかりません' };
  if (S.employees.length <= 1) return { ok: false, msg: '社員が1人しかいないため、これ以上解雇できません。' };
  if (S.pending || S.recruiting) return { ok: false, msg: 'イベント中は社員を解雇できません' };

  const severance = employee.salary * EMPLOYEE_SEVERANCE_MONTHS;
  if (S.money < severance) {
    return { ok: false, msg: `退職金が不足しています。必要資金は${yen(severance)}です` };
  }

  unassign(employee);
  S.employees = S.employees.filter((e) => e.id !== empId);
  addMoney(-severance);
  addRep(-EMPLOYEE_FIRE_REPUTATION_PENALTY);
  if (S.employeeFiringArmed === empId) S.employeeFiringArmed = null;
  S.dirty = true;

  const message = `${employee.name}を解雇しました（退職金 ${yen(severance)}・評判 -${EMPLOYEE_FIRE_REPUTATION_PENALTY}）`;
  log(message, 'bad');
  notify(message, 'bad');
  checkMissionRewards();
  return { ok: true, msg: message };
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
    .filter((e) => !e.job && !e.sales && !isAbsent(e))
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
function refreshCandidates(skill) {
  S.candidates = [];
  for (let i = 0; i < 4; i++) {
    const candidate = makeCandidate(skill);
    if (!candidate) break;
    S.candidates.push(candidate);
  }
  S.dirty = true;
}
function makeCandidate(skill) {
  const available = S.employeeDatabase.filter((candidate) =>
    (!skill || candidate.skill === skill)
    &&
    !S.employees.some((e) => e.sourceId === candidate.id)
    && !S.candidates.some((c) => c.sourceId === candidate.id)
  );
  const record = pick(available.length ? available : (skill ? [] : S.employeeDatabase));
  if (!record) return null;
  return {
    id: newId(), sourceId: record.id, name: record.name, skill: record.skill,
    salary: record.salary, salesSkill: record.salesSkill, sales: record.sales,
    stats: { ...DEFAULT_EMPLOYEE_STATS, ...(record.stats || {}) }
  };
}
function hire(id) {
  const c = S.candidates.find((x) => x.id === id);
  if (!c) return { ok: false, msg: 'この候補者はすでに採用されました。' };
  if (S.employees.length >= levelInfo().slots) return { ok: false, msg: '社員枠が埋まっています。会社レベルが上がると、社員枠が増えます。' };
  S.candidates = S.candidates.filter((x) => x.id !== id);
  addEmployee(c.name, c.skill, c.salesSkill, c.stats, c.sourceId, c.salary, c.sales);
  S.counts.hired++;
  checkMissionRewards();
  log(`${c.name}(${SKILLS[c.skill]})を採用した`);
  autoAssign();
  S.dirty = true;
  return { ok: true, msg: `${c.name}が入社しました。月間支出が${yen(c.salary)}増えます。` };
}

function availableDatabaseEmployees() {
  return S.employeeDatabase.filter((record) =>
    !S.employees.some((employee) => String(employee.sourceId) === String(record.id))
  );
}

function recruitDatabaseEmployee(eventName) {
  if (S.employees.length >= levelInfo().slots) return null;
  const available = availableDatabaseEmployees();
  if (!available.length) return null;

  const nonSales = available.filter((record) => !record.sales && record.skill !== 'sales');
  let record;
  if (eventName === '優秀な人材の応募') {
    const qualified = nonSales.filter((candidate) =>
      Math.max(...Object.values(candidate.stats || {}).map((value) => Number(value) || 0), 0) >= 50
    );
    if (!qualified.length) return null;
    record = pick(qualified);
  } else {
    record = pick(available);
  }

  const employee = addEmployee(
    record.name,
    record.skill,
    record.salesSkill,
    record.stats,
    record.id,
    record.salary,
    record.sales
  );
  S.candidates = S.candidates.filter((candidate) => String(candidate.sourceId) !== String(record.id));
  S.counts.hired++;
  checkMissionRewards();
  log(`${employee.name}(${SKILLS[employee.skill]})を採用した`);
  autoAssign();
  S.dirty = true;
  return employee;
}

function runSales() {
  S.employees.filter((e) => e.sales && !isAbsent(e) && S.day >= e.salesCooldownUntil).forEach((e) => {
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
    const morale = clamp(Number(e.morale) || 0, 0, 100);
    const moraleMultiplier = morale >= EMPLOYEE_LOW_MORALE_THRESHOLD
      ? 1
      : 0.7 + morale / 200;
    if (!job.skills.includes(e.skill)) {
      p += 0.5 * moraleMultiplier;
      return;
    }
    const statKey = EMPLOYEE_SPECIALTY_STATS[e.skill];
    const stat = statKey ? clamp(Number(e.stats?.[statKey]) || 0, 0, 100) : 50;
    const basePower = 0.5 + stat / 100;
    const required = Number(job.requirements?.[e.skill]) || 0;
    const abilityShortage = required > 0 && abilityTotal(staff, e.skill) < required;
    p += basePower * (abilityShortage ? 0.7 : 1) * moraleMultiplier;
  });
  if (S.boost[job.id] && S.day < S.boost[job.id]) p *= 1.4;
  return p;
}

function tick() {
  if (!S || S.over || S.pending) return;
  S.day++;
  const date = dateOf(S.day);
  let resignationCandidate = null;

  S.employees.forEach((e) => {
    if (isAbsent(e) && e.job) {
      unassign(e);
      S.dirty = true;
      log(`${e.name}が休職したため案件担当から外れた`, 'warn');
    }
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
    resignationCandidate = updateEmployeeMorale();
    runSales();
  }

  if (resignationCandidate) {
    const resignationEvent = S.eventDatabase.find(isResignationEvent);
    if (resignationEvent && eventTriggerMatches(resignationEvent)) {
      const job = resignationCandidate.job ? jobById(resignationCandidate.job) : null;
      const eventPrompt = buildDatabaseEvent(resignationEvent, job, resignationCandidate);
      if (eventPrompt) {
        raise(eventPrompt);
        S.marks.push({ day: S.day, kind: 'incident' });
      } else {
        resignEmployee(resignationCandidate);
      }
    } else {
      resignEmployee(resignationCandidate);
    }
  }

  // 案件の募集と求職者
  const before = S.offers.length;
  S.offers = S.offers.filter((o) => o.expires > S.day);
  if (S.offers.length !== before) S.dirty = true;
  if (S.day >= S.nextOfferDay) { newOffer(); S.nextOfferDay = S.day + ri(14, 24); }
  if (S.day >= S.nextCandDay && S.employees.length < levelInfo().slots) {
    refreshCandidates(S.recruitContractActive ? S.recruitContractJobType : null);
    S.nextCandDay = S.day + 60;
    S.recruitmentEvent = true;
    S.recruiting = true;
    S.recruitStage = 'confirm';
    notify('新しい求職者が来た', 'info');
  }

  // 会社イベントは給料日だけでなく、一定間隔で発生する
  if (
    !S.recruitmentEvent
    && !S.pending
    && !S.queue.length
    && !resignationCandidate
    && S.day >= S.nextManagementDay
  ) {
    const managementEvent = makeManagementEvent();
    if (managementEvent) {
      raise(managementEvent);
      S.marks.push({ day: S.day, kind: 'incident' });
    }
    S.nextManagementDay = S.day + ri(21, 35);
  }

  // DBイベント
  if (
    !S.recruitmentEvent
    && !S.pending
    && !S.queue.length
    && S.day - S.lastIncidentDay >= INCIDENT_COOLDOWN_DAYS
    && S.day >= S.nextIncidentDay
    && S.jobs.length > 0
  ) {
    const inc = makeIncident();
    if (inc) {
      raise(inc);
      S.lastIncidentDay = S.day;
      S.marks.push({ day: S.day, kind: 'incident' });
    }
    S.nextIncidentDay = S.day + ri(CONFIG.incidentGap[0], CONFIG.incidentGap[1]);
  }

  checkLevel();
  checkEnd();
  if (!S.recruitmentEvent && !S.pending && S.queue.length) advance();
}

function makeIncident() {
  if (!S.eventDatabase.length || !S.jobs.length) return null;
  const event = pickOccurringWeighted(
    S.eventDatabase.filter((item) => (
      item.type === 'incident' &&
      !isResignationEvent(item) &&
      eventTriggerMatches(item) &&
      incidentTargetJobs(item).length > 0 &&
      (S.employees.length < levelInfo().slots || !eventRequiresRecruitment(item))
    )),
    eventOccurrenceRate
  );
  if (!event) return null;
  const targetJobs = incidentTargetJobs(event);
  if (!targetJobs.length) return null;
  const job = pick(targetJobs);
  const targetEmployee = selectIncidentEmployee(job);
  return buildDatabaseEvent(event, job, null, targetEmployee);
}

function makeManagementEvent() {
  if (!S.eventDatabase.length) return null;
  const event = pickOccurringWeighted(
    S.eventDatabase.filter((item) => (
      item.type === 'management' &&
      !isResignationEvent(item) &&
      eventTriggerMatches(item) &&
      (S.employees.length < levelInfo().slots || !eventRequiresRecruitment(item))
    )),
    eventOccurrenceRate
  );
  if (!event) return null;
  let targetEmployee = null;
  if (hasEventTargetRule(event, 'employee')) {
    const candidates = matchingEventTargets(event, 'employee', S.employees);
    targetEmployee = candidates.length ? pick(candidates) : null;
  } else if (eventChangesIndividualMorale(event) && S.employees.length) {
    targetEmployee = pick(S.employees);
  }
  const needsJob = (event.choices || []).some((choice) =>
    Number(eventChoiceEffects(choice).quality_bonus || 0) !== 0
    || Number(eventChoiceEffects(choice).quality_penalty || 0) !== 0
  );
  const jobCandidates = matchingEventTargets(event, 'job', S.jobs);
  const targetJob = hasEventTargetRule(event, 'job')
    ? (jobCandidates.length ? pick(jobCandidates) : null)
    : needsJob && S.jobs.length ? pick(S.jobs) : null;
  return buildDatabaseEvent(event, targetJob, null, targetEmployee);
}

const warnedTriggerRuleEvents = new Set();

function warnInvalidTriggerRule(event, reason) {
  const key = String(event?.id || event?.name || 'unknown');
  if (warnedTriggerRuleEvents.has(key)) return;
  warnedTriggerRuleEvents.add(key);
  console.warn(`イベント発生条件を評価できません (${key}): ${reason}`);
}

function getEventTriggerRule(event) {
  let rule = event?.triggerRule;
  if (typeof rule === 'string') {
    try {
      rule = JSON.parse(rule);
    } catch (error) {
      warnInvalidTriggerRule(event, 'trigger_ruleのJSONを解析できません');
      return null;
    }
  }
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    warnInvalidTriggerRule(event, 'trigger_ruleがオブジェクトではありません');
    return null;
  }
  return rule;
}

function compareTriggerValue(actual, op, expected, event) {
  switch (op) {
    case 'eq': return actual === expected;
    case 'ne': return actual !== expected;
    case 'gt': return actual > expected;
    case 'gte': return actual >= expected;
    case 'lt': return actual < expected;
    case 'lte': return actual <= expected;
    default:
      warnInvalidTriggerRule(event, `未対応の比較演算子です: ${op}`);
      return false;
  }
}

function getTriggerMetric(metric) {
  const participants = participatingEmployees();
  const metrics = {
    'company.level': S.level,
    'company.money': S.money,
    'company.reputation': S.rep,
    'company.employeeLimit': levelInfo().slots,
    'employees.count': S.employees.length,
    'employees.salaryTotal': S.employees.reduce((sum, employee) => sum + employee.salary, 0),
    'jobs.count': S.jobs.length,
    'participants.count': participants.length,
    'participants.averageMorale': participants.length
      ? participants.reduce((sum, employee) => sum + employee.morale, 0) / participants.length
      : 0,
    'history.mediumDifficultySuccesses': S.mediumDifficultySuccesses,
    'history.totalSuccessfulJobs': S.totalSuccessfulJobs
  };
  return Object.prototype.hasOwnProperty.call(metrics, metric) ? metrics[metric] : undefined;
}

function evaluateTriggerRule(rule, event) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false;
  if (Array.isArray(rule.all)) return rule.all.every((condition) => evaluateTriggerRule(condition, event));
  if (Array.isArray(rule.any)) return rule.any.some((condition) => evaluateTriggerRule(condition, event));
  if (rule.exists && typeof rule.exists === 'object') {
    const { collection, where } = rule.exists;
    const items = collection === 'employees'
      ? S.employees
      : collection === 'jobs' ? S.jobs : null;
    if (!items) {
      warnInvalidTriggerRule(event, `未対応のexists collectionです: ${collection}`);
      return false;
    }
    return items.some((item) => evaluateTriggerRuleForItem(where, item, event));
  }
  if (typeof rule.metric === 'string') {
    const actual = getTriggerMetric(rule.metric);
    if (actual === undefined) {
      warnInvalidTriggerRule(event, `未対応のmetricです: ${rule.metric}`);
      return false;
    }
    const referencedMetric = typeof rule.value === 'string' ? getTriggerMetric(rule.value) : undefined;
    const expected = referencedMetric === undefined ? rule.value : referencedMetric;
    return compareTriggerValue(actual, rule.op, expected, event);
  }
  warnInvalidTriggerRule(event, '条件の形式が未対応です');
  return false;
}

function evaluateTriggerRuleForItem(rule, item, event) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false;
  if (Array.isArray(rule.all)) return rule.all.every((condition) => evaluateTriggerRuleForItem(condition, item, event));
  if (Array.isArray(rule.any)) return rule.any.some((condition) => evaluateTriggerRuleForItem(condition, item, event));

  let actual;
  if (rule.field === 'staffCount') {
    actual = Array.isArray(item.staff) ? item.staff.length : 0;
  } else if (rule.field === 'progressRate') {
    const work = Number(item.work) || 0;
    actual = work > 0 ? (Number(item.progress) || 0) / work : 0;
  } else if (typeof rule.field === 'string' && Object.prototype.hasOwnProperty.call(item, rule.field)) {
    actual = item[rule.field];
  } else {
    warnInvalidTriggerRule(event, `未対応の対象フィールドです: ${rule.field}`);
    return false;
  }
  return compareTriggerValue(actual, rule.op, rule.value, event);
}

function eventTriggerMatches(event) {
  const rule = getEventTriggerRule(event);
  return rule ? evaluateTriggerRule(rule, event) : false;
}

function hasEventTargetRule(event, targetType) {
  const targets = getEventTriggerRule(event)?.target;
  return Boolean(targets && Object.prototype.hasOwnProperty.call(targets, targetType));
}

function matchingEventTargets(event, targetType, items) {
  const targets = getEventTriggerRule(event)?.target;
  if (!targets || !Object.prototype.hasOwnProperty.call(targets, targetType)) return items;
  const rule = targets[targetType];
  if (rule && typeof rule === 'object' && !Array.isArray(rule) && Object.keys(rule).length === 0) {
    return items;
  }
  return items.filter((item) => evaluateTriggerRuleForItem(rule, item, event));
}

function participatingEmployees() {
  const employeeIds = new Set(
    S.jobs.flatMap((job) => job.staff || [])
  );
  return [...employeeIds].map(empById).filter(Boolean);
}

function incidentTargetJobs(event) {
  return matchingEventTargets(event, 'job', S.jobs);
}

function selectIncidentEmployee(job) {
  const assignedEmployees = (job?.staff || []).map(empById).filter(Boolean);
  const candidates = assignedEmployees.length ? assignedEmployees : S.employees;
  return candidates.length ? pick(candidates) : null;
}

function isResignationEvent(event) {
  return event?.name === '社員の退職希望';
}

function eventRequiresRecruitment(event) {
  return (event.choices || []).some((choice) =>
    Number(eventChoiceEffects(choice).employee) > 0
  );
}

function eventChangesIndividualMorale(event) {
  return (event.choices || []).some((choice) =>
    Number(eventChoiceEffects(choice).morale || 0) !== 0
    || Number(eventChoiceEffects(choice).retirement_risk || 0) !== 0
  );
}

function eventChoiceEffects(choice) {
  const effects = choice?.effects;
  if (!effects) return {};
  if (typeof effects === 'object') return effects;
  if (typeof effects !== 'string') {
    console.warn('イベント選択肢の効果がオブジェクトではありません', effects);
    return {};
  }
  try {
    const parsed = JSON.parse(effects);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (error) {
    console.warn('イベント選択肢の効果JSONを解析できません', error);
  }
  return {};
}

function triggerDebugEvent(eventId) {
  if (S.pending || S.recruiting) return false;
  const event = S.eventDatabase.find((item) => String(item.id) === String(eventId));
  if (!event) return false;
  const targetJobs = event.type === 'incident' || hasEventTargetRule(event, 'job')
    ? incidentTargetJobs(event)
    : [];
  const job = targetJobs.length ? pick(targetJobs) : null;
  let targetEmployee = null;
  if (hasEventTargetRule(event, 'employee')) {
    const candidates = matchingEventTargets(event, 'employee', S.employees);
    targetEmployee = candidates.length ? pick(candidates) : null;
  } else if (event.type === 'incident') {
    targetEmployee = selectIncidentEmployee(job);
  } else if (eventChangesIndividualMorale(event) && S.employees.length) {
    targetEmployee = pick(S.employees);
  }
  const prompt = buildDatabaseEvent(event, job, null, targetEmployee);
  if (!prompt) return false;
  S.playing = false;
  S.pending = prompt;
  S.dirty = true;
  return true;
}

function pickOccurringWeighted(items, weightOf) {
  if (!items.length) return null;
  const weighted = items
    .map((item) => ({ item, weight: Math.max(0, Number(weightOf(item)) || 0) }))
    .filter((entry) => entry.weight > 0);
  if (!weighted.length) return null;

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  const occurrenceChance = clamp(totalWeight / 100, 0, 1);
  if (rand() >= occurrenceChance) return null;

  let value = rand() * totalWeight;
  const index = weighted.findIndex((entry) => (value -= entry.weight) < 0);
  return weighted[index]?.item || null;
}

function pickWeighted(items, weightOf) {
  const weighted = items.map((item) => Math.max(0, Number(weightOf(item)) || 0));
  const total = weighted.reduce((sum, weight) => sum + weight, 0);
  if (!total) return null;
  let value = rand() * total;
  const index = weighted.findIndex((weight) => (value -= weight) < 0);
  return items[index] || null;
}

function applyDatabaseEventEffects(effects, job, targetEmployee, event, choiceLabel) {
  effects = eventChoiceEffects({ effects });
  const applied = [];
  const employee = targetEmployee ? empById(targetEmployee.id) : null;

  // 設備更新日を更新
  if (
    event?.name === '設備・開発環境の更新'
    && String(choiceLabel || '').includes('更新')
    && !String(choiceLabel || '').includes('見送る')
  ) {
    S.lastEquipmentUpdate = S.day;
    S.dirty = true;
  }

  // 資金
  const rawMoney = Number(effects?.money || 0);
  const securityCostRate = isSecurityIncident(event) ? 1 - 0.20 * S.invest.security : 1;
  const money = (rawMoney < 0 ? Math.round(rawMoney * securityCostRate) : rawMoney)
    + Number(effects?.sales || 0)
    + Number(effects?.profit || 0);
  if (money) {
    addMoney(money);
    applied.push(`資金 ${money >= 0 ? '+' : ''}${yen(money)}`);
  }

  // 評判
  const reputation = Number(effects?.reputation || 0);
  if (reputation) {
    addRep(reputation);
    applied.push(`評判 ${reputation >= 0 ? '+' : ''}${reputation}`);
  }

  // 対象社員の士気
  const morale = Number(effects?.morale || 0);
  if (morale && employee && adjustEmployeeMorale(employee, morale)) {
    applied.push(`${employee.name}の士気 ${morale >= 0 ? '+' : ''}${morale}`);
  }

  // 全社員の士気
  const moraleAll = Number(effects?.morale_all || 0);
  if (moraleAll) {
    S.employees.forEach((e) => adjustEmployeeMorale(e, moraleAll));
    applied.push(`全社員の士気 ${moraleAll >= 0 ? '+' : ''}${moraleAll}`);
  }

  // 退職リスク
  const retirementRisk = Number(effects?.retirement_risk || 0);
  if (retirementRisk && employee) {
    employee.retirementRisk = clamp((Number(employee.retirementRisk) || 0) + retirementRisk, -100, 100);
    S.dirty = true;
    applied.push(`${employee.name}の退職リスク ${retirementRisk >= 0 ? '+' : ''}${retirementRisk}%`);
  }

  // 通常の案件募集に追加
  const offerCount = Math.max(0, Math.floor(Number(effects?.offer) || 0));
  for (let i = 0; i < offerCount; i++) {
    const before = S.offers.length;
    newOffer();
    applied.push(S.offers.length > before
      ? '新しい案件を募集に追加'
      : '条件を満たす案件がなく、募集に追加できなかった');
  }

  // 品質向上
  const qualityBonus = Math.max(0, Number(effects?.quality_bonus) || 0);
  if (qualityBonus) {
    if (job) {
      job.qBonus += qualityBonus;
    } else {
      S.pendingQualityBonus = (S.pendingQualityBonus || 0) + qualityBonus;
    }
    applied.push(`案件品質 +${qualityBonus}`);
  }

  // 品質低下
  const qualityPenalty = Math.max(0, Number(effects?.quality_penalty) || 0);
  if (qualityPenalty) {
    if (job) {
      job.qDebt += qualityPenalty;
    } else {
      S.pendingQualityPenalty = (S.pendingQualityPenalty || 0) + qualityPenalty;
    }
    applied.push(`案件品質 -${qualityPenalty}`);
  }

  // 案件進捗の増加
  const progressBonusRate = clamp(Number(effects?.progress_bonus_rate) || 0, 0, 1);
  if (progressBonusRate) {
    const targetJobs = job ? [job] : S.jobs;
    targetJobs.forEach((j) => {
      j.progress = Math.min(j.work * 0.99, j.progress + j.work * progressBonusRate);
    });
    if (targetJobs.length) applied.push(`案件進捗 +${Math.round(progressBonusRate * 100)}%`);
  }

  // 案件進捗の減少
  const progressLossRate = clamp(Number(effects?.progress_loss_rate) || 0, 0, 1);
  if (progressLossRate) {
    const targetJobs = job ? [job] : S.jobs;
    targetJobs.forEach((j) => {
      j.progress = Math.max(0, j.progress - j.work * progressLossRate);
    });
    if (targetJobs.length) applied.push(`案件進捗 -${Math.round(progressLossRate * 100)}%`);
  }

  // workload互換処理
  const workload = Number(effects?.workload || 0);
  if (workload) {
    const targetJobs = job ? [job] : S.jobs;
    targetJobs.forEach((j) => {
      j.work = Math.max(j.progress + 1, j.work + workload);
    });
    if (targetJobs.length) applied.push(`作業量 ${workload >= 0 ? '+' : ''}${workload}`);
  }

  // 旧形式の品質キー互換
  const quality = Number(effects?.development || 0) + Number(effects?.security || 0) + Number(effects?.efficiency || 0);
  if (quality) {
    const targetJobs = job ? [job] : S.jobs;
    if (targetJobs.length) {
      targetJobs.forEach((j) => { j.qBonus += Math.round(quality / 10); });
    } else {
      S.pendingQualityBonus = (S.pendingQualityBonus || 0) + Math.round(quality / 10);
    }
    applied.push(`品質 ${quality >= 0 ? '+' : ''}${Math.round(quality / 10)}`);
  }

  // バックアップインシデントの進捗損失
  if (
    job
    && isBackupIncident(event)
    && (Number(effects?.business_continuity) < 0 || Number(effects?.data_integrity) < 0)
    && job.progress > 0
  ) {
    const lossRate = BACKUP_LOSS[S.invest.backup];
    job.progress *= 1 - lossRate;
    applied.push(`案件の現在進捗を${Math.round(lossRate * 100)}%失った`);
  }
  return applied;
}

function buildDatabaseEvent(event, job, resignationEmployee, incidentEmployee) {
  const choices = (event.choices || []).filter((choice) => choice?.label);
  if (!choices.length) return null;
  const targetEmployee = incidentEmployee || resignationEmployee;
  const targets = event.type === 'incident' || resignationEmployee || incidentEmployee
    ? {
      job: event.type === 'incident' || resignationEmployee ? job?.name || 'なし' : null,
      employees: targetEmployee ? [targetEmployee.name] : []
    }
    : null;
  const resignationDetails = resignationEmployee
    ? ` ${resignationEmployee.name}（士気 ${resignationEmployee.morale}/100）から退職の相談があった。`
    : '';
  return {
    kind: 'incident',
    category: event.type === 'incident' ? 'incident' : 'management',
    id: `database-event-${event.id}`,
    badge: event.type === 'incident' ? 'インシデント' : '会社イベント',
    title: event.name,
    body: `${event.description}${event.triggerCondition ? `（発生条件: ${event.triggerCondition}）` : ''}${resignationDetails}`,
    targets,
    choices: choices.map((choice) => ({
      label: choice.label,
      tag: 'other',
      lesson: choice.lesson || '',
      effects: eventChoiceEffects(choice),
      apply() {
        const effects = eventChoiceEffects(choice);
        const employeeCount = Math.max(0, Math.floor(Number(effects.employee) || 0));
        if (
          employeeCount > 0
          && (S.employees.length + employeeCount > levelInfo().slots
            || availableDatabaseEmployees().length < employeeCount)
        ) {
          return `${choice.label}。採用枠または採用可能な社員がいないため、採用できませんでした。`;
        }
        const recruited = [];
        for (let i = 0; i < employeeCount; i++) {
          const employee = recruitDatabaseEmployee(event.name);
          if (!employee) return `${choice.label}。採用枠または採用可能な社員がいないため、採用できませんでした。`;
          recruited.push(employee);
        }
        const applied = applyDatabaseEventEffects(effects, job, targetEmployee, event, choice.label);
        const target = resignationEmployee ? empById(resignationEmployee.id) : null;
        const resignationChance = target ? employeeResignationChance(target) : 0;
        if (resignationChance > 0 && rand() < resignationChance) {
          resignEmployee(target);
          applied.push(`${target.name}が退職`);
        }
        recruited.forEach((employee) => applied.push(`${employee.name}を採用`));
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
    S.totalSuccessfulJobs = (S.totalSuccessfulJobs || 0) + 1;
    if (job.diff >= 2) S.advancedSuccesses++;
    if (job.diff === 1) S.lowDifficultySuccesses++;
    if (job.diff === 2) S.mediumDifficultySuccesses++;
    S.experience += job.diff * 10;
  }
  if (job.diff === 3 && success) S.big++;
  checkMissionRewards();

  staff.forEach((e) => { e.job = null; });
  S.jobs = S.jobs.filter((j) => j.id !== job.id);
  log(`「${job.name}」が完成した。報酬 ${yen(pay)}`, 'good');
  S.dirty = true;

  const label = q >= 80 ? '良好' : q >= 60 ? '標準' : '低い';
  const lines = [
    lateDays === 0 ? `納期：${job.deadline === S.day ? '納期当日に完成' : `納期より${job.deadline - S.day}日早く完成`}` : `納期：${lateDays}日遅れ（報酬が${Math.round((1 - rf) * 100)}%減額）`,
    `品質：${q}点（${label}）${qf < 1 ? ` 報酬が${Math.round((1 - qf) * 100)}%減額` : ''}`,
    `報酬: ${yen(pay)}`,
    `評判: ${rep >= 0 ? '+' : ''}${rep}`,
    success ? `案件成功：経験値 +${job.diff * 10}` : '成功条件を達成できませんでした'
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
    S.successes = 0;
    checkMissionRewards();
    S.dirty = true;
    log(`会社が Lv.${S.level} になった`, 'good');
    raise({
      kind: 'notice', badge: 'レベルアップ', title: `会社が Lv.${S.level} に成長した`,
      body: `案件の成功と経験が認められ、社員枠が${next.slots}人に、同時に受注できる案件が${next.jobs}件に増えた。`,
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
  if (years < 1) return 'S';
  if (years < 2) return 'A';
  if (years < 3) return 'B';
  if (years < 4) return 'C';
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
  else if (S.day >= CONFIG.totalDays) {
    S.over = { type: 'timeout' };
  }
  if (S.over) S.over.day = S.day;
}

// ----- 決断画面で選んだとき -----
function resolve(idx) {
  const p = S.pending;
  if (!p || p.done) return null;
  const c = p.choices[idx];
  if (!c || typeof c.apply !== 'function') return null;
  const beforeMoney = S.money;
  const beforeRep = S.rep;
  const beforeEmployees = S.employees.length;
  const beforeMorale = S.employees.reduce((sum, employee) => sum + (Number(employee.morale) || 0), 0);
  const beforeProgress = S.jobs.reduce((sum, job) => sum + (Number(job.progress) || 0), 0);
  const text = c.apply() || '';
  S.tally.money += S.money - beforeMoney;
  S.tally.rep += S.rep - beforeRep;
  S.tally.employees += S.employees.length - beforeEmployees;
  S.tally.morale += S.employees.reduce((sum, employee) => sum + (Number(employee.morale) || 0), 0) - beforeMorale;
  S.tally.jobProgress += S.jobs.reduce((sum, job) => sum + (Number(job.progress) || 0), 0) - beforeProgress;
  S.tally.workload += Number(c.effects?.workload) || 0;
  p.done = true;
  if (p.kind === 'incident') {
    if (p.category === 'incident') S.tally.incidents++;
    else S.tally.managementEvents++;
    S.counts.handled++;
    if (c.tag === 'hide') S.tally.hide++;
    if (c.tag === 'honest') S.tally.honest++;
  }
  checkMissionRewards();
  S.dirty = true;
  checkEnd();
  return { text, lesson: c.lesson || p.lesson || '', title: p.title, kind: p.kind };
}
