alter table public.market_research_runs
  add column if not exists status text not null default 'queued',
  add column if not exists source text not null default 'manual';
