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
    let validGuessList = new Set();
    let secretWord = '';
    let currentAttempt = 0;
    let currentRow = 0;
    let currentGuess = [];
    let isGameOver = false;
    let isFetching = false;
    let letterStates = {};
    let errorTimeout;


    // --- 1. WORD LIST MANAGEMENT ---
    async function fetchWordList() {
        if (isFetching) return;
        isFetching = true;
        showTemporaryMessage('Fetching word list...', false); // false for info type
        retryFetchButton.classList.add('hidden');
        gameBoardElement.classList.add('opacity-50');

        try {
            const response = await fetch(WORD_LIST_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const text = await response.text();
            const fetchedWords = text.split('\n')
                                .map(word => word.trim().toLowerCase())
                                .filter(word => word.length === WORD_LENGTH && /^[a-z]+$/.test(word));

            if (fetchedWords.length === 0) {
                throw new Error('Fetched list is empty or invalid.');
            }
            wordList = fetchedWords;
            validGuessList = new Set(wordList);
            console.log(`Fetched ${wordList.length} words.`);
            // Clear "Fetching..." message
            if (errorMessageElement.textContent === 'Fetching word list...') {
                clearError();
            }
        } catch (error) {
            console.error('Failed to fetch word list:', error);
            // Display persistent error with retry option
            showError(`Error fetching words. Using fallback. `, true); // true for retry
            wordList = FALLBACK_WORDS;
            validGuessList = new Set(wordList);
        } finally {
            isFetching = false;
            gameBoardElement.classList.remove('opacity-50');
            if (wordList.length > 0) {
                initializeGame();
            } else {
                showError('Critical error: No word list. Please refresh.', false); // false no retry
            }
        }
    }

    // --- 2. CORE GAME LOGIC ---
    function selectSecretWord() {
        if (wordList.length === 0) {
            secretWord = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
            return;
        }
        secretWord = wordList[Math.floor(Math.random() * wordList.length)];
        console.log(`Secret Word: ${secretWord}`);
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
        const tempSecret = [...secretArray];
        const rowTiles = gameBoardElement.children[currentRow].children;

        for (let i = 0; i < WORD_LENGTH; i++) {
            if (guessArray[i] === tempSecret[i]) {
                feedback[i] = 'correct';
                updateKeyboard(guessArray[i], 'correct');
                tempSecret[i] = null;
            }
        }

        for (let i = 0; i < WORD_LENGTH; i++) {
            if (feedback[i] === null) {
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
                tileContainer.classList.remove('tile-filled', 'tile-empty');
                tileContainer.classList.add(feedbackClass);
            }, i * 250);
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

        currentRow++;
        currentGuess = [];
    }

    function handleKeyPress(key) {
        if (isGameOver) return;
        key = key.toLowerCase();
        // Clear temporary error messages on new input, but not persistent fetch errors
        if (!retryFetchButton.classList.contains('hidden') && errorMessageElement.textContent.includes('Error fetching words')) {
           // Don't clear fetch error on key press, only specific message types
        } else if (errorMessageElement.classList.contains('show')) {
            // If it's a temporary message, let it fade or clear it
            // For now, new input will make it disappear if it was a "not enough letters" etc.
        }


        if (key === 'enter') {
            if (currentGuess.length === WORD_LENGTH) {
                clearError(); // Clear "Not enough letters" if shown before successful submit
                processGuess();
            } else {
                showTemporaryMessage("Not enough letters");
                shakeCurrentRow();
            }
        } else if (key === 'backspace' || key === 'delete') {
            if (currentGuess.length > 0) {
                clearError(); // Clear other messages when backspacing
                currentGuess.pop();
                updateGameBoard();
            }
        } else if (key.length === 1 && key >= 'a' && key <= 'z') {
            if (currentGuess.length < WORD_LENGTH) {
                clearError(); // Clear other messages when typing
                currentGuess.push(key);
                updateGameBoard(true); // letterAdded = true for animation
            }
        }
    }

    // --- 3. UI & UX ---
    function createGameBoard() {
        gameBoardElement.innerHTML = '';
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            const row = document.createElement('div');
            row.className = 'grid grid-cols-5 gap-1.5';
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

            tileContainer.classList.remove('pop-animate'); // Remove for potential re-trigger

            if (j < currentGuess.length) {
                frontFace.textContent = currentGuess[j].toUpperCase();
                if (!tileContainer.classList.contains('tile-filled')) { // Only add if not already filled (prevents re-animating existing)
                    tileContainer.classList.add('tile-filled');
                    tileContainer.classList.remove('tile-empty');
                }
                if (letterAdded && j === currentGuess.length - 1) {
                    void tileContainer.offsetWidth; // Force reflow
                    tileContainer.classList.add('pop-animate');
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
                keyButton.className = 'key flex-grow';
                if (key === 'enter' || key === 'backspace') {
                    keyButton.classList.add('special-key');
                    keyButton.style.flexGrow = "1.5";
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
        keyButtons.forEach(button => {
            button.classList.remove('key-correct', 'key-present', 'key-absent');
        });
    }

    function showTemporaryMessage(message, isErrorType = true) {
        clearTimeout(errorTimeout);
        errorMessageElement.textContent = message;
        errorMessageElement.classList.remove('show', 'error-text-dark', 'info-text-dark', 'error-text-light', 'info-text-light');
        void errorMessageElement.offsetWidth; // Trigger reflow

        const isLightMode = document.body.classList.contains('light-mode');
        if (isErrorType) {
            errorMessageElement.classList.add(isLightMode ? 'error-text-light' : 'error-text-dark');
        } else {
            errorMessageElement.classList.add(isLightMode ? 'info-text-light' : 'info-text-dark');
        }
        errorMessageElement.classList.add('show');

        errorTimeout = setTimeout(() => {
            // CSS animation handles fading out, but we can clear the content after.
            // Check if it's still the same message to avoid clearing a new one.
            if (errorMessageElement.textContent === message) {
                // Let CSS hide it, then clear content if needed, or just let it be overridden
            }
        }, 2500); // Animation duration
    }
    
    function showError(message, allowRetry = false) { // For persistent errors like fetch failure
        clearTimeout(errorTimeout); // Clear any temporary message timeout
        errorMessageElement.textContent = message;
        // Use error styling, but don't add 'show' class for CSS animation if it's persistent
        errorMessageElement.classList.remove('show', 'info-text-dark', 'info-text-light'); // remove info/show
        const isLightMode = document.body.classList.contains('light-mode');
        errorMessageElement.className = isLightMode ? 'error-text-light' : 'error-text-dark'; // Apply base error style
        errorMessageElement.style.opacity = '1'; // Make sure it's visible if 'show' was removed

        retryFetchButton.classList.toggle('hidden', !allowRetry);
    }

    function clearError() { // Clears any message
        clearTimeout(errorTimeout);
        errorMessageElement.textContent = '';
        errorMessageElement.className = ''; // Remove all style/animation classes
        errorMessageElement.style.opacity = '0'; // Hide it if not animated out
        retryFetchButton.classList.add('hidden');
    }


    function shakeCurrentRow() {
        if (currentRow < MAX_ATTEMPTS && gameBoardElement.children[currentRow]) {
            const rowElement = gameBoardElement.children[currentRow];
            rowElement.classList.remove('shake'); // remove to re-trigger
            void rowElement.offsetWidth; // force reflow
            rowElement.classList.add('shake');
        }
    }

    function showGameOver(isWin) {
        isGameOver = true;
        updateStats(isWin);
        displayStats();

        gameOverModal.classList.remove('hidden');
        gameOverModal.classList.add('flex');
        // Modal panel animation is handled by CSS on its child div

        if (isWin) {
            gameOverTitle.textContent = 'Congratulations!';
            gameOverMessage.textContent = `You guessed the word in ${currentAttempt} ${currentAttempt === 1 ? 'try' : 'tries'}.`;
            if (gameBoardElement.children[currentRow]) {
                gameBoardElement.children[currentRow].classList.add('winning-row');
            }
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
    function toggleTheme() {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        themeToggleButton.textContent = isLight ? 'Dark Mode' : 'Light Mode';
        
        // Re-apply error/info message style if one is currently visible and persistent
        if (errorMessageElement.textContent && !errorMessageElement.classList.contains('show')) {
            if (errorMessageElement.classList.contains('error-text-dark') || errorMessageElement.classList.contains('error-text-light')) {
                errorMessageElement.className = isLight ? 'error-text-light' : 'error-text-dark';
            } else if (errorMessageElement.classList.contains('info-text-dark') || errorMessageElement.classList.contains('info-text-light')) {
                 errorMessageElement.className = isLight ? 'info-text-light' : 'info-text-dark';
            }
        }
    }

    function applyStoredTheme() {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme === 'light') {
            document.body.classList.add('light-mode');
        } else {
            document.body.classList.remove('light-mode');
        }
        themeToggleButton.textContent = document.body.classList.contains('light-mode') ? 'Dark Mode' : 'Light Mode';
    }

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
        if (!errorMessageElement.textContent.includes('Error fetching words')) { // Don't clear fetch error
            clearError();
        }
        hideGameOver();

        const rows = gameBoardElement.children;
        for (let i = 0; i < rows.length; i++) {
            rows[i].classList.remove('winning-row');
        }

        selectSecretWord();
        createGameBoard();
        resetKeyboardColors();
        updateGameBoard();
        displayStats();
    }

    // Event Listeners
    retryFetchButton.addEventListener('click', () => {
        if (!isFetching) {
            clearError(); // Clear the fetch error message before retrying
            fetchWordList();
        }
    });

    playAgainButton.addEventListener('click', () => {
        initializeGame();
    });

    themeToggleButton.addEventListener('click', toggleTheme);

    document.addEventListener('keydown', (event) => {
        if (gameOverModal.classList.contains('hidden')) {
            if (event.key === 'Enter') {
                handleKeyPress('enter');
            } else if (event.key === 'Backspace') {
                handleKeyPress('backspace');
            } else if (event.key.length === 1 && event.key.match(/[a-z]/i)) {
                handleKeyPress(event.key.toLowerCase());
            }
        } else if (event.key === 'Enter' && !gameOverModal.classList.contains('hidden')) {
            initializeGame();
        }
    });

    // Start the game
    applyStoredTheme();
    loadStats();
    createKeyboard();
    fetchWordList();
});