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

// ----- 会社名 -----
let companyName = '';
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const companyOf = () => (S && S.company) || '株式会社サンプル';
const nameOk = (t) => t.trim().length > 0;

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

// ----- 画面の切り替え -----
let curPage = 'town';
function showPage(name) {
  curPage = name;
  ['town', 'company', 'jobs', 'staff', 'invest'].forEach((p) => $('page-' + p).classList.toggle('hidden', p !== name));
  document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
}

function toast(text, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// ----- ホーム -----
function renderHome() {
  // お知らせ
  const alerts = [];
  const hint = hintText();
  if (hint) alerts.push(`<div class="hint">${hint}</div>`);
  if (S.money < monthlyCost() * 1.5) alerts.push(`<div class="alert"><span>資金が少なくなっている。このままだと、来月の給料が払えなくなる。</span></div>`);
  S.jobs.filter((j) => j.late).forEach((j) => alerts.push(`<div class="alert"><span>「${j.name}」が納期を過ぎている。早く完成させよう。</span></div>`));
  $('home-alerts').innerHTML = alerts.join('');

  // 社員の席
  const seats = S.employees.map(seatCard);
  for (let i = S.employees.length; i < levelInfo().slots; i++) seats.push('<div class="seat seat-empty" data-go="staff">空席(「社員」で採用できます)</div>');
  $('home-seats').innerHTML = seats.join('');

  // 進行中の案件
  $('home-projects').innerHTML = S.jobs.length ? S.jobs.map(projectCard).join('') :
    '<div class="card muted">まだ案件がありません。「案件」ページから受注しよう。</div>';

  // 右パネル
  $('home-side').innerHTML = levelPanel() + goalPanel() + missionPanel();
}

function seatCard(e) {
  const job = e.job ? jobById(e.job) : null;
  const away = isAbsent(e);
  let status;
  if (away) status = `<div class="small neg" data-away="${e.absentUntil}">欠勤中 あと${e.absentUntil - S.day}日</div>`;
  else if (job) status = `<div class="small">${job.name} / 作業中</div>`;
  else status = '<div class="small muted">待機中(案件を割り振ろう)</div>';
  return `<div class="seat ${away ? 'seat-away' : ''}">${avatar(e.skill, e.name + 'のドット絵')}<div class="seat-info"><strong>${e.name}</strong> <span class="small muted">${skillsLabel(e)} Lv.${e.lv}</span>${status}
    <div class="xpbar"><div data-xpfill="${e.id}" style="width:${xpPct(e)}%"></div></div><div class="small muted" data-grow="${e.id}">${growText(e)}</div></div></div>`;
}

// ----- 季節(ゲーム内の月で、街の見た目が変わる) -----
const SEASONS = {
  spring: { name: '春', sky: '#ffdfe9', band: '#fff0f4', grass: '#b8e6a8', far1: '#f3c4d6', far2: '#d9c4f0', tree: '#f7a8c4', roof: '#ffb59e', sun: '#fff3b0', page: '#ffe9f0', deco: ['#ffb6cf', '#ffd6e4'], n: 36, sz: 1.6 },
  summer: { name: '夏', sky: '#4fb6f0', band: '#9fdcf8', grass: '#5fcf8a', far1: '#8ec7ea', far2: '#a9b8ef', tree: '#1f9a62', roof: '#ff8f6e', sun: '#ffe04a', page: '#d5f3ff', deco: [], n: 0, sz: 0 },
  autumn: { name: '秋', sky: '#ffc89a', band: '#ffe2c0', grass: '#d9c47a', far1: '#e8b49a', far2: '#caa0b8', tree: '#e0693a', roof: '#c2453a', sun: '#fff0b0', page: '#ffe9d2', deco: ['#e0693a', '#f0a030'], n: 24, sz: 1.6 },
  winter: { name: '冬', sky: '#6f86b8', band: '#a9bde0', grass: '#f1f6fb', far1: '#8ea0c8', far2: '#9a94c8', tree: '#2f7f62', roof: '#e8f0ff', sun: '#f4f4ff', page: '#e3ecf8', deco: ['#ffffff'], n: 56, sz: 1.2 }
};
function seasonOf(day) {
  const m = dateOf(day).getMonth();   // 0=1月
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
}
let lastTownKey = '';

// ----- 紙吹雪とスタンプ -----
function confetti(n) {
  const cols = ['#ffb59e', '#ffe08a', '#6dcfb2', '#cbbcf3', '#ffffff', '#ff7aa5', '#9fd6f5'];
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < n; i++) {
    const el = document.createElement('i');
    el.style.cssText = `left:${Math.random() * 100}%;--c:${cols[i % cols.length]};--s:${6 + Math.floor(Math.random() * 3) * 3}px;--d:${2.6 + Math.random() * 2.2}s;--dl:${Math.random() * 1.2}s;--dx:${Math.round(Math.random() * 120 - 60)}px`;
    box.appendChild(el);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 6000);
}
function stamp(text) {
  const el = document.createElement('div');
  el.className = 'hire-stamp';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ----- 街(最初の画面) -----
const SKILL_COLOR = { design: '#6dcfb2', dev: '#ffb59e', test: '#ffe08a', infra: '#9fd6f5', security: '#cbbcf3' };
function walker(e, i) {
  const t = 16 + (i * 7) % 13, w = 70 + (i * 23) % 50, x0 = 8 + (i * 31) % 70;
  const delay = -(((Date.now() / 1000) + i * 5) % (t * 2)).toFixed(2);
  const c = SKILL_COLOR[e.skill];
  const label = `${e.name} ${skillsLabel(e)} Lv.${e.lv}`;
  const tw = [...label].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 4.2 : 2.4), 0) + 8;
  return `<g class="walker" style="--t:${t}s;--w:${w}px;--delay:${delay}s" transform="translate(${x0} 0)"><title>${e.name} ${skillsLabel(e)} Lv.${e.lv}</title><g class="bounce" style="animation-delay:${(i % 4) * 0.2}s">
    <rect x="2" y="77" width="4" height="3" fill="#f8cdbb"/><rect x="2" y="77" width="4" height="1" fill="#2e504a"/>
    <rect x="1" y="80" width="6" height="3" fill="${c}"/><rect x="2" y="83" width="1" height="2" fill="#2e504a"/><rect x="5" y="83" width="1" height="2" fill="#2e504a"/></g>
    <rect x="-2" y="75" width="12" height="11" fill="transparent"/>
    <g class="emp-tip"><rect x="${4 - tw / 2}" y="66" width="${tw}" height="9" fill="#fafffd" stroke="#2e504a" stroke-width=".6"/>
    <text x="4" y="72.6" font-size="4" text-anchor="middle" fill="#2e504a">${label}</text></g></g>`;
}
function townScene() {
  const lv = S.level, n = S.employees.length;
  const T = SEASONS[seasonOf(S.day)];
  const month = dateOf(S.day).getMonth() + 1;
  const signSize = Math.min(5, 40 / Math.max(1, [...companyOf()].length * 1.05)).toFixed(2);
  const rows = [2, 3, 4][lv - 1], cols = 4;
  const bh = 12 + rows * 10.5, bx = 70, bw = 60, by = 72 - bh;
  let wins = '', k = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++, k++) {
    if (r === rows - 1 && (c === 1 || c === 2)) continue;  // ドアの場所
    const lit = k < n + 2;
    wins += `<rect x="${bx + 4 + c * 14}" y="${by + 6 + r * 10.5}" width="9" height="8" fill="#2e504a"/><rect x="${bx + 5 + c * 14}" y="${by + 7 + r * 10.5}" width="7" height="6" fill="${lit ? '#ffe08a' : '#9fd6f5'}"/>`;
  }
  const far = [[0, 44, 22, 28], [24, 52, 16, 20], [150, 46, 22, 26], [174, 40, 26, 32]].map(([x, y, w, h], i) => {
    let ws = '';
    for (let j = 0; j < h / 8 - 1; j++) for (let c = 0; c < w / 6 - 1; c++) if ((j + c + i) % 3) ws += `<rect x="${x + 3 + c * 6}" y="${y + 4 + j * 8}" width="3" height="4" fill="#ffffff" opacity=".7"/>`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${i % 2 ? T.far2 : T.far1}"/>${ws}`;
  }).join('');
  // 増築の予告(Lv.3になると本物の別館が建つ)
  const annex = lv >= 3
    ? `<rect x="${bx + bw + 3}" y="42" width="26" height="30" fill="#2e504a"/><rect x="${bx + bw + 4}" y="43" width="24" height="29" fill="#fff7ea"/><rect x="${bx + bw + 2}" y="40" width="28" height="3" fill="${T.roof}"/>` +
      [0, 1].map((r) => [0, 1].map((c) => `<rect x="${bx + bw + 8 + c * 10}" y="${48 + r * 11}" width="7" height="7" fill="#2e504a"/><rect x="${bx + bw + 9 + c * 10}" y="${49 + r * 11}" width="5" height="5" fill="#ffe08a"/>`).join('')).join('')
    : `<rect x="${bx + bw + 4}" y="44" width="24" height="28" fill="#ffffff" opacity=".35" stroke="#2e504a" stroke-dasharray="1.5 1.5" stroke-width=".6"/><text x="${bx + bw + 16}" y="57" font-size="3.4" text-anchor="middle" fill="#2e504a">Lv.3で</text><text x="${bx + bw + 16}" y="62" font-size="3.4" text-anchor="middle" fill="#2e504a">増築!</text>`;
  const emps = S.employees.filter((e) => !isAbsent(e)).map(walker).join('');
  const decor = T.n ? `<g class="fall">${Array.from({ length: T.n }, (_, i) => `<rect x="${(i * 37) % 200}" y="${(i * 53) % 70}" width="${T.sz}" height="${T.sz}" fill="${T.deco[i % T.deco.length]}"/>`).join('')}</g>` : '';
  return `<svg class="town-scene" viewBox="0 0 200 100" role="img" aria-label="会社のある街">
    <rect width="200" height="72" fill="${T.sky}"/><rect y="40" width="200" height="32" fill="${T.band}"/>
    <rect x="150" y="8" width="12" height="12" fill="${T.sun}"/>
    <g fill="#fff"><rect x="20" y="14" width="22" height="5"/><rect x="24" y="11" width="14" height="4"/><rect x="100" y="8" width="26" height="5"/><rect x="106" y="5" width="14" height="4"/></g>
    ${far}
    <rect y="72" width="200" height="28" fill="${T.grass}"/><rect y="72" width="200" height="1.5" fill="#2e504a"/>
    <rect y="86" width="200" height="9" fill="#d5d5d5"/><g fill="#fff">${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 18 + 4}" y="90" width="9" height="1.2"/>`).join('')}</g>
    ${annex}
    <g class="company" data-go="company"><title>会社の中を見る</title>
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#2e504a"/><rect x="${bx + 1}" y="${by + 1}" width="${bw - 2}" height="${bh - 1}" fill="#fff7ea"/>
      <rect class="roof" x="${bx - 3}" y="${by - 4}" width="${bw + 6}" height="5" fill="${T.roof}" stroke="#2e504a" stroke-width=".8"/>
      <rect x="${bx + 8}" y="${by - 16}" width="${bw - 16}" height="11" fill="#fafffd" stroke="#2e504a" stroke-width=".8"/>
      <text x="${bx + bw / 2}" y="${by - 8}" font-size="${signSize}" text-anchor="middle" fill="#2e504a" font-weight="bold">${esc(companyOf())}</text>
      ${wins}
      <rect x="${bx + 24}" y="${72 - 14}" width="12" height="14" fill="#2e504a"/><rect x="${bx + 25}" y="${72 - 13}" width="10" height="13" fill="#6dcfb2"/><rect x="${bx + 33}" y="${72 - 7}" width="1" height="1" fill="#2e504a"/>
    </g>
    <g fill="${T.tree}"><rect x="14" y="62" width="14" height="10"/><rect x="17" y="58" width="8" height="5"/></g><rect x="20" y="72" width="3" height="6" fill="#8a5a3a" transform="translate(0 -6)"/>
    <g fill="${T.tree}"><rect x="176" y="62" width="14" height="10"/><rect x="179" y="58" width="8" height="5"/></g><rect x="182" y="66" width="3" height="6" fill="#8a5a3a"/>
    ${emps}
    ${decor}
    <rect x="3" y="3" width="26" height="8" fill="#fafffd" stroke="#2e504a" stroke-width=".6"/><text x="16" y="9" font-size="4.4" text-anchor="middle" fill="#2e504a">${T.name}・${month}月</text>
    <g><rect x="${bx + 4}" y="${by + bh + 2}" width="52" height="0" /></g>
    <text x="${bx + bw / 2}" y="97" font-size="4" text-anchor="middle" fill="#2e504a">▲ 会社をクリックすると、中が見られる</text>
  </svg>`;
}
function renderTown() {
  const T = SEASONS[seasonOf(S.day)];
  document.documentElement.style.setProperty('--page', T.page);
  lastTownKey = seasonOf(S.day) + dateOf(S.day).getMonth();
  const alerts = [];
  const hint = hintText();
  if (hint) alerts.push(`<div class="hint">${hint}</div>`);
  if (S.money < monthlyCost() * 1.5) alerts.push(`<div class="alert"><span>資金が少なくなっている。このままだと、来月の給料が払えなくなる。</span></div>`);
  S.jobs.filter((j) => j.late).forEach((j) => alerts.push(`<div class="alert"><span>「${j.name}」が納期を過ぎている。早く完成させよう。</span></div>`));
  S.jobs.filter((j) => !j.late && remainDays(j) <= 7).forEach((j) => alerts.push(`<div class="alert"><span>「${j.name}」の納期まで、あと${remainDays(j)}日。</span></div>`));
  const projects = S.jobs.length ? S.jobs.map((j) => {
    const left = remainDays(j);
    return `<div class="town-job"><div class="row"><strong class="small">${j.name}</strong><span class="small ${left <= 7 ? 'neg' : 'muted'}" data-left="${j.id}">${leftText(j)}</span></div>
      <div class="bar"><div class="fill ${left <= 7 ? 'fill-warn' : ''}" data-bar="${j.id}" style="width:${progressPct(j)}%"></div></div></div>`;
  }).join('') : '<div class="small muted">進行中の案件はない。下の「案件」から受注しよう。</div>';
  $('town-body').innerHTML = townScene() + `
    <div class="town-grid">
      <div>${alerts.join('')}
        <div class="panel"><div class="panel-title">いまの会社</div>
          <div class="goal-row"><span>資金</span><span data-live="money">${yen(S.money)}</span></div>
          <div class="goal-row"><span>評判</span><span data-live="rep">${S.rep} / 100</span></div>
          <div class="goal-row"><span>社員</span><span data-live="staff">${S.employees.length} / ${levelInfo().slots}人</span></div>
          <div class="goal-row"><span>会社Lv</span><span>Lv.${S.level} / Lv.3</span></div>
        </div>
        <div id="town-level">${levelPanel()}</div>
      </div>
      <div class="panel"><div class="panel-title">進行中の案件</div>${projects}
        <div class="town-menu"><button class="btn-small" data-act="auto">おまかせ配置</button></div></div>
    </div>`;
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
  const covered = new Set(job.staff.map(empById).filter(Boolean).flatMap((e) => e.skills));
  const req = job.skills.map((sk) => skillTag(sk, covered.has(sk) ? 'ok' : 'ng')).join('');
  const chips = S.employees.map((e) => {
    const mine = e.job === job.id, busy = e.job && !mine, away = isAbsent(e);
    return `<button class="chip ${mine ? 'on' : ''} ${busy ? 'busy' : ''} ${away ? 'away' : ''}" data-act="assign" data-job="${job.id}" data-emp="${e.id}" title="${skillsLabel(e)} Lv.${e.lv}">${e.name}<span class="small">${skillsLabel(e)}</span></button>`;
  }).join('');
  return `<div class="card proj">
    <div class="row"><strong>${job.name}</strong><span class="small ${left <= 7 ? 'neg' : 'muted'}" data-left="${job.id}">${leftText(job)}</span></div>
    <div class="bar"><div class="fill ${left <= 7 ? 'fill-warn' : ''}" data-bar="${job.id}" style="width:${pct}%"></div></div>
    <div class="small"><span data-pct="${job.id}">進捗 ${pct}%</span> / 報酬 ${yen(job.reward)}</div>
    <div class="req small">必要なスキル(緑=担当がいる / 赤=足りない): ${req}</div>
    <div class="chips">担当: ${chips}</div>
  </div>`;
}

function levelPanel() {
  const next = LEVELS[S.level];
  if (!next) return `<div class="panel"><div class="panel-title">会社Lv.3 に成長した</div><div class="small">席が${levelInfo().slots}つ、案件は同時に${levelInfo().jobs}件まで受けられる。</div></div>`;
  return `<div class="panel"><div class="panel-title">次の会社Lv.${next.lv}まで(席${next.slots}つ、案件${next.jobs}件)</div>
    <div class="goal-row"><span>評判</span><span>${S.rep} / ${next.needRep}</span></div>${seg(S.rep, next.needRep, 10)}
    <div class="goal-row"><span>案件の完了</span><span>${Math.min(S.done, next.needDone)} / ${next.needDone}</span></div>${seg(S.done, next.needDone, next.needDone)}</div>`;
}

function goalPanel() {
  const rows = goalList().map((g) => `<div class="goal-row"><span>${g.met ? '■' : '□'} ${g.label}</span><span>${g.fmt(g.cur)} / ${g.fmt(g.target)}</span></div>${seg(g.cur, g.target, 10)}`).join('');
  return `<div class="panel"><div class="panel-title">目標(5年後の成績で、ランクが決まる)</div>${rows}</div>`;
}

function missionPanel() {
  const m = [
    ['最初の案件を受注する', S.counts.accepted >= 1],
    ['社員を1人採用する', S.counts.hired >= 1],
    ['障害に対応する', S.counts.handled >= 1],
    ['案件を1つ完成させる', S.done >= 1],
    ['会社Lv.2に成長する', S.level >= 2]
  ];
  return `<div class="panel panel-hl"><div class="panel-title">ミッション</div><ul class="mission">${m.map(([t, d]) => `<li class="${d ? 'done' : ''}">${t}</li>`).join('')}</ul></div>`;
}

// ----- 案件 -----
function renderJobs() {
  const info = levelInfo();
  const list = S.offers.map(offerCard).join('') || '<div class="card muted">いまは募集がない。しばらく待とう。</div>';
  $('jobs-body').innerHTML = `<h2>案件を選ぶ <span class="muted small">同時進行 ${S.jobs.length}/${info.jobs}件</span></h2>
    <p class="small muted legend">必要なスキルの色: 緑=いまの社員にいる / 赤=まだいない(採用すると品質が上がる)。スキルが合わない社員は、半分の力で手伝う。</p><div class="offer-grid">${list}</div>`;
}

function jobKind(o) {
  if (o.diff >= 3) return { k: 'big', label: '大規模' };
  if (o.tid === 'web' || o.tid === 'lp') return { k: 'web', label: 'Web制作' };
  return { k: o.tid === 'app' ? 'app' : 'sys', label: o.tid === 'app' ? 'アプリ' : 'システム' };
}

function offerCard(o) {
  const locked = S.rep < o.minRep;
  const kind = jobKind(o);
  const req = o.skills.map((sk) => skillTag(sk, S.employees.some((e) => e.skills.includes(sk)) ? 'ok' : 'ng')).join('');
  const btn = locked ? `<span class="offer-lock">評判${o.minRep}で解放</span>` : `<button class="act" data-act="accept" data-id="${o.id}">受注する</button>`;
  return `<div class="offer offer-${kind.k} ${locked ? 'locked' : ''}">
    <div class="offer-head"><strong>${o.name}</strong><span class="offer-tag">${kind.label}</span></div>
    ${kind.k === 'big' ? '<div class="offer-big">★ 大規模案件 ★</div>' : ''}
    <div class="offer-row"><span class="muted small">難易度</span><span class="stars">${'★'.repeat(o.diff)}${'☆'.repeat(3 - o.diff)}</span><span class="small">${DIFF_LABEL[o.diff]}</span></div>
    <div class="offer-row"><span class="muted small">報酬</span><span class="offer-reward">${yen(o.reward)}</span></div>
    <div class="offer-row"><span class="muted small">納期</span><span>${o.days}日</span><span class="muted small">仕事量 ${o.work}</span></div>
    <div class="req">${req}</div>
    <div class="small muted">リスク: ${o.risk}</div>
    <div class="offer-foot"><span class="small muted" data-expire="${o.expires}">募集あと${o.expires - S.day}日</span>${btn}</div>
  </div>`;
}

// ----- 社員(採用も、ここ) -----
function renderStaff() {
  const slots = levelInfo().slots;
  const free = slots - S.employees.length;
  const cards = S.candidates.map((c) => `<div class="resume">
    <div class="resume-head">履 歴 書</div>
    <div class="resume-top"><div class="resume-photo">${avatar(c.skill, c.name + 'のドット絵')}</div>
      <div><div class="small muted">名前</div><strong class="resume-name">${c.name}</strong>
      <div class="small muted">スキル</div><div>${SKILLS[c.skill]} <span class="resume-lv">Lv.${c.lv}</span></div></div></div>
    <div class="small resume-help">${SKILL_HELP[c.skill]}</div>
    <div class="resume-row"><span class="muted small">月給</span><b>${yen(c.salary)}</b></div>
    <div class="small muted">採用後の月の支出 ${yen(monthlyCost())} → ${yen(monthlyCost() + c.salary)}</div>
    <button class="act resume-btn" data-act="hire" data-id="${c.id}">採用する</button></div>`).join('') || '<div class="card muted">いまは求職者がいない。しばらく待とう。</div>';
  $('staff-body').innerHTML = `<h2>いまの社員 <span class="muted small">${S.employees.length} / 席 ${slots}</span></h2>
    <div class="seats">${S.employees.map(seatCard).join('')}</div>
    <h2 class="gap-top">人材を採用する <span class="muted small">空席 ${free}</span></h2>
    <p class="small muted legend">採用すると、毎月の支出が増える。席がいっぱいのときは、会社Lvを上げると席が増える。求職者は、約2か月ごとに入れ替わる。</p><div class="resume-grid">${cards}</div>`;
}

// ----- 投資 -----
function renderInvest() {
  const cards = Object.keys(INVEST).map((k) => {
    const inv = INVEST[k], lv = S.invest[k], max = inv.costs.length;
    const btn = lv >= max ? '<span class="small">最大</span>' : `<button class="act" data-act="invest" data-key="${k}">強化する ${yen(inv.costs[lv])}</button>`;
    return `<div class="card job"><div class="row"><div><strong>${inv.name}</strong> ${pips(lv, max)}</div>${btn}</div>
      <div class="small">${inv.help}</div><div class="small muted">いまの効果: ${inv.now(lv)}</div></div>`;
  }).join('');
  $('invest-body').innerHTML = `<h2>投資する <span class="muted small">資金 ${yen(S.money)}</span></h2>
    <p class="small muted legend">投資すると、障害が起きにくくなり、起きたときの被害も小さくなる。すぐには儲からないが、長く経営するほど効いてくる。</p>${cards}`;
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
  $('h-name').textContent = companyOf();
  document.title = companyOf() + ' 経営シミュレーター';
  $('h-date').textContent = dateLabel(S.day);
  $('track-fill').style.width = (S.day / CONFIG.totalDays * 100) + '%';
  $('play-btn').textContent = S.playing && !S.pending ? '❚❚ 一時停止' : '▶ 再生';
  $('speed-btn').textContent = CONFIG.speeds[S.speedIdx].label;

  if ($('town-level')) $('town-level').innerHTML = levelPanel();
  const live = { money: yen(S.money), rep: `${S.rep} / 100`, staff: `${S.employees.length} / ${levelInfo().slots}人` };
  Object.keys(live).forEach((k) => document.querySelectorAll(`[data-live="${k}"]`).forEach((el) => { el.textContent = live[k]; }));
  S.jobs.forEach((job) => {
    const pct = progressPct(job), left = remainDays(job);
    document.querySelectorAll(`[data-bar="${job.id}"]`).forEach((bar) => { bar.style.width = pct + '%'; bar.classList.toggle('fill-warn', left <= 7); });
    document.querySelectorAll(`[data-pct="${job.id}"]`).forEach((p) => { p.textContent = `進捗 ${pct}%`; });
    document.querySelectorAll(`[data-left="${job.id}"]`).forEach((l) => { l.textContent = leftText(job); l.className = 'small ' + (left <= 7 ? 'neg' : 'muted'); });
  });
  S.employees.forEach((e) => {
    document.querySelectorAll(`[data-xpfill="${e.id}"]`).forEach((f) => { f.style.width = xpPct(e) + '%'; });
    document.querySelectorAll(`[data-grow="${e.id}"]`).forEach((g) => { g.textContent = growText(e); });
  });
  document.querySelectorAll('[data-expire]').forEach((el) => { el.textContent = `募集あと${Math.max(0, Number(el.dataset.expire) - S.day)}日`; });
  document.querySelectorAll('[data-away]').forEach((el) => { el.textContent = `欠勤中 あと${Math.max(0, Number(el.dataset.away) - S.day)}日`; });
}

function render() {
  renderTown();
  renderHome();
  renderJobs();
  renderStaff();
  renderInvest();
  renderTrack();
  updateLive();
  renderModal();
  S.dirty = false;
}

// ----- トラブルの絵(ドット絵) -----
const R_ = (x, y, w, h, f) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`;
const INCIDENT_ART = {
  server: () => R_(0, 30, 60, 10, '#8fd9b5') + [6, 22, 38].map((x, i) => R_(x, 8, 15, 28, '#2e504a') + R_(x + 1, 9, 13, 26, '#4a5a6a') + [0, 1, 2, 3].map((j) => R_(x + 3, 12 + j * 6, 9, 3, '#2e3a4a') + R_(x + 4, 13 + j * 6, 1, 1, i === 1 ? '#ff5a4a' : '#6dcfb2')).join('')).join('') + R_(26, 4, 4, 4, '#888') + R_(29, 1, 5, 4, '#aaa') + R_(33, -2, 5, 4, '#ccc'),
  bug: () => R_(0, 30, 60, 10, '#8fd9b5') + R_(10, 5, 40, 26, '#2e504a') + R_(12, 7, 36, 22, '#dff5ec') + R_(24, 31, 12, 3, '#2e504a') + R_(20, 34, 20, 2, '#2e504a') + R_(24, 12, 12, 8, '#e0453a') + R_(22, 14, 2, 4, '#e0453a') + R_(36, 14, 2, 4, '#e0453a') + R_(25, 10, 2, 2, '#e0453a') + R_(33, 10, 2, 2, '#e0453a') + R_(26, 14, 2, 2, '#fff') + R_(32, 14, 2, 2, '#fff'),
  change: () => R_(0, 30, 60, 10, '#8fd9b5') + R_(8, 6, 22, 28, '#2e504a') + R_(10, 8, 18, 24, '#fff') + [0, 1, 2, 3].map((j) => R_(12, 11 + j * 5, 14, 1, '#9fb8b0')).join('') + R_(36, 12, 16, 4, '#ffb59e') + R_(48, 9, 4, 10, '#ffb59e') + R_(36, 24, 16, 4, '#9fd6f5') + R_(36, 21, 4, 10, '#9fd6f5'),
  leak: () => R_(0, 30, 60, 10, '#8fd9b5') + R_(8, 14, 26, 18, '#2e504a') + R_(10, 16, 22, 14, '#ffe08a') + R_(14, 6, 4, 10, '#2e504a') + R_(14, 6, 14, 3, '#2e504a') + R_(24, 6, 4, 4, '#2e504a') + R_(19, 20, 4, 6, '#2e504a') + R_(38, 10, 16, 12, '#2e504a') + R_(39, 11, 14, 10, '#fff') + R_(40, 12, 12, 2, '#ffb59e') + R_(44, 24, 8, 6, '#e0453a'),
  absence: () => R_(0, 30, 60, 10, '#8fd9b5') + R_(10, 18, 22, 14, '#2e504a') + R_(12, 20, 18, 10, '#b9d9f2') + R_(8, 14, 6, 18, '#2e504a') + R_(36, 6, 12, 12, '#f8cdbb') + R_(36, 6, 12, 3, '#2e504a') + R_(39, 12, 2, 2, '#2e504a') + R_(43, 12, 2, 2, '#2e504a') + R_(39, 15, 6, 1, '#2e504a') + R_(34, 18, 16, 12, '#ffb59e') + R_(50, 8, 2, 10, '#e0453a'),
  delay: () => R_(0, 30, 60, 10, '#8fd9b5') + R_(8, 6, 32, 28, '#2e504a') + R_(10, 8, 28, 24, '#fff') + R_(10, 8, 28, 6, '#e0453a') + [0, 1, 2, 3, 4, 5].map((j) => [0, 1, 2, 3].map((k) => R_(12 + k * 7, 17 + j * 2.4, 4, 1.6, j === 5 && k === 2 ? '#e0453a' : '#c9d8d3')).join('')).join('') + R_(44, 14, 12, 3, '#2e504a') + R_(46, 17, 8, 3, '#ffe08a') + R_(48, 20, 4, 4, '#ffe08a') + R_(46, 24, 8, 3, '#ffe08a') + R_(44, 27, 12, 3, '#2e504a')
};
const incidentScene = (id) => {
  const art = INCIDENT_ART[id] || INCIDENT_ART.bug;
  return `<svg class="inc-art" viewBox="0 0 60 40" role="img" aria-label="トラブルのイメージ"><rect width="60" height="40" fill="#9fd6f5"/>${art()}</svg>`;
};
let fxPending = null;

// ----- 決断画面 -----
function renderModal() {
  const p = S && S.pending;
  $('modal').classList.toggle('hidden', !p || screenMode !== null);
  if (!p || screenMode !== null) return;
  const body = $('modal-body');

  if (stage === 2 && lastResult) {
    body.innerHTML = `<div class="modal-head"><span class="badge badge-low">結果</span></div><h3>${lastResult.title}</h3>
      <div class="result">${lastResult.text}</div>
      ${lastResult.lesson ? `<div class="lesson"><div class="small muted">ひとこと解説</div>${lastResult.lesson}</div>` : ''}
      <button class="choice" data-act="continue"><strong>つづける</strong></button>`;
    return;
  }

  const isInc = p.kind === 'incident';
  const isLevel = p.badge === 'レベルアップ';
  $('modal').classList.toggle('overlay-light', isLevel);
  $('modal-body').classList.toggle('modal-wide', isInc);
  if (isLevel && fxPending !== p) {
    fxPending = p; S.lvFx = false;
    showPage('town'); confetti(140);
  }
  const text = p.lines ? `<ul class="lines">${p.lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : `<p class="muted">${p.body}</p>`;
  const chips = p.chips ? `<div class="chips">${p.chips.map((c) => `<span class="stag">${c}</span>`).join('')}</div>` : '';
  const choices = p.choices.map((c, i) => {
    const letter = p.choices.length > 1 ? `<span class="ch-letter">${'ABCDEFG'[i]}</span>` : '';
    return `<button class="choice ${letter ? 'has-letter' : ''} ${c.tag === 'hide' ? 'is-hide' : ''}" data-act="choice" data-i="${i}">${letter}<span class="ch-body"><strong>${c.label}</strong>${c.desc ? `<span class="small ${c.tag === 'hide' ? 'neg' : 'muted'}">${c.desc}</span>` : ''}</span></button>`;
  }).join('');
  if (isInc) {
    body.innerHTML = `<div class="inc-head"><span class="inc-title">⚠ ${p.badge}が発生!</span><span class="small">${dateLabel(S.day)}</span></div>
      <div class="inc-grid">${incidentScene(p.id)}<div class="inc-status"><h3>${p.title}</h3>${chips}${text}</div></div>
      <div class="small muted">ゲーム一時停止中。どう対応する?</div>${choices}`;
    return;
  }
  const badgeClass = p.kind === 'report' ? 'low' : p.kind === 'notice' && !p.id ? 'mid' : 'high';
  const head = `<div class="modal-head"><span class="badge badge-${badgeClass}">${p.badge}</span><span class="small muted">ゲーム一時停止中</span></div><h3>${isLevel ? '🎉 ' : ''}${p.title}</h3>`;
  body.innerHTML = head + chips + text + choices;
}

function onChoice(i) {
  const res = resolve(i);
  if (!res) return;
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
  $('screen-body').innerHTML = `<h1 class="big-title">IT会社経営シミュレーター(仮)</h1>
    <p>あなたは、できたばかりのIT会社の社長。5年のあいだに、会社を大きく育てよう。</p>
    <div class="panel"><div class="panel-title">目標(5年後の成績で、ランクが決まる)</div>
      <div class="goal-row"><span>資金</span><span>${yen(g.money)}</span></div>
      <div class="goal-row"><span>評判</span><span>${g.rep}</span></div>
      <div class="goal-row"><span>従業員</span><span>${g.staff}人</span></div>
      <div class="goal-row"><span>大規模案件(難易度 高)の成功</span><span>${g.big}件</span></div>
      <p class="small muted gap-top">目標を4つすべて達成するとランクA、2〜3つでB、0〜1つでC。</p></div>
    <ol class="steps"><li>「案件」で仕事を受注する</li><li>社員を割り振って、「再生」で時間を進める</li><li>起きた障害に、どう対応するか決める</li><li>お金がたまったら、「社員」での採用と「投資」で会社を強くする</li></ol>
    <p class="small muted">社員は、案件で働くほど成長する。レベルが上がって昇進したり、手伝った仕事のスキルを覚えたりする(月給も上がる)。</p>
    <p class="small muted">5年間たっぷり経営して、最後にランクが出る。資金が0を下回ると、その場でゲームオーバー。</p>
    <div class="namebox"><label for="company-name" class="small">あなたの会社の名前を決めよう(12文字まで)</label>
      <input id="company-name" class="name-input" type="text" maxlength="12" autocomplete="off" placeholder="例: 株式会社ピース" value="${esc(companyName)}"></div>
    <button class="btn-main" data-act="start" id="start-btn" ${nameOk(companyName) ? '' : 'disabled'}>ゲームスタート</button>`;
  $('screen').classList.remove('hidden');
  $('modal').classList.add('hidden');
}

function judgeText() {
  const t = S.tally;
  if (t.incidents === 0) return 'まだ障害を経験していない。';
  if (t.hide === 0) return `障害に${t.incidents}回対応して、一度も隠さなかった。誠実な社長。`;
  if (t.hide >= t.honest) return `障害${t.incidents}回のうち、${t.hide}回は隠す選択をした。実際の会社では、信頼を失う原因になる。`;
  return `障害${t.incidents}回のうち、${t.hide}回は隠す選択をした。隠した障害は、あとで見つかることが多い。`;
}

function showEnd(noFx) {
  screenMode = 'end';
  const o = S.over;
  const goals = goalList();
  const g = CONFIG.goals;
  const t = S.tally;
  const bankrupt = o.type === 'bankrupt';
  const met = (k) => goals.find((x) => x.key === k).met;
  const row = (label, val, k) => `<tr class="${k && met(k) ? 'met' : ''}"><td>${label}</td><td>${val}</td><td class="chk">${k && met(k) ? '✔' : ''}</td></tr>`;
  const lead = bankrupt ? `${dateLabel(o.day)}、資金が尽きて、会社を続けられなくなった。`
    : { A: 'すばらしい経営! 目標をすべて達成した。', B: 'よくがんばった。目標のいくつかを達成した。', C: '5年が経った。目標の達成は、これからだ。' }[o.rank];
  $('screen-body').innerHTML = `<div class="end-card">
    <h1 class="big-title end-title">${bankrupt ? 'ゲームオーバー' : '5年間の経営結果'}</h1>
    ${bankrupt ? '' : `<div class="medal-wrap"><div class="medal medal-${o.rank}"><b>${o.rank}</b></div><div class="medal-lead">${lead}</div></div>`}
    ${bankrupt ? `<p>${lead}</p>` : ''}
    <table class="stats">
      ${row('資金', `${yen(S.money)} / ${yen(g.money)}`, 'money')}
      ${row('評判', `${S.rep} / ${g.rep}`, 'rep')}
      ${row('従業員数', `${S.employees.length}人 / ${g.staff}人`, 'staff')}
      ${row('完成させた案件数', `${S.done}件`)}
      ${row('大規模案件の成功数', `${S.big}件 / ${g.big}件`, 'big')}
      ${row('会社Lv(上限あり)', `Lv.${S.level} / Lv.${LEVELS.length}`)}
      ${row('社員の成長', `昇進 ${S.stats.promos}回 / 新スキル ${S.stats.learned}個`)}
    </table>
    <p class="small muted">✔は、目標を達成した項目。4つ達成でA、2〜3つでB、0〜1つでC。</p>
    <div class="lesson"><div class="small muted">あなたの判断</div>${judgeText()}(障害に対応した回数: ${t.incidents}回、隠した回数: ${t.hide}回)</div>
    <div class="end-btns"><button class="btn-main" data-act="restart">もう一度あそぶ</button><button class="btn-main btn-sub" data-act="review">ふりかえりを見る</button></div></div>`;
  $('screen').classList.remove('hidden');
  $('modal').classList.add('hidden');
  if (!bankrupt && !noFx) confetti(o.rank === 'A' ? 130 : o.rank === 'B' ? 60 : 0);
}

// ----- ふりかえり(資金と評判の変化、ターニングポイント) -----
function reviewChart() {
  const W = 600, H = 300, L = 54, Bm = 30, Tp = 34, Rg = 12;
  const pw = W - L - Rg, ph = H - Bm - Tp;
  const hist = S.history.slice();
  const endDay = Math.max(1, hist[hist.length - 1].day);
  const maxM = Math.max(1, ...hist.map((h) => h.money));
  const nice = Math.pow(10, Math.floor(Math.log10(maxM))); const top = Math.ceil(maxM / nice) * nice;
  const X = (d) => L + d / endDay * pw;
  const YM = (m) => Tp + ph - Math.max(0, m) / top * ph;
  const YR = (r) => Tp + ph - r / 100 * ph;
  const yAt = (d) => { let p = hist[0]; for (const h of hist) { if (h.day <= d) p = h; } return YM(p.money); };
  const line = (f, col, dash) => `<polyline fill="none" stroke="${col}" stroke-width="2.6" ${dash ? 'stroke-dasharray="7 5"' : ''} points="${hist.map((h) => `${X(h.day).toFixed(1)},${f(h).toFixed(1)}`).join(' ')}"/>`;
  const grid = [0, 1, 2, 3, 4].map((i) => `<line x1="${L}" x2="${W - Rg}" y1="${Tp + ph - i * ph / 4}" y2="${Tp + ph - i * ph / 4}" stroke="#d6e5df"/><text x="${L - 6}" y="${Tp + ph - i * ph / 4 + 4}" font-size="10" text-anchor="end" fill="#57756f">${Math.round(top * i / 4 / 10000).toLocaleString()}</text>`).join('');
  const years = [0, 1, 2, 3, 4].map((i) => `<text x="${X(i * 365 + 182)}" y="${H - 10}" font-size="11" text-anchor="middle" fill="#57756f">${i + 1}年目</text>`).join('');
  const marks = S.turns.map((t) => {
    const x = X(t.day), y = yAt(t.day);
    const col = t.kind === 'level' ? '#cbbcf3' : t.tag === 'hide' ? '#ffb59e' : t.tag === 'honest' ? '#6dcfb2' : '#ffe08a';
    const ch = t.kind === 'level' ? '▲' : '!';
    return `<line x1="${x}" x2="${x}" y1="${y}" y2="${Math.max(Tp, y - 24)}" stroke="#2e504a" stroke-width="1.5"/><rect x="${x - 8}" y="${Math.max(Tp, y - 24) - 16}" width="16" height="16" fill="${col}" stroke="#2e504a" stroke-width="1.5"/><text x="${x}" y="${Math.max(Tp, y - 24) - 4}" font-size="11" text-anchor="middle" fill="#2e504a">${ch}</text>`;
  }).join('');
  return `<svg class="review-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="資金と評判の変化のグラフ">
    <text x="${L}" y="16" font-size="12" fill="#2e504a">資金の変化(万円)</text>
    <text x="${W - Rg}" y="16" font-size="11" text-anchor="end" fill="#2f9a6a">━ 資金</text><text x="${W - Rg - 56}" y="16" font-size="11" text-anchor="end" fill="#c08a10">╍ 評判(0〜100)</text>
    ${grid}<line x1="${L}" x2="${L}" y1="${Tp}" y2="${Tp + ph}" stroke="#2e504a"/><line x1="${L}" x2="${W - Rg}" y1="${Tp + ph}" y2="${Tp + ph}" stroke="#2e504a"/>
    ${years}${line((h) => YR(h.rep), '#e0a020', true)}${line((h) => YM(h.money), '#2f9a6a')}${marks}</svg>`;
}

function showReview() {
  screenMode = 'review';
  const turns = S.turns.slice();
  const rank = (t) => (t.tag === 'hide' ? 0 : t.kind === 'level' ? 1 : 2);
  const picks = turns.sort((a, b) => rank(a) - rank(b) || a.day - b.day).slice(0, 5).sort((a, b) => a.day - b.day);
  const note = (t) => t.kind === 'level' ? t.note
    : t.tag === 'hide' ? '隠す選択をした → あとで見つかると、評判が大きく下がる'
    : t.tag === 'honest' ? '正直に対応した → 信頼を守りやすい'
    : `「${t.label}」を選んだ`;
  const cls = (t) => (t.tag === 'hide' ? 'neg' : t.tag === 'honest' ? 'pos' : 'muted');
  const list = picks.length ? picks.map((t) => `<div class="turn"><div class="small muted">${dateLabel(t.day)}</div><strong>${t.title}</strong><div class="small ${cls(t)}">${note(t)}</div></div>`).join('') : '<div class="small muted">記録するできごとは、まだなかった。</div>';
  $('screen-body').innerHTML = `<h1 class="big-title end-title">ふりかえり</h1>
    <p class="small muted">5年間の資金と評判の変化。四角いマークは、できごとのあった日(! = トラブル、▲ = 会社Lvアップ。緑 = 正直に対応、赤 = 隠した)。</p>
    <div class="review-grid"><div>${reviewChart()}</div><div class="turns"><div class="panel-title">ターニングポイント</div>${list}</div></div>
    <div class="lesson"><div class="small muted">ひとこと</div>${judgeText()} トラブルを隠すと、その場は助かっても、あとで大きな損になりやすい。早く正直に報告することが、信頼を守る。</div>
    <div class="end-btns"><button class="btn-main btn-sub" data-act="endback">結果にもどる</button><button class="btn-main" data-act="restart">もう一度あそぶ</button></div>`;
  $('screen').classList.remove('hidden');
  $('modal').classList.add('hidden');
}

function startGame() {
  if (!nameOk(companyName)) return;
  S.company = companyName.trim();
  screenMode = null;
  $('screen').classList.add('hidden');
  stage = 1; lastResult = null;
  render();
}

function restart() {
  clearTimeout(timer);
  newGame();
  showPage('town');
  render();
  showTitle();
}

// ----- 時間を進める -----
function loop() {
  clearTimeout(timer);
  if (!S.playing || S.pending || S.over || screenMode !== null) return;
  timer = setTimeout(() => { tick(); afterTick(); loop(); }, CONFIG.speeds[S.speedIdx].ms);
}

function afterTick() {
  S.notices.splice(0).forEach((n) => toast(n.text, n.kind));
  if (seasonOf(S.day) + dateOf(S.day).getMonth() !== lastTownKey) S.dirty = true;
  if (S.over) { S.playing = false; render(); showEnd(); return; }
  if (S.dirty) render(); else updateLive();
}

// 会社名の入力: 名前が入るまで、スタートボタンは押せない
document.addEventListener('input', (ev) => {
  if (ev.target.id !== 'company-name') return;
  companyName = ev.target.value;
  $('start-btn').disabled = !nameOk(companyName);
});
document.addEventListener('keydown', (ev) => {
  if (ev.target.id === 'company-name' && ev.key === 'Enter' && nameOk(companyName)) startGame();
});

// ----- 操作 -----
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act],[data-go]');
  if (!el || !S) return;
  if (el.dataset.go) {
    // 下のボタンを、いま開いているページでもう一度押すと、街にもどる
    const go = el.dataset.go;
    showPage(el.classList.contains('nav') && go === curPage ? 'town' : go);
    return;
  }
  const a = el.dataset.act;
  const done = (r) => { if (r) toast(r.msg, r.ok ? 'good' : 'bad'); render(); };

  if (a === 'start') { startGame(); return; }
  if (a === 'restart') { restart(); return; }
  if (a === 'review') { showReview(); return; }
  if (a === 'endback') { showEnd(true); return; }
  if (a === 'reset') {
    // 押し間違いを防ぐため、3秒以内にもう一度押したときだけ、最初からにする
    if (resetArmed) { resetArmed = false; el.textContent = '最初から'; restart(); return; }
    resetArmed = true; el.textContent = '本当に?';
    setTimeout(() => { resetArmed = false; el.textContent = '最初から'; }, 3000);
    return;
  }
  if (screenMode !== null) return;

  if (a === 'play') { S.playing = !S.playing; updateLive(); loop(); }
  else if (a === 'speed') { S.speedIdx = (S.speedIdx + 1) % CONFIG.speeds.length; updateLive(); loop(); }
  else if (a === 'auto') { autoAssignAll(); toast(S.jobs.length ? '全員を配置し直した。進行中のすべての案件に人を入れた' : '進行中の案件がない', 'good'); render(); }
  else if (a === 'assign') { toggleAssign(Number(el.dataset.job), Number(el.dataset.emp)); render(); }
  else if (a === 'accept') { const r = acceptOffer(Number(el.dataset.id)); done(r); if (r.ok) showPage('town'); }
  else if (a === 'hire') { const r = hire(Number(el.dataset.id)); done(r); if (r && r.ok) stamp('内定!'); }
  else if (a === 'invest') { done(buyInvest(el.dataset.key)); }
  else if (a === 'choice') { onChoice(Number(el.dataset.i)); }
  else if (a === 'continue') { nextPending(); }
});

// ----- 起動 -----
newGame();
render();
showTitle();
