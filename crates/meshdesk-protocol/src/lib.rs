use meshdesk_core::{MeshDeskError, Result};
use serde::{Deserialize, Serialize};

pub const PROTOCOL_MAGIC: [u8; 4] = [0x4D, 0x44, 0x53, 0x4B]; // "MDSK"
pub const PROTOCOL_VERSION_MAJOR: u8 = 1;
pub const PROTOCOL_VERSION_MINOR: u8 = 0;
pub const MAX_FRAME_SIZE: usize = 65_536; // 64 KB limit

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Message {
    Hello {
        protocol_version: String,
        client_device_id: String,
        nonce: String,
        timestamp: u64,
    },
    HelloAck {
        protocol_version: String,
        host_device_id: String,
        host_name: String,
        salt: String,
        nonce: String,
    },
    AuthChallengeResponse {
        session_request_id: String,
        auth_proof: String,
        desired_permissions: Vec<String>,
    },
    AuthSuccess {
        session_id: String,
        session_token: String,
        expires_in_seconds: u32,
        granted_permissions: Vec<String>,
    },
    AuthFailure {
        code: String,
        message: String,
        retry_after_secs: u32,
    },
    Ping {
        seq: u64,
        client_timestamp_ms: u64,
    },
    Pong {
        seq: u64,
        echo_timestamp_ms: u64,
    },
    InputEvent {
        session_id: String,
        seq: u64,
        event_type: String,
        x_norm: Option<f32>,
        y_norm: Option<f32>,
        key_code: Option<u32>,
    },
    Disconnect {
        session_id: String,
        reason: String,
    },
}

pub struct FrameCodec;

impl FrameCodec {
    /// Encode protocol message into length-prefixed binary frame
    pub fn encode(msg: &Message) -> Result<Vec<u8>> {
        let payload = serde_json::to_vec(msg)
            .map_err(|e| MeshDeskError::ProtocolError(format!("JSON serialization failed: {e}")))?;

        if payload.len() > MAX_FRAME_SIZE {
            return Err(MeshDeskError::ProtocolError(format!(
                "Payload size {} exceeds max allowed {}",
                payload.len(),
                MAX_FRAME_SIZE
            )));
        }

        let mut frame = Vec::with_capacity(4 + 2 + 4 + payload.len());
        frame.extend_from_slice(&PROTOCOL_MAGIC);
        frame.push(PROTOCOL_VERSION_MAJOR);
        frame.push(PROTOCOL_VERSION_MINOR);
        let len_bytes = (payload.len() as u32).to_be_bytes();
        frame.extend_from_slice(&len_bytes);
        frame.extend_from_slice(&payload);

        Ok(frame)
    }

    /// Decode protocol message from raw binary frame
    pub fn decode(bytes: &[u8]) -> Result<Message> {
        if bytes.len() < 10 {
            return Err(MeshDeskError::ProtocolError("Frame too short for header".into()));
        }

        if bytes[0..4] != PROTOCOL_MAGIC {
            return Err(MeshDeskError::ProtocolError("Invalid magic bytes".into()));
        }

        let major = bytes[4];
        if major != PROTOCOL_VERSION_MAJOR {
            return Err(MeshDeskError::ProtocolError(format!(
                "Incompatible major protocol version: got {major}, expected {PROTOCOL_VERSION_MAJOR}"
            )));
        }

        let len = u32::from_be_bytes([bytes[6], bytes[7], bytes[8], bytes[9]]) as usize;
        if len > MAX_FRAME_SIZE {
            return Err(MeshDeskError::ProtocolError(format!(
                "Frame length {len} exceeds max {MAX_FRAME_SIZE}"
            )));
        }

        if bytes.len() < 10 + len {
            return Err(MeshDeskError::ProtocolError("Frame payload truncated".into()));
        }

        let payload = &bytes[10..10 + len];
        let msg: Message = serde_json::from_slice(payload)
            .map_err(|e| MeshDeskError::ProtocolError(format!("JSON deserialization failed: {e}")))?;

        Ok(msg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_encode_decode_roundtrip() {
        let msg = Message::Hello {
            protocol_version: "1.0.0".into(),
            client_device_id: "MD-1234-5678".into(),
            nonce: "a1b2c3d4".into(),
            timestamp: 1729680000,
        };

        let encoded = FrameCodec::encode(&msg).unwrap();
        assert_eq!(&encoded[0..4], &PROTOCOL_MAGIC);

        let decoded = FrameCodec::decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn test_invalid_magic() {
        let mut bad = vec![0x00, 0x00, 0x00, 0x00, 1, 0, 0, 0, 0, 2];
        bad.extend_from_slice(b"{}");
        assert!(FrameCodec::decode(&bad).is_err());
    }
}
