// Supabase Edge Function：给“我”发邮件推送
// 部署：supabase functions deploy notify-email --no-verify-jwt
// 密钥：supabase secrets set RESEND_API_KEY=xxx NOTIFY_EMAIL=me@example.com
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const NOTIFY_EMAIL = Deno.env.get('NOTIFY_EMAIL') ?? ''
const FROM = Deno.env.get('RESEND_FROM') ?? '点菜小屋 <onboarding@resend.dev>'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { subject, html, text } = await req.json()
    if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
      return new Response(JSON.stringify({ skipped: true, reason: '未配置 RESEND_API_KEY / NOTIFY_EMAIL' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [NOTIFY_EMAIL],
        subject: subject || '点菜小屋 · 新消息',
        html: html || `<p>${text ?? ''}</p>`,
      }),
    })

    const data = await res.text()
    return new Response(data, { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
