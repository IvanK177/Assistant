export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  try {
    const url = new URL(req.url);
    // Strip /api/supabase prefix to get the real Supabase path
    const targetPath = url.pathname.replace(/^\/api\/supabase/, '');
    const targetUrl = `https://uvvehsnukzuujncwjwqq.supabase.co${targetPath}${url.search}`;

    const headers = new Headers();
    req.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      // Skip forbidden headers that fetch manages or shouldn't be forwarded
      if (!['host', 'connection', 'content-length'].includes(k)) {
        headers.set(key, value);
      }
    });

    const isBodyAllowed = req.method !== 'GET' && req.method !== 'HEAD';
    const body = isBodyAllowed ? await req.arrayBuffer() : undefined;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const resHeaders = new Headers(response.headers);
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    resHeaders.set('Access-Control-Allow-Headers', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders,
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message || 'Proxy error' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }
}
