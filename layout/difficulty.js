// 難易度の調整を行うための関数を定義する

// difficulty.js

export const DIFFICULTY = {
  NORMAL: "normal",
  HARD: "hard"
};

function getRates(difficulty) {
  switch (difficulty) {
    case DIFFICULTY.HARD:
      return {
        startMoney: 0.9,
        goalMoney: 1.1,
        goalReputation: 1.1
      };
    default:
      return {
        startMoney: 1.0,
        goalMoney: 1.0,
        goalReputation: 1.0
      };
  }
}

export function getStartMoney(baseMoney, difficulty) {
  const rates = getRates(difficulty);
  return Math.floor(baseMoney * rates.startMoney);
}

export function getGoalMoney(baseMoney, difficulty) {
  const rates = getRates(difficulty);
  return Math.floor(baseMoney * rates.goalMoney);
}

export function getGoalReputation(baseReputation, difficulty) {
  const rates = getRates(difficulty);
  return Math.floor(baseReputation * rates.goalReputation);
}