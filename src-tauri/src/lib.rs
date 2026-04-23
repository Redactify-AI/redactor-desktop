use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use tauri::{AppHandle, Emitter};

#[tauri::command]
fn redact_video(app: AppHandle, input: String, output: String) -> Result<(), String> {
    // We assume the executable is compiled to engine/dist/cli.exe
    // In production, you would bundle it via tauri.conf.json externalBin and use tauri_plugin_shell
    let cwd = std::env::current_dir().unwrap_or_default();
    let exe_path_1 = cwd.join("engine").join("dist").join("cli.exe");
    let exe_path_2 = cwd.join("..").join("engine").join("dist").join("cli.exe");
    
    let target_exe = if exe_path_1.exists() {
        exe_path_1
    } else if exe_path_2.exists() {
        exe_path_2
    } else {
        return Err(format!("Could not find cli.exe. Looked in {:?} and {:?}", exe_path_1, exe_path_2));
    };
    
    let mut child = Command::new(target_exe)
        .arg("--input")
        .arg(&input)
        .arg("--output")
        .arg(&output)
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn engine: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    
    // Spawn a thread to read stdout without blocking the main Tauri command thread
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                if line.starts_with("PROGRESS:") {
                    if let Some(percent_str) = line.strip_prefix("PROGRESS:") {
                        if let Ok(percent) = percent_str.parse::<u8>() {
                            let _ = app.emit("redaction-progress", percent);
                        }
                    }
                } else if line.starts_with("STATUS:") {
                    if let Some(status) = line.strip_prefix("STATUS:") {
                        let _ = app.emit("redaction-status", status);
                    }
                }
            }
        }
        let _ = child.wait();
        let _ = app.emit("redaction-status", "DONE");
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![redact_video])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
