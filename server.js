const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, ".env");
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";

function loadLocalEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const content = fs.readFileSync(ENV_FILE, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) return;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  });
}

loadLocalEnv();
const { handler: handleQno } = require("./src/qno_api");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function isAllowedStaticPath(pathname) {
  if (pathname === "/" || pathname === "/index.html" || pathname === "/home-sample.html") return true;
  if (!/^\/(assets|units|lessons|knowledge)\/[A-Za-z0-9._/-]+$/.test(pathname)) return false;
  return !pathname.split("/").some((part) => part === "." || part === "..");
}

async function serveStatic(pathname, response) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  if (!isAllowedStaticPath(pathname)) {
    response.writeHead(404, { "X-Content-Type-Options": "nosniff" });
    response.end("Not found");
    return;
  }
  const absolutePath = path.resolve(ROOT, `.${requestedPath}`);
  if (!absolutePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const data = await fs.promises.readFile(absolutePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": MIME_TYPES[path.extname(absolutePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "SAMEORIGIN",
    });
    response.end(data);
  } catch {
    response.writeHead(404, { "X-Content-Type-Options": "nosniff" });
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname); }
  catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }
  if (pathname === "/api/qno") {
    await handleQno(request, response);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }
  await serveStatic(pathname, response);
});

server.listen(PORT, HOST, () => {
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  console.log(`Qno local preview: http://${HOST}:${PORT}`);
  console.log(`Gemini: ${process.env.GEMINI_API_KEY ? model : "not configured (local guide remains available)"}`);
});
