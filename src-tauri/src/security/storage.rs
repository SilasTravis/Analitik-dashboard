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

fn file_path() -> AppResult<PathBuf> {
    Ok(data_dir()?.join(FILE_NAME))
}

/// Write the encrypted blob to disk with restrictive permissions (0600 on Unix).
pub fn write(blob: &[u8]) -> AppResult<()> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir)
        .map_err(|e| AppError::Message(format!("create data dir failed: {e}")))?;
    let path = file_path()?;
    fs::write(&path, blob)
        .map_err(|e| AppError::Message(format!("write credentials file failed: {e}")))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&path)
            .map_err(|e| AppError::Message(format!("stat credentials file failed: {e}")))?
            .permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&path, perms)
            .map_err(|e| AppError::Message(format!("chmod credentials file failed: {e}")))?;
    }
    Ok(())
}

pub fn read() -> AppResult<Option<Vec<u8>>> {
    let path = file_path()?;
    match fs::read(&path) {
        Ok(b) => Ok(Some(b)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::Message(format!("read credentials file failed: {e}"))),
    }
}

pub fn delete() -> AppResult<()> {
    let path = file_path()?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AppError::Message(format!("delete credentials file failed: {e}"))),
    }
}
