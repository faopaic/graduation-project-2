// ===== 画面の表示と操作 =====
// game.js の計算結果(S)を、画面に表示する。

const $ = (id) => document.getElementById(id);
const DIFF_LABEL = ['', '低', '中', '高'];
const DIFF_CLASS = ['', 'low', 'mid', 'high'];

let stage = 1;           // 決断画面: 1 = 選ぶ / 2 = 結果と解説
let lastResult = null;
let timer = null;
let screenMode = 'title';  // 'title' | 'end' | null
let resetArmed = false;
let selectedDifficulty = 'normal'; // 難易度

// ----- 部品 -----
function avatar(skill, label) {
  return `<svg class="px" viewBox="0 0 8 8" role="img" aria-label="${label}">` +
    '<rect class="skin" x="2" y="0" width="4" height="3"/><rect class="hair" x="2" y="0" width="4" height="1"/>' +
    `<rect class="b-${skill}" x="1" y="3" width="6" height="3"/>` +
    '<rect class="legs" x="2" y="6" width="1" height="2"/><rect class="legs" x="5" y="6" width="1" height="2"/></svg>';
}
const skillTag = (sk, state) => `<span class="stag ${state || ''}" title="${SKILL_HELP[sk]}">${SKILLS[sk]}</span>`;
const pips = (lv, max) => '<span class="pips">' + Array.from({ length: max }, (_, i) => `<span class="${i < lv ? 'on' : ''}"></span>`).join('') + '</span>';
const seg = (cur, max, cells) => {
  const on = Math.floor(clamp(cur / max, 0, 1) * cells + 1e-9);
  return '<div class="seg">' + Array.from({ length: cells }, (_, i) => `<span class="${i < on ? 'on' : ''}"></span>`).join('') + '</div>';
};
const leftText = (job) => { const l = remainDays(job); return l >= 0 ? `残り${l}日` : `${-l}日遅れ`; };
const progressPct = (job) => Math.min(100, Math.floor(job.progress / job.work * 100));
const employeeStats = (e) => Object.entries(EMPLOYEE_STAT_LABELS)
  .map(([key, label]) => `${label} ${e.stats?.[key] ?? 0}/100`).join(' / ');
const requirementSkills = (job) => ['design', 'dev', 'security', 'infra']
  .filter((skill) => Number(job.requirements?.[skill]) > 0);
const requirementText = (job) => requirementSkills(job)
  .map((skill) => `${SKILLS[skill]} ${Number(job.requirements?.[skill]) || 0}`)
  .join(' / ');
const requirementProgressText = (job, employees) => requirementSkills(job)
  .map((skill) => `${SKILLS[skill]} ${abilityTotalWithoutSkillMatch(employees, skill)}/${Number(job.requirements?.[skill]) || 0}`)
  .join(' / ');

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} の読み込みに失敗しました (${response.status})`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`${url} がJSONを返していません。npm startでサーバーを起動してください`);
  }
  return response.json();
}

// ----- 画面の切り替え -----
function showPage(name) {
  if (name === 'company') name = 'home';
  const eventPage = S.recruiting ? 'recruit' : S.investing ? 'invest-event' : null;
  if ((S.pending || eventPage) && name !== eventPage) return;
  ['town', 'home', 'jobs', 'assignment', 'employees', 'recruit', 'upgrades', 'invest-event'].forEach((p) => $('page-' + p).classList.toggle('hidden', p !== name));
  document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
}

function toast(text, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
function flushNotices() {
  S.notices.splice(0).forEach((n) => toast(n.text, n.kind));
}

// ----- ホーム -----
const SEASONS = {
  spring: { name: '春', sky: '#ffdfe9', band: '#fff0f4', grass: '#b8e6a8', far1: '#f3c4d6', far2: '#d9c4f0', tree: '#f7a8c4', roof: '#ffb59e', page: '#ffe9f0', deco: ['#ffb6cf', '#ffd6e4'], n: 36, sz: 1.6 },
  summer: { name: '夏', sky: '#4fb6f0', band: '#9fdcf8', grass: '#5fcf8a', far1: '#8ec7ea', far2: '#a9b8ef', tree: '#1f9a62', roof: '#ff8f6e', page: '#d5f3ff', deco: [], n: 0, sz: 0 },
  autumn: { name: '秋', sky: '#ffc89a', band: '#ffe2c0', grass: '#d9c47a', far1: '#e8b49a', far2: '#caa0b8', tree: '#e0693a', roof: '#c2453a', page: '#ffe9d2', deco: ['#e0693a', '#f0a030'], n: 24, sz: 1.6 },
  winter: { name: '冬', sky: '#6f86b8', band: '#a9bde0', grass: '#f1f6fb', far1: '#8ea0c8', far2: '#9a94c8', tree: '#2f7f62', roof: '#e8f0ff', page: '#e3ecf8', deco: ['#ffffff'], n: 56, sz: 1.2 }
};
function seasonOf(day) {
  const month = dateOf(day).getMonth();
  return month >= 2 && month <= 4 ? 'spring' : month >= 5 && month <= 7 ? 'summer' : month >= 8 && month <= 10 ? 'autumn' : 'winter';
}
const SKILL_COLOR = { design: '#6dcfb2', dev: '#ffb59e', test: '#ffe08a', infra: '#9fd6f5', security: '#cbbcf3' };
function townScene() {
  const theme = SEASONS[seasonOf(S.day)];
  const rows = Math.min(4, Math.max(2, S.level + 1));
  const bx = 70, bw = 60, bh = 12 + rows * 10.5, by = 72 - bh;
  const windows = Array.from({ length: rows * 4 }, (_, i) => {
    const row = Math.floor(i / 4), col = i % 4;
        if (row === rows - 1 && (col === 1 || col === 2)) return ''; // コメントを追加してみた
    return `<rect x="${bx + 4 + col * 14}" y="${by + 6 + row * 10.5}" width="9" height="8" fill="#2e504a"/><rect x="${bx + 5 + col * 14}" y="${by + 7 + row * 10.5}" width="7" height="6" fill="${i < S.employees.length + 2 ? '#ffe08a' : '#9fd6f5'}"/>`;
  }).join('');
  const walkers = S.employees.filter((e) => !isAbsent(e)).map((e, i) => {
    const delay = -((Date.now() / 1000 + i * 5) % 30).toFixed(2);
    const label = `${e.name} ${SKILLS[e.skill]}`;
    return `<g class="walker" style="--t:${16 + (i * 7) % 13}s;--w:${70 + (i * 23) % 50}px;--delay:${delay}s" transform="translate(${8 + (i * 31) % 70} 0)">
      <title>${label}</title>
      <g class="emp-tip" aria-hidden="true">
        <rect x="-7" y="56" width="28" height="9" rx="1" fill="#fafffd" stroke="#2e504a" stroke-width=".7"/>
        <text x="7" y="60" text-anchor="middle" font-size="3.1" fill="#2e504a">${e.name}</text>
        <text x="7" y="63.5" text-anchor="middle" font-size="2.8" fill="#57756f">${SKILLS[e.skill]}</text>
      </g>
      <g class="bounce"><rect x="2" y="77" width="4" height="3" fill="#f8cdbb"/><rect x="1" y="80" width="6" height="3" fill="${SKILL_COLOR[e.skill]}"/><rect x="2" y="83" width="1" height="2" fill="#2e504a"/><rect x="5" y="83" width="1" height="2" fill="#2e504a"/></g>
    </g>`;
  }).join('');
  const decor = theme.n ? Array.from({ length: theme.n }, (_, i) => `<rect x="${(i * 37) % 200}" y="${(i * 53) % 70}" width="${theme.sz}" height="${theme.sz}" fill="${theme.deco[i % theme.deco.length]}"/>`).join('') : '';
  return `<svg class="town-scene" viewBox="0 0 200 100" role="img" aria-label="会社のある街">
    <rect width="200" height="72" fill="${theme.sky}"/><rect y="40" width="200" height="32" fill="${theme.band}"/><rect x="150" y="8" width="12" height="12" fill="#fff3b0"/>
    <g fill="#fff"><rect x="20" y="14" width="22" height="5"/><rect x="24" y="11" width="14" height="4"/><rect x="100" y="8" width="26" height="5"/></g>
    <rect y="72" width="200" height="28" fill="${theme.grass}"/><rect y="72" width="200" height="1.5" fill="#2e504a"/><rect y="86" width="200" height="9" fill="#d5d5d5"/>
    <g class="company" data-go="company"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#2e504a"/><rect x="${bx + 1}" y="${by + 1}" width="${bw - 2}" height="${bh - 1}" fill="#fff7ea"/><rect class="roof" x="${bx - 3}" y="${by - 4}" width="${bw + 6}" height="5" fill="${theme.roof}"/><rect x="${bx + 8}" y="${by - 16}" width="${bw - 16}" height="11" fill="#fafffd" stroke="#2e504a" stroke-width=".8"/><text x="${bx + bw / 2}" y="${by - 8}" font-size="4.3" text-anchor="middle" fill="#2e504a">PEACE株式会社</text>${windows}<rect x="${bx + 24}" y="58" width="12" height="14" fill="#2e504a"/><rect x="${bx + 25}" y="59" width="10" height="13" fill="#6dcfb2"/><rect x="${bx + 33}" y="65" width="1" height="1" fill="#2e504a"/></g>
    <g fill="${theme.tree}"><rect x="14" y="62" width="14" height="10"/><rect x="176" y="62" width="14" height="10"/></g>${decor}${walkers}<text x="16" y="9" font-size="4.4" text-anchor="middle" fill="#2e504a">${theme.name}</text><text x="100" y="97" font-size="4" text-anchor="middle" fill="#2e504a">▲ 会社をクリックすると、中が見られる</text>
  </svg>`;
}
function renderTown() {
  const theme = SEASONS[seasonOf(S.day)];
  document.documentElement.style.setProperty('--page', theme.page);
  const alerts = [];
  const hint = hintText();
  if (hint) alerts.push(`<div class="hint">${hint}</div>`);
  if (S.money < monthlyCost() * 1.5) alerts.push('<div class="alert"><span>資金が少なくなっている。このままだと、来月の給料が払えなくなる。</span></div>');
  S.jobs.filter((j) => j.late).forEach((j) => alerts.push(`<div class="alert"><span>「${j.name}」が納期を過ぎている。早く完成させよう。</span></div>`));
  const projects = S.jobs.length ? S.jobs.map((j) => `<div class="town-job"><div class="row"><strong class="small">${j.name}</strong><span class="small ${remainDays(j) <= 7 ? 'neg' : 'muted'}" data-left="${j.id}">${leftText(j)}</span></div><div class="bar"><div class="fill" data-bar="${j.id}" style="width:${progressPct(j)}%"></div></div></div>`).join('') : '<div class="small muted">進行中の案件はない。下の「案件」から受注しよう。</div>';
  $('town-body').innerHTML = townScene() + `<div class="town-grid"><div>${alerts.join('')}<div class="panel"><div class="panel-title">いまの会社</div><div class="goal-row"><span>資金</span><span data-live="money">${yen(S.money)}</span></div><div class="goal-row"><span>評判</span><span data-live="rep">${S.rep} / 100</span></div><div class="goal-row"><span>社員</span><span data-live="staff">${S.employees.length} / ${levelInfo().slots}人</span></div><div class="goal-row"><span>会社Lv</span><span>Lv.${S.level}</span></div></div>${levelPanel()}</div><div class="panel"><div class="panel-title">進行中の案件</div>${projects}<div class="town-menu"><button class="btn-small" data-act="auto">おまかせ配置</button></div></div></div>`;
}

function renderHome() {
  // お知らせ
  const alerts = [];
  const hint = hintText();
  if (hint) alerts.push(`<div class="hint">${hint}</div>`);
  if (S.money < monthlyCost() * 1.5) alerts.push(`<div class="alert"><span>資金が少なくなっている。このままだと、来月の給料が払えなくなる。</span></div>`);
  S.jobs.filter((j) => j.late).forEach((j) => alerts.push(`<div class="alert"><span>「${j.name}」が納期を過ぎている。早く完成させよう。</span></div>`));
  $('home-alerts').innerHTML = alerts.join('');

  // 休職者のみ表示
  const seats = S.employees.filter(isAbsent).map((e) =>
    `<div class="seat seat-away">${avatar(e.skill, e.name + 'のドット絵')}<div><strong>${e.name}</strong> <span class="small muted">${SKILLS[e.skill]}</span><div class="small neg" data-away="${e.absentUntil}">休職中 あと${e.absentUntil - S.day}日</div></div></div>`
  );
  $('home-seats').innerHTML = seats.join('') || '<div class="card muted">現在、休職者はいません。</div>';

  // 進行中の案件
  $('home-projects').innerHTML = S.jobs.length ? S.jobs.map(projectCard).join('') :
    '<div class="card muted">まだ案件がありません。「案件」ページから受注しよう。</div>';

  // 右パネル
  $('home-side').innerHTML = levelPanel() + goalPanel()
    + '<button class="btn-small mission-toggle" data-act="toggle-missions">ミッションを見る</button>';
}

function hintText() {
  if (S.counts.accepted === 0) return '最初の一歩: 下の「案件」ページで、最初の案件を受注しよう。まずは難易度が低い案件がおすすめ。';
  if (S.jobs.length === 0) return '案件がない間も、給料は出ていく。「案件」ページで、次の案件を受注しよう。';
  if (S.jobs.some((j) => j.staff.length === 0)) return '担当者がいない案件がある。案件の「担当」で、社員を選んで割り振ろう。';
  if (!S.playing && S.day === 0) return '準備ができたら、上の「▶ 再生」を押して、時間を進めよう。';
  return '';
}

function projectCard(job) {
  const pct = progressPct(job);
  const left = remainDays(job);
  const assigned = job.staff.map(empById).filter(Boolean);
  const req = requirementSkills(job).map((sk) => skillTag(sk,
    meetsRequirement(job, sk, assigned) ? 'ok' : 'ng'
  )).join('');
  const chips = S.employees.map((e) => {
    const mine = e.job === job.id, busy = e.sales || (e.job && !mine), away = isAbsent(e);
    if (e.sales) return `<span class="chip busy" title="営業担当中">${e.name}<span class="small">営業担当</span></span>`;
    return `<button class="chip ${mine ? 'on' : ''} ${busy ? 'busy' : ''} ${away ? 'away' : ''}" data-act="assign" data-job="${job.id}" data-emp="${e.id}" title="${SKILLS[e.skill]}">${e.name}<span class="small">${SKILLS[e.skill]}</span></button>`;
  }).join('');
  return `<div class="card proj">
    <div class="row"><strong>${job.name}</strong><span class="small ${left <= 7 ? 'neg' : 'muted'}" data-left="${job.id}">${leftText(job)}</span></div>
    <div class="bar"><div class="fill ${left <= 7 ? 'fill-warn' : ''}" data-bar="${job.id}" style="width:${pct}%"></div></div>
    <div class="small"><span data-pct="${job.id}">進捗 ${pct}%</span> / 報酬 ${yen(job.reward)}</div>
    <div class="req small">要求能力値: ${requirementText(job)}</div>
    <div class="req small">必要能力値を満たしたスキル(緑) / 未達(赤): ${req}</div>
    <div class="chips">担当: ${chips}</div>
  </div>`;
}

function levelPanel() {
  const next = LEVELS[S.level];
  if (!next) {
    const current = levelInfo();
    return `<div class="panel"><div class="panel-title">会社Lv.${current.lv} に成長した</div><div class="small">席が${current.slots}つ、案件は同時に${current.jobs}件まで受けられる。</div></div>`;
  }
  return `<div class="panel"><div class="panel-title">会社Lv.${next.lv}までの条件</div>
    <div class="goal-row"><span>案件成功</span><span>${S.successes} / ${next.needSuccess}</span></div>${seg(S.successes, next.needSuccess, next.needSuccess)}
    <div class="goal-row"><span>経験値</span><span>${S.experience} / ${next.needExp}</span></div>${seg(S.experience, next.needExp, 10)}</div>`;
}

function goalPanel() {
  const rows = goalList().map((g) => `<div class="goal-row"><span>${g.met ? '■' : '□'} ${g.label}</span><span>${g.fmt(g.cur)} / ${g.fmt(g.target)}</span></div>${seg(g.cur, g.target, 10)}`).join('');
  return `<div class="panel"><div class="panel-title">クリア条件(すべての条件を達成)</div>${rows}</div>`;
  
}


function missionPanel() {
  const tierNames = ['初級', '中級', '上級'];
  const tiers = tierNames.filter((tier, index) =>
    !MISSIONS.filter((mission) => mission.tier === tier).every((mission) => mission.met(S))
      && (index === 0 || MISSIONS
        .filter((mission) => mission.tier === tierNames[index - 1])
        .every((mission) => mission.met(S)))
  );
  const challengeMissions = MISSIONS.filter((mission) => mission.tier === 'チャレンジ')
    .filter((mission) => !mission.met(S));
  let lists = tiers.map((tier) => {
    const missions = MISSIONS.filter((mission) => mission.tier === tier);
    const unlockedLabel = tier === '中級' || tier === '上級'
      ? '<span class="mission-unlocked">解放済み</span>' : '';
    return `<li class="mission-tier"><div class="mission-tier-title">${tier}${unlockedLabel}</div><ul>${missions.map((mission) => {
      const done = mission.met(S);
      return `<li class="${done ? 'done' : ''}">${mission.label}<span class="mission-exp">${mission.rewardType === 'money' ? `+${yen(mission.rewardAmount)}` : `+${mission.rewardAmount}EXP`}</span></li>`;
    }).join('')}</ul></li>`;
  }).join('');
  if (challengeMissions.length) {
    lists += `<li class="mission-tier">チャレンジ<ul>${challengeMissions.map((mission) =>
      `<li>${mission.label}<span class="mission-exp">${mission.rewardType === 'money' ? `+${yen(mission.rewardAmount)}` : `+${mission.rewardAmount}EXP`}</span></li>`
    ).join('')}</ul></li>`;
  }
  if (!lists) return '<div class="panel panel-hl"><div class="panel-title">ミッション</div><div class="small">すべてのミッションを達成しました。</div></div>';
  return `<div class="panel panel-hl"><div class="panel-title">ミッション</div><ul class="mission">${lists}</ul></div>`;
}

// ----- 案件 -----
function renderJobs() {
  const info = levelInfo();
  const list = S.offers.map(offerCard).join('') || '<div class="card muted">いまは募集がない。しばらく待とう。</div>';
  $('jobs-body').innerHTML = `<h2>案件を選ぶ <span class="muted small">同時進行 ${S.jobs.length}/${info.jobs}件</span></h2>
    <p class="small muted legend">割り当てた社員のスキル別能力値の合計が要求値以上: 緑=達成 / 赤=未達。スキルが合わない社員は、半分の力で手伝う。</p>${list}`;
}

function offerCard(o) {
  const locked = S.rep < o.minRep;
  const req = requirementSkills(o).map((sk) => skillTag(sk,
    meetsRequirement(o, sk, S.employees) ? 'ok' : 'ng'
  )).join('');
  const kind = o.diff >= 3 ? 'big' : o.skills.length <= 2 ? 'web' : 'sys';
  const right = locked ? `<span class="offer-lock">評判${o.minRep}で解放</span>` : `<button class="act" data-act="accept" data-id="${o.id}">受注する</button>`;
  return `<div class="offer offer-${kind} ${locked ? 'locked' : ''}">
    <div class="offer-head"><strong>${o.name}</strong><span class="offer-tag">${o.diff >= 3 ? '大規模' : '案件'}</span></div>
    ${o.diff >= 3 ? '<div class="offer-big">★ 大規模案件 ★</div>' : ''}
    <div class="offer-row"><span class="muted small">難易度</span><span class="stars">${'★'.repeat(o.diff)}${'☆'.repeat(3 - o.diff)}</span><span class="small">${DIFF_LABEL[o.diff]}</span></div>
    <div class="offer-row"><span class="muted small">報酬</span><span class="offer-reward">${yen(o.reward)}</span></div>
    <div class="offer-row"><span class="muted small">納期</span><span>${o.days}日</span><span class="muted small">仕事量 ${o.work}</span></div>
    <div class="req">要求能力値: ${requirementText(o)}</div><div class="req">${req}</div><div class="small muted">リスク: ${o.risk}</div>
    <div class="offer-foot"><span class="small muted" data-expire="${o.expires}">募集あと${o.expires - S.day}日</span>${right}</div>
  </div>`;
}

// ----- 案件の担当決定 -----
function renderAssignment() {
  const job = S.assignmentJobId ? jobById(S.assignmentJobId) : null;
  if (!job) {
    $('assignment-body').innerHTML = '<div class="card muted">担当を決める案件がありません。</div>';
    return;
  }
  const chips = S.employees.map((e) => {
    const mine = e.job === job.id;
    const busy = e.sales || (e.job && !mine);
    const away = isAbsent(e);
    if (e.sales) return `<span class="chip busy" title="営業担当中">${e.name}<span class="small">営業担当</span></span>`;
    return `<button class="chip ${mine ? 'on' : ''} ${busy ? 'busy' : ''} ${away ? 'away' : ''}" data-act="assign" data-job="${job.id}" data-emp="${e.id}" title="${SKILLS[e.skill]}">${e.name}<span class="small">${SKILLS[e.skill]}</span></button>`;
  }).join('');
  const assigned = job.staff.map(empById).filter(Boolean);
  const req = requirementSkills(job).map((sk) => skillTag(sk,
    meetsRequirement(job, sk, assigned) ? 'ok' : 'ng'
  )).join('');
  $('assignment-body').innerHTML = `<h2>担当を決める</h2>
    <div class="card job"><strong>${job.name}</strong>
      <div class="small">報酬 ${yen(job.reward)} / 納期 ${job.deadline - S.day}日 / 仕事量 ${job.work}</div>
      <div class="req small">要求能力値: ${requirementText(job)}</div>
      <div class="req small">割り当て能力値: ${requirementProgressText(job, assigned)}</div>
      <div class="req small">必要能力値を満たしたスキル(緑) / 未達(赤): ${req}</div>
      <div class="chips">担当: ${chips || '<span class="muted">社員がいません</span>'}</div>
    </div>
    <p class="small muted legend">社員を選ぶと、この案件の担当になります。担当中の社員を選ぶと、担当を外します。</p>
    <button class="btn-small" data-act="auto-assignment">おまかせ配置</button>
    <button class="btn-main" data-act="finish-assignment">担当を決め終える</button>`;
}

// ----- 社員一覧 -----
function renderEmployees() {
  const slots = levelInfo().slots;
  const salesButton = (e) => e.sales
    ? `<button class="btn-small" data-act="toggle-sales" data-id="${e.id}">営業担当を外す</button>`
    : `<button class="btn-small" data-act="toggle-sales" data-id="${e.id}">営業担当にする</button>`;
  const viewButton = (view) => `<button class="btn-small" data-act="employee-view" data-view="${view}">${view === 'sales' ? '営業担当を見る' : '社員一覧に戻る'}</button>`;
  if (S.employeeView === 'sales') {
    const sales = S.employees.filter((e) => e.sales).map((e) => {
      const resting = e.salesCooldownUntil > S.day;
      const status = resting ? `営業休止中（あと${e.salesCooldownUntil - S.day}日）` : '営業活動中';
      return `<div class="employee-card">
        <div class="employee-card-head"><div class="employee-avatar">${avatar(e.skill, e.name + 'のドット絵')}</div><div><div class="small muted">社員 / 営業担当</div><strong class="employee-name">${e.name}</strong><span class="employee-skill">${SKILLS[e.skill]}</span></div></div>
        <div class="employee-status">${status}</div><div class="employee-info"><span>営業力</span><strong>${e.salesSkill}/100</strong></div>
        <div class="small">${employeeStats(e)}</div><div class="small muted">案件獲得率 ${salesSuccessRate(e.salesSkill)}%（基礎30%） / 獲得後1〜3か月休止</div>
        <div class="employee-actions">${salesButton(e)}</div></div>`;
    }).join('') || '<div class="card muted">営業担当がいません。社員一覧から担当者を設定してください。</div>';
    $('employees-body').innerHTML = `<div class="row"><h2>社員一覧 <span class="muted small">${S.employees.length} / ${slots}人</span></h2><div>${viewButton('staff')} <button class="btn-small" data-go="upgrades">社員強化</button></div></div>
      <p class="small muted legend">営業担当は毎月、基礎30%に営業力を加味した確率で案件を獲得します。営業力は将来データベースの値に差し替えられます。</p>
      <h3>営業担当</h3><div class="employee-grid">${sales}</div>`;
    return;
  }
  const cards = S.employees.filter((e) => !e.sales).map((e) => {
    const job = e.job ? jobById(e.job) : null;
    const salesRest = e.sales && e.salesCooldownUntil > S.day ? `（休止中 あと${e.salesCooldownUntil - S.day}日）` : '';
    const status = isAbsent(e) ? `欠勤中(あと${e.absentUntil - S.day}日)` : e.sales ? `営業担当${salesRest}` : job ? `「${job.name}」を担当中` : '待機中';
    return `<div class="employee-card">
      <div class="employee-card-head"><div class="employee-avatar">${avatar(e.skill, e.name + 'のドット絵')}</div><div><div class="small muted">社員</div><strong class="employee-name">${e.name}</strong><span class="employee-skill">${SKILLS[e.skill]}</span></div></div>
      <div class="small employee-help">${SKILL_HELP[e.skill]}</div><div class="employee-status">${status}</div>
      <div class="employee-info"><span>月給</span><strong>${yen(e.salary)}</strong></div><div class="small">営業力 ${e.salesSkill}/100</div><div class="small">${employeeStats(e)}</div>
      <div class="employee-actions">${salesButton(e)}</div></div>`;
  }).join('') || '<div class="card muted">営業担当以外の社員がいません。営業担当を見るボタンから確認できます。</div>';
  $('employees-body').innerHTML = `<div class="row"><h2>社員一覧 <span class="muted small">${S.employees.length} / ${slots}人</span></h2><div>${viewButton('sales')} <button class="btn-small" data-go="upgrades">社員強化</button></div></div>
    <p class="small muted legend">社員のスキルや担当案件を確認できます。営業担当は毎月、基礎30%に営業力を加味した確率で1〜3件の案件を獲得し、獲得後1〜3か月休みます。</p><div class="employee-grid">${cards}</div>`;
}

// ----- 採用イベント -----
function renderRecruit() {
  if (S.recruitStage === 'confirm') {
    $('recruit-body').innerHTML = `<h2>採用イベント</h2>
      <div class="card">
        <p>新しい求職者が来ました。候補者を確認して、採用活動を行いますか?</p>
        <p class="small muted">採用しない場合でも、あとで別の採用イベントが発生します。</p>
        <div class="row gap-top">
          <button class="btn-main" data-act="open-recruit">候補者を見る</button>
          <button class="btn-small" data-act="finish-recruit">今回は見送る</button>
        </div>
      </div>`;
    return;
  }
  const slots = levelInfo().slots;
  const free = slots - S.employees.length;
  const staff = S.employees.map((e) => {
    const job = e.job ? jobById(e.job) : null;
    const status = isAbsent(e) ? `休職中(あと${e.absentUntil - S.day}日)` : job ? `「${job.name}」を担当中` : '待機中';
    return `<div class="card job"><div class="row"><div class="who">${avatar(e.skill, e.name + 'のドット絵')}<div><strong>${e.name}</strong> <span class="small muted">${SKILLS[e.skill]}</span><div class="small muted">${SKILL_HELP[e.skill]}</div></div></div><span class="small">${status}</span></div>
      <div class="small">月給 ${yen(e.salary)}</div></div>`;
  }).join('');
  if (S.recruitStage === 'staff') {
    $('recruit-body').innerHTML = `<h2>在籍社員 <span class="muted small">${S.employees.length} / ${slots}人</span></h2>
      <p class="small muted legend">現在在籍している社員を確認できます。</p>${staff || '<div class="card muted">社員がいません。</div>'}
      <div class="recruit-actions"><button class="btn-small" data-act="back-recruit">求職者一覧に戻る</button></div>`;
    return;
  }
  const cards = S.candidates.map((c) => `<div class="resume">
    <div class="resume-head">履 歴 書</div><div class="resume-top"><div class="resume-photo">${avatar(c.skill, c.name + 'のドット絵')}</div>
      <div><div class="small muted">名前</div><strong class="resume-name">${c.name}</strong><div class="small muted">スキル</div><div>${SKILLS[c.skill]}</div></div></div>
    <div class="small resume-help">${SKILL_HELP[c.skill]}</div><div class="resume-row"><span class="muted small">月給</span><b>${yen(c.salary)}</b></div>
    <div class="small muted">採用後の月の支出 ${yen(monthlyCost())} → ${yen(monthlyCost() + c.salary)}</div>
    <button class="act resume-btn" data-act="hire" data-id="${c.id}">採用する</button></div>`).join('') || '<div class="card muted">いまは求職者がいない。しばらく待とう。</div>';
  $('recruit-body').innerHTML = `<h2>採用イベント <span class="muted small">空席 ${free} / 席 ${slots}</span></h2>
    <p class="small muted legend">新しい求職者が来ました。採用すると、毎月の支出が増えます。席がいっぱいのときは、会社Lvを上げると席が増えます。</p>
    <h3>求職者</h3><div class="resume-grid">${cards}</div>
    <div class="recruit-actions">
      <button class="btn-small" data-act="open-staff">在籍社員を見る</button>
      <button class="btn-main" data-act="finish-recruit">採用を終える</button>
    </div>`;
}

// ----- 社員強化一覧 -----
function renderUpgrades() {
  const cards = S.employees.map((e) => {
    const statKey = EMPLOYEE_SPECIALTY_STATS[e.skill];
    const currentStat = statKey ? (e.stats?.[statKey] ?? 0) : 0;
    const maxed = currentStat >= 100;
    const chance = Math.round(employeeUpgradeChance(currentStat) * 100);
    const statText = statKey
      ? `${EMPLOYEE_STAT_LABELS[statKey]} ${currentStat}${maxed ? '' : ` → ${Math.min(100, currentStat + EMPLOYEE_STAT_UPGRADE_AMOUNT)}`}`
      : '';
    const button = maxed ? '<span class="small">最大値</span>' : `<button class="act" data-act="upgrade-employee" data-id="${e.id}">強化する ${yen(EMPLOYEE_STAT_UPGRADE_COST)}</button>`;
    return `<div class="card job"><div class="row"><div class="who">${avatar(e.skill, e.name + 'のドット絵')}<div><strong>${e.name}</strong> <span class="small muted">${SKILLS[e.skill]}</span></div></div>${button}</div>
      <div class="small">月給 ${yen(e.salary)} / 強化成功率 ${chance}%</div>
      ${statText ? `<div class="small">得意分野強化: ${statText}</div>` : ''}</div>`;
  }).join('') || '<div class="card muted">社員がいません。</div>';
  $('upgrades-body').innerHTML = `<h2>社員強化</h2>
    <p class="small muted legend">資金を使って社員の得意分野を強化できます。得意分野は大きく伸び、それ以外のステータスも低確率で少し伸びます。</p>${cards}`;
}

// ----- 投資イベント -----
function renderInvestEvent() {
  const cards = Object.keys(INVEST).map((k) => {
    const inv = INVEST[k], lv = S.invest[k], max = inv.costs.length;
    const btn = lv >= max ? '<span class="small">最大</span>' : `<button class="act" data-act="invest" data-key="${k}">強化する ${yen(inv.costs[lv])}</button>`;
    return `<div class="card job"><div class="row"><div><strong>${inv.name}</strong> ${pips(lv, max)}</div>${btn}</div>
      <div class="small">${inv.help}</div><div class="small muted">いまの効果: ${inv.now(lv)}</div></div>`;
  }).join('');
  $('invest-event-body').innerHTML = `<h2>投資イベント <span class="muted small">資金 ${yen(S.money)}</span></h2>
    <p class="small muted legend">投資イベントが発生しました。障害への備えを強化できます。</p>${cards}
    <button class="btn-main" data-act="finish-invest">投資を終える</button>`;
}

// ----- 時間バーとHUD -----
function renderTrack() {
  $('track-marks').innerHTML = S.marks.map((m) => `<span class="marker marker-${m.kind}" style="left:${(m.day / CONFIG.totalDays * 100).toFixed(2)}%"></span>`).join('');
}

function updateLive() {
  $('h-money').textContent = yen(S.money);
  $('h-money').className = S.money < monthlyCost() * 1.5 ? 'neg' : '';
  $('h-cost').textContent = `(月の支出 ${yen(monthlyCost())})`;
  $('h-rep').textContent = S.rep;
  $('h-staff').textContent = `${S.employees.length}/${levelInfo().slots}人`;
  $('h-level').textContent = `会社Lv.${S.level}`;
  $('h-date').textContent = dateLabel(S.day);
  $('track-fill').style.width = (S.day / CONFIG.totalDays * 100) + '%';
  const eventActive = S.pending || S.recruiting || S.investing;
  $('play-btn').textContent = eventActive ? 'イベント中' : S.playing && !S.pending ? '❚❚ 一時停止' : '▶ 再生';
  $('play-btn').disabled = eventActive;
  $('speed-btn').disabled = eventActive;
  $('speed-btn').textContent = CONFIG.speeds[S.speedIdx].label;

  S.jobs.forEach((job) => {
    const pct = progressPct(job), left = remainDays(job);
    const bar = document.querySelector(`[data-bar="${job.id}"]`);
    if (bar) { bar.style.width = pct + '%'; bar.classList.toggle('fill-warn', left <= 7); }
    const p = document.querySelector(`[data-pct="${job.id}"]`);
    if (p) p.textContent = `進捗 ${pct}%`;
    const l = document.querySelector(`[data-left="${job.id}"]`);
    if (l) { l.textContent = leftText(job); l.className = 'small ' + (left <= 7 ? 'neg' : 'muted'); }
  });
  document.querySelectorAll('[data-expire]').forEach((el) => { el.textContent = `募集あと${Math.max(0, Number(el.dataset.expire) - S.day)}日`; });
  document.querySelectorAll('[data-away]').forEach((el) => { el.textContent = `欠勤中 あと${Math.max(0, Number(el.dataset.away) - S.day)}日`; });
}

function render() {
  renderTown();
  renderHome();
  renderJobs();
  renderAssignment();
  renderEmployees();
  renderRecruit();
  renderUpgrades();
  renderInvestEvent();
  renderTrack();
  updateLive();
  renderModal();
  S.dirty = false;
}

async function loadEmployeeDatabase() {
  const apiUrl = '/api/employees';
  const records = await fetchJson(apiUrl);
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('社員データが空、または配列ではありません');
  }
  return records;
}

async function loadPageTemplates() {
  const pages = ['town', 'home', 'jobs', 'assignment', 'employees', 'recruit', 'upgrades', 'invest-event'];
  const templates = await Promise.all(pages.map(async (page) => {
    const url = `pages/${page}.html`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url} の読み込みに失敗しました (${response.status})`);
    return response.text();
  }));
  $('page-container').innerHTML = templates.join('');
}

async function loadEventDatabase() {
  const apiUrl = '/api/events';
  const records = await fetchJson(apiUrl);
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('DBイベントが空、または配列ではありません');
  }
  return records;
}

async function loadProjectDatabase() {
  const apiUrl = '/api/projects';
  const records = await fetchJson(apiUrl);
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('案件データが空、または配列ではありません');
  }
  return records;
}

async function loadMissionDatabase() {
  const records = await fetchJson('/api/missions');
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('DBミッションが空、または配列ではありません');
  }
  return records;
}

async function initializeGame() {
  try {
    if (location.protocol === 'file:') {
      throw new Error('index.htmlを直接開かず、ターミナルで「npm start」を実行して http://localhost:3000 を開いてください');
    }
    const [, employeeDatabase, eventDatabase, projectDatabase, missionDatabase] = await Promise.all([
      loadPageTemplates(),
      loadEmployeeDatabase(),
      loadEventDatabase(),
      loadProjectDatabase(),
      loadMissionDatabase()
    ]);
    newGame(employeeDatabase, eventDatabase, projectDatabase, missionDatabase);
    render();
    showTitle();
  } catch (error) {
    console.error('ゲーム画面またはDBデータを読み込めないためゲームを開始できません。', error);
    const message = error instanceof Error ? error.message : String(error);
    document.body.innerHTML = `<main class="app"><section class="page"><h1>ゲームを開始できません</h1><p>ゲーム画面またはデータベースの読み込みに失敗しました。</p><p class="small">${message}</p><p>サーバーとデータベースの接続を確認してください。</p></section></main>`;
  }
}

// ----- 決断画面 -----
function renderModal() {
  const p = S && S.pending;
  const showMission = S && S.missionsOpen && !p && screenMode === null;
  $('modal').classList.toggle('hidden', (!p && !showMission) || screenMode !== null);
  if (showMission) {
    $('modal-body').innerHTML = `<div class="modal-head"><span class="badge badge-low">ミッション</span><button class="btn-small" data-act="toggle-missions">閉じる</button></div>${missionPanel()}`;
    return;
  }
  if (!p || screenMode !== null) return;
  const body = $('modal-body');

  if (stage === 2 && lastResult) {
    body.innerHTML = `<div class="modal-head"><span class="badge badge-low">結果</span></div><h3>${lastResult.title}</h3>
      <div class="result">${lastResult.text}</div>
      ${lastResult.lesson ? `<div class="lesson"><div class="small muted">ひとこと解説</div>${lastResult.lesson}</div>` : ''}
      <button class="choice" data-act="continue"><strong>つづける</strong></button>`;
    return;
  }

  const badgeClass = p.kind === 'report' ? 'low' : p.kind === 'notice' && !p.id ? 'mid' : 'high';
  const head = p.kind === 'incident'
    ? `<div class="inc-head"><span class="inc-title">⚠ ${p.badge}が発生!</span><span class="small">ゲーム一時停止中</span></div>`
    : `<div class="modal-head"><span class="badge badge-${badgeClass}">${p.badge}</span><span class="small muted">ゲーム一時停止中</span></div>`;
  const text = p.lines ? `<ul class="lines">${p.lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : `<p class="muted">${p.body}</p>`;
  const chips = p.chips ? `<div class="chips">${p.chips.map((c) => `<span class="stag">${c}</span>`).join('')}</div>` : '';
  const choices = p.choices.map((c, i) => `<button class="choice has-letter ${c.tag === 'hide' ? 'is-hide' : ''}" data-act="choice" data-i="${i}"><span class="ch-letter">${'ABCDEFG'[i]}</span><span class="ch-body"><strong>${c.label}</strong>${c.desc ? `<span class="small ${c.tag === 'hide' ? 'neg' : 'muted'}">${c.desc}</span>` : ''}</span></button>`).join('');
  body.innerHTML = head + (p.kind === 'incident' ? `<div class="inc-status"><h3>${p.title}</h3>${chips}${text}</div>` : `<h3>${p.title}</h3>${chips}${text}`) + choices;
}

function onChoice(i) {
  const res = resolve(i);
  if (!res) return;
  flushNotices();
  if (S.over) { render(); afterTick(); return; }
  if (res.text || res.lesson) { lastResult = res; stage = 2; renderModal(); updateLive(); render(); return; }
  nextPending();
}

function nextPending() {
  stage = 1; lastResult = null;
  advance();
  render();
  loop();
}

// ----- 開始画面と終了画面 -----
function showTitle() {
  screenMode = 'title';
  const g = CONFIG.goals;
  $('screen-body').innerHTML = `<h1 class="big-title end-title">IT会社経営シミュレーター(仮)</h1>
    <p>あなたは、できたばかりのIT会社の社長。5年のあいだに、会社を大きく育てよう。</p>
    <div class="panel"><div class="panel-title">クリア条件(資金・評判・成功をすべて達成)</div>
    <div class="goal-row"><span>難易度</span><span id="difficulty-label">Normal</span></div>
    <div class="row">
      <button class="difficulty-btn normal" data-act="difficulty-normal">Normal</button>
      <button class="difficulty-btn hard" data-act="difficulty-hard">Hard</button>
      <button class="difficulty-btn expert" data-act="difficulty-expert">Expert</button>
    </div>
    <div id="difficulty-description" class="small muted"></div>
    <div class="goal-row"><span>開始資金</span><span id="start-money"></span></div>
    <div class="goal-row"><span>資金</span><span id="goal-money">${yen(g.money)}</span></div>
    <div class="goal-row"><span>評判</span><span id="goal-rep">${g.rep}</span></div>
    <div class="goal-row"><span>大規模案件(難易度 高)の成功</span><span>${g.big}件</span></div></div>
    <ol class="steps"><li>「案件」で仕事を受注する</li><li>社員を割り振って、「再生」で時間を進める</li><li>起きた障害に、どう対応するか決める</li><li>お金がたまったら、「採用」と「投資」で会社を強くする</li></ol>
    <p class="small muted">資金が0を下回るとゲームオーバー。障害への対応しだいで、評判も資金も変わる。</p>
    <button class="btn-main" data-act="start">ゲームスタート</button>`;
  updateDifficultyPreview();
  $('screen').classList.remove('hidden');
  $('modal').classList.add('hidden');
}

function updateDifficultyPreview() {
  const g = CONFIG.goals;
  const money = getGoalMoney(g.money,selectedDifficulty);
  const rep = getGoalReputation(g.rep,selectedDifficulty);
  document.getElementById('start-money').textContent =
    yen(getStartMoney(CONFIG.startMoney, selectedDifficulty));
  document.getElementById('goal-money').textContent =
    yen(money);
  document.getElementById('goal-rep').textContent =
    rep;
  let difficultyName = 'Normal';
  let difficultyDescription = '標準ルール';
  if (selectedDifficulty === 'hard') {
    difficultyName = 'Hard';
    difficultyDescription = '開始資金90%・クリア条件110%';
  }

  if (selectedDifficulty === 'expert') {
    difficultyName = 'Expert';
    difficultyDescription = '開始資金80%・クリア条件125%';
  }
  document.getElementById('difficulty-label').textContent = difficultyName;

  document.getElementById('difficulty-description').textContent = difficultyDescription;
}

function showEnd() {
  screenMode = 'end';
  const o = S.over;
  const goals = goalList();
  const years = (S.day / 365).toFixed(1);
  let title, lead;
  let rank = 'C';
  if (o.type === 'clear') {
    rank = getClearRank();
    title = `ゲームクリア！ 評価 ${rank}`;
    lead = `${years}年で、すべての目標を達成した。会社は大きく成長した。`;
  }
  else if (o.type === 'bankrupt') { title = 'ゲームオーバー'; lead = `${dateLabel(o.day)}、資金が尽きて、会社を続けられなくなった。`; }
  else if (o.type === 'retire') {
    title = '15年経過';
    lead = '15年が経過したため、社長を引退した。';
  }
  const t = S.tally;
  const avg = goals.reduce((sum, goal) => sum + goal.ratio, 0) / goals.length;
  let style;
  if (t.incidents === 0) style = 'まだ障害を経験していない。';
  else if (t.hide === 0) style = `障害に${t.incidents}回対応して、一度も隠さなかった。誠実な社長。`;
  else if (t.hide >= t.honest) style = `障害${t.incidents}回のうち、${t.hide}回は隠す選択をした。実際の会社では、信頼を失う原因になる。`;
  else style = `障害${t.incidents}回のうち、${t.hide}回は隠す選択をした。隠した障害は、あとで見つかることが多い。`;

  const rows = goals.map((g) => `<tr class="${g.met ? 'met' : ''}">
    <td>${g.met ? '■' : '□'} ${g.label}</td><td>${g.fmt(g.cur)} / ${g.fmt(g.target)}</td></tr>`).join('');
  $('screen-body').innerHTML = `<div class="modal-head">
    <span class="badge badge-${o.type === 'clear' ? 'low' : o.type === 'bankrupt' ? 'high' : 'mid'}">結果</span></div>
    <h1 class="big-title end-title">${title}</h1>${o.type === 'bankrupt' ? `<p>${lead}</p>` : `
    <div class="medal-wrap"><div class="medal medal-${rank}"><b>${rank}</b></div><div class="medal-lead">${lead}</div></div>`}
    <table class="stats">${rows}
      <tr><td>完成させた案件</td><td>${S.done}件</td></tr>
      <tr><td>対応した障害</td><td>${t.incidents}回(隠した: ${t.hide}回)</td></tr>
      <tr><td>会社Lv</td><td>${S.level}</td></tr></table>
    <div class="lesson"><div class="small muted">あなたの判断</div>${style}</div>
    <button class="btn-main" data-act="restart">もう一度あそぶ</button>`;
  $('screen').classList.remove('hidden');
  $('modal').classList.add('hidden');
}

function startGame() {
  const difficulty = selectedDifficulty;
  newGame(S.employeeDatabase, S.eventDatabase, S.projectDatabase, S.missionDatabase);
  S.difficulty = difficulty;
  if (difficulty === 'hard') {
    S.money = Math.floor(CONFIG.startMoney * 0.9);
  }
  console.log('難易度', difficulty);
  console.log('開始資金', S.money);
  screenMode = null;
  $('screen').classList.add('hidden');
  stage = 1;
  lastResult = null;
  showPage('town');
  render();
}

function restart() {
  clearTimeout(timer);
  newGame(S.employeeDatabase, S.eventDatabase, S.projectDatabase, S.missionDatabase);
  showPage('town');
  render();
  showTitle();
}

// ----- 時間を進める -----
function loop() {
  clearTimeout(timer);
  if (!S.playing || S.pending || S.over || S.recruiting || S.investing || screenMode !== null) return;
  timer = setTimeout(() => { tick(); afterTick(); loop(); }, CONFIG.speeds[S.speedIdx].ms);
}

function afterTick() {
  flushNotices();
  if (S.over) { S.playing = false; render(); showEnd(); return; }
  if (S.recruitmentEvent) {
    S.recruitmentEvent = false;
    S.playing = false;
    showPage('recruit');
  }
  if (S.investmentEvent) {
    S.investmentEvent = false;
    S.playing = false;
    showPage('invest-event');
  }
  if (S.dirty) render(); else updateLive();
}

// ----- 操作 -----
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act],[data-go]');
  if (!el || !S) return;
  if (el.dataset.go) {
    if (S.pending || S.recruiting || S.investing) return;
    const go = el.dataset.go;
    showPage(el.classList.contains('nav') && go === 'town' ? 'town' : go);
    return;
  }
  const a = el.dataset.act;
  const done = (r) => {
    if (r) toast(r.msg, r.ok ? 'good' : 'bad');
    flushNotices();
    render();
  };

  if (a === 'difficulty-normal') {
    selectedDifficulty = 'normal';
    updateDifficultyPreview();
    return;
  }
  if (a === 'difficulty-hard') {
    selectedDifficulty = 'hard';
    updateDifficultyPreview();
    return;
  }
  if (a === 'difficulty-expert') {
    selectedDifficulty = 'expert';
    updateDifficultyPreview();
    return;
  }
  if (a === 'start') { 
    S.difficulty = selectedDifficulty;
    console.log('選択難易度', S.difficulty);
    startGame();
    return;
  }
  if (a === 'restart') { restart(); return; }
  if (a === 'reset') {
    // 押し間違いを防ぐため、3秒以内にもう一度押したときだけ、最初からにする
    if (resetArmed) { resetArmed = false; el.textContent = '最初から'; restart(); return; }
    resetArmed = true; el.textContent = '本当に?';
    setTimeout(() => { resetArmed = false; el.textContent = '最初から'; }, 3000);
    return;
  }
  if (screenMode !== null) return;

  if (a === 'play') {
    if (S.pending || S.recruiting || S.investing) return;
    S.playing = !S.playing;
    updateLive();
    loop();
  }
  else if (a === 'speed') {
    if (S.pending || S.recruiting || S.investing) return;
    S.speedIdx = (S.speedIdx + 1) % CONFIG.speeds.length;
    updateLive();
    loop();
  }
  else if (a === 'auto') {
    autoAssign();
    toast(S.jobs.length ? '手が空いている社員を案件に割り振った' : '進行中の案件がない', 'good');
    render();
  }
  else if (a === 'auto-assignment') {
    const job = S.assignmentJobId ? jobById(S.assignmentJobId) : null;
    if (job) {
      autoAssign(job);
      toast('手が空いている社員を、この案件に割り振った', 'good');
      render();
    }
  }
  else if (a === 'toggle-missions') { S.missionsOpen = !S.missionsOpen; render(); }
  else if (a === 'employee-view') { S.employeeView = el.dataset.view; render(); }
  else if (a === 'assign') { toggleAssign(Number(el.dataset.job), Number(el.dataset.emp)); render(); }
  else if (a === 'toggle-sales') { toggleSales(Number(el.dataset.id)); render(); }
  else if (a === 'accept') {
    const r = acceptOffer(Number(el.dataset.id));
    done(r);
    if (r.ok) {
      S.assignmentJobId = S.jobs[S.jobs.length - 1].id;
      S.playing = false;
      showPage('assignment');
      render();
    }
  }
  else if (a === 'finish-assignment') { S.assignmentJobId = null; showPage('town'); render(); }
  else if (a === 'hire') { done(hire(Number(el.dataset.id))); }
  else if (a === 'open-recruit') { S.recruitStage = 'candidates'; render(); }
  else if (a === 'open-staff') { S.recruitStage = 'staff'; render(); }
  else if (a === 'back-recruit') { S.recruitStage = 'candidates'; render(); }
  else if (a === 'finish-recruit') {
    S.recruiting = false;
    S.recruitmentEvent = false;
    showPage('town');
    render();
  }
  else if (a === 'upgrade-employee') { done(strengthenEmployee(Number(el.dataset.id))); }
  else if (a === 'invest') { done(buyInvest(el.dataset.key)); }
  else if (a === 'finish-invest') {
    S.investing = false;
    S.investmentEvent = false;
    showPage('town');
    render();
  }
  else if (a === 'choice') { onChoice(Number(el.dataset.i)); }
  else if (a === 'continue') { nextPending(); }
});

// ----- キーボード操作 -----
document.addEventListener('keydown', (ev) => {
  const activeTag = document.activeElement?.tagName;
  if (
    activeTag === 'INPUT' ||
    activeTag === 'TEXTAREA' ||
    activeTag === 'SELECT'
  ) {
    return;
  }
  if (ev.code === 'Space') {
    ev.preventDefault();
    document.getElementById('play-btn')?.click();
    return;
  }
  if (ev.code === 'Digit1') {
    ev.preventDefault();
    showPage('town');
    return;
  }
  if (ev.code === 'Digit2') {
    ev.preventDefault();
    showPage('jobs');
    return;
  }
  if (ev.code === 'Digit3') {
    ev.preventDefault();
    showPage('employees');
    return;
  }
  if (ev.code === 'Digit4') {
    ev.preventDefault();
    showPage('invest-event');
    return;
  }
    if (ev.code === 'KeyS') {
    ev.preventDefault();
    document.getElementById('speed-btn')?.click();
    return;
  }
  if (ev.code === 'KeyR') {
    ev.preventDefault();
    const resetBtn =
      document.querySelector('[data-act="reset"]');
    resetBtn?.click();
    return;
  }
});

// ----- 起動 -----
initializeGame();
