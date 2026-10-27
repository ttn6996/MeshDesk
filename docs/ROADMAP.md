# MeshDesk Engineering Roadmap

This document outlines the six architectural milestones required to deliver a production-grade, secure Windows Multi-PC Workspace application.

---

## Milestone 0: Repository & Architecture Audit (Current)
- [x] Analyze build tools, toolchains, and environment constraints.
- [x] Configure Rust toolchain with native Windows GNU linker support.
- [x] Initialize Git repository with security-focused `.gitignore` and `.env.example`.
- [x] Document core architectural blueprints, security model, and protocol specifications.
- **Deliverables**:
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `docs/ROADMAP.md`
  - `docs/SECURITY.md`
  - `docs/PROTOCOL.md`

---

## Milestone 1: Desktop Foundation & Workspace UI (Complete)
- [x] Initialize Cargo workspace (`crates/meshdesk-core`, `crates/meshdesk-identity`, `crates/meshdesk-storage`, `crates/meshdesk-protocol`, `crates/meshdesk-app`).
- [x] Integrate Tauri 2 desktop shell configuration and IPC command bridges (`src-tauri` -> `crates/meshdesk-app`).
- [x] Initialize React 19 + TypeScript + Vite frontend with Tailwind CSS and Lucide icons.
- [x] Implement desktop navigation:
  - Multi-PC Workspace Dashboard with quick stats and system health.
  - Device sidebar with status badges and search filtering.
  - Main workspace canvas supporting grid and list layouts.
  - Connect-by-ID dialog (Device ID input, access password, connection mode).
  - Settings panel (General, Network, Security, Diagnostics & Node Identity).
- [x] Implement persistent local device metadata using SQLite (`meshdesk-storage`) with automatic schema version migrations.
- [x] Implement persistent Ed25519 node identity key generation and file storage.
- [x] Establish hybrid service abstractions (`HybridDeviceService` bridging Tauri IPC with graceful web dev fallback).
- **Acceptance Criteria Verification**:
  - Desktop client configuration and entry point build cleanly (`cargo check --workspace`, `cargo test --workspace`).
  - Device addition, renaming, tagging, and deletion persist across app restarts via SQLite.
  - Zero TypeScript linter or compiler errors (`strict: true`).
  - Zero mock or fake data: workspace starts completely clean, displaying strictly real discovered nodes and user-registered devices.

---

## Milestone 2: Device Identity & LAN Connectivity (Complete)
- [x] Implement cryptographic node identity (Ed25519 keypair generation and secure storage via `crates/meshdesk-identity`).
- [x] Implement formatted, collision-resistant Device IDs (`MD-XXXX-XXXX`).
- [x] Implement LAN discovery service (`crates/meshdesk-discovery`):
  - UDP broadcast announcements on local subnet on port 48121 with opt-in user toggle (`enable_lan_discovery`).
  - Periodic heartbeat announcements and live node cache.
  - Latency measurement and stale node pruning.
- [x] Implement direct peer authentication and challenge-response over LAN TCP (`crates/meshdesk-app` host listener on port 48120, BLAKE3 challenge-response authentication).
- [x] Clear diagnostics for offline hosts, invalid passwords, and protocol mismatches.
- **Acceptance Criteria Verification**:
  - Two Windows instances discover each other on LAN without cloud dependency (`DiscoveredNode` emitted to frontend).
  - Devices are uniquely identified even when local DHCP IP addresses change.
  - Invalid credentials yield structured error responses.

---

## Milestone 3: Real Remote Desktop Session (LAN) (Complete)
- [x] Implement screen capture pipeline (`crates/meshdesk-stream`):
  - Win32 GDI `BitBlt` capture engine with top-down 32-bit BGRA to 24-bit RGB pixel extraction.
  - Real-time JPEG frame compression via `jpeg-encoder` at target ~24 FPS.
  - Deterministic fallback test pattern for headless or locked sessions.
- [x] Implement real-time streaming pipeline over authenticated binary transport:
  - `crates/meshdesk-protocol` with 10MB frames, `FrameCodec`, `VideoFrame` with sequence, timestamp, and dimensions.
- [x] Render remote desktop canvas in session window with responsive coordinate scaling:
  - Frontend HTML5 `<canvas>` rendering incoming frames via Tauri `session-frame` event stream.
- [x] Implement mouse and keyboard input handling with least-privilege Windows input injection:
  - `crates/meshdesk-stream` `InputInjector` using Win32 `SendInput` (`MouseMove` with normalized $[0.0, 1.0]$ coordinates, `MouseDown`, `MouseUp`, `MouseWheel`, `KeyDown`, `KeyUp`).
- [x] Implement host consent enforcement:
  - Remote input events are strictly guarded by atomic `allow_remote_control` host setting.
- [x] Implement session controls:
  - Explicit disconnect button, real-time FPS counter, resolution display, host consent indicator, full-screen toggle.
- **Acceptance Criteria Verification**:
  - Real-time interactive control of an authorized Windows host on LAN.
  - Host consent indicator displayed on HUD and enforced on host.
  - Clean shutdown of individual or all sessions on demand.

---

## Milestone 4: Internet Connectivity & NAT Traversal (Complete)
- [x] Build standalone and embedded `meshdesk-signaling` server (WebSocket broker on port 48122 with presence registry, message routing, and standalone CLI binary `meshdesk-signaling-server`).
- [x] Implement online device presence and registration (`SignalingMessage::Register`, `DeviceOnline`, `DeviceOffline`).
- [x] Implement WebRTC SDP offer/answer exchange via signaling (`SignalingMessage::Offer`, `SignalingMessage::Answer`).
- [x] Integrate STUN-based reflexive IP candidate resolution (`SignalingMessage::IceCandidate`).
- [x] Implement TURN relay fallback transport architecture (`SignalingMessage::RelayData`).
- [x] Enforce zero-knowledge authentication: access passwords and secrets are never transmitted in plaintext or stored on signaling brokers.
- **Acceptance Criteria Verification**:
  - Peers on distinct networks register with signaling broker and exchange SDP/ICE candidates.
  - Direct P2P negotiation with fallback relay capability.
  - Zero plaintext credentials over the wire.

---

## Milestone 5: Multi-PC Workspace Production Experience (Complete)
- [x] Multi-session tab management allowing simultaneous connections to $N$ computers with fast tab switching.
- [x] Input routing isolation ensuring keyboard/mouse events only reach the active focused tab.
- [x] Dynamic frame throttling for background sessions (active tab tracking via `cmd_set_active_session_tab` to conserve CPU and network).
- [x] Global emergency disconnect ("Kill All Remote Sessions" via `cmd_kill_all_sessions`).
- [x] Bidirectional clipboard synchronization (`CF_UNICODETEXT` Win32 API + `Message::ClipboardSync`) with one-click manual sync.
- [x] Granular permission modes: instant runtime switching between Full Control and View-Only (`cmd_set_session_permission`).
- **Acceptance Criteria Verification**:
  - User seamlessly navigates between multiple concurrent remote sessions.
  - Zero cross-talk or leaked input between session tabs.
  - Immediate clean shutdown of individual or all sessions on demand via emergency kill switch.
