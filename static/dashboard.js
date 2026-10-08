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


/* =====================================================
   LOAD DEVICE
===================================================== */

async function loadDevice() {

    try {

        console.log("Loading devices...");

        const response = await fetch(
            "/api/devices",
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }

        const result = await response.json();

        console.log("Devices API:", result);

        if (
            !result.success ||
            !result.devices ||
            result.devices.length === 0
        ) {

            throw new Error(
                "No ESP32 device found"
            );

        }

        const device = result.devices[0];

        DEVICE_ID = device.device_id;

        console.log(
            "Selected device:",
            DEVICE_ID
        );

        document
            .getElementById("deviceName")
            .textContent = DEVICE_ID;


        /*
         * สำคัญ
         * เช็คสถานะจาก API
         */

        if (
            device.status === "online" ||
            device.status === "connected"
        ) {

            setOnline();

        }
        else {

            setOffline();

        }


        /*
         * โหลดข้อมูลล่าสุด
         */

        await getLatest();

    }

    catch (error) {

        console.error(
            "LOAD DEVICE ERROR:",
            error
        );

        setOffline();

    }

}


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
        document.getElementById(
            "allDataModal"
        );

    modal.classList.remove("show");

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