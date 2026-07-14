-- ============================================================================
-- PRP-015 · FASE 4 — Recurrencias / Agenda del OS
-- ----------------------------------------------------------------------------
-- El dueño programa directivas ("todos los lunes revisá cobranzas y avisame") y
-- el worker las dispara en su cadencia. Única tabla nueva de todo el PRP-015.
-- ADITIVA. Rollback: orquestador/db/rollback/0008_orq_schedules_down.sql
-- ============================================================================

create table if not exists orq.schedules (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references orq.tenants(id) on delete restrict,
  created_by   uuid references orq.principals(id) on delete set null,
  title        text not null,
  directive    text not null,               -- qué ejecutar (se corre como una directiva del /ask)
  cadence      text not null,               -- 'once' | 'daily:HH:MM' | 'weekly:<dia>:HH:MM' | 'monthly:DD:HH:MM'
  next_run_at  timestamptz not null,
  last_run_at  timestamptz,
  last_result  text,                        -- resumen de la última corrida (lo que el OS respondió)
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists schedules_due_idx on orq.schedules (enabled, next_run_at);

drop trigger if exists schedules_touch on orq.schedules;
create trigger schedules_touch before update on orq.schedules
  for each row execute function orq.touch_updated_at();

-- RLS: mismo patrón que orq.pending_operations (select authenticated, all service_role)
alter table orq.schedules enable row level security;
grant select on orq.schedules to authenticated;
grant select, insert, update, delete on orq.schedules to service_role;
drop policy if exists schedules_read on orq.schedules;
drop policy if exists schedules_srv  on orq.schedules;
create policy schedules_read on orq.schedules for select to authenticated using (true);
create policy schedules_srv  on orq.schedules for all    to service_role using (true) with check (true);

-- Vista pública read-only (la app no ve el schema orq).
create or replace view public.orq_schedules
  with (security_invoker = true) as
  select id, title, directive, cadence, next_run_at, last_run_at, last_result, enabled, created_at, updated_at
    from orq.schedules;
grant select on public.orq_schedules to authenticated;
