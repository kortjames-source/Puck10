import sqlite3
import json
import os
from datetime import date, timedelta
import scraper
from app import FALLBACK_PLAYERS

DATABASE = 'nhl10clues.db'

def get_secure_admin_password():
    # 1. Check environment variable
    password = os.environ.get('ADMIN_PASSWORD')
    if password:
        return password
    
    # 2. Check .env file
    if os.path.exists('.env'):
        try:
            with open('.env', 'r') as f:
                for line in f:
                    if line.strip().startswith('ADMIN_PASSWORD='):
                        val = line.strip().split('=', 1)[1].strip()
                        if val.startswith(('"', "'")) and val.endswith(('"', "'")):
                            val = val[1:-1]
                        if val:
                            return val
        except Exception as e:
            print(f"Error reading .env: {e}")
            
    # 3. Generate dynamic cryptographically secure password
    import secrets
    new_password = secrets.token_urlsafe(12) # ~16 characters
    print(f"GENERATED SECURE ADMIN PASSWORD: {new_password}")
    print("WARNING: This password is generated in-memory and will change on next restart if not saved in environment or .env!")
    return new_password


def run():
    print("Initializing Database...")
    if not os.path.exists(DATABASE):
        open(DATABASE, 'w').close()
        
    conn = sqlite3.connect(DATABASE)
    
    # Run Schema
    with open('schema.sql', 'r') as f:
        conn.executescript(f.read())
        
    # Check if admin user exists
    from werkzeug.security import generate_password_hash
    admin = conn.execute("SELECT * FROM users WHERE username = 'admin'").fetchone()
    if not admin:
        admin_pass = get_secure_admin_password()
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES ('admin', ?)",
            (generate_password_hash(admin_pass),)
        )
        print(f"Created default admin user (username: admin, password: {admin_pass})")

        
    # Seed practice players first, so that we clear the table and seed the random pool
    # before adding the specific daily players (McDavid and Gretzky) to the cache.
    print("Seeding practice players table with 15 random NHL players...")
    try:
        import random
        from app import FAMOUS_PLAYER_NAMES, fetch_nhl_player, parse_nhl_player
        
        # Clear existing practice players
        conn.execute("DELETE FROM practice_players")
        conn.commit()
        
        selected_names = random.sample(FAMOUS_PLAYER_NAMES, min(15, len(FAMOUS_PLAYER_NAMES)))
        success_count = 0
        for idx, p_name in enumerate(selected_names, 1):
            print(f"[{idx}/{len(selected_names)}] Fetching details for {p_name}...", end="", flush=True)
            raw = fetch_nhl_player(p_name)
            if raw:
                parsed = parse_nhl_player(raw)
                if parsed.get('seasons_played', 0) < 3:
                    print(f" SKIPPED (only {parsed.get('seasons_played', 0)} seasons)")
                    continue
                conn.execute(
                    """
                    INSERT OR REPLACE INTO practice_players
                    (pid, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (
                        parsed['player_id'],
                        parsed['name'],
                        parsed['height'],
                        parsed['weight'],
                        parsed['nationality'],
                        parsed['shoots'],
                        parsed['position'],
                        parsed['draft_status'],
                        parsed['franchises_count'],
                        json.dumps(parsed['teams_played']),
                        json.dumps(parsed['milestones']),
                        json.dumps(parsed['awards']),
                        parsed['hockeydb_url']
                    )
                )
                conn.commit()
                print(" SUCCESS")
                success_count += 1
            else:
                print(" FAILED")
                
        print(f"Successfully seeded {success_count} practice players.")
    except Exception as e:
        print(f"Error seeding practice players: {e}")

    # Let's scrape and schedule daily players
    from app import fetch_nhl_player, parse_nhl_player

    def save_to_practice_cache(db_conn, parsed):
        db_conn.execute(
            """
            INSERT OR REPLACE INTO practice_players
            (pid, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                parsed['player_id'],
                parsed['name'],
                parsed['height'],
                parsed['weight'],
                parsed['nationality'],
                parsed['shoots'],
                parsed['position'],
                parsed['draft_status'],
                parsed['franchises_count'],
                json.dumps(parsed['teams_played']),
                json.dumps(parsed['milestones']),
                json.dumps(parsed['awards']),
                parsed['hockeydb_url']
            )
        )

    # 1. Connor McDavid for today
    today = date.today().strftime('%Y-%m-%d')
    print(f"Fetching Connor McDavid for today ({today})...")
    raw_mcdavid = fetch_nhl_player("Connor McDavid")
    if raw_mcdavid:
        parsed_mcdavid = parse_nhl_player(raw_mcdavid)
        conn.execute(
            """
            INSERT OR REPLACE INTO daily_players 
            (date, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                today,
                parsed_mcdavid['name'],
                parsed_mcdavid['height'],
                parsed_mcdavid['weight'],
                parsed_mcdavid['nationality'],
                parsed_mcdavid['shoots'],
                parsed_mcdavid['position'],
                parsed_mcdavid['draft_status'],
                parsed_mcdavid['franchises_count'],
                json.dumps(parsed_mcdavid['teams_played']),
                json.dumps(parsed_mcdavid['milestones']),
                json.dumps(parsed_mcdavid['awards']),
                parsed_mcdavid['hockeydb_url']
            )
        )
        save_to_practice_cache(conn, parsed_mcdavid)
        print(f"Scheduled Connor McDavid for {today}")
    else:
        print("Error fetching McDavid from NHL API")

    # 2. Wayne Gretzky for tomorrow
    tomorrow = (date.today() + timedelta(days=1)).strftime('%Y-%m-%d')
    print(f"Fetching Wayne Gretzky for tomorrow ({tomorrow})...")
    raw_gretzky = fetch_nhl_player("Wayne Gretzky")
    if raw_gretzky:
        parsed_gretzky = parse_nhl_player(raw_gretzky)
        conn.execute(
            """
            INSERT OR REPLACE INTO daily_players 
            (date, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                tomorrow,
                parsed_gretzky['name'],
                parsed_gretzky['height'],
                parsed_gretzky['weight'],
                parsed_gretzky['nationality'],
                parsed_gretzky['shoots'],
                parsed_gretzky['position'],
                parsed_gretzky['draft_status'],
                parsed_gretzky['franchises_count'],
                json.dumps(parsed_gretzky['teams_played']),
                json.dumps(parsed_gretzky['milestones']),
                json.dumps(parsed_gretzky['awards']),
                parsed_gretzky['hockeydb_url']
            )
        )
        save_to_practice_cache(conn, parsed_gretzky)
        print(f"Scheduled Wayne Gretzky for {tomorrow}")
    else:
        print("Error fetching Gretzky from NHL API")
        
    conn.commit()
    conn.close()
    print("Database initialization complete.")

if __name__ == "__main__":
    run()
