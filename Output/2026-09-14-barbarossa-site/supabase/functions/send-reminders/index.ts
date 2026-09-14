// ============================================================
// Barbarossa — Rappel automatique 24h avant la soirée
//
// Cette fonction est appelée une fois par jour (voir schema.sql /
// section "planification" du README) : elle cherche les événements
// du lendemain, et envoie un email de rappel à chaque inscrit qui
// n'en a pas encore reçu un.
//
// Secrets requis (à définir avec `supabase secrets set`) :
//   RESEND_API_KEY   — clé API Resend
//   REMINDER_FROM    — adresse d'envoi, ex: "Barbarossa <resa@barbarossa-salernes.fr>"
// (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement)
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const REMINDER_FROM = Deno.env.get("REMINDER_FROM") ?? "Barbarossa <onboarding@resend.dev>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5).replace(":", "h");
}

async function sendReminderEmail(to: string, firstName: string, event: { title: string; description: string; event_date: string; event_time: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: REMINDER_FROM,
      to,
      subject: `Rappel — ${event.title} demain chez Barbarossa`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; color: #2b2a24;">
          <p style="font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #9c7c3f;">Barbarossa — Rappel</p>
          <h1 style="font-size: 22px; margin: 8px 0 16px;">C'est demain, ${firstName} !</h1>
          <p style="font-size: 15px; line-height: 1.6;">
            On vous attend pour <strong>${event.title}</strong>,
            ${formatDate(event.event_date)} à ${formatTime(event.event_time)}.
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #6e6656;">${event.description}</p>
          <p style="font-size: 13px; color: #948a72; margin-top: 24px;">Barbarossa — Salernes, Var</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend a refusé l'envoi (${res.status}): ${body}`);
  }
}

Deno.serve(async (_req) => {
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY manquant" }), { status: 500 });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDate = tomorrow.toISOString().slice(0, 10);

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, title, description, event_date, event_time")
    .eq("event_date", targetDate);

  if (eventsError) {
    return new Response(JSON.stringify({ error: eventsError.message }), { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const event of events ?? []) {
    const { data: registrations, error: regError } = await supabase
      .from("registrations")
      .select("id, first_name, email")
      .eq("event_id", event.id)
      .is("reminder_sent_at", null);

    if (regError) {
      failed++;
      continue;
    }

    for (const reg of registrations ?? []) {
      try {
        await sendReminderEmail(reg.email, reg.first_name, event);
        await supabase
          .from("registrations")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", reg.id);
        sent++;
      } catch (_e) {
        failed++;
      }
    }
  }

  return new Response(JSON.stringify({ targetDate, eventsChecked: events?.length ?? 0, sent, failed }), {
    headers: { "Content-Type": "application/json" },
  });
});
