import argparse
import sys
import os
import time
import subprocess
from redactor import ThreadedVideoReader, ThreadedVideoWriter, setup_yunet
import cv2
import numpy as np

def mux_audio(original_path, silent_path, final_path):
    print("STATUS:Encoding H.264 and Restoring Audio...", flush=True)
    command = [
        "ffmpeg", "-y",
        "-i", silent_path,
        "-i", original_path,
        "-c:v", "libx264", 
        "-preset", "fast",
        "-c:a", "aac",
        "-map", "0:v:0",
        "-map", "1:a:0",
        final_path
    ]
    try:
        kwargs = {"stdout": subprocess.DEVNULL, "stderr": subprocess.STDOUT, "check": True}
        if os.name == 'nt':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
        subprocess.run(command, **kwargs)
        if os.path.exists(silent_path):
            os.remove(silent_path) 
    except Exception as e:
        print(f"ERROR: FFmpeg encoding failed. Make sure ffmpeg is installed. {e}", flush=True)


def run_production_pipeline(input_path, output_path, padding_ratio=0.20, blur_strength=15):
    print("STATUS:Initializing Engine...", flush=True)
    model_path = setup_yunet()
    
    reader = ThreadedVideoReader(input_path).start()
    if reader.width == 0:
        print("ERROR:Could not open video stream.", flush=True)
        sys.exit(1)

    temp_silent_path = output_path.replace(".mp4", "_temp.mp4")
    writer = ThreadedVideoWriter(temp_silent_path, reader.fps, reader.width, reader.height).start()

    ai_width = 320
    scale_factor = reader.width / ai_width
    ai_height = int(reader.height / scale_factor)

    detector = cv2.FaceDetectorYN.create(
        model=model_path, config="", input_size=(ai_width, ai_height),
        score_threshold=0.65, nms_threshold=0.3, top_k=5000
    )
    
    count = 0
    ai_interval = 8
    
    old_gray = None
    p0 = None 
    current_boxes = [] 
    smoothed_boxes = []
    
    lk_params = dict(winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 0.03))

    while reader.more():
        frame = reader.read()
        if frame is None: break

        small_frame = cv2.resize(frame, (ai_width, ai_height))
        frame_gray = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)

        if count % ai_interval == 0 or p0 is None or len(p0) == 0:
            _, faces = detector.detect(small_frame)
            current_boxes = []
            anchor_points = []
            if faces is not None:
                for face in faces:
                    x, y, w, h = map(int, face[:4])
                    if w > (ai_width * 0.05):
                        current_boxes.append([x, y, w, h])
                        anchor_points.append([[x + w//2, y + h//2]])
            if anchor_points:
                p0 = np.float32(anchor_points)
                old_gray = frame_gray.copy()
            else:
                p0 = None
        else:
            p1, st, err = cv2.calcOpticalFlowPyrLK(old_gray, frame_gray, p0, None, **lk_params)
            if p1 is not None:
                good_new = p1[st == 1]
                good_old = p0[st == 1]
                new_boxes = []
                for i, (new, old) in enumerate(zip(good_new, good_old)):
                    dx, dy = new[0] - old[0], new[1] - old[1]
                    x, y, w, h = current_boxes[i]
                    new_boxes.append([int(x + dx), int(y + dy), w, h])
                current_boxes = new_boxes
                p0 = good_new.reshape(-1, 1, 2)
                old_gray = frame_gray.copy()
            else:
                p0 = None 

        new_smoothed_boxes = []
        unmatched_smoothed = smoothed_boxes.copy()
        for (nx, ny, nw, nh) in current_boxes:
            best_match_idx = -1
            min_dist = float('inf')
            for i, (sx, sy, sw, sh) in enumerate(unmatched_smoothed):
                dist = ((nx + nw/2) - (sx + sw/2))**2 + ((ny + nh/2) - (sy + sh/2))**2
                if dist < (nw)**2 and dist < min_dist:  
                    min_dist = dist
                    best_match_idx = i

            if best_match_idx != -1:
                sx, sy, sw, sh = unmatched_smoothed.pop(best_match_idx)
                alpha_pos, alpha_size = 0.25, 0.05 
                new_smoothed_boxes.append([
                    int(alpha_pos * nx + (1 - alpha_pos) * sx),
                    int(alpha_pos * ny + (1 - alpha_pos) * sy),
                    int(alpha_size * nw + (1 - alpha_size) * sw),
                    int(alpha_size * nh + (1 - alpha_size) * sh)
                ])
            else:
                new_smoothed_boxes.append([nx, ny, nw, nh])
        smoothed_boxes = new_smoothed_boxes

        for (x, y, w, h) in smoothed_boxes:
            X, Y = int(x * scale_factor), int(y * scale_factor)
            W, H = int(w * scale_factor), int(h * scale_factor)
            
            # THE PARAMETER INJECTION: Padding controls the bounding box size
            pad_x, pad_y = int(W * padding_ratio), int(H * padding_ratio)
            
            # We keep the 0.15 height bias to ensure hair is covered, scaled by padding
            x1, y1 = max(0, X - pad_x), max(0, Y - pad_y - int(H * 0.15)) 
            x2, y2 = min(reader.width, X + W + pad_x), min(reader.height, Y + H + pad_y)

            if x2 > x1 and y2 > y1:
                roi = frame[y1:y2, x1:x2]
                box_w, box_h = x2 - x1, y2 - y1
                small_roi = cv2.resize(roi, (max(1, box_w // 4), max(1, box_h // 4)))
                
                # THE PARAMETER INJECTION: Controls the strength of the frosted glass
                blurred_small = cv2.blur(small_roi, (blur_strength, blur_strength))
                frosted = cv2.resize(blurred_small, (box_w, box_h), interpolation=cv2.INTER_LINEAR)
                
                mask = np.zeros((box_h, box_w), dtype=np.uint8)
                # Because the ellipse radius is a percentage of box_w, it automatically scales 
                # up perfectly when the user increases the padding parameter!
                cv2.ellipse(mask, (box_w // 2, box_h // 2), (int(box_w * 0.45), int(box_h * 0.45)), 0, 0, 360, 255, -1)
                frame[y1:y2, x1:x2] = np.where(mask[:,:,np.newaxis] == 255, frosted, roi)

        writer.write(frame)
        count += 1
        
        if count % 10 == 0:
            percent = int((count / reader.total_frames) * 100)
            print(f"PROGRESS:{percent}", flush=True)

    reader.stop()
    writer.stop()
    while not writer.Q.empty(): time.sleep(0.1)
    
    mux_audio(input_path, temp_silent_path, output_path)
    
    print("PROGRESS:100", flush=True)
    print("STATUS:COMPLETE", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Redactify Engine CLI")
    parser.add_argument("--input", required=True, help="Path to input video")
    parser.add_argument("--output", required=True, help="Path to save final secure video")
    
    # --- NEW EXPOSED PARAMETERS ---
    parser.add_argument("--padding", type=float, default=0.20, help="Ratio of padding around the face (e.g. 0.1 to 1.0)")
    parser.add_argument("--blur", type=int, default=15, help="Strength of the blur effect (e.g. 5 to 50)")
    
    args = parser.parse_args()
    run_production_pipeline(args.input, args.output, padding_ratio=args.padding, blur_strength=args.blur)