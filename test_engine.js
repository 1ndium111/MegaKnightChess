const { MegaKnightChess, PIECES, fileRankToSquare, squareToFileRank } = require('./js/engine.js');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('=== Running Mega-Knight Chess Engine Tests ===\n');

// Test 1: Initial State
const game = new MegaKnightChess();
assert(game.turn === 'w', 'Initial turn is White');
assert(game.megaKnights.length === 1, 'Initially 1 Mega Knight');
assert(game.megaKnights[0].vx === 4 && game.megaKnights[0].vy === 4, 'Mega Knight is at vertex (4, 4)');

// Check the 4 squares covered by the center Mega Knight
const mkSqs = MegaKnightChess.getMegaKnightSquares(4, 4).map(sq => fileRankToSquare(sq.x, sq.y));
assert(mkSqs.includes('d4') && mkSqs.includes('d5') && mkSqs.includes('e4') && mkSqs.includes('e5'), 
  'Mega Knight occupies d4, d5, e4, e5');

// Test 2: Obstruction
// White pawns at d2 and e2. Normally pawn at d2 can double-step to d4. But d4 is blocked by Mega Knight!
const legalMoves = game.getLegalMoves('w');
const d2d4 = legalMoves.find(m => fileRankToSquare(m.from.x, m.from.y) === 'd2' && fileRankToSquare(m.to.x, m.to.y) === 'd4');
assert(!d2d4, 'Pawn d2 cannot double-step to d4 because d4 is occupied by Mega Knight');

const d2d3 = legalMoves.find(m => fileRankToSquare(m.from.x, m.from.y) === 'd2' && fileRankToSquare(m.to.x, m.to.y) === 'd3');
assert(!!d2d3, 'Pawn d2 CAN single-step to d3');

// Knights: b1 can jump to a3 or c3
const b1c3 = legalMoves.find(m => fileRankToSquare(m.from.x, m.from.y) === 'b1' && fileRankToSquare(m.to.x, m.to.y) === 'c3');
assert(!!b1c3, 'Knight b1 can jump to c3');

// Test 3: Mega Knight Moves from Center (4, 4)
// Deltas: (±1, ±2), (±2, ±1)
// From (4, 4):
// (4+1, 4+2) = (5, 6)
// (4+1, 4-2) = (5, 2)
// (4-1, 4+2) = (3, 6)
// (4-1, 4-2) = (3, 2)
// (4+2, 4+1) = (6, 5)
// (4+2, 4-1) = (6, 3)
// (4-2, 4+1) = (2, 5)
// (4-2, 4-1) = (2, 3)
const mkMoves = game.getMegaKnightMoves(4, 4);
assert(mkMoves.length === 8, 'Mega Knight has exactly 8 legal vertex moves from center');

// Let's test crushing a piece!
// Vertex (5, 2) covers squares: (4, 1), (4, 2), (5, 1), (5, 2) -> in 0-indexed:
// file 4 = e, file 5 = f
// rank 1 = 2, rank 2 = 3
// So squares e2, e3, f2, f3!
// Square e2 has White Pawn (wP), square f2 has White Pawn (wP)!
const moveTo5_2 = mkMoves.find(m => m.toVertex.vx === 5 && m.toVertex.vy === 2);
assert(!!moveTo5_2, 'Move to vertex (5, 2) is available');
const crushedSymbols = moveTo5_2.crushedPieces.map(p => p.symbol);
console.log('Crushed pieces at (5, 2):', moveTo5_2.crushedPieces.map(p => `${p.square}:${p.symbol}`));
assert(crushedSymbols.includes('P'), 'Moving to (5, 2) will crush pawns at e2/f2');

// Execute Mega Knight move to (5, 2)
const mkMoveRes = game.moveMegaKnight(1, 5, 2);
assert(mkMoveRes.success, 'Mega Knight successfully moved to (5, 2)');
assert(game.board[4][1] === PIECES.EMPTY, 'Square e2 is now empty (crushed)');
assert(game.board[5][1] === PIECES.EMPTY, 'Square f2 is now empty (crushed)');
assert(game.megaKnights[0].vx === 5 && game.megaKnights[0].vy === 2, 'Mega Knight position updated to (5, 2)');
assert(game.turn === 'b', 'Turn passed to Black after Mega Knight move');

// Test 4: King Crush Rule (Crushmate)
console.log('\n--- Testing King Crush (Crushmate) ---');
const testGame = new MegaKnightChess();
// Move Mega Knight so that next it can crush Black King at e8 (file 4, rank 7)
// Black King at (4, 7). Squares around vertex (5, 7):
// (4, 6)=e7, (4, 7)=e8 (King!), (5, 6)=f7, (5, 7)=f8
// A jump from (3, 6) or (4, 5) or (6, 5) or (3, 8-off)?
// From vertex (3, 5): delta (+2, +2) not knight.
// From vertex (4, 5): (4+1, 5+2) = (5, 7)!
testGame.megaKnights[0].vx = 4;
testGame.megaKnights[0].vy = 5;
const crushRes = testGame.moveMegaKnight(1, 5, 7);
assert(crushRes.success, 'Mega Knight leapt onto King vertex (5, 7)');
assert(testGame.gameState === 'crushmate', 'Game ended with crushmate');
assert(testGame.winner === 'w', 'White wins because Black King was crushed');
console.log('Crushmate result:', testGame.winReason);

// Test 5: 4-Knight Mega Knight Summon
console.log('\n--- Testing 4-Knights Instant Mega Knight Summon ---');
const summonGame = new MegaKnightChess();
// Place 4 knights around vertex (2, 3):
// squares (1, 2)=b3, (1, 3)=b4, (2, 2)=c3, (2, 3)=c4
summonGame.board[1][2] = PIECES.wN;
summonGame.board[1][3] = PIECES.bN;
summonGame.board[2][2] = PIECES.wN;
// Now make White move knight from b1 to c3? Or simulate a move that puts 4th knight on c4
summonGame.board[2][3] = PIECES.EMPTY;
assert(summonGame.megaKnights.length === 1, '1 Mega Knight before 4th knight');

// Now place 4th knight and trigger check
summonGame.board[2][3] = PIECES.bN;
const summoned = summonGame.checkAndTriggerKnightSummon();
assert(!!summoned && summoned.length === 1, 'Summon triggered!');
assert(summonGame.megaKnights.length === 2, 'Now 2 Mega Knights on board!');
assert(summonGame.megaKnights[1].vx === 2 && summonGame.megaKnights[1].vy === 3, 'New Mega Knight is at vertex (2, 3)');
assert(summonGame.board[1][2] === PIECES.EMPTY, 'Knight at b3 was consumed in summon');
assert(summonGame.board[1][3] === PIECES.EMPTY, 'Knight at b4 was consumed in summon');
assert(summonGame.board[2][2] === PIECES.EMPTY, 'Knight at c3 was consumed in summon');
assert(summonGame.board[2][3] === PIECES.EMPTY, 'Knight at c4 was consumed in summon');

console.log('\n🎉 ALL ENGINE TESTS PASSED PERFECTLY!\n');
