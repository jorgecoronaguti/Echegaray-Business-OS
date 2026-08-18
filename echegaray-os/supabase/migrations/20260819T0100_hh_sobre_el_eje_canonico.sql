-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS HH NO PODÍAN IMPUTARSE A UNA OBRA: LA COLUMNA OBLIGATORIA APUNTABA AL EJE MUERTO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL SÍNTOMA ═══
--
-- «HH real» venía `—` en las OCHO obras. La pantalla lo decía bien —*"nadie imputó horas a esta
-- obra"*— pero la causa no era que nadie las hubiera cargado: era que NO SE PODÍAN CARGAR.
--
-- Las 19 filas de `registros_hh` cuelgan todas del mismo `obra_id` legacy
-- (`85653d8c-…` = «Pisos», estado *pausada*), y «Pisos» no tiene obra canónica: no coincide por
-- nombre con ninguna de las ocho y no tiene alias. Medido, no supuesto:
--
--     filas: 19   ·   con obra_canonica_id: 0   ·   sin: 19
--
-- **No se le asigna una obra canónica a «Pisos» en esta migración.** Cuál obra de hoy —si alguna—
-- corresponde a esas 19 filas de junio/julio es una decisión del dueño, y elegirla yo sería fabricar
-- la imputación de 671 horas. Quedan como están, visibles y sin eje: un dato huérfano declarado vale
-- más que un dato bien puesto en el lugar equivocado.
--
-- ═══ LA CAUSA ═══
--
--     obra_id uuid NOT NULL references obras(id)      ← `public.obras`, la tabla LEGACY
--
-- `obra_canonica_id` se agregó el 18/08 como columna opcional al lado. O sea: el eje viejo era
-- obligatorio y el nuevo optativo, justo al revés de lo que vale hoy. Cualquier alta desde la web
-- tenía que inventar un uuid de una tabla de 4 obras pausadas para poder guardar una hora trabajada
-- en San Francisco.
--
-- ═══ LA CURA ═══
--
-- `obra_id` pasa a ser opcional y aparece un CHECK que exige al menos uno de los dos ejes. No se
-- borra la columna vieja: las 19 filas históricas son el único rastro de esas horas y su `obra_id`
-- es lo único que hoy dice de dónde salieron.

alter table public.registros_hh alter column obra_id drop not null;

alter table public.registros_hh
  drop constraint if exists registros_hh_tiene_obra;
alter table public.registros_hh
  add constraint registros_hh_tiene_obra
  check (obra_id is not null or obra_canonica_id is not null);

comment on column public.registros_hh.obra_id is
  'EJE LEGACY (public.obras). Opcional desde el 19/08/2026 y sólo poblado en las filas históricas. '
  'Lo que imputa una hora a una obra hoy es obra_canonica_id.';

-- El índice que faltaba: `obra_plan_vs_real` agrupa por `obra_canonica_id` en cada visita a la ficha.
create index if not exists registros_hh_obra_canonica_idx
  on public.registros_hh (obra_canonica_id) where obra_canonica_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Y LA ESCRITURA SE ACOTA POR OBRA, COMO EL RESTO DEL MÓDULO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Las policies de 2026-07-08 miran SÓLO el rol: un jefe de obra podía insertar horas contra
-- cualquiera de las ocho obras. Eso es la fuga que el dueño llama *"seguridad cosmética"*, y es la
-- misma que se encontró el 18/08 en `obra_actividad`.
--
-- `ve_obra(text)` y `es_administracion()` son las funciones ya vigentes del módulo. Y las policies
-- van SEPARADAS por comando a propósito: un `for all` habría incluido también el SELECT, que es
-- exactamente cómo se abrió el agujero anterior.

drop policy if exists "escritura_operacion"     on public.registros_hh;
drop policy if exists "actualizacion_operacion" on public.registros_hh;
drop policy if exists "borrado_operacion"       on public.registros_hh;

create policy "hh_insert_por_obra" on public.registros_hh
  for insert to authenticated
  with check (
    public.current_rol() in ('direccion', 'administracion', 'jefe_obra')
    and (obra_canonica_id is null or public.ve_obra(obra_canonica_id))
  );

create policy "hh_update_por_obra" on public.registros_hh
  for update to authenticated
  using (
    public.current_rol() in ('direccion', 'administracion', 'jefe_obra')
    and (obra_canonica_id is null or public.ve_obra(obra_canonica_id))
  )
  with check (
    public.current_rol() in ('direccion', 'administracion', 'jefe_obra')
    and (obra_canonica_id is null or public.ve_obra(obra_canonica_id))
  );

create policy "hh_delete_por_obra" on public.registros_hh
  for delete to authenticated
  using (
    public.es_administracion()
    and (obra_canonica_id is null or public.ve_obra(obra_canonica_id))
  );

-- RLS NO ES GRANT: sin esto la policy es correcta y la consulta devuelve `permission denied`, que
-- Next muestra como un 404 y manda a buscar el defecto al lugar equivocado. Ya pasó el 17/08.
grant select, insert, update, delete on public.registros_hh to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Y LA CLAVE ÚNICA TAMBIÉN SE MUDA DE EJE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- La única que había es `(obra_id, trabajador_o_cuadrilla, fecha_inicio_semana)`. Con `obra_id`
-- ahora NULL en toda fila nueva, esa clave DEJA DE RESTRINGIR: en Postgres los NULL no son iguales
-- entre sí, así que el índice acepta la misma persona, la misma semana y la misma obra cargadas diez
-- veces sin una queja. Es la lección "clave declarada pero no vigente" —un índice único que vivía
-- sobre 206 NULLs— y el modo de falla es doble carga silenciosa de horas, que infla el HH real.
create unique index if not exists registros_hh_canonica_unico
  on public.registros_hh (obra_canonica_id, trabajador_o_cuadrilla, fecha_inicio_semana)
  where obra_canonica_id is not null;
