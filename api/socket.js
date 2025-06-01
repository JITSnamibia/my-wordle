const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// --- Word List for the Server ---
// (Using a subset of the SGB list for brevity; in a real app, load from a file or DB)
const SGB_WORDS = [
    "cigar","rebut","sissy","humph","awake","blush","focal","evade","naval","serve","heath","dwarf","model","karma","stink","grade","quiet","bench","abate","feign","major","death","fresh","crust","stool","colon","abase","marry","react","batty","pride","floss","helix","croak","staff","paper","unfed","whelp","trawl","outdo","adobe","crazy","sower","repay","digit","crate","cluck","spike","mimic","pound","maxim","linen","unmet","flesh","booby","forth","first","stand","belly","ivory","seedy","print","yearn","drain","bribe","stout","panel","crass","flume","offal","agree","error","swirl","argue","bleed","delta","flick","totem","wooer","front","shrub","parry","biome","lapel","start","greet","goner","golem","lusty","loopy","round","audit","lying","gamma","labor","islet","civic","forge","corny","moult","basic","salad","agate","spicy","spray","essay","fjord","spend","kebab","guild","aback","motor","alone","hatch","hyper","thumb","dowry","ought","belch","dutch","pilot","tweed","comet","jaunt","enema","steed","abyss","growl","fling","dozen","boozy","erode","world","gouge","click","briar","great","altar","pulpy","blurt","coast","duchy","groin","fixer","group","rogue","badly","smart","pithy","gaudy","chill","heron","vodka","finer","surer","radio","rouge","perch","retch","wrote","clock","tilde","store","prove","bring","solve","cheat","grime","exult","usher","epoch","triad","break","rhino","viral","conic","masse","sonic","vital","trace","using","peach","champ","baton","brake","pluck","craze","gripe","weary","picky","acute","ferry","aside","tapir","troll","unify","rebus","boost","truss","siege","tiger","banal","slump","crank","gorge","query","drink","favor","abbey","tangy","panic","solar","shire","proxy","point","robot","prick","wince","crimp","knoll","sugar","whack","mount","perky","could","wrung","light","those","moist","shard","pleat","aloft","skill","elder","frame","humor","pause","ulcer","ultra","robin","cynic","agora","twirl","sound","overt","plant","lager","scary","sequel","meter","buddy","quack","SAUTE","LYRIC","ASCOT","FLACK","FLEEK","STUNG", "BROKE", "TWANG", "FLING", "SWILL", "BIRCH", "WOOZY"
].map(word => word.toLowerCase());


const io = new Server(server, {
  cors: {
    origin: "*", // In production, restrict this to your Vercel frontend URL
    methods: ["GET", "POST"]
  }
});

app.use(cors()); // Enable CORS for HTTP routes if any (though socket.io handles its own)

// --- In-memory data stores (Limitations apply for serverless) ---
let searchingPlayers = []; // Array of socket objects
let gameRooms = {}; // { roomId: { players: [{id, name, socket, finished, attempts}], word, status, winnerName } }
let leaderboard = []; // [{ name: 'PlayerX', score: 10 }, ...]

const MAX_LEADERBOARD_SIZE = 10;

function selectRandomWord() {
  return SGB_WORDS[Math.floor(Math.random() * SGB_WORDS.length)];
}

function updateLeaderboard(playerName) {
  if (!playerName || typeof playerName !== 'string' || playerName.trim() === '') return;

  let playerEntry = leaderboard.find(p => p.name.toLowerCase() === playerName.toLowerCase());
  if (playerEntry) {
    playerEntry.score += 1;
  } else {
    leaderboard.push({ name: playerName, score: 1 });
  }
  leaderboard.sort((a, b) => b.score - a.score); // Sort descending
  if (leaderboard.length > MAX_LEADERBOARD_SIZE) {
    leaderboard = leaderboard.slice(0, MAX_LEADERBOARD_SIZE);
  }
  io.emit("leaderboardUpdate", leaderboard); // Send to all connected clients
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  socket.emit("leaderboardUpdate", leaderboard); // Send current leaderboard on connect

  socket.on("findGame", (playerName) => {
    socket.playerName = playerName || `Guest${Math.floor(Math.random() * 1000)}`;
    console.log(`${socket.playerName} (ID: ${socket.id}) is looking for a game.`);

    // Prevent already searching player from searching again
    if (searchingPlayers.find(p => p.id === socket.id) || Object.values(gameRooms).find(room => room.players.find(p => p.id === socket.id))) {
        socket.emit("alreadyInGameOrSearching", { message: "You are already in a game or searching." });
        return;
    }

    searchingPlayers.push(socket);

    if (searchingPlayers.length >= 2) {
      const player1Socket = searchingPlayers.shift();
      const player2Socket = searchingPlayers.shift();
      const roomId = `room-${player1Socket.id}-${player2Socket.id}`;
      const secretWord = selectRandomWord();

      const roomData = {
        id: roomId,
        players: [
          { id: player1Socket.id, name: player1Socket.playerName, socket: player1Socket, finished: false, attempts: 0 },
          { id: player2Socket.id, name: player2Socket.playerName, socket: player2Socket, finished: false, attempts: 0 }
        ],
        word: secretWord,
        status: 'playing', // playing, finished
        winnerName: null
      };
      gameRooms[roomId] = roomData;

      player1Socket.join(roomId);
      player2Socket.join(roomId);
      player1Socket.gameRoomId = roomId; // Store roomId on socket for easy access
      player2Socket.gameRoomId = roomId;

      console.log(`Game starting: Room ${roomId}, Word: ${secretWord}, P1: ${player1Socket.playerName}, P2: ${player2Socket.playerName}`);
      
      player1Socket.emit("gameStarted", {
        roomId: roomId,
        word: secretWord,
        opponentName: player2Socket.playerName,
        myName: player1Socket.playerName
      });
      player2Socket.emit("gameStarted", {
        roomId: roomId,
        word: secretWord,
        opponentName: player1Socket.playerName,
        myName: player2Socket.playerName
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
      if (!player || player.finished) return; // Already finished or not in this room

      player.finished = true;
      player.attempts = attempts;
      room.winnerName = player.name;
      room.status = 'finished';

      console.log(`${player.name} won in room ${roomId} with ${attempts} attempts.`);
      updateLeaderboard(player.name);

      // Notify winner
      socket.emit("gameOver", { result: "win", word: room.word, message: `You guessed it in ${attempts} tries!` });

      // Notify loser (the other player)
      const opponent = room.players.find(p => p.id !== socket.id);
      if (opponent && opponent.socket) {
        opponent.socket.emit("gameOver", { result: "lose", word: room.word, message: `${player.name} finished first in ${attempts} tries!` });
      }
      // Consider cleaning up the room after a short delay or when players disconnect
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

      // Check if opponent also finished
      if (opponent && opponent.finished) { // Both finished, and no winner yet (meaning previous was also a fail)
        if (!room.winnerName) { // If no one won before this player failed
            room.status = 'finished';
            io.to(roomId).emit("gameOver", { result: "draw", word: room.word, message: "Neither of you got the word! It's a draw." });
        }
      } else if (opponent) { // Opponent still playing
        socket.emit("waitingForOpponentFinish", { word: room.word, message: "You didn't get it. Waiting for opponent..." });
        opponent.socket.emit("opponentUpdate", { message: `${player.name} has used all their attempts.` });
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
        if (opponent && opponent.socket) {
          room.winnerName = opponent.name;
          console.log(`${opponent.name} wins by default in room ${roomId} as ${disconnectedPlayer.name} disconnected.`);
          updateLeaderboard(opponent.name);
          opponent.socket.emit("gameOver", { result: "win", word: room.word, message: `${disconnectedPlayer.name} disconnected. You win!` });
        }
      }
      // Potentially remove room or mark as abandoned
      // delete gameRooms[roomId]; // This might be too soon if other player is still there
      console.log(`Player ${socket.playerName} disconnected from room ${roomId}.`);
    }
  });
});

// This is the crucial part for Vercel: export the server.
// Vercel will use this to handle requests to `/api/socket.js`.
// The `vercel.json` routes `/socket.io/` to this file.
module.exports = (req, res) => {
  // Allow Vercel to handle the HTTP server upgrade for WebSockets
  // by not directly calling server.listen if it's already handled by Vercel's environment
  if (!server.listening) {
    // This is more for local development. Vercel handles the listen part.
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      console.log(`Socket.IO server running locally on port ${PORT}`);
    });
  }
  // Ensure the original HTTP request/response objects are passed if needed by the underlying server
  // For Socket.IO, it primarily needs the server instance it's attached to.
  // The Vercel Node.js runtime will manage the request lifecycle for serverless functions.
  // If you had HTTP routes on `app`, you'd call `app(req, res)`.
  // For just Socket.IO, often just having it attached to the server is enough.
  // Vercel's runtime will invoke this function for requests to /api/socket.js.
  // Socket.IO will then handle its specific /socket.io/ paths.
  // Send a minimal response for non-Socket.IO HTTP GET requests to this path
  if (req.method === 'GET' && !req.url.startsWith('/socket.io/')) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send('Socket.IO server is active. Connect via WebSocket.');
    return;
  }
};

// For local development (npm run dev or npm start)
if (require.main === module && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = 3001;
    server.listen(PORT, () => {
        console.log(`DEVELOPMENT Socket.IO server listening on port ${PORT}`);
    });
}