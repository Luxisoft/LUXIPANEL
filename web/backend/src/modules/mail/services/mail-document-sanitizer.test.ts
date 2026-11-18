import { describe, it, expect } from "vitest";
import { sanitizeEmailDocument, sanitizeEmailCss, EMAIL_DOCUMENT_CSP } from "./mail-document-sanitizer.js";
import { sanitizeEmailHtml } from "./mail-html-sanitizer.js";
import { sample } from "./mail-document.fixture.js";

describe("email presentation document", () => {
  it("keeps hidden preheaders, Unicode, media queries, classes and centering", () => {
    const html = sanitizeEmailDocument(sample);
    expect(html).toContain("display:none");
    expect(html).toContain("overflow:hidden");
    expect(html).toContain("max-height:0");
    expect(html).toContain("@media only screen and (max-width:600px)");
    expect(html).toContain('class="welcome-page-content"');
    expect(html).toContain("margin:0 auto");
    expect(html).toContain("বাংলা ক্‌ষ");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain(EMAIL_DOCUMENT_CSP);
  });
  it("keeps the conservative fragment compatible while hiding the same preheader", () => {
    const html = sanitizeEmailHtml(sample);
    expect(html).toContain("display:none");
    expect(html).not.toContain("<style");
    expect(html).toContain("margin:0 auto");
  });
  it("strips scripts, events, hostile URLs, foreign frames, refresh and remote stylesheets", () => {
    const html = sanitizeEmailDocument(
      '<meta http-equiv="refresh" content="0;url=https://evil.test"><link rel="stylesheet" href="https://evil.test/x.css"><script>alert(1)</script><iframe src="https://evil.test"></iframe><img src="https://ok.test/a.png" onerror="alert(1)"><a href="javascript:alert(1)">Link</a><form><input></form>',
    );
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("evil.test");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<form");
    expect(html).toContain("noopener noreferrer");
  });
  it("filters CSS declarations and selectors, allowing bounded HTTPS font faces", () => {
    const css = sanitizeEmailCss(
      '@import "https://evil.test/a.css";@font-face{font-family:Inter;src:url(https://fonts.example.test/inter.woff2) format("woff2");font-weight:100 900}.ok{color:red;position:fixed;background-image:url(javascript:evil);width:100%}body:has(img){color:blue}@media print{body{color:red}}',
    );
    expect(css).not.toContain("@import");
    expect(css).not.toContain("position");
    expect(css).not.toContain("javascript");
    expect(css).not.toContain(":has");
    expect(css).not.toContain("@media print");
    expect(css).toContain("inter.woff2");
    expect(css).toContain("color:red");
  });
  it("fails closed for malformed CSS and an unsafe font source", () => {
    expect(sanitizeEmailCss("a{color:red")).toBe("");
    expect(sanitizeEmailCss("@font-face{font-family:Bad;src:url(data:fake)}")).not.toContain("@font-face");
  });
});
