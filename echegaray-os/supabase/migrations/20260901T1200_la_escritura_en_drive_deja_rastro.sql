-- ============================================================================
-- XSAS · CAPACIDAD NATIVA DE DRIVE — el libro de lo que el OS hizo con los archivos
-- ----------------------------------------------------------------------------
-- QUÉ FALTABA. `orq.pending_operations` guarda lo que un humano APROBÓ y el resultado que la
-- tool DIJO. No hay ninguna tabla que conteste, sobre un archivo concreto: qué cambió, quién lo
-- cambió, cuándo, y con qué versión quedó. `orq.events` es un log genérico cuyo `subject_id` es
-- uuid — un file_id de Drive es texto y terminaría escondido en un jsonb, sin índice y sin forma.
--
-- POR QUÉ UNA TABLA Y NO UN CAMPO MÁS EN pending_operations. Porque la mayoría de las escrituras
-- de Drive del OS NO pasan por la cola de aprobación: 184 archivos del repo hablan con Drive
-- directamente. Un libro de auditoría colgado de la cola sólo vería la minoría que se aprueba.
--
-- LO QUE ESTA TABLA NO ES. No es la fuente de la idempotencia: esa vive en las `properties` del
-- propio archivo en Drive (`xsas_idem`), porque una tabla puede desincronizarse de Drive y
-- entonces el control mentiría. Acá la clave se guarda para poder RASTREAR, no para decidir.
--
-- ADITIVA. No toca ninguna tabla existente.
-- ============================================================================

create table if not exists orq.drive_audit (
  id                  uuid primary key default gen_random_uuid(),
  ocurrido_en         timestamptz not null default now(),
  correlation_id      uuid,                          -- ata las N operaciones de un mismo pedido
  -- QUÉ pasó
  operacion           text not null,                 -- crear | subir | renombrar | mover | copiar | archivar | exportar
  capability_slug     text not null,                 -- la fila de orq.capabilities que la gobierna
  engine              text not null default 'drive.files',
  resultado           text not null default 'ok',    -- ok | failed
  error               text,
  -- QUIÉN
  actor               text not null,                 -- slug del principal, email, o nombre del script
  actor_tipo          text not null default 'sistema', -- persona | agente | sistema
  -- SOBRE QUÉ (identidad por ID, nunca por nombre)
  provider            text not null default 'google-drive',
  file_id             text not null,
  parent_id           text,
  mime_type           text,
  revision_id         text,
  hash                text,
  clave_idempotencia  text,
  -- EL EFECTO, RELEÍDO DEL DESTINO
  antes               jsonb,
  despues             jsonb,
  verificado          boolean not null default false,
  verificado_campos   text[] not null default '{}'
);

comment on column orq.drive_audit.verificado is
  'true SÓLO si el estado de `despues` se releyó del destino después de la escritura. Una fila con verificado=false es una operación que no probó su efecto.';

create index if not exists drive_audit_file_idx     on orq.drive_audit (file_id, ocurrido_en desc);
create index if not exists drive_audit_cuando_idx   on orq.drive_audit (ocurrido_en desc);
create index if not exists drive_audit_corr_idx     on orq.drive_audit (correlation_id) where correlation_id is not null;
create index if not exists drive_audit_idem_idx     on orq.drive_audit (clave_idempotencia) where clave_idempotencia is not null;

-- RLS: mismo patrón que orq.pending_operations y orq.schedules.
-- El grant va aparte de la policy a propósito: en este repo una policy sin grant ya dio
-- "permission denied" que Next mostró como un 404.
alter table orq.drive_audit enable row level security;
grant select on orq.drive_audit to authenticated;
grant select, insert on orq.drive_audit to service_role;
drop policy if exists drive_audit_read on orq.drive_audit;
drop policy if exists drive_audit_srv  on orq.drive_audit;
create policy drive_audit_read on orq.drive_audit for select to authenticated using (true);
-- Sin UPDATE ni DELETE, ni siquiera para service_role: un libro de auditoría que se puede
-- corregir después no prueba nada. Se corrige agregando una fila, no editando la anterior.
create policy drive_audit_srv  on orq.drive_audit for insert to service_role with check (true);

-- Vista pública read-only (la app no ve el schema orq).
create or replace view public.orq_drive_audit
  with (security_invoker = true) as
  select id, ocurrido_en, correlation_id, operacion, capability_slug, engine, resultado,
         actor, actor_tipo, provider, file_id, parent_id, mime_type, revision_id,
         antes, despues, verificado, verificado_campos
    from orq.drive_audit;
grant select on public.orq_drive_audit to authenticated;

-- ── La capacidad, en el registro que ya existe ───────────────────────────────────────────
-- `drive.read` y `drive.write` ya están. Falta la de GESTIÓN de archivos (mover, renombrar,
-- copiar, archivar), que hoy viaja disfrazada de `drive.write` — la misma capacidad que escribe
-- CELDAS de un Sheet. Separarlas permite que la policy trate distinto "cambiar un número del
-- Cash Flow" de "mover un archivo de carpeta", que es lo que son.
insert into orq.capabilities (slug, domain, description, required_clearance, blast_radius, idempotency, disposition_override, enabled)
values
  ('drive.files.read',   'operator', 'Identidad y almacenamiento de Drive: listar, buscar, metadata, revisiones, descargar, exportar. No lee contenido de documentos.', 'A', 'none',   'idempotent', null,   true),
  ('drive.files.manage', 'operator', 'Gestión de archivos de Drive: crear, subir, renombrar, mover, copiar, exportar a Drive. Verifica releyendo el destino y audita en orq.drive_audit.',      'C', 'low',    'dedup_key',  'auto', true),
  ('drive.files.archive','operator', 'Baja REVERSIBLE de un archivo/carpeta a la papelera de Drive. El borrado definitivo sigue siendo Nivel F (drive.delete).',                                'D', 'medium', 'idempotent', null,   true)
on conflict (slug) do update set
  description = excluded.description,
  required_clearance = excluded.required_clearance,
  blast_radius = excluded.blast_radius,
  idempotency = excluded.idempotency,
  enabled = excluded.enabled;
