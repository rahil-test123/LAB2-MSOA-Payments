import { readFileSync } from "node:fs";
import { serve, database, get, put, all, fail } from "../../shared/runtime.mjs";
const db = database("catalog");
for (const p of JSON.parse(
  readFileSync(new URL("../../seed/products.json", import.meta.url)),
))
  if (!get(db, p.id)) {
    const { stock, ...product } = p;
    put(db, product);
  }
serve("catalog", async (req, url) => {
  if (req.method === "GET" && url.pathname === "/products") return all(db);
  if (req.method === "GET" && /^\/products\/\d+$/.test(url.pathname)) {
    const v = get(db, url.pathname.split("/").pop());
    if (v) return v;
  }
  fail(404, "Product not found");
});
