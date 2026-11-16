# TypeScript Import Folds for Zed

Collapse the whole `import` block of a TypeScript or TSX file into a single fold — the same fold
VS Code gives you for free.

```ts
// Before
import React from "react";
import { Button, Card } from "@/ui";
import type { Foo } from "@/types";
import "./styles.css";
import { useWidget } from "./use-widget";

export function Widget(props: { foo: Foo }) {
  return <Button>{props.foo.id}</Button>;
}
```

```ts
// After folding the imports
import React from "react";⋯

export function Widget(props: { foo: Foo }) {
  return <Button>{props.foo.id}</Button>;
}
```

Leading comments, `"use client"` / `"use strict"` directives and blank lines stay visible; the fold
starts at the first `import` and ends at the last one. Imports separated by comments or blank lines
form one block, and nothing else in the file gets folded.

## Install

Not in the extension gallery yet, so install it as a dev extension:

1. Clone it somewhere stable and install the wasm target once:

   ```sh
   git clone https://github.com/liuzhch-orka/zed-typescript-import-folds ~/repos/zed-typescript-import-folds
   rustup target add wasm32-wasip2
   ```

2. In Zed, run `zed: extensions` → **Install Dev Extension** and pick the cloned folder.
3. Enable language-server fold ranges — **required**, Zed ignores them by default:

   ```json
   {
     "document_folding_ranges": "on"
   }
   ```

   Or only for these languages, if you'd rather keep tree-sitter folding everywhere else:

   ```json
   {
     "languages": {
       "TypeScript": { "document_folding_ranges": "on" },
       "TSX": { "document_folding_ranges": "on" }
     }
   }
   ```

4. Reopen the file. A fold chevron appears on the first import line.

Because a dev extension is symlinked to the clone, updating is just `git pull` followed by
`zed: rebuild dev extension`.

Requirements: Zed `0.224.0` or newer, and Node.js on your `PATH` (Zed's bundled Node is used as a
fallback).

## Use

- Click the chevron in the gutter on the first import line, **or**
- put the cursor anywhere in the import block and press `ctrl-shift-[` (`editor: fold`)
  or `ctrl-k ctrl-l` (`editor: toggle fold`), **or**
- run `editor: fold all` / `editor: unfold all` to fold every region at once.

Prefer a dedicated key? Add it to your `keymap.json`:

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

Once you fold a file, Zed remembers it: folds are persisted per file path and restored the next
time you open it, even after restarting Zed.

## Limitations

- **No fold-on-open.** Zed has no `foldingImportsByDefault` equivalent, and extensions can't run
  editor actions, so imports can't be hidden automatically the first time you open a file. After
  that first fold, the remembered fold does it for you.
- Files with a single `import` get no extra crease — Zed already folds that one.
- Only active while `document_folding_ranges` is on for the language.

## Widen it to JavaScript

Add the languages you want in `extension.toml`, then reinstall the dev extension:

```toml
[language_servers.ts-import-folds]
name = "TypeScript Import Folds"
languages = ["TypeScript", "TSX", "JavaScript", "JSX"]
```

## How it works

Extensions can't add editor commands, but they can contribute a language server — and Zed merges
folding ranges from every language server attached to a buffer. So this extension ships a ~9 KB
stdio language server (a plain Node script, embedded at compile time, nothing to download) that
answers `textDocument/foldingRange` with one extra range covering the leading run of import
declarations. `vtsls` keeps serving completions, diagnostics and everything else; this only adds
the import crease.

The scanner is comment-, string- and brace-aware, so multi-line imports, `import x = require()`,
import attributes (`with { type: "json" }`), CRLF files and semicolon-free styles all work.

## License

MIT
