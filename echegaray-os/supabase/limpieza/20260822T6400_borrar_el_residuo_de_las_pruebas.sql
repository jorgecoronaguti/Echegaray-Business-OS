-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- BORRAR EL RESIDUO QUE LAS PRUEBAS DEJARON EN LOS MAESTROS REALES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- NO ES UNA MIGRACIÓN Y NO VA EN LA CADENA. No crea ni cambia un solo objeto: borra filas que
-- existen únicamente en la base productiva. En una base reconstruida desde cero no hay nada de
-- esto, y una migración que no hace nada en la reconstrucción no es una migración.
--
-- LO CORRE EL COORDINADOR, A MANO, UNA VEZ. Este trabajo no lo ejecutó.
--
-- ── QUÉ BORRA Y POR QUÉ ES INEQUÍVOCO ──────────────────────────────────────────────────────────
--
-- 1 · CUATRO PROVEEDORES «QA NO DEBE ENTRAR <epoch>». El literal está en el commit 3c4fb821, en
--     `tests/administracion-personas-proveedores.spec.ts`: un POST a `/rest/v1/proveedores` con el
--     token del jefe de obra que esperaba `status >= 400`. No lo obtuvo — la aserción se puso roja,
--     que era su trabajo— y las cuatro filas quedaron, una por corrida (20/08, 15:02 · 15:21 ·
--     16:02 · 16:08). Las cuatro tienen `creado_por = 825e31d4` (qa.jefe.obra@ecsas.com.ar) y CERO
--     referencias entrantes: ni compras, ni costos_reales, ni movimientos_caja, ni obligaciones,
--     ni clasificaciones_costo_obra, ni proveedor_alias, ni subcontrato. Ningún dato económico
--     cuelga de ellos.
--
-- 2 · DOS PERSONAS «e2e-hh-<epoch>» + su asignación. Las crea `tests/hh-fuente-canonica.spec.ts`
--     por pantalla (`const MARCA = \`e2e-hh-${Date.now()}\``, en el commit vigente hasta hoy). El
--     spec archiva la persona al final —porque el modelo dice que un legajo no se borra— pero ésta
--     no es un legajo: es un maniquí, y archivado sigue apareciendo en el plantel de
--     Administración. `en_la_empresa = false`, sin DNI, sin CUIL, sin legajo, sin documentación,
--     sin una sola hora imputada (`registros_hh` = 0). La única fila que cuelga es una
--     `obra_asignacion` cuyo campo `notas` es la misma marca.
--
-- ── LO QUE NO BORRA, Y POR QUÉ ─────────────────────────────────────────────────────────────────
--
-- · Las TRES identidades de `perfiles` (Usuario de prueba E2E · QA Jefe · QA Campo): sin ellas la
--   suite se queda sin con qué medir el RLS. Se marcan con `es_prueba` en la migración
--   20260822T6400 y desaparecen de los SELECTORES, no de las pantallas donde tienen que verse.
-- · `pedidos_materiales` «TEST 22.06» y «Test 6/7»: `origen = 'appsheet_sheet'`. No son residuo del
--   OS, son pedidos que alguien cargó en AppSheet. Borrarlos acá los repone el sync a las 6 h.
--   Se corrigen en el Sheet o no se corrigen.
-- · Nada de `orq.*` (chat_request/chat_result con `rid` que empieza en «test-», sheet_snapshots de
--   la pestaña ZZ_PruebaUndo): son BITÁCORA de lo que pasó. Una bitácora no se edita.
--
-- ── VERIFICACIÓN ───────────────────────────────────────────────────────────────────────────────
--
-- Cada bloque termina en un `select` que dice cuántas filas quedaron. Tienen que dar CERO. El
-- criterio es el dato leído en su destino, no que el comando no haya dado error.

begin;

-- ── 1 · LOS CUATRO PROVEEDORES ─────────────────────────────────────────────────────────────────
-- Por id explícito y no por `like 'QA%'`: hay proveedores reales cuyo nombre empieza con letras
-- cualesquiera, y un `like` sobre el maestro de proveedores es exactamente el gesto que ya borró
-- una pestaña entera por confiar en un patrón de texto.
delete from public.proveedores
 where id in ('90155a1f-6c38-473f-be2e-632acaf19e06',   -- QA NO DEBE ENTRAR 1787241749841
              '273afd7b-2bcd-4315-baf5-b4a13fe678b3',   -- QA NO DEBE ENTRAR 1787242105540
              '4d414b01-0133-446a-a71d-e8f56598d674',   -- QA NO DEBE ENTRAR 1787238145857
              'ac8f1f8b-ebc3-4830-bd21-fb41ff9c022b');  -- QA NO DEBE ENTRAR 1787239277379

-- ── 2 · LAS DOS PERSONAS, EN ORDEN DE DEPENDENCIA ──────────────────────────────────────────────
-- Primero lo que cuelga, después la persona. Al revés, la clave foránea aborta la transacción
-- entera y no se borra nada (que es el comportamiento correcto, pero no el que se busca).
delete from public.obra_asignacion
 where persona_id in ('bbf07bc7-9d6f-45f1-8216-7b269044cc4c',
                      '791d87fd-da8b-4030-8a1e-572eddf3a583');

delete from public.registros_hh
 where persona_id in ('bbf07bc7-9d6f-45f1-8216-7b269044cc4c',
                      '791d87fd-da8b-4030-8a1e-572eddf3a583');

delete from public.personas
 where id in ('bbf07bc7-9d6f-45f1-8216-7b269044cc4c',   -- e2e-hh-1787238441197
              '791d87fd-da8b-4030-8a1e-572eddf3a583');  -- e2e-hh-1787239591040

-- ── 3 · LA UBICACIÓN DE UNA OBRA REAL, PISADA POR UN TEST ──────────────────────────────────────
--
-- ESTO NO ES UN BORRADO: es una obra de verdad —«Oficina y Fábrica de Palitos», La Estrella,
-- $246.149.261— con el campo `ubicacion` en «ZZ-E2E ubicacion 1787144469566».
-- `tests/guardar-refresca.spec.ts` escribe ese valor, y restaura el original al final… si llega al
-- final. El 19/08 no llegó, y con él se perdió el valor original: nadie sabe hoy qué decía.
--
-- Se pone en NULL, no un texto inventado. La pantalla dice «sin ubicación» —que es verdad— y el
-- dueño la vuelve a escribir. Dejar el texto de prueba es dejar una mentira prolija.
update public.obra_canonica
   set ubicacion = null
 where id = 'le-comedor'
   and ubicacion like 'ZZ-E2E%';   -- y sólo si sigue siendo el residuo: si alguien ya la corrigió,
                                   -- esta sentencia no toca nada.

-- ── VERIFICACIÓN: LAS TRES TIENEN QUE DAR CERO ─────────────────────────────────────────────────
select 'proveedores QA'  as que, count(*) as quedan from public.proveedores where nombre like 'QA NO DEBE ENTRAR%'
union all
select 'personas e2e-hh', count(*) from public.personas where nombre_completo like 'e2e-hh-%'
union all
select 'obras con ubicacion de prueba', count(*) from public.obra_canonica where ubicacion like 'ZZ-E2E%';

commit;
