-- Spreelo step84: per-post brand logo overlay support
-- Run this once in Supabase SQL Editor after step83.

alter table public.automation_rules
add column if not exists include_logo boolean;

alter table public.posts
add column if not exists include_logo boolean not null default false,
add column if not exists logo_url text;
