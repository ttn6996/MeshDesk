pub mod device;
pub mod error;
pub mod session;

pub use device::{ConnectionMode, ConnectionType, Device, DeviceStatus};
pub use error::{MeshDeskError, Result};
pub use session::{SessionInfo, SessionState};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_creation() {
        let dev = Device::new("MD-1234-5678", "Host-A", "Windows 11");
        assert_eq!(dev.id, "MD-1234-5678");
        assert_eq!(dev.status, DeviceStatus::Offline);
    }

    #[test]
    fn test_session_creation() {
        let sess = SessionInfo::new("MD-1234-5678", "Host-A", ConnectionType::Lan, true);
        assert!(sess.is_simulated);
        assert_eq!(sess.state, SessionState::Connecting);
    }
}
