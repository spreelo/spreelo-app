-- v326: Discovery catalog. Does NOT update ai_model_settings or active models.
create table if not exists public.ai_model_catalog (
 provider text not null,
 model text not null,
 status text not null default 'pending_review' check(status in ('pending_review','approved','rejected')),
 verified_capabilities text[] not null default '{}',
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 verified_at timestamptz,
 verification_notes text,
 primary key(provider,model)
);
alter table public.ai_model_catalog enable row level security;
revoke all on public.ai_model_catalog from anon,authenticated;
grant all on public.ai_model_catalog to service_role;
