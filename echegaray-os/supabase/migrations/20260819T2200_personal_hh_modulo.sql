-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- MÓDULO 03 · PERSONAL / HH — EL EJE PERSONA → ASIGNACIÓN → OBRA → ACTIVIDAD → HORAS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño (19/08/2026): *"Cada imputación es persona_id · fecha · obra_id · actividad_id opcional ·
-- horas"* · *"No crees un segundo sistema de Jornales"* · *"NO guardes 'obra actual' como segunda
-- verdad si se deriva de la asignación vigente"* · *"Una persona NO pertenece eternamente a una
-- cuadrilla"* · *"Obras NO debe recibir información laboral sensible que no necesita"*.
--
-- ═══ LO QUE SE MIDIÓ EN LA BASE ANTES DE ESCRIBIR (19/08/2026, conexión directa) ═══
--
--   personas               30 filas · 0 con fecha_egreso · sin teléfono/email/domicilio (no existían)
--   registros_hh           19 filas · TODAS legacy (obra_canonica_id null, trabajador texto libre)
--   obra_asignacion         3 filas · cuadrilla = '1' y '2' en texto libre
--   obra_actividad        344 filas · hh_plan not null: 0 · hh_real not null: 0
--   documentacion_legajo   12 filas · policy de SELECT `using (true)`  ← el legajo documental, abierto
--   cuadrillas             NO EXISTÍA como entidad: sólo el texto de `obra_asignacion.cuadrilla`
--
-- ═══ EL BLOQUEO QUE ESTA MIGRACIÓN LEVANTA ═══
--
-- `/administracion/personas` devolvía *"permission denied for table personas"*. La causa NO era la
-- RLS: era un GRANT POR COLUMNA. El 19/08 se hizo `revoke select on personas` + `grant select
-- (…21 columnas…)` dejando fuera `dni`, `cuil` y `retribucion_pactada`, y `personasService` pide
-- justamente `dni, cuil`. Postgres rechaza la consulta entera con el mensaje de la TABLA, no de la
-- columna, y por eso el error mandaba a mirar la RLS.
--
-- Y el enfoque no se podía arreglar afinando la lista de columnas: `authenticated` es UN SOLO rol de
-- Postgres para los cuatro roles de la aplicación. Un grant por columna no distingue Administración
-- de Obras — o el DNI lo ven los dos, o no lo ve ninguno. Por eso el corte vuelve a donde sí
-- discrimina: la RLS decide FILAS (la tabla `personas` es de Administración) y la vista
-- `persona_plantel` publica el subconjunto operativo que la obra necesita para trabajar.
--
-- ═══ LO QUE SE DECLARA EN VEZ DE DECIDIRSE EN SILENCIO ═══
--
-- `persona_plantel` sigue siendo legible por CUALQUIER autenticado, no sólo por las personas ligadas
-- a sus obras. Motivo mecánico: para asignar a alguien a una obra hay que poder elegirlo de una
-- lista, y una lista que sólo muestra a los que YA están asignados hace imposible la primera
-- asignación. Lo que se acota es el CONTENIDO —nombre, categoría, especialidad, ingreso, egreso; ni
-- DNI, ni CUIL, ni sueldo, ni obra social, ni ART, ni documentos— y todo lo demás queda del lado de
-- Administración. Si el dueño quiere además esconder los nombres del plantel no asignado, es un
-- `where` en esta vista y una lista de candidatos que habrá que llenar por otro camino.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · EL LEGAJO: LA TABLA ES DE ADMINISTRACIÓN, LA VISTA ES DE TODOS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Los campos que la ficha canónica pide y el modelo no tenía. Nada más: `nombre_completo` NO se
-- parte en nombre + apellido. Las 30 filas reales están cargadas como un solo texto y adivinar
-- dónde termina el nombre en «PEREZ JUAN CARLOS» es fabricar un dato con la cara de un dato real.
alter table public.personas
  add column if not exists telefono text,
  add column if not exists email text,
  add column if not exists domicilio text,
  add column if not exists contacto_emergencia text,
  add column if not exists contacto_emergencia_telefono text,
  add column if not exists puesto text;

comment on column public.personas.puesto is
  'El oficio con el que trabaja, cuando difiere de la especialidad del legajo. NULL = sin cargar.';
comment on column public.personas.contacto_emergencia is
  'A quién avisar. Dato de seguridad: vive con el legajo, no viaja a la obra.';

-- ═══ EL REVOKE ES LO QUE BORRA LOS GRANTS POR COLUMNA ═══
-- Revocar el privilegio a nivel tabla revoca también el mismo privilegio a nivel columna. Sin este
-- `revoke`, el `grant` de abajo convive con la lista de 21 columnas y queda una segunda definición
-- de quién ve qué, esperando a contradecir a la primera.
revoke select on public.personas from authenticated;
grant select, insert, update, delete on public.personas to authenticated;

drop policy if exists personas_select on public.personas;
create policy personas_select on public.personas
  for select to authenticated using (public.es_administracion());

-- El plantel operativo. `security_invoker = false` es deliberado: la vista tiene que poder leer la
-- tabla cerrada para publicar el subconjunto. Lo que la hace segura es que la lista de columnas es
-- fija y no incluye ningún dato sensible.
drop view if exists public.persona_plantel;
create view public.persona_plantel with (security_invoker = false) as
select p.id, p.nombre_completo, p.categoria, p.especialidad, p.puesto, p.fecha_ingreso, p.fecha_egreso
from public.personas p;

comment on view public.persona_plantel is
  'Subconjunto NO sensible de personas para que la obra pueda asignar personal. Sin DNI, CUIL, sueldo, ART, obra social ni documentos.';

grant select on public.persona_plantel to authenticated;

-- ── EL LEGAJO DOCUMENTAL TAMBIÉN ES DE ADMINISTRACIÓN ───────────────────────────────────────────
--
-- `documentacion_legajo_select` decía `true`: cualquier autenticado leía qué documentos tiene cada
-- persona y el id de Drive para abrirlos. Y `documentacion_legajo_write` era `for all`, que INCLUYE
-- select — el mismo patrón que ya abrió tres agujeros en este repo. Se parte por comando.
alter table public.documentacion_legajo add column if not exists nombre text;
comment on column public.documentacion_legajo.nombre is
  'Cómo se llama el documento para quien lo busca. El archivo NO se copia: vive en Drive y acá va el vínculo.';

drop policy if exists documentacion_legajo_select on public.documentacion_legajo;
drop policy if exists documentacion_legajo_write  on public.documentacion_legajo;
create policy documentacion_legajo_select on public.documentacion_legajo
  for select to authenticated using (public.es_administracion());
create policy documentacion_legajo_insert on public.documentacion_legajo
  for insert to authenticated with check (public.es_administracion());
create policy documentacion_legajo_update on public.documentacion_legajo
  for update to authenticated using (public.es_administracion()) with check (public.es_administracion());
create policy documentacion_legajo_delete on public.documentacion_legajo
  for delete to authenticated using (public.es_administracion());
grant select, insert, update, delete on public.documentacion_legajo to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · LA CUADRILLA COMO ENTIDAD, Y LA PERTENENCIA COMO PERÍODO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Hoy la cuadrilla es el texto `obra_asignacion.cuadrilla`, con los valores '1' y '2'. Eso no
-- responde ninguna de las preguntas que el dueño hace: quién la conduce, quiénes la integran, desde
-- cuándo, y a qué obra está yendo esta semana.
--
-- ═══ LA CUADRILLA NO GUARDA SU OBRA ═══
--
-- *"NO guardes 'obra actual' como segunda verdad si se deriva de la asignación vigente."* La obra de
-- una cuadrilla ES el conjunto de asignaciones vigentes de sus integrantes con esa cuadrilla. Una
-- columna `obra_id` acá sería la segunda verdad, y el día que un integrante se mueva a otra obra las
-- dos dirían cosas distintas sin que nada avise.

create table if not exists public.cuadrilla (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- El capataz es una PERSONA del legajo, no un texto: si mañana se va de la empresa, la cuadrilla
  -- tiene que quedar sin responsable a la vista, no con el nombre de alguien que no está.
  responsable_id uuid references public.personas(id) on delete set null,
  activa boolean not null default true,
  notas text,
  creado_en timestamptz not null default now(),
  creado_por uuid references public.perfiles(id) default auth.uid()
);

comment on table public.cuadrilla is
  'La cuadrilla como entidad. Su obra actual NO se guarda: se deriva de las asignaciones vigentes de sus integrantes.';

-- Dos cuadrillas que se llaman igual son la misma cargada dos veces. La normalización es mínima
-- —mayúsculas y espacios— para que no pueda divergir de ninguna otra definición.
create unique index if not exists cuadrilla_nombre_unico
  on public.cuadrilla (upper(btrim(regexp_replace(nombre, '\s+', ' ', 'g'))));

create table if not exists public.cuadrilla_integrante (
  id uuid primary key default gen_random_uuid(),
  cuadrilla_id uuid not null references public.cuadrilla(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  desde date not null default current_date,
  hasta date,
  creado_en timestamptz not null default now(),
  constraint cuadrilla_integrante_periodo check (hasta is null or hasta >= desde)
);

comment on table public.cuadrilla_integrante is
  'Pertenencia CON VIGENCIA. Mover a alguien de cuadrilla cierra la fila con `hasta` y abre otra: el historial no se pisa.';

-- ═══ UNA PERSONA, UNA CUADRILLA VIGENTE ═══
-- Es lo que hace que «CUADRILLA» pueda ser UNA columna en el listado global. Sin esta única, la
-- misma persona puede quedar abierta en dos cuadrillas y la pantalla tendría que elegir una —y
-- elegiría la que devuelva primero el planificador, que cambia sin avisar.
create unique index if not exists cuadrilla_integrante_una_vigente
  on public.cuadrilla_integrante (persona_id) where hasta is null;
create index if not exists cuadrilla_integrante_cuadrilla_idx
  on public.cuadrilla_integrante (cuadrilla_id);

alter table public.cuadrilla enable row level security;
alter table public.cuadrilla_integrante enable row level security;

-- La cuadrilla se LEE desde la obra (para asignarla) y se ADMINISTRA desde Personal. Es la misma
-- frontera "ver ≠ administrar" que ya rige para clientes y proveedores.
drop policy if exists cuadrilla_select on public.cuadrilla;
create policy cuadrilla_select on public.cuadrilla for select to authenticated using (true);
drop policy if exists cuadrilla_insert on public.cuadrilla;
create policy cuadrilla_insert on public.cuadrilla for insert to authenticated with check (public.es_administracion());
drop policy if exists cuadrilla_update on public.cuadrilla;
create policy cuadrilla_update on public.cuadrilla for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());
drop policy if exists cuadrilla_delete on public.cuadrilla;
create policy cuadrilla_delete on public.cuadrilla for delete to authenticated using (public.es_administracion());

drop policy if exists cuadrilla_integrante_select on public.cuadrilla_integrante;
create policy cuadrilla_integrante_select on public.cuadrilla_integrante for select to authenticated using (true);
drop policy if exists cuadrilla_integrante_insert on public.cuadrilla_integrante;
create policy cuadrilla_integrante_insert on public.cuadrilla_integrante for insert to authenticated
  with check (public.es_administracion());
drop policy if exists cuadrilla_integrante_update on public.cuadrilla_integrante;
create policy cuadrilla_integrante_update on public.cuadrilla_integrante for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());
drop policy if exists cuadrilla_integrante_delete on public.cuadrilla_integrante;
create policy cuadrilla_integrante_delete on public.cuadrilla_integrante for delete to authenticated
  using (public.es_administracion());

grant select, insert, update, delete on public.cuadrilla to authenticated;
grant select, insert, update, delete on public.cuadrilla_integrante to authenticated;

-- La asignación a obra pasa a apuntar a la cuadrilla canónica. La columna de texto NO se borra: es
-- lo único que dice hoy que dos de las tres asignaciones cargadas eran de la «1».
alter table public.obra_asignacion
  add column if not exists cuadrilla_id uuid references public.cuadrilla(id) on delete set null;
create index if not exists obra_asignacion_cuadrilla_idx on public.obra_asignacion (cuadrilla_id);
comment on column public.obra_asignacion.cuadrilla is
  'TEXTO LEGACY (valores ''1'' y ''2''). Lo que identifica una cuadrilla hoy es cuadrilla_id.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · LA IMPUTACIÓN DE HORAS: LA MISMA TABLA, CON EL EJE QUE FALTABA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- *"No crees un segundo sistema de Jornales. Reutilizá `registros_hh` si es la tabla canónica."*
-- Lo es: `obra_plan_vs_real` publica HH real sumando esta tabla, y esa vista es la única fuente del
-- número en toda la web. Así que se le agregan los tres ejes que le faltaban —persona, actividad y
-- DÍA— en vez de fundar una tabla nueva al lado que habría que reconciliar para siempre.

alter table public.registros_hh
  -- `on delete restrict`: borrar una persona con horas imputadas borraría la evidencia de un costo
  -- de obra. Del plantel se sale con `fecha_egreso`, no con un DELETE.
  add column if not exists persona_id uuid references public.personas(id) on delete restrict,
  -- `on delete set null`: si se archiva o borra una actividad del cronograma, las horas SIGUEN
  -- siendo de la obra. Perderlas junto con la actividad borraría trabajo que se hizo de verdad.
  add column if not exists actividad_id uuid references public.obra_actividad(id) on delete set null,
  add column if not exists fecha date;

comment on column public.registros_hh.fecha is
  'EL DÍA trabajado. Es el grano de la carga nueva. Las 19 filas históricas no lo tienen: su grano es la semana.';
comment on column public.registros_hh.trabajador_o_cuadrilla is
  'TEXTO LEGACY del Sheet de JORNALES. En las filas nuevas es NULL: quién trabajó lo dice persona_id.';

-- El texto deja de ser obligatorio porque en las filas nuevas el nombre NO se copia: se resuelve
-- contra `personas`. Una copia del nombre acá envejecería sola el día que se corrija una carga.
alter table public.registros_hh alter column trabajador_o_cuadrilla drop not null;

alter table public.registros_hh drop constraint if exists registros_hh_tiene_quien;
alter table public.registros_hh add constraint registros_hh_tiene_quien
  check (persona_id is not null or trabajador_o_cuadrilla is not null);

-- Una imputación con persona SIEMPRE tiene su día. Sin esto se podría cargar "Pérez, 8 horas, esta
-- semana" y el plan contra real por actividad no sabría a qué período pertenece.
alter table public.registros_hh drop constraint if exists registros_hh_persona_con_fecha;
alter table public.registros_hh add constraint registros_hh_persona_con_fecha
  check (persona_id is null or fecha is not null);

-- La actividad tiene que ser de la MISMA obra que la imputación. Un trigger y no un CHECK porque un
-- CHECK no puede consultar otra tabla. Sin esto se pueden imputar horas de San Francisco a una
-- actividad de ARCOR y el plan contra real de las dos obras queda mal, en silencio.
create or replace function public.registros_hh_normalizar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_obra text;
begin
  -- LA SEMANA SE DERIVA DEL DÍA, no se pide dos veces. `fecha_inicio_semana` es `not null` y sigue
  -- siendo el grano de las 19 filas históricas y de `obra_hh_resumen`; pedirle el lunes a quien
  -- carga un martes es pedirle que calcule a mano una clave única.
  if new.fecha is not null then
    new.fecha_inicio_semana := (new.fecha - (extract(isodow from new.fecha)::int - 1))::date;
  end if;

  if new.actividad_id is not null then
    select a.obra_id into v_obra from public.obra_actividad a where a.id = new.actividad_id;
    if v_obra is null then
      raise exception 'La actividad % no existe', new.actividad_id;
    end if;
    if new.obra_canonica_id is distinct from v_obra then
      raise exception 'La actividad pertenece a la obra % y las horas se están imputando a %',
        v_obra, coalesce(new.obra_canonica_id, '(sin obra)');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists registros_hh_normalizar on public.registros_hh;
create trigger registros_hh_normalizar
  before insert or update on public.registros_hh
  for each row execute function public.registros_hh_normalizar();

-- ═══ LA CLAVE ÚNICA SE PARTE EN DOS PORQUE HAY DOS GRANOS ═══
--
-- La única vigente es `(obra, trabajador_texto, semana)`. Contra la carga nueva no restringe nada
-- —`trabajador_o_cuadrilla` es NULL— y encima ES DAÑINA si alguien completa el texto: dos días
-- distintos de la misma semana caen en la misma semana y el segundo sería rechazado. Se parte:
-- una clave para el grano viejo (semana + texto) y otra para el nuevo (día + persona + actividad).
drop index if exists public.registros_hh_canonica_unico;

create unique index if not exists registros_hh_legacy_unico
  on public.registros_hh (obra_canonica_id, trabajador_o_cuadrilla, fecha_inicio_semana)
  where obra_canonica_id is not null and persona_id is null;

create unique index if not exists registros_hh_persona_unico
  on public.registros_hh
     (obra_canonica_id, persona_id, fecha,
      coalesce(actividad_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where persona_id is not null;

create index if not exists registros_hh_persona_idx on public.registros_hh (persona_id) where persona_id is not null;
create index if not exists registros_hh_actividad_idx on public.registros_hh (actividad_id) where actividad_id is not null;

-- ── LAS HORAS TAMBIÉN SE ACOTAN POR OBRA ────────────────────────────────────────────────────────
--
-- `lectura_autenticados` decía `true`: un jefe de obra leía por PostgREST las horas de las ocho
-- obras. Es el mismo `using (true)` que ya se cerró en actividades, certificados y avance.
-- Las 19 filas históricas no tienen eje canónico: quedan del lado de Administración, que es quien
-- puede decidir a qué obra corresponden.
drop policy if exists lectura_autenticados on public.registros_hh;
create policy hh_select_por_obra on public.registros_hh
  for select to authenticated
  using (public.es_administracion() or (obra_canonica_id is not null and public.ve_obra(obra_canonica_id)));

-- *"OBRAS: … carga/corrige HH de sus obras."* Corregir incluye borrar lo que se cargó mal: si sólo
-- Administración puede borrar, el jefe de obra que se equivocó no tiene forma de arreglarlo y el
-- total infla. La cota sigue siendo la obra.
drop policy if exists hh_delete_por_obra on public.registros_hh;
create policy hh_delete_por_obra on public.registros_hh
  for delete to authenticated
  using (
    public.current_rol() in ('direccion', 'administracion', 'jefe_obra')
    and (public.es_administracion() or (obra_canonica_id is not null and public.ve_obra(obra_canonica_id)))
  );

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · UN SOLO CÁLCULO DE HH POR ACTIVIDAD
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `obra_actividad.hh_real` era una columna que se cargaba A MANO desde el panel de la actividad,
-- al lado de las horas imputadas de verdad en `registros_hh`. Dos números para el mismo hecho.
-- Se verificó antes de tocarla: **0 filas de 344 la tienen cargada**, así que borrarla no pierde un
-- solo dato. HH real es, desde acá, la suma de las imputaciones ligadas a la actividad. Y punto.
alter table public.obra_actividad drop column if exists hh_real;

create or replace view public.obra_actividad_hh
with (security_invoker = true) as
select
  a.id            as actividad_id,
  a.obra_id,
  a.nombre,
  a.tipo,
  a.orden,
  a.pct           as avance_pct,
  a.hh_plan,
  r.hh_real,
  r.n_imputaciones,
  -- EL DESVÍO SÓLO CUANDO ESTÁN LAS DOS PUNTAS. Sin plan cargado no es 0%: es desconocido, y la
  -- pantalla tiene que poder decir "HH plan sin cargar" en vez de dibujar un desvío inventado.
  case when a.hh_plan > 0 and r.hh_real is not null
       then round((r.hh_real - a.hh_plan) / a.hh_plan * 100, 1) end as desvio_pct,
  -- Cuánto del plan se consumió. Contra el avance físico es la lectura de productividad del MVP:
  -- 45% de avance con 73% de las horas consumidas es consumo adelantado.
  case when a.hh_plan > 0 and r.hh_real is not null
       then round(r.hh_real / a.hh_plan * 100, 1) end as consumo_plan_pct
from public.obra_actividad a
left join lateral (
  select sum(h.horas) as hh_real, count(*)::int as n_imputaciones
  from public.registros_hh h where h.actividad_id = a.id
) r on true
where not a.archivada;

comment on view public.obra_actividad_hh is
  'HH plan (obra_actividad.hh_plan) contra HH real (suma de registros_hh por actividad_id). Es el ÚNICO cálculo: lo leen Cronograma y Personal.';

grant select on public.obra_actividad_hh to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5 · LO DERIVADO: DÓNDE ESTÁ CADA PERSONA, Y DÓNDE ESTÁ CADA CUADRILLA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ninguna de estas dos vistas guarda nada: las dos DERIVAN de `obra_asignacion`, que es la única
-- relación canónica persona ↔ obra ↔ actividad. Por eso la ficha de la persona y la solapa Personal
-- de la obra no pueden contradecirse: leen lo mismo por dos caminos.
--
-- VIGENTE = empezó y no terminó. `desde` nulo cuenta como "desde siempre" y `hasta` nulo como "sin
-- fecha de fin", que es como está cargada hoy la totalidad de las asignaciones.

create or replace function public.asignacion_vigente(p_desde date, p_hasta date)
returns boolean language sql immutable parallel safe as $$
  select (p_desde is null or p_desde <= current_date)
     and (p_hasta is null or p_hasta >= current_date)
$$;
grant execute on function public.asignacion_vigente(date, date) to authenticated;

-- El listado global de Personal. `security_invoker = true`: hereda la RLS de `personas`, o sea que
-- sólo Administración lo lee. No hace falta un `where es_administracion()` acá.
create or replace view public.persona_directorio
with (security_invoker = true) as
select
  p.id,
  p.nombre_completo,
  p.categoria,
  p.especialidad,
  p.puesto,
  p.fecha_ingreso,
  p.fecha_egreso,
  ci.cuadrilla_id,
  cu.nombre as cuadrilla,
  a.obra_id as obra_actual_id,
  a.rol     as rol_en_obra,
  a.desde   as asignada_desde
from public.personas p
-- La cuadrilla vigente. Es UNA por el índice único `cuadrilla_integrante_una_vigente`.
left join public.cuadrilla_integrante ci on ci.persona_id = p.id and ci.hasta is null
left join public.cuadrilla cu on cu.id = ci.cuadrilla_id
-- La asignación vigente. Si hubiera más de una (alguien repartido entre dos obras) se muestra la
-- más reciente y el resto se ve en la ficha: la columna del listado tiene lugar para una sola.
left join lateral (
  select oa.obra_id, oa.rol, oa.desde
  from public.obra_asignacion oa
  where oa.persona_id = p.id and public.asignacion_vigente(oa.desde, oa.hasta)
  order by oa.desde desc nulls last, oa.creado_en desc
  limit 1
) a on true;

comment on view public.persona_directorio is
  'El listado de Personal: quién es, su cuadrilla vigente y su obra actual DERIVADA de la asignación vigente. Sin DNI, CUIL ni sueldo.';

grant select on public.persona_directorio to authenticated;

-- Dónde está trabajando cada cuadrilla, y cuánta gente tiene. Todo derivado.
create or replace view public.cuadrilla_panel
with (security_invoker = true) as
select
  c.id,
  c.nombre,
  c.activa,
  c.notas,
  c.responsable_id,
  r.nombre_completo as responsable,
  (select count(*)::int from public.cuadrilla_integrante ci
    where ci.cuadrilla_id = c.id and ci.hasta is null) as integrantes,
  (select string_agg(distinct oa.obra_id, ', ' order by oa.obra_id)
     from public.obra_asignacion oa
    where oa.cuadrilla_id = c.id and public.asignacion_vigente(oa.desde, oa.hasta)) as obras_actuales
from public.cuadrilla c
left join public.persona_plantel r on r.id = c.responsable_id;

comment on view public.cuadrilla_panel is
  'La cuadrilla con lo que se deriva de ella: integrantes vigentes y obras donde está asignada hoy. Nada de esto se guarda.';

grant select on public.cuadrilla_panel to authenticated;
