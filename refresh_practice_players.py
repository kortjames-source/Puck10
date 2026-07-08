#!/usr/bin/env python3
import json
import sys
import random
from app import FAMOUS_PLAYER_NAMES, fetch_nhl_player, parse_nhl_player, get_db_connection

def run():
    # Select 15 random players from FAMOUS_PLAYER_NAMES
    selected_names = random.sample(FAMOUS_PLAYER_NAMES, min(15, len(FAMOUS_PLAYER_NAMES)))
    print(f"Starting practice players cache refresh for {len(selected_names)} random players...")
    
    conn = get_db_connection()
    # Clear old practice players to purge any "dumb" players
    conn.execute("DELETE FROM practice_players")
    conn.commit()
    
    success_count = 0
    failure_count = 0
    
    for idx, p_name in enumerate(selected_names, 1):
        print(f"[{idx}/{len(selected_names)}] Fetching details for {p_name}...", end="", flush=True)
        try:
            raw = fetch_nhl_player(p_name)
            if raw:
                parsed = parse_nhl_player(raw)
                if parsed.get('seasons_played', 0) < 3:
                    print(f" SKIPPED (only {parsed.get('seasons_played', 0)} seasons)")
                    failure_count += 1
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
                print(" FAILED (failed to fetch player details)")
                failure_count += 1
        except Exception as e:
            print(f" ERROR ({e})")
            failure_count += 1
            
    conn.close()
    print(f"Practice cache refresh complete. Successes: {success_count}, Failures: {failure_count}")
    if failure_count > 0:
        if success_count >= 10:
            sys.exit(0)
        else:
            sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    run()
