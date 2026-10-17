/**
 * MegaKnight Chess UI Controller
 * High-performance, touch-friendly, responsive board renderer.
 * Supports:
 * - Desktop & mobile touch/drag-and-drop
 * - Tap-to-select and tap-to-move
 * - 2x2 Mega Knight rendering precisely centered on vertex intersections
 * - Glowing vertex reticles when Mega Knight is active
 * - Crush shockwaves & particle shatter animations
 * - 3D CSS tumbling dice with physics
 * - Board flipping (White/Black perspectives)
 */

class ChessUI {
  constructor(app) {
    this.app = app;
    this.boardEl = document.getElementById('chessboard');
    this.containerEl = document.getElementById('board-container');
    this.isFlipped = false;

    this.selectedSquare = null;
    this.activeMegaKnightId = null;
    this.isMegaKnightActive = false;
    this.availableMKVertices = [];

    this.draggedPiece = null;
    this.dragGhost = null;

    this.initDOM();
  }

  initDOM() {
    this.setupDiceAnimation();
    this.setupResizeObserver();
  }

  setupResizeObserver() {
    const ro = new ResizeObserver(() => {
      this.renderMegaKnights();
    });
    if (this.boardEl) ro.observe(this.boardEl);
  }

  setFlipped(flipped) {
    this.isFlipped = flipped;
    this.render();
  }

  toggleFlip() {
    this.setFlipped(!this.isFlipped);
  }

  // Convert (x, y) 0..7 to display percentage (0..87.5%)
  getSquarePercent(x, y) {
    const dispX = this.isFlipped ? (7 - x) : x;
    const dispY = this.isFlipped ? y : (7 - y);
    return {
      left: dispX * 12.5,
      top: dispY * 12.5
    };
  }

  // Convert vertex (vx, vy) 1..7 to display percentage
  getVertexPercent(vx, vy) {
    const dispVx = this.isFlipped ? (8 - vx) : vx;
    const dispVy = this.isFlipped ? vy : (8 - vy);
    return {
      left: dispVx * 12.5,
      top: dispVy * 12.5
    };
  }

  render() {
    if (!this.boardEl) return;
    this.boardEl.innerHTML = '';

    // 1. Render 64 Squares & Coordinates
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const sqEl = document.createElement('div');
        const isLight = (x + y) % 2 === 1;
        sqEl.className = `board-square ${isLight ? 'light' : 'dark'}`;
        sqEl.dataset.x = x;
        sqEl.dataset.y = y;
        const sqName = fileRankToSquare(x, y);
        sqEl.dataset.square = sqName;

        const pos = this.getSquarePercent(x, y);
        sqEl.style.left = `${pos.left}%`;
        sqEl.style.top = `${pos.top}%`;

        // Render rank coordinate on left edge (file a or h when flipped)
        const isLeftEdge = this.isFlipped ? (x === 7) : (x === 0);
        if (isLeftEdge) {
          const coordRank = document.createElement('span');
          coordRank.className = 'coord coord-rank';
          coordRank.textContent = y + 1;
          sqEl.appendChild(coordRank);
        }

        // Render file coordinate on bottom edge (rank 1 or 8 when flipped)
        const isBottomEdge = this.isFlipped ? (y === 7) : (y === 0);
        if (isBottomEdge) {
          const coordFile = document.createElement('span');
          coordFile.className = 'coord coord-file';
          coordFile.textContent = String.fromCharCode(97 + x);
          sqEl.appendChild(coordFile);
        }

        // Highlight square if blocked by Mega Knight
        if (this.app.game.isSquareBlockedByMegaKnight(x, y)) {
          sqEl.classList.add('blocked-by-mk');
        }

        // Check if King is in check
        const piece = this.app.game.board[x][y];
        if (piece === PIECES.wK && this.app.game.isInCheck('w')) {
          sqEl.classList.add('in-check');
        } else if (piece === PIECES.bK && this.app.game.isInCheck('b')) {
          sqEl.classList.add('in-check');
        }

        // Render Standard Piece if present
        if (piece !== PIECES.EMPTY) {
          const pieceEl = document.createElement('div');
          pieceEl.className = 'chess-piece';
          const sym = PIECE_SYMBOLS[piece];
          pieceEl.innerHTML = CHESS_SVGS[sym] || '';
          pieceEl.dataset.x = x;
          pieceEl.dataset.y = y;
          pieceEl.dataset.piece = sym;

          // Drag & Touch handlers
          this.attachPieceEvents(pieceEl, x, y);
          sqEl.appendChild(pieceEl);
        }

        // Square Click/Tap
        sqEl.addEventListener('click', (e) => {
          this.handleSquareClick(x, y);
        });

        this.boardEl.appendChild(sqEl);
      }
    }

    // 2. Render Mega Knights (2x2 Pieces on Vertices)
    this.renderMegaKnights();

    // 3. Render Legal Move Highlights if a piece is selected
    if (this.selectedSquare) {
      this.renderMoveHighlights();
    }

    // 4. Render Active Mega Knight Target Vertices
    if (this.isMegaKnightActive) {
      this.renderActiveMKVertices();
    }
  }

  renderMegaKnights() {
    // Remove existing Mega Knight elements
    const existing = this.boardEl.querySelectorAll('.mega-knight-wrapper');
    existing.forEach(el => el.remove());

    for (const mk of this.app.game.megaKnights) {
      const mkEl = document.createElement('div');
      mkEl.className = 'mega-knight-wrapper';
      mkEl.dataset.mkId = mk.id;

      if (this.isMegaKnightActive && (this.activeMegaKnightId === mk.id || !this.activeMegaKnightId)) {
        mkEl.classList.add('mk-active-aura');
      }

      // Position centered at vertex (vx, vy)
      const vpos = this.getVertexPercent(mk.vx, mk.vy);
      // Mega Knight spans 2x2 = 25% width/height.
      // Offset by half size (12.5%) so its center is right on the vertex!
      mkEl.style.left = `calc(${vpos.left}% - 12.5%)`;
      mkEl.style.top = `calc(${vpos.top}% - 12.5%)`;

      mkEl.innerHTML = CHESS_SVGS.MEGA_KNIGHT;

      // Click to select this Mega Knight if active
      mkEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isMegaKnightActive) {
          this.activeMegaKnightId = mk.id;
          this.renderActiveMKVertices();
        }
      });

      this.boardEl.appendChild(mkEl);
    }
  }

  // Render glowing target vertices for active Mega Knight
  renderActiveMKVertices() {
    // Remove old target reticles
    const oldTargets = this.boardEl.querySelectorAll('.vertex-target');
    oldTargets.forEach(el => el.remove());

    const activeId = this.activeMegaKnightId || (this.app.game.megaKnights[0] && this.app.game.megaKnights[0].id);
    const mk = this.app.game.megaKnights.find(m => m.id === activeId);
    if (!mk) return;

    const moves = this.app.game.getMegaKnightMoves(mk.vx, mk.vy);

    for (const m of moves) {
      const targetEl = document.createElement('div');
      targetEl.className = 'vertex-target';
      const pos = this.getVertexPercent(m.toVertex.vx, m.toVertex.vy);
      targetEl.style.left = `${pos.left}%`;
      targetEl.style.top = `${pos.top}%`;

      const hasCrush = m.crushedPieces.length > 0;
      if (hasCrush) {
        targetEl.classList.add('has-crush');
      }

      targetEl.title = `Jump to (${m.toVertex.vx}, ${m.toVertex.vy})` + 
        (hasCrush ? ` - CRUSH: ${m.crushedPieces.map(p => p.symbol).join(', ')}` : '');

      // Hover preview of crushed squares
      targetEl.addEventListener('mouseenter', () => {
        this.highlightCrushPreview(m.toVertex.vx, m.toVertex.vy);
      });
      targetEl.addEventListener('mouseleave', () => {
        this.clearCrushPreview();
      });

      // Click to execute Mega Knight jump
      targetEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.executeMegaKnightMove(mk.id, m.toVertex.vx, m.toVertex.vy);
      });

      this.boardEl.appendChild(targetEl);
    }
  }

  highlightCrushPreview(vx, vy) {
    this.clearCrushPreview();
    const sqs = MegaKnightChess.getMegaKnightSquares(vx, vy);
    for (const sq of sqs) {
      const sqEl = this.boardEl.querySelector(`[data-x="${sq.x}"][data-y="${sq.y}"]`);
      if (sqEl) {
        sqEl.classList.add('crush-preview');
      }
    }
  }

  clearCrushPreview() {
    const previewed = this.boardEl.querySelectorAll('.crush-preview');
    previewed.forEach(el => el.classList.remove('crush-preview'));
  }

  // Handle click on square
  handleSquareClick(x, y) {
    if (this.isMegaKnightActive) {
      // If player clicked away while Mega Knight is active, don't deselect unless canceling
      return;
    }

    if (!this.app.isMyTurn()) return;

    const piece = this.app.game.board[x][y];
    const isFriendly = (this.app.game.turn === 'w' ? isWhite(piece) : isBlack(piece));

    // If square already selected and clicked again, deselect
    if (this.selectedSquare && this.selectedSquare.x === x && this.selectedSquare.y === y) {
      this.clearSelection();
      return;
    }

    // If another friendly piece clicked, select it
    if (piece !== PIECES.EMPTY && isFriendly) {
      this.selectedSquare = { x, y };
      this.render();
      return;
    }

    // If destination square clicked with piece selected, attempt move
    if (this.selectedSquare) {
      const legalMoves = this.app.game.getLegalMoves(this.app.game.turn);
      const targetMove = legalMoves.find(m => 
        m.from.x === this.selectedSquare.x && m.from.y === this.selectedSquare.y &&
        m.to.x === x && m.to.y === y
      );

      if (targetMove) {
        // Check for promotion
        const isPawn = (this.app.game.board[this.selectedSquare.x][this.selectedSquare.y] === PIECES.wP ||
                        this.app.game.board[this.selectedSquare.x][this.selectedSquare.y] === PIECES.bP);
        const promoRank = (this.app.game.turn === 'w' ? 7 : 0);

        if (isPawn && y === promoRank) {
          this.showPromotionDialog((chosenPromo) => {
            targetMove.promo = chosenPromo;
            this.app.executePieceMove(targetMove);
            this.clearSelection();
          });
          return;
        }

        this.app.executePieceMove(targetMove);
        this.clearSelection();
      } else {
        this.clearSelection();
      }
    }
  }

  renderMoveHighlights() {
    if (!this.selectedSquare) return;

    const fromEl = this.boardEl.querySelector(`[data-x="${this.selectedSquare.x}"][data-y="${this.selectedSquare.y}"]`);
    if (fromEl) fromEl.classList.add('selected');

    const legalMoves = this.app.game.getLegalMoves(this.app.game.turn);
    const pieceMoves = legalMoves.filter(m => 
      m.from.x === this.selectedSquare.x && m.from.y === this.selectedSquare.y
    );

    for (const m of pieceMoves) {
      const sqEl = this.boardEl.querySelector(`[data-x="${m.to.x}"][data-y="${m.to.y}"]`);
      if (!sqEl) continue;

      const marker = document.createElement('div');
      const isTargetOccupied = (this.app.game.board[m.to.x][m.to.y] !== PIECES.EMPTY) || m.isEnPassant;

      marker.className = isTargetOccupied ? 'capture-ring' : 'move-dot';
      sqEl.appendChild(marker);
    }
  }

  clearSelection() {
    this.selectedSquare = null;
    this.render();
  }

  // Promotion Dialog Modal
  showPromotionDialog(callback) {
    const modal = document.getElementById('promotion-modal');
    if (!modal) {
      callback('q');
      return;
    }

    const isW = (this.app.game.turn === 'w');
    const options = [
      { sym: 'q', name: 'Queen', svg: isW ? CHESS_SVGS.Q : CHESS_SVGS.q },
      { sym: 'n', name: 'Knight (Mega Knight Summoner!)', svg: isW ? CHESS_SVGS.N : CHESS_SVGS.n },
      { sym: 'r', name: 'Rook', svg: isW ? CHESS_SVGS.R : CHESS_SVGS.r },
      { sym: 'b', name: 'Bishop', svg: isW ? CHESS_SVGS.B : CHESS_SVGS.b }
    ];

    const container = modal.querySelector('.promo-options');
    container.innerHTML = '';

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'promo-btn';
      btn.innerHTML = `${opt.svg}<span>${opt.name}</span>`;
      btn.addEventListener('click', () => {
        modal.classList.remove('open');
        callback(opt.sym);
      });
      container.appendChild(btn);
    });

    modal.classList.add('open');
  }

  // Piece Touch & Drag Support
  attachPieceEvents(pieceEl, x, y) {
    // Touch start
    pieceEl.addEventListener('touchstart', (e) => {
      if (!this.app.isMyTurn()) return;
      const piece = this.app.game.board[x][y];
      const isFriendly = (this.app.game.turn === 'w' ? isWhite(piece) : isBlack(piece));
      if (!isFriendly) return;

      this.selectedSquare = { x, y };
      this.render();
    }, { passive: true });
  }

  // Dynamic 3D Dice Component
  setupDiceAnimation() {
    this.diceCube = document.getElementById('dice-cube');
    this.rollBtn = document.getElementById('btn-roll-dice');

    if (this.rollBtn) {
      this.rollBtn.addEventListener('click', () => {
        if (!this.app.isMyTurn() || this.isMegaKnightActive) return;
        this.app.requestDiceRoll();
      });
    }
  }

  // Animate the 3D dice tumbling and settling on target number (1..6)
  animateDiceRoll(targetRoll, onComplete) {
    if (!this.diceCube) {
      if (onComplete) onComplete();
      return;
    }

    // Add tumbling animation class
    this.diceCube.classList.add('rolling');

    // Periodic click sound during roll
    let clicks = 0;
    const clickTimer = setInterval(() => {
      this.app.audio.playDiceClick();
      clicks++;
      if (clicks > 8) clearInterval(clickTimer);
    }, 70);

    // Cube rotational angles for each target face
    // Face 1: front (0, 0)
    // Face 2: bottom (-90, 0)
    // Face 3: right (0, -90)
    // Face 4: left (0, 90)
    // Face 5: top (90, 0)
    // Face 6: back (180, 0)
    const faceRotations = {
      1: { x: 0,   y: 0 },
      2: { x: -90, y: 0 },
      3: { x: 0,   y: -90 },
      4: { x: 0,   y: 90 },
      5: { x: 90,  y: 0 },
      6: { x: 180, y: 0 }
    };

    const target = faceRotations[targetRoll] || { x: 0, y: 0 };
    // Add 2-3 extra full 360-degree spins for realistic tumble
    const extraSpinsX = 720;
    const extraSpinsY = 720;

    setTimeout(() => {
      this.diceCube.classList.remove('rolling');
      this.diceCube.style.transform = `rotateX(${target.x + extraSpinsX}deg) rotateY(${target.y + extraSpinsY}deg)`;

      // Flash success glow if 6
      if (targetRoll === 6) {
        this.diceCube.classList.add('dice-six-flash');
        this.triggerConfetti();
        this.app.audio.playDiceSix();
      } else {
        this.app.audio.playDiceFail();
      }

      setTimeout(() => {
        this.diceCube.classList.remove('dice-six-flash');
        if (onComplete) onComplete();
      }, 500);
    }, 800);
  }

  // Particle explosion & screen shake for Mega Knight Crush!
  triggerCrushFX(vx, vy, crushedPieces) {
    this.app.audio.playCrush();

    // 1. Screen Shake
    if (this.containerEl) {
      this.containerEl.classList.remove('shake-board');
      void this.containerEl.offsetWidth; // Force reflow
      this.containerEl.classList.add('shake-board');
    }

    // 2. Shockwave expanding from target vertex
    const vpos = this.getVertexPercent(vx, vy);
    const shockwave = document.createElement('div');
    shockwave.className = 'crush-shockwave';
    shockwave.style.left = `${vpos.left}%`;
    shockwave.style.top = `${vpos.top}%`;
    this.boardEl.appendChild(shockwave);
    setTimeout(() => shockwave.remove(), 700);

    // 3. Shrapnel particles on each crushed square
    const sqs = MegaKnightChess.getMegaKnightSquares(vx, vy);
    for (const sq of sqs) {
      const spos = this.getSquarePercent(sq.x, sq.y);
      for (let i = 0; i < 8; i++) {
        const particle = document.createElement('div');
        particle.className = 'crush-particle';
        particle.style.left = `calc(${spos.left + 6.25}% + ${(Math.random() - 0.5) * 20}px)`;
        particle.style.top = `calc(${spos.top + 6.25}% + ${(Math.random() - 0.5) * 20}px)`;
        particle.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
        particle.style.setProperty('--dy', `${(Math.random() - 0.5) * 120}px`);
        this.boardEl.appendChild(particle);
        setTimeout(() => particle.remove(), 600);
      }
    }
  }

  // 4-Knight Summon Fusion FX
  triggerSummonFX(vx, vy) {
    this.app.audio.playSummon();

    const vpos = this.getVertexPercent(vx, vy);
    const beam = document.createElement('div');
    beam.className = 'summon-energy-burst';
    beam.style.left = `${vpos.left}%`;
    beam.style.top = `${vpos.top}%`;
    this.boardEl.appendChild(beam);
    setTimeout(() => beam.remove(), 1000);
  }

  // Floating reaction emojis
  triggerReactionBubble(emoji, sender = '') {
    const bubble = document.createElement('div');
    bubble.className = 'floating-reaction';
    bubble.textContent = emoji;
    const randomLeft = 20 + Math.random() * 60;
    bubble.style.left = `${randomLeft}%`;
    this.containerEl.appendChild(bubble);
    setTimeout(() => bubble.remove(), 1800);
  }

  // Confetti burst for critical rolls / victory
  triggerConfetti() {
    const colors = ['#ff4b5c', '#ffe066', '#81b64c', '#ffffff', '#f77f00'];
    for (let i = 0; i < 25; i++) {
      const conf = document.createElement('div');
      conf.className = 'confetti-piece';
      conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      conf.style.left = '50%';
      conf.style.top = '50%';
      conf.style.setProperty('--tx', `${(Math.random() - 0.5) * 260}px`);
      conf.style.setProperty('--ty', `${-Math.random() * 200 - 40}px`);
      conf.style.setProperty('--rot', `${Math.random() * 720}deg`);
      this.containerEl.appendChild(conf);
      setTimeout(() => conf.remove(), 1200);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChessUI };
}
