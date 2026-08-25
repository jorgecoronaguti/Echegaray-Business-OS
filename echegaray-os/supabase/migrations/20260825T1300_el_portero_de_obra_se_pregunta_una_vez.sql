-- EL PORTERO DE OBRA SE PREGUNTA UNA VEZ, NO UNA POR FILA.
--
-- NO APLICADA TODAVÍA (25/08/2026). Se escribe con la medición adjunta; la aplica quien tiene la
-- vista del conjunto, no quien la escribió.
--
-- ═══ QUÉ SE MIDIÓ ═══
--
-- El dueño, textual: *"todo app.ecsas.com.ar es MUY lento"*. Midiendo pantalla por pantalla apareció
-- que la campanita de la barra —que vive en TODAS las pantallas del OS— tarda ~1 s, y que dentro de
-- esa espera las tres lecturas caras son `proveedor_nombre_pendiente`, `imputacion_pendiente` y el
-- detector de duplicados. Las dos primeras terminan las dos en un `Seq Scan on costos_obra` con este
-- filtro:
--
--     Filter: ve_obra_texto(obra_texto)
--     ...  875 filas, 137 ms  →  0,157 ms POR FILA
--
-- `ve_obra_texto()` es SECURITY DEFINER y STABLE, pero recibe el valor de la fila, así que el
-- planificador no puede sacarla del bucle: se ejecuta 875 veces, y cada una arranca preguntando
-- `es_administracion()` → `current_rol()` → un `select` sobre `perfiles`. Para Dirección y para el
-- jefe de obra —que ven TODO— esas 875 respuestas son todas `true` y todas la misma.
--
-- ═══ EL ARREGLO ═══
--
-- `(select public.es_administracion())` es un subselect sin correlación: Postgres lo evalúa UNA vez
-- como InitPlan, antes de tocar la primera fila. Si da `true`, el `OR` corta y `ve_obra_texto()` no
-- se llama nunca. Si da `false`, el predicado que queda es EXACTAMENTE el de antes — porque
-- `ve_obra_texto()` ya empieza con `when es_administracion() then true`, o sea que para un no
-- administrador la rama nueva aporta `false OR <lo de siempre>`.
--
-- Es el mismo patrón que ya se aplicó en este repo cuando unos porteros por fila costaban 64 s.
--
-- ═══ LA MEDICIÓN (25/08/2026, base real, dentro de una transacción con ROLLBACK) ═══
--
--   identidad · relación                        antes    después   filas vistas
--   dirección · costos_obra                     165 ms    53 ms    875 → 875
--   dirección · proveedor_nombre_pendiente      171 ms    57 ms     82 → 82
--   dirección · imputacion_pendiente            218 ms    70 ms      1 → 1
--   jefe_obra · costos_obra                     163 ms    53 ms    875 → 875
--   jefe_obra · proveedor_nombre_pendiente      172 ms    57 ms     82 → 82
--   jefe_obra · imputacion_pendiente            234 ms    71 ms      1 → 1
--   campo     · costos_obra                     507 ms   526 ms    155 → 155
--   campo     · imputacion_pendiente            640 ms   651 ms      1 → 1
--
-- 53 ms es el ida y vuelta de red a la base desde esta VM: la consulta en sí pasa de ~130 ms a ~4 ms.
--
-- LO QUE NO ARREGLA, DICHO: al nivel `campo` no lo cambia (526 ms). Ahí `es_administracion()` es
-- `false` y el portero sigue corriendo por fila — que es exactamente lo que tiene que hacer, porque
-- ese rol SÍ está acotado por obra. Bajarle el costo a `campo` es otro trabajo: pide un índice sobre
-- `obra_alias` o resolver las obras visibles una sola vez, y no se hace de paso.
--
-- ═══ QUE NO ABRE NADA ═══
--
-- Se comprobó con las TRES identidades y las seis relaciones que cuelgan de estas policies, contando
-- filas y sumando la longitud del texto de obra como huella. Las dieciocho combinaciones devolvieron
-- exactamente lo mismo antes y después. Una policy más rápida que además deja ver una fila de más no
-- es una optimización: es un agujero, y por eso la prueba cuenta lo que ve cada rol, no sólo el reloj.

begin;

alter policy costos_obra_select on public.costos_obra
  using ((select public.es_administracion()) or public.ve_obra_texto(obra_texto));

alter policy herramientas_select on public.herramientas
  using ((select public.es_administracion())
         or public.ve_obra_texto(ubicacion_actual)
         or not public.texto_es_de_obra(ubicacion_actual));

alter policy herramientas_update on public.herramientas
  using ((select public.es_administracion())
         or public.ve_obra_texto(ubicacion_actual)
         or not public.texto_es_de_obra(ubicacion_actual));

alter policy mov_herr_select on public.movimientos_herramienta
  using ((select public.es_administracion())
         or public.ve_obra_texto(destino)
         or not public.texto_es_de_obra(destino));

alter policy pedidos_materiales_select on public.pedidos_materiales
  using ((select public.es_administracion()) or public.ve_obra_texto(obra_texto));

alter policy pedidos_materiales_update on public.pedidos_materiales
  using ((select public.es_administracion()) or public.ve_obra_texto(obra_texto));

alter policy pedidos_materiales_delete on public.pedidos_materiales
  using ((select public.es_administracion()) or public.ve_obra_texto(obra_texto));

commit;
