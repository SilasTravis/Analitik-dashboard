use std::{env, fs, path::Path};

fn main() {
    let out_dir = env::var("OUT_DIR").expect("OUT_DIR not set");
    let dest = Path::new(&out_dir).join("db_schema.json");

    // `db.json` lives at the repo root (one level above `src-tauri`) and is
    // gitignored — it's private, so it won't exist on CI. Bake it into the
    // binary when present; otherwise emit an empty placeholder and let the app
    // fall back to live DB introspection at runtime (see `ai::schema::build`).
    let src = Path::new("../db.json");
    if src.exists() {
        fs::copy(src, &dest).expect("failed to copy db.json into OUT_DIR");
    } else {
        fs::write(&dest, "").expect("failed to write empty db schema placeholder");
    }
    println!("cargo:rerun-if-changed=../db.json");

    tauri_build::build();
}
