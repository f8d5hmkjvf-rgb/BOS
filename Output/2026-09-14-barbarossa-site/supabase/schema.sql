-- ============================================================
-- Barbarossa — Calendrier des soirées & inscriptions
-- Schéma Supabase (Postgres + RLS)
--
-- À exécuter une fois dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Événements ----------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  event_date date not null,
  event_time time not null,
  accent text not null default 'gold' check (accent in ('gold', 'green', 'terracotta', 'olive')),
  created_at timestamptz not null default now()
);

comment on table public.events is 'Soirées à thème affichées sur la page publique.';
comment on column public.events.accent is 'Couleur du visuel généré (pas de vraie photo pour l''instant).';

-- ---------- Inscriptions ----------

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  first_name text not null,
  email text not null,
  phone text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

comment on table public.registrations is 'Inscriptions du public à une soirée. Email obligatoire (canal de rappel actif) ; téléphone optionnel.';

create index if not exists registrations_event_id_idx on public.registrations(event_id);
create index if not exists events_event_date_idx on public.events(event_date);

-- ---------- Sécurité (Row Level Security) ----------

alter table public.events enable row level security;
alter table public.registrations enable row level security;

-- Tout le monde peut lire les événements (page publique)
create policy "events are publicly readable"
  on public.events for select
  to anon, authenticated
  using (true);

-- Seul un compte connecté (l'admin) peut créer/modifier/supprimer des événements
create policy "only authenticated can manage events"
  on public.events for all
  to authenticated
  using (true)
  with check (true);

-- N'importe qui peut s'inscrire (formulaire public), mais personne côté
-- public ne peut lire/modifier/supprimer les inscriptions des autres.
create policy "anyone can register"
  on public.registrations for insert
  to anon, authenticated
  with check (true);

create policy "only authenticated can read registrations"
  on public.registrations for select
  to authenticated
  using (true);

create policy "only authenticated can delete registrations"
  on public.registrations for delete
  to authenticated
  using (true);
