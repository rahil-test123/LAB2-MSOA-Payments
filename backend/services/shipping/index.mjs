import {
  serve,
  database,
  get,
  put,
  all,
  assert,
  fail,
  id,
  now,
  actor,
  own,
  call,
  requireInternal,
} from "../../shared/runtime.mjs";
const db = database("shipping");
const byOrder = (k) => all(db).find((x) => x.orderId === k);
serve("shipping", async (req, url, b) => {
  let p = url.pathname,
    m;
  if (
    (m = p.match(
      /^\/internal\/shipments\/([^/]+)\/(prepare|advance|cancel)$/,
    )) &&
    req.method === "POST"
  ) {
    requireInternal(req);
    let s = byOrder(m[1]);
    if (m[2] === "prepare") {
      if (s) return s;
      assert(
        b.order?.status === "PAID" && b.order.id === m[1],
        "Order must be paid",
        409,
      );
      return put(db, {
        id: id(),
        orderId: m[1],
        userId: b.order.userId,
        address: b.order.customer,
        trackingNumber: "MSOA-" + id().slice(0, 8).toUpperCase(),
        status: "PREPARING",
        createdAt: now(),
        updatedAt: now(),
      });
    }
    if (m[2] === "cancel") {
      if (!s) return { success: true };
      assert(
        ["PREPARING", "CANCELLED"].includes(s.status),
        "Order already shipped",
        409,
      );
      return put(db, { ...s, status: "CANCELLED", updatedAt: now() });
    }
    assert(s, "Shipment not found", 404);
    if (s.status === b.status) return s;
    const next = {
      PREPARING: "SHIPPED",
      SHIPPED: "IN_TRANSIT",
      IN_TRANSIT: "DELIVERED",
    };
    assert(next[s.status] === b.status, "Invalid shipment transition", 409);
    return put(db, { ...s, status: b.status, updatedAt: now() });
  }
  const user = await actor(req);
  if (p === "/api/shipments" && req.method === "GET")
    return all(db).filter((x) => x.userId === user.id);
  if (
    (m = p.match(/^\/api\/shipments\/order\/([^/]+)$/)) &&
    req.method === "GET"
  ) {
    own(user, await call("orders", "/api/orders/" + m[1]));
    const s = byOrder(m[1]);
    assert(s, "Shipment not found", 404);
    return s;
  }
  if (p === "/api/shipments" && req.method === "POST") {
    assert(typeof b.orderId === "string", "Order required");
    const order = own(user, await call("orders", "/api/orders/" + b.orderId));
    assert(
      b.address &&
        ["name", "address", "city"].every(
          (k) => b.address[k] === order.customer[k],
        ),
      "Address must match the order",
    );
    return call("orders", `/internal/orders/${b.orderId}/action`, "POST", {
      action: "PREPARE",
    });
  }
  if (
    (m = p.match(/^\/api\/shipments\/([^/]+)\/status$/)) &&
    req.method === "PATCH"
  ) {
    let s = own(user, get(db, m[1]));
    assert(
      ["SHIPPED", "IN_TRANSIT", "DELIVERED", "CANCELLED"].includes(b.status),
      "Invalid shipment status",
    );
    if (b.status === "CANCELLED") {
      await call("orders", `/internal/orders/${s.orderId}/action`, "POST", {
        action: "CANCEL",
      });
      return get(db, s.id);
    }
    return call("orders", `/internal/orders/${s.orderId}/action`, "POST", {
      action: { SHIPPED: "SHIP", IN_TRANSIT: "TRANSIT", DELIVERED: "DELIVER" }[
        b.status
      ],
    });
  }
  fail(404, "Not found");
});
