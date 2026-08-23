import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() { try { await db.$queryRaw`SELECT 1`; return Response.json({ status: "ready", database: "connected" }, { headers: { "Cache-Control": "no-store" } }); } catch { return Response.json({ status: "not_ready", database: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); } }