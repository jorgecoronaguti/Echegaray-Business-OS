-- ═══ `obra_panel` AGREGA UNA SOLA VEZ, NO UNA VEZ POR OBRA (12/09/2026) ══════════════════════════
--
-- ═══ QUÉ SE MIDIÓ, Y QUÉ RESULTÓ FALSO DE LA SOSPECHA ═══
--
-- La sospecha era que los agregados de `obra_panel` recorrían sus tablas UNA VEZ POR OBRA y que ahí
-- estaban los ~509 ms de `pantalla_clientes()`. Medido como Dirección (RLS activa,
-- `request.jwt.claims` de un perfil `direccion`, transacción revertida), `explain (analyze, buffers)`,
-- descartando la primera corrida, en una ventana SIN otras sesiones activas en la base:
--
--   pantalla_clientes()                    195–209 ms   (min y mediana de 7, dos ventanas limpias)
--     · cliente_economia                    50 ms
--     · obra_cuenta                         42–46 ms
--     · obra_panel                          37 ms  ← de los cuales 31 son sus tres vistas hijas
--         · obra_fechas                       12 ms
--         · obra_costo_real                   10 ms
--         · obra_avance                        9 ms
--     · cliente_panel                       15 ms
--     · obra_economia_cartera               11 ms
--     · certificados / cliente_orden / cliente_documento   < 1 ms
--
-- DE LOS TRES `loops=24` DEL PLAN, DOS NO COSTABAN NADA Y UNO SÍ:
--
--  · `obra_costo_real`, `obra_avance` y `obra_fechas` YA agregan una sola vez: cada una tiene su
--    `group by`. En el plan aparecen con `loops=24` porque el nodo de arriba es un `Nested Loop Left
--    Join` y Postgres RE-ESCANEA un `HashAggregate`/`Hash` ya construido —sus hijos salen con
--    `loops=1`, y `Seq Scan on costos_obra` también—. Re-emitir 26 filas cacheadas 24 veces cuesta
--    ~5 ms, no cientos. El `Nested Loop` lo elige el planner porque estima `rows=1` en
--    `obra_canonica` (el predicado de RLS le rompe la selectividad) cuando en realidad son 24: es un
--    problema de ESTIMACIÓN, y ninguna reescritura del texto de la vista lo cambia.
--
--  · Los DOS `restricciones_*` sí eran agregados correlacionados de verdad: dos subconsultas
--    escalares `(select count(*) from obra_restriccion where obra_id = oc.id …)` en la lista de
--    selección, o sea DOS `Seq Scan on obra_restriccion` por obra — 48 recorridos de la tabla por
--    lectura de la vista. Eso es lo que esta migración saca.
--
-- ═══ POR QUÉ SE HACE IGUAL SI HOY AHORRA ~0,2 ms ═══
--
-- `obra_restriccion` tiene UNA fila. 48 seq scans de una fila son gratis, y por eso el cambio NO se
-- ve en el reloj — medido, mínimo y mediana de siete corridas de cada forma en la misma transacción:
--
--   obra_panel forma vieja    min 27,9 ms   mediana 28,2 ms
--   obra_panel forma nueva    min 27,5 ms   mediana 28,4 ms   ← empate dentro del ruido
--
-- Lo que cambia es la PENDIENTE. Las
-- restricciones son el registro de lo que traba cada obra; el día que sean 2.000 filas el costo de
-- esta vista se multiplica por 48 de golpe, en la pantalla de índice de /clientes, sin que nadie
-- haya escrito una línea. Un `group by` una vez + `left join` no tiene esa pendiente.
--
-- NO SE TOCAN LAS TRES VISTAS HIJAS. Cada una es la definición única de su concepto (costo real,
-- avance, fechas) y la leen otras pantallas; reescribir sus agregados DENTRO de `obra_panel` sería
-- crear una segunda definición del mismo número — exactamente el defecto que este repo ya pagó.
--
-- ═══ LO QUE ESTA MIGRACIÓN NO ARREGLA (y hay que decirlo) ═══
--
-- `pantalla_clientes()` NO baja de 150 ms con esto. Los 180–204 ms están, por orden: en
-- `cliente_economia` (50), `obra_cuenta` (42) y las tres vistas hijas de `obra_panel` (31), y
-- `obra_panel` se deriva TRES veces por llamada porque `cliente_panel` y `cliente_economia` también
-- la leen (`pg_depend`). El próximo movimiento con efecto real es ese: que la llamada derive
-- `obra_panel` una sola vez. Es un cambio a `pantalla_clientes()`, no a esta vista, y se decide aparte.
--
-- LA LÍNEA BASE PARA COMPARAR DESPUÉS DE APLICAR (ventana limpia, 5 corridas, min/mediana):
--
--   pantalla_clientes()                       195 / 196 ms
--   pantalla_cliente('la-estrella','obras')   313 / 348 ms
--   pantalla_cliente('messina','obras')       385 / 1.596 ms   ← variación propia, 421…4.642 ms
--
-- Esta migración NO debería mover ninguno de los tres. Si mueve alguno, el que se movió es el dato.
--
-- Y UNA ADVERTENCIA SOBRE LA MEDICIÓN: esta base la comparten los timers y los otros checkouts. En
-- una ventana con tres sesiones ajenas activas la MISMA `pantalla_clientes()` dio 616 ms de mínimo y
-- 3.663 ms de mediana. Los 509 ms del hallazgo original pueden ser contención y no la vista: un
-- número de esta base sólo vale con `pg_stat_activity` mirado al lado.
--
-- ═══ EL CONTRATO NO SE MUEVE ═══
--
-- 37 columnas, mismos nombres, mismo orden, mismos OID de tipo (verificado con la descripción del
-- resultado del driver). `coalesce(rs.abiertas, 0)` reproduce el `count(*)` de la subconsulta: una
-- obra sin restricciones abiertas publica 0, no `null`. `except` en los dos sentidos contra la
-- definición vieja: 0 filas, 24 obras.
--
-- `create or replace view` Y NO `drop … cascade`: de `obra_panel` cuelgan `cliente_panel`,
-- `cliente_economia` y `obra_plan_vs_real`, más `pantalla_clientes()`, `pantalla_cliente()`,
-- `hh_de_obra()` y `obra_padre_coherente()`. Con la misma lista de columnas Postgres no exige tocar
-- ninguna, y el `grant` por columna a `authenticated` (37 columnas) sobrevive al replace.
--
-- ═══ Y DE PASO TAPA UNA FUGA QUE YA ESTABA ABIERTA (hallada midiendo esto) ═══
--
-- `pg_class.reloptions` de `public.obra_panel` es **NULL** en producción: la vista NO es
-- `security_invoker`, así que corre con los permisos de `postgres` y saltea el RLS de `obra_canonica`
-- y `clientes`. Es la TERCERA vez que pasa lo mismo y siempre por el mismo motivo: `create or replace
-- view` que no repite `with (security_invoker = true)` BORRA la opción. `20260910T1900` la borró,
-- `20260911T0100` la repuso con un `alter view`, y `20260911T2000` —la última migración de `main`, de
-- ayer— la volvió a borrar al reemplazar el cuerpo para agregar `obra_padre_id`.
--
-- EVIDENCIA, sobre main y ANTES de esta migración:
--
--   node --test orquestador/lib/vistas-security-invoker.test.mjs
--   ✖ ninguna vista que dependa del RLS corre con los permisos de su dueño
--     perdieron security_invoker y saltean el RLS de sus tablas: obra_panel
--
-- Por eso este `create or replace view` SÍ repite la opción: escribirlo de nuevo pelado sería cometer
-- el mismo defecto una cuarta vez en el mismo archivo que vino a arreglar otra cosa.
--
-- QUÉ VALORES CAMBIA HOY: ninguno, medido. Los tres roles con perfil real (`direccion`, `jefe_obra`,
-- `campo`) ven con su propio RLS las MISMAS 24 obras de `obra_canonica`, los MISMOS 5 clientes y la
-- MISMA restricción, así que reponer el portero no recorta ninguna fila ni vacía `cliente_slug`. Lo
-- que cambia es que la vista vuelve a APLICAR la policy en lugar de depender de que la policy sea
-- hoy permisiva para esos perfiles — que es la diferencia entre un permiso y una casualidad.

create or replace view public.obra_panel with (security_invoker = true) as
-- LAS RESTRICCIONES, UNA VEZ. Filtra `estado <> 'liberada'` ANTES de agrupar —igual que las dos
-- subconsultas que reemplaza— así que la única fila por obra que sale ya es la cuenta de abiertas, y
-- `vencidas` es el mismo conjunto con el compromiso pasado.
with restricciones as (
  select r.obra_id,
         count(*)::integer as abiertas,
         count(*) filter (
           where r.fecha_compromiso is not null and r.fecha_compromiso < current_date
         )::integer as vencidas
    from obra_restriccion r
   where r.estado <> 'liberada'::text
   group by r.obra_id
)
select oc.id as obra_id,
    oc.nombre,
    oc.cliente_id,
    cl.slug as cliente_slug,
    coalesce(cl.nombre_comercial, oc.cliente_texto) as cliente_nombre,
    oc.cliente_texto,
    oc.estado,
    oc.tipo,
    oc.etapa,
    oc.jefe_obra,
    oc.orden,
    contratado_de_obra(oc.id) as monto_contratado,
    f.inicio_plan as fecha_inicio_plan,
    f.fin_plan as fecha_fin_plan,
    f.inicio_real as fecha_inicio_real,
    f.fin_real as fecha_fin_real,
    oc.drive_carpeta_id,
    ocr.costo_real,
    ocr.n_comprobantes,
    ocr.costo_mano_de_obra,
    av.avance_pct,
    av.n_medidas::integer as n_actividades_medidas,
    av.n_actividades::integer as n_actividades,
    av.n_sin_planificar::integer as n_actividades_sin_planificar,
    av.sincronizado_en as avance_sincronizado_en,
    -- EL `coalesce` ES EL CONTRATO: la subconsulta escalar que había acá devolvía 0 para una obra sin
    -- restricciones (un `count(*)` sin filas es 0, no null). El `left join` devolvería null.
    coalesce(rs.abiertas, 0) as restricciones_abiertas,
    coalesce(rs.vencidas, 0) as restricciones_vencidas,
    f.inicio_plan_declarado as fecha_inicio_plan_declarado,
    f.fin_plan_declarado as fecha_fin_plan_declarado,
    f.inicio_real_declarado as fecha_inicio_real_declarado,
    f.fin_real_declarado as fecha_fin_real_declarado,
    f.origen_fechas_plan,
    f.origen_inicio_real,
    f.forecast_fin,
    f.n_sin_fecha as n_actividades_sin_fecha,
    oc.created_at as creada_en,
    oc.obra_padre_id
   from obra_canonica oc
     left join clientes cl on cl.id = oc.cliente_id
     left join obra_costo_real ocr on ocr.obra_id = oc.id
     left join obra_avance av on av.obra_id = oc.id
     left join obra_fechas f on f.obra_id = oc.id
     left join restricciones rs on rs.obra_id = oc.id
  where oc.fusionada_en is null;
