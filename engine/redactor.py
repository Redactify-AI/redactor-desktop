import cv2
import numpy as np
import os
import urllib.request
import time
import threading
from queue import Queue

def setup_yunet():
    model_path = os.path.join(os.path.dirname(__file__), "face_detection_yunet.onnx")
    if not os.path.exists(model_path):
        print("⬇️ Downloading YuNet Deep Learning Model...")
        url = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
        urllib.request.urlretrieve(url, model_path)
    return model_path

# --- LAYER 1: ASYNCHRONOUS I/O CLASSES ---

class ThreadedVideoReader:
    def __init__(self, path, queue_size=10):
        self.stream = cv2.VideoCapture(path)
        self.Q = Queue(maxsize=queue_size)
        self.stopped = False
        
        # Extract properties
        self.width = int(self.stream.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.stream.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.fps = int(self.stream.get(cv2.CAP_PROP_FPS))
        self.total_frames = int(self.stream.get(cv2.CAP_PROP_FRAME_COUNT))

    def start(self):
        t = threading.Thread(target=self.update, args=())
        t.daemon = True
        t.start()
        return self

    def update(self):
        while not self.stopped:
            if not self.Q.full():
                grabbed, frame = self.stream.read()
                if not grabbed:
                    self.stop()
                    return
                self.Q.put(frame)
            else:
                time.sleep(0.005) # Prevent CPU thrashing

    def read(self):
        return self.Q.get()

    def more(self):
        # Return True if there are still frames in the queue OR the stream is active
        return not self.stopped or not self.Q.empty()

    def stop(self):
        self.stopped = True
        self.stream.release()


class ThreadedVideoWriter:
    def __init__(self, path, fps, width, height, queue_size=10):
        self.writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (width, height))
        self.Q = Queue(maxsize=queue_size)
        self.stopped = False

    def start(self):
        t = threading.Thread(target=self.update, args=())
        t.daemon = True
        t.start()
        return self

    def update(self):
        while not self.stopped or not self.Q.empty():
            if not self.Q.empty():
                frame = self.Q.get()
                self.writer.write(frame)
            else:
                time.sleep(0.005)
        self.writer.release()

    def write(self, frame):
        self.Q.put(frame)

    def stop(self):
        self.stopped = True

# --- LAYER 2-4: THE PROCESSING ENGINE ---

def process_video_async(input_path, output_path):
    print("🚀 Initializing Redactify Async Engine...")
    model_path = setup_yunet()
    
    # Initialize the background threads
    reader = ThreadedVideoReader(input_path).start()
    
    # Safety check if video failed to open
    if reader.width == 0:
        print(f"❌ Error: Could not open {input_path}")
        reader.stop()
        return

    writer = ThreadedVideoWriter(output_path, reader.fps, reader.width, reader.height).start()

    ai_width = 320
    scale_factor = reader.width / ai_width
    ai_height = int(reader.height / scale_factor)

    detector = cv2.FaceDetectorYN.create(
        model=model_path, config="", input_size=(ai_width, ai_height),
        score_threshold=0.65, nms_threshold=0.3, top_k=5000
    )
    
    start_time = time.time()
    count = 0
    ai_interval = 10 
    
    old_gray = None
    p0 = None 
    current_boxes = [] 
    smoothed_boxes = []

    lk_params = dict(winSize=(15, 15), maxLevel=2,
                     criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 0.03))

    print(f"📦 Buffering I/O streams and applying async redaction...")

    # Main thread now ONLY does math. Zero waiting on the hard drive.
    while reader.more():
        frame = reader.read()
        if frame is None: break

        small_frame = cv2.resize(frame, (ai_width, ai_height))
        frame_gray = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)

        # AI Keyframe
        if count % ai_interval == 0 or p0 is None or len(p0) == 0:
            _, faces = detector.detect(small_frame)
            current_boxes = []
            anchor_points = []
            
            if faces is not None:
                for face in faces:
                    x, y, w, h = map(int, face[:4])
                    if w > (ai_width * 0.05):
                        current_boxes.append([x, y, w, h])
                        center_x, center_y = x + w//2, y + h//2
                        anchor_points.append([[center_x, center_y]])
            
            if anchor_points:
                p0 = np.float32(anchor_points)
                old_gray = frame_gray.copy()
            else:
                p0 = None

        # Optical Flow
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

        # Dual-Alpha Smoothing
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
                alpha_pos = 0.25 
                alpha_size = 0.05 
                
                sm_x = int(alpha_pos * nx + (1 - alpha_pos) * sx)
                sm_y = int(alpha_pos * ny + (1 - alpha_pos) * sy)
                sm_w = int(alpha_size * nw + (1 - alpha_size) * sw)
                sm_h = int(alpha_size * nh + (1 - alpha_size) * sh)
                new_smoothed_boxes.append([sm_x, sm_y, sm_w, sm_h])
            else:
                new_smoothed_boxes.append([nx, ny, nw, nh])

        smoothed_boxes = new_smoothed_boxes

        # Soft Oval Frosted Transformation
        for (x, y, w, h) in smoothed_boxes:
            X, Y = int(x * scale_factor), int(y * scale_factor)
            W, H = int(w * scale_factor), int(h * scale_factor)
            
            pad_x = int(W * 0.20)
            pad_y = int(H * 0.20)
            
            x1 = max(0, X - pad_x)
            y1 = max(0, Y - pad_y - int(H * 0.15)) 
            x2 = min(reader.width, X + W + pad_x)
            y2 = min(reader.height, Y + H + pad_y)

            if x2 > x1 and y2 > y1:
                roi = frame[y1:y2, x1:x2]
                box_w, box_h = x2 - x1, y2 - y1
                
                small_roi = cv2.resize(roi, (max(1, box_w // 4), max(1, box_h // 4)))
                blurred_small = cv2.blur(small_roi, (15, 15))
                frosted = cv2.resize(blurred_small, (box_w, box_h), interpolation=cv2.INTER_LINEAR)
                
                mask = np.zeros((box_h, box_w), dtype=np.uint8)
                cx, cy = box_w // 2, box_h // 2
                axes = (int(box_w * 0.45), int(box_h * 0.45))
                cv2.ellipse(mask, (cx, cy), axes, 0, 0, 360, 255, -1)
                
                final_blend = np.where(mask[:,:,np.newaxis] == 255, frosted, roi)
                frame[y1:y2, x1:x2] = final_blend

        # Push finished frame to the background writer thread
        writer.write(frame)
        count += 1
        
        if count % 30 == 0:
            avg_fps = count / (time.time() - start_time)
            print(f"📈 Frame {count}/{reader.total_frames} | Speed: {avg_fps:.1f} FPS")

    # Clean up threads
    print("⏳ Emptying the write buffer...")
    reader.stop()
    writer.stop()
    
    # Wait for the writer thread to finish draining the queue
    while not writer.Q.empty():
        time.sleep(0.1)
        
    print(f"\n✅ Async test finished in {time.time()-start_time:.1f}s")

if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    test_input = os.path.join(current_dir, "test_video.mp4")
    test_output = os.path.join(current_dir, "final_blur_test.mp4")
    if os.path.exists(test_input): process_video_async(test_input, test_output)