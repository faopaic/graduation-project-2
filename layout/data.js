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
  goals: { money: 70000000, rep: 100, big: 3 },   // クリア条件
  incidentGap: [35, 60],    // 障害が起きる間隔(日)
  firstIncidentDay: 12,      // 最初の障害は、案件があればこの日以降に起きる
};

const DEFAULT_SALES_SKILL = 50;
const SALES_BASE_SUCCESS_RATE = 30;
const SALES_SKILL_REFERENCE = 50;
const SALES_SKILL_RATE_PER_POINT = 1.1;
const DEFAULT_EMPLOYEE_STATS = {
  design: 50,
  development: 50,
  security: 50,
  operations: 50
};
const EMPLOYEE_STAT_LABELS = {
  design: '設計力',
  development: '開発力',
  security: 'セキュリティ力',
  operations: '運用保守力'
};
const EMPLOYEE_SPECIALTY_STATS = {
  design: 'design',
  dev: 'development',
  test: 'operations',
  infra: 'operations',
  security: 'security'
};
const EMPLOYEE_STAT_UPGRADE_AMOUNT = 15;
const EMPLOYEE_OTHER_STAT_UPGRADE_AMOUNT = 5;
const EMPLOYEE_OTHER_STAT_UPGRADE_CHANCE = 0.2;
const EMPLOYEE_STAT_UPGRADE_COST = 250000;
const EMPLOYEE_STAT_UPGRADE_RATE_POINTS = [
  { stat: 0, rate: 0.2 },
  { stat: 20, rate: 0.7 },
  { stat: 50, rate: 0.6 },
  { stat: 100, rate: 0.2 }
];

const SKILLS = {
  design: '設計',
  dev: '開発',
  test: 'テスト',
  infra: 'テスト',
  security: 'セキュリティ',
  sales: '営業'
};

const SKILL_HELP = {
  design: '画面や仕組みを考える人',
  dev: 'プログラムを作る人',
  test: 'バグを見つける人',
  infra: 'テストや運用保守を担当する人',
  security: '情報漏えいを防ぐ人',
  sales: '案件を獲得する人'
};

const SALARY = { 1: 220000, 2: 300000, 3: 400000 };   // レベル別の月給

let MISSIONS = [];

// 会社のレベル。slots = 社員の席の数、jobs = 同時に受けられる案件の数
const LEVELS = [
  { lv: 1, slots: 5, jobs: 2 },
  { lv: 2, slots: 7, jobs: 3, needSuccess: 2, needExp: 20 },
  { lv: 3, slots: 9, jobs: 4, needSuccess: 5, needExp: 80 },
  { lv: 4, slots: 11, jobs: 5, needSuccess: 8, needExp: 140 },
  { lv: 5, slots: 13, jobs: 6, needSuccess: 12, needExp: 220 }
];

// 投資。costs = レベルごとの費用
const BACKUP_LOSS = [0.10, 0.06, 0.03, 0.01];
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
