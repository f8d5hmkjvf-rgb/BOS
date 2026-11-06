import { ensureDemoFeed, listMissions, subscribe } from "@/server/missions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Synchronisation temps réel (Server-Sent Events) des statuts de missions. */
export async function GET(req: Request) {
  ensureDemoFeed();
  const enc = new TextEncoder();
  let unsub = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("snapshot", listMissions());
      unsub = subscribe((m) => send("mission", m));
      ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 15000);
      req.signal.addEventListener("abort", () => {
        unsub();
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      });
    },
    cancel() {
      unsub();
      clearInterval(ping);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
