-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- «COBRADA» SE DEFINE UNA SOLA VEZ — `public.es_cobrada(estado, fecha_cobro)`
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- PRP `docs/engineering/PRP-REALIDAD-UNICA.md`, concepto 3 (Cobrado) · hito H1.
--
-- ═══ LAS DOS DEFINICIONES QUE CONVIVÍAN, TEXTUALES ═══
--
--   obra_cobranza          (20260822T6200)   lower(btrim(estado)) = 'cobrado'
--                                            AND (fecha_cobro IS NULL OR fecha_cobro <= current_date)
--   cliente_cuenta_corriente (20260825T1280) estado = 'Cobrado'
--
-- Difieren en DOS cosas y las dos importan:
--
--   1. La comparación. `'Cobrado'` exacto contra `lower(btrim(...))`. Una celda del Sheet tipeada
--      «cobrado» o con un espacio al final cuenta como cobro en la vista de la OBRA y como deuda en
--      la del CLIENTE. Nadie lo vería: el número simplemente no cierra entre dos pantallas.
--   2. La fecha futura. `obra_cobranza` ya decidió —y lo dejó escrito— que un «Cobrado» con
--      `fecha_cobro` posterior a hoy es percibido imposible y cae en POR COBRAR. La cuenta corriente
--      del cliente lo contaba como plata en la mano.
--
-- No se elige "la más nueva": se elige la que NO afirma plata que todavía no entró. Ante una
-- contradicción del origen, el lado que no afirma. Es la misma regla que ya aplica
-- `repasar-cobranzas-y-caja.mjs` con el rótulo «COBRADOS con fecha de cobro FUTURA».
--
-- ═══ QUÉ CAMBIA EN LA PRÁCTICA ═══
--
-- · `cliente_cuenta_corriente.cobrado_90d` y `efectividad_pct` dejan afuera las filas «Cobrado» con
--   fecha futura. Esas filas NO pasan a `vencido` ni a `saldo`: «deuda» sigue siendo
--   `estado in ('Pendiente','Facturado')`, que es la columna O del Sheet y no se toca acá. Una fila
--   cobrada con fecha futura queda fuera de las dos columnas, que es exactamente lo que se sabe de
--   ella: no entró todavía y el cliente no la debe.
-- · `obra_cobranza` no cambia de comportamiento: su predicado ES el que se adopta. Se recrea sólo
--   para que la definición viva en un lugar y no en dos cuerpos de vista que alguien pueda editar
--   por separado — que es cómo nacieron estas dos.
--
-- ═══ LA COLUMNA NUEVA: `cobrado_total` (Y POR QUÉ TAMBIÉN LA NETA) ═══
--
-- La cuenta corriente publicaba `cobrado_90d` y nada más. Una ventana de 90 días no se puede restar
-- de un CONTRATO, que es acumulado: mezclar ventanas es la regla de oro 3. `cliente_economia`
-- necesita el cobrado ACUMULADO para poder decir cuánto falta cobrar de lo contratado.
--
-- Y lo necesita NETO. `total_bruto` lleva IVA —es lo que entra al banco, el número de caja— mientras
-- que `obra_economia_sheet.contratado` sale de la venta SIN IVA (`ventaViva` suma la columna de neto
-- de Cobranzas). Restar un cobro con IVA de un contrato sin IVA da una obra que «ya cobró más de lo
-- que vendió»: el mismo argumento que `obra_cobranza` ya escribió al publicar `cobrado` y
-- `cobrado_neto` por separado. Se publican los dos, con el nombre puesto, y `pendiente_contractual`
-- usa el neto.
--
-- `cobrado_neto_total` puede tener MENOS filas detrás que `cobrado_total` y no es un error: hay filas
-- donde `monto_neto` es NULL y el bruto es sólo IVA (la fila «IVA de Factura 220» de quattropani,
-- $6.510.000). Su neto se cobró en otra fila.

-- ── EL PREDICADO ────────────────────────────────────────────────────────────────────────────────
--
-- `stable` y no `immutable`: mira `current_date`, que cambia entre transacciones.
create or replace function public.es_cobrada(estado text, fecha_cobro date)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select lower(btrim(coalesce(estado, ''))) = 'cobrado'
     and (fecha_cobro is null or fecha_cobro <= current_date)
$$;

comment on function public.es_cobrada(text, date) is
  'ÚNICA definición de «esta fila de Cobranzas está cobrada»: estado cobrado (sin importar mayúsculas '
  'ni espacios) Y la fecha de cobro no es futura. La usan obra_cobranza (por obra) y '
  'cliente_cuenta_corriente (por cliente). Un «Cobrado» con fecha futura es percibido imposible: no '
  'cuenta como cobro. Ver PRP-REALIDAD-UNICA.md concepto 3.';

revoke all on function public.es_cobrada(text, date) from public;
grant execute on function public.es_cobrada(text, date) to authenticated, service_role;

-- ── EL PERMISO QUE PIDE EL NETO ────────────────────────────────────────────────────────────────
--
-- `cliente_cuenta_corriente` corre con `security_invoker = true`: lee `cobranzas` como el usuario
-- que consulta, así que necesita el GRANT de columna. Hasta hoy tenía cinco columnas
-- (20260905T1400) y ninguna era `monto_neto`, con el argumento explícito de no ensanchar sin un
-- consumidor. Ahora hay uno: `pendiente_contractual`. La policy `cobranzas_select` sigue siendo
-- `es_administracion()`, o sea que esto no le abre la tabla a ningún rol nuevo.
grant select (monto_neto) on public.cobranzas to authenticated;

-- ── LA VISTA POR OBRA, CON EL PREDICADO AFUERA ─────────────────────────────────────────────────
--
-- Cuerpo idéntico al de 20260822T6200 salvo la llamada. `security_invoker = false` a propósito, con
-- `ve_economia()` en el WHERE: `authenticated` no tiene select sobre `cobranzas` para estas
-- columnas y una vista invoker daría «permission denied» a la web entera. El porqué completo está
-- en aquella migración y no se repite acá.
create or replace view public.obra_cobranza with (security_invoker = false) as
with clasificada as (
  select a.obra_id,
         public.es_cobrada(cb.estado, cb.fecha_cobro) as esta_cobrada,
         cb.total_bruto,
         cb.monto_neto
    from public.cobranzas cb
    join public.obra_alias a
      on a.alias = public.norm_obra(cb.obra_cliente)
   where a.obra_id is not null
     and a.clasificacion in ('obra', 'mantenimiento')
), por_obra as (
  select obra_id,
         count(*)::int                                            as n_cobranzas,
         count(*) filter (where esta_cobrada)::int                as n_cobradas,
         sum(total_bruto) filter (where esta_cobrada)             as cobrado,
         sum(monto_neto)  filter (where esta_cobrada)             as cobrado_neto,
         sum(total_bruto) filter (where not esta_cobrada)         as por_cobrar_proyectado
    from clasificada
   group by obra_id
)
select oc.id                                as obra_id,
       oc.nombre                            as obra,
       coalesce(p.n_cobranzas, 0)           as n_cobranzas,
       coalesce(p.n_cobradas, 0)            as n_cobradas,
       p.cobrado,
       p.cobrado_neto,
       p.por_cobrar_proyectado
  from public.obra_canonica oc
  left join por_obra p on p.obra_id = oc.id
 where public.ve_economia();

comment on view public.obra_cobranza is
  'FUENTE ÚNICA de lo COBRADO y lo POR COBRAR de cada obra. Sale de `cobranzas` resuelta por '
  '`norm_obra(obra_cliente) = obra_alias.alias`. Qué está cobrado lo decide public.es_cobrada(), el '
  'MISMO predicado que usa cliente_cuenta_corriente desde el 10/09/2026. `cobrado` es bruto (lo que '
  'entra al banco); `cobrado_neto` es sin IVA y es el único comparable contra el contrato. Sin filas, '
  'NULL: no cobró $0, no se sabe. Corre como dueña con ve_economia() en el WHERE porque '
  '`authenticated` no tiene select sobre `cobranzas`.';

grant select on public.obra_cobranza to authenticated;
grant select on public.obra_cobranza to service_role;

-- ── LA CUENTA CORRIENTE DEL CLIENTE, CON EL MISMO PREDICADO Y EL ACUMULADO ─────────────────────
--
-- Cuerpo de 20260825T1280 con tres cambios y ninguno más: `es_cobrada()` en lugar de
-- `estado = 'Cobrado'`, y las columnas `cobrado_total` / `cobrado_neto_total`. El porqué del resto
-- —qué es deuda, qué es vencido, por qué la efectividad no es tasa de pago en término— vive en
-- aquella migración.
drop view if exists public.cliente_cuenta_corriente;
create view public.cliente_cuenta_corriente
with (security_invoker = true) as
with base as (
  select
    c.cliente_id,
    c.total_bruto as total,
    c.monto_neto,
    c.estado,
    c.fecha_cobro,
    c.fecha_emision,
    (c.estado in ('Pendiente', 'Facturado'))                          as es_deuda,
    public.es_cobrada(c.estado, c.fecha_cobro)                        as es_cobrado,
    (c.estado in ('Pendiente', 'Facturado') and c.fecha_cobro < current_date) as es_vencido,
    (current_date - c.fecha_cobro)                                    as dias_atraso
  from public.cobranzas c
  where c.cliente_id is not null and c.total_bruto is not null and c.estado <> 'CANCELAR'
)
select
  b.cliente_id,
  cl.nombre_comercial,

  coalesce(sum(b.total) filter (where b.es_deuda), 0)                          as saldo,
  coalesce(sum(b.total) filter (where b.es_vencido), 0)                        as vencido,
  coalesce(sum(b.total) filter (where b.es_deuda and not b.es_vencido), 0)     as por_vencer,
  count(*) filter (where b.es_deuda)                                           as comprobantes_pendientes,

  coalesce(sum(b.total) filter (where b.es_deuda and not b.es_vencido), 0)                        as aging_por_vencer,
  coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso between 1 and 30), 0)        as aging_1_30,
  coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso between 31 and 60), 0)       as aging_31_60,
  coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso between 61 and 90), 0)       as aging_61_90,
  coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso > 90), 0)                    as aging_mas_90,

  coalesce(sum(b.total) filter (where b.fecha_emision >= current_date - 90), 0)                   as facturado_90d,
  coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= current_date - 90), 0)    as cobrado_90d,

  -- ACUMULADO, SIN VENTANA. Es lo único que se puede restar de un contrato. Bruto (lo que entró al
  -- banco) y neto (sin IVA, el comparable contra el contratado), los dos con el nombre puesto.
  sum(b.total)      filter (where b.es_cobrado)                                                   as cobrado_total,
  sum(b.monto_neto) filter (where b.es_cobrado)                                                   as cobrado_neto_total,

  case
    when coalesce(sum(b.total) filter (where b.fecha_emision >= current_date - 90), 0) > 0
    then round((coalesce(sum(b.total) filter (where b.es_deuda), 0)
                / sum(b.total) filter (where b.fecha_emision >= current_date - 90)) * 90, 1)
  end                                                                                            as dso,

  case
    when (coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= current_date - 90), 0)
          + coalesce(sum(b.total) filter (where b.es_vencido), 0)) > 0
    then round(100.0 * coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= current_date - 90), 0)
               / (coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= current_date - 90), 0)
                  + coalesce(sum(b.total) filter (where b.es_vencido), 0)), 1)
  end                                                                                            as efectividad_pct,

  round(avg(b.fecha_cobro - b.fecha_emision)
        filter (where b.es_cobrado and b.fecha_cobro >= current_date - 90
                  and b.fecha_emision is not null), 1)                                           as dias_cobro_promedio,

  coalesce((select sum(cc.reparo) from public.certificado_cliente cc
             where cc.cliente_id = b.cliente_id and cc.estado <> 'cobrado'), 0)                   as fondo_reparo
from base b
join public.clientes cl on cl.id = b.cliente_id
group by b.cliente_id, cl.nombre_comercial;

comment on view public.cliente_cuenta_corriente is
  'Cuenta corriente por cliente (pantalla 28). Fuente: public.cobranzas (la réplica VIVA) + '
  'certificado_cliente. Qué está cobrado lo decide public.es_cobrada() —el MISMO predicado que '
  'obra_cobranza— desde el 10/09/2026: antes decía estado = ''Cobrado'' y contaba como cobrada una '
  'fila con fecha de cobro futura. Sólo Pendiente y Facturado son deuda; Proyectado es previsión y '
  'queda afuera. facturado_90d y cobrado_90d son de VENTANA (90 días); cobrado_total y '
  'cobrado_neto_total son acumulados y son los únicos restables de un contrato. security_invoker: '
  'respeta la RLS de cobranzas (Administración/Dirección).';

grant select on public.cliente_cuenta_corriente to authenticated;
