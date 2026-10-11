// Android shell shares the existing frontend. No desktop Node sidecar or secrets IPC.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("GBoheme mobile runtime failed");
}
