# MeshDesk 🖥️🔗

> **Unified Multi-PC Workspace for Windows 10 & 11**

MeshDesk transforms multiple physical or virtual computers into one unified, responsive desktop working environment. It combines the password-authenticated connectivity of modern remote-access software with a persistent, workspace-centric interface tailored for multi-computer workflows.

---

## Current Architecture & Component Boundaries

```
MeshDesk/
├── .github/workflows/ci.yml    # Continuous Integration (Rust tests/fmt & Frontend build)
├── Cargo.toml                  # Root Cargo workspace manifest
├── package.json                # Root scripts (delegates npm run tauri/dev/build to frontend)
├── src-tauri/                  # Tauri 2 Windows desktop shell (`meshdesk-desktop`)
├── crates/
│   ├── meshdesk-core/          # Shared domain models, enums (Device, Session, AppSettings)
│   ├── meshdesk-identity/      # Ed25519 identity, BLAKE3 device ID derivation (MD-XXXX-XXXX)
│   ├── meshdesk-storage/       # Embedded SQLite (WAL mode, schema migrations 1 & 2)
│   ├── meshdesk-protocol/      # Binary length-prefixed wire protocol (64KB bound, magic MDSK)
│   └── meshdesk-app/           # Tauri 2 desktop application engine & IPC command handlers
├── frontend/                   # React 19 + TypeScript + Vite + Tailwind CSS desktop UI
│   ├── src/
│   │   ├── components/         # WorkspaceView, Sidebar, DeviceCard, SessionView, Dialogs, Settings
│   │   ├── services/           # HybridDeviceService (bridges Tauri IPC with fallback to local store)
│   │   └── types/              # TypeScript domain types mirroring Rust models
│   └── package.json
└── docs/
    ├── ARCHITECTURE.md         # Subsystem architecture & dual connection topology
    ├── ROADMAP.md              # Milestones 0 through 5 roadmap & criteria
    ├── SECURITY.md             # Threat model, credential boundaries, handshake FSM
    └── PROTOCOL.md             # Wire framing, message schemas, size bounds
```

---

## Toolchain & Environment Requirements (Windows 10/11 x64)

1. **Node.js**: v20+ (Node v22 LTS recommended).
2. **Rust Toolchain**: `stable-x86_64-pc-windows-gnu` (with MinGW binutils: `gcc`, `ld`, `dlltool`) or `stable-x86_64-pc-windows-msvc`.
3. **Microsoft Edge WebView2**: Pre-installed on Windows 10 & 11.

---

## Build and Run Instructions

### 1. Build and Test Rust Backend Crates
```powershell
# Set toolchain and ASCII sysroot path (if running with MinGW GNU toolchain)
$env:Path = "D:\APP\w64devkit\bin;D:\Users_Huong\.cargo\bin;" + $env:Path
$env:RUSTFLAGS = "--sysroot D:\Users_Huong\.rustup\toolchains\stable-x86_64-pc-windows-gnu"

# Check code formatting
cargo fmt --all -- --check

# Check workspace crates
cargo check --workspace

# Run all unit tests across all workspace crates
cargo test --workspace

# Run the desktop engine in CLI diagnostics mode
cargo run --bin meshdesk-app -- --cli
```

### 2. Frontend Development & Build
```powershell
cd frontend

# Install frontend dependencies
npm install

# Run TypeScript strict checks and Vite production build
npm run build

# Start hot-reloading development server in browser
npm run dev
```

### 3. Run Tauri 2 Desktop Shell
```powershell
cd frontend

# Launch desktop window with Tauri 2 and live hot reload
npm run tauri dev
```

---

## Verified Features & Milestone Status

### Milestone 1: Desktop Foundation (Verified & Complete)
- [x] **Tauri 2 Desktop Shell**: Embedded Windows application window with native system integration.
- [x] **Rust IPC Bridge**:
  - `cmd_get_local_identity`: Returns persistent Ed25519 node identity and formatted ID (`MD-XXXX-XXXX`).
  - `cmd_list_devices`: Queries persistent SQLite database.
  - `cmd_save_device`: Creates and updates device records.
  - `cmd_delete_device`: Deletes device records.
  - `cmd_get_app_settings` / `cmd_save_app_settings`: Reads/writes settings to SQLite (`app_settings` table).
- [x] **Persistent Storage**: SQLite database (`%APPDATA%/MeshDesk/meshdesk.db`) with automatic schema version migrations.
- [x] **Cryptographic Identity Storage**: Ed25519 private seed stored at `%APPDATA%/MeshDesk/identity.key`.
- [x] **Productivity Workspace UI**:
  - Main workspace dashboard with real device statistics.
  - Left sidebar with workspace filters and search.
  - Device cards with truthful status indicators (no fake online metrics).
  - Connect-by-ID dialog with format validation.
  - Add & Edit device dialog with persistent tag/notes support.
  - Settings panel with network, LAN discovery toggles, and security consent options.
  - Multi-session tab container ready for video streaming.

### Upcoming Milestones
- [ ] **Milestone 2: Device Identity & LAN Connectivity** (UDP broadcast discovery on port 48121, direct TCP handshake on 48120).
- [ ] **Milestone 3: Real Remote Desktop Session** (DXGI Desktop Duplication capture, SendInput injection).
- [ ] **Milestone 4: Internet Connectivity & NAT Traversal** (Signaling server, STUN/TURN WebRTC relay).
- [ ] **Milestone 5: Multi-PC Workspace Production Experience** (Concurrent live streams, input sandboxing).

---

## Known Limitations

1. **Remote Display & Input**: In Milestone 1, the session viewport provides an interactive state container and tab manager. Live desktop pixel streaming via DXGI and remote input injection via `SendInput` will be implemented in Milestone 3.
2. **LAN Discovery**: In Milestone 1, devices in the registry are stored locally. Live network broadcasting and automated peer discovery across subnets will be activated in Milestone 2.
3. **Non-ASCII Windows Usernames**: On environments where Windows usernames contain diacritics and GNU toolchains are utilized, a directory junction mapping to an ASCII path is recommended for GNU `ld.exe`.

---

## License

Proprietary / MeshDesk Engineering Team. All rights reserved.
