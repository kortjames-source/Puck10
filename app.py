from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
import sqlite3
import json
import os
import requests
import urllib.parse
from datetime import datetime, date
from werkzeug.security import generate_password_hash, check_password_hash
import scraper
import random

app = Flask(__name__)
app.secret_key = os.urandom(24)
DATABASE = 'nhl10clues.db'

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def get_player_headshot_url(player_name):
    if not player_name:
        return None
    try:
        query = player_name.strip()
        url = f"https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=5&q={urllib.parse.quote(query)}"
        resp = requests.get(url, timeout=3)
        if resp.status_code == 200:
            results = resp.json()
            if results:
                # Find the player that matches best (case-insensitive name match)
                name_lower = query.lower()
                player = None
                for p in results:
                    if p.get('name', '').lower().strip() == name_lower:
                        player = p
                        break
                if not player:
                    player = results[0]
                
                player_id = player.get('playerId')
                team_abbrev = player.get('teamAbbrev') or player.get('lastTeamAbbrev')
                season_id = player.get('lastSeasonId')
                
                if player_id and team_abbrev and season_id:
                    return f"https://assets.nhle.com/mugs/nhl/{season_id}/{team_abbrev}/{player_id}.png"
                
                # Fallback: query landing API
                if player_id:
                    landing_url = f"https://api-web.nhle.com/v1/player/{player_id}/landing"
                    landing_resp = requests.get(landing_url, timeout=3)
                    if landing_resp.status_code == 200:
                        landing_data = landing_resp.json()
                        return landing_data.get('headshot')
    except Exception as e:
        print(f"Error fetching headshot for {player_name}: {e}")
    return None

def init_db():
    if not os.path.exists(DATABASE):
        # Create database file
        open(DATABASE, 'w').close()
        
    conn = get_db_connection()
    with open('schema.sql', 'r') as f:
        conn.executescript(f.read())
        
    # Check if default admin exists, if not create it
    admin_user = conn.execute("SELECT * FROM users WHERE username = ?", ('admin',)).fetchone()
    if not admin_user:
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            ('admin', generate_password_hash('admin'))
        )
        conn.commit()
        
    # Check if users table has is_premium column, if not add it
    try:
        conn.execute("SELECT is_premium FROM users LIMIT 1")
    except sqlite3.OperationalError:
        conn.execute("ALTER TABLE users ADD COLUMN is_premium INTEGER DEFAULT 0")
        conn.commit()
        
    conn.close()

# Initialize DB on start
init_db()

def is_user_premium():
    user_id = session.get('user_id')
    if not user_id:
        return False
    conn = get_db_connection()
    user = conn.execute("SELECT is_premium FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return bool(user and user['is_premium'])

@app.context_processor
def inject_now():
    return {
        'current_date': date.today().strftime('%Y-%m-%d'),
        'is_premium': is_user_premium()
    }

# Streaks calculation helper
def calculate_user_streaks(user_id):
    conn = get_db_connection()
    games = conn.execute(
        "SELECT date, won FROM user_stats WHERE user_id = ? ORDER BY date ASC",
        (user_id,)
    ).fetchall()
    conn.close()
    
    if not games:
        return 0, 0
        
    curr_streak = 0
    max_streak = 0
    last_date = None
    
    for game in games:
        g_date = datetime.strptime(game['date'], '%Y-%m-%d').date()
        won = game['won']
        
        if won == 1:
            if last_date is None:
                curr_streak = 1
            else:
                diff = (g_date - last_date).days
                if diff == 1:
                    curr_streak += 1
                elif diff > 1:
                    curr_streak = 1
            max_streak = max(max_streak, curr_streak)
            last_date = g_date
        else:
            curr_streak = 0
            last_date = g_date
            
    # If the user has not won today and did not win yesterday, the streak is broken
    if last_date:
        today = date.today()
        if (today - last_date).days > 1:
            curr_streak = 0
            
    return curr_streak, max_streak

# User Stats dashboard summary
def get_user_stats_summary(user_id):
    conn = get_db_connection()
    
    # 1. Total games played
    total_played = conn.execute(
        "SELECT COUNT(*) FROM user_stats WHERE user_id = ?",
        (user_id,)
    ).fetchone()[0]
    
    # 2. Total wins
    wins = conn.execute(
        "SELECT COUNT(*) FROM user_stats WHERE user_id = ? AND won = 1",
        (user_id,)
    ).fetchone()[0]
    
    win_pct = round((wins / total_played * 100), 1) if total_played > 0 else 0
    
    # Total points (sum of scores)
    total_points = conn.execute(
        "SELECT SUM(score) FROM user_stats WHERE user_id = ?",
        (user_id,)
    ).fetchone()[0] or 0

    # Average clues to win (revealed when won)
    avg_clues_row = conn.execute(
        "SELECT AVG(clues_revealed) FROM user_stats WHERE user_id = ? AND won = 1",
        (user_id,)
    ).fetchone()
    avg_clues_to_win = round(avg_clues_row[0], 1) if avg_clues_row and avg_clues_row[0] is not None else 0.0
    
    # 3. Streaks
    curr_streak, max_streak = calculate_user_streaks(user_id)
    
    # 4. Guess distribution
    distribution = {i: 0 for i in range(1, 11)}
    rows = conn.execute(
        "SELECT clues_revealed, COUNT(*) FROM user_stats WHERE user_id = ? AND won = 1 GROUP BY clues_revealed",
        (user_id,)
    ).fetchall()
    
    for row in rows:
        r_num = row[0]
        if r_num in distribution:
            distribution[r_num] = row[1]
            
    max_dist_val = max(distribution.values()) if distribution else 0
    
    conn.close()
    
    return {
        "games_played": total_played,
        "wins": wins,
        "win_pct": win_pct,
        "total_points": total_points,
        "avg_clues_to_win": avg_clues_to_win,
        "current_streak": curr_streak,
        "max_streak": max_streak,
        "guess_distribution": distribution,
        "max_distribution_count": max_dist_val
    }

# ----------------- WEB PAGES -----------------

@app.route('/')
def play():
    # If today's game page, it's index.html
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password']
        
        conn = get_db_connection()
        user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        conn.close()
        
        if user and check_password_hash(user['password_hash'], password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            flash('Successfully logged in!', 'success')
            return redirect(url_for('play'))
        else:
            flash('Invalid username or password.', 'error')
            
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password']
        confirm = request.form['confirm_password']
        
        if len(username) < 3:
            flash('Username must be at least 3 characters.', 'error')
            return render_template('register.html')
            
        if password != confirm:
            flash('Passwords do not match.', 'error')
            return render_template('register.html')
            
        conn = get_db_connection()
        existing = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if existing:
            conn.close()
            flash('Username already exists.', 'error')
            return render_template('register.html')
            
        hashed = generate_password_hash(password)
        try:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, hashed)
            )
            conn.commit()
            
            # Auto login
            user_id = cursor.lastrowid
            session['user_id'] = user_id
            session['username'] = username
            conn.close()
            flash('Account created successfully! Welcome to Puck10.', 'success')
            return redirect(url_for('play'))
        except Exception as e:
            conn.close()
            flash(f'Error creating account: {e}', 'error')
            
    return render_template('register.html')

@app.route('/logout')
def logout():
    session.clear()
    flash('Successfully logged out.', 'success')
    return redirect(url_for('play'))

@app.route('/profile')
def profile():
    if not session.get('user_id'):
        return redirect(url_for('login'))
        
    user_id = session['user_id']
    
    # Get user details
    conn = get_db_connection()
    user = conn.execute("SELECT created_at FROM users WHERE id = ?", (user_id,)).fetchone()
    
    signup_date = "Unknown"
    if user:
        # Format signup date
        try:
            dt = datetime.strptime(user['created_at'], '%Y-%m-%d %H:%M:%S')
            signup_date = dt.strftime('%B %d, %Y')
        except:
            signup_date = user['created_at']
            
    # Get user history
    history = conn.execute(
        "SELECT date, score, clues_revealed, won FROM user_stats WHERE user_id = ? ORDER BY date DESC LIMIT 20",
        (user_id,)
    ).fetchall()
    conn.close()
    
    stats = get_user_stats_summary(user_id)
    
    return render_template('profile.html', stats=stats, signup_date=signup_date, history=history)

@app.route('/admin')
def admin():
    if session.get('username') != 'admin':
        flash('Unauthorized access.', 'error')
        return redirect(url_for('play'))
        
    # Get scheduled list
    conn = get_db_connection()
    schedule = conn.execute(
        "SELECT date, name, position, franchises_count FROM daily_players ORDER BY date DESC"
    ).fetchall()
    conn.close()
    
    return render_template('admin.html', schedule=schedule)

# ----------------- API ENDPOINTS -----------------

@app.route('/api/daily-player')
def get_daily_player():
    today = date.today().strftime('%Y-%m-%d')
    target_date = (request.args.get('date') or today).strip()
    
    # If target_date is not today, verify premium status
    if target_date != today:
        if not is_user_premium():
            return jsonify({"error": "Premium required to play missed days."}), 403
            
    conn = get_db_connection()
    player = conn.execute(
        "SELECT * FROM daily_players WHERE date = ? AND active = 1", (target_date,)
    ).fetchone()
    
    if not player:
        conn.close()
        return jsonify({"error": f"No puzzle player scheduled for {target_date}."}), 404
        
    # Check if user has already played target_date
    played = False
    played_data = None
    if session.get('user_id'):
        user_id = session['user_id']
        stats = conn.execute(
            "SELECT * FROM user_stats WHERE user_id = ? AND date = ?", (user_id, target_date)
        ).fetchone()
        
        if stats:
            played = True
            played_data = {
                "score": stats['score'],
                "clues_revealed": stats['clues_revealed'],
                "wrong_guesses": stats['wrong_guesses'],
                "bet_round": stats['bet_round'],
                "won": stats['won'],
                "player_name": player['name'],
                "headshot_url": get_player_headshot_url(player['name'])
            }
            
    conn.close()
    
    # Package Clues (1 to 10)
    clues = [
        scraper.format_height(player['height']),
        scraper.format_weight(player['weight']),
        player['nationality'],
        player['shoots'],
        player['position'],
        player['draft_status'],
        str(player['franchises_count']) + " franchises",
        player['teams_played'], # JSON array containing team name & logo
        player['milestones'], # JSON array of milestones
        player['awards'] # JSON array of awards
    ]
    
    user_id = session.get('user_id')
    lifetime_stats = get_user_stats_summary(user_id) if user_id else None
    
    return jsonify({
        "played": played,
        "played_data": played_data,
        "clues": clues,
        "lifetime_stats": lifetime_stats
    })

@app.route('/api/autocomplete')
def autocomplete_players():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])
        
    try:
        url = f"https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=8&q={urllib.parse.quote(query)}"
        resp = requests.get(url, timeout=3)
        if resp.status_code == 200:
            players_data = resp.json()
            # Extract player names
            names = [p['name'] for p in players_data]
            return jsonify(names)
    except Exception as e:
        print(f"Error calling NHL autocomplete API: {e}")
        
    return jsonify([])

@app.route('/api/guess', methods=['POST'])
def make_guess():
    data = request.json or {}
    today = date.today().strftime('%Y-%m-%d')
    target_date = (data.get('date') or today).strip()
    
    # If playing a past date, verify premium status
    if target_date != today:
        if not is_user_premium():
            return jsonify({"error": "Premium required to play missed days."}), 403
            
    guess = (data.get('guess') or '').strip()
    
    if not guess:
        return jsonify({"error": "Empty guess"}), 400
        
    conn = get_db_connection()
    player = conn.execute(
        "SELECT name FROM daily_players WHERE date = ? AND active = 1", (target_date,)
    ).fetchone()
    conn.close()
    
    if not player:
        return jsonify({"error": f"No player scheduled on {target_date}"}), 404
        
    correct_name = player['name'].lower().strip()
    user_guess = guess.lower().strip()
    
    # Simple check (allow case-insensitive match)
    if correct_name == user_guess:
        return jsonify({
            "correct": True, 
            "player_name": player['name'],
            "headshot_url": get_player_headshot_url(player['name'])
        })
        
    # Extra check: check if it matches without accents or special characters if needed, 
    # but a simple direct comparison is usually sufficient if autocomplete helps.
    return jsonify({"correct": False})

@app.route('/api/submit-game', methods=['POST'])
def submit_game():
    data = request.json or {}
    today = date.today().strftime('%Y-%m-%d')
    target_date = (data.get('date') or today).strip()
    
    # If playing a past date, verify premium status
    if target_date != today:
        if not is_user_premium():
            return jsonify({"error": "Premium required to submit missed days."}), 403
            
    if not session.get('user_id'):
        # For guest play, return success but don't write to DB
        conn = get_db_connection()
        player = conn.execute(
            "SELECT name FROM daily_players WHERE date = ? AND active = 1", (target_date,)
        ).fetchone()
        conn.close()
        return jsonify({
            "status": "guest_success", 
            "player_name": player['name'] if player else "Unknown",
            "headshot_url": get_player_headshot_url(player['name']) if player else None
        })
        
    user_id = session['user_id']
    score = data.get('score', 0)
    clues_revealed = data.get('clues_revealed', 10)
    wrong_guesses = data.get('wrong_guesses', 0)
    bet_round = data.get('bet_round') # Can be null
    won = data.get('won', 0)
    
    conn = get_db_connection()
    
    # Get player name
    player = conn.execute(
        "SELECT name FROM daily_players WHERE date = ? AND active = 1", (target_date,)
    ).fetchone()
    
    if not player:
        conn.close()
        return jsonify({"error": f"No player scheduled on {target_date}"}), 404
        
    try:
        conn.execute(
            """
            INSERT INTO user_stats (user_id, date, score, clues_revealed, wrong_guesses, bet_round, won)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, date) DO UPDATE SET
                score=excluded.score,
                clues_revealed=excluded.clues_revealed,
                wrong_guesses=excluded.wrong_guesses,
                bet_round=excluded.bet_round,
                won=excluded.won
            """,
            (user_id, target_date, score, clues_revealed, wrong_guesses, bet_round, won)
        )
        conn.commit()
        
        # Get updated lifetime stats for the modal
        lifetime_stats = get_user_stats_summary(user_id)
        conn.close()
        return jsonify({
            "status": "success", 
            "player_name": player['name'],
            "lifetime_stats": lifetime_stats,
            "headshot_url": get_player_headshot_url(player['name'])
        })
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500

# ----------------- ADMIN API -----------------

@app.route('/api/admin/scrape')
def admin_scrape():
    if session.get('username') != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
        
    action = request.args.get('action')
    if action == 'search':
        query = request.args.get('query', '')
        results = scraper.search_player_id(query)
        return jsonify({"results": results})
        
    elif action == 'details':
        pid = request.args.get('pid', '')
        details = scraper.scrape_player_details(pid)
        return jsonify(details)
        
    return jsonify({"error": "Invalid action"}), 400

@app.route('/api/admin/schedule', methods=['POST'])
def admin_schedule():
    if session.get('username') != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.json
    
    date_val = data.get('date')
    name = data.get('name')
    height = data.get('height')
    weight = data.get('weight')
    nationality = data.get('nationality')
    shoots = data.get('shoots')
    position = data.get('position')
    draft_status = data.get('draft_status')
    franchises_count = data.get('franchises_count', 0)
    teams_played = json.dumps(data.get('teams_played', []))
    milestones = json.dumps(data.get('milestones', []))
    awards = json.dumps(data.get('awards', []))
    hockeydb_url = data.get('hockeydb_url')
    
    if not date_val or not name:
        return jsonify({"error": "Missing date or name"}), 400
        
    conn = get_db_connection()
    try:
        conn.execute(
            """
            INSERT INTO daily_players 
            (date, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(date) DO UPDATE SET
                name=excluded.name,
                height=excluded.height,
                weight=excluded.weight,
                nationality=excluded.nationality,
                shoots=excluded.shoots,
                position=excluded.position,
                draft_status=excluded.draft_status,
                franchises_count=excluded.franchises_count,
                teams_played=excluded.teams_played,
                milestones=excluded.milestones,
                awards=excluded.awards,
                hockeydb_url=excluded.hockeydb_url
            """,
            (date_val, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url)
        )
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/practice-cache', methods=['GET', 'POST'])
def admin_practice_cache():
    if session.get('username') != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
        
    conn = get_db_connection()
    if request.method == 'GET':
        count_row = conn.execute("SELECT COUNT(*) FROM practice_players").fetchone()
        latest_row = conn.execute("SELECT MAX(last_updated) FROM practice_players").fetchone()
        conn.close()
        
        count = count_row[0] if count_row else 0
        latest = latest_row[0] if latest_row else "Never"
        return jsonify({"count": count, "latest_update": latest})
    
    # POST: Trigger background refresh of the cache
    import threading
    def rebuild_cache_task():
        print("Background practice cache refresh started...")
        try:
            conn_bg = get_db_connection()
            for pid in FAMOUS_PLAYER_PIDS:
                try:
                    details = scraper.scrape_player_details(pid)
                    if "error" not in details:
                        conn_bg.execute("""
                            INSERT OR REPLACE INTO practice_players
                            (pid, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url, last_updated)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        """, (
                            pid,
                            details['name'],
                            details['height'],
                            details['weight'],
                            details['nationality'],
                            details['shoots'],
                            details['position'],
                            details['draft_status'],
                            details['franchises_count'],
                            json.dumps(details['teams_played']),
                            json.dumps(details['milestones']),
                            json.dumps(details['awards']),
                            details['hockeydb_url']
                        ))
                        conn_bg.commit()
                except Exception as e:
                    print(f"Error caching practice player PID {pid}: {e}")
            conn_bg.close()
            print("Background practice cache refresh complete.")
        except Exception as outer_err:
            print(f"Fatal error in background cache thread: {outer_err}")

    threading.Thread(target=rebuild_cache_task, daemon=True).start()
    return jsonify({"status": "started", "message": "Background cache refresh started."})

@app.route('/api/subscribe', methods=['POST'])
def subscribe():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "You must be logged in to subscribe."}), 401
    
    conn = get_db_connection()
    conn.execute("UPDATE users SET is_premium = 1 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": "Successfully subscribed to Puck10 Premium!"})

@app.route('/calendar')
def calendar_page():
    user_id = session.get('user_id')
    today = date.today().strftime('%Y-%m-%d')
    
    conn = get_db_connection()
    daily_players = conn.execute(
        "SELECT date, name, position, franchises_count FROM daily_players WHERE date <= ? AND active = 1 ORDER BY date DESC",
        (today,)
    ).fetchall()
    
    history = {}
    if user_id:
        stats = conn.execute(
            "SELECT date, score, won, clues_revealed FROM user_stats WHERE user_id = ?",
            (user_id,)
        ).fetchall()
        for s in stats:
            history[s['date']] = {
                "score": s['score'],
                "won": s['won'],
                "clues_revealed": s['clues_revealed']
            }
    conn.close()
    
    calendar_days = []
    for dp in daily_players:
        d_str = dp['date']
        dt = datetime.strptime(d_str, '%Y-%m-%d').date()
        day_history = history.get(d_str)
        
        calendar_days.append({
            "date": d_str,
            "formatted_date": dt.strftime('%B %d, %Y'),
            "player_name": dp['name'],
            "played": day_history is not None,
            "won": day_history['won'] == 1 if day_history else False,
            "score": day_history['score'] if day_history else 0,
            "clues_revealed": day_history['clues_revealed'] if day_history else 0
        })
        
    return render_template('calendar.html', calendar_days=calendar_days)

@app.route('/practice')
def practice_page():
    return render_template('practice.html')

FALLBACK_PLAYERS = [
    {
        "name": "Connor McDavid",
        "height": "6.01",
        "weight": "193",
        "nationality": "Canada",
        "shoots": "L",
        "position": "Center",
        "draft_status": "2015 Round 1 #1 overall by Edmonton Oilers",
        "franchises_count": 1,
        "teams_played": [{"name": "Edmonton Oilers", "logo": "https://assets.nhle.com/logos/nhl/svg/EDM_light.svg"}],
        "milestones": ["647 NHL Games Played", "335 NHL Goals", "647 NHL Assists", "982 NHL Points"],
        "awards": ["2016-17 - Art Ross Trophy", "2016-17 - Hart Memorial Trophy", "2022-23 - Maurice Richard Trophy"]
    },
    {
        "name": "Sidney Crosby",
        "height": "5.11",
        "weight": "200",
        "nationality": "Canada",
        "shoots": "L",
        "position": "Center",
        "draft_status": "2005 Round 1 #1 overall by Pittsburgh Penguins",
        "franchises_count": 1,
        "teams_played": [{"name": "Pittsburgh Penguins", "logo": "https://assets.nhle.com/logos/nhl/svg/PIT_light.svg"}],
        "milestones": ["1272 NHL Games Played", "592 NHL Goals", "1004 NHL Assists", "1596 NHL Points"],
        "awards": ["2006-07 - Art Ross Trophy", "2007-08 - Hart Memorial Trophy", "2008-09 - Stanley Cup Champion"]
    },
    {
        "name": "Alexander Ovechkin",
        "height": "6.03",
        "weight": "238",
        "nationality": "Russia",
        "shoots": "R",
        "position": "Left Wing",
        "draft_status": "2004 Round 1 #1 overall by Washington Capitals",
        "franchises_count": 1,
        "teams_played": [{"name": "Washington Capitals", "logo": "https://assets.nhle.com/logos/nhl/svg/WSH_light.svg"}],
        "milestones": ["1426 NHL Games Played", "853 NHL Goals", "697 NHL Assists", "1550 NHL Points"],
        "awards": ["2007-08 - Art Ross Trophy", "2007-08 - Hart Memorial Trophy", "2017-18 - Stanley Cup Champion"]
    },
    {
        "name": "Wayne Gretzky",
        "height": "6.00",
        "weight": "185",
        "nationality": "Canada",
        "shoots": "L",
        "position": "Center",
        "draft_status": "Undrafted",
        "franchises_count": 4,
        "teams_played": [
            {"name": "Edmonton Oilers", "logo": "https://assets.nhle.com/logos/nhl/svg/EDM_light.svg"},
            {"name": "Los Angeles Kings", "logo": "https://assets.nhle.com/logos/nhl/svg/LAK_light.svg"},
            {"name": "St. Louis Blues", "logo": "https://assets.nhle.com/logos/nhl/svg/STL_light.svg"},
            {"name": "New York Rangers", "logo": "https://assets.nhle.com/logos/nhl/svg/NYR_light.svg"}
        ],
        "milestones": ["1487 NHL Games Played", "894 NHL Goals", "1963 NHL Assists", "2857 NHL Points"],
        "awards": ["1979-80 - Hart Memorial Trophy", "1980-81 - Art Ross Trophy", "1983-84 - Stanley Cup Champion"]
    },
    {
        "name": "Auston Matthews",
        "height": "6.03",
        "weight": "215",
        "nationality": "United States",
        "shoots": "L",
        "position": "Center",
        "draft_status": "2016 Round 1 #1 overall by Toronto Maple Leafs",
        "franchises_count": 1,
        "teams_played": [{"name": "Toronto Maple Leafs", "logo": "https://assets.nhle.com/logos/nhl/svg/TOR_light.svg"}],
        "milestones": ["562 NHL Games Played", "368 NHL Goals", "281 NHL Assists", "649 NHL Points"],
        "awards": ["2016-17 - Calder Memorial Trophy", "2021-22 - Hart Memorial Trophy", "2023-24 - Maurice Richard Trophy"]
    }
]

FAMOUS_PLAYER_PIDS = [
    '160293',  # Connor McDavid
    '2035',    # Wayne Gretzky
    '72740',   # Sidney Crosby
    '78474',   # Alex Ovechkin
    '187652',  # Auston Matthews
    '160074',  # Nathan MacKinnon
    '198944',  # Cale Makar
    '236894',  # Connor Bedard
    '99424',   # Patrick Kane
    '2549',    # Jaromir Jagr
    '3121',    # Mario Lemieux
    '4084',    # Bobby Orr
    '2426',    # Gordie Howe
    '5801',    # Steve Yzerman
    '4668',    # Patrick Roy
    '636',     # Martin Brodeur
    '2191',    # Dominik Hasek
    '3153',    # Nicklas Lidstrom
    '78567',   # Evgeni Malkin
    '172942',  # Leon Draisaitl
    '147514',  # Nikita Kucherov
    '104273',  # Steven Stamkos
    '173516',  # Mitchell Marner
    '172922',  # David Pastrnak
    '200889',  # Quinn Hughes
    '187515',  # Matthew Tkachuk
    '140411',  # Artemi Panarin
    '198336',  # Adam Fox
    '180221',  # Sebastian Aho
    '80136',   # Carey Price
    '59728',   # Henrik Lundqvist
]

@app.route('/api/random-player')
def get_random_player():
    is_premium = is_user_premium()
    today_str = date.today().strftime('%Y-%m-%d')
    
    if 'practice_dates' not in session:
        session['practice_dates'] = {}
        
    dates_to_delete = [d for d in session['practice_dates'] if d != today_str]
    for d in dates_to_delete:
        session['practice_dates'].pop(d)
        
    if today_str not in session['practice_dates']:
        session['practice_dates'][today_str] = 0
        
    practice_count = session['practice_dates'][today_str]
    
    if not is_premium:
        if practice_count >= 3:
            return jsonify({
                "error": "limit_reached",
                "message": "You've used all 3 of your free practice games for today. Upgrade to Premium for unlimited practice games!"
            }), 403
            
    player_details = None
    try:
        conn = get_db_connection()
        row = conn.execute("SELECT * FROM practice_players ORDER BY RANDOM() LIMIT 1").fetchone()
        conn.close()
        
        if row:
            player_details = {
                "name": row["name"],
                "height": row["height"],
                "weight": row["weight"],
                "nationality": row["nationality"],
                "shoots": row["shoots"],
                "position": row["position"],
                "draft_status": row["draft_status"],
                "franchises_count": row["franchises_count"],
                "teams_played": json.loads(row["teams_played"] or "[]"),
                "milestones": json.loads(row["milestones"] or "[]"),
                "awards": json.loads(row["awards"] or "[]")
            }
    except Exception as e:
        print(f"Database error loading practice player: {e}")
        
    if not player_details:
        print("Falling back to offline pool.")
        p = random.choice(FALLBACK_PLAYERS)
        player_details = dict(p)
        
    session['practice_dates'][today_str] += 1
    session.modified = True
    
    session['random_player_answer'] = player_details['name']
    
    clues = [
        scraper.format_height(player_details['height']),
        scraper.format_weight(player_details['weight']),
        player_details['nationality'],
        player_details['shoots'],
        player_details['position'],
        player_details['draft_status'],
        str(player_details['franchises_count']) + " franchises",
        json.dumps(player_details['teams_played']),
        json.dumps(player_details['milestones']),
        json.dumps(player_details['awards'])
    ]
    
    return jsonify({
        "clues": clues,
        "practice_count": session['practice_dates'][today_str],
        "is_premium": is_premium
    })

@app.route('/api/guess-random', methods=['POST'])
def make_guess_random():
    data = request.json or {}
    guess = (data.get('guess') or '').strip()
    
    if not guess:
        return jsonify({"error": "Empty guess"}), 400
        
    correct_name = session.get('random_player_answer', '')
    if not correct_name:
        return jsonify({"error": "No active practice game"}), 400
        
    user_guess = guess.lower().strip()
    if correct_name.lower().strip() == user_guess:
        session.pop('random_player_answer', None)
        return jsonify({
            "correct": True, 
            "player_name": correct_name,
            "headshot_url": get_player_headshot_url(correct_name)
        })
        
    return jsonify({"correct": False})

@app.route('/api/reveal-random', methods=['POST'])
def reveal_random():
    correct_name = session.pop('random_player_answer', None)
    if not correct_name:
        return jsonify({"error": "No active practice game"}), 400
        
    return jsonify({
        "player_name": correct_name,
        "headshot_url": get_player_headshot_url(correct_name)
    })

if __name__ == '__main__':
    # Bind to port 5000
    app.run(host='0.0.0.0', port=5001, debug=True)
