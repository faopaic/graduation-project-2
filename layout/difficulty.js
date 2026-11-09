// 難易度の調整を行うための関数を定義する

const DIFFICULTY = {
  normal: {startMoneyRate: 1,goalMoneyRate: 1,goalRepRate: 1},
  hard: {startMoneyRate: 0.9,goalMoneyRate: 1.1,goalRepRate: 1.1},
  expert: {startMoneyRate: 0.8,goalMoneyRate: 1.25,goalRepRate: 1.25}
};

function getDifficultyConfig(difficulty) {
  return DIFFICULTY[difficulty] || DIFFICULTY.normal;
}

function applyRate(value, rate) {
  return Math.floor(value * rate);
}

function getStartMoney(baseMoney, difficulty) {
  const config = getDifficultyConfig(difficulty);
  return applyRate(baseMoney, config.startMoneyRate);
}

function getGoalMoney(baseMoney, difficulty) {
  const config = getDifficultyConfig(difficulty);
  return applyRate(baseMoney, config.goalMoneyRate);
}

function getGoalReputation(baseRep, difficulty) {
  const config = getDifficultyConfig(difficulty);
  return applyRate(baseRep, config.goalRepRate);
}