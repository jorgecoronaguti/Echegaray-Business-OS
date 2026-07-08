-- Ciclo "Operabilidad real" (2026-07-09): dos extensiones de esquema.

-- 1) Centro de Acción — bloqueo y evidencia (Sección 4). No se sobreconstruye un
-- sistema de project management: se agregan solo los 2 campos que el flujo real
-- observación->decisión->acción->seguimiento->escalamiento->cierre necesitaba y no
-- tenía todavía (resolucion_notas/resultado_real ya cubren seguimiento y cierre).
alter table acciones
  add column bloqueada boolean not null default false,
  add column motivo_bloqueo text,
  add column evidencia text;

-- 2) Clasificación de costo por obra (Sección 10) — cola de trabajo real para el gap
-- encontrado en el ciclo de Pisos: un cliente con más de una obra concurrente genera
-- gasto que la fuente de origen no tagea por obra. Se registra el gasto crudo, una
-- sugerencia de obra (o ninguna, si no hay evidencia suficiente) y su confianza —
-- nunca se fuerza una asignación. Al confirmar, se materializa en costos_reales
-- (costo_real_id) para no duplicar la capacidad de Control Económico.
create table clasificaciones_costo_obra (
  id uuid primary key default gen_random_uuid(),
  fuente_legacy text not null,
  referencia_externa text,
  concepto text not null,
  monto numeric not null check (monto > 0),
  fecha date not null,
  proveedor_id uuid references proveedores(id),
  cliente_id uuid references clientes(id),
  obra_sugerida_id uuid references obras(id),
  confianza_sugerencia text not null check (
    confianza_sugerencia = any(array['confirmado','conciliado','observado','calculado','estimado','inferido','conflictivo','sin_dato'])
  ),
  regla_aplicada text not null,
  estado text not null default 'pendiente' check (estado = any(array['pendiente','confirmado','sin_obra_aplicable','descartado'])),
  obra_confirmada_id uuid references obras(id),
  costo_real_id uuid references costos_reales(id),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table clasificaciones_costo_obra enable row level security;

create policy authenticated_full_access on clasificaciones_costo_obra
  for all to authenticated using (true) with check (true);

-- La RLS policy sola no alcanza: Supabase revoca los privilegios por defecto de
-- `authenticated` sobre tablas nuevas -- sin este GRANT, PostgREST devuelve
-- "permission denied" incluso con una policy `using (true)` (encontrado real, ver
-- .claude/memory/feedback/rls-sin-policy-falla-en-silencio.md).
grant select, insert, update, delete on clasificaciones_costo_obra to authenticated;

create index clasificaciones_costo_obra_estado_idx on clasificaciones_costo_obra (estado);
