// 難易度の調整を行うための関数を定義する
const HARD_START_MONEY_RATE = 0.9;
const HARD_GOAL_MONEY_RATE = 1.1;
const HARD_GOAL_REP_RATE = 1.1;

function isHard(difficulty) {
  return difficulty === 'hard';
}

function applyRate(value, rate) {
  return Math.floor(value * rate);
}

function getStartMoney(baseMoney, difficulty) {
  return isHard(difficulty)
    ? applyRate(baseMoney, HARD_START_MONEY_RATE)
    : baseMoney;
}

function getGoalMoney(baseMoney, difficulty) {
  return isHard(difficulty)
    ? applyRate(baseMoney, HARD_GOAL_MONEY_RATE)
    : baseMoney;
}

function getGoalReputation(baseRep, difficulty) {
  return isHard(difficulty)
    ? applyRate(baseRep, HARD_GOAL_REP_RATE)
    : baseRep;
}