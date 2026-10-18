// src/server.ts — zero-dep static server for SUNSET OUTRUN. bun src/server.ts
const ROOT = new URL("../public/", import.meta.url).pathname;
const SRC = new URL("./", import.meta.url).pathname;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

Bun.serve({
  hostname: "127.0.0.1",
  port: 3036,
  async fetch(req) {
    const url = new URL(req.url);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    const rel = path.replace(/^\/+/, "");
    // shared ESM logic lives in src/ and is imported by the browser as /src/*.js
    const base = rel.startsWith("src/") ? SRC + rel.slice(4) : ROOT + rel;
    const file = Bun.file(base);
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    const ext = path.slice(path.lastIndexOf("."));
    return new Response(file, { headers: { "content-type": TYPES[ext] || "application/octet-stream" } });
  },
});
console.log("SUNSET OUTRUN at http://127.0.0.1:3036");
