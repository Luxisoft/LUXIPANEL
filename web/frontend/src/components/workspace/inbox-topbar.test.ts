import { afterEach, expect, it, vi } from "vitest";
import { createControllerScope } from "./controller-scope";
import { mountInboxTopbar } from "./inbox-topbar";
afterEach(() => {document.body.replaceChildren();vi.unstubAllGlobals();});
it("restores scoped controls across account A, account B, foreign toolbar and account A again", () => {
  vi.stubGlobal("EventSource",class {close(){}});
  document.body.innerHTML =
    '<div class="lxp-workspace-quick-drawer"><section class="lxp-workspace-quick-sheet"><header><div data-module-header-tabs-slot></div><div data-module-header-actions-slot></div></header></section></div>';
  const drawer = document.querySelector<HTMLElement>(".lxp-workspace-quick-drawer")!;
  function account(id: string) {
    const root = document.createElement("div");
    root.dataset.internalModule = "mail/[id]/inbox";
    root.innerHTML =
      '<div data-inbox-header="folders"><span id="account-email">' +
      id +
      '</span></div><div data-inbox-header="list"><button id="btn-refresh" title="Refresh"></button><button id="btn-open-contacts" title="Contacts"></button><details class="inbox-advanced-filters"><summary>Filters</summary></details></div><div id="viewer-content"><div data-inbox-header="reader"><div><h3 id="msg-subject">Mail</h3><div><button id="btn-reply" title="Reply"></button></div></div><div><span id="msg-from">Sender</span></div></div></div><nav id="folders-list"></nav><footer><button id="btn-open-folders-manager">Folders</button><a href="/panel/mail/compose?from=' +
      id +
      '">Compose</a></footer>';
    drawer.append(root);
    return createControllerScope(root, new URL("http://localhost/panel/mail/" + id + "/inbox"));
  }
  const a = account("A"),
    b = account("B"),
    refresh = a.document.getElementById("btn-refresh")!;
  const clicked = vi.fn();
  refresh.addEventListener("click", clicked);
  let close = mountInboxTopbar(a);
  expect(document.querySelectorAll(".inbox-global-actions")).toHaveLength(1);
  close();
  a.root.hidden = true;
  close = mountInboxTopbar(b);
  expect(drawer.querySelector("[data-module-header-tabs-slot] #account-email")?.textContent).toBe("B");
  close();
  drawer.querySelector("[data-module-header-tabs-slot]")!.replaceChildren(document.createElement("button"));
  drawer.querySelector("[data-module-header-actions-slot]")!.replaceChildren();
  drawer.querySelector("[data-module-header-tabs-slot]")!.replaceChildren();
  b.root.hidden = true;
  a.root.hidden = false;
  close = mountInboxTopbar(a);
  expect(drawer.querySelector("[data-module-header-tabs-slot] #account-email")?.textContent).toBe("A");
  expect(document.querySelectorAll(".inbox-global-actions")).toHaveLength(1);
  (a.document.getElementById("btn-refresh") as HTMLButtonElement).click();
  expect(clicked).toHaveBeenCalledOnce();
  expect(b.root.contains(b.document.getElementById("btn-refresh"))).toBe(true);
  close();
  a.dispose();
  b.dispose();
});

it("places inbox search, filters, compose and tools in their owning header regions", () => {
  vi.stubGlobal("EventSource", class { close() {} });
  document.body.innerHTML = '<div class="lxp-workspace-quick-drawer"><section class="lxp-workspace-quick-sheet"><header>' + ["search","filters","actions","controls","tools"].map(region => '<div data-module-header-' + region + '-slot></div>').join("") + '</header><div id="root" data-internal-module="mail/[id]/inbox"><div data-inbox-header="folders">Account</div><div data-inbox-header="list"><div><input id="msg-search" value="saved"></div><details class="inbox-advanced-filters"><summary>Filters</summary></details></div><a href="/panel/mail/compose?from=A">Compose</a></div></section></div>';
  const root = document.querySelector<HTMLElement>("#root")!;
  const scope = createControllerScope(root, new URL("https://panel.example/panel/mail/A/inbox"));
  const stop = mountInboxTopbar(scope);
  expect(document.querySelector("[data-module-header-search-slot] #msg-search")).not.toBeNull();
  expect(document.querySelector("[data-module-header-filters-slot] .inbox-advanced-filters")).not.toBeNull();
  expect(document.querySelector("[data-module-header-actions-slot] .inbox-compose-action")).not.toBeNull();
  expect(document.querySelector("[data-module-header-tools-slot] .inbox-tools-popover")).not.toBeNull();
  stop();
  expect((root.querySelector("#msg-search") as HTMLInputElement).value).toBe("saved");
  expect(document.querySelector("[data-module-header-tools-slot]")?.children.length).toBe(0);
  scope.dispose();
});
