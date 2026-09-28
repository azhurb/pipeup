//! Explicit first-run copy from the identifier shared by older Pipeup builds
//! and upstream OpenTypeless. The source is never changed or removed.

use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const LEGACY_IDENTIFIER: &str = "com.opentypeless.app";
const LEGACY_DATABASE: &str = "opentypeless.db";
const DATABASE: &str = "pipeup.db";
const DECISION_FILE: &str = "identity-migration.json";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub settings_imported: bool,
    pub history_imported: bool,
    pub credentials_to_reenter: Vec<String>,
    pub legacy_credential_store_unavailable: bool,
}

fn legacy_dir(new_dir: &Path) -> PathBuf {
    new_dir.with_file_name(LEGACY_IDENTIFIER)
}

/// Show the choice only before Pipeup has written its own data. A skipped
/// import stays skipped, and an installed upstream app can coexist afterwards.
pub fn pending(new_dir: &Path) -> bool {
    if ["settings.json", DATABASE, "credentials.json", DECISION_FILE]
        .iter()
        .any(|name| new_dir.join(name).exists())
    {
        return false;
    }
    let old = legacy_dir(new_dir);
    ["settings.json", LEGACY_DATABASE, "credentials.json"]
        .iter()
        .any(|name| old.join(name).is_file())
}

pub fn skip(new_dir: &Path) -> Result<()> {
    if !pending(new_dir) {
        bail!("There is no pending legacy import");
    }
    fs::create_dir_all(new_dir)?;
    fs::write(new_dir.join(DECISION_FILE), r#"{"choice":"start_fresh"}"#)?;
    Ok(())
}

fn stage_dir(new_dir: &Path) -> Result<PathBuf> {
    let parent = new_dir
        .parent()
        .context("Pipeup data directory has no parent")?;
    let stage = parent.join(format!(
        ".pipeup-import-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_nanos()
    ));
    fs::create_dir(&stage)?;
    Ok(stage)
}

struct Stage(PathBuf);

impl Drop for Stage {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn restrict_to_owner(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

fn copy_settings(old: &Path, stage: &Path) -> Result<bool> {
    let source = old.join("settings.json");
    if !source.is_file() {
        return Ok(false);
    }
    let mut settings: serde_json::Value = serde_json::from_slice(&fs::read(&source)?)
        .context("Legacy settings are not valid JSON")?;
    // Starting both apps at login would make them compete for the same hotkey.
    // The user can enable Pipeup's separate login item after choosing a shortcut.
    if let Some(config) = settings
        .get_mut("app_config")
        .and_then(|value| value.as_object_mut())
    {
        config.insert("auto_start".into(), false.into());
    }
    let target = stage.join("settings.json");
    fs::write(&target, serde_json::to_vec_pretty(&settings)?)?;
    restrict_to_owner(&target)?;
    Ok(true)
}

fn copy_credentials_file(old: &Path, stage: &Path) -> Result<()> {
    let source = old.join("credentials.json");
    if !source.is_file() {
        return Ok(());
    }
    let raw = fs::read(&source)?;
    let _entries: std::collections::BTreeMap<String, String> =
        serde_json::from_slice(&raw).context("Legacy credentials file is not valid JSON")?;
    let target = stage.join("credentials.json");
    fs::write(&target, raw)?;
    restrict_to_owner(&target)?;
    Ok(())
}

fn copy_database(old: &Path, stage: &Path) -> Result<bool> {
    let source = old.join(LEGACY_DATABASE);
    if !source.is_file() {
        return Ok(false);
    }
    let connection = Connection::open_with_flags(&source, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .context("Could not read the legacy database")?;
    let target = stage.join(DATABASE);
    connection
        .execute("VACUUM INTO ?1", params![target.to_string_lossy().as_ref()])
        .context("Could not snapshot the legacy database")?;
    restrict_to_owner(&target)?;
    let copied = Connection::open_with_flags(&target, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let integrity: String = copied.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        bail!("Legacy database failed its integrity check");
    }
    copied.prepare("SELECT id, created_at, app_name, app_type, raw_text, polished_text, language, duration_ms FROM history LIMIT 0")?;
    copied.prepare("SELECT id, word, pronunciation FROM dictionary LIMIT 0")?;
    Ok(true)
}

#[cfg(not(target_os = "macos"))]
fn copy_system_credentials(old: &Path, new_dir: &Path, report: &mut ImportReport) {
    use crate::credentials::{self, CredentialId};
    let source = credentials::legacy_store(old.join("credentials.json"));
    let target = credentials::default_store(new_dir.join("credentials.json"));
    const STT: &[&str] = &[
        "deepgram",
        "assemblyai",
        "gemini-transcribe",
        "glm-asr",
        "openai-whisper",
        "groq-whisper",
        "siliconflow",
    ];
    const LLM: &[&str] = &[
        "zhipu",
        "deepseek",
        "siliconflow",
        "openai",
        "gemini",
        "moonshot",
        "qwen",
        "groq",
        "claude",
        "ollama",
        "openrouter",
    ];
    for id in STT
        .iter()
        .map(|provider| CredentialId::stt(*provider))
        .chain(LLM.iter().map(|provider| CredentialId::llm(*provider)))
    {
        match source.read(&id) {
            Ok(Some(secret)) if !secret.is_empty() => match target.write(&id, &secret) {
                Ok(()) => {}
                Err(_) => report.credentials_to_reenter.push(id.account()),
            },
            Err(_) => report.legacy_credential_store_unavailable = true,
            _ => {}
        }
    }
}

fn import_with(
    new_dir: &Path,
    copy_keys: impl FnOnce(&Path, &Path, &mut ImportReport),
) -> Result<ImportReport> {
    if !pending(new_dir) {
        bail!("There is no pending legacy import or Pipeup already has data");
    }
    let old = legacy_dir(new_dir);
    let stage = Stage(stage_dir(new_dir)?);
    let settings_imported = copy_settings(&old, &stage.0)?;
    copy_credentials_file(&old, &stage.0)?;
    let history_imported = copy_database(&old, &stage.0)?;
    fs::write(stage.0.join(DECISION_FILE), r#"{"choice":"imported"}"#)?;

    fs::create_dir_all(new_dir)?;
    let mut committed = Vec::new();
    for name in ["settings.json", "credentials.json", DATABASE, DECISION_FILE] {
        let source = stage.0.join(name);
        if !source.exists() {
            continue;
        }
        let target = new_dir.join(name);
        if target.exists() {
            for created in committed {
                let _ = fs::remove_file(created);
            }
            bail!("Pipeup data appeared during import; no existing file was replaced");
        }
        if let Err(error) = fs::rename(source, &target) {
            for created in committed {
                let _ = fs::remove_file(created);
            }
            return Err(error).context("Could not complete the import");
        }
        committed.push(target);
    }

    let report = ImportReport {
        settings_imported,
        history_imported,
        credentials_to_reenter: Vec::new(),
        legacy_credential_store_unavailable: false,
    };
    let mut report = report;
    copy_keys(&old, new_dir, &mut report);
    Ok(report)
}

pub fn import(new_dir: &Path) -> Result<ImportReport> {
    import_with(new_dir, |old, new_dir, report| {
        #[cfg(not(target_os = "macos"))]
        copy_system_credentials(old, new_dir, report);
        #[cfg(target_os = "macos")]
        let _ = (old, new_dir, report);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_copies_a_snapshot_and_preserves_the_source() {
        let root =
            std::env::temp_dir().join(format!("pipeup-identity-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(LEGACY_IDENTIFIER)).unwrap();
        let old = root.join(LEGACY_IDENTIFIER);
        let new = root.join("com.azhurb.pipeup");
        fs::write(
            old.join("settings.json"),
            r#"{"app_config":{"auto_start":true,"hotkey":"Alt+/"},"onboarding_completed":true}"#,
        )
        .unwrap();
        fs::write(old.join("credentials.json"), r#"{"stt:deepgram":"key"}"#).unwrap();
        let db = Connection::open(old.join(LEGACY_DATABASE)).unwrap();
        db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE history (id INTEGER PRIMARY KEY, created_at TEXT, app_name TEXT, app_type TEXT, raw_text TEXT, polished_text TEXT, language TEXT, duration_ms INTEGER); CREATE TABLE dictionary (id INTEGER PRIMARY KEY, word TEXT, pronunciation TEXT); INSERT INTO history (id, raw_text) VALUES (1, 'keep me');").unwrap();

        assert!(pending(&new));
        let report = import_with(&new, |_, _, _| {}).unwrap();
        assert!(report.settings_imported);
        assert!(report.history_imported);
        assert!(!pending(&new));
        assert!(old.join(LEGACY_DATABASE).exists());
        assert_eq!(
            fs::read(old.join("credentials.json")).unwrap(),
            fs::read(new.join("credentials.json")).unwrap()
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(new.join("credentials.json"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        let copied: serde_json::Value =
            serde_json::from_slice(&fs::read(new.join("settings.json")).unwrap()).unwrap();
        assert_eq!(copied["app_config"]["auto_start"], false);
        assert_eq!(copied["onboarding_completed"], true);
        let snapshot = Connection::open(new.join(DATABASE)).unwrap();
        let text: String = snapshot
            .query_row("SELECT raw_text FROM history", [], |row| row.get(0))
            .unwrap();
        assert_eq!(text, "keep me");
        drop(db);
        drop(snapshot);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn skip_is_sticky_and_leaves_legacy_data_alone() {
        let root = std::env::temp_dir().join(format!("pipeup-skip-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let old = root.join(LEGACY_IDENTIFIER);
        let new = root.join("com.azhurb.pipeup");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("settings.json"), "{}").unwrap();
        assert!(pending(&new));
        skip(&new).unwrap();
        assert!(!pending(&new));
        assert!(old.join("settings.json").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn existing_pipeup_data_is_never_replaced() {
        let root = std::env::temp_dir().join(format!("pipeup-no-overwrite-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let old = root.join(LEGACY_IDENTIFIER);
        let new = root.join("com.azhurb.pipeup");
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(old.join("settings.json"), "old").unwrap();
        fs::write(new.join("settings.json"), "new").unwrap();

        assert!(!pending(&new));
        assert!(import_with(&new, |_, _, _| {}).is_err());
        assert_eq!(
            fs::read_to_string(new.join("settings.json")).unwrap(),
            "new"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn incompatible_legacy_database_does_not_partially_import() {
        let root = std::env::temp_dir().join(format!("pipeup-bad-db-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let old = root.join(LEGACY_IDENTIFIER);
        let new = root.join("com.azhurb.pipeup");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("settings.json"), "{}").unwrap();
        let db = Connection::open(old.join(LEGACY_DATABASE)).unwrap();
        db.execute_batch("CREATE TABLE unrelated (id INTEGER)")
            .unwrap();
        drop(db);

        assert!(import_with(&new, |_, _, _| {}).is_err());
        assert!(!new.join("settings.json").exists());
        assert!(old.join("settings.json").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
