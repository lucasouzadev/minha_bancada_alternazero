const SECURITY: Record<string, string> = Object.fromEntries([["Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; font-src 'self' data:; connect-src 'self' blob: data: https://*.supabase.co wss://*.supabase.co; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"], ["X-Content-Type-Options", "nosniff"], ["X-Frame-Options", "DENY"], ["Referrer-Policy", "strict-origin-when-cross-origin"], ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"], ["Strict-Transport-Security", "max-age=63072000; includeSubDomains"], ["Cross-Origin-Opener-Policy", "same-origin"]]);

// Serve o app (index.html) com as tags Open Graph da caixa — é o que o WhatsApp lê.
const esc = (v: unknown) => String(v ?? '').slice(0, 300).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (v: unknown) => (typeof v === 'string' ? v : '');

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') || '').slice(0, 120).replace(/[^a-z0-9-]/gi, '');
  const shell = await fetch(new URL('/index.html', url.origin)).then((r) => r.text());
  const headers = { ...SECURITY, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=60, stale-while-revalidate=600' };

  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key || !slug) return new Response(shell, { headers });

  try {
    const r = await fetch(`${base}/rest/v1/drops?slug=eq.${encodeURIComponent(slug)}&published=eq.true&select=id,data,updated_at&limit=1`, { headers: { apikey: key } });
    const row = (await r.json())?.[0];
    if (!row) return new Response(shell, { headers });
    const d = row.data ?? {};
    const title = text(d.name) || 'Acervo';
    const items = Array.isArray(d.items) ? d.items.map(text) : [];
    const bits = [text(d.subtitle), ...items.slice(0, 3)].filter(Boolean);
    const desc = text(d.tagline) || (bits.length ? bits.join(' · ') : 'Veja, gire e abra a caixa em 3D.');
    const img = `${base}/storage/v1/object/public/caixas/${encodeURIComponent(String(row.id))}/og.jpg?v=${encodeURIComponent(String(row.updated_at))}`;
    const page = `${url.origin}/c/${slug}`;
    const tags = `<title>${esc(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Acervo" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${esc(page)}" />
  <meta property="og:image" content="${esc(img)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />`;
    return new Response(shell.replace(/<!--og:start-->[\s\S]*<!--og:end-->/, () => tags), { headers });
  } catch {
    return new Response(shell, { headers });
  }
}
