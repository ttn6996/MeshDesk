// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use meshdesk_app::AppState;
use meshdesk_core::Device;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.contains(&"--cli".to_string()) {
        run_cli_diagnostics();
    } else {
        meshdesk_app::run();
    }
}

fn run_cli_diagnostics() {
    env_logger::init();
    println!("=======================================================");
    println!("              MeshDesk Desktop Engine v0.1.0           ");
    println!("=======================================================");

    let state = AppState::new_in_memory().expect("In-memory initialization failed");
    let identity = state.get_local_identity();

    println!("Local Device ID: {}", identity.device_id);
    println!("Public Key:      {}", identity.public_key_b64);

    let mut sample_device =
        Device::new("MD-8192-3021", "Engineering-Workstation", "Windows 11 x64");
    sample_device.tags = vec!["lab".into(), "primary".into()];
    sample_device.is_favorite = true;
    state
        .save_device(sample_device)
        .expect("Failed to save device");

    let devices = state.list_devices().expect("Failed to list devices");
    println!("Persistent Devices in Registry: {}", devices.len());
    for d in &devices {
        println!(" - [{}] {} ({})", d.id, d.name, d.os_info);
    }

    let session = state.simulate_connect(&devices[0].id, &devices[0].name);
    println!(
        "Sample Session Initialized: ID={} Target={} State={:?} Simulated={}",
        session.session_id, session.target_device_name, session.state, session.is_simulated
    );

    println!("Engine initialized successfully.");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_state_crud() {
        let state = AppState::new_in_memory().unwrap();
        let dev = Device::new("MD-1234-5678", "Host-1", "Windows 11");
        state.save_device(dev).unwrap();

        let list = state.list_devices().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "MD-1234-5678");

        let deleted = state.delete_device("MD-1234-5678").unwrap();
        assert!(deleted);
        assert_eq!(state.list_devices().unwrap().len(), 0);
    }
}
