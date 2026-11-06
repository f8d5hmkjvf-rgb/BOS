import { getDb } from "@/orchestrator/db";
import { Store } from "@/orchestrator/store";

/** Base de test réelle (PostgreSQL). Les tests concernés sont ignorés si TEST_DATABASE_URL est absent. */
export const TEST_DB = process.env.TEST_DATABASE_URL ?? "";

export async function freshStore(): Promise<Store> {
  const db = await getDb(TEST_DB);
  await db.query(
    "TRUNCATE missions, tasks, agent_messages, conversations, conversation_lines, approvals, api_usage, events, automations, workers RESTART IDENTITY CASCADE",
  );
  return new Store(db);
}
