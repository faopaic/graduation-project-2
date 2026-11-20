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
const EMPLOYEE_SEVERANCE_MONTHS = 3;
const EMPLOYEE_FIRE_REPUTATION_PENALTY = 20;
const EMPLOYEE_START_MORALE = 70;
const EMPLOYEE_LOW_MORALE_THRESHOLD = 60;
const EMPLOYEE_RESIGN_MORALE_THRESHOLD = 20;

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

const FIXED_MISSIONS = [
  { id: 'first-accept', tier: '初級', label: '最初の案件を受注する', conditionType: 'accepted', target: 1, rewardType: 'exp', rewardAmount: 5 },
  { id: 'first-complete', tier: '初級', label: '案件を1つ完成させる', conditionType: 'done', target: 1, rewardType: 'exp', rewardAmount: 5 },
  { id: 'first-hire', tier: '初級', label: '社員を1人採用する', conditionType: 'hired', target: 1, rewardType: 'exp', rewardAmount: 5 },
  { id: 'first-incident', tier: '初級', label: '障害に対応する', conditionType: 'handled', target: 1, rewardType: 'exp', rewardAmount: 5 },
  { id: 'level-two', tier: '初級', label: '会社Lv.2に成長する', conditionType: 'level', target: 2, rewardType: 'exp', rewardAmount: 5 },

  { id: 'mid-accept-seven', tier: '中級', label: '案件を7件受注する', conditionType: 'accepted', target: 7, rewardType: 'exp', rewardAmount: 20 },
  { id: 'mid-invest-seven', tier: '中級', label: '投資を7回行う', conditionType: 'invest_total', target: 7, rewardType: 'exp', rewardAmount: 20 },
  { id: 'mid-staff-eight', tier: '中級', label: '社員を8人に増やす', conditionType: 'employees', target: 8, rewardType: 'exp', rewardAmount: 20 },
  { id: 'mid-success-seven', tier: '中級', label: '案件を7件成功させる', conditionType: 'successes', target: 7, rewardType: 'exp', rewardAmount: 20 },

  { id: 'high-level-five', tier: '上級', label: '会社Lv.5に成長する', conditionType: 'level', target: 5, rewardType: 'money', rewardAmount: 2000000 },
  { id: 'high-staff-ten', tier: '上級', label: '社員を10人に増やす', conditionType: 'employees', target: 10, rewardType: 'money', rewardAmount: 2000000 },
  { id: 'high-success-ten', tier: '上級', label: '案件を10件成功させる', conditionType: 'successes', target: 10, rewardType: 'money', rewardAmount: 3000000 },
  { id: 'high-big-success-three', tier: '上級', label: '大規模案件を3件成功させる', conditionType: 'big', target: 3, rewardType: 'money', rewardAmount: 5000000 }
];

// 会社のレベル。slots = 社員枠、jobs = 同時に受注できる案件数
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
    help: 'サーバー障害の発生を抑え、発生時に失われる作業量を軽減します。',
    now: (lv) => lv === 0 ? '未導入' : `障害発生率 -${25 * lv}% / 発生時の進捗損失 ${BACKUP_LOSS[lv] * 100}%`
  },
  security: {
    name: 'セキュリティ対策',
    costs: [300000, 600000, 1000000],
    help: '情報漏えいの発生を抑え、発生時の対応費用を軽減します。',
    now: (lv) => lv === 0 ? '未導入' : `情報漏えい発生率 -${30 * lv}% / 対応費用 -${20 * lv}%`
  },
  qa: {
    name: '品質管理（テスト環境）',
    costs: [250000, 500000, 800000],
    help: '業務ミスの発生を抑え、案件完成時の品質を高めます。',
    now: (lv) => lv === 0 ? '未導入' : `業務ミス発生率 -${25 * lv}% / 完成時の品質 +${5 * lv}点`
  },
  recruitContract: {
    name: '人材紹介会社との特別契約',
    repCost: 15,
    maxCount: 3,
    help: '次回の採用で、指定した職種の候補者だけを紹介してもらう。',
    now: (used, active, jobType) => {
      if (active) {
        return `紹介待ち：${SKILLS[jobType] || jobType}`;
      }
      return `利用済み ${used}/3回`;
    }
  }
};
