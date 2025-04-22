-- 0001_create_investigators.sql
create table if not exists public.investigators (
  id            bigserial primary key,
  name          text      not null,
  role          text,
  facility      text,
  city          text,
  state         text,
  zip           text,
  affiliation   text,
  nct_id        text,
  start_date    date,

  inserted_at   timestamptz default current_timestamp
);

create index if not exists investigators_nct_id_idx on public.investigators (nct_id);

alter table public.investigators
  enable row level security;

create policy "Anyone can insert investigators"
on public.investigators
for insert
using (true); 