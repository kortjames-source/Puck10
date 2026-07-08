import unittest
import sqlite3
import json
from datetime import date, timedelta
from app import app, get_db_connection

class Puck10PremiumTestCase(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False
        app.secret_key = 'test_secret_key'
        self.client = app.test_client()
        
        # Set up test database or clean test users
        conn = get_db_connection()
        conn.execute("DELETE FROM users WHERE username = 'test_premium_user'")
        conn.execute("DELETE FROM user_stats WHERE user_id IN (SELECT id FROM users WHERE username = 'test_premium_user')")
        conn.commit()
        conn.close()

    def tearDown(self):
        # Cleanup
        conn = get_db_connection()
        conn.execute("DELETE FROM users WHERE username = 'test_premium_user'")
        conn.execute("DELETE FROM user_stats WHERE user_id IN (SELECT id FROM users WHERE username = 'test_premium_user')")
        conn.commit()
        conn.close()

    def test_premium_and_calendar_flow(self):
        # 1. Register a new user
        response = self.client.post('/register', data={
            'username': 'test_premium_user',
            'password': 'password123',
            'confirm_password': 'password123'
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        
        # Verify user is registered and logged in (session user_id is set)
        with self.client.session_transaction() as sess:
            self.assertIn('user_id', sess)
            user_id = sess['user_id']
            
        # Get yesterday's date string
        yesterday_str = (date.today() - timedelta(days=1)).strftime('%Y-%m-%d')
        
        # 2. Verify non-premium user is blocked from playing a past day (yesterday)
        response = self.client.get(f'/api/daily-player?date={yesterday_str}')
        self.assertEqual(response.status_code, 403)
        data = json.loads(response.data)
        self.assertIn("Premium required", data.get("error", ""))

        # 3. Verify non-premium user has practice game limits
        # Call it 3 times (the daily limit)
        for i in range(3):
            response = self.client.get('/api/random-player')
            if response.status_code != 200:
                print("RANDOM PLAYER CALL FAILED WITH:", response.status_code, response.data)
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn("clues", data)
            self.assertEqual(data["practice_count"], i + 1)
            self.assertFalse(data["is_premium"])

        # The 4th call should be blocked
        response = self.client.get('/api/random-player')
        self.assertEqual(response.status_code, 403)
        data = json.loads(response.data)
        self.assertEqual(data.get("error"), "limit_reached")

        # 4. Subscribe to Premium
        response = self.client.post('/api/subscribe')
        if response.status_code != 200:
            print("SUBSCRIBE FAILED:", response.status_code, response.data)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data.get("status"), "success")

        # 5. Verify practice limit is now lifted (unlimited)
        # We can call it again and it should succeed since the user is now premium!
        response = self.client.get('/api/random-player')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn("clues", data)
        self.assertTrue(data["is_premium"])

        # 6. Verify premium user can now load yesterday's player clues
        response = self.client.get(f'/api/daily-player?date={yesterday_str}')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn("clues", data)
        self.assertFalse(data["played"])

        # 7. Make a guess on yesterday's puzzle
        # Let's try incorrect first
        response = self.client.post('/api/guess', json={
            'guess': 'Wrong Player Name',
            'date': yesterday_str
        })
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertFalse(data.get("correct"))

        # Try correct guess (Crosby is scheduled for yesterday in setup)
        conn = get_db_connection()
        player = conn.execute("SELECT name FROM daily_players WHERE date = ?", (yesterday_str,)).fetchone()
        conn.close()
        print("ACTUAL NAME IN DB:", player['name'] if player else "None")

        response = self.client.post('/api/guess', json={
            'guess': player['name'] if player else 'Sidney Crosby',
            'date': yesterday_str
        })
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("correct"))
        self.assertEqual(data.get("player_name"), player['name'] if player else "Sidney Crosby")

        # 8. Submit results for yesterday's game
        response = self.client.post('/api/submit-game', json={
            'score': 160,
            'clues_revealed': 5,
            'wrong_guesses': 1,
            'bet_round': None,
            'won': 1,
            'date': yesterday_str
        })
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data.get("status"), "success")

        # Verify it was recorded in the database under yesterday's date
        conn = get_db_connection()
        stat = conn.execute("SELECT * FROM user_stats WHERE user_id = ? AND date = ?", (user_id, yesterday_str)).fetchone()
        conn.close()
        self.assertIsNotNone(stat)
        self.assertEqual(stat['score'], 160)
        self.assertEqual(stat['won'], 1)

    def test_guess_with_null_or_empty_date(self):
        # Verify that API handles null or empty date gracefully without throwing 500 error
        response = self.client.post('/api/guess', json={
            'guess': 'Sidney Crosby',
            'date': None
        })
        # If the bug exists, this will raise a 500 or crash. We expect a 200/404/400 but definitely not 500.
        self.assertIn(response.status_code, [200, 404])

        response_empty = self.client.post('/api/guess', json={
            'guess': 'Sidney Crosby',
            'date': ''
        })
        self.assertIn(response_empty.status_code, [200, 404])

        response_submit = self.client.post('/api/submit-game', json={
            'score': 160,
            'clues_revealed': 5,
            'wrong_guesses': 1,
            'bet_round': None,
            'won': 1,
            'date': None
        })
        self.assertIn(response_submit.status_code, [200, 404])

    def test_practice_cache_endpoints(self):
        # 1. Verify unauthorized if not logged in as admin
        response = self.client.get('/api/admin/practice-cache')
        self.assertEqual(response.status_code, 403)
        
        # 2. Log in as admin in session
        with self.client.session_transaction() as sess:
            sess['username'] = 'admin'
            
        # 3. Verify GET works and returns count and latest update
        response = self.client.get('/api/admin/practice-cache')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn("count", data)
        self.assertIn("latest_update", data)
        
        # Count should be at least 5 because init_data.py seeded the fallback players
        self.assertGreaterEqual(data["count"], 5)
        
        # 4. Verify POST triggers rebuild cache
        response = self.client.post('/api/admin/practice-cache')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data.get("status"), "started")

if __name__ == '__main__':
    unittest.main()
