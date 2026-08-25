-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PORTERO QUE NO DEPENDE DE LA FILA SE PREGUNTA UNA VEZ, NO 875
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ESTA MIGRACIÓN NO ESTÁ APLICADA. Toca RLS de cuatro tablas y el cierre de un cambio de permisos
-- no lo firma quien lo escribió. La evidencia para que la firme quien corresponda está toda acá.
--
-- ═══ EL DEFECTO, MEDIDO ═══
--
-- `costos_obra_select` es `ve_obra_texto(obra_texto)`: el predicado recibe la columna, así que
-- Postgres NO puede sacarlo del bucle — lo evalúa UNA VEZ POR FILA. Y `ve_obra_texto` arranca
-- preguntando `es_administracion()`, que a su vez lee `perfiles`. O sea: 875 lecturas del perfil
-- de la misma persona para contestar 875 veces la misma pregunta.
--
-- Medido el 25/08/2026 contra la base real, `explain (analyze)` con `set role authenticated` y el
-- JWT de Dirección puesto, mediana de 5 corridas de `select <col> from <tabla>`:
--
--     tabla                      filas     hoy        con el portero adelante
--     costos_obra                  875   114,4 ms     0,5 ms
--     herramientas                 150    20,6 ms     0,4 ms
--     movimientos_herramienta       53     7,3 ms     0,3 ms
--     pedidos_materiales            17     2,5 ms     0,3 ms
--     ─────────────────────────────────────────────────────────────
--     las cuatro juntas                   144,9 ms    1,5 ms
--
-- Sin RLS la misma lectura de `costos_obra` tarda 0,4 ms. Los 114 ms son íntegramente el portero.
-- Es exactamente la trampa que ya se pagó una vez ("RLS: porteros en (select …)"), sobreviviendo en
-- las cuatro tablas que alimentan /administracion/pendientes.
--
-- ═══ POR QUÉ ES EQUIVALENTE, Y NO "CASI" ═══
--
-- `ve_obra_texto(t)` ya devuelve `true` cuando `es_administracion()` es `true` — es su primera
-- rama. Entonces `es_administracion() OR ve_obra_texto(t)` es la MISMA función booleana: agregar un
-- término que sólo puede ser verdadero donde el original ya lo era no amplía nada. Lo único que
-- cambia es DÓNDE se evalúa: `(select public.es_administracion())` no depende de la fila, así que
-- el planificador lo sube a un InitPlan y lo corre una sola vez; y como el `OR` corta apenas el
-- primer término da verdadero, la llamada por fila deja de ocurrir para quien es Administración.
--
-- Comprobado, no razonado: se aplicaron las cuatro `alter policy` dentro de una transacción que se
-- deshizo, y se contaron las filas visibles para CADA perfil de la base antes y después.
--
--     rol          filas visibles hoy                      con la policy nueva
--     campo        compras 0   · herr 32 · mov 26 · ped 0   idéntico
--     campo        compras 155 · herr 76 · mov 29 · ped 8   idéntico
--     jefe_obra    compras 875 · herr 150 · mov 53 · ped 17 idéntico  (×3 perfiles)
--     direccion    compras 875 · herr 150 · mov 53 · ped 17 idéntico  (×3 perfiles)
--
-- El perfil `campo` que ve 155 de 875 compras es la prueba que importa: si el cambio abriera algo,
-- ese número subiría. No se movió.
--
-- ═══ LO QUE ESTA MIGRACIÓN NO ARREGLA ═══
--
-- Para un usuario que NO es Administración el portero por fila sigue corriendo, porque para él la
-- respuesta sí depende de la fila. Bajarlo también para `campo` pide otra cosa —un `IN` contra las
-- obras que ve, resuelto una vez— y es un cambio de forma, no de orden. No entra acá.

alter policy "costos_obra_select" on public.costos_obra
  using ((select public.es_administracion()) or public.ve_obra_texto(obra_texto));

alter policy "herramientas_select" on public.herramientas
  using ((select public.es_administracion())
         or public.ve_obra_texto(ubicacion_actual)
         or (not public.texto_es_de_obra(ubicacion_actual)));

alter policy "mov_herr_select" on public.movimientos_herramienta
  using ((select public.es_administracion())
         or public.ve_obra_texto(destino)
         or (not public.texto_es_de_obra(destino)));

alter policy "pedidos_materiales_select" on public.pedidos_materiales
  using ((select public.es_administracion()) or public.ve_obra_texto(obra_texto));
