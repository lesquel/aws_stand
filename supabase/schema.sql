-- Cloud Quest · Supabase schema
-- Apply: Supabase Dashboard → SQL Editor → paste and run

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null check (char_length(username) between 2 and 14),
  base_id     text not null default 'explorer',
  role        text not null default 'player' check (role in ('player', 'staff')),
  stand_id    text,
  progress    jsonb not null default '{"doneActivities":[],"pieces":[],"badges":[],"claimed":[],"visitedStands":[],"tickets":0,"lastPiece":null}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Column-level privilege lockdown:
-- Clients may only update progress, base_id, and updated_at directly.
-- role, stand_id, and username are write-locked for authenticated users;
-- changes to those columns must go through security-definer RPCs.
revoke update on public.profiles from authenticated;
grant update (progress, base_id, updated_at) on public.profiles to authenticated;

-- RPC: become_staff
-- Validates the access code server-side and promotes the caller to staff.
-- Returns false if the code is wrong or the stand id is not recognised.
-- Change '4242' to the event staff access code before each event.
create or replace function public.become_staff(
  p_stand_id   text,
  p_access_code text
) returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  -- Access code check (event staff access code — change before the event)
  if p_access_code <> '4242' then
    return false;
  end if;
  -- Validate stand id
  if p_stand_id not in ('cloud', 'ia', 'sec', 'crew', 'build') then
    return false;
  end if;
  update public.profiles
    set role     = 'staff',
        stand_id = p_stand_id
    where id = auth.uid();
  return true;
end;
$$;

grant execute on function public.become_staff(text, text) to authenticated;

-- RPC: change_stand
-- Allows an already-enrolled staff member to switch stand without re-entering the access code.
-- Only works when the caller's profile role is already 'staff'.
create or replace function public.change_stand(
  p_stand_id text
) returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only callable by existing staff
  if (select role from public.profiles where id = auth.uid()) <> 'staff' then
    return false;
  end if;
  if p_stand_id not in ('cloud', 'ia', 'sec', 'crew', 'build') then
    return false;
  end if;
  update public.profiles
    set stand_id = p_stand_id
    where id = auth.uid();
  return true;
end;
$$;

grant execute on function public.change_stand(text) to authenticated;

-- Trigger: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, base_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'Player'),
    coalesce(new.raw_user_meta_data->>'base_id', 'explorer')
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
