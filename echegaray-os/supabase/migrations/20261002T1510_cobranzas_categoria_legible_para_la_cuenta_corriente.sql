-- LA CUENTA CORRIENTE POR CATEGORÍA NECESITA LEER `cobranzas.categoria` (02/10/2026).
--
-- 20261002T1500 le agregó a `cuenta_corriente_de_clientes` el recorte por categoría (B = facturado). La función es
-- SECURITY INVOKER —a propósito: manda la RLS de `cobranzas`— y `authenticated` lee `cobranzas` columna por columna
-- (cliente_id, destino, estado, fecha_cobro, fecha_emision, monto_neto, obra_celda, obra_id, total_bruto). `categoria`
-- no estaba en esa lista: al nombrarla, la función entera contestó «permission denied for table cobranzas» y con ella
-- `cliente_cuenta_corriente`, `cliente_economia` y `pantalla_cliente` — la ficha del cliente dejó de cargar.
--
-- El ensayo de la migración no lo vio porque corre como `postgres`, que lee todas las columnas: un permiso se prueba
-- con el rol que lo necesita.
--
-- La columna no es un dato nuevo para ese rol: `cliente_cobranza` ya la publica. Las filas las sigue filtrando la RLS.
-- Idempotente.
set local lock_timeout = '3s';
grant select (categoria) on public.cobranzas to authenticated;
