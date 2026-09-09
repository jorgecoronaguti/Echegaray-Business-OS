-- 20260909T1840 · EL EXTRACTO SE LEE DESDE LA WEB
--
-- La solapa Recibos degradaba a «sin extracto» con una sesión de Dirección: `banco_movimientos`
-- devolvía 403 a `authenticated`. La tabla nació el 23/07/2026 con RLS habilitada y una policy de
-- lectura (`auth.role() = 'authenticated'`) — pero SIN GRANT. Una policy no otorga nada: filtra
-- filas sobre un permiso que tiene que existir antes. Sin `grant select`, PostgREST corta en el
-- catálogo y ni siquiera llega a evaluar la policy, y devuelve 403 con `message` VACÍO.
--
-- La consecuencia no era cosmética: sin extracto, la conciliación del lote de haberes no distingue
-- «no se giró» de «no pude mirar», y el cuadro entero se apagaba. Es la trampa que el repo ya tiene
-- escrita: un control que no pudo mirar no puede decir «no está».
--
-- ═══ POR QUÉ `liquida_sueldos()` Y NO `es_administracion()` ═══
--
-- Porque `es_administracion()` incluye a jefe_obra desde el 19/08/2026, y el extracto bancario de la
-- empresa no es un maestro del legajo: es la plata. La policy vieja era todavía más ancha —CUALQUIER
-- usuario autenticado, incluido campo—, así que sumarle el GRANT que faltaba habría abierto el
-- extracto entero al plantel. Se reemplaza por la puerta del módulo que lo consume: dirección y
-- administración, que es también la puerta del resto de Liquidación (decisión del dueño, 09/09/2026).
--
-- ═══ POR QUÉ EL GRANT ES POR COLUMNA ═══
--
-- Lo único que la web pregunta es si HAY movimientos en la ventana de la quincena
-- (`eslabonesLegajoService.ts`: `select id`, `count exact`, `head`, filtrado por `fecha`). Con `id`
-- y `fecha` alcanza. `concepto`, `importe` y `saldo_despues` no se otorgan: el detalle del extracto
-- —a quién se le pagó y cuánto— sigue siendo del importador con service role. El día que la pantalla
-- necesite conciliar importe por importe, ese GRANT se agrega con la decisión que lo justifique,
-- no «por las dudas» hoy.


alter table public.banco_movimientos enable row level security;

-- La policy vieja abría la tabla a todo `authenticated`. No se conserva: era más ancha de lo que
-- nadie decidió y sólo pasaba desapercibida porque el GRANT que falta la volvía inalcanzable.
drop policy if exists banco_movimientos_lectura on public.banco_movimientos;

create policy banco_movimientos_lee_liquidacion on public.banco_movimientos
  -- `(select ...)` y no la llamada suelta: así el planner la evalúa UNA vez por consulta y no una
  -- por fila. Es la misma forma que el resto de los porteros del repo.
  for select to authenticated using ((select public.liquida_sueldos()));

-- La escritura sigue siendo del importador del OS. Nadie carga el extracto desde la web.
drop policy if exists banco_movimientos_escritura on public.banco_movimientos;
create policy banco_movimientos_escribe_srv on public.banco_movimientos
  for all to service_role using (true) with check (true);

grant select (id, fecha) on public.banco_movimientos to authenticated;
grant all on public.banco_movimientos to service_role;

comment on policy banco_movimientos_lee_liquidacion on public.banco_movimientos is
  'Dirección y administración leen el extracto desde la web, y sólo id y fecha (el GRANT por columna '
  'es el que limita). Jefe de obra NO: es la plata de la empresa, no un maestro del legajo.';

