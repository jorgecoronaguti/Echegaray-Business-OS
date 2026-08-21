-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL ESTÁNDAR PRODUCTIVO ES UNA VERSIÓN CON VIGENCIA, UNA CUADRILLA Y UN CONTEXTO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Hasta hoy `analisis` versionaba con dos columnas —`version` y `vigente`— y un índice parcial que
-- admitía UNA sola vigente por tarea tipo. Eso alcanza para «cuál es la buena» y no alcanza para
-- nada más:
--
--   · **no hay vigencia temporal**. Un análisis dice que es el vigente, no desde cuándo. Cuando una
--     obra de marzo se compara contra el estándar, no hay manera de saber cuál regía en marzo.
--   · **no hay variantes**. Tabicar con PNC80 y con PNC140 son la misma tarea con dos estándares
--     distintos; con una sola vigente por tarea, la segunda tiene que ser una tarea tipo nueva y el
--     historial de rendimiento se parte en dos que no se pueden sumar.
--   · **no hay cuadrilla tipo**. El análisis dice cuántas horas de oficial y cuántas de ayudante por
--     unidad, pero no CON CUÁNTA GENTE. «2,4 HH/m²» no se convierte en plazo sin saber si son
--     1 oficial + 2 ayudantes o una cuadrilla de ocho.
--   · **no hay contexto**. El mismo estándar rinde distinto en altura, en planta en marcha o con
--     acceso restringido. Sin eso escrito, la próxima cotización copia el número sin la condición
--     que lo hacía cierto.
--   · **y no había función para versionar**. `rendimiento_recomendado` dice hace tres migraciones
--     que «se acepta a mano y crea una versión nueva del análisis» — y esa función no existía. Un
--     UPDATE suelto sobre `vigente` deja el índice parcial peleando y ninguna trazabilidad.
--
-- Las 199 filas cargadas no se tocan más que para fechar su vigencia con su fecha de creación: es
-- el dato real, no un supuesto.
--
-- ═══ POR QUÉ LAS MAGNITUDES VAN SEPARADAS Y CON NOMBRE ═══
--
-- `estandar_productivo` publica CADA magnitud en su columna y ninguna mezcla esfuerzo con duración:
-- HH por unidad es esfuerzo, producción diaria es ritmo, capacidad ponderada es plantel. Sumar o
-- dividir dos de ellas sin decirlo es exactamente el error que hace que «rendimiento» signifique
-- cuatro cosas distintas según quién lo diga.

-- ── 1 · el análisis gana vigencia, variante y contexto ────────────────────────────────────────
alter table public.analisis add column if not exists variante       text;
alter table public.analisis add column if not exists vigencia_desde date not null default current_date;
alter table public.analisis add column if not exists vigencia_hasta date;
alter table public.analisis add column if not exists contexto       text;

-- El backfill NO inventa una fecha: usa la de creación de cada análisis, que es el dato que hay.
update public.analisis set vigencia_desde = creado_en::date where creado_en is not null;

alter table public.analisis drop constraint if exists analisis_vigencia_coherente;
alter table public.analisis add constraint analisis_vigencia_coherente
  check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde);

comment on column public.analisis.variante is
  'Dos estándares distintos de la MISMA tarea tipo que conviven vigentes: «PNC80» y «PNC140», '
  '«hormigón bombeado» y «hormigón con pluma». NULL es la variante base. Sin esto, la segunda '
  'variante obliga a crear otra tarea tipo y parte el historial de rendimiento en dos mitades que '
  'no se pueden sumar.';
comment on column public.analisis.vigencia_desde is
  'Desde cuándo rige este estándar. Backfill con creado_en: es el dato real, no un supuesto. '
  'Permite preguntar «cuál era el estándar en marzo» en vez de sólo «cuál es el de hoy».';
comment on column public.analisis.contexto is
  'Las condiciones y restricciones bajo las que este rendimiento es cierto: altura, planta en '
  'marcha, acceso restringido, turno nocturno. Un estándar sin su contexto se copia a una obra '
  'donde no vale y nadie se entera hasta el desvío.';

-- Una VARIANTE por tarea puede estar vigente a la vez. El índice viejo admitía una sola fila
-- vigente por tarea tipo y por eso las variantes no podían existir.
drop index if exists public.analisis_uno_vigente;
create unique index if not exists analisis_una_variante_vigente
  on public.analisis (tarea_tipo_id, (coalesce(variante, ''))) where vigente;

-- ── 2 · la cuadrilla tipo del estándar ────────────────────────────────────────────────────────
create table if not exists public.analisis_cuadrilla (
  id           uuid primary key default gen_random_uuid(),
  analisis_id  uuid not null references public.analisis (id) on delete cascade,
  categoria    text not null references public.categoria_obra (clave) on delete restrict,
  cantidad     numeric not null check (cantidad > 0),
  constraint analisis_cuadrilla_unica unique (analisis_id, categoria)
);

create index if not exists analisis_cuadrilla_analisis_idx on public.analisis_cuadrilla (analisis_id);

comment on table public.analisis_cuadrilla is
  'La cuadrilla TIPO del estándar: 1 oficial + 2 ayudantes. No es la cuadrilla real de una obra '
  '—esa vive en `cuadrilla`— sino con cuánta gente se midió el rendimiento. Sin ella, las HH por '
  'unidad no se pueden convertir en producción diaria y el plazo sale de una división a ojo.';
comment on column public.analisis_cuadrilla.categoria is
  'Las cuatro claves de categoria_obra, que son las mismas de personas.categoria. No es un '
  'catálogo paralelo: la capacidad ponderada sale de ahí.';

-- ── 3 · versionar es una operación, no tres UPDATE ────────────────────────────────────────────
create or replace function public.nueva_version_de_analisis(
  p_analisis_id  uuid,
  p_motivo       text default null,
  p_hs_unitarias numeric default null
) returns uuid language plpgsql security invoker as $$
declare
  v_old      record;
  v_nueva    uuid;
  v_version  int;
  v_hs_act   numeric;
  v_factor   numeric := 1;
begin
  if not public.ve_economia() then
    raise exception 'crear una versión de un análisis exige permiso económico';
  end if;

  select * into v_old from public.analisis where id = p_analisis_id;
  if not found then raise exception 'el análisis % no existe', p_analisis_id; end if;
  if not v_old.vigente then
    raise exception 'el análisis % no es el vigente: una versión nueva sale del vigente, no de una vieja', p_analisis_id;
  end if;

  -- El rendimiento actual sale de las líneas, que es donde vive. Si el objetivo viene dado, TODA la
  -- composición de trabajo se escala por el mismo factor: la receta no cambia, cambia cuánto se
  -- tarda. Inventar una composición nueva para llegar al número sería fabricar el análisis.
  if p_hs_unitarias is not null then
    if p_hs_unitarias <= 0 then
      raise exception 'un rendimiento objetivo de % no es un rendimiento', p_hs_unitarias;
    end if;
    select coalesce(sum(l.cantidad), 0) into v_hs_act
      from public.analisis_linea l
      join public.recurso r on r.id = l.recurso_id
     where l.analisis_id = p_analisis_id and r.tipo = 'mano_obra';
    if coalesce(v_hs_act, 0) <= 0 then
      raise exception 'el análisis % no tiene mano de obra: no hay qué escalar para llegar a % hs/unidad',
        p_analisis_id, p_hs_unitarias;
    end if;
    v_factor := p_hs_unitarias / v_hs_act;
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.analisis where tarea_tipo_id = v_old.tarea_tipo_id;

  -- Primero se cierra la vieja: el índice parcial admite una sola vigente por (tarea, variante).
  update public.analisis
     set vigente = false, vigencia_hasta = current_date
   where id = p_analisis_id;

  insert into public.analisis
      (tarea_tipo_id, version, vigente, motivo, variante, contexto, vigencia_desde)
  values (v_old.tarea_tipo_id, v_version, true, p_motivo, v_old.variante, v_old.contexto, current_date)
  returning id into v_nueva;

  -- Mano de obra y cargas sociales escalan juntas: la carga social es un porcentaje de la hora, no
  -- un insumo independiente. Materiales y equipos NO escalan — tardar menos no gasta menos cemento.
  insert into public.analisis_linea (analisis_id, recurso_id, cantidad, orden, nota)
  select v_nueva, l.recurso_id,
         case when r.tipo in ('mano_obra', 'carga_social') then l.cantidad * v_factor else l.cantidad end,
         l.orden, l.nota
    from public.analisis_linea l
    join public.recurso r on r.id = l.recurso_id
   where l.analisis_id = p_analisis_id;

  insert into public.analisis_cuadrilla (analisis_id, categoria, cantidad)
  select v_nueva, categoria, cantidad
    from public.analisis_cuadrilla where analisis_id = p_analisis_id;

  return v_nueva;
end $$;

comment on function public.nueva_version_de_analisis(uuid, text, numeric) is
  'Cierra el análisis vigente con fecha y crea la versión siguiente copiando líneas y cuadrilla. Con '
  'p_hs_unitarias escala PROPORCIONALMENTE la mano de obra y sus cargas para que las horas queden en '
  'el objetivo: la composición es la misma, cambia la cantidad. Así una recomendación de la obra se '
  'aplica sin que nadie invente una receta nueva.';

grant execute on function public.nueva_version_de_analisis(uuid, text, numeric) to authenticated;

-- ── 4 · el estándar publicado, una magnitud por columna ───────────────────────────────────────
-- La JORNADA DE REFERENCIA de esta vista son 8 horas y está escrita acá a propósito: el estándar no
-- pertenece a ninguna obra, así que no puede usar `obra_canonica.jornada_horas`. Cuando el estándar
-- se aplica a una obra, el plazo lo calcula la conversión con la jornada DE ESA OBRA.
create or replace view public.estandar_productivo with (security_invoker = true) as
select a.id                                         as analisis_id,
       a.tarea_tipo_id,
       t.codigo,
       t.nombre                                     as tarea,
       t.unidad,
       a.variante,
       a.version,
       a.vigencia_desde,
       a.vigencia_hasta,
       a.contexto,
       ac.hs_unitarias                              as hh_por_unidad,
       case when ac.hs_unitarias > 0
            then round(1 / ac.hs_unitarias, 4) end  as rendimiento_unidades_por_hh,
       cu.cuadrilla,
       cu.personas                                  as cuadrilla_personas,
       cu.capacidad_ponderada,
       case when ac.hs_unitarias > 0 and cu.capacidad_ponderada > 0
            then round(cu.capacidad_ponderada * 8 / ac.hs_unitarias, 3) end
                                                    as produccion_diaria_referencia,
       ac.costo_directo                             as costo_unitario,
       ac.n_lineas,
       (cu.capacidad_ponderada is null)             as sin_cuadrilla_declarada
  from public.analisis a
  join public.tarea_tipo t on t.id = a.tarea_tipo_id
  left join public.analisis_costo ac on ac.analisis_id = a.id
  left join lateral (
        select jsonb_object_agg(q.categoria, q.cantidad) as cuadrilla,
               sum(q.cantidad)                           as personas,
               sum(q.cantidad * cat.capacidad)           as capacidad_ponderada
          from public.analisis_cuadrilla q
          join public.categoria_obra cat on cat.clave = q.categoria
         where q.analisis_id = a.id) cu on true
 where a.vigente;

comment on view public.estandar_productivo is
  'El estándar vigente de cada tarea, con CADA MAGNITUD EN SU COLUMNA y ninguna mezclada: '
  'hh_por_unidad es esfuerzo, rendimiento_unidades_por_hh es su inversa, capacidad_ponderada es '
  'plantel y produccion_diaria_referencia es ritmo (capacidad × 8 h ÷ hh por unidad). La jornada de '
  '8 h es de REFERENCIA y vive acá porque el estándar no pertenece a ninguna obra; el plazo real lo '
  'calcula la conversión con la jornada de la obra. costo_unitario sale de recurso_precio: para '
  'quien no ve economía llega en NULL, igual que en analisis_costo.';

-- ── 5 · permisos ──────────────────────────────────────────────────────────────────────────────
-- La cuadrilla tipo es OPERATIVA: es con cuánta gente se hace, no cuánto sale. Mismo portero que
-- `analisis` y `analisis_linea`, de las que es hermana.
alter table public.analisis_cuadrilla enable row level security;

drop policy if exists analisis_cuadrilla_lee on public.analisis_cuadrilla;
create policy analisis_cuadrilla_lee on public.analisis_cuadrilla for select to authenticated
  using (true);
drop policy if exists analisis_cuadrilla_escribe on public.analisis_cuadrilla;
create policy analisis_cuadrilla_escribe on public.analisis_cuadrilla for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

-- RLS sin GRANT no se evalúa: la tabla contesta «permission denied» y Next lo muestra como 404.
grant select, insert, update, delete on public.analisis_cuadrilla to authenticated;
grant all on public.analisis_cuadrilla to service_role;
grant select on public.estandar_productivo to authenticated;
grant select on public.estandar_productivo to service_role;
