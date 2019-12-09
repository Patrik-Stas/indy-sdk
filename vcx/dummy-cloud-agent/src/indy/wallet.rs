extern crate libc;
extern crate libloading;

use futures::*;
use utils::futures::*;
use indyrs::{wallet, IndyError, ErrorCode};
use futures::future::ok;
use std::ffi::CString;
use self::libc::c_char;

pub fn create_wallet(config: &str, credentials: &str) -> Box<Future<Item=(), Error=IndyError>> {
    wallet::create_wallet(config, credentials)
        .into_box()
}

pub fn open_wallet(config: &str, credentials: &str) -> Box<Future<Item=i32, Error=IndyError>> {
    wallet::open_wallet(config, credentials)
        .into_box()
}

#[allow(unused)] // TODO: Use!
pub fn close_wallet(wallet_handle: i32) -> Box<Future<Item=(), Error=IndyError>> {
    wallet::close_wallet(wallet_handle)
        .into_box()
}



pub fn get_postgres_storage_plugin() -> String {
    let os = os_type::current_platform();
    let osfile = match os.os_type {
        os_type::OSType::OSX => "/usr/local/lib/libindystrgpostgres.dylib",
        _ => "/usr/lib/libindystrgpostgres.so"
    };
    return osfile.to_owned();
}

fn library_function() -> Box<dyn Future<Item=i32, Error=()>> {
    Box::new(ok((23)))
}

#[cfg(all(unix, test))]
fn _load_lib(library: &str) -> libloading::Result<libloading::Library> {
    libloading::os::unix::Library::open(Some(library), ::libc::RTLD_NOW | ::libc::RTLD_NODELETE)
        .map(libloading::Library::from)
}

#[cfg(any(not(unix), not(test)))]
fn _load_lib(library: &str) -> libloading::Result<libloading::Library> {
    libloading::Library::new(library)
}

pub const INIT_CONFIG: &'static str = r#"{"url":"localhost:5432"}"#;
pub const INIT_CREDENTIALS: &'static str = r#"{"account": "postgres", "password": "mysecretpassword", "admin_account": "postgres", "admin_password": "mysecretpassword"}"#;
pub fn load_storage_library(library: &str) -> Result<(), ()> {
    let lib_res = _load_lib(library);
    match lib_res {
        Ok(lib) => {
            let initializer = "postgresstorage_init";
            unsafe {
                let init_func: libloading::Symbol<unsafe extern fn() -> ErrorCode> = lib.get(initializer.as_bytes()).unwrap();

                match init_func() {
                    ErrorCode::Success => println!("Plugin has been loaded: \"{}\"", library),
                    _ => return Err(println!("Plugin has not been loaded: \"{}\"", library))
                }
//              call the one-time storage init() method to initialize storage
                let init_storage_func: libloading::Symbol<unsafe extern fn(config: *const c_char, credentials: *const c_char) -> ErrorCode> = lib.get("init_storagetype".as_bytes()).unwrap();

                let initConfig = CString::new( INIT_CONFIG).expect("CString::new failed");
                let initCredentials = CString::new( INIT_CREDENTIALS).expect("CString::new failed");
                let err = init_storage_func(initConfig.as_ptr(), initCredentials.as_ptr());

                if err != ErrorCode::Success {
                    return Err(println!("Error init_storage returned an error {:#?}", err));
                }
                println!("Called init_storagetype() function successfully");
            }
        }
        Err(_) => return Err(println!("Plugin has not been loaded: \"{}\"", library))
    }

    Ok(())
}