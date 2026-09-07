#!/usr/bin/env node
// DEDUCE EL RUBRO DE CADA PROVEEDOR DE LO QUE VENDIÓ, Y LO ESCRIBE MARCADO COMO DEDUCIDO.
//
//   node orquestador/scripts/deducir-rubro-proveedores.mjs            # ensayo: muestra y no escribe
//   node orquestador/scripts/deducir-rubro-proveedores.mjs --aplicar  # escribe `rubro_deducido`
//
// ═══ ESTE SCRIPT NO PUEDE PISAR UNA CORRECCIÓN, Y NO PORQUE SE ACUERDE ═══
//
// Sólo escribe `rubro_deducido`. `rubro` —lo que una persona declaró desde la ficha— es otra
// columna, y este archivo no la nombra en ningún `update`. La protección es estructural: no depende
// de un `where rubro is null` que alguien pueda borrar en una edición futura.
//
// ═══ EL CRUCE ES POR CUIT, Y POR NOMBRE SÓLO CUANDO NO HAY CUIT ═══
//
// Lo que identifica a un proveedor es el CUIT: «Corralón Progreso», «CORRALON PROGRESO» y «Corralon
// Progreso SRL» son tres textos y un proveedor. La pestaña lo escribe con guiones (`23-36911157-4`)
// y la tabla sin ellos, así que se normaliza a dígitos de los dos lados — comparar los textos crudos
// devuelve CERO filas y el script habría dicho «ningún proveedor tiene compras» sin un solo error.
//
// Los 14 proveedores sin CUIT cargado se cruzan por nombre normalizado, que es más débil y se
// declara: si dos proveedores comparten nombre, sus compras se mezclan. La salida marca con `~` las
// deducciones que salieron de un cruce por nombre para que se puedan revisar primero.
//
// ═══ LAS ANULADAS NO CUENTAN ═══
//
// Una compra anulada existe en la pestaña para que la cuenta cierre contra el Sheet, pero no es un
// gasto: dejarla adentro haría que un proveedor al que se le anuló todo siguiera teniendo rubro.

import process from 'node:process'
import { getPool, query } from '../lib/db.mjs'
import { agruparPorProveedor, deducirRubro } from '../lib/rubro-proveedor.mjs'

const APLICAR = process.argv.includes('--aplicar')

/** Las compras de cada proveedor, con la familia de material que la pestaña ya tiene cargada. */
const SQL_COMPRAS = `
  with cs as (
    select regexp_replace(coalesce(cuit, ''), '[^0-9]', '', 'g') as dig,
           lower(btrim(proveedor))                               as nom,
           familia_material                                      as familia
      from public.compra_sheet
     where coalesce(anulada, false) = false
  ),
  p as (
    select id, nombre, regexp_replace(coalesce(cuit, ''), '[^0-9]', '', 'g') as dig
      from public.proveedores
     where coalesce(es_prueba, false) = false
  )
  select p.id, p.nombre, length(p.dig) = 11 as por_cuit, cs.familia,
         cs.dig is not null                as hubo
    from p
    left join cs
      on (length(p.dig) = 11 and cs.dig = p.dig)
      or (length(p.dig) <> 11 and cs.nom = lower(btrim(p.nombre)))`

async function main() {
  const { rows } = await query(SQL_COMPRAS)

  const decisiones = agruparPorProveedor(rows)
    .map((p) => ({ ...p, ...deducirRubro(p.compras) }))
    .sort((a, b) => b.compras.length - a.compras.length)

  for (const d of decisiones) {
    const marca = d.porCuit ? ' ' : '~'
    console.log(`${marca}${(d.rubro ?? '—').padEnd(19)} ${d.nombre.padEnd(38)} ${d.evidencia}`)
  }

  const conRubro = decisiones.filter((d) => d.rubro)
  console.log(`\n${conRubro.length} de ${decisiones.length} deducidos · ${decisiones.length - conRubro.length} quedan SIN RUBRO`)
  console.log(`~ = cruzado por nombre porque el proveedor no tiene CUIT cargado (${decisiones.filter((d) => !d.porCuit).length})`)

  if (!APLICAR) {
    console.log('\nENSAYO: no se escribió nada. Agregar --aplicar.')
    return
  }

  // SE ESCRIBE TAMBIÉN LO QUE NO SE PUDO DEDUCIR. Un proveedor que antes tenía rubro deducido y hoy
  // ya no lo alcanza —porque se le anuló una compra, o se le corrigió la familia— tiene que quedar
  // en null, no con la deducción vieja. Un `update` sólo de los que dedujeron dejaría rubros
  // fósiles que ya nada respalda, y ése es el modo de falla silencioso de todo caché.
  let escritos = 0
  for (const d of decisiones) {
    const r = await query(
      `update public.proveedores
          set rubro_deducido = $2, rubro_deducido_evidencia = $3, rubro_deducido_en = now()
        where id = $1
          and (rubro_deducido is distinct from $2 or rubro_deducido_evidencia is distinct from $3)`,
      [d.id, d.rubro, d.rubro ? d.evidencia : null],
    )
    escritos += r.rowCount
  }
  console.log(`\n✓ ${escritos} filas actualizadas. \`rubro\` (lo declarado) no se tocó.`)
}

await main()
await getPool().end()
