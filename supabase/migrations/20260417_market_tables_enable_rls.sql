begin;

alter table public.market_research_runs enable row level security;
alter table public.market_items enable row level security;
alter table public.market_item_snapshots enable row level security;

commit;
