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
function showPage(name) {
  ['home', 'jobs', 'hire', 'invest'].forEach((p) => $('page-' + p).classList.toggle('hidden', p !== name));
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
  const seats = S.employees.map((e) => {
    const job = e.job ? jobById(e.job) : null;
    const away = isAbsent(e);
    let status;
    if (away) status = `<div class="small neg" data-away="${e.absentUntil}">欠勤中 あと${e.absentUntil - S.day}日</div>`;
    else if (job) status = `<div class="small">${job.name} / 作業中</div>`;
    else status = '<div class="small muted">待機中(案件を割り振ろう)</div>';
    return `<div class="seat ${away ? 'seat-away' : ''}">${avatar(e.skill, e.name + 'のドット絵')}<div><strong>${e.name}</strong> <span class="small muted">${SKILLS[e.skill]} Lv.${e.lv}</span>${status}</div></div>`;
  });
  for (let i = S.employees.length; i < levelInfo().slots; i++) seats.push('<div class="seat seat-empty" data-go="hire">空席(採用できます)</div>');
  $('home-seats').innerHTML = seats.join('');

  // 進行中の案件
  $('home-projects').innerHTML = S.jobs.length ? S.jobs.map(projectCard).join('') :
    '<div class="card muted">まだ案件がありません。「案件」ページから受注しよう。</div>';

  // 右パネル
  $('home-side').innerHTML = levelPanel() + goalPanel() + missionPanel();
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
  const covered = new Set(job.staff.map(empById).filter(Boolean).map((e) => e.skill));
  const req = job.skills.map((sk) => skillTag(sk, covered.has(sk) ? 'ok' : 'ng')).join('');
  const chips = S.employees.map((e) => {
    const mine = e.job === job.id, busy = e.job && !mine, away = isAbsent(e);
    return `<button class="chip ${mine ? 'on' : ''} ${busy ? 'busy' : ''} ${away ? 'away' : ''}" data-act="assign" data-job="${job.id}" data-emp="${e.id}" title="${SKILLS[e.skill]} Lv.${e.lv}">${e.name}<span class="small">${SKILLS[e.skill]}</span></button>`;
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
  if (!next) return '<div class="panel"><div class="panel-title">会社Lv.3 に成長した</div><div class="small">席が8つ、案件は同時に4件まで受けられる。</div></div>';
  return `<div class="panel"><div class="panel-title">次の会社Lv.${next.lv}まで(席${next.slots}つ、案件${next.jobs}件)</div>
    <div class="goal-row"><span>評判</span><span>${S.rep} / ${next.needRep}</span></div>${seg(S.rep, next.needRep, 10)}
    <div class="goal-row"><span>案件の完了</span><span>${Math.min(S.done, next.needDone)} / ${next.needDone}</span></div>${seg(S.done, next.needDone, next.needDone)}</div>`;
}

function goalPanel() {
  const rows = goalList().map((g) => `<div class="goal-row"><span>${g.met ? '■' : '□'} ${g.label}</span><span>${g.fmt(g.cur)} / ${g.fmt(g.target)}</span></div>${seg(g.cur, g.target, 10)}`).join('');
  return `<div class="panel"><div class="panel-title">クリア条件(5年以内に、すべて達成)</div>${rows}</div>`;
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
    <p class="small muted legend">必要なスキルの色: 緑=いまの社員にいる / 赤=まだいない(採用すると品質が上がる)。スキルが合わない社員は、半分の力で手伝う。</p>${list}`;
}

function offerCard(o) {
  const locked = S.rep < o.minRep;
  const req = o.skills.map((sk) => skillTag(sk, S.employees.some((e) => e.skill === sk) ? 'ok' : 'ng')).join('');
  const right = locked ? `<span class="small">評判${o.minRep}で解放</span>` : '<button class="act" data-act="accept" data-id="' + o.id + '">受注する</button>';
  return `<div class="card job ${locked ? 'locked' : ''}">
    <div class="row"><div><strong>${o.name}</strong> <span class="badge badge-${DIFF_CLASS[o.diff]}">難易度 ${DIFF_LABEL[o.diff]}</span> <span class="stars">${'★'.repeat(o.diff)}${'☆'.repeat(3 - o.diff)}</span></div>${right}</div>
    <div class="small">報酬 ${yen(o.reward)} / 納期 ${o.days}日 / 仕事量 ${o.work}</div>
    <div class="req small">必要なスキル: ${req}</div>
    <div class="small">リスク: ${o.risk} ・ <span data-expire="${o.expires}">募集あと${o.expires - S.day}日</span></div>
  </div>`;
}

// ----- 採用 -----
function renderHire() {
  const slots = levelInfo().slots;
  const free = slots - S.employees.length;
  const cards = S.candidates.map((c) => `<div class="card job">
    <div class="row"><div class="who">${avatar(c.skill, c.name + 'のドット絵')}<div><strong>${c.name}</strong> <span class="small muted">${SKILLS[c.skill]} Lv.${c.lv}</span><div class="small muted">${SKILL_HELP[c.skill]}</div></div></div>
    <button class="act" data-act="hire" data-id="${c.id}">採用する</button></div>
    <div class="small">月給 ${yen(c.salary)} / 採用すると、月の支出が ${yen(monthlyCost())} → ${yen(monthlyCost() + c.salary)} に増える</div></div>`).join('') || '<div class="card muted">いまは求職者がいない。しばらく待とう。</div>';
  $('hire-body').innerHTML = `<h2>人材を採用する <span class="muted small">空席 ${free} / 席 ${slots}</span></h2>
    <p class="small muted legend">採用すると、毎月の支出が増える。席がいっぱいのときは、会社Lvを上げると席が増える。求職者は、約2か月ごとに入れ替わる。</p>${cards}`;
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
  $('h-date').textContent = dateLabel(S.day);
  $('track-fill').style.width = (S.day / CONFIG.totalDays * 100) + '%';
  $('play-btn').textContent = S.playing && !S.pending ? '❚❚ 一時停止' : '▶ 再生';
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
  renderHome();
  renderJobs();
  renderHire();
  renderInvest();
  renderTrack();
  updateLive();
  renderModal();
  S.dirty = false;
}

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

  const badgeClass = p.kind === 'report' ? 'low' : p.kind === 'notice' && !p.id ? 'mid' : 'high';
  const head = `<div class="modal-head"><span class="badge badge-${badgeClass}">${p.kind === 'incident' ? 'インシデント発生: ' : ''}${p.badge}</span><span class="small muted">ゲーム一時停止中</span></div><h3>${p.title}</h3>`;
  const text = p.lines ? `<ul class="lines">${p.lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : `<p class="muted">${p.body}</p>`;
  const chips = p.chips ? `<div class="chips">${p.chips.map((c) => `<span class="stag">${c}</span>`).join('')}</div>` : '';
  const choices = p.choices.map((c, i) => `<button class="choice ${c.tag === 'hide' ? 'is-hide' : ''}" data-act="choice" data-i="${i}"><strong>${c.label}</strong>${c.desc ? `<span class="small ${c.tag === 'hide' ? 'neg' : 'muted'}">${c.desc}</span>` : ''}</button>`).join('');
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
    <div class="panel"><div class="panel-title">クリア条件(5年以内に、すべて達成)</div>
      <div class="goal-row"><span>資金</span><span>${yen(g.money)}</span></div>
      <div class="goal-row"><span>評判</span><span>${g.rep}</span></div>
      <div class="goal-row"><span>従業員</span><span>${g.staff}人</span></div>
      <div class="goal-row"><span>大規模案件(難易度 高)の成功</span><span>${g.big}件</span></div></div>
    <ol class="steps"><li>「案件」で仕事を受注する</li><li>社員を割り振って、「再生」で時間を進める</li><li>起きた障害に、どう対応するか決める</li><li>お金がたまったら、「採用」と「投資」で会社を強くする</li></ol>
    <p class="small muted">資金が0を下回るとゲームオーバー。障害への対応しだいで、評判も資金も変わる。</p>
    <button class="btn-main" data-act="start">ゲームスタート</button>`;
  $('screen').classList.remove('hidden');
  $('modal').classList.add('hidden');
}

function showEnd() {
  screenMode = 'end';
  const o = S.over;
  const goals = goalList();
  const years = (S.day / 365).toFixed(1);
  let title, lead;
  if (o.type === 'clear') { title = 'ゲームクリア!'; lead = `${years}年で、すべての目標を達成した。会社は大きく成長した。`; }
  else if (o.type === 'bankrupt') { title = 'ゲームオーバー'; lead = `${dateLabel(o.day)}、資金が尽きて、会社を続けられなくなった。`; }
  else {
    const avg = goals.reduce((s, g) => s + g.ratio, 0) / goals.length;
    const rank = avg >= 0.85 ? 'A' : avg >= 0.6 ? 'B' : 'C';
    title = `5年が経った(評価 ${rank})`; lead = '5年のうちに、すべての目標は達成できなかった。でも、ここまで会社を育てた。';
  }
  const t = S.tally;
  let style;
  if (t.incidents === 0) style = 'まだ障害を経験していない。';
  else if (t.hide === 0) style = `障害に${t.incidents}回対応して、一度も隠さなかった。誠実な社長。`;
  else if (t.hide >= t.honest) style = `障害${t.incidents}回のうち、${t.hide}回は隠す選択をした。実際の会社では、信頼を失う原因になる。`;
  else style = `障害${t.incidents}回のうち、${t.hide}回は隠す選択をした。隠した障害は、あとで見つかることが多い。`;

  const rows = goals.map((g) => `<tr class="${g.met ? 'met' : ''}"><td>${g.met ? '■' : '□'} ${g.label}</td><td>${g.fmt(g.cur)} / ${g.fmt(g.target)}</td></tr>`).join('');
  $('screen-body').innerHTML = `<div class="modal-head"><span class="badge badge-${o.type === 'clear' ? 'low' : o.type === 'bankrupt' ? 'high' : 'mid'}">結果</span></div>
    <h1 class="big-title">${title}</h1><p>${lead}</p>
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
  screenMode = null;
  $('screen').classList.add('hidden');
  stage = 1; lastResult = null;
  render();
}

function restart() {
  clearTimeout(timer);
  newGame();
  showPage('home');
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
  if (S.over) { S.playing = false; render(); showEnd(); return; }
  if (S.dirty) render(); else updateLive();
}

// ----- 操作 -----
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act],[data-go]');
  if (!el || !S) return;
  if (el.dataset.go) { showPage(el.dataset.go); return; }
  const a = el.dataset.act;
  const done = (r) => { if (r) toast(r.msg, r.ok ? 'good' : 'bad'); render(); };

  if (a === 'start') { startGame(); return; }
  if (a === 'restart') { restart(); return; }
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
  else if (a === 'auto') { autoAssign(); toast('手が空いている社員を、案件に割り振った', 'good'); render(); }
  else if (a === 'assign') { toggleAssign(Number(el.dataset.job), Number(el.dataset.emp)); render(); }
  else if (a === 'accept') { const r = acceptOffer(Number(el.dataset.id)); done(r); if (r.ok) showPage('home'); }
  else if (a === 'hire') { done(hire(Number(el.dataset.id))); }
  else if (a === 'invest') { done(buyInvest(el.dataset.key)); }
  else if (a === 'choice') { onChoice(Number(el.dataset.i)); }
  else if (a === 'continue') { nextPending(); }
});

// ----- 起動 -----
newGame();
render();
showTitle();
