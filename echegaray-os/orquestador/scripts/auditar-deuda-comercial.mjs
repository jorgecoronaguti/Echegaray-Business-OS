#!/usr/bin/env node
/**
 * ¿DICEN LO MISMO `Proveedores` Y LA TARJETA DE DEUDA DE CAJA? Y SI NO, ¿POR QUÉ EXACTAMENTE?
 *
 * POR QUÉ EXISTE (17/08/2026). `auditar-conexion-flujo.mjs` reporta `Proveedores` y `Materiales` como
 * un circuito cerrado: ningún paso del pipeline las escribe y sólo se leen entre ellas. La deuda
 * comercial que `Proveedores` calcula desde `Compras` no llega a CAJA ni a los dos Cash Flow, y la
 * tarjeta "DEUDA ATRASADA Y DEL MES" la vuelve a armar desde `_MOVIMIENTOS`. Dos fuentes del mismo
 * origen, y nadie medía la diferencia: una podía decir $12,5M y la otra publicar otra cosa sin que
 * nada gritara.
 *
 * QUÉ HACE: pone las dos sobre la MISMA ventana (hasta fin de mes, excluido — el mismo `hasta` de la
 * tarjeta) y descompone la diferencia fila por fila, cada peso con su motivo. El criterio y la
 * decisión de cuál es la fuente primaria viven en `lib/deuda-comercial-conciliacion.mjs`.
 *
 * SÓLO LEE. El token que pide es `spreadsheets.readonly`: no alcanza para escribir aunque el código
 * quisiera. No hay `--aplicar` y no puede haberlo — una escritura de `Proveedores` desde un proceso
 * automático ya borró la pestaña entera una vez.
 *
 *   node orquestador/scripts/auditar-deuda-comercial.mjs [--json] [--hasta AAAA-MM-DD]
 *
 * SALE CON 1 si hay un motivo marcado como DEFECTO, si la descomposición deja residuo, o si la
 * aritmética de este control no reproduce el `Proveedores!B11` que el dueño lee en la pantalla.
 */

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { conciliar } from '../lib/deuda-comercial-conciliacion.mjs'
import { serialDe, isoDeSerial } from '../lib/libro-extractores-fechas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
/** LECTURA Y NADA MÁS, TAMBIÉN EN EL PERMISO. Mismo criterio que `auditar-conexion-flujo.mjs`. */
const SCOPES_LECTURA = ['https://www.googleapis.com/auth/spreadsheets.readonly']
/** La celda de `Proveedores` que publica la deuda comercial: `TOTAL` del aging (`=SUM($B5:$B10)`). */
const CELDA_TOTAL = 'Proveedores!B11'
const RANGOS = ['Compras!A1:AN3000', '_MOVIMIENTOS!A1:Q6000', `${CELDA_TOTAL}:D11`]

const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')
const raya = (n = 100) => '─'.repeat(n)
const fecha = (s) => (s > 0 ? isoDeSerial(s).split('-').reverse().join('/') : '—')

/**
 * NÚCLEO PURO: el `hasta` de la ventana — el 1° del mes siguiente, EXCLUIDO.
 *
 * Es la traducción exacta de `EOMONTH(TODAY();0)+1`, el `hasta` que usa la tarjeta. Si acá se pusiera
 * "hoy + 30 días" el control compararía dos ventanas distintas y gritaría todos los días por una
 * razón que no es un error — que es la forma más común de que un control deje de leerse.
 *
 * @param {Date} hoy
 * @returns {number} serial de Sheets
 */
export function finDeMes(hoy = new Date()) {
  const a = hoy.getFullYear()
  const m = hoy.getMonth() + 1
  return m === 12 ? serialDe(a + 1, 1, 1) : serialDe(a, m + 1, 1)
}

/** El `--hasta AAAA-MM-DD` de la línea de comandos, si vino. Devuelve `null` cuando no. */
export function hastaDeArgv(argv = []) {
  const i = argv.indexOf('--hasta')
  if (i < 0) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(argv[i + 1] ?? ''))
  if (!m) throw new Error('--hasta espera una fecha AAAA-MM-DD')
  return serialDe(Number(m[1]), Number(m[2]), Number(m[3]))
}

function informar(r) {
  console.log(`\n${raya()}`)
  console.log(`DEUDA COMERCIAL — DOS FUENTES, UNA VENTANA (hasta el ${fecha(r.hasta)}, excluido)`)
  console.log(raya())
  console.log(`  Proveedores (fuente primaria)   ${pesos(r.proveedores.monto).padStart(16)} · ${r.proveedores.n} facturas`)
  console.log(`  componente comercial del libro  ${pesos(r.libro.monto).padStart(16)} · ${r.libro.n} filas`)
  console.log(`  diferencia NETA                 ${pesos(r.neto).padStart(16)}`)
  // EL BRUTO ES EL NÚMERO QUE DECIDE SI HAY QUE MIRAR. El neto puede dar chico porque dos errores de
  // signo contrario se cancelan: medido el 17/08, el neto era $1.180.982 sobre un desacuerdo real de
  // $18.300.332, y las dos listas compartían 3 filas de 27.
  console.log(`  diferencia BRUTA (fila a fila)  ${pesos(r.bruto).padStart(16)} · ${r.enAmbas} filas coinciden`)
  if (r.fiel === false) {
    console.log(`\n  ✗ NO FIEL: ${CELDA_TOTAL} publica ${pesos(r.publicado)} y esta aritmética da `
      + `${pesos(r.proveedoresTotal.monto)}. Mientras no coincidan, lo que este control mide NO es lo `
      + 'que la pestaña muestra y su diferencia no vale.')
  } else if (r.fiel === true) {
    console.log(`\n  ✓ fiel: reproduce ${CELDA_TOTAL} = ${pesos(r.publicado)} al peso`)
  }

  for (const m of r.motivos) {
    console.log(`\n${m.defecto ? '✗' : '·'} ${m.clave}   ${pesos(m.monto)} · ${m.filas.length} filas`)
    console.log(`  ${m.glosa}`)
    for (const f of m.filas.slice(0, 30)) {
      console.log(`   f${String(f.fila).padEnd(5)} ${f.proveedor.slice(0, 26).padEnd(27)}`
        + `${pesos(f.dif).padStart(14)}   Compras:${f.estado.padEnd(10)} libro:${f.estadoLibro.padEnd(14)}`
        + `vence ${fecha(f.fechaPago)}`)
    }
    if (m.filas.length > 30) console.log(`   … y ${m.filas.length - 30} más (usar --json)`)
  }
  if (Math.abs(r.residuo) > 1) {
    console.log(`\n✗ RESIDUO ${pesos(r.residuo)}: hay diferencia que los motivos NO explican. `
      + 'La descomposición se saltea filas y el informe de arriba no cierra.')
  }
  console.log(`\n${raya()}`)
  console.log(r.hayDefecto
    ? '✗ HAY DEFECTO. Los motivos marcados con ✗ son plata que una fuente ve y la otra pierde.'
    : '✓ las diferencias que quedan son de criterio, no de error.')
}

async function main() {
  const hasta = hastaDeArgv(process.argv) ?? finDeMes()
  const google = makeGoogleClient({ config: loadConfig(), scopes: SCOPES_LECTURA })
  const qs = RANGOS.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
  const j = await google.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ID)}`
    + `/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`)
  const [compras, movimientos, total] = (j.valueRanges ?? []).map((v) => v.values ?? [])
  const publicado = typeof total?.[0]?.[0] === 'number' ? total[0][0] : null

  const r = conciliar({ compras, movimientos, hasta, publicado })
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1))
  else informar(r)
  // El código de salida lo decide el resultado, no el hecho de haber corrido.
  process.exitCode = r.hayDefecto || r.fiel === false ? 1 : 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e?.stack || String(e)); process.exitCode = 1 })
}
