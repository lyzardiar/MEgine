//! Mobile entry stubs shared by Android / iOS players.

/// Placeholder exported for future C ABI.
#[no_mangle]
pub extern "C" fn mengine_mobile_version() -> u32 {
    1
}

#[no_mangle]
pub extern "C" fn mengine_mobile_boot() -> i32 {
    log::info!("mengine mobile boot stub");
    0
}
