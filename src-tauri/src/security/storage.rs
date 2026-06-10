use std::fs;
use std::path::PathBuf;

use directories::ProjectDirs;

use crate::db::error::{AppError, AppResult};

const FILE_NAME: &str = "credentials.enc";

fn data_dir() -> AppResult<PathBuf> {
    let dirs = ProjectDirs::from("com", "analiticdashboard", "Analitic Dashboard")
        .ok_or_else(|| AppError::Message("could not resolve app data directory".into()))?;
    Ok(dirs.data_dir().to_path_buf())
}

fn file_path_for(name: &str) -> AppResult<PathBuf> {
    Ok(data_dir()?.join(name))
}

/// Write an encrypted blob to a named file with restrictive permissions (0600 on Unix).
pub fn write_file(name: &str, blob: &[u8]) -> AppResult<()> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir)
        .map_err(|e| AppError::Message(format!("create data dir failed: {e}")))?;
    let path = file_path_for(name)?;
    fs::write(&path, blob)
        .map_err(|e| AppError::Message(format!("write {name} failed: {e}")))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&path)
            .map_err(|e| AppError::Message(format!("stat {name} failed: {e}")))?
            .permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&path, perms)
            .map_err(|e| AppError::Message(format!("chmod {name} failed: {e}")))?;
    }
    Ok(())
}

pub fn read_file(name: &str) -> AppResult<Option<Vec<u8>>> {
    let path = file_path_for(name)?;
    match fs::read(&path) {
        Ok(b) => Ok(Some(b)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::Message(format!("read {name} failed: {e}"))),
    }
}

pub fn delete_file(name: &str) -> AppResult<()> {
    let path = file_path_for(name)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AppError::Message(format!("delete {name} failed: {e}"))),
    }
}

/// Write the encrypted DB-credentials blob to disk.
pub fn write(blob: &[u8]) -> AppResult<()> {
    write_file(FILE_NAME, blob)
}

pub fn read() -> AppResult<Option<Vec<u8>>> {
    read_file(FILE_NAME)
}

pub fn delete() -> AppResult<()> {
    delete_file(FILE_NAME)
}
