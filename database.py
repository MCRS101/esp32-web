import sqlite3

DATABASE = "devices.db"


def get_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    conn = get_connection()

    # ==============================
    # DEVICE
    # ==============================
    conn.execute("""
        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT UNIQUE NOT NULL,
            device_token TEXT NOT NULL,
            status TEXT DEFAULT 'offline',
            ip_address TEXT,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ==============================
    # SENSOR DATA
    # ==============================
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sensor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            device_id TEXT NOT NULL,

            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

            accel_x REAL DEFAULT 0,
            accel_y REAL DEFAULT 0,
            accel_z REAL DEFAULT 0,

            pga REAL DEFAULT 0,
            peak_pga REAL DEFAULT 0,
            avg_pga REAL DEFAULT 0,

            pendulum REAL DEFAULT 0,

            level TEXT DEFAULT 'LOW',

            direction TEXT DEFAULT '-',

            estimated_ml REAL DEFAULT 0
        )
    """)

    conn.commit()
    conn.close()