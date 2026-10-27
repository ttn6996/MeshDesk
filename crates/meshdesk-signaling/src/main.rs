use meshdesk_signaling::{SignalingServer, DEFAULT_SIGNALING_PORT};
use std::net::SocketAddr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let port: u16 = std::env::var("MESHDESK_SIGNALING_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_SIGNALING_PORT);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("=======================================================");
    println!("        MeshDesk Signaling & Relay Broker v0.1.0       ");
    println!("=======================================================");
    println!("Listening on: ws://{}", addr);
    println!("Ready for WebRTC SDP exchange and P2P rendezvous.");

    let server = SignalingServer::new(addr);
    server.run().await?;

    Ok(())
}
