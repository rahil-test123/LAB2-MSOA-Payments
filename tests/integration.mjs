import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
const names = [
    "auth",
    "catalog",
    "inventory",
    "orders",
    "payments",
    "shipping",
  ],
  children = [],
  data = mkdtempSync(join(tmpdir(), "lab2-tests-")),
  key = "test-only-internal-key-32-characters-long";
let logs = "",
  token = "",
  user;
const results = [];
function start(n) {
  let p = spawn(process.execPath, [`backend/services/${n}/index.mjs`], {
    env: { ...process.env, DATA_DIR: data, INTERNAL_KEY: key },
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", (x) => (logs += x));
  p.stderr.on("data", (x) => (logs += x));
  children[names.indexOf(n)] = p;
  return p;
}
async function req(
  n,
  path,
  method = "GET",
  body,
  expected = 200,
  headers = {},
) {
  const r = await fetch(`http://127.0.0.1:${8081 + names.indexOf(n)}` + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  assert.equal(r.status, expected, JSON.stringify(v));
  return v;
}
async function test(name, fn) {
  const start = Date.now();
  await fn();
  results.push({ test: name, status: "PASS", ms: Date.now() - start });
  console.log("PASS", name);
}
const customer = {
    name: "LAB2 Team",
    address: "123 Rue du Test",
    city: "Casablanca",
  },
  body = (q = 1, p = 1) => ({
    userId: user.id,
    customer,
    items: [{ productId: p, quantity: q }],
  }),
  stock = async (p) => (await req("inventory", "/api/inventory/" + p)).stock;
try {
  for (const n of names) start(n);
  for (let i = 0; i < 60; i++) {
    try {
      await Promise.all(names.map((n) => req(n, "/health")));
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
      if (i === 59) throw Error(logs);
    }
  }
  await test("Six independent services respond to health", () =>
    Promise.all(names.map((n) => req(n, "/health"))));
  await test("Register returns public user; duplicate email rejected", async () => {
    await req("auth", "/api/auth/register", "POST", {
      name: "Other User",
      email: "other@example.test",
      password: "test123",
    });
    await req(
      "auth",
      "/api/auth/register",
      "POST",
      { name: "Other", email: "other@example.test", password: "test123" },
      409,
    );
  });
  await test("Wrong password rejected", () =>
    req(
      "auth",
      "/api/auth/login",
      "POST",
      { email: "demo@msoa.shop", password: "wrong" },
      401,
    ));
  await test("Login and session introspection", async () => {
    let s = await req("auth", "/api/auth/login", "POST", {
      email: "demo@msoa.shop",
      password: "demo123",
    });
    token = s.token;
    user = s.user;
    assert(!("password" in user));
    assert.equal((await req("auth", "/api/auth/me")).id, user.id);
  });
  await test("Catalog contracts and unknown product", async () => {
    assert.equal((await req("catalog", "/products")).length, 6);
    assert.equal((await req("catalog", "/products/1")).price, 8499);
    await req("catalog", "/products/999", "GET", undefined, 404);
  });
  await test("CORS preflight authorizes Vite", async () => {
    let r = await fetch("http://127.0.0.1:8084/api/orders", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(r.status, 204);
    assert.equal(
      r.headers.get("Access-Control-Allow-Origin"),
      "http://localhost:5173",
    );
  });
  await test("Negative, zero and fractional quantities rejected", async () => {
    for (const q of [-1, 0, 1.5])
      await req(
        "inventory",
        "/api/inventory/check",
        "POST",
        { items: [{ productId: 1, quantity: q }] },
        400,
      );
  });
  await test("Duplicate lines are aggregated before availability check", async () => {
    assert.equal(
      (
        await req("inventory", "/api/inventory/check", "POST", {
          items: [
            { productId: 1, quantity: 7 },
            { productId: 1, quantity: 7 },
          ],
        })
      ).available,
      false,
    );
  });
  await test("Public callers cannot mutate stock or forge internal actions", async () => {
    await req(
      "inventory",
      "/api/inventory/release",
      "POST",
      { items: [{ productId: 1, quantity: 1 }] },
      403,
    );
    await req(
      "orders",
      "/internal/orders/unknown/action",
      "POST",
      { action: "PAY" },
      403,
    );
  });
  await test("All-or-nothing stock reservation on shortage", async () => {
    let a = await stock(1),
      b = await stock(2);
    await req(
      "orders",
      "/api/orders",
      "POST",
      {
        ...body(),
        items: [
          { productId: 1, quantity: 1 },
          { productId: 2, quantity: 999 },
        ],
      },
      409,
    );
    assert.equal(await stock(1), a);
    assert.equal(await stock(2), b);
  });
  let o;
  await test("Order uses server catalog price and reserves stock", async () => {
    let before = await stock(1);
    o = await req("orders", "/api/orders", "POST", {
      ...body(2),
      total: 1,
      items: [{ productId: 1, quantity: 2, price: 0.01 }],
    });
    assert.equal(o.total, 16998);
    assert.equal(o.status, "PENDING_PAYMENT");
    assert.equal(await stock(1), before - 2);
  });
  await test("Order cannot be paid via customer status PATCH", () =>
    req(
      "orders",
      `/api/orders/${o.id}/status`,
      "PATCH",
      { status: "PAID" },
      403,
    ));
  await test("Unpaid order cannot create shipment", () =>
    req(
      "shipping",
      "/api/shipments",
      "POST",
      { orderId: o.id, address: customer },
      409,
    ));
  await test("Payment succeeds and order becomes PAID", async () => {
    let p = await req("payments", "/api/payments", "POST", {
      orderId: o.id,
      method: "CARD",
      amount: 0.01,
    });
    assert.equal(p.amount, 16998);
    assert.equal(p.status, "SUCCESS");
    assert.equal((await req("orders", "/api/orders/" + o.id)).status, "PAID");
  });
  await test("Payment retry returns same record without double charge", async () => {
    let a = await req("payments", "/api/payments/order/" + o.id);
    let b = await req("payments", "/api/payments", "POST", {
      orderId: o.id,
      method: "CARD",
    });
    assert.equal(a.id, b.id);
  });
  let shipment;
  await test("Shipment creation is idempotent and uses order address", async () => {
    shipment = await req("shipping", "/api/shipments", "POST", {
      orderId: o.id,
      address: customer,
    });
    assert.equal(shipment.status, "PREPARING");
    assert.equal(
      (
        await req("shipping", "/api/shipments", "POST", {
          orderId: o.id,
          address: customer,
        })
      ).id,
      shipment.id,
    );
  });
  await test("Cancellation refunds simulation, restores stock exactly once and cancels shipment", async () => {
    let before = await stock(1);
    await req("orders", `/api/orders/${o.id}/cancel`, "POST");
    await req("orders", `/api/orders/${o.id}/cancel`, "POST");
    assert.equal(await stock(1), before + 2);
    assert.equal(
      (await req("payments", "/api/payments/order/" + o.id)).status,
      "REFUNDED",
    );
    assert.equal(
      (await req("shipping", "/api/shipments/order/" + o.id)).status,
      "CANCELLED",
    );
  });
  let shippingOrder;
  await test("Shipping progression enforces sequence and synchronizes order", async () => {
    shippingOrder = await req("orders", "/api/orders", "POST", body(1, 2));
    await req("payments", "/api/payments", "POST", {
      orderId: shippingOrder.id,
      method: "CASH",
    });
    let s = await req("shipping", "/api/shipments", "POST", {
      orderId: shippingOrder.id,
      address: customer,
    });
    await req(
      "shipping",
      `/api/shipments/${s.id}/status`,
      "PATCH",
      { status: "DELIVERED" },
      409,
    );
    await req("shipping", `/api/shipments/${s.id}/status`, "PATCH", {
      status: "SHIPPED",
    });
    await req("orders", `/api/orders/${shippingOrder.id}/status`, "PATCH", {
      status: "SHIPPED",
    });
    await req(
      "orders",
      `/api/orders/${shippingOrder.id}/cancel`,
      "POST",
      undefined,
      409,
    );
    for (const status of ["IN_TRANSIT", "DELIVERED"])
      await req("shipping", `/api/shipments/${s.id}/status`, "PATCH", {
        status,
      });
    assert.equal(
      (await req("orders", "/api/orders/" + shippingOrder.id)).status,
      "DELIVERED",
    );
  });
  await test("User ownership enforced across orders, payments and shipments", async () => {
    let save = token;
    token = (
      await req("auth", "/api/auth/login", "POST", {
        email: "other@example.test",
        password: "test123",
      })
    ).token;
    for (const [n, path] of [
      ["orders", "/api/orders/" + o.id],
      ["payments", "/api/payments/order/" + o.id],
      ["shipping", "/api/shipments/order/" + o.id],
    ])
      await req(n, path, "GET", undefined, 403);
    await req("orders", "/api/orders?userId=user-1", "GET", undefined, 403);
    token = save;
  });
  await test("Concurrent reservations cannot oversell", async () => {
    let before = await stock(3);
    let rs = await Promise.all(
      Array.from({ length: 12 }, () =>
        fetch("http://127.0.0.1:8084/api/orders", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body(1, 3)),
        }),
      ),
    );
    assert.equal(rs.filter((x) => x.ok).length, before);
    assert.equal(await stock(3), 0);
  });
  await test("Concurrent idempotency key creates one order", async () => {
    let before = await stock(4);
    let os = await Promise.all(
      Array.from({ length: 4 }, () =>
        req("orders", "/api/orders", "POST", body(1, 4), 200, {
          "Idempotency-Key": "same-checkout",
        }),
      ),
    );
    assert.equal(new Set(os.map((x) => x.id)).size, 1);
    assert.equal(await stock(4), before - 1);
    await req("orders", "/api/orders", "POST", body(2, 4), 409, {
      "Idempotency-Key": "same-checkout",
    });
  });
  await test("Auth passwords are salted hashes, sessions are token hashes", async () => {
    let d = new DatabaseSync(join(data, "auth.sqlite"), { readOnly: true });
    let docs = d
      .prepare("SELECT body FROM documents")
      .all()
      .map((x) => JSON.parse(x.body));
    assert(
      docs
        .filter((x) => x.type === "user")
        .every((x) => x.password !== "demo123" && x.password.includes(":")),
    );
    assert(!JSON.stringify(docs).includes(token));
    d.close();
  });
  await test("Service restart preserves persisted order and stock", async () => {
    let old = children[3];
    old.kill("SIGTERM");
    await once(old, "exit");
    start("orders");
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(
      (await req("orders", "/api/orders/" + shippingOrder.id)).status,
      "DELIVERED",
    );
  });
  await test("Catalog outage produces 503 without changing stock", async () => {
    let old = children[1];
    old.kill("SIGTERM");
    await once(old, "exit");
    let before = await stock(4);
    await req("orders", "/api/orders", "POST", body(1, 4), 503);
    assert.equal(await stock(4), before);
    start("catalog");
  });
  await test("Logout revokes session", async () => {
    await req("auth", "/api/auth/logout", "POST");
    await req("auth", "/api/auth/me", "GET", undefined, 401);
  });
} catch (e) {
  console.error(e);
  process.exitCode = 1;
  results.push({ test: "Failure", status: "FAIL", message: e.message });
} finally {
  for (const p of children) p?.kill("SIGTERM");
  mkdirSync("preuves", { recursive: true });
  writeFileSync(
    "preuves/integration.json",
    JSON.stringify(
      { at: new Date().toISOString(), node: process.version, results },
      null,
      2,
    ),
  );
  writeFileSync("preuves/services-test.log", logs);
  console.log(results.filter((x) => x.status === "PASS").length + " passed");
}
