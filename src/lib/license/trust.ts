import { readFile } from "node:fs/promises";
import { join } from "node:path";
export const CUSTOMER_PUBLIC_KEY_PATH = join(process.cwd(), "resources", "license-public-key.pem");
export async function getTrustedPublicKey() { if (process.env.NODE_ENV !== "production") { const developmentKey = process.env.LICENSE_PUBLIC_KEY_PEM?.replace(/\\n/g, "\n"); if (developmentKey) return developmentKey; } try { const key = await readFile(CUSTOMER_PUBLIC_KEY_PATH, "utf8"); return key.includes("BEGIN PUBLIC KEY") ? key : null; } catch { return null; } }