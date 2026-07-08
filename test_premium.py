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
        conn.execute("DELETE FROM users WHERE username IN ('test_premium_user', 'recovery_test_user', 'standard_test_user', 'vip_test_user')")
        conn.execute("DELETE FROM user_stats WHERE user_id IN (SELECT id FROM users WHERE username IN ('test_premium_user', 'recovery_test_user', 'standard_test_user', 'vip_test_user'))")
        conn.execute("DELETE FROM password_resets WHERE user_id IN (SELECT id FROM users WHERE username IN ('test_premium_user', 'recovery_test_user', 'standard_test_user', 'vip_test_user'))")
        conn.execute("DELETE FROM error_logs WHERE request_path = '/api/trigger-test-error'")
        conn.commit()
        conn.close()

    def tearDown(self):
        # Cleanup
        conn = get_db_connection()
        conn.execute("DELETE FROM users WHERE username IN ('test_premium_user', 'recovery_test_user', 'standard_test_user', 'vip_test_user')")
        conn.execute("DELETE FROM user_stats WHERE user_id IN (SELECT id FROM users WHERE username IN ('test_premium_user', 'recovery_test_user', 'standard_test_user', 'vip_test_user'))")
        conn.execute("DELETE FROM password_resets WHERE user_id IN (SELECT id FROM users WHERE username IN ('test_premium_user', 'recovery_test_user', 'standard_test_user', 'vip_test_user'))")
        conn.execute("DELETE FROM error_logs WHERE request_path = '/api/trigger-test-error'")
        conn.commit()
        conn.close()

    def test_premium_and_calendar_flow(self):
        # 1. Register a new user
        response = self.client.post('/register', data={
            'username': 'test_premium_user',
            'email': 'test_premium_user@example.com',
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

        # 8. Submit results for yesterday's game with guesses list
        guess_history = ['Wrong Player Name', player['name'] if player else 'Sidney Crosby']
        response = self.client.post('/api/submit-game', json={
            'score': 160,
            'clues_revealed': 5,
            'wrong_guesses': 1,
            'bet_round': None,
            'won': 1,
            'date': yesterday_str,
            'guesses': guess_history
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
        self.assertEqual(json.loads(stat['guesses']), guess_history)

        # Call get_daily_player again to verify played_data has correct guesses list
        response = self.client.get(f'/api/daily-player?date={yesterday_str}')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("played"))
        self.assertEqual(data.get("played_data", {}).get("guesses"), guess_history)

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

    def test_password_update_flow(self):
        # 1. Register a new user
        response = self.client.post('/register', data={
            'username': 'test_premium_user',
            'email': 'test_premium_user@example.com',
            'password': 'password123',
            'confirm_password': 'password123'
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        
        # Logout
        self.client.get('/logout')
        
        # Login
        response = self.client.post('/login', data={
            'username': 'test_premium_user',
            'password': 'password123'
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        
        # 2. Try to update password with incorrect current password
        response = self.client.post('/profile/update-password', data={
            'current_password': 'wrongpassword',
            'new_password': 'newpassword123',
            'confirm_password': 'newpassword123'
        }, follow_redirects=True)
        self.assertIn(b'Incorrect current password', response.data)
        
        # 3. Try to update password with mismatching new passwords
        response = self.client.post('/profile/update-password', data={
            'current_password': 'password123',
            'new_password': 'newpassword123',
            'confirm_password': 'differentnewpassword'
        }, follow_redirects=True)
        self.assertIn(b'New passwords do not match', response.data)
        
        # 4. Try to update password with new password too short
        response = self.client.post('/profile/update-password', data={
            'current_password': 'password123',
            'new_password': 'short',
            'confirm_password': 'short'
        }, follow_redirects=True)
        self.assertIn(b'Password must be at least 6 characters long', response.data)
        
        # 5. Update password with correct info
        response = self.client.post('/profile/update-password', data={
            'current_password': 'password123',
            'new_password': 'newpassword123',
            'confirm_password': 'newpassword123'
        }, follow_redirects=True)
        self.assertIn(b'Password updated successfully', response.data)
        
        # 6. Logout and login with the new password
        self.client.get('/logout')
        response = self.client.post('/login', data={
            'username': 'test_premium_user',
            'password': 'newpassword123'
        }, follow_redirects=True)
        self.assertIn(b'Successfully logged in!', response.data)

    def test_password_recovery_flow(self):
        # 1. Register a new user
        response = self.client.post('/register', data={
            'username': 'recovery_test_user',
            'email': 'recovery@example.com',
            'password': 'password123',
            'confirm_password': 'password123'
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        
        self.client.get('/logout')
        
        # 2. Request password reset URL
        response = self.client.post('/forgot-password', data={
            'email': 'recovery@example.com'
        }, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'If that email is registered, a password reset link has been sent.', response.data)
        
        # Fetch the token from DB
        conn = get_db_connection()
        reset_row = conn.execute("SELECT token FROM password_resets ORDER BY id DESC LIMIT 1").fetchone()
        conn.close()
        self.assertIsNotNone(reset_row)
        token = reset_row['token']
        
        # 3. Request reset page with invalid token
        response = self.client.get('/reset-password?token=invalid_token', follow_redirects=True)
        self.assertIn(b'This reset link is invalid, expired, or has already been used.', response.data)
        
        # 4. Request reset page with valid token
        response = self.client.get(f'/reset-password?token={token}', follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'Reset Password', response.data)
        
        # 5. POST to reset page with mismatching passwords
        response = self.client.post(f'/reset-password?token={token}', data={
            'password': 'newpassword123',
            'confirm_password': 'mismatchingpassword'
        }, follow_redirects=True)
        self.assertIn(b'Passwords do not match', response.data)
        
        # 6. POST to reset page with too short password
        response = self.client.post(f'/reset-password?token={token}', data={
            'password': 'short',
            'confirm_password': 'short'
        }, follow_redirects=True)
        self.assertIn(b'Password must be at least 6 characters long', response.data)
        
        # 7. POST to reset page with valid new password
        response = self.client.post(f'/reset-password?token={token}', data={
            'password': 'newpassword123',
            'confirm_password': 'newpassword123'
        }, follow_redirects=True)
        self.assertIn(b'Your password has been reset successfully. Please log in with your new password.', response.data)
        
        # 8. Try logging in with the old password (must fail)
        response = self.client.post('/login', data={
            'username': 'recovery_test_user',
            'password': 'password123'
        }, follow_redirects=True)
        self.assertIn(b'Invalid username or password.', response.data)
        
        # 9. Log in with the new password (must succeed)
        response = self.client.post('/login', data={
            'username': 'recovery_test_user',
            'password': 'newpassword123'
        }, follow_redirects=True)
        self.assertIn(b'Successfully logged in!', response.data)

    def test_admin_endpoints_access_control(self):
        # 1. Non-logged in client should get 403
        response = self.client.get('/api/admin/users')
        self.assertEqual(response.status_code, 403)
        
        # 2. Logged in standard user should get 403
        self.client.post('/register', data={
            'username': 'standard_test_user',
            'email': 'standard@example.com',
            'password': 'password123',
            'confirm_password': 'password123'
        }, follow_redirects=True)
        
        response = self.client.get('/api/admin/users')
        self.assertEqual(response.status_code, 403)
        
        response = self.client.get('/api/admin/errors')
        self.assertEqual(response.status_code, 403)
        
        # 3. Admin user should get 200
        self.client.get('/logout')
        with self.client.session_transaction() as sess:
            sess['username'] = 'admin'
            sess['user_id'] = 9999
            
        response = self.client.get('/api/admin/users')
        self.assertEqual(response.status_code, 200)
        
        response = self.client.get('/api/admin/errors')
        self.assertEqual(response.status_code, 200)

    def test_admin_vip_status_flow(self):
        # Register a standard user
        self.client.post('/register', data={
            'username': 'vip_test_user',
            'email': 'vip_test@example.com',
            'password': 'password123',
            'confirm_password': 'password123'
        }, follow_redirects=True)
        
        # Fetch their user_id
        conn = get_db_connection()
        user_row = conn.execute("SELECT id FROM users WHERE username = 'vip_test_user'").fetchone()
        self.assertIsNotNone(user_row)
        user_id = user_row['id']
        conn.close()
        
        # Log out standard user, log in as admin
        self.client.get('/logout')
        with self.client.session_transaction() as sess:
            sess['username'] = 'admin'
            sess['user_id'] = 9999
            
        # 1. Toggle premium to ON
        response = self.client.post('/api/admin/users/toggle-premium', json={
            'user_id': user_id,
            'is_premium': 1,
            'notes': 'Test VIP activation notes'
        })
        self.assertEqual(response.status_code, 200)
        
        # Check database
        conn = get_db_connection()
        user = conn.execute("SELECT is_premium FROM users WHERE id = ?", (user_id,)).fetchone()
        self.assertEqual(user['is_premium'], 1)
        
        history = conn.execute("SELECT action, notes, ended_at FROM premium_history WHERE user_id = ? ORDER BY id DESC", (user_id,)).fetchall()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]['action'], 'grant')
        self.assertEqual(history[0]['notes'], 'Test VIP activation notes')
        self.assertIsNone(history[0]['ended_at'])
        conn.close()
        
        # 2. Toggle premium to OFF
        response = self.client.post('/api/admin/users/toggle-premium', json={
            'user_id': user_id,
            'is_premium': 0,
            'notes': 'Test VIP revocation notes'
        })
        self.assertEqual(response.status_code, 200)
        
        # Check database
        conn = get_db_connection()
        user = conn.execute("SELECT is_premium FROM users WHERE id = ?", (user_id,)).fetchone()
        self.assertEqual(user['is_premium'], 0)
        
        history = conn.execute("SELECT action, notes, ended_at, duration_seconds FROM premium_history WHERE user_id = ? ORDER BY id ASC", (user_id,)).fetchall()
        # Should have a grant (now ended) and a revoke log
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]['action'], 'grant')
        self.assertIsNotNone(history[0]['ended_at'])
        self.assertIsNotNone(history[0]['duration_seconds'])
        
        self.assertEqual(history[1]['action'], 'revoke')
        self.assertEqual(history[1]['notes'], 'Test VIP revocation notes')
        conn.close()

    def test_error_logging_flow(self):
        from unittest.mock import patch
        
        # Log in as admin so we can access /api/admin/scrape
        with self.client.session_transaction() as sess:
            sess['username'] = 'admin'
            sess['user_id'] = 9999
            
        with patch('scraper.search_player_id', side_effect=ValueError("Simulated division by zero")):
            response = self.client.get('/api/admin/scrape?action=search&query=Wayne')
            self.assertEqual(response.status_code, 500)
            
        # Check that error is in database
        conn = get_db_connection()
        err_row = conn.execute("SELECT error_type, message, request_path FROM error_logs WHERE message = 'Simulated division by zero' ORDER BY id DESC LIMIT 1").fetchone()
        
        # Cleanup log to avoid polluting the database
        conn.execute("DELETE FROM error_logs WHERE message = 'Simulated division by zero'")
        conn.commit()
        conn.close()
        
        self.assertIsNotNone(err_row)
        self.assertEqual(err_row['error_type'], 'ValueError')
        self.assertEqual(err_row['message'], 'Simulated division by zero')
        self.assertEqual(err_row['request_path'], '/api/admin/scrape')

if __name__ == '__main__':
    unittest.main()

