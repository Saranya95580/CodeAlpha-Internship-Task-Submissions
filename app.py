
import os
import uuid
import base64
import cv2
import numpy as np

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    send_from_directory
)

from werkzeug.utils import secure_filename

from detect import detect_frame, process_video


# --------------------------------------------------
# FLASK CONFIGURATION
# --------------------------------------------------

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
OUTPUT_FOLDER = os.path.join(BASE_DIR, "outputs")

ALLOWED_EXTENSIONS = {"mp4", "avi", "mov", "mkv"}

app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)


# --------------------------------------------------
# HELPER FUNCTIONS
# --------------------------------------------------

def allowed_file(filename):
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


def get_detection_settings(data):
    try:
        confidence = float(data.get("confidence", 0.35))
    except (TypeError, ValueError):
        confidence = 0.35

    confidence = max(0.1, min(confidence, 1.0))

    show_boxes = data.get("show_boxes", True)
    show_tracking = data.get("show_tracking", True)

    tracker = data.get("tracker", "bytetrack.yaml")

    if tracker not in {"bytetrack.yaml", "botsort.yaml"}:
        tracker = "bytetrack.yaml"

    return confidence, bool(show_boxes), bool(show_tracking), tracker


# --------------------------------------------------
# MAIN DASHBOARD
# --------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


# --------------------------------------------------
# WEBCAM FRAME DETECTION
# --------------------------------------------------

@app.route("/api/detect-frame", methods=["POST"])
def detect_webcam_frame():

    try:
        data = request.get_json(silent=True) or {}

        image_data = data.get("image")

        if not image_data:
            return jsonify({
                "success": False,
                "error": "No webcam frame received."
            }), 400

        encoded_image = image_data.split(",")[-1]

        image_bytes = base64.b64decode(encoded_image)

        image_array = np.frombuffer(
            image_bytes,
            dtype=np.uint8
        )

        frame = cv2.imdecode(
            image_array,
            cv2.IMREAD_COLOR
        )

        if frame is None:
            return jsonify({
                "success": False,
                "error": "Invalid webcam frame."
            }), 400

        confidence, show_boxes, show_tracking, tracker = (
            get_detection_settings(data)
        )

        annotated_frame, objects = detect_frame(
            frame,
            confidence=confidence,
            show_boxes=show_boxes,
            show_tracking=show_tracking,
            tracker=tracker
        )

        success, buffer = cv2.imencode(
            ".jpg",
            annotated_frame
        )

        if not success:
            raise ValueError("Unable to encode detected frame.")

        encoded_result = base64.b64encode(
            buffer
        ).decode("utf-8")

        return jsonify({
            "success": True,
            "image": encoded_result,
            "objects": objects,
            "total_objects": len(objects)
        })

    except Exception as error:
        print("WEBCAM DETECTION ERROR:", error)

        return jsonify({
            "success": False,
            "error": str(error)
        }), 500


# --------------------------------------------------
# UPLOADED VIDEO DETECTION
# --------------------------------------------------

@app.route("/api/detect-video", methods=["POST"])
def detect_uploaded_video():

    input_path = None
    output_path = None

    try:
        if "video" not in request.files:
            return jsonify({
                "success": False,
                "error": "No video file received."
            }), 400

        video = request.files["video"]

        if not video.filename:
            return jsonify({
                "success": False,
                "error": "Please select a video."
            }), 400

        if not allowed_file(video.filename):
            return jsonify({
                "success": False,
                "error": "Unsupported video format."
            }), 400

        original_name = secure_filename(video.filename)

        extension = original_name.rsplit(".", 1)[1].lower()

        unique_name = uuid.uuid4().hex

        input_path = os.path.join(
            UPLOAD_FOLDER,
            f"{unique_name}.{extension}"
        )

        output_filename = f"{unique_name}_detected.mp4"

        output_path = os.path.join(
            OUTPUT_FOLDER,
            output_filename
        )

        video.save(input_path)

        confidence, show_boxes, show_tracking, tracker = (
            get_detection_settings(request.form)
        )

        statistics = process_video(
            input_path,
            output_path,
            confidence=confidence,
            show_boxes=show_boxes,
            show_tracking=show_tracking,
            tracker=tracker
        )

        return jsonify({
            "success": True,
            "message": "Video detection completed successfully.",
            "video_url": f"/outputs/{output_filename}",
            "statistics": statistics
        })

    except Exception as error:
        print("VIDEO DETECTION ERROR:", error)

        if output_path and os.path.exists(output_path):
            os.remove(output_path)

        return jsonify({
            "success": False,
            "error": str(error)
        }), 500

    finally:
        if input_path and os.path.exists(input_path):
            os.remove(input_path)


# --------------------------------------------------
# SERVE PROCESSED VIDEOS
# --------------------------------------------------

@app.route("/outputs/<path:filename>")
def serve_output(filename):
    return send_from_directory(
        OUTPUT_FOLDER,
        filename
    )


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

@app.route("/api/status")
def system_status():
    return jsonify({
        "success": True,
        "application": "VisionTrack AI",
        "model": "YOLO11n",
        "status": "online"
    })


# --------------------------------------------------
# RUN APPLICATION
# --------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
