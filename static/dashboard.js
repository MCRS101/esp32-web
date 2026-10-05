

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

const MAX_CHART_POINTS = 60;


/* =====================================================
   INIT CHART
===================================================== */

function initChart() {

    const ctx =
        document
            .getElementById("vibrationChart")
            .getContext("2d");


    vibrationChart = new Chart(ctx, {

        type: "line",

        data: {

            labels: [],

            datasets: [

                /* =====================================
                   PGA
                ===================================== */

                {
                    label: "แรงสั่นสะเทือน PGA (g)",

                    data: [],

                    borderColor: "#20b978",
                    backgroundColor: "rgba(32,185,120,.08)",

                    borderWidth: 2,

                    tension: 0.35,

                    cubicInterpolationMode:
                        "monotone",

                    pointRadius: 0,

                    pointHoverRadius: 4,

                    fill: false
                },


                /* =====================================
                   PENDULUM
                ===================================== */

                {
                    label: "การแกว่งลูกตุ้ม Pendulum",

                    data: [],

                    borderColor: "#ff6b2c",
                    backgroundColor: "rgba(255,107,44,.08)",

                    borderWidth: 2,

                    tension: 0.35,

                    cubicInterpolationMode:
                        "monotone",

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

                /* =====================================
                   X AXIS
                ===================================== */

                x: {

                    display: true,

                    ticks: {

                        maxTicksLimit: 8

                    }

                },


                /* =====================================
                   Y AXIS
                   FIXED 0 - 0.50
                ===================================== */

                y: {

                    min: 0,

                    max: 2.0,

                    beginAtZero: true,

                    ticks: {

                        stepSize: 0.2,

                        precision: 2,

                        color: "#8fa4bf",

                        callback:
                            function(value) {

                                return Number(value)
                                    .toFixed(2);

                            }

                    },

                    title: {

                        display: true,

                        text: "Value",
                        color: "#8fa4bf"

                    },

                    grid: {
                        color: "rgba(96, 125, 155, 0.16)"
                    }

                }

            },


            plugins: {

                legend: {

                    display: true,

                    position: "top",

                    labels: {
                        color: "#b8c9dc"
                    }

                },


                tooltip: {

                    callbacks: {

                        label:
                            function(context) {

                                const value =
                                    Number(
                                        context.raw
                                    );

                                return (
                                    context.dataset.label
                                    +
                                    ": "
                                    +
                                    value.toFixed(4)
                                );

                            }

                    }

                }

            }

        }

    });

}


/* =====================================================
   LOAD DEVICE
===================================================== */

async function loadDevice() {

    try {

        const response =
            await fetch(
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


        const result =
            await response.json();


        if (
            !result.success ||
            !result.devices ||
            result.devices.length === 0
        ) {

            throw new Error(
                "No ESP32 device found"
            );

        }


        const device =
            result.devices[0];


        DEVICE_ID =
            device.device_id;


        document
            .getElementById("deviceName")
            .textContent =
                DEVICE_ID;


        if (
            device.status === "online"
        ) {

            setOnline();

        }
        else {

            setOffline();

        }


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

        const response =
            await fetch(
                `/api/device/${DEVICE_ID}/latest`,
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


        if (!result.success) {

            throw new Error(
                "API success=false"
            );

        }


        const data =
            result.data;


        console.log(
            "Sensor:",
            data
        );


        updateDashboard(data);


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

    /* =====================================
       PGA
    ===================================== */

    const pga =
        Number(data.pga || 0);


    document
        .getElementById("pga")
        .textContent =
            pga.toFixed(4);


    /* =====================================
       PENDULUM
    ===================================== */

    const pendulum =
        Number(data.pendulum || 0);


    document
        .getElementById("pendulum")
        .textContent =
            pendulum.toFixed(4);


    /* =====================================
       PEAK PGA
    ===================================== */

    document
        .getElementById("peakPga")
        .textContent =
            Number(
                data.peak_pga || 0
            ).toFixed(4);


    /* =====================================
       ML
    ===================================== */

    document
        .getElementById("ml")
        .textContent =
            Number(
                data.estimated_ml || 0
            ).toFixed(2);


    /* =====================================
       ACCELERATION
    ===================================== */

    document
        .getElementById("accelX")
        .textContent =
            Number(
                data.accel_x || 0
            ).toFixed(4);


    document
        .getElementById("accelY")
        .textContent =
            Number(
                data.accel_y || 0
            ).toFixed(4);


    document
        .getElementById("accelZ")
        .textContent =
            Number(
                data.accel_z || 0
            ).toFixed(4);


    /* =====================================
       LEVEL
    ===================================== */

    const level =
        data.level || "LOW";


    const levelElement =
        document.getElementById("level");


    levelElement.textContent =
        level;


    levelElement.className =
        "level " + level;


    /* =====================================
       DIRECTION
    ===================================== */

    const direction =
        data.direction || "CENTER";


    document
        .getElementById("realtimeDirection")
        .textContent =
            direction;


    updateDirectionStyle(
        direction
    );


    /* =====================================
       GRAPH TARGET
    ===================================== */

    targetPGA =
        pga;


    targetPendulum =
        pendulum;

    updateViewportVisuals(data);
    updateSensorStatus(data);

}



/* =====================================================
   VIEWPORT VISUALS
===================================================== */

function updateViewportVisuals(data) {
    const x = Number(data.accel_x || 0);
    const y = Number(data.accel_y || 0);
    const z = Number(data.accel_z || 0);
    const pendulum = Number(data.pendulum || 0);
    const direction = String(data.direction || "CENTER").toUpperCase();

    const setBar = (id, valueId, value) => {
        const bar = document.getElementById(id);
        const text = document.getElementById(valueId);
        const percent = Math.min(100, Math.abs(value) / 0.6 * 100);
        if (bar) bar.style.height = percent + "%";
        if (text) text.textContent = value.toFixed(2);
    };

    setBar("barX", "barValueX", x);
    setBar("barY", "barValueY", y);
    setBar("barZ", "barValueZ", z);

    const vector = document.getElementById("realtimeVector");
    if (vector) vector.textContent = pendulum.toFixed(2);

    const realtimeDirection = document.getElementById("realtimeDirection");
    if (realtimeDirection) realtimeDirection.textContent = direction;

    const angleMap = {
        N: 0, NE: 45, E: 90, SE: 135,
        S: 180, SW: 225, W: 270, NW: 315,
        CENTER: 0, "-": 0
    };
    const angle = angleMap[direction] ?? 0;
    const needle = document.getElementById("directionNeedle");
    if (needle) needle.style.transform = `translate(-50%, -100%) rotate(${angle}deg)`;

    const rod = document.getElementById("pendulumRod");
    if (rod) {
        const sway = Math.max(-28, Math.min(28, x * 45));
        rod.style.transform = `translateX(-50%) rotate(${sway}deg)`;
    }
}

function updateSensorStatus(data) {
    const connected = true;
    const mpu = document.getElementById("mpuStatus");
    const sharp = document.getElementById("sharpStatus");
    if (mpu) mpu.textContent = connected ? "ปกติ" : "ผิดปกติ";
    if (sharp) sharp.textContent = connected ? "ปกติ" : "ผิดปกติ";
}

/* =====================================================
   SMOOTH GRAPH
===================================================== */

function smoothGraph(timestamp) {


    /* =====================================
       PGA SMOOTH
    ===================================== */

    const pgaDifference =
        targetPGA -
        currentPGA;


    currentPGA +=
        pgaDifference * 0.12;


    if (
        Math.abs(pgaDifference)
        <
        0.00001
    ) {

        currentPGA =
            targetPGA;

    }


    /* =====================================
       PENDULUM SMOOTH
    ===================================== */

    const pendulumDifference =
        targetPendulum -
        currentPendulum;


    currentPendulum +=
        pendulumDifference * 0.12;


    if (
        Math.abs(pendulumDifference)
        <
        0.00001
    ) {

        currentPendulum =
            targetPendulum;

    }


    /* =====================================
       ADD GRAPH POINT
    ===================================== */

    if (
        timestamp -
        lastChartPointTime
        >=
        100
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


            /* =================================
               X
            ================================= */

            vibrationChart
                .data
                .labels
                .push(time);


            /* =================================
               PGA
            ================================= */

            vibrationChart
                .data
                .datasets[0]
                .data
                .push(
                    currentPGA
                );


            /* =================================
               PENDULUM
            ================================= */

            vibrationChart
                .data
                .datasets[1]
                .data
                .push(
                    currentPendulum
                );


            /* =================================
               LIMIT DATA
            ================================= */

            if (
                vibrationChart
                    .data
                    .labels
                    .length
                >
                MAX_CHART_POINTS
            ) {

                vibrationChart
                    .data
                    .labels
                    .shift();


                vibrationChart
                    .data
                    .datasets[0]
                    .data
                    .shift();


                vibrationChart
                    .data
                    .datasets[1]
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


    const row =
        document.createElement(
            "tr"
        );


    let time = "-";


    const timestamp =
        data.timestamp ||
        data.created_at ||
        data.time ||
        null;


    if (timestamp) {

        const date =
            new Date(timestamp);


        if (
            !isNaN(
                date.getTime()
            )
        ) {

            time =
                date.toLocaleTimeString();

        }
        else {

            time =
                timestamp;

        }

    }
    else {

        time =
            new Date()
                .toLocaleTimeString();

    }


    row.innerHTML = `

        <td>
            ${time}
        </td>

        <td>
            ${Number(
                data.accel_x || 0
            ).toFixed(4)}
        </td>

        <td>
            ${Number(
                data.accel_y || 0
            ).toFixed(4)}
        </td>

        <td>
            ${Number(
                data.accel_z || 0
            ).toFixed(4)}
        </td>

        <td>
            ${Number(
                data.pga || 0
            ).toFixed(4)}
        </td>

        <td>
            ${data.level || "-"}
        </td>

    `;


    table.prepend(row);

    historyRows.unshift(data);
    if (historyRows.length > 100) historyRows = historyRows.slice(0, 100);

    while (
        table.children.length > 10
    ) {

        table.removeChild(
            table.lastChild
        );

    }

}


/* =====================================================
   DIRECTION
===================================================== */

function updateDirectionStyle(direction) {


    const directionElement =
        document.getElementById(
            "realtimeDirection"
        );

    if (!directionElement) {
        return;
    }

    directionElement.textContent =
        direction;

    directionElement.style.transform =
        "scale(1.05)";

    setTimeout(function() {

        directionElement.style.transform =
            "scale(1)";

    }, 150);


    /* ===============================
       Compass Needle
    =============================== */

    const needle =
        document.getElementById(
            "directionNeedle"
        );

    if (!needle) {
        return;
    }


    const directionAngles = {

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
        directionAngles[direction] ?? 0;


    needle.style.transform =
        `translate(-50%, -100%) rotate(${angle}deg)`;

}

/* =====================================================
   ONLINE
===================================================== */

function setOnline() {

    const status =
        document.getElementById(
            "deviceStatus"
        );


    status.textContent =
        "● Online";


    status.className =
        "device-online";


    document
        .getElementById(
            "networkStatus"
        )
        .textContent =
            "Online";


    document
        .getElementById(
            "networkStatus"
        )
        .className =
            "status-online";

}


/* =====================================================
   OFFLINE
===================================================== */

function setOffline() {

    const status =
        document.getElementById(
            "deviceStatus"
        );


    status.textContent =
        "● Offline";


    status.className =
        "device-offline";


    document
        .getElementById(
            "networkStatus"
        )
        .textContent =
            "Offline";


    document
        .getElementById(
            "networkStatus"
        )
        .className =
            "status-offline";

}



/* =====================================================
   DATABASE HISTORY / EXPORT
===================================================== */

let historyRows = [];

async function loadHistory(limit = 20) {
    if (!DEVICE_ID) return [];
    try {
        const response = await fetch(`/api/device/${DEVICE_ID}/history?limit=${limit}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        const rows = result.data || result.history || result.records || [];
        historyRows = Array.isArray(rows) ? rows : [];
        renderHistory(historyRows);
        return historyRows;
    } catch (error) {
        console.error("HISTORY ERROR:", error);
        return [];
    }
}

function formatDateTime(value) {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function renderHistory(rows) {
    const table = document.getElementById("dataTable");
    if (!table) return;
    table.innerHTML = "";
    rows.slice(0, 20).forEach(data => {
        const tr = document.createElement("tr");
        const level = data.level || "LOW";
        tr.innerHTML = `
            <td>${formatDateTime(data.timestamp || data.created_at || data.time)}</td>
            <td>${Number(data.accel_x || 0).toFixed(2)}</td>
            <td>${Number(data.accel_y || 0).toFixed(2)}</td>
            <td>${Number(data.accel_z || 0).toFixed(2)}</td>
            <td><span class="table-level">${level}</span></td>
        `;
        table.appendChild(tr);
    });
}

function exportExcel() {
    if (!historyRows.length) return alert("ยังไม่มีข้อมูลสำหรับ Export");
    const header = ["วัน/เวลา", "แกน X (G)", "แกน Y (G)", "แกน Z (G)", "PGA (G)", "Pendulum", "สถานะ"];
    const lines = [header.join(",")];
    historyRows.forEach(d => lines.push([
        formatDateTime(d.timestamp || d.created_at || d.time),
        Number(d.accel_x || 0).toFixed(4),
        Number(d.accel_y || 0).toFixed(4),
        Number(d.accel_z || 0).toFixed(4),
        Number(d.pga || 0).toFixed(4),
        Number(d.pendulum || 0).toFixed(4),
        d.level || ""
    ].map(v => `"${String(v).replaceAll('"','""')}"`).join(",")));
    const blob = new Blob(["\ufeff" + lines.join("\n")], {type: "text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `esp32-vibration-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportPdf() {
    window.print();
}

/* =====================================================
   FEATURES SETTINGS
===================================================== */

function initSettings() {
    const sensitivity = document.getElementById("sensitivityRange");
    const sensitivityText = document.getElementById("sensitivityText");
    const richter = document.getElementById("richterRange");
    const richterText = document.getElementById("richterText");
    const names = ["ต่ำ", "ปานกลาง", "สูง"];

    const savedSensitivity = localStorage.getItem("vibrationSensitivity");
    const savedRichter = localStorage.getItem("richterThreshold");
    if (savedSensitivity !== null) sensitivity.value = savedSensitivity;
    if (savedRichter !== null) richter.value = savedRichter;

    const refresh = () => {
        sensitivityText.textContent = names[Number(sensitivity.value)] || "ปานกลาง";
        richterText.textContent = Number(richter.value).toFixed(1);
    };
    sensitivity.addEventListener("input", () => {
        localStorage.setItem("vibrationSensitivity", sensitivity.value);
        refresh();
    });
    richter.addEventListener("input", () => {
        localStorage.setItem("richterThreshold", richter.value);
        refresh();
    });
    refresh();
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


        initChart();


        requestAnimationFrame(
            smoothGraph
        );


        loadDevice().then(() => loadHistory(20));
        initSettings();


        setInterval(
            function() {

                getLatest();

            },
            200
        );

    }
);

