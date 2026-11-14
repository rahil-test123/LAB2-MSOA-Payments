import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
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
  txn,
} from "../../shared/runtime.mjs";
const db = database("auth");
const hash = (t) => createHash("sha256").update(t).digest("hex");
function password(p, s = randomBytes(16).toString("hex")) {
  return s + ":" + scryptSync(p, s, 64).toString("hex");
}
function valid(p, h) {
  let [s, v] = h.split(":");
  return timingSafeEqual(Buffer.from(v, "hex"), scryptSync(p, s, 64));
}
function safe(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}
if (!get(db, "user-1"))
  put(db, {
    id: "user-1",
    type: "user",
    name: "Demo Customer",
    email: "demo@msoa.shop",
    role: "CUSTOMER",
    password: password("demo123"),
  });
serve("auth", async (req, url, b) => {
  const p = url.pathname;
  if (req.method === "POST" && p === "/api/auth/register")
    return txn(db, () => {
      assert(
        typeof b.name === "string" &&
          b.name.trim() &&
          typeof b.email === "string" &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) &&
          typeof b.password === "string" &&
          b.password.length >= 6,
        "Name, valid email and password (6 characters minimum) required",
      );
      let email = b.email.trim().toLowerCase();
      assert(
        !all(db).some((x) => x.type === "user" && x.email === email),
        "Email already registered",
        409,
      );
      return safe(
        put(db, {
          id: id(),
          type: "user",
          name: b.name.trim(),
          email,
          role: "CUSTOMER",
          password: password(b.password),
        }),
      );
    });
  if (req.method === "POST" && p === "/api/auth/login") {
    assert(
      typeof b.email === "string" && typeof b.password === "string",
      "Invalid credentials",
      401,
    );
    let u = all(db).find(
      (x) => x.type === "user" && x.email === b.email.trim().toLowerCase(),
    );
    assert(
      u && valid(b.password, u.password),
      "Invalid email or password",
      401,
    );
    let token = randomBytes(32).toString("hex");
    put(db, {
      id: hash(token),
      type: "session",
      userId: u.id,
      expires: Date.now() + 86400000,
    });
    return { user: safe(u), token };
  }
  if (p === "/api/auth/me" || p === "/api/auth/logout") {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const session = token && get(db, hash(token));
    assert(
      session?.type === "session" && session.expires > Date.now(),
      "Invalid or expired session",
      401,
    );
    if (req.method === "POST" && p.endsWith("logout")) {
      db.prepare("DELETE FROM documents WHERE id=?").run(session.id);
      return { success: true };
    }
    if (req.method === "GET" && p.endsWith("me"))
      return safe(get(db, session.userId));
  }
  fail(404, "Not found");
});
