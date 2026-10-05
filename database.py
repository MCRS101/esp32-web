import os
import mysql.connector


# =========================================================
# MYSQL CONFIG
# =========================================================

MYSQL_HOST = os.getenv("MYSQL_HOST", "mysql.railway.internal")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "EMCkzHMLRjQsYEXVBlhqEJpjlfIVgMiu")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "railway")


# =========================================================
# DATABASE CONNECTION
# =========================================================

def get_connection():

    conn = mysql.connector.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE
    )

    return conn


# =========================================================
# INIT DATABASE
# =========================================================

def init_database():

    # -----------------------------------------
    # เชื่อมต่อ MySQL โดยยังไม่เลือก Database
    # -----------------------------------------

    conn = mysql.connector.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD
    )

    cursor = conn.cursor()

    # -----------------------------------------
    # สร้าง Database ถ้ายังไม่มี
    # -----------------------------------------

    cursor.execute(
        f"""
        CREATE DATABASE IF NOT EXISTS `{MYSQL_DATABASE}`
        CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
        """
    )

    cursor.close()
    conn.close()


    # -----------------------------------------
    # เชื่อมต่อ Database
    # -----------------------------------------

    conn = get_connection()
    cursor = conn.cursor()


    # =====================================================
    # DEVICES
    # =====================================================

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS devices (

            id INT AUTO_INCREMENT PRIMARY KEY,

            device_id VARCHAR(100) UNIQUE NOT NULL,

            device_token VARCHAR(255) NOT NULL,

            status VARCHAR(20) DEFAULT 'offline',

            ip_address VARCHAR(45),

            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP

        )
    """)


    # =====================================================
    # SENSOR DATA
    # =====================================================

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sensor_data (

            id BIGINT AUTO_INCREMENT PRIMARY KEY,

            device_id VARCHAR(100) NOT NULL,

            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            accel_x DOUBLE DEFAULT 0,

            accel_y DOUBLE DEFAULT 0,

            accel_z DOUBLE DEFAULT 0,

            pga DOUBLE DEFAULT 0,

            peak_pga DOUBLE DEFAULT 0,

            avg_pga DOUBLE DEFAULT 0,

            pendulum DOUBLE DEFAULT 0,

            level VARCHAR(20) DEFAULT 'LOW',

            direction VARCHAR(10) DEFAULT '-',

            estimated_ml DOUBLE DEFAULT 0,

            INDEX idx_sensor_device_id (device_id),

            INDEX idx_sensor_timestamp (timestamp)

        )
    """)


    conn.commit()

    cursor.close()
    conn.close()


    print("====================================")
    print("MYSQL DATABASE READY")
    print("Database:", MYSQL_DATABASE)
    print("====================================")