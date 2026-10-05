import os

from flask import Flask, request, jsonify, render_template
from database import get_connection, init_database

import secrets
import datetime


app = Flask(__name__)

# สร้าง Database ตอนเริ่ม Server
init_database()


# =========================================================
# HOME
# =========================================================

@app.route("/")
def index():
    return render_template("index.html")


# =========================================================
# REGISTER ESP32
# =========================================================

@app.route("/api/device/register", methods=["POST"])
def register_device():

    data = request.get_json(silent=True)

    if not data:
        return jsonify({
            "success": False,
            "message": "Invalid JSON"
        }), 400

    device_id = data.get("device_id")

    if not device_id:
        return jsonify({
            "success": False,
            "message": "device_id is required"
        }), 400

    conn = get_connection()

    # ตรวจสอบว่ามี device อยู่แล้วหรือไม่
    device = conn.execute(
        """
        SELECT *
        FROM devices
        WHERE device_id = ?
        """,
        (device_id,)
    ).fetchone()

    if device:

        conn.execute(
            """
            UPDATE devices
            SET status = 'online',
                ip_address = ?,
                last_seen = CURRENT_TIMESTAMP
            WHERE device_id = ?
            """,
            (
                request.remote_addr,
                device_id
            )
        )

        conn.commit()
        conn.close()

        return jsonify({
            "success": True,
            "message": "Device already registered",
            "device_id": device_id
        })


    # Device ใหม่
    device_token = secrets.token_hex(32)

    conn.execute(
        """
        INSERT INTO devices
        (
            device_id,
            device_token,
            status,
            ip_address,
            last_seen
        )
        VALUES (?, ?, 'online', ?, CURRENT_TIMESTAMP)
        """,
        (
            device_id,
            device_token,
            request.remote_addr
        )
    )

    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "message": "Device registered",
        "device_id": device_id,
        "device_token": device_token
    })


# =========================================================
# RECEIVE SENSOR DATA
# =========================================================

@app.route("/api/device/data", methods=["POST"])
def receive_sensor_data():

    data = request.get_json(silent=True)

    if not data:
        return jsonify({
            "success": False,
            "message": "Invalid JSON"
        }), 400


    device_id = data.get("device_id")

    if not device_id:
        return jsonify({
            "success": False,
            "message": "device_id is required"
        }), 400


    # -------------------------------------
    # รับค่าจาก ESP32
    # -------------------------------------

    accel_x = float(data.get("accel_x", 0))
    accel_y = float(data.get("accel_y", 0))
    accel_z = float(data.get("accel_z", 0))

    pga = float(data.get("pga", 0))
    peak_pga = float(data.get("peak_pga", 0))
    avg_pga = float(data.get("avg_pga", 0))

    pendulum = float(data.get("pendulum", 0))

    level = data.get("level", "LOW")

    direction = data.get(
        "direction",
        "-"
    )

    estimated_ml = float(
        data.get("estimated_ml", 0)
    )


    conn = get_connection()


    # -------------------------------------
    # บันทึก Sensor Data
    # -------------------------------------

    conn.execute(
        """
        INSERT INTO sensor_data
        (
            device_id,
            accel_x,
            accel_y,
            accel_z,
            pga,
            peak_pga,
            avg_pga,
            pendulum,
            level,
            direction,
            estimated_ml
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            device_id,
            accel_x,
            accel_y,
            accel_z,
            pga,
            peak_pga,
            avg_pga,
            pendulum,
            level,
            direction,
            estimated_ml
        )
    )


    # -------------------------------------
    # Update Device Status
    # -------------------------------------

    conn.execute(
        """
        UPDATE devices
        SET status = 'online',
            ip_address = ?,
            last_seen = CURRENT_TIMESTAMP
        WHERE device_id = ?
        """,
        (
            request.remote_addr,
            device_id
        )
    )


    conn.commit()
    conn.close()


    # -------------------------------------
    # Response
    # -------------------------------------

    return jsonify({
        "success": True,
        "message": "Sensor data received",
        "alert": level in [
            "HIGH",
            "SEVERE"
        ]
    })


# =========================================================
# GET LATEST SENSOR DATA
# =========================================================

@app.route("/api/device/<device_id>/latest", methods=["GET"])
def get_latest(device_id):

    conn = get_connection()

    row = conn.execute(
        """
        SELECT *
        FROM sensor_data
        WHERE device_id = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (device_id,)
    ).fetchone()

    conn.close()


    if not row:
        return jsonify({
            "success": False,
            "message": "No data"
        }), 404


    return jsonify({
        "success": True,
        "data": dict(row)
    })


# =========================================================
# GET SENSOR HISTORY
# =========================================================

@app.route("/api/device/<device_id>/history", methods=["GET"])
def get_history(device_id):

    limit = request.args.get(
        "limit",
        default=100,
        type=int
    )

    conn = get_connection()

    rows = conn.execute(
        """
        SELECT *
        FROM sensor_data
        WHERE device_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (
            device_id,
            limit
        )
    ).fetchall()

    conn.close()


    return jsonify({
        "success": True,
        "data": [
            dict(row)
            for row in rows
        ]
    })


# =========================================================
# GET DEVICES
# =========================================================

@app.route("/api/devices", methods=["GET"])
def get_devices():

    conn = get_connection()

    rows = conn.execute(
        """
        SELECT *
        FROM devices
        ORDER BY id DESC
        """
    ).fetchall()

    conn.close()


    return jsonify({
        "success": True,
        "devices": [
            dict(row)
            for row in rows
        ]
    })


# =========================================================
# RUN SERVER
# =========================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )