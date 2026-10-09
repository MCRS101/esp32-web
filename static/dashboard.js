/* =====================================================
   GLOBAL
===================================================== */

let DEVICE_ID = null;

let vibrationChart = null;

let currentPGA = 0;
let targetPGA = 0;

let currentPendulum = 0;
let targetPendulum = 0;

let lastChartPointTime = 0;

let isFetching = false;

let lastTableTimestamp = null;
let pendulumAnimationTime = 0;
const MAX_CHART_POINTS = 60;


/* =====================================================
   INIT CHART
===================================================== */

function initChart() {

    const canvas = document.getElementById("vibrationChart");

    if (!canvas) {
        console.error("Canvas vibrationChart not found");
        return;
    }

    const ctx = canvas.getContext("2d");

    vibrationChart = new Chart(ctx, {

        type: "line",

        data: {

            labels: [],

            datasets: [

                {
                    label: "PGA",

                    data: [],

                    borderColor: "#10b981",

                    backgroundColor: "transparent",

                    borderWidth: 2,

                    tension: 0.35,

                    pointRadius: 0,

                    pointHoverRadius: 4,

                    fill: false
                },

                {
                    label: "Pendulum",

                    data: [],

                    borderColor: "#f97316",

                    backgroundColor: "transparent",

                    borderWidth: 2,

                    tension: 0.35,

                    pointRadius: 0,

                    pointHoverRadius: 4,

                    fill: false
                }

            ]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            animation: false,

            interaction: {
                intersect: false,
                mode: "index"
            },

            scales: {

                x: {
                    display: true,

                    ticks: {
                        maxTicksLimit: 8
                    }
                },

                y: {

                    min: 0,

                    max: 2.0,

                    beginAtZero: true,

                    ticks: {
                        stepSize: 0.2,
                        precision: 2
                    },

                    title: {
                        display: true,
                        text: "Value"
                    }

                }

            },

            plugins: {

                legend: {
                    display: true,
                    position: "top"
                },

                tooltip: {

                    callbacks: {

                        label: function(context) {

                            const value =
                                Number(context.raw || 0);

                            return (
                                context.dataset.label +
                                ": " +
                                value.toFixed(4)
                            );

                        }

                    }

                }

            }

        }

    });

    console.log("Chart initialized");

}


// =====================================================
// ESP32 DEVICE SELECTOR
// =====================================================

async function loadDevice() {
    const select = document.getElementById("deviceSelect");
    const nameElement = document.getElementById("deviceName");
    const statusElement = document.getElementById("deviceStatus");

    if (!select) {
        console.error("ไม่พบ deviceSelect ใน index.html");
        return;
    }

    select.disabled = true;
    select.innerHTML = '<option value="">กำลังโหลดอุปกรณ์...</option>';

    try {
        const response = await fetch("/api/devices", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        // รองรับ API ที่คืน array โดยตรง
        // หรือคืน object เช่น { success: true, devices: [...] }
        const devices = Array.isArray(result)
            ? result
            : (result.devices || []);

        select.innerHTML = "";

        if (devices.length === 0) {
            DEVICE_ID = null;

            select.innerHTML =
                '<option value="">ไม่มี ESP32 ที่ลงทะเบียน</option>';

            nameElement.textContent = "ไม่พบอุปกรณ์";
            statusElement.textContent = "● ไม่มีอุปกรณ์";
            statusElement.className = "device-offline";

            return;
        }

        devices.forEach(function (device) {
            const id = device.device_id;

            if (!id) return;

            const option = document.createElement("option");
            option.value = id;
            option.textContent = device.device_name
                ? `${device.device_name} (${id})`
                : id;

            select.appendChild(option);
        });

        if (select.options.length === 0) {
            DEVICE_ID = null;
            select.innerHTML =
                '<option value="">ข้อมูลอุปกรณ์ไม่ถูกต้อง</option>';
            nameElement.textContent = "ไม่พบอุปกรณ์";
            statusElement.textContent = "● ไม่มีอุปกรณ์";
            statusElement.className = "device-offline";
            return;
        }

        // คงอุปกรณ์เดิมที่เลือกไว้ หากยังอยู่ในรายการ
        const previousId = DEVICE_ID;
        const previousStillExists = devices.some(
            device => device.device_id === previousId
        );

        select.value = previousStillExists
            ? previousId
            : select.options[0].value;

        await selectDevice(select.value);

    } catch (error) {
        console.error("LOAD DEVICES ERROR:", error);

        select.innerHTML =
            '<option value="">โหลดอุปกรณ์ไม่สำเร็จ</option>';

        nameElement.textContent = "เชื่อมต่อรายการอุปกรณ์ไม่ได้";
        statusElement.textContent = "● API Error";
        statusElement.className = "device-offline";

    } finally {
        select.disabled = false;
    }
}


// เรียกเมื่อเลือก ESP32
async function selectDevice(deviceId) {
    if (!deviceId) return;

    DEVICE_ID = deviceId;

    const nameElement = document.getElementById("deviceName");
    const statusElement = document.getElementById("deviceStatus");

    nameElement.textContent = deviceId;
    statusElement.textContent = "● กำลังโหลดข้อมูล...";
    statusElement.className = "device-offline";

    // ล้างข้อมูลตารางล่าสุดของอุปกรณ์ก่อนหน้า
    const table = document.getElementById("dataTable");
    if (table) table.innerHTML = "";

    // รีเซ็ตข้อมูลกราฟ Real-time
    if (vibrationChart) {
        vibrationChart.data.labels = [];
        vibrationChart.data.datasets.forEach(dataset => {
            dataset.data = [];
        });
        vibrationChart.update("none");
    }

    currentPGA = 0;
    targetPGA = 0;
    currentPendulum = 0;
    targetPendulum = 0;
    lastTableTimestamp = null;

    // ดึงข้อมูลล่าสุดของอุปกรณ์ที่เลือก
    await getLatest();
}


// ผูก event เพียงครั้งเดียว
document.getElementById("deviceSelect")?.addEventListener(
    "change",
    function () {
        selectDevice(this.value);
    }
);




/* =====================================================
   GET LATEST
===================================================== */

async function getLatest() {

    if (!DEVICE_ID) {

        return;

    }

    if (isFetching) {

        return;

    }

    isFetching = true;

    try {

        const url =
            `/api/device/${encodeURIComponent(DEVICE_ID)}/latest`;

        console.log(
            "GET:",
            url
        );

        const response = await fetch(
            url,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }

        const result =
            await response.json();

        console.log(
            "Latest API:",
            result
        );

        if (!result.success) {

            throw new Error(
                "API success=false"
            );

        }

        const data = result.data;

        if (!data) {

            throw new Error(
                "No sensor data"
            );

        }

        console.log(
            "Sensor DATA:",
            data
        );


        /*
         * UPDATE DASHBOARD
         */

        updateDashboard(data);


        /*
         * TABLE
         */

        const timestamp =
            data.timestamp ||
            data.created_at ||
            data.time ||
            null;

        if (
            timestamp &&
            timestamp !== lastTableTimestamp
        ) {

            addTableRow(data);

            lastTableTimestamp =
                timestamp;

        }


        /*
         * DEVICE ONLINE
         */

        setOnline();

    }

    catch (error) {

        console.error(
            "LATEST ERROR:",
            error
        );

        setOffline();

    }

    finally {

        isFetching = false;

    }

}


/* =====================================================
   UPDATE DASHBOARD
===================================================== */

function updateDashboard(data) {

    console.log(
        "Updating dashboard:",
        data
    );


    /* =================================================
       PGA
    ================================================= */

    const pga =
        Number(data.pga ?? 0);

    const pgaElement =
        document.getElementById("pga");

    if (pgaElement) {

        pgaElement.textContent =
            pga.toFixed(4);

    }


    /* =================================================
       PENDULUM
    ================================================= */

    const pendulum =
        Number(data.pendulum ?? 0);

    const pendulumElement =
        document.getElementById("pendulum");

    if (pendulumElement) {

        pendulumElement.textContent =
            pendulum.toFixed(4);

    }


    /* =================================================
       PEAK PGA
    ================================================= */

    const peakPga =
        Number(data.peak_pga ?? 0);

    const peakElement =
        document.getElementById("peakPga");

    if (peakElement) {

        peakElement.textContent =
            peakPga.toFixed(4);

    }


    /* =================================================
       ML
    ================================================= */

    const ml =
        Number(data.estimated_ml ?? 0);

    const mlElement =
        document.getElementById("ml");

    if (mlElement) {

        mlElement.textContent =
            ml.toFixed(2);

    }


    /* =================================================
       ACCELERATION X
    ================================================= */

    const accelX =
        Number(data.accel_x ?? 0);

    const accelXElement =
        document.getElementById("accelX");

    if (accelXElement) {

        accelXElement.textContent =
            accelX.toFixed(4);

    }


    /* =================================================
       ACCELERATION Y
    ================================================= */

    const accelY =
        Number(data.accel_y ?? 0);

    const accelYElement =
        document.getElementById("accelY");

    if (accelYElement) {

        accelYElement.textContent =
            accelY.toFixed(4);

    }


    /* =================================================
       ACCELERATION Z
    ================================================= */

    const accelZ =
        Number(data.accel_z ?? 0);

    const accelZElement =
        document.getElementById("accelZ");

    if (accelZElement) {

        accelZElement.textContent =
            accelZ.toFixed(4);

    }


    /* =================================================
       LEVEL
    ================================================= */

    const level =
        data.level || "LOW";

    const levelElement =
        document.getElementById("level");

    if (levelElement) {

        levelElement.textContent =
            level;

        levelElement.className =
            "level " + level;

    }


    /* =================================================
       DIRECTION
       แก้จาก id="direction"
       เป็น id="realtimeDirection"
    ================================================= */

    const direction =
        data.direction || "CENTER";

    const directionElement =
        document.getElementById(
            "realtimeDirection"
        );

    if (directionElement) {

        directionElement.textContent =
            direction;

    }


    /*
     * หมุนเข็มทิศ
     */

    updateCompass(direction);


    /* =================================================
       PENDULUM DISPLAY
    ================================================= */

    updatePendulum(
        data.pendulum
    );


    /* =================================================
       SENSOR BARS
    ================================================= */

    updateSensorBars(
        accelX,
        accelY,
        accelZ
    );


    /* =================================================
       GRAPH TARGET
       สำคัญมาก
    ================================================= */

    targetPGA =
        pga;

    targetPendulum =
        pendulum;


    console.log(
        "Graph target:",
        {
            PGA: targetPGA,
            Pendulum: targetPendulum
        }
    );

}


/* =====================================================
   COMPASS
===================================================== */

function updateCompass(direction) {

    const needle =
        document.getElementById(
            "directionNeedle"
        );

    if (!needle) {

        return;

    }


    const angles = {

        "N": 0,

        "NE": 45,

        "E": 90,

        "SE": 135,

        "S": 180,

        "SW": 225,

        "W": 270,

        "NW": 315,

        "CENTER": 0

    };


    const angle =
        angles[direction] ?? 0;


    needle.style.transform =
        `translate(-50%, -100%) rotate(${angle}deg)`;

}


/* =====================================================
   PENDULUM
===================================================== */

function updatePendulum(pendulum) {

    const vector =
        document.getElementById("realtimeVector");

    let value =
        Number(pendulum) || 0;

    /*
     * จำกัดค่า 0 - 2.0
     */
    value =
        Math.max(
            0,
            Math.min(value, 2.0)
        );

    /*
     * แสดงค่า Pendulum
     */
    if (vector) {

        vector.textContent =
            value.toFixed(2);

    }

    /*
     * เก็บค่าความแรงของการแกว่ง
     */
    targetPendulum =
        value;
}

/* =====================================================
   SENSOR BARS
===================================================== */

function updateSensorBars(
    x,
    y,
    z
) {

    const maxValue = 1.0;


    const barX =
        document.getElementById("barX");

    const barY =
        document.getElementById("barY");

    const barZ =
        document.getElementById("barZ");


    const valueX =
        document.getElementById("barValueX");

    const valueY =
        document.getElementById("barValueY");

    const valueZ =
        document.getElementById("barValueZ");


    const percentX =
        Math.min(
            Math.abs(x) / maxValue * 100,
            100
        );

    const percentY =
        Math.min(
            Math.abs(y) / maxValue * 100,
            100
        );

    const percentZ =
        Math.min(
            Math.abs(z) / maxValue * 100,
            100
        );


    if (barX) {

        barX.style.height =
            percentX + "%";

    }

    if (barY) {

        barY.style.height =
            percentY + "%";

    }

    if (barZ) {

        barZ.style.height =
            percentZ + "%";

    }


    if (valueX) {

        valueX.textContent =
            x.toFixed(2);

    }

    if (valueY) {

        valueY.textContent =
            y.toFixed(2);

    }

    if (valueZ) {

        valueZ.textContent =
            z.toFixed(2);

    }

}


/* =====================================================
   SMOOTH GRAPH
===================================================== */

function smoothGraph(timestamp) {

    /*
     * PGA
     */

    const pgaDifference =
        targetPGA -
        currentPGA;


    currentPGA +=
        pgaDifference * 0.15;


    if (
        Math.abs(pgaDifference) < 0.00001
    ) {

        currentPGA =
            targetPGA;

    }


    /*
     * Pendulum
     */

    const pendulumDifference =
        targetPendulum -
        currentPendulum;


    currentPendulum +=
        pendulumDifference * 0.15;
/* =================================================
   PENDULUM SWING
================================================= */

pendulumAnimationTime += 0.08;

/*
 * 0.0 = ไม่แกว่ง
 * 2.0 = แกว่งแรงสุด
 */
const swingStrength =
    Math.min(
        currentPendulum / 2.0,
        1.0
    );

/*
 * มุมสูงสุด 35 องศา
 */
const maxAngle = 35;

const swingAngle =
    Math.sin(
        pendulumAnimationTime
    ) *
    maxAngle *
    swingStrength;


/*
 * หมุนลูกตุ้มซ้าย - ขวา
 */
const rod =
    document.getElementById(
        "pendulumRod"
    );

if (rod) {

    rod.style.transform =
        `rotate(${swingAngle}deg)`;

}

    if (
        Math.abs(pendulumDifference) < 0.00001
    ) {

        currentPendulum =
            targetPendulum;

    }


    /*
     * Add graph point every 100ms
     */

    if (
        timestamp -
        lastChartPointTime >= 100
    ) {

        lastChartPointTime =
            timestamp;


        if (vibrationChart) {

            const now =
                new Date();


            const time =
                now.toLocaleTimeString(
                    [],
                    {
                        minute: "2-digit",
                        second: "2-digit"
                    }
                );


            vibrationChart.data.labels.push(
                time
            );


            vibrationChart.data.datasets[0]
                .data
                .push(
                    currentPGA
                );


            vibrationChart.data.datasets[1]
                .data
                .push(
                    currentPendulum
                );


            /*
             * จำกัด 60 จุด
             */

            if (
                vibrationChart.data.labels.length >
                MAX_CHART_POINTS
            ) {

                vibrationChart.data.labels.shift();

                vibrationChart.data.datasets[0]
                    .data
                    .shift();

                vibrationChart.data.datasets[1]
                    .data
                    .shift();

            }


            vibrationChart.update(
                "none"
            );

        }

    }


    requestAnimationFrame(
        smoothGraph
    );

}


/* =====================================================
   TABLE
===================================================== */

function addTableRow(data) {

    const table =
        document.getElementById(
            "dataTable"
        );

    if (!table) {

        return;

    }


    const row =
        document.createElement("tr");


    const timestamp =
        data.timestamp ||
        data.created_at ||
        data.time ||
        null;


    let time = "-";


    if (timestamp) {

        const date =
            new Date(timestamp);

        if (!isNaN(date.getTime())) {

            time =
                date.toLocaleTimeString("th-TH",{
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                });

        }
        else {

            time =
                timestamp;

        }

    }
    else {

        time =
            new Date()
                .toLocaleTimeString("th-TH",{
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                });

    }


    row.innerHTML = `

        <td>${time}</td>

        <td>
            ${Number(
                data.accel_x ?? 0
            ).toFixed(4)}
        </td>

        <td>
            ${Number(
                data.accel_y ?? 0
            ).toFixed(4)}
        </td>

        <td>
            ${Number(
                data.accel_z ?? 0
            ).toFixed(4)}
        </td>

        <td>
            ${Number(
                data.pga ?? 0
            ).toFixed(4)}
        </td>

        <td>
            ${data.level || "-"}
        </td>

    `;


    table.prepend(row);


    while (
        table.children.length > 10
    ) {

        table.removeChild(
            table.lastChild
        );

    }

}


/* =====================================================
   ONLINE
===================================================== */

function setOnline() {

    const status =
        document.getElementById(
            "deviceStatus"
        );

    if (status) {

        status.textContent =
            "● Online";

        status.className =
            "device-online";

    }


    const network =
        document.getElementById(
            "networkStatus"
        );

    if (network) {

        network.textContent =
            "Online";

        network.className =
            "status-online";

    }

}


/* =====================================================
   OFFLINE
===================================================== */

function setOffline() {

    const status =
        document.getElementById(
            "deviceStatus"
        );

    if (status) {

        status.textContent =
            "● Offline";

        status.className =
            "device-offline";

    }


    const network =
        document.getElementById(
            "networkStatus"
        );

    if (network) {

        network.textContent =
            "Offline";

        network.className =
            "status-offline";

    }

}


/* =====================================================
   START
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    function() {

        console.log(
            "Dashboard starting..."
        );


        /*
         * สร้าง Chart
         */

        initChart();


        /*
         * เริ่ม animation graph
         */

        requestAnimationFrame(
            smoothGraph
        );


        /*
         * โหลด ESP32
         */

        loadDevice();


        /*
         * ดึงข้อมูลทุก 200ms
         */

        setInterval(
            function() {

                getLatest();

            },
            200
        );

    }
);

/* =====================================================
   OPEN ALL DATA
===================================================== */

async function openAllData() {

    if (!DEVICE_ID) {

        alert("ไม่พบ ESP32");

        return;

    }


    const modal =
        document.getElementById(
            "allDataModal"
        );

    const table =
        document.getElementById(
            "allDataTable"
        );


    modal.classList.add("show");


    table.innerHTML = `
        <tr>
            <td colspan="9">
                กำลังโหลดข้อมูล...
            </td>
        </tr>
    `;


    try {

        const response = await fetch(
            `/api/device/${encodeURIComponent(DEVICE_ID)}/history`,
            {
                cache: "no-store"
            }
        );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const result =
            await response.json();


        console.log(
            "ALL DATA:",
            result
        );


        if (!result.success) {

            throw new Error(
                result.message ||
                "โหลดข้อมูลไม่สำเร็จ"
            );

        }


        const data =
            result.data || [];


        document.getElementById(
            "allDataCount"
        ).textContent = data.length;


        table.innerHTML = "";


        if (data.length === 0) {

            table.innerHTML = `
                <tr>
                    <td colspan="9">
                        ไม่มีข้อมูล
                    </td>
                </tr>
            `;

            return;

        }


        data.forEach(function(row) {

            const tr =
                document.createElement("tr");
                tr.style.cursor = "pointer";
                tr.onclick = function() {
                    
                    openSensorGraph(row);
                };

            tr.innerHTML = `

                <td>
                    ${formatDateTime(
                        row.timestamp
                    )}
                </td>

                <td>
                    ${Number(
                        row.accel_x || 0
                    ).toFixed(4)}
                </td>

                <td>
                    ${Number(
                        row.accel_y || 0
                    ).toFixed(4)}
                </td>

                <td>
                    ${Number(
                        row.accel_z || 0
                    ).toFixed(4)}
                </td>

                <td>
                    ${Number(
                        row.pga || 0
                    ).toFixed(4)}
                </td>

                <td>
                    ${Number(
                        row.peak_pga || 0
                    ).toFixed(4)}
                </td>

                <td>
                    ${Number(
                        row.pendulum || 0
                    ).toFixed(2)}
                </td>

                <td>
                    ${row.level || "-"}
                </td>

                <td>
                    ${row.direction || "-"}
                </td>

            `;


            table.appendChild(tr);

        });


    }
    catch (error) {

        console.error(
            "ALL DATA ERROR:",
            error
        );


        table.innerHTML = `

            <tr>

                <td colspan="9">

                    โหลดข้อมูลไม่สำเร็จ

                </td>

            </tr>

        `;

    }

}


/* =====================================================
   CLOSE ALL DATA
===================================================== */

function closeAllData() {

    const modal =
        document.getElementById("allDataModal");

    if (modal) {
        modal.classList.remove("show");
    }

    document.body.classList.remove("modal-open");
}


/* =====================================================
   CLOSE WHEN CLICK OUTSIDE
===================================================== */

document.addEventListener(
    "click",
    function(event) {

        const modal =
            document.getElementById(
                "allDataModal"
            );


        if (
            event.target === modal
        ) {

            closeAllData();

        }

    }
);


/* =====================================================
   FORMAT DATE TIME
===================================================== */

function formatDateTime(
    timestamp
) {

    if (!timestamp) {

        return "-";

    }


    const date =
        new Date(timestamp);


    if (isNaN(date.getTime())) {

        return timestamp;

    }


    const day =
        String(
            date.getDate()
        ).padStart(2, "0");


    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");


    const year =
        date.getFullYear();


    const hours =
        String(
            date.getHours()
        ).padStart(2, "0");


    const minutes =
        String(
            date.getMinutes()
        ).padStart(2, "0");


    const seconds =
        String(
            date.getSeconds()
        ).padStart(2, "0");


    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;

}
function exportPDFByDate() {

    if (!DEVICE_ID) {
        alert("ไม่พบ ESP32");
        return;
    }

    const date =
        document.getElementById("exportDate").value;

    if (!date) {
        alert("กรุณาเลือกวันที่");
        return;
    }

    const url =
        `/api/device/${encodeURIComponent(DEVICE_ID)}/export/pdf?date=${encodeURIComponent(date)}`;

    window.location.href = url;
}
function exportExcelByDate() {

    if (!DEVICE_ID) {
        alert("ไม่พบ ESP32");
        return;
    }

    const date =
        document.getElementById("exportDate").value;

    if (!date) {
        alert("กรุณาเลือกวันที่");
        return;
    }

    const url =
        `/api/device/${encodeURIComponent(DEVICE_ID)}/export/excel?date=${encodeURIComponent(date)}`;

    window.location.href = url;
}
function exportAllPDF() {

    if (!DEVICE_ID) {
        alert("ไม่พบ ESP32");
        return;
    }

    window.location.href =
        `/api/device/${encodeURIComponent(DEVICE_ID)}/export/pdf`;
}


function exportAllExcel() {

    if (!DEVICE_ID) {
        alert("ไม่พบ ESP32");
        return;
    }

    window.location.href =
        `/api/device/${encodeURIComponent(DEVICE_ID)}/export/excel`;
}
/* =========================================================
   SENSOR HISTORY GRAPH
========================================================= */

let sensorGraph = null;


/* ---------------------------------------------------------
   เปิด Graph Modal
--------------------------------------------------------- */

async function openSensorGraph(row) {

    const graphModal = document.getElementById("graphModal");
    const allDataModal = document.getElementById("allDataModal");

    if (!graphModal) {
        console.error("ไม่พบ graphModal");
        return;
    }

    // ซ่อนหน้าข้อมูลทั้งหมดก่อน
    if (allDataModal) {
        allDataModal.classList.remove("show");
    }

    // เปิดกราฟ
    graphModal.classList.add("show");

    // ล็อกการ scroll ของหน้าเว็บ
    document.body.classList.add("modal-open");

    // เลื่อน modal ไปด้านบน
    graphModal.scrollTop = 0;

    // แสดงข้อมูลที่เลือกก่อน
    showSelectedGraphData(row);

    try {

        const response = await fetch(
            `/api/device/${encodeURIComponent(DEVICE_ID)}/graph?id=${encodeURIComponent(row.id)}`,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {

            alert(
                result.message ||
                "ไม่สามารถโหลดข้อมูลกราฟได้"
            );

            return;
        }

        createSensorHistoryGraph(
            result.data,
            result.selected
        );

    } catch (error) {

        console.error("GRAPH ERROR:", error);

        alert(
            "ไม่สามารถโหลดข้อมูลกราฟได้"
        );
    }
}


/* ---------------------------------------------------------
   ปิด Graph Modal
--------------------------------------------------------- */

function closeGraphModal() {

    const graphModal =
        document.getElementById("graphModal");

    const allDataModal =
        document.getElementById("allDataModal");

    if (graphModal) {
        graphModal.classList.remove("show");
    }

    /*
     * ถ้าปิดกราฟแล้ว
     * ให้กลับไปหน้าข้อมูลทั้งหมด
     */
    if (allDataModal) {
        allDataModal.classList.add("show");
    }

    document.body.classList.remove("modal-open");
}


/* ---------------------------------------------------------
   แสดงข้อมูลที่เลือก
--------------------------------------------------------- */

function showSelectedGraphData(row) {

    const time =
        formatDateTime(row.timestamp);


    document.getElementById(
        "graphSelectedTime"
    ).textContent = time;


    document.getElementById(
        "graphTime"
    ).textContent = time;


    document.getElementById(
        "graphX"
    ).textContent =
        Number(row.accel_x || 0).toFixed(4) + " G";


    document.getElementById(
        "graphY"
    ).textContent =
        Number(row.accel_y || 0).toFixed(4) + " G";


    document.getElementById(
        "graphZ"
    ).textContent =
        Number(row.accel_z || 0).toFixed(4) + " G";


    document.getElementById(
        "graphPGA"
    ).textContent =
        Number(row.pga || 0).toFixed(4);


    document.getElementById(
        "graphPeakPGA"
    ).textContent =
        Number(row.peak_pga || 0).toFixed(4);


    document.getElementById(
        "graphPendulum"
    ).textContent =
        Number(row.pendulum || 0).toFixed(2);


    document.getElementById(
        "graphLevel"
    ).textContent =
        row.level || "-";


    document.getElementById(
        "graphDirection"
    ).textContent =
        row.direction || "-";
}


/* ---------------------------------------------------------
   สร้างกราฟ
--------------------------------------------------------- */

function createSensorHistoryGraph(
    rows,
    selected
) {

    const canvas =
        document.getElementById(
            "sensorGraph"
        );


    // ถ้ามีกราฟเก่าอยู่ ให้ทำลายก่อน
    if (sensorGraph) {

        sensorGraph.destroy();

        sensorGraph = null;
    }


    // เรียงตามเวลา
    rows.sort(
        (a, b) =>
            new Date(a.timestamp) -
            new Date(b.timestamp)
    );


    const labels = rows.map(row => {

        const date =
            new Date(row.timestamp);

        return date.toLocaleTimeString(
            "th-TH",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );

    });


    const pgaData =
        rows.map(row =>
            Number(row.pga || 0)
        );


    const pendulumData =
        rows.map(row =>
            Number(row.pendulum || 0)
        );


    /*
     * หาตำแหน่งของข้อมูลที่ผู้ใช้คลิก
     */

    const selectedIndex =
        rows.findIndex(
            row =>
                Number(row.id) ===
                Number(selected.id)
        );


    /*
     * จุดที่เลือก
     */

    const selectedPoint =
        rows.map(
            (row, index) =>
                index === selectedIndex
                    ? Number(row.pga || 0)
                    : null
        );

            const chartwidth = Math.min(
                600,
                Math.min(1200, rows.length * 45)
            );
            canvas.style.width = chartwidth + "px";
            canvas.style.height = "400px";
    sensorGraph =
        new Chart(

            canvas,
            {
                
                type: "line",

                data: {

                    labels: labels,

                    datasets: [

                        {
                            label: "PGA",

                            data: pgaData,

                            borderWidth: 2,

                            tension: 0.25,

                            pointRadius: 3,

                            pointHoverRadius: 6,

                            fill: false
                        },


                        {
                            label: "Pendulum",

                            data: pendulumData,

                            borderWidth: 2,

                            tension: 0.25,

                            pointRadius: 3,

                            pointHoverRadius: 6,

                            fill: false
                        },


                        {
                            label: "ข้อมูลที่เลือก",

                            data: selectedPoint,

                            showLine: false,

                            pointRadius: 9,

                            pointHoverRadius: 11,

                            borderWidth: 3
                        }

                    ]

                },


                options: {

                    responsive: true,

                    maintainAspectRatio: false,
                    resizeDelay: 100,

                    interaction: {

                        mode: "index",

                        intersect: false

                    },


                    plugins: {

                        legend: {

                            display: true

                        },


                        tooltip: {

                            callbacks: {

                                title: function(
                                    tooltipItems
                                ) {

                                    return (
                                        tooltipItems[0]
                                            .label
                                    );
                                },

                                label: function(
                                    context
                                ) {

                                    return (
                                        context.dataset
                                            .label
                                        + ": "
                                        + Number(
                                            context.raw
                                        ).toFixed(4)
                                    );

                                }

                            }

                        }

                    },


                    scales: {

                        x: {

                            title: {

                                display: true,

                                text: "เวลา"

                            }

                        },


                        y: {

                            beginAtZero: true,

                            suggestedMax: 2,

                            title: {

                                display: true,

                                text: "ค่า"

                            }

                        }

                    }

                }

            }
        );
}


/* ==========================================
   FEATURE SETTINGS
   Alert thresholds + phone number list
========================================== */

const MAX_ALERT_ROWS = 5;

const ALERT_LEVELS = [
    "ต่ำ",
    "ปานกลาง",
    "สูง",
    "รุนแรง",
    "วิกฤต"
];

let alertSettings = [];
let phoneSettings = [];

function escapeFeatureHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function addAlertRow(data = {}) {
    if (alertSettings.length >= MAX_ALERT_ROWS) {
        updateAlertLimit();
        return;
    }

    const nextLevel = ALERT_LEVELS[alertSettings.length];

    alertSettings.push({
        level: ALERT_LEVELS.includes(data.level)
            ? data.level
            : nextLevel,
        threshold: Math.min(
            2,
            Math.max(0, Number(data.threshold ?? alertSettings.length * 3))
        )
    });

    renderAlertRows();
}

function removeAlertRow(index) {
    alertSettings.splice(index, 1);
    renderAlertRows();
}



function renderAlertRows() {
    const list = document.getElementById("alertSettingsList");
    if (!list) return;

    list.innerHTML = alertSettings.map((item, index) => `
        <div class="dynamic-row">
            <div class="dynamic-row-header">
                <div class="dynamic-row-title">
                    <span class="dynamic-row-number">${index + 1}</span>
                    ระดับแจ้งเตือน ${index + 1}
                </div>

                <button type="button"
                    class="remove-row-btn"
                    onclick="removeAlertRow(${index})"
                    aria-label="ลบระดับแจ้งเตือน ${index + 1}">
                    ×
                </button>
            </div>

            <label for="alertLevel${index}">ชื่อระดับ</label>
            <select id="alertLevel${index}"
                onchange="updateAlertLevel(${index}, this.value)">
                ${ALERT_LEVELS.map(level => `
                    <option value="${level}"
                        ${item.level === level ? "selected" : ""}>
                        ${level}
                    </option>
                `).join("")}
            </select>

            <label for="alertThreshold${index}">
                    ค่า PGA :
                    <strong id="alertThresholdValue${index}">
                        ${Number(item.threshold).toFixed(1)}
                    </strong>
            </label>
            <input
                class="pga-number-input"
                id="alertThreshold${index}"
                type="range"
                min="0"
                max="2"
                step="0.1"
                value="${Number(item.threshold).toFixed(1)}"
                oninput="updateAlertThreshold(${index}, this.value)"
                onblur="validateAlertThreshold(${index})"
                required
            >
            <div class="threshold-scale">
                <span>0.0 G</span>
                <span>2.0 G</span>
            </div>

            <label for="sirenSpeed${index}">
                ความเร็วไซเรน:
                <strong id="sirenSpeedValue${index}">
                    ${Number(item.sirenSpeed ?? 1).toFixed(1)}
                </strong>
            </label>

            <input
                id="sirenSpeed${index}"
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value="${Number(item.sirenSpeed ?? 1)}"
                oninput="updateSirenSpeed(${index}, this.value)"
            >

            <div class="threshold-scale">
                <span>เร็ว</span>
                <span>ช้า</span>
            </div>
        </div>
    `).join("");

    updateAlertLimit();
}

function updateSirenSpeed(index, value) {
    const speed = Math.max(0.1, Math.min(10, Number(value)));

    alertSettings[index].sirenSpeed = speed;

    const output = document.getElementById(`sirenSpeedValue${index}`);
    if (output) {
        output.textContent = speed.toFixed(1);
    }
}

function updateAlertLevel(index, value) {
    if (!alertSettings[index]) return;
    alertSettings[index].level = value;
}

function updateAlertThreshold(index, value) {
    if (!alertSettings[index]) return;

    const threshold = Math.min(2, Math.max(0, Number(value)));
    alertSettings[index].threshold = threshold;

    const output = document.getElementById(
        `alertThresholdValue${index}`
    );

    if (output) output.textContent = threshold.toFixed(1);
}

function updateAlertLimit() {
    const button = document.getElementById("addAlertBtn");
    const message = document.getElementById("alertLimitMessage");

    if (button) {
        button.disabled = alertSettings.length >= MAX_ALERT_ROWS;
    }

    if (message) {
        message.textContent = alertSettings.length >= MAX_ALERT_ROWS
            ? "ครบ 5 ระดับแล้ว"
            : `เพิ่มได้อีก ${MAX_ALERT_ROWS - alertSettings.length} ระดับ`;
    }
}

function addPhoneRow(value = "") {
    phoneSettings.push(String(value));
    renderPhoneRows();
}

function removePhoneRow(index) {
    phoneSettings.splice(index, 1);
    renderPhoneRows();
}

function renderPhoneRows() {
    const list = document.getElementById("phoneSettingsList");
    if (!list) return;

    list.innerHTML = phoneSettings.map((phone, index) => `
        <div class="dynamic-row">
            <div class="dynamic-row-header">
                <div class="dynamic-row-title">
                    <span class="dynamic-row-number">${index + 1}</span>
                    เบอร์โทรศัพท์ ${index + 1}
                </div>
                <button type="button"
                    class="remove-row-btn"
                    aria-label="ลบเบอร์โทรศัพท์ ${index + 1}"
                    onclick="removePhoneRow(${index})">×</button>
            </div>

            <label for="phoneNumber${index}">หมายเลขโทรศัพท์</label>
            <input id="phoneNumber${index}"
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                placeholder="เช่น 0812345678"
                value="${escapeFeatureHTML(phone)}"
                oninput="updatePhoneValue(${index}, this.value)">
        </div>
    `).join("");
}

function updatePhoneValue(index, value) {
    phoneSettings[index] = value;
}

function saveFeatureSettings() {
    // ตรวจสอบค่าเบอร์ที่กรอกไว้
    const normalizedPhones = phoneSettings
        .map(phone => phone.trim())
        .filter(Boolean);

    const invalidPhone = normalizedPhones.find(phone => {
        const digits = phone.replace(/[\s()-]/g, "");
        return !/^\+?\d{8,15}$/.test(digits);
    });

    if (invalidPhone) {
        const message = document.getElementById("settingsSaveMessage");
        if (message) {
            message.textContent =
                `กรุณาตรวจสอบรูปแบบเบอร์โทร: ${invalidPhone}`;
        }
        return;
    }

    const settings = {
        alerts: alertSettings,
        phones: normalizedPhones
    };

    try {
        localStorage.setItem(
            "esp32FeatureSettings",
            JSON.stringify(settings)
        );

        const message = document.getElementById("settingsSaveMessage");
        if (message) {
            message.textContent = "บันทึกการตั้งค่าในเบราว์เซอร์แล้ว";
        }
    } catch (error) {
        console.error("Cannot save feature settings:", error);

        const message = document.getElementById("settingsSaveMessage");
        if (message) {
            message.textContent = "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง";
        }
    }
}

function loadFeatureSettings() {
    let saved = null;

    try {
        saved = JSON.parse(
            localStorage.getItem("esp32FeatureSettings") || "null"
        );
    } catch (error) {
        console.warn("Cannot read saved feature settings:", error);
    }

    alertSettings = [];
    phoneSettings = [];

    if (saved && Array.isArray(saved.alerts)) {
        saved.alerts.slice(0, MAX_ALERT_ROWS).forEach(item => {
            addAlertRow(item);
        });
    }

    if (saved && Array.isArray(saved.phones)) {
        phoneSettings = saved.phones.map(phone => String(phone));
        renderPhoneRows();
    }

    // ค่าเริ่มต้นเมื่อยังไม่เคยบันทึก
    if (alertSettings.length === 0) {
        addAlertRow({ level: "LOW", threshold: 1.0 });
        addAlertRow({ level: "MODERATE", threshold: 3.0 });
    }

    renderAlertRows();
    renderPhoneRows();
}

document.addEventListener("DOMContentLoaded", loadFeatureSettings);


/* =========================================
   FEATURE MODAL CONTROLS
========================================= */

function openFeatureModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("feature-modal-open");

    const closeButton = modal.querySelector(".feature-modal-close");
    if (closeButton) closeButton.focus();
}

function closeFeatureModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");

    const anotherOpen = document.querySelector(
        ".feature-modal.show"
    );

    if (!anotherOpen) {
        document.body.classList.remove("feature-modal-open");
    }
}

document.querySelectorAll(".feature-modal").forEach(modal => {
    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeFeatureModal(modal.id);
        }
    });
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        document.querySelectorAll(".feature-modal.show")
            .forEach(modal => closeFeatureModal(modal.id));
    }
});


async function loadExportDevices() {
    const select = document.getElementById("deviceSelect");
    if (!select) return;

    try {
        const response = await fetch("/api/devices", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        const devices = result.devices || [];

        select.replaceChildren();

        if (devices.length === 0) {
            select.add(new Option("ยังไม่มี ESP32 ที่ลงทะเบียน", ""));
            return;
        }

        devices.forEach(device => {
            const label = `${device.device_id} (${device.status || "unknown"})`;
            select.add(new Option(label, device.device_id));
        });

        // เลือกตัวเดียวกับ dashboard ถ้ายังมีอยู่ในรายการ
        if (DEVICE_ID &&
            devices.some(d => d.device_id === DEVICE_ID)) {
            select.value = DEVICE_ID;
        }
    } catch (error) {
        console.error("LOAD EXPORT DEVICES ERROR:", error);
        select.replaceChildren();
        select.add(new Option("โหลดรายชื่ออุปกรณ์ไม่สำเร็จ", ""));
    }
}

function updateExportPeriodFields() {
    const period = document.getElementById("exportPeriod").value;

    document.getElementById("exportDayGroup").hidden =
        period !== "day";

    document.getElementById("exportMonthGroup").hidden =
        period !== "month";

    document.getElementById("exportYearGroup").hidden =
        period !== "year";
}

function exportReport(format) {
    // ใช้อุปกรณ์ที่เลือกไว้ใน dashboard
    const deviceId = DEVICE_ID;
    const period = document.getElementById("exportPeriod").value;

    if (!deviceId) {
        alert("กรุณาเลือก ESP32 ก่อน Export");
        return;
    }

    const params = new URLSearchParams();
    params.set("period", period);

    if (period === "day") {
        const date = document.getElementById("exportDate").value;
        if (!date) {
            alert("กรุณาเลือกวันที่");
            return;
        }
        params.set("date", date);
    }

    if (period === "month") {
        const month = document.getElementById("exportMonth").value;
        if (!month) {
            alert("กรุณาเลือกเดือน");
            return;
        }
        params.set("month", month);
    }

    if (period === "year") {
        const year = document.getElementById("exportYear").value;

        if (!year || !/^\d{4}$/.test(year) ||
            Number(year) < 2000 || Number(year) > 2100) {
            alert("กรุณากรอกปีให้ถูกต้อง");
            return;
        }

        params.set("year", year);
    }

    const url =
        `/api/device/${encodeURIComponent(deviceId)}/export/${format}?${params.toString()}`;

    window.location.href = url;
}

document.addEventListener("DOMContentLoaded", () => {
    loadExportDevices();

    const periodSelect = document.getElementById("exportPeriod");
    if (periodSelect) {
        periodSelect.addEventListener("change", updateExportPeriodFields);
        updateExportPeriodFields();
    }
});