// ===== ゲームの設定とデータ =====
// 数字や文章は、このファイルを書き換えると、ゲームの内容を変えられます。

const CONFIG = {
  startYear: 2027,
  startMonth: 3,            // 0始まり(3 = 4月)
  totalDays: 365 * 5,       // 5年間
  startMoney: 3500000,
  startRep: 30,
  officeCost: 80000,        // 毎月の運営費
  paydayOfMonth: 25,        // 給料日
  speeds: [
    { label: 'x1', ms: 400 },   // 1日 = 0.4秒
    { label: 'x2', ms: 200 },
    { label: 'x4', ms: 100 }
  ],
  defaultSpeed: 0,
  goals: { money: 70000000, rep: 100, staff: 7, big: 3 },   // クリア条件
  incidentGap: [35, 60],    // 障害が起きる間隔(日)
  firstIncidentDay: 12      // 最初の障害は、案件があればこの日以降に起きる
};

const SKILLS = {
  design: '設計',
  dev: '開発',
  test: 'テスト',
  infra: 'インフラ',
  security: 'セキュリティ'
};

const SKILL_HELP = {
  design: '画面や仕組みを考える人',
  dev: 'プログラムを作る人',
  test: 'バグを見つける人',
  infra: 'サーバーやネットワークを守る人',
  security: '情報漏えいを防ぐ人'
};

const SALARY = { 1: 220000, 2: 300000, 3: 400000 };   // レベル別の月給

// 会社のレベル。slots = 社員の席の数、jobs = 同時に受けられる案件の数
const LEVELS = [
  { lv: 1, slots: 4, jobs: 2 },
  { lv: 2, slots: 6, jobs: 3, needRep: 50, needDone: 2 },
  { lv: 3, slots: 8, jobs: 4, needRep: 100, needDone: 5 }
];

const START_STAFF = [
  { name: '佐藤', skill: 'design', lv: 2 },
  { name: '鈴木', skill: 'dev', lv: 1 },
  { name: '伊藤', skill: 'infra', lv: 2 }
];

const CANDIDATE_NAMES = [
  '中村', '小林', '加藤', '吉田', '山本', '松本', '井上', '木村', '林', '清水',
  '斎藤', '山口', '森', '池田', '橋本', '石川', '前田', '藤田', '岡田', '後藤'
];

// 案件。work = 仕事量、skills = 必要なスキル、diff = 難易度(1〜3)
const JOB_TEMPLATES = [
  { id: 'web',  name: '企業Webサイト制作',   diff: 1, reward: 1900000,  days: 40,  work: 120,  skills: ['design', 'dev'],                                   minRep: 0,  risk: '要件変更が起きやすい' },
  { id: 'lp',   name: 'お店の予約サイト',     diff: 1, reward: 3000000,  days: 55,  work: 200,  skills: ['design', 'dev'],                                   minRep: 0,  risk: 'サーバー障害に注意' },
  { id: 'inv',  name: '在庫管理システム',     diff: 2, reward: 5000000,  days: 100, work: 360,  skills: ['design', 'dev', 'test'],                           minRep: 0,  risk: 'バグ、納期遅延' },
  { id: 'app',  name: '学習アプリの開発',     diff: 2, reward: 6200000,  days: 110, work: 450,  skills: ['design', 'dev', 'test'],                           minRep: 30, risk: 'バグ、要件変更' },
  { id: 'ec',   name: 'ECサイト構築',         diff: 3, reward: 8500000,  days: 130, work: 650,  skills: ['design', 'dev', 'test', 'security'],               minRep: 50, risk: '情報漏えい、サーバー障害' },
  { id: 'cust', name: '顧客情報管理システム', diff: 3, reward: 11000000,  days: 160, work: 900,  skills: ['dev', 'test', 'security', 'infra'],                minRep: 50, risk: '情報漏えい' },
  { id: 'med',  name: '病院のデータ基盤',     diff: 3, reward: 17000000, days: 190, work: 1300, skills: ['design', 'dev', 'test', 'infra', 'security'],      minRep: 80, risk: '情報漏えい、障害、納期遅延' }
];

// 投資。costs = レベルごとの費用
const INVEST = {
  backup: {
    name: 'バックアップ体制',
    costs: [200000, 400000, 700000],
    help: 'サーバー障害が起きにくくなり、起きても失う作業が少なくなる。',
    now: (lv) => lv === 0 ? 'まだ何もしていない' : `障害の確率 -${25 * lv}% / 障害で失う進捗 ${BACKUP_LOSS[lv] * 100}%`
  },
  security: {
    name: 'セキュリティ対策',
    costs: [300000, 600000, 1000000],
    help: '情報漏えいが起きにくくなり、対応の費用も安くなる。',
    now: (lv) => lv === 0 ? 'まだ何もしていない' : `情報漏えいの確率 -${30 * lv}% / 対応費用 -${20 * lv}%`
  },
  qa: {
    name: '品質管理(テスト環境)',
    costs: [250000, 500000, 800000],
    help: 'バグが起きにくくなり、完成品の品質も上がる。',
    now: (lv) => lv === 0 ? 'まだ何もしていない' : `バグの確率 -${25 * lv}% / 品質 +${5 * lv}点`
  }
};

// ===== 障害・出来事 =====
// 選択肢の apply() が結果の文章を返す。tag: honest = 誠実な対応 / hide = 隠す

const BACKUP_AGE = ['1週間前', '3日前', '1日前', '数時間前'];
const BACKUP_LOSS = [0.10, 0.06, 0.03, 0.01];
const pct = (f) => Math.round(f * 1000) / 10;

const INCIDENTS = {
  server: {
    weight: () => 3 * (1 - 0.25 * S.invest.backup),
    build({ job }) {
      const b = S.invest.backup;
      const loss = BACKUP_LOSS[b];
      return {
        kind: 'incident', id: 'server', badge: 'サーバー障害',
        title: '開発サーバーが停止した',
        body: `「${job.name}」の開発環境にアクセスできなくなった。納期まで残り${remainDays(job)}日。バックアップは${BACKUP_AGE[b]}のものしかない。どう対応する?`,
        chips: [`バックアップ体制 Lv.${b}`, `バックアップ: ${BACKUP_AGE[b]}`],
        choices: [
          {
            label: '復旧を最優先する', desc: `進捗 -${pct(loss)}% / 費用 -50,000`, tag: 'honest',
            apply() { addProgress(job, -loss); addMoney(-50000); return `復旧に集中して、開発環境が戻った。進捗が${pct(loss)}%分戻り、費用が50,000かかった。`; }
          },
          {
            label: '外部業者に依頼する', desc: `進捗 -${pct(loss * 0.3)}% / 費用 -300,000 / 復旧が早い`, tag: 'honest',
            apply() { addProgress(job, -loss * 0.3); addMoney(-300000); return `専門業者のおかげで、すぐに復旧した。進捗は${pct(loss * 0.3)}%分だけ戻り、費用が300,000かかった。`; }
          },
          {
            label: '障害を隠して開発を続ける', desc: `進捗 -${pct(loss * 0.5)}% / 費用 0 / 発覚すると評判が大きく低下`, tag: 'hide',
            apply() {
              addProgress(job, -loss * 0.5);
              if (rand() < 0.7) {
                schedule(ri(10, 25), 'reveal', { what: 'server', jobName: job.name });
                return '費用はかからなかった。でも、不安定な環境のまま進めている。';
              }
              return '今回は、顧客に気づかれなかった。でも、運が良かっただけだ。';
            }
          }
        ],
        lesson: 'バックアップをとる頻度で、障害のあとに失う作業の量が決まります。障害は、隠さずに早く報告して復旧するのが基本です。バックアップ体制への投資で、被害を小さくできます。'
      };
    }
  },

  bug: {
    weight: () => 3 * (1 - 0.25 * S.invest.qa),
    build({ job }) {
      return {
        kind: 'incident', id: 'bug', badge: 'バグ',
        title: 'テストで重大なバグが見つかった',
        body: `「${job.name}」で、データが正しく保存されないバグが見つかった。納期まで残り${remainDays(job)}日。どう対応する?`,
        chips: [`品質管理 Lv.${S.invest.qa}`],
        choices: [
          {
            label: 'しっかり修正する', desc: '進捗 -5% / 費用 0', tag: 'honest',
            apply() { addProgress(job, -0.05); return 'バグを直して、動作を確認した。進捗が5%分戻った。'; }
          },
          {
            label: 'テスト担当に追加で確認してもらう', desc: '進捗 -2% / 費用 -100,000 / 品質 +5', tag: 'honest',
            apply() { addProgress(job, -0.02); addMoney(-100000); job.qBonus += 5; return '修正に加えて、ほかのバグも洗い出せた。費用が100,000かかったが、品質が上がった。'; }
          },
          {
            label: '納期を優先して、そのまま納品する', desc: '進捗 0% / 費用 0 / 品質が大きく下がる', tag: 'hide',
            apply() { job.qDebt += 25; return '作業は止まらなかった。でも、バグを抱えたまま完成に向かっている。品質が下がる。'; }
          }
        ],
        lesson: 'バグは、見つけるのが遅いほど直すコストが大きくなります。テストを後回しにすると、納品後に大きな問題になりやすいです。'
      };
    }
  },

  change: {
    weight: () => 2,
    build({ job }) {
      return {
        kind: 'incident', id: 'change', badge: '要件変更',
        title: '顧客から追加の依頼が来た',
        body: `顧客から、「${job.name}」に機能を追加してほしいと言われた。納期は変えられないという。どう対応する?`,
        choices: [
          {
            label: '追加費用を交渉する', desc: '成功すると報酬 +15% / 失敗すると評判 -3', tag: 'honest',
            apply() {
              if (rand() < 0.5) {
                job.reward = Math.round(job.reward * 1.15 / 10000) * 10000;
                job.work = Math.round(job.work * 1.1);
                return '交渉が成功した。仕事量は10%増えたが、報酬が15%増えた。';
              }
              addRep(-3);
              return '顧客に断られて、少し関係が悪くなった。評判が3下がった。';
            }
          },
          {
            label: 'そのまま受け入れる', desc: '仕事量 +20% / 評判 +2', tag: 'other',
            apply() { job.work = Math.round(job.work * 1.2); addRep(2); return '顧客は喜んだ。評判が2上がったが、仕事量が20%増えた。報酬は変わらない。'; }
          },
          {
            label: 'お断りする', desc: '評判 -4', tag: 'other',
            apply() { addRep(-4); return '予定どおりに進められるが、顧客の満足度は下がった。評判が4下がった。'; }
          }
        ],
        lesson: '要件変更は、範囲・費用・納期をきちんと話し合って決めます。黙って全部受けると、時間と費用がどんどん膨らみます(スコープクリープ)。'
      };
    }
  },

  leak: {
    weight: () => (S.level >= 2 ? 2 : 1) * (1 - 0.3 * S.invest.security),
    build() {
      const sec = S.invest.security;
      const cost = (base) => Math.round(base * (1 - 0.2 * sec) / 1000) * 1000;
      const c1 = cost(200000), c2 = cost(50000);
      return {
        kind: 'incident', id: 'leak', badge: '情報漏えい',
        title: '情報漏えいの疑いが見つかった',
        body: '社内のパソコンから、顧客の情報が外部へ送られた形跡がある。まだ被害は確認されていない。どう対応する?',
        chips: [`セキュリティ対策 Lv.${sec}`],
        choices: [
          {
            label: 'すぐに調査して、顧客に報告する', desc: `費用 -${c1.toLocaleString('en-US')} / 評判 -3`, tag: 'honest',
            apply() { addMoney(-c1); addRep(-3); return `原因を調べて、顧客に報告した。対応が早かったので、信頼は保てた。費用が${c1.toLocaleString('en-US')}かかり、評判が3下がった。`; }
          },
          {
            label: '社内だけで調査する', desc: `費用 -${c2.toLocaleString('en-US')} / 後で発覚するかも`, tag: 'hide',
            apply() {
              addMoney(-c2);
              if (rand() < 0.5) {
                schedule(ri(14, 30), 'reveal', { what: 'leak', repLoss: 25, moneyLoss: 500000 });
                return '調査を進めたが、顧客には伝えていない。この先、何が起きるか分からない。';
              }
              return '調査の結果、被害は出なかった。でも、報告しなかったことが良かったとは言えない。';
            }
          },
          {
            label: '気づかなかったことにする', desc: '費用 0 / 発覚すると大きな被害', tag: 'hide',
            apply() {
              if (rand() < 0.7) {
                schedule(ri(10, 25), 'reveal', { what: 'leak', repLoss: 30, moneyLoss: 1000000 });
                return '何もしなかった。問題は、まだ解決していない。';
              }
              return '今回は、何も起きなかった。でも、また起きる可能性は残っている。';
            }
          }
        ],
        lesson: '情報漏えいは、隠すほど被害が大きくなります。早い調査と報告が信頼を守ります。アクセス管理や暗号化などの対策は、セキュリティ対策への投資で強化できます。'
      };
    }
  },

  absence: {
    weight: () => 2,
    build({ emp }) {
      return {
        kind: 'incident', id: 'absence', badge: '従業員の欠勤',
        title: `${emp.name}が体調不良になった`,
        body: `${emp.name}(${SKILLS[emp.skill]})が、熱を出してしまった。作業を続けるのは難しそうだ。どう対応する?`,
        choices: [
          {
            label: 'ゆっくり休んでもらう', desc: '5日間お休み', tag: 'honest',
            apply() { emp.absentUntil = S.day + 5; S.dirty = true; return `${emp.name}は5日間休むことになった。その間、担当の案件は進みにくくなる。`; }
          },
          {
            label: '外部のスタッフに手伝ってもらう', desc: '5日間お休み / 費用 -80,000 / 進捗は止まらない', tag: 'honest',
            apply() { emp.absentUntil = S.day + 5; emp.coveredUntil = S.day + 5; addMoney(-80000); S.dirty = true; return `外部のスタッフが代わりに作業した。進捗は止まらなかったが、費用が80,000かかった。`; }
          },
          {
            label: '無理に出社してもらう', desc: '費用 0 / 悪化すると15日間お休み', tag: 'other',
            apply() {
              if (rand() < 0.5) { emp.absentUntil = S.day + 15; S.dirty = true; return `${emp.name}の体調が悪化して、15日間休むことになった。`; }
              return '今回は何とか乗り切った。でも、いつもうまくいくとは限らない。';
            }
          }
        ],
        lesson: '無理な働き方は、長期の離脱につながります。人員に余裕を持たせ、休める仕組みを作ることが、開発を安定させます。'
      };
    }
  },

  delay: {
    weight: () => 0,   // 納期が近いときだけ、自動で起きる
    build({ job }) {
      const pctDone = Math.floor(job.progress / job.work * 100);
      return {
        kind: 'incident', id: 'delay', badge: '納期遅延',
        title: '納期に間に合わない見込みだ',
        body: `「${job.name}」は、このままだと納期に間に合わない。残り${remainDays(job)}日で、進捗は${pctDone}%。どう対応する?`,
        choices: [
          {
            label: '顧客に相談して、納期を延ばしてもらう', desc: '納期 +14日 / 評判 -2', tag: 'honest',
            apply() { job.deadline += 14; job.warned = false; addRep(-2); return '早めに相談したので、顧客は納期の延長を認めてくれた。評判が2下がった。'; }
          },
          {
            label: '費用をかけて、人員を増やす', desc: '費用 -150,000 / 14日間、進みが1.4倍', tag: 'honest',
            apply() { addMoney(-150000); S.boost[job.id] = S.day + 14; return '応援の人員が加わって、開発が加速した。費用が150,000かかった。'; }
          },
          {
            label: 'そのまま進める', desc: '費用 0 / 遅れると報酬と評判が下がる', tag: 'other',
            apply() { return '何も変えずに進めることにした。間に合えばよいが、遅れたら報酬が減る。'; }
          }
        ],
        lesson: '遅れそうなときは、早めに報告して相談するのが基本です。直前になるほど、取れる選択肢は少なくなります。'
      };
    }
  }
};

// 隠していたことが、あとで発覚する
const SCHEDULED = {
  reveal(s) {
    if (s.what === 'server') {
      return {
        kind: 'notice', id: 'reveal-server', badge: '発覚',
        title: '隠していた障害が発覚した',
        body: `顧客が、「${s.jobName}」の開発中に障害があったことに気づいた。報告がなかったことに、強い不信感を持っている。`,
        choices: [{
          label: '謝罪する', desc: '評判 -15 / 費用 -200,000', tag: 'other',
          apply() { addRep(-15); addMoney(-200000); return '深く謝罪して、お詫びを支払った。評判が15下がり、200,000の費用がかかった。'; }
        }],
        lesson: '障害は、隠していてもあとから見つかることがほとんどです。報告が遅れるほど、信頼を失います。'
      };
    }
    return {
      kind: 'notice', id: 'reveal-leak', badge: '発覚',
      title: '情報漏えいが公になった',
      body: '以前の情報漏えいの疑いが、外部の指摘で明らかになった。顧客への報告がなかったことが、大きな問題になっている。',
      choices: [{
        label: '責任をとって対応する', desc: `評判 -${s.repLoss} / 費用 -${s.moneyLoss.toLocaleString('en-US')}`, tag: 'other',
        apply() { addRep(-s.repLoss); addMoney(-s.moneyLoss); return `お詫びと補償の対応をした。評判が${s.repLoss}下がり、${s.moneyLoss.toLocaleString('en-US')}の費用がかかった。`; }
      }],
      lesson: '情報漏えいは、隠したことで被害が何倍にもなります。個人情報を扱う会社では、報告の遅れが法律上の問題になることもあります。'
    };
  }
};
