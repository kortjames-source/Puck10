import sys
import os

# Insert the current directory path into system paths so modules can be imported
sys.path.insert(0, os.path.dirname(__file__))

# Phusion Passenger looks for a callable named 'application'
from app import app as application
