document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const gameBoardElement = document.getElementById('game-board');
    const keyboardContainer = document.getElementById('keyboard');
    const errorMessageElement = document.getElementById('error-message');
    // const retryFetchButton = document.getElementById('retry-fetch-button'); // Not used in multiplayer focus
    
    const gameOverModal = document.getElementById('game-over-modal');
    const gameOverTitle = document.getElementById('game-over-title');
    const gameOverMessage = document.getElementById('game-over-message');
    const secretWordReveal = document.getElementById('secret-word-reveal');
    const playAgainButton = document.getElementById('play-again-button'); // For solo play
    const findNewGameModalButton = document.getElementById('find-new-game-modal-button');


    const themeToggleButton = document.getElementById('theme-toggle');

    // Single Player Stats display elements
    const gamesPlayedStat = document.getElementById('games-played-stat');
    const winPercentageStat = document.getElementById('win-percentage-stat');
    // const currentStreakStat = document.getElementById('current-streak-stat'); // Simpler stats for modal
    // const maxStreakStat = document.getElementById('max-streak-stat');

    // Multiplayer UI Elements
    const playerNameInput = document.getElementById('player-name-input');
    const findGameButton = document.getElementById('find-game-button');
    const gameStatusDisplay = document.getElementById('game-status');
    const leaderboardList = document.getElementById('leaderboard-list');

    // Game Constants
    const WORD_LENGTH = 5;
    const MAX_ATTEMPTS = 6;
    // Fallback words for solo mode if needed, multiplayer word comes from server
    const FALLBACK_WORDS = ["apple", "table", "chair", "grape", "house", "mouse", "light", "dream", "audio"];


    // Game State (local game)
    let secretWord = ''; // Will be set by server in multiplayer
    let currentAttempt = 0;
    let currentRow = 0;
    let currentGuess = [];
    let isGameOver = true; // Game starts as "over" until a mode is chosen or game starts
    let letterStates = {}; // For keyboard colors
    let errorTimeout;

    // Multiplayer State
    let socket;
    let myPlayerName = localStorage.getItem('wordlePlayerName') || '';
    playerNameInput.value = myPlayerName;
    let currentRoomId = null;
    let isMultiplayerGameActive = false;

    // --- SINGLE PLAYER GAME LOGIC (for "Play Solo Again") ---
    function initializeSoloGame() {
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
        updateLocalStatsDisplay(); // Display local stats
        gameStatusDisplay.textContent = "Playing Solo Mode.";
        findGameButton.disabled = false;
        gameBoardElement.classList.remove('waiting-opponent');
        keyboardContainer.classList.remove('waiting-opponent');
        document.getElementById('stats-display').classList.remove('hidden'); // Show solo stats
        findNewGameModalButton.classList.add('hidden');
    }

    function processSoloGuess() {
        if (isGameOver || currentGuess.length !== WORD_LENGTH) return;
        // Basic validation (can be expanded if you have a local dictionary for solo)
        const guessString = currentGuess.join('');

        // Feedback logic (same as original Wordle)
        const guessArray = guessString.split('');
        const secretArray = secretWord.split('');
        const feedback = new Array(WORD_LENGTH).fill(null);
        const tempSecret = [...secretArray];
        const rowTiles = gameBoardElement.children[currentRow].children;

        for (let i = 0; i < WORD_LENGTH; i++) {
            if (guessArray[i] === tempSecret[i]) {
                feedback[i] = 'correct'; updateKeyboard(guessArray[i], 'correct'); tempSecret[i] = null;
            }
        }
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
        applyFeedbackToTiles(rowTiles, guessArray, feedback); // Extracted to a function
        currentAttempt++;

        if (guessString === secretWord) {
            updateLocalStats(true);
            setTimeout(() => showSoloGameOver(true), WORD_LENGTH * 250 + 300);
            return;
        }
        if (currentAttempt >= MAX_ATTEMPTS) {
            updateLocalStats(false);
            setTimeout(() => showSoloGameOver(false), WORD_LENGTH * 250 + 300);
            return;
        }
        currentRow++; currentGuess = [];
    }
    
    function showSoloGameOver(isWin) {
        isGameOver = true;
        findGameButton.disabled = false; // Re-enable find game after solo game
        document.getElementById('stats-display').classList.remove('hidden');
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
        // Connect to the server; Vercel handles URL with relative path if served from same origin.
        // For local dev, if server is on different port: io('http://localhost:3001')
        socket = io({
            reconnectionAttempts: 5, // Try to reconnect a few times
            reconnectionDelay: 2000,  // Delay between attempts
        }); 

        socket.on("connect", () => {
            console.log("Connected to server with ID:", socket.id);
            gameStatusDisplay.textContent = "Connected. Enter name & find game!";
            findGameButton.disabled = false;
        });
        
        socket.on("connect_error", (err) => {
            console.error("Connection Error:", err.message);
            gameStatusDisplay.textContent = "Connection failed. Trying to reconnect...";
            // findGameButton.disabled = true; // Keep disabled or handle UI appropriately
        });
        
        socket.on("disconnect", (reason) => {
            console.log("Disconnected from server:", reason);
            gameStatusDisplay.textContent = "Disconnected. Check connection.";
            findGameButton.disabled = true; // Or re-enable to try connecting again via findGame click
            if (isMultiplayerGameActive) {
                // Handle abrupt disconnection during a game
                showError("Lost connection to the game server.");
                isGameOver = true;
                gameBoardElement.classList.add('waiting-opponent'); // Visually indicate issue
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

            socket.emit("findGame", myPlayerName);
            gameStatusDisplay.textContent = "Searching for an opponent...";
            findGameButton.disabled = true;
            isGameOver = true; // Prevent local play while searching
            gameBoardElement.classList.add('waiting-opponent');
            keyboardContainer.classList.add('waiting-opponent');
            hideGameOver(); // Hide any previous modal
        });
        
        findNewGameModalButton.addEventListener('click', () => {
            hideGameOver();
            findGameButton.click(); // Trigger the find game logic
        });


        socket.on("alreadyInGameOrSearching", (data) => {
            showTemporaryMessage(data.message, false);
            findGameButton.disabled = false; // Allow to try again if they somehow got here
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
            secretWord = data.word; // Server provides the word
            myPlayerName = data.myName; // Use name confirmed by server
            gameStatusDisplay.textContent = `Matched with ${data.opponentName}! Word set. Good luck!`;
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
            document.getElementById('stats-display').classList.add('hidden'); // Hide solo stats
            findNewGameModalButton.classList.remove('hidden');
            playAgainButton.classList.add('hidden');
        });

        socket.on("gameOver", (data) => {
            isGameOver = true;
            isMultiplayerGameActive = false;
            findGameButton.disabled = false;
            gameBoardElement.classList.remove('waiting-opponent');
            keyboardContainer.classList.remove('waiting-opponent');
            
            document.getElementById('stats-display').classList.add('hidden'); // Hide solo stats
            findNewGameModalButton.classList.remove('hidden'); // Show find new 1v1 game
            playAgainButton.classList.add('hidden'); // Hide play solo again

            gameOverModal.classList.remove('hidden');
            gameOverModal.classList.add('flex');
            gameOverTitle.textContent = data.result === "win" ? "VICTORY!" : (data.result === "lose" ? "DEFEAT!" : "IT'S A DRAW!");
            gameOverMessage.textContent = data.message;
            secretWordReveal.textContent = `The word was: ${data.word.toUpperCase()}`;
            if (data.result === "win" && gameBoardElement.children[currentRow]) { // If player won, animate their row
                gameBoardElement.children[currentRow].classList.add('winning-row');
            }
        });
        
        socket.on("waitingForOpponentFinish", (data) => {
            isGameOver = true; // Can't play anymore
            gameStatusDisplay.textContent = data.message;
            showTemporaryMessage(data.message, false); // Show it also as a temp message
            
            gameBoardElement.classList.add('waiting-opponent');
            keyboardContainer.classList.add('waiting-opponent');
            // Optionally reveal word if game is effectively over for this player
            // secretWordReveal.textContent = `The word was: ${data.word.toUpperCase()}`;
        });

        socket.on("opponentUpdate", (data) => { // e.g. opponent failed
            showTemporaryMessage(data.message, false); // Info type
        });


        socket.on("leaderboardUpdate", (newLeaderboard) => {
            leaderboardList.innerHTML = ''; // Clear previous
            if (newLeaderboard && newLeaderboard.length > 0) {
                newLeaderboard.forEach((p, index) => {
                    const li = document.createElement('li');
                    li.className = "flex justify-between";
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
                leaderboardList.innerHTML = '<li class="text-gray-400">Leaderboard is empty or loading...</li>';
            }
        });
    }
    // --- END OF MULTIPLAYER LOGIC ---


    // --- COMMON UI & GAME LOGIC ---
    function applyFeedbackToTiles(rowTiles, guessArray, feedback) {
        for (let i = 0; i < WORD_LENGTH; i++) {
            const tileContainer = rowTiles[i];
            const backFace = tileContainer.querySelector('.back');
            const letter = guessArray[i];

            backFace.textContent = letter.toUpperCase();
            backFace.classList.remove('tile-correct', 'tile-present', 'tile-absent');

            let feedbackClass = '';
            if (feedback[i] === 'correct') feedbackClass = 'tile-correct';
            else if (feedback[i] === 'present') feedbackClass = 'tile-present';
            else feedbackClass = 'tile-absent';

            backFace.classList.add(feedbackClass);

            setTimeout(() => {
                tileContainer.classList.add('flip');
                tileContainer.classList.remove('tile-filled', 'tile-empty', 'pop-animate');
                tileContainer.classList.add(feedbackClass);
            }, i * 250);
        }
    }

    function processCurrentGuess() { // Decides if it's solo or MP
        if (isGameOver || currentGuess.length !== WORD_LENGTH) return;

        if (isMultiplayerGameActive) {
            // In multiplayer, client still does local validation for UX, then server confirms win/loss
            const guessString = currentGuess.join('');
             // No local dictionary check needed for MP, server is authority for word list.
             // Client only checks length for now.

            // Local feedback for UI
            const guessArray = guessString.split('');
            const secretArray = secretWord.split(''); // secretWord is from server
            const feedback = new Array(WORD_LENGTH).fill(null);
            const tempSecret = [...secretArray];
            const rowTiles = gameBoardElement.children[currentRow].children;

            for (let i = 0; i < WORD_LENGTH; i++) {
                if (guessArray[i] === tempSecret[i]) {
                    feedback[i] = 'correct'; updateKeyboard(guessArray[i], 'correct'); tempSecret[i] = null;
                }
            }
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
            currentAttempt++;

            if (guessString === secretWord) {
                socket.emit("iWon", { attempts: currentAttempt });
                isGameOver = true; // Prevent further input while waiting for server confirmation
                gameStatusDisplay.textContent = "Correct! Waiting for server confirmation...";
            } else if (currentAttempt >= MAX_ATTEMPTS) {
                socket.emit("allAttemptsUsed", { attempts: currentAttempt });
                isGameOver = true; // Prevent further input
                gameStatusDisplay.textContent = "Out of attempts. Waiting for server...";
            } else {
                currentRow++;
                currentGuess = [];
            }
        } else {
            processSoloGuess(); // Fallback to solo game logic
        }
    }


    function handleKeyPress(key) {
        if (isGameOver && !isMultiplayerGameActive) { // Allow typing if MP game active but local isGameOver (e.g. waiting)
             if (!isMultiplayerGameActive || (isMultiplayerGameActive && gameBoardElement.classList.contains('waiting-opponent'))) return;
        }
        if(isGameOver && isMultiplayerGameActive && gameBoardElement.classList.contains('waiting-opponent')) return;


        key = key.toLowerCase();
        // Clear temporary error messages
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
                updateGameBoard(true); // letterAdded = true
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
        const currentRowTiles = gameBoardElement.children[currentRow]?.children;
        if (!currentRowTiles) return;

        for (let j = 0; j < WORD_LENGTH; j++) {
            const tileContainer = currentRowTiles[j];
            const frontFace = tileContainer.querySelector('.front');
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
                tileContainer.classList.add('tile-empty');
            }
            if (!tileContainer.classList.contains('tile-correct') &&
                !tileContainer.classList.contains('tile-present') &&
                !tileContainer.classList.contains('tile-absent')) {
                tileContainer.classList.remove('flip');
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
                keyButton.className = 'key flex-1 sm:flex-grow-0'; // Allow flex-1 for smaller screens
                if (key === 'enter' || key === 'backspace') {
                    keyButton.classList.add('special-key'); keyButton.style.flexGrow = "1.5";
                }
                if (key === 'backspace') keyButton.innerHTML = '&#9003;';
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
            // CSS handles fade out
        }, 2500);
    }
    
    function showError(message) { // For more persistent UI errors not tied to server messages
        clearTimeout(errorTimeout);
        errorMessageElement.textContent = message;
        const isLightMode = document.body.classList.contains('light-mode');
        errorMessageElement.className = isLightMode ? 'error-text-light' : 'error-text-dark';
        errorMessageElement.classList.add('show'); // Make it show with animation
        // No auto-hide for this type of error, user action or new state should clear it.
    }

    function clearError() {
        clearTimeout(errorTimeout);
        errorMessageElement.textContent = '';
        errorMessageElement.className = '';
        errorMessageElement.style.opacity = '0'; // Ensure hidden
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
             // Re-apply message style if it was persistent
             const isError = errorMessageElement.classList.contains('error-text-dark') || errorMessageElement.classList.contains('error-text-light');
             errorMessageElement.className = isLight ? (isError ? 'error-text-light' : 'info-text-light') : (isError ? 'error-text-dark' : 'info-text-dark');
             errorMessageElement.style.opacity = '1'; // Ensure visible
        }
    }

    function applyStoredTheme() {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme === 'light') document.body.classList.add('light-mode');
        else document.body.classList.remove('light-mode');
        themeToggleButton.textContent = document.body.classList.contains('light-mode') ? 'Dark Mode' : 'Light Mode';
    }

    // --- Local Stats for Solo Play ---
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
    playAgainButton.addEventListener('click', initializeSoloGame); // Solo play

    themeToggleButton.addEventListener('click', toggleTheme);

    document.addEventListener('keydown', (event) => {
        if (gameOverModal.classList.contains('hidden')) { // Only process game input if main modal not shown
            handleKeyPress(event.key);
        } else if (event.key === 'Enter' && !gameOverModal.classList.contains('hidden')) {
            // If modal is shown, Enter might trigger "Find New 1v1 Game" or "Play Solo Again"
            if (isMultiplayerGameActive || findNewGameModalButton.classList.contains('hidden') === false) { //If it was a MP game or that button is visible
                findNewGameModalButton.click();
            } else {
                playAgainButton.click();
            }
        }
    });

    // Initial Setup
    applyStoredTheme();
    loadLocalStats(); // Load solo stats
    updateLocalStatsDisplay();
    createKeyboard(); // Create keyboard once
    setupMultiplayer(); // Initialize Socket.IO connection and listeners
    
    // Default to solo game initially, or wait for user action
    // initializeSoloGame(); // Or leave blank until user clicks "Play Solo" or "Find Game"
    gameStatusDisplay.textContent = "Enter name & find a 1v1 game, or play solo.";
    createGameBoard(); // Create an empty board at start
});