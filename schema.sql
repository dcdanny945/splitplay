-- ============================================================
-- SplitPlay database schema
-- Paste this whole file into: Supabase -> SQL Editor -> New query -> Run
-- Safe to re-run (uses "if not exists" / "or replace").
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- Events ----------
create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  event_date date,
  time_label text,
  location text,
  description text,
  total_cost numeric(10,2) not null default 60.00,
  max_participants int not null default 12,
  -- max people allowed on the waitlist (split mode); they backfill failed/withdrawn spots
  max_waitlist int not null default 2,
  -- 'split' = save card, auto-charge each person at settlement
  -- 'fixed' = pay immediately at registration (total / max spots)
  payment_mode text not null default 'split'
    check (payment_mode in ('split','fixed')),
  -- required for split mode; null for fixed mode
  settlement_time timestamptz,
  status text not null default 'open'
    check (status in ('open','settled','cancelled')),
  -- false = hidden from registrants (still visible in the admin dashboard)
  visible boolean not null default true,
  created_at timestamptz default now()
);

-- ---------- Participants ----------
create table if not exists participants (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid references events(id) on delete cascade,
  name text not null,
  email text not null,
  stripe_customer_id text,
  stripe_payment_method_id text,
  list_type text not null default 'confirmed'
    check (list_type in ('confirmed','waitlist')),
  position int not null,
  registered_at timestamptz default now(),
  charge_status text not null default 'pending'
    check (charge_status in ('pending','charged','failed')),
  stripe_payment_intent_id text,
  amount_charged numeric(10,2),
  email_sent boolean not null default false
);

create index if not exists idx_participants_event
  on participants(event_id, list_type, position);

-- ---------- Auto-promote the first waitlister when a confirmed person withdraws ----------
create or replace function promote_from_waitlist()
returns trigger as $$
declare
  max_p int;
  confirmed_count int;
  next_waitlist record;
begin
  if OLD.list_type <> 'confirmed' then return OLD; end if;

  select max_participants into max_p from events where id = OLD.event_id;
  select count(*) into confirmed_count
    from participants
    where event_id = OLD.event_id and list_type = 'confirmed';

  if confirmed_count < max_p then
    select * into next_waitlist
      from participants
      where event_id = OLD.event_id and list_type = 'waitlist'
      order by position asc
      limit 1;

    if found then
      update participants
        set list_type = 'confirmed', position = confirmed_count + 1
        where id = next_waitlist.id;
    end if;
  end if;

  return OLD;
end;
$$ language plpgsql;

drop trigger if exists trg_promote_waitlist on participants;
create trigger trg_promote_waitlist
  after delete on participants
  for each row execute function promote_from_waitlist();

-- ---------- Lock the tables down ----------
-- All access goes through the Next.js server using the service-role key, which
-- bypasses RLS. Enabling RLS with no policies blocks the public anon key from
-- reading/writing these tables directly.
alter table events enable row level security;
alter table participants enable row level security;
