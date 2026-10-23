use thiserror::Error;

#[derive(Error, Debug)]
pub enum MeshDeskError {
    #[error("Device not found: {0}")]
    DeviceNotFound(String),

    #[error("Invalid device ID format: {0}")]
    InvalidDeviceId(String),

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Session error: {0}")]
    SessionError(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Protocol error: {0}")]
    ProtocolError(String),

    #[error("Rate limited: retry after {0} seconds")]
    RateLimited(u64),

    #[error("Operation canceled")]
    Canceled,
}

pub type Result<T> = std::result::Result<T, MeshDeskError>;
