// NHL 10 Clues - Client Game Logic

// List of famous NHL players for autocomplete
const FAMOUS_NHL_PLAYERS = [
    "Connor McDavid", "Sidney Crosby", "Alex Ovechkin", "Auston Matthews", "Nathan MacKinnon",
    "Cale Makar", "Leon Draisaitl", "Nikita Kucherov", "David Pastrnak", "Mitchell Marner",
    "Artemi Panarin", "Matthew Tkachuk", "Jack Hughes", "Adam Fox", "Roman Josi",
    "Victor Hedman", "Steven Stamkos", "Patrick Kane", "Evgeni Malkin", "Erik Karlsson",
    "Brad Marchand", "Connor Bedard", "Quinn Hughes", "Elias Pettersson", "Mikko Rantanen",
    "Igor Shesterkin", "Andrei Vasilevskiy", "Marc-Andre Fleury", "Carey Price", "Juuse Saros",
    "Connor Hellebuyck", "Sebastian Aho", "Aleksander Barkov", "William Nylander", "Tage Thompson",
    "Kirill Kaprizov", "Jason Robertson", "Roope Hintz", "Jack Eichel", "Kyle Connor",
    "Ryan Nugent-Hopkins", "Zach Hyman", "Mika Zibanejad", "Rasmus Dahlin", "Alex Pietrangelo",
    "John Tavares", "Claude Giroux", "Joe Pavelski", "Anze Kopitar", "Drew Doughty",
    "Wayne Gretzky", "Mario Lemieux", "Jaromir Jagr", "Steve Yzerman", "Joe Sakic",
    "Nicklas Lidstrom", "Martin Brodeur", "Patrick Roy", "Dominik Hasek", "Ray Bourque",
    "Paul Coffey", "Bobby Orr", "Gordie Howe", "Phil Esposito", "Mark Messier",
    "Teemu Selanne", "Paul Kariya", "Peter Forsberg", "Mike Modano", "Brett Hull",
    "Luc Robitaille", "Brendan Shanahan", "Chris Chelios", "Scott Stevens", "Scott Niedermayer",
    "Alexander Mogilny", "Pavel Bure", "Sergei Fedorov", "Pavel Datsyuk", "Henrik Zetterberg",
    "Daniel Sedin", "Henrik Sedin", "Roberto Luongo", "Ryan Miller", "Jonathan Toews",
    "Duncan Keith", "Corey Crawford", "Marian Hossa", "Tuukka Rask", "Zdeno Chara",
    "Patrice Bergeron", "David Krejci", "Henrik Lundqvist", "Ryan Getzlaf", "Corey Perry",
    "Shea Weber", "Pekka Rinne", "Dale Hawerchuk", "Anders Kallur", "Phil Kessel",
    "Zach Parise", "Ryan Suter", "Dustin Brown", "Jeff Carter", "Jonathan Quick"
];

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

// DOM Elements
let startBetBtn, skipBetBtn, betCards, prebetContainer, gameContainer, clueList,
    guessInput, submitGuessBtn, skipClueBtn, autocompleteSuggestions,
    scoreVal, roundVal, betVal, currentClueContainer, resultsModal, resultsModalOverlay,
    resultTitle, resultScore, finalScoreText, correctPlayerName, shareGridText, btnShare,
    statsWrongGuesses, statsCluesRevealed, statsBetBonus, statsBetText,
    statsLifetimePlayed, statsLifetimeWinrate, statsLifetimePoints, statsLifetimeAvgClues;

document.addEventListener("DOMContentLoaded", () => {
    // Inject Canvas-Confetti script
    const confettiScript = document.createElement("script");
    confettiScript.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
    document.head.appendChild(confettiScript);

    initDOMElements();
    checkDailyPlay();
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
    currentClueContainer = document.getElementById("current-clue");

    // Modal
    resultsModalOverlay = document.getElementById("results-modal-overlay");
    resultsModal = document.getElementById("results-modal");
    resultTitle = document.getElementById("result-title");
    resultScore = document.getElementById("result-score");
    finalScoreText = document.getElementById("final-score-text");
    correctPlayerName = document.getElementById("correct-player-name");
    shareGridText = document.getElementById("share-grid-text");
    btnShare = document.getElementById("btn-share");

    // Modal Stats
    statsWrongGuesses = document.getElementById("stats-wrong-guesses");
    statsCluesRevealed = document.getElementById("stats-clues-revealed");
    statsBetBonus = document.getElementById("stats-bet-bonus");
    statsBetText = document.getElementById("stats-bet-text");
    statsLifetimePlayed = document.getElementById("stats-lifetime-played");
    statsLifetimeWinrate = document.getElementById("stats-lifetime-winrate");
    statsLifetimePoints = document.getElementById("stats-lifetime-points");
    statsLifetimeAvgClues = document.getElementById("stats-lifetime-avg-clues");

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

    if (btnShare) btnShare.addEventListener("click", shareResults);
}

// --- Guest Stats Local Storage Helper Functions ---
function getGuestStats() {
    const raw = localStorage.getItem("puck10_guest_stats");
    if (!raw) return { history: {} };
    try {
        return JSON.parse(raw);
    } catch (e) {
        return { history: {} };
    }
}

function getLocalGuestGame(date) {
    const stats = getGuestStats();
    return stats.history[date] || null;
}

function getGameDate() {
    const urlParams = new URLSearchParams(window.location.search);
    let targetDate = urlParams.get('date');
    if (!targetDate) {
        targetDate = new Date().toISOString().split('T')[0];
    }
    return targetDate;
}

function calculateGuestStreaks(history) {
    const dates = Object.keys(history).sort();
    if (dates.length === 0) return { current_streak: 0, max_streak: 0 };
    
    let currStreak = 0;
    let maxStreak = 0;
    let lastDate = null;
    
    for (let dateStr of dates) {
        const game = history[dateStr];
        if (game.won) {
            if (lastDate === null) {
                currStreak = 1;
            } else {
                const d1 = new Date(dateStr + "T00:00:00");
                const d2 = new Date(lastDate + "T00:00:00");
                const diffTime = Math.abs(d1 - d2);
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                    currStreak++;
                } else if (diffDays > 1) {
                    currStreak = 1;
                }
            }
            maxStreak = Math.max(maxStreak, currStreak);
            lastDate = dateStr;
        } else {
            currStreak = 0;
            lastDate = dateStr;
        }
    }
    
    // Check if streak broken
    if (lastDate) {
        const todayStr = new Date().toISOString().split('T')[0];
        const last = new Date(lastDate + "T00:00:00");
        const today = new Date(todayStr + "T00:00:00");
        const diffTime = Math.abs(today - last);
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
            currStreak = 0;
        }
    }
    
    return { current_streak: currStreak, max_streak: maxStreak };
}

function getGuestLifetimeStats() {
    const stats = getGuestStats();
    const history = stats.history;
    const dates = Object.keys(history);
    const games_played = dates.length;
    const wins = dates.filter(d => history[d].won).length;
    const win_pct = games_played > 0 ? Math.round((wins / games_played) * 100 * 10) / 10 : 0;
    const total_points = Object.values(history).reduce((sum, g) => sum + g.score, 0);
    
    const wonGames = Object.values(history).filter(g => g.won);
    const avg_clues_to_win = wonGames.length > 0 ? Math.round((wonGames.reduce((sum, g) => sum + g.clues_revealed, 0) / wonGames.length) * 10) / 10 : 0;
    
    const streaks = calculateGuestStreaks(history);
    
    return {
        games_played,
        wins,
        win_pct,
        total_points,
        avg_clues_to_win,
        current_streak: streaks.current_streak,
        max_streak: streaks.max_streak
    };
}

function saveLocalGuestGame(won, score, cluesRevealed, wrongGuesses, betRound, playerName, guesses = [], headshotUrl = "") {
    const stats = getGuestStats();
    const date = getGameDate();
    stats.history[date] = {
        won,
        score,
        clues_revealed: cluesRevealed,
        wrong_guesses: wrongGuesses,
        bet_round: betRound,
        player_name: playerName,
        guesses: guesses,
        headshot_url: headshotUrl
    };
    localStorage.setItem("puck10_guest_stats", JSON.stringify(stats));
}

// Fetch today's player status
async function checkDailyPlay() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetDate = urlParams.get('date');
        const fetchUrl = targetDate ? `/api/daily-player?date=${encodeURIComponent(targetDate)}` : "/api/daily-player";
        
        const response = await fetch(fetchUrl);
        const data = await response.json();

        if (data.error) {
            // Show error (e.g. no scheduled player)
            if (prebetContainer) {
                prebetContainer.innerHTML = `<div class="card text-center">
                    <h2>No Game Found</h2>
                    <p class="text-secondary">${data.error}</p>
                </div>`;
            }
            return;
        }

        gameState.clues = data.clues;

        // Set lifetime stats from server or guest localStorage
        if (data.lifetime_stats) {
            gameState.lifetimeStats = data.lifetime_stats;
        } else {
            gameState.lifetimeStats = getGuestLifetimeStats();
        }

        // Check if already played
        const gameDate = getGameDate();
        const localGuestGame = getLocalGuestGame(gameDate);

        if (data.played) {
            showAlreadyPlayed(data.played_data);
        } else if (localGuestGame && !data.lifetime_stats) {
            showAlreadyPlayed(localGuestGame);
        } else {
            // Show betting container
            if (prebetContainer) prebetContainer.style.display = "block";
        }
    } catch (err) {
        console.error("Error checking play status:", err);
    }
}

function showAlreadyPlayed(playedData) {
    if (prebetContainer) prebetContainer.style.display = "none";
    if (gameContainer) gameContainer.style.display = "grid";
    
    // Set state
    gameState.completed = true;
    gameState.won = playedData.won === 1 || playedData.won === true;
    gameState.finalScore = playedData.score;
    gameState.currentRound = playedData.clues_revealed;
    gameState.wrongGuesses = playedData.wrong_guesses;
    gameState.betRound = playedData.bet_round;
    gameState.guesses = playedData.guesses || [];

    // Show previous guesses
    renderGuesses();

    // Update scoreboard
    updateScoreboard();

    // Reveal all 10 clues
    for (let i = 1; i <= 10; i++) {
        revealClue(i);
    }

    // Update the guess card area
    updateGuessCardForCompleted(gameState.won, playedData.player_name);

    // Show modal results
    showResultsModal(playedData.player_name, playedData.headshot_url);
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
            // Penalty applies
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
            
            // Special styling for teams (Clue 8) or milestones (Clue 9)
            if (roundNum === 8) {
                // Show logos
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
                // JSON list format
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
        // Skiped round 10 = Game Over
        endGame(false);
    }
}

async function submitGuess() {
    const guessValue = guessInput.value.trim();
    if (!guessValue) return;

    submitGuessBtn.disabled = true;

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetDate = urlParams.get('date');
        
        const response = await fetch("/api/guess", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                guess: guessValue,
                date: targetDate
            })
        });
        const data = await response.json();

        if (data.correct) {
            gameState.guesses.push(data.player_name);
            gameState.won = true;
            renderGuesses();
            endGame(true, data.player_name, data.headshot_url);
        } else {
            // Incorrect guess
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
    // Create temporary toast
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

async function endGame(won, playerName = "", headshotUrl = "") {
    gameState.active = false;
    gameState.completed = true;
    gameState.won = won;

    // Perform final score modifications if won
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

    // Submit results to server
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetDate = urlParams.get('date');

        const response = await fetch("/api/submit-game", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                score: gameState.finalScore,
                clues_revealed: gameState.currentRound,
                wrong_guesses: gameState.wrongGuesses,
                bet_round: gameState.betRound,
                won: won ? 1 : 0,
                date: targetDate,
                guesses: gameState.guesses
            })
        });
        const data = await response.json();
        
        // Show actual player name from submit API if not passed
        const finalPlayerName = playerName || data.player_name;

        // Reveal all 10 clues
        for (let i = 1; i <= 10; i++) {
            revealClue(i);
        }

        // Update the guess card area
        updateGuessCardForCompleted(won, finalPlayerName);

        if (data.status === "guest_success") {
            saveLocalGuestGame(won, gameState.finalScore, gameState.currentRound, gameState.wrongGuesses, gameState.betRound, finalPlayerName, gameState.guesses, headshotUrl || data.headshot_url);
            gameState.lifetimeStats = getGuestLifetimeStats();
        } else if (data.lifetime_stats) {
            gameState.lifetimeStats = data.lifetime_stats;
        }

        // Show modal
        showResultsModal(finalPlayerName, headshotUrl || data.headshot_url);

        // Confetti!
        if (won && typeof confetti === "function") {
            confetti({
                particleCount: 150,
                spread: 80,
                origin: { y: 0.6 }
            });
        }
    } catch (err) {
        console.error("Error submitting game results:", err);
    }
}

function showResultsModal(playerName, headshotUrl = "") {
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

    // Display player photo if available
    const photoContainer = document.getElementById("player-photo-container");
    const playerPhoto = document.getElementById("player-photo");
    if (photoContainer && playerPhoto) {
        if (headshotUrl) {
            playerPhoto.src = headshotUrl;
            photoContainer.style.display = "flex";
        } else {
            photoContainer.style.display = "none";
            playerPhoto.src = "";
        }
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

    // Populate Lifetime Stats
    if (gameState.lifetimeStats) {
        const stats = gameState.lifetimeStats;
        if (statsLifetimePlayed) statsLifetimePlayed.innerText = stats.games_played;
        if (statsLifetimeWinrate) statsLifetimeWinrate.innerText = `${stats.win_pct}%`;
        if (statsLifetimeAvgClues) statsLifetimeAvgClues.innerText = stats.avg_clues_to_win > 0 ? stats.avg_clues_to_win : "-";
        
        if (statsLifetimePoints) {
            // Check if logged in (user greeting will exist in header)
            const isLoggedIn = document.querySelector(".user-greeting") !== null;
            if (isLoggedIn) {
                statsLifetimePoints.innerHTML = `${stats.total_points} <span class="stat-badge-sub">pts</span>`;
            } else {
                statsLifetimePoints.innerHTML = `${stats.total_points} <span class="stat-badge-sub" style="color: var(--text-muted); font-size: 0.65rem;">pts (local)</span>`;
            }
        }
    }

    // Generate Share Grid Text
    // E.g. Puck10 Clues [Date]
    // Clue 4/10 | Score: 170 pts
    // Pre-bet: Clue 5 Success (+60)
    // 🟩🟩🟩🟩⬛⬛⬛⬛⬛⬛
    const today = new Date().toISOString().split('T')[0];
    let gridString = "";
    for (let i = 1; i <= 10; i++) {
        if (i < gameState.currentRound) {
            gridString += "⬜"; // Skipped or revealed clue
        } else if (i === gameState.currentRound && gameState.won) {
            gridString += "🟩"; // Guessed clue
        } else {
            gridString += "⬛"; // Locked clue
        }
    }

    const shareContent = `Puck10 Clues - ${today}\n` +
        `Clue Revealed: ${gameState.currentRound}/10 | Score: ${gameState.finalScore} pts\n` +
        `Bet Clue: ${gameState.betRound ? `Clue ${gameState.betRound} (${gameState.won && gameState.currentRound <= gameState.betRound ? 'Win' : 'Loss'})` : 'None'}\n` +
        `${gridString}\n` +
        `Play: ${window.location.origin}`;

    if (shareGridText) shareGridText.value = shareContent;
    if (resultsModalOverlay) resultsModalOverlay.style.display = "flex";
}

function shareResults() {
    if (shareGridText) {
        shareGridText.select();
        navigator.clipboard.writeText(shareGridText.value);
        showToast("Results copied to clipboard!", "success");
    }
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
                
                // Add click listeners to items
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
