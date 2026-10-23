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

## Milestone 1: Desktop Foundation & Workspace UI
- [ ] Initialize Cargo workspace (`crates/meshdesk-core`, `crates/meshdesk-identity`, `crates/meshdesk-storage`, `crates/meshdesk-protocol`, `crates/meshdesk-desktop`).
- [ ] Initialize React 18/19 + TypeScript + Vite frontend with Tailwind CSS and Lucide icons.
- [ ] Implement desktop navigation:
  - Multi-PC Workspace Dashboard with quick stats and system health.
  - Device sidebar with status badges (Online, Busy, Offline, Discovered).
  - Main workspace canvas supporting grid and list layouts.
  - Connect-by-ID dialog (Device ID input, access password, connection mode).
  - Settings panel (General, Network, Security, About).
- [ ] Implement persistent local device metadata using SQLite (`meshdesk-storage`).
- [ ] Establish simulated service abstractions (clearly demarcating mock vs. live connections).
- **Acceptance Criteria**:
  - Desktop client launches and renders responsively.
  - Device addition, renaming, tagging, and deletion persist across app restarts.
  - Zero TypeScript linter or compiler errors (`strict: true`).
  - No misleading claims regarding simulated vs live connection states.

---

## Milestone 2: Device Identity & LAN Connectivity
- [ ] Implement cryptographic node identity (Ed25519 keypair generation and secure storage).
- [ ] Implement formatted, collision-resistant Device IDs (e.g. `MD-8392-1049`).
- [ ] Implement LAN discovery service:
  - UDP broadcast announcements on local subnet with opt-in user toggle.
  - Periodic heartbeat ping/pong.
  - Clear firewall traversal advice and subnet filtering.
- [ ] Implement direct peer authentication and challenge-response over LAN TCP.
- [ ] Clear diagnostics for offline hosts, invalid passwords, and protocol mismatches.
- **Acceptance Criteria**:
  - Two Windows instances discover each other on the same LAN without cloud dependency.
  - Devices are uniquely identified even when local DHCP IP addresses change.
  - Invalid credentials yield explicit, structured error responses.

---

## Milestone 3: Real Remote Desktop Session (LAN)
- [ ] Implement screen capture pipeline using Windows Desktop Duplication API (DXGI / Windows.Graphics.Capture).
- [ ] Implement efficient screen update diffing / hardware-accelerated video frame encoding.
- [ ] Implement real-time streaming pipeline over authenticated transport.
- [ ] Render remote desktop canvas in session window with responsive coordinate scaling.
- [ ] Implement mouse and keyboard input handling with least-privilege Windows input injection (`SendInput`).
- [ ] Implement session controls: explicit disconnect button, latency/FPS counter, pause, full-screen toggle.
- **Acceptance Criteria**:
  - Real-time interactive control of an authorized Windows host on LAN.
  - Clear on-screen notification on host when remote control is active.
  - Immediate session termination upon host user revocation.

---

## Milestone 4: Internet Connectivity & NAT Traversal
- [ ] Build standalone `meshdesk-signaling` server (WebSocket broker).
- [ ] Implement online device presence and registration.
- [ ] Implement WebRTC SDP offer/answer exchange via signaling.
- [ ] Integrate STUN-based reflexive IP candidate resolution.
- [ ] Implement TURN relay fallback for symmetric NATs and restricted enterprise firewalls.
- [ ] Enforce rate-limiting, challenge-response session tokens, and replay protection.
- **Acceptance Criteria**:
  - Peers on distinct external networks establish direct or relayed connections.
  - Direct P2P is preferred; relay is used automatically when P2P fails.
  - Access passwords are never transmitted in plaintext or stored on signaling servers.

---

## Milestone 5: Multi-PC Workspace Production Experience
- [ ] Multi-session tab management allowing simultaneous connections to $N$ computers.
- [ ] Input routing isolation ensuring keyboard/mouse events only reach the active tab.
- [ ] Dynamic frame throttling for background sessions to conserve system resources.
- [ ] Persistent workspace grouping (teams, projects, environments).
- [ ] Global emergency disconnect ("Kill All Remote Sessions").
- [ ] Optional opt-in clipboard synchronization with granular permission toggles.
- **Acceptance Criteria**:
  - User seamlessly navigates between multiple concurrent remote sessions.
  - Zero cross-talk or leaked input between session tabs.
  - Clean shutdown of individual or all sessions on demand.
