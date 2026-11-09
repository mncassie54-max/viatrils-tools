-- AI Prompthon 2026 / Supabase database setup
-- Run in a NEW Supabase project via SQL Editor. Never paste service_role keys into the website.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 300),
  result_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.judges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  judge_id uuid not null references public.judges(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  impact smallint not null check (impact between 1 and 5),
  completion smallint not null check (completion between 1 and 5),
  feasibility smallint not null check (feasibility between 1 and 5),
  creativity smallint not null check (creativity between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  submitted_at timestamptz not null default now(),
  unique (judge_id, team_id)
);
create index if not exists reviews_team_id_idx on public.reviews(team_id);

alter table public.admin_users enable row level security;
alter table public.teams enable row level security;
alter table public.judges enable row level security;
alter table public.reviews enable row level security;

-- Only explicitly allow admin read/write on base tables. Judge access is via narrowly scoped RPCs.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.admin_users au where au.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admins manage teams" on public.teams;
create policy "admins manage teams" on public.teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage judges" on public.judges;
create policy "admins manage judges" on public.judges for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage reviews" on public.reviews;
create policy "admins manage reviews" on public.reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- No direct select/insert/update/delete policies for anon.
revoke all on public.admin_users from anon, authenticated;
revoke all on public.teams, public.judges, public.reviews from anon;
grant select, insert, update, delete on public.teams, public.judges, public.reviews to authenticated;

-- Long random invitation codes are never stored in plaintext.
create or replace function public.admin_add_judge(p_name text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_token text;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception '운영자 권한이 필요합니다.';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 80 then
    raise exception '심사자 이름을 입력해 주세요.';
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.judges(name, token_hash)
  values (trim(p_name), encode(digest(v_token, 'sha256'), 'hex'))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'name', trim(p_name), 'token', v_token);
end;
$$;
revoke all on function public.admin_add_judge(text) from public;
grant execute on function public.admin_add_judge(text) to authenticated;

-- Judge can see only their name, registered teams, and whether THEY already submitted.
create or replace function public.judge_dashboard(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_judge public.judges%rowtype;
begin
  select * into v_judge from public.judges
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and active is true;
  if not found then
    raise exception '심사 링크가 유효하지 않거나 비활성화되었습니다.';
  end if;
  return jsonb_build_object(
    'judge', jsonb_build_object('name', v_judge.name),
    'teams', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'description', t.description,
          'result_url', t.result_url,
          'submitted', r.id is not null,
          'submitted_at', r.submitted_at
        ) order by t.name
      ), '[]'::jsonb)
      from public.teams t
      left join public.reviews r on r.team_id = t.id and r.judge_id = v_judge.id
    )
  );
end;
$$;
revoke all on function public.judge_dashboard(text) from public;
grant execute on function public.judge_dashboard(text) to anon, authenticated;

-- One immutable final review per judge and team; no direct anonymous table writes.
create or replace function public.judge_submit(
  p_token text,
  p_team_id uuid,
  p_impact integer,
  p_completion integer,
  p_feasibility integer,
  p_creativity integer,
  p_comment text default ''
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_judge_id uuid;
  v_review_id uuid;
begin
  select id into v_judge_id from public.judges
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and active is true;
  if v_judge_id is null then
    raise exception '심사 링크가 유효하지 않거나 비활성화되었습니다.';
  end if;
  if p_impact not between 1 and 5 or p_completion not between 1 and 5
     or p_feasibility not between 1 and 5 or p_creativity not between 1 and 5
     or p_impact is null or p_completion is null or p_feasibility is null or p_creativity is null then
    raise exception '각 항목은 1~5점이어야 합니다.';
  end if;
  if char_length(coalesce(p_comment, '')) > 1000 then
    raise exception '종합 의견은 1000자 이내로 작성해 주세요.';
  end if;
  insert into public.reviews(judge_id, team_id, impact, completion, feasibility, creativity, comment)
  values (v_judge_id, p_team_id, p_impact, p_completion, p_feasibility, p_creativity, coalesce(p_comment, ''))
  on conflict (judge_id, team_id) do nothing
  returning id into v_review_id;
  if v_review_id is null then
    raise exception '이미 최종 제출한 팀입니다. 수정이 필요하면 운영자에게 문의해 주세요.';
  end if;
  return jsonb_build_object('success', true, 'review_id', v_review_id);
end;
$$;
revoke all on function public.judge_submit(text, uuid, integer, integer, integer, integer, text) from public;
grant execute on function public.judge_submit(text, uuid, integer, integer, integer, integer, text) to anon, authenticated;

-- SETUP (execute separately AFTER signing in once through the website):
-- 1. Find the intended ADMIN's email in Supabase > Authentication > Users.
-- 2. Replace the placeholder with your own verified email address.
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL@example.com'
-- on conflict do nothing;
