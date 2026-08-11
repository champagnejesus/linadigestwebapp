import assert from "node:assert/strict";
import test from "node:test";

test("renders LinaDigest login metadata and users", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>Inventario LinaDigest<\/title>/i);
  assert.match(html, /Control LinaDigest/i);
  assert.match(html, />Bodega<\/option>/i);
  assert.match(html, />Despacho<\/option>/i);
  assert.match(html, />Miguel Angel<\/option>/i);
  assert.match(html, />Daniela Vasquez<\/option>/i);
});
