-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNA AUSENCIA ES DE LA PERSONA, NO DE UNA OBRA (dueño, 08/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Textual, ante el acuse «La ausencia quedó imputada a La Estrella: es donde ya estaban las horas de
-- ese día»: *«eso no está ok, porque La Estrella es cliente y no tiene obra activa; si la persona
-- está ausente, se le suma hs pero porque corresponde por ley, no necesariamente sumarle a ninguna
-- obra»*.
--
-- El panel DEDUCÍA una obra para poder escribir la fila. No lo hacía por diseño: lo hacía porque la
-- base no aceptaba otra cosa — `hh_insert_por_obra` exige `obra_canonica_id is not null` desde
-- `20260819T2900`. O sea que el costo de mano de obra de una obra cerrada crecía por un día que
-- nadie trabajó ahí. Ésta es la migración que saca esa obligación de la base, que es donde estaba.
--
-- ── LO QUE CAMBIA ──────────────────────────────────────────────────────────────────────────────
--
--   1 · un CHECK: sin obra sólo se puede estar ausente o de licencia.
--   2 · las cuatro policies de `registros_hh`, que ganan la rama «fila sin obra».
--
-- Ningún GRANT cambia: `authenticated` ya tiene select/insert/update/delete de tabla entera sobre
-- `registros_hh` (`20260819T0100`), y no hay grants por columna en esta tabla.

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · SIN OBRA SÓLO SE PUEDE ESTAR AUSENTE
-- ───────────────────────────────────────────────────────────────────────────────────────────────
--
-- La regla en una línea: unas horas TRABAJADAS sin obra no tienen a quién imputarle el costo, y una
-- ausencia no tiene a quién imputárselo. El CHECK es la única barrera que no depende de que el
-- código de la app se acuerde.
--
-- ═══ `not valid`, Y POR QUÉ NO ES UN ATAJO ═══
--
-- Medido contra la base real el 08/09/2026: 19 filas tienen `obra_canonica_id` null, todas con
-- `tipo_hora = 'normal'` y `fecha` null — son las históricas de JORNALES que `20260819T2200` ya
-- dejó del lado de Administración. Un CHECK validado abortaría la migración; borrarlas o
-- inventarles una obra sería fabricar un dato. `not valid` es exactamente lo que hace falta:
-- Postgres NO revisa lo viejo y SÍ aplica el check a todo insert y a todo update — incluidas esas
-- 19, que a partir de ahora no se pueden actualizar sin decir en qué obra fueron. Es correcto: son
-- historia, y darles obra es una decisión de Administración, no de una migración.
alter table public.registros_hh drop constraint if exists registros_hh_sin_obra_solo_ausencia;
alter table public.registros_hh add constraint registros_hh_sin_obra_solo_ausencia
  check (obra_canonica_id is not null or tipo_hora in ('ausencia', 'licencia')) not valid;

comment on column public.registros_hh.obra_canonica_id is
  'La obra a la que se le imputa el tiempo. NULL sólo cuando tipo_hora es ausencia o licencia: '
  'una ausencia es de la PERSONA (dueño, 08/09/2026) y sus horas nunca son costo de una obra.';

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2 · QUIÉN PUEDE ESCRIBIR UNA FILA SIN OBRA
-- ───────────────────────────────────────────────────────────────────────────────────────────────
--
-- Sin obra no hay `ve_obra(obra_canonica_id)` que pueda acotar: la cota tiene que salir de la
-- PERSONA. Y la persona está acotada por dónde se la espera trabajar, que es su asignación vigente
-- A LA FECHA DEL REGISTRO — no a `current_date`, porque una ausencia se corrige días después y
-- `asignacion_vigente()` diría «no» sobre una asignación que ya venció.
--
-- ═══ POR QUÉ SECURITY DEFINER Y NO UN `exists` ADENTRO DE LA POLICY ═══
--
-- Una subconsulta escrita dentro de una policy se ejecuta con los permisos de quien pregunta: la
-- RLS de `obra_asignacion` se aplicaría otra vez ahí adentro y un jefe que no viera una asignación
-- recibiría un «no está asignada» que es en realidad «no la puedo leer». Fallaría cerrado por el
-- motivo equivocado. Es el mismo patrón que ya usan `ve_obra()` y `es_administracion()`.
create or replace function public.marca_ausencia_de(p_persona uuid, p_fecha date)
returns boolean language sql stable security definer set search_path to 'public' as $$
  -- Dirección y Administración, cualquiera del plantel: son quienes autorizan una licencia.
  --
  -- NO se usa `es_administracion()` acá, y es a propósito: esa función incluye a `jefe_obra` desde
  -- el 19/08, así que usarla dejaría al jefe marcando ausente a CUALQUIERA de la empresa y haría
  -- decorativa la segunda rama. El jefe entra por la de abajo, que es la que lo acota.
  select public.current_rol() in ('direccion', 'administracion')
      or (
        public.current_rol() = 'jefe_obra'
        and exists (
          select 1 from public.obra_asignacion a
          where a.persona_id = p_persona
            and (a.desde is null or a.desde <= coalesce(p_fecha, current_date))
            and (a.hasta is null or a.hasta >= coalesce(p_fecha, current_date))
            and public.ve_obra(a.obra_id)
        )
      )
$$;
grant execute on function public.marca_ausencia_de(uuid, date) to authenticated;

comment on function public.marca_ausencia_de(uuid, date) is
  'Si el usuario puede declarar la ausencia o la licencia de esa persona ese día, en una fila SIN '
  'obra. Dirección y Administración, de cualquiera; el jefe de obra, sólo de quien esté asignado '
  'ese día a una obra que él ve. Una ausencia es de la persona: no se imputa a ninguna obra.';

-- ── LAS CUATRO POLICIES ────────────────────────────────────────────────────────────────────────
--
-- Se conservan los nombres reales y el portón de rol. Para las filas CON obra la expresión es
-- exactamente la que dejó `20260822T7000` —los porteros envueltos en `(select …)` para que Postgres
-- los evalúe una vez por consulta y no una vez por fila—; lo único nuevo es la rama sin obra.
--
-- `es_administracion() or current_rol() = 'jefe_obra' or ve_obra(...)` se conserva tal cual aunque
-- las tres ramas se solapen hoy (el jefe ve todas las obras desde `20260819T4600`): cambiar eso
-- sería otra decisión, y no es ésta.

drop policy if exists hh_insert_por_obra on public.registros_hh;
create policy hh_insert_por_obra on public.registros_hh
  for insert to authenticated
  with check (
    (select public.current_rol()) = any (array['direccion', 'administracion', 'jefe_obra'])
    and (
      (
        obra_canonica_id is not null
        and (
          (select public.es_administracion())
          or (select public.current_rol()) = 'jefe_obra'
          or public.ve_obra(obra_canonica_id)
        )
      )
      or (
        obra_canonica_id is null
        and tipo_hora in ('ausencia', 'licencia')
        and public.marca_ausencia_de(persona_id, fecha)
      )
    )
  );

drop policy if exists hh_update_por_obra on public.registros_hh;
create policy hh_update_por_obra on public.registros_hh
  for update to authenticated
  using (
    (select public.current_rol()) = any (array['direccion', 'administracion', 'jefe_obra'])
    and (
      (
        obra_canonica_id is not null
        and (
          (select public.es_administracion())
          or (select public.current_rol()) = 'jefe_obra'
          or public.ve_obra(obra_canonica_id)
        )
      )
      or (
        obra_canonica_id is null
        and tipo_hora in ('ausencia', 'licencia')
        and public.marca_ausencia_de(persona_id, fecha)
      )
    )
  )
  -- EL `with check` MIRA LA FILA NUEVA: sin él, una ausencia sin obra se podría mudar a una obra
  -- ajena con un `update`, que es el agujero de polaridad que cerró `20260819T2900` al revés.
  with check (
    (select public.current_rol()) = any (array['direccion', 'administracion', 'jefe_obra'])
    and (
      (
        obra_canonica_id is not null
        and (
          (select public.es_administracion())
          or (select public.current_rol()) = 'jefe_obra'
          or public.ve_obra(obra_canonica_id)
        )
      )
      or (
        obra_canonica_id is null
        and tipo_hora in ('ausencia', 'licencia')
        and public.marca_ausencia_de(persona_id, fecha)
      )
    )
  );

-- BORRAR ES CORREGIR. Quien puede declarar la ausencia puede sacarla: si no, el jefe que marca
-- ausente a alguien que sí vino no tiene forma de arreglarlo y el día queda mal para siempre.
drop policy if exists hh_delete_por_obra on public.registros_hh;
create policy hh_delete_por_obra on public.registros_hh
  for delete to authenticated
  using (
    (select public.current_rol()) = any (array['direccion', 'administracion', 'jefe_obra'])
    and (
      (select public.es_administracion())
      or (
        obra_canonica_id is not null
        and (
          (select public.current_rol()) = 'jefe_obra'
          or public.ve_obra(obra_canonica_id)
        )
      )
      or (
        obra_canonica_id is null
        and tipo_hora in ('ausencia', 'licencia')
        and public.marca_ausencia_de(persona_id, fecha)
      )
    )
  );

-- LEER NO CAMBIA, Y SE REESCRIBE IGUAL PARA QUE LAS CUATRO SE LEAN JUNTAS. `hh_select_por_obra` no
-- mira la obra desde `20260820T6000`: administra, o son suyas. Una fila sin obra entra sola por las
-- dos ramas —Administración la ve, y la propia persona ve la suya—, así que no hace falta agregarle
-- nada. Escribir acá una cota por obra ROMPERÍA la ausencia sin obra: quedaría invisible e
-- imborrable, que es exactamente lo que `20260819T2900` describió como el agujero.
drop policy if exists hh_select_por_obra on public.registros_hh;
create policy hh_select_por_obra on public.registros_hh
  for select to authenticated
  using (
    (select public.es_administracion())
    or (persona_id is not null and persona_id = (select public.mi_persona_id()))
  );
