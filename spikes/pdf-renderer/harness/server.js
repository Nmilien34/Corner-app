// Static server for the spike harness. pdf.js needs http:// (worker + range
// requests), so file:// will not do.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const CORPUS = path.resolve(ROOT, "..", "assets");
const PORT = Number(process.env.PORT || 5187);

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".pdf": "application/pdf", ".map": "application/json",
  ".json": "application/json",
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  const base = urlPath.startsWith("/corpus/")
    ? path.join(CORPUS, urlPath.slice("/corpus/".length))
    : path.join(ROOT, urlPath);

  const resolved = path.resolve(base);
  if (!resolved.startsWith(ROOT) && !resolved.startsWith(CORPUS)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404).end("not found: " + urlPath);
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(resolved)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}).listen(PORT, () => console.log("harness on http://localhost:" + PORT));
