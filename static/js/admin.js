// NHL 10 Clues - Admin Dashboard Script

document.addEventListener("DOMContentLoaded", () => {
    initSearchForm();
    initScrapeForm();
    initSchedulerForm();
    initEditorLists();
    initPracticeCache();
    initTableActions();
    initAutoFiller();
    initAdminTabs();
    initUserManagement();
    initErrorLogs();
    initPracticeViewer();
});

// Helper: Show status messages
function showAdminStatus(message, type = "info", shouldScroll = true) {
    const statusDiv = document.getElementById("admin-status-message");
    if (statusDiv) {
        statusDiv.className = `flash flash-${type}`;
        statusDiv.style.display = "flex";
        statusDiv.innerHTML = `<span class="flash-text">${message}</span><button class="flash-close" onclick="this.parentElement.style.display='none'">&times;</button>`;
        
        // Scroll to message
        if (shouldScroll) {
            statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
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

            if (data.error) {
                resultsContainer.innerHTML = `<p class="text-accent text-center" style="color: var(--accent);"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${data.error}</p>`;
                showAdminStatus(`Search failed: ${data.error}. You can still assign a player manually using the schedule table.`, "warning");
                return;
            }

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
                    fetchPlayerDetails(pid, btn);
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
        fetchPlayerDetails(pid, scrapeBtn);
    });
}

async function fetchPlayerDetails(pid, clickedBtn = null) {
    const editorSection = document.getElementById("player-editor-section");
    if (!editorSection) return;

    const loadingIndicator = clickedBtn || document.getElementById("scrape-pid-btn");
    let originalText = "";
    if (loadingIndicator) {
        loadingIndicator.disabled = true;
        originalText = loadingIndicator.innerHTML;
        loadingIndicator.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Loading...`;
    }

    try {
        const response = await fetch(`/api/admin/scrape?action=details&pid=${pid}`);
        const data = await response.json();

        if (data.error) {
            showAdminStatus(`Failed to fetch details from HockeyDB: ${data.error}. You can fill out the clues manually below.`, "warning");
            
            // Show editor panel anyway so they can input manually
            editorSection.style.display = "block";
            editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

        showAdminStatus(`Player "${data.name}" details loaded successfully!`, "success", false);
    } catch (err) {
        console.error("Error loading player details:", err);
        showAdminStatus("Failed to fetch player details from HockeyDB. You can fill out the clues manually below.", "warning");
        
        // Show editor panel anyway
        editorSection.style.display = "block";
        editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
        if (loadingIndicator) {
            loadingIndicator.disabled = false;
            loadingIndicator.innerHTML = originalText;
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
            
            showAdminStatus(`Ready to assign player to date: ${dateVal}`, "info", false);
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

                showAdminStatus(`Loaded "${data.name}" details for ${dateVal}.`, "success", false);
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

function initAutoFiller() {
    const autofillBtn = document.getElementById("auto-fill-schedule-btn");
    if (!autofillBtn) return;
    
    autofillBtn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to automatically fetch and fill the empty days of July? This can take 15-30 seconds.")) {
            return;
        }
        
        autofillBtn.disabled = true;
        const originalHtml = autofillBtn.innerHTML;
        autofillBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Seeding Schedule...`;
        
        try {
            const res = await fetch("/api/admin/fill-schedule", { method: "POST" });
            const data = await res.json();
            
            if (data.error) {
                showAdminStatus("Error filling schedule: " + data.error, "error");
            } else {
                showAdminStatus(data.message || "Success! Schedule has been seeded.", "success");
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            }
        } catch (err) {
            console.error("Error auto-filling schedule:", err);
            showAdminStatus("Network error auto-filling schedule.", "error");
        }
    });
}

// Admin Tab Navigation
function initAdminTabs() {
    const tabBtns = document.querySelectorAll(".admin-tab-btn");
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.dataset.tab;
            
            // Toggle buttons
            tabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            // Toggle content panels
            const contents = document.querySelectorAll(".admin-tab-content");
            contents.forEach(c => c.classList.remove("active"));
            
            const targetContent = document.getElementById("tab-" + targetTab);
            if (targetContent) {
                targetContent.classList.add("active");
            }
            
            // Load data when tab opens
            if (targetTab === "users") {
                loadAdminUsers();
            } else if (targetTab === "errors") {
                loadAdminErrors();
            } else if (targetTab === "practice") {
                loadAdminPracticePlayers();
            }
        });
    });
}

// User Management Logic
let allUsersData = [];

function initUserManagement() {
    const searchBtn = document.getElementById("user-search-btn");
    const searchInput = document.getElementById("user-search-input");
    
    if (searchBtn && searchInput) {
        searchBtn.addEventListener("click", () => {
            filterUsersTable(searchInput.value.trim());
        });
        searchInput.addEventListener("keyup", (e) => {
            if (e.key === "Enter") {
                filterUsersTable(searchInput.value.trim());
            }
        });
    }
    
    const cancelUserEditBtn = document.getElementById("cancel-user-edit-btn");
    if (cancelUserEditBtn) {
        cancelUserEditBtn.addEventListener("click", () => {
            document.getElementById("user-editor-section").style.display = "none";
        });
    }
    
    const cancelPasswordResetBtn = document.getElementById("cancel-password-reset-btn");
    if (cancelPasswordResetBtn) {
        cancelPasswordResetBtn.addEventListener("click", () => {
            document.getElementById("password-reset-section").style.display = "none";
        });
    }
    
    const closeHistoryBtn = document.getElementById("close-history-btn");
    if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener("click", () => {
            document.getElementById("premium-history-section").style.display = "none";
        });
    }
    
    const saveUserBtn = document.getElementById("save-user-btn");
    if (saveUserBtn) {
        saveUserBtn.addEventListener("click", saveUserProfile);
    }
    
    const savePasswordBtn = document.getElementById("save-password-btn");
    if (savePasswordBtn) {
        savePasswordBtn.addEventListener("click", saveUserPasswordDirect);
    }
}

async function loadAdminUsers() {
    const tbody = document.getElementById("admin-users-tbody");
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-secondary"><i class="fa-solid fa-spinner fa-spin"></i> Loading user accounts...</td></tr>`;
    
    try {
        const response = await fetch("/api/admin/users");
        const data = await response.json();
        
        if (data.error) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-accent">Error loading users: ${data.error}</td></tr>`;
            return;
        }
        
        allUsersData = data.users || [];
        populateUsersTable(allUsersData);
    } catch (err) {
        console.error("Error loading users:", err);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-accent">Network error loading users.</td></tr>`;
    }
}

function populateUsersTable(users) {
    const tbody = document.getElementById("admin-users-tbody");
    if (!tbody) return;
    
    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-secondary">No user accounts found.</td></tr>`;
        return;
    }
    
    let html = "";
    users.forEach(u => {
        const badgeClass = u.is_premium ? "badge-active" : "badge-inactive";
        const badgeIcon = u.is_premium ? `<i class="fa-solid fa-star"></i>` : `<i class="fa-solid fa-user"></i>`;
        const accessLabel = u.is_premium ? "VIP" : "Standard";
        
        html += `
            <tr>
                <td style="vertical-align: middle;">${u.id}</td>
                <td style="vertical-align: middle; font-weight: 600;">${u.username}</td>
                <td style="vertical-align: middle;">${u.email || '<span class="text-secondary" style="font-style: italic; opacity: 0.5;">No Email</span>'}</td>
                <td style="vertical-align: middle;">
                    <span class="${badgeClass}">${badgeIcon} ${accessLabel}</span>
                </td>
                <td style="vertical-align: middle;">${u.duration_summary}</td>
                <td style="vertical-align: middle; font-size: 0.85rem;" class="text-secondary">${u.created_at}</td>
                <td style="vertical-align: middle;">
                    <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                        <button class="btn btn-secondary btn-xs edit-user-btn" data-id="${u.id}" type="button">
                            <i class="fa-solid fa-user-pen"></i> Edit
                        </button>
                        <button class="btn btn-secondary btn-xs reset-pw-btn" data-id="${u.id}" data-username="${u.username}" type="button">
                            <i class="fa-solid fa-key"></i> Reset PW
                        </button>
                        <button class="btn btn-secondary btn-xs view-history-btn" data-id="${u.id}" type="button">
                            <i class="fa-solid fa-clock-rotate-left"></i> History
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
    
    tbody.querySelectorAll(".edit-user-btn").forEach(btn => {
        btn.addEventListener("click", () => showUserEditor(btn.dataset.id));
    });
    tbody.querySelectorAll(".reset-pw-btn").forEach(btn => {
        btn.addEventListener("click", () => showPasswordReset(btn.dataset.id, btn.dataset.username));
    });
    tbody.querySelectorAll(".view-history-btn").forEach(btn => {
        btn.addEventListener("click", () => viewUserVipHistory(btn.dataset.id));
    });
}

function filterUsersTable(query) {
    if (!query) {
        populateUsersTable(allUsersData);
        return;
    }
    
    const lower = query.toLowerCase();
    const filtered = allUsersData.filter(u => {
        return u.username.toLowerCase().includes(lower) || (u.email && u.email.toLowerCase().includes(lower));
    });
    populateUsersTable(filtered);
}

function showUserEditor(userId) {
    const user = allUsersData.find(u => u.id == userId);
    if (!user) return;
    
    document.getElementById("password-reset-section").style.display = "none";
    document.getElementById("premium-history-section").style.display = "none";
    
    document.getElementById("edit-user-id").value = user.id;
    document.getElementById("edit-username").value = user.username;
    document.getElementById("edit-email").value = user.email || "";
    document.getElementById("edit-premium-toggle").value = user.is_premium ? "1" : "0";
    document.getElementById("edit-premium-notes").value = "";
    
    const sec = document.getElementById("user-editor-section");
    sec.style.display = "block";
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showPasswordReset(userId, username) {
    document.getElementById("user-editor-section").style.display = "none";
    document.getElementById("premium-history-section").style.display = "none";
    
    document.getElementById("reset-user-id").value = userId;
    document.getElementById("reset-username-display").textContent = username;
    document.getElementById("reset-new-password").value = "";
    
    const sec = document.getElementById("password-reset-section");
    sec.style.display = "block";
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function viewUserVipHistory(userId) {
    document.getElementById("user-editor-section").style.display = "none";
    document.getElementById("password-reset-section").style.display = "none";
    
    const sec = document.getElementById("premium-history-section");
    const tbody = document.getElementById("premium-history-tbody");
    
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-secondary"><i class="fa-solid fa-spinner fa-spin"></i> Loading audit history...</td></tr>`;
    document.getElementById("history-username-display").textContent = "...";
    sec.style.display = "block";
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
    
    try {
        const response = await fetch(`/api/admin/users/history?user_id=${userId}`);
        const data = await response.json();
        
        if (data.error) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-accent">Error: ${data.error}</td></tr>`;
            return;
        }
        
        document.getElementById("history-username-display").textContent = data.username || "User";
        
        if (!data.history || data.history.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-secondary">No VIP history logs found for this user.</td></tr>`;
            return;
        }
        
        let html = "";
        data.history.forEach(h => {
            const actionClass = h.action === "grant" ? "badge-active" : "badge-inactive";
            const actionIcon = h.action === "grant" ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-solid fa-user-slash"></i>';
            const actionText = h.action === "grant" ? "VIP Grant" : "Revoke";
            
            html += `
                <tr>
                    <td style="vertical-align: middle;"><span class="${actionClass}">${actionIcon} ${actionText}</span></td>
                    <td style="vertical-align: middle; font-size: 0.85rem;" class="text-secondary">${h.started_at}</td>
                    <td style="vertical-align: middle; font-size: 0.85rem;" class="text-secondary">${h.ended_at || '<span class="text-secondary" style="font-style: italic; opacity: 0.5;">Current active run</span>'}</td>
                    <td style="vertical-align: middle;">${h.duration}</td>
                    <td style="vertical-align: middle; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${h.notes || '-'}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (err) {
        console.error("Error loading history:", err);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-accent">Network error loading VIP history.</td></tr>`;
    }
}

async function saveUserProfile() {
    const userId = document.getElementById("edit-user-id").value;
    const username = document.getElementById("edit-username").value.trim();
    const email = document.getElementById("edit-email").value.trim();
    const isPremium = document.getElementById("edit-premium-toggle").value;
    const notes = document.getElementById("edit-premium-notes").value.trim();
    
    if (!username) {
        showAdminStatus("Username is required.", "error");
        return;
    }
    
    const saveBtn = document.getElementById("save-user-btn");
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
    
    try {
        const profileRes = await fetch("/api/admin/users/edit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, username, email })
        });
        const profileData = await profileRes.json();
        
        if (profileData.error) {
            showAdminStatus("Failed to update profile: " + profileData.error, "error");
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Save Changes`;
            return;
        }
        
        const vipRes = await fetch("/api/admin/users/toggle-premium", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, is_premium: parseInt(isPremium), notes })
        });
        const vipData = await vipRes.json();
        
        if (vipData.error) {
            showAdminStatus("Profile saved, but failed to toggle VIP status: " + vipData.error, "warning");
        } else {
            showAdminStatus("User profile and VIP status updated successfully!", "success");
        }
        
        document.getElementById("user-editor-section").style.display = "none";
        loadAdminUsers();
    } catch (err) {
        console.error("Error saving user:", err);
        showAdminStatus("Failed to save changes due to network error.", "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Save Changes`;
    }
}

async function saveUserPasswordDirect() {
    const userId = document.getElementById("reset-user-id").value;
    const password = document.getElementById("reset-new-password").value.trim();
    
    if (!password || password.length < 6) {
        showAdminStatus("Password must be at least 6 characters long.", "error");
        return;
    }
    
    const saveBtn = document.getElementById("save-password-btn");
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Resetting...`;
    
    try {
        const response = await fetch("/api/admin/users/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, password })
        });
        const data = await response.json();
        
        if (data.error) {
            showAdminStatus("Failed to reset password: " + data.error, "error");
        } else {
            showAdminStatus("Password has been reset successfully!", "success");
            document.getElementById("password-reset-section").style.display = "none";
            loadAdminUsers();
        }
    } catch (err) {
        console.error("Error resetting password:", err);
        showAdminStatus("Failed to reset password due to network error.", "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fa-solid fa-key"></i> Update Password`;
    }
}

// System Error Logs Logic
let allErrorsData = [];

function initErrorLogs() {
    const clearBtn = document.getElementById("clear-all-errors-btn");
    if (clearBtn) {
        clearBtn.addEventListener("click", clearAllErrorLogs);
    }
    
    const closeDetailsBtn = document.getElementById("close-error-details-btn");
    if (closeDetailsBtn) {
        closeDetailsBtn.addEventListener("click", () => {
            document.getElementById("error-details-section").style.display = "none";
        });
    }
    
    const deleteLogBtn = document.getElementById("delete-error-log-btn");
    if (deleteLogBtn) {
        deleteLogBtn.addEventListener("click", deleteSelectedErrorLog);
    }
}

async function loadAdminErrors() {
    const tbody = document.getElementById("admin-errors-tbody");
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-secondary"><i class="fa-solid fa-spinner fa-spin"></i> Loading system exceptions...</td></tr>`;
    
    try {
        const response = await fetch("/api/admin/errors");
        const data = await response.json();
        
        if (data.error) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-accent">Error loading logs: ${data.error}</td></tr>`;
            return;
        }
        
        allErrorsData = data.errors || [];
        populateErrorsTable(allErrorsData);
    } catch (err) {
        console.error("Error loading error logs:", err);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-accent">Network error loading exception logs.</td></tr>`;
    }
}

function populateErrorsTable(errors) {
    const tbody = document.getElementById("admin-errors-tbody");
    if (!tbody) return;
    
    if (errors.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-secondary">No system exceptions recorded.</td></tr>`;
        return;
    }
    
    let html = "";
    errors.forEach(err => {
        const shortMsg = err.message.length > 50 ? err.message.substring(0, 50) + "..." : err.message;
        
        html += `
            <tr>
                <td style="vertical-align: middle;">${err.id}</td>
                <td style="vertical-align: middle; font-size: 0.85rem;" class="text-secondary">${err.timestamp}</td>
                <td style="vertical-align: middle; font-family: monospace; color: var(--accent); font-weight: 600;">${err.error_type}</td>
                <td style="vertical-align: middle; font-family: monospace; font-size: 0.85rem;">${err.request_path || '-'}</td>
                <td style="vertical-align: middle; font-size: 0.9rem;" title="${err.message}">${shortMsg}</td>
                <td style="vertical-align: middle; font-weight: 600;">${err.username}</td>
                <td style="vertical-align: middle;">
                    <button class="btn btn-secondary btn-xs view-error-btn" data-id="${err.id}" type="button">
                        <i class="fa-solid fa-bug"></i> Trace
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
    
    tbody.querySelectorAll(".view-error-btn").forEach(btn => {
        btn.addEventListener("click", () => showExceptionDetails(btn.dataset.id));
    });
}

function showExceptionDetails(logId) {
    const err = allErrorsData.find(e => e.id == logId);
    if (!err) return;
    
    document.getElementById("error-detail-id").textContent = err.id;
    document.getElementById("error-detail-timestamp").textContent = err.timestamp;
    document.getElementById("error-detail-type").textContent = err.error_type;
    document.getElementById("error-detail-path").textContent = err.request_path || "-";
    document.getElementById("error-detail-user").textContent = err.username;
    document.getElementById("error-detail-message").textContent = err.message;
    document.getElementById("error-detail-stack").textContent = err.stack_trace || "No stack trace recorded.";
    
    const sec = document.getElementById("error-details-section");
    sec.style.display = "block";
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteSelectedErrorLog() {
    const logId = document.getElementById("error-detail-id").textContent;
    if (!logId) return;
    
    if (!confirm(`Are you sure you want to delete error log #${logId}?`)) return;
    
    const deleteBtn = document.getElementById("delete-error-log-btn");
    deleteBtn.disabled = true;
    
    try {
        const response = await fetch("/api/admin/errors/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error_id: parseInt(logId) })
        });
        const data = await response.json();
        
        if (data.error) {
            showAdminStatus("Failed to delete log: " + data.error, "error");
        } else {
            showAdminStatus(`Error log #${logId} deleted.`, "success");
            document.getElementById("error-details-section").style.display = "none";
            loadAdminErrors();
        }
    } catch (err) {
        console.error("Error deleting log:", err);
        showAdminStatus("Network error deleting log.", "error");
    } finally {
        deleteBtn.disabled = false;
    }
}

async function clearAllErrorLogs() {
    if (!confirm("Are you sure you want to purge ALL captured system exceptions? This cannot be undone.")) return;
    
    const clearBtn = document.getElementById("clear-all-errors-btn");
    clearBtn.disabled = true;
    
    try {
        const response = await fetch("/api/admin/errors/clear", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        const data = await response.json();
        
        if (data.error) {
            showAdminStatus("Failed to clear logs: " + data.error, "error");
        } else {
            showAdminStatus("All system exceptions cleared successfully!", "success");
            document.getElementById("error-details-section").style.display = "none";
            loadAdminErrors();
        }
    } catch (err) {
        console.error("Error clearing logs:", err);
        showAdminStatus("Network error clearing exception logs.", "error");
    } finally {
        clearBtn.disabled = false;
    }
}

// Practice Players Cache Viewer Logic
let allPracticePlayersData = [];

function initPracticeViewer() {
    const searchBtn = document.getElementById("practice-search-btn");
    const searchInput = document.getElementById("practice-search-input");
    
    if (searchBtn && searchInput) {
        searchBtn.addEventListener("click", () => {
            filterPracticePlayersTable(searchInput.value.trim());
        });
        searchInput.addEventListener("keyup", (e) => {
            if (e.key === "Enter") {
                filterPracticePlayersTable(searchInput.value.trim());
            }
        });
    }
}

async function loadAdminPracticePlayers() {
    const tbody = document.getElementById("admin-practice-tbody");
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary"><i class="fa-solid fa-spinner fa-spin"></i> Loading practice players...</td></tr>`;
    
    try {
        const response = await fetch("/api/admin/practice-players");
        const data = await response.json();
        
        if (data.error) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-accent">Error loading practice players: ${data.error}</td></tr>`;
            return;
        }
        
        allPracticePlayersData = data || [];
        populatePracticePlayersTable(allPracticePlayersData);
    } catch (err) {
        console.error("Error loading practice players:", err);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-accent">Network error loading practice players.</td></tr>`;
    }
}

function populatePracticePlayersTable(players) {
    const tbody = document.getElementById("admin-practice-tbody");
    if (!tbody) return;
    
    if (players.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary">No practice players cached.</td></tr>`;
        return;
    }
    
    let html = "";
    players.forEach(p => {
        const dbUrlSpan = p.hockeydb_url ? `<a href="${p.hockeydb_url}" target="_blank" class="text-secondary" style="font-size: 0.8rem; display: block; text-decoration: underline;"><i class="fa-solid fa-arrow-up-right-from-square"></i> HockeyDB</a>` : '';
        html += `
            <tr>
                <td style="vertical-align: middle;">
                    <div style="font-weight: 600; color: var(--primary);">${escapeHtml(p.name)}</div>
                    ${dbUrlSpan}
                </td>
                <td style="vertical-align: middle;">${escapeHtml(p.position || 'N/A')}</td>
                <td style="vertical-align: middle;">${escapeHtml(p.nationality || 'N/A')}</td>
                <td style="vertical-align: middle;">${p.franchises_count || 0}</td>
                <td style="vertical-align: middle; font-size: 0.85rem;" class="text-secondary">${p.last_updated || 'N/A'}</td>
                <td style="vertical-align: middle;">
                    <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                        <button class="btn btn-primary btn-xs use-practice-player-btn" data-pid="${p.pid}" type="button">
                            <i class="fa-solid fa-calendar-plus"></i> Use in Schedule
                        </button>
                        <button class="btn btn-accent btn-xs delete-practice-player-btn" data-pid="${p.pid}" data-name="${escapeHtml(p.name)}" type="button">
                            <i class="fa-solid fa-trash"></i> Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Attach event listeners to new buttons
    tbody.querySelectorAll(".use-practice-player-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const pid = btn.dataset.pid;
            const player = allPracticePlayersData.find(p => p.pid === pid);
            if (player) {
                usePracticePlayerInSchedule(player);
            }
        });
    });
    
    tbody.querySelectorAll(".delete-practice-player-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const pid = btn.dataset.pid;
            const name = btn.dataset.name;
            deletePracticePlayer(pid, name);
        });
    });
}

function filterPracticePlayersTable(query) {
    if (!query) {
        populatePracticePlayersTable(allPracticePlayersData);
        return;
    }
    const lowerQuery = query.toLowerCase();
    const filtered = allPracticePlayersData.filter(p => 
        (p.name && p.name.toLowerCase().includes(lowerQuery)) ||
        (p.position && p.position.toLowerCase().includes(lowerQuery)) ||
        (p.nationality && p.nationality.toLowerCase().includes(lowerQuery))
    );
    populatePracticePlayersTable(filtered);
}

function usePracticePlayerInSchedule(player) {
    const editorSection = document.getElementById("player-editor-section");
    if (!editorSection) return;
    
    // Populate form fields
    document.getElementById("editor-player-name").value = player.name || "";
    document.getElementById("editor-height").value = player.height || "";
    document.getElementById("editor-weight").value = player.weight || "";
    document.getElementById("editor-nationality").value = player.nationality || "";
    document.getElementById("editor-shoots").value = player.shoots || "";
    document.getElementById("editor-position").value = player.position || "";
    document.getElementById("editor-draft").value = player.draft_status || "";
    document.getElementById("editor-franchises").value = player.franchises_count || "0";
    document.getElementById("editor-url").value = player.hockeydb_url || "";
    
    // Populate list editors
    populateTeamsList(player.teams_played || []);
    populateMilestonesList(player.milestones || []);
    populateAwardsList(player.awards || []);
    
    // Switch tab back to lineup
    const lineupTabBtn = document.querySelector('.admin-tab-btn[data-tab="lineup"]');
    if (lineupTabBtn) {
        lineupTabBtn.click();
    }
    
    // Show editor panel and scroll to it
    editorSection.style.display = "block";
    editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    showAdminStatus(`Loaded practice player "${player.name}". Choose a date and save to schedule him.`, "success", false);
}

async function deletePracticePlayer(pid, name) {
    if (!confirm(`Are you sure you want to delete "${name}" from the practice cache?`)) return;
    
    try {
        const response = await fetch("/api/admin/practice-players/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pid })
        });
        const data = await response.json();
        
        if (data.error) {
            showAdminStatus("Failed to delete practice player: " + data.error, "error");
        } else {
            showAdminStatus(`Successfully deleted "${name}" from practice cache.`, "success");
            loadAdminPracticePlayers();
            // Refresh stats counts at the bottom of Lineup tab if it exists
            const cacheCountEl = document.getElementById("practice-cache-count");
            if (cacheCountEl) {
                // Trigger a quick fetch of practice cache status
                const res = await fetch("/api/admin/practice-cache");
                const cacheData = await res.json();
                if (!cacheData.error) {
                    cacheCountEl.innerText = `${cacheData.count} players`;
                }
            }
        }
    } catch (err) {
        console.error("Error deleting practice player:", err);
        showAdminStatus("Network error deleting practice player.", "error");
    }
}


