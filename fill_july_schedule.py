#!/usr/bin/env python3
import sqlite3
import json
import random
import urllib.parse
import requests
from datetime import date, timedelta

DATABASE = 'nhl10clues.db'

PLAYER_SEARCHES = [
    "Sidney Crosby",
    "Alex Ovechkin",
    "Mario Lemieux",
    "Jaromir Jagr",
    "Nathan MacKinnon",
    "Auston Matthews",
    "Cale Makar",
    "Bobby Orr",
    "Gordie Howe",
    "Steve Yzerman",
    "Patrick Roy",
    "Martin Brodeur",
    "Dominik Hasek",
    "Nicklas Lidstrom",
    "Evgeni Malkin",
    "Leon Draisaitl",
    "Nikita Kucherov",
    "Steven Stamkos",
    "Mitchell Marner",
    "David Pastrnak",
    "Quinn Hughes",
    "Matthew Tkachuk",
    "Artemi Panarin",
    "Adam Fox",
    "Sebastian Aho",
    "Carey Price",
    "Henrik Lundqvist",
    "Connor Bedard"
]

# We also import team name cleaning / logo mapping from scraper
import scraper
ABBREVIATION_TO_TEAM = {v: k for k, v in scraper.TEAM_ABBREVIATIONS.items()}
custom_abbrev_map = {
    'PIT': 'Pittsburgh Penguins',
    'WSH': 'Washington Capitals',
    'TOR': 'Toronto Maple Leafs',
    'EDM': 'Edmonton Oilers',
    'CHI': 'Chicago Blackhawks',
    'MTL': 'Montreal Canadiens',
    'BOS': 'Boston Bruins',
    'DET': 'Detroit Red Wings',
    'COL': 'Colorado Avalanche',
    'VAN': 'Vancouver Canucks',
    'NYR': 'New York Rangers',
    'NJD': 'New Jersey Devils',
    'TBL': 'Tampa Bay Lightning',
    'FLA': 'Florida Panthers',
    'STL': 'St. Louis Blues',
    'PHI': 'Philadelphia Flyers',
    'BUF': 'Buffalo Sabres',
    'SJS': 'San Jose Sharks',
    'ANA': 'Anaheim Ducks',
    'DAL': 'Dallas Stars',
    'NSH': 'Nashville Predators',
    'MIN': 'Minnesota Wild',
    'WPG': 'Winnipeg Jets',
    'OTT': 'Ottawa Senators',
    'CGY': 'Calgary Flames',
    'CBJ': 'Columbus Blue Jackets',
    'LAK': 'Los Angeles Kings',
    'ARI': 'Arizona Coyotes',
    'VGK': 'Vegas Golden Knights',
    'SEA': 'Seattle Kraken',
    'UTA': 'Utah Hockey Club',
    'ATL': 'Atlanta Thrashers',
    'QUE': 'Quebec Nordiques',
    'HFD': 'Hartford Whalers',
    'MNS': 'Minnesota North Stars',
    'WIN': 'Winnipeg Jets (1979-1996)',
    'CAR': 'Carolina Hurricanes'
}
for k, v in custom_abbrev_map.items():
    ABBREVIATION_TO_TEAM[k] = v

def fetch_nhl_player(name):
    encoded = urllib.parse.quote(name)
    search_url = f"https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=5&q={encoded}"
    try:
        resp = requests.get(search_url, timeout=10)
        if resp.status_code != 200:
            print(f"Failed to search for {name}: {resp.status_code}")
            return None
        results = resp.json()
        if not results:
            print(f"No search results for {name}")
            return None
        
        player_id = None
        target_name = name.lower().replace(".", "").replace("-", " ")
        for r in results:
            curr_name = r.get('name', '').lower().replace(".", "").replace("-", " ")
            if curr_name == target_name:
                player_id = r.get('playerId')
                break
        if not player_id:
            player_id = results[0].get('playerId')
            
        if not player_id:
            print(f"No player ID found for {name}")
            return None
            
        landing_url = f"https://api-web.nhle.com/v1/player/{player_id}/landing"
        resp = requests.get(landing_url, timeout=10)
        if resp.status_code != 200:
            print(f"Failed to get landing for {name} (ID: {player_id}): {resp.status_code}")
            return None
        return resp.json()
    except Exception as e:
        print(f"Network error fetching {name}: {e}")
        return None

def parse_nhl_player(data):
    first_name = data.get('firstName', {}).get('default', '')
    last_name = data.get('lastName', {}).get('default', '')
    name = f"{first_name} {last_name}".strip()
    
    height_inches = data.get('heightInInches')
    if height_inches:
        height = f"{height_inches // 12}' {height_inches % 12}\""
    else:
        height = ""
        
    weight_pounds = data.get('weightInPounds')
    if weight_pounds:
        weight = f"{weight_pounds} lbs"
    else:
        weight = ""
        
    birth_country = data.get('birthCountry', 'Unknown')
    NATIONALITY_MAP = {
        'CAN': 'Canada',
        'USA': 'United States',
        'RUS': 'Russia',
        'SWE': 'Sweden',
        'FIN': 'Finland',
        'CZE': 'Czechia',
        'SVK': 'Slovakia',
        'DEU': 'Germany',
        'CHE': 'Switzerland',
        'LVA': 'Latvia',
        'DNK': 'Denmark',
        'NOR': 'Norway',
        'AUT': 'Austria',
        'SVN': 'Slovenia',
        'FRA': 'France',
        'BLR': 'Belarus'
    }
    nationality = NATIONALITY_MAP.get(birth_country, birth_country)
    
    shoots = data.get('shootsCatches', '')
    
    pos_code = data.get('position', '')
    POSITION_MAP = {
        'C': 'Center',
        'L': 'Left Wing',
        'R': 'Right Wing',
        'D': 'Defenseman',
        'G': 'Goalie'
    }
    position = POSITION_MAP.get(pos_code, pos_code)
    
    draft_details = data.get('draftDetails')
    draft_status = "Undrafted"
    if draft_details:
        year = draft_details.get('year')
        round_num = draft_details.get('round')
        pick = draft_details.get('overallPick')
        team_abbrev = draft_details.get('teamAbbrev')
        team_name = ABBREVIATION_TO_TEAM.get(team_abbrev, team_abbrev)
        draft_status = f"{year} Round {round_num} #{pick} overall by {team_name}"
        
    season_totals = data.get('seasonTotals', [])
    nhl_teams = []
    nhl_seasons = set()
    for s in season_totals:
        if s.get('leagueAbbrev') == 'NHL':
            season_id = s.get('season')
            if season_id:
                nhl_seasons.add(season_id)
            t_name = s.get('teamName', {}).get('default')
            if t_name:
                cleaned = scraper.clean_team_name(t_name)
                if cleaned and cleaned not in nhl_teams:
                    nhl_teams.append(cleaned)
                    
    curr_team_abbrev = data.get('currentTeamAbbrev')
    if curr_team_abbrev:
        curr_team_name = ABBREVIATION_TO_TEAM.get(curr_team_abbrev)
        if curr_team_name:
            curr_team_cleaned = scraper.clean_team_name(curr_team_name)
            if curr_team_cleaned and curr_team_cleaned not in nhl_teams:
                nhl_teams.append(curr_team_cleaned)
                
    franchises_count = len(nhl_teams)
    teams_played = [{"name": team, "logo": scraper.get_team_logo(team)} for team in nhl_teams]
    
    milestones = []
    career_totals = data.get('careerTotals', {})
    reg_season = career_totals.get('regularSeason', {})
    is_goalie = position.lower() == 'goalie'
    
    gp = reg_season.get('gamesPlayed', 0)
    if is_goalie:
        w = reg_season.get('wins', 0)
        l = reg_season.get('losses', 0)
        ot = reg_season.get('otLosses', 0)
        t = reg_season.get('ties', 0)
        milestones.append(f"{gp} NHL Games Played")
        milestones.append(f"{w} NHL Wins")
        if l:
            milestones.append(f"{l} NHL Losses")
        if ot:
            milestones.append(f"{ot} NHL Overtime/Tie Losses")
        elif t:
            milestones.append(f"{t} NHL Overtime/Tie Losses")
    else:
        g = reg_season.get('goals', 0)
        a = reg_season.get('assists', 0)
        pts = reg_season.get('points', 0)
        milestones.append(f"{gp} NHL Games Played")
        milestones.append(f"{g} NHL Goals")
        milestones.append(f"{a} NHL Assists")
        milestones.append(f"{pts} NHL Points")
        
    awards_list = []
    awards_data = data.get('awards', [])
    
    def format_season(season_id):
        s = str(season_id)
        if len(s) == 8:
            return f"{s[:4]}-{s[6:]}"
        return s

    if awards_data:
        for award_item in awards_data:
            trophy_name = award_item.get('trophy', {}).get('default')
            seasons = award_item.get('seasons', [])
            for s in seasons:
                season_id = s.get('seasonId')
                if season_id:
                    formatted_season = format_season(season_id)
                    awards_list.append(f"{formatted_season} - {trophy_name}")
                    
    awards_list.sort()
    
    player_slug = data.get('playerSlug', '')
    player_id = data.get('playerId', '')
    hockeydb_url = f"https://www.nhl.com/player/{player_slug}-{player_id}"
    
    return {
        "name": name,
        "height": height,
        "weight": weight,
        "nationality": nationality,
        "shoots": shoots,
        "position": position,
        "draft_status": draft_status,
        "franchises_count": franchises_count,
        "seasons_played": len(nhl_seasons),
        "teams_played": teams_played,
        "milestones": milestones,
        "awards": awards_list,
        "hockeydb_url": hockeydb_url
    }

def run():
    print("Connecting to database...")
    conn = sqlite3.connect(DATABASE)
    
    # 1. Identify unfilled July dates
    july_dates = [f"2026-07-{d:02d}" for d in range(1, 32)]
    
    filled = conn.execute("SELECT date, name FROM daily_players WHERE date LIKE '2026-07-%'").fetchall()
    filled_map = {r[0]: r[1] for r in filled}
    
    empty_dates = [d for d in july_dates if d not in filled_map]
    print(f"Found {len(filled_map)} filled dates and {len(empty_dates)} empty dates in July 2026.")
    
    if not empty_dates:
        print("No empty dates to fill in July!")
        conn.close()
        return

    # 2. Fetch and parse players
    players_data = []
    for p_name in PLAYER_SEARCHES:
        print(f"Fetching {p_name}...", end="", flush=True)
        raw = fetch_nhl_player(p_name)
        if raw:
            parsed = parse_nhl_player(raw)
            if parsed.get('seasons_played', 0) < 3:
                print(f" SKIPPED ({parsed['name']} - only {parsed['seasons_played']} seasons)")
                continue
            players_data.append(parsed)
            print(" SUCCESS")
        else:
            print(" FAILED")
            
    print(f"Successfully fetched {len(players_data)} out of {len(PLAYER_SEARCHES)} players.")
    
    if not players_data:
        print("Error: No player data fetched!")
        conn.close()
        return
        
    # 3. Shuffle/randomize the players list
    random.shuffle(players_data)
    
    # 4. Fill schedule
    scheduled_count = 0
    for idx, d_str in enumerate(empty_dates):
        if idx >= len(players_data):
            print(f"Warning: Ran out of players! Scheduled {scheduled_count} days.")
            break
            
        p = players_data[idx]
        print(f"Scheduling {p['name']} on {d_str}...")
        conn.execute(
            """
            INSERT OR REPLACE INTO daily_players
            (date, name, height, weight, nationality, shoots, position, draft_status, franchises_count, teams_played, milestones, awards, hockeydb_url, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                d_str,
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
                p['hockeydb_url']
            )
        )
        scheduled_count += 1
        
    conn.commit()
    conn.close()
    print(f"Schedule filling complete. Successfully scheduled {scheduled_count} players.")

if __name__ == "__main__":
    run()
