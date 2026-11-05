/**
 * Next.js dev request log is hard-coded in node_modules and has no IP field.
 * Re-apply this after install so `GET /path 200 in 12ms` also shows the client address.
 */
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "next",
  "dist",
  "server",
  "dev",
  "log-requests.js",
);

const needle =
  "return writeLine(`${request.method} ${url} ${coloredStatus} in ${requestDurationInMs}ms`);";

const patchedReturn =
  "return writeLine(`${request.method} ${url} ${coloredStatus} in ${requestDurationInMs}ms ${clientIp(request)}`);";

const helper = `function clientIp(request) {
    const headers = request.headers || {};
    const forwarded = headers["cf-connecting-ip"] || headers["x-real-ip"] || headers["x-forwarded-for"];
    let ip = "";
    if (Array.isArray(forwarded)) {
        ip = String(forwarded[0] || "");
    } else if (typeof forwarded === "string") {
        ip = forwarded;
    }
    ip = ip.split(",")[0].trim();
    if (!ip) {
        const raw = request._req || request;
        const socket = raw.socket || raw.connection;
        ip = (socket && socket.remoteAddress) || "";
    }
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);
    return ip || "-";
}
`;

if (!fs.existsSync(target)) {
  console.log("skip request-ip log patch: next logger not installed");
  process.exit(0);
}

let source = fs.readFileSync(target, "utf8");

if (source.includes("function clientIp(request)") && source.includes(patchedReturn)) {
  console.log("request-ip log patch already applied");
  process.exit(0);
}

if (!source.includes(needle)) {
  console.warn("skip request-ip log patch: Next.js log line format changed");
  process.exit(0);
}

source = source.replace(needle, patchedReturn);
source = source.replace("function logIncomingRequests(options) {", `${helper}\nfunction logIncomingRequests(options) {`);
fs.writeFileSync(target, source);
console.log("patched Next.js request log to include client ip");
