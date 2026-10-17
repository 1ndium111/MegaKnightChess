/**
 * MegaKnight Chess App Orchestrator
 * Main coordinator linking Game Engine, Smart Bot, WebRTC Multiplayer, Audio & UI.
 */

class MegaKnightApp {
  constructor() {
    this.game = new MegaKnightChess();
    this.audio = new SoundEngine();
    this.bot = new SmartBot('apex');
    this.multiplayer = new MultiplayerManager(this);
    this.ui = null; // initialized after DOM loaded

    // App state
    this.gameMode = 'bot'; // 'bot', 'pvp_local', 'multiplayer', 'bot_vs_bot'
    this.playerColor = 'w'; // In bot / multiplayer: which color local player controls
    this.botColor = 'b';
    this.botDifficulty = 'apex';
    this.timeControl = 300; // 5 min in seconds (0 = untimed)

    this.whiteTime = 300;
    this.blackTime = 300;
    this.timerInterval = null;
    this.isBotThinking = false;

    // Captured pieces list
    this.capturedWhite = [];
    this.capturedBlack = [];
  }

  init() {
    this.ui = new ChessUI(this);
    this.setupEventListeners();
    this.setupMultiplayerCallbacks();
    this.checkUrlForRoomCode();

    this.startNewGame();
  }

  // Check if current user can interact on this turn
  isMyTurn() {
    if (this.game.gameState !== 'active') return false;
    if (this.isBotThinking) return false;

    if (this.gameMode === 'pvp_local') {
      return true;
    }
    if (this.gameMode === 'bot') {
      return this.game.turn === this.playerColor;
    }
    if (this.gameMode === 'multiplayer') {
      return this.multiplayer.opponentConnected && (this.game.turn === this.multiplayer.myColor);
    }
    if (this.gameMode === 'bot_vs_bot') {
      return false;
    }
    return true;
  }

  startNewGame() {
    this.game.reset();
    this.ui.isMegaKnightActive = false;
    this.ui.activeMegaKnightId = null;
    this.isBotThinking = false;

    this.resetClocks();
    this.updateCapturedPieces();
    this.updateStatusBanner();
    this.ui.render();

    // Check if Bot plays first
    if (this.gameMode === 'bot' && this.botColor === 'w') {
      this.triggerBotTurn();
    } else if (this.gameMode === 'bot_vs_bot') {
      this.triggerBotTurn();
    }
  }

  resetClocks() {
    clearInterval(this.timerInterval);
    this.whiteTime = this.timeControl;
    this.blackTime = this.timeControl;
    this.updateClockDisplay();

    if (this.timeControl > 0) {
      this.timerInterval = setInterval(() => this.tickClock(), 1000);
    }
  }

  tickClock() {
    if (this.game.gameState !== 'active') {
      clearInterval(this.timerInterval);
      return;
    }

    if (this.game.turn === 'w') {
      this.whiteTime--;
      if (this.whiteTime <= 0) {
        this.whiteTime = 0;
        this.onTimeOut('w');
      }
    } else {
      this.blackTime--;
      if (this.blackTime <= 0) {
        this.blackTime = 0;
        this.onTimeOut('b');
      }
    }
    this.updateClockDisplay();
  }

  onTimeOut(color) {
    this.game.gameState = 'timeout';
    this.game.winner = (color === 'w') ? 'b' : 'w';
    this.game.winReason = `Time out! ${(this.game.winner === 'w' ? 'White' : 'Black')} wins on time!`;
    this.audio.playGameOver(this.game.winner === this.playerColor);
    this.showGameOverModal();
    this.ui.render();
  }

  updateClockDisplay() {
    const format = (sec) => {
      if (sec === 0 && this.timeControl === 0) return '∞';
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const wEl = document.getElementById('white-clock');
    const bEl = document.getElementById('black-clock');
    if (wEl) wEl.textContent = format(this.whiteTime);
    if (bEl) bEl.textContent = format(this.blackTime);

    if (wEl && this.whiteTime <= 30 && this.timeControl > 0) wEl.classList.add('low-time');
    else if (wEl) wEl.classList.remove('low-time');

    if (bEl && this.blackTime <= 30 && this.timeControl > 0) bEl.classList.add('low-time');
    else if (bEl) bEl.classList.remove('low-time');
  }

  // Execute standard piece move
  executePieceMove(move) {
    const fromPiece = this.game.board[move.from.x][move.from.y];
    const isW = isWhite(fromPiece);
    const targetPiece = this.game.board[move.to.x][move.to.y];

    const res = this.game.makeMove(move);
    if (!res || !res.success) return false;

    // Track captured pieces
    if (targetPiece !== PIECES.EMPTY) {
      if (isW) this.capturedBlack.push(PIECE_SYMBOLS[targetPiece]);
      else this.capturedWhite.push(PIECE_SYMBOLS[targetPiece]);
      this.audio.playCapture();
    } else if (move.isCastling) {
      this.audio.playCastle();
    } else {
      this.audio.playMove();
    }

    if (this.game.isInCheck(this.game.turn)) {
      this.audio.playCheck();
    }

    // 4-Knight Summon FX
    if (res.summonedMK) {
      for (const sm of res.summonedMK) {
        this.ui.triggerSummonFX(sm.vertex.vx, sm.vertex.vy);
      }
    }

    this.afterTurnAction();

    // Replicate in multiplayer
    if (this.gameMode === 'multiplayer') {
      this.multiplayer.sendMove(move);
    }

    return true;
  }

  // Player clicked "Roll D6"
  requestDiceRoll() {
    if (!this.isMyTurn() || this.ui.isMegaKnightActive) return;

    const rollRes = this.game.rollD6();
    if (!rollRes) return;

    // Broadcast in multiplayer immediately so remote player sees animation simultaneously
    if (this.gameMode === 'multiplayer') {
      this.multiplayer.sendDiceRoll(rollRes.roll, rollRes.success, rollRes.availableMoves);
    }

    this.ui.animateDiceRoll(rollRes.roll, () => {
      this.handleDiceRollResult(rollRes);
    });
  }

  handleDiceRollResult(rollRes) {
    if (rollRes.success) {
      // 6 ROLLED! Activate Mega Knight
      this.ui.isMegaKnightActive = true;
      this.ui.activeMegaKnightId = rollRes.availableMoves[0] ? rollRes.availableMoves[0].mkId : null;
      this.ui.render();
      this.updateStatusBanner('🔥 ROLLED A 6! Select a destination vertex for the Mega Knight!');
    } else {
      // Failed roll (1-5): Turn passed!
      this.ui.isMegaKnightActive = false;
      this.ui.render();
      this.updateStatusBanner(`Rolled ${rollRes.roll} (Needs 6). Turn passed to ${(this.game.turn === 'w' ? 'White' : 'Black')}.`);
      this.afterTurnAction();
    }
  }

  // Execute Mega Knight jump to vertex (nvx, nvy)
  executeMegaKnightMove(mkId, nvx, nvy) {
    const res = this.game.moveMegaKnight(mkId, nvx, nvy);
    if (!res || !res.success) return false;

    // Crushed pieces
    for (const cp of res.crushed) {
      if (isWhite(cp.piece)) this.capturedWhite.push(cp.symbol);
      else this.capturedBlack.push(cp.symbol);
    }

    // Trigger visual crush shockwave & particle shatter
    this.ui.triggerCrushFX(nvx, nvy, res.crushed);

    // 4-Knight Summon FX if triggered
    if (res.summonedMK) {
      for (const sm of res.summonedMK) {
        this.ui.triggerSummonFX(sm.vertex.vx, sm.vertex.vy);
      }
    }

    this.ui.isMegaKnightActive = false;
    this.ui.activeMegaKnightId = null;

    this.afterTurnAction();

    // Replicate in multiplayer
    if (this.gameMode === 'multiplayer') {
      this.multiplayer.sendMegaKnightMove(mkId, nvx, nvy);
    }

    return true;
  }

  // Actions after any turn completion (Piece move, Mega Knight jump, or failed roll)
  afterTurnAction() {
    this.updateCapturedPieces();
    this.updateHistoryLog();
    this.updateStatusBanner();
    this.ui.render();

    // Check if game is over
    if (this.game.gameState !== 'active') {
      clearInterval(this.timerInterval);
      const isWin = (this.game.winner === this.playerColor);
      this.audio.playGameOver(isWin);
      this.showGameOverModal();
      return;
    }

    // Pass and Play board auto-flip option
    if (this.gameMode === 'pvp_local') {
      const autoFlip = document.getElementById('toggle-autoflip');
      if (autoFlip && autoFlip.checked) {
        this.ui.setFlipped(this.game.turn === 'b');
      }
    }

    // Trigger AI turn if applicable
    if ((this.gameMode === 'bot' && this.game.turn === this.botColor) || this.gameMode === 'bot_vs_bot') {
      this.triggerBotTurn();
    }
  }

  // AI Turn handler with smooth thinking delay
  triggerBotTurn() {
    if (this.game.gameState !== 'active') return;
    this.isBotThinking = true;
    this.updateStatusBanner(`🤖 Bot (${this.botDifficulty}) is calculating...`);

    const thinkTime = (this.botDifficulty === 'squire') ? 400 : 700;

    setTimeout(() => {
      const action = this.bot.getBestAction(this.game);

      if (action.action === 'roll_d6') {
        const rollRes = this.game.rollD6();
        this.ui.animateDiceRoll(rollRes.roll, () => {
          if (rollRes.success) {
            // Bot rolled 6! Execute its intended jump
            const intended = action.intendedJump;
            setTimeout(() => {
              this.isBotThinking = false;
              this.executeMegaKnightMove(intended.mkId, intended.nvx, intended.nvy);
            }, 500);
          } else {
            this.isBotThinking = false;
            this.updateStatusBanner(`🤖 Bot rolled ${rollRes.roll}. Turn passed.`);
            this.afterTurnAction();
          }
        });
      } else {
        // Standard piece move
        this.isBotThinking = false;
        this.executePieceMove(action.move);
      }
    }, thinkTime);
  }

  // Multiplayer Remote Handlers
  onRemotePieceMove(move) {
    this.executePieceMove(move);
  }

  onRemoteDiceRoll(roll, success, availableMoves) {
    this.ui.animateDiceRoll(roll, () => {
      this.handleDiceRollResult({ roll, success, availableMoves });
    });
  }

  onRemoteMegaKnightMove(mkId, nvx, nvy) {
    this.executeMegaKnightMove(mkId, nvx, nvy);
  }

  onMultiplayerGameStart(myColor) {
    this.playerColor = myColor;
    this.ui.setFlipped(myColor === 'b');
    this.startNewGame();
  }

  onRematchOffered() {
    this.showToast('Opponent offered a rematch! Tap Rematch to accept.');
  }

  onDrawOffered() {
    if (confirm('Opponent offered a draw. Accept?')) {
      this.multiplayer.sendDrawAccept();
      this.game.gameState = 'draw';
      this.game.winner = 'draw';
      this.game.winReason = 'Draw by mutual agreement.';
      this.ui.render();
      this.showGameOverModal();
    }
  }

  onOpponentResigned() {
    this.game.gameState = 'resignation';
    this.game.winner = this.multiplayer.myColor;
    this.game.winReason = 'Opponent resigned! You win!';
    this.audio.playGameOver(true);
    this.ui.render();
    this.showGameOverModal();
  }

  // UI Updates & Banners
  updateStatusBanner(customMsg) {
    const banner = document.getElementById('status-banner');
    if (!banner) return;

    if (customMsg) {
      banner.textContent = customMsg;
      return;
    }

    if (this.game.gameState !== 'active') {
      banner.textContent = this.game.winReason || 'Game Over';
      banner.className = 'status-banner game-over';
      return;
    }

    banner.className = 'status-banner';
    const isW = (this.game.turn === 'w');
    const playerText = isW ? "White's Turn" : "Black's Turn";

    if (this.game.isInCheck(this.game.turn)) {
      banner.textContent = `⚠️ CHECK! ${playerText}`;
      banner.classList.add('warning');
    } else {
      banner.textContent = `${playerText} - Move a piece or Roll D6 for Mega Knight!`;
    }
  }

  updateCapturedPieces() {
    const wCapEl = document.getElementById('captured-white');
    const bCapEl = document.getElementById('captured-black');
    if (wCapEl) {
      wCapEl.innerHTML = this.capturedWhite.map(sym => CHESS_SVGS[sym] || '').join('');
    }
    if (bCapEl) {
      bCapEl.innerHTML = this.capturedBlack.map(sym => CHESS_SVGS[sym] || '').join('');
    }
  }

  updateHistoryLog() {
    const list = document.getElementById('move-history-list');
    if (!list) return;

    list.innerHTML = '';
    this.game.history.forEach((rec, idx) => {
      const item = document.createElement('div');
      item.className = 'history-item';

      if (rec.type === 'piece') {
        const cap = rec.captured ? `x${rec.captured}` : '-';
        const promo = rec.promo ? `=${rec.promo.toUpperCase()}` : '';
        item.textContent = `${idx + 1}. [${rec.player.toUpperCase()}] ${rec.piece} ${rec.from}${cap}${rec.to}${promo}`;
      } else if (rec.type === 'megaknight') {
        const crushedText = rec.crushed.length > 0 ? ` (CRUSH: ${rec.crushed.map(c => c.square).join(', ')})` : '';
        item.textContent = `${idx + 1}. [${rec.player.toUpperCase()}] ♞MK ➔ (${rec.toVertex.vx}, ${rec.toVertex.vy})${crushedText}`;
        item.classList.add('history-mk');
      } else if (rec.type === 'dice_failed') {
        item.textContent = `${idx + 1}. [${rec.player.toUpperCase()}] Rolled ${rec.roll} (Missed 6)`;
        item.classList.add('history-miss');
      }

      list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
  }

  showGameOverModal() {
    const modal = document.getElementById('game-over-modal');
    if (!modal) return;

    const titleEl = modal.querySelector('.modal-title');
    const reasonEl = modal.querySelector('.modal-reason');

    if (titleEl) {
      if (this.game.winner === 'draw') {
        titleEl.textContent = 'Game Drawn!';
      } else if (this.gameMode === 'bot' || this.gameMode === 'multiplayer') {
        titleEl.textContent = (this.game.winner === this.playerColor) ? 'Victory! 🏆' : 'Defeat! 💀';
      } else {
        titleEl.textContent = `${(this.game.winner === 'w' ? 'White' : 'Black')} Wins!`;
      }
    }

    if (reasonEl) {
      reasonEl.textContent = this.game.winReason;
    }

    modal.classList.add('open');
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  // URL hash check for direct room join (e.g. #room=MK-123)
  checkUrlForRoomCode() {
    const hash = window.location.hash;
    const match = hash.match(/room=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      const code = match[1];
      setTimeout(() => {
        this.openMultiplayerModal(code);
      }, 500);
    }
  }

  openMultiplayerModal(initialCode = '') {
    const modal = document.getElementById('multiplayer-modal');
    if (!modal) return;
    modal.classList.add('open');

    const input = modal.querySelector('#join-room-input');
    if (input && initialCode) input.value = initialCode;
  }

  setupEventListeners() {
    // Mode selector tabs
    document.querySelectorAll('.mode-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        this.setGameMode(mode);
      });
    });

    // Bot difficulty selector
    const botSelect = document.getElementById('bot-difficulty-select');
    if (botSelect) {
      botSelect.addEventListener('change', (e) => {
        this.botDifficulty = e.target.value;
        this.bot.setDifficulty(this.botDifficulty);
      });
    }

    // Time control selector
    const timeSelect = document.getElementById('time-control-select');
    if (timeSelect) {
      timeSelect.addEventListener('change', (e) => {
        this.timeControl = parseInt(e.target.value, 10);
        this.resetClocks();
      });
    }

    // Flip board button
    const flipBtn = document.getElementById('btn-flip-board');
    if (flipBtn) {
      flipBtn.addEventListener('click', () => this.ui.toggleFlip());
    }

    // Sound toggle button
    const soundBtn = document.getElementById('btn-toggle-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const enabled = this.audio.toggleSound();
        soundBtn.textContent = enabled ? '🔊' : '🔇';
      });
    }

    // Rules modal trigger
    const rulesBtn = document.getElementById('btn-open-rules');
    const rulesModal = document.getElementById('rules-modal');
    if (rulesBtn && rulesModal) {
      rulesBtn.addEventListener('click', () => rulesModal.classList.add('open'));
    }

    // Close buttons for modals
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) modal.classList.remove('open');
      });
    });

    // Multiplayer room creation
    const btnCreateRoom = document.getElementById('btn-create-room');
    if (btnCreateRoom) {
      btnCreateRoom.addEventListener('click', async () => {
        btnCreateRoom.disabled = true;
        btnCreateRoom.textContent = 'Generating Room...';
        try {
          const colorChoice = document.getElementById('host-color-choice')?.value || 'w';
          const { roomCode, myColor } = await this.multiplayer.createRoom(colorChoice);
          this.gameMode = 'multiplayer';
          this.playerColor = myColor;
          this.ui.setFlipped(myColor === 'b');

          this.showRoomReadyUI(roomCode);
        } catch (err) {
          alert('Failed to create room: ' + err);
        } finally {
          btnCreateRoom.disabled = false;
          btnCreateRoom.textContent = 'Create Room';
        }
      });
    }

    // Multiplayer room join
    const btnJoinRoom = document.getElementById('btn-join-room');
    if (btnJoinRoom) {
      btnJoinRoom.addEventListener('click', async () => {
        const codeInput = document.getElementById('join-room-input');
        const code = codeInput ? codeInput.value.trim() : '';
        if (!code) {
          alert('Please enter a room code');
          return;
        }

        btnJoinRoom.disabled = true;
        btnJoinRoom.textContent = 'Connecting...';
        try {
          await this.multiplayer.joinRoom(code);
          this.gameMode = 'multiplayer';
          const modal = document.getElementById('multiplayer-modal');
          if (modal) modal.classList.remove('open');
        } catch (err) {
          alert('Failed to join room: ' + err);
        } finally {
          btnJoinRoom.disabled = false;
          btnJoinRoom.textContent = 'Join Room';
        }
      });
    }

    // Copy Invite Link
    const btnCopyLink = document.getElementById('btn-copy-invite');
    if (btnCopyLink) {
      btnCopyLink.addEventListener('click', () => {
        const code = this.multiplayer.roomCode;
        if (!code) return;
        const url = `${window.location.origin}${window.location.pathname}#room=${code}`;
        navigator.clipboard.writeText(url).then(() => {
          this.showToast('Invite link copied! Send it to your friend.');
        });
      });
    }

    // Native Web Share API
    const btnShare = document.getElementById('btn-share-invite');
    if (btnShare) {
      btnShare.addEventListener('click', () => {
        const code = this.multiplayer.roomCode;
        if (!code) return;
        const url = `${window.location.origin}${window.location.pathname}#room=${code}`;
        if (navigator.share) {
          navigator.share({
            title: 'Mega-Knight Chess Match!',
            text: `Play Mega-Knight Chess with me! Room Code: ${code}`,
            url
          }).catch(() => {});
        } else {
          navigator.clipboard.writeText(url);
          this.showToast('Link copied to clipboard!');
        }
      });
    }

    // Rematch button
    const btnRematch = document.getElementById('btn-rematch');
    if (btnRematch) {
      btnRematch.addEventListener('click', () => {
        const modal = document.getElementById('game-over-modal');
        if (modal) modal.classList.remove('open');

        if (this.gameMode === 'multiplayer') {
          this.multiplayer.sendRematchOffer();
          this.showToast('Rematch offer sent to opponent!');
        } else {
          this.startNewGame();
        }
      });
    }

    // Reaction emoji buttons
    document.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        this.ui.triggerReactionBubble(emoji, 'You');
        if (this.gameMode === 'multiplayer') {
          this.multiplayer.sendReaction(emoji);
        }
      });
    });

    // In-game chat input
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('btn-send-chat');
    const sendChatMessage = () => {
      if (!chatInput) return;
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';
      this.addChatMessage(text, 'You');
      if (this.gameMode === 'multiplayer') {
        this.multiplayer.sendChat(text);
      }
    };

    if (chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendChatMessage();
      });
    }
  }

  showRoomReadyUI(roomCode) {
    const roomInfoContainer = document.getElementById('room-active-info');
    if (!roomInfoContainer) return;
    roomInfoContainer.style.display = 'block';

    const codeDisplay = document.getElementById('display-room-code');
    if (codeDisplay) codeDisplay.textContent = roomCode;

    // Generate QR code for mobile scanning
    const qrContainer = document.getElementById('room-qr-code');
    if (qrContainer && typeof QRCode !== 'undefined') {
      qrContainer.innerHTML = '';
      const url = `${window.location.origin}${window.location.pathname}#room=${roomCode}`;
      new QRCode(qrContainer, {
        text: url,
        width: 140,
        height: 140,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  }

  setupMultiplayerCallbacks() {
    this.multiplayer.onStatusChange = ({ state, message, roomCode, latency }) => {
      const statusPill = document.getElementById('multiplayer-status-pill');
      if (statusPill) {
        statusPill.textContent = message || (state === 'connected' ? `Connected (${latency}ms)` : state);
        statusPill.className = `status-pill status-${state}`;
      }
    };

    this.multiplayer.onChatReceived = (text, sender) => {
      this.addChatMessage(text, sender);
    };

    this.multiplayer.onReactionReceived = (emoji, sender) => {
      this.ui.triggerReactionBubble(emoji, sender);
    };
  }

  addChatMessage(text, sender) {
    const log = document.getElementById('chat-messages-log');
    if (!log) return;
    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${sender === 'You' ? 'msg-outgoing' : 'msg-incoming'}`;
    msgEl.innerHTML = `<strong>${sender}:</strong> <span>${text}</span>`;
    log.appendChild(msgEl);
    log.scrollTop = log.scrollHeight;
  }

  setGameMode(mode) {
    this.gameMode = mode;
    const botControls = document.getElementById('bot-controls-panel');
    const mpControls = document.getElementById('multiplayer-controls-panel');

    if (botControls) botControls.style.display = (mode === 'bot') ? 'block' : 'none';
    if (mpControls) mpControls.style.display = (mode === 'multiplayer') ? 'block' : 'none';

    if (mode === 'multiplayer') {
      this.openMultiplayerModal();
    } else {
      this.multiplayer.cleanup();
      this.startNewGame();
    }
  }
}

// Instantiate on window load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new MegaKnightApp();
  window.app.init();
});
