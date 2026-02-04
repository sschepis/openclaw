import DOMPurify from "dompurify";
import { marked } from "marked";
import { truncateText } from "./format";

marked.setOptions({
  gfm: true,
  breaks: true,
  mangle: false,
  highlight: (code: any, lang: any) => highlightCode(code, lang),
} as any);

// Custom renderer for CSV
const renderer = {
  code(code: string, lang: string | undefined) {
    if (lang && lang.toLowerCase() === 'csv') {
      return renderCsvTable(code);
    }
    // Fallback to default behavior (return false to let marked handle it)
    return false;
  }
};

marked.use({ renderer } as any);

function renderCsvTable(csv: string): string {
  const rows = csv.trim().split('\n');
  if (rows.length === 0) return '';

  const parseRow = (row: string) => row.split(',').map(c => c.trim());
  
  const header = parseRow(rows[0]);
  const body = rows.slice(1).map(parseRow);

  return `
    <div class="table-wrapper" style="overflow-x: auto; margin: 1em 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr>${header.map(cell => `<th style="border: 1px solid var(--border); padding: 6px 10px; background: var(--secondary); font-weight: 600; text-align: left;">${escapeHtml(cell)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${body.map(row => `<tr>${row.map(cell => `<td style="border: 1px solid var(--border); padding: 6px 10px;">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function highlightCode(code: string, lang: string): string {
  // Simple regex-based highlighter for common languages
  // This is a lightweight fallback since we can't easily add heavy highlighting libraries
  
  const keywords = /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|type|interface)\b/g;
  const literals = /\b(true|false|null|undefined|NaN)\b/g;
  const strings = /(".*?"|'.*?'|`.*?`)/g;
  const comments = /(\/\/.*|\/\*[\s\S]*?\*\/)/g;
  const numbers = /\b\d+(\.\d+)?\b/g;

  if (!lang) return code;

  let highlighted = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (['js', 'ts', 'javascript', 'typescript', 'json'].includes(lang.toLowerCase())) {
    highlighted = highlighted
      .replace(strings, '<span style="color: #a5d6ff;">$1</span>')
      .replace(comments, '<span style="color: #8b949e;">$1</span>')
      .replace(keywords, '<span style="color: #ff7b72;">$1</span>')
      .replace(literals, '<span style="color: #79c0ff;">$1</span>')
      .replace(numbers, '<span style="color: #79c0ff;">$1</span>');
  }

  return highlighted;
}

const allowedTags = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
  "span",
];

const allowedAttrs = ["class", "href", "rel", "target", "title", "start", "style"];

let hooksInstalled = false;
const MARKDOWN_CHAR_LIMIT = 140_000;
const MARKDOWN_PARSE_LIMIT = 40_000;
const MARKDOWN_CACHE_LIMIT = 200;
const MARKDOWN_CACHE_MAX_CHARS = 50_000;
const markdownCache = new Map<string, string>();

function getCachedMarkdown(key: string): string | null {
  const cached = markdownCache.get(key);
  if (cached === undefined) {
    return null;
  }
  markdownCache.delete(key);
  markdownCache.set(key, cached);
  return cached;
}

function setCachedMarkdown(key: string, value: string) {
  markdownCache.set(key, value);
  if (markdownCache.size <= MARKDOWN_CACHE_LIMIT) {
    return;
  }
  const oldest = markdownCache.keys().next().value;
  if (oldest) {
    markdownCache.delete(oldest);
  }
}

function installHooks() {
  if (hooksInstalled) {
    return;
  }
  hooksInstalled = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof HTMLAnchorElement)) {
      return;
    }
    const href = node.getAttribute("href");
    if (!href) {
      return;
    }
    node.setAttribute("rel", "noreferrer noopener");
    node.setAttribute("target", "_blank");
  });
}

export function toSanitizedMarkdownHtml(markdown: string): string {
  const input = markdown.trim();
  if (!input) {
    return "";
  }
  installHooks();
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    const cached = getCachedMarkdown(input);
    if (cached !== null) {
      return cached;
    }
  }
  const truncated = truncateText(input, MARKDOWN_CHAR_LIMIT);
  const suffix = truncated.truncated
    ? `\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`
    : "";
  if (truncated.text.length > MARKDOWN_PARSE_LIMIT) {
    const escaped = escapeHtml(`${truncated.text}${suffix}`);
    const html = `<pre class="code-block">${escaped}</pre>`;
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: allowedAttrs,
    });
    if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
      setCachedMarkdown(input, sanitized);
    }
    return sanitized;
  }
  const rendered = marked.parse(`${truncated.text}${suffix}`) as string;
  const sanitized = DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttrs,
  });
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    setCachedMarkdown(input, sanitized);
  }
  return sanitized;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
