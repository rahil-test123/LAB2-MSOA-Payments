import { readFileSync } from "node:fs";
import {
  serve,
  database,
  get,
  put,
  items,
  assert,
  txn,
  requireInternal,
  id,
  fail,
} from "../../shared/runtime.mjs";
const db = database("inventory");
for (const p of JSON.parse(
  readFileSync(new URL("../../seed/products.json", import.meta.url)),
))
  if (!get(db, p.id)) put(db, { id: p.id, stock: p.stock });
serve("inventory", async (req, url, b) => {
  let p = url.pathname;
  if (req.method === "GET" && /^\/api\/inventory\/\d+$/.test(p)) {
    const r = get(db, p.split("/").pop());
    assert(r, "Unknown product", 404);
    return { productId: r.id, stock: r.stock };
  }
  if (req.method === "POST" && p === "/api/inventory/check") {
    let list = items(b.items);
    return {
      available: list.every(
        (x) => (get(db, x.productId)?.stock ?? -1) >= x.quantity,
      ),
    };
  }
  if (
    req.method === "POST" &&
    ["/api/inventory/reserve", "/api/inventory/release"].includes(p)
  ) {
    requireInternal(req);
    let list = items(b.items);
    let key = b.reservationId || id();
    assert(
      typeof key === "string" && key.length < 150,
      "Invalid reservation ID",
    );
    return txn(db, () => {
      let old = get(db, "r:" + key);
      if (p.endsWith("reserve")) {
        if (old) {
          assert(
            JSON.stringify(old.items) === JSON.stringify(list),
            "Reservation payload conflict",
            409,
          );
          assert(
            old.status === "RESERVED",
            "Reservation already released",
            409,
          );
          return { success: true, reservationId: key };
        }
        assert(
          list.every((x) => (get(db, x.productId)?.stock ?? -1) >= x.quantity),
          "Insufficient stock",
          409,
        );
        for (const x of list) {
          let s = get(db, x.productId);
          s.stock -= x.quantity;
          put(db, s);
        }
        put(db, { id: "r:" + key, status: "RESERVED", items: list });
      } else {
        assert(old, "Unknown reservation", 404);
        assert(
          JSON.stringify(old.items) === JSON.stringify(list),
          "Reservation payload conflict",
          409,
        );
        if (old.status === "RELEASED") return { success: true };
        for (const x of old.items) {
          let s = get(db, x.productId);
          s.stock += x.quantity;
          put(db, s);
        }
        put(db, { ...old, status: "RELEASED" });
      }
      return { success: true, reservationId: key };
    });
  }
  fail(404, "Not found");
});
