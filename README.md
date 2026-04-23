<div align="center">

# 🛡️ Redactify

### **Zero-Cloud AI Video Redaction — Built for Enterprises That Can't Afford a Leak.**

[![Version](https://img.shields.io/badge/version-1.0.0-indigo?style=for-the-badge)](https://github.com/Redactify-AI/redactor-desktop/raw/main/src-tauri/target/release/bundle/msi/Redactify_1.0.0_x64_en-US.msi)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=for-the-badge&logo=windows)](https://github.com/Redactify-AI/redactor-desktop/raw/main/src-tauri/target/release/bundle/msi/Redactify_1.0.0_x64_en-US.msi)
[![License](https://img.shields.io/badge/license-Proprietary-red?style=for-the-badge)](./LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built_with-Tauri_v2-24C8D8?style=for-the-badge&logo=tauri)](https://tauri.app)
[![AI Engine](https://img.shields.io/badge/AI-OpenCV_YuNet-green?style=for-the-badge&logo=opencv)](https://opencv.org)

**[📥 Download the Latest Windows Installer (.msi)](https://github.com/Redactify-AI/redactor-desktop/raw/main/src-tauri/target/release/bundle/msi/Redactify_1.0.0_x64_en-US.msi)**

</div>

---

## 📋 Table of Contents

- [About the Project](#-about-the-project)
- [Feature Showcase](#-feature-showcase)
- [System Architecture](#-system-architecture)
- [Getting Started — End Users](#-getting-started--end-users)
- [Development Setup](#-development-setup)
- [Roadmap](#-roadmap)
- [Security & Privacy](#-security--privacy)
- [License](#-license)

---

## 🔍 About the Project

Modern organizations handle footage that contains some of the most sensitive data imaginable — witness testimonies, covert personnel, internal incident recordings, and biometric information subject to GDPR, HIPAA, and CCPA.

The dominant industry solution today is to upload that footage to a third-party SaaS platform. **That is an unacceptable security compromise.**

**Redactify** was engineered to eliminate that risk entirely. It is a fully offline, on-device AI video redaction suite that uses a production-grade computer vision pipeline to automatically detect and blur faces — with zero bytes of your footage ever leaving the machine it runs on.

Designed for **security operations teams, investigative journalists, legal & HR departments, and law enforcement agencies**, Redactify delivers enterprise-grade redaction with a consumer-grade experience.

> **Your footage stays on your hardware. Full stop.**

---

## ✨ Feature Showcase

### 🎬 Live Preview Engine
Rapidly generates a redacted preview frame from your source video. The engine intelligently scans the footage for the first frame containing a detectable face, applies all redaction settings, and renders it to your screen — without touching the full video pipeline. What you see is exactly what you get.

### 🎛️ Debounced Real-Time Controls
Adjust blur intensity and face padding with zero UI lag. A debounce timer fires a new preview render automatically after you release a slider, giving you a tight, responsive feedback loop for dialing in the exact redaction style required.

### 🔷 Dynamic Geometry Masking
Four production-ready redaction shapes, each generated via OpenCV matrix operations and composited with per-pixel alpha masking:

| Shape | Description |
|---|---|
| **Oval** | Soft elliptical mask, follows natural face contours |
| **Circle** | Uniform circular mask, ideal for profile frames |
| **Sharp Box** | Hard rectangular mask, maximum coverage for compliance |
| **Soft Box** | Rounded-corner rectangle with composited edge curves |

### 🔄 Intelligent Dirty State Workflow
A strict state machine governs the entire session. If you adjust any setting after a redaction is rendered, the interface immediately marks the session as **dirty** — disabling the export button and requiring a fresh render. This prevents the most common enterprise error: accidentally exporting footage redacted with stale parameters.

### 👁️ A/B Comparison Toggle
A **"Show Original"** toggle swaps between the redacted preview and the unmodified source video in real time, enabling frame-accurate comparison to confirm complete identity redaction before export.

### 🔒 Secure Temp-Based Processing
All intermediate redaction renders are written exclusively to the operating system's hidden temporary directory (`%TEMP%`). The final export uses a **native OS Save Dialog**, ensuring the final file is written only to a path explicitly chosen by the operator. No shadow copies. No residual files.

---

## 🏗️ System Architecture

Redactify uses a three-tier local architecture. No network calls are made at any point during video processing.

```text
┌─────────────────────────────────────────────────────────────────┐
│                        React UI Layer                           │
│          (TypeScript · Tailwind CSS · Lucide Icons)             │
│                                                                 │
│   invoke("redact_video")            listen("redaction-progress")│
└──────────────────────┬──────────────────────────────┬───────────┘
                       │  Tauri IPC Bridge (async)    │
                       ▼                              │
┌─────────────────────────────────────────────────────┴───────────┐
│                     Rust / Tauri Core                           │
│         (Command Handlers · Event Emitter · File APIs)          │
│                                                                 │
│  - Resolves bundled engine binary path at runtime               │
│  - Spawns Python engine as a managed child process              │
│  - Streams stdout → parses PROGRESS:/STATUS: → emits events     │
└──────────────────────┬──────────────────────────────────────────┘
                       │  std::process::Command (piped stdout)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Python AI / Video Engine                        │
│      (PyInstaller Bundle · OpenCV · YuNet · FFmpeg · NumPy)     │
│                                                                 │
│  Preview Mode:  Scan → Detect → Apply Mask → Write JPEG         │
│  Full Mode:     Threaded Read → AI Inference → Optical Flow     │
│                 → Alpha Smoothing → Threaded Write → FFmpeg Mux │
└─────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- The Python engine is compiled into a single self-contained `cli.exe` binary via **PyInstaller**, with the YuNet ONNX model embedded. No Python installation is required on end-user machines.
- The Rust layer uses **threaded stdout streaming** so the UI receives real-time progress events (`PROGRESS:42`, `STATUS:Encoding...`) without blocking the main thread.
- The video pipeline uses **asymmetric baseline padding** (15% width, 25% head-top, 10% chin-bottom) on top of the user-defined padding ratio to guarantee complete face and hairline coverage even at the minimum slider position.

---

## 🚀 Getting Started — End Users

> **No installation of Python, Rust, or any development tools is required.**

### Windows Installation

1. Click the [**📥 Download the Latest Windows Installer (.msi)**](https://github.com/Redactify-AI/redactor-desktop/raw/main/src-tauri/target/release/bundle/msi/Redactify_1.0.0_x64_en-US.msi) link.
2. Run the downloaded `.msi` file and follow the on-screen prompts.
3. Launch **Redactify** from the Start Menu or Desktop shortcut.

### Quick Workflow

```text
1. Click the landing zone to open a video file (.mp4, .mov)
2. Review the AI-generated live redaction preview
3. Adjust Blur Shape, Blur Area Size, and Blur Intensity as needed
4. Click "Start Redaction" and monitor real-time progress
5. Click "Save Redacted Video As..." and choose a secure export path
```

---

## 🛠️ Development Setup

### Prerequisites

Ensure the following are installed and available on your `PATH`:

| Tool | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org) | `≥ 20.19` | Required for Vite/React toolchain |
| [Rust](https://rustup.rs) | `stable` | Install via `rustup` |
| [Python](https://www.python.org) | `3.10 – 3.12` | For the engine virtual environment |
| [FFmpeg](https://ffmpeg.org) | Any stable | Place `ffmpeg.exe` in `engine/` |

### 1. Clone the Repository

```bash
git clone https://github.com/Redactify-AI/redactor-desktop.git
cd redactify
```

### 2. Install Frontend Dependencies

```bash
npm install
```

### 3. Set Up the Python Engine

```bash
cd engine
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install opencv-python numpy pyinstaller
```

### 4. Build the Python Engine Binary

```bash
# Inside engine/ with venv active
pyinstaller cli.spec
# Outputs to engine/dist/cli.exe
```

### 5. Run in Development Mode

```bash
# From the project root
npm run tauri dev
```

The Tauri development server will compile the Rust backend, launch the Vite dev server, and open the application window with hot-module reloading enabled.

### 6. Build for Production

```bash
npm run tauri build
# Outputs MSI and NSIS installers to src-tauri/target/release/bundle/
```

---

## 🗺️ Roadmap

The following features are planned for **Redactify v1.1**:

- [ ] **Batch Processing** — Queue and process multiple video files in a single session with a unified progress dashboard.
- [ ] **Selective Face Tracking** — Click to include or exclude specific detected individuals from redaction. Allow-list known personnel, redact everyone else.
- [ ] **Manual Object Tracking** — Draw custom redaction zones for non-face objects (license plates, documents, screens) with frame-locked tracking.
- [ ] **Export Presets** — Save and recall redaction configurations (shape, blur strength, padding) as named presets for repeatable compliance workflows.
- [ ] **Audit Log** — Generate a tamper-evident JSON log for each processed file, recording input hash, settings applied, and output hash for chain-of-custody documentation.

---

## 🔐 Security & Privacy

Redactify is architected from the ground up for maximum operational security:

- **100% Offline Processing.** The application makes zero outbound network requests during any phase of video analysis or redaction. Your footage never leaves the host machine.
- **No Telemetry.** Redactify contains no analytics, crash reporters, or usage tracking of any kind.
- **Ephemeral Intermediate Files.** All in-progress render artifacts are written to the OS `%TEMP%` directory and removed upon session end. Only the file you explicitly export persists.
- **Native OS Dialogs.** File selection and export paths are handled exclusively via the operating system's native dialog APIs, preventing path injection or unauthorized access.
- **Locally Bundled AI Model.** The YuNet face detection model (ONNX format) is compiled directly into the application binary. No model downloads occur at runtime.

---

## 📄 License

Redactify is proprietary software. All rights reserved.

Unauthorized copying, distribution, modification, or use of this software, in whole or in part, is strictly prohibited without express written permission from the authors.

For licensing or enterprise inquiries, please open an issue on this repository.

---

<div align="center">

**Built with precision for organizations where privacy is non-negotiable.**

*Redactify — Secure. Local. Uncompromising.*

</div>