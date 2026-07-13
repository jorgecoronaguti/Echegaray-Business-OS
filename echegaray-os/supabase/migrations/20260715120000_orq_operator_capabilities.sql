-- ============================================================================
-- PRP-014 · FASE 3 — Capacidades de OPERADOR (Drive/Gmail) + cola de aprobación
-- ----------------------------------------------------------------------------
-- ADITIVA y REVERSIBLE. NO cambia orq.policy_decide ni el clearance de ningún
-- principal. Los especialistas ya tienen clearance C, que con la policy existente
-- resuelve exactamente:
--   drive.read (A)                                   -> auto
--   drive.draft / doc.create / mail.draft (C)        -> auto  (borrador, sin efecto externo)
--   drive.write / mail.send (E)                      -> requires_approval
--   drive.delete (F)                                 -> forbidden (nunca autónomo)
-- La política vive como DATOS en orq.capabilities; policy_decide la resuelve sin
-- tocar código. Rollback: orquestador/db/rollback/0006_operator_caps_down.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CAPACIDADES NUEVAS (dominio 'operator'). secret_scope='google' documenta
--    que requieren la credencial de Google del worker (no la usa policy_decide,
--    la consume el ejecutor de tools en Fase 4).
-- ---------------------------------------------------------------------------
insert into orq.capabilities
  (slug, domain, description, required_clearance, blast_radius, idempotency, disposition_override, secret_scope) values
  ('drive.read',   'operator', 'Leer archivos/Sheets/Docs de Google Drive.',            'A','none',    'idempotent',     null,                'google'),
  ('drive.draft',  'operator', 'Crear un borrador (archivo no autoritativo) en Drive.', 'C','low',     'idempotent',     null,                'google'),
  ('doc.create',   'operator', 'Crear un Google Doc borrador propio del OS.',           'C','low',     'idempotent',     null,                'google'),
  ('mail.draft',   'operator', 'Redactar un borrador de email (NO envía).',             'C','low',     'idempotent',     null,                'google'),
  ('drive.write',  'operator', 'Editar/crear un archivo autoritativo en Drive.',        'E','high',    'side_effecting', 'requires_approval',  'google'),
  ('mail.send',    'operator', 'Enviar un email (efecto externo).',                     'E','high',    'side_effecting', 'requires_approval',  'google'),
  ('drive.delete', 'operator', 'Eliminar un archivo de Drive.',                         'F','critical','side_effecting', 'forbidden',          'google')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. COLA DE OPERACIONES PENDIENTES — guarda el payload/borrador CONCRETO que hoy
--    falta (los approval_requests actuales son sólo eventos informativos). Una
--    operación requires_approval se encola acá con su evidencia real para aprobar.
-- ---------------------------------------------------------------------------
create table if not exists orq.pending_operations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references orq.tenants(id) on delete restrict,
  task_id         uuid references orq.tasks(id) on delete set null,
  agent_slug      text not null,
  capability_slug text not null references orq.capabilities(slug),
  account         text not null,                          -- 'ecsas' | 'gmail'
  target          jsonb not null default '{}'::jsonb,     -- destino: file_id, to, subject...
  payload         jsonb not null default '{}'::jsonb,     -- borrador/cambio propuesto (evidencia)
  status          text not null default 'awaiting_approval'
                    check (status in ('awaiting_approval','approved','rejected','executed','failed')),
  result          jsonb,
  error           text,
  decided_by      uuid references orq.principals(id) on delete set null,
  decided_note    text,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists pending_ops_status_idx on orq.pending_operations (status, created_at);
create index if not exists pending_ops_task_idx   on orq.pending_operations (task_id);

create trigger pending_ops_touch before update on orq.pending_operations
  for each row execute function orq.touch_updated_at();

-- RLS: mismo patrón que el resto de orq.* (select authenticated, all service_role)
alter table orq.pending_operations enable row level security;
grant select on orq.pending_operations to authenticated;
grant select, insert, update, delete on orq.pending_operations to service_role;
create policy pending_ops_read on orq.pending_operations for select to authenticated using (true);
create policy pending_ops_srv  on orq.pending_operations for all    to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3. VISTA PÚBLICA read-only (security_invoker) — la app no ve el schema orq.
-- ---------------------------------------------------------------------------
create or replace view public.orq_pending_operations
  with (security_invoker = true) as
  select po.id, po.task_id, po.agent_slug, po.capability_slug, po.account,
         po.target, po.payload, po.status, po.result, po.error,
         po.decided_note, po.decided_at, po.created_at, po.updated_at
    from orq.pending_operations po;
grant select on public.orq_pending_operations to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC de acción humana (aprobar/rechazar). SECURITY DEFINER, exige usuario
--    autenticado. NO ejecuta el efecto externo: sólo marca 'approved'/'rejected'.
--    El worker toma las 'approved', ejecuta (idempotente por id) y pasa a
--    'executed'/'failed'. Espeja el patrón de public.orq_task_action (F5).
-- ---------------------------------------------------------------------------
create or replace function public.orq_operation_action(p_id uuid, p_action text, p_note text default null)
returns public.orq_pending_operations
language plpgsql
security definer
set search_path = public, orq, pg_temp
as $$
declare
  v_to  text;
  v_row orq.pending_operations%rowtype;
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;
  v_to := case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else null end;
  if v_to is null then raise exception 'acción desconocida: % (usar approve|reject)', p_action; end if;

  select * into v_row from orq.pending_operations where id = p_id for update;
  if not found then raise exception 'operación % inexistente', p_id; end if;
  if v_row.status <> 'awaiting_approval' then
    raise exception 'la operación % ya no está pendiente (estado: %)', p_id, v_row.status;
  end if;

  update orq.pending_operations
     set status       = v_to,
         decided_note = p_note,
         decided_at   = now(),
         updated_at   = now()
   where id = p_id;

  return (select po from public.orq_pending_operations po where po.id = p_id);
end;
$$;
revoke all on function public.orq_operation_action(uuid, text, text) from public;
grant execute on function public.orq_operation_action(uuid, text, text) to authenticated;
