/**
 * /api/chat — ブラウザと Claude API の間に立つ中継役
 *
 * - API キーはここ（サーバー側）だけで使い、ブラウザには渡さない
 * - 合言葉（APP_PASSCODE）を知っている人だけが使える
 * - Claude の返事を、届いた分から少しずつブラウザに流す
 *
 * 必要な環境変数（Vercel の Settings → Environment Variables で設定）
 *   ANTHROPIC_API_KEY  Claude API のキー
 *   APP_PASSCODE       このアプリの合言葉（自分で決める）
 *   MODEL              （任意）使うモデル。初期値は応答が速い Haiku 4.5
 */
export const config = { runtime: 'edge' };

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_MESSAGES = 60;
const MAX_CHARS = 4000;
const MAX_SYSTEM_CHARS = 8000;

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** 長さに関係なく同じ時間で比べる（合言葉の総当たり対策） */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const passcode = process.env.APP_PASSCODE;
  if (!apiKey || !passcode) return json({ error: 'server_not_configured' }, 500);
  if (!safeEqual(req.headers.get('x-passcode') || '', passcode)) return json({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const { system, messages } = body || {};
  const valid =
    typeof system === 'string' &&
    system.length <= MAX_SYSTEM_CHARS &&
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= MAX_MESSAGES &&
    messages.every(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length > 0 &&
        m.content.length <= MAX_CHARS,
    ) &&
    messages[0].role === 'user' &&
    messages[messages.length - 1].role === 'user';
  if (!valid) return json({ error: 'bad_request' }, 400);

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.MODEL || DEFAULT_MODEL,
      max_tokens: 600,
      system,
      messages: messages.map(({ role, content }) => ({ role, content })),
      stream: true,
    }),
    signal: req.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const status = upstream.status === 429 || upstream.status === 529 ? 429 : 502;
    let detail = '';
    try { detail = (await upstream.text()).slice(0, 300); } catch {}
    console.error('Anthropic API error', upstream.status, detail);
    return json({ error: 'upstream', status: upstream.status }, status);
  }

  // Claude の SSE（イベントの流れ）から文字だけを取り出して、そのまま流す
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const reader = upstream.body.getReader();
  const stream = new ReadableStream({
    async start(controller) {
      let buf = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const event = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = event.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            let data;
            try { data = JSON.parse(line.slice(5).trim()); } catch { continue; }
            if (data.type === 'content_block_delta' && data.delta && data.delta.type === 'text_delta') {
              controller.enqueue(enc.encode(data.delta.text));
            } else if (data.type === 'error') {
              console.error('Anthropic stream error', data.error);
              controller.enqueue(enc.encode('[[ERROR]]'));
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
