
import cv2
import numpy as np
from ultralytics import YOLO


# Load YOLO11n model
MODEL_PATH = "yolo11n.pt"

model = YOLO(MODEL_PATH)


def detect_frame(
    frame,
    confidence=0.35,
    show_boxes=True,
    show_tracking=True,
    tracker="bytetrack.yaml"
):
    """
    Detect and track objects in a single frame.
    Used for webcam detection.
    """

    results = model.track(
        frame,
        persist=True,
        conf=confidence,
        tracker=tracker,
        verbose=False
    )

    result = results[0]

    annotated_frame = result.plot(
        boxes=show_boxes,
        labels=show_tracking
    )

    objects = []

    if result.boxes is not None:
        boxes = result.boxes

        for index, box in enumerate(boxes):
            class_id = int(box.cls[0])
            class_name = model.names[class_id]
            score = float(box.conf[0])

            track_id = None

            if boxes.id is not None:
                track_id = int(boxes.id[index])

            coordinates = box.xyxy[0].tolist()

            objects.append({
                "class": class_name,
                "confidence": round(score * 100, 2),
                "track_id": track_id,
                "box": [round(float(value), 2) for value in coordinates]
            })

    return annotated_frame, objects


def process_video(
    input_path,
    output_path,
    confidence=0.35,
    show_boxes=True,
    show_tracking=True,
    tracker="bytetrack.yaml"
):
    """
    Process an uploaded video and save its annotated output.
    """

    cap = cv2.VideoCapture(input_path)

    if not cap.isOpened():
        raise ValueError("Unable to open the uploaded video.")

    fps = cap.get(cv2.CAP_PROP_FPS)

    if not fps or fps <= 0:
        fps = 25.0

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if width <= 0 or height <= 0:
        cap.release()
        raise ValueError("Invalid video dimensions.")

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")

    writer = cv2.VideoWriter(
        output_path,
        fourcc,
        fps,
        (width, height)
    )

    if not writer.isOpened():
        cap.release()
        raise ValueError("Unable to create the output video.")

    total_frames = 0
    detected_objects = {}
    unique_track_ids = set()

    try:
        while True:
            success, frame = cap.read()

            if not success:
                break

            results = model.track(
                frame,
                persist=True,
                conf=confidence,
                tracker=tracker,
                verbose=False
            )

            result = results[0]

            annotated_frame = result.plot(
                boxes=show_boxes,
                labels=show_tracking
            )

            writer.write(annotated_frame)
            total_frames += 1

            if result.boxes is not None:
                for index, box in enumerate(result.boxes):
                    class_id = int(box.cls[0])
                    class_name = model.names[class_id]

                    detected_objects[class_name] = (
                        detected_objects.get(class_name, 0) + 1
                    )

                    if result.boxes.id is not None:
                        unique_track_ids.add(
                            int(result.boxes.id[index])
                        )

    finally:
        cap.release()
        writer.release()

    return {
        "total_frames": total_frames,
        "detected_objects": detected_objects,
        "unique_tracks": len(unique_track_ids)
    }
