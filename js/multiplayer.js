/**
 * MegaKnight WebRTC PeerJS Multiplayer Engine
 * Zero backend server required - runs 100% on GitHub Pages via PeerJS Cloud!
 * Features:
 * - 5-character short room codes (e.g. MK-742)
 * - 1-click invite link & Web Share API (WhatsApp, Messages)
 * - In-screen QR code generation for mobile phone camera scanning
 * - Seeded synchronized 3D dice rolls
 * - Real-time piece & Mega Knight move replication
 * - Live reaction emojis (🔥, 😱, 🎲, 👑, 💥) & chat
 * - Rematch & Draw negotiations
 * - Heartbeat ping & connection health monitoring
 */

class MultiplayerManager {
  constructor(gameApp) {
    this.app = gameApp;
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = null;
    this.myColor = 'w'; // 'w' or 'b'
    this.opponentConnected = false;
    this.pingInterval = null;
    this.latency = 0;

    // Callbacks
    this.onStatusChange = null;
    this.onChatReceived = null;
    this.onReactionReceived = null;
  }

  // Generate short 5-character room code (e.g. "MK-489")
  static generateCode() {
    const num = Math.floor(100 + Math.random() * 900);
    return `MK-${num}`;
  }

  static getPeerId(roomCode) {
    return `mkchess-host-${roomCode.toUpperCase().trim()}`;
  }

  // Create a new room as Host
  createRoom(preferredColor = 'w') {
    return new Promise((resolve, reject) => {
      this.cleanup();
      this.isHost = true;
      this.roomCode = MultiplayerManager.generateCode();
      this.myColor = preferredColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : preferredColor;

      const peerId = MultiplayerManager.getPeerId(this.roomCode);
      this.peer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('PeerJS Host opened with ID:', id);
        this.updateStatus('waiting', `Waiting for opponent in room ${this.roomCode}...`);
        resolve({ roomCode: this.roomCode, myColor: this.myColor });
      });

      this.peer.on('connection', (connection) => {
        console.log('Opponent connecting to host...');
        this.conn = connection;
        this.setupConnectionEvents();
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS Host Error:', err);
        // If room code taken, retry with new code
        if (err.type === 'unavailable-id') {
          this.createRoom(preferredColor).then(resolve).catch(reject);
        } else {
          this.updateStatus('error', `Connection error: ${err.type}`);
          reject(err);
        }
      });
    });
  }

  // Join an existing room as Guest
  joinRoom(roomCode) {
    return new Promise((resolve, reject) => {
      this.cleanup();
      this.isHost = false;
      this.roomCode = roomCode.toUpperCase().trim();

      // Guest creates an ephemeral peer
      this.peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', () => {
        const hostPeerId = MultiplayerManager.getPeerId(this.roomCode);
        console.log(`Guest connecting to host ID: ${hostPeerId}`);
        this.updateStatus('connecting', `Connecting to room ${this.roomCode}...`);

        this.conn = this.peer.connect(hostPeerId, { reliable: true });
        this.setupConnectionEvents();
        resolve(this.roomCode);
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS Guest Error:', err);
        this.updateStatus('error', `Could not connect to room ${this.roomCode}: ${err.type}`);
        reject(err);
      });
    });
  }

  setupConnectionEvents() {
    if (!this.conn) return;

    this.conn.on('open', () => {
      console.log('WebRTC DataChannel connected!');
      this.opponentConnected = true;

      if (this.isHost) {
        const opponentColor = (this.myColor === 'w') ? 'b' : 'w';
        this.send({
          type: 'init_match',
          color: opponentColor,
          state: this.app.game.getState(),
          timeControl: this.app.timeControl
        });
        this.updateStatus('connected', `Opponent joined! Playing as ${(this.myColor === 'w' ? 'White' : 'Black')}.`);
      } else {
        this.updateStatus('connected', 'Connected to Host! Syncing game...');
      }

      this.startHeartbeat();
    });

    this.conn.on('data', (data) => {
      this.handleIncomingData(data);
    });

    this.conn.on('close', () => {
      console.log('Opponent disconnected.');
      this.opponentConnected = false;
      this.stopHeartbeat();
      this.updateStatus('disconnected', 'Opponent disconnected.');
    });

    this.conn.on('error', (err) => {
      console.error('Connection error:', err);
      this.updateStatus('error', `Connection error: ${err}`);
    });
  }

  handleIncomingData(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'init_match':
        this.myColor = msg.color;
        this.app.timeControl = msg.timeControl;
        this.app.game.loadState(msg.state);
        this.app.onMultiplayerGameStart(this.myColor);
        this.updateStatus('connected', `Game started! You are ${(this.myColor === 'w' ? 'White' : 'Black')}.`);
        break;

      case 'move_piece':
        this.app.onRemotePieceMove(msg.move);
        break;

      case 'roll_d6':
        this.app.onRemoteDiceRoll(msg.roll, msg.success, msg.availableMoves);
        break;

      case 'move_mk':
        this.app.onRemoteMegaKnightMove(msg.mkId, msg.nvx, msg.nvy);
        break;

      case 'sync_state':
        this.app.game.loadState(msg.state);
        this.app.ui.render();
        break;

      case 'chat':
        if (this.onChatReceived) {
          this.onChatReceived(msg.text, msg.sender);
        }
        break;

      case 'reaction':
        if (this.onReactionReceived) {
          this.onReactionReceived(msg.emoji, msg.sender);
        }
        break;

      case 'rematch_offer':
        this.app.onRematchOffered();
        break;

      case 'rematch_accept':
        this.app.startNewMultiplayerMatch();
        break;

      case 'draw_offer':
        this.app.onDrawOffered();
        break;

      case 'draw_accept':
        this.app.game.gameState = 'draw';
        this.app.game.winner = 'draw';
        this.app.game.winReason = 'Draw agreed by mutual agreement.';
        this.app.ui.render();
        break;

      case 'resign':
        this.app.onOpponentResigned();
        break;

      case 'ping':
        this.send({ type: 'pong', timestamp: msg.timestamp });
        break;

      case 'pong':
        this.latency = Math.round((Date.now() - msg.timestamp) / 2);
        this.updatePingDisplay();
        break;
    }
  }

  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }

  sendMove(move) {
    this.send({ type: 'move_piece', move });
  }

  sendDiceRoll(roll, success, availableMoves) {
    this.send({ type: 'roll_d6', roll, success, availableMoves });
  }

  sendMegaKnightMove(mkId, nvx, nvy) {
    this.send({ type: 'move_mk', mkId, nvx, nvy });
  }

  sendChat(text) {
    const sender = this.isHost ? 'Host' : 'Guest';
    this.send({ type: 'chat', text, sender });
  }

  sendReaction(emoji) {
    const sender = this.isHost ? 'Host' : 'Guest';
    this.send({ type: 'reaction', emoji, sender });
  }

  sendRematchOffer() {
    this.send({ type: 'rematch_offer' });
  }

  sendRematchAccept() {
    this.send({ type: 'rematch_accept' });
  }

  sendResign() {
    this.send({ type: 'resign' });
  }

  sendDrawOffer() {
    this.send({ type: 'draw_offer' });
  }

  sendDrawAccept() {
    this.send({ type: 'draw_accept' });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping', timestamp: Date.now() });
    }, 4000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  updateStatus(state, message) {
    if (this.onStatusChange) {
      this.onStatusChange({ state, message, roomCode: this.roomCode, latency: this.latency });
    }
  }

  updatePingDisplay() {
    this.updateStatus(this.opponentConnected ? 'connected' : 'waiting', null);
  }

  cleanup() {
    this.stopHeartbeat();
    if (this.conn) {
      try { this.conn.close(); } catch (e) {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
    this.opponentConnected = false;
    this.roomCode = null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MultiplayerManager };
}
