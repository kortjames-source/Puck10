#!/usr/bin/env python3
import json
import sys
import scraper
from app import FAMOUS_PLAYER_PIDS, get_db_connection

def run():
    print(f"Starting practice players cache refresh for {len(FAMOUS_PLAYER_PIDS)} players...")
    conn = get_db_connection()
    
    success_count = 0
    failure_count = 0
    
    for idx, pid in enumerate(FAMOUS_PLAYER_PIDS, 1):
        print(f"[{idx}/{len(FAMOUS_PLAYER_PIDS)}] Scraping PID {pid}...", end="", flush=True)
        try:
            details = scraper.scrape_player_details(pid)
            if "error" not in details:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO practice_players
                    (pid, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (
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
                    )
                )
                conn.commit()
                print(" SUCCESS")
                success_count += 1
            else:
                print(f" FAILED (scraper error: {details['error']})")
                failure_count += 1
        except Exception as e:
            print(f" ERROR ({e})")
            failure_count += 1
            
    conn.close()
    print(f"Practice cache refresh complete. Successes: {success_count}, Failures: {failure_count}")
    if failure_count > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    run()
