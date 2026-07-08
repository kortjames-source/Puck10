import requests
from bs4 import BeautifulSoup
import re
import urllib.parse

def format_height(height_str):
    if not height_str:
        return ""
    h = str(height_str).strip()
    if "'" in h or '"' in h:
        return h
    # Handles decimal feet format, e.g., 6.01, 5.11
    m = re.match(r'^(\d+)\.(\d+)$', h)
    if m:
        feet = m.group(1)
        inches = str(int(m.group(2)))
        return f"{feet}' {inches}\""
    # Handles hyphen or space separated formats, e.g., 6-1, 6 1
    m2 = re.match(r'^(\d+)[-_\s]+(\d+)$', h)
    if m2:
        feet = m2.group(1)
        inches = str(int(m2.group(2)))
        return f"{feet}' {inches}\""
    return h

def format_weight(weight_str):
    if not weight_str:
        return ""
    w = str(weight_str).strip()
    if "lbs" in w.lower():
        return w
    if w.isdigit():
        return f"{w} lbs"
    return w


# Mapping of NHL team names to their 3-letter NHL CDN abbreviations
TEAM_ABBREVIATIONS = {
    "Edmonton Oilers": "EDM",
    "Winnipeg Jets": "WPG",
    "Buffalo Sabres": "BUF",
    "St. Louis Blues": "STL",
    "Philadelphia Flyers": "PHI",
    "Boston Bruins": "BOS",
    "Montreal Canadiens": "MTL",
    "Toronto Maple Leafs": "TOR",
    "Vancouver Canucks": "VAN",
    "Calgary Flames": "CGY",
    "Ottawa Senators": "OTT",
    "San Jose Sharks": "SJS",
    "Anaheim Ducks": "ANA",
    "Mighty Ducks of Anaheim": "ANA",
    "New Jersey Devils": "NJD",
    "New York Islanders": "NYI",
    "New York Rangers": "NYR",
    "Washington Capitals": "WSH",
    "Carolina Hurricanes": "CAR",
    "Florida Panthers": "FLA",
    "Tampa Bay Lightning": "TBL",
    "Minnesota Wild": "MIN",
    "Nashville Predators": "NSH",
    "Colorado Avalanche": "COL",
    "Dallas Stars": "DAL",
    "Vegas Golden Knights": "VGK",
    "Seattle Kraken": "SEA",
    "Arizona Coyotes": "ARI",
    "Phoenix Coyotes": "ARI",
    "Winnipeg Jets (1979-1996)": "WPG",
    "Quebec Nordiques": "COL",
    "Hartford Whalers": "CAR",
    "Minnesota North Stars": "DAL",
    "Atlanta Thrashers": "WPG",
    "Atlanta Flames": "CGY",
    "Pittsburgh Penguins": "PIT",
    "Columbus Blue Jackets": "CBJ",
    "Utah Hockey Club": "UTA",
    "Los Angeles Kings": "LAK"
}

def clean_team_name(name):
    # Remove emoji trophy and extra text
    name = re.sub(r'[\u2600-\u27BF\U0001f300-\U0001f64f\U0001f680-\U0001f6ff]', '', name)
    name = re.sub(r'\s*\(\w+\)$', '', name) # e.g. "Winnipeg Jets (1979-1996)"
    return name.strip()

def get_team_logo(team_name):
    cleaned = clean_team_name(team_name)
    for k, v in TEAM_ABBREVIATIONS.items():
        if k.lower() in cleaned.lower() or cleaned.lower() in k.lower():
            return f"https://assets.nhle.com/logos/nhl/svg/{v}_light.svg"
    return None

def search_player_id(name):
    """
    Search HockeyDB for a player by name.
    Returns list of dicts: [{'name': ..., 'pid': ..., 'url': ..., 'info': ...}]
    """
    encoded_name = urllib.parse.quote_plus(name)
    url = f"https://www.hockeydb.com/ihdb/stats/find_player.php?full_name={encoded_name}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        resp = requests.get(url, headers=headers, allow_redirects=True, timeout=10)
        if resp.status_code != 200:
            return []
            
        # If redirected directly to profile page
        if "pdisplay.php" in resp.url:
            m = re.search(r'pid=(\d+)', resp.url)
            if m:
                pid = m.group(1)
                # Fetch name from title
                soup = BeautifulSoup(resp.text, 'html.parser')
                h1 = soup.find('h1')
                display_name = h1.get_text().strip() if h1 else name
                return [{
                    "name": display_name,
                    "pid": pid,
                    "url": resp.url,
                    "info": "Direct Match"
                }]
                
        # Parse search results
        soup = BeautifulSoup(resp.text, 'html.parser')
        links = soup.find_all('a', href=re.compile(r'pdisplay\.php\?pid=\d+'))
        
        results = []
        seen_pids = set()
        for link in links:
            href = link.get('href')
            m = re.search(r'pid=(\d+)', href)
            if m:
                pid = m.group(1)
                if pid not in seen_pids:
                    seen_pids.add(pid)
                    p_name = link.get_text().strip()
                    
                    # Try to get extra info from row (years active, draft info, etc.)
                    tr = link.find_parent('tr')
                    info = ""
                    if tr:
                        info = " | ".join([td.get_text().strip() for td in tr.find_all('td') if td.get_text().strip()])
                        
                    results.append({
                        "name": p_name,
                        "pid": pid,
                        "url": f"https://www.hockeydb.com/ihdb/stats/pdisplay.php?pid={pid}",
                        "info": info
                    })
        return results
    except Exception as e:
        print(f"Error searching HockeyDB: {e}")
        return []

def scrape_player_details(pid):
    """
    Scrapes detailed stats for player by PID.
    Returns dictionary with all parsed categories.
    """
    url = f"https://www.hockeydb.com/ihdb/stats/pdisplay.php?pid={pid}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code != 200:
            return {"error": f"Failed to fetch page, status code {resp.status_code}"}
            
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Name
        name = "Unknown Player"
        h1 = soup.find('h1')
        if h1:
            name = h1.get_text().strip()
        else:
            title = soup.title.string if soup.title else ""
            m = re.search(r'(.*?) Hockey Stats', title)
            if m:
                name = m.group(1).strip()

        # Init Vitals
        position = ""
        shoots = ""
        born_date = ""
        born_place = ""
        height = ""
        weight = ""
        
        v1_1 = soup.find('div', class_='v1-1')
        if v1_1:
            # Birthdate
            bdate_span = v1_1.find('span', class_='bdate')
            if bdate_span:
                born_date = bdate_span.get_text().strip()
                born_date = re.sub(r'^Born\s+', '', born_date)
                born_date = re.sub(r'\s*--\s*$', '', born_date).strip()
                
            # Hometown
            hometown_span = v1_1.find('span', class_='hometown')
            if hometown_span:
                born_place = hometown_span.get_text().strip()
                
            # Position & Hand
            v1_text_lines = [l.strip() for l in v1_1.get_text('\n').split('\n') if l.strip()]
            if v1_text_lines:
                first_line = v1_text_lines[0]
                if '--' in first_line:
                    parts = first_line.split('--')
                    position = parts[0].strip()
                    shoots_text = parts[1].strip()
                    m_hand = re.search(r'(shoots|catches)\s+(\w+)', shoots_text, re.IGNORECASE)
                    if m_hand:
                        shoots = m_hand.group(2).upper()
                else:
                    position = first_line
                
            v1_text = v1_1.get_text(' ')
            # Height & Weight
            m_h = re.search(r'Height\s+([0-9\.\'\"]+)', v1_text, re.IGNORECASE)
            m_w = re.search(r'Weight\s+(\d+)', v1_text, re.IGNORECASE)
            if m_h:
                height = format_height(m_h.group(1).strip())
            if m_w:
                weight = format_weight(m_w.group(1).strip())
                        
        # Nationality from born_place
        nationality = "Unknown"
        if born_place:
            provinces = ["ONT", "ON", "QC", "QUE", "BC", "AB", "ALTA", "SK", "SASK", "MB", "MAN", "NB", "NS", "PE", "PEI", "NL", "NFLD", "YT", "NT", "NU"]
            us_states = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"]
            
            parts = [p.strip() for p in born_place.split(',')]
            if len(parts) > 1:
                state = parts[-1].upper().replace('.', '')
                if state in provinces or state == "CANADA":
                    nationality = "Canada"
                elif state in us_states or state == "USA":
                    nationality = "United States"
                else:
                    nationality = parts[-1].strip()
            else:
                nationality = born_place

        # Draft Status
        draft_team = ""
        draft_year = ""
        draft_round = ""
        draft_overall = ""
        draft_status = "Undrafted"
        
        vd = soup.find('div', class_='vd')
        if vd:
            vd_text = vd.get_text(' ')
            m_team = re.search(r'Drafted by\s+([^-\n]+)', vd_text, re.IGNORECASE)
            m_round = re.search(r'round\s+(\d+)', vd_text, re.IGNORECASE)
            m_overall = re.search(r'#(\d+)\s+overall', vd_text, re.IGNORECASE)
            m_year = re.search(r'(\d{4})\s+NHL', vd_text, re.IGNORECASE)
            
            if m_team:
                draft_team = m_team.group(1).strip()
            if m_round:
                draft_round = m_round.group(1).strip()
            if m_overall:
                draft_overall = m_overall.group(1).strip()
            if m_year:
                draft_year = m_year.group(1).strip()
                
            if draft_team or draft_year:
                draft_status = f"{draft_year} Round {draft_round} #{draft_overall} overall by {draft_team}"

        # Stats & Teams Played For
        nhl_teams = []
        nhl_gp = 0
        nhl_g = 0
        nhl_a = 0
        nhl_pts = 0
        
        is_goalie = "goalie" in position.lower()
        nhl_w = 0
        nhl_l = 0
        nhl_t = 0
        nhl_otl = 0
        
        tables = soup.find_all('table')
        stats_table = None
        for table in tables:
            headers = [th.get_text().strip().lower() for th in table.find_all('th')]
            if 'regular season' in headers or 'lge' in headers or 'team' in headers:
                stats_table = table
                break
                
        if stats_table:
            header_row = None
            for row in stats_table.find_all('tr'):
                cols = [td.get_text().strip() for td in row.find_all(['th', 'td'])]
                if 'Lge' in cols or 'lge' in [c.lower() for c in cols]:
                    header_row = cols
                    break
            
            if header_row:
                col_map = {}
                for idx, col in enumerate(header_row):
                    col_lower = col.lower()
                    if col_lower not in col_map:
                        col_map[col_lower] = idx
                
                for row in stats_table.find_all('tr'):
                    if row.find('th'):
                        continue
                    cols = [td.get_text().strip() for td in row.find_all('td')]
                    if not cols or len(cols) < len(header_row):
                        continue
                    
                    lge_idx = col_map.get('lge')
                    if lge_idx is not None and lge_idx < len(cols):
                        lge = cols[lge_idx]
                        if lge == 'NHL':
                            team_idx = col_map.get('team')
                            team_name = cols[team_idx] if team_idx is not None else ""
                            
                            # Clean team name
                            cleaned_t_name = clean_team_name(team_name)
                            if cleaned_t_name and cleaned_t_name not in nhl_teams:
                                nhl_teams.append(cleaned_t_name)
                                
                            # Stats accumulation
                            def safe_int(val):
                                try:
                                    return int(re.sub(r'[^\d]', '', val))
                                except:
                                    return 0
                                    
                            gp_idx = col_map.get('gp')
                            if gp_idx is not None and gp_idx < len(cols):
                                nhl_gp += safe_int(cols[gp_idx])
                                
                            if not is_goalie:
                                g_idx = col_map.get('g')
                                a_idx = col_map.get('a')
                                pts_idx = col_map.get('pts')
                                if g_idx is not None: nhl_g += safe_int(cols[g_idx])
                                if a_idx is not None: nhl_a += safe_int(cols[a_idx])
                                if pts_idx is not None: nhl_pts += safe_int(cols[pts_idx])
                            else:
                                w_idx = col_map.get('w')
                                l_idx = col_map.get('l')
                                t_idx = col_map.get('t')
                                otl_idx = col_map.get('otl')
                                if w_idx is not None: nhl_w += safe_int(cols[w_idx])
                                if l_idx is not None: nhl_l += safe_int(cols[l_idx])
                                if t_idx is not None: nhl_t += safe_int(cols[t_idx])
                                if otl_idx is not None: nhl_otl += safe_int(cols[otl_idx])

        # Awards
        awards = []
        for table in tables:
            headers = [th.get_text().strip().lower() for th in table.find_all('th')]
            if 'award' in headers:
                for row in table.find_all('tr'):
                    if row.find('th'):
                        continue
                    cols = [td.get_text().strip() for td in row.find_all('td')]
                    if len(cols) >= 3:
                        year = cols[0]
                        league = cols[1]
                        award_name = cols[2]
                        if league in ['NHL', 'WHA']:
                            awards.append(f"{year} - {award_name}")

        # Build Milestones
        milestones = []
        if is_goalie:
            milestones.append(f"{nhl_gp} NHL Games Played")
            milestones.append(f"{nhl_w} NHL Wins")
            if nhl_l: milestones.append(f"{nhl_l} NHL Losses")
            if nhl_otl: milestones.append(f"{nhl_otl} NHL Overtime/Tie Losses")
        else:
            milestones.append(f"{nhl_gp} NHL Games Played")
            milestones.append(f"{nhl_g} NHL Goals")
            milestones.append(f"{nhl_a} NHL Assists")
            milestones.append(f"{nhl_pts} NHL Points")

        # Create structured team output (name + logo)
        teams_structured = []
        for team in nhl_teams:
            teams_structured.append({
                "name": team,
                "logo": get_team_logo(team)
            })

        return {
            "name": name,
            "height": height,
            "weight": weight,
            "nationality": nationality,
            "born_place": born_place,
            "born_date": born_date,
            "position": position,
            "shoots": shoots,
            "draft_year": draft_year,
            "draft_round": draft_round,
            "draft_overall": draft_overall,
            "draft_team": draft_team,
            "draft_status": draft_status,
            "franchises_count": len(nhl_teams),
            "teams_played": teams_structured,
            "milestones": milestones,
            "awards": awards,
            "hockeydb_url": url
        }
    except Exception as e:
        print(f"Error scraping details: {e}")
        return {"error": str(e)}
