#!/usr/bin/env node
// LA REGLA DE ORO 8, MEDIDA EN PESOS: ¿cuánta plata del archivo llega a los Cash Flow? — sólo lectura.
//
// *"los cash flows semanales y mensuales tienen q reflejar todos los datos del sheet"* (el dueño).
//
// Lo que ya había NO contestaba esa pregunta: `auditar-cuadre-cash-flow` compara las dos vistas entre
// sí (y su propia cabecera declara que no valida el número del que parten), y `cash-flow-cobertura`
// mide meses cubiertos y roles de pestaña, no pesos. Este auditor cuenta la plata.
//
// Recorre los dos eslabones que un peso tiene que pasar para verse en una celda —la fila tiene que
// producir un movimiento, y el movimiento tiene que caer en una ventana de la vista— y publica la
// plata que se cae en cada uno, con su pestaña, su fila y su monto. El criterio y sus límites viven en
// `lib/cobertura-archivo.mjs`.
//
// Salida 0 si no hay hueco, 1 si lo hay. LEE Y NADA MÁS: el token que se emite no alcanza para
// escribir aunque el código quisiera, mismo criterio que `auditar-cuadre-cash-flow.mjs`.
//
//   node orquestador/scripts/auditar-cobertura-cash-flow.mjs
//   node orquestador/scripts/auditar-cobertura-cash-flow.mjs --detalle   → una línea por fila con hueco

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { LIBRO } from '../lib/libro-sumas.mjs'
import { columnasDeCompras } from '../lib/libro-extractores-compras.mjs'
import { columnasObligatorias } from '../lib/compras-columnas.mjs'
import { endososDeCartera } from '../lib/libro-endosos.mjs'
import { ref as refPestana } from '../lib/partir-pestana.mjs'
import { letra } from '../lib/cash-flow-matriz.mjs'
import { totalesDeVista } from '../lib/cash-flow-cuadre.mjs'
import { grillaSemanal } from '../lib/cash-flow-semanas.mjs'
import { grillaMeses } from '../lib/cash-flow-meses.mjs'
import { RUBROS_EGRESO } from '../lib/cash-flow-rubros.mjs'
import {
  CENSADAS, EXCLUSIONES_COBRANZAS, EXCLUSIONES_COMPRAS, SIN_CENSO_DE_FILA,
  censoDeCobranzas, censoDeCompras, coberturaDeFuente, cuadreContraElLibro, filasCubiertas,
  fueraDeLaVentana, marcarEndosos, medidasDesdeElLibro, origenesSinDeclarar, resumenDeCobertura,
  ventanaDelEjercicio,
} from '../lib/cobertura-archivo.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const AÑO = Number(process.env.ORQ_CF_ANIO || new Date().getFullYear())
const SCOPES_LECTURA = ['https://www.googleapis.com/auth/spreadsheets.readonly']
const DETALLE = process.argv.includes('--detalle')

const peso = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
const fecha = (s) => (typeof s === 'number'
  ? new Date(Date.UTC(1899, 11, 30) + s * 86400000).toISOString().slice(0, 10).split('-').reverse().join('/')
  : String(s))

/** Los rótulos de Cobranzas que este control necesita. Son los MISMOS que resuelve `deCobranzas`. */
const NOMBRES_COBRANZAS = {
  cliente: 'Obra / Cliente', estado: 'Estado', importe: 'TOTAL a cobrar (neto de retenciones)',
  fechaEsperada: 'Fecha cobro',
}

/** `_MOVIMIENTOS` tal como está publicado → objetos. Las columnas salen de `LIBRO`, no de índices. */
function movimientosPublicados(filas = []) {
  const i = (letra) => letra.charCodeAt(0) - 65
  const c = LIBRO.col
  return filas.slice(LIBRO.fila0 - 1).map((f) => ({
    fecha: f?.[i(c.fecha)], signo: f?.[i(c.signo)], importe: f?.[i(c.importe)],
    rubro: f?.[i(c.rubro)], estado: f?.[i(c.estado)],
    origen: f?.[i(c.origen)], fila: f?.[i(c.fila)],
  })).filter((m) => m.importe !== undefined && m.importe !== '')
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: SCOPES_LECTURA })
  // UNFORMATTED_VALUE en las cuatro: una fecha tiene que llegar como serial y un importe como número.
  // Los rangos son los MISMOS que lee el generador del libro; leer menos deja columnas sin resolver.
  const [libro, compras, cobranzas, cartera] = await Promise.all([
    google.readSheetValues(ID, `${LIBRO.pestana}!A1:Q`, { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, 'Compras!A1:AN', { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, 'Cobranzas!A1:BB', { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, '_CHEQUES_RAW!A1:Z', { render: 'UNFORMATTED_VALUE' }),
  ])
  const movs = movimientosPublicados(libro ?? [])
  if (!movs.length) throw new Error(`${LIBRO.pestana} vino vacía: sin libro no se puede medir la cobertura, y `
    + 'declarar "0 huecos" sobre cero movimientos sería un verde falso.')

  const cCompras = columnasDeCompras(compras ?? [])
  const cCobranzas = columnasObligatorias((cobranzas ?? [])[3] ?? [], NOMBRES_COBRANZAS, 'Cobranzas')
  const endosados = endososDeCartera(cartera ?? []).map((e) => e.importe)

  const cubiertasCobranzas = filasCubiertas(movs, 'Cobranzas')
  const fuentes = [
    coberturaDeFuente({
      pestana: 'Compras',
      renglones: censoDeCompras(compras ?? [], cCompras),
      cubiertas: filasCubiertas(movs, 'Compras'),
      exclusiones: EXCLUSIONES_COMPRAS,
    }),
    coberturaDeFuente({
      pestana: 'Cobranzas',
      renglones: marcarEndosos(censoDeCobranzas(cobranzas ?? [], cCobranzas), endosados, cubiertasCobranzas),
      cubiertas: cubiertasCobranzas,
      exclusiones: EXCLUSIONES_COBRANZAS,
    }),
  ]
  // La lista declarada MANDA sobre lo que este script arma: agregar una fuente al censo sin nombrarla
  // en `CENSADAS` dejaría `SIN_CENSO_DE_FILA` diciendo una cosa y el informe midiendo otra.
  const armadas = fuentes.map((f) => f.pestana).join('|')
  if (armadas !== [...CENSADAS].join('|')) {
    throw new Error(`el censo arma "${armadas}" y CENSADAS declara "${[...CENSADAS].join('|')}": `
      + 'el inventario de fuentes y lo que se mide dejaron de ser lo mismo')
  }
  const ventana = ventanaDelEjercicio(AÑO)
  const fuera = fueraDeLaVentana(movs, ventana)
  const desvios = await eslabon3({ google, movs, ventana })
  const r = resumenDeCobertura({ fuentes, fuera, sinCenso: SIN_CENSO_DE_FILA, desvios })

  informe(r, movs)
  const sinDeclarar = origenesSinDeclarar(movs)
  for (const o of sinDeclarar) {
    console.log(`⛔ el libro trae plata de "${o}" y este control no la censa ni la declara sin censo: `
      + 'la regla 8 dejó de estar medida para esa fuente')
  }
  if (!r.ok || sinDeclarar.length) process.exitCode = 1
}

/**
 * ESLABÓN 3 · lo que las dos vistas PUBLICAN contra el Libro sumado por otro camino.
 *
 * Se leen las celdas reales del TOTAL de cada medida —no se confía en la fórmula— y se comparan contra
 * `medidasDesdeElLibro`, que recorre los movimientos en JavaScript. Dos caminos hacia el mismo número:
 * si difieren, la vista dejó de decir lo que el Libro dice.
 */
async function eslabon3({ google, movs, ventana }) {
  const propios = medidasDesdeElLibro(movs, ventana, RUBROS_EGRESO)
  const metas = [
    grillaSemanal({ hoy: new Date(), anio: AÑO, refs: {} }).meta,
    grillaMeses({ anio: AÑO, refs: {}, hoy: new Date() }).meta,
  ]
  const fuera = []
  for (const meta of metas) {
    const fp = meta.footprint
    const v = await google.readSheetValues(ID, `${refPestana(meta.pestana)}!A1:${letra(fp.cols - 1)}${fp.filas}`,
      { render: 'UNFORMATTED_VALUE' })
    const t = totalesDeVista(v ?? [], meta)
    for (const p of t.problemas) fuera.push({ pestana: meta.pestana, medida: '(no se pudo leer)', publicado: 0, libro: 0, delta: 0, nota: p })
    fuera.push(...cuadreContraElLibro(meta.pestana, t.totales, propios))
  }
  return fuera.filter((f) => f.nota || Math.abs(f.delta) > 1)
}

function informe(r, movs) {
  console.log(`REGLA 8 · ejercicio ${AÑO} · ${movs.length} movimientos publicados en ${LIBRO.pestana}\n`)
  console.log('ESLABÓN 1 · la fila de origen ¿produjo movimiento?')
  for (const f of r.fuentes) {
    console.log(`  ${f.pestana}: censado ${peso(f.censado)} · llega al libro ${peso(f.cubierto)}`
      + ` · excluido con motivo ${peso(f.declarado)} · HUECO ${peso(f.hueco)}`)
    for (const d of f.porMotivoDeclarado) console.log(`      ○ ${d.clave} — ${d.n} fila(s), ${peso(d.monto)}`)
    for (const h of f.porMotivoHueco) {
      console.log(`      ▲ ${h.clave} — ${h.n} fila(s), ${peso(h.monto)} · filas ${h.filas.join(', ')}`)
    }
    if (DETALLE) for (const h of f.huecos) console.log(`         f${h.fila} ${peso(h.monto)} ${h.proveedor ?? h.cliente ?? ''}`)
  }
  for (const s of r.sinCenso) console.log(`  ${s.pestana}: sin censo de fila — ${s.porque}`)

  console.log('\nESLABÓN 2 · el movimiento ¿cae en alguna columna de las dos vistas?')
  if (!r.fuera.n) console.log(`  ✓ los ${movs.length} movimientos caen dentro del ejercicio`)
  for (const g of r.fuera.porOrigen) {
    console.log(`  ▲ ${g.clave} — ${g.n} movimiento(s), ${peso(g.monto)}`)
  }
  if (DETALLE) for (const d of r.fuera.detalle) console.log(`      ${d.origen} ${d.fila} ${fecha(d.fecha)} ${peso(d.importe)} ${d.rubro}`)

  console.log('\nESLABÓN 3 · lo que las vistas publican ¿es lo que el libro dice?')
  if (!r.desvios.length) console.log('  ✓ las cuatro medidas de las dos vistas coinciden al peso con el libro sumado aparte')
  for (const d of r.desvios) {
    console.log(d.nota ? `  ⛔ ${d.pestana}: ${d.nota}`
      : `  ✗ ${d.pestana} · ${d.medida}: publica ${peso(d.publicado)} y el libro dice ${peso(d.libro)} (${peso(d.delta)})`)
  }

  console.log(`\nTOTAL · plata censada del archivo ${peso(r.censado)}`)
  console.log(`        NO llega a ninguna celda de ningún Cash Flow: ${peso(r.noLlegaALaVista)}`)
  console.log(`          · ${peso(r.hueco)} por filas de origen que no producen movimiento`)
  console.log(`          · ${peso(r.fueraDeVista)} por movimientos fuera del ejercicio`)
  if (r.ok) console.log('\n✓ toda la plata censada llega a las dos vistas (ver los límites declarados en lib/cobertura-archivo.mjs)')
  else console.log('\n⛔ hay plata del archivo que ningún Cash Flow muestra.')
}

main().catch((e) => { console.error(`⛔ ${e.message}`); process.exitCode = 1 })
