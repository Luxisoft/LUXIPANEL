// SPDX-License-Identifier: AGPL-3.0-only
import sanitizeHtml from "sanitize-html";
import * as cheerio from "cheerio";
import postcss, { type Container, type Declaration } from "postcss";
import selectorParser from "postcss-selector-parser";
import { BOUNDED_STYLES, EMAIL_SANITIZE_OPTIONS } from "./mail-html-sanitizer.js";

export const EMAIL_DOCUMENT_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: cid:; font-src https:; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
const validValue = (property: string, value: string) =>
  BOUNDED_STYLES["*"]?.[property]?.some((pattern) => pattern.test(value)) ?? false;
function validSelector(selector: string): boolean {
  if (selector.length > 1024) return false;
  let safe = true;
  try {
    selectorParser((root) =>
      root.walk((node) => {
        if (
          ![
            "root",
            "selector",
            "tag",
            "class",
            "id",
            "universal",
            "combinator",
            "pseudo",
            "attribute",
          ].includes(node.type)
        )
          safe = false;
        if (
          node.type === "pseudo" &&
          !/^:(?:first-child|last-child|only-child|empty|nth-child\([\d\s+n-]+\))$/.test(node.toString())
        )
          safe = false;
      }),
    ).processSync(selector);
  } catch {
    return false;
  }
  return safe;
}
function validFontSource(value: string): boolean {
  const match = value.match(
    /^url\(\s*['"]?(https:\/\/[^\s'"<>\\()]+)['"]?\s*\)(?:\s+format\(['"]?(woff2?)['"]?\))?$/i,
  );
  if (!match) return false;
  try {
    const url = new URL(match[1]!);
    return !url.username && !url.password && /\.woff2?$/i.test(url.pathname);
  } catch {
    return false;
  }
}
/** Styles stay exclusively in an opaque, scriptless iframe; no remote CSS is fetched. */
export function sanitizeEmailCss(css: string): string {
  if (css.length > 256000) return "";
  try {
    const root = postcss.parse(css);
    let rules = 0;
    const filter = (parent: Container, depth = 0) => {
      for (const node of [...(parent.nodes || [])]) {
        if (node.type === "comment") {
          node.remove();
          continue;
        }
        if (node.type === "atrule") {
          if (
            node.name.toLowerCase() === "media" &&
            depth < 2 &&
            /^(?:(?:only\s+)?screen\s+and\s+)?\((?:min|max)-width:\s*\d+(?:\.\d+)?px\)$/i.test(node.params)
          ) {
            filter(node, depth + 1);
          } else if (node.name.toLowerCase() === "font-face" && node.nodes) {
            for (const entry of [...node.nodes]) {
              if (entry.type !== "decl") {
                entry.remove();
                continue;
              }
              const decl = entry as Declaration;
              const safe =
                decl.prop === "src"
                  ? validFontSource(decl.value)
                  : ["font-family", "font-style", "font-weight"].includes(decl.prop) &&
                    (validValue(decl.prop, decl.value) ||
                      (decl.prop === "font-weight" && /^\d{3}\s+\d{3}$/.test(decl.value)));
              if (!safe) entry.remove();
            }
            if (!node.nodes.some((n) => n.type === "decl" && n.prop === "src")) node.remove();
          } else node.remove();
        } else if (node.type === "rule") {
          if (++rules > 2000 || !validSelector(node.selector)) {
            node.remove();
            continue;
          }
          for (const entry of [...node.nodes])
            if (entry.type !== "decl" || !validValue(entry.prop.toLowerCase(), entry.value)) entry.remove();
        } else node.remove();
      }
    };
    filter(root);
    return root.toString().replace(/</g, "\\3c ");
  } catch {
    return "";
  }
}
export function sanitizeEmailDocument(html: string | null | undefined): string {
  if (!html?.trim()) return "";
  const original = cheerio.load(html);
  const css = sanitizeEmailCss(
    original("style")
      .map((_index, element) => original(element).text())
      .get()
      .join("\n"),
  );
  const attributes = EMAIL_SANITIZE_OPTIONS.allowedAttributes || {};
  const clean = sanitizeHtml(html, {
    ...EMAIL_SANITIZE_OPTIONS,
    allowedTags: [...(EMAIL_SANITIZE_OPTIONS.allowedTags as string[]), "html", "head", "body"],
    allowedAttributes: {
      ...attributes,
      "*": [...(attributes["*"] || []), "class", "id", "role", "aria-hidden"],
      body: ["bgcolor", "text"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }, true),
    },
  });
  const doc = cheerio.load(clean);
  doc("head")
    .empty()
    .append(
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">',
    );
  doc("<meta>")
    .attr("http-equiv", "Content-Security-Policy")
    .attr("content", EMAIL_DOCUMENT_CSP)
    .prependTo(doc("head"));
  doc("head").append(
    "<style>html{background:#fff;color:#111;color-scheme:light}body{margin:0;padding:0;font:14px/1.5 Arial,sans-serif}pre{white-space:pre-wrap}</style>",
  );
  doc("head").append("<style>" + css + "</style>");
  return "<!doctype html>" + doc.html();
}
