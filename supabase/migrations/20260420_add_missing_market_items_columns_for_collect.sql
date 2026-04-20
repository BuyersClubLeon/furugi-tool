begin;

alter table public.market_items
  add column if not exists source_site text,
  add column if not exists external_item_id text,
  add column if not exists item_url text,
  add column if not exists title text,
  add column if not exists brand text,
  add column if not exists category text,
  add column if not exists size_text text,
  add column if not exists color text,
  add column if not exists condition_text text,
  add column if not exists price_yen_latest integer,
  add column if not exists thumbnail_url text,
  add column if not exists seller_name text,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists updated_at timestamptz;

commit;
