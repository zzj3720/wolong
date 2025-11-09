use std::io;

use napi::{Error as NapiError, Status};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("io error: {0}")]
    Io(#[from] io::Error),

    #[error("windows api error: {0}")]
    Windows(String),

    #[error("n-api error: {0}")]
    Napi(String),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

pub type CoreResult<T> = Result<T, CoreError>;

impl CoreError {
    pub fn from_win32(prefix: &str) -> Self {
        use windows::Win32::Foundation::GetLastError;
        let code = unsafe { GetLastError().0 };
        CoreError::Windows(format!("{prefix} (code {code})"))
    }
}

impl From<CoreError> for NapiError {
    fn from(value: CoreError) -> Self {
        match value {
            CoreError::Io(err) => NapiError::new(Status::GenericFailure, err.to_string()),
            CoreError::Windows(message) => NapiError::new(Status::GenericFailure, message),
            CoreError::Napi(message) => NapiError::new(Status::GenericFailure, message),
            CoreError::Other(err) => NapiError::new(Status::GenericFailure, err.to_string()),
        }
    }
}
