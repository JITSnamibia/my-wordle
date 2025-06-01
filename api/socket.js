const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

// Create Express app and HTTP server ONCE when the module loads
const app = express();
const server = http.createServer(app); // Socket.IO needs an http.Server instance

// Configure CORS for Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*", // IMPORTANT: Restrict in production (e.g., "https://my-wordle-nine.vercel.app")
    methods: ["GET", "POST"]
  },
  // It's often good to explicitly match the path if Vercel's routing is tricky
  // path: '/socket.io/', // This is the default, so usually not needed if vercel.json is correct
});

// Optional: If you want Express to handle any non-Socket.IO GET requests to /api/socket
// (e.g., a health check)
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('Socket.IO server endpoint is running. Connect via WebSocket client.');
});


// --- Word List for the Server ---
const SGB_WORDS = [
    "cigar","rebut","sissy","humph","awake","blush","focal","evade","naval","serve","heath","dwarf","model","karma","stink","grade","quiet","bench","abate","feign","major","death","fresh","crust","stool","colon","abase","marry","react","batty","pride","floss","helix","croak","staff","paper","unfed","whelp","trawl","outdo","adobe","crazy","sower","repay","digit","crate","cluck","spike","mimic","pound","maxim","linen","unmet","flesh","booby","forth","first","stand","belly","ivory","seedy","print","yearn","drain","bribe","stout","panel","crass","flume","offal","agree","error","swirl","argue","bleed","delta","flick","totem","wooer","front","shrub","parry","biome","lapel","start","greet","goner","golem","lusty","loopy","round","audit","lying","gamma","labor","islet","civic","forge","corny","moult","basic","salad","agate","spicy","spray","essay","fjord","spend","kebab","guild","aback","motor","alone","hatch","hyper","thumb","dowry","ought","belch","dutch","pilot","tweed","comet","jaunt","enema","steed","abyss","growl","fling","dozen","boozy","erode","world","gouge","click","briar","great","altar","pulpy","blurt","coast","duchy","groin","fixer","group","rogue","badly","smart","pithy","gaudy","chill","heron","vodka","finer","surer","radio","rouge","perch","retch","wrote","clock","tilde","store","prove","bring","solve","cheat","grime","exult","usher","epoch","triad","break","rhino","viral","conic","masse","sonic","vital","trace","using","peach","champ","baton","brake","pluck","craze","gripe","weary","picky","acute","ferry","aside","tapir","troll","unify","rebus","boost","truss","siege","tiger","banal","slump","crank","gorge","query","drink","favor","abbey","tangy","panic","solar","shire","proxy","point","robot","prick","wince","crimp","knoll","sugar","whack","mount","perky","could","wrung","light","those","moist","shard","pleat","aloft","skill","elder","frame","humor","pause","ulcer","ultra","robin","cynic","agora","twirl","sound","overt","plant","lager","scary","sequel","meter","buddy","quack","saute","lyric","ascot","flack","fleek","stung", "broke", "twang", "fling", "swill", "birch", "woozy"
].map(word => word.toLowerCase());

// --- In-memory data stores (Limitations apply for serverless) ---
let searchingPlayers = [];
let gameRooms = {};
let leaderboard = [];
const MAX_LEADERBOARD_SIZE = 10;

function selectRandomWord() {
  return SGB_WORDS[Math.floor(Math.random() * SGB_WORDS.length)];
}

function updateLeaderboard(playerName) {
  if (!playerName || typeof playerName !== 'string' || playerName.trim() === '') return;
  const trimmedPlayerName = playerName.trim();

  let playerEntry = leaderboard.find(p => p.name.toLowerCase() === trimmedPlayerName.toLowerCase());
  if (playerEntry) {
    playerEntry.score += 1;
  } else {
    leaderboard.push({ name: trimmedPlayerName, score: 1 });
  }
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > MAX_LEADERBOARD_SIZE) {
    leaderboard = leaderboard.slice(0, MAX_LEADERBOARD_SIZE);
  }
  io.emit("leaderboardUpdate", leaderboard);
  console.log("Leaderboard updated:", leaderboard);
}

// --- Socket.IO Connection Logic ---
io.on("connection", (socket) => {
  console.log("User connected via Socket.IO:", socket.id);
  socket.emit("leaderboardUpdate", leaderboard);

  socket.on("findGame", (playerName) => {
    socket.playerName = (typeof playerName === 'string' && playerName.trim()) ? playerName.trim() : `Guest${Math.floor(Math.random() * 1000)}`;
    console.log(`${socket.playerName} (ID: ${socket.id}) is looking for a game.`);

    if (searchingPlayers.find(p => p.id === socket.id) || 
        Object.values(gameRooms).some(room => room.players.some(p => p.id === socket.id && room.status === 'playing'))) {
      console.log(`${socket.playerName} tried to search but is already searching or in an active game.`);
      socket.emit("alreadyInGameOrSearching", { message: "You are already searching or in an active game." });
      return;
    }
    
    searchingPlayers = searchingPlayers.filter(p => p.id !== socket.id);
    searchingPlayers.push(socket);

    if (searchingPlayers.length >= 2) {
      const player1Socket = searchingPlayers.shift();
      const player2Socket = searchingPlayers.shift();

      if (!player1Socket || !player1Socket.connected || !player2Socket || !player2Socket.connected) {
        console.log("One or more players disconnected while in queue. Returning remaining to queue if any.");
        if (player1Socket && player1Socket.connected) searchingPlayers.unshift(player1Socket);
        if (player2Socket && player2Socket.connected) searchingPlayers.unshift(player2Socket);
        if (player1Socket && player1Socket.connected && !searchingPlayers.find(p=>p.id === player1Socket.id)) player1Socket.emit("waitingForOpponent");
        if (player2Socket && player2Socket.connected && !searchingPlayers.find(p=>p.id === player2Socket.id)) player2Socket.emit("waitingForOpponent");
        return;
      }

      const roomId = `room-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const secretWord = selectRandomWord();

      const roomData = {
        id: roomId,
        players: [
          { id: player1Socket.id, name: player1Socket.playerName, socket: player1Socket, finished: false, attempts: 0 },
          { id: player2Socket.id, name: player2Socket.playerName, socket: player2Socket, finished: false, attempts: 0 }
        ],
        word: secretWord,
        status: 'playing',
        winnerName: null
      };
      gameRooms[roomId] = roomData;

      player1Socket.join(roomId);
      player2Socket.join(roomId);
      player1Socket.gameRoomId = roomId;
      player2Socket.gameRoomId = roomId;

      console.log(`Game starting: Room ${roomId}, Word: ${secretWord}, P1: ${player1Socket.playerName}, P2: ${player2Socket.playerName}`);
      
      player1Socket.emit("gameStarted", {
        roomId: roomId, word: secretWord, opponentName: player2Socket.playerName, myName: player1Socket.playerName
      });
      player2Socket.emit("gameStarted", {
        roomId: roomId, word: secretWord, opponentName: player1Socket.playerName, myName: player2Socket.playerName
      });

    } else {
      socket.emit("waitingForOpponent");
    }
  });

  socket.on("iWon", ({ attempts }) => {
    const roomId = socket.gameRoomId;
    const room = gameRooms[roomId];

    if (room && room.status === 'playing') {
      const player = room.players.find(p => p.id === socket.id);
      if (!player || player.finished) return;

      player.finished = true;
      player.attempts = attempts;
      room.winnerName = player.name;
      room.status = 'finished';

      console.log(`${player.name} won in room ${roomId} with ${attempts} attempts.`);
      updateLeaderboard(player.name);

      socket.emit("gameOver", { result: "win", word: room.word, message: `You guessed it in ${attempts} tries!` });

      const opponent = room.players.find(p => p.id !== socket.id);
      if (opponent && opponent.socket && opponent.socket.connected) {
        opponent.socket.emit("gameOver", { result: "lose", word: room.word, message: `${player.name} finished first in ${attempts} tries!` });
      }
    }
  });

  socket.on("allAttemptsUsed", ({ attempts }) => {
    const roomId = socket.gameRoomId;
    const room = gameRooms[roomId];

    if (room && room.status === 'playing') {
      const player = room.players.find(p => p.id === socket.id);
      if (!player || player.finished) return;

      player.finished = true;
      player.attempts = attempts;
      console.log(`${player.name} used all attempts in room ${roomId}.`);

      const opponent = room.players.find(p => p.id !== socket.id);

      if (opponent && opponent.finished) {
        if (!room.winnerName) { // Only declare draw if no one has won yet
            room.status = 'finished';
            // Emit to the room so both players get the draw message
            io.to(roomId).emit("gameOver", { result: "draw", word: room.word, message: "Neither of you got the word! It's a draw." });
        }
      } else if (opponent && opponent.socket && opponent.socket.connected) {
        socket.emit("waitingForOpponentFinish", { word: room.word, message: "You didn't get it. Waiting for opponent..." });
        opponent.socket.emit("opponentUpdate", { message: `${player.name} has used all their attempts.` });
      } else if (!opponent || !(opponent.socket && opponent.socket.connected)) { 
        socket.emit("gameOver", { result: "draw", word: room.word, message: "You didn't get the word, and opponent is unavailable." });
        room.status = 'finished';
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id, socket.playerName);
    searchingPlayers = searchingPlayers.filter(p => p.id !== socket.id);

    const roomId = socket.gameRoomId;
    if (roomId && gameRooms[roomId]) {
      const room = gameRooms[roomId];
      const disconnectedPlayer = room.players.find(p => p.id === socket.id);

      if (room.status === 'playing' && disconnectedPlayer) {
        room.status = 'finished';
        const opponent = room.players.find(p => p.id !== socket.id);
        if (opponent && opponent.socket && opponent.socket.connected) {
          room.winnerName = opponent.name;
          console.log(`${opponent.name} wins by default in room ${roomId} as ${disconnectedPlayer.name} disconnected.`);
          updateLeaderboard(opponent.name);
          opponent.socket.emit("gameOver", { result: "win", word: room.word, message: `${disconnectedPlayer.name} disconnected. You win!` });
        }
      }
      console.log(`Player ${socket.playerName || socket.id} disconnected from room ${roomId}.`);
      // Consider how to handle gameRooms cleanup for finished/abandoned rooms
      // For now, they stay in memory. A better solution would involve TTL or explicit cleanup.
    }
  });
});


// --- Vercel Serverless Function Handler ---
// This single export will be used by Vercel to handle incoming requests
// to /api/socket.js (and those rewritten from /socket.io/...).
// The `server` object (which `io` is attached to, and `app` uses) will handle them.
module.exports = (req, res) => {
  // This pattern ensures that the original HTTP server (which Socket.IO is attached to)
  // handles the request. Socket.IO will intercept its specific handshake requests.
  // Any other HTTP requests to /api/socket (if `app.get`, `app.post` routes were defined)
  // would be handled by Express.
  server.emit('request', req, res); 
};


// --- Local Development Startup (This part should NOT run on Vercel) ---
const IS_LOCAL_DEV = process.env.NODE_ENV !== 'production' && !process.env.VERCEL && !process.env.VERCEL_ENV;
if (IS_LOCAL_DEV) {
    const PORT = process.env.PORT || 3001;
    // We call listen on the 'server' instance that Socket.IO is attached to
    server.listen(PORT, () => {
        console.log(`DEVELOPMENT Socket.IO server listening on http://localhost:${PORT}`);
    });
}