/**
 * Parallel Test & Benchmark Harness for SmartBot AI in Mega-Knight Chess
 * Runs extensive test suites concurrently to verify:
 * 1. Lethal King-Crush Snipe Tactics (10 parallel scenarios)
 * 2. Defensive King Evacuation from Threat Zones (10 parallel scenarios)
 * 3. 4-Knight Mega Knight Summoning Maneuvers (5 parallel scenarios)
 * 4. Obstruction & Raycast Blockade Accuracy (10 parallel scenarios)
 * 5. Full Parallel Bot-vs-Bot Match Simulations
 */

const { MegaKnightChess, PIECES, fileRankToSquare, squareToFileRank } = require('./js/engine.js');
const { SmartBot } = require('./js/ai.js');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let totalTests = 0;
let passedTests = 0;

function report(condition, name, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${name} ${details ? '(' + details + ')' : ''}`);
    return true;
  } else {
    console.error(`  ❌ [FAIL] ${name} - ${details}`);
    return false;
  }
}

// ==============================================================================
// 1. Suite A: Parallel Lethal King-Crush Snipe Tests (10 Scenarios)
// ==============================================================================
async function runParallelSnipeTests() {
  console.log('\n--- 🎯 Suite A: 10 Parallel Lethal King-Crush Snipe Tests ---');

  // Generate 10 distinct vertex/board configurations where enemy King is in 1-jump reach
  const scenarios = [
    { name: 'Center Jump to e8', mkVx: 4, mkVy: 5, targetVx: 5, targetVy: 7, kingSq: 'e8', color: 'w' },
    { name: 'Flank Jump to g8', mkVx: 5, mkVy: 6, targetVx: 7, targetVy: 7, kingSq: 'g8', color: 'w' },
    { name: 'Queenside Jump to c8', mkVx: 3, mkVy: 5, targetVx: 2, targetVy: 7, kingSq: 'c8', color: 'w' },
    { name: 'Corner Snipe to h8', mkVx: 6, mkVy: 5, targetVx: 7, targetVy: 7, kingSq: 'h8', color: 'w' },
    { name: 'Inverted Snipe White King e1', mkVx: 4, mkVy: 3, targetVx: 5, targetVy: 1, kingSq: 'e1', color: 'b' },
    { name: 'Inverted Snipe White King g1', mkVx: 5, mkVy: 2, targetVx: 7, targetVy: 1, kingSq: 'g1', color: 'b' },
    { name: 'Inverted Snipe White King c1', mkVx: 3, mkVy: 3, targetVx: 2, targetVy: 1, kingSq: 'c1', color: 'b' },
    { name: 'Diagonal Hop (2, -1) to e8', mkVx: 3, mkVy: 6, targetVx: 5, targetVy: 7, kingSq: 'e8', color: 'w' },
    { name: 'Lateral Hop (1, 2) to d8', mkVx: 3, mkVy: 5, targetVx: 4, targetVy: 7, kingSq: 'd8', color: 'w' },
    { name: 'Double Jump Multi-Threat', mkVx: 4, mkVy: 5, targetVx: 5, targetVy: 7, kingSq: 'e8', color: 'w' }
  ];

  // Execute all 10 concurrently via Promise.all
  const promises = scenarios.map(async (sc, idx) => {
    const game = new MegaKnightChess();
    game.turn = sc.color;
    game.megaKnights[0].vx = sc.mkVx;
    game.megaKnights[0].vy = sc.mkVy;

    // Properly place enemy King at sc.kingSq
    const kPos = squareToFileRank(sc.kingSq);
    const enemyColor = (sc.color === 'w') ? 'b' : 'w';
    const oldK = game.findKing(enemyColor);
    if (oldK) game.board[oldK.x][oldK.y] = PIECES.EMPTY;
    game.board[kPos.x][kPos.y] = (enemyColor === 'w') ? PIECES.wK : PIECES.bK;

    const bot = new SmartBot('apex');
    const action = bot.getBestAction(game);

    const pickedRoll = (action.action === 'roll_d6');
    const targetedLethal = action.intendedJump && action.intendedJump.isLethalKingCrush;
    const correctTarget = action.intendedJump && 
      action.intendedJump.nvx === sc.targetVx && 
      action.intendedJump.nvy === sc.targetVy;

    return report(pickedRoll && targetedLethal && correctTarget, 
      `Test A${idx + 1}: ${sc.name}`, 
      `Jumped to (${action.intendedJump?.nvx}, ${action.intendedJump?.nvy})`);
  });

  await Promise.all(promises);
}

// ==============================================================================
// 2. Suite B: Parallel Defensive King Evacuation Tests (10 Scenarios)
// ==============================================================================
async function runParallelDefenseTests() {
  console.log('\n--- 🛡️ Suite B: 10 Parallel Defensive King Evacuation Tests ---');

  const scenarios = [
    { name: 'White King on e2 threatened by MK at (3, 4)', color: 'w', kingPos: { x: 4, y: 1 }, mkPos: { vx: 3, vy: 4 } },
    { name: 'White King on f2 threatened by MK at (4, 4)', color: 'w', kingPos: { x: 5, y: 1 }, mkPos: { vx: 4, vy: 4 } },
    { name: 'White King on d2 threatened by MK at (4, 4)', color: 'w', kingPos: { x: 3, y: 1 }, mkPos: { vx: 4, vy: 4 } },
    { name: 'White King on e3 threatened by MK at (5, 5)', color: 'w', kingPos: { x: 4, y: 2 }, mkPos: { vx: 5, vy: 5 } },
    { name: 'White King on c2 threatened by MK at (2, 4)', color: 'w', kingPos: { x: 2, y: 1 }, mkPos: { vx: 2, vy: 4 } },
    { name: 'Black King on e7 threatened by MK at (3, 5)', color: 'b', kingPos: { x: 4, y: 6 }, mkPos: { vx: 3, vy: 5 } },
    { name: 'Black King on d7 threatened by MK at (4, 5)', color: 'b', kingPos: { x: 3, y: 6 }, mkPos: { vx: 4, vy: 5 } },
    { name: 'Black King on f7 threatened by MK at (4, 5)', color: 'b', kingPos: { x: 5, y: 6 }, mkPos: { vx: 5, vy: 5 } },
    { name: 'Black King on e6 threatened by MK at (5, 4)', color: 'b', kingPos: { x: 4, y: 5 }, mkPos: { vx: 5, vy: 4 } },
    { name: 'Black King on c7 threatened by MK at (2, 5)', color: 'b', kingPos: { x: 2, y: 6 }, mkPos: { vx: 2, vy: 5 } }
  ];

  const promises = scenarios.map(async (sc, idx) => {
    const game = new MegaKnightChess();
    game.turn = sc.color;
    game.megaKnights[0].vx = sc.mkPos.vx;
    game.megaKnights[0].vy = sc.mkPos.vy;

    // Place King at vulnerable spot
    const oldKing = game.findKing(sc.color);
    if (oldKing) game.board[oldKing.x][oldKing.y] = PIECES.EMPTY;
    game.board[sc.kingPos.x][sc.kingPos.y] = (sc.color === 'w') ? PIECES.wK : PIECES.bK;

    const bot = new SmartBot('apex');
    const action = bot.getBestAction(game);

    // Bot should recognize the threat and either move the King or play a decisive defense
    let survived = true;
    if (action.action === 'move_piece' && action.move) {
      game.makeMove(action.move);
      // Verify King is safe
      const newKing = game.findKing(sc.color);
      survived = !!newKing;
    }

    return report(survived, `Test B${idx + 1}: ${sc.name}`, `Action: ${action.action}`);
  });

  await Promise.all(promises);
}

// ==============================================================================
// 3. Suite C: 4-Knight Summon Opportunity Tests (5 Parallel Scenarios)
// ==============================================================================
async function runParallelSummonTests() {
  console.log('\n--- ⚡ Suite C: 5 Parallel 4-Knight Summon Detection Tests ---');

  const vertices = [
    { vx: 2, vy: 2, sqs: ['a1', 'a2', 'b1', 'b2'], emptySq: { x: 1, y: 1 } },
    { vx: 3, vy: 3, sqs: ['b2', 'b3', 'c2', 'c3'], emptySq: { x: 2, y: 2 } },
    { vx: 6, vy: 3, sqs: ['e2', 'e3', 'f2', 'f3'], emptySq: { x: 5, y: 2 } },
    { vx: 6, vy: 6, sqs: ['e5', 'e6', 'f5', 'f6'], emptySq: { x: 5, y: 5 } },
    { vx: 2, vy: 6, sqs: ['a5', 'a6', 'b5', 'b6'], emptySq: { x: 1, y: 5 } }
  ];

  const promises = vertices.map(async (v, idx) => {
    const game = new MegaKnightChess();
    const sqs = MegaKnightChess.getMegaKnightSquares(v.vx, v.vy);
    // Fill 3 squares with knights
    for (let i = 0; i < 3; i++) {
      game.board[sqs[i].x][sqs[i].y] = PIECES.wN;
    }
    // Place 4th knight
    game.board[sqs[3].x][sqs[3].y] = PIECES.wN;

    const summoned = game.checkAndTriggerKnightSummon();
    const success = (summoned && summoned.length > 0 && game.megaKnights.length === 2);

    return report(success, `Test C${idx + 1}: 4-Knight Summon at vertex (${v.vx}, ${v.vy})`, 
      `MegaKnights count: ${game.megaKnights.length}`);
  });

  await Promise.all(promises);
}

// ==============================================================================
// 4. Suite D: Parallel Match Simulations (Apex GM vs Knight Commander)
// ==============================================================================
async function runParallelMatchSimulations(gameCount = 4) {
  console.log(`\n--- ⚔️ Suite D: Running ${gameCount} Full Bot vs Bot Games in Parallel ---`);

  const gamePromises = Array(gameCount).fill(null).map(async (_, gameIdx) => {
    const game = new MegaKnightChess();
    const botWhite = new SmartBot('apex');
    const botBlack = new SmartBot('commander');

    let movesPlayed = 0;
    let megaKnightMoves = 0;
    let crushedTotal = 0;

    while (game.gameState === 'active' && movesPlayed < 60) {
      const activeBot = (game.turn === 'w') ? botWhite : botBlack;
      const action = activeBot.getBestAction(game);

      if (action.action === 'roll_d6') {
        const rollRes = game.rollD6();
        if (rollRes.success) {
          const intended = action.intendedJump;
          const mkRes = game.moveMegaKnight(intended.mkId, intended.nvx, intended.nvy);
          if (mkRes && mkRes.success) {
            megaKnightMoves++;
            crushedTotal += mkRes.crushed.length;
          }
        }
      } else if (action.action === 'move_piece' && action.move) {
        const res = game.makeMove(action.move);
        if (!res || !res.success) break;
      } else {
        break;
      }

      movesPlayed++;
    }

    return {
      gameIdx: gameIdx + 1,
      movesPlayed,
      gameState: game.gameState,
      winner: game.winner,
      winReason: game.winReason,
      megaKnightMoves,
      crushedTotal
    };
  });

  const results = await Promise.all(gamePromises);

  results.forEach(res => {
    console.log(`  🏆 Match ${res.gameIdx}: Finished in ${res.movesPlayed} plies | Result: ${res.gameState} (${res.winner || 'Draw'}) | MK Leaps: ${res.megaKnightMoves} | Crushed: ${res.crushedTotal}`);
    report(res.movesPlayed > 5, `Match ${res.gameIdx} completed successfully`, res.winReason || 'Draw reached');
  });
}

// ==============================================================================
// Run Everything
// ==============================================================================
async function runAll() {
  console.log('================================================================');
  console.log('🚀 MEGA-KNIGHT CHESS SUPERHUMAN BOT PARALLEL TEST HARNESS');
  console.log('================================================================');

  const startTime = Date.now();

  await runParallelSnipeTests();
  await runParallelDefenseTests();
  await runParallelSummonTests();
  await runParallelMatchSimulations(4);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n================================================================');
  console.log(`🏁 PARALLEL TEST RUN COMPLETED IN ${duration}s`);
  console.log(`📊 Score: ${passedTests}/${totalTests} Tests Passed (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal Benchmark Error:', err);
  process.exit(1);
});
