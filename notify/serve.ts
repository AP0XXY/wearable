/**
 * Simple static server for the CounselView notification page.
 * Open this URL on your iPhone (same Wi-Fi as your laptop).
 *
 * Usage: node --experimental-strip-types notify/serve.ts
 */

import { createServer } from "http";
import { readFileSync } from "fs";
import { networkInterfaces } from "os";

const PORT = 8080;

const html = readFileSync(new URL("./index.html", import.meta.url), "utf-8");

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\nCounselView Notify running!\n`);
  console.log(`Local:   http://localhost:${PORT}`);

  // Show network URLs for phone access
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`Phone:   http://${net.address}:${PORT}`);
      }
    }
  }

  console.log(`\nOpen the Phone URL on your iPhone (same Wi-Fi).`);
  console.log(`Tap "Enable Notifications", then test.\n`);
});
