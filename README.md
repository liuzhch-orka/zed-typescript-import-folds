# TypeScript Import Folds — a Zed extension

Collapse the whole `import` block of a TypeScript/TSX file into a single fold, the way
VS Code's built-in TypeScript support does.

Zed has no fold region for imports today (see
[zed#30763](https://github.com/zed-industries/zed/discussions/30763) and
[zed#30796](https://github.com/zed-industries/zed/discussions/30796)), and extensions cannot
add editor actions — but they *can* contribute a language server, and Zed **merges LSP folding
ranges from every server attached to a buffer**. So this extension ships a ~9 KB stdio language
server whose only job is to answer `textDocument/foldingRange` with one extra range covering the
leading run of import declarations. `vtsls` (or `typescript-language-server`) keeps doing
everything else.

## What you get

```
  2  import React, { useCallback, useEffect, useMemo, useState } from "react";⋯
  4    const [open, setOpen] = useState(false);
```

…instead of 15 lines of imports. Leading comments, `"use client"` / `"use strict"` directives and
blank lines before the first import stay visible; the fold starts at the first `import` and ends at
the last one (imports separated by comments or blank lines are still one block, and files with a
single import get no extra crease since Zed/vtsls already fold that one).

## Install

Requires Zed 1.x with `document_folding_ranges` support (`0.224.0` or newer) and Node.js on your
`PATH` (Zed's bundled Node is used as a fallback).

1. Install the wasm target once:
   ```sh
   rustup target add wasm32-wasip2
   ```
2. In Zed: `zed: extensions` → **Install Dev Extension** → select this folder.
3. Turn on LSP folding ranges — **required**, language-server fold ranges are ignored by default:

   ```json
   {
     "document_folding_ranges": "on"
   }
   ```

   Or only for these languages (tree-sitter folding stays in place everywhere else):

   ```json
   {
     "languages": {
       "TypeScript": { "document_folding_ranges": "on" },
       "TSX": { "document_folding_ranges": "on" }
     }
   }
   ```
4. Reload the window / reopen the file. A fold chevron now appears on the first import line.

## Use

- Click the chevron in the gutter on the first import line, or
- put the cursor anywhere in the import block and fold it with the built-in keys:
  `ctrl-shift-[` (`editor::Fold`) or `ctrl-k ctrl-l` (`editor::ToggleFold`), or
- run `editor: fold all` / `editor: unfold all` (these fold every region, not just imports).

To give it a dedicated key:

```json
[
  {
    "context": "Editor && (extension=ts || extension=tsx)",
    "bindings": {
      "alt-1": "editor::ToggleFold"
    }
  }
]
```

Zed has no `foldingImportsByDefault` equivalent, so imports cannot be hidden automatically when a
file opens — it is one keypress/click per file. Zed does remember folds per buffer while it runs.

## Notes

- Widen it to JS: add `"JavaScript", "JSX"` to `languages` in `extension.toml`.
- The folding range kind is reported as `imports`; Zed currently ignores the kind.
- Unpublished: install as a dev extension for now.

## Publishing caveats

If you submit this to [`zed-industries/extensions`](https://github.com/zed-industries/extensions):

- The registry wants language-server extensions to *download* their server rather than bundle it, and
  discourages using the extension API to work around editor limitations. This extension embeds a
  ~9 KB Node script instead of downloading anything, which a reviewer may or may not accept.
- The registry also asks extensions that only contribute a language server to carry an `-lsp`
  suffix in their ID, i.e. `typescript-import-folds-lsp`; the ID is kept stable here so existing
  dev installs keep working.

## Layout

```
extension.toml        manifest: registers the language server for TypeScript + TSX
Cargo.toml            wasm extension crate
src/lib.rs            language_server_command(): node -e "eval(process.env.<source>)"
lsp/import_folds.js   the language server (embedded at compile time via include_str!)
scratch/              local LSP driver scripts used while developing (git-ignored)
```
