-- ═══ EL CONTRATO Y EL CBU VOLVIERON A ESTAR ABIERTOS (12/09/2026) ═══
--
-- `columnas-comerciales-cerradas.test.mjs` está en rojo en `main` con DOS agujeros medidos contra el
-- catálogo —no contra una consulta, que puede devolver cero filas hoy por casualidad—:
--
--   1 · `public.obra_canonica`: las 24 columnas concedidas a `authenticated`, `monto_contratado`
--       incluida. El grant por columna de `20260819T1600` lo borró `20260910T2350`, que hizo
--       `grant select on public.obra_canonica to authenticated` para destrabar un 42501 de
--       `cobranza_imputacion` («permission denied for table obra_canonica»: la pantalla Clientes
--       apagaba la columna Cobrado). El 42501 estaba bien diagnosticado —RLS no es GRANT— y la cura
--       fue de más: el grant entero reabrió el precio que el dueño declaró secreto para Obras
--       («monto total presupuestado / contratado de la obra»).
--
--   2 · `public.personas`: `cbu`, `cbu_titular`, `cbu_verificado_en` legibles por todo el sistema.
--       Acá la migración que los abrió se contradice con su propio comentario: `20260909T1730`
--       escribe *«El CBU se lee y se escribe sólo desde el módulo de liquidación, así que no se abre
--       a `authenticated` en general»* y la sentencia de abajo hace exactamente lo contrario. La
--       intención estaba declarada; el SQL no la cumplió.
--
-- ═══ QUÉ SE MIDIÓ ANTES DE CERRAR, PARA NO APAGAR UNA PANTALLA ═══
--
-- El modo de falla de este arreglo no es un error: es una columna que se vuelve invisible y una
-- pantalla que muestra un campo vacío sin que nadie lo asocie a un permiso. Medido el 12/09:
--
--   · `personas.cbu` tiene 0 filas cargadas de 80, ninguna vista ni función de la base lo lee
--     (`pg_get_viewdef`/`prosrc` sobre public y orq), y en `src/` la única aparición de `cbu` es el
--     PORTAL DEL CLIENTE (`PanelAPagar`), que muestra el CBU de ECSAS para cobrar —un literal de
--     `portalService`, no esta columna—. El generador del lote del banco
--     (`scripts/santander-fur-fcl.mjs`) corre por conexión directa y lee `cuil`, no `cbu`.
--   · `obra_canonica.monto_contratado` sale a la web por `obra_panel`, que lo pide a
--     `contratado_de_obra()` —`security definer`, con `ve_economia()` adentro—, así que el camino de
--     Dirección y Administración no depende de este grant. La vista que SÍ lo lee de la tabla y está
--     concedida a `authenticated` es `obra_plan_vs_real` (`security_invoker`), que consumen
--     `obrasService`, `ganttObras` y la RPC `pantalla_cliente`. Su lista de columnas se verificó en
--     transacción revertida con esta migración puesta y el rol `authenticated`.
--
-- ═══ LO QUE ESTA MIGRACIÓN NO CIERRA, Y SE DECLARA EN VEZ DE DECIDIRLO SOLO ═══
--
-- `obra_canonica.contrato_monto` y `contrato_moneda` (de `20260910T2355`) quedan ABIERTAS. Son el
-- mismo precio leído de la orden de compra, en su moneda, y por la regla que funda este test —«un
-- dato protegido en la vista y libre en su tabla no está protegido: está disimulado»— deberían
-- compartir destino con `monto_contratado`. No se cierran acá porque la lista de columnas secretas
-- es una DECISIÓN DEL DUEÑO escrita en el test (`CERRADAS`), no una inferencia mía, y porque
-- cerrarlas sin medir qué pantalla las pide repetiría el error de 20260910T2350 al revés. Queda
-- como hallazgo para firmar.

-- ── 1 · obra_canonica: grant por columna, calculado del catálogo ─────────────────────────────────
--
-- SE CALCULA Y NO SE ENUMERA, igual que en `20260819T1600`: una columna agregada después queda sin
-- conceder y nace CERRADA. Ese lado lo guarda la segunda mitad del test («no se perdió ninguna
-- columna que sí se puede leer»), que se pone rojo si aparece un hueco que no sea un secreto
-- declarado. Las dos mitades juntas son la regla completa.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'obra_canonica'
     and column_name not in ('monto_contratado');
  execute 'revoke select on public.obra_canonica from authenticated';
  execute format('grant select (%s) on public.obra_canonica to authenticated', cols);
end $$;

-- ── 2 · personas: el CBU vuelve a la lista blanca ────────────────────────────────────────────────
--
-- Revoque explícito de las tres y no `revoke select on personas` + re-grant: el grant de esta tabla
-- ya es por columna desde `20260819T4900` y volver a revocar la tabla entera para reconstruirlo a
-- mano es la forma de perder `legajo` o `es_prueba` —las dos abiertas por decisión explícita— en el
-- camino. Lo que queda legible tiene que ser exactamente la lista blanca de `PERSONAS_ABIERTAS`.
--
-- LA COLUMNA NO SE VA: la sigue operando `service_role`, que es quien arma el lote del banco. Lo que
-- se retira es el permiso de los 80 autenticados del sistema a leer la cuenta bancaria de cada
-- compañero — un dato que no hace falta para ejecutar una obra.
revoke select (cbu, cbu_titular, cbu_verificado_en) on public.personas from authenticated;
