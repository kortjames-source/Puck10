// NHL 10 Clues - Admin Dashboard Script

document.addEventListener("DOMContentLoaded", () => {
    initSearchForm();
    initScrapeForm();
    initSchedulerForm();
    initEditorLists();
    initPracticeCache();
    initTableActions();
});

// Helper: Show status messages
function showAdminStatus(message, type = "info") {
    const statusDiv = document.getElementById("admin-status-message");
    if (statusDiv) {
        statusDiv.className = `flash flash-${type}`;
        statusDiv.style.display = "flex";
        statusDiv.innerHTML = `<span class="flash-text">${message}</span><button class="flash-close" onclick="this.parentElement.style.display='none'">&times;</button>`;
        
        // Scroll to message
        statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// 1. Search HockeyDB Form
function initSearchForm() {
    const searchBtn = document.getElementById("search-hockeydb-btn");
    const searchInput = document.getElementById("search-player-name");
    const resultsContainer = document.getElementById("search-results-list");

    if (!searchBtn || !searchInput || !resultsContainer) return;

    searchBtn.addEventListener("click", async () => {
        const query = searchInput.value.trim();
        if (!query) {
            showAdminStatus("Please enter a player name to search.", "error");
            return;
        }

        searchBtn.disabled = true;
        searchBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Searching...`;
        resultsContainer.innerHTML = `<p class="text-secondary text-center"><i class="fa-solid fa-spinner fa-spin"></i> Searching HockeyDB...</p>`;

        try {
            const response = await fetch(`/api/admin/scrape?action=search&query=${encodeURIComponent(query)}`);
            const data = await response.json();

            if (!data.results || data.results.length === 0) {
                resultsContainer.innerHTML = `<p class="text-secondary text-center">No players found matching "${query}".</p>`;
                return;
            }

            let html = "";
            data.results.forEach(p => {
                html += `
                    <div class="admin-result-row">
                        <div class="admin-result-meta">
                            <div class="admin-result-name">${p.name}</div>
                            <div class="admin-result-desc">${p.info || "No details available"}</div>
                        </div>
                        <button class="btn btn-outline btn-sm fetch-details-btn" data-pid="${p.pid}">
                            <i class="fa-solid fa-cloud-arrow-down"></i> Load Profile
                        </button>
                    </div>
                `;
            });
            resultsContainer.innerHTML = html;

            // Add click events to load buttons
            const loadBtns = resultsContainer.querySelectorAll(".fetch-details-btn");
            loadBtns.forEach(btn => {
                btn.addEventListener("click", () => {
                    const pid = btn.dataset.pid;
                    fetchPlayerDetails(pid);
                });
            });

            showAdminStatus(`Found ${data.results.length} search results.`, "success");
        } catch (err) {
            console.error("Error searching players:", err);
            resultsContainer.innerHTML = "";
            showAdminStatus("Failed to search HockeyDB. Verify network connectivity.", "error");
        } finally {
            searchBtn.disabled = false;
            searchBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Search`;
        }
    });
}

// 2. Fetch Player Details by PID
function initScrapeForm() {
    const scrapeBtn = document.getElementById("scrape-pid-btn");
    const pidInput = document.getElementById("scrape-player-pid");

    if (!scrapeBtn || !pidInput) return;

    scrapeBtn.addEventListener("click", () => {
        const pid = pidInput.value.trim();
        if (!pid) {
            showAdminStatus("Please enter a valid HockeyDB Player ID.", "error");
            return;
        }
        fetchPlayerDetails(pid);
    });
}

async function fetchPlayerDetails(pid) {
    const editorSection = document.getElementById("player-editor-section");
    const scrapeBtn = document.getElementById("scrape-pid-btn");
    if (!editorSection) return;

    if (scrapeBtn) {
        scrapeBtn.disabled = true;
        scrapeBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Loading...`;
    }

    try {
        const response = await fetch(`/api/admin/scrape?action=details&pid=${pid}`);
        const data = await response.json();

        if (data.error) {
            showAdminStatus(`Error fetching details: ${data.error}`, "error");
            return;
        }

        // Populate Form Fields
        document.getElementById("editor-player-name").value = data.name || "";
        document.getElementById("editor-height").value = data.height || "";
        document.getElementById("editor-weight").value = data.weight || "";
        document.getElementById("editor-nationality").value = data.nationality || "";
        document.getElementById("editor-shoots").value = data.shoots || "";
        document.getElementById("editor-position").value = data.position || "";
        document.getElementById("editor-draft").value = data.draft_status || "";
        document.getElementById("editor-franchises").value = data.franchises_count || "0";
        document.getElementById("editor-url").value = data.hockeydb_url || "";

        // Populate list editors
        populateTeamsList(data.teams_played || []);
        populateMilestonesList(data.milestones || []);
        populateAwardsList(data.awards || []);

        // Show editor panel
        editorSection.style.display = "block";
        editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        showAdminStatus(`Player "${data.name}" details loaded successfully!`, "success");
    } catch (err) {
        console.error("Error loading player details:", err);
        showAdminStatus("Failed to fetch player details from HockeyDB.", "error");
    } finally {
        if (scrapeBtn) {
            scrapeBtn.disabled = false;
            scrapeBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> Scrape PID`;
        }
    }
}

// 3. Repeating List Editors (Teams, Milestones, Awards)
function initEditorLists() {
    const addTeamBtn = document.getElementById("add-team-btn");
    const addMilestoneBtn = document.getElementById("add-milestone-btn");
    const addAwardBtn = document.getElementById("add-award-btn");

    if (addTeamBtn) {
        addTeamBtn.addEventListener("click", () => {
            appendTeamRow("", "");
        });
    }

    if (addMilestoneBtn) {
        addMilestoneBtn.addEventListener("click", () => {
            appendMilestoneRow("");
        });
    }

    if (addAwardBtn) {
        addAwardBtn.addEventListener("click", () => {
            appendAwardRow("");
        });
    }
}

function populateTeamsList(teams) {
    const list = document.getElementById("teams-editor-list");
    if (!list) return;
    list.innerHTML = "";
    teams.forEach(t => appendTeamRow(t.name, t.logo));
}

function appendTeamRow(name = "", logo = "") {
    const list = document.getElementById("teams-editor-list");
    if (!list) return;

    const row = document.createElement("div");
    row.className = "team-editor-item";
    row.innerHTML = `
        <input type="text" class="form-control team-name-input" placeholder="Team Name" value="${escapeHtml(name)}" style="flex: 2;">
        <input type="text" class="form-control team-logo-input" placeholder="Logo SVG URL (Optional)" value="${escapeHtml(logo || '')}" style="flex: 3;">
        <button class="btn btn-accent btn-sm remove-row-btn" type="button"><i class="fa-solid fa-trash"></i></button>
    `;

    row.querySelector(".remove-row-btn").addEventListener("click", () => row.remove());
    list.appendChild(row);
}

function populateMilestonesList(milestones) {
    const list = document.getElementById("milestones-editor-list");
    if (!list) return;
    list.innerHTML = "";
    milestones.forEach(m => appendMilestoneRow(m));
}

function appendMilestoneRow(text = "") {
    const list = document.getElementById("milestones-editor-list");
    if (!list) return;

    const row = document.createElement("div");
    row.className = "milestone-editor-item";
    row.innerHTML = `
        <input type="text" class="form-control milestone-text-input" placeholder="Milestone / Accomplishment" value="${escapeHtml(text)}">
        <button class="btn btn-accent btn-sm remove-row-btn" type="button"><i class="fa-solid fa-trash"></i></button>
    `;

    row.querySelector(".remove-row-btn").addEventListener("click", () => row.remove());
    list.appendChild(row);
}

function populateAwardsList(awards) {
    const list = document.getElementById("awards-editor-list");
    if (!list) return;
    list.innerHTML = "";
    awards.forEach(a => appendAwardRow(a));
}

function appendAwardRow(text = "") {
    const list = document.getElementById("awards-editor-list");
    if (!list) return;

    const row = document.createElement("div");
    row.className = "award-editor-item";
    row.innerHTML = `
        <input type="text" class="form-control award-text-input" placeholder="Award (e.g. 1985-86 - Hart Trophy)" value="${escapeHtml(text)}">
        <button class="btn btn-accent btn-sm remove-row-btn" type="button"><i class="fa-solid fa-trash"></i></button>
    `;

    row.querySelector(".remove-row-btn").addEventListener("click", () => row.remove());
    list.appendChild(row);
}

// 4. Save to Schedule
function initSchedulerForm() {
    const saveBtn = document.getElementById("save-schedule-btn");
    if (!saveBtn) return;

    saveBtn.addEventListener("click", async () => {
        const scheduleDate = document.getElementById("schedule-date").value;
        if (!scheduleDate) {
            showAdminStatus("Please select a target calendar date for this player.", "error");
            return;
        }

        const name = document.getElementById("editor-player-name").value.trim();
        if (!name) {
            showAdminStatus("Player name cannot be empty.", "error");
            return;
        }

        // Compile Teams Played List
        const teamRows = document.querySelectorAll(".team-editor-item");
        const teams = [];
        teamRows.forEach(row => {
            const tName = row.querySelector(".team-name-input").value.trim();
            const tLogo = row.querySelector(".team-logo-input").value.trim();
            if (tName) {
                teams.push({ name: tName, logo: tLogo || null });
            }
        });

        // Compile Milestones List
        const milestoneRows = document.querySelectorAll(".milestone-editor-item");
        const milestones = [];
        milestoneRows.forEach(row => {
            const text = row.querySelector(".milestone-text-input").value.trim();
            if (text) milestones.push(text);
        });

        // Compile Awards List
        const awardRows = document.querySelectorAll(".award-editor-item");
        const awards = [];
        awardRows.forEach(row => {
            const text = row.querySelector(".award-text-input").value.trim();
            if (text) awards.push(text);
        });

        const payload = {
            date: scheduleDate,
            name: name,
            height: document.getElementById("editor-height").value.trim(),
            weight: document.getElementById("editor-weight").value.trim(),
            nationality: document.getElementById("editor-nationality").value.trim(),
            shoots: document.getElementById("editor-shoots").value.trim(),
            position: document.getElementById("editor-position").value.trim(),
            draft_status: document.getElementById("editor-draft").value.trim(),
            franchises_count: parseInt(document.getElementById("editor-franchises").value) || 0,
            hockeydb_url: document.getElementById("editor-url").value.trim(),
            teams_played: teams,
            milestones: milestones,
            awards: awards
        };

        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...`;

        try {
            const response = await fetch("/api/admin/schedule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            if (data.error) {
                showAdminStatus(`Error scheduling player: ${data.error}`, "error");
                return;
            }

            showAdminStatus(`Success! Scheduled "${name}" for ${scheduleDate}.`, "success");
            
            // Reload page to refresh the scheduled table
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (err) {
            console.error("Error saving scheduled player:", err);
            showAdminStatus("Failed to schedule player in database.", "error");
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fa-solid fa-calendar-check"></i> Save to Schedule`;
        }
    });
}

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function initPracticeCache() {
    const cacheCountEl = document.getElementById("practice-cache-count");
    const cacheUpdatedEl = document.getElementById("practice-cache-updated");
    const refreshBtn = document.getElementById("refresh-practice-cache-btn");

    if (!cacheCountEl || !cacheUpdatedEl || !refreshBtn) return;

    // Fetch current status
    async function updateStatus() {
        try {
            const res = await fetch("/api/admin/practice-cache");
            const data = await res.json();
            if (!data.error) {
                cacheCountEl.innerText = `${data.count} players`;
                cacheUpdatedEl.innerText = data.latest_update ? data.latest_update : "Never";
            }
        } catch (err) {
            console.error("Error fetching practice cache status:", err);
        }
    }

    updateStatus();

    // Rebuild cache
    refreshBtn.addEventListener("click", async () => {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Triggering Rebuild...`;
        
        try {
            const res = await fetch("/api/admin/practice-cache", { method: "POST" });
            const data = await res.json();
            if (data.status === "started") {
                showAdminStatus("Background practice cache refresh started! This will take a moment.", "success");
                
                // Poll for updates a few times
                let pollCount = 0;
                const pollInterval = setInterval(async () => {
                    pollCount++;
                    await updateStatus();
                    if (pollCount >= 10) clearInterval(pollInterval);
                }, 3000);
            } else {
                showAdminStatus("Failed to start rebuild: " + (data.error || "Unknown error"), "error");
            }
        } catch (err) {
            console.error("Error trigger practice cache rebuild:", err);
            showAdminStatus("Network error triggering cache rebuild.", "error");
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Rebuild Cache (Background)`;
        }
    });
}

function initTableActions() {
    // 1. Assign Player button click
    const assignBtns = document.querySelectorAll(".assign-day-btn");
    assignBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const dateVal = btn.dataset.date;
            // Set date input value
            const dateInput = document.getElementById("schedule-date");
            if (dateInput) dateInput.value = dateVal;
            
            // Clear editor form fields
            document.getElementById("editor-player-name").value = "";
            document.getElementById("editor-height").value = "";
            document.getElementById("editor-weight").value = "";
            document.getElementById("editor-nationality").value = "";
            document.getElementById("editor-shoots").value = "";
            document.getElementById("editor-position").value = "";
            document.getElementById("editor-draft").value = "";
            document.getElementById("editor-franchises").value = "0";
            document.getElementById("editor-url").value = "";
            
            // Clear editor list items
            const teamsList = document.getElementById("teams-editor-list");
            if (teamsList) teamsList.innerHTML = "";
            const milestonesList = document.getElementById("milestones-editor-list");
            if (milestonesList) milestonesList.innerHTML = "";
            const awardsList = document.getElementById("awards-editor-list");
            if (awardsList) awardsList.innerHTML = "";
            
            // Show editor panel
            const editorSection = document.getElementById("player-editor-section");
            if (editorSection) {
                editorSection.style.display = "block";
                editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            
            showAdminStatus(`Ready to assign player to date: ${dateVal}`, "info");
        });
    });

    // 2. Edit Day button click
    const editBtns = document.querySelectorAll(".edit-day-btn");
    editBtns.forEach(btn => {
        btn.addEventListener("click", async () => {
            const dateVal = btn.dataset.date;
            const editorSection = document.getElementById("player-editor-section");
            if (!editorSection) return;

            btn.disabled = true;
            const originalText = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Loading...`;

            try {
                const response = await fetch(`/api/admin/player?date=${dateVal}`);
                const data = await response.json();

                if (data.error) {
                    showAdminStatus(`Error fetching details: ${data.error}`, "error");
                    return;
                }

                // Populate Form Fields
                document.getElementById("editor-player-name").value = data.name || "";
                document.getElementById("editor-height").value = data.height || "";
                document.getElementById("editor-weight").value = data.weight || "";
                document.getElementById("editor-nationality").value = data.nationality || "";
                document.getElementById("editor-shoots").value = data.shoots || "";
                document.getElementById("editor-position").value = data.position || "";
                document.getElementById("editor-draft").value = data.draft_status || "";
                document.getElementById("editor-franchises").value = data.franchises_count || "0";
                document.getElementById("editor-url").value = data.hockeydb_url || "";

                // Populate list editors
                populateTeamsList(data.teams_played || []);
                populateMilestonesList(data.milestones || []);
                populateAwardsList(data.awards || []);

                // Set schedule date
                const dateInput = document.getElementById("schedule-date");
                if (dateInput) dateInput.value = dateVal;

                // Show editor panel
                editorSection.style.display = "block";
                editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

                showAdminStatus(`Loaded "${data.name}" details for ${dateVal}.`, "success");
            } catch (err) {
                console.error("Error loading player details for editing:", err);
                showAdminStatus("Failed to load player details from schedule.", "error");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    });

    // 3. Clear Day button click
    const clearBtns = document.querySelectorAll(".clear-day-btn");
    clearBtns.forEach(btn => {
        btn.addEventListener("click", async () => {
            const dateVal = btn.dataset.date;
            if (!confirm(`Are you sure you want to clear/remove the scheduled player for ${dateVal}?`)) {
                return;
            }

            btn.disabled = true;
            const originalText = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Clearing...`;

            try {
                const response = await fetch("/api/admin/schedule/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ date: dateVal })
                });
                const data = await response.json();

                if (data.error) {
                    showAdminStatus(`Error clearing date: ${data.error}`, "error");
                    return;
                }

                showAdminStatus(`Successfully cleared schedule for ${dateVal}.`, "success");
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } catch (err) {
                console.error("Error clearing date:", err);
                showAdminStatus("Failed to clear schedule.", "error");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    });
}
