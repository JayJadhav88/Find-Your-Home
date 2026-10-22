import { createUserClient } from "@/lib/supabase";

// Serves a page the team wrote in HTML, exactly as written (styles and scripts included),
// inside a browser sandbox: the Content-Security-Policy "sandbox" directive without
// allow-same-origin gives the page an opaque origin, so its scripts cannot read this
// site's cookies, local storage or anyone's sign-in, whether it is opened directly or
// shown inside the site's layout (HtmlPageFrame).

const SANDBOX =
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation";

// Added only when shown inside the site layout: links open in the whole window, and the
// page tells the frame its height.
const EMBED_HEAD =
  '<base target="_top"><script>(function(){function s(){parent.postMessage({fyhPageHeight:document.documentElement.scrollHeight},"*")}' +
  'addEventListener("load",s);if(window.ResizeObserver){new ResizeObserver(s).observe(document.documentElement)}})();</script>';

export async function GET(request: Request, { params }: RouteContext<"/pages/[slug]/raw">) {
  const { slug } = await params;
  const embed = new URL(request.url).searchParams.get("embed") === "1";
  const supabase = await createUserClient();
  const { data: page } = await supabase
    .from("content_pages")
    .select("title, body_html, format, is_published")
    .eq("slug", slug)
    .maybeSingle();

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `${SANDBOX}; frame-ancestors 'self'`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Drafts are only visible to the team, so never cache them.
    "Cache-Control": page?.is_published ? "public, max-age=60" : "private, no-store",
  });
  if (!page || page.format !== "html") {
    return new Response("<!doctype html><title>Not found</title><p>This page does not exist.</p>", { status: 404, headers });
  }
  if (!page.is_published) headers.set("X-Robots-Tag", "noindex");
  return new Response(documentFor(page.body_html, page.title, embed ? EMBED_HEAD : ""), { headers });
}

/** The team's HTML as a full document: kept as is when it already is one, wrapped otherwise. */
function documentFor(html: string, title: string, extraHead: string) {
  if (/<html[\s>]/i.test(html)) {
    if (!extraHead) return html;
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (tag) => tag + extraHead);
    return html.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${extraHead}</head>`);
  }
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    extraHead,
    "</head>",
    "<body>",
    html,
    "</body>",
    "</html>",
  ].join("\n");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
