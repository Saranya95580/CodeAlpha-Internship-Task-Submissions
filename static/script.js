
// ==================================================
// VISIONTRACK AI - MAIN JAVASCRIPT
// ==================================================


// --------------------------------------------------
// DOM ELEMENTS
// --------------------------------------------------

const videoInput = document.getElementById("videoInput");
const videoPreview = document.getElementById("videoPreview");
const webcamPreview = document.getElementById("webcamPreview");
const detectionCanvas = document.getElementById("detectionCanvas");

const emptyState = document.getElementById("emptyState");
const startButton = document.getElementById("startButton");
const resetButton = document.getElementById("resetButton");

const uploadTab = document.getElementById("uploadTab");
const webcamTab = document.getElementById("webcamTab");

const fileInformation = document.getElementById("fileInformation");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");

const previewOverlay = document.getElementById("previewOverlay");
const actionInfo = document.getElementById("actionInfo");

const confidenceSlider = document.getElementById("confidenceSlider");
const confidenceValue = document.getElementById("confidenceValue");

const trackerSelect = document.getElementById("trackerSelect");
const showBoxes = document.getElementById("showBoxes");
const showTracking = document.getElementById("showTracking");

const totalObjects = document.getElementById("totalObjects");
const uniqueTracks = document.getElementById("uniqueTracks");
const totalFrames = document.getElementById("totalFrames");

const resultsBody = document.getElementById("resultsBody");
const resultCount = document.getElementById("resultCount");

const summaryTotal = document.getElementById("summaryTotal");
const summaryTracks = document.getElementById("summaryTracks");
const summaryFrames = document.getElementById("summaryFrames");
const summaryTracker = document.getElementById("summaryTracker");

const progressSection = document.getElementById("progressSection");
const progressLabel = document.getElementById("progressLabel");
const progressPercent = document.getElementById("progressPercent");
const progressFill = document.getElementById("progressFill");


// --------------------------------------------------
// APPLICATION STATE
// --------------------------------------------------

let selectedMode = "upload";
let selectedVideo = null;
let webcamStream = null;
let webcamRunning = false;
let webcamBusy = false;
let webcamSession = 0;

let currentVideoUrl = null;

let webcamObjectHistory = new Map();


// --------------------------------------------------
// SETTINGS
// --------------------------------------------------

function getSettings() {
    return {
        confidence: Number(confidenceSlider.value) / 100,
        show_boxes: showBoxes.checked,
        show_tracking: showTracking.checked,
        tracker: trackerSelect.value
    };
}


// --------------------------------------------------
// STATUS
// --------------------------------------------------

function updateStatus(message, state = "ready") {
    actionInfo.textContent = message;
    actionInfo.className = "action-info";

    const dot = document.createElement("span");
    dot.className = "status-dot";

    actionInfo.prepend(dot);

    if (state === "processing") {
        actionInfo.classList.add("processing");
    }
}


// --------------------------------------------------
// ICON REFRESH
// --------------------------------------------------

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}


// --------------------------------------------------
// RESET STATISTICS
// --------------------------------------------------

function resetStatistics() {
    totalObjects.textContent = "0";
    uniqueTracks.textContent = "0";
    totalFrames.textContent = "0";

    summaryTotal.textContent = "0";
    summaryTracks.textContent = "0";
    summaryFrames.textContent = "0";

    resultCount.textContent = "0 OBJECTS";

    webcamObjectHistory.clear();

    resultsBody.innerHTML = `
        <tr class="empty-table-row">
            <td colspan="4">
                <div class="table-empty">
                    <i data-lucide="scan-search"></i>
                    <span>No objects detected yet.</span>
                    <small>Start an analysis to see results here.</small>
                </div>
            </td>
        </tr>
    `;

    refreshIcons();
}


// --------------------------------------------------
// RENDER DETECTION TABLE
// --------------------------------------------------

function renderObjects(objects) {
    if (!objects || objects.length === 0) {
        resultsBody.innerHTML = `
            <tr class="empty-table-row">
                <td colspan="4">
                    <div class="table-empty">
                        <i data-lucide="scan-search"></i>
                        <span>No objects detected in this frame.</span>
                    </div>
                </td>
            </tr>
        `;

        resultCount.textContent = "0 OBJECTS";
        refreshIcons();
        return;
    }

    resultsBody.innerHTML = objects.map(object => {
        const id = object.track_id !== null &&
                   object.track_id !== undefined
            ? object.track_id
            : "—";

        return `
            <tr>
                <td>
                    <div class="object-name">
                        <span class="object-marker"></span>
                        ${escapeHTML(object.class)}
                    </div>
                </td>

                <td>
                    <span class="track-id">${id}</span>
                </td>

                <td>
                    <span class="confidence-pill">
                        ${Number(object.confidence).toFixed(1)}%
                    </span>
                </td>

                <td>
                    <span class="detected-status">Detected</span>
                </td>
            </tr>
        `;
    }).join("");

    resultCount.textContent = `${objects.length} OBJECTS`;

    refreshIcons();
}


// --------------------------------------------------
// SAFE HTML TEXT
// --------------------------------------------------

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}


// --------------------------------------------------
// CONFIDENCE SLIDER
// --------------------------------------------------

confidenceSlider.addEventListener("input", () => {
    const value = confidenceSlider.value;

    confidenceValue.textContent = `${value}%`;

    const percentage =
        ((value - confidenceSlider.min) /
        (confidenceSlider.max - confidenceSlider.min)) * 100;

    confidenceSlider.style.background = `
        linear-gradient(
            90deg,
            #8b5cf6 0%,
            #8b5cf6 ${percentage}%,
            #2a3146 ${percentage}%,
            #2a3146 100%
        )
    `;
});


// --------------------------------------------------
// MODE SWITCHING
// --------------------------------------------------

function setMode(mode) {
    if (webcamRunning) {
        stopWebcam();
    }

    selectedMode = mode;

    uploadTab.classList.toggle("active", mode === "upload");
    webcamTab.classList.toggle("active", mode === "webcam");

    fileInformation.hidden = true;
    previewOverlay.hidden = true;

    videoPreview.pause();
    videoPreview.hidden = true;
    webcamPreview.hidden = true;

    detectionCanvas.hidden = true;
    detectionCanvas.style.display = "none";

    emptyState.hidden = false;

    if (mode === "upload") {
        startButton.innerHTML = `
            <i data-lucide="play"></i>
            Start Detection
        `;

        startButton.disabled = !selectedVideo;

        updateStatus(
            selectedVideo
                ? "Video ready for analysis"
                : "Waiting for video"
        );

    } else {
        startButton.innerHTML = `
            <i data-lucide="camera"></i>
            Start Webcam
        `;

        startButton.disabled = false;

        updateStatus("Webcam ready");
    }

    progressSection.hidden = true;

    refreshIcons();
}

uploadTab.addEventListener("click", () => {
    setMode("upload");
});

webcamTab.addEventListener("click", () => {
    setMode("webcam");
});


// --------------------------------------------------
// VIDEO FILE SELECTION
// --------------------------------------------------

videoInput.addEventListener("change", event => {
    const file = event.target.files[0];

    if (!file) {
        return;
    }

    const extension = file.name.split(".").pop().toLowerCase();

    const allowedExtensions = [
        "mp4",
        "avi",
        "mov",
        "mkv"
    ];

    if (!allowedExtensions.includes(extension)) {
        alert("Please select an MP4, AVI, MOV or MKV video.");
        videoInput.value = "";
        return;
    }

    selectedVideo = file;

    if (currentVideoUrl) {
        URL.revokeObjectURL(currentVideoUrl);
    }

    currentVideoUrl = URL.createObjectURL(file);

    videoPreview.src = currentVideoUrl;
    videoPreview.hidden = false;

    emptyState.hidden = true;
    webcamPreview.hidden = true;
    detectionCanvas.hidden = true;

    fileInformation.hidden = false;

    fileName.textContent = file.name;
    fileSize.textContent =
        `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    videoPreview.load();

    startButton.disabled = false;

    updateStatus("Video selected successfully");

    resetStatistics();
    progressSection.hidden = true;

    refreshIcons();
});


// --------------------------------------------------
// START DETECTION BUTTON
// --------------------------------------------------

startButton.addEventListener("click", async () => {

    if (selectedMode === "upload") {
        if (!selectedVideo) {
            alert("Please select a video first.");
            return;
        }

        await processUploadedVideo();

    } else {
        if (webcamRunning) {
            stopWebcam();
        } else {
            await startWebcam();
        }
    }
});


// --------------------------------------------------
// UPLOADED VIDEO DETECTION
// --------------------------------------------------

async function processUploadedVideo() {

    startButton.disabled = true;

    updateStatus("Processing video...", "processing");

    progressSection.hidden = false;

    progressLabel.textContent =
        "AI is analyzing the complete video...";

    progressPercent.textContent = "Working";

    progressFill.style.width = "0%";

    const formData = new FormData();

    formData.append("video", selectedVideo);

    const settings = getSettings();

    formData.append("confidence", settings.confidence);

    // Empty string represents false for the Flask boolean parser.
    formData.append(
        "show_boxes",
        settings.show_boxes ? "1" : ""
    );

    formData.append(
        "show_tracking",
        settings.show_tracking ? "1" : ""
    );

    formData.append("tracker", settings.tracker);

    try {

        const response = await fetch("/api/detect-video", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.error || "Video processing failed."
            );
        }

        const statistics = data.statistics;

        updateVideoStatistics(statistics);

        videoPreview.pause();

        videoPreview.src = data.video_url;

        videoPreview.hidden = false;
        emptyState.hidden = true;

        videoPreview.load();

        progressFill.style.width = "100%";
        progressPercent.textContent = "100%";

        progressLabel.textContent =
            "Video processing completed successfully.";

        updateStatus("Detection completed successfully");

        startButton.disabled = false;

        alert("Video detection completed successfully!");

    } catch (error) {

        console.error("VIDEO DETECTION ERROR:", error);

        updateStatus("Video processing failed");

        progressLabel.textContent = error.message;

        alert(error.message);

        startButton.disabled = false;

    }
}


// --------------------------------------------------
// VIDEO STATISTICS
// --------------------------------------------------

function updateVideoStatistics(statistics) {

    const counts = statistics.detected_objects || {};

    const total = Object.values(counts).reduce(
        (sum, count) => sum + Number(count),
        0
    );

    const tracks = statistics.unique_tracks || 0;
    const frames = statistics.total_frames || 0;

    totalObjects.textContent = total;
    uniqueTracks.textContent = tracks;
    totalFrames.textContent = frames;

    summaryTotal.textContent = total;
    summaryTracks.textContent = tracks;
    summaryFrames.textContent = frames;

    summaryTracker.textContent =
        trackerSelect.value === "bytetrack.yaml"
            ? "ByteTrack"
            : "BoT-SORT";

    const objects = Object.entries(counts).map(
        ([name, count]) => ({
            class: name,
            confidence: 0,
            track_id: null,
            count: count
        })
    );

    if (objects.length === 0) {
        renderObjects([]);
        return;
    }

    resultsBody.innerHTML = objects.map(object => `
        <tr>
            <td>
                <div class="object-name">
                    <span class="object-marker"></span>
                    ${escapeHTML(object.class)}
                </div>
            </td>

            <td>
                <span class="track-id">—</span>
            </td>

            <td>
                <span class="confidence-pill">—</span>
            </td>

            <td>
                <span class="detected-status">
                    ${object.count} detections
                </span>
            </td>
        </tr>
    `).join("");

    resultCount.textContent =
        `${objects.length} CLASSES`;
}


// --------------------------------------------------
// START WEBCAM
// --------------------------------------------------

async function startWebcam() {

    try {

        if (!navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia) {

            throw new Error(
                "Your browser does not support webcam access."
            );
        }

        updateStatus("Requesting webcam permission...", "processing");

        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        webcamPreview.srcObject = webcamStream;

        await webcamPreview.play();

        webcamRunning = true;
        webcamSession++;

        const session = webcamSession;

        webcamObjectHistory.clear();

        emptyState.hidden = true;

        videoPreview.hidden = true;
        webcamPreview.hidden = false;

        detectionCanvas.hidden = false;
        detectionCanvas.style.display = "block";

        detectionCanvas.style.width = "100%";
        detectionCanvas.style.height = "auto";

        detectionCanvas.style.maxHeight = "430px";
        detectionCanvas.style.objectFit = "contain";

        previewOverlay.hidden = false;

        startButton.innerHTML = `
            <i data-lucide="square"></i>
            Stop Webcam
        `;

        startButton.disabled = false;

        resetStatistics();

        updateStatus("Live webcam detection active", "processing");

        refreshIcons();

        runWebcamDetection(session);

    } catch (error) {

        console.error("WEBCAM ERROR:", error);

        updateStatus("Unable to access webcam");

        alert(
            "Could not access your webcam.\n\n" +
            error.message +
            "\n\nPlease allow camera permission in your browser."
        );

        stopWebcam();
    }
}


// --------------------------------------------------
// WEBCAM DETECTION LOOP
// --------------------------------------------------

async function runWebcamDetection(session) {

    const context = detectionCanvas.getContext("2d");

    while (
        webcamRunning &&
        session === webcamSession
    ) {

        if (
            webcamPreview.readyState >= 2 &&
            !webcamBusy
        ) {

            webcamBusy = true;

            try {

                const width = webcamPreview.videoWidth;
                const height = webcamPreview.videoHeight;

                if (!width || !height) {
                    continue;
                }

                detectionCanvas.width = width;
                detectionCanvas.height = height;

                // Capture the current webcam frame.
                context.drawImage(
                    webcamPreview,
                    0,
                    0,
                    width,
                    height
                );

                const imageData = detectionCanvas.toDataURL(
                    "image/jpeg",
                    0.75
                );

                const response = await fetch(
                    "/api/detect-frame",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            image: imageData,
                            ...getSettings()
                        })
                    }
                );

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(
                        data.error || "Webcam detection failed."
                    );
                }

                if (
                    !webcamRunning ||
                    session !== webcamSession
                ) {
                    break;
                }

                // Display the annotated frame.
                const annotatedImage = new Image();

                annotatedImage.src =
                    `data:image/jpeg;base64,${data.image}`;

                await new Promise((resolve, reject) => {
                    annotatedImage.onload = resolve;
                    annotatedImage.onerror = reject;
                });

                context.drawImage(
                    annotatedImage,
                    0,
                    0,
                    width,
                    height
                );

                updateWebcamStatistics(data.objects || []);

            } catch (error) {

                console.error("FRAME ERROR:", error);

                updateStatus("Webcam detection error");

                break;

            } finally {

                webcamBusy = false;

            }
        }

        // Small delay between webcam requests.
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (session === webcamSession && webcamRunning) {
        stopWebcam();
    }
}


// --------------------------------------------------
// WEBCAM STATISTICS
// --------------------------------------------------

function updateWebcamStatistics(objects) {

    const total = objects.length;

    let tracks = 0;

    objects.forEach(object => {

        if (object.track_id !== null &&
            object.track_id !== undefined) {

            tracks++;

            const key = object.track_id;

            webcamObjectHistory.set(key, object.class);
        }
    });

    totalObjects.textContent = total;

    uniqueTracks.textContent = webcamObjectHistory.size;

    totalFrames.textContent =
        Number(totalFrames.textContent) + 1;

    summaryTotal.textContent = total;

    summaryTracks.textContent =
        webcamObjectHistory.size;

    summaryFrames.textContent =
        totalFrames.textContent;

    summaryTracker.textContent =
        trackerSelect.value === "bytetrack.yaml"
            ? "ByteTrack"
            : "BoT-SORT";

    renderObjects(objects);
}


// --------------------------------------------------
// STOP WEBCAM
// --------------------------------------------------

function stopWebcam() {

    webcamRunning = false;

    webcamSession++;

    webcamBusy = false;

    if (webcamStream) {

        webcamStream.getTracks().forEach(track => {
            track.stop();
        });

        webcamStream = null;
    }

    webcamPreview.srcObject = null;

    webcamPreview.hidden = true;

    detectionCanvas.hidden = true;
    detectionCanvas.style.display = "none";

    previewOverlay.hidden = true;

    if (selectedMode === "webcam") {

        emptyState.hidden = false;

        startButton.innerHTML = `
            <i data-lucide="camera"></i>
            Start Webcam
        `;

        startButton.disabled = false;

        updateStatus("Webcam stopped");
    }

    refreshIcons();
}


// --------------------------------------------------
// RESET WORKSPACE
// --------------------------------------------------

resetButton.addEventListener("click", () => {

    if (webcamRunning) {
        stopWebcam();
    }

    selectedVideo = null;

    videoInput.value = "";

    videoPreview.pause();

    videoPreview.removeAttribute("src");
    videoPreview.load();

    webcamPreview.srcObject = null;

    videoPreview.hidden = true;
    webcamPreview.hidden = true;

    detectionCanvas.hidden = true;
    detectionCanvas.style.display = "none";

    emptyState.hidden = false;

    fileInformation.hidden = true;

    previewOverlay.hidden = true;

    progressSection.hidden = true;

    if (currentVideoUrl) {
        URL.revokeObjectURL(currentVideoUrl);
        currentVideoUrl = null;
    }

    startButton.disabled = selectedMode === "webcam";

    startButton.innerHTML = selectedMode === "webcam"
        ? `<i data-lucide="camera"></i> Start Webcam`
        : `<i data-lucide="play"></i> Start Detection`;

    resetStatistics();

    updateStatus("Workspace reset");

    refreshIcons();
});


// --------------------------------------------------
// NAVIGATION
// --------------------------------------------------

document.querySelectorAll(".nav-item").forEach(item => {

    item.addEventListener("click", () => {

        document.querySelectorAll(".nav-item").forEach(nav => {
            nav.classList.remove("active");
        });

        item.classList.add("active");
    });

});


// --------------------------------------------------
// INITIALIZATION
// --------------------------------------------------

function initializeApplication() {

    confidenceSlider.dispatchEvent(
        new Event("input")
    );

    resetStatistics();

    updateStatus("Waiting for input");

    fetch("/api/status")
        .then(response => response.json())
        .then(data => {

            if (data.success) {
                console.log(
                    "VisionTrack AI is online:",
                    data.model
                );
            }

        })
        .catch(error => {
            console.error("Backend status error:", error);
        });

    refreshIcons();
}

initializeApplication();


// --------------------------------------------------
// CLEANUP
// --------------------------------------------------

window.addEventListener("beforeunload", () => {

    if (webcamStream) {
        webcamStream.getTracks().forEach(track => {
            track.stop();
        });
    }

    if (currentVideoUrl) {
        URL.revokeObjectURL(currentVideoUrl);
    }

});
