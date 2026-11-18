import { expect, it, vi } from "vitest";

it("opens tabbed modules directly and reserves submenus for independent drawers", async () => {
  vi.resetModules();
  document.body.innerHTML = '<div data-workspace-shell data-workspace-admin="true"><aside id="sidebar"><nav><div id="nav-modules-group"><a href="/users" data-module="users" aria-current="page" class="sidebar-mod-link bg-primary/10 text-primary">Usuarios</a><a href="/backups" data-module="backups">Respaldos</a><a href="/module-dev" data-module="module-dev">Desarrollador</a></div></nav></aside><aside id="sidebar-mobile"><nav><a data-module="module-dev" href="/module-dev" class="sidebar-mod-link bg-primary/10 text-primary" aria-current="page">Desarrollador</a></nav></aside></div>';
  await import("./workspace-module-nav");
  const nav = (window as any).__lxpModuleNav;
  const users = document.querySelector<HTMLAnchorElement>('[data-module="users"]')!;
  const backups = document.querySelector<HTMLAnchorElement>('[data-module="backups"]')!;
  const dev = document.querySelector<HTMLAnchorElement>('[data-module="module-dev"]')!;
  const assertNeutral = () => {
    expect(document.querySelector('#sidebar [aria-current],#sidebar-mobile [aria-current]')).toBeNull();
    expect([...document.querySelectorAll('#sidebar a,#sidebar-mobile a')].some(link => link.classList.contains('bg-primary/10') || link.classList.contains('text-primary') || link.classList.contains('lxp-module-subnav-selected'))).toBe(false);
  };
  assertNeutral();
  expect(users.hasAttribute("data-lxp-has-submenu")).toBe(false);
  expect(backups.hasAttribute("data-lxp-has-submenu")).toBe(false);
  expect(dev.hasAttribute("data-lxp-has-submenu")).toBe(true);
  expect(nav.show(dev)).toBe(true);
  expect(document.querySelectorAll("[data-lxp-module-view]")).toHaveLength(6);
  const view = document.querySelector<HTMLAnchorElement>('[data-lxp-module-view]')!;
  nav.opened(view); assertNeutral();
  nav.activateRoot(document,new URL(view.href)); assertNeutral();
  expect(nav.show(users)).toBe(false);
  expect(document.querySelector("[data-lxp-module-subnav]")).toBeNull();
  nav.reset(); assertNeutral();
  const installed=document.createElement('a'); installed.href='/files'; installed.dataset.module='files';
  installed.className='sidebar-mod-link bg-primary/10 text-primary';installed.setAttribute('aria-current','page');
  document.querySelector('#sidebar nav')!.append(installed);
  await new Promise(resolve=>setTimeout(resolve,0));assertNeutral();
  document.body.replaceChildren();
});
