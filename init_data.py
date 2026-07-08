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

        
    # Let's scrape and schedule players
    # 1. Connor McDavid (PID 160293) for today
    today = date.today().strftime('%Y-%m-%d')
    print(f"Scraping Connor McDavid (PID 160293) for today ({today})...")
    mcdavid_data = scraper.scrape_player_details('160293')
    
    if "error" not in mcdavid_data:
        conn.execute(
            """
            INSERT OR REPLACE INTO daily_players 
            (date, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                today,
                mcdavid_data['name'],
                mcdavid_data['height'],
                mcdavid_data['weight'],
                mcdavid_data['nationality'],
                mcdavid_data['shoots'],
                mcdavid_data['position'],
                mcdavid_data['draft_status'],
                mcdavid_data['franchises_count'],
                json.dumps(mcdavid_data['teams_played']),
                json.dumps(mcdavid_data['milestones']),
                json.dumps(mcdavid_data['awards']),
                mcdavid_data['hockeydb_url']
            )
        )
        print(f"Scheduled Connor McDavid for {today}")
    else:
        print(f"Error scraping McDavid: {mcdavid_data['error']}")

    # 2. Wayne Gretzky (PID 2035) for tomorrow
    tomorrow = (date.today() + timedelta(days=1)).strftime('%Y-%m-%d')
    print(f"Scraping Wayne Gretzky (PID 2035) for tomorrow ({tomorrow})...")
    gretzky_data = scraper.scrape_player_details('2035')
    
    if "error" not in gretzky_data:
        conn.execute(
            """
            INSERT OR REPLACE INTO daily_players 
            (date, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                tomorrow,
                gretzky_data['name'],
                gretzky_data['height'],
                gretzky_data['weight'],
                gretzky_data['nationality'],
                gretzky_data['shoots'],
                gretzky_data['position'],
                gretzky_data['draft_status'],
                gretzky_data['franchises_count'],
                json.dumps(gretzky_data['teams_played']),
                json.dumps(gretzky_data['milestones']),
                json.dumps(gretzky_data['awards']),
                gretzky_data['hockeydb_url']
            )
        )
        print(f"Scheduled Wayne Gretzky for {tomorrow}")
    else:
        print(f"Error scraping Gretzky: {gretzky_data['error']}")
        
    # Seed practice players
    print("Seeding practice players table...")
    try:
        fallback_pids = {
            "Connor McDavid": "160293",
            "Sidney Crosby": "72740",
            "Alexander Ovechkin": "78474",
            "Wayne Gretzky": "2035",
            "Auston Matthews": "187652"
        }
        for p in FALLBACK_PLAYERS:
            pid = fallback_pids.get(p['name'])
            if pid:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO practice_players
                    (pid, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        pid,
                        p['name'],
                        p['height'],
                        p['weight'],
                        p['nationality'],
                        p['shoots'],
                        p['position'],
                        p['draft_status'],
                        p['franchises_count'],
                        json.dumps(p['teams_played']),
                        json.dumps(p['milestones']),
                        json.dumps(p['awards']),
                        f"https://www.hockeydb.com/ihdb/stats/pdisplay.php?pid={pid}"
                    )
                )
        print("Successfully seeded practice players table.")
    except Exception as e:
        print(f"Error seeding practice players: {e}")
        
    conn.commit()
    conn.close()
    print("Database initialization complete.")

if __name__ == "__main__":
    run()
