# MeshDesk System Architecture

## 1. System Overview

MeshDesk is a Windows-first desktop application engineered to unify multiple computers into a cohesive, secure multi-PC workspace. Unlike traditional point-to-point remote access utilities, MeshDesk models connected computers as persistent workspace nodes that can be simultaneously organized, monitored, and accessed through a unified interface.

```
+-----------------------------------------------------------------------------------+
|                               MeshDesk Desktop Shell                              |
|  +-----------------------------------------------------------------------------+  |
|  |                 Frontend (React + TypeScript + Vite + Tailwind)              |  |
|  |  [Workspace View]   [Device Sidebar]   [Session Tabs]   [Settings Panel]    |  |
|  +-----------------------------------------------------------------------------+  |
|                                       | Tauri 2 IPC                               |
|  +------------------------------------+----------------------------------------+  |
|  |                              Rust Backend                                   |  |
|  |  +---------------------+  +---------------------+  +---------------------+  |  |
|  |  |  meshdesk-identity  |  |   meshdesk-storage  |  |   meshdesk-session  |  |  |
|  |  |  - Node ID (Ed25519)|  |   - SQLite (Rusqlite|  |   - Session FSM     |  |  |
|  |  |  - Fingerprinting   |  |   - Device Metadata |  |   - Token lifecycle |  |  |
|  |  +---------------------+  +---------------------+  +---------------------+  |  |
|  |  +---------------------+  +---------------------+  +---------------------+  |  |
|  |  |  meshdesk-discovery |  |  meshdesk-signaling |  |   meshdesk-stream   |  |  |
|  |  |  - LAN UDP Broadcast|  |  - WS Client/Server |  |   - DXGI Desktop Dup|  |  |
|  |  |  - Opt-in Announce  |  |  - SDP / ICE Traver |  |   - Low-latency I/O |  |  |
|  |  +---------------------+  +---------------------+  +---------------------+  |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Architectural Boundaries & Modular Crates

The codebase is structured as a modular Cargo workspace coupled with a high-performance React/TypeScript frontend:

| Crate / Subsystem | Path | Primary Responsibility |
| :--- | :--- | :--- |
| **`meshdesk-core`** | `crates/meshdesk-core` | Shared domain models, status enums, configuration types, and cross-cutting error definitions. |
| **`meshdesk-identity`** | `crates/meshdesk-identity` | Stable machine identity generation, Ed25519 keypair management, collision-resistant device ID encoding (e.g. `MD-XXXX-XXXX`), and hardware fingerprint hashing. |
| **`meshdesk-storage`** | `crates/meshdesk-storage` | Embedded SQLite engine managing persistent device metadata, address history, user preferences, and schema migrations. |
| **`meshdesk-protocol`** | `crates/meshdesk-protocol` | Versioned framing, handshake messages, challenge-response serialization, and bounded message validators. |
| **`meshdesk-discovery`** | `crates/meshdesk-discovery` | Secure local network discovery over UDP broadcast / mDNS with strict opt-in consent and local subnet binding. |
| **`meshdesk-signaling`** | `crates/meshdesk-signaling` | WebSocket-based rendezvous and connection broker enabling NAT traversal and session negotiation without handling raw video streams. |
| **`meshdesk-session`** | `crates/meshdesk-session` | Cryptographic session negotiation, challenge-response password authentication, short-lived tokens, and state lifecycle. |
| **`meshdesk-desktop`** | `crates/meshdesk-desktop` | Tauri 2 desktop shell, Windows system integration, IPC bridges, and desktop event loop. |
| **`frontend`** | `frontend/` | React 19/18 + TypeScript + Vite workspace UI, session tabs, responsive device grid, and connection management. |

---

## 3. Communication & Connection Topologies

MeshDesk implements two distinct connection pipelines, ensuring maximum speed on local intranets while providing reliable internet connectivity across arbitrary NATs.

```
+------------------------------------------------------------------------+
|                               PATH 1: LAN                              |
|  Host A (Controller) <==== Direct Authenticated TCP / TLS ====> Host B |
|  - Discovery via localized UDP announcements (opt-in)                  |
|  - Zero internet dependency or external relay requirement              |
+------------------------------------------------------------------------+

+------------------------------------------------------------------------+
|                            PATH 2: INTERNET                            |
|  Host A                 Signaling Service                 Host B      |
|    |                           |                            |         |
|    |--- Register / Presence -->|                            |         |
|    |                           |<--- Register / Presence ---|         |
|    |--- Connect (Device ID) -->|                            |         |
|    |                           |--- Offer / Challenge ----->|         |
|    |                           |<-- Response / Candidate ---|         |
|    |<-- ICE Candidates --------|                            |         |
|    |                                                        |         |
|    |<==== Direct Encrypted P2P (STUN Traversal) ===========>|         |
|    |                           OR                           |         |
|    |<==== Encrypted Fallback Relay (TURN) =================>|         |
+------------------------------------------------------------------------+
```

### 3.1 LAN Direct Connection
1. Discovery broadcasts local peer availability when enabled by the user.
2. Direct TCP connection initiated to target device IP on configured port (default `48120`).
3. Mutual handshake and Ed25519 signature exchange.
4. Session challenge validated before screen access is granted.

### 3.2 Internet Signaling & ICE Traversal
1. Both peers maintain an authenticated, outbound WebSocket connection to the signaling service using their public Device ID.
2. Connection negotiation proceeds via WebRTC-compatible SDP offer/answer exchange.
3. STUN queries resolve external reflex host candidates.
4. In symmetric NAT / strict firewall scenarios, traffic seamlessly falls back through an encrypted TURN relay.

---

## 4. Multi-PC Workspace Engine

The defining capability of MeshDesk is the **Multi-PC Workspace**:
- **Independent Session State**: Each remote PC connection runs on an isolated async worker task with dedicated I/O queues.
- **Input Routing Isolation**: Mouse and keyboard events are strictly scoped to the active session tab. Inactive sessions continue receiving screen updates while input processing is suspended.
- **Resource Throttling**: Background sessions automatically down-throttle their frame rate (e.g. from 60 FPS to 5 FPS) to conserve local CPU, GPU, and bandwidth.
- **Workspace Layout Engine**: Users can group computers into logical teams (e.g., "Build Farm", "Lab Workstations", "Home Office") with persistent metadata.

---

## 5. Storage & Persistence Strategy

- **Database**: SQLite embedded via `rusqlite` with WAL (Write-Ahead Logging) mode enabled for concurrency.
- **Schema Migrations**: Linear versioned migrations tracked in a `_schema_versions` table.
- **Sensitive Data Rules**:
  - Remote device temporary access passwords are **never written to disk**.
  - Local private keys (Ed25519) are stored in user-scoped application directories with restricted file permissions (`ACL` on Windows).
  - Screen capture buffers and remote frames are transient in-memory buffers; zero disk caching.
