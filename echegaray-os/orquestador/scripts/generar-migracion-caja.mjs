#!/usr/bin/env node
// GENERA LA MIGRACIÓN QUE LLEVA LA REGLA DE CAJA AL NÚCLEO POSTGRES.
//
// POR QUÉ SE GENERA Y NO SE ESCRIBE A MANO. La regla que dice qué es cada gasto ya está escrita dos
// veces —una para JavaScript y otra para la fórmula es-AR del Sheet— y las dos salen del MISMO array
// de rubro-caja.mjs, pegadas a propósito para que no puedan desincronizarse. La tercera cara, SQL,
// tiene que salir del mismo lugar por la misma razón: un CASE tipeado a mano en una migración se
// desincroniza el día que alguien agrega un rubro, y nadie se entera hasta que los números no
// cierran. Hay un test que compara el archivo generado contra el generador.
//
// QUÉ PROBLEMA RESUELVE, MEDIDO. El calendario de caja de la web mostraba $4.121.169 de egresos
// futuros contra $352M+ en la planilla. No era un bug de la web: la definición de la proyección
// vivía sólo en las fórmulas del Sheet, así que la web y el chat miraban un universo distinto.
//
//   node orquestador/scripts/generar-migracion-caja.mjs

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { sqlRubroDeCaja } from '../lib/rubro-caja.mjs'
import { RUBROS_SIN_PROYECCION, MIN_MESES } from '../lib/cash-flow-lineas.mjs'

// (renombrada 160000→173000 el 22/08/2026: dependía de jornal_quincena, que nace en 170000 — el
// hardening de reproducibilidad ordenó la cadena por su dependencia real)
export const DESTINO = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations/20260720173000_rubro_caja_nucleo.sql')

/** NÚCLEO PURO: el texto completo de la migración. Se genera para poder testearlo sin tocar disco. */
/** La línea del cash flow que NO sale de Compras porque mide lo que a Compras le falta. */
const LINEA_INSTRUMENTOS = 'Cheques y tarjeta sin factura cargada'

export function migracion() {
  const sinProy = RUBROS_SIN_PROYECCION.map((r) => `'${r.replace(/'/g, "''")}'`).join(', ')
  const caso = sqlRubroDeCaja().split('\n').map((l) => `  ${l}`).join('\n')

  return `-- LA REGLA DE CAJA, EN EL NÚCLEO.
--
-- ⚠ GENERADO por orquestador/scripts/generar-migracion-caja.mjs — NO editar a mano.
-- Hay un test (orquestador/lib/migracion-caja.test.mjs) que compara este archivo contra el
-- generador: si alguien lo edita acá, o agrega un rubro y no regenera, el test rompe.
--
-- POR QUÉ EXISTE (20/07). La regla que dice qué es cada gasto y cuánto se va a gastar vivía SOLO en
-- las fórmulas del Sheet. Medido: el calendario de caja de la web mostraba $4.121.169 de egresos
-- futuros contra $352M+ en la planilla. No era un bug de la web — era que la definición no estaba
-- en el núcleo, así que la web y el chat miraban un universo distinto al de la planilla.

create or replace function public.rubro_caja(
  proveedor text, unidad_negocio text, obra_texto text, concepto text
) returns text language sql immutable as $fn$
  select
${caso}
$fn$;
comment on function public.rubro_caja is
  'A qué línea del cash flow pertenece un gasto. Generado desde orquestador/lib/rubro-caja.mjs: es la misma regla que la columna AC de Compras, no una copia.';

-- Se dropean en orden inverso a la dependencia: proyeccion_egreso y calendario_caja leen de
-- egreso_rubro_mes, y \`create or replace view\` no admite insertar una columna en el medio. Sin
-- cascade a propósito: si mañana algo más depende de estas vistas, el drop tiene que fallar y
-- avisar, no llevárselo puesto.
drop view if exists public.calendario_caja;
drop view if exists public.proyeccion_egreso;
drop view if exists public.egreso_rubro_mes;

-- El egreso por rubro y mes. La fecha es la de PAGO: una factura de enero pagada en junio es caja de
-- junio, y para un flujo de fondos esa distinción no es un detalle, es el dato.
--
-- Y SI NO HAY FECHA DE PAGO, EL GASTO NO CAE EN NINGÚN MES. Antes se usaba la fecha de la factura
-- como reemplazo, y eso es adivinar: son 6 gastos por $2.088.176 de los que se sabe el monto pero no
-- CUÁNDO salen. Meterlos en el mes de la factura hacía que el núcleo mostrara $2.088.225 de más
-- repartidos entre abril y julio, y hacía desaparecer el problema en vez de mostrarlo. El Sheet los
-- deja fuera de todo mes y los reporta en su control; acá se hace lo mismo, y quedan visibles con
-- \`select * from costos_obra where fecha_pago is null\`.
--
-- TRES FUENTES, PORQUE COMPRAS NO ALCANZA. Contrastando contra el Sheet, el núcleo daba $60.402.163
-- menos en el año, y $53.637.487 salían de acá:
--   · los JORNALES no se leen de Compras. Ahí están tipeados a mano como estimación ($144.848.022);
--     el dato real está en la planilla de quincenas ($185.505.626). Usar Compras subestimaba el
--     egreso más grande de la empresa en $40,7M. Es la misma decisión que ya tomaba el Sheet.
--   · los CHEQUES Y LA TARJETA SIN FACTURA ($12.979.883) son pagos que salen del banco y cuya
--     factura nadie cargó: no están en Compras y por definición no pueden estar. Sólo entran los
--     que tienen número de comprobante y ese número NO aparece en Compras — si apareciera, ese pago
--     ya viaja por el rubro de su factura y sumarlo sería duplicar.
create or replace view public.egreso_rubro_mes as
  select rubro, mes, clase, sum(monto) as monto, sum(filas)::int as filas
    from (
      select public.rubro_caja(o.proveedor, o.unidad_negocio, o.obra_texto, o.concepto) as rubro,
             date_trunc('month', o.fecha_pago)::date                                     as mes,
             'real'::text                                                               as clase,
             o.total                                                                    as monto,
             1                                                                          as filas
        from public.costos_obra o
       where o.fecha_pago is not null
         and o.origen = 'compras_sheet'
         and public.rubro_caja(o.proveedor, o.unidad_negocio, o.obra_texto, o.concepto)
             <> 'Nómina · Jornales de obra'
      union all
      -- La quincena es caja del día en que CIERRA: se paga al terminarla.
      select 'Nómina · Jornales de obra', date_trunc('month', j.hasta)::date, j.clase, j.total, 1
        from public.jornal_quincena j
      union all
      select '${LINEA_INSTRUMENTOS}', date_trunc('month', i.fecha_pago)::date, 'real', i.monto, 1
        from public.instrumento_pago i
       where not i.factura_en_compras
         and i.comprobante_norm is not null
         and i.fecha_pago is not null
    ) t
   group by 1, 2, 3;
comment on view public.egreso_rubro_mes is
  'Egresos por rubro de caja y mes de pago, desde las tres fuentes que usa el cash flow: Compras, la planilla de quincenas y los instrumentos sin factura. clase distingue lo liquidado de lo proyectado.';

-- LA PROYECCIÓN. Misma regla que el Sheet:
--   · el promedio de los ÚLTIMOS 3 MESES CERRADOS, no el del año. Los rubros de esta empresa
--     crecen: las cargas sociales pasaron de $3,8M en enero a $11,9M en junio. El promedio de 12
--     meses las proyecta en $5.674.843 y el de 3 meses en $7.700.251 — la diferencia es real y el
--     de 12 meses subestima la caja que hace falta justo en los meses que vienen. Es además la
--     regla que ya usa el Cash Flow del Sheet, y tienen que dar lo mismo o hay dos verdades;
--   · el GUARD cuenta los meses con gasto sobre el AÑO ENTERO, no sobre la ventana de 3: un rubro
--     que apareció en 4 meses salteados no es una tendencia aunque los últimos 3 tengan plata;
--   · GUARD DE ${MIN_MESES} MESES — un rubro que apareció en menos de ${MIN_MESES} meses no es un ritmo, es un pago
--     suelto. Sin este guard el SAC (se paga en junio y en diciembre) se proyectaba todos los meses:
--     $18.777.459 de aguinaldo inventado contra $7.368.710 reales;
--   · × inflación, con el factor NORMALIZADO al mes actual. public.factor_ajuste acumula desde el
--     primer período guardado y el Sheet usa base = mes de hoy = 1. Dividir por el factor del mes
--     corriente los deja hablando del mismo número.
create or replace view public.proyeccion_egreso as
with cerrado as (
  select rubro, mes, monto
    from public.egreso_rubro_mes
   where mes < date_trunc('month', current_date)::date
     and clase = 'real'
     and monto <> 0
), ritmo as (
  select rubro,
         sum(monto) filter (
           where mes >= date_trunc('month', current_date)::date - interval '3 months'
         ) / 3                       as promedio,
         count(*)::int               as meses_con_gasto
    from cerrado
   group by 1
), futuro as (
  select generate_series(
           date_trunc('month', current_date)::date + interval '1 month',
           date_trunc('year', current_date)::date + interval '1 year' - interval '1 month',
           interval '1 month')::date as mes
), base as (
  select coalesce(max(factor_acumulado), 1) as f
    from public.factor_ajuste
   where indice = 'ipc' and periodo = to_char(current_date, 'YYYY-MM')
)
select r.rubro,
       f.mes,
       -- INCREMENTAL: lo que FALTA para llegar al ritmo, no el ritmo entero. Si el mes ya tiene
       -- $6,5M cargados y el ritmo dice $10,9M, lo que se proyecta son $4,4M — no $10,9M encima de
       -- los $6,5M. Sumar los dos daba $17,4M y el cash flow del Sheet muestra $10,9M: es la
       -- diferencia entre "el mes va a costar esto" y "el mes va a costar esto MÁS lo que ya sé".
       -- Medido antes del arreglo: cargas sociales ago-dic daba $10.324.074 de más.
       greatest(0, round(r.promedio * coalesce(fa.factor_acumulado, b.f) / nullif(b.f, 0))
                   - coalesce(yr.real_mes, 0))::numeric                                 as monto,
       r.meses_con_gasto,
       round(r.promedio)::numeric                                                       as promedio_mensual,
       round(coalesce(fa.factor_acumulado, b.f) / nullif(b.f, 0), 4)                    as factor
  from ritmo r
 cross join futuro f
 cross join base b
  left join public.factor_ajuste fa
         on fa.indice = 'ipc' and fa.periodo = to_char(f.mes, 'YYYY-MM')
  left join (select rubro, mes, sum(monto) as real_mes
               from public.egreso_rubro_mes where clase = 'real' group by 1, 2) yr
         on yr.rubro = r.rubro and yr.mes = f.mes
 where r.meses_con_gasto >= ${MIN_MESES}
   -- Estos rubros ya tienen sus cuotas futuras CARGADAS (quincenas de jornales, planes de pago,
   -- prendario). Proyectarlos encima inventaría plata que nadie va a pagar: un plan de pago tiene un
   -- número de cuotas fijo, no un ritmo.
   and r.rubro not in (${sinProy})
   -- Un mes cuyo real ya supera el ritmo no proyecta nada: greatest() lo deja en 0 y la fila se
   -- descarta acá para no ensuciar el calendario con proyecciones de $0.
   and coalesce(yr.real_mes, 0) < round(r.promedio * coalesce(fa.factor_acumulado, b.f) / nullif(b.f, 0));
comment on view public.proyeccion_egreso is
  'Egresos ESPERADOS por rubro y mes futuro. SUPUESTO declarado, no dato: promedio de los últimos 3 meses cerrados (con al menos ${MIN_MESES} meses con gasto en el año) ajustado por IPC. Misma regla que el Cash Flow del Sheet.';

-- El calendario que lee la web, ahora con el futuro adentro y DICIENDO que es proyección.
--
-- La columna clase separa el hecho de la estimación: sin ella un promedio se lee como un
-- comprobante, y alguien decide sobre plata que nadie prometió.
create or replace view public.calendario_caja as
  select 'cobro'::text                                  as tipo,
         'real'::text                                   as clase,
         coalesce(c.fecha_cobro, c.fecha_vencimiento)   as fecha,
         c.cliente_texto                                as contraparte,
         c.concepto,
         c.total                                        as monto,
         (c.fecha_cobro is not null)                    as confirmado
    from public.cobranza c
   where coalesce(c.fecha_cobro, c.fecha_vencimiento) is not null
  union all
  select 'pago', 'real',
         o.fecha_pago,
         o.proveedor,
         coalesce(nullif(o.concepto, ''), o.obra_texto),
         -o.total,
         true
    from public.costos_obra o
   where o.fecha_pago is not null
     and public.rubro_caja(o.proveedor, o.unidad_negocio, o.obra_texto, o.concepto)
         <> 'Nómina · Jornales de obra'
  union all
  select 'pago', j.clase, j.hasta,
         'Jornales de obra',
         'Quincena ' || to_char(j.desde, 'DD/MM') || '–' || to_char(j.hasta, 'DD/MM')
           || coalesce(' · ' || j.personas || ' personas', ''),
         -j.total,
         (j.clase = 'real')
    from public.jornal_quincena j
  union all
  -- Pagos reales que ninguna factura respalda todavía. No pueden duplicar: si el comprobante
  -- estuviera en Compras, esta fila no existiría.
  select 'pago', 'real', i.fecha_pago,
         i.proveedor,
         (case i.tipo when 'cheque' then 'Cheque' else 'Tarjeta' end)
           || ' ' || coalesce(i.comprobante, '') || ' — falta cargar la factura en Compras',
         -i.monto,
         true
    from public.instrumento_pago i
   where not i.factura_en_compras
     and i.comprobante_norm is not null
     and i.fecha_pago is not null
  union all
  -- Fechadas el 15: repartirlas por día sería inventar precisión sobre CUÁNDO, cuando lo único que
  -- se sabe es CUÁNTO en el mes. El 15 no distorsiona el mes y no amontona todo en el día 1.
  select 'pago', 'proyeccion',
         (p.mes + interval '14 days')::date,
         p.rubro,
         'Proyección · ritmo de ' || p.meses_con_gasto || ' meses cerrados × inflación ' || p.factor,
         -p.monto,
         false
    from public.proyeccion_egreso p;
comment on view public.calendario_caja is
  'Movimientos de caja pasados y futuros. clase = real (hay un comprobante) o proyeccion (es un supuesto). Nunca mostrar las dos con el mismo color.';
`
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  writeFileSync(DESTINO, migracion())
  console.log(`escrito ${DESTINO}`)
  console.log(`  rubros sin proyección: ${RUBROS_SIN_PROYECCION.join(' · ')}`)
}
