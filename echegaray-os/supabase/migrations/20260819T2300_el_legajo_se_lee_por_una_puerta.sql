-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL LEGAJO SE LEE POR UNA PUERTA, Y EL SUELDO NO PASA POR NINGUNA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ QUÉ CORRIGE ESTA MIGRACIÓN, Y POR QUÉ LA ANTERIOR ESTABA MAL ═══
--
-- `20260819T2200` devolvió el GRANT DE TABLA entero sobre `personas` para desbloquear la pantalla
-- (*"permission denied for table personas"*), apoyándose en que la RLS ya limita las filas a
-- Administración. El razonamiento tiene un agujero y un test lo encontró
-- (`columnas-comerciales-cerradas.test.mjs`): con el grant entero, `dni`, `cuil` y
-- `retribucion_pactada` vuelven a estar al alcance de `authenticated` a nivel privilegio, y lo único
-- que las tapa es una policy. Una policy se afloja con una línea, y una vista nueva con
-- `security_invoker = false` la saltea sin siquiera aflojarla. La defensa de la columna tiene que
-- vivir en la columna.
--
-- Pero el grant por columna NO puede ser el mecanismo que le da el DNI a Administración: `authenticated`
-- es UN SOLO rol de Postgres para los cuatro roles de la aplicación. O el DNI lo alcanzan los cuatro,
-- o ninguno. Por eso el corte queda así:
--
--   `personas` (la tabla)   · grant por columna SIN dni, cuil ni retribucion_pactada
--                           · RLS de filas: `es_administracion()`
--   `persona_plantel`       · lo operativo para la obra (5 columnas). Desescalada declarada.
--   `persona_legajo`        · el legajo de Administración, CON dni y cuil, con el portero adentro.
--                             Desescalada declarada, y la última: el sueldo no entra ni acá.
--
-- ═══ POR QUÉ `retribucion_pactada` NO ESTÁ EN NINGUNA DE LAS DOS VISTAS ═══
--
-- Ninguna pantalla de este módulo la muestra: el dueño no la pidió en la ficha y prohibió mostrarla
-- en la tabla. Una columna que nadie muestra pero que viaja igual al navegador es una fuga sin
-- beneficio. El día que haga falta —una pantalla de liquidación— se agrega con su propia decisión.
-- Sigue escribiéndose y leyéndose por conexión directa (el orquestador entra como `postgres`).

-- ── 1 · `persona_plantel` VUELVE A SU CONTRATO EXACTO ───────────────────────────────────────────
--
-- La migración anterior le agregó `puesto` y `fecha_ingreso`. Se sacan las dos, y se dice por qué:
--
--   · `puesto` es operativo, pero `especialidad` —que ya estaba— responde la misma pregunta al
--     asignar («¿es plomero o albañil?»). Dos columnas para lo mismo amplían la desescalada sin
--     agregar una sola decisión que hoy no se pueda tomar.
--   · `fecha_ingreso` es DATO LABORAL: es la antigüedad, y la antigüedad es un tramo de convenio y
--     un componente del sueldo. Ninguna pantalla de obra la necesita para ejecutar la obra.
--
-- La desescalada vuelve a ser exactamente la que se declaró el 19/08: cinco columnas.
-- `cuadrilla_panel` se apoya en esta vista para resolver el nombre del capataz, así que hay que
-- bajarla y volver a levantarla: en Postgres una vista no se puede reescribir con menos columnas.
drop view if exists public.cuadrilla_panel;
drop view if exists public.persona_plantel;
create view public.persona_plantel with (security_invoker = false) as
select p.id, p.nombre_completo, p.categoria, p.especialidad, p.fecha_egreso
from public.personas p;

comment on view public.persona_plantel is
  'Subconjunto NO sensible de personas para que la obra pueda asignar personal. Sin DNI, CUIL, sueldo, ingreso, ART, obra social ni documentos.';

grant select on public.persona_plantel to authenticated;

-- ── 2 · EL LEGAJO DE ADMINISTRACIÓN, CON EL PORTERO ADENTRO ─────────────────────────────────────
--
-- `security_invoker = false` para poder leer las columnas que el grant le niega al invocante, y el
-- `where es_administracion()` porque sin él la vista sería exactamente el agujero que la migración
-- anterior abrió. La lista de columnas es FIJA: si mañana alguien le agrega `retribucion_pactada`,
-- el test de desescalada se pone rojo y hay que volver a discutirlo.
create or replace view public.persona_legajo
with (security_invoker = false) as
select
  p.id, p.nombre_completo, p.dni, p.cuil, p.fecha_nacimiento, p.nacionalidad,
  p.telefono, p.email, p.domicilio, p.contacto_emergencia, p.contacto_emergencia_telefono,
  p.fecha_ingreso, p.fecha_egreso, p.convenio_colectivo, p.categoria, p.especialidad, p.puesto,
  p.modalidad_liquidacion, p.art, p.obra_social, p.drive_folder_id, p.notas
from public.personas p
where public.es_administracion();

comment on view public.persona_legajo is
  'EL legajo, para la ficha de Administración. Único camino a dni/cuil desde la web: el grant por columna se los niega a authenticated. NO publica retribucion_pactada.';

grant select on public.persona_legajo to authenticated;

-- ── 3 · EL GRANT POR COLUMNA, CALCULADO DEL CATÁLOGO ────────────────────────────────────────────
--
-- Se calcula en vez de escribirse a mano por el modo de falla SILENCIOSO: una columna agregada
-- después queda sin conceder, la web la muestra vacía, y nadie lo asocia a un permiso. Acá se
-- conceden TODAS menos las tres cerradas, hoy y cada vez que esto corra.
do $$
declare cols text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'personas'
     and column_name not in ('dni', 'cuil', 'retribucion_pactada');

  execute 'revoke select on public.personas from authenticated';
  execute format('grant select (%s) on public.personas to authenticated', cols);
end $$;

-- La escritura NO se toca: Administración carga el DNI y el CUIL desde la ficha, y eso ya lo
-- permitían los grants de INSERT/UPDATE por columna. Quién puede escribir lo sigue decidiendo la
-- RLS (`es_administracion()`), que es donde tiene que estar.

-- ── 4 · Y `cuadrilla_panel` VUELVE, IGUAL QUE ESTABA ────────────────────────────────────────────
--
-- Se cayó al bajar `persona_plantel`. `security_invoker = true` se REPITE a propósito: Postgres NO
-- lo hereda de la definición anterior, y una vista que lo pierde saltea el RLS de sus tablas — es
-- exactamente cómo `cliente_panel` volvió a filtrar el 19/08.
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
