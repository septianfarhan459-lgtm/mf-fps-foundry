// rounds.js: round state machine - buy time, round timer, win conditions, economy.
export const ROUND_WIN_TARGET = 8;
export const BUY_TIME = 10, ROUND_TIME = 90, WIN_REWARD = 3250, LOSS_REWARD = 1400, KILL_REWARD = 300;

export function createRounds() {
  return {
    phase: 'buy',          // buy | live | over
    timer: BUY_TIME,
    round: 0,
    score: [0, 0],         // blue, orange
    roundWinner: null,
    matchOver: false,
    drawn: false,          // true when the round timed out with even alive counts
  };
}

export function startRound(r, players) {
  r.round++;
  r.phase = 'buy';
  r.timer = BUY_TIME;
  r.roundWinner = null;
  r.drawn = false;
  for (const p of players) {
    p.alive = true;
    p.health = 100;
    p.armor = 0;
    p.vel.set(0, 0, 0);
  }
}

export function updateRounds(r, dt, players, onEnd) {
  if (r.matchOver) return;
  r.timer -= dt;

  if (r.phase === 'buy' && r.timer <= 0) { r.phase = 'live'; r.timer = ROUND_TIME; }
  if (r.phase === 'live') {
    const blueAlive = players.filter((p) => p.team === 0 && p.alive).length;
    const orangeAlive = players.filter((p) => p.team === 1 && p.alive).length;
    if (blueAlive === 0 || orangeAlive === 0) {
      const winner = blueAlive === 0 ? 1 : 0;
      endRound(r, winner, players);
      onEnd && onEnd(winner);
    } else if (r.timer <= 0) {
      // time out: more players alive wins; equal counts is a DRAW - winner 0
      // (blue hosts) but `drawn` flags it so the feed can say so honestly.
      const winner = orangeAlive > blueAlive ? 1 : 0;
      r.drawn = orangeAlive === blueAlive;
      endRound(r, winner, players);
      onEnd && onEnd(winner);
    }
  }
}

function endRound(r, winner, players) {
  r.phase = 'over';
  r.timer = 4;
  r.roundWinner = winner;
  r.score[winner]++;
  for (const p of players) {
    if (p.team === winner) p.money = Math.min(16000, p.money + WIN_REWARD);
    else p.money = Math.min(16000, p.money + LOSS_REWARD);
  }
  if (r.score[0] >= ROUND_WIN_TARGET || r.score[1] >= ROUND_WIN_TARGET) r.matchOver = true;
}
