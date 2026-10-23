use blake3::Hasher;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use meshdesk_core::{MeshDeskError, Result};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityInfo {
    pub device_id: String,
    pub public_key_b64: String,
}

pub struct NodeIdentity {
    signing_key: SigningKey,
    verifying_key: VerifyingKey,
    device_id: String,
}

impl NodeIdentity {
    /// Generate a fresh cryptographic node identity using OS entropy
    pub fn generate() -> Self {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key = signing_key.verifying_key();
        let device_id = Self::derive_device_id(&verifying_key);

        Self {
            signing_key,
            verifying_key,
            device_id,
        }
    }

    /// Load from raw 32-byte seed
    pub fn from_seed(seed: &[u8; 32]) -> Self {
        let signing_key = SigningKey::from_bytes(seed);
        let verifying_key = signing_key.verifying_key();
        let device_id = Self::derive_device_id(&verifying_key);

        Self {
            signing_key,
            verifying_key,
            device_id,
        }
    }

    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    pub fn verifying_key(&self) -> &VerifyingKey {
        &self.verifying_key
    }

    pub fn public_key_bytes(&self) -> [u8; 32] {
        self.verifying_key.to_bytes()
    }

    pub fn public_key_hex(&self) -> String {
        hex_encode(&self.verifying_key.to_bytes())
    }

    /// Derives user-friendly formatted device ID from public key: MD-XXXX-XXXX
    pub fn derive_device_id(verifying_key: &VerifyingKey) -> String {
        let mut hasher = Hasher::new();
        hasher.update(b"meshdesk-device-id-v1:");
        hasher.update(&verifying_key.to_bytes());
        let hash = hasher.finalize();
        let bytes = hash.as_bytes();

        // Convert first 8 bytes into 8 numeric/uppercase characters: MD-DDDD-DDDD
        let p1 = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) % 10000;
        let p2 = u32::from_be_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) % 10000;

        format!("MD-{:04}-{:04}", p1, p2)
    }

    /// Validates device ID syntax: MD-DDDD-DDDD
    pub fn validate_device_id(id: &str) -> bool {
        let parts: Vec<&str> = id.split('-').collect();
        if parts.len() != 3 || parts[0] != "MD" {
            return false;
        }
        parts[1].len() == 4
            && parts[1].chars().all(|c| c.is_ascii_digit())
            && parts[2].len() == 4
            && parts[2].chars().all(|c| c.is_ascii_digit())
    }

    /// Sign an arbitrary challenge/payload
    pub fn sign(&self, message: &[u8]) -> [u8; 64] {
        self.signing_key.sign(message).to_bytes()
    }

    /// Verify signature with verifying key
    pub fn verify_signature(
        verifying_key: &VerifyingKey,
        message: &[u8],
        signature_bytes: &[u8; 64],
    ) -> Result<()> {
        let signature = Signature::from_bytes(signature_bytes);
        verifying_key
            .verify(message, &signature)
            .map_err(|e| MeshDeskError::AuthenticationFailed(format!("Signature invalid: {e}")))
    }

    pub fn info(&self) -> IdentityInfo {
        IdentityInfo {
            device_id: self.device_id.clone(),
            public_key_b64: self.public_key_hex(),
        }
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        write!(&mut s, "{:02x}", b).unwrap();
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_identity_generation_and_validation() {
        let identity = NodeIdentity::generate();
        let id = identity.device_id();
        assert!(NodeIdentity::validate_device_id(id));
        assert!(id.starts_with("MD-"));

        let msg = b"MeshDesk challenge authentication 2026";
        let sig = identity.sign(msg);
        assert!(NodeIdentity::verify_signature(identity.verifying_key(), msg, &sig).is_ok());
    }

    #[test]
    fn test_deterministic_seed() {
        let seed = [7u8; 32];
        let id1 = NodeIdentity::from_seed(&seed);
        let id2 = NodeIdentity::from_seed(&seed);
        assert_eq!(id1.device_id(), id2.device_id());
        assert_eq!(id1.public_key_hex(), id2.public_key_hex());
    }

    #[test]
    fn test_invalid_device_id() {
        assert!(!NodeIdentity::validate_device_id("invalid"));
        assert!(!NodeIdentity::validate_device_id("MD-12-34"));
        assert!(!NodeIdentity::validate_device_id("MD-123A-4567"));
        assert!(NodeIdentity::validate_device_id("MD-0123-4567"));
    }
}
