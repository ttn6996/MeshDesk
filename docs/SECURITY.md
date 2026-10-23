# MeshDesk Security Model & Guidelines

Security is an architectural prerequisite in MeshDesk. Remote desktop and multi-computer administration software is an attractive target for malicious actors; therefore, MeshDesk applies defensive-in-depth principles throughout the software stack.

---

## 1. Core Security Guarantees

1. **Explicit User Consent**: Unattended background access is never enabled by default. Active control sessions must display prominent indicators on both controller and target machines.
2. **Zero Plaintext Passwords**: Passwords and session secrets are never sent across the network in plaintext, nor are they logged or persisted in unencrypted form.
3. **No Central Master Keys**: The signaling service acts solely as an encrypted message broker. It has zero visibility into session payloads and cannot decrypt peer traffic.
4. **Immediate Revocation**: The host computer retains absolute control. The local user can terminate any active remote session with a single keystroke or click.
5. **Least Privilege**: The desktop client executes as a standard user process and never requests automatic elevation or alters Windows security settings.

---

## 2. Authentication & Credential Architecture

```
Controller                                                     Target Host
    |                                                               |
    |  1. Initiate Connection Request (Target Device ID)            |
    |-------------------------------------------------------------->|
    |                                                               |
    |  2. Cryptographic Salt & Random Nonce (Challenge)            |
    |<--------------------------------------------------------------|
    |                                                               |
    |  3. Auth Proof: HMAC-SHA256(PBKDF2(Password, Salt), Nonce)   |
    |-------------------------------------------------------------->|
    |                                                               |
    |  4. Verification & Short-Lived Session Token                  |
    |<--------------------------------------------------------------|
```

### 2.1 Device Identity
- Each installation generates an **Ed25519** cryptographic keypair stored in the OS-protected user directory.
- The public key is hashed using BLAKE3 and encoded into a user-friendly, collision-resistant identifier (e.g., `MD-8291-0394`).
- The private key signs initial connection negotiations, preventing identity spoofing.

### 2.2 Access Credentials
- **Temporary Access Passwords**: Generated using cryptographically secure pseudorandom number generators (`rand::rngs::OsRng`). These expire automatically after a configurable idle duration or when rotated.
- **Challenge-Response**: Controller authenticates using a zero-knowledge challenge-response scheme derived from PBKDF2-HMAC-SHA256 or Argon2id. The raw password never leaves the controller's memory.
- **Session Tokens**: Successful authorization issues a short-lived token (default: 1 hour lifetime) bound strictly to the verified peer's public key.

---

## 3. Defense Against Network Attacks

| Threat Vector | Mitigation Strategy |
| :--- | :--- |
| **Brute Force & Dictionary Attacks** | Exponential backoff and IP/Device ID rate-limiting after 3 consecutive failed authentication attempts. Temporary lockouts enforced host-side. |
| **Replay Attacks** | Unique nonces and timestamps in every handshake frame. Handshake messages older than 30 seconds are immediately rejected. |
| **Man-in-the-Middle (MITM)** | TLS 1.3 for LAN connections and signaling WebSocket. Peer-to-peer WebRTC media streams are protected with DTLS-SRTP. |
| **Unauthorized Input Injection** | Session manager validates that input events originate strictly from the verified, authenticated session channel. |
| **Buffer Overflow / Exploitation** | Safe Rust memory guarantees for all network decoding, framing, and packet parsing. Strict message length limits (e.g. 64 KB framing caps). |

---

## 4. Operational & Logging Policies

- **Secret Redaction**: Structured log formatters strip fields marked as `sensitive`, `password`, `token`, or `private_key` before emitting log events.
- **Local Database Protection**: SQLite database operates with restricted Windows DACLs ensuring only the current Windows user profile has read/write access.
- **Telemetry Transparency**: No telemetry, analytics, or behavioral tracking is bundled. All network endpoints are explicitly configurable via settings.
