use zed_extension_api as zed;

/// Environment variable used to hand the server source to Node.
const SERVER_ENV: &str = "TS_IMPORT_FOLDS_SOURCE";

/// The language server itself, embedded in the extension so there is nothing
/// to download or install. It is a plain Node script (LSP over stdio).
const SERVER_JS: &str = include_str!("../lsp/import_folds.js");

struct TypeScriptImportFolds;

impl zed::Extension for TypeScriptImportFolds {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> zed::Result<zed::Command> {
        let node = worktree
            .which("node")
            .or_else(|| zed::node_binary_path().ok())
            .ok_or_else(|| {
                "no `node` executable found: install Node.js (or use a Zed build that bundles node)"
                    .to_string()
            })?;

        Ok(zed::Command {
            command: node,
            // The source goes through the environment to dodge command-line
            // quoting and length limits on Windows.
            args: vec![
                "-e".to_string(),
                format!("eval(process.env.{SERVER_ENV})"),
            ],
            env: vec![(SERVER_ENV.to_string(), SERVER_JS.to_string())],
        })
    }
}

zed::register_extension!(TypeScriptImportFolds);
