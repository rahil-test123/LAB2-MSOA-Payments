import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
mkdirSync("preuves/captures", { recursive: true });
const browser = await chromium.launch({
  headless: process.env.SHOW_BROWSER !== "1",
  slowMo: process.env.SHOW_BROWSER === "1" ? 250 : 0,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (/localhost:808|127.0.0.1:808/.test(r.url()))
    requests.push({
      url: r.url(),
      status: r.status(),
      method: r.request().method(),
    });
});
async function shot(n) {
  await page.screenshot({
    path: "preuves/captures/" + n + ".png",
    fullPage: true,
  });
}
async function checkout(two = false) {
  await page.goto("http://127.0.0.1:5173/products");
  await page.getByRole("button", { name: "Add to Cart" }).first().click();
  if (two)
    await page.getByRole("button", { name: "Add to Cart" }).nth(1).click();
  await page.goto("http://127.0.0.1:5173/cart");
  await page.getByRole("button", { name: "Proceed to Checkout" }).click();
  await page.getByLabel(/Full Name/).fill("ASHAD Ossama - Equipe LAB2");
  await page.getByLabel(/Email/).fill("demo@msoa.shop");
  await page.getByLabel(/Shipping Address/).fill("123 Rue du Test");
  await page.getByLabel(/City/).fill("Casablanca");
  await shot("02_checkout");
  await page.getByRole("button", { name: /Place Order/ }).click();
  await page.getByRole("heading", { name: "Order Confirmed!" }).waitFor();
  await shot("03_confirmation");
  await page.getByRole("button", { name: "View My Orders" }).click();
  await page
    .getByRole("button", { name: "Simulate: SHIPPED" })
    .first()
    .waitFor();
}
try {
  await page.goto("http://127.0.0.1:5173/products");
  await page.getByRole("heading", { name: "Lenovo ThinkPad E14" }).waitFor();
  await shot("01_catalogue");
  await page.goto("http://127.0.0.1:5173/login");
  await page.getByLabel(/Email/).fill("demo@msoa.shop");
  await page.getByLabel(/Password/).fill("demo123");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
  await checkout(true);
  await shot("04_commande_payee");
  await page.getByRole("button", { name: "Simulate: SHIPPED" }).first().click();
  await page
    .getByRole("button", { name: "Simulate: IN TRANSIT" })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: "Simulate: IN TRANSIT" })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Simulate: DELIVERED" })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: "Simulate: DELIVERED" })
    .first()
    .click();
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByText("DELIVERED", { exact: true }).first().waitFor();
  await shot("05_livraison_terminee");
  await checkout();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Cancel Order", exact: true })
    .first()
    .click();
  await page.getByText("CANCELLED", { exact: true }).first().waitFor();
  await shot("06_annulation");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert(
    requests.some(
      (r) =>
        r.url.includes(":8085/api/payments") &&
        r.method === "POST" &&
        r.status === 200,
    ),
  );
  console.log(
    "PASS browser: catalog, login, multi-item checkout, payment, shipment progression, cancellation; no JS errors",
  );
} catch (e) {
  console.error(e);
  await shot("failure");
  process.exitCode = 1;
} finally {
  writeFileSync(
    "preuves/browser.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        passed: !process.exitCode,
        errors,
        requests,
      },
      null,
      2,
    ),
  );
  if (process.env.KEEP_BROWSER === "1") {
    console.log("Visible browser remains open");
    await new Promise((resolve) => {
      const timer = setInterval(() => {}, 1000);
      browser.on("disconnected", () => {
        clearInterval(timer);
        resolve();
      });
    });
  } else await browser.close();
}
