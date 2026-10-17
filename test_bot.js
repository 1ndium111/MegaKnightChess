const { MegaKnightChess, fileRankToSquare } = require('./js/engine.js');
const { SmartBot } = require('./js/ai.js');

console.log('=== Testing SmartBot AI ===\n');

const game = new MegaKnightChess();
const bot = new SmartBot('apex');

// Test 1: Opening move
const action = bot.getBestAction(game);
console.log('Bot opening action:', action.action);
if (action.action === 'move_piece') {
  console.log(`Move: ${fileRankToSquare(action.move.from.x, action.move.from.y)} -> ${fileRankToSquare(action.move.to.x, action.move.to.y)}`);
  const res = game.makeMove(action.move);
  console.log('Move executed successfully:', res.success);
}

// Test 2: Lethal Mega Knight Snipe Detection
console.log('\n--- Testing Lethal Mega Knight Snipe ---');
const lethalGame = new MegaKnightChess();
// Setup Mega Knight at (4, 5) where jump to (5, 7) crushes Black King at e8
lethalGame.megaKnights[0].vx = 4;
lethalGame.megaKnights[0].vy = 5;
const botW = new SmartBot('apex');
const lethalAction = botW.getBestAction(lethalGame);
console.log('Action chosen in lethal scenario:', lethalAction.action);
console.log('Intended jump:', lethalAction.intendedJump);
if (lethalAction.intendedJump && lethalAction.intendedJump.isLethalKingCrush) {
  console.log('✅ Bot successfully identified lethal King-crush jump to vertex (5, 7)!');
}

console.log('\n🎉 SMART BOT TESTS COMPLETED!');
