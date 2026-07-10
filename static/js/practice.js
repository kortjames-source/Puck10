// NHL 10 Clues - Practice Game Logic

let gameState = {
    active: false,
    currentRound: 1, // 1 to 10
    baseScore: 200,
    wrongGuesses: 0,
    betRound: null,
    clues: [],
    completed: false,
    won: false,
    finalScore: 0,
    guesses: []
};

const countryFlags = {
    "canada": "🇨🇦",
    "united states": "🇺🇸",
    "usa": "🇺🇸",
    "russia": "🇷🇺",
    "sweden": "🇸🇪",
    "finland": "🇫🇮",
    "czechia": "🇨🇿",
    "czech republic": "🇨🇿",
    "slovakia": "🇸🇰",
    "germany": "🇩🇪",
    "switzerland": "🇨🇭",
    "latvia": "🇱🇻",
    "denmark": "🇩🇰",
    "norway": "🇳🇴",
    "france": "🇫🇷",
    "austria": "🇦🇹",
    "belarus": "🇧🇾",
    "slovenia": "🇸🇮",
    "united kingdom": "🇬🇧",
    "great britain": "🇬🇧",
    "ukraine": "🇺🇦",
    "kazakhstan": "🇰🇿"
};

function getCountryFlag(countryName) {
    if (!countryName) return "";
    const name = countryName.trim().toLowerCase();
    return countryFlags[name] || "";
}


// DOM Elements
let startBetBtn, skipBetBtn, betCards, prebetContainer, gameContainer, clueList,
    guessInput, submitGuessBtn, skipClueBtn, autocompleteSuggestions,
    scoreVal, roundVal, betVal, resultsModal, resultsModalOverlay,
    resultTitle, resultScore, correctPlayerName,
    statsWrongGuesses, statsCluesRevealed, statsBetBonus, statsBetText,
    practiceLimitContainer, practiceGameRoot;

document.addEventListener("DOMContentLoaded", () => {
    initDOMElements();
    loadPracticeGame();
});

function initDOMElements() {
    startBetBtn = document.getElementById("start-bet-btn");
    skipBetBtn = document.getElementById("skip-bet-btn");
    betCards = document.querySelectorAll(".bet-card");
    prebetContainer = document.getElementById("prebet-container");
    gameContainer = document.getElementById("game-container");
    clueList = document.getElementById("clue-list");
    guessInput = document.getElementById("guess-input");
    submitGuessBtn = document.getElementById("submit-guess-btn");
    skipClueBtn = document.getElementById("skip-clue-btn");
    autocompleteSuggestions = document.getElementById("autocomplete-suggestions");
    
    scoreVal = document.getElementById("score-val");
    roundVal = document.getElementById("round-val");
    betVal = document.getElementById("bet-val");

    // Modal
    resultsModalOverlay = document.getElementById("results-modal-overlay");
    resultsModal = document.getElementById("results-modal");
    resultTitle = document.getElementById("result-title");
    resultScore = document.getElementById("result-score");
    correctPlayerName = document.getElementById("correct-player-name");

    // Modal Stats
    statsWrongGuesses = document.getElementById("stats-wrong-guesses");
    statsCluesRevealed = document.getElementById("stats-clues-revealed");
    statsBetBonus = document.getElementById("stats-bet-bonus");
    statsBetText = document.getElementById("stats-bet-text");

    // Practice specifics
    practiceLimitContainer = document.getElementById("practice-limit-container");
    practiceGameRoot = document.getElementById("practice-game-root");

    // Event Listeners
    if (betCards) {
        betCards.forEach(card => {
            card.addEventListener("click", () => {
                betCards.forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                gameState.betRound = parseInt(card.dataset.round);
            });
        });
    }

    if (startBetBtn) startBetBtn.addEventListener("click", startGame);
    if (skipBetBtn) {
        skipBetBtn.addEventListener("click", () => {
            gameState.betRound = null;
            startGame();
        });
    }

    if (skipClueBtn) skipClueBtn.addEventListener("click", skipClue);
    if (submitGuessBtn) submitGuessBtn.addEventListener("click", submitGuess);

    if (guessInput) {
        guessInput.addEventListener("input", handleAutocomplete);
        guessInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                submitGuess();
            }
        });
    }

    // Close autocomplete on click outside
    document.addEventListener("click", (e) => {
        if (autocompleteSuggestions && !autocompleteSuggestions.contains(e.target) && e.target !== guessInput) {
            autocompleteSuggestions.innerHTML = "";
        }
    });
}

// Fetch random player clues
async function loadPracticeGame() {
    // Reset game state
    gameState = {
        active: false,
        currentRound: 1,
        baseScore: 200,
        wrongGuesses: 0,
        betRound: 10, // Default to 10
        clues: [],
        completed: false,
        won: false,
        finalScore: 0,
        guesses: []
    };

    // Restore guess input elements
    const guessBox = document.querySelector(".guess-box");
    const actionButtons = document.querySelector(".action-buttons");
    if (guessBox) guessBox.style.display = "block";
    if (actionButtons) actionButtons.style.display = "flex";
    
    const statusMsg = document.getElementById("game-status-completed");
    if (statusMsg) statusMsg.remove();
    
    // Hide guesses container
    const guessesContainer = document.getElementById("guesses-container");
    if (guessesContainer) guessesContainer.style.display = "none";

    // Reset UI selections
    if (betCards) {
        betCards.forEach(c => c.classList.remove("selected"));
        const defaultCard = document.querySelector(".bet-card[data-round='10']");
        if (defaultCard) defaultCard.classList.add("selected");
    }

    // Reset clue elements visually
    for (let i = 1; i <= 10; i++) {
        const item = document.getElementById(`clue-item-${i}`);
        if (item) {
            item.className = "clue-item unrevealed";
            const content = item.querySelector(".clue-content");
            if (content) content.innerHTML = "---";
        }
    }

    if (guessInput) guessInput.value = "";
    if (resultsModalOverlay) resultsModalOverlay.style.display = "none";

    try {
        const response = await fetch("/api/random-player");
        const data = await response.json();

        if (response.status === 403 && data.error === "limit_reached") {
            if (practiceGameRoot) practiceGameRoot.style.display = "none";
            if (practiceLimitContainer) practiceLimitContainer.style.display = "block";
            return;
        }

        if (data.error) {
            alert("Error loading practice game: " + data.error);
            return;
        }

        gameState.clues = data.clues;

        // Show pre-bet screen
        if (practiceLimitContainer) practiceLimitContainer.style.display = "none";
        if (practiceGameRoot) practiceGameRoot.style.display = "block";
        if (prebetContainer) prebetContainer.style.display = "block";
        if (gameContainer) gameContainer.style.display = "none";

        // Update badge / heading practice counter if wanted
        const counterBadge = document.getElementById("practice-counter-badge");
        if (counterBadge) {
            if (data.is_premium) {
                counterBadge.innerText = `Premium Practice`;
            } else {
                counterBadge.innerText = `Practice Game ${data.practice_count} / 3`;
            }
        }

    } catch (err) {
        console.error("Error checking play status:", err);
    }
}

function renderGuesses() {
    const guessesContainer = document.getElementById("guesses-container");
    const guessesList = document.getElementById("guesses-list");
    if (!guessesContainer || !guessesList) return;

    if (!gameState.guesses || gameState.guesses.length === 0) {
        guessesContainer.style.display = "none";
        return;
    }

    guessesContainer.style.display = "block";
    guessesList.innerHTML = "";

    gameState.guesses.forEach((guessName, index) => {
        const isLast = index === gameState.guesses.length - 1;
        const isCorrect = gameState.won && isLast;

        const item = document.createElement("div");
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        item.style.padding = "0.5rem 0.75rem";
        item.style.borderRadius = "8px";
        item.style.fontSize = "0.9rem";
        
        if (isCorrect) {
            item.style.background = "rgba(34, 197, 94, 0.08)";
            item.style.border = "1px solid rgba(34, 197, 94, 0.2)";
            item.innerHTML = `
                <span style="font-weight: 600; color: #22c55e;">${guessName}</span>
                <span style="color: #22c55e; font-size: 0.8rem; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> Correct</span>
            `;
        } else {
            item.style.background = "rgba(239, 68, 68, 0.08)";
            item.style.border = "1px solid rgba(239, 68, 68, 0.2)";
            item.innerHTML = `
                <span style="font-weight: 500; color: var(--text-secondary);">${guessName}</span>
                <span style="color: var(--accent); font-size: 0.8rem;"><i class="fa-solid fa-circle-xmark"></i> Incorrect</span>
            `;
        }
        
        guessesList.appendChild(item);
    });
}

function updateGuessCardForCompleted(won, correctPlayer) {
    const guessBox = document.querySelector(".guess-box");
    const actionButtons = document.querySelector(".action-buttons");
    if (guessBox) guessBox.style.display = "none";
    if (actionButtons) actionButtons.style.display = "none";
    
    let statusMsg = document.getElementById("game-status-completed");
    if (!statusMsg) {
        statusMsg = document.createElement("div");
        statusMsg.id = "game-status-completed";
        statusMsg.style.marginTop = "1rem";
        statusMsg.style.textAlign = "center";
        
        const guessCard = document.querySelector(".guess-card");
        if (guessCard) {
            guessCard.appendChild(statusMsg);
        }
    }
    
    const textColor = won ? "#22c55e" : "#ef4444";
    const statusText = won ? "SUCCESS!" : "GAME OVER";
    
    statusMsg.innerHTML = `
        <div style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; color: ${textColor}; margin-bottom: 0.5rem;">
            ${statusText}
        </div>
        <div class="text-secondary" style="font-size: 0.9rem; margin-bottom: 0.5rem;">
            Mystery Player:
        </div>
        <div style="font-family: var(--font-sans); font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">
            ${correctPlayer}
        </div>
    `;
}

function startGame() {
    if (prebetContainer) prebetContainer.style.display = "none";
    if (gameContainer) gameContainer.style.display = "grid";

    gameState.active = true;
    updateScoreboard();
    revealRoundClue();
}

function updateScoreboard() {
    const currentBase = 200 - (gameState.currentRound - 1) * 10;
    const wrongPenalties = gameState.wrongGuesses * 5;
    let netScore = currentBase - wrongPenalties;

    // Check if pre-bet has been busted
    let betInfoText = "None";
    let betClass = "";
    if (gameState.betRound) {
        const bonus = (11 - gameState.betRound) * 10;
        const penalty = (11 - gameState.betRound) * 20;

        if (gameState.currentRound > gameState.betRound) {
            netScore -= penalty;
            betInfoText = `Clue ${gameState.betRound} (Busted: -${penalty} pts)`;
            betClass = "penalty";
        } else {
            betInfoText = `Clue ${gameState.betRound} (Pending: +${bonus} pts)`;
            betClass = "bonus";
        }
    }

    if (netScore < 0) netScore = 0;
    gameState.finalScore = netScore;

    if (scoreVal) scoreVal.innerText = `${netScore} pts`;
    if (roundVal) roundVal.innerText = `${gameState.currentRound} / 10`;
    if (betVal) {
        betVal.innerText = betInfoText;
        betVal.className = "info-value " + betClass;
    }
}

function revealClue(roundNum) {
    const clueItem = document.getElementById(`clue-item-${roundNum}`);
    if (clueItem) {
        clueItem.classList.remove("unrevealed");
        clueItem.classList.add("revealed");

        const content = clueItem.querySelector(".clue-content");
        if (content) {
            const rawClue = gameState.clues[roundNum - 1];
            if (!rawClue) return;
            
            if (roundNum === 8) {
                try {
                    const teams = JSON.parse(rawClue);
                    let html = '<div class="team-logos-container">';
                    teams.forEach(team => {
                        html += `<div class="team-logo-wrapper">`;
                        if (team.logo) {
                            html += `<img src="${team.logo}" alt="${team.name}" class="team-logo-img" onerror="this.remove()">`;
                        }
                        html += `<span class="team-logo-name">${team.name}</span></div>`;
                    });
                    html += '</div>';
                    content.innerHTML = html;
                } catch {
                    content.innerText = rawClue;
                }
            } else if (roundNum === 9 || roundNum === 10) {
                try {
                    const list = JSON.parse(rawClue);
                    if (Array.isArray(list)) {
                        content.innerHTML = `<ul style="list-style: disc; margin-left: 1.5rem;">${list.map(item => `<li>${item}</li>`).join('')}</ul>`;
                    } else {
                        content.innerText = rawClue;
                    }
                } catch {
                    content.innerText = rawClue;
                }
            } else if (roundNum === 3) {
                const flag = getCountryFlag(rawClue);
                content.innerText = flag ? `${flag} ${rawClue}` : rawClue;
            } else {
                content.innerText = rawClue;
            }
        }
    }
}

function revealRoundClue() {
    if (gameState.currentRound > 10) {
        endGame(false);
        return;
    }
    revealClue(gameState.currentRound);
}

function skipClue() {
    if (gameState.currentRound < 10) {
        gameState.currentRound++;
        updateScoreboard();
        revealRoundClue();
    } else {
        endGame(false);
    }
}

async function submitGuess() {
    const guessValue = guessInput.value.trim();
    if (!guessValue) return;

    submitGuessBtn.disabled = true;

    try {
        const response = await fetch("/api/guess-random", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guess: guessValue })
        });
        const data = await response.json();

        if (data.correct) {
            gameState.guesses.push(data.player_name);
            gameState.won = true;
            renderGuesses();
            endGame(true, data.player_name, data.headshot_url, data.hockeydb_url);
        } else {
            gameState.wrongGuesses++;
            gameState.guesses.push(guessValue);
            renderGuesses();
            showToast("Incorrect Guess! -5 points", "error");
            guessInput.value = "";
            updateScoreboard();
        }
    } catch (err) {
        console.error("Error submitting guess:", err);
    } finally {
        submitGuessBtn.disabled = false;
    }
}

function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `flash flash-${type}`;
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.zIndex = "2000";
    toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)";
    toast.style.animation = "slideIn 0.3s ease-out";
    
    toast.innerHTML = `<span class="flash-text">${message}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = "fadeIn 0.3s reverse ease-out";
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

async function endGame(won, playerName = "", headshotUrl = "", hockeydbUrl = "") {
    gameState.active = false;
    gameState.completed = true;
    gameState.won = won;

    let netScore = 0;
    if (won) {
        const currentBase = 200 - (gameState.currentRound - 1) * 10;
        const wrongPenalties = gameState.wrongGuesses * 5;
        netScore = currentBase - wrongPenalties;

        if (gameState.betRound) {
            const bonus = (11 - gameState.betRound) * 10;
            const penalty = (11 - gameState.betRound) * 20;

            if (gameState.currentRound <= gameState.betRound) {
                netScore += bonus;
            } else {
                netScore -= penalty;
            }
        }
    }

    if (netScore < 0) netScore = 0;
    gameState.finalScore = netScore;

    let finalPlayerName = playerName;
    let finalHeadshotUrl = headshotUrl;
    let finalHockeydbUrl = hockeydbUrl;

    if (!won) {
        try {
            const response = await fetch("/api/reveal-random", { method: "POST" });
            if (response.ok) {
                const data = await response.json();
                finalPlayerName = data.player_name;
                finalHeadshotUrl = data.headshot_url;
                finalHockeydbUrl = data.hockeydb_url;
            }
        } catch (err) {
            console.error("Error revealing practice player:", err);
        }
    }

    // Show modal results
    const finalPlayerToShow = finalPlayerName || "Unknown Player";

    // Reveal all 10 clues
    for (let i = 1; i <= 10; i++) {
        revealClue(i);
    }

    // Update the guess card area
    updateGuessCardForCompleted(won, finalPlayerToShow);

    showResultsModal(finalPlayerToShow, finalHeadshotUrl, finalHockeydbUrl);

    // Confetti!
    if (won && typeof confetti === "function") {
        confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 }
        });
    }
}

function showResultsModal(playerName, headshotUrl = "", hockeydbUrl = "") {
    if (resultTitle) {
        if (gameState.won) {
            resultTitle.innerText = "SUCCESS!";
            resultTitle.className = "result-title win";
        } else {
            resultTitle.innerText = "GAME OVER";
            resultTitle.className = "result-title loss";
        }
    }

    if (resultScore) resultScore.innerText = `${gameState.finalScore} pts`;
    if (correctPlayerName) correctPlayerName.innerText = playerName;

    // Setup HockeyDB profile links
    const playerLink = document.getElementById("correct-player-link");
    const photoContainer = document.getElementById("player-photo-container");
    const playerPhoto = document.getElementById("player-photo");
    const profileLinkTip = document.getElementById("profile-link-tip");

    const finalUrl = hockeydbUrl || `https://www.hockeydb.com/ihdb/stats/find_player.php?full_name=${encodeURIComponent(playerName)}`;

    if (playerLink) {
        playerLink.href = finalUrl;
    }

    if (photoContainer && playerPhoto) {
        if (headshotUrl) {
            playerPhoto.src = headshotUrl;
            photoContainer.style.display = "flex";
            photoContainer.href = finalUrl;
        } else {
            photoContainer.style.display = "none";
            playerPhoto.src = "";
            photoContainer.href = "";
        }
    }

    if (profileLinkTip) {
        profileLinkTip.style.display = "flex";
    }

    // Modal Stats
    if (statsWrongGuesses) statsWrongGuesses.innerText = gameState.wrongGuesses;
    if (statsCluesRevealed) statsCluesRevealed.innerText = gameState.currentRound;

    let bonusText = "0 pts";
    let betLabel = "No Bet";
    if (gameState.betRound) {
        const bonus = (11 - gameState.betRound) * 10;
        const penalty = (11 - gameState.betRound) * 20;
        if (gameState.won && gameState.currentRound <= gameState.betRound) {
            bonusText = `+${bonus} pts`;
            betLabel = `Clue ${gameState.betRound} Success`;
        } else {
            bonusText = `-${penalty} pts`;
            betLabel = `Clue ${gameState.betRound} Busted`;
        }
    }
    if (statsBetBonus) statsBetBonus.innerText = bonusText;
    if (statsBetText) statsBetText.innerText = betLabel;

    if (resultsModalOverlay) resultsModalOverlay.style.display = "flex";
}

function startNewPracticeGame() {
    loadPracticeGame();
}

// Autocomplete Logic
let autocompleteTimeout = null;

function handleAutocomplete() {
    const query = guessInput.value.trim();
    if (!query) {
        autocompleteSuggestions.innerHTML = "";
        return;
    }

    clearTimeout(autocompleteTimeout);
    autocompleteTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`);
            const names = await response.json();
            
            if (names.length > 0) {
                autocompleteSuggestions.innerHTML = names.map(name => `<div class="suggestion-item">${name}</div>`).join("");
                
                const items = autocompleteSuggestions.querySelectorAll(".suggestion-item");
                items.forEach(item => {
                    item.addEventListener("click", () => {
                        guessInput.value = item.innerText;
                        autocompleteSuggestions.innerHTML = "";
                    });
                });
            } else {
                autocompleteSuggestions.innerHTML = "";
            }
        } catch (err) {
            console.error("Autocomplete fetch error:", err);
        }
    }, 150);
}
