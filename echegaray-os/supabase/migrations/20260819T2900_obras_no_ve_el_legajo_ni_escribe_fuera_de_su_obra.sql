-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- TRES AGUJEROS QUE ENCONTRÓ LA REVISIÓN INDEPENDIENTE DE PERSONAL/HH (19/08/2026)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Los tres se probaron contra la base, no se dedujeron del texto.
--
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · OBRAS LEÍA EL LEGAJO ENTERO, MENOS TRES COLUMNAS
-- ───────────────────────────────────────────────────────────────────────────────────────────────
--
-- `20260819T2300` cerró por columna `dni`, `cuil` y `retribucion_pactada`. Quedaron abiertas para
-- `authenticated`: `fecha_nacimiento`, `domicilio`, `telefono`, `email`, `contacto_emergencia`,
-- `contacto_emergencia_telefono`, `obra_social`, `art`, `convenio_colectivo`,
-- `modalidad_liquidacion`, `nacionalidad`, `documentacion_relevada`, `drive_folder_id` y `notas`.
--
-- Y dos de ésas hacen inútil el cierre de las otras tres:
--
--   · `notas` tiene contenido en 30/30 filas y una dice, textual: *"Convenio 76/75 UOCRA.
--     Retribución pactada $3910/hora. Obra social O.S. Personal Actividad del Turf."* — la
--     retribución en texto plano, al lado de la columna que se cerró para esconderla.
--   · `drive_folder_id` está cargado en 30/30 y es la carpeta del legajo en Drive. `T2200` cerró
--     `documentacion_legajo` con este argumento: *"cualquier autenticado leía qué documentos tiene
--     cada persona y el id de Drive para abrirlos"*. El mismo id seguía saliendo por `personas`.
--
-- Ningún `select=*` hace falta: `GET /rest/v1/personas?select=nombre_completo,notas,drive_folder_id`
-- con el token de un jefe de obra alcanza.
--
-- SE INVIERTE EL CRITERIO: en vez de enumerar lo que se cierra —lista que envejece mal, y ya
-- envejeció mal una vez— se enumera lo que se ABRE. Una columna nueva nace cerrada.
--
-- Lo que queda legible para `authenticated` es exactamente lo que las pantallas de Obras necesitan
-- y lo que consume `persona_directorio` (que es `security_invoker`, o sea que lee con los permisos
-- de quien pregunta y por eso depende de esta lista): quién es, qué categoría tiene, qué hace, y
-- desde y hasta cuándo estuvo. Nada de eso es un dato del legajo.
--
-- Administración NO pierde nada: la ficha lee `persona_legajo`, que es `security_definer` y lleva
-- `where es_administracion()` adentro. Se comprobó que ninguna pantalla de Administración lee
-- `personas` directamente para MOSTRAR: sólo para escribir (`insert`/`update`, que son privilegios
-- distintos del `select` y no se tocan).

revoke select on public.personas from authenticated;

grant select (
  id, nombre_completo, categoria, especialidad, puesto, fecha_ingreso, fecha_egreso
) on public.personas to authenticated;

comment on table public.personas is
  'Legajo. `authenticated` sólo puede LEER las columnas operativas (nombre, categoría, especialidad, '
  'puesto, ingreso, egreso): el resto se lee por `persona_legajo`, que exige es_administracion(). '
  'Una columna nueva nace cerrada — el grant enumera lo que se abre, no lo que se cierra.';

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2 · UN JEFE DE OBRA PODÍA ESCRIBIR HORAS EN CUALQUIER OBRA, POR EL EJE LEGACY
-- ───────────────────────────────────────────────────────────────────────────────────────────────
--
-- `T2200` reescribió `select` y `delete` de `registros_hh` exigiendo `obra_canonica_id is not null
-- and ve_obra(...)`. `insert` y `update` quedaron con la polaridad INVERSA:
--
--     with check ( rol in (…) and ( obra_canonica_id IS NULL or ve_obra(obra_canonica_id) ) )
--                                   ^^^^^^^^^^^^^^^^^^^^^^^ pasa siempre
--
-- O sea que mandando `obra_canonica_id: null` la fila entraba sin ninguna cota de obra. El camino
-- completo: el jefe obtiene uuids de obras ajenas, hace `POST /rest/v1/registros_hh` con
-- `obra_canonica_id: null` y horas cargadas contra `obra_id` ajeno; la fila entra, y como `select`
-- SÍ exige `obra_canonica_id not null`, después NO PUEDE VERLA NI BORRARLA. Lo mismo por `PATCH`
-- sobre las 19 filas históricas, que tienen `obra_canonica_id` en null.
--
-- Se cierra igualando la polaridad a la de `select`/`delete`: para escribir hay que decir en qué
-- obra canónica, y esa obra tiene que ser una de las suyas. Las filas legacy dejan de ser
-- editables por Obras — que es lo correcto: son historia, no carga del día.

-- Se conservan los nombres reales de las policies (`hh_insert_por_obra`, `hh_update_por_obra`) y su
-- portón de rol; lo único que cambia es la cota de obra.

drop policy if exists hh_insert_por_obra on public.registros_hh;
create policy hh_insert_por_obra on public.registros_hh
  for insert to authenticated
  with check (
    (public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra']))
    and obra_canonica_id is not null
    and (public.es_administracion() or public.ve_obra(obra_canonica_id))
  );

drop policy if exists hh_update_por_obra on public.registros_hh;
create policy hh_update_por_obra on public.registros_hh
  for update to authenticated
  using (
    (public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra']))
    and obra_canonica_id is not null
    and (public.es_administracion() or public.ve_obra(obra_canonica_id))
  )
  with check (
    (public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra']))
    and obra_canonica_id is not null
    and (public.es_administracion() or public.ve_obra(obra_canonica_id))
  );

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 3 · LA ASIGNACIÓN A OBRA NO ERA HISTÓRICA: EL ÍNDICE ÚNICO NO MIRABA LA VIGENCIA
-- ───────────────────────────────────────────────────────────────────────────────────────────────
--
--     obra_asignacion_unica on obra_asignacion (obra_id, persona_id, coalesce(actividad_id, …))
--
-- Sin `where hasta is null`. Consecuencia: Pérez trabaja en una obra de marzo a abril, se cierra su
-- asignación con `hasta` —"el período queda escrito"—, y cuando vuelve en junio el alta choca con
-- 23505 y la pantalla dice "esa persona ya está asignada". La única salida que ofrecía la interfaz
-- era reabrir la vieja, que borra los dos meses que estuvo afuera. El módulo prometía *"el historial
-- no se pisa"* y el índice obligaba a pisarlo.
--
-- El patrón correcto ya estaba una tabla más allá: `cuadrilla_integrante_una_vigente … where hasta
-- is null`. Se aplica el mismo acá: **una sola asignación VIGENTE por (obra, persona, actividad)**,
-- y todas las cerradas que hagan falta.

drop index if exists public.obra_asignacion_unica;
create unique index if not exists obra_asignacion_una_vigente
  on public.obra_asignacion (obra_id, persona_id, coalesce(actividad_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where hasta is null;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 4 · TRUNCATE, QUE SALTEA LA RLS, VENÍA HEREDADO
-- ───────────────────────────────────────────────────────────────────────────────────────────────
--
-- Las migraciones del módulo conceden `select, insert, update, delete`, pero el `default acl` del
-- proyecto le da a `authenticated` la fila entera —`arwdDxtm`— y ahí viene TRUNCATE, que vacía una
-- tabla SIN pasar por ninguna policy. No es alcanzable por PostgREST hoy; es un privilegio que
-- nadie eligió dar y que no hace falta.

revoke truncate on public.cuadrilla, public.cuadrilla_integrante, public.obra_asignacion,
  public.registros_hh, public.personas, public.documentacion_legajo from authenticated;
