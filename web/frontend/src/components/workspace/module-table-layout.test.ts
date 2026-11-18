import { afterEach, expect, it } from "vitest";
import { mountModuleTableLayout } from "./module-table-layout";
afterEach(() => document.body.replaceChildren());
it("fills only the visible table pane and removes layout ownership on teardown", async () => {
  document.body.innerHTML = '<div id="drawer"><div id="root"><main><div id="one"><div data-module-table="one"></div></div><div id="two" class="hidden"><div data-module-table="two"></div></div></main><dialog><div data-module-table="dialog"></div></dialog></div></div>';
  const root = document.querySelector<HTMLElement>("#root")!, drawer = document.querySelector<HTMLElement>("#drawer")!;
  const stop = mountModuleTableLayout(root, drawer);
  expect(root.querySelector("#one")?.hasAttribute("data-module-table-path")).toBe(true);
  expect(root.querySelector("#two")?.hasAttribute("data-module-table-path")).toBe(false);
  root.querySelector("#one")!.classList.add("hidden"); root.querySelector("#two")!.classList.remove("hidden");
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(root.querySelector("#one")?.hasAttribute("data-module-table-path")).toBe(false);
  expect(root.querySelector("#two")?.hasAttribute("data-module-table-path")).toBe(true);
  stop(); expect(root.querySelector("[data-module-table-path]")).toBeNull(); expect(drawer.hasAttribute("data-module-table-layout")).toBe(false);
});
it("keeps a form beside a table padded instead of flattening the mixed pane", () => {
  document.body.innerHTML = '<div id="drawer"><div id="root"><main data-panel-content><div data-module-content-root><section class="rounded-xl border"><div data-module-table="one"></div><form><textarea></textarea><button>Test</button></form></section></div></main></div></div>';
  const root=document.getElementById('root')!,drawer=document.getElementById('drawer')!;
  const stop=mountModuleTableLayout(root,drawer);
  expect(root.dataset.moduleLayout).toBe('mixed');
  expect(drawer.hasAttribute('data-module-table-layout')).toBe(false);
  expect(root.querySelector('main')?.hasAttribute('data-module-table-path')).toBe(false);
  expect(root.querySelector('form')?.hasAttribute('data-module-table-path')).toBe(false);
  expect(root.querySelector('section')?.getAttribute('data-module-surface')).toBe('outer');
  expect(root.querySelector('[data-module-table]')?.hasAttribute('data-module-table-path')).toBe(true);
  stop();
});
it("restores content surfaces when switching away from a pure table", async () => {
  document.body.innerHTML = '<div id="drawer"><div id="root"><main data-panel-content><div data-module-content-root><section id="list"><div data-module-table="one"></div></section><section id="form" hidden><form><label>Endpoint<input></label></form></section></div></main></div></div>';
  const root=document.getElementById('root')!,drawer=document.getElementById('drawer')!;
  const stop=mountModuleTableLayout(root,drawer);
  expect(root.dataset.moduleLayout).toBe('table');
  document.getElementById('list')!.hidden=true;document.getElementById('form')!.hidden=false;
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(root.dataset.moduleLayout).toBe('content');
  expect(root.querySelector('[data-module-surface]')).not.toBeNull();
  expect(root.querySelector('[data-module-table-path]')).toBeNull();stop();
});
it("does not let a parked module change the visible drawer layout", () => {
  document.body.innerHTML='<div id="drawer"><div id="a"><div data-module-table="active"></div></div><div id="b" hidden><form><textarea></textarea></form></div></div>';
  const drawer=document.getElementById('drawer')!;
  const stopA=mountModuleTableLayout(document.getElementById('a')!,drawer);
  const stopB=mountModuleTableLayout(document.getElementById('b')!,drawer);
  expect(drawer.hasAttribute('data-module-table-layout')).toBe(true);
  stopB();expect(drawer.hasAttribute('data-module-table-layout')).toBe(true);stopA();
});
it("keeps report filters padded when fields and a native table share one card", () => {
  document.body.innerHTML='<div id="drawer"><div id="root"><main data-panel-content><div data-module-content-root><section data-mail-main-panel="track-delivery"><div class="rounded-xl border"><label>Recipient<input id="recipient"></label><button>Run</button><div class="rounded-lg border"><label><input type="checkbox">Success</label><select><option>250</option></select><div class="overflow-x-auto"><table><tbody><tr><td>Report</td></tr></tbody></table></div></div></div></section></div></main></div></div>';
  const root=document.getElementById('root')!,drawer=document.getElementById('drawer')!;
  const stop=mountModuleTableLayout(root,drawer);
  expect(root.dataset.moduleLayout).toBe('mixed');
  expect(drawer.hasAttribute('data-module-table-layout')).toBe(false);
  expect(root.querySelector('[data-module-table-path]')).toBeNull();
  expect(root.querySelector('#recipient')?.closest('[data-module-surface]')?.getAttribute('data-module-surface')).toBe('outer');stop();
});
it("preserves native table semantics in table-only panes", () => {
  document.body.innerHTML='<div id="drawer"><div id="root"><main data-panel-content><div data-module-content-root><div><table><tbody><tr><td>Row</td></tr></tbody></table></div></div></main></div></div>';
  const root=document.getElementById('root')!,drawer=document.getElementById('drawer')!;
  const stop=mountModuleTableLayout(root,drawer);
  expect(root.dataset.moduleLayout).toBe('table');
  expect(root.querySelector('table')?.hasAttribute('data-module-table-path')).toBe(false);
  expect(root.querySelector('table')?.parentElement?.hasAttribute('data-module-table-path')).toBe(true);stop();
});
it("does not mistake a small button group for the pane's outer container", () => {
  document.body.innerHTML='<div id="drawer"><div id="root"><main data-panel-content><div data-module-content-root><section role="tabpanel"><div role="toolbar"><div class="flex rounded-lg border"><button>CPU</button><button>RAM</button></div><label>Interval<select><option>Live</option></select></label></div><div data-module-table="processes"></div></section></div></main></div></div>';
  const root=document.getElementById('root')!,drawer=document.getElementById('drawer')!;
  const stop=mountModuleTableLayout(root,drawer);
  expect(root.dataset.moduleLayout).toBe('mixed');
  expect(root.querySelector('select')?.closest('[data-module-surface]')).toBe(root.querySelector('section'));
  expect(root.querySelector('[role=toolbar] div')?.hasAttribute('data-module-surface')).toBe(false);stop();
});
it("keeps explanatory code sections beside a documentation table in content layout", () => {
  document.body.innerHTML='<div id="drawer"><div id="root"><main data-panel-content><div data-module-content-root><section><pre>API example</pre></section><section><div><table><tbody><tr><td>Endpoint</td></tr></tbody></table></div></section></div></main></div></div>';
  const root=document.getElementById('root')!,drawer=document.getElementById('drawer')!;
  const stop=mountModuleTableLayout(root,drawer);
  expect(root.dataset.moduleLayout).toBe('mixed');
  expect(root.querySelector('main')?.hasAttribute('data-module-table-path')).toBe(false);
  expect(root.querySelector('pre')?.closest('[data-module-surface]')).not.toBeNull();stop();
});
it("does not normalize a configuration drawer or count its fields as main content", () => {
 document.body.innerHTML='<div id="drawer"><div id="root"><main data-panel-content><div data-module-content-root><div data-module-table="list"></div></div></main><div data-lxp-module-settings><nav><span class="hidden">Menu label</span></nav><form><input><textarea></textarea></form></div></div></div>';
 const root=document.getElementById('root')!,drawer=document.getElementById('drawer')!;
 const stop=mountModuleTableLayout(root,drawer);
 expect(root.dataset.moduleLayout).toBe('table');
 expect(root.querySelector('[data-lxp-module-settings] [data-module-surface]')).toBeNull();stop();
});

it.each(['files','terminal'])("leaves %s native workspace layout untouched", (module) => {
 document.body.innerHTML=`<div id="drawer"><div id="root" data-internal-module="${module}"><main data-panel-content><div data-module-content-root><form><input></form><table><tbody><tr><td>Native content</td></tr></tbody></table></div></main></div></div>`;
 const root=document.getElementById('root')!,drawer=document.getElementById('drawer')!;
 const stop=mountModuleTableLayout(root,drawer);
 expect(root.hasAttribute('data-module-uniform-content')).toBe(false);
 expect(drawer.hasAttribute('data-module-table-layout')).toBe(false);
 expect(root.querySelector('[data-module-surface],[data-module-table-path]')).toBeNull();stop();
});
