#!/usr/bin/env node
// PREVISUALIZAR «¿ALCANZA LA CAJA?» — EN FRÍO, SIN TOCAR NADA.
//
// POR QUÉ EXISTE (28/08/2026). El gráfico se dibuja con fórmulas y sólo se puede leer dentro de
// Sheets, pero correr el generador contra el archivo real para mirarlo está PROHIBIDO por regla
// permanente (ya borró trabajo tres veces). Esto no escribe, no usa red y no toca la base: recibe
// movimientos del libro y muestra, día por día, cuánto YA SALIÓ y cuánto FALTA PAGAR — que es
// exactamente la separación que el gráfico dibuja.
//
//   node orquestador/scripts/previsualizar-necesidad-diaria.mjs movimientos.json --saldo 12500000
//   node orquestador/scripts/previsualizar-necesidad-diaria.mjs pegado.tsv --desde 2026-08-28 --dias 10
//
// El TSV es el que sale de copiar `_MOVIMIENTOS` (columnas A..I: fecha, signo, importe, moneda,
// concepto, rubro, actividad, estado, instrumento). El JSON es una lista de objetos con esos campos.
//
// El reparto NO se calcula acá: lo hace lib/necesidad-diaria-vista.mjs sobre la misma constante que
// arma las fórmulas del anexo. Si esto y el gráfico discrepan, es un bug de una sola definición.

import { readFileSync } from 'node:fs'
import { necesidadPorDia, diagnostico, COLUMNAS_VISTA } from '../lib/necesidad-diaria-vista.mjs'

const args = process.argv.slice(2)
const opcion = (n, def) => { const i = args.indexOf(`--${n}`); return i < 0 ? def : args[i + 1] }
// El archivo es el único posicional: se descartan las banderas Y el valor que va detrás de cada una,
// o `--dias 10` dejaría "10" como nombre de archivo y el error sería "no existe el archivo 10".
const ARCHIVO = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))[0]
const HOY = new Date().toISOString().slice(0, 10)
const DESDE = opcion('desde', HOY)
const DIAS = Number(opcion('dias', 30))
const SALDO = Number(opcion('saldo', 0))

const $ = (n) => (Math.abs(n) < 0.005 ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`)

/** Una fila de `_MOVIMIENTOS` pegada como TSV. El orden de columnas es el del libro, sin adivinar. */
const deTsv = (texto) => texto.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
  const c = l.split('\t')
  const n = (v) => Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'))
  return { fecha: /^\d+$/.test(c[0]?.trim()) ? Number(c[0]) : c[0], signo: n(c[1]), importe: n(c[2]),
    concepto: c[4], rubro: c[5], estado: c[7], instrumento: c[8] }
}).filter((m) => m.signo === 1 || m.signo === -1)

function main() {
  if (!ARCHIVO) {
    console.error('Pasame los movimientos: previsualizar-necesidad-diaria.mjs <movimientos.json|.tsv> [--desde YYYY-MM-DD] [--dias 30] [--saldo N]')
    process.exitCode = 1
    return
  }
  const crudo = readFileSync(ARCHIVO, 'utf8')
  const movs = crudo.trimStart().startsWith('[') ? JSON.parse(crudo) : deTsv(crudo)
  const filas = diagnostico(necesidadPorDia(movs, { desde: DESDE, dias: DIAS, saldo: SALDO }),
    { saldo: SALDO, movs, desde: DESDE })

  console.log(`\n⟡ ¿Alcanza la caja? — ${movs.length} movimiento(s) · desde ${DESDE} · ${DIAS} días · saldo de partida ${$(SALDO)}\n`)
  const cab = ['Día', 'YA SALIÓ', 'FALTA PAGAR', ...COLUMNAS_VISTA.filter((c) => c.clave !== 'ejecutado').map((c) => c.rotulo), 'si cobra', 'si NO cobra']
  console.log(cab.map((t, i) => (i ? t.padStart(17) : t.padEnd(11))).join(''))
  for (const d of filas) {
    if (!d.yaSalio && !d.faltaPagar && !d.cambioDeVeredicto) continue // un día sin movimiento no dice nada
    const celdas = [$(d.yaSalio), $(d.faltaPagar),
      ...COLUMNAS_VISTA.filter((c) => c.clave !== 'ejecutado').map((c) => $(d.por[c.clave])),
      $(d.siCobra), $(d.siNoCobra)]
    console.log(d.fecha.padEnd(11) + celdas.map((t) => t.padStart(17)).join('') + (d.cambioDeVeredicto ? '  ⚠' : ''))
  }

  // ═══ LO QUE ESTE SCRIPT EXISTE PARA CONTESTAR ═══
  //
  // Si el piso viejo (que restaba también lo ya pagado) daba negativo y el nuevo no —o al revés—, el
  // arreglo movió un veredicto y hay que decirlo con los dos números, no con un adjetivo.
  const movidos = filas.filter((d) => d.cambioDeVeredicto)
  const corridos = filas.filter((d) => Math.round(d.pisoAntes) !== Math.round(d.siNoCobra))
  console.log(`\n${movidos.length ? '⚠' : '·'} ${movidos.length} día(s) cambian de veredicto al dejar de restar lo que ya salió`)
  for (const d of movidos) {
    console.log(`   ${d.fecha}: piso ${$(d.pisoAntes)} → ${$(d.siNoCobra)} (antes ${d.pisoAntes >= 0 ? 'alcanzaba' : 'NO alcanzaba'}, ahora ${d.siNoCobra >= 0 ? 'alcanza' : 'NO alcanza'})`)
  }
  // UN PISO QUE SE CORRIÓ SIN CAMBIAR DE SIGNO IGUAL ERA UNA MENTIRA: el veredicto seguía siendo el
  // mismo por casualidad, y el número con el que se decide cuánto pedir estaba mal por esa diferencia.
  if (corridos.length) {
    const peor = corridos.reduce((a, b) => (Math.abs(b.siNoCobra - b.pisoAntes) > Math.abs(a.siNoCobra - a.pisoAntes) ? b : a))
    console.log(`· el piso sube en ${corridos.length} día(s) por lo ya pagado que se restaba de más — el mayor, ${peor.fecha}: ${$(peor.pisoAntes)} → ${$(peor.siNoCobra)}`)
  }
  console.log('\nEsto NO prueba lo que dibuja el Sheet: prueba el reparto. La pestaña se mira cuando el dueño levante el freno.\n')
}

main()
