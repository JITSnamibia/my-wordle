// script.js
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const gameBoardElement = document.getElementById('game-board');
    const keyboardContainer = document.getElementById('keyboard');
    const errorMessageElement = document.getElementById('error-message');
    const retryFetchButton = document.getElementById('retry-fetch-button');
    const gameOverModal = document.getElementById('game-over-modal');
    const gameOverTitle = document.getElementById('game-over-title');
    const gameOverMessage = document.getElementById('game-over-message');
    const secretWordReveal = document.getElementById('secret-word-reveal');
    const playAgainButton = document.getElementById('play-again-button');
    const themeToggleButton = document.getElementById('theme-toggle');

    // Stats display elements
    const gamesPlayedStat = document.getElementById('games-played-stat');
    const winPercentageStat = document.getElementById('win-percentage-stat');
    const currentStreakStat = document.getElementById('current-streak-stat');
    const maxStreakStat = document.getElementById('max-streak-stat');


    // Game Constants
    const WORD_LENGTH = 5;
    const MAX_ATTEMPTS = 6;
    const WORD_LIST_URL = 'https://raw.githubusercontent.com/charlesreid1/five-letter-words/master/sgb-words.txt';
    const FALLBACK_WORDS = ["apple", "table", "chair", "grape", "house", "mouse", "light", "dream", "earth", "water", "audio", "query", "style", "react", "clone"];


    // Game State
    let wordList = [];
    let validGuessList = []; // For faster guess validation if different from selection pool
    let secretWord = '';
    let currentAttempt = 0; // 0-5 (for 6 attempts)
    let currentRow = 0; // Index of the current row on the board
    let currentGuess = []; // Array of characters for the current guess
    let isGameOver = false;
    let isFetching = false;
    let letterStates = {}; // Tracks keyboard letter colors: {'a': 'correct', 'b': 'present', 'c': 'absent'}

    // --- 1. WORD LIST MANAGEMENT ---
    async function fetchWordList() {
        if (isFetching) return;
        isFetching = true;
        showTemporaryMessage('Fetching word list...', false);
        retryFetchButton.classList.add('hidden');
        gameBoardElement.classList.add('opacity-50'); // Dim game board during fetch

        try {
            const response = await fetch(WORD_LIST_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const text = await response.text();
            // Filter for 5-letter words consisting only of letters
            const fetchedWords = text.split('\n')
                                .map(word => word.trim().toLowerCase())
                                .filter(word => word.length === WORD_LENGTH && /^[a-z]+$/.test(word));

            if (fetchedWords.length === 0) {
                throw new Error('Fetched list is empty or invalid.');
            }
            wordList = fetchedWords;
            validGuessList = new Set(wordList); // Use a Set for O(1) lookups for guess validation
            console.log(`Fetched ${wordList.length} words.`);
            clearError();
        } catch (error) {
            console.error('Failed to fetch word list:', error);
            showError(`Error fetching words. Using a small fallback list. You can try to `, true);
            retryFetchButton.classList.remove('hidden');
            wordList = FALLBACK_WORDS;
            validGuessList = new Set(wordList);
        } finally {
            isFetching = false;
            gameBoardElement.classList.remove('opacity-50');
            if (wordList.length > 0) {
                initializeGame();
            } else {
                showError('Critical error: No word list available. Please refresh.', false);
            }
        }
    }

    // --- 2. CORE GAME LOGIC ---
    function selectSecretWord() {
        if (wordList.length === 0) {
            console.error("Word list is empty. Cannot select a secret word.");
            // This case should ideally be prevented by fetchWordList's error handling
            secretWord = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
            return;
        }
        secretWord = wordList[Math.floor(Math.random() * wordList.length)];
        console.log(`Secret Word: ${secretWord}`); // For debugging/development
    }

    function isValidGuess(word) {
        return validGuessList.has(word.toLowerCase());
    }

    function processGuess() {
        if (isGameOver || currentGuess.length !== WORD_LENGTH) return;

        const guessString = currentGuess.join('');

        if (!isValidGuess(guessString)) {
            showTemporaryMessage("Not in word list");
            shakeCurrentRow();
            return;
        }

        const guessArray = guessString.split('');
        const secretArray = secretWord.split('');
        const feedback = new Array(WORD_LENGTH).fill(null);
        const tempSecret = [...secretArray]; // To handle duplicate letters correctly
        const rowTiles = gameBoardElement.children[currentRow].children;

        // First pass: Check for 'correct' (green) letters
        for (let i = 0; i < WORD_LENGTH; i++) {
            if (guessArray[i] === tempSecret[i]) {
                feedback[i] = 'correct';
                updateKeyboard(guessArray[i], 'correct');
                tempSecret[i] = null; // Mark as used for this specific match type
            }
        }

        // Second pass: Check for 'present' (yellow) and 'absent' (gray) letters
        for (let i = 0; i < WORD_LENGTH; i++) {
            if (feedback[i] === null) { // Only process if not already 'correct'
                const letterIndexInSecret = tempSecret.indexOf(guessArray[i]);
                if (letterIndexInSecret !== -1) { // Letter is in secret word but not in correct position
                    feedback[i] = 'present';
                    updateKeyboard(guessArray[i], 'present');
                    tempSecret[letterIndexInSecret] = null; // Mark as used for this match type
                } else {
                    feedback[i] = 'absent';
                    updateKeyboard(guessArray[i], 'absent');
                }
            }
        }

        // Apply feedback to tiles with flip animation
        for (let i = 0; i < WORD_LENGTH; i++) {
            const tileContainer = rowTiles[i];
            const backFace = tileContainer.querySelector('.back');
            const letter = guessArray[i];

            backFace.textContent = letter.toUpperCase();
            backFace.classList.remove('tile-correct', 'tile-present', 'tile-absent'); // Clear previous

            let feedbackClass = '';
            if (feedback[i] === 'correct') feedbackClass = 'tile-correct';
            else if (feedback[i] === 'present') feedbackClass = 'tile-present';
            else feedbackClass = 'tile-absent';

            backFace.classList.add(feedbackClass);

            setTimeout(() => {
                tileContainer.classList.add('flip');
                tileContainer.classList.remove('tile-filled', 'tile-empty');
                tileContainer.classList.add(feedbackClass); // Also apply to container for border, etc.
            }, i * 250); // Staggered animation
        }

        currentAttempt++;

        if (guessString === secretWord) {
            setTimeout(() => showGameOver(true), WORD_LENGTH * 250 + 300);
            return;
        }

        if (currentAttempt >= MAX_ATTEMPTS) {
            setTimeout(() => showGameOver(false), WORD_LENGTH * 250 + 300);
            return;
        }

        // Move to next row
        currentRow++;
        currentGuess = [];
    }

    function handleKeyPress(key) {
        if (isGameOver) return;
        key = key.toLowerCase();
        clearError(); // Clear any persistent error messages on new input

        if (key === 'enter') {
            if (currentGuess.length === WORD_LENGTH) {
                processGuess();
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
                updateGameBoard(true); // Pass true to indicate letter added (for pop animation)
            }
        }
    }

    // --- 3. UI & UX ---
    function createGameBoard() {
        gameBoardElement.innerHTML = ''; // Clear previous board
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            const row = document.createElement('div');
            row.className = 'grid grid-cols-5 gap-1.5'; // Tailwind classes for row
            for (let j = 0; j < WORD_LENGTH; j++) {
                const tileContainer = document.createElement('div');
                tileContainer.className = 'tile tile-empty';

                const frontFace = document.createElement('div');
                frontFace.className = 'front';

                const backFace = document.createElement('div');
                backFace.className = 'back';

                tileContainer.appendChild(frontFace);
                tileContainer.appendChild(backFace);
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

            // Reset pop animation class
            tileContainer.classList.remove('pop-animate');

            if (j < currentGuess.length) {
                frontFace.textContent = currentGuess[j].toUpperCase();
                tileContainer.classList.add('tile-filled');
                tileContainer.classList.remove('tile-empty');
                if (letterAdded && j === currentGuess.length - 1) {
                    // Add class for pop animation, remove after animation. Style.css handles animation name.
                    tileContainer.classList.add('pop-animate'); // This class itself doesn't exist, using keyframe 'pop' directly
                }
            } else {
                frontFace.textContent = '';
                tileContainer.classList.remove('tile-filled');
                tileContainer.classList.add('tile-empty');
            }
             // Remove flip class from tiles in current row if any (e.g. from a previous game)
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
                keyButton.className = 'key flex-grow'; // Added flex-grow for better spacing on smaller rows
                if (key === 'enter' || key === 'backspace') {
                    keyButton.classList.add('special-key');
                    keyButton.style.flexGrow = "1.5"; // Make special keys a bit wider
                }
                 if (key === 'backspace') keyButton.innerHTML = '&#9003;'; // Backspace icon
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
        keyButtons.forEach(button => {
            button.classList.remove('key-correct', 'key-present', 'key-absent');
        });
    }

    let errorTimeout;
    function showTemporaryMessage(message, isError = true) {
        clearTimeout(errorTimeout);
        errorMessageElement.textContent = message;
        errorMessageElement.className = isError ? 'text-red-400 font-medium' : 'text-blue-300 font-medium';
        if (document.body.classList.contains('light-mode')) {
             errorMessageElement.className = isError ? 'text-red-600 font-medium' : 'text-blue-600 font-medium';
        }

        errorTimeout = setTimeout(() => {
            if (errorMessageElement.textContent === message) {
                 clearError();
            }
        }, 2500);
    }
    
    function showError(message, allowRetry = false) {
        errorMessageElement.textContent = message;
        errorMessageElement.className = 'text-red-400 font-medium';
         if (document.body.classList.contains('light-mode')) {
            errorMessageElement.className = 'text-red-600 font-medium';
        }
        retryFetchButton.classList.toggle('hidden', !allowRetry);
    }


    function clearError() {
        errorMessageElement.textContent = '';
        retryFetchButton.classList.add('hidden');
    }

    function shakeCurrentRow() {
        if (currentRow < MAX_ATTEMPTS) {
            const rowElement = gameBoardElement.children[currentRow];
            rowElement.classList.add('shake');
            setTimeout(() => {
                rowElement.classList.remove('shake');
            }, 500);
        }
    }

    function showGameOver(isWin) {
        isGameOver = true;
        updateStats(isWin); // Update stats before showing them
        displayStats(); // Display updated stats on modal

        gameOverModal.classList.remove('hidden');
        gameOverModal.classList.add('flex');

        if (isWin) {
            gameOverTitle.textContent = 'Congratulations!';
            gameOverMessage.textContent = `You guessed the word in ${currentAttempt} ${currentAttempt === 1 ? 'try' : 'tries'}.`;
        } else {
            gameOverTitle.textContent = 'So Close!';
            gameOverMessage.textContent = 'Better luck next time!';
        }
        secretWordReveal.textContent = `The word was: ${secretWord.toUpperCase()}`;
    }

    function hideGameOver() {
        gameOverModal.classList.add('hidden');
        gameOverModal.classList.remove('flex');
    }


    // --- NICE-TO-HAVE ENHANCEMENTS ---
    // Light/Dark Mode
    function toggleTheme() {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        themeToggleButton.textContent = isLight ? 'Dark Mode' : 'Light Mode';
        // Re-apply error message color if visible
        if (errorMessageElement.textContent) {
            const isErrorType = errorMessageElement.classList.contains('text-red-400') || errorMessageElement.classList.contains('text-red-600');
            showTemporaryMessage(errorMessageElement.textContent, isErrorType);
        }
    }

    function applyStoredTheme() {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme === 'light') {
            document.body.classList.add('light-mode');
        } else {
            document.body.classList.remove('light-mode'); // Default is dark
        }
        themeToggleButton.textContent = document.body.classList.contains('light-mode') ? 'Dark Mode' : 'Light Mode';
    }

    // Session Statistics
    let stats = { gamesPlayed: 0, wins: 0, currentStreak: 0, maxStreak: 0 };

    function loadStats() {
        const storedStats = localStorage.getItem('wordleCloneStats');
        if (storedStats) {
            stats = JSON.parse(storedStats);
        }
    }

    function saveStats() {
        localStorage.setItem('wordleCloneStats', JSON.stringify(stats));
    }

    function updateStats(isWin) {
        stats.gamesPlayed++;
        if (isWin) {
            stats.wins++;
            stats.currentStreak++;
            if (stats.currentStreak > stats.maxStreak) {
                stats.maxStreak = stats.currentStreak;
            }
        } else {
            stats.currentStreak = 0;
        }
        saveStats();
    }

    function displayStats() {
        gamesPlayedStat.textContent = stats.gamesPlayed;
        const winPercentage = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
        winPercentageStat.textContent = `${winPercentage}%`;
        currentStreakStat.textContent = stats.currentStreak;
        maxStreakStat.textContent = stats.maxStreak;
    }

    // --- INITIALIZATION ---
    function initializeGame() {
        isGameOver = false;
        currentAttempt = 0;
        currentRow = 0;
        currentGuess = [];
        clearError();
        hideGameOver();
        selectSecretWord();
        createGameBoard(); // Recreates the visual board (clears previous tiles and flips)
        resetKeyboardColors();
        updateGameBoard(); // Sets up the first row for input
        displayStats(); // Initial display of stats (might be all zeros or loaded)
    }

    // Event Listeners
    retryFetchButton.addEventListener('click', () => {
        if (!isFetching) {
            fetchWordList();
        }
    });

    playAgainButton.addEventListener('click', () => {
        initializeGame();
    });

    themeToggleButton.addEventListener('click', toggleTheme);

    document.addEventListener('keydown', (event) => {
        if (gameOverModal.classList.contains('hidden')) { // Only process game input if modal is not shown
            if (event.key === 'Enter') {
                handleKeyPress('enter');
            } else if (event.key === 'Backspace') { // Physical 'Delete' key often behaves like backspace in text inputs
                handleKeyPress('backspace');
            } else if (event.key.length === 1 && event.key.match(/[a-z]/i)) {
                handleKeyPress(event.key.toLowerCase());
            }
        } else if (event.key === 'Enter' && !gameOverModal.classList.contains('hidden')) {
            // Allow Enter to also dismiss the game over modal / play again
            initializeGame();
        }
    });

    // Start the game
    applyStoredTheme();
    loadStats();
    createKeyboard(); // Create keyboard once
    fetchWordList(); // This will then call initializeGame() if successful
});