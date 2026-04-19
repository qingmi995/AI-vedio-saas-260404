#!/usr/bin/env tsx
/**
 * Grant admin access to a user by email.
 *
 * Usage:
 *   pnpm script:set-admin <email>
 *
 * If no email is passed, ADMIN_EMAIL from .env.local is used.
 */

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const email = process.argv[2] || process.env.ADMIN_EMAIL;

if (!email) {
  console.error("Usage: pnpm script:set-admin <email>");
  console.error("Or set ADMIN_EMAIL in .env.local");
  process.exit(1);
}

async function run() {
  const [user] = await db
    .select({ id: users.id, email: users.email, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.error(`User not found: ${email}`);
    console.error("Log in once with this email first, then run the script again.");
    process.exit(1);
  }

  if (user.isAdmin) {
    console.log(`Already admin: ${user.email}`);
    return;
  }

  await db
    .update(users)
    .set({ isAdmin: true, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  console.log(`Granted admin access: ${user.email}`);
}

run()
  .catch((error) => {
    console.error("Failed to set admin:", error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
