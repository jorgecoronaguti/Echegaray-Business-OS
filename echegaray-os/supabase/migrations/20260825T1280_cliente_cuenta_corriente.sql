-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA CUENTA CORRIENTE DEL CLIENTE — pantalla 28 «Antigüedad, DSO, plan del día»
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Una fila por cliente con saldo, vencido, DSO, aging en 5 bandas y fondo de reparo. Todo sale de
-- `public.cobranzas` —la réplica VIVA de la pestaña Cobranzas, ver abajo por qué no la singular—
-- y de `certificado_cliente`. Nada se
-- calcula dos veces: la web, el chat y Claude Code leen ESTA vista.
--
-- ═══ PRIMERO: QUÉ CUENTA COMO DEUDA Y QUÉ NO ═══
--
-- La pestaña tiene cuatro estados vivos: Cobrado (35), Facturado (7), Pendiente (6), Proyectado (6).
-- Sólo Pendiente y Facturado son CUENTAS POR COBRAR: hay un comprobante emitido y una plata que
-- alguien debe. `Proyectado` es una PREVISIÓN del dueño — todavía no se facturó nada. Meterlo en el
-- saldo del cliente convertiría una estimación en un hecho (regla de oro 2) y le mostraría al
-- cliente, en el portal, una deuda que no contrajo.
--
-- ═══ SEGUNDO: QUÉ ES «VENCIDO» — LO DEFINE EL SHEET, NO ESTA VISTA ═══
--
-- La columna U de Cobranzas ya lo dice, textual:
--     =IF(O="Cobrado";"Cobrado"; IF(O="Pendiente"; IF(Q<TODAY();"Vencido"; Q-TODAY()); O))
-- O sea: vencido = no cobrado Y la fecha de la columna Q ya pasó. Esta vista replica ESA definición
-- y no inventa otra. Si mañana hubiera dos definiciones de «vencido» —la del Sheet que mira el dueño
-- y la de la web que mira el cliente— la discusión sería irresoluble. Realidad única.
--
-- Q es la palanca: mientras la fila está pendiente, Q es la fecha ESPERADA de cobro (muchas veces
-- una fórmula, `=P+75`); cuando se cobra, Q pasa a ser la fecha REAL. Por eso el aging se arma sobre
-- Q y no sobre `fecha_vencimiento` (que en la réplica es en realidad la columna P, «Fecha de Venta»
-- — el nombre `fecha_venta` de esa columna en la réplica es fiel al encabezado del Sheet).
--
-- ═══ TERCERO: LA EFECTIVIDAD «COBRADO EN FECHA» NO SE PUEDE CALCULAR, Y NO SE INVENTA ═══
--
-- El contrato pedía «efectividad = cobrado en fecha / vencido en el período». NO ES COMPUTABLE con
-- esta fuente, y la razón es estructural: la columna Q es UNA SOLA celda que primero guarda la fecha
-- prometida y después se PISA con la fecha real del cobro. Verificado en el Sheet vivo: la fila 49
-- (Pendiente) tiene Q = `=P49+75`; la fila 5 (Cobrada) tiene Q = 46056 literal, que no es P+75. Al
-- cobrarse, la promesa desaparece. Sin fecha prometida guardada no hay forma de saber si un cobro
-- llegó a tiempo, y estimarla sería fabricar el dato.
--
-- Lo que SÍ se publica son dos medidas reales, con nombre honesto:
--   · `efectividad_pct`      = cobrado 90d / (cobrado 90d + vencido impago hoy).
--                              «De la plata que debería estar en la mano, cuánta está.»
--                              NO es tasa de pago en término. No confundirlas.
--   · `dias_cobro_promedio`  = promedio de (fecha de cobro − fecha de emisión) de lo cobrado en 90d.
--                              Es el comportamiento de pago REALMENTE observado del cliente.
--
-- La tasa de pago en término queda computable HACIA ADELANTE: `esquema_pago.reprogramaciones` y
-- `cobranza_cambio.valor_anterior` guardan la fecha que había antes de cada cambio. Cuando haya
-- historia, se agrega acá. Hasta entonces: sin fuente, y dicho.

-- ── EL PUENTE COBRANZA → CLIENTE, Y POR QUÉ LA FUENTE ES `cobranzas` Y NO `cobranza` ──────────
--
-- HALLAZGO, verificado contra la base el 25/08/2026. Existen DOS réplicas de la misma pestaña y una
-- de las dos está muerta:
--
--   public.cobranza   (singular) — 54 filas, último sync 2026-07-20: HACE 35 DÍAS. No la refresca
--                                  ningún timer: sólo `replicarCobranzas`, que se llama a mano desde
--                                  una herramienta del chat. Es una capa fósil.
--   public.cobranzas  (plural)   — 96 filas, sincronizada hace minutos por el timer horario
--                                  `echegaray-cobranzas-sync`. Trae además J (monto neto), K (IVA),
--                                  L (retenciones), M (total), N (forma de cobro) y D (factura), que
--                                  la singular no tiene.
--
-- El contrato nombraba la singular. Se usa la PLURAL: una cuenta corriente construida sobre una
-- réplica de 35 días le mostraría al cliente, en su portal, cobros que ya cobró y omitiría los 35
-- comprobantes pendientes ($292,8M) que aparecieron después. Una fuente que se congela sin gritar es
-- peor que una que falla.
--
-- LA FILA FÍSICA. La plural no guarda `fila_sheet`, guarda `sheet_id` = el valor de la columna A,
-- que es `=IF(C5="";"";ROW()-4)`. Entonces fila = sheet_id + 4. Verificado fila por fila contra la
-- singular (que sí guarda fila_sheet) en las 12 filas donde el comprobante es único: coincide en
-- todas. Igual el worker NO confía en esa cuenta: verifica la huella antes de escribir.
alter table public.cobranzas add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
create index if not exists cobranzas_cliente_idx on public.cobranzas (cliente_id);
comment on column public.cobranzas.cliente_id is
  'Resuelto por sync-esquema-cliente.mjs desde obra_cliente con los alias que el dueño ya declaró en '
  'obra_alias. NULL = no se pudo resolver sin ambigüedad, y el sync lo reporta: nunca se adivina.';

-- ── LA VISTA ────────────────────────────────────────────────────────────────────────────────────
--
-- `security_invoker = true`: la vista se evalúa con los permisos de QUIEN CONSULTA, así que la RLS de
-- las tablas de abajo sigue valiendo. Sin esto una vista sobre tablas con RLS se convierte en la
-- puerta de atrás que las saltea — que es el error clásico y silencioso de este patrón.
drop view if exists public.cliente_cuenta_corriente;
create view public.cliente_cuenta_corriente
with (security_invoker = true) as
with base as (
  select
    c.cliente_id,
    c.total_bruto as total,
    c.estado,
    c.fecha_cobro,
    c.fecha_emision,
    -- Cuentas por cobrar reales. Ver bloque «QUÉ CUENTA COMO DEUDA».
    (c.estado in ('Pendiente', 'Facturado'))                          as es_deuda,
    (c.estado = 'Cobrado')                                            as es_cobrado,
    -- Definición de vencido tomada de la columna U del Sheet.
    (c.estado in ('Pendiente', 'Facturado') and c.fecha_cobro < current_date) as es_vencido,
    -- Días de atraso sobre la fecha de la columna Q.
    (current_date - c.fecha_cobro)                                    as dias_atraso
  from public.cobranzas c
  -- `CANCELAR` es una fila anulada en el Sheet y su total es NULL: no es deuda ni cobro.
  where c.cliente_id is not null and c.total_bruto is not null and c.estado <> 'CANCELAR'
)
select
  b.cliente_id,
  cl.nombre_comercial,

  -- SALDO: todo lo emitido y no cobrado, vencido o no.
  coalesce(sum(b.total) filter (where b.es_deuda), 0)                          as saldo,
  coalesce(sum(b.total) filter (where b.es_vencido), 0)                        as vencido,
  coalesce(sum(b.total) filter (where b.es_deuda and not b.es_vencido), 0)     as por_vencer,
  count(*) filter (where b.es_deuda)                                           as comprobantes_pendientes,

  -- AGING EN 5 BANDAS, por días transcurridos desde la fecha de la columna Q. La primera banda es
  -- «todavía no venció»; las otras cuatro son tramos de mora. Los bordes son los de la práctica
  -- (30/60/90) porque son los que usa el propio Sheet para leer la cartera.
  coalesce(sum(b.total) filter (where b.es_deuda and not b.es_vencido), 0)                        as aging_por_vencer,
  coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso between 1 and 30), 0)        as aging_1_30,
  coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso between 31 and 60), 0)       as aging_31_60,
  coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso between 61 and 90), 0)       as aging_61_90,
  coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso > 90), 0)                    as aging_mas_90,

  -- FACTURADO Y COBRADO EN LA VENTANA DE 90 DÍAS. Es la base de las dos métricas de abajo, y se
  -- publica para que quien lea el DSO pueda ver contra qué se calculó — un DSO sin su denominador
  -- a la vista es un número que nadie puede auditar.
  coalesce(sum(b.total) filter (where b.fecha_emision >= current_date - 90), 0)                   as facturado_90d,
  coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= current_date - 90), 0)    as cobrado_90d,

  -- DSO = (saldo pendiente / facturado últimos 90 días) × 90.
  -- Días que en promedio tarda en cobrarse lo facturado. NULL —no 0— cuando no se facturó nada en la
  -- ventana: un DSO de 0 diría «cobra al instante», que es lo contrario de «no hay con qué medirlo».
  case
    when coalesce(sum(b.total) filter (where b.fecha_emision >= current_date - 90), 0) > 0
    then round((coalesce(sum(b.total) filter (where b.es_deuda), 0)
                / sum(b.total) filter (where b.fecha_emision >= current_date - 90)) * 90, 1)
  end                                                                                            as dso,

  -- EFECTIVIDAD = cobrado 90d / (cobrado 90d + vencido impago). Ver el bloque TERCERO: NO es tasa de
  -- pago en término. NULL cuando no hay ni cobros ni vencidos en la ventana.
  case
    when (coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= current_date - 90), 0)
          + coalesce(sum(b.total) filter (where b.es_vencido), 0)) > 0
    then round(100.0 * coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= current_date - 90), 0)
               / (coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= current_date - 90), 0)
                  + coalesce(sum(b.total) filter (where b.es_vencido), 0)), 1)
  end                                                                                            as efectividad_pct,

  -- Comportamiento de pago realmente observado: días entre emitir y cobrar.
  round(avg(b.fecha_cobro - b.fecha_emision)
        filter (where b.es_cobrado and b.fecha_cobro >= current_date - 90
                  and b.fecha_emision is not null), 1)                                           as dias_cobro_promedio,

  -- FONDO DE REPARO retenido y todavía no liberado. Sale de los certificados, no de Cobranzas: la
  -- pestaña no tiene columna de reparo. Es margen ya ganado y no cobrado — si no se mira acá, no se
  -- mira en ningún lado.
  coalesce((select sum(cc.reparo) from public.certificado_cliente cc
             where cc.cliente_id = b.cliente_id and cc.estado <> 'cobrado'), 0)                   as fondo_reparo
from base b
join public.clientes cl on cl.id = b.cliente_id
group by b.cliente_id, cl.nombre_comercial;

comment on view public.cliente_cuenta_corriente is
  'Cuenta corriente por cliente (pantalla 28). Fuente: public.cobranzas (la réplica VIVA; la '
  'singular public.cobranza está fósil desde el 20/07/2026) + certificado_cliente. Fuente de la pestaña '
  'Cobranzas) + certificado_cliente. Sólo Pendiente y Facturado son deuda; Proyectado es previsión y '
  'queda afuera. Vencido = no cobrado y fecha de la columna Q pasada, que es la definición de la '
  'columna U del propio Sheet. DSO = (saldo / facturado 90d) x 90. efectividad_pct = cobrado 90d / '
  '(cobrado 90d + vencido) — NO es tasa de pago en término: esa no es computable porque la columna Q '
  'pisa la fecha prometida con la real al cobrarse. security_invoker: respeta la RLS de las tablas.';

grant select on public.cliente_cuenta_corriente to authenticated;
