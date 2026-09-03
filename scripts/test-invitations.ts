/**
 * Project invitation live checks (pg 0010).
 *
 * Exercises the invitation RPCs end-to-end against a real Supabase project,
 * using the canonical demo users (aravind admin / revathi + karthik members).
 *
 * Covers:
 *   invitation creation
 *   invited role
 *   pending status
 *   cancellation
 *   acceptance
 *   duplicate acceptance prevention
 *   cancelled-invitation rejection
 *   cross-family rejection
 *   unauthorized invitation management (non-owner contributor)
 *
 * Run with: npm run db:test-invitations
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_PASSWORD = "FamilyPurse#2026";

if (!url || !anonKey || !serviceKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const SRV_URL = url!;
const SRV_ANON = anonKey!;

const service = createClient(SRV_URL, serviceKey!);

const GOA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const ARAVIND = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const REVATHI = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const KARTHIK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ok: boolean, name: string, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

async function asUser(
  email: string,
): Promise<SupabaseClient> {
  const client = createClient(SRV_URL, SRV_ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: DEMO_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  client.auth.setSession(data.session);
  return client;
}

async function main() {
  console.log("Project invitation live checks against", SRV_URL);

  const probe = await service.from("users").select("id").limit(1).maybeSingle();
  if (probe.error || !probe.data) {
    console.error("users table empty/missing — run migrations + `npm run db:seed-demo` first.");
    process.exit(1);
  }

  const aravind = await asUser("aravind@example.com");
  const karthik = await asUser("karthik@example.com");

  // ------------------------------------------------------------------
  // 0. Ensure the Goa project is in a known state: Revathi must NOT be
  //    a member so we can invite her.
  // ------------------------------------------------------------------
  console.log("\n[0] Reset Goa team to Aravind (owner) + Karthik (contributor)");
  {
    const { error } = await service
      .schema("public")
      .from("project_members")
      .delete()
      .eq("project_id", GOA);
    if (error) {
      console.error("  reset failed:", error.message);
      process.exit(1);
    }
  }
  {
    const { error } = await service.schema("public").from("project_members").insert([
      { project_id: GOA, user_id: ARAVIND, role: "owner" },
      { project_id: GOA, user_id: KARTHIK, role: "contributor" },
    ]);
    if (error) {
      console.error("  reset failed:", error.message);
      process.exit(1);
    }
  }
  check(true, "Goa team reset (Aravind owner, Karthik contributor, Revathi absent)");

  // Clean all previous invitations for Goa
  await service.from("project_invitations").delete().eq("project_id", GOA);

  // ------------------------------------------------------------------
  // 1. Unauthorized: Karthik (contributor, not owner/admin) cannot create
  //    an invitation.
  // ------------------------------------------------------------------
  console.log("\n[1] Unauthorized invitation creation");
  {
    const { data, error } = await karthik.rpc("fp_create_project_invitation", {
      p_project: GOA,
      p_invitee: REVATHI,
      p_role: "contributor",
    });
    check(error !== null, "non-owner contributor is rejected", error?.message);
    check(data === null, "no invitation row returned");
  }

  // ------------------------------------------------------------------
  // 2. Admin creates an invitation with a chosen role.
  // ------------------------------------------------------------------
  console.log("\n[2] Create invitation (Owner role)");
  let token = "";
  let invitationId = "";
  {
    const { data, error } = await aravind.rpc("fp_create_project_invitation", {
      p_project: GOA,
      p_invitee: REVATHI,
      p_role: "owner",
    });
    check(error === null, "admin creates invitation", error?.message);
    if (error || !data) {
      console.error("  cannot continue without an invitation");
      process.exit(1);
    }
    const row = data as { id: string; token: string; role: string; status: string };
    token = row.token;
    invitationId = row.id;
    check(row.role === "owner", "stored role is owner");
    check(row.status === "pending", "status is pending");
    check(row.token.length > 0, "token generated");
  }

  // ------------------------------------------------------------------
  // 3. Pending status persisted in DB.
  // ------------------------------------------------------------------
  console.log("\n[3] Pending status persisted");
  {
    const { data } = await service
      .from("project_invitations")
      .select("status, role")
      .eq("id", invitationId)
      .single();
    check(data?.status === "pending", "DB status = pending");
    check(data?.role === "owner", "DB role = owner");
  }

  // ------------------------------------------------------------------
  // 4. Duplicate pending invitation is rejected.
  // ------------------------------------------------------------------
  console.log("\n[4] Duplicate pending invitation rejected");
  {
    const { error } = await aravind.rpc("fp_create_project_invitation", {
      p_project: GOA,
      p_invitee: REVATHI,
      p_role: "viewer",
    });
    check(error !== null, "duplicate pending invitation rejected", error?.message);
  }

  // ------------------------------------------------------------------
  // 5. Cancellation.
  // ------------------------------------------------------------------
  console.log("\n[5] Cancel invitation");
  {
    const { data, error } = await aravind.rpc("fp_cancel_project_invitation", {
      p_invitation_id: invitationId,
    });
    check(error === null, "admin cancels pending invitation", error?.message);
    check((data as { status?: string })?.status === "cancelled", "returns cancelled");
    const { data: db } = await service
      .from("project_invitations")
      .select("status, cancelled_at")
      .eq("id", invitationId)
      .single();
    check(db?.status === "cancelled", "DB status = cancelled");
    check(db?.cancelled_at != null, "cancelled_at timestamp set");
  }

  // ------------------------------------------------------------------
  // 6. Cancelled invitation cannot be accepted.
  // ------------------------------------------------------------------
  console.log("\n[6] Cancelled invitation cannot be accepted");
  {
    const revathi = await asUser("revathi@example.com");
    const { error } = await revathi.rpc("fp_accept_project_invitation", {
      p_token: token,
    });
    check(error !== null, "cancelled invitation rejected", error?.message);
  }

  // ------------------------------------------------------------------
  // 7. Re-create invitation and accept it.
  // ------------------------------------------------------------------
  console.log("\n[7] Create + accept invitation");
  let acceptToken = "";
  {
    const { data, error } = await aravind.rpc("fp_create_project_invitation", {
      p_project: GOA,
      p_invitee: REVATHI,
      p_role: "viewer",
    });
    check(error === null, "re-create invitation", error?.message);
    acceptToken = (data as { token: string }).token;
  }
  {
    const revathi = await asUser("revathi@example.com");
    const { data, error } = await revathi.rpc("fp_accept_project_invitation", {
      p_token: acceptToken,
    });
    check(error === null, "invitee accepts invitation", error?.message);
    const row = data as { project_id: string; role: string; status: string };
    check(row.status === "accepted", "returns accepted");
    check(row.role === "viewer", "role stored as viewer");
  }
  {
    // Verify membership was created with the invited role
    const { data } = await service
      .from("project_members")
      .select("user_id, role")
      .eq("project_id", GOA)
      .eq("user_id", REVATHI)
      .single();
    check(data?.role === "viewer", "membership created with exact role (viewer)");
  }
  {
    // Verify invitation marked accepted + accepted_at set
    const { data } = await service
      .from("project_invitations")
      .select("status, accepted_at")
      .eq("token", acceptToken)
      .single();
    check(data?.status === "accepted", "invitation marked accepted");
    check(data?.accepted_at != null, "accepted_at timestamp set");
  }

  // ------------------------------------------------------------------
  // 8. Already-accepted invitation cannot be accepted twice.
  // ------------------------------------------------------------------
  console.log("\n[8] Duplicate acceptance prevented");
  {
    const revathi = await asUser("revathi@example.com");
    const { error } = await revathi.rpc("fp_accept_project_invitation", {
      p_token: acceptToken,
    });
    check(error !== null, "duplicate acceptance rejected", error?.message);
  }

  // ------------------------------------------------------------------
  // 9. A different user cannot accept an invitation meant for someone else.
  // ------------------------------------------------------------------
  console.log("\n[9] Wrong-user acceptance rejected");
  {
    // Remove Karthik from Goa so we can invite him
    await service
      .schema("public")
      .from("project_members")
      .delete()
      .eq("project_id", GOA)
      .eq("user_id", KARTHIK);
    // Create an invitation for Karthik, then have Revathi try to accept it
    const { data, error } = await aravind.rpc("fp_create_project_invitation", {
      p_project: GOA,
      p_invitee: KARTHIK,
      p_role: "contributor",
    });
    check(error === null, "invite Karthik (now non-member)", error?.message);
    const karthikToken = (data as { token: string }).token;
    const revathi = await asUser("revathi@example.com");
    const { error: acceptErr } = await revathi.rpc("fp_accept_project_invitation", {
      p_token: karthikToken,
    });
    check(acceptErr !== null, "wrong user cannot accept", acceptErr?.message);
  }

  // ------------------------------------------------------------------
  // 10. Cross-family rejection.
  // ------------------------------------------------------------------
  console.log("\n[10] Cross-family rejection");
  {
    // Create a throwaway foreign user and have them create their own family
    // on the server side via the canonical create_family RPC.
    const extEmail = `foreign-${Date.now()}@example.com`;
    const extRes = await service.auth.admin.createUser({
      email: extEmail,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    const extUserId = extRes.data?.user?.id;
    if (extUserId) {
      const foreign = await asUser(extEmail);
      const famRes = await foreign.rpc("create_family", { family_name: "Foreign Family (test)" });
      const famId = typeof famRes.data === "string" ? famRes.data : (famRes.data as { id?: string } | null)?.id;
      check(Boolean(famId), "foreign user created own family", famRes.error?.message);

      // Foreign user cannot accept a Goa invitation (different family)
      const { error: acceptErr } = await foreign.rpc("fp_accept_project_invitation", {
        p_token: acceptToken,
      });
      check(acceptErr !== null, "foreign-family user cannot accept", acceptErr?.message);

      // Foreign user cannot create an invitation for Goa
      const { error: createErr } = await foreign.rpc("fp_create_project_invitation", {
        p_project: GOA,
        p_invitee: REVATHI,
        p_role: "contributor",
      });
      check(createErr !== null, "foreign-family user cannot create invitation", createErr?.message);

      // Foreign user cannot cancel a Goa invitation
      const { error: cancelErr } = await foreign.rpc("fp_cancel_project_invitation", {
        p_invitation_id: invitationId,
      });
      check(cancelErr !== null, "foreign-family user cannot cancel invitation", cancelErr?.message);

      // cleanup throwaway user + their family
      if (famId) await service.from("families").delete().eq("id", famId);
      await service.auth.admin.deleteUser(extUserId);
    } else {
      console.log("  (skip cross-family: could not create foreign user)");
    }
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("Failures:", failures);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
