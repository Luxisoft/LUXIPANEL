# Frontend presentation conventions

Read `ARCHITECTURE.md` before modifying module views.

Module tabs use `ModuleContent` and `ModuleCard`. Follow Mail → Spam filters:
40 px outside at viewport widths >=1024 px, 32 px below; 16 px inside the
outer card, 12 px inside nested cards, and 12 px between groups. Use the theme's
border, background and radius. Preserve native IDs, events and scope ownership.

Pure table tabs retain their fill layout. Mixed tabs keep cards and forms padded;
never remove padding/borders from the entire pane because it contains a table.
Do not add redundant module/tab headings or introductory descriptions.
Keep the existing three topbar regions and React Bits Rubber Segment animation.

Validate every affected tab, including mobile and mixed table/form views, with
`scripts/qa-module-drawers.mjs --content-review` (all registered views and every
body pane). Validate actual control insets, containers, native table semantics and
horizontal overflow, not just layout attributes. The fixture includes the real
drawer body and AI footer. Exercise Mail with `--mail-controller` and NGINX with
`--nginx-controller` after changing shared layouts. Run heavy checks serially; builds hold the shared assistant lock.

Files and Terminal are explicit presentation exceptions: preserve their own
topbars, bodies, navigation and dialogs. Do not apply shared topbar blocks,
content cards, spacing normalization or individual control extraction to either.

Mixed panes include fields outside `<form>` and explanatory code beside tables.
Keep native `<table>` formatting; apply flex to its viewport. A button group is
not a content card. Remove vacated source toolbar rows and wrapper padding so a
pane has one outer inset. Declare `role="tabpanel"` on controller-owned body panes
so shared layout and the audit cover them.

Module configuration drawers are separate from main module drawers. Preserve
their original navigation, responsive menu labels, titles and spacing. Main
topbar/content normalization must exclude `dialog`, `[data-lxp-module-settings]`
and `[data-view-settings-modal]`, including portalled React settings. Shared
auxiliary drawer padding must not affect module settings. Validate settings
separately with `scripts/qa-module-drawers.mjs --settings-audit` and
`--react-settings-audit` for Chat/Assistant portal navigation.

Files and Terminal have their own complete presentation. Keep their original
headers, edge-to-edge workspaces, live tab controls and mobile navigation. They
must never use the three shared topbar blocks, ModuleContent cards, spacing
normalization or individual native-control extraction. Use hasOwnModuleLayout
for these exclusions; preserve configuration drawer isolation as well.
