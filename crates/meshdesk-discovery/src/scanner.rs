use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::{Duration, Instant};

use chrono::Utc;
use log::{debug, info};

use crate::DiscoveredNode;

#[cfg(windows)]
#[link(name = "iphlpapi")]
extern "system" {
    fn SendARP(dest_ip: u32, src_ip: u32, p_mac_addr: *mut u8, phy_addr_len: *mut u32) -> u32;
}

/// Discovered raw device on the local network (via ARP or TCP probe)
#[derive(Debug, Clone)]
pub struct LanDeviceProbe {
    pub ip: Ipv4Addr,
    pub mac_address: Option<String>,
    pub ping_ms: u32,
    pub is_meshdesk_host: bool,
}

pub struct LanScanner;

impl LanScanner {
    /// Detect the primary local IPv4 address of the active network interface
    pub fn get_local_ipv4() -> Option<Ipv4Addr> {
        let s = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
        s.connect("8.8.8.8:80").ok()?;
        match s.local_addr().ok()?.ip() {
            IpAddr::V4(ipv4) => Some(ipv4),
            _ => None,
        }
    }

    /// Scan the current local /24 subnet for active devices
    pub async fn scan_subnet(timeout_ms: u64) -> Vec<DiscoveredNode> {
        let local_ip = match Self::get_local_ipv4() {
            Some(ip) => ip,
            None => {
                debug!("Could not detect local IPv4 address for LAN scan");
                return Vec::new();
            }
        };

        let octets = local_ip.octets();
        info!(
            "Scanning LAN subnet {}.{}.{}.0/24...",
            octets[0], octets[1], octets[2]
        );

        let mut tasks = Vec::with_capacity(254);
        for host in 1..=254 {
            let target_ip = Ipv4Addr::new(octets[0], octets[1], octets[2], host);
            tasks.push(tokio::spawn(async move {
                Self::probe_host(target_ip, local_ip, Duration::from_millis(timeout_ms)).await
            }));
        }

        let mut discovered = Vec::new();
        for task in tasks {
            if let Ok(Some(probe)) = task.await {
                let is_gateway = probe.ip.octets()[3] == 1;
                let is_self = probe.ip == local_ip;

                let (device_name, os_info) = if is_self {
                    (
                        "This PC (Current Machine)".to_string(),
                        "Windows PC (Host)".to_string(),
                    )
                } else if is_gateway {
                    (
                        "Network Gateway (Wi-Fi Router)".to_string(),
                        "Router / Access Point".to_string(),
                    )
                } else if probe.is_meshdesk_host {
                    (
                        format!("MeshDesk Host ({})", probe.ip),
                        "Windows (MeshDesk Host Ready)".to_string(),
                    )
                } else {
                    (
                        format!("Wi-Fi Device ({})", probe.ip),
                        "Active LAN Device (Wi-Fi)".to_string(),
                    )
                };

                let device_id = if let Some(ref mac) = probe.mac_address {
                    let clean = mac.replace(':', "").to_uppercase();
                    if clean.len() >= 8 {
                        format!("LAN-{}-{}", &clean[0..4], &clean[4..8])
                    } else {
                        format!("LAN-{}", clean)
                    }
                } else {
                    format!("LAN-{:04}-{:04}", octets[2], probe.ip.octets()[3])
                };

                let node = DiscoveredNode {
                    device_id,
                    device_name,
                    ip_address: probe.ip.to_string(),
                    listen_port: 48120,
                    os_info,
                    status: "online".to_string(),
                    last_seen: Utc::now().to_rfc3339(),
                    latency_ms: Some(probe.ping_ms.max(1)),
                    last_seen_epoch_secs: Utc::now().timestamp() as u64,
                };
                discovered.push(node);
            }
        }

        info!(
            "LAN scan completed. Discovered {} active devices.",
            discovered.len()
        );
        discovered
    }

    /// Probe a single IP via SendARP (Windows) or TCP connect (non-Windows fallback)
    pub async fn probe_host(
        target_ip: Ipv4Addr,
        local_ip: Ipv4Addr,
        timeout: Duration,
    ) -> Option<LanDeviceProbe> {
        let (is_alive, mac, ping_ms) = Self::arp_ping(target_ip, local_ip, timeout).await?;
        if !is_alive {
            return None;
        }

        // Quick check if MeshDesk host port 48120 is open
        let is_meshdesk = Self::check_port_open(target_ip, 48120, Duration::from_millis(150)).await;

        Some(LanDeviceProbe {
            ip: target_ip,
            mac_address: mac,
            ping_ms,
            is_meshdesk_host: is_meshdesk,
        })
    }

    #[cfg(windows)]
    async fn arp_ping(
        target_ip: Ipv4Addr,
        _local_ip: Ipv4Addr,
        _timeout: Duration,
    ) -> Option<(bool, Option<String>, u32)> {
        tokio::task::spawn_blocking(move || {
            let start = Instant::now();
            let dest_u32 = u32::from_ne_bytes(target_ip.octets());
            let mut mac_buf = [0u8; 6];
            let mut mac_len: u32 = 6;

            let res =
                unsafe { SendARP(dest_u32, 0, mac_buf.as_mut_ptr(), &mut mac_len as *mut u32) };

            let elapsed_ms = start.elapsed().as_millis().min(9999) as u32;

            if res == 0 && mac_len >= 6 {
                let mac_str = format!(
                    "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
                    mac_buf[0], mac_buf[1], mac_buf[2], mac_buf[3], mac_buf[4], mac_buf[5]
                );
                Some((true, Some(mac_str), elapsed_ms.max(1)))
            } else {
                None
            }
        })
        .await
        .ok()?
    }

    #[cfg(not(windows))]
    async fn arp_ping(
        target_ip: Ipv4Addr,
        _local_ip: Ipv4Addr,
        timeout: Duration,
    ) -> Option<(bool, Option<String>, u32)> {
        let start = Instant::now();
        for &port in &[80, 443, 22, 48120] {
            let addr = SocketAddr::new(IpAddr::V4(target_ip), port);
            if tokio::time::timeout(timeout, tokio::net::TcpStream::connect(addr))
                .await
                .is_ok()
            {
                let elapsed_ms = start.elapsed().as_millis().min(9999) as u32;
                return Some((true, None, elapsed_ms.max(1)));
            }
        }
        None
    }

    async fn check_port_open(target_ip: Ipv4Addr, port: u16, timeout: Duration) -> bool {
        let addr = SocketAddr::new(IpAddr::V4(target_ip), port);
        match tokio::time::timeout(timeout, tokio::net::TcpStream::connect(addr)).await {
            Ok(Ok(_)) => true,
            _ => false,
        }
    }
}
