//! Shared runtime library (PC player binary + mobile stubs).

pub mod mobile_stub;

pub use mobile_stub::{mengine_mobile_boot, mengine_mobile_version};
