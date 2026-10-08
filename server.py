import os
import secrets

from io import BytesIO

from flask import (
    Flask,
    request,
    jsonify,
    render_template,
    send_file
)

from database import get_connection, init_database

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment

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

    conn = get_connection()

    cursor = conn.cursor(
        dictionary=True
    )

    try:

        cursor.execute(
            """
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
            """,
            (
                device_id,
            )
        )

        rows = cursor.fetchall()


        # -----------------------------------------
        # แปลงวันที่ให้ JavaScript อ่านง่าย
        # -----------------------------------------

        for row in rows:

            if row.get("timestamp"):

                row["timestamp"] = (
                    row["timestamp"].isoformat()
                )


        return jsonify({

            "success": True,

            "count": len(rows),

            "data": rows

        })


    except Exception as e:

        print("HISTORY ERROR:", e)

        return jsonify({

            "success": False,

            "message": "Database error"

        }), 500


    finally:

        cursor.close()
        conn.close()

@app.route("/api/device/<device_id>/graph", methods=["GET"])
def get_graph_data(device_id):
    """
    ดึงข้อมูลสำหรับกราฟรอบเวลาที่ผู้ใช้เลือก
    เช่น ก่อนหน้า 30 รายการ + หลัง 30 รายการ
    """

    selected_id = request.args.get("id", type=int)

    if not selected_id:
        return jsonify({
            "success": False,
            "message": "id is required"
        }), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # -------------------------------------------------
        # ตรวจสอบข้อมูลที่เลือก
        # -------------------------------------------------
        cursor.execute("""
            SELECT *
            FROM sensor_data
            WHERE id = %s
              AND device_id = %s
            LIMIT 1
        """, (selected_id, device_id))

        selected = cursor.fetchone()

        if not selected:
            return jsonify({
                "success": False,
                "message": "Data not found"
            }), 404

        # -------------------------------------------------
        # ดึงข้อมูลก่อนหน้าประมาณ 30 รายการ
        # -------------------------------------------------
        cursor.execute("""
            SELECT *
            FROM sensor_data
            WHERE device_id = %s
              AND id <= %s
            ORDER BY id DESC
            LIMIT 30
        """, (device_id, selected_id))

        before_rows = cursor.fetchall()

        # -------------------------------------------------
        # ดึงข้อมูลหลังจากข้อมูลที่เลือกประมาณ 30 รายการ
        # -------------------------------------------------
        cursor.execute("""
            SELECT *
            FROM sensor_data
            WHERE device_id = %s
              AND id > %s
            ORDER BY id ASC
            LIMIT 30
        """, (device_id, selected_id))

        after_rows = cursor.fetchall()

        # -------------------------------------------------
        # รวมข้อมูล
        # -------------------------------------------------
        rows = list(reversed(before_rows)) + after_rows

        # -------------------------------------------------
        # แปลง timestamp ให้ JavaScript ใช้ง่าย
        # -------------------------------------------------
        for row in rows:
            if row.get("timestamp"):
                row["timestamp"] = row["timestamp"].isoformat()

        if selected.get("timestamp"):
            selected["timestamp"] = selected["timestamp"].isoformat()

        return jsonify({
            "success": True,
            "selected": selected,
            "data": rows
        })

    except Exception as e:
        print("GRAPH DATABASE ERROR:", e)

        return jsonify({
            "success": False,
            "message": "Database error"
        }), 500

    finally:
        cursor.close()
        conn.close()
# =========================================================
# EXPORT EXCEL
# =========================================================

@app.route(
    "/api/device/<device_id>/export/excel",
    methods=["GET"]
)
def export_excel(device_id):

    # -----------------------------------------
    # รับวันที่
    # เช่น 2026-10-05
    # -----------------------------------------

    date_value = request.args.get("date")


    conn = get_connection()

    cursor = conn.cursor(
        dictionary=True
    )


    try:

        # -----------------------------------------
        # ถ้ามีวันที่
        # -----------------------------------------

        if date_value:

            cursor.execute(
                """
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
                """,
                (
                    device_id,
                    date_value
                )
            )


        # -----------------------------------------
        # ถ้าไม่มีวันที่
        # = เอาทั้งหมด
        # -----------------------------------------

        else:

            cursor.execute(
                """
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
                """,
                (
                    device_id,
                )
            )


        rows = cursor.fetchall()


        # =================================================
        # CREATE EXCEL
        # =================================================

        workbook = Workbook()

        sheet = workbook.active

        sheet.title = "Sensor Data"


        # -----------------------------------------
        # HEADER
        # -----------------------------------------

        headers = [

            "วันที่ / เวลา",

            "แกน X (G)",

            "แกน Y (G)",

            "แกน Z (G)",

            "PGA",

            "Peak PGA",

            "Average PGA",

            "Pendulum",

            "สถานะ",

            "ทิศทาง",

            "Estimated ML"

        ]


        sheet.append(headers)


        # -----------------------------------------
        # HEADER STYLE
        # -----------------------------------------

        for cell in sheet[1]:

            cell.font = Font(
                bold=True
            )

            cell.alignment = Alignment(
                horizontal="center"
            )


        # -----------------------------------------
        # DATA
        # -----------------------------------------

        for row in rows:

            timestamp = row["timestamp"]


            if timestamp:

                timestamp = timestamp.strftime(
                    "%d/%m/%Y %H:%M:%S"
                )


            sheet.append([

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


        # -----------------------------------------
        # COLUMN WIDTH
        # -----------------------------------------

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

            sheet.column_dimensions[
                column
            ].width = width


        # -----------------------------------------
        # CREATE FILE IN MEMORY
        # -----------------------------------------

        output = BytesIO()

        workbook.save(output)

        output.seek(0)


        # -----------------------------------------
        # FILE NAME
        # -----------------------------------------

        filename = (
            f"{device_id}_sensor_data"
        )


        if date_value:

            filename += (
                f"_{date_value}"
            )


        filename += ".xlsx"


        # -----------------------------------------
        # DOWNLOAD
        # -----------------------------------------

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

            "message": "Excel export error"

        }), 500


    finally:

        cursor.close()
        conn.close()

# =========================================================
# EXPORT PDF
# =========================================================

@app.route(
    "/api/device/<device_id>/export/pdf",
    methods=["GET"]
)
def export_pdf(device_id):

    # -----------------------------------------
    # รับวันที่
    # -----------------------------------------

    date_value = request.args.get("date")


    conn = get_connection()

    cursor = conn.cursor(
        dictionary=True
    )


    try:

        # -----------------------------------------
        # ถ้ามีวันที่
        # -----------------------------------------

        if date_value:

            cursor.execute(
                """
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
                """,
                (
                    device_id,
                    date_value
                )
            )


        # -----------------------------------------
        # ไม่มีวันที่
        # = เอาทั้งหมด
        # -----------------------------------------

        else:

            cursor.execute(
                """
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
                """,
                (
                    device_id,
                )
            )


        rows = cursor.fetchall()


        # =================================================
        # CREATE PDF
        # =================================================

        output = BytesIO()


        document = SimpleDocTemplate(

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


        # -----------------------------------------
        # TITLE
        # -----------------------------------------

        title = (
            "ESP32 Sensor Monitoring Report"
        )


        if date_value:

            title += (
                f" - {date_value}"
            )


        elements.append(

            Paragraph(
                title,
                title_style
            )

        )


        elements.append(
            Spacer(1, 15)
        )


        # =================================================
        # TABLE
        # =================================================

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


        # -----------------------------------------
        # DATA
        # -----------------------------------------

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


        # -----------------------------------------
        # TABLE
        # -----------------------------------------

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

                    colors.HexColor(
                        "#16304f"
                    )

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

                        colors.HexColor(
                            "#f2f2f2"
                        )

                    ]

                )

            ])

        )


        elements.append(table)


        # -----------------------------------------
        # BUILD PDF
        # -----------------------------------------

        document.build(elements)


        output.seek(0)


        # -----------------------------------------
        # FILE NAME
        # -----------------------------------------

        filename = (
            f"{device_id}_sensor_data"
        )


        if date_value:

            filename += (
                f"_{date_value}"
            )


        filename += ".pdf"


        # -----------------------------------------
        # DOWNLOAD
        # -----------------------------------------

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

            "message": "PDF export error"

        }), 500


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