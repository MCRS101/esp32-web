import os
import secrets

from flask import (
    Flask,
    request,
    jsonify,
    render_template,
    send_file
)

from database import get_connection, init_database

from io import BytesIO
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer
)
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER

app = Flask(__name__)

# =========================================================
# INIT DATABASE
# =========================================================

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

    data = request.get_json()

    if not data:
        return jsonify({
            "success": False,
            "message": "No JSON data"
        }), 400

    device_id = data.get("device_id")
    device_token = data.get("device_token", "")

    if not device_id:
        return jsonify({
            "success": False,
            "message": "device_id required"
        }), 400

    conn = None
    cursor = None

    try:

        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO devices
            (
                device_id,
                device_token,
                status,
                last_seen
            )
            VALUES (%s, %s, 'online', CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
                device_token = VALUES(device_token),
                status = 'online',
                last_seen = CURRENT_TIMESTAMP
        """, (
            device_id,
            device_token
        ))

        conn.commit()

        return jsonify({
            "success": True,
            "message": "Device registered",
            "device_id": device_id
        })

    except Exception as e:

        if conn:
            conn.rollback()

        print("REGISTER ERROR:", e)

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()


# =========================================================
# RECEIVE SENSOR DATA
# =========================================================

@app.route("/api/device/data", methods=["POST"])
def receive_sensor_data():

    data = request.get_json()

    if not data:
        return jsonify({
            "success": False,
            "message": "No JSON data"
        }), 400

    device_id = data.get("device_id")

    if not device_id:
        return jsonify({
            "success": False,
            "message": "device_id required"
        }), 400

    try:

        accel_x = float(data.get("accel_x", 0))
        accel_y = float(data.get("accel_y", 0))
        accel_z = float(data.get("accel_z", 0))

        pga = float(data.get("pga", 0))
        peak_pga = float(data.get("peak_pga", 0))
        avg_pga = float(data.get("avg_pga", 0))

        pendulum = float(data.get("pendulum", 0))

        level = data.get("level", "LOW")
        direction = data.get("direction", "-")

        estimated_ml = float(
            data.get("estimated_ml", 0)
        )

    except (ValueError, TypeError):

        return jsonify({
            "success": False,
            "message": "Invalid sensor data"
        }), 400


    conn = None
    cursor = None

    try:

        conn = get_connection()
        cursor = conn.cursor()

        # -------------------------------------------------
        # INSERT SENSOR DATA
        # -------------------------------------------------

        cursor.execute("""
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
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s
            )
        """, (
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
        ))


        # -------------------------------------------------
        # UPDATE DEVICE STATUS
        # -------------------------------------------------

        cursor.execute("""
            UPDATE devices
            SET
                status = 'online',
                last_seen = CURRENT_TIMESTAMP
            WHERE device_id = %s
        """, (
            device_id,
        ))


        conn.commit()

        return jsonify({
            "success": True,
            "message": "Sensor data saved"
        })


    except Exception as e:

        if conn:
            conn.rollback()

        print("SENSOR DATA ERROR:", e)

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()


# =========================================================
# GET DEVICES
# =========================================================

@app.route("/api/devices", methods=["GET"])
def get_devices():

    conn = None
    cursor = None

    try:

        conn = get_connection()

        cursor = conn.cursor(
            dictionary=True
        )

        cursor.execute("""
            SELECT
                device_id,
                status,
                ip_address,
                last_seen
            FROM devices
            ORDER BY id DESC
        """)

        devices = cursor.fetchall()

        for device in devices:

            if device["last_seen"]:
                device["last_seen"] = \
                    device["last_seen"].isoformat()

        return jsonify({
            "success": True,
            "devices": devices
        })


    except Exception as e:

        print("GET DEVICES ERROR:", e)

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()


# =========================================================
# GET LATEST
# =========================================================

@app.route(
    "/api/device/<device_id>/latest",
    methods=["GET"]
)
def get_latest(device_id):

    conn = None
    cursor = None

    try:

        conn = get_connection()

        cursor = conn.cursor(
            dictionary=True
        )

        cursor.execute("""
            SELECT
                id,
                device_id,
                timestamp,
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
            FROM sensor_data
            WHERE device_id = %s
            ORDER BY id DESC
            LIMIT 1
        """, (
            device_id,
        ))

        data = cursor.fetchone()

        if not data:

            return jsonify({
                "success": False,
                "message": "No sensor data"
            }), 404


        if data["timestamp"]:
            data["timestamp"] = \
                data["timestamp"].isoformat()


        return jsonify({
            "success": True,
            "data": data
        })


    except Exception as e:

        print("LATEST ERROR:", e)

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()


# =========================================================
# GET HISTORY
# =========================================================

@app.route(
    "/api/device/<device_id>/history",
    methods=["GET"]
)
def get_history(device_id):

    conn = None
    cursor = None

    try:

        conn = get_connection()

        cursor = conn.cursor(
            dictionary=True
        )

        cursor.execute("""
            SELECT
                id,
                device_id,
                timestamp,
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
            FROM sensor_data
            WHERE device_id = %s
            ORDER BY timestamp DESC
        """, (
            device_id,
        ))

        rows = cursor.fetchall()


        for row in rows:

            if row["timestamp"]:
                row["timestamp"] = \
                    row["timestamp"].isoformat()


        return jsonify({
            "success": True,
            "count": len(rows),
            "data": rows
        })


    except Exception as e:

        print("HISTORY ERROR:", e)

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()


# =========================================================
# GET DATA BY DATE
# =========================================================

@app.route(
    "/api/device/<device_id>/history/date",
    methods=["GET"]
)
def get_history_by_date(device_id):

    date_value = request.args.get("date")

    if not date_value:

        return jsonify({
            "success": False,
            "message": "date required"
        }), 400


    conn = None
    cursor = None

    try:

        conn = get_connection()

        cursor = conn.cursor(
            dictionary=True
        )

        cursor.execute("""
            SELECT
                id,
                device_id,
                timestamp,
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
            FROM sensor_data
            WHERE device_id = %s
            AND DATE(timestamp) = %s
            ORDER BY timestamp DESC
        """, (
            device_id,
            date_value
        ))

        rows = cursor.fetchall()


        for row in rows:

            if row["timestamp"]:
                row["timestamp"] = \
                    row["timestamp"].isoformat()


        return jsonify({
            "success": True,
            "count": len(rows),
            "data": rows
        })


    except Exception as e:

        print("DATE HISTORY ERROR:", e)

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()


# =========================================================
# EXPORT EXCEL
# =========================================================

@app.route(
    "/api/device/<device_id>/export/excel",
    methods=["GET"]
)
def export_excel(device_id):

    date_value = request.args.get("date")

    conn = None
    cursor = None

    try:

        conn = get_connection()

        cursor = conn.cursor(
            dictionary=True
        )


        # -------------------------------------------------
        # ถ้ามีวันที่ → เอาเฉพาะวันนั้น
        # ถ้าไม่มีวันที่ → เอาทั้งหมด
        # -------------------------------------------------

        if date_value:

            cursor.execute("""
                SELECT
                    timestamp,
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
                FROM sensor_data
                WHERE device_id = %s
                AND DATE(timestamp) = %s
                ORDER BY timestamp ASC
            """, (
                device_id,
                date_value
            ))

        else:

            cursor.execute("""
                SELECT
                    timestamp,
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
                FROM sensor_data
                WHERE device_id = %s
                ORDER BY timestamp ASC
            """, (
                device_id,
            ))


        rows = cursor.fetchall()


        # -------------------------------------------------
        # CREATE EXCEL
        # -------------------------------------------------

        wb = Workbook()

        ws = wb.active
        ws.title = "Sensor Data"


        headers = [
            "Date / Time",
            "Accel X (G)",
            "Accel Y (G)",
            "Accel Z (G)",
            "PGA",
            "Peak PGA",
            "Average PGA",
            "Pendulum",
            "Level",
            "Direction",
            "Estimated ML"
        ]


        ws.append(headers)


        # Header style
        for cell in ws[1]:

            cell.font = Font(
                bold=True
            )

            cell.alignment = Alignment(
                horizontal="center"
            )


        # -------------------------------------------------
        # DATA
        # -------------------------------------------------

        for row in rows:

            timestamp = row["timestamp"]

            if timestamp:

                timestamp = timestamp.strftime(
                    "%d/%m/%Y %H:%M:%S"
                )


            ws.append([
                timestamp,
                row["accel_x"],
                row["accel_y"],
                row["accel_z"],
                row["pga"],
                row["peak_pga"],
                row["avg_pga"],
                row["pendulum"],
                row["level"],
                row["direction"],
                row["estimated_ml"]
            ])


        # -------------------------------------------------
        # COLUMN WIDTH
        # -------------------------------------------------

        widths = {
            "A": 22,
            "B": 15,
            "C": 15,
            "D": 15,
            "E": 15,
            "F": 15,
            "G": 15,
            "H": 15,
            "I": 15,
            "J": 15,
            "K": 18
        }


        for column, width in widths.items():

            ws.column_dimensions[
                column
            ].width = width


        # -------------------------------------------------
        # SAVE MEMORY
        # -------------------------------------------------

        output = BytesIO()

        wb.save(output)

        output.seek(0)


        filename = (
            f"{device_id}_sensor_data"
        )

        if date_value:

            filename += (
                f"_{date_value}"
            )

        filename += ".xlsx"


        return send_file(
            output,
            as_attachment=True,
            download_name=filename,
            mimetype=(
                "application/vnd.openxmlformats-"
                "officedocument.spreadsheetml.sheet"
            )
        )


    except Exception as e:

        print("EXCEL ERROR:", e)

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()


# =========================================================
# EXPORT PDF
# =========================================================

@app.route(
    "/api/device/<device_id>/export/pdf",
    methods=["GET"]
)
def export_pdf(device_id):

    date_value = request.args.get("date")

    conn = None
    cursor = None

    try:

        conn = get_connection()

        cursor = conn.cursor(
            dictionary=True
        )


        # -------------------------------------------------
        # GET DATA
        # -------------------------------------------------

        if date_value:

            cursor.execute("""
                SELECT
                    timestamp,
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
                FROM sensor_data
                WHERE device_id = %s
                AND DATE(timestamp) = %s
                ORDER BY timestamp ASC
            """, (
                device_id,
                date_value
            ))

        else:

            cursor.execute("""
                SELECT
                    timestamp,
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
                FROM sensor_data
                WHERE device_id = %s
                ORDER BY timestamp ASC
            """, (
                device_id,
            ))


        rows = cursor.fetchall()


        # -------------------------------------------------
        # CREATE PDF
        # -------------------------------------------------

        output = BytesIO()


        doc = SimpleDocTemplate(
            output,
            pagesize=landscape(A4),
            rightMargin=20,
            leftMargin=20,
            topMargin=20,
            bottomMargin=20
        )


        styles = getSampleStyleSheet()

        title_style = styles["Title"]

        title_style.alignment = TA_CENTER


        elements = []


        title = "ESP32 Sensor Monitoring Report"

        if date_value:

            title += f" - {date_value}"


        elements.append(
            Paragraph(
                title,
                title_style
            )
        )

        elements.append(
            Spacer(1, 15)
        )


        # -------------------------------------------------
        # TABLE HEADER
        # -------------------------------------------------

        table_data = [

            [
                "Date / Time",
                "X (G)",
                "Y (G)",
                "Z (G)",
                "PGA",
                "Peak PGA",
                "Avg PGA",
                "Pendulum",
                "Level",
                "Direction",
                "ML"
            ]

        ]


        # -------------------------------------------------
        # TABLE DATA
        # -------------------------------------------------

        for row in rows:

            timestamp = row["timestamp"]

            if timestamp:

                timestamp = timestamp.strftime(
                    "%d/%m/%Y %H:%M:%S"
                )

            else:

                timestamp = "-"


            table_data.append([

                timestamp,

                f"{float(row['accel_x']):.4f}",

                f"{float(row['accel_y']):.4f}",

                f"{float(row['accel_z']):.4f}",

                f"{float(row['pga']):.4f}",

                f"{float(row['peak_pga']):.4f}",

                f"{float(row['avg_pga']):.4f}",

                f"{float(row['pendulum']):.2f}",

                str(row["level"]),

                str(row["direction"]),

                f"{float(row['estimated_ml']):.2f}"

            ])


        table = Table(
            table_data,
            repeatRows=1
        )


        table.setStyle(
            TableStyle([

                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, 0),
                    colors.HexColor("#16304f")
                ),

                (
                    "TEXTCOLOR",
                    (0, 0),
                    (-1, 0),
                    colors.white
                ),

                (
                    "FONTNAME",
                    (0, 0),
                    (-1, 0),
                    "Helvetica-Bold"
                ),

                (
                    "ALIGN",
                    (0, 0),
                    (-1, -1),
                    "CENTER"
                ),

                (
                    "VALIGN",
                    (0, 0),
                    (-1, -1),
                    "MIDDLE"
                ),

                (
                    "GRID",
                    (0, 0),
                    (-1, -1),
                    0.5,
                    colors.grey
                ),

                (
                    "FONTSIZE",
                    (0, 0),
                    (-1, -1),
                    7
                ),

                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [
                        colors.white,
                        colors.HexColor("#f2f2f2")
                    ]
                )

            ])
        )


        elements.append(table)


        # -------------------------------------------------
        # BUILD
        # -------------------------------------------------

        doc.build(elements)

        output.seek(0)


        filename = (
            f"{device_id}_sensor_data"
        )

        if date_value:

            filename += (
                f"_{date_value}"
            )

        filename += ".pdf"


        return send_file(
            output,
            as_attachment=True,
            download_name=filename,
            mimetype="application/pdf"
        )


    except Exception as e:

        print("PDF ERROR:", e)

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()


# =========================================================
# RUN
# =========================================================


if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )