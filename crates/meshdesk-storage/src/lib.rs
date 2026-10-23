use std::path::Path;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use meshdesk_core::{Device, DeviceStatus, MeshDeskError, Result};
use rusqlite::{params, Connection, OptionalExtension};

pub struct Storage {
    conn: Arc<Mutex<Connection>>,
}

impl Storage {
    /// Open SQLite database at specific file path and run migrations
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let conn = Connection::open(path)
            .map_err(|e| MeshDeskError::StorageError(format!("Failed to open DB: {e}")))?;
        
        let storage = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        storage.initialize_database()?;
        Ok(storage)
    }

    /// Open an in-memory database for fast, isolated unit tests
    pub fn in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()
            .map_err(|e| MeshDeskError::StorageError(format!("Failed to open in-memory DB: {e}")))?;
        
        let storage = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        storage.initialize_database()?;
        Ok(storage)
    }

    fn initialize_database(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // Enable WAL mode for concurrent read/write performance
        let _: String = conn
            .pragma_query_value(None, "journal_mode", |row| row.get(0))
            .unwrap_or_else(|_| "OFF".into());

        conn.execute(
            "CREATE TABLE IF NOT EXISTS _schema_versions (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL,
                description TEXT NOT NULL
            )",
            [],
        )
        .map_err(|e| MeshDeskError::StorageError(format!("Schema init failed: {e}")))?;

        // Migration 1: Devices Table
        let current_version: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM _schema_versions",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if current_version < 1 {
            conn.execute_batch(
                "BEGIN TRANSACTION;
                CREATE TABLE IF NOT EXISTS devices (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    hostname TEXT,
                    status TEXT NOT NULL,
                    os_info TEXT NOT NULL,
                    last_seen TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    notes TEXT,
                    latency_ms INTEGER,
                    is_favorite INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO _schema_versions (version, applied_at, description)
                VALUES (1, datetime('now'), 'Initial devices table schema');
                COMMIT;",
            )
            .map_err(|e| MeshDeskError::StorageError(format!("Migration 1 failed: {e}")))?;
        }

        Ok(())
    }

    pub fn save_device(&self, device: &Device) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let tags_json = serde_json::to_string(&device.tags)
            .map_err(|e| MeshDeskError::StorageError(format!("Failed to serialize tags: {e}")))?;
        let status_str = serde_json::to_string(&device.status).unwrap_or_default();
        let status_trimmed = status_str.trim_matches('"');
        let last_seen_str = device.last_seen.to_rfc3339();

        conn.execute(
            "INSERT INTO devices (id, name, hostname, status, os_info, last_seen, tags, notes, latency_ms, is_favorite)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                hostname = excluded.hostname,
                status = excluded.status,
                os_info = excluded.os_info,
                last_seen = excluded.last_seen,
                tags = excluded.tags,
                notes = excluded.notes,
                latency_ms = excluded.latency_ms,
                is_favorite = excluded.is_favorite",
            params![
                device.id,
                device.name,
                device.hostname,
                status_trimmed,
                device.os_info,
                last_seen_str,
                tags_json,
                device.notes,
                device.latency_ms,
                if device.is_favorite { 1 } else { 0 },
            ],
        )
        .map_err(|e| MeshDeskError::StorageError(format!("Failed to save device: {e}")))?;

        Ok(())
    }

    pub fn get_device(&self, id: &str) -> Result<Option<Device>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, name, hostname, status, os_info, last_seen, tags, notes, latency_ms, is_favorite
                 FROM devices WHERE id = ?1",
            )
            .map_err(|e| MeshDeskError::StorageError(format!("Prepare error: {e}")))?;

        let device = stmt
            .query_row(params![id], |row| {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let hostname: Option<String> = row.get(2)?;
                let status_str: String = row.get(3)?;
                let os_info: String = row.get(4)?;
                let last_seen_str: String = row.get(5)?;
                let tags_str: String = row.get(6)?;
                let notes: Option<String> = row.get(7)?;
                let latency_ms: Option<u32> = row.get(8)?;
                let is_favorite_int: i32 = row.get(9)?;

                let status: DeviceStatus = serde_json::from_str(&format!("\"{status_str}\""))
                    .unwrap_or(DeviceStatus::Offline);
                let last_seen: DateTime<Utc> = DateTime::parse_from_rfc3339(&last_seen_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());
                let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

                Ok(Device {
                    id,
                    name,
                    hostname,
                    status,
                    os_info,
                    last_seen,
                    tags,
                    notes,
                    latency_ms,
                    is_favorite: is_favorite_int != 0,
                })
            })
            .optional()
            .map_err(|e| MeshDeskError::StorageError(format!("Query failed: {e}")))?;

        Ok(device)
    }

    pub fn list_devices(&self) -> Result<Vec<Device>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, name, hostname, status, os_info, last_seen, tags, notes, latency_ms, is_favorite
                 FROM devices ORDER BY is_favorite DESC, name ASC",
            )
            .map_err(|e| MeshDeskError::StorageError(format!("Prepare error: {e}")))?;

        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let hostname: Option<String> = row.get(2)?;
                let status_str: String = row.get(3)?;
                let os_info: String = row.get(4)?;
                let last_seen_str: String = row.get(5)?;
                let tags_str: String = row.get(6)?;
                let notes: Option<String> = row.get(7)?;
                let latency_ms: Option<u32> = row.get(8)?;
                let is_favorite_int: i32 = row.get(9)?;

                let status: DeviceStatus = serde_json::from_str(&format!("\"{status_str}\""))
                    .unwrap_or(DeviceStatus::Offline);
                let last_seen: DateTime<Utc> = DateTime::parse_from_rfc3339(&last_seen_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());
                let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

                Ok(Device {
                    id,
                    name,
                    hostname,
                    status,
                    os_info,
                    last_seen,
                    tags,
                    notes,
                    latency_ms,
                    is_favorite: is_favorite_int != 0,
                })
            })
            .map_err(|e| MeshDeskError::StorageError(format!("Query map failed: {e}")))?;

        let mut devices = Vec::new();
        for r in rows {
            devices.push(r.map_err(|e| MeshDeskError::StorageError(format!("Row error: {e}")))?);
        }
        Ok(devices)
    }

    pub fn delete_device(&self, id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let affected = conn
            .execute("DELETE FROM devices WHERE id = ?1", params![id])
            .map_err(|e| MeshDeskError::StorageError(format!("Delete failed: {e}")))?;
        Ok(affected > 0)
    }

    pub fn update_device_status(
        &self,
        id: &str,
        status: DeviceStatus,
        latency_ms: Option<u32>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let status_str = serde_json::to_string(&status).unwrap_or_default();
        let status_trimmed = status_str.trim_matches('"');
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE devices SET status = ?1, latency_ms = ?2, last_seen = ?3 WHERE id = ?4",
            params![status_trimmed, latency_ms, now, id],
        )
        .map_err(|e| MeshDeskError::StorageError(format!("Status update failed: {e}")))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_persistence_roundtrip() {
        let storage = Storage::in_memory().unwrap();
        let mut dev = Device::new("MD-8192-3021", "Test-PC", "Windows 11");
        dev.tags = vec!["workspace-1".into(), "lab".into()];
        dev.is_favorite = true;

        storage.save_device(&dev).unwrap();

        let retrieved = storage.get_device("MD-8192-3021").unwrap().expect("Should exist");
        assert_eq!(retrieved.name, "Test-PC");
        assert_eq!(retrieved.tags.len(), 2);
        assert!(retrieved.is_favorite);

        let list = storage.list_devices().unwrap();
        assert_eq!(list.len(), 1);

        storage.update_device_status("MD-8192-3021", DeviceStatus::Online, Some(14)).unwrap();
        let updated = storage.get_device("MD-8192-3021").unwrap().unwrap();
        assert_eq!(updated.status, DeviceStatus::Online);
        assert_eq!(updated.latency_ms, Some(14));

        let deleted = storage.delete_device("MD-8192-3021").unwrap();
        assert!(deleted);
        assert!(storage.get_device("MD-8192-3021").unwrap().is_none());
    }
}
