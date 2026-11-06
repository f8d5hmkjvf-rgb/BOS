import { getContext } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Flux temps réel (Server-Sent Events) : missions, tâches, réunions, consultations, validations, coûts.
 * À la connexion : état courant (tâches en cours, conversations ouvertes) pour resynchroniser le QG.
 */
export async function GET(req: Request) {
  const { store, missing } = await getContext();
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        if (closed) return;
        controller.enqueue(enc.encode(`${id !== undefined ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      if (!store) {
        send("config", { missing });
        controller.close();
        return;
      }
      const lastHeader = Number(req.headers.get("last-event-id"));
      let last = Number.isFinite(lastHeader) && lastHeader > 0 ? lastHeader : await store.lastEventId();
      const db = store.db;
      const running = (await db.query("SELECT * FROM tasks WHERE status IN ('running','awaiting_approval') OR (status='pending' AND attempts > 0)")).rows;
      const open = (await db.query("SELECT c.*, COALESCE(json_agg(json_build_object('speaker', l.speaker, 'text', l.text) ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines FROM conversations c LEFT JOIN conversation_lines l ON l.conversation_id = c.id WHERE c.status='open' AND c.created_at > now() - interval '1 hour' GROUP BY c.id")).rows;
      send("snapshot", { tasks: running, conversations: open });
      const poll = async () => {
        try {
          const evs = await store.eventsSince(last);
          for (const e of evs) {
            last = e.id;
            send(e.kind, e.payload, e.id);
          }
        } catch {
          /* base momentanément indisponible : on réessaie au prochain tour */
        }
      };
      timer = setInterval(() => void poll(), 1000);
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      });
    },
    cancel() {
      closed = true;
      clearInterval(timer);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
