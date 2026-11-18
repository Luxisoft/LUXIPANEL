// Real table components and popovers, with synthetic rows and no backend operations.
// Run: node scripts/qa-row-context-menus.mjs
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "package.json"));
const { build } = require("esbuild");
const { chromium, expect } = require("@playwright/test");
const bundle = await build({
  stdin: {
    contents: `
    import {createElement as h} from 'react';
    import {createRoot} from 'react-dom/client';
    import DataTable from './src/components/ui/DataTable';
    import {mountNativeRowContextMenus} from './src/components/workspace/native-row-context-menu';
    import {showContextMenu} from './src/lib/context-menu';
    window.actions=[];window.leftClicks=0;
    const data=[{id:'a',name:'A',editable:false},{id:'b',name:'B',editable:true}];
    createRoot(document.getElementById('react-table')).render(h(DataTable,{
      tableId:'qa-context',columns:[{id:'name',header:'Name',accessorKey:'name'}],data,
      renderCell:{name:row=>h('button',{onClick:()=>window.leftClicks++},row.name)},
      rowActions:[{id:'view',label:'View'},{id:'edit',label:'Edit',visibleWhen:{field:'editable',equals:true}}],
      onRowAction:(id,row)=>window.actions.push({id,row:row.id}),
    }));
    const nativeRoot=document.getElementById('native-root');
    nativeRoot.addEventListener('click',event=>{const button=event.target.closest('button[data-native-action]');if(button)window.actions.push({id:button.dataset.nativeAction,row:button.closest('tr').dataset.id});});
    window.stopNative=mountNativeRowContextMenus(nativeRoot,'Acciones');
    window.openNative=()=>document.getElementById('native-dialog').showModal();
    window.openFiles=()=>showContextMenu(document.getElementById('files-menu'),{clientX:innerWidth-2,clientY:innerHeight-2});
    window.ready=true;
  `,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "esm",
  loader: { ".css": "empty" },
  alias: { "@": path.join(root, "src") },
});
let css = "";
for (const name of await readdir(path.join(root, "dist/client/_luxi"))) {
  if (/^(DocumentHead|PanelLayout).*\.css$/.test(name))
    css += await readFile(path.join(root, "dist/client/_luxi", name), "utf8");
}
css += await readFile(path.join(root, "src/styles/panel-workspace.css"), "utf8");
const app = createServer((req, res) => {
  if (req.url === "/entry.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles[0].text);
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(`<!doctype html><html lang="es"><head><style>${css}</style></head><body>
    <div style="height:480px;overflow:hidden;transform:translate(0,0)"><div id="react-table"></div></div>
    <div id="native-root"><dialog id="native-dialog" style="margin:auto;padding:24px">
      <table><thead><tr><th>Name</th><th>Acciones</th></tr></thead><tbody id="forwards-tbody">
        <tr data-id="native-42"><td>Native row</td><td><button data-native-action="edit">Native edit</button><button disabled data-native-action="delete">Delete</button></td></tr>
      </tbody></table>
    </dialog></div>
    <div id="files-menu" popover="manual" class="hidden lxp-row-context-menu"><button class="ctx-item">Files action</button></div>
    <script type="module" src="/entry.js"></script></body></html>`);
});
await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:" + app.address().port);
  await page.waitForFunction(() => window.ready);
  const rows = page.locator("#react-table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(page.locator("#react-table th")).toHaveCount(1);
  await rows.first().getByRole("button", { name: "A", exact: true }).click();
  expect(await page.evaluate(() => window.leftClicks)).toBe(1);
  await rows.first().click({ button: "right" });
  const menu = page.locator("[data-data-table-actions-menu]");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(1);
  expect(await menu.evaluate((el) => el.matches(":popover-open"))).toBe(true);
  await rows.nth(1).click({ button: "right" });
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await menu.getByRole("menuitem", { name: "Edit", exact: true }).click();
  expect(await page.evaluate(() => window.actions)).toEqual([{ id: "edit", row: "b" }]);
  await expect(menu).toHaveCount(0);
  await rows.first().focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(rows.first()).toBeFocused();
  await page.evaluate(() => window.openNative());
  const nativeRow = page.locator("#native-dialog tbody tr");
  await expect(page.locator("#native-dialog th")).toHaveCount(1);
  await nativeRow.click({ button: "right" });
  const nativeMenu = page.locator("#native-dialog [role=menu]");
  await expect(nativeMenu).toBeVisible();
  await expect(nativeMenu.getByRole("menuitem", { name: "Delete", exact: true })).toBeDisabled();
  await nativeMenu.getByRole("menuitem", { name: "Native edit" }).click();
  expect(await page.evaluate(() => window.actions)).toContainEqual({ id: "edit", row: "native-42" });
  await nativeRow.click({ button: "right" });
  await page.evaluate(() => document.getElementById("native-dialog").close());
  await expect(nativeMenu).toBeHidden();
  for (const width of [1000, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await page.evaluate(() => window.openFiles());
    const rect = await page.locator("#files-menu").boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(6);
    expect(rect.y).toBeGreaterThanOrEqual(6);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width - 5);
    expect(rect.y + rect.height).toBeLessThanOrEqual(695);
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS: row actions, filtering, normal click, keyboard, modal dialog, disabled actions and viewport bounds.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => app.close(resolve));
}
