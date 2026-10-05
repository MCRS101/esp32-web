import os
import secrets

from flask import Flask, request, jsonify, render_template

from database import get_connection, init_database


# =========================================================
# FLASK
# =========================================================

app = Flask(__name__)


# =========================================================
# INITIALIZE DATABASE
# =========================================================

try:

    init_database()

except Exception as e:

    print("====================================")
    print("MYSQL DATABASE ERROR")
    print(e)
    print("====================================")


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
    cursor = conn.cursor(dictionary=True)


    try:

        # -----------------------------------------
        # ตรวจสอบ Device
        # -----------------------------------------

        cursor.execute(
            """
            SELECT *
            FROM devices
            WHERE device_id = %s
            """,
            (device_id,)
        )

        device = cursor.fetchone()


        # -----------------------------------------
        # Device มีอยู่แล้ว
        # -----------------------------------------

        if device:

            cursor.execute(
                """
                UPDATE devices

                SET status = 'online',

                    ip_address = %s,

                    last_seen = CURRENT_TIMESTAMP

                WHERE device_id = %s
                """,
                (
                    request.remote_addr,
                    device_id
                )
            )

            conn.commit()


            return jsonify({
                "success": True,
                "message": "Device already registered",
                "device_id": device_id
            })


        # -----------------------------------------
        # Device ใหม่
        # -----------------------------------------

        device_token = secrets.token_hex(32)


        cursor.execute(
            """
            INSERT INTO devices
            (
                device_id,
                device_token,
                status,
                ip_address,
                last_seen
            )

            VALUES
            (
                %s,
                %s,
                'online',
                %s,
                CURRENT_TIMESTAMP
            )
            """,
            (
                device_id,
                device_token,
                request.remote_addr
            )
        )


        conn.commit()


        return jsonify({

            "success": True,

            "message": "Device registered",

            "device_id": device_id,

            "device_token": device_token

        })


    except Exception as e:

        conn.rollback()

        print("REGISTER ERROR:", e)


        return jsonify({

            "success": False,

            "message": "Database error"

        }), 500


    finally:

        cursor.close()
        conn.close()


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


    # =====================================================
    # SENSOR VALUES
    # =====================================================

    try:

        accel_x = float(
            data.get("accel_x", 0)
        )

        accel_y = float(
            data.get("accel_y", 0)
        )

        accel_z = float(
            data.get("accel_z", 0)
        )


        pga = float(
            data.get("pga", 0)
        )

        peak_pga = float(
            data.get("peak_pga", 0)
        )

        avg_pga = float(
            data.get("avg_pga", 0)
        )


        pendulum = float(
            data.get("pendulum", 0)
        )


        level = data.get(
            "level",
            "LOW"
        )


        direction = data.get(
            "direction",
            "-"
        )


        estimated_ml = float(
            data.get(
                "estimated_ml",
                0
            )
        )


    except (ValueError, TypeError):

        return jsonify({

            "success": False,

            "message": "Invalid sensor data"

        }), 400


    # =====================================================
    # MYSQL
    # =====================================================

    conn = get_connection()
    cursor = conn.cursor()


    try:

        # -----------------------------------------
        # INSERT SENSOR DATA
        # -----------------------------------------

        cursor.execute(
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

            VALUES
            (
                %s,

                %s,
                %s,
                %s,

                %s,
                %s,
                %s,

                %s,

                %s,

                %s,

                %s
            )
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


        # -----------------------------------------
        # UPDATE DEVICE
        # -----------------------------------------

        cursor.execute(
            """
            UPDATE devices

            SET status = 'online',

                ip_address = %s,

                last_seen = CURRENT_TIMESTAMP

            WHERE device_id = %s
            """,
            (
                request.remote_addr,
                device_id
            )
        )


        conn.commit()


        # -----------------------------------------
        # RESPONSE
        # -----------------------------------------

        return jsonify({

            "success": True,

            "message": "Sensor data received",

            "alert": level in [
                "HIGH",
                "SEVERE"
            ]

        })


    except Exception as e:

        conn.rollback()

        print("SENSOR DATABASE ERROR:", e)


        return jsonify({

            "success": False,

            "message": "Database error"

        }), 500


    finally:

        cursor.close()
        conn.close()


# =========================================================
# GET LATEST SENSOR DATA
# =========================================================

@app.route(
    "/api/device/<device_id>/latest",
    methods=["GET"]
)
def get_latest(device_id):

    conn = get_connection()

    cursor = conn.cursor(
        dictionary=True
    )


    try:

        cursor.execute(
            """
            SELECT *

            FROM sensor_data

            WHERE device_id = %s

            ORDER BY id DESC

            LIMIT 1
            """,
            (device_id,)
        )


        row = cursor.fetchone()


        if not row:

            return jsonify({

                "success": False,

                "message": "No data"

            }), 404


        return jsonify({

            "success": True,

            "data": row

        })


    finally:

        cursor.close()
        conn.close()


# =========================================================
# GET SENSOR HISTORY
# =========================================================

@app.route(
    "/api/device/<device_id>/history",
    methods=["GET"]
)
def get_history(device_id):

    limit = request.args.get(
        "limit",
        default=100,
        type=int
    )


    # ป้องกันค่าผิดปกติ

    if limit < 1:

        limit = 100


    if limit > 10000:

        limit = 10000


    conn = get_connection()

    cursor = conn.cursor(
        dictionary=True
    )


    try:

        cursor.execute(
            """
            SELECT *

            FROM sensor_data

            WHERE device_id = %s

            ORDER BY id DESC

            LIMIT %s
            """,
            (
                device_id,
                limit
            )
        )


        rows = cursor.fetchall()


        return jsonify({

            "success": True,

            "data": rows

        })


    finally:

        cursor.close()
        conn.close()


# =========================================================
# GET DEVICES
# =========================================================

@app.route(
    "/api/devices",
    methods=["GET"]
)
def get_devices():

    conn = get_connection()

    cursor = conn.cursor(
        dictionary=True
    )


    try:

        cursor.execute(
            """
            SELECT *

            FROM devices

            ORDER BY id DESC
            """
        )


        rows = cursor.fetchall()


        return jsonify({

            "success": True,

            "devices": rows

        })


    finally:

        cursor.close()
        conn.close()


# =========================================================
# RUN SERVER
# =========================================================

if __name__ == "__main__":

    port = int(
        os.environ.get(
            "PORT",
            5000
        )
    )


    app.run(

        host="0.0.0.0",

        port=port,

        debug=False

    )