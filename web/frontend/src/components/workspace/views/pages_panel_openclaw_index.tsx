// SPDX-License-Identifier: AGPL-3.0-only
// Internal component migrated from src/pages/panel/openclaw/index.astro.
import { SlotFragment as Fragment } from "../view-context";
import {
  useViewContext,
  splitSlots,
  classList,
  cssStyle,
} from "../view-context";

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 LUXISOFT
/**
 * /panel/openclaw — OpenClaw AI integration settings.
 * Stores API key, endpoint and default model for the platform at https://openclaw.ai.
 */
import PanelLayout from "../module-frame";
import { getPageMessages, moduleAccessRedirect } from "../view-context";
export default function pages_panel_openclaw_index(props: any) {
  const context = useViewContext();
  const slots = splitSlots(props.children);
  const Astro = context.forView(props, slots);
  const document = context.scope.document;
  const window = context.scope.window;
  const t = getPageMessages(Astro, ["openclaw", "settings"]);
  // E-11: guarda de acceso por módulo compartida (antes copiada por página).
  const denied = moduleAccessRedirect(Astro, "openclaw");
  if (denied) return denied;
  // Config is fetched client-side after mount — the page paints immediately
  // instead of blocking on an SSR fetch. The script at the bottom of the
  // file (or via the openclaw page bundle) populates the form fields, so the
  // SSR markup renders the unconfigured defaults.
  {
  }
  return (
    <Fragment>
      <PanelLayout title={t.openclaw.pageTitle} activeModule="openclaw">
        <div className="contents">
          {/** Header */}

          {/** Status card */}
          <div
            id="oc-status-card"
            className="rounded-xl border border-border bg-card p-4 flex items-center gap-3"
          >
            <div
              id="oc-status-dot"
              className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40"
            ></div>
            <div className="flex-1 min-w-0">
              <p id="oc-status-title" className="text-sm font-semibold">
                {t.openclaw.statusCard.title}
              </p>
              <p id="oc-status-desc" className="text-xs text-muted-foreground">
                {t.openclaw.statusCard.descNoKey}
              </p>
            </div>
            <button
              id="btn-test"
              type="button"
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <i className="ti ti-plug-connected mr-1"></i>
              {t.openclaw.statusCard.btnTest}
            </button>
          </div>

          {/** Configuration form */}
          <form
            id="oc-form"
            className="rounded-xl border border-border bg-card p-6 space-y-5"
          >

            {/** Endpoint */}
            <div>
              <label
                htmlFor="oc-endpoint"
                className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5"
              >
                {t.openclaw.form.labelEndpoint}
              </label>
              <input
                id="oc-endpoint"
                type="url"
                required
                placeholder={t.openclaw.form.placeholderEndpoint}
                defaultValue="https://openclaw.ai"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {t.openclaw.form.hintEndpoint}{" "}
                <code className="font-mono">https://openclaw.ai</code>.
              </p>
            </div>

            {/** API key */}
            <a href="/panel/settings#cred-openclaw" className="text-sm text-primary hover:underline">{t.openclaw.form.labelApiKey}</a>

            {/** Default model */}
            <div>
              <label
                htmlFor="oc-default-model"
                className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5"
              >
                {t.openclaw.form.labelDefaultModel}
              </label>
              <input
                id="oc-default-model"
                type="text"
                placeholder={t.openclaw.form.placeholderDefaultModel}
                defaultValue=""
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {t.openclaw.form.hintDefaultModel}
              </p>
            </div>

            <p
              id="oc-error"
              className="hidden text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2"
            ></p>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
              <a
                href="/panel/settings#cred-openclaw"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <i className="ti ti-key text-sm"></i>{" "}
                {t.settings.credentials.title}
              </a>
              <button
                type="submit"
                id="btn-save"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <i className="ti ti-device-floppy mr-1"></i>
                {t.openclaw.form.btnSave}
              </button>
            </div>
          </form>

          {/** Help card */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">
              {t.openclaw.help.title}
            </p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>
                {t.openclaw.help.step1}{" "}
                <a
                  href="https://openclaw.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  openclaw.ai
                </a>
                .
              </li>
              <li>{t.openclaw.help.step2}</li>
              <li>{t.openclaw.help.step3}</li>
            </ol>
          </div>
        </div>

        {/** Toast */}
        <div
          id="toast"
          className="hidden fixed bottom-4 right-4 z-50 max-w-xs rounded-xl border px-4 py-3 shadow-lg text-sm font-medium"
        >
          <span id="toast-msg"></span>
        </div>
      </PanelLayout>
    </Fragment>
  );
}
