import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
const names = [
  "auth",
  "catalog",
  "inventory",
  "orders",
  "payments",
  "shipping",
];
const children = [];
const key = process.env.INTERNAL_KEY || randomBytes(32).toString("hex");
for (const name of names)
  children.push(
    spawn(process.execPath, [`backend/services/${name}/index.mjs`], {
      stdio: "inherit",
      env: { ...process.env, INTERNAL_KEY: key },
    }),
  );
if (!process.argv.includes("--backend-only"))
  children.push(
    spawn(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--strictPort"],
      { stdio: "inherit" },
    ),
  );
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const p of children) p.kill("SIGTERM");
  setTimeout(() => process.exit(0), 800);
}
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, stop);
for (const p of children)
  p.on("exit", (c) => {
    if (c && !stopping) {
      console.error("A service exited with", c);
      stop();
    }
  });
