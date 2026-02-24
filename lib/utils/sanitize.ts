/**
 * HTML Sanitization Utility
 * XSS 공격 방어를 위한 DOMPurify 래퍼
 */

// Client-side에서만 DOMPurify 사용
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ""

  // Server-side에서는 기본 이스케이프만 수행
  if (typeof window === "undefined") {
    // 서버 사이드에서는 기본적인 HTML 이스케이프
    return html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }

  // Client-side에서는 DOMPurify 사용
  try {
    const DOMPurify = require("dompurify")
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "em", "u", "b", "i", "s", "strike",
        "sub", "sup",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th",
        "div", "span", "a", "img", "blockquote", "pre", "code",
        // contentEditable(document.execCommand) 기반 에디터가 생성하는 태그들
        "font", "mark",
        // 구분선
        "hr"
      ],
      ALLOWED_ATTR: [
        "href", "src", "alt", "title", "class", "style", "colspan", "rowspan",
        "width", "height", "align", "valign",
        // font 태그/에디터 서식 유지용
        "face", "color", "size"
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      KEEP_CONTENT: true,
    })
  } catch (error) {
    console.error("DOMPurify sanitization error:", error)
    // Fallback: 기본 이스케이프
    return html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }
}
