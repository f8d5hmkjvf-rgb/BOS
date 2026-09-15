-- ============================================================
-- Barbarossa — Carte de fidélité digitale
-- Schéma Supabase (Postgres + RLS + fonctions sécurisées)
--
-- À exécuter une fois dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Clients ----------

create table if not exists public.loyalty_customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  phone text not null unique,
  points int not null default 0,
  lifetime_points int not null default 0,
  rewards_earned int not null default 0,
  last_visit timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.loyalty_customers is 'Un client = un profil fidélité. Le "phone" sert de clé pour éviter les doublons.';
comment on column public.loyalty_customers.points is 'Points depuis la dernière récompense (repart à 0 une fois échangée).';
comment on column public.loyalty_customers.lifetime_points is 'Total de points jamais gagnés (statistique, ne redescend jamais).';

create index if not exists loyalty_customers_last_visit_idx on public.loyalty_customers(last_visit desc nulls last);

-- ---------- Sécurité ----------
--
-- Le grand public (rôle "anon", c'est-à-dire n'importe quel visiteur du
-- site) n'a AUCUN accès direct à cette table — sinon n'importe qui
-- pourrait lister tous les numéros de téléphone via l'API. Il passe
-- uniquement par les deux fonctions ci-dessous ("RPC"), qui ne renvoient
-- jamais que les informations d'un seul client à la fois.
--
-- Le personnel connecté (rôle "authenticated", un seul compte partagé
-- pour le bar) peut lire toute la table (pour chercher un client par
-- téléphone, ou afficher la liste dans l'admin), mais n'écrit que via
-- les fonctions "loyalty_add_point" / "loyalty_redeem_reward" — jamais
-- de colonne "points" modifiable en écriture directe depuis le site.

alter table public.loyalty_customers enable row level security;

create policy "staff can read all customers"
  on public.loyalty_customers for select
  to authenticated
  using (true);

-- ---------- Inscription publique ----------
-- Crée le client s'il n'existe pas encore (par téléphone), ou renvoie
-- simplement son id existant s'il est déjà membre — pas de doublon.

create or replace function public.loyalty_signup(p_first_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if trim(p_first_name) = '' or trim(p_phone) = '' then
    raise exception 'Prénom et téléphone requis';
  end if;

  select id into v_id from public.loyalty_customers where phone = trim(p_phone);
  if v_id is not null then
    return v_id;
  end if;

  insert into public.loyalty_customers (first_name, phone)
  values (trim(p_first_name), trim(p_phone))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.loyalty_signup(text, text) from public;
grant execute on function public.loyalty_signup(text, text) to anon, authenticated;

-- ---------- Lecture publique de "ma carte" ----------
-- Ne renvoie que les champs utiles à l'affichage de la carte, pour UN
-- seul client désigné par son id (celui encodé dans le QR code / le
-- lien de la carte). Personne ne peut lister les autres clients avec ça.

create or replace function public.loyalty_get_card(p_id uuid)
returns table (first_name text, points int, lifetime_points int, rewards_earned int)
language sql
security definer
set search_path = public
stable
as $$
  select first_name, points, lifetime_points, rewards_earned
  from public.loyalty_customers
  where id = p_id;
$$;

revoke all on function public.loyalty_get_card(uuid) from public;
grant execute on function public.loyalty_get_card(uuid) to anon, authenticated;

-- ---------- Ajouter un point (personnel uniquement) ----------
-- Incrémente les points ; si le seuil est atteint, le signale (le
-- point n'est pas remis à zéro tout seul — c'est "loyalty_redeem_reward"
-- ci-dessous qui le fait, quand le staff confirme avoir servi la
-- consommation offerte).

create or replace function public.loyalty_add_point(p_customer_id uuid, p_threshold int)
returns table (points int, first_name text, reward_unlocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points int;
  v_first_name text;
begin
  update public.loyalty_customers
  set points = points + 1,
      lifetime_points = lifetime_points + 1,
      last_visit = now()
  where id = p_customer_id
  returning points, loyalty_customers.first_name into v_points, v_first_name;

  if v_points is null then
    raise exception 'Client introuvable';
  end if;

  return query select v_points, v_first_name, (v_points >= p_threshold);
end;
$$;

revoke all on function public.loyalty_add_point(uuid, int) from public;
grant execute on function public.loyalty_add_point(uuid, int) to authenticated;

-- ---------- Échanger la récompense (personnel uniquement) ----------
-- Remet les points à zéro et compte une récompense de plus.

create or replace function public.loyalty_redeem_reward(p_customer_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.loyalty_customers
  set points = 0, rewards_earned = rewards_earned + 1
  where id = p_customer_id;
$$;

revoke all on function public.loyalty_redeem_reward(uuid) from public;
grant execute on function public.loyalty_redeem_reward(uuid) to authenticated;
