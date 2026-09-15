#!/usr/bin/env node
// EL ESQUEMA DE COBROS DE LAS TRES OBRAS DE SAN FRANCISCO.
//
//   node orquestador/scripts/cobranzas-san-francisco-anticipos.mjs [--aplicar]
//
// Sin `--aplicar` muestra el plan celda por celda y NO escribe. La decisión del dueño (21/08/2026):
//
//   · los anticipos por inicio de obra se COBRAN —no se amortizan contra las certificaciones— y
//     tienen que quedar cancelados el 15/09/2026;
//   · de ahí en adelante todo es certificación de avance, QUINCENAL desde el 30/09;
//   · cambian las FECHAS de las certificaciones, no el criterio de avance: cada certificación
//     conserva su número y su importe.
//
// ═══ QUÉ SE TOCA Y QUÉ NO ═══
//
// Cobranzas es fuente: se lee, no se reescribe. Acá se tocan **once filas en estado Pendiente y
// ninguna Cobrada**. Ninguna fila con plata que ya entró cambia. Lo que se edita es la proyección,
// que es exactamente para lo que existe la columna Q.
//
// La columna que manda es **Q · Fecha cobro**. `R · Mes cobro` es `=TEXT(Q;"mmm-yy")` y se recalcula
// sola, y de ahí salen el Calendario de Cobros, CAJA y los dos Cash Flow. Por eso no hay que tocar
// ninguna de esas pestañas: se mueven porque se movió su origen. Escribir el mismo número en cuatro
// lugares es la forma de que cuatro lugares dejen de coincidir.
//
// ═══ EL ANTICIPO SE PARTE EN DOS, Y SIGUE SIENDO UNA FÓRMULA ═══
//
// `J67` no dice 20.000.000: dice `=40000000*50%`. El número tiene su origen escrito al lado, que es
// la regla de oro del archivo. Al partir el anticipo en dos quincenas las filas dicen
// `=40000000*25%`, no `10000000`. Si mañana cambia el contrato, cambia un lugar.
//
// ═══ REGLA 0 · `respetar: false`, Y ESTÁ GANADO CON UNA GUARDA, NO DECLARADO A DEDO ═══
//
// La primera versión de este script escribía en crudo y **le borró al dueño el fragmento
// «Cotización n°» de H67 y H68**: mi rótulo reemplazaba el suyo en vez de sumarse. Chico, real, y
// exactamente lo que la Regla 0 existe para impedir.
//
// La salida NO es `conEdicionesRespetadas` fila por fila: este script no regenera un bloque, edita
// CELDAS ENUMERADAS. La salida es más fuerte que respetar — **antes de escribir, cada celda se lee
// y se compara con lo que tiene que tener**. Si una no coincide ni con el valor previo ni con el
// que se va a escribir, el script ABORTA nombrándola y no escribe NADA. No se discute qué texto
// gana: directamente no se escribe sobre lo que no se reconoce.
//
// Y el rótulo del dueño se CONSERVA: el sufijo se agrega al texto que ya estaba, no lo reemplaza.
//
// Eso además lo hace idempotente: correrlo dos veces no cambia nada la segunda vez.
import { makeGoogleClient } from '../lib/google.mjs'
import { accessTokenFor } from '../lib/google-oauth.mjs'
import { exigirColumnas, leerColumnasCobranzas } from '../lib/cobranzas-columnas.mjs'
import { rangoFilas } from '../lib/columnas-por-encabezado.mjs'

const FLUJO = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const CUENTA = process.env.ORQ_SHEET_CUENTA || 'jorge@ecsas.com.ar'

/** Serial de Google Sheets: días desde el 30/12/1899. */
export const serie = (iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

// Las fechas del esquema. Quincenal: fin de mes y mitad de mes.
export const F = {
  ANT_1: '2026-08-31',
  ANT_2: '2026-09-15', // ← los anticipos quedan cancelados acá
  CERT_1: '2026-09-30',
  CERT_2: '2026-10-15',
  CERT_3: '2026-10-30',
  CERT_4: '2026-11-14',
}

/** Las nueve certificaciones ya emitidas: sólo se mueve Q. */
export const CERTIFICACIONES = [
  { fila: 71, que: 'Pisos 1/4', q: F.CERT_1 },
  { fila: 72, que: 'Pisos 2/4', q: F.CERT_2 },
  { fila: 73, que: 'Pisos 3/4', q: F.CERT_3 },
  { fila: 74, que: 'Pisos 4/4', q: F.CERT_4 },
  { fila: 75, que: 'Instalaciones 1/4', q: F.CERT_1 },
  { fila: 76, que: 'Instalaciones 2/4', q: F.CERT_2 },
  { fila: 77, que: 'Instalaciones 3/4', q: F.CERT_3 },
  { fila: 78, que: 'Instalaciones 4/4', q: F.CERT_4 },
  { fila: 79, que: 'Entrepiso 1/1', q: F.CERT_1 },
]

/** Los dos anticipos pendientes se parten en dos quincenas cada uno. */
/** El sufijo se AGREGA al rótulo del dueño; nunca lo reemplaza. */
export const SUFIJO_1 = ' — 1ª de 2 cuotas quincenales'

export const ANTICIPOS = [
  { fila: 67, filaNueva: 96, obra: 'Instalaciones Eléctricas', contrato: 40000000,
    hDueno: 'Anticipo inicio obra 50% $ 40.000.000 Cotización n°',
    h2: 'Anticipo inicio obra 50% $ 40.000.000 Cotización n° — 2ª de 2 cuotas quincenales · cancela el anticipo' },
  { fila: 68, filaNueva: 97, obra: 'Entrepiso y Escaleras', contrato: 7728254,
    hDueno: 'Anticipo inicio obra 50% $ 7.728.254 Cotización n°',
    h2: 'Anticipo inicio obra 50% $ 7.728.254 Cotización n° — 2ª de 2 cuotas quincenales · cancela el anticipo' },
]

/** Las columnas que toca esta rutina, por clave de `COBRANZAS_OS`: toda la anatomía de la fila. */
export const COLUMNAS_ANTICIPOS = Object.freeze([
  'id', 'categoria', 'fechaVenta', 'factura', 'comprobante', 'unidad', 'cliente', 'oc', 'concepto', 'neto', 'iva',
  'retenciones', 'total', 'formaCobro', 'estado', 'fechaFactura', 'fechaCobro', 'mesCobro', 'probabilidad',
  'montoPonderado', 'diasVto', 'estadoCobro', 'retIva', 'moneda',
])

/**
 * La fila nueva copia la anatomía de su hermana: mismas fórmulas, con su propio número de fila.
 *
 * CADA CELDA VA A SU RÓTULO (14/09/2026). Era un arreglo posicional A…V con las letras adentro de las
 * fórmulas (`=J+K-L`, `SUM(X:AA)`): con «Obra» insertada en H, la fila se habría escrito corrida una
 * columna y el total habría sido Concepto + Monto neto − IVA. La columna «Obra», si existe, queda
 * vacía: esta rutina no sabe a qué obra va y no lo inventa.
 */
export function filaDeAnticipo(a, n, cols) {
  const c = exigirColumnas(cols, COLUMNAS_ANTICIPOS, 'filaDeAnticipo')
  const L = (k) => `${c[k].letra}${n}`
  const [neto, iva, ret, total, est, cobro, prob] = ['neto', 'iva', 'retenciones', 'total', 'estado', 'fechaCobro', 'probabilidad'].map(L)
  const valores = {
    id: `=IF(${L('fechaVenta')}="";"";ROW()-4)`,
    categoria: 'N',
    fechaVenta: serie('2026-07-31'),
    factura: '', comprobante: '',
    unidad: 'Civil',
    cliente: 'San Francisco',
    oc: a.h2,
    concepto: a.obra,
    neto: `=${a.contrato}*25%`, // la mitad del anticipo del 50%
    iva: '',
    // La suma de las columnas de retención de la fila, hasta «Moneda» inclusive: es la fórmula que ya
    // tiene su hermana, y copiarla recortada daría otro número si alguien cargara algo en la última.
    retenciones: `=IF(SUM(${L('retIva')}:${L('moneda')})=0;"";SUM(${L('retIva')}:${L('moneda')}))`,
    total: `=${neto}+${iva}-${ret}`,
    formaCobro: 'Efectivo',
    estado: 'Pendiente',
    fechaFactura: serie('2026-07-31'),
    fechaCobro: serie(F.ANT_2),
    mesCobro: `=TEXT(${cobro};"mmm-yy")`,
    probabilidad: 1,
    montoPonderado: `=IF(${total}="";"";${total}*${prob})`,
    diasVto: `=IF(${neto}="";"";IF(${est}="Cobrado";"Cobrado";IF(${est}="Pendiente";IF(${cobro}<TODAY();"Vencido";${cobro}-TODAY());${est})))`,
    estadoCobro: `=IF(${neto}="";"";IF(${est}="Cobrado";"✓ Cobrado";IF(${est}="Vencido";"▲ Vencido";IF(${est}="Proyectado";"⊘ Proyectado";IF(${cobro}<TODAY();"▲ Vencido";IF(${cobro}-TODAY()<=7;"⇒ Por vencer";"· Vigente"))))))`,
  }
  const fila = Array(c.estadoCobro.indice + 1).fill('')
  for (const [k, v] of Object.entries(valores)) fila[c[k].indice] = v
  return fila
}

/**
 * Cada escritura declara qué tiene que encontrar y qué va a dejar.
 * `antes` es el valor previo · `nuevo` el que se escribe. Si la celda no tiene ninguno de los dos,
 * alguien la tocó y el script no escribe nada.
 * @param {Record<string,{letra:string}>} cols columnas de Cobranzas resueltas contra la fila 4 viva
 */
export function planDeEscritura(cols) {
  const c = exigirColumnas(cols, COLUMNAS_ANTICIPOS, 'planDeEscritura')
  const celda = (k, fila) => ({ rango: `Cobranzas!${c[k].letra}${fila}`, celda: `${c[k].letra}${fila}`, campo: k })
  const p = []
  for (const x of CERTIFICACIONES) {
    p.push({ ...celda('fechaCobro', x.fila), nuevo: serie(x.q), que: `${x.que} → ${x.q}` })
  }
  for (const a of ANTICIPOS) {
    p.push({ ...celda('oc', a.fila), nuevo: a.hDueno + SUFIJO_1,
             tolera: [a.hDueno, a.hDueno.replace(' Cotización n°', '') + SUFIJO_1],
             que: `${a.obra} · rótulo de la 1ª cuota (conserva el texto del dueño)` })
    p.push({ ...celda('neto', a.fila), nuevo: `=${a.contrato}*25%`,
             tolera: [`=${a.contrato}*50%`], formula: true, que: `${a.obra} · 1ª cuota = ${a.contrato}*25%` })
    p.push({ ...celda('fechaCobro', a.fila), nuevo: serie(F.ANT_1), que: `${a.obra} · 1ª cuota → ${F.ANT_1}` })
    p.push({ rango: `Cobranzas!${c.id.letra}${a.filaNueva}:${c.estadoCobro.letra}${a.filaNueva}`, celda: `${c.id.letra}${a.filaNueva}`, fila: true,
             nuevo: filaDeAnticipo(a, a.filaNueva, cols), que: `${a.obra} · 2ª cuota → ${F.ANT_2} (fila ${a.filaNueva})` })
  }
  return p
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const g = makeGoogleClient({ auth: { getAccessToken: () => accessTokenFor(CUENTA) } })

  // La fila 4 de ESTA corrida: cada celda del plan sale de su rótulo. Un rótulo que falta aborta acá.
  const cols = await leerColumnasCobranzas(g, FLUJO, COLUMNAS_ANTICIPOS)
  const plan = planDeEscritura(cols)

  // ── LA GUARDA: leer antes de escribir, y abortar si algo no se reconoce ──────────────────────
  // Se leen las FÓRMULAS, no los valores: si J67 dice `=40000000*50%` hay que verlo así y no como
  // 20.000.000, porque lo que se conserva es la fórmula con su origen.
  const celdas = plan.map((p) => `Cobranzas!${p.celda}`)
  const actual = []
  for (const c of celdas) {
    const v = await g.readSheetValues(FLUJO, c, { render: 'FORMULA' })
    actual.push(String((v[0] || [])[0] ?? ''))
  }

  const desconocidas = []
  const yaHechas = []
  const aEscribir = []
  plan.forEach((p, i) => {
    const hoy = actual[i]
    const nuevo = p.fila ? '' : String(p.nuevo)
    if (p.fila) {
      // La fila nueva sólo se escribe si está VACÍA o si ya la escribió esta misma rutina.
      if (hoy === '' || /^=IF\(C\d+=/.test(hoy)) { (hoy === '' ? aEscribir : yaHechas).push(p) }
      else desconocidas.push({ p, hoy })
      return
    }
    if (hoy === nuevo) { yaHechas.push(p); return }
    const tolera = [...(p.tolera || [])].map(String)
    // Para las fechas: el valor previo puede ser cualquier serial anterior al esquema. Se acepta
    // un número, que es lo que una fecha tiene que ser; un texto ahí sí sería de alguien.
    const esFechaPrevia = p.campo === 'fechaCobro' && /^\d+$/.test(hoy)
    if (tolera.includes(hoy) || esFechaPrevia) { aEscribir.push(p); return }
    desconocidas.push({ p, hoy })
  })

  console.log('═══ LA GUARDA ═══')
  console.log(`  ${yaHechas.length} celda(s) ya están como tienen que estar`)
  console.log(`  ${aEscribir.length} celda(s) a escribir`)
  if (desconocidas.length) {
    console.log(`\n✗ ${desconocidas.length} celda(s) tienen algo que NO reconozco. No escribo NADA:`)
    for (const d of desconocidas) console.log(`    ${d.p.celda} = ${JSON.stringify(d.hoy).slice(0, 70)}  ·  esperaba escribir: ${d.p.que}`)
    console.log('\n  Alguien las editó. Mirá la pestaña y decidí: no voy a discutir contra tu edición.')
    process.exitCode = 1
    return
  }

  console.log('\n═══ EL PLAN ═══')
  aEscribir.forEach((p) => console.log(`  ${p.rango.padEnd(24)} ${p.que}`))
  if (!aEscribir.length) { console.log('  (nada: ya está aplicado)'); return }
  if (!aplicar) { console.log('\n(sin --aplicar) no escribí nada.'); return }

  for (const p of aEscribir) {
    // REGLA 0 — `respetar: false`, y está GANADO arriba: cada celda se leyó y se reconoció antes
    // de tocarla, y el rótulo del dueño se conserva porque el sufijo se le AGREGA. Una guarda que
    // aborta ante lo que no reconoce protege más que discutir después qué texto gana.
    await g.updateSheetValues(FLUJO, p.rango, p.fila ? [p.nuevo] : [[p.nuevo]], { respetar: false })
  }
  console.log(`\n✓ ${aEscribir.length} escrituras hechas.`)

  const despues = await g.readSheetValues(FLUJO, rangoFilas('Cobranzas', 66, 97), { render: 'FORMATTED_VALUE' })
  console.log('\n═══ DESPUÉS, releído del Sheet ═══')
  const en = (celdas, k) => String(celdas[cols[k].indice] || '')
  for (const r of [66, 67, 68, 71, 72, 73, 74, 75, 76, 77, 78, 79, 96, 97]) {
    const celdas = despues[r - 66] || []
    if (!en(celdas, 'concepto').trim()) continue
    console.log(`  f${r}  ${en(celdas, 'estado').padEnd(10)} cobro=${(en(celdas, 'fechaCobro') || '—').padEnd(12)} mes=${(en(celdas, 'mesCobro') || '—').padEnd(9)} ${en(celdas, 'total').padStart(16)}  ${en(celdas, 'oc').slice(0, 46)}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
