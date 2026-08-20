-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CIERRE DE GESTIÓN DE OBRA · LO QUE LE FALTABA A LA ACTIVIDAD PARA NO ABRIR MÁS EL EXCEL
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Tres huecos, y ninguno justifica una entidad nueva de trabajo:
--
--   1. NOTAS — lo que alguien quiere dejar dicho sobre una actividad y no es un parte ni un
--      impedimento. Tabla propia y mínima: texto, autor, fecha. NO es un sistema de colaboración.
--      Un comentario que pertenece a una jornada YA vive en el parte (`obra_ejecucion.comentario`) y
--      no se duplica acá.
--
--   2. EQUIPOS — qué máquina se usó y cuántas horas. Cuelga del PARTE, no de la actividad: «la
--      hormigonera trabajó 4 h» es un hecho de un día, igual que la producción y que las HH. Una
--      tabla hija del parte y no dos columnas en `obra_ejecucion` porque una jornada usa más de un
--      equipo, y con columnas eso obligaría a partir el parte en dos —y a contar la producción dos
--      veces—.
--      NO se crea un módulo de maquinaria: el catálogo de equipos ya existe (`herramientas`,
--      espejo del Sheet) y acá se guarda el NOMBRE, que es lo que el jefe de obra escribe. Atarlo por
--      id a una tabla que sincroniza desde afuera haría que un renombrado del Sheet rompiera el
--      historial de la obra.
--
--   3. PAPELES POR ACTIVIDAD — la columna ya existe (`obra_documento.actividad_id`, 19/08) y lo
--      único que falta es que el authenticated pueda escribirla.
--
-- RUBROS: NO HAY NADA QUE MIGRAR. El rubro ya es una fila `tipo = 'resumen'` y la `seccion` de sus
-- hijas — lo que faltaba era poder crearlo, renombrarlo, ordenarlo y mover actividades, y eso son
-- escrituras sobre columnas que existen desde el día uno. Una tabla `obra_rubro` sería la segunda
-- definición de un agrupador que ya está cargado 153 veces.
--
-- Y NO SE PONE UN ÚNICO SOBRE EL NOMBRE DEL RUBRO: en los datos reales «Hormigonado» aparece seis
-- veces en San Francisco y seis en Quattropani, porque el tracker repite el mismo paso en distintas
-- partes de la obra. Eso es estructura legítima. Lo que hay que evitar es el duplicado ACCIDENTAL
-- («Mampostería» / «MAMPOSTERIA» / «Mampostería ») y eso se corta en el alta, donde todavía se le
-- puede preguntar a la persona, no con un índice que rechazaría datos buenos.

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · NOTAS DE ACTIVIDAD
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.obra_actividad_nota (
  id uuid primary key default gen_random_uuid(),
  obra_id text not null references public.obra_canonica (id) on delete cascade,
  actividad_id uuid not null references public.obra_actividad (id) on delete cascade,
  texto text not null,
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now(),
  constraint obra_actividad_nota_dice_algo check (btrim(texto) <> '')
);

create index if not exists obra_actividad_nota_por_actividad
  on public.obra_actividad_nota (actividad_id, creado_en desc);

alter table public.obra_actividad_nota enable row level security;
grant select, insert, delete on public.obra_actividad_nota to authenticated;

drop policy if exists obra_actividad_nota_select on public.obra_actividad_nota;
create policy obra_actividad_nota_select on public.obra_actividad_nota for select to authenticated
  using (public.es_administracion() or public.ve_obra(obra_id));

drop policy if exists obra_actividad_nota_insert on public.obra_actividad_nota;
create policy obra_actividad_nota_insert on public.obra_actividad_nota for insert to authenticated
  with check ((public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra']))
    and (public.es_administracion() or public.ve_obra(obra_id)));

-- BORRAR SÓLO LO PROPIO. Una nota es de quien la escribió; que otro la haga desaparecer convierte el
-- registro en algo que no se puede citar. Editar no existe a propósito: se agrega otra.
drop policy if exists obra_actividad_nota_delete on public.obra_actividad_nota;
create policy obra_actividad_nota_delete on public.obra_actividad_nota for delete to authenticated
  using (creado_por = auth.uid() or public.current_rol() = 'direccion');

comment on table public.obra_actividad_nota is
  'Lo que alguien dejó dicho sobre una actividad. NO es un sistema de comentarios: sin hilos, sin '
  'menciones y sin edición. El comentario de una jornada vive en obra_ejecucion.comentario.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2 · EL EQUIPO QUE TRABAJÓ ESE DÍA
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- PERSONA ≠ EQUIPO. Las horas de una persona van a `registros_hh` —fuente canónica de tiempo, de
-- donde sale la liquidación— y las de una máquina van acá. Meterlas en la misma tabla haría que el
-- costo de mano de obra incluyera a la hormigonera.

create table if not exists public.obra_ejecucion_equipo (
  id uuid primary key default gen_random_uuid(),
  ejecucion_id uuid not null references public.obra_ejecucion (id) on delete cascade,
  obra_id text not null references public.obra_canonica (id) on delete cascade,
  equipo text not null,
  horas numeric,
  constraint obra_ejecucion_equipo_nombrado check (btrim(equipo) <> ''),
  constraint obra_ejecucion_equipo_horas_validas check (horas is null or (horas > 0 and horas <= 24))
);

create index if not exists obra_ejecucion_equipo_por_parte
  on public.obra_ejecucion_equipo (ejecucion_id);
create index if not exists obra_ejecucion_equipo_por_obra
  on public.obra_ejecucion_equipo (obra_id);

alter table public.obra_ejecucion_equipo enable row level security;
grant select, insert, delete on public.obra_ejecucion_equipo to authenticated;

drop policy if exists obra_ejecucion_equipo_select on public.obra_ejecucion_equipo;
create policy obra_ejecucion_equipo_select on public.obra_ejecucion_equipo for select to authenticated
  using (public.es_administracion() or public.ve_obra(obra_id));

drop policy if exists obra_ejecucion_equipo_insert on public.obra_ejecucion_equipo;
create policy obra_ejecucion_equipo_insert on public.obra_ejecucion_equipo for insert to authenticated
  with check ((public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra']))
    and (public.es_administracion() or public.ve_obra(obra_id)));

drop policy if exists obra_ejecucion_equipo_delete on public.obra_ejecucion_equipo;
create policy obra_ejecucion_equipo_delete on public.obra_ejecucion_equipo for delete to authenticated
  using (public.es_administracion() or public.ve_obra(obra_id));

comment on table public.obra_ejecucion_equipo is
  'Qué equipo trabajó en un parte y cuántas horas. Guarda el NOMBRE y no un id de herramientas: esa '
  'tabla sincroniza desde el Sheet y un renombrado allá no puede romper el historial de la obra.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3 · UN PAPEL PUEDE SER DE UNA ACTIVIDAD
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- La columna existe desde el 19/08 pero sin GRANT: RLS no es GRANT, y sin el permiso de columna la
-- escritura devolvía 42501 mientras la policy decía que sí.

grant select (actividad_id), insert (actividad_id), update (actividad_id)
  on public.obra_documento to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4 · LA VISTA DE CONTROL PUBLICA LOS TRES CONTEOS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- `create or replace` sólo permite AGREGAR columnas AL FINAL, y de esta vista cuelgan obra_avance →
-- obra_panel → obra_plan_vs_real → cliente_panel. Por eso los tres van últimos aunque queden lejos
-- de lo que se les parece. Y `with (security_invoker = true)` VA EXPLÍCITO: `create or replace` NO
-- conserva las reloptions, y perderlo dejaría la vista salteándose el RLS en silencio (pasó el
-- 19/08 con obra_avance).

create or replace view public.obra_actividad_control with (security_invoker = true) as
select
    a.id                as actividad_id,
    a.id,
    a.obra_id, a.codigo, a.codigo_padre, a.nombre, a.tipo, a.orden, a.seccion, a.archivada,
    a.clave, a.dias_plan, a.dias_real, a.editado_a_mano, a.fuente_pestana, a.creada_en_web,
    a.cuadrilla,
    (select p.nombre from public.obra_actividad p
      where p.obra_id = a.obra_id and p.codigo = a.codigo_padre and p.tipo = 'resumen'
      order by p.orden limit 1) as rubro,
    a.estado,
    a.unidad, a.cantidad_objetivo, a.metodo_avance,
    a.inicio_plan, a.fin_plan, a.inicio_base, a.fin_base, a.sellada_en, a.inicio_real, a.fin_real,
    a.hh_plan, a.responsable_id, a.cuadrilla_id,
    (select c.nombre from public.cuadrilla c where c.id = a.cuadrilla_id) as cuadrilla_prevista,
    a.comentario, a.partida_codigo, a.partida_cantidad,
    a.pct,
    a.pct               as avance_declarado,
    e.cantidad_ejecutada, e.avance_partes, e.n_partes, e.ultimo_parte,
    h.hh_real, h.hh_extra,
    coalesce(h.n_imputaciones, 0)::integer as n_imputaciones,
    coalesce(imp.abiertos, 0)::integer      as impedimentos_abiertos,

    case a.metodo_avance
      when 'cantidad' then case when a.cantidad_objetivo > 0
        then least(100, round(coalesce(e.cantidad_ejecutada, 0) / a.cantidad_objetivo * 100, 1)) end
      when 'partes' then least(100, round(coalesce(e.avance_partes, 0), 1))
      else a.pct
    end as avance_pct,

    case a.metodo_avance
      when 'cantidad' then 'cantidad'
      when 'partes' then 'partes'
      else case when a.pct is not null then 'declarado' end
    end as origen_avance,

    case when coalesce(imp.abiertos, 0) > 0 then 'bloqueada' else a.estado end as estado_operativo,

    case when e.cantidad_ejecutada > 0 and h.hh_real > 0
      then round(e.cantidad_ejecutada / h.hh_real, 3) end as productividad,
    case when a.hh_plan > 0 and h.hh_real is not null
      then round(h.hh_real / a.hh_plan * 100, 1) end as consumo_hh_pct,

    a.actividad_padre_id,
    coalesce(t.n_tareas, 0)::integer        as n_tareas,
    coalesce(t.n_tareas_hechas, 0)::integer as n_tareas_hechas,
    coalesce(ped.n_pedidos, 0)::integer     as n_pedidos,

    -- LAS TRES DE HOY, AL FINAL POR OBLIGACIÓN de `create or replace view`.
    coalesce(nt.n_notas, 0)::integer        as n_notas,
    coalesce(doc.n_documentos, 0)::integer  as n_documentos,
    coalesce(eq.n_equipos, 0)::integer      as n_equipos
  from public.obra_actividad a
  left join lateral (
    select sum(x.cantidad) as cantidad_ejecutada, sum(x.avance_pct) as avance_partes,
           count(*)::integer as n_partes, max(x.fecha) as ultimo_parte
      from public.obra_ejecucion x where x.actividad_id = a.id) e on true
  left join lateral (
    select sum(r.horas) filter (where r.tipo_hora in ('normal', 'extra_50', 'extra_100')) as hh_real,
           sum(r.horas) filter (where r.tipo_hora in ('extra_50', 'extra_100'))           as hh_extra,
           count(*) filter (where r.tipo_hora in ('normal', 'extra_50', 'extra_100'))     as n_imputaciones
      from public.registros_hh r where r.actividad_id = a.id) h on true
  left join lateral (
    select count(*)::integer as abiertos from public.obra_restriccion x
     where x.actividad_id = a.id and x.fecha_liberacion is null) imp on true
  left join lateral (
    select count(*)::integer as n_tareas,
           count(*) filter (where x.estado = 'hecha')::integer as n_tareas_hechas
      from public.obra_actividad x where x.actividad_padre_id = a.id and not x.archivada) t on true
  left join lateral (
    select count(*)::integer as n_pedidos
      from public.pedidos_materiales x where x.actividad_id = a.id) ped on true
  left join lateral (
    select count(*)::integer as n_notas
      from public.obra_actividad_nota x where x.actividad_id = a.id) nt on true
  left join lateral (
    select count(*)::integer as n_documentos
      from public.obra_documento x where x.actividad_id = a.id) doc on true
  left join lateral (
    select count(distinct x.equipo)::integer as n_equipos
      from public.obra_ejecucion_equipo x
      join public.obra_ejecucion p on p.id = x.ejecucion_id
     where p.actividad_id = a.id) eq on true;

grant select on public.obra_actividad_control to authenticated;

commit;
