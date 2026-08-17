-- ═══════════════════════════════════════════════════════════════════════════
-- Herd Manager — CRITICAL security migration (audit item S1)
-- Run in: Supabase dashboard → SQL Editor → New query → paste → Run
--
-- WHY: the anon key is public (it ships in the app's JavaScript). It is only
-- safe when Row Level Security restricts what it can reach. Right now the
-- `herd` table has no RLS, so anyone who views the page source can read your
-- entire herd — including new owners' names, addresses and phone numbers —
-- or delete all of it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── STEP 1 ────────────────────────────────────────────────────────────────
-- Add a revision counter (audit item B2 — makes the conflict guard atomic).
alter table public.herd add column if not exists rev bigint not null default 0;

-- ── STEP 2 ────────────────────────────────────────────────────────────────
-- Turn RLS on. With no policies, the anon key can no longer touch this table.
alter table public.herd enable row level security;

-- ── STEP 3 ────────────────────────────────────────────────────────────────
-- Allow access ONLY to signed-in users.
drop policy if exists "authenticated full access" on public.herd;
create policy "authenticated full access" on public.herd
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── STEP 4 (do this in the dashboard, not SQL) ────────────────────────────
-- Authentication → Providers → Email → enable.
-- Authentication → Users → "Add user" → create ONE shared account for you and
-- your partner (e.g. herd@yourdomain.com) and set a strong password.
--
-- ⚠️ IMPORTANT: after running this, the app CANNOT read or write until the
-- sign-in screen is added (see REMAINING_WORK.md). Do these together, or run
-- steps 2-3 only when you're ready to deploy the login build.

-- ── Verify ────────────────────────────────────────────────────────────────
select tablename, rowsecurity from pg_tables where tablename = 'herd';
select policyname, cmd from pg_policies where tablename = 'herd';
