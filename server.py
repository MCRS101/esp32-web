from flask import Flask, render_template, request, jsonify
from database import get_connection, init_database
import secrets
import json
import os
app = Flask(__name__)

init_database()


@app.route("/")
def index():
    return render_template("index.html")


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

    device = conn.execute(
        "SELECT * FROM devices WHERE device_id = ?",
        (device_id,)
    ).fetchone()

    if device:

        conn.execute("""
            UPDATE devices
            SET status = 'online',
                ip_address = ?,
                last_seen = CURRENT_TIMESTAMP
            WHERE device_id = ?
        """, (
            request.remote_addr,
            device_id
        ))

        token = device["device_token"]

    else:

        token = secrets.token_hex(32)

        conn.execute("""
            INSERT INTO devices
            (device_id, device_token, status, ip_address)
            VALUES (?, ?, 'online', ?)
        """, (
            device_id,
            token,
            request.remote_addr
        ))

    conn.commit()
    conn.close()

    print(f"Device connected: {device_id}")

    return jsonify({
        "success": True,
        "device_id": device_id
    })


@app.route("/api/device/<device_id>/command", methods=["GET"])
def get_command(device_id):

    conn = get_connection()

    device = conn.execute(
        "SELECT * FROM devices WHERE device_id = ?",
        (device_id,)
    ).fetchone()

    if not device:
        conn.close()

        return jsonify({
            "success": False,
            "message": "Device not found"
        }), 404

    command = conn.execute("""
        SELECT *
        FROM commands
        WHERE device_id = ?
        AND status = 'pending'
        ORDER BY id ASC
        LIMIT 1
    """, (
        device_id,
    )).fetchone()

    if not command:

        conn.close()

        return jsonify({
            "success": True,
            "command": None
        })

    conn.execute("""
        UPDATE commands
        SET status = 'sent'
        WHERE id = ?
    """, (
        command["id"],
    ))

    conn.commit()
    conn.close()

    payload = {}

    if command["payload"]:
        payload = json.loads(command["payload"])

    print(
        f"Sending command: "
        f"{device_id} -> {command['command']}"
    )

    return jsonify({
        "success": True,
        "command": command["command"],
        "payload": payload,
        "command_id": command["id"]
    })
 


@app.route("/api/device/<device_id>/gpio", methods=["POST"])
def gpio_control(device_id):

    data = request.get_json(silent=True)

    if not data:
        return jsonify({
            "success": False,
            "message": "Invalid JSON"
        }), 400

    state = data.get("state")

    if state not in ["on", "off"]:

        return jsonify({
            "success": False,
            "message": "State must be on or off"
        }), 400

    conn = get_connection()

    device = conn.execute(
        "SELECT * FROM devices WHERE device_id = ?",
        (device_id,)
    ).fetchone()

    if not device:

        conn.close()

        return jsonify({
            "success": False,
            "message": "Device not found"
        }), 404

    command = (
        "gpio_on"
        if state == "on"
        else "gpio_off"
    )

    conn.execute("""
        INSERT INTO commands
        (device_id, command, payload, status)
        VALUES (?, ?, ?, 'pending')
    """, (
        device_id,
        command,
        json.dumps({
            "gpio": 2,
            "state": state
        })
    ))

    conn.commit()
    conn.close()

    print(
        f"New command: "
        f"{device_id} -> {command}"
    )

    return jsonify({
        "success": True,
        "command": command,
        "gpio": 2,
        "state": state
    })


@app.route("/api/devices")
def devices():

    conn = get_connection()

    rows = conn.execute("""
        SELECT
            device_id,
            status,
            ip_address,
            last_seen
        FROM devices
        ORDER BY id DESC
    """).fetchall()

    conn.close()

    result = []

    for row in rows:

        result.append({
            "device_id": row["device_id"],
            "status": row["status"],
            "ip_address": row["ip_address"],
            "last_seen": row["last_seen"]
        })

    return jsonify(result)


if __name__ == "__main__":

    port = int(os.environ.get("PORT", 5000))

    print()
    print("======================================")
    print("       ESP32 CLOUD SERVER")
    print("======================================")
    print(f"Port: {port}")
    print("======================================")
    print()

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )