-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CUALQUIERA CON SESIÓN PODÍA REESCRIBIR EL COSTO DE CUALQUIER OBRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL HALLAZGO ═══
--
-- `costos_obra` nació el 17/07 con las tres policies abiertas de par en par:
--
--     costos_obra_select  for select  to authenticated using (true)
--     costos_obra_insert  for insert  to authenticated with check (true)
--     costos_obra_update  for update  to authenticated using (true)
--
-- El 19/08, `20260819T0200_rls_por_obra_en_operacion.sql` cerró la LECTURA por obra
-- (`ve_obra_texto(obra_texto)`) y dejó dicho, textualmente, que no tocaba la escritura *"porque la
-- hace el sync con service_role"*. Eso era cierto sobre quién escribe, y falso sobre quién PUEDE:
-- el grant de `insert, update` para `authenticated` seguía puesto, y la policy de UPDATE seguía en
-- `true` — sin `with check`, así que además de cambiar el importe de cualquier fila se podía mover
-- la fila a otra obra.
--
-- Un operario de campo acotado a UNA obra —que por la policy de lectura ni siquiera VE la fila—
-- podía igual mandar un `PATCH /rest/v1/costos_obra?id=eq.<uuid>` desde las devtools y reescribir
-- el costo de las 858 compras de las 21 obras. `costo_real` alimenta `obra_panel`, el margen y el
-- desvío: es el número con el que se decide si una obra gana plata.
--
-- ═══ QUIÉN DEBE ESCRIBIR: NADIE CON SESIÓN, Y NO ES UNA RESTRICCIÓN, ES LO QUE ES ═══
--
-- `costos_obra` NO es un registro propio: es el ESPEJO de la pestaña «Compras» del Flujo de Caja.
-- La fuente de verdad es el Sheet, y `orquestador/scripts/sync-compras.mjs` lo refresca así:
--
--     delete from public.costos_obra where origen='compras_sheet'   ← borra el espejo entero
--     insert into public.costos_obra ...                            ← y lo reescribe del Sheet
--
-- Medido hoy: 858 filas, 21 obras, **un solo origen — `compras_sheet`**. O sea que una escritura
-- hecha desde la web no sólo estaría mal permitida: **desaparecería en el próximo sync sin avisar**.
-- Un permiso cuyo efecto se evapora es peor que no tenerlo, porque el que lo usó cree que guardó.
--
-- Por eso acá no se «acota» la escritura a Administración: se RETIRA. Lo que se corrige en la web
-- se corrige en el Sheet, que es donde vive el dato, y el sync lo trae. Y la imputación —lo único
-- que la web sí resuelve sobre estas filas— nunca se hizo tocando `costos_obra`: se hace agregando
-- una fila a `obra_alias` (`20260819T0500_resolver_pendientes_desde_la_web.sql`), que es de
-- Administración y arregla de una vez todas las filas que dicen lo mismo.
--
-- Verificado antes de retirar el permiso, en todo el repo:
--   · `src/**` toca `costos_obra` en dos lugares y los dos son `select`
--     (`obras/services/operacionService.ts:186`, `control-obras/services/costosObraService.ts:198`).
--   · ninguna función `security definer` escribe la tabla.
--   · el único escritor es `sync-compras.mjs`, que entra por conexión directa como `postgres`
--     (`rolbypassrls = true`), no por PostgREST. RLS no lo toca, y este cambio tampoco.
--
-- ═══ LO QUE QUEDA ═══
--
--   LEER    Dirección · Administración · jefe de obra   todo         (es_administracion() ⇒ true)
--           nivel campo                                 sólo su obra (obra_alias → ve_obra)
--           anónimo                                     nada         (401, sin grant)
--   ESCRIBIR  nadie con sesión de usuario. Sólo el sync, como dueño de la tabla.
--
-- RLS NO ES GRANT, y acá hace falta revocar los DOS: una policy sin grant deja un 403 correcto,
-- pero un grant sin policy es una bomba esperando a que alguien vuelva a crear la policy.

drop policy if exists "costos_obra_insert" on public.costos_obra;
drop policy if exists "costos_obra_update" on public.costos_obra;

revoke insert, update on public.costos_obra from authenticated;
revoke insert, update on public.costos_obra from anon;

-- El SELECT no se toca: `ve_obra_texto(obra_texto)` ya es la lectura correcta desde el 19/08.
-- Se re-declara el grant de lectura porque revocar en la misma tabla invita a revocar de más.
grant select on public.costos_obra to authenticated;

comment on table public.costos_obra is
  'ESPEJO de la pestaña «Compras» del Flujo de Caja: el costo real por obra. SÓLO LECTURA para '
  'cualquier sesión de usuario — la fuente es el Sheet y sync-compras.mjs reescribe el espejo '
  'entero en cada corrida, así que un cambio hecho por la web se perdería en silencio. La '
  'imputación a una obra se resuelve en obra_alias, no acá. Lee todo quien administra; el nivel '
  'campo, sólo las filas cuya obra tiene asignada.';
