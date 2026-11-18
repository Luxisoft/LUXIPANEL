// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 LUXISOFT
/**
 * Server-side sanitizer for HTML mail bodies (XSS — audit finding: the inbox
 * endpoint exposed mailparser's `parsed.html` verbatim, so a crafted email
 * became stored XSS for whoever opened it).
 *
 * Conservative email allowlist: formatting/table/image markup survives;
 * `script`/`iframe`/`object`/`embed`/`form`, every `on*` handler and
 * `javascript:` URL are dropped. `img src` only accepts `https:` and `cid:`
 * (inline attachments). Inline `style` is bounded to a fixed set of layout /
 * typography properties with strict value shapes. Juice first inlines local
 * stylesheet rules without fetching resources; the final sanitizer removes
 * style blocks and unsafe declarations (url(), expression(), position, etc.).
 *
 * The frontend's sandboxed iframe stays as defense-in-depth — this closes the
 * hole for every OTHER consumer of the API (app, desktop, AI assistant).
 */

import sanitizeHtml from "sanitize-html";
import juice from "juice";

const COLOR_VALUE = [
  /^#[0-9a-fA-F]{3,8}$/,
  /^rgba?\([\d\s.,%]+\)$/,
  /^[a-zA-Z]+$/,
];
const SIZE_VALUE = [/^(auto|none|normal|inherit)$/i,/^-?[\d.]+(px|em|rem|%|pt|vw|vh)?$/];
const SPACING_VALUE = [/^(?:(?:auto|-?[\d.]+(?:px|em|rem|%|pt)?)\s*){1,4}$/i,/^(-?[\d.]+(px|em|rem|%|pt)?\s*){1,4}$/];
const BORDER_VALUE = [
  /^[\d.]+(px|pt)?\s+(solid|dashed|dotted|double|none)(\s+(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\([\d\s.,%]+\)))?$/,
];

export const BOUNDED_STYLES: NonNullable<sanitizeHtml.IOptions["allowedStyles"]> = {
  "*": {
    "display": [/^(none|block|inline|inline-block|table|table-row|table-cell|table-row-group|flex|inline-flex|grid|inline-grid)$/],
    "visibility": [/^(hidden|visible|collapse)$/],
    "overflow": [/^(hidden|visible|auto|scroll|clip)$/],
    "overflow-x": [/^(hidden|visible|auto|scroll|clip)$/],
    "overflow-y": [/^(hidden|visible|auto|scroll|clip)$/],
    "opacity": [/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/],
    "max-height": SIZE_VALUE,
    "min-height": SIZE_VALUE,
    "min-width": SIZE_VALUE,
    "letter-spacing": SIZE_VALUE,
    "text-underline-offset": SIZE_VALUE,
    "text-decoration-line": [/^(none|underline|overline|line-through)$/],
    "overflow-wrap": [/^(normal|break-word|anywhere)$/],
    "word-break": [/^(normal|break-all|keep-all|break-word)$/],
    "box-sizing": [/^(border-box|content-box)$/],
    "mso-hide": [/^all$/],
    "color-scheme": [/^(light|dark|light dark)$/],
    "border-color": COLOR_VALUE,
    "color": COLOR_VALUE,
    "background-color": COLOR_VALUE,
    "background": COLOR_VALUE,
    "font-size": SIZE_VALUE,
    "font-family": [/^[\w\s,'"–-]+$/],
    "font-weight": [/^(bold|bolder|lighter|normal|[1-9]00)$/],
    "font-style": [/^(italic|normal|oblique)$/],
    "text-align": [/^(left|right|center|justify)$/],
    "text-decoration": [/^[a-z\s-]+$/],
    "vertical-align": [/^(top|middle|bottom|baseline)$/],
    "line-height": SIZE_VALUE,
    "width": SIZE_VALUE,
    "max-width": SIZE_VALUE,
    "height": SIZE_VALUE,
    "margin": SPACING_VALUE,
    "margin-top": SIZE_VALUE,
    "margin-right": SIZE_VALUE,
    "margin-bottom": SIZE_VALUE,
    "margin-left": SIZE_VALUE,
    "padding": SPACING_VALUE,
    "padding-top": SIZE_VALUE,
    "padding-right": SIZE_VALUE,
    "padding-bottom": SIZE_VALUE,
    "padding-left": SIZE_VALUE,
    "border": BORDER_VALUE,
    "border-top": BORDER_VALUE,
    "border-right": BORDER_VALUE,
    "border-bottom": BORDER_VALUE,
    "border-left": BORDER_VALUE,
    "border-radius": SPACING_VALUE,
    "border-collapse": [/^(collapse|separate)$/],
  },
};

export const EMAIL_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "a", "abbr", "address", "b", "bdi", "bdo", "blockquote", "br", "caption",
    "center", "cite", "code", "col", "colgroup", "dd", "div", "dl", "dt",
    "em", "figcaption", "figure", "font", "h1", "h2", "h3", "h4", "h5", "h6",
    "hr", "i", "img", "li", "mark", "ol", "p", "pre", "q", "s", "small",
    "span", "strike", "strong", "sub", "sup", "table", "tbody", "td",
    "tfoot", "th", "thead", "time", "tr", "u", "ul", "wbr",
  ],
  // script/iframe/object/embed/form/style/svg/math are NOT listed → discarded
  // (script/style contents are dropped entirely via default nonTextTags).
  allowedAttributes: {
    "*": ["hidden", "style", "align", "valign", "dir", "lang", "title"],
    div: ["data-lxp-email-body", "data-lxp-email-html"],
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "width", "height", "title"],
    td: ["colspan", "rowspan", "width", "height", "bgcolor", "nowrap"],
    th: ["colspan", "rowspan", "width", "height", "bgcolor", "scope"],
    table: ["border", "cellpadding", "cellspacing", "width", "bgcolor"],
    col: ["span", "width"],
    font: ["color", "face", "size"],
    ol: ["start", "type"],
    time: ["datetime"],
  },
  // `on*` handlers are never in the allowlist → always stripped.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {
    // Images: https + cid (inline attachments) only — no http/data/javascript.
    img: ["https", "cid"],
  },
  allowProtocolRelative: false,
  allowedStyles: BOUNDED_STYLES,
  disallowedTagsMode: "discard",
  // Any <a> that survives opens outside the panel origin without an opener.
  transformTags: {
    html: (_tag, attrs) => ({tagName:"div", attribs:{...attrs,"data-lxp-email-html":""}}),
    body: (_tag, attrs) => ({tagName:"div", attribs:{...attrs,"data-lxp-email-body":"",style:(attrs.bgcolor ? `background-color:${attrs.bgcolor};` : "")+(attrs.style||"")}}),
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }, true),
  },
};

/** Sanitize an email HTML body for safe exposure through the API. */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  let inlined = html;
  try {
    inlined = juice(html, {preserveMediaQueries:false,preserveFontFaces:false,preserveKeyFrames:false,preservePseudos:false});
  } catch { /* Malformed CSS must not prevent reading the message. */ }
  return sanitizeHtml(inlined, EMAIL_SANITIZE_OPTIONS);
}
