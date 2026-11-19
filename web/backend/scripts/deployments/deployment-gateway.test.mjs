import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { chooseComponent, createGateway, loadRouteCatalog, normalizeHost, parseRouteRecord } from "./deployment-gateway.mjs";

const execFileAsync = promisify(execFile);

const ids = {
  projectId: "11111111-1111-4111-8111-111111111111",
  versionId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
};
const record = (hostname = "demo.luxisoft.com") => ({
  schemaVersion: 1, ...ids, versionNumber: 7, updatedAt: new Date().toISOString(),
  hosts: [{ hostname, defaultComponent: "web" }],
  components: [
    { name: "web", surface: "http", port: 18080, routePrefix: null },
    { name: "api", surface: "http", port: 18081, routePrefix: "/api" },
  ],
});

test("normalizes hosts and selects the longest API prefix", () => {
  assert.equal(normalizeHost("DEMO.LUXISOFT.COM:443"), "demo.luxisoft.com");
  const route = { ...parseRouteRecord(record(), "fixture"), defaultComponent: "web" };
  assert.equal(chooseComponent(route, "/").name, "web");
  assert.equal(chooseComponent(route, "/api/orders").name, "api");
});

test("rejects invalid ports, duplicate hosts and unsafe archives", () => {
  assert.throws(() => parseRouteRecord({ ...record(), components: [{ name: "web", surface: "http", port: 80 }] }, "fixture"));
  assert.throws(() => parseRouteRecord({ ...record(), hosts: [{ hostname: "demo.luxisoft.com", defaultComponent: "web" }, { hostname: "demo.luxisoft.com", defaultComponent: "web" }] }, "fixture"));
  assert.throws(() => parseRouteRecord({ ...record(), components: [{ name: "web", surface: "static", port: null, staticArchive: { archive: "relative.zip", sha256: "a".repeat(64), bytes: 1, spa: true } }] }, "fixture"));
});

test("loads valid project routes and fails closed on duplicate host ownership", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-routes-"));
  for (const [id, value] of [["a".repeat(64), record()], ["b".repeat(64), record()]]) {
    await mkdir(path.join(root, id));
    await writeFile(path.join(root, id, "routes.json"), JSON.stringify(value));
  }
  const loaded = await loadRouteCatalog(root);
  assert.equal(loaded.files, 2);
  assert.equal(loaded.routes.has("demo.luxisoft.com"), false);
});

test("serves health independently and returns 421 for unmanaged hosts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-health-"));
  const gateway = createGateway({ routesRoot: root, cacheRoot: path.join(root, "cache"), trustedIps: new Set() });
  await new Promise((resolve) => gateway.server.listen(0, "127.0.0.1", resolve));
  const port = gateway.server.address().port;
  const request = (pathname, host) => new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: pathname, headers: { host } }, (res) => {
      const chunks = []; res.on("data", (chunk) => chunks.push(chunk)); res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    }); req.on("error", reject);
  });
  assert.equal((await request("/_health", "gateway.local")).status, 200);
  assert.equal((await request("/", "unknown.example")).status, 421);
  await new Promise((resolve) => gateway.server.close(resolve));
});

test("rejects legacy static routes without unpacking or serving UI on BACKEND", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-static-")), projectRoot = path.join(root, "c".repeat(64)),
    releaseRoot = path.join(projectRoot, "releases"), sourceRoot = path.join(root, "source"), archive = path.join(releaseRoot, "web.zip");
  await mkdir(releaseRoot, { recursive: true }); await mkdir(sourceRoot);
  await writeFile(path.join(sourceRoot, "index.html"), "<main>durable release</main>");
  await execFileAsync("/usr/bin/python3", ["-I", "-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); z.write(sys.argv[2],'index.html'); z.close()", archive, path.join(sourceRoot, "index.html")]);
  const bytes = await import("node:fs/promises").then(fs => fs.readFile(archive)), sha256 = createHash("sha256").update(bytes).digest("hex");
  const route = {
    ...record(),
    components: [{ name: "web", surface: "static", port: null, routePrefix: null,
      staticArchive: { archive, sha256, bytes: bytes.length, spa: true } }],
  };
  await writeFile(path.join(projectRoot, "routes.json"), JSON.stringify(route));
  const gateway = createGateway({ routesRoot: root, cacheRoot: path.join(root, "cache"), trustedIps: new Set() });
  await gateway.reload();
  await new Promise((resolve) => gateway.server.listen(0, "127.0.0.1", resolve));
  const port = gateway.server.address().port;
  const response = await new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/account/profile", headers: { host: "demo.luxisoft.com" } }, res => {
      const chunks = []; res.on("data", chunk => chunks.push(chunk)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    }); req.on("error", reject);
  });
  assert.equal(response.status, 410); assert.equal(JSON.parse(response.body).error,"frontend_served_on_frontend");
  assert.equal(response.headers["x-luxi-static-sha256"],undefined);
  await new Promise((resolve) => gateway.server.close(resolve));
});

test('redirects require a local non-redirecting target and a finite expiry', () => {
 const value=record();value.hosts.push({hostname:'own.example',defaultComponent:'web'});
 value.hosts[0]={...value.hosts[0],redirectTo:'own.example',expiresAt:'2027-05-16T12:00:00.000Z'};
 assert.equal(parseRouteRecord(value,'test').hosts[0].redirectTo,'own.example');
 assert.throws(()=>parseRouteRecord({...value,hosts:[value.hosts[0]]},'test'),/redirect_target/);
 assert.throws(()=>parseRouteRecord({...value,hosts:[{...value.hosts[0],expiresAt:'bad'},value.hosts[1]]},'test'),/redirect/);
 assert.throws(()=>parseRouteRecord({...value,hosts:[{...value.hosts[0],redirectTo:value.hosts[0].hostname},value.hosts[1]]},'test'),/redirect/);
});

test('serves temporary redirects with path and query, and stops at expiry without a control-plane call', async () => {
 const base=path.join(process.cwd(),'.cache','gateway-tests');await mkdir(base,{recursive:true});
 const root=await mkdtemp(path.join(base,'redirect-'));const folder=path.join(root,'f'.repeat(64));await mkdir(folder);
 const value=record();value.hosts.push({hostname:'own.example',defaultComponent:'web'});
 value.hosts[0]={...value.hosts[0],redirectTo:'own.example',expiresAt:new Date(Date.now()+60000).toISOString()};
 const file=path.join(folder,'routes.json');await writeFile(file,JSON.stringify(value));
 const gateway=createGateway({routesRoot:root,cacheRoot:path.join(root,'cache'),trustedIps:new Set()});
 try{
  await gateway.reload();await new Promise(resolve=>gateway.server.listen(0,'127.0.0.1',resolve));
  const ask=()=>new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:gateway.server.address().port,path:'/shop/item?ref=old',headers:{host:'demo.luxisoft.com'}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,headers:res.headers}));});req.on('error',reject);});
  const first=await ask();assert.equal(first.status,307);assert.equal(first.headers.location,'https://own.example/shop/item?ref=old');assert.equal(first.headers['cache-control'],'no-store');
  value.hosts[0].expiresAt='2020-01-01T00:00:00.000Z';await writeFile(file,JSON.stringify(value));await gateway.reload();
  assert.equal((await ask()).status,421);
 }finally{await new Promise(resolve=>gateway.server.close(resolve));await rm(root,{recursive:true,force:true});}
});

test("uses the validated host and confines project cookies to their host", async () => {
  const upstream = http.createServer((req, res) => {
    res.setHeader("Set-Cookie", ["cart=1; Domain=example.test; Path=/", "store_session=discard; Path=/"]);
    res.end(JSON.stringify({ host: req.headers.host, forwardedHost: req.headers["x-forwarded-host"], cookie: req.headers.cookie }));
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const fixture = { versionNumber: 1, defaultComponent: "web", components: [{ name: "web", surface: "http", port: upstream.address().port }] };
  const gateway = createGateway({ trustedIps: new Set(["127.0.0.1"]), initialRoutes: new Map([["project.example.test", fixture]]) });
  await new Promise(resolve => gateway.server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await new Promise((resolve, reject) => {
      const req = http.get({
        host: "127.0.0.1", port: gateway.server.address().port,
        headers: { host: "project.example.test", "x-forwarded-host": "other.example.test", cookie: "store_session=fixture; cart=1" },
      }, res => {
        let body = "";
        res.on("data", chunk => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, cookies: res.headers["set-cookie"], body: JSON.parse(body) }));
      });
      req.on("error", reject);
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { host: "project.example.test", forwardedHost: "project.example.test", cookie: "cart=1" });
    assert.deepEqual(response.cookies, ["cart=1; Path=/"]);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
  }
});
