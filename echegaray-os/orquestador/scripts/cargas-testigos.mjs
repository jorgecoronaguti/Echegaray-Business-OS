#!/usr/bin/env node
// LOS TESTIGOS DE CADA OBLIGACIÓN DE CARGAS SOCIALES, UNO AL LADO DEL OTRO. SÓLO LECTURA.
//
// ═══ POR QUÉ EXISTE (17/08/2026) ═══
//
// Llegó un pedido con esta premisa: *"el F931 de julio salió publicado como deuda VENCIDA, pero la
// pestaña ya declaraba en su bloque «2 · PAGADO» que en ago-26 salieron $10.494.876 de caja"*. La
// premisa era falsa, y para verlo hubo que abrir Compras fila por fila: esos $10.494.876 los armaban
// una previsión redonda en estado «Proyectado» y una cuota de plan «Pendiente». Cero pagado.
//
// Esa medición no puede depender de que alguien la rehaga a mano cada vez. Acá está, repetible, con
// las tres fuentes puestas una al lado de la otra para la MISMA obligación:
//
//   · LA CADENA  — lo que la sección 4 de "Cargas Sociales" proyecta desde los jornales.
//   · LA PESTAÑA — lo que el bloque 2 dice que salió de la caja ese mes, DESGLOSADO en las filas de
//                  Compras que lo componen y con el estado de cada una. Un total no se puede auditar.
//   · EL BANCO   — los débitos de la naturaleza que corresponde, en la ventana del vencimiento.
//
// NO DECIDE NADA Y NO ESCRIBE NADA. No tiene `--aplicar` y no lo va a tener: su trabajo es que las
// contradicciones se puedan ver antes de que alguien las promedie. Cuando dos fuentes discrepan,
// imprime LAS DOS con su monto y su fecha — elegir es del que mira, y en este dominio suele ser del
// dueño (ver `lib/confirmaciones-del-dueno.mjs`).
//
//   node orquestador/scripts/cargas-testigos.mjs

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { columnasDeCompras, estaPagada } from '../lib/libro-extractores-compras.mjs'
import { debitosDelExtracto, corteDelExtracto } from '../lib/libro-respaldo-banco.mjs'
import { isoDeSerial } from '../lib/libro-extractores-fechas.mjs'
import {
  RUBRO_CARGAS, RUBRO_GREMIALES, RUBRO_PLANES, ROTULOS_CARGAS, mesDeSerial,
} from '../lib/libro-extractores-cargas.mjs'
import { naturalezaEsperada, HOLGURA_MENSUAL } from '../lib/libro-cruce-banco.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cargas Sociales'
// EL SCOPE ES DE LECTURA Y ES PARTE DEL CONTRATO. Con el scope de escritura, un error de tipeo en un
// rango bastaría para que este script pueda tocar el archivo; con éste, la API lo rechaza el servidor.
const SCOPES_LECTURA = ['https://www.googleapis.com/auth/spreadsheets.readonly']

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()
const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/**
 * LA FILA SE BUSCA POR SU RÓTULO, NUNCA POR SU NÚMERO. La pestaña se reordena cada vez que el
 * generador corre —el rediseño del 23/07 movió un bloque entero— y un número de fila cableado acá
 * seguiría devolviendo doce importes plausibles de las filas equivocadas, sin dar un solo error.
 */
const buscar = (filas, re, desde = 0) => filas.findIndex((f, i) => i >= desde && re.test(txt(f?.[0])))

/** Los doce meses de una fila de la grilla: columnas B..M (índices 1..12). */
const meses = (fila) => Array.from({ length: 12 }, (_, i) => num(fila?.[i + 1]))

/**
 * EL BLOQUE 2, DESGLOSADO EN LAS FILAS DE COMPRAS QUE LO COMPONEN.
 *
 * El total de la pestaña no prueba nada por sí solo: el defecto del 17/08 fue exactamente un total
 * bien sumado sobre filas que no correspondían. Lo que se imprime es la lista, con el estado de cada
 * fila, que es el dato que decide si esa plata salió.
 */
function filasDeCompras(compras, { rubros, mes }) {
  const c = columnasDeCompras(compras)
  const out = []
  for (let i = 3; i < compras.length; i++) {
    const f = compras[i] ?? []
    const rubro = txt(f[c.rubro])
    if (!rubros.includes(rubro)) continue
    const fecha = num(f[c.fechaCaja])
    if (fecha === null || mesDeSerial(fecha) !== mes) continue
    out.push({
      fila: i + 1,
      rubro,
      fecha,
      total: num(f[c.importe]) ?? 0,
      estado: txt(f[c.estado]),
      pagada: estaPagada(f[c.estado]),
      cliente: txt(f[c.cliente]),
      proveedor: txt(f[c.proveedor]),
    })
  }
  return out
}

/** Los débitos del extracto que PODRÍAN ser esta obligación: su naturaleza, en la ventana del venc. */
function debitosCandidatos(debitos, { rubro, contraparte, fecha }) {
  const nat = naturalezaEsperada({ rubro, contraparte })
  if (!nat) return { nat: null, hits: [] }
  return {
    nat,
    hits: debitos.filter((d) => d.naturaleza === nat && Math.abs(d.fecha - fecha) <= HOLGURA_MENSUAL),
  }
}

/** Una obligación impresa con sus tres testigos y las contradicciones que queden. */
function informar(o, { compras, debitos, corteBanco }) {
  console.log(`\n══ ${o.que} · devengado ${o.mesDevengado} · vence ${isoDeSerial(o.fecha)} `
    + `(mes de caja ${o.mesCaja}) ══`)
  console.log(`   CADENA   ${pesos(o.proyectado).padStart(16)}  ← sección 4 de «${PESTAÑA}»`)

  // UN VACÍO NO SE DIBUJA COMO CERO. El devengado de diciembre sale en enero del año siguiente y la
  // grilla del bloque 2 no tiene esa columna: la respuesta es "no puede opinar", no "$0 pagado".
  const dice = o.pestanaPagado
  const loQueDice = dice === null ? '—'.padStart(16) : pesos(dice).padStart(16)
  const nota = dice === null ? ' (fuera de la grilla del año: no puede opinar)' : ''
  console.log(`   PESTAÑA  ${loQueDice}  ← bloque 2, columna ${o.mesCaja}${nota}`)
  const filas = filasDeCompras(compras, { rubros: o.rubros, mes: o.mesCaja })
  if (!filas.length) console.log('            (ninguna fila de Compras de ese rubro cae en ese mes)')
  for (const f of filas) {
    const marca = f.pagada ? '✔ salió' : '✗ NO salió'
    console.log(`            Compras f${f.fila}  ${pesos(f.total).padStart(14)}  ${isoDeSerial(f.fecha)}  `
      + `«${f.estado}» ${marca}  [${f.cliente || f.proveedor}]`)
  }
  const salio = filas.filter((f) => f.pagada).reduce((a, f) => a + f.total, 0)
  if (dice !== null && Math.round(dice) !== Math.round(salio)) {
    console.log(`   ⚠ el cuadro publica ${pesos(dice)} y las filas MARCADAS suman ${pesos(salio)}: `
      + `${pesos(Math.abs(dice - salio))} de diferencia`)
  }

  const { nat, hits } = debitosCandidatos(debitos, o)
  if (!nat) console.log('   BANCO    — ningún movimiento del banco es la contraparte natural de este rubro')
  else if (!hits.length) console.log(`   BANCO    — sin débitos de ${nat} a ±${HOLGURA_MENSUAL} días del vencimiento`)
  else {
    for (const d of hits) {
      console.log(`   BANCO    ${pesos(d.importe).padStart(16)}  ${isoDeSerial(d.fecha)}  ${nat}  `
        + `(_BANCO_RAW f${d.fila})`)
    }
  }
  contradicciones({ o, salio, hits, corteBanco })
}

/** LO QUE NO CIERRA SE NOMBRA CON LOS DOS MONTOS Y LAS DOS FECHAS. No se elige ni se promedia. */
function contradicciones({ o, salio, hits, corteBanco }) {
  const dice = o.pestanaPagado ?? 0
  if (salio > 0 && hits.length) {
    const b = hits.reduce((a, d) => a + d.importe, 0)
    if (Math.round(b) !== Math.round(salio)) {
      console.log(`   ‼ CONTRADICCIÓN · la planilla marca ${pesos(salio)} salidos y el banco debitó `
        + `${pesos(b)} en la ventana. Son dos fuentes y dicen cosas distintas.`)
    }
  }
  if (dice > 0 && salio === 0) {
    console.log(`   ‼ CONTRADICCIÓN · el cuadro «¿cuánto salió efectivamente de la caja?» publica `
      + `${pesos(dice)} y ninguna fila de Compras está marcada Pagado.`)
  }
  if (salio === 0 && !hits.length && Number.isFinite(corteBanco) && o.fecha <= corteBanco) {
    console.log('   ▲ SIN TESTIGO · venció, ninguna fuente prueba que se pagó. Es deuda hasta que '
      + 'alguna lo pruebe — o hasta que el dueño lo confirme.')
  }
}

/** Las obligaciones que la cadena proyecta, leídas de la propia pestaña por sus rótulos. */
function obligacionesDeLaCadena(cs) {
  const fFechas = buscar(cs, new RegExp(ROTULOS_CARGAS.fechas.trim().slice(0, 20)))
  const fF931 = buscar(cs, /Subtotal F931/)
  const fGrem = buscar(cs, /Subtotal gremiales/)
  if (fFechas < 0 || fF931 < 0 || fGrem < 0) {
    throw new Error('no encontré las filas de la sección 4 por su rótulo: la pestaña cambió de forma')
  }
  const fechas = meses(cs[fFechas])
  const f931 = meses(cs[fF931])
  const grem = meses(cs[fGrem])
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const out = []
  for (let i = 0; i < 12; i++) {
    if (fechas[i] === null) continue
    // EL AÑO DE LA GRILLA SALE DE LA PROPIA FILA DE FECHAS, NO DEL RELOJ. Si la salida cae en un mes
    // anterior al devengado, cruzó el año (dic-26 sale el 10/01/2027) y la grilla es la del anterior.
    const iso = isoDeSerial(fechas[i])
    const anioGrilla = Number(iso.slice(5, 7)) >= i + 1 ? Number(iso.slice(0, 4)) : Number(iso.slice(0, 4)) - 1
    const comun = { fecha: fechas[i], mesCaja: mesDeSerial(fechas[i]), mesDevengado: MES[i], anioGrilla }
    if (f931[i]) {
      out.push({ ...comun, que: 'F931', proyectado: f931[i], rubro: RUBRO_CARGAS, contraparte: 'ARCA',
        rubros: [RUBRO_CARGAS] })
    }
    if (grem[i]) {
      out.push({ ...comun, que: 'Gremiales', proyectado: grem[i], rubro: RUBRO_GREMIALES,
        contraparte: 'FCL · UOCRA · IERIC · FODECO', rubros: [RUBRO_GREMIALES] })
    }
  }
  return out
}

/** El bloque 2, por rótulo: qué dice la pestaña que salió, mes a mes, para cada concepto. */
function bloquePagadoDeLaPestana(cs) {
  const s2 = buscar(cs, /2\s*·\s*PAGADO/i)
  if (s2 < 0) throw new Error('no encontré la sección 2 de la pestaña')
  const fila = (re) => { const i = buscar(cs, re, s2); return i < 0 ? null : meses(cs[i]) }
  const gremiales = ['FCL', 'UOCRA', 'IERIC', 'FODECO'].map((r) => fila(new RegExp(`^${r}$`)))
  return {
    F931: fila(/^F931$/),
    plan: fila(/^Deuda previsional en cuotas$/),
    // Los cuatro gremiales viven en filas separadas y la cadena los proyecta juntos: se suman acá
    // para poder comparar lo mismo contra lo mismo, que es la regla del cuadro de la sección 3.
    Gremiales: Array.from({ length: 12 }, (_, i) => gremiales.reduce((a, g) => a + (g?.[i] ?? 0), 0)),
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: SCOPES_LECTURA })
  // UNFORMATTED_VALUE, siempre: leer formateado devuelve "10/08/2026" donde hay un serial y "—"
  // donde hay un cero, y las comparaciones numéricas se caen en silencio.
  const leer = (r) => google.readSheetValues(ID, r, { render: 'UNFORMATTED_VALUE' })
  const [cs, compras, banco] = await Promise.all([
    leer(`'${PESTAÑA}'!A1:N120`), leer('Compras!A1:BZ4000'), leer('_BANCO_RAW!A1:F'),
  ])

  const debitos = debitosDelExtracto(banco)
  const corteBanco = corteDelExtracto(banco)
  console.log(`TESTIGOS DE CARGAS SOCIALES · extracto hasta ${corteBanco ? isoDeSerial(corteBanco) : '—'} `
    + `· ${debitos.length} débito(s)`)

  const pagado = bloquePagadoDeLaPestana(cs)
  const obligaciones = obligacionesDeLaCadena(cs)
  for (const o of obligaciones) {
    const col = Number(o.mesCaja.slice(5, 7)) - 1
    // Sólo el mes de caja del MISMO año que la grilla: el devengado de diciembre sale en enero del
    // año siguiente y esta pestaña no tiene esa columna. Se dice, no se inventa.
    const delAnio = o.mesCaja.slice(0, 4) === String(o.anioGrilla)
    informar({ ...o, pestanaPagado: delAnio ? (pagado[o.que]?.[col] ?? null) : null },
      { compras, debitos, corteBanco })
  }

  // Las cuotas de planes no las proyecta la cadena (entran por Compras con su monto exacto), pero se
  // listan porque comparten la contraparte ARCA y compiten por los mismos débitos del extracto.
  console.log(`\n══ ${RUBRO_PLANES} · lo que Compras tiene sin marcar Pagado ══`)
  const c = columnasDeCompras(compras)
  for (let i = 3; i < compras.length; i++) {
    const f = compras[i] ?? []
    if (txt(f[c.rubro]) !== RUBRO_PLANES || estaPagada(f[c.estado])) continue
    const fecha = num(f[c.fechaCaja])
    console.log(`   Compras f${i + 1}  ${pesos(num(f[c.importe]) ?? 0).padStart(14)}  `
      + `${fecha ? isoDeSerial(fecha) : '—'}  «${txt(f[c.estado])}»`)
  }
}

main().catch((e) => { console.error(e.message); process.exit(1) })
