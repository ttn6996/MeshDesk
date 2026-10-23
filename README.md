# MeshDesk 🖥️🔗

> **Unified Multi-PC Workspace for Windows 10 & 11**

MeshDesk transforms multiple physical or virtual computers into one unified, responsive desktop working environment. It combines the seamless, password-authenticated connectivity of modern remote-access tools with a persistent, workspace-centric interface tailored for multi-computer workflows.

---

## Key Features

- 🏢 **Multi-PC Workspace**: Organize computers into unified workspaces, view system health, and switch across active machines in session tabs.
- ⚡ **Dual Connection Modes**:
  - **LAN Direct Mode**: Zero-cloud direct peer connection over the local network with automatic, opt-in discovery.
  - **Internet P2P & Relay**: Robust connection negotiation via WebRTC, STUN NAT traversal, and automatic TURN fallback.
- 🔒 **Defense-in-Depth Security**:
  - Ed25519 cryptographic machine identity.
  - Zero plaintext password transmission (Argon2id/PBKDF2 challenge-response).
  - Short-lived session authorization tokens.
  - Explicit consent and visible host-side indicators for active remote control.
- 🚀 **Modern Windows Architecture**:
  - Rust high-performance engine for protocol handling, networking, and Windows system calls.
  - Tauri 2 desktop shell for minimal memory footprint and fast startup.
  - React 19/18 + TypeScript + Vite frontend for responsive UI/UX.
  - Embedded SQLite database for local device metadata persistence.

---

## Repository Structure

```
MeshDesk/
├── Cargo.toml                  # Cargo workspace definition
├── crates/
│   ├── meshdesk-core/          # Core domain models, states, and error types
│   ├── meshdesk-identity/      # Device ID generation, Ed25519 identity, hardware hash
│   ├── meshdesk-storage/       # SQLite persistence, device metadata & migration engine
│   ├── meshdesk-protocol/      # Wire protocol frames, serialization, and handshake FSM
│   ├── meshdesk-discovery/     # Opt-in LAN discovery over UDP broadcast
│   ├── meshdesk-signaling/     # Standalone WebSocket signaling server & client
│   └── meshdesk-app/           # Tauri 2 Windows desktop application & IPC bridge
├── frontend/                   # React + TypeScript + Vite frontend application
│   ├── src/
│   │   ├── components/         # Workspace, Sidebar, DeviceCard, Dialogs, Settings
│   │   ├── services/           # Device & storage service abstractions (real & mock)
│   │   └── types/              # TypeScript domain types & interfaces
│   └── package.json
└── docs/
    ├── ARCHITECTURE.md         # Subsystem architecture & network topologies
    ├── ROADMAP.md              # Milestone definitions and acceptance criteria
    ├── SECURITY.md             # Cryptographic handshake, threat mitigations
    └── PROTOCOL.md             # Wire protocol framing & packet schemas
```

---

## Prerequisites & Toolchains (Windows 10/11 x64)

1. **Node.js**: v20+ (Node v22+ recommended).
2. **Rust Toolchain**: `stable-x86_64-pc-windows-gnu` or `stable-x86_64-pc-windows-msvc`.
3. **Microsoft Edge WebView2**: Pre-installed on Windows 10 & 11.

---

## Build and Run Instructions

### 1. Build and Test Rust Backend Crates
```powershell
# Run unit and integration tests across all workspace crates
cargo test --workspace

# Check workspace crates without linking
cargo check --workspace
```

### 2. Frontend Development & Build
```powershell
cd frontend

# Install frontend dependencies
npm install

# Start Vite hot-reloading development server
npm run dev

# Run TypeScript typechecks and production build
npm run build
```

### 3. Run Tauri Desktop Application
```powershell
# From repository root or frontend
npm run tauri dev
```

---

## Project Status & Milestones

- [x] **Milestone 0: Repository & Architecture Audit**: Complete specifications, toolchain verification, and documentation.
- [x] **Milestone 1: Desktop Foundation**: Core Cargo workspace crates, persistent SQLite storage, responsive React workspace dashboard, device sidebar, connect dialog, and settings view.
- [ ] **Milestone 2: Device Identity & LAN Connectivity**
- [ ] **Milestone 3: Real Remote Desktop Session**
- [ ] **Milestone 4: Internet Connectivity & NAT Traversal**
- [ ] **Milestone 5: Multi-PC Workspace Production Experience**

---

## License

Proprietary / MeshDesk Team. All rights reserved.
