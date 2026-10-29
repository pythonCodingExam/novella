-- Run once in Supabase SQL Editor. Authentication users are managed by Supabase Auth.
create table if not exists public.shelves (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 book_key text not null check(length(book_key) between 3 and 200),
 book_id text not null,
 source text not null check(source in ('google','gutenberg')),
 title text not null, author text not null default '', cover text not null default '',
 status text not null default 'want_to_read' check(status in ('want_to_read','reading','read')),
 created_at timestamptz not null default now(),
 unique(user_id,book_key)
);
create table if not exists public.reading_history (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 book_key text not null, book_id text not null,
 source text not null check(source in ('google','gutenberg')),
 title text not null,author text not null default '',cover text not null default '',
 last_action text not null check(last_action in ('viewed','reading','read')),
 accessed_at timestamptz not null default now(),
 unique(user_id,book_key)
);
create table if not exists public.reviews (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 book_key text not null,
 display_name text not null default 'Reader' check(length(display_name)<=50),
 rating integer not null check(rating between 1 and 5),
 body text not null check(length(body) between 5 and 1200),
 created_at timestamptz not null default now(),
 unique(user_id,book_key)
);
create index if not exists reviews_book_key_idx on public.reviews(book_key,created_at desc);
create index if not exists shelves_user_idx on public.shelves(user_id,created_at desc);
create index if not exists history_user_idx on public.reading_history(user_id,accessed_at desc);
alter table public.shelves enable row level security;
alter table public.reading_history enable row level security;
alter table public.reviews enable row level security;
-- Re-running this script is safe.
drop policy if exists "Read own shelves" on public.shelves;
drop policy if exists "Insert own shelves" on public.shelves;
drop policy if exists "Update own shelves" on public.shelves;
drop policy if exists "Delete own shelves" on public.shelves;
create policy "Read own shelves" on public.shelves for select to authenticated using ((select auth.uid())=user_id);
create policy "Insert own shelves" on public.shelves for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Update own shelves" on public.shelves for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Delete own shelves" on public.shelves for delete to authenticated using ((select auth.uid())=user_id);
drop policy if exists "Read own history" on public.reading_history;
drop policy if exists "Insert own history" on public.reading_history;
drop policy if exists "Update own history" on public.reading_history;
create policy "Read own history" on public.reading_history for select to authenticated using ((select auth.uid())=user_id);
create policy "Insert own history" on public.reading_history for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Update own history" on public.reading_history for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "Everyone can read reviews" on public.reviews;
drop policy if exists "Insert own reviews" on public.reviews;
drop policy if exists "Update own reviews" on public.reviews;
drop policy if exists "Delete own reviews" on public.reviews;
create policy "Everyone can read reviews" on public.reviews for select to anon,authenticated using (true);
create policy "Insert own reviews" on public.reviews for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Update own reviews" on public.reviews for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Delete own reviews" on public.reviews for delete to authenticated using ((select auth.uid())=user_id);
