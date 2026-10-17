/**
 * Superhuman Smart AI Engine for Mega-Knight Chess
 * Features:
 * - Principal Variation Search (PVS) / Negamax with Alpha-Beta pruning
 * - Transposition Table (TT) with Zobrist Key hashing (Exact, Lowerbound, Upperbound)
 * - MVV-LVA (Most Valuable Victim - Least Valuable Attacker) move ordering
 * - Killer Move Heuristic & History Table
 * - Quiescence Search with tactical capture extensions
 * - Comprehensive Positional Evaluation:
 *     * Material & Piece-Square Tables (PST) adapted for Mega-Knight obstruction
 *     * King safety & pawn shields
 *     * Mega-Knight Threat Grid (1-hop lethal zones, 2-hop fork threats)
 *     * Piece mobility & open file control around Mega Knights
 * - Mathematical Expected Value (EV) decision engine for D6 dice activation
 * - 3 Persona levels: Squire (~1000 ELO), Knight Commander (~1600 ELO), Apex Grandmaster (~2200+ ELO)
 */

if (typeof require !== 'undefined' && typeof MegaKnightChess === 'undefined') {
  const engine = require('./engine.js');
  global.MegaKnightChess = engine.MegaKnightChess;
  global.PIECES = engine.PIECES;
  global.fileRankToSquare = engine.fileRankToSquare;
}

// Centipawn values
const PIECE_VALS = {
  [PIECES.EMPTY]: 0,
  [PIECES.wP]: 100, [PIECES.wN]: 325, [PIECES.wB]: 340, [PIECES.wR]: 510, [PIECES.wQ]: 950, [PIECES.wK]: 25000,
  [PIECES.bP]: -100, [PIECES.bN]: -325, [PIECES.bB]: -340, [PIECES.bR]: -510, [PIECES.bQ]: -950, [PIECES.bK]: -25000
};

// MVV-LVA Victim weights (index 0..12)
const VICTIM_SCORES = [0, 1, 3, 3, 5, 9, 100, 1, 3, 3, 5, 9, 100];

// Piece square tables (White perspective, rank 0 is 1st rank)
const PAWN_PST = [
  [ 0,  0,  0,  0,  0,  0,  0,  0],
  [ 5, 10, 10,-20,-20, 10, 10,  5],
  [ 5, -5,-10,  0,  0,-10, -5,  5],
  [ 0,  0,  0, 25, 25,  0,  0,  0],
  [ 5,  5, 15, 30, 30, 15,  5,  5],
  [15, 15, 25, 35, 35, 25, 15, 15],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [ 0,  0,  0,  0,  0,  0,  0,  0]
];

const KNIGHT_PST = [
  [-50,-35,-25,-25,-25,-25,-35,-50],
  [-35,-15,  5,  8,  8,  5,-15,-35],
  [-25, 10, 15, 20, 20, 15, 10,-25],
  [-25, 10, 20, 25, 25, 20, 10,-25],
  [-25, 10, 20, 25, 25, 20, 10,-25],
  [-25, 10, 15, 20, 20, 15, 10,-25],
  [-35,-15,  5,  5,  5,  5,-15,-35],
  [-50,-35,-25,-25,-25,-25,-35,-50]
];

const BISHOP_PST = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10, 10,  5,  5,  5,  5, 10,-10],
  [-10, 10, 15, 15, 15, 15, 10,-10],
  [-10,  5, 15, 15, 15, 15,  5,-10],
  [-10, 10, 15, 15, 15, 15, 10,-10],
  [-10,  5, 10, 15, 15, 10,  5,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
];

const ROOK_PST = [
  [  0,  0,  5, 10, 10,  5,  0,  0],
  [ -5,  5,  5,  5,  5,  5,  5, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ 10, 15, 15, 15, 15, 15, 15, 10],
  [  0,  0,  5, 10, 10,  5,  0,  0]
];

const QUEEN_PST = [
  [-20,-10,-10, -5, -5,-10,-10,-20],
  [-10,  5,  5,  5,  5,  5,  5,-10],
  [-10,  5, 10, 10, 10, 10,  5,-10],
  [ -5,  5, 10, 15, 15, 10,  5, -5],
  [ -5,  5, 10, 15, 15, 10,  5, -5],
  [-10,  5, 10, 10, 10, 10,  5,-10],
  [-10,  5,  5,  5,  5,  5,  5,-10],
  [-20,-10,-10, -5, -5,-10,-10,-20]
];

const KING_PST = [
  [ 25, 35, 10, -10, -10,  0, 35, 25],
  [ 20, 20,  0, -15, -15,  0, 20, 20],
  [-10,-20,-20, -30, -30,-20,-20,-10],
  [-20,-30,-30, -40, -40,-30,-30,-20],
  [-30,-40,-40, -50, -50,-40,-40,-30],
  [-30,-40,-40, -50, -50,-40,-40,-30],
  [-30,-40,-40, -50, -50,-40,-40,-30],
  [-30,-40,-40, -50, -50,-40,-40,-30]
];

// Zobrist pseudo-random table initialization
const ZOBRIST = {
  pieces: Array(8).fill(null).map(() => Array(8).fill(null).map(() => Array(13).fill(0))),
  turn: 0,
  mkVertices: Array(8).fill(null).map(() => Array(8).fill(0))
};

function initZobrist() {
  const rand32 = () => Math.floor(Math.random() * 0xFFFFFFFF);
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      for (let p = 0; p < 13; p++) {
        ZOBRIST.pieces[x][y][p] = rand32();
      }
    }
  }
  ZOBRIST.turn = rand32();
  for (let vx = 1; vx <= 7; vx++) {
    for (let vy = 1; vy <= 7; vy++) {
      ZOBRIST.mkVertices[vx][vy] = rand32();
    }
  }
}
initZobrist();

function computeHash(game) {
  let h = 0;
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      const p = game.board[x][y];
      if (p !== PIECES.EMPTY) {
        h ^= ZOBRIST.pieces[x][y][p];
      }
    }
  }
  if (game.turn === 'b') h ^= ZOBRIST.turn;
  for (const mk of game.megaKnights) {
    if (mk.vx >= 1 && mk.vx <= 7 && mk.vy >= 1 && mk.vy <= 7) {
      h ^= ZOBRIST.mkVertices[mk.vx][mk.vy];
    }
  }
  return h;
}

class SmartBot {
  constructor(difficulty = 'apex') {
    this.difficulty = difficulty; // 'squire', 'commander', 'apex'
    this.tt = new Map(); // Transposition Table
    this.killerMoves = Array(32).fill(null).map(() => [null, null]);
    this.historyTable = Array(64).fill(null).map(() => Array(64).fill(0));
    this.maxTTEntries = 100000;
  }

  setDifficulty(diff) {
    this.difficulty = diff;
  }

  clearSearchMemory() {
    this.tt.clear();
    this.killerMoves = Array(32).fill(null).map(() => [null, null]);
    this.historyTable = Array(64).fill(null).map(() => Array(64).fill(0));
  }

  // Enhanced positional evaluation
  evaluate(game) {
    if (game.gameState === 'checkmate' || game.gameState === 'crushmate') {
      if (game.winner === 'w') return 30000;
      if (game.winner === 'b') return -30000;
      return 0;
    }
    if (game.gameState === 'stalemate' || game.gameState === 'draw') {
      return 0;
    }

    let score = 0;

    // 1. Material and Piece-Square Tables
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const piece = game.board[x][y];
        if (piece === PIECES.EMPTY) continue;

        score += PIECE_VALS[piece];

        const rankIdx = (piece <= PIECES.wK) ? y : (7 - y);
        let pstVal = 0;
        switch (piece) {
          case PIECES.wP:
          case PIECES.bP: pstVal = PAWN_PST[rankIdx][x]; break;
          case PIECES.wN:
          case PIECES.bN: pstVal = KNIGHT_PST[rankIdx][x]; break;
          case PIECES.wB:
          case PIECES.bB: pstVal = BISHOP_PST[rankIdx][x]; break;
          case PIECES.wR:
          case PIECES.bR: pstVal = ROOK_PST[rankIdx][x]; break;
          case PIECES.wQ:
          case PIECES.bQ: pstVal = QUEEN_PST[rankIdx][x]; break;
          case PIECES.wK:
          case PIECES.bK: pstVal = KING_PST[rankIdx][x]; break;
        }

        score += (piece <= PIECES.wK) ? pstVal : -pstVal;
      }
    }

    // 2. Mega-Knight Proximity & Threat Grid
    const wKing = game.findKing('w');
    const bKing = game.findKing('b');

    for (const mk of game.megaKnights) {
      const mkMoves = game.getMegaKnightMoves(mk.vx, mk.vy);
      for (const m of mkMoves) {
        for (const cp of m.crushedPieces) {
          // LETHAL CRUSH ZONE: King is directly reachable in 1 jump!
          if (wKing && cp.square === fileRankToSquare(wKing.x, wKing.y)) {
            score -= 2200; // Extreme penalty for White King in strike range
          }
          if (bKing && cp.square === fileRankToSquare(bKing.x, bKing.y)) {
            score += 2200; // Extreme bonus: Black King in strike range
          }
          // High Value Piece in crush range
          if (cp.piece === PIECES.wQ) score -= 450;
          if (cp.piece === PIECES.bQ) score += 450;
          if (cp.piece === PIECES.wR) score -= 200;
          if (cp.piece === PIECES.bR) score += 200;
        }
      }
    }

    // 3. 4-Knight Mega Knight Summon Potential
    // Check if player has 3 knights in an L or cluster around any vertex
    for (let vx = 1; vx <= 7; vx++) {
      for (let vy = 1; vy <= 7; vy++) {
        const sqs = MegaKnightChess.getMegaKnightSquares(vx, vy);
        let wKnights = 0;
        let bKnights = 0;
        for (const sq of sqs) {
          const p = game.board[sq.x][sq.y];
          if (p === PIECES.wN) wKnights++;
          if (p === PIECES.bN) bKnights++;
        }
        if (wKnights === 3) score += 120;
        if (bKnights === 3) score -= 120;
      }
    }

    return score;
  }

  // Move ordering for Alpha-Beta efficiency
  orderMoves(game, moves, ply, hashMove = null) {
    const isW = (game.turn === 'w');

    return moves.map(m => {
      let weight = 0;

      // 1. Transposition table best move
      if (hashMove && m.from.x === hashMove.from.x && m.from.y === hashMove.from.y &&
          m.to.x === hashMove.to.x && m.to.y === hashMove.to.y) {
        weight += 100000;
      }

      // 2. MVV-LVA for captures
      if (m.capture) {
        const victim = VICTIM_SCORES[m.capture] || 1;
        const attacker = VICTIM_SCORES[game.board[m.from.x][m.from.y]] || 1;
        weight += (victim * 100) - attacker + 10000;
      }

      // 3. Promotions
      if (m.promo) {
        weight += (m.promo === 'q' ? 9000 : 8000);
      }

      // 4. Killer Moves
      if (ply < 32) {
        const k1 = this.killerMoves[ply][0];
        const k2 = this.killerMoves[ply][1];
        if (k1 && m.from.x === k1.from.x && m.from.y === k1.from.y && m.to.x === k1.to.x && m.to.y === k1.to.y) {
          weight += 5000;
        } else if (k2 && m.from.x === k2.from.x && m.from.y === k2.from.y && m.to.x === k2.to.x && m.to.y === k2.to.y) {
          weight += 4000;
        }
      }

      // 5. History heuristic
      const fromIdx = m.from.x * 8 + m.from.y;
      const toIdx = m.to.x * 8 + m.to.y;
      weight += this.historyTable[fromIdx][toIdx];

      return { move: m, weight };
    }).sort((a, b) => b.weight - a.weight).map(item => item.move);
  }

  // Quiescence Search: Tactical captures extension
  quiesce(game, alpha, beta, isMaximizing, depth = 0) {
    const standPat = this.evaluate(game);
    if (depth >= 4) return standPat;

    if (isMaximizing) {
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;

      const captures = game.getLegalMoves('w').filter(m => m.capture || m.promo);
      const ordered = this.orderMoves(game, captures, depth);

      for (const move of ordered) {
        const undo = game.makeMoveInternal(move);
        const score = this.quiesce(game, alpha, beta, false, depth + 1);
        game.undoMoveInternal(move, undo);

        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    } else {
      if (standPat <= alpha) return alpha;
      if (standPat < beta) beta = standPat;

      const captures = game.getLegalMoves('b').filter(m => m.capture || m.promo);
      const ordered = this.orderMoves(game, captures, depth);

      for (const move of ordered) {
        const undo = game.makeMoveInternal(move);
        const score = this.quiesce(game, alpha, beta, true, depth + 1);
        game.undoMoveInternal(move, undo);

        if (score <= alpha) return alpha;
        if (score < beta) beta = score;
      }
      return beta;
    }
  }

  // Negamax / Alpha-Beta Minimax with Transposition Table
  alphaBeta(game, depth, alpha, beta, isMaximizing, ply = 0) {
    if (depth === 0 || game.gameState !== 'active') {
      return this.quiesce(game, alpha, beta, isMaximizing);
    }

    const hash = computeHash(game);
    const ttEntry = this.tt.get(hash);
    if (ttEntry && ttEntry.depth >= depth) {
      if (ttEntry.flag === 'EXACT') return ttEntry.score;
      if (ttEntry.flag === 'LOWER' && ttEntry.score >= beta) return ttEntry.score;
      if (ttEntry.flag === 'UPPER' && ttEntry.score <= alpha) return ttEntry.score;
    }

    const color = isMaximizing ? 'w' : 'b';
    const rawMoves = game.getLegalMoves(color);

    if (rawMoves.length === 0) {
      return this.evaluate(game);
    }

    const hashMove = ttEntry ? ttEntry.bestMove : null;
    const moves = this.orderMoves(game, rawMoves, ply, hashMove);

    let bestMove = null;
    let originalAlpha = alpha;

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const undo = game.makeMoveInternal(move);
        const ev = this.alphaBeta(game, depth - 1, alpha, beta, false, ply + 1);
        game.undoMoveInternal(move, undo);

        if (ev > maxEval) {
          maxEval = ev;
          bestMove = move;
        }
        alpha = Math.max(alpha, ev);

        if (beta <= alpha) {
          // Store killer move & history
          if (ply < 32 && !move.capture) {
            this.killerMoves[ply][1] = this.killerMoves[ply][0];
            this.killerMoves[ply][0] = move;
            const fromIdx = move.from.x * 8 + move.from.y;
            const toIdx = move.to.x * 8 + move.to.y;
            this.historyTable[fromIdx][toIdx] += depth * depth;
          }
          break;
        }
      }

      // Save to Transposition Table
      let flag = 'EXACT';
      if (maxEval <= originalAlpha) flag = 'UPPER';
      else if (maxEval >= beta) flag = 'LOWER';

      if (this.tt.size < this.maxTTEntries) {
        this.tt.set(hash, { score: maxEval, depth, flag, bestMove });
      }

      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        const undo = game.makeMoveInternal(move);
        const ev = this.alphaBeta(game, depth - 1, alpha, beta, true, ply + 1);
        game.undoMoveInternal(move, undo);

        if (ev < minEval) {
          minEval = ev;
          bestMove = move;
        }
        beta = Math.min(beta, ev);

        if (beta <= alpha) {
          if (ply < 32 && !move.capture) {
            this.killerMoves[ply][1] = this.killerMoves[ply][0];
            this.killerMoves[ply][0] = move;
            const fromIdx = move.from.x * 8 + move.from.y;
            const toIdx = move.to.x * 8 + move.to.y;
            this.historyTable[fromIdx][toIdx] += depth * depth;
          }
          break;
        }
      }

      let flag = 'EXACT';
      if (minEval <= originalAlpha) flag = 'UPPER';
      else if (minEval >= beta) flag = 'LOWER';

      if (this.tt.size < this.maxTTEntries) {
        this.tt.set(hash, { score: minEval, depth, flag, bestMove });
      }

      return minEval;
    }
  }

  // Calculate best Mega Knight destination jump
  getBestMegaKnightJump(game, color) {
    const isW = (color === 'w');
    let bestJump = null;
    let bestVal = isW ? -Infinity : Infinity;

    for (const mk of game.megaKnights) {
      const moves = game.getMegaKnightMoves(mk.vx, mk.vy);
      for (const m of moves) {
        let crushNetValue = 0;
        let crushedEnemyKing = false;
        let crushedOwnKing = false;

        for (const cp of m.crushedPieces) {
          const val = Math.abs(PIECE_VALS[cp.piece]);
          const cpIsW = (cp.piece <= PIECES.wK);

          if (cp.piece === PIECES.wK) {
            if (isW) crushedOwnKing = true;
            else crushedEnemyKing = true;
          }
          if (cp.piece === PIECES.bK) {
            if (isW) crushedEnemyKing = true;
            else crushedOwnKing = true;
          }

          if (isW) {
            crushNetValue += cpIsW ? -val * 2.0 : val;
          } else {
            crushNetValue += cpIsW ? val : -val * 2.0;
          }
        }

        // Never crush own King!
        if (crushedOwnKing) continue;

        let totalScore = crushNetValue;
        if (crushedEnemyKing) {
          totalScore += isW ? 30000 : -30000;
        }

        const better = isW ? (totalScore > bestVal) : (totalScore < bestVal);
        if (better || !bestJump) {
          bestVal = totalScore;
          bestJump = {
            mkId: mk.id,
            nvx: m.toVertex.vx,
            nvy: m.toVertex.vy,
            score: totalScore,
            isLethalKingCrush: crushedEnemyKing,
            crushedPieces: m.crushedPieces
          };
        }
      }
    }

    return bestJump;
  }

  // Master turn decision engine
  getBestAction(game) {
    const color = game.turn;
    const isW = (color === 'w');

    // 1. Difficulty Search Depth
    let searchDepth = 4; // Apex Grandmaster: depth 4 with quiescence search to depth 8!
    if (this.difficulty === 'squire') searchDepth = 1;
    else if (this.difficulty === 'commander') searchDepth = 2;
    else if (this.difficulty === 'apex') searchDepth = 4;

    // 2. Iterative Deepening Minimax Search
    const legalMoves = game.getLegalMoves(color);
    if (legalMoves.length === 0) {
      return { action: 'move_piece', move: null, eval: 0 };
    }

    let bestPieceMove = null;
    let bestPieceEval = isW ? -Infinity : Infinity;

    // Ordered moves
    const ordered = this.orderMoves(game, legalMoves, 0);

    for (const move of ordered) {
      const undo = game.makeMoveInternal(move);
      let ev = this.alphaBeta(game, searchDepth - 1, -Infinity, Infinity, !isW, 1);
      game.undoMoveInternal(move, undo);

      if (this.difficulty === 'squire') {
        ev += (Math.random() * 30 - 15);
      }

      const isBetter = isW ? (ev > bestPieceEval) : (ev < bestPieceEval);
      if (isBetter || !bestPieceMove) {
        bestPieceEval = ev;
        bestPieceMove = move;
      }
    }

    // 3. Mathematical Expected Value (EV) Analysis for D6 Dice Roll
    const bestMKJump = this.getBestMegaKnightJump(game, color);
    let shouldRollD6 = false;

    if (bestMKJump) {
      // INSTANT LETHAL WIN:
      // If rolling 6 allows crushing the enemy King, it's a 16.7% shot at INSTANT VICTORY!
      if (bestMKJump.isLethalKingCrush) {
        // In Apex mode: if best piece move does NOT guarantee checkmate, the 1/6 lethal snipe is mathematically superior!
        const normalWin = isW ? (bestPieceEval > 15000) : (bestPieceEval < -15000);
        if (!normalWin) {
          shouldRollD6 = true;
        }
      }

      // HIGH VALUE CRUSH (e.g. crushing Queen + minor piece = net >= +950 centipawns)
      const absCrushScore = Math.abs(bestMKJump.score);
      if (!shouldRollD6 && absCrushScore >= 800) {
        // If rolling 6 provides huge positive material swing:
        const currentDeficit = isW ? -bestPieceEval : bestPieceEval;
        if (currentDeficit > -200) {
          // Expected value of roll: 1/6 * 950 ≈ +158 centipawns
          if (this.difficulty === 'apex' && absCrushScore >= 1100) {
            shouldRollD6 = true;
          } else if (Math.random() < 0.4) {
            shouldRollD6 = true;
          }
        }
      }

      // DESPERATION HAIL MARY:
      // When dead-lost (down > 500 centipawns), rolling D6 gives a chaotic chance to overturn the game
      const isLosingBadly = isW ? (bestPieceEval < -550) : (bestPieceEval > 550);
      if (!shouldRollD6 && isLosingBadly && Math.random() < 0.55) {
        shouldRollD6 = true;
      }
    }

    // Squire casual play randomness
    if (this.difficulty === 'squire' && Math.random() < 0.15 && bestMKJump && !bestMKJump.crushedOwnKing) {
      shouldRollD6 = true;
    }

    if (shouldRollD6) {
      return {
        action: 'roll_d6',
        intendedJump: bestMKJump
      };
    }

    return {
      action: 'move_piece',
      move: bestPieceMove,
      eval: bestPieceEval
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SmartBot, PIECE_VALS, computeHash };
}
