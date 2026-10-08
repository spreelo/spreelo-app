-- v324: additive news storage. Does not alter model settings.
create table if not exists public.ai_market_news (
 id text primary key, provider text not null, title text not null,
 url text not null, published_at timestamptz, discovered_at timestamptz not null default now(),
 severity text not null default 'info', category text not null default 'update',
 summary text not null default '', notified_at timestamptz null
);
create index if not exists ai_market_news_discovered_idx on public.ai_market_news(discovered_at desc);
alter table public.ai_market_news enable row level security;
revoke all on public.ai_market_news from anon, authenticated;
grant all on public.ai_market_news to service_role;
create table if not exists public.ai_market_watch_runs (
 day date primary key, checked_at timestamptz not null default now(), sources_ok integer not null default 0, sources_failed integer not null default 0, discovered integer not null default 0
);
alter table public.ai_market_watch_runs enable row level security;
revoke all on public.ai_market_watch_runs from anon, authenticated;
grant all on public.ai_market_watch_runs to service_role;
