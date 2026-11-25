// Splitsy push notifications (Supabase Edge Function).
// Called by the app right after someone adds a transaction. Sends a phone
// notification to every other group member who turned notifications on.
//
// Secrets it needs (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { expense_id } = await req.json()
    if (!expense_id) return json({ error: 'expense_id is required' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Only the person who added the transaction can trigger its notifications
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: auth } = await admin.auth.getUser(jwt)
    const caller = auth?.user
    if (!caller) return json({ error: 'Not signed in' }, 401)

    const { data: exp } = await admin.from('splitsy_expenses').select('id, created_by, group_id').eq('id', expense_id).single()
    if (!exp || exp.created_by !== caller.id) return json({ error: 'Not allowed' }, 403)

    // The database already created one notification per member (see schema.sql)
    const { data: notes } = await admin
      .from('splitsy_notifications')
      .select('user_id, title, body, share, expense_id')
      .eq('expense_id', expense_id)
    if (!notes?.length) return json({ sent: 0 })

    const { data: subs } = await admin.from('splitsy_push_subscriptions').select('*').in('user_id', notes.map((n) => n.user_id))
    if (!subs?.length) return json({ sent: 0 })

    const { data: group } = await admin.from('splitsy_groups').select('currency').eq('id', exp.group_id).single()
    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT') || 'mailto:hello@example.com',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    )

    let sent = 0
    const dead: string[] = []
    await Promise.all(
      subs.map(async (s) => {
        const n = notes.find((x) => x.user_id === s.user_id)
        if (!n) return
        const body = n.share ? `${n.body} · Your share: ${group?.currency || ''} ${Number(n.share).toFixed(2)}` : n.body
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: n.title, body, url: `/splitsy/#/expense/${n.expense_id}`, tag: n.expense_id }),
          )
          sent++
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) dead.push(s.endpoint) // phone unsubscribed
        }
      }),
    )
    if (dead.length) await admin.from('splitsy_push_subscriptions').delete().in('endpoint', dead)
    return json({ sent })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
