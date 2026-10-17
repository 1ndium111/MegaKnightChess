/**
 * MegaKnight Chess Engine
 * Full chess implementation with Mega Knight variant rules:
 * - 8x8 Board, coordinates x: 0..7 (a-h), y: 0..7 (1-8)
 * - Vertices vx: 1..7, vy: 1..7 (internal grid intersections)
 * - Mega Knight occupies 4 squares around vertex: (vx-1, vy-1), (vx-1, vy), (vx, vy-1), (vx, vy)
 * - Blocks movement & line-of-sight for sliders
 * - Moves in vertex L-shapes: (dx, dy) in {(±1, ±2), (±2, ±1)}
 * - Crushes any pieces on its landing squares
 * - 4 Knights in 2x2 square pattern instantly summon a new Mega Knight
 */

const PIECES = {
  EMPTY: 0,
  wP: 1, wN: 2, wB: 3, wR: 4, wQ: 5, wK: 6,
  bP: 7, bN: 8, bB: 9, bR: 10, bQ: 11, bK: 12
};

const PIECE_SYMBOLS = {
  [PIECES.wP]: 'P', [PIECES.wN]: 'N', [PIECES.wB]: 'B', [PIECES.wR]: 'R', [PIECES.wQ]: 'Q', [PIECES.wK]: 'K',
  [PIECES.bP]: 'p', [PIECES.bN]: 'n', [PIECES.bB]: 'b', [PIECES.bR]: 'r', [PIECES.bQ]: 'q', [PIECES.bK]: 'k',
};

const SYMBOL_TO_PIECE = {
  'P': PIECES.wP, 'N': PIECES.wN, 'B': PIECES.wB, 'R': PIECES.wR, 'Q': PIECES.wQ, 'K': PIECES.wK,
  'p': PIECES.bP, 'n': PIECES.bN, 'b': PIECES.bB, 'r': PIECES.bR, 'q': PIECES.bQ, 'k': PIECES.bK,
};

function isWhite(piece) {
  return piece >= PIECES.wP && piece <= PIECES.wK;
}

function isBlack(piece) {
  return piece >= PIECES.bP && piece <= PIECES.bK;
}

function isKnight(piece) {
  return piece === PIECES.wN || piece === PIECES.bN;
}

function fileRankToSquare(file, rank) {
  return String.fromCharCode(97 + file) + (rank + 1);
}

function squareToFileRank(sq) {
  return {
    x: sq.charCodeAt(0) - 97,
    y: parseInt(sq[1], 10) - 1
  };
}

class MegaKnightChess {
  constructor() {
    this.reset();
  }

  reset() {
    // 8x8 board: board[x][y], where x: file 0..7 (a-h), y: rank 0..7 (1-8)
    this.board = Array(8).fill(null).map(() => Array(8).fill(PIECES.EMPTY));
    this.turn = 'w'; // 'w' or 'b'
    
    // Castling rights
    this.castling = {
      w: { k: true, q: true },
      b: { k: true, q: true }
    };

    // En passant target square: {x, y} or null
    this.enPassant = null;

    // Halfmove clock & fullmove number
    this.halfMoves = 0;
    this.fullMoves = 1;

    // Mega Knights on the board: array of { id, vx, vy }
    // Starts with 1 Mega Knight centered at vertex (4, 4) -> squares d4, d5, e4, e5
    this.megaKnights = [
      { id: 1, vx: 4, vy: 4 }
    ];
    this.nextMegaKnightId = 2;

    // Move history
    this.history = [];

    // Game state: 'active', 'checkmate', 'crushmate', 'stalemate', 'draw'
    this.gameState = 'active';
    this.winner = null; // 'w', 'b', or 'draw'
    this.winReason = null;

    this.setupStandardBoard();
  }

  setupStandardBoard() {
    // White pieces (y = 0 is rank 1, y = 1 is rank 2)
    const backRankWhite = [PIECES.wR, PIECES.wN, PIECES.wB, PIECES.wQ, PIECES.wK, PIECES.wB, PIECES.wN, PIECES.wR];
    for (let x = 0; x < 8; x++) {
      this.board[x][0] = backRankWhite[x];
      this.board[x][1] = PIECES.wP;
    }

    // Black pieces (y = 7 is rank 8, y = 6 is rank 7)
    const backRankBlack = [PIECES.bR, PIECES.bN, PIECES.bB, PIECES.bQ, PIECES.bK, PIECES.bB, PIECES.bN, PIECES.bR];
    for (let x = 0; x < 8; x++) {
      this.board[x][7] = backRankBlack[x];
      this.board[x][6] = PIECES.bP;
    }
  }

  // Get the 4 squares occupied by a Mega Knight at vertex (vx, vy)
  static getMegaKnightSquares(vx, vy) {
    return [
      { x: vx - 1, y: vy - 1 },
      { x: vx - 1, y: vy },
      { x: vx,     y: vy - 1 },
      { x: vx,     y: vy }
    ];
  }

  // Check if square (x, y) is currently covered by ANY Mega Knight
  isSquareBlockedByMegaKnight(x, y) {
    for (const mk of this.megaKnights) {
      if ((x === mk.vx - 1 || x === mk.vx) && (y === mk.vy - 1 || y === mk.vy)) {
        return true;
      }
    }
    return false;
  }

  // Get all squares currently blocked by Mega Knights
  getAllBlockedSquares() {
    const blocked = new Set();
    for (const mk of this.megaKnights) {
      for (const sq of MegaKnightChess.getMegaKnightSquares(mk.vx, mk.vy)) {
        blocked.add(`${sq.x},${sq.y}`);
      }
    }
    return blocked;
  }

  // Check if a piece exists at (x, y)
  getPiece(x, y) {
    if (x < 0 || x > 7 || y < 0 || y > 7) return PIECES.EMPTY;
    return this.board[x][y];
  }

  // Find King coordinates for player
  findKing(color) {
    const target = (color === 'w') ? PIECES.wK : PIECES.bK;
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        if (this.board[x][y] === target) {
          return { x, y };
        }
      }
    }
    return null;
  }

  // Check if square (x, y) is attacked by opponent
  isSquareAttacked(targetX, targetY, attackingColor) {
    // 1. Attacked by Pawns
    const pawnDir = (attackingColor === 'w') ? 1 : -1;
    const pawnPiece = (attackingColor === 'w') ? PIECES.wP : PIECES.bP;
    const pawnFromY = targetY - pawnDir;
    if (pawnFromY >= 0 && pawnFromY <= 7) {
      if (targetX - 1 >= 0 && this.board[targetX - 1][pawnFromY] === pawnPiece) return true;
      if (targetX + 1 <= 7 && this.board[targetX + 1][pawnFromY] === pawnPiece) return true;
    }

    // 2. Attacked by Knights
    const knightPiece = (attackingColor === 'w') ? PIECES.wN : PIECES.bN;
    const knightMoves = [
      { dx: 1, dy: 2 }, { dx: 2, dy: 1 }, { dx: 2, dy: -1 }, { dx: 1, dy: -2 },
      { dx: -1, dy: -2 }, { dx: -2, dy: -1 }, { dx: -2, dy: 1 }, { dx: -1, dy: 2 }
    ];
    for (const km of knightMoves) {
      const nx = targetX + km.dx;
      const ny = targetY + km.dy;
      if (nx >= 0 && nx <= 7 && ny >= 0 && ny <= 7) {
        if (this.board[nx][ny] === knightPiece) return true;
      }
    }

    // 3. Attacked by King
    const enemyKing = (attackingColor === 'w') ? PIECES.wK : PIECES.bK;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const kx = targetX + dx;
        const ky = targetY + dy;
        if (kx >= 0 && kx <= 7 && ky >= 0 && ky <= 7) {
          if (this.board[kx][ky] === enemyKing) return true;
        }
      }
    }

    // 4. Attacked by Sliders: Orthogonal (Rook, Queen) and Diagonal (Bishop, Queen)
    // IMPORTANT: Mega Knight BLOCKS line of sight!
    const checkRays = (dirs, targetPieces) => {
      for (const d of dirs) {
        let cx = targetX + d.dx;
        let cy = targetY + d.dy;
        while (cx >= 0 && cx <= 7 && cy >= 0 && cy <= 7) {
          // If square is blocked by Mega Knight, ray is stopped!
          if (this.isSquareBlockedByMegaKnight(cx, cy)) {
            break;
          }
          const p = this.board[cx][cy];
          if (p !== PIECES.EMPTY) {
            if (targetPieces.includes(p)) return true;
            break; // Blocked by some piece
          }
          cx += d.dx;
          cy += d.dy;
        }
      }
      return false;
    };

    const orthoDirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    const orthoPieces = (attackingColor === 'w') ? [PIECES.wR, PIECES.wQ] : [PIECES.bR, PIECES.bQ];
    if (checkRays(orthoDirs, orthoPieces)) return true;

    const diagDirs = [{ dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }];
    const diagPieces = (attackingColor === 'w') ? [PIECES.wB, PIECES.wQ] : [PIECES.bB, PIECES.bQ];
    if (checkRays(diagDirs, diagPieces)) return true;

    return false;
  }

  isInCheck(color) {
    const king = this.findKing(color);
    if (!king) return false;
    const enemyColor = (color === 'w') ? 'b' : 'w';
    return this.isSquareAttacked(king.x, king.y, enemyColor);
  }

  // Generate pseudo-legal moves for standard pieces
  generatePseudoMoves(color) {
    const moves = [];
    const isFriendly = (p) => (color === 'w' ? isWhite(p) : isBlack(p));
    const isEnemy = (p) => (color === 'w' ? isBlack(p) : isWhite(p));

    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const piece = this.board[x][y];
        if (piece === PIECES.EMPTY || !isFriendly(piece)) continue;

        // Pawns
        if (piece === PIECES.wP || piece === PIECES.bP) {
          const dir = (color === 'w') ? 1 : -1;
          const startRank = (color === 'w') ? 1 : 6;
          const promoRank = (color === 'w') ? 7 : 0;

          // Single push forward
          const forwardY = y + dir;
          if (forwardY >= 0 && forwardY <= 7 && !this.isSquareBlockedByMegaKnight(x, forwardY)) {
            if (this.board[x][forwardY] === PIECES.EMPTY) {
              if (forwardY === promoRank) {
                for (const promo of ['q', 'r', 'b', 'n']) {
                  moves.push({ from: { x, y }, to: { x, y: forwardY }, promo });
                }
              } else {
                moves.push({ from: { x, y }, to: { x, y: forwardY } });
              }

              // Double push from start rank (both squares must not be blocked by piece or Mega Knight)
              const doubleY = y + 2 * dir;
              if (y === startRank && !this.isSquareBlockedByMegaKnight(x, doubleY)) {
                if (this.board[x][doubleY] === PIECES.EMPTY) {
                  moves.push({ from: { x, y }, to: { x, y: doubleY }, isDoublePawn: true });
                }
              }
            }
          }

          // Diagonal Captures
          for (const dx of [-1, 1]) {
            const capX = x + dx;
            const capY = y + dir;
            if (capX >= 0 && capX <= 7 && capY >= 0 && capY <= 7) {
              // Cannot land on Mega Knight
              if (this.isSquareBlockedByMegaKnight(capX, capY)) continue;

              const target = this.board[capX][capY];
              if (target !== PIECES.EMPTY && isEnemy(target)) {
                if (capY === promoRank) {
                  for (const promo of ['q', 'r', 'b', 'n']) {
                    moves.push({ from: { x, y }, to: { x: capX, y: capY }, promo, capture: target });
                  }
                } else {
                  moves.push({ from: { x, y }, to: { x: capX, y: capY }, capture: target });
                }
              }

              // En Passant
              if (this.enPassant && this.enPassant.x === capX && this.enPassant.y === capY) {
                moves.push({ from: { x, y }, to: { x: capX, y: capY }, isEnPassant: true });
              }
            }
          }
        }

        // Knights: can jump over pieces/Mega Knight, but CANNOT land on Mega Knight
        else if (piece === PIECES.wN || piece === PIECES.bN) {
          const knightDeltas = [
            { dx: 1, dy: 2 }, { dx: 2, dy: 1 }, { dx: 2, dy: -1 }, { dx: 1, dy: -2 },
            { dx: -1, dy: -2 }, { dx: -2, dy: -1 }, { dx: -2, dy: 1 }, { dx: -1, dy: 2 }
          ];
          for (const d of knightDeltas) {
            const tx = x + d.dx;
            const ty = y + d.dy;
            if (tx >= 0 && tx <= 7 && ty >= 0 && ty <= 7) {
              if (this.isSquareBlockedByMegaKnight(tx, ty)) continue;
              const target = this.board[tx][ty];
              if (target === PIECES.EMPTY) {
                moves.push({ from: { x, y }, to: { x: tx, y: ty } });
              } else if (isEnemy(target)) {
                moves.push({ from: { x, y }, to: { x: tx, y: ty }, capture: target });
              }
            }
          }
        }

        // Sliders (Bishops, Rooks, Queens)
        else if (piece === PIECES.wB || piece === PIECES.bB ||
                 piece === PIECES.wR || piece === PIECES.bR ||
                 piece === PIECES.wQ || piece === PIECES.bQ) {
          const dirs = [];
          if (piece === PIECES.wB || piece === PIECES.bB || piece === PIECES.wQ || piece === PIECES.bQ) {
            dirs.push({ dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 });
          }
          if (piece === PIECES.wR || piece === PIECES.bR || piece === PIECES.wQ || piece === PIECES.bQ) {
            dirs.push({ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 });
          }

          for (const d of dirs) {
            let tx = x + d.dx;
            let ty = y + d.dy;
            while (tx >= 0 && tx <= 7 && ty >= 0 && ty <= 7) {
              // Blocked by Mega Knight
              if (this.isSquareBlockedByMegaKnight(tx, ty)) break;

              const target = this.board[tx][ty];
              if (target === PIECES.EMPTY) {
                moves.push({ from: { x, y }, to: { x: tx, y: ty } });
              } else {
                if (isEnemy(target)) {
                  moves.push({ from: { x, y }, to: { x: tx, y: ty }, capture: target });
                }
                break; // Hit a piece
              }
              tx += d.dx;
              ty += d.dy;
            }
          }
        }

        // King
        else if (piece === PIECES.wK || piece === PIECES.bK) {
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              if (dx === 0 && dy === 0) continue;
              const tx = x + dx;
              const ty = y + dy;
              if (tx >= 0 && tx <= 7 && ty >= 0 && ty <= 7) {
                if (this.isSquareBlockedByMegaKnight(tx, ty)) continue;
                const target = this.board[tx][ty];
                if (target === PIECES.EMPTY) {
                  moves.push({ from: { x, y }, to: { x: tx, y: ty } });
                } else if (isEnemy(target)) {
                  moves.push({ from: { x, y }, to: { x: tx, y: ty }, capture: target });
                }
              }
            }
          }

          // Castling
          const enemyColor = (color === 'w') ? 'b' : 'w';
          const rank = (color === 'w') ? 0 : 7;
          if (y === rank && x === 4 && !this.isInCheck(color)) {
            // Kingside (e1 to g1 / e8 to g8)
            if (this.castling[color].k) {
              const f_blocked = this.isSquareBlockedByMegaKnight(5, rank) || this.board[5][rank] !== PIECES.EMPTY;
              const g_blocked = this.isSquareBlockedByMegaKnight(6, rank) || this.board[6][rank] !== PIECES.EMPTY;
              if (!f_blocked && !g_blocked) {
                if (!this.isSquareAttacked(5, rank, enemyColor) && !this.isSquareAttacked(6, rank, enemyColor)) {
                  moves.push({ from: { x: 4, y: rank }, to: { x: 6, y: rank }, isCastling: 'k' });
                }
              }
            }
            // Queenside (e1 to c1 / e8 to c8)
            if (this.castling[color].q) {
              const d_blocked = this.isSquareBlockedByMegaKnight(3, rank) || this.board[3][rank] !== PIECES.EMPTY;
              const c_blocked = this.isSquareBlockedByMegaKnight(2, rank) || this.board[2][rank] !== PIECES.EMPTY;
              const b_blocked = this.isSquareBlockedByMegaKnight(1, rank) || this.board[1][rank] !== PIECES.EMPTY;
              if (!d_blocked && !c_blocked && !b_blocked) {
                if (!this.isSquareAttacked(3, rank, enemyColor) && !this.isSquareAttacked(2, rank, enemyColor)) {
                  moves.push({ from: { x: 4, y: rank }, to: { x: 2, y: rank }, isCastling: 'q' });
                }
              }
            }
          }
        }
      }
    }

    return moves;
  }

  // Filter legal moves (must not leave own king in check)
  getLegalMoves(color = this.turn) {
    if (this.gameState !== 'active') return [];
    const pseudo = this.generatePseudoMoves(color);
    const legal = [];

    for (const move of pseudo) {
      // Simulate move
      const undoInfo = this.makeMoveInternal(move);
      if (!this.isInCheck(color)) {
        legal.push(move);
      }
      this.undoMoveInternal(move, undoInfo);
    }

    return legal;
  }

  // Internal make move (for move generation/search)
  makeMoveInternal(move) {
    const { from, to, promo, isCastling, isEnPassant, isDoublePawn } = move;
    const piece = this.board[from.x][from.y];
    const captured = this.board[to.x][to.y];

    const prevCastling = {
      w: { ...this.castling.w },
      b: { ...this.castling.b }
    };
    const prevEnPassant = this.enPassant ? { ...this.enPassant } : null;
    let epCaptured = null;

    this.board[from.x][from.y] = PIECES.EMPTY;

    // Handle En Passant capture
    if (isEnPassant) {
      const epY = (piece === PIECES.wP) ? to.y - 1 : to.y + 1;
      epCaptured = this.board[to.x][epY];
      this.board[to.x][epY] = PIECES.EMPTY;
    }

    // Handle Promotion
    if (promo) {
      const isW = isWhite(piece);
      let promoPiece = isW ? PIECES.wQ : PIECES.bQ;
      if (promo === 'r') promoPiece = isW ? PIECES.wR : PIECES.bR;
      else if (promo === 'b') promoPiece = isW ? PIECES.wB : PIECES.bB;
      else if (promo === 'n') promoPiece = isW ? PIECES.wN : PIECES.bN;
      this.board[to.x][to.y] = promoPiece;
    } else {
      this.board[to.x][to.y] = piece;
    }

    // Handle Castling rook move
    if (isCastling) {
      const rank = to.y;
      if (isCastling === 'k') {
        this.board[5][rank] = this.board[7][rank];
        this.board[7][rank] = PIECES.EMPTY;
      } else {
        this.board[3][rank] = this.board[0][rank];
        this.board[0][rank] = PIECES.EMPTY;
      }
    }

    // Update castling rights
    if (piece === PIECES.wK) {
      this.castling.w.k = false;
      this.castling.w.q = false;
    } else if (piece === PIECES.bK) {
      this.castling.b.k = false;
      this.castling.b.q = false;
    } else if (piece === PIECES.wR) {
      if (from.x === 0 && from.y === 0) this.castling.w.q = false;
      if (from.x === 7 && from.y === 0) this.castling.w.k = false;
    } else if (piece === PIECES.bR) {
      if (from.x === 0 && from.y === 7) this.castling.b.q = false;
      if (from.x === 7 && from.y === 7) this.castling.b.k = false;
    }

    // Update en passant square
    if (isDoublePawn) {
      this.enPassant = { x: from.x, y: (from.y + to.y) / 2 };
    } else {
      this.enPassant = null;
    }

    return { piece, captured, epCaptured, prevCastling, prevEnPassant };
  }

  undoMoveInternal(move, undoInfo) {
    const { from, to, isCastling, isEnPassant } = move;
    const { piece, captured, epCaptured, prevCastling, prevEnPassant } = undoInfo;

    this.board[from.x][from.y] = piece;
    this.board[to.x][to.y] = captured;

    if (isEnPassant) {
      const epY = (piece === PIECES.wP) ? to.y - 1 : to.y + 1;
      this.board[to.x][epY] = epCaptured;
    }

    if (isCastling) {
      const rank = to.y;
      if (isCastling === 'k') {
        this.board[7][rank] = this.board[5][rank];
        this.board[5][rank] = PIECES.EMPTY;
      } else {
        this.board[0][rank] = this.board[3][rank];
        this.board[3][rank] = PIECES.EMPTY;
      }
    }

    this.castling = prevCastling;
    this.enPassant = prevEnPassant;
  }

  // Execute a standard move for the active turn
  makeMove(move) {
    if (this.gameState !== 'active') return false;

    // Validate move is legal
    const legalMoves = this.getLegalMoves(this.turn);
    const valid = legalMoves.find(m => 
      m.from.x === move.from.x && m.from.y === move.from.y &&
      m.to.x === move.to.x && m.to.y === move.to.y &&
      (!move.promo || m.promo === move.promo)
    );

    if (!valid) return false;

    const piece = this.board[valid.from.x][valid.from.y];
    const isPawnMove = (piece === PIECES.wP || piece === PIECES.bP);
    const isCapture = (this.board[valid.to.x][valid.to.y] !== PIECES.EMPTY) || valid.isEnPassant;

    this.makeMoveInternal(valid);

    if (isPawnMove || isCapture) {
      this.halfMoves = 0;
    } else {
      this.halfMoves++;
    }

    if (this.turn === 'b') {
      this.fullMoves++;
    }

    // Check for 4 Knights summon formation
    const summonedMK = this.checkAndTriggerKnightSummon();

    // Check game state for next player
    this.turn = (this.turn === 'w') ? 'b' : 'w';
    this.updateGameState();

    const record = {
      type: 'piece',
      player: (this.turn === 'b') ? 'w' : 'b',
      from: fileRankToSquare(valid.from.x, valid.from.y),
      to: fileRankToSquare(valid.to.x, valid.to.y),
      piece: PIECE_SYMBOLS[piece],
      captured: valid.capture ? PIECE_SYMBOLS[valid.capture] : null,
      promo: valid.promo,
      summonedMK
    };
    this.history.push(record);

    return { success: true, record, summonedMK };
  }

  // Get valid vertex moves for a Mega Knight at (vx, vy)
  getMegaKnightMoves(vx, vy) {
    const deltas = [
      { dx: 1, dy: 2 }, { dx: 2, dy: 1 }, { dx: 2, dy: -1 }, { dx: 1, dy: -2 },
      { dx: -1, dy: -2 }, { dx: -2, dy: -1 }, { dx: -2, dy: 1 }, { dx: -1, dy: 2 }
    ];

    const moves = [];
    for (const d of deltas) {
      const nvx = vx + d.dx;
      const nvy = vy + d.dy;
      // Must stay within 1..7 (so 2x2 piece stays completely on 8x8 board)
      if (nvx >= 1 && nvx <= 7 && nvy >= 1 && nvy <= 7) {
        // Cannot land on another Mega Knight vertex
        const occupiedByMK = this.megaKnights.some(mk => mk.vx === nvx && mk.vy === nvy);
        if (!occupiedByMK) {
          // Calculate what pieces would be crushed
          const landingSquares = MegaKnightChess.getMegaKnightSquares(nvx, nvy);
          const crushedPieces = [];
          for (const sq of landingSquares) {
            const p = this.board[sq.x][sq.y];
            if (p !== PIECES.EMPTY) {
              crushedPieces.push({ square: fileRankToSquare(sq.x, sq.y), piece: p, symbol: PIECE_SYMBOLS[p] });
            }
          }
          moves.push({
            fromVertex: { vx, vy },
            toVertex: { vx: nvx, vy: nvy },
            crushedPieces
          });
        }
      }
    }
    return moves;
  }

  // Execute a Mega Knight move to target vertex (nvx, nvy)
  moveMegaKnight(mkId, nvx, nvy) {
    if (this.gameState !== 'active') return false;

    const mk = this.megaKnights.find(m => m.id === mkId);
    if (!mk) return false;

    const validMoves = this.getMegaKnightMoves(mk.vx, mk.vy);
    const valid = validMoves.find(m => m.toVertex.vx === nvx && m.toVertex.vy === nvy);
    if (!valid) return false;

    const fromVertex = { vx: mk.vx, vy: mk.vy };
    mk.vx = nvx;
    mk.vy = nvy;

    // Crush all pieces under the 4 squares of the new vertex!
    const crushedSquares = MegaKnightChess.getMegaKnightSquares(nvx, nvy);
    const crushed = [];
    let whiteKingCrushed = false;
    let blackKingCrushed = false;

    for (const sq of crushedSquares) {
      const p = this.board[sq.x][sq.y];
      if (p !== PIECES.EMPTY) {
        crushed.push({
          x: sq.x,
          y: sq.y,
          square: fileRankToSquare(sq.x, sq.y),
          piece: p,
          symbol: PIECE_SYMBOLS[p]
        });
        if (p === PIECES.wK) whiteKingCrushed = true;
        if (p === PIECES.bK) blackKingCrushed = true;
        this.board[sq.x][sq.y] = PIECES.EMPTY;
      }
    }

    // Reset halfmove clock on Mega Knight crush
    this.halfMoves = 0;

    // King crushed rule: instant checkmate!
    if (whiteKingCrushed && blackKingCrushed) {
      this.gameState = 'draw';
      this.winner = 'draw';
      this.winReason = 'Both Kings were crushed simultaneously!';
    } else if (whiteKingCrushed) {
      this.gameState = 'crushmate';
      this.winner = 'b';
      this.winReason = 'White King was crushed by the Mega Knight! Black wins!';
    } else if (blackKingCrushed) {
      this.gameState = 'crushmate';
      this.winner = 'w';
      this.winReason = 'Black King was crushed by the Mega Knight! White wins!';
    }

    // Check for 4 Knights summon if any piece configuration changed
    const summonedMK = this.checkAndTriggerKnightSummon();

    const record = {
      type: 'megaknight',
      player: this.turn,
      mkId,
      fromVertex,
      toVertex: { vx: nvx, vy: nvy },
      crushed,
      summonedMK
    };
    this.history.push(record);

    // Switch turn if game is still active
    if (this.gameState === 'active') {
      if (this.turn === 'b') this.fullMoves++;
      this.turn = (this.turn === 'w') ? 'b' : 'w';
      this.updateGameState();
    }

    return { success: true, record, crushed, summonedMK };
  }

  // Handle player choosing to roll D6 on their turn
  // Return: { roll: number, success: boolean, moves: [...] }
  rollD6() {
    if (this.gameState !== 'active') return null;
    const roll = Math.floor(Math.random() * 6) + 1;
    const isSuccess = (roll === 6);

    const result = {
      player: this.turn,
      roll,
      success: isSuccess
    };

    if (isSuccess) {
      // Player can now move a Mega Knight! Return all available Mega Knight moves
      result.availableMoves = this.megaKnights.map(mk => ({
        mkId: mk.id,
        currentVertex: { vx: mk.vx, vy: mk.vy },
        moves: this.getMegaKnightMoves(mk.vx, mk.vy)
      }));
    } else {
      // Tabletop rule: turn action was spent rolling D6, roll failed (1-5), turn ends!
      const record = {
        type: 'dice_failed',
        player: this.turn,
        roll
      };
      this.history.push(record);

      if (this.turn === 'b') this.fullMoves++;
      this.turn = (this.turn === 'w') ? 'b' : 'w';
      this.updateGameState();
    }

    return result;
  }

  // Rule 9: "If four knights occupy four squares in a square pattern, through either
  // promotion or collaboration, another Mega Knight will form on the board instantaneously.
  // This has no limit."
  checkAndTriggerKnightSummon() {
    const summoned = [];

    // Check all possible 2x2 vertices (1..7, 1..7)
    for (let vx = 1; vx <= 7; vx++) {
      for (let vy = 1; vy <= 7; vy++) {
        // Is there already a Mega Knight here?
        if (this.megaKnights.some(mk => mk.vx === vx && mk.vy === vy)) {
          continue;
        }

        const sqs = MegaKnightChess.getMegaKnightSquares(vx, vy);
        const allKnights = sqs.every(sq => isKnight(this.board[sq.x][sq.y]));

        if (allKnights) {
          // Remove the 4 knights from the board!
          const removedKnights = sqs.map(sq => ({
            square: fileRankToSquare(sq.x, sq.y),
            piece: this.board[sq.x][sq.y],
            symbol: PIECE_SYMBOLS[this.board[sq.x][sq.y]]
          }));

          for (const sq of sqs) {
            this.board[sq.x][sq.y] = PIECES.EMPTY;
          }

          // Create new Mega Knight!
          const newMK = {
            id: this.nextMegaKnightId++,
            vx,
            vy
          };
          this.megaKnights.push(newMK);
          summoned.push({ newMK, removedKnights, vertex: { vx, vy } });
        }
      }
    }

    return summoned.length > 0 ? summoned : null;
  }

  // Update checkmate / stalemate / draw states
  updateGameState() {
    if (this.gameState !== 'active') return;

    // 1. Check if King is missing
    const wK = this.findKing('w');
    const bK = this.findKing('b');
    if (!wK && !bK) {
      this.gameState = 'draw';
      this.winner = 'draw';
      this.winReason = 'Both Kings are gone!';
      return;
    }
    if (!wK) {
      this.gameState = 'crushmate';
      this.winner = 'b';
      this.winReason = 'White King was crushed!';
      return;
    }
    if (!bK) {
      this.gameState = 'crushmate';
      this.winner = 'w';
      this.winReason = 'Black King was crushed!';
      return;
    }

    // 2. Check legal piece moves for current player
    const legalMoves = this.getLegalMoves(this.turn);
    if (legalMoves.length === 0) {
      if (this.isInCheck(this.turn)) {
        this.gameState = 'checkmate';
        this.winner = (this.turn === 'w') ? 'b' : 'w';
        this.winReason = `Checkmate! ${(this.winner === 'w' ? 'White' : 'Black')} wins!`;
      } else {
        this.gameState = 'stalemate';
        this.winner = 'draw';
        this.winReason = 'Stalemate! Game is a draw.';
      }
      return;
    }

    // 3. 50-move rule
    if (this.halfMoves >= 100) {
      this.gameState = 'draw';
      this.winner = 'draw';
      this.winReason = 'Draw by 50-move rule.';
      return;
    }
  }

  // Serialize board state to JSON (for WebRTC multiplayer sync)
  getState() {
    return {
      board: this.board,
      turn: this.turn,
      castling: this.castling,
      enPassant: this.enPassant,
      halfMoves: this.halfMoves,
      fullMoves: this.fullMoves,
      megaKnights: this.megaKnights,
      nextMegaKnightId: this.nextMegaKnightId,
      gameState: this.gameState,
      winner: this.winner,
      winReason: this.winReason,
      history: this.history
    };
  }

  // Load state from JSON
  loadState(state) {
    this.board = state.board;
    this.turn = state.turn;
    this.castling = state.castling;
    this.enPassant = state.enPassant;
    this.halfMoves = state.halfMoves;
    this.fullMoves = state.fullMoves;
    this.megaKnights = state.megaKnights;
    this.nextMegaKnightId = state.nextMegaKnightId;
    this.gameState = state.gameState;
    this.winner = state.winner;
    this.winReason = state.winReason;
    this.history = state.history || [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MegaKnightChess, PIECES, PIECE_SYMBOLS, SYMBOL_TO_PIECE, fileRankToSquare, squareToFileRank };
}
