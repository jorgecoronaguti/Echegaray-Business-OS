-- REGLA DE ORO DEL DUEÑO (20/07): "todo replicado en Supabase, para darle vida a la web en cuanto
-- se quiera". Lo que sólo vive en el Sheet no lo puede mostrar la web, no lo puede cruzar el chat y
-- no lo puede auditar nadie sin abrir la planilla.
--
-- Esta migración hace dos cosas: arregla una clasificación que se borraba sola, y replica el trabajo
-- de nómina que hasta hoy existía únicamente en las pestañas.

-- ── 1. EL ÁREA DEL EGRESO NO PUEDE DEPENDER DE QUE ALGUIEN SE ACUERDE ────────────────────────────
-- Medido hoy: costos_obra tiene las 736 filas y los $572.065.865 correctos, pero `area` está en NULL
-- en las 736. La columna y la función existen desde el 20/07 y el backfill corrió — pero
-- scripts/sync-compras.mjs hace `delete from costos_obra where origen='compras_sheet'` + insert SIN
-- area, así que cada sincronización la borraba. Una columna que se llena con un UPDATE puntual está
-- siempre a una corrida de distancia de volver a vaciarse.
--
-- Con un trigger, el área se calcula en la base cada vez que entra o cambia una fila. No importa
-- quién escriba (el sync, el chat, la web, una carga a mano): sale clasificada o no entra.
create or replace function public.costos_obra_set_area() returns trigger
language plpgsql
as $$
begin
  new.area := public.area_de_egreso(new.proveedor, new.obra_texto, new.unidad_negocio, new.concepto);
  return new;
end;
$$;

drop trigger if exists costos_obra_area_trg on public.costos_obra;
create trigger costos_obra_area_trg
  before insert or update of proveedor, obra_texto, unidad_negocio, concepto
  on public.costos_obra
  for each row execute function public.costos_obra_set_area();

comment on function public.costos_obra_set_area() is
  'Clasifica el área de cada egreso al escribirlo. Existe porque el sync borra y reinserta: un backfill puntual se perdía en la siguiente corrida.';

-- Backfill de lo que ya está (el trigger sólo actúa sobre escrituras nuevas).
update public.costos_obra
   set area = public.area_de_egreso(proveedor, obra_texto, unidad_negocio, concepto)
 where area is distinct from public.area_de_egreso(proveedor, obra_texto, unidad_negocio, concepto);

-- ── 2. JORNALES POR QUINCENA ─────────────────────────────────────────────────────────────────────
-- Así se paga en construcción. Hasta hoy esto vivía sólo en la pestaña: la web no podía mostrar
-- cuánto se paga la quincena que viene ni contra qué obra se imputó una hora.
create table if not exists public.jornales_quincena (
  id                  uuid primary key default gen_random_uuid(),
  desde               date not null,
  hasta               date,
  dias_habiles        int,
  personas            int,
  hs_correspondientes numeric,
  hs_reales           numeric,
  banco               numeric default 0,
  adelanto            numeric default 0,
  total_recibo        numeric default 0,
  total               numeric not null default 0,
  -- 'cerrada' = la quincena terminó y está cargada · 'en_curso' = se sigue cargando ·
  -- 'proyectada' = todavía no pasó, el monto es una ESTIMACIÓN. Nunca mezclar las tres en un total
  -- sin decir cuál es cuál: es la diferencia entre un dato y un pronóstico.
  estado              text not null default 'cerrada' check (estado in ('cerrada', 'en_curso', 'proyectada')),
  origen              text not null default 'flujo_caja_sheet',
  sincronizado_en     timestamptz not null default now(),
  unique (desde, origen)
);
comment on table public.jornales_quincena is
  'Una fila por quincena de jornales. estado distingue dato (cerrada/en_curso) de estimación (proyectada).';
create index if not exists jornales_quincena_desde_idx on public.jornales_quincena (desde);

-- El reparto por cliente/obra de cada quincena. Separado porque una quincena toca varias obras y
-- meterlo en columnas obligaría a agregar una por cada obra nueva.
create table if not exists public.jornales_quincena_obra (
  id           uuid primary key default gen_random_uuid(),
  quincena_id  uuid not null references public.jornales_quincena(id) on delete cascade,
  -- text, no uuid: obra_canonica.id es text (claves legibles tipo 'san-francisco').
  obra_id      text references public.obra_canonica(id),
  cliente_texto text,
  jornales     int default 0,
  horas        numeric default 0,
  total        numeric default 0
);
create index if not exists jornales_quincena_obra_q_idx on public.jornales_quincena_obra (quincena_id);

-- ── 3. CARGAS SOCIALES ───────────────────────────────────────────────────────────────────────────
-- Un renglón por período y concepto del F931. En columnas jsonb no: se consulta por concepto
-- (¿cuánto ART pagamos este año?) y eso en jsonb es incómodo y no indexa bien.
create table if not exists public.cargas_sociales_periodo (
  id             uuid primary key default gen_random_uuid(),
  periodo        text not null,                    -- 'YYYY-MM' que DECLARA (se paga al mes siguiente)
  concepto       text not null,                    -- clave de CONCEPTOS_F931 (aportes_ss, lrt, …)
  concepto_nombre text,
  codigo         text,                             -- 301, 312, …
  monto          numeric not null default 0,
  -- 'declarado' sale del PDF de la DDJJ · 'proyectado' es una ESTIMACIÓN calculada.
  tipo           text not null default 'declarado' check (tipo in ('declarado', 'proyectado')),
  empleados      int,
  remuneracion   numeric,
  archivo        text,                             -- el PDF del que salió: la trazabilidad del dato
  metodo         text,                             -- si es proyectado, CÓMO se estimó
  sincronizado_en timestamptz not null default now(),
  unique (periodo, concepto, tipo)
);
comment on table public.cargas_sociales_periodo is
  'Cargas sociales por período y concepto. tipo=declarado viene del F931 (con el PDF de origen en archivo); tipo=proyectado es estimación y lleva el método.';
comment on column public.cargas_sociales_periodo.periodo is
  'Mes que DECLARA la DDJJ, no el mes en que se paga. El F931 de junio se paga en julio.';
create index if not exists cargas_sociales_periodo_idx on public.cargas_sociales_periodo (periodo, tipo);

-- ── 4. ESCALA UOCRA ──────────────────────────────────────────────────────────────────────────────
-- Dato EXTERNO y con vigencia: cambia por paritaria. Guardarlo sin fecha de vigencia sería peor que
-- no guardarlo — se usaría un básico viejo para costear una obra nueva.
create table if not exists public.uocra_escala (
  id                      uuid primary key default gen_random_uuid(),
  vigencia_desde          date not null,
  zona                    text not null default 'A',
  categoria               text not null,
  basico_hora             numeric,
  no_remunerativo_mensual numeric,
  mensual                 numeric,                 -- para el Sereno, que se paga por mes
  cct                     text default '76/75',
  fuente                  text,                    -- de dónde salió, para poder re-verificarlo
  cargado_en              timestamptz not null default now(),
  unique (vigencia_desde, zona, categoria)
);
comment on table public.uocra_escala is
  'Escala salarial UOCRA por vigencia/zona/categoría. Dato externo: fuente obligatoria y verificable. San Juan es Zona A.';

-- ── 5. LO QUE VA A CONSUMIR LA WEB ───────────────────────────────────────────────────────────────
-- Una sola vista con el costo de nómina por mes: jornales (dato o estimación) y cargas sociales.
-- Que la web no tenga que rehacer esta suma es justamente el punto de la regla de una-fuente.
create or replace view public.nomina_por_mes as
  with j as (
    select date_trunc('month', desde)::date mes,
           sum(total) jornales,
           bool_or(estado = 'proyectada') tiene_proyectado
      from public.jornales_quincena group by 1
  ), c as (
    select to_date(periodo || '-01', 'YYYY-MM-DD') mes,
           sum(monto) cargas,
           bool_or(tipo = 'proyectado') tiene_proyectado
      from public.cargas_sociales_periodo group by 1
  )
  select coalesce(j.mes, c.mes)                                  as mes,
         coalesce(j.jornales, 0)                                 as jornales,
         coalesce(c.cargas, 0)                                   as cargas_sociales,
         coalesce(j.jornales, 0) + coalesce(c.cargas, 0)         as costo_nomina,
         coalesce(j.tiene_proyectado, false)
           or coalesce(c.tiene_proyectado, false)                as es_estimacion
    from j full outer join c on j.mes = c.mes
   order by 1;

comment on view public.nomina_por_mes is
  'Costo de nómina por mes: jornales + cargas sociales. es_estimacion avisa cuando el mes incluye proyección — la web NUNCA debe mostrar un estimado como si fuera un dato.';
