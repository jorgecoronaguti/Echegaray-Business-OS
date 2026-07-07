-- PRP-008: HH y Productividad de Obra.
-- Verificación puntual confirmó: JORNALES es semanal, trabajador identificado por
-- nombre libre (no legajo), obra identificada por texto libre (no ID) — no existe
-- cuadrilla/frente/especialidad reconciliable. HH estimadas SÍ existen en la Planilla
-- para Cotizar (hoja "DESCRIPCION DE TAREAS"), pero con layout ad-hoc no parseable de
-- forma confiable — se registra manualmente, igual que el resto del presupuesto.

-- HH estimada se agrega al presupuesto YA APROBADO existente (PRP-003), no una tabla
-- nueva: es una dimensión más del mismo presupuesto versionado, no un hecho distinto.
alter table presupuestos add column hh_estimada numeric(10,2);
alter table presupuestos add constraint presupuestos_hh_estimada_check check (hh_estimada is null or hh_estimada > 0);

-- Registro real de HH consumidas, a granularidad SEMANAL (la unidad real de JORNALES).
-- trabajador_o_cuadrilla es texto libre (no FK a una entidad Persona que no existe y
-- que las fuentes actuales no permiten identificar de forma confiable — JORNALES usa
-- nombre libre, no legajo).
create table registros_hh (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,

  trabajador_o_cuadrilla text not null,
  -- Categorías reales del convenio UOCRA, confirmadas en 3 hojas distintas de la
  -- Planilla para Cotizar (MO Lu-Vi 8 a 16, ManoObra, Costo MO). Opcional: no todo
  -- registro tendrá la categoría identificada de forma confiable.
  categoria text check (categoria is null or categoria in ('oficial_especializado', 'oficial', 'medio_oficial', 'ayudante')),

  fecha_inicio_semana date not null,
  horas numeric(6,2) not null check (horas > 0),

  -- Vínculo opcional de reconciliación con el costo económico ya registrado (ej. una
  -- fila "Sueldos Obra" en costos_reales que cubre a varios trabajadores de la semana).
  -- No hay trigger de validación de tipo: costos_reales no distingue pago/cobro como
  -- movimientos_caja, así que cualquier costo_real de la obra es un vínculo válido.
  -- Deliberadamente NO se calcula costo = horas × tarifa acá (ver PRP-008: el costo de
  -- mano de obra ya se puede registrar en costos_reales sin fabricar una valorización).
  costo_real_id uuid references costos_reales(id) on delete set null,

  fuente_legacy text not null,
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (obra_id, trabajador_o_cuadrilla, fecha_inicio_semana)
);

create index registros_hh_obra_idx on registros_hh(obra_id);
create index registros_hh_obra_semana_idx on registros_hh(obra_id, fecha_inicio_semana);

alter table registros_hh enable row level security;

create policy "authenticated_full_access" on registros_hh
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.registros_hh to authenticated;

create trigger registros_hh_set_updated_at before update on registros_hh
  for each row execute function set_updated_at();

-- Vista derivada (no tabla): HH estimada (del presupuesto aprobado) vs HH real
-- acumulada, por obra. security_invoker = true obligatorio (mismo gotcha de PRP-005).
create view obra_hh_resumen
with (security_invoker = true)
as
select
  o.id as obra_id,
  o.nombre as obra_nombre,
  o.estado as obra_estado,
  p.hh_estimada,
  coalesce(r.hh_real_acumulada, 0) as hh_real_acumulada,
  coalesce(r.cantidad_semanas_registradas, 0) as cantidad_semanas_registradas,
  r.ultima_fecha_registro,
  case when p.hh_estimada is null then null
    else coalesce(r.hh_real_acumulada, 0) - p.hh_estimada
  end as desvio_absoluto,
  case when p.hh_estimada is null or p.hh_estimada = 0 then null
    else round((coalesce(r.hh_real_acumulada, 0) - p.hh_estimada) / p.hh_estimada * 100, 2)
  end as desvio_porcentual
from obras o
left join presupuestos p on p.obra_id = o.id and p.estado = 'aprobado'
left join lateral (
  select
    sum(horas) as hh_real_acumulada,
    count(distinct fecha_inicio_semana) as cantidad_semanas_registradas,
    max(fecha_inicio_semana) as ultima_fecha_registro
  from registros_hh
  where registros_hh.obra_id = o.id
) r on true;

grant select on public.obra_hh_resumen to authenticated;
