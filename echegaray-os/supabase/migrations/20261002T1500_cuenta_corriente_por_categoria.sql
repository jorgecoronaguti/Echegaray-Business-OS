-- LA CUENTA CORRIENTE, POR CATEGORÍA — una sola función, con el circuito como parámetro.
--
-- Dueño, 02/10/2026, sobre el bloque «cuenta corriente» de Clientes › Cobranzas (antigüedad, DSO,
-- comportamiento): «dejalo si corresponde a cobros en blanco». Medido ese día: el bloque lee
-- `cliente_cuenta_corriente`, que suma TODAS las filas de `cobranzas` del cliente sin mirar `categoria`
-- (B = facturado, N = sin comprobante). Messina debía B $91.055.367 + N $18.750.000 y el bloque publicaba
-- $109.805.367 como un solo saldo; San Francisco B $7.260.000 + N $41.592.102.
--
-- POR QUÉ UN PARÁMETRO Y NO UNA SEGUNDA FUNCIÓN O VISTA: el saldo, el aging, el DSO y la efectividad
-- están definidos UNA vez, acá. Una «cuenta corriente blanca» copiada sería la segunda definición del
-- mismo concepto, y el día que una se corrija la otra va a seguir diciendo lo de antes.
--
-- `p_categoria` NULL = como hasta hoy (las dos categorías). Así no le cambia el número a nadie más:
-- `cliente_cuenta_corriente` → `cliente_economia` → `pantalla_clientes()`/`pantalla_cliente_en_vivo()`
-- (la cartera y la ficha), `analiticas_costos*` y `cliente_economia_para_portal()` siguen en B+N.
-- Sólo el bloque pide 'B', por RPC.
--
-- POR QUÉ SE TIRA LA FUNCIÓN Y NO SE AGREGA UNA SOBRECARGA: con `(date, date)` y `(date, date, text
-- default null)` juntas, toda llamada de dos argumentos —la vista, `analiticas_costos(p_desde, p_hasta)`—
-- es ambigua («function … is not unique») y se cae. La vieja se tira; para tirarla hay que tirar la vista
-- que la nombra por OID y `cliente_economia`, que lee esa vista. Las dos se rehacen IGUALES a como están
-- vivas (leídas con `pg_get_viewdef` el 02/10/2026), con lo que un `drop` les borra: `security_invoker`,
-- el comentario y los permisos. Los permisos se fijan exactos (revoke + grant): el default de `postgres`
-- en `public` le da `arwd` a `authenticated`, y vivas tienen sólo `select`.
--
-- ORDEN DE SALIDA: esta migración ANTES que el código que pide 'B'. Al revés, el bloque falla a la vista
-- («no se pudo leer»), que es lo correcto: no hay respaldo a la vista vieja, porque publicaría B+N como
-- si fuera blanco. Aplicada antes, el código viejo sigue leyendo la vista y ve exactamente lo de hoy.
--
-- Idempotente: los `drop … if exists` y el `create or replace` aguantan una segunda corrida.
-- La transacción la pone `aplicar-migracion.mjs`; acá no va begin/commit.

set local lock_timeout = '3s';

drop view if exists public.cliente_economia;
drop view if exists public.cliente_cuenta_corriente;
drop function if exists public.cuenta_corriente_de_clientes(date, date);

create or replace function public.cuenta_corriente_de_clientes(
  p_desde date, p_hasta date, p_categoria text default null
)
 returns table(cliente_id uuid, nombre_comercial text, saldo numeric, vencido numeric, por_vencer numeric, comprobantes_pendientes bigint, aging_por_vencer numeric, aging_1_30 numeric, aging_31_60 numeric, aging_61_90 numeric, aging_mas_90 numeric, facturado_90d numeric, cobrado_90d numeric, cobrado_total numeric, cobrado_neto_total numeric, dso numeric, efectividad_pct numeric, dias_cobro_promedio numeric, fondo_reparo numeric)
 language sql
 stable
 set search_path to 'public'
as $function$
 WITH base AS (
         SELECT c.cliente_id,
            c.total_bruto AS total,
            c.monto_neto,
            c.estado,
            c.fecha_cobro,
            c.fecha_emision,
            c.estado = ANY (ARRAY['Pendiente'::text, 'Facturado'::text]) AS es_deuda,
            es_cobrada(c.estado, c.fecha_cobro) AS es_cobrado,
            estado_de_cobro(c.estado, c.fecha_cobro, h.hoy) = 'vencido'::text AS es_vencido,
            - dias_para_cobro(c.fecha_cobro, h.hoy) AS dias_atraso
           FROM cobranzas c
             CROSS JOIN ( SELECT hoy_san_juan() AS hoy) h
          WHERE c.cliente_id IS NOT NULL AND c.total_bruto IS NOT NULL AND c.estado <> 'CANCELAR'::text
            AND (p_desde IS NULL OR c.fecha_emision >= p_desde)
            AND (p_hasta IS NULL OR c.fecha_emision <= p_hasta)
            -- Mismo criterio que `esBlanco` de la ficha: la celda del Sheet puede venir con espacios
            -- o en minúscula, y una 'b ' fuera del blanco sería una fila perdida sin aviso.
            AND (p_categoria IS NULL OR upper(btrim(c.categoria)) = upper(btrim(p_categoria)))
        )
 SELECT b.cliente_id,
    cl.nombre_comercial,
    COALESCE(sum(b.total) FILTER (WHERE b.es_deuda), 0::numeric) AS saldo,
    COALESCE(sum(b.total) FILTER (WHERE b.es_vencido), 0::numeric) AS vencido,
    COALESCE(sum(b.total) FILTER (WHERE b.es_deuda AND NOT b.es_vencido), 0::numeric) AS por_vencer,
    count(*) FILTER (WHERE b.es_deuda) AS comprobantes_pendientes,
    COALESCE(sum(b.total) FILTER (WHERE b.es_deuda AND NOT b.es_vencido), 0::numeric) AS aging_por_vencer,
    COALESCE(sum(b.total) FILTER (WHERE b.es_vencido AND b.dias_atraso >= 1 AND b.dias_atraso <= 30), 0::numeric) AS aging_1_30,
    COALESCE(sum(b.total) FILTER (WHERE b.es_vencido AND b.dias_atraso >= 31 AND b.dias_atraso <= 60), 0::numeric) AS aging_31_60,
    COALESCE(sum(b.total) FILTER (WHERE b.es_vencido AND b.dias_atraso >= 61 AND b.dias_atraso <= 90), 0::numeric) AS aging_61_90,
    COALESCE(sum(b.total) FILTER (WHERE b.es_vencido AND b.dias_atraso > 90), 0::numeric) AS aging_mas_90,
    COALESCE(sum(b.total) FILTER (WHERE b.fecha_emision >= (CURRENT_DATE - 90)), 0::numeric) AS facturado_90d,
    COALESCE(sum(b.total) FILTER (WHERE b.es_cobrado AND b.fecha_cobro >= (CURRENT_DATE - 90)), 0::numeric) AS cobrado_90d,
    sum(b.total) FILTER (WHERE b.es_cobrado) AS cobrado_total,
    sum(b.monto_neto) FILTER (WHERE b.es_cobrado) AS cobrado_neto_total,
        CASE
            WHEN COALESCE(sum(b.total) FILTER (WHERE b.fecha_emision >= (CURRENT_DATE - 90)), 0::numeric) > 0::numeric THEN round(COALESCE(sum(b.total) FILTER (WHERE b.es_deuda), 0::numeric) / sum(b.total) FILTER (WHERE b.fecha_emision >= (CURRENT_DATE - 90)) * 90::numeric, 1)
            ELSE NULL::numeric
        END AS dso,
        CASE
            WHEN (COALESCE(sum(b.total) FILTER (WHERE b.es_cobrado AND b.fecha_cobro >= (CURRENT_DATE - 90)), 0::numeric) + COALESCE(sum(b.total) FILTER (WHERE b.es_vencido), 0::numeric)) > 0::numeric THEN round(100.0 * COALESCE(sum(b.total) FILTER (WHERE b.es_cobrado AND b.fecha_cobro >= (CURRENT_DATE - 90)), 0::numeric) / (COALESCE(sum(b.total) FILTER (WHERE b.es_cobrado AND b.fecha_cobro >= (CURRENT_DATE - 90)), 0::numeric) + COALESCE(sum(b.total) FILTER (WHERE b.es_vencido), 0::numeric)), 1)
            ELSE NULL::numeric
        END AS efectividad_pct,
    round(avg(b.fecha_cobro - b.fecha_emision) FILTER (WHERE b.es_cobrado AND b.fecha_cobro >= (CURRENT_DATE - 90) AND b.fecha_emision IS NOT NULL), 1) AS dias_cobro_promedio,
    COALESCE(( SELECT sum(cc.reparo) AS sum
           FROM certificado_cliente cc
          WHERE cc.cliente_id = b.cliente_id AND cc.estado <> 'cobrado'::text), 0::numeric) AS fondo_reparo
   FROM base b
     JOIN clientes cl ON cl.id = b.cliente_id
  GROUP BY b.cliente_id, cl.nombre_comercial
$function$;

comment on function public.cuenta_corriente_de_clientes(date, date, text) is
  'LA ÚNICA definición de la cuenta corriente por cliente (saldo, vencido, aging, DSO, efectividad). '
  'p_desde/p_hasta recortan por fecha de emisión; p_categoria: NULL = B y N juntas (lo de siempre: '
  'cliente_cuenta_corriente, cliente_economia, analíticas), ''B'' = sólo lo facturado (el bloque cuenta '
  'corriente de la ficha del cliente, pedido del dueño 02/10/2026). fondo_reparo sale de certificado_cliente '
  'y NO se recorta por categoría: el certificado no la tiene. security invoker: respeta la RLS de cobranzas.';

revoke all on function public.cuenta_corriente_de_clientes(date, date, text) from public, anon;
grant execute on function public.cuenta_corriente_de_clientes(date, date, text) to authenticated, service_role;

-- ── LA VISTA, IGUAL QUE ANTES: B y N juntas ────────────────────────────────────────────────────
create view public.cliente_cuenta_corriente with (security_invoker = true) as
  select * from public.cuenta_corriente_de_clientes(null::date, null::date, null::text);

comment on view public.cliente_cuenta_corriente is $c$Cuenta corriente por cliente (pantalla 28). Fuente: public.cobranzas (la réplica VIVA) + certificado_cliente. Qué está cobrado lo decide public.es_cobrada() —el MISMO predicado que obra_cobranza— desde el 10/09/2026: antes decía estado = 'Cobrado' y contaba como cobrada una fila con fecha de cobro futura. Sólo Pendiente y Facturado son deuda; Proyectado es previsión y queda afuera. facturado_90d y cobrado_90d son de VENTANA (90 días); cobrado_total y cobrado_neto_total son acumulados y son los únicos restables de un contrato. security_invoker: respeta la RLS de cobranzas (Administración/Dirección).$c$;

revoke all on public.cliente_cuenta_corriente from public, anon, authenticated;
grant select on public.cliente_cuenta_corriente to authenticated;
grant all on public.cliente_cuenta_corriente to service_role;

-- ── `cliente_economia`, TAL CUAL ESTÁ VIVA ─────────────────────────────────────────────────────
create view public.cliente_economia with (security_invoker = true) as
 WITH obras AS (
         SELECT op.cliente_id,
            op.obra_id,
            op.estado,
            op.costo_real,
            e.contratado
           FROM public.obra_panel op
             LEFT JOIN public.obra_economia_cartera e ON e.obra_canonica_id = op.obra_id
          WHERE op.cliente_id IS NOT NULL
        ), por_cliente AS (
         SELECT obras.cliente_id,
            count(*) FILTER (WHERE obras.estado = 'activa'::text)::integer AS n_obras_en_curso,
            count(*) FILTER (WHERE obras.estado = 'cerrada'::text)::integer AS n_obras_cerradas,
            count(*) FILTER (WHERE obras.contratado IS NOT NULL)::integer AS n_obras_con_precio,
            count(*) FILTER (WHERE obras.contratado IS NULL)::integer AS n_obras_sin_precio,
            sum(obras.costo_real) AS costo_real
           FROM obras
          GROUP BY obras.cliente_id
        )
 SELECT c.id AS cliente_id,
    c.slug,
    c.nombre_comercial,
    public.contratado_de_cliente(c.id) AS contratado,
    public.contratado_de_cliente(c.id, true) AS contratado_en_curso,
    COALESCE(p.n_obras_en_curso, 0) AS n_obras_en_curso,
    COALESCE(p.n_obras_cerradas, 0) AS n_obras_cerradas,
    COALESCE(p.n_obras_con_precio, 0) AS n_obras_con_precio,
    COALESCE(p.n_obras_sin_precio, 0) AS n_obras_sin_precio,
    p.costo_real,
    cc.facturado_90d,
    cc.cobrado_90d,
    cc.cobrado_total,
    cc.cobrado_neto_total,
    cc.saldo,
    cc.vencido,
    cc.por_vencer,
    cc.comprobantes_pendientes,
    cc.fondo_reparo,
        CASE
            WHEN public.contratado_de_cliente(c.id) IS NOT NULL AND cc.cobrado_neto_total IS NOT NULL THEN public.contratado_de_cliente(c.id) - cc.cobrado_neto_total
            ELSE NULL::numeric
        END AS pendiente_contractual
   FROM public.clientes c
     LEFT JOIN por_cliente p ON p.cliente_id = c.id
     LEFT JOIN public.cliente_cuenta_corriente cc ON cc.cliente_id = c.id
  WHERE public.ve_economia();

comment on view public.cliente_economia is $c$LA ECONOMÍA DEL CLIENTE EN UNA SOLA VISTA (PRP-REALIDAD-UNICA H1): contratado (función contratado_de_cliente, sobre obra_economia_sheet, obras no fusionadas), facturado y cobrado (cliente_cuenta_corriente, sobre cobranzas con el predicado es_cobrada), vencido, por vencer y pendiente_contractual = contratado - cobrado_neto_total (neto contra neto: el contratado no lleva IVA). PROVISORIO: facturado_90d y cobrado_90d conservan la ventana de 90 días que la cuenta corriente ya usaba porque la decisión D2 del PRP (90 días vs acumulado) sigue abierta; la ventana va en el nombre para que ninguna cara la suponga. NULL nunca es 0. WHERE ve_economia(): a quien no ve la plata le devuelve cero filas, no ceros.$c$;

revoke all on public.cliente_economia from public, anon, authenticated;
grant select on public.cliente_economia to authenticated;
grant all on public.cliente_economia to service_role;

notify pgrst, 'reload schema';
