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
let companyName = '';   // 会社名(タイトル画面で入力)
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
const employeeStatus = (e) => {
  const salesRest = e.sales && e.salesCooldownUntil > S.day ? `（休止中 あと${e.salesCooldownUntil - S.day}日）` : '';
  if (isAbsent(e)) return `休職中（あと${e.absentUntil - S.day}日）`;
  if (e.sales) return `営業担当${salesRest}`;
  const job = e.job ? jobById(e.job) : null;
  return job ? `「${job.name}」を担当中` : '待機中';
};
const employeeStatusMarkup = (e) => {
  const away = isAbsent(e);
  return `<div class="employee-status ${away ? 'employee-status-away' : ''}"${away ? ` data-employee-away="${e.absentUntil}"` : ''}>${employeeStatus(e)}</div>`;
};
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
function showPage(name, force = false) {
  if (name === 'company') name = 'home';
  const eventPage = S.recruiting ? 'recruit' : null;
  if (!force && (S.pending || eventPage) && name !== eventPage) return;
  ['town', 'home', 'jobs', 'assignment', 'employees', 'recruit', 'upgrades', 'invest-event'].forEach((p) => 
    $('page-' + p).classList.toggle('hidden', p !== name));
  document.querySelector('.bottom-nav').classList.toggle('hidden', name === 'town');
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
// ----- 街の背景(山・ビル街・木・街灯など) -----
const bgRect = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const bgRnd = (i) => ((i * 9301 + 49297) % 233280) / 233280;   // 毎回同じ並びになる疑似乱数
function bgHills(color, base, amp, seed) {
  let out = '';
  for (let x = 0; x < 200; x += 4) {
    const h = Math.round(base + amp * (Math.sin(x / 23 + seed) + 0.6 * Math.sin(x / 9 + seed * 2)));
    out += bgRect(x, 72 - h, 4, h, color);
  }
  return out;
}
function bgSkyline(theme) {
  const blocks = [[2, 10, 26], [14, 12, 34], [28, 9, 22], [39, 13, 38], [53, 10, 28], [133, 11, 30], [146, 12, 40], [160, 9, 24], [171, 13, 36], [186, 11, 28]];
  return blocks.map(([x, w, h], i) => {
    let out = bgRect(x, 72 - h, w, h, i % 2 ? theme.far2 : theme.far1);
    for (let r = 0; r < Math.floor(h / 7); r++) {
      for (let k = 0; k < Math.floor(w / 4); k++) {
        if (bgRnd(i * 31 + r * 7 + k) > 0.35) out += bgRect(x + 1.5 + k * 4, 72 - h + 3 + r * 7, 2, 2.6, theme.win || theme.band);
      }
    }
    return out;
  }).join('');
}
// 動く背景のアニメーション(街の絵の中だけで使う)。再描画されても位置が飛ばないよう、開始位置は時刻から決める
const BG_ANIM_CSS = `
  .bg-cloud { animation: bg-drift var(--t) linear infinite; animation-delay: var(--delay); }
  .bg-fly { animation: bg-fly var(--t) linear infinite; animation-delay: var(--delay); }
  .bg-bob { animation: bg-bob 1.6s ease-in-out infinite; }
  .bg-wing-a { animation: bg-flap-a .5s steps(1, end) infinite; }
  .bg-wing-b { animation: bg-flap-b .5s steps(1, end) infinite; }
  .bg-tree { transform-box: fill-box; transform-origin: 50% 100%; animation: bg-sway 4s ease-in-out infinite; animation-delay: var(--delay); }
  @keyframes bg-drift { from { transform: translateX(-40px); } to { transform: translateX(230px); } }
  @keyframes bg-fly { from { transform: translateX(-20px); } to { transform: translateX(220px); } }
  @keyframes bg-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
  @keyframes bg-flap-a { 0% { opacity: 1; } 50% { opacity: 0; } }
  @keyframes bg-flap-b { 0% { opacity: 0; } 50% { opacity: 1; } }
  @keyframes bg-sway { 0%, 100% { transform: rotate(-1.2deg); } 50% { transform: rotate(1.2deg); } }
  .bg-lane { animation: bg-lane-r var(--t) linear infinite; animation-delay: var(--delay); }
  .bg-lane-l { animation: bg-lane-l var(--t) linear infinite; animation-delay: var(--delay); }
  .bg-hop { animation: bg-hop 1.2s ease-in-out infinite; }
  .bg-carp { transform-box: fill-box; transform-origin: 0% 50%; animation: bg-wave 2.4s ease-in-out infinite; animation-delay: var(--delay); }
  .bg-rise { animation: bg-rise 6s ease-in-out infinite; }
  .bg-glow { animation: bg-glow 1.8s ease-in-out infinite; }
  .bg-ghost { animation: bg-ghost 6s ease-in-out infinite; }
  @keyframes bg-lane-r { to { transform: translateX(var(--l)); } }
  @keyframes bg-lane-l { to { transform: translateX(calc(var(--l) * -1)); } }
  @keyframes bg-hop { 0%, 100% { transform: translateY(0); } 35%, 50% { transform: translateY(-3.5px); } 75% { transform: translateY(0); } }
  @keyframes bg-wave { 0%, 100% { transform: rotate(-3deg) translateY(0); } 50% { transform: rotate(3deg) translateY(-1px); } }
  @keyframes bg-rise { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  @keyframes bg-glow { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
  @keyframes bg-ghost { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(6px, -3px); } }
  .bg-kite, .bg-strip { transform-box: fill-box; transform-origin: 50% 0%; animation: bg-swing 3s ease-in-out infinite; animation-delay: var(--delay, 0s); }
  .bg-burst { transform-origin: 0 0; animation: bg-burst 3.6s ease-out infinite; animation-delay: var(--delay); }
  .bg-rain { animation: bg-rain .7s linear infinite; }
  .bg-sleigh { animation: bg-sleigh var(--t) linear infinite; animation-delay: var(--delay); }
  @keyframes bg-swing { 0%, 100% { transform: rotate(-7deg); } 50% { transform: rotate(7deg); } }
  @keyframes bg-burst { 0% { transform: scale(.15); opacity: 1; } 55% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.2); opacity: 0; } }
  @keyframes bg-rain { to { transform: translateY(20px); } }
  @keyframes bg-sleigh { from { transform: translateX(-26px); } to { transform: translateX(230px); } }
  @media (prefers-reduced-motion: reduce) { .bg-cloud, .bg-fly, .bg-bob, .bg-wing-a, .bg-wing-b, .bg-tree, .bg-lane, .bg-lane-l, .bg-hop, .bg-carp, .bg-rise, .bg-glow, .bg-ghost, .bg-kite, .bg-strip, .bg-burst, .bg-rain, .bg-sleigh { animation: none; } }`;
const bgPhase = (frac, period) => -((Date.now() / 1000 + frac * period) % period).toFixed(2);   // frac = 最初の位置(0〜1)
const bgCloud = (y, s, period, seed, color = '#fff') => `<g class="bg-cloud" style="--t:${period}s;--delay:${bgPhase(seed, period)}s">${bgRect(0, y, 22 * s, 5 * s, color)}${bgRect(4 * s, y - 3 * s, 14 * s, 4 * s, color)}</g>`;
const bgBird = (y, period, frac, color = '#2e504a', wing = 2) => `<g class="bg-fly" style="--t:${period}s;--delay:${bgPhase(frac, period)}s"><g transform="translate(0 ${y})"><g class="bg-bob">`
  + bgRect(0, 0, 3, 1, color)
  + `<g class="bg-wing-a">${bgRect(-wing, -1, wing, 1, color)}${bgRect(3, -1, wing, 1, color)}</g>`
  + `<g class="bg-wing-b">${bgRect(-wing, 1, wing, 1, color)}${bgRect(3, 1, wing, 1, color)}</g></g></g></g>`;
const bgBirds = () => bgBird(38, 30, 0.15) + bgBird(45, 38, 0.55) + bgBird(33, 46, 0.85);
const bgBats = () => bgBird(30, 24, 0.1, '#2a1b3d', 3) + bgBird(40, 30, 0.45, '#2a1b3d', 3) + bgBird(26, 36, 0.8, '#2a1b3d', 3);
function bgTree(x, y, theme, snow, big) {
  const w = 16 * big;
  let out = bgRect(x + w / 2 - 1.5, y + 10 * big, 3, 14 * big, '#7a5a46')
    + bgRect(x, y + 4 * big, w, 9 * big, theme.tree) + bgRect(x + 3 * big, y, w - 6 * big, 6 * big, theme.tree) + bgRect(x + 2 * big, y + 2 * big, w - 4 * big, 3 * big, theme.tree);
  if (snow) out += bgRect(x + 3 * big, y - 1, w - 6 * big, 2.2, '#fff') + bgRect(x + 1, y + 3.5 * big, 3, 1.6, '#fff');
  return `<g class="bg-tree" style="--delay:${-(x % 4)}s">${out}</g>`;
}
const bgLamp = (x) => bgRect(x, 56, 1.6, 22, '#2e504a') + bgRect(x - 3, 54, 8, 3, '#2e504a') + bgRect(x - 2, 55, 6, 1.6, '#ffe08a') + bgRect(x - 1, 52.5, 4, 1.6, '#2e504a');
function bgFlowers(snow) {
  const colors = ['#ff8fb1', '#ffe08a', '#fff', '#cbbcf3'];
  let out = '';
  for (let i = 0; i < 26; i++) {
    const x = 6 + bgRnd(i + 3) * 188, y = 76 + bgRnd(i + 11) * 8;
    if (x > 66 && x < 134 && y > 70) continue;   // 会社の前は空けておく
    out += bgRect(x, y, 1.6, 1.6, snow ? '#cfe0ee' : colors[i % 4]);
  }
  return out;
}
function bgFence() {
  const post = (x) => bgRect(x, 74, 2, 7, '#fff7ea', 'stroke="#2e504a" stroke-width=".4"');
  let out = '';
  for (let x = 2; x < 68; x += 5) out += post(x);
  out += bgRect(2, 76, 66, 1.4, '#fff7ea', 'stroke="#2e504a" stroke-width=".3"');
  for (let x = 134; x < 198; x += 5) out += post(x);
  out += bgRect(134, 76, 64, 1.4, '#fff7ea', 'stroke="#2e504a" stroke-width=".3"');
  return out;
}
const bgRoad = () => Array.from({ length: 13 }, (_, i) => bgRect(4 + i * 16, 89.4, 8, 1, '#fff')).join('');
// ----- 道路を走る乗り物 -----
// 同じ車線の乗り物は同じ速さで進むので、重なったり追い越したりしない。各スプライトは { w: 幅, svg: 絵 }
const bgCar = (c) => ({ w: 14, h: 5, svg: bgRect(0, 2, 14, 2.4, c) + bgRect(3, 0, 7, 2.2, c) + bgRect(4, .6, 2.2, 1.4, '#cfe8f5') + bgRect(7, .6, 2.2, 1.4, '#cfe8f5')
  + bgRect(2, 3.6, 2.8, 1.4, '#2e504a') + bgRect(9.4, 3.6, 2.8, 1.4, '#2e504a') + bgRect(13, 2.4, 1, 1, '#ffe08a') });
// 細かい絵は「ドット」で描く(1ドット = 0.5の大きさ)。x, y, w, h はドットの数
const bgDot = (x, y, w, h, fill) => bgRect(x / 2, y / 2, w / 2, h / 2, fill);
const bgWheel = (cx, cy) => bgDot(cx - 2, cy - 3, 4, 1, '#2e504a') + bgDot(cx - 3, cy - 2, 6, 4, '#2e504a') + bgDot(cx - 2, cy + 2, 4, 1, '#2e504a') + bgDot(cx - 1, cy - 1, 2, 2, '#c9d4d4');
const bgTruck = (c) => ({ w: 24, h: 9, svg: bgDot(0, 0, 32, 13, '#fffaf0') + bgDot(0, 0, 32, 1, '#2e504a') + bgDot(0, 12, 32, 1, '#2e504a') + bgDot(0, 0, 1, 13, '#2e504a') + bgDot(31, 0, 1, 13, '#2e504a')
  + bgDot(1, 1, 30, 1, '#e6dfd0') + bgDot(1, 5, 30, 3, c)
  + bgDot(33, 3, 9, 1, c) + bgDot(33, 4, 13, 9, c) + bgDot(41, 5, 4, 4, '#cfe8f5') + bgDot(37, 6, 1, 6, '#2e504a') + bgDot(45, 9, 1, 3, '#8a9a9a') + bgDot(46, 10, 1, 2, '#ffe08a')
  + bgDot(0, 13, 47, 2, '#2e504a') + bgWheel(6, 15) + bgWheel(14, 15) + bgWheel(38, 15) });
const bgMotorbike = (c, rider, helmet = '#fff') => ({ w: 12, h: 7, svg: bgDot(8, 0, 4, 3, helmet) + bgDot(11, 1, 1, 2, '#cfe8f5')
  + bgDot(6, 4, 2, 3, rider) + bgDot(7, 3, 4, 4, rider) + bgDot(10, 4, 6, 1, rider) + bgDot(16, 4, 2, 1, '#f8cdbb')
  + bgDot(7, 7, 5, 2, '#3a4a6a') + bgDot(11, 8, 2, 3, '#3a4a6a') + bgDot(11, 11, 3, 1, '#2e504a')
  + bgDot(5, 7, 7, 2, '#2e504a') + bgDot(10, 6, 5, 3, c) + bgDot(2, 8, 4, 1, c) + bgDot(5, 10, 10, 2, c) + bgDot(8, 11, 5, 2, '#5b6b6b')
  + bgDot(17, 6, 1, 6, '#5b6b6b') + bgDot(16, 7, 4, 1, c) + bgDot(16, 4, 3, 1, '#2e504a') + bgDot(19, 6, 2, 2, '#ffe08a')
  + bgWheel(4, 11) + bgWheel(19, 11) });
// 電動キックボード(立って乗る小さな乗り物。ロゴなどは入れない一般的な形)。accent = 板とヘルメットの色 / top = 上着の色
const bgKickboard = (accent, top = '#f4efe4') => {
  const skin = '#f8cdbb', dark = '#2e504a', pants = '#cfd3d6';
  const head = bgDot(8, 0, 5, 1, accent) + bgDot(7, 1, 7, 2, accent) + bgDot(7, 3, 4, 1, accent) + bgDot(11, 3, 3, 1, skin) + bgDot(12, 3, 1, 1, dark) + bgDot(8, 4, 5, 1, skin) + bgDot(7, 4, 1, 1, '#3a3a4a');
  const body = bgDot(8, 5, 5, 5, top) + bgDot(8, 9, 5, 1, '#d9d4c7') + bgDot(12, 5, 4, 2, top) + bgDot(16, 5, 2, 2, skin)
    + bgDot(7, 10, 3, 4, pants) + bgDot(10, 10, 3, 4, pants) + bgDot(6, 14, 4, 1, '#fff') + bgDot(10, 14, 4, 1, '#fff');
  const board = bgDot(4, 15, 15, 1, accent) + bgDot(4, 16, 15, 1, dark) + bgDot(1, 13, 5, 1, accent);
  const stem = bgDot(16, 7, 3, 1, dark) + bgDot(18, 8, 1, 2, dark) + bgDot(19, 10, 1, 2, dark) + bgDot(20, 12, 1, 2, accent) + bgDot(20, 13, 2, 2, accent) + bgDot(20, 9, 1, 1, '#ffe08a');
  const wheels = bgDot(1, 14, 4, 4, dark) + bgDot(2, 15, 2, 2, '#c9d4d4') + bgWheel(21, 15);
  return { w: 12, h: 9, svg: board + head + body + stem + wheels };
};

// 大きさを変える(社員の絵より小さく見えないように、車は大きめにする)
const bgScale = (s, k) => ({ w: s.w * k, h: s.h * k, svg: `<g transform="scale(${k})">${s.svg}</g>` });
// 右へ走り続ける一方通行。bottom = 乗り物の下の線(タイヤの下)の y。off は 200〜(length - 幅) の範囲で決める(出てくる順番と間隔になる)
function bgLane(vehicles, bottom, length, period, frac) {
  const items = vehicles.map(({ s, off }) => `<g transform="translate(${off - length} ${(bottom - s.h).toFixed(2)})">${s.svg}</g>`).join('');
  return `<g class="bg-lane" style="--l:${length}px;--t:${period}s;--delay:${bgPhase(frac, period)}s">${items}</g>`;
}
function bgTraffic() {
  const car = (c) => bgScale(bgCar(c), 1.4);
  // 走る順番(車・バイク・キックボードは3色ずつ)。間隔は少しずつ変えてある
  const queue = [
    car('#e0453a'), bgKickboard('#f0c040'), bgMotorbike('#7a5ac8', '#6dcfb2', '#ffe08a'), bgTruck('#4a8fd8'),
    car('#4a8fd8'), bgKickboard('#6dcfb2', '#ffd6e4'), bgMotorbike('#e0453a', '#fff7ea', '#3a4a6a'), car('#4fb583'),
    bgKickboard('#ff8fb1', '#e6f0ff'), bgMotorbike('#2e7fd0', '#ffb59e', '#fff'), bgTruck('#f0b840')
  ];
  let off = 210;
  const vehicles = queue.map((s, i) => { const v = { s, off }; off += s.w + 30 + (i * 17) % 40; return v; });
  const length = Math.ceil(off);
  return bgLane(vehicles, 93, length, Math.round(length / 26.7), 0.2);   // 速さは 約26.7 / 秒
}

// ----- 月ごとの飾り(4月イースター / 5月こどもの日 / 10月ハロウィン) -----
function bgEggs() {
  const colors = ['#ff8fb1', '#ffe08a', '#9fd6f5', '#cbbcf3', '#b8e6a8', '#ffb59e'];
  return [[8, 77], [20, 79], [38, 76.5], [64, 77.5], [136, 77], [150, 79], [166, 77], [182, 78.5], [194, 79]].map(([x, y], i) => {
    const c = colors[i % colors.length];
    return `<g transform="translate(${x} ${y}) scale(1.6)">` + bgRect(.7, 0, 1.6, 1, c) + bgRect(0, 1, 3, 2, c) + bgRect(.5, 3, 2, 1, c) + bgRect(0, 1.8, 3, .5, '#fff') + bgRect(1.2, .3, .6, .5, '#fff') + '</g>';
  }).join('');
}
const bgBunny = (x, y) => `<g transform="translate(${x} ${y})"><g class="bg-hop">`
  + bgRect(0, 3, 6, 3.2, '#fff', 'stroke="#2e504a" stroke-width=".3"') + bgRect(4.6, 1.6, 3.2, 2.8, '#fff', 'stroke="#2e504a" stroke-width=".3"')
  + bgRect(5, -1.6, 1.1, 3.4, '#fff', 'stroke="#2e504a" stroke-width=".3"') + bgRect(6.6, -1.6, 1.1, 3.4, '#fff', 'stroke="#2e504a" stroke-width=".3"')
  + bgRect(5.3, -.8, .5, 2, '#ffb6cf') + bgRect(6.9, -.8, .5, 2, '#ffb6cf') + bgRect(6.6, 2.4, .7, .7, '#2e504a') + bgRect(-.8, 3.6, 1.6, 1.6, '#fff') + `</g></g>`;
function bgKoinobori() {
  const px = 34;
  const carp = (c, y, len, i) => `<g transform="translate(${px + 1.4} ${y})"><g class="bg-carp" style="--delay:${-i * 0.7}s">`
    + bgRect(0, 0, len, 4.4, c) + bgRect(len, .9, 3, 2.6, c) + bgRect(len + 2.6, 0, 1.6, 1.4, c) + bgRect(len + 2.6, 3, 1.6, 1.4, c)
    + bgRect(1.2, 1, 1.2, 1.2, '#fff') + bgRect(1.6, 1.4, .6, .6, '#2e504a')
    + [.4, .6, .8].map((k) => bgRect(len * k, 0, .8, 4.4, '#fff', 'opacity=".35"')).join('') + '</g></g>';
  const streamer = ['#e0453a', '#f0c040', '#fff', '#4a8fd8', '#3a9a62'].map((c, i) => bgRect(px + 1.4, 26 + i * 1.1, 9, .9, c)).join('');
  return bgRect(px, 26, 1.4, 54, '#7a5a46') + bgRect(px - 1.2, 22.5, 3.8, 3.8, '#f0c040') + bgRect(px + .3, 20, .8, 2.6, '#f0c040')
    + `<g class="bg-rise">${streamer}${carp('#3a3a4a', 34, 11, 0)}${carp('#e0453a', 41.5, 10, 1)}${carp('#4a8fd8', 49, 8, 2)}</g>`;
}
function bgPumpkins() {
  return [[60, 79, 1.1], [132, 79, 1.1], [14, 80, .9], [186, 80, .9]].map(([x, y, k]) => `<g transform="translate(${x} ${y}) scale(${k})">`
    + bgRect(0, 1, 6, 4, '#f08a2a', 'stroke="#2e504a" stroke-width=".3"') + bgRect(1, .4, 4, 1, '#f08a2a') + bgRect(2.6, -.6, .9, 1.4, '#4a7a3a')
    + `<g class="bg-glow">${bgRect(1.1, 2, 1, 1, '#ffe08a')}${bgRect(3.9, 2, 1, 1, '#ffe08a')}${bgRect(1.5, 3.6, 3, .8, '#ffe08a')}</g></g>`).join('');
}
const bgMoon = () => bgRect(148, 6, 16, 16, '#ffd98a') + bgRect(151, 10, 3, 3, '#f0c070') + bgRect(157, 15, 4, 4, '#f0c070');
const bgStars = () => Array.from({ length: 16 }, (_, i) => bgRect(4 + bgRnd(i + 5) * 190, 2 + bgRnd(i + 40) * 26, 1, 1, '#fff')).join('');
const bgGhost = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k})"><g class="bg-ghost" opacity=".92">`
  + bgRect(1, 0, 5, 1.4, '#fff') + bgRect(0, 1.4, 7, 5, '#fff') + bgRect(0, 6.4, 1.8, 1.2, '#fff') + bgRect(2.6, 6.4, 1.8, 1.2, '#fff') + bgRect(5.2, 6.4, 1.8, 1.2, '#fff')
  + bgRect(1.6, 2.4, 1.1, 1.6, '#2a1b3d') + bgRect(4.2, 2.4, 1.1, 1.6, '#2a1b3d') + bgRect(2.8, 4.6, 1.4, 1, '#2a1b3d') + `</g></g>`;

// ----- 月ごとの飾り(その他の月) -----
const bgSunrise = () => bgRect(147, 5, 18, 18, '#ff6a3c') + bgRect(149, 7, 14, 14, '#ff8a4c');   // 初日の出
const bgKite = (x, y, c) => `<g transform="translate(${x} ${y})"><g class="bg-kite">`
  + [1, 3, 5, 7, 5, 3, 1].map((w, i) => bgRect(-w / 2, i, w, 1, c)).join('')
  + bgRect(-.2, 0, .4, 7, '#fff') + bgRect(-3.5, 3, 7, .4, '#fff')
  + [0, 1, 2, 3, 4].map((k) => bgRect(k % 2 ? .6 : -1.4, 7.5 + k * 1.8, 1, .8, k % 2 ? '#fff' : '#e0453a')).join('') + '</g></g>';
const bgKites = () => bgKite(172, 24, '#e0453a') + bgKite(24, 32, '#4a8fd8');
function bgKadomatsu() {   // 門松(入り口の両側)
  return [84, 116].map((x) => bgRect(x - 4, 65, 8, 3, '#2f7f62') + bgRect(x - 2.2, 56, 1.6, 10, '#6dbf6a') + bgRect(x - .8, 52, 1.6, 14, '#6dbf6a') + bgRect(x + .6, 58, 1.6, 8, '#6dbf6a')
    + bgRect(x - 2.2, 60, 1.6, .4, '#2e504a') + bgRect(x - .8, 57, 1.6, .4, '#2e504a') + bgRect(x - .8, 62, 1.6, .4, '#2e504a') + bgRect(x + .6, 63, 1.6, .4, '#2e504a')
    + bgRect(x - 3, 66.5, 6, 5.5, '#c8a070') + bgRect(x - 3, 68.5, 6, 1, '#8a6a3a') + bgRect(x - 1, 65.5, 2, 1, '#e0453a')).join('');
}
const bgOni = () => `<g transform="translate(146 73)"><g class="bg-hop" style="animation-duration:2s">`
  + bgDot(5, 0, 1, 2, '#fff7ea') + bgDot(11, 0, 1, 2, '#fff7ea') + bgDot(4, 2, 9, 6, '#e0453a') + bgDot(5, 2, 7, 1, '#2e2e3a')
  + bgDot(6, 4, 2, 1, '#fff') + bgDot(10, 4, 2, 1, '#fff') + bgDot(7, 4, 1, 1, '#2e2e3a') + bgDot(11, 4, 1, 1, '#2e2e3a') + bgDot(6, 7, 5, 1, '#2e2e3a') + bgDot(7, 8, 1, 1, '#fff') + bgDot(10, 8, 1, 1, '#fff')
  + bgDot(3, 8, 11, 5, '#e0453a') + bgDot(3, 12, 11, 3, '#f0c040') + bgDot(5, 12, 1, 3, '#2e2e3a') + bgDot(8, 12, 1, 3, '#2e2e3a') + bgDot(11, 12, 1, 3, '#2e2e3a')
  + bgDot(4, 15, 3, 4, '#e0453a') + bgDot(10, 15, 3, 4, '#e0453a') + bgDot(3, 19, 4, 1, '#2e2e3a') + bgDot(10, 19, 4, 1, '#2e2e3a')
  + bgDot(1, 8, 2, 5, '#e0453a') + bgDot(14, 9, 2, 4, '#e0453a') + bgDot(-1, 3, 3, 8, '#8a5a3a') + bgDot(-1, 4, 1, 1, '#d0d0c0') + bgDot(1, 6, 1, 1, '#d0d0c0') + '</g></g>'
  + [[130, 82], [140, 80], [150, 83], [160, 82], [170, 80], [178, 84], [186, 81], [194, 83]].map(([x, y]) => bgRect(x, y, 1, .8, '#fff7ea')).join('');   // 豆
const bgHinaDan = () => `<g transform="translate(138 69) scale(2)">`
  + bgDot(0, 2, 2, 2, '#ffb6cf') + bgDot(1, 4, 2, 1, '#7a5a46') + bgDot(18, 3, 2, 2, '#ffb6cf') + bgDot(17, 5, 2, 1, '#7a5a46')
  + bgDot(7, 0, 2, 1, '#2e2e3a') + bgDot(7, 1, 2, 2, '#f8cdbb') + bgDot(6, 3, 4, 3, '#3a4a6a') + bgDot(12, 0, 2, 1, '#2e2e3a') + bgDot(12, 1, 2, 2, '#f8cdbb') + bgDot(11, 3, 4, 3, '#ff8fb1')
  + bgDot(5, 6, 10, 3, '#d94a4a') + bgDot(5, 6, 10, 1, '#f0c040') + bgDot(2, 9, 16, 3, '#d94a4a') + bgDot(2, 9, 16, 1, '#f0c040')
  + bgDot(4, 8, 2, 1, '#ffb6cf') + bgDot(6, 8, 2, 1, '#fff') + bgDot(8, 8, 2, 1, '#b8e6a8')
  + bgDot(0, 12, 20, 3, '#d94a4a') + bgDot(0, 12, 20, 1, '#f0c040') + bgDot(1, 15, 18, 1, '#7a5a46') + '</g>';
function bgTsurushi(geo) {   // つるし雛(風でゆれる)
  const cs = ['#ff8fb1', '#ffe08a', '#9fd6f5', '#b8e6a8', '#e0453a', '#cbbcf3'];
  return [3, 13.5, 27.5, 41.5, 55.5, 57].map((dx, i) => {
    const x = geo.bx + dx, y0 = geo.by - 3;
    let o = bgRect(x, y0, .3, 5 + (i % 3) * 2, '#7a5a46');
    for (let k = 0; k < 3 + (i % 2); k++) {
      const yy = y0 + 4 + k * 4.6 + (i % 3) * 1.2;
      o += bgRect(x - 1.4, yy, 2.8, 2.8, cs[(i + k) % 6], 'stroke="#2e504a" stroke-width=".25"') + bgRect(x - .2, yy + 2.8, .4, 1.4, cs[(i + k + 2) % 6]) + bgRect(x - .2, yy - 1.6, .4, 1.6, '#7a5a46');
    }
    return `<g class="bg-strip" style="--delay:${(-i * .7).toFixed(1)}s">${o}</g>`;
  }).join('');
}
const bgPeach = () => [30, 96, 170].map((x) => bgRect(x, 80, .8, 3, '#7a5a46') + [[0, -1], [-1.5, 0], [1.5, 0], [0, 1.2]].map(([a, b]) => bgRect(x + a - .3, 78 + b, 1.8, 1.8, '#ff8fb1')).join('')).join('');   // 桃の花
const bgHydrangea = () => [12, 28, 54, 138, 156, 176, 190].map((x, i) => {   // あじさい
  const cs = [['#8aa8e8', '#6a88d8'], ['#b69af0', '#9a7ad8'], ['#e69ac8', '#d67ab0']][i % 3];
  return bgRect(x, 79, 4, 3, cs[0]) + bgRect(x + 1, 78, 2, 1, cs[0]) + bgRect(x + .5, 79.5, 1, 1, cs[1]) + bgRect(x + 2.5, 80.5, 1, 1, cs[1]) + bgRect(x - 1, 81.5, 2, 1, '#4a9a5a') + bgRect(x + 3, 81.5, 2, 1, '#4a9a5a');
}).join('');
function bgRain() {   // 雨(20ずつ下がって繰り返す)
  let out = '';
  for (let i = 0; i < 34; i++) {
    const x = (i * 37.3) % 200, y0 = (i * 53.7) % 20;
    for (let k = 0; k < 6; k++) out += bgRect(x.toFixed(1), (y0 + k * 20 - 20).toFixed(1), .4, 3, '#dfeaf5');
  }
  return `<g class="bg-rain" opacity=".75">${out}</g>`;
}
const bgMilkyWay = () => Array.from({ length: 70 }, (_, i) => { const t = i / 69; return bgRect((10 + t * 180).toFixed(1), (34 - t * 26 + (bgRnd(i + 90) - .5) * 9).toFixed(1), .8, .8, i % 3 ? '#cfd8ff' : '#fff3c0'); }).join('');   // 天の川
const bgMoonSmall = () => bgRect(148, 6, 14, 14, '#fff3c0') + bgRect(151, 9, 2, 2, '#e8dca0');
function bgTanabata() {   // 笹と短冊
  const px = 34, strips = ['#ff8fb1', '#ffe08a', '#9fd6f5', '#fff', '#b8e6a8', '#cbbcf3'];
  const leaves = [[1, 30], [-1, 36], [1, 42], [-1, 48], [1, 54]].map(([d, y]) => bgRect(px + (d > 0 ? 1 : -4), y, 4, 1.2, '#4a9a5a') + bgRect(px + (d > 0 ? 4 : -6), y + 1, 3, 1, '#6dbf6a')).join('');
  const hung = strips.map((c, i) => `<g transform="translate(${px + (i % 2 ? 4.5 : -6.5)} ${33 + i * 4.5})"><g class="bg-strip" style="--delay:${-i * .6}s">${bgRect(0, 0, .3, 1.5, '#7a5a46')}${bgRect(-.4, 1.5, 1.4, 3.6, c, 'stroke="#2e504a" stroke-width=".2"')}</g></g>`).join('');
  return bgRect(px, 26, 1.4, 54, '#8aa860') + bgRect(px - 3, 24, 8, 2, '#4a9a5a') + leaves + hung;
}
function bgFireworks() {   // 花火
  const burst = (x, y, colors, delay) => {
    let out = '';
    for (let a = 0; a < 12; a++) for (const r of [3, 5, 7]) {
      const ang = a * Math.PI / 6;
      out += bgRect((Math.round(Math.cos(ang) * r * 2) / 2).toFixed(1), (Math.round(Math.sin(ang) * r * 2) / 2).toFixed(1), 1, 1, colors[(a + (r > 4 ? 1 : 0)) % colors.length]);
    }
    return `<g transform="translate(${x} ${y})"><g class="bg-burst" style="--delay:${delay}s">${out}</g></g>`;
  };
  return burst(44, 24, ['#ff8fb1', '#ffe08a'], -0.2) + burst(104, 14, ['#9fd6f5', '#fff'], -1.6) + burst(168, 30, ['#ffb59e', '#b8e6a8'], -2.8);
}
const bgSunflowers = () => [10, 26, 50, 142, 160, 184].map((x) => bgRect(x, 77, .8, 7, '#4a9a5a') + bgRect(x - 2, 72, 4.8, 4.8, '#f0c040') + bgRect(x - .5, 73.5, 1.8, 1.8, '#7a4a2a') + bgRect(x - 2, 80, 2, 1, '#4a9a5a')).join('');
function bgLanterns() {   // 提灯
  const side = (x0, xs) => bgRect(x0, 55, 21, .4, '#2e504a') + xs.map((x) => bgRect(x, 56, 2.6, 3.4, '#e0453a') + bgRect(x + .3, 55.6, 2, .5, '#2e504a') + bgRect(x + .3, 59.4, 2, .5, '#2e504a') + `<g class="bg-glow">${bgRect(x + .8, 57, 1, 1.4, '#ffe08a')}</g>`).join('');
  return side(48, [52, 58, 64]) + side(132, [136, 142, 148]);
}
const bgBigMoon = () => bgRect(144, 4, 22, 22, '#ffe8a0') + bgRect(149, 9, 4, 4, '#f0d080') + bgRect(157, 15, 5, 5, '#f0d080') + bgRect(150, 18, 3, 3, '#f0d080');
function bgMoonViewing() {   // すすき・月見団子・うさぎ
  const susuki = (x, h) => bgRect(x, 80 - h, .6, h, '#c8a060') + bgRect(x - 1, 80 - h - 3, 2.6, 4, '#e8d29a') + bgRect(x - 2, 80 - h - 1, 1, 2, '#e8d29a') + bgRect(x + 1.6, 80 - h - 1, 1, 2, '#e8d29a');
  const dango = [[60, 76], [63.2, 76], [66.4, 76], [61.6, 73], [64.8, 73], [63.2, 70]].map(([x, y]) => bgRect(x, y, 3, 3, '#fff', 'stroke="#2e504a" stroke-width=".3"')).join('');
  return [8, 14, 20, 172, 180, 188].map((x, i) => susuki(x, 10 + (i % 3) * 3)).join('') + bgRect(58, 79, 12, 4, '#c8a070') + bgRect(56, 83, 16, 1, '#8a6a3a') + dango + bgBunny(150, 79);
}
const bgLeaves = () => Array.from({ length: 34 }, (_, i) => bgRect((4 + bgRnd(i + 7) * 192).toFixed(1), (i % 4 === 0 ? 95 + bgRnd(i + 21) * 4 : 76 + bgRnd(i + 21) * 8).toFixed(1), 1.4, 1.2, ['#e0693a', '#f0b030', '#c2453a'][i % 3])).join('');   // 落ち葉
function bgXmasTree() {
  const tiers = [[2, [1, 3, 5, 7]], [6, [3, 5, 7, 9, 11]], [11, [5, 7, 9, 11, 13, 15]]];
  let out = '';
  tiers.forEach(([y, ws]) => ws.forEach((w, i) => { out += bgDot(7 - (w - 1) / 2, y + i, w, 1, i === 0 ? '#43a870' : '#2f8f62'); }));
  out += bgDot(6, 17, 3, 2, '#7a5a46') + bgDot(7, 0, 1, 2, '#ffe08a') + bgDot(6, 1, 3, 1, '#ffe08a')
    + bgDot(1, 19, 4, 3, '#e0453a') + bgDot(2, 19, 1, 3, '#ffe08a') + bgDot(10, 19, 4, 3, '#4a8fd8') + bgDot(11, 19, 1, 3, '#fff') + bgDot(5, 20, 3, 2, '#ffb6cf');
  [[7, 4, '#e0453a'], [5, 8, '#ffe08a'], [9, 8, '#4a8fd8'], [7, 12, '#fff'], [4, 14, '#e0453a'], [10, 14, '#ffe08a'], [7, 16, '#4a8fd8'], [3, 16, '#fff'], [11, 16, '#e0453a']]
    .forEach(([x, y, c], i) => { out += `<g class="bg-glow" style="animation-delay:${(i % 2) * -0.9}s">${bgDot(x, y, 1, 1, c)}</g>`; });
  return `<g transform="translate(131 48) scale(3.3)">${out}</g>`;
}
function bgSleigh() {   // サンタのそり
  const deer = (dx) => bgDot(dx, 5, 8, 3, '#8a5a3a') + bgDot(dx + 8, 3, 3, 3, '#8a5a3a') + bgDot(dx + 11, 4, 1, 1, '#e0453a') + bgDot(dx + 9, 0, 1, 3, '#5a3a2a') + bgDot(dx + 10, 1, 2, 1, '#5a3a2a')
    + bgDot(dx + 1, 8, 1, 3, '#5a3a2a') + bgDot(dx + 3, 9, 1, 2, '#5a3a2a') + bgDot(dx + 6, 8, 1, 3, '#5a3a2a') + bgDot(dx + 7, 9, 1, 2, '#5a3a2a');
  const body = bgDot(0, 10, 15, 1, '#c0a040') + bgDot(14, 8, 2, 3, '#c0a040') + bgDot(1, 6, 13, 4, '#e0453a') + bgDot(1, 6, 13, 1, '#fff7ea')
    + bgDot(5, 1, 3, 2, '#e0453a') + bgDot(8, 1, 1, 1, '#fff') + bgDot(5, 3, 3, 2, '#f8cdbb') + bgDot(5, 5, 3, 1, '#fff') + bgDot(10, 3, 3, 3, '#8a6a3a') + bgDot(15, 7, 9, 1, '#7a5a46');
  return `<g transform="translate(0 18)"><g class="bg-sleigh" style="--t:26s;--delay:${bgPhase(.3, 26)}s">${body}${deer(24)}${deer(38)}</g></g>`;
}
function bgRoofLights(geo) {   // 屋根のイルミネーション
  const y = geo.by - 5.5, colors = ['#e0453a', '#ffe08a', '#4a8fd8', '#6dcfb2'];
  let out = '';
  for (let x = geo.bx - 2, i = 0; x < geo.bx + geo.bw + 3; x += 3.2, i++) out += `<g class="bg-glow" style="animation-delay:${(i % 2) * -0.9}s">${bgRect(x.toFixed(1), (y + (i % 2 ? .6 : 0)).toFixed(1), 1.4, 1.4, colors[i % 4])}</g>`;
  return out;
}
const MONTH_EVENT = { 0: 'お正月', 1: '節分', 2: 'ひなまつり', 3: 'イースター', 4: 'こどもの日', 5: '梅雨', 6: '七夕', 7: '夏祭り', 8: 'お月見', 9: 'ハロウィン', 10: '紅葉', 11: 'クリスマス' };
const MONTH_THEME = {   // 月ごとの空や街の色(書いていない月は、季節の色のまま)
  0: { sky: '#ffbf8f', band: '#ffe6bf' },   // 初日の出
  5: { sky: '#9aa8b8', band: '#c9d2dc', far1: '#8d9aa8', far2: '#9a9fb4', grass: '#86c795' },   // 梅雨
  6: { sky: '#2b3a7a', band: '#4a5aa0', far1: '#3d4a8a', far2: '#4a4f96', win: '#ffe08a' },   // 七夕の夜
  7: { sky: '#1c2552', band: '#33427f', far1: '#2d3a73', far2: '#3b3f80', win: '#ffe08a' },   // 夏祭りの夜
  8: { sky: '#4a4f8f', band: '#8a7fb8', far1: '#5f5a98', far2: '#6e5f9c', grass: '#cdbf7a', win: '#ffe08a' },   // お月見
  9: { sky: '#6a4f9c', band: '#f2a272', far1: '#8a5f8f', far2: '#a66a9c', grass: '#b3a35a' },   // ハロウィンの夕やけ
  10: { tree: '#e0693a', tree2: '#f0b030' }   // 紅葉(赤と黄色の木)
};
// 月ごとの飾り。pre = 空(山より奥) / sky = 空の動くもの / fore = 建物の後ろの地面 / front = 建物より手前 / night = 鳥を飛ばさない / cloud = 雲の色
const MONTH_DECOR = {
  0: { pre: bgSunrise, sky: () => bgKites() + bgBirds(), front: bgKadomatsu },
  1: { fore: bgOni },
  2: { fore: () => bgPeach() + bgHinaDan(), front: bgTsurushi },
  3: { fore: () => bgEggs() + bgBunny(58, 79) + bgBunny(158, 79) },
  4: { fore: bgKoinobori },
  5: { cloud: '#9aa4b2', fore: bgHydrangea, front: bgRain },
  6: { pre: () => bgMoonSmall() + bgStars() + bgMilkyWay(), night: true, fore: bgTanabata },
  7: { pre: () => bgMoonSmall() + bgStars(), sky: bgFireworks, fore: bgSunflowers, front: bgLanterns },
  8: { pre: () => bgBigMoon() + bgStars(), cloud: '#c9bde0', night: true, fore: bgMoonViewing },
  9: { pre: () => bgMoon() + bgStars(), cloud: '#d7c3ea', sky: () => bgBats() + bgGhost(160, 38, 1.2) + bgGhost(22, 46, .9), fore: bgPumpkins },
  10: { fore: bgLeaves },
  11: { sky: bgSleigh, fore: bgXmasTree, front: bgRoofLights }
};
// back = 建物より奥(山・ビル・雲・鳥) / fore = 建物のそば(フェンス・街灯・木・花・道路) / front = 建物より手前
function townBackdrop(theme, season, monthIdx, geo) {
  const snow = season === 'winter';
  const m = MONTH_DECOR[monthIdx] || {};
  const rightTree = Object.assign({}, theme, { tree: theme.tree2 || theme.tree });
  return {
    back: (m.pre ? m.pre() : '') + bgHills(theme.far2, 16, 4, 1) + bgSkyline(theme) + bgHills(theme.far1, 5, 2, 2.3)
      + bgCloud(11, 1.2, 70, 0.1, m.cloud) + bgCloud(5, 1, 90, 0.45, m.cloud) + bgCloud(15, 1, 80, 0.8, m.cloud) + (m.sky ? m.sky() : m.night ? '' : bgBirds()),
    fore: bgFence() + bgLamp(48) + bgLamp(152) + bgTree(8, 52, theme, snow, 1) + bgTree(176, 52, rightTree, snow, 1) + bgFlowers(snow) + bgRoad() + bgTraffic() + (m.fore ? m.fore() : ''),
    front: m.front ? m.front(geo) : ''
  };
}

function townScene() {
  const monthIdx = dateOf(S.day).getMonth();
  const theme = Object.assign({}, SEASONS[seasonOf(S.day)], MONTH_THEME[monthIdx]);
  const rows = Math.min(4, Math.max(2, S.level + 1));
  const bx = 70, bw = 60, bh = 12 + rows * 10.5, by = 72 - bh;
  const backdrop = townBackdrop(theme, seasonOf(S.day), monthIdx, { bx, bw, by });
  const rawName = S.companyName || 'PEACE株式会社';
  const nameSize = rawName.length > 8 ? 3.4 : 4.3;
  const month = dateOf(S.day).getMonth() + 1;
  const windows = Array.from({ length: rows * 4 }, (_, i) => {
    const row = Math.floor(i / 4), col = i % 4;
    if (row === rows - 1 && (col === 1 || col === 2)) return '';
    return `<rect x="${bx + 4 + col * 14}" y="${by + 6 + row * 10.5}" width="9" height="8" fill="#2e504a"/><rect x="${bx + 5 + col * 14}" y="${by + 7 + row * 10.5}" width="7" height="6" fill="${i < S.employees.length + 2 ? '#ffe08a' : '#9fd6f5'}"/>`;
  }).join('');
  const walkers = S.employees.filter((e) => !isAbsent(e)).map((e, i) => {
    const period = 28 + (i * 7) % 16;   // 片道にかかる秒数
    const delay = -((Date.now() / 1000 + i * 13) % (period * 2)).toFixed(2);   // 往復の途中から始める
    const label = `${e.name} ${SKILLS[e.skill]}`;
    return `<g class="walker" style="--t:${period}s;--w:${140 + (i * 17) % 40}px;--delay:${delay}s" transform="translate(4 0)">
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
  return `<svg class="town-scene" viewBox="0 0 200 100" role="img" aria-label="会社のある街"><style>${BG_ANIM_CSS}</style>
    <rect width="200" height="72" fill="${theme.sky}"/><rect y="40" width="200" height="32" fill="${theme.band}"/><rect x="150" y="8" width="12" height="12" fill="#fff3b0"/>
    ${backdrop.back}
    <rect y="72" width="200" height="28" fill="${theme.grass}"/><rect y="72" width="200" height="1.5" fill="#2e504a"/><rect y="85" width="200" height="9" fill="#d5d5d5"/>
    ${backdrop.fore}
    <g class="company" data-go="company"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#2e504a"/><rect x="${bx + 1}" y="${by + 1}" width="${bw - 2}" height="${bh - 1}" fill="#fff7ea"/><rect class="roof" x="${bx - 3}" y="${by - 4}" width="${bw + 6}" height="5" fill="${theme.roof}"/><rect x="${bx + 8}" y="${by - 16}" width="${bw - 16}" height="11" fill="#fafffd" stroke="#2e504a" stroke-width=".8"/><text x="${bx + bw / 2}" y="${by - 8}" font-size="${nameSize}" text-anchor="middle" fill="#2e504a">${esc(rawName)}</text>${windows}<rect x="${bx + 24}" y="58" width="12" height="14" fill="#2e504a"/><rect x="${bx + 25}" y="59" width="10" height="13" fill="#6dcfb2"/><rect x="${bx + 33}" y="65" width="1" height="1" fill="#2e504a"/></g>
    ${backdrop.front}${decor}${walkers}<rect x="3" y="3" width="27" height="8" fill="#fafffd" stroke="#2e504a" stroke-width=".6"/><text x="16.5" y="9" font-size="4.4" text-anchor="middle" fill="#2e504a">${theme.name}・${month}月</text>
  </svg><div class="small muted" style="text-align:center;margin-top:4px">▲ 会社をクリックすると、中が見られる</div>`;
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
  $('town-body').innerHTML = townScene() + `<div class="town-grid"><div>${alerts.join('')}<div class="panel"><div class="panel-title">いまの会社</div><div class="goal-row"><span>資金</span><span data-live="money">${yen(S.money)}</span></div><div class="goal-row"><span>評判</span><span data-live="rep">${S.rep} / 100</span></div><div class="goal-row"><span>社員</span><span data-live="staff">${S.employees.length} / ${levelInfo().slots}人</span></div><div class="goal-row"><span>会社Lv</span><span>Lv.${S.level}</span></div></div>${levelPanel()}</div><div class="panel"><div class="panel-title">進行中の案件</div>${projects}</div></div>`;
}

function renderHome() {
  // お知らせ
  const alerts = [];
  const hint = hintText();
  if (hint) alerts.push(`<div class="hint">${hint}</div>`);
  if (S.money < monthlyCost() * 1.5) alerts.push(`<div class="alert"><span>資金が少なくなっている。このままだと、来月の給料が払えなくなる。</span></div>`);
  S.jobs.filter((j) => j.late).forEach((j) => alerts.push(`<div class="alert"><span>「${j.name}」が納期を過ぎている。早く完成させよう。</span></div>`));
  $('home-alerts').innerHTML = alerts.join('');

  // 進行中の案件
  const projects = S.jobs.length ? S.jobs.map(projectCard).join('') :
    '<div class="card muted">まだ案件がありません。「案件」ページから受注しよう。</div>';
  $('home-projects').innerHTML = projects
    + '<div class="town-menu"><button class="btn-small" data-act="auto">おまかせ配置</button></div>';

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
    const mine = e.job === job.id, otherJob = Boolean(e.job && !mine), busy = e.sales || otherJob, away = isAbsent(e);
    if (e.sales) return `<span class="chip busy" title="営業担当中">${e.name}<span class="small">営業担当</span></span>`;
    return `<button class="chip ${mine ? 'on' : ''} ${busy ? 'busy' : ''} ${otherJob ? 'other-job' : ''} ${away ? 'away' : ''}" data-act="assign" data-job="${job.id}" data-emp="${e.id}" title="${SKILLS[e.skill]}">${e.name}<span class="small">${SKILLS[e.skill]}</span></button>`;
  }).join('');
  return `<div class="card proj">
    <div class="row"><strong>${job.name}</strong><span class="small ${left <= 7 ? 'neg' : 'muted'}" data-left="${job.id}">${leftText(job)}</span></div>
    <div class="bar"><div class="fill ${left <= 7 ? 'fill-warn' : ''}" data-bar="${job.id}" style="width:${pct}%"></div></div>
    <div class="small"><span data-pct="${job.id}">進捗 ${pct}%</span> / 報酬 ${yen(job.reward)}</div>
    <div class="req small">要求能力値: ${requirementText(job)}</div>
    <div class="req small">割り当て能力値: ${requirementProgressText(job, assigned)}</div>
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
    const otherJob = Boolean(e.job && !mine);
    const busy = e.sales || otherJob;
    const away = isAbsent(e);
    if (e.sales) return `<span class="chip busy" title="営業担当中">${e.name}<span class="small">営業担当</span></span>`;
    return `<button class="chip ${mine ? 'on' : ''} ${busy ? 'busy' : ''} ${otherJob ? 'other-job' : ''} ${away ? 'away' : ''}" data-act="assign" data-job="${job.id}" data-emp="${e.id}" title="${SKILLS[e.skill]}">${e.name}<span class="small">${SKILLS[e.skill]}</span></button>`;
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
        ${isAbsent(e) ? employeeStatusMarkup(e) : `<div class="employee-status">${status}</div>`}<div class="employee-info"><span>営業力</span><strong>${e.salesSkill}/100</strong></div>
        <div class="small">${employeeStats(e)}</div><div class="small muted">案件獲得率 ${salesSuccessRate(e.salesSkill)}%（基礎30%） / 獲得後1〜3か月休止</div>
        <div class="employee-actions">${salesButton(e)}</div></div>`;
    }).join('') || '<div class="card muted">営業担当がいません。社員一覧から担当者を設定してください。</div>';
    $('employees-body').innerHTML = `<div class="row"><h2>社員一覧 <span class="muted small">${S.employees.length} / ${slots}人</span></h2><div>${viewButton('staff')} <button class="btn-small" data-go="upgrades">社員強化</button></div></div>
      <p class="small muted legend">営業担当は毎月、基礎30%に営業力を加味した確率で案件を獲得します。営業力は将来データベースの値に差し替えられます。</p>
      <h3>営業担当</h3><div class="employee-grid">${sales}</div>`;
    return;
  }
  const cards = S.employees.filter((e) => !e.sales).map((e) => {
    return `<div class="employee-card">
      <div class="employee-card-head"><div class="employee-avatar">${avatar(e.skill, e.name + 'のドット絵')}</div><div><div class="small muted">社員</div><strong class="employee-name">${e.name}</strong><span class="employee-skill">${SKILLS[e.skill]}</span></div></div>
      <div class="small employee-help">${SKILL_HELP[e.skill]}</div>${employeeStatusMarkup(e)}
      <div class="employee-info"><span>月給</span><strong>${yen(e.salary)}</strong></div><div class="small">営業力 ${e.salesSkill}/100</div><div class="small">${employeeStats(e)}</div>
      <div class="employee-actions">${salesButton(e)}</div></div>`;
  }).join('') || '<div class="card muted">営業担当以外の社員がいません。営業担当を見るボタンから確認できます。</div>';
  $('employees-body').innerHTML = `<div class="row"><h2>社員一覧 <span class="muted small">${S.employees.length} / ${slots}人</span></h2><div>${viewButton('sales')} <button class="btn-small" data-go="upgrades">社員強化</button></div></div>
    <p class="small muted legend">社員のスキルや担当案件を確認できます。営業担当は毎月、基礎30%に営業力を加味した確率で1〜3件の案件を獲得し、獲得後1〜3か月休みます。</p><div class="employee-grid">${cards}</div>`;
}

// ----- 採用イベント -----
function renderRecruit() {
  const priorityRecruiting = S.recruitContractActive;
  const eventTitle = priorityRecruiting ? '優先採用イベント' : '採用イベント';
  if (S.recruitStage === 'confirm') {
    $('recruit-body').innerHTML = `<h2>${eventTitle}</h2>
      <div class="card">
        <p>${priorityRecruiting ? `${SKILLS[S.recruitContractJobType]}の求職者が紹介されました。` : '新しい求職者が来ました。候補者を確認して、採用活動を行いますか?'}</p>
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
    return `<div class="employee-card">
      <div class="employee-card-head"><div class="employee-avatar">${avatar(e.skill, e.name + 'のドット絵')}</div><div><div class="small muted">社員</div><strong class="employee-name">${e.name}</strong><span class="employee-skill">${SKILLS[e.skill]}</span></div></div>
      <div class="small employee-help">${SKILL_HELP[e.skill]}</div>${employeeStatusMarkup(e)}
      <div class="employee-info"><span>月給</span><strong>${yen(e.salary)}</strong></div><div class="small">営業力 ${e.salesSkill}/100</div><div class="small">${employeeStats(e)}</div>
    </div>`;
  }).join('');
  if (S.recruitStage === 'staff') {
    $('recruit-body').innerHTML = `<h2>在籍社員 <span class="muted small">${S.employees.length} / ${slots}人</span></h2>
      <p class="small muted legend">社員のスキルや担当案件を確認できます。</p><div class="employee-grid">${staff || '<div class="card muted">社員がいません。</div>'}</div>
      <div class="recruit-actions"><button class="btn-small" data-act="back-recruit">求職者一覧に戻る</button></div>`;
    return;
  }
  const cards = S.candidates.map((c) => `<div class="resume">
    <div class="resume-head">履 歴 書</div><div class="resume-top"><div class="resume-photo">${avatar(c.skill, c.name + 'のドット絵')}</div>
      <div><div class="small muted">名前</div><strong class="resume-name">${c.name}</strong><div class="small muted">スキル</div><div>${SKILLS[c.skill]}</div></div></div>
    <div class="small resume-help">${SKILL_HELP[c.skill]}</div><div class="resume-row"><span class="muted small">月給</span><b>${yen(c.salary)}</b></div>
    <div class="small muted">採用後の月の支出 ${yen(monthlyCost())} → ${yen(monthlyCost() + c.salary)}</div>
    <button class="act resume-btn" data-act="hire" data-id="${c.id}">採用する</button></div>`).join('') || '<div class="card muted">いまは求職者がいない。しばらく待とう。</div>';
  $('recruit-body').innerHTML = `<h2>${eventTitle} <span class="muted small">空席 ${free} / 席 ${slots}</span></h2>
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
  $('upgrades-body').innerHTML = `<div class="row"><h2>社員強化</h2><button class="btn-small" data-go="employees">← 社員一覧に戻る</button></div>
    <p class="small muted legend">資金を使って社員の得意分野を強化できます。得意分野は大きく伸び、それ以外のステータスも低確率で少し伸びます。</p>${cards}`;
}

// ----- 投資イベント -----
function renderInvestEvent() {
  const cards = Object.keys(INVEST).map((k) => {
    const inv = INVEST[k];
      if (k === 'recruitContract') {
        const disabled =
          S.recruitContractCount >= inv.maxCount ||
          S.recruitContractActive;
        const btn = disabled
          ? '<span class="small">利用できません</span>'
          : `<button class="act" data-act="recruit-contract">契約する 評判${inv.repCost}</button>`;
            return `<div class="card job">
            <div class="row">
              <div>
                <strong>${inv.name}</strong>
              </div>
              ${btn}
            </div>
            <div class="small">${inv.help}</div>
            <div class="small muted">
              ${inv.now(S.recruitContractCount,S.recruitContractActive,S.recruitContractJobType)}
            </div>
          </div>`;
      }
    const lv = S.invest[k];
    const max = inv.costs.length;
    const btn = lv >= max
      ? '<span class="small">最大</span>'
      : `<button class="act" data-act="invest" data-key="${k}">強化する ${yen(inv.costs[lv])}</button>`;
    return `<div class="card job"><div class="row"><div><strong>${inv.name}</strong> ${pips(lv,max)}
    </div>${btn}</div><div class="small">${inv.help}</div><div class="small muted">いまの効果: ${inv.now(lv)}</div></div>`;
  }).join('');
  $('invest-event-body').innerHTML = `<h2>投資 <span class="muted small">資金 ${yen(S.money)}</span></h2>
    <p class="small muted legend">資金を使って会社設備を強化できます。</p>${cards}`;
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
  const hName = $('h-name'); if (hName) hName.textContent = S.companyName || 'PEACE株式会社';
  $('h-date').textContent = dateLabel(S.day);
  $('track-fill').style.width = (S.day / CONFIG.totalDays * 100) + '%';
  const eventActive = S.pending || S.recruiting ;
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
  document.querySelectorAll('[data-employee-away]').forEach((el) => { el.textContent = `休職中（あと${Math.max(0, Number(el.dataset.employeeAway) - S.day)}日）`; });
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
  const body = $('modal-body');
  const showMission = S && S.missionsOpen && !p && screenMode === null;
  $('modal').classList.toggle('hidden', (!p && !showMission) || screenMode !== null);
  if (showMission) {
    $('modal-body').innerHTML = `<div class="modal-head"><span class="badge badge-low">ミッション</span><button class="btn-small" data-act="toggle-missions">閉じる</button></div>${missionPanel()}`;
    return;
  }
  if (S.recruitSelectingJob) {
    body.innerHTML = `
      <div class="modal-head">
        <span class="badge badge-low">人材紹介会社との特別契約</span>
      </div>
      <h3>職種選択</h3>
      <p class="small muted">
        次回の採用イベントで優先的に紹介してほしい職種を選択してください。
      </p>
      <div class="choices">
        <button class="choice" data-act="select-recruit-job" data-job="dev">開発</button>
        <button class="choice" data-act="select-recruit-job" data-job="design">設計</button>
        <button class="choice" data-act="select-recruit-job" data-job="sales">営業</button>
        <button class="choice" data-act="select-recruit-job" data-job="security">セキュリティ</button>
        <button class="choice" data-act="select-recruit-job" data-job="infra">インフラ・運用保守</button>
      </div>
      <button class="btn-small" data-act="cancel-recruit-contract">キャンセル</button>
    `;
    $('modal').classList.remove('hidden');
    return;
  }
  if (!p || screenMode !== null) return;


  if (stage === 2 && lastResult) {
    body.innerHTML = `<div class="modal-head"><span class="badge badge-low">結果</span></div><h3>${lastResult.title}</h3>
      <div class="result">${lastResult.text}</div>
      ${lastResult.lesson ? `<div class="lesson"><div class="small muted">ひとこと解説</div>${lastResult.lesson}</div>` : ''}
      <button class="choice has-letter" data-act="continue"><span class="ch-letter space-key">Space</span><span class="ch-body"><strong>つづける</strong></span></button>`;
    return;
  }

  const badgeClass = p.kind === 'report' ? 'low' : p.kind === 'notice' && !p.id ? 'mid' : 'high';
  const head = p.kind === 'incident'
    ? `<div class="inc-head"><span class="inc-title">⚠ ${p.badge}が発生!</span><span class="small">ゲーム一時停止中</span></div>`
    : `<div class="modal-head"><span class="badge badge-${badgeClass}">${p.badge}</span><span class="small muted">ゲーム一時停止中</span></div>`;
  const text = p.lines ? `<ul class="lines">${p.lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : `<p class="muted">${p.body}</p>`;
  const chips = p.chips ? `<div class="chips">${p.chips.map((c) => `<span class="stag">${c}</span>`).join('')}</div>` : '';
  const choices = p.choices.map((c, i) => {
    const keyLabel = p.choices.length === 1 ? 'Space' : i + 1;
    const keyClass = p.choices.length === 1 ? 'space-key' : '';
    return `<button class="choice has-letter ${c.tag === 'hide' ? 'is-hide' : ''}" data-act="choice" data-i="${i}"><span class="ch-letter ${keyClass}">${keyLabel}</span><span class="ch-body"><strong>${c.label}</strong>${c.desc ? `<span class="small ${c.tag === 'hide' ? 'neg' : 'muted'}">${c.desc}</span>` : ''}</span></button>`;
  }).join('');
  body.innerHTML = head + (p.kind === 'incident' ? `<div class="inc-status"><h3>${p.title}</h3>${chips}${text}</div>` : `<h3>${p.title}</h3>${chips}${text}`) + choices;
}

function onChoice(i) {
  const res = resolve(i);
  if (!res) return;
  flushNotices();
  showPage('home', true);
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
    <div class="panel"><div class="panel-title">会社の名前</div><input id="company-name" type="text" maxlength="10" value="${esc(companyName)}" placeholder="会社名を入力(10文字まで)" style="width:100%;padding:8px;font:inherit;border:2px solid #2e504a;box-sizing:border-box"></div>
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
    <button class="btn-main" id="start-btn" data-act="start" ${companyName ? '' : 'disabled'}>ゲームスタート</button>`;
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
  S.companyName = companyName;
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
  if (!S.playing || S.pending || S.over || S.recruiting || screenMode !== null) return;
  timer = setTimeout(() => { tick(); afterTick(); loop(); }, CONFIG.speeds[S.speedIdx].ms);
}

function afterTick() {
  flushNotices();
  if (S.over) { S.playing = false; render(); showEnd(); return; }
  if (S.recruitmentEvent) {
    S.recruitmentEvent = false;
    if (S.pending) {
      S.queue.unshift(S.pending);
      S.pending = null;
    }
    S.playing = false;
    showPage('recruit');
  }
  if (S.dirty) render(); else updateLive();
}

// ----- 操作 -----
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act],[data-go]');
  if (!el || !S) return;
  if (el.dataset.go) {
    if (S.pending || S.recruiting ) return;
    const go = el.dataset.go;
    showPage(go);
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
    if (S.pending || S.recruiting ) return;
    S.playing = !S.playing;
    updateLive();
    loop();
  }
  else if (a === 'speed') {
    if (S.pending || S.recruiting ) return;
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
  else if (a === 'finish-assignment') { S.assignmentJobId = null; showPage('home', true); render(); }
  else if (a === 'hire') { done(hire(Number(el.dataset.id))); }
  else if (a === 'open-recruit') { S.recruitStage = 'candidates'; render(); }
  else if (a === 'open-staff') { S.recruitStage = 'staff'; render(); }
  else if (a === 'back-recruit') { S.recruitStage = 'candidates'; render(); }
  else if (a === 'finish-recruit') {
    S.recruiting = false;
    S.recruitmentEvent = false;
    if (S.recruitContractActive) {
      S.recruitContractActive = false;
      S.recruitContractJobType = null;
    }
    if (!S.pending && S.queue.length) {
      stage = 1;
      lastResult = null;
      advance();
      showPage('home', true);
      render();
      return;
    }
    showPage('home', true);
    render();
  }
  else if (a === 'upgrade-employee') { done(strengthenEmployee(Number(el.dataset.id))); }
  else if (a === 'invest') { done(buyInvest(el.dataset.key)); }
  else if (a === 'finish-invest') {
    showPage('home', true);
    render();
  }
  else if (a === 'choice') { onChoice(Number(el.dataset.i)); }
  else if (a === 'continue') { nextPending(); }
  else if (a === 'recruit-contract') {
    if (
      S.recruitContractCount >=
      INVEST.recruitContract.maxCount
    ) {
      notify('利用回数の上限です', 'warn');
      return;
    }
    if (S.recruitContractActive) {
      notify('契約実行待ちです', 'warn');
      return;
    }
    if (S.rep < INVEST.recruitContract.repCost) {
      notify('評判が足りません', 'warn');
      return;
    }
    S.recruitSelectingJob = true;
    renderModal();
    return;
  }
  else if (a === 'select-recruit-job') {
    const jobType = el.dataset.job;
    const contract = INVEST.recruitContract;
    const hasJobType = S.employeeDatabase.some((candidate) => candidate.skill === jobType);
    if (!hasJobType) {
      notify('その職種の候補者データがありません', 'warn');
      return;
    }
    if (S.recruitContractCount >= contract.maxCount || S.recruitContractActive) {
      notify('この契約は利用できません', 'warn');
      return;
    }
    if (S.rep < contract.repCost) {
      notify('評判が足りません', 'warn');
      return;
    }
    S.rep -= contract.repCost;
    S.recruitContractCount++;
    S.recruitContractActive = true;
    S.recruitContractJobType = jobType;
    S.recruitSelectingJob = false;
    log(`${SKILLS[jobType]}の優先採用契約を結んだ`);
    $('modal').classList.add('hidden');
    render();
    return;
  }
  else if (a === 'cancel-recruit-contract') {
    S.recruitSelectingJob = false;
    $('modal').classList.add('hidden');
    return;
  }
});

// ----- 会社名の入力 -----
document.addEventListener('input', (ev) => {
  if (ev.target.id !== 'company-name') return;
  companyName = ev.target.value.trim();
  const btn = $('start-btn');
  if (btn) btn.disabled = !companyName;
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
  if (S?.pending && stage === 1 && Array.isArray(S.pending.choices)) {
    const choiceIndex = {
      Digit1: 0,
      Digit2: 1,
      Digit3: 2
    }[ev.code];
    if (choiceIndex !== undefined && choiceIndex < S.pending.choices.length) {
      ev.preventDefault();
      onChoice(choiceIndex);
      return;
    }
  }
  if (S?.pending && ev.code === 'Space') {
    if (stage === 2 && lastResult) {
      ev.preventDefault();
      nextPending();
      return;
    }
    if (stage === 1 && S.pending.choices?.length === 1) {
      ev.preventDefault();
      onChoice(0);
      return;
    }
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
