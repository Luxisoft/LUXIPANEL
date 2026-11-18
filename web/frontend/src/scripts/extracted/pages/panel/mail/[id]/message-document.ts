// SPDX-License-Identifier: AGPL-3.0-only
/** The API has already sanitized the message. Keep its presentation separate from the panel. */
export function messageDocument(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const htmlRoot = parsed.querySelector<HTMLElement>("[data-lxp-email-html]");
  const bodyRoot = parsed.querySelector<HTMLElement>("[data-lxp-email-body]");
  const styles = [htmlRoot?.getAttribute("style"), bodyRoot?.getAttribute("style")].filter(Boolean).join(";");
  if (bodyRoot) {
    parsed.body.innerHTML = bodyRoot.innerHTML;
  } else if (htmlRoot) {
    parsed.body.innerHTML = htmlRoot.innerHTML;
  }
  if (styles) parsed.body.setAttribute("style", styles);
  parsed.head.innerHTML =
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><base target="_blank"><style>html{background:white;color:#111;color-scheme:light}body{margin:0;padding:0;font:14px/1.6 system-ui,sans-serif;overflow-wrap:break-word}img{max-width:100%;height:auto}pre{white-space:pre-wrap}body{box-sizing:border-box}</style>';
  return "<!doctype html>" + parsed.documentElement.outerHTML;
}
