// TypeScript Import Folds — a tiny stdio language server that contributes a
// single folding range spanning the leading block of `import` declarations,
// the same thing VS Code's built-in TypeScript support does.
//
// Zed merges folding ranges from every language server attached to a buffer,
// so this runs alongside vtsls and only adds the imports crease.
"use strict";

const docs = new Map();

/* ------------------------------- transport ------------------------------- */

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(
    "Content-Length: " + Buffer.byteLength(body, "utf8") + "\r\n\r\n" + body,
  );
}

let incoming = Buffer.alloc(0);

function readFrames() {
  for (;;) {
    const headerEnd = incoming.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;

    const header = incoming.subarray(0, headerEnd).toString("ascii");
    const match = /content-length:\s*(\d+)/i.exec(header);
    if (!match) {
      incoming = incoming.subarray(headerEnd + 4);
      continue;
    }

    const start = headerEnd + 4;
    const end = start + Number(match[1]);
    if (incoming.length < end) return;

    const body = incoming.subarray(start, end).toString("utf8");
    incoming = incoming.subarray(end);

    let message;
    try {
      message = JSON.parse(body);
    } catch {
      continue;
    }
    dispatch(message);
  }
}

/* ---------------------------- import scanning ---------------------------- */

// Every scanner below walks `text` with a cursor object `st = { i, line }`
// so that line numbers stay accurate for multi-line constructs.

function skipBlockComment(text, st) {
  const n = text.length;
  st.i += 2;
  while (st.i < n && !(text[st.i] === "*" && text[st.i + 1] === "/")) {
    if (text[st.i] === "\n") st.line++;
    st.i++;
  }
  st.i = Math.min(st.i + 2, n);
}

function skipString(text, st) {
  const quote = text[st.i];
  const n = text.length;
  st.i++;
  while (st.i < n) {
    const char = text[st.i];
    if (char === "\\") {
      st.i += 2;
      continue;
    }
    if (char === quote) {
      st.i++;
      return;
    }
    // A plain string cannot span lines; bail out on an unterminated one.
    if (char === "\n" && quote !== "`") return;
    if (char === "\n") st.line++;
    st.i++;
  }
}

function skipTrivia(text, st) {
  const n = text.length;
  while (st.i < n) {
    const char = text[st.i];
    if (char === "\n") {
      st.line++;
      st.i++;
      continue;
    }
    if (char === " " || char === "\t" || char === "\r" || char === "\f" || char === "\v") {
      st.i++;
      continue;
    }
    if (char === "/" && text[st.i + 1] === "/") {
      while (st.i < n && text[st.i] !== "\n") st.i++;
      continue;
    }
    if (char === "/" && text[st.i + 1] === "*") {
      skipBlockComment(text, st);
      continue;
    }
    return;
  }
}

// `"use client";` / `'use strict';` prologues may precede the imports.
function consumeDirective(text, st) {
  const quote = text[st.i];
  if (quote !== '"' && quote !== "'") return false;

  const saved = { i: st.i, line: st.line };
  skipString(text, st);
  while (text[st.i] === " " || text[st.i] === "\t") st.i++;

  const next = text[st.i];
  if (next === ";") {
    st.i++;
    return true;
  }
  if (next === undefined || next === "\n" || next === "\r") return true;

  st.i = saved.i;
  st.line = saved.line;
  return false;
}

function isImportKeyword(text, i) {
  if (!text.startsWith("import", i)) return false;
  const next = text[i + 6];
  if (next === undefined) return false;
  // `import(...)` and `import.meta` are expressions, not declarations.
  if (next === "(" || next === ".") return false;
  return !/[A-Za-z0-9_$]/.test(next);
}

// Advances past one import statement and returns the line it ends on.
function scanStatement(text, st) {
  const n = text.length;
  let depth = 0;
  let endLine = st.line;

  while (st.i < n) {
    const char = text[st.i];

    if (char === "\n") {
      st.line++;
      st.i++;
      // Automatic semicolon insertion: depth 0 means the statement is done.
      if (depth === 0) break;
      continue;
    }

    if (char === "/" && text[st.i + 1] === "/") {
      while (st.i < n && text[st.i] !== "\n") st.i++;
      continue;
    }
    if (char === "/" && text[st.i + 1] === "*") {
      skipBlockComment(text, st);
      endLine = st.line;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      skipString(text, st);
      endLine = st.line;
      continue;
    }
    if (char === "{" || char === "(" || char === "[") {
      depth++;
      endLine = st.line;
      st.i++;
      continue;
    }
    if (char === "}" || char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
      endLine = st.line;
      st.i++;
      continue;
    }
    if (char === ";" && depth === 0) {
      st.i++;
      endLine = st.line;
      break;
    }
    if (char !== "\r" && char !== " " && char !== "\t" && char !== "\f" && char !== "\v") {
      endLine = st.line;
    }
    st.i++;
  }

  return endLine;
}

// Returns the run of import declarations at the top of the file, stopping at
// the first statement that is not an import (comments and blank lines inside
// the run are fine).
function leadingImports(text) {
  const imports = [];
  const st = { i: 0, line: 0 };
  const n = text.length;

  for (;;) {
    skipTrivia(text, st);
    if (st.i >= n) break;

    const char = text[st.i];
    if (char === '"' || char === "'") {
      if (consumeDirective(text, st)) continue;
      break;
    }

    if (!isImportKeyword(text, st.i)) break;

    const startLine = st.line;
    const endLine = scanStatement(text, st);
    imports.push({ startLine, endLine });
  }

  return imports;
}

function foldingRanges(text) {
  const imports = leadingImports(text);
  if (imports.length < 2) return [];

  const startLine = imports[0].startLine;
  const endLine = imports[imports.length - 1].endLine;
  if (endLine <= startLine) return [];

  return [{ startLine, endLine, kind: "imports" }];
}

/* --------------------------------- server -------------------------------- */

function offsetAt(text, position) {
  let line = 0;
  let i = 0;
  while (line < position.line && i < text.length) {
    if (text[i] === "\n") line++;
    i++;
  }
  return Math.min(i + position.character, text.length);
}

function applyChange(text, change) {
  if (!change.range) return change.text;
  const start = offsetAt(text, change.range.start);
  const end = offsetAt(text, change.range.end);
  return text.slice(0, start) + change.text + text.slice(end);
}

const handlers = {
  initialize: () => ({
    capabilities: {
      textDocumentSync: { openClose: true, change: 1 },
      foldingRangeProvider: true,
    },
    serverInfo: { name: "typescript-import-folds", version: "0.1.0" },
  }),
  "textDocument/foldingRange": (params) => {
    const text = docs.get(params.textDocument.uri);
    return text === undefined ? [] : foldingRanges(text);
  },
  shutdown: () => null,
};

const notifications = {
  "textDocument/didOpen": (params) => {
    const document = params.textDocument;
    docs.set(document.uri, document.text);
  },
  "textDocument/didChange": (params) => {
    let text = docs.get(params.textDocument.uri) ?? "";
    for (const change of params.contentChanges ?? []) text = applyChange(text, change);
    docs.set(params.textDocument.uri, text);
  },
  "textDocument/didClose": (params) => {
    docs.delete(params.textDocument.uri);
  },
  exit: () => process.exit(0),
};

function dispatch(message) {
  const hasId = message.id !== undefined && message.id !== null;

  if (!message.method) return; // a response to something we never asked

  if (!hasId) {
    const notify = notifications[message.method];
    if (notify) notify(message.params ?? {});
    return;
  }

  const handle = handlers[message.method];
  if (!handle) {
    send({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: "method not supported: " + message.method },
    });
    return;
  }

  try {
    send({ jsonrpc: "2.0", id: message.id, result: handle(message.params ?? {}) });
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32603, message: String(error) },
    });
  }
}

process.stdin.on("data", (chunk) => {
  incoming = Buffer.concat([incoming, chunk]);
  readFrames();
});
process.stdin.on("end", () => process.exit(0));
process.on("uncaughtException", (error) => {
  // Surfaced in Zed.log; a silent crash here would be very hard to debug.
  console.error("[typescript-import-folds]", (error && error.stack) || error);
  process.exit(1);
});
