// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const gameBoardElement = document.getElementById('game-board');
    const keyboardContainer = document.getElementById('keyboard');
    const errorMessageElement = document.getElementById('error-message');
    
    const gameOverModal = document.getElementById('game-over-modal');
    const gameOverTitle = document.getElementById('game-over-title');
    const gameOverMessage = document.getElementById('game-over-message');
    const secretWordReveal = document.getElementById('secret-word-reveal');
    const playAgainButton = document.getElementById('play-again-button'); // For solo play
    const findNewGameModalButton = document.getElementById('find-new-game-modal-button');

    const themeToggleButton = document.getElementById('theme-toggle');

    // Single Player Stats display elements
    const statsDisplayDiv = document.getElementById('stats-display');
    const gamesPlayedStat = document.getElementById('games-played-stat');
    const winPercentageStat = document.getElementById('win-percentage-stat');

    // Multiplayer UI Elements
    const playerNameInput = document.getElementById('player-name-input');
    const findGameButton = document.getElementById('find-game-button');
    const gameStatusDisplay = document.getElementById('game-status');
    const leaderboardList = document.getElementById('leaderboard-list');

    // Game Constants
    const WORD_LENGTH = 5;
    const MAX_ATTEMPTS = 6;
    const FALLBACK_WORDS = ["apple", "table", "chair", "grape", "house", "mouse", "light", "dream", "audio", "world", "power", "gamer", "solve", "stone", "crane"];


    // Game State (local game)
    let secretWord = '';
    let currentAttempt = 0;
    let currentRow = 0;
    let currentGuess = [];
    let isGameOver = true; 
    let letterStates = {};
    let errorTimeout;

    // Multiplayer State
    let socket;
    let myPlayerName = localStorage.getItem('wordlePlayerName') || '';
    playerNameInput.value = myPlayerName;
    let currentRoomId = null;
    let isMultiplayerGameActive = false;

    // --- SINGLE PLAYER GAME LOGIC ---
    function initializeSoloGame() {
        console.log("Initializing Solo Game Mode");
        isMultiplayerGameActive = false;
        isGameOver = false;
        currentAttempt = 0;
        currentRow = 0;
        currentGuess = [];
        clearError();
        hideGameOver();
        secretWord = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
        console.log("Solo Secret Word:", secretWord);

        const rows = gameBoardElement.children;
        for (let i = 0; i < rows.length; i++) {
            rows[i].classList.remove('winning-row');
        }
        createGameBoard();
        resetKeyboardColors();
        updateGameBoard();
        updateLocalStatsDisplay();
        
        gameStatusDisplay.textContent = "Playing Solo Mode.";
        findGameButton.disabled = false;
        gameBoardElement.classList.remove('waiting-opponent');
        keyboardContainer.classList.remove('waiting-opponent');
        
        statsDisplayDiv.classList.remove('hidden'); // Show solo stats
        findNewGameModalButton.classList.add('hidden'); // Hide find new 1v1
        playAgainButton.classList.remove('hidden'); // Show play solo again
    }

    function processSoloGuess() {
        if (isGameOver || currentGuess.length !== WORD_LENGTH) return;
        const guessString = currentGuess.join('');

        // Basic client-side validation (can be expanded if you have a local dictionary for solo)
        // For now, just check length which is already done.

        const guessArray = guessString.split('');
        const secretArray = secretWord.split('');
        const feedback = new Array(WORD_LENGTH).fill(null);
        const tempSecret = [...secretArray];
        const rowTiles = gameBoardElement.children[currentRow].children;

        // First pass for 'correct'
        for (let i = 0; i < WORD_LENGTH; i++) {
            if (guessArray[i] === tempSecret[i]) {
                feedback[i] = 'correct'; 
                updateKeyboard(guessArray[i], 'correct'); 
                tempSecret[i] = null;
            }
        }
        // Second pass for 'present' and 'absent'
        for (let i = 0; i < WORD_LENGTH; i++) {
            if (feedback[i] === null) { // Only if not already correct
                const letterIndexInSecret = tempSecret.indexOf(guessArray[i]);
                if (letterIndexInSecret !== -1) {
                    feedback[i] = 'present'; 
                    updateKeyboard(guessArray[i], 'present'); 
                    tempSecret[letterIndexInSecret] = null;
                } else {
                    feedback[i] = 'absent'; 
                    updateKeyboard(guessArray[i], 'absent');
                }
            }
        }
        applyFeedbackToTiles(rowTiles, guessArray, feedback);
        currentAttempt++;

        if (guessString === secretWord) {
            updateLocalStats(true);
            if (gameBoardElement.children[currentRow]) {
                 gameBoardElement.children[currentRow].classList.add('winning-row');
            }
            setTimeout(() => showSoloGameOver(true), WORD_LENGTH * 250 + 500); // Delay for animation
            return;
        }
        if (currentAttempt >= MAX_ATTEMPTS) {
            updateLocalStats(false);
            setTimeout(() => showSoloGameOver(false), WORD_LENGTH * 250 + 300);
            return;
        }
        currentRow++; 
        currentGuess = [];
    }
    
    function showSoloGameOver(isWin) {
        isGameOver = true;
        findGameButton.disabled = false; 
        
        statsDisplayDiv.classList.remove('hidden');
        findNewGameModalButton.classList.add('hidden');
        playAgainButton.classList.remove('hidden');

        gameOverModal.classList.remove('hidden');
        gameOverModal.classList.add('flex');
        gameOverTitle.textContent = isWin ? 'Solo Win!' : 'Solo Game Over';
        gameOverMessage.textContent = isWin ? `You got it in ${currentAttempt} tries.` : 'Better luck next time (solo)!';
        secretWordReveal.textContent = `The word was: ${secretWord.toUpperCase()}`;
        updateLocalStatsDisplay();
    }
    // --- END OF SINGLE PLAYER SPECIFIC LOGIC ---


    // --- MULTIPLAYER LOGIC ---
    function setupMultiplayer() {
        const IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const socketURL = IS_LOCALHOST ? 'http://localhost:3001' : undefined;

        console.log(`Attempting to connect to Socket.IO server at: ${socketURL || window.location.origin}`);

        socket = io(socketURL, {
            reconnectionAttempts: 5,
            reconnectionDelay: 3000,
            timeout: 20000,
        }); 

        socket.on("connect", () => {
            console.log("Successfully connected to server with ID:", socket.id);
            gameStatusDisplay.textContent = "Connected! Enter name & find a game.";
            findGameButton.disabled = false;
        });
        
        socket.on("connect_error", (err) => {
            console.error("Connection Error:", err.message, err.cause ? err.cause : '');
            gameStatusDisplay.textContent = `Connection failed. Server might be down.`;
            findGameButton.disabled = true; // Disable if connection fails critically
        });
        
        socket.on("disconnect", (reason) => {
            console.log("Disconnected from server:", reason);
            gameStatusDisplay.textContent = "Disconnected. Check connection.";
            findGameButton.disabled = true; 
            if (isMultiplayerGameActive) {
                showError("Lost connection to the game server.");
                isGameOver = true;
                gameBoardElement.classList.add('waiting-opponent');
                keyboardContainer.classList.add('waiting-opponent');
            }
        });

        findGameButton.addEventListener('click', () => {
            myPlayerName = playerNameInput.value.trim();
            if (myPlayerName.length < 3) {
                showTemporaryMessage("Name must be at least 3 characters.", true);
                return;
            }
            localStorage.setItem('wordlePlayerName', myPlayerName);

            if (socket && socket.connected) {
                socket.emit("findGame", myPlayerName);
                gameStatusDisplay.textContent = `Hi ${myPlayerName}! Searching for an opponent...`;
                findGameButton.disabled = true;
                isGameOver = true; 
                gameBoardElement.classList.add('waiting-opponent');
                keyboardContainer.classList.add('waiting-opponent');
                hideGameOver(); 
            } else {
                showError("Not connected to server. Please wait or refresh.");
            }
        });
        
        findNewGameModalButton.addEventListener('click', () => {
            hideGameOver();
            if (socket && socket.connected) {
                findGameButton.click(); 
            } else {
                 showError("Not connected. Cannot find new game.");
            }
        });

        socket.on("alreadyInGameOrSearching", (data) => {
            showTemporaryMessage(data.message, false);
            findGameButton.disabled = false; 
            gameBoardElement.classList.remove('waiting-opponent');
            keyboardContainer.classList.remove('waiting-opponent');
        });

        socket.on("waitingForOpponent", () => {
            gameStatusDisplay.textContent = `Hi ${myPlayerName}! Waiting for an opponent...`;
            gameBoardElement.classList.add('waiting-opponent');
            keyboardContainer.classList.add('waiting-opponent');
        });

        socket.on("gameStarted", (data) => {
            currentRoomId = data.roomId;
            secretWord = data.word; 
            myPlayerName = data.myName; 
            gameStatusDisplay.textContent = `Matched with ${data.opponentName}! Word is set. Good luck!`;
            console.log(`MP Game Start! Room: ${data.roomId}, Word: ${secretWord}, MyName: ${myPlayerName}, Opponent: ${data.opponentName}`);
            
            isMultiplayerGameActive = true;
            isGameOver = false;
            currentAttempt = 0;
            currentRow = 0;
            currentGuess = [];
            clearError();
            hideGameOver();
            
            const rows = gameBoardElement.children;
            for (let i = 0; i < rows.length; i++) {
                rows[i].classList.remove('winning-row');
            }
            createGameBoard();
            resetKeyboardColors();
            updateGameBoard();
            
            findGameButton.disabled = true;
            gameBoardElement.classList.remove('waiting-opponent');
            keyboardContainer.classList.remove('waiting-opponent');
            
            statsDisplayDiv.classList.add('hidden'); 
            findNewGameModalButton.classList.remove('hidden');
            playAgainButton.classList.add('hidden');
        });

        socket.on("gameOver", (data) => {
            isGameOver = true;
            isMultiplayerGameActive = false;
            findGameButton.disabled = false;
            gameBoardElement.classList.remove('waiting-opponent');
            keyboardContainer.classList.remove('waiting-opponent');
            
            statsDisplayDiv.classList.add('hidden'); 
            findNewGameModalButton.classList.remove('hidden'); 
            playAgainButton.classList.add('hidden'); 

            gameOverModal.classList.remove('hidden');
            gameOverModal.classList.add('flex');
            gameOverTitle.textContent = data.result === "win" ? "VICTORY!" : (data.result === "lose" ? "DEFEAT!" : "IT'S A DRAW!");
            gameOverMessage.textContent = data.message;
            secretWordReveal.textContent = `The word was: ${data.word.toUpperCase()}`;
            
            // Animate winning row only if this client won and the row exists
            if (data.result === "win" && gameBoardElement.children[currentRow]) { 
                 // Ensure currentRow is correct for the winning guess
                const winningRowIndex = currentAttempt -1; // if currentAttempt was incremented after win
                if (gameBoardElement.children[winningRowIndex]) {
                     gameBoardElement.children[winningRowIndex].classList.add('winning-row');
                }
            }
        });
        
        socket.on("waitingForOpponentFinish", (data) => {
            isGameOver = true; 
            gameStatusDisplay.textContent = data.message;
            showTemporaryMessage(data.message, false); 
            
            gameBoardElement.classList.add('waiting-opponent');
            keyboardContainer.classList.add('waiting-opponent');
            // Don't reveal word here, gameOver event will do that.
        });

        socket.on("opponentUpdate", (data) => { 
            showTemporaryMessage(data.message, false); 
        });

        socket.on("leaderboardUpdate", (newLeaderboard) => {
            leaderboardList.innerHTML = ''; 
            if (newLeaderboard && newLeaderboard.length > 0) {
                newLeaderboard.forEach((p, index) => {
                    const li = document.createElement('li');
                    li.className = "flex justify-between py-0.5";
                    const rankName = document.createElement('span');
                    rankName.textContent = `${index + 1}. ${p.name}`;
                    const score = document.createElement('span');
                    score.textContent = `${p.score} wins`;
                    score.className = "font-semibold";
                    li.appendChild(rankName);
                    li.appendChild(score);
                    leaderboardList.appendChild(li);
                });
            } else {
                leaderboardList.innerHTML = '<li class="text-gray-400 italic">Leaderboard is empty.</li>';
            }
        });
    }
    // --- END OF MULTIPLAYER LOGIC ---


    // --- COMMON UI & GAME LOGIC ---
    function applyFeedbackToTiles(rowTiles, guessArray, feedback) {
        for (let i = 0; i < WORD_LENGTH; i++) {
            const tileContainer = rowTiles[i];
            if (!tileContainer) continue; // Safety check
            const backFace = tileContainer.querySelector('.back');
            if (!backFace) continue; // Safety check

            const letter = guessArray[i];
            backFace.textContent = letter.toUpperCase();
            backFace.classList.remove('tile-correct', 'tile-present', 'tile-absent');

            let feedbackClass = '';
            if (feedback[i] === 'correct') feedbackClass = 'tile-correct';
            else if (feedback[i] === 'present') feedbackClass = 'tile-present';
            else feedbackClass = 'tile-absent';

            if(feedbackClass) backFace.classList.add(feedbackClass);

            setTimeout(() => {
                tileContainer.classList.add('flip');
                tileContainer.classList.remove('tile-filled', 'tile-empty', 'pop-animate');
                if(feedbackClass) tileContainer.classList.add(feedbackClass);
            }, i * 250); // Stagger animation
        }
    }

    function processCurrentGuess() {
        if (isGameOver || currentGuess.length !== WORD_LENGTH) return;

        if (isMultiplayerGameActive) {
            const guessString = currentGuess.join('');
            // Local feedback for UI
            const guessArray = guessString.split('');
            const secretArray = secretWord.split(''); 
            const feedback = new Array(WORD_LENGTH).fill(null);
            const tempSecret = [...secretArray];
            const rowTiles = gameBoardElement.children[currentRow]?.children;

            if (!rowTiles) return; // Row doesn't exist

            // First pass for 'correct'
            for (let i = 0; i < WORD_LENGTH; i++) {
                if (guessArray[i] === tempSecret[i]) {
                    feedback[i] = 'correct'; updateKeyboard(guessArray[i], 'correct'); tempSecret[i] = null;
                }
            }
            // Second pass for 'present' and 'absent'
            for (let i = 0; i < WORD_LENGTH; i++) {
                if (feedback[i] === null) {
                    const letterIndexInSecret = tempSecret.indexOf(guessArray[i]);
                    if (letterIndexInSecret !== -1) {
                        feedback[i] = 'present'; updateKeyboard(guessArray[i], 'present'); tempSecret[letterIndexInSecret] = null;
                    } else {
                        feedback[i] = 'absent'; updateKeyboard(guessArray[i], 'absent');
                    }
                }
            }
            applyFeedbackToTiles(rowTiles, guessArray, feedback);
            currentAttempt++; // Increment attempt *after* processing the guess for UI

            if (guessString === secretWord) {
                socket.emit("iWon", { attempts: currentAttempt });
                isGameOver = true; 
                gameStatusDisplay.textContent = "Correct! Waiting for server...";
            } else if (currentAttempt >= MAX_ATTEMPTS) {
                socket.emit("allAttemptsUsed", { attempts: currentAttempt });
                isGameOver = true; 
                gameStatusDisplay.textContent = "Out of attempts. Waiting for server...";
            } else {
                currentRow++;
                currentGuess = [];
            }
        } else {
            processSoloGuess(); 
        }
    }

    function handleKeyPress(key) {
        if (isGameOver && !(isMultiplayerGameActive && !gameBoardElement.classList.contains('waiting-opponent') && !gameOverModal.classList.contains('flex'))) {
            // If game is over, generally block input
            // Exception: if it's an MP game, not waiting for opponent, and modal isn't shown (i.e., player can still type)
            if (!isMultiplayerGameActive) return; // Definitely block if solo and over
            if (isMultiplayerGameActive && (gameBoardElement.classList.contains('waiting-opponent') || gameOverModal.classList.contains('flex'))) return; // Block if MP and waiting or modal shown
        }


        key = key.toLowerCase();
        if (errorMessageElement.classList.contains('show') && !errorMessageElement.textContent.includes('Connection')) {
             clearError();
        }

        if (key === 'enter') {
            if (currentGuess.length === WORD_LENGTH) {
                processCurrentGuess();
            } else {
                showTemporaryMessage("Not enough letters");
                shakeCurrentRow();
            }
        } else if (key === 'backspace' || key === 'delete') {
            if (currentGuess.length > 0) {
                currentGuess.pop();
                updateGameBoard();
            }
        } else if (key.length === 1 && key >= 'a' && key <= 'z') {
            if (currentGuess.length < WORD_LENGTH) {
                currentGuess.push(key);
                updateGameBoard(true); 
            }
        }
    }

    function createGameBoard() {
        gameBoardElement.innerHTML = '';
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            const row = document.createElement('div');
            row.className = 'grid grid-cols-5 gap-1.5';
            for (let j = 0; j < WORD_LENGTH; j++) {
                const tileContainer = document.createElement('div');
                tileContainer.className = 'tile tile-empty';
                const frontFace = document.createElement('div'); frontFace.className = 'front';
                const backFace = document.createElement('div'); backFace.className = 'back';
                tileContainer.appendChild(frontFace); tileContainer.appendChild(backFace);
                row.appendChild(tileContainer);
            }
            gameBoardElement.appendChild(row);
        }
    }

    function updateGameBoard(letterAdded = false) {
        const currentRowElement = gameBoardElement.children[currentRow];
        if (!currentRowElement) return; // Current row might not exist if game just ended
        const currentRowTiles = currentRowElement.children;

        for (let j = 0; j < WORD_LENGTH; j++) {
            const tileContainer = currentRowTiles[j];
            if (!tileContainer) continue; // Safety

            const frontFace = tileContainer.querySelector('.front');
            if (!frontFace) continue; // Safety

            tileContainer.classList.remove('pop-animate');

            if (j < currentGuess.length) {
                frontFace.textContent = currentGuess[j].toUpperCase();
                 if (!tileContainer.classList.contains('tile-filled')) {
                    tileContainer.classList.add('tile-filled');
                    tileContainer.classList.remove('tile-empty');
                }
                if (letterAdded && j === currentGuess.length - 1) {
                    void tileContainer.offsetWidth; tileContainer.classList.add('pop-animate');
                }
            } else {
                frontFace.textContent = '';
                tileContainer.classList.remove('tile-filled', 'pop-animate');
                if (!tileContainer.classList.contains('flip')) { // Don't revert if already flipped
                    tileContainer.classList.add('tile-empty');
                     // Clear feedback classes if resetting for new input in current row before flip
                    tileContainer.classList.remove('tile-correct', 'tile-present', 'tile-absent');
                }
            }
            // If tile is not part of current guess and not flipped, ensure no feedback classes
            if (j >= currentGuess.length && !tileContainer.classList.contains('flip')) {
                tileContainer.classList.remove('tile-correct', 'tile-present', 'tile-absent');
            }
        }
    }

    function createKeyboard() {
        keyboardContainer.innerHTML = '';
        const keysLayout = [
            ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
            ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
            ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace']
        ];
        keysLayout.forEach(rowKeys => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'flex justify-center mb-1 w-full';
            rowKeys.forEach(key => {
                const keyButton = document.createElement('button');
                // Adjusted flex classes for better key sizing
                keyButton.className = 'key flex-1 h-12 mx-0.5 sm:flex-none sm:mx-1'; 
                if (key.length > 1) { // Enter, Backspace
                    keyButton.classList.add('special-key', 'px-3', 'sm:px-4');
                    keyButton.style.flexGrow = "1.5"; // Allow special keys to be wider
                } else {
                    keyButton.classList.add('px-2', 'sm:px-3'); // Regular keys
                }

                if (key === 'backspace') keyButton.innerHTML = '&#9003;'; // Icon for backspace
                else keyButton.textContent = key.toUpperCase();
                
                keyButton.dataset.key = key;
                keyButton.addEventListener('click', () => handleKeyPress(key));
                rowDiv.appendChild(keyButton);
            });
            keyboardContainer.appendChild(rowDiv);
        });
    }

    function updateKeyboard(letter, status) {
        if (letterStates[letter] === 'correct') return;
        if (letterStates[letter] === 'present' && status === 'absent') return;
        letterStates[letter] = status;
        const keyButtons = keyboardContainer.querySelectorAll('.key');
        keyButtons.forEach(button => {
            if (button.dataset.key === letter) {
                button.classList.remove('key-correct', 'key-present', 'key-absent');
                if (status === 'correct') button.classList.add('key-correct');
                else if (status === 'present') button.classList.add('key-present');
                else if (status === 'absent') button.classList.add('key-absent');
            }
        });
    }

    function resetKeyboardColors() {
        letterStates = {};
        const keyButtons = keyboardContainer.querySelectorAll('.key');
        keyButtons.forEach(button => button.classList.remove('key-correct', 'key-present', 'key-absent'));
    }

    function showTemporaryMessage(message, isErrorType = true) {
        clearTimeout(errorTimeout);
        errorMessageElement.textContent = message;
        errorMessageElement.classList.remove('show', 'error-text-dark', 'info-text-dark', 'error-text-light', 'info-text-light');
        void errorMessageElement.offsetWidth; 

        const isLightMode = document.body.classList.contains('light-mode');
        if (isErrorType) {
            errorMessageElement.classList.add(isLightMode ? 'error-text-light' : 'error-text-dark');
        } else {
            errorMessageElement.classList.add(isLightMode ? 'info-text-light' : 'info-text-dark');
        }
        errorMessageElement.classList.add('show');

        errorTimeout = setTimeout(() => {
            if(errorMessageElement.textContent === message) { // only clear if it's still the same message
                 errorMessageElement.classList.remove('show'); // Animation handles fade out
            }
        }, 2500);
    }
    
    function showError(message) { 
        clearTimeout(errorTimeout);
        errorMessageElement.textContent = message;
        const isLightMode = document.body.classList.contains('light-mode');
        errorMessageElement.className = isLightMode ? 'error-text-light' : 'error-text-dark';
        errorMessageElement.classList.add('show'); 
        errorMessageElement.style.opacity = '1'; 
    }

    function clearError() {
        clearTimeout(errorTimeout);
        errorMessageElement.textContent = '';
        errorMessageElement.className = '';
        errorMessageElement.style.opacity = '0';
    }

    function shakeCurrentRow() {
        if (currentRow < MAX_ATTEMPTS && gameBoardElement.children[currentRow]) {
            const rowElement = gameBoardElement.children[currentRow];
            rowElement.classList.remove('shake'); void rowElement.offsetWidth;
            rowElement.classList.add('shake');
        }
    }

    function hideGameOver() {
        gameOverModal.classList.add('hidden');
        gameOverModal.classList.remove('flex');
    }

    function toggleTheme() {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        themeToggleButton.textContent = isLight ? 'Dark Mode' : 'Light Mode';
        if (errorMessageElement.textContent && !errorMessageElement.classList.contains('show') && !errorMessageElement.textContent.includes('Connection')) {
             const isError = errorMessageElement.classList.contains('error-text-dark') || errorMessageElement.classList.contains('error-text-light');
             errorMessageElement.className = isLight ? (isError ? 'error-text-light' : 'info-text-light') : (isError ? 'error-text-dark' : 'info-text-dark');
             errorMessageElement.style.opacity = '1';
        }
    }

    function applyStoredTheme() {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme === 'light') document.body.classList.add('light-mode');
        else document.body.classList.remove('light-mode');
        themeToggleButton.textContent = document.body.classList.contains('light-mode') ? 'Dark Mode' : 'Light Mode';
    }

    // Local Stats for Solo Play
    let localStats = { gamesPlayed: 0, wins: 0 };
    function loadLocalStats() {
        const stored = localStorage.getItem('wordleSoloStats');
        if (stored) localStats = JSON.parse(stored);
    }
    function saveLocalStats() {
        localStorage.setItem('wordleSoloStats', JSON.stringify(localStats));
    }
    function updateLocalStats(isWin) {
        localStats.gamesPlayed++;
        if (isWin) localStats.wins++;
        saveLocalStats();
    }
    function updateLocalStatsDisplay() {
        gamesPlayedStat.textContent = localStats.gamesPlayed;
        winPercentageStat.textContent = localStats.gamesPlayed > 0 ? `${Math.round((localStats.wins / localStats.gamesPlayed) * 100)}%` : '0%';
    }

    // Event Listeners
    playAgainButton.addEventListener('click', initializeSoloGame);
    themeToggleButton.addEventListener('click', toggleTheme);

    document.addEventListener('keydown', (event) => {
        if (gameOverModal.classList.contains('hidden')) {
            handleKeyPress(event.key);
        } else if (event.key === 'Enter' && !gameOverModal.classList.contains('hidden')) {
            if (!findNewGameModalButton.classList.contains('hidden')) {
                findNewGameModalButton.click();
            } else if (!playAgainButton.classList.contains('hidden')) {
                playAgainButton.click();
            }
        }
    });

    // Initial Setup
    applyStoredTheme();
    loadLocalStats(); 
    updateLocalStatsDisplay();
    createKeyboard(); 
    setupMultiplayer(); 
    
    createGameBoard(); // Create an empty board at start
    gameStatusDisplay.textContent = "Enter name & find a 1v1 game, or play solo below.";
    // Optionally, uncomment to start a solo game by default:
    // initializeSoloGame(); 
});