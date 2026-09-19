-- LO PAGADO POR DEBIN CUENTA COMO PAGADO (19/09/2026).
--
-- La migración 20260919T1700 dejó registrar el pago del IIBB de 08/2026 con tipo `debin`, pero
-- `impuesto_posicion` sumaba lo pagado FILTRANDO por vep · debito_automatico · debito_bancario: el
-- pago estaba en la base y la posición seguía diciendo «pendiente $432.764,90» sobre plata que ya
-- salió de la cuenta el 17/09. Un control que no ve el pago publica una deuda que no existe.
--
-- Se reemplaza la vista con su MISMA definición viva más `debin` en ese filtro. `security_invoker`
-- se vuelve a declarar en el mismo commit: un CREATE OR REPLACE lo pierde y la vista pasaría a leer
-- con los permisos del dueño, salteando la RLS de quien consulta.
create or replace view public.impuesto_posicion as
 WITH vigente AS (
         SELECT DISTINCT ON (o.impuesto, o.periodo, o.concepto) o.id,
            o.impuesto,
            o.periodo,
            o.concepto,
            o.fuente,
            o.lector,
            o.estado,
            o.vencimiento,
            o.vencimiento_confianza,
            o.determinado,
            o.base_imponible,
            o.creditos,
            o.saldo_favor_anterior,
            o.a_pagar,
            o.saldo_a_favor,
            o.presentada_el,
            o.comprobante,
            o.documento,
            o.datos_al,
            o.detalle,
            o.sincronizado_en
           FROM impuesto_obligacion o
          ORDER BY o.impuesto, o.periodo, o.concepto, (
                CASE o.fuente
                    WHEN 'ddjj_contador'::text THEN 1
                    WHEN 'arca'::text THEN 2
                    WHEN 'manual'::text THEN 3
                    ELSE 4
                END)
        ), pagos AS (
         SELECT p.impuesto,
            p.periodo,
            p.concepto,
            sum(p.importe) FILTER (WHERE p.tipo = ANY (ARRAY['vep'::text, 'debito_automatico'::text, 'debito_bancario'::text, 'debin'::text])) AS pagado,
            max(p.fecha) AS ultimo_pago
           FROM impuesto_pago p
          WHERE p.impuesto IS NOT NULL AND p.periodo IS NOT NULL
          GROUP BY p.impuesto, p.periodo, p.concepto
        )
 SELECT v.id,
    v.impuesto,
    v.periodo,
    v.concepto,
    v.fuente,
    v.estado,
    v.vencimiento,
    v.vencimiento_confianza,
    v.determinado,
    v.base_imponible,
    v.creditos,
    v.saldo_favor_anterior,
    v.a_pagar,
    v.saldo_a_favor,
    v.presentada_el,
    v.comprobante,
    v.documento,
    v.datos_al,
    v.detalle,
    v.sincronizado_en,
    COALESCE(pg.pagado, 0::numeric)::numeric(16,2) AS pagado,
    pg.ultimo_pago,
        CASE
            WHEN v.a_pagar IS NULL THEN NULL::numeric
            ELSE GREATEST(v.a_pagar - COALESCE(pg.pagado, 0::numeric), 0::numeric)::numeric(16,2)
        END AS pendiente
   FROM vigente v
     LEFT JOIN pagos pg ON pg.impuesto = v.impuesto AND pg.periodo = v.periodo AND pg.concepto = v.concepto;
alter view public.impuesto_posicion set (security_invoker = true);
grant select on public.impuesto_posicion to authenticated;
