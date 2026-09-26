// The Rust side of Thoughts is deliberately tiny: the three official plugins the
// frontend uses (fs, http, dialog) and two commands that keep the OpenAI key in the
// macOS Keychain instead of web storage.

const KEYCHAIN_SERVICE: &str = "Thoughts";

/// Read a secret. `Ok(None)` when no item exists yet. `async` moves the blocking Keychain
/// call (and its possible permission prompt) off the IPC/main thread.
#[tauri::command(async)]
fn keychain_get(account: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Write a secret; an empty value deletes the item.
#[tauri::command(async)]
fn keychain_set(account: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &account).map_err(|e| e.to_string())?;
    if value.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![keychain_get, keychain_set])
        // Keep the window on the app's own origin. External links go through the opener
        // plugin; a main-frame navigation elsewhere (e.g. right-click → Open Link) is denied.
        // tauri::Builder has no on_navigation hook, so it rides on a tiny inline plugin,
        // whose hook Tauri runs for every webview.
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("navigation-guard")
                .on_navigation(|_webview, url| {
                    let host = url.host_str().unwrap_or("");
                    url.scheme() == "tauri"
                        || host == "tauri.localhost"
                        || (cfg!(debug_assertions) && host == "localhost")
                })
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running Thoughts");
}
