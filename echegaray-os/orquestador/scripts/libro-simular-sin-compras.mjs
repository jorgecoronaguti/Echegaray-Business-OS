#!/usr/bin/env node
// ¿QUÉ PIERDE EL CASH FLOW SI SE VACÍA COMPRAS? — la prueba ejecutable de la orden del 11/09/2026.
//
// ═══ QUÉ CONTESTA ═══
//
// El dueño va a vaciar de la pestaña Compras todo lo que no sea Civil, Estructura o Mantenimiento.
// Cinco grupos de plata entraban al libro SÓLO por esas filas ($94,1 M de REAL y $17,3 M de FUTURO
// medidos en `docs/engineering/COMPRAS-LIMPIEZA-2026-09-11.md`). Las fases 1 a 4 les dieron fuente
// propia; este script mide si eso alcanza, ANTES de que las filas se borren.
//
// Arma el libro DOS VECES sobre las MISMAS lecturas —tal cual, y tratando como anuladas las filas que
// el dueño va a vaciar— y publica la diferencia. El criterio de éxito es explícito: para Financiero,
// Nómina · Cargas sociales, Nómina · Gremiales, Nómina · SAC e Impuestos la diferencia tiene que ser
// ≤ $1, o estar explicada línea por línea.
//
// ═══ SÓLO LECTURA, Y SE PUEDE PROBAR ═══
//
// El cliente se crea con `READONLY_SCOPES`: aunque alguien agregara una escritura por error, Google la
// rechazaría con 403. No escribe el Sheet, no escribe Postgres, no escribe archivos. Es la única forma
// honesta de correr esto desde un worktree — escribir el Sheet desde un worktree ya borró una pestaña.
//
// ═══ LAS DOS CORRIDAS VEN EXACTAMENTE LAS MISMAS FUENTES ═══
//
// Las lecturas de la primera corrida quedan en memoria y la segunda se sirve de ahí. No es una
// optimización: si el Sheet cambiara entre las dos corridas —y se edita todo el día— la diferencia
// mezclaría el efecto del vaciado con el de una edición, y no habría forma de separarlos.
//
//   node orquestador/scripts/libro-simular-sin-compras.mjs [--detalle]

import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { extraerDeLasFuentes, consolidar } from './libro-movimientos-pestana.mjs'
import { columnasDeCompras } from '../lib/libro-extractores-compras.mjs'
import { resolverColumnas } from '../lib/compras-columnas.mjs'
import { RUBRO_SAC } from '../lib/libro-extractores-sac.mjs'
import { isoDeSerial } from '../lib/libro-extractores-fechas.mjs'
// LOS BLOQUES DE LAS PESTAÑAS LEEN EL LIBRO DESDE EL 11/09/2026, así que lo que van a mostrar se puede
// calcular acá con el MISMO filtro que escribe su fórmula. Las constantes se importan, no se tipean:
// una lista de contrapartes copiada daría un control que no mide lo que la celda va a decir.
import { CONTRAPARTES_PRENDARIO } from '../lib/impuestos-cuadro.mjs'
import { ORGANISMOS_GREMIALES } from '../lib/cargas-bloque-pagado.mjs'
import { RUBRO_CARGAS, RUBRO_GREMIALES, RUBRO_PLANES } from '../lib/libro-extractores-cargas.mjs'

const DETALLE = process.argv.includes('--detalle')
/** `--avisos` imprime lo que los extractores nuevos DECIDIERON en el escenario vaciado. Es la única
 *  forma de contestar «¿por qué no repuso este pago?» sin leer las 300 líneas de las dos corridas. */
const AVISOS = process.argv.includes('--avisos')
const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/**
 * LAS UNIDADES DE NEGOCIO QUE SE QUEDAN EN COMPRAS. Orden del dueño: la pestaña pasa a ser el registro
 * de los egresos CON FACTURA de las tres líneas operativas, y nada más.
 */
const UNIDADES_QUE_SE_QUEDAN = [/civil/i, /estructura/i, /mantenimiento/i]

/** Los rubros sobre los que se juzga el resultado. Los otros pueden moverse por el vaciado sin drama. */
const CRITICOS = ['Financiero', 'Nómina · Cargas sociales', 'Nómina · Gremiales', RUBRO_SAC, 'Impuestos',
  'Deuda previsional (planes de pago)']

/** El estado que `estaAnulada` reconoce. Se escribe en la COPIA en memoria, nunca en el Sheet. */
const ANULADA = 'ELIMINADO'

const pesos = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-AR')}`
const mesDe = (serial) => isoDeSerial(serial).slice(0, 7)

/**
 * NÚCLEO PURO: la copia de Compras como quedaría después del vaciado.
 *
 * Se marca `ELIMINADO` en la columna Estado en vez de borrar la fila: es exactamente lo que el bisturí
 * (`compras-bisturi`) escribe en el Sheet real, así que la simulación mide el MISMO efecto que va a
 * producir la orden, y no una aproximación. Las filas intactas se comparten por referencia; sólo se
 * clona la que se anula.
 *
 * @param {Array<Array>} filas Compras entera
 * @returns {{filas:Array<Array>, anuladas:number, unidades:Map<string,number>}}
 */
export function comprasComoQuedaria(filas = []) {
  const c = columnasDeCompras(filas)
  // La columna de unidad de negocio se resuelve por rótulo como todo lo demás. Si no está, se aborta:
  // adivinar la I produciría una simulación plausible y equivocada, que es el peor resultado.
  const { idx, faltan } = resolverColumnas(filas[2] ?? [], { unidad: 'Unidad de Negocio' })
  if (faltan.length) {
    throw new Error('no encontré la columna "Unidad de Negocio" en Compras. Sin ella no sé qué filas '
      + 'se vacían y la simulación no mediría nada: no simulo.')
  }
  const out = filas.slice()
  const unidades = new Map()
  let anuladas = 0
  for (let i = 3; i < filas.length; i++) {
    const f = filas[i] ?? []
    const rubro = String(f[c.rubro] ?? '').trim()
    const unidad = String(f[idx.unidad] ?? '').trim()
    if (!rubro && !unidad) continue
    const seQueda = UNIDADES_QUE_SE_QUEDAN.some((re) => re.test(unidad)) && rubro !== RUBRO_SAC
    if (seQueda) continue
    const copia = f.slice()
    copia[c.estado] = ANULADA
    out[i] = copia
    anuladas += 1
    unidades.set(unidad || '(vacía)', (unidades.get(unidad || '(vacía)') ?? 0) + 1)
  }
  return { filas: out, anuladas, unidades }
}

/**
 * Un cliente de Google que memoriza cada lectura y, opcionalmente, transforma la de Compras.
 *
 * Se decora por prototipo (`Object.create`) y no por spread para no copiar el objeto entero: el
 * cliente real tiene decenas de métodos y lo único que cambia acá es la puerta de lectura.
 */
function clienteCacheado(google, cache, transformarCompras = null) {
  const d = Object.create(google)
  d.readSheetValues = async (fileId, rango, opts = {}) => {
    const clave = `${fileId}|${rango}|${opts.render ?? ''}`
    if (!cache.has(clave)) cache.set(clave, await google.readSheetValues(fileId, rango, opts))
    const filas = cache.get(clave)
    return transformarCompras && /^Compras!/.test(rango) ? transformarCompras(filas) : filas
  }
  return d
}

/** El serial de HOY, igual que el generador del libro: el corte para vencidos. */
const hoySerial = () => Math.floor((Date.now() - Date.UTC(1899, 11, 30)) / 86400000)

/** NÚCLEO PURO: neto por (rubro · mes), separando lo REAL de lo que todavía no salió. */
export function netoPorRubroMes(libro = []) {
  const out = new Map()
  for (const m of libro) {
    const ventana = m.estado === 'REAL' ? 'REAL' : 'FUTURO'
    const clave = `${m.rubro}|${mesDe(m.fecha)}|${ventana}`
    out.set(clave, Math.round(((out.get(clave) ?? 0) + m.signo * m.importe) * 100) / 100)
  }
  return out
}

/** NÚCLEO PURO: neto por semana ISO de inicio (lunes), para las próximas `cuantas`. */
export function netoPorSemana(libro = [], desde, cuantas = 8) {
  // El serial 2 es el 01/01/1900 y fue LUNES: `(serial - 2) % 7` vale 0 los lunes, así que restarlo
  // lleva cualquier fecha al lunes de su semana. Con el `+1` que parecía equivalente, la semana
  // arrancaba en sábado y los vencimientos del lunes caían en la columna anterior.
  const lunes = desde - ((desde - 2) % 7)
  const out = new Map()
  for (const m of libro) {
    if (m.fecha < lunes) continue
    const i = Math.floor((m.fecha - lunes) / 7)
    if (i >= cuantas) continue
    const clave = lunes + i * 7
    out.set(clave, Math.round(((out.get(clave) ?? 0) + m.signo * m.importe) * 100) / 100)
  }
  return out
}

/**
 * NÚCLEO PURO: las diferencias B−A que importan, con su SIGNIFICADO resuelto.
 *
 * ═══ EL SIGNO ENGAÑA, Y ME ENGAÑÓ EN LA PRIMERA CORRIDA (11/09/2026) ═══
 *
 * El libro guarda los egresos con `signo: -1`, así que en un rubro de egreso un delta POSITIVO es
 * MENOS gasto registrado: el cuadro PERDIÓ plata. Y un delta negativo es más gasto registrado, o sea
 * cobertura que antes no existía — el SAC de diciembre ($7,98 M) aparece así, y es exactamente lo que
 * la orden venía a conseguir. Leerlo al revés hace fracasar una simulación exitosa.
 *
 * Por eso cada diferencia sale con `pierde` resuelto y partida por la VENTANA DEL EXTRACTO: lo
 * anterior a la primera fila de `_BANCO_RAW` no lo puede reponer ninguna fuente bancaria, y mezclarlo
 * con el resto esconde qué se puede arreglar y qué necesita una decisión del dueño.
 */
function diferencias(a, b, desdeExtracto) {
  const claves = new Set([...a.keys(), ...b.keys()])
  const out = []
  for (const k of claves) {
    const delta = Math.round(((b.get(k) ?? 0) - (a.get(k) ?? 0)) * 100) / 100
    if (Math.abs(delta) <= 1) continue
    const [rubro, mes, ventana] = k.split('|')
    out.push({
      rubro, mes, ventana, delta,
      pierde: delta > 0 ? delta : 0,
      // ESTRICTAMENTE MAYOR, y no es un detalle de borde: el extracto empieza el 28/05/2026, así que
      // de mayo sólo cubre cuatro días. Un pago del 10/05 cae en un mes que el extracto «toca» y que
      // no puede probar — contarlo como reparable prometería un arreglo imposible.
      conExtracto: mes > mesDe(desdeExtracto),
    })
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
}

/** Suma un campo de las diferencias que pasan el filtro. PURO. */
const sumarDif = (difs, filtro, campo = 'delta') =>
  Math.round(difs.filter(filtro).reduce((a, d) => a + d[campo], 0) * 100) / 100

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const cache = new Map()
  const corte = hoySerial()
  const silencio = () => {}
  // Se silencia la narración de las dos corridas: son ~300 líneas de evidencia del cruce cada una y lo
  // que este script tiene que mostrar es la DIFERENCIA. Para verla, `libro-movimientos-pestana --dry`.
  const original = console.log
  const warn = console.warn
  const capturados = []
  console.log = silencio
  // Los avisos de los extractores nuevos salen por `console.warn`: se capturan para poder explicar
  // una pérdida, y se descarta el resto (el cruce contra el banco narra cientos de líneas por corrida).
  console.warn = (...a) => { capturados.push(a.join(' ')) }
  let A; let B; let info
  try {
    const fuentesA = await extraerDeLasFuentes(clienteCacheado(google, cache), corte)
    // Los débitos viajan con el libro A porque de ellos sale la VENTANA DEL EXTRACTO, que es lo que
    // separa lo que una fuente bancaria puede reponer de lo que no.
    A = { ...consolidar(fuentesA.fuentes, { ...fuentesA, log: silencio }), debitos: fuentesA.debitosBanco }
    const compras = cache.get(`${ID}|Compras!A1:AN|UNFORMATTED_VALUE`)
    info = comprasComoQuedaria(compras ?? [])
    const despues = await extraerDeLasFuentes(
      clienteCacheado(google, cache, (filas) => comprasComoQuedaria(filas).filas), corte)
    B = consolidar(despues.fuentes, { ...despues, log: silencio })
  } finally {
    console.log = original
    console.warn = warn
  }

  console.log(`SIMULACIÓN SIN COMPRAS — corte ${isoDeSerial(corte)} · sólo lectura`)
  console.log(`  filas de Compras que el vaciado anula: ${info.anuladas} `
    + `(unidades: ${[...info.unidades].map(([u, n]) => `${u} ${n}`).join(' · ')})`)
  console.log(`  libro TAL CUAL: ${A.consolidado.length} movimiento(s) · neto ${pesos(neto(A.consolidado))}`)
  console.log(`  libro VACIADO : ${B.consolidado.length} movimiento(s) · neto ${pesos(neto(B.consolidado))}`)

  const desdeExtracto = (A.debitos ?? []).reduce((a, d) => (a === null || d.fecha < a ? d.fecha : a), null)
  const difs = diferencias(netoPorRubroMes(A.consolidado), netoPorRubroMes(B.consolidado), desdeExtracto)
  console.log(`  el extracto de _BANCO_RAW empieza el ${isoDeSerial(desdeExtracto)}: lo anterior NO lo `
    + 'puede reponer ninguna fuente bancaria')

  console.log('\n  LOS RUBROS QUE LA ORDEN PONE EN RIESGO — «pierde» es egreso que el cuadro deja de ver')
  console.log(`  ${'RUBRO'.padEnd(36)} ${'NETO con extracto'.padStart(18)} ${'PIERDE antes'.padStart(14)} ${'GANA'.padStart(14)}`)
  const malParado = []
  for (const r of CRITICOS) {
    const mio = difs.filter((d) => d.rubro === r)
    // EL CRITERIO SE JUZGA SOBRE EL NETO, no sobre lo que pierde. La misma plata puede salir de un mes
    // y entrar en otro —el SAC pagado en junio que el banco muestra en julio— y eso no es plata
    // perdida: es plata movida, y el efecto de calendario se ve en el cuadro de las ocho semanas.
    const netoCon = sumarDif(mio, (d) => d.conExtracto)
    const pierdeAntes = sumarDif(mio, (d) => !d.conExtracto, 'pierde')
    const gana = -sumarDif(mio, (d) => d.delta < 0)
    const ok = netoCon <= 1
    if (!ok) malParado.push(`${r} ${pesos(netoCon)}`)
    console.log(`  ${ok ? '✓' : '✗'} ${r.slice(0, 34).padEnd(34)} ${pesos(netoCon).padStart(18)} `
      + `${pesos(pierdeAntes).padStart(14)} ${pesos(gana).padStart(14)}`)
  }

  if (AVISOS) {
    const relevantes = capturados.filter((m) => /banco-obligaciones|extractores-sac/.test(m))
    console.log(`\n  LO QUE DECIDIERON LAS FUENTES NUEVAS (${relevantes.length} aviso(s) de los dos escenarios)`)
    for (const m of relevantes) console.log(`    ${m.replace(/^\s*⚠\s*/, '').slice(0, 200)}`)
  }

  // LO QUE HAY QUE EXPLICAR LÍNEA POR LÍNEA: un rubro crítico que pierde plata DENTRO de la ventana del
  // extracto. Es la lista corta que el dueño necesita para decidir, y va siempre — no detrás de un flag.
  const aExplicar = difs.filter((d) => CRITICOS.includes(d.rubro) && d.conExtracto && d.pierde > 1)
  if (aExplicar.length) {
    console.log('\n  LO QUE HAY QUE EXPLICAR (rubro crítico que pierde plata con el extracto disponible)')
    for (const d of aExplicar) {
      console.log(`    ${d.mes} ${d.rubro.slice(0, 34).padEnd(35)} ${d.ventana.padEnd(7)} ${pesos(d.pierde).padStart(15)}`)
    }
  }
  if (DETALLE && difs.length) {
    console.log('\n  DETALLE rubro × mes (las 12 más grandes; «−» = el cuadro GANA cobertura)')
    for (const d of difs.slice(0, 12)) {
      console.log(`    ${d.mes} ${d.conExtracto ? 'banco' : 'ANTES'} ${d.rubro.slice(0, 30).padEnd(31)} `
        + `${d.ventana.padEnd(7)} ${pesos(d.delta).padStart(15)}`)
    }
  }

  // ═══ QUÉ VAN A MOSTRAR LOS BLOQUES DE LAS PESTAÑAS (Fase 7) ═══
  //
  // «Cargas Sociales» §2 PAGADO, sus cuotas sin pagar y la deuda financiera de «Impuestos y
  // Financieros» leían Compras por SUMIFS y ahora leen `_MOVIMIENTOS`. Lo que cada celda va a decir se
  // calcula acá con el MISMO filtro que escribe su fórmula: si el vaciado le saca plata a un bloque, se
  // ve antes de vaciar. No se simulan fórmulas de Sheets —no se pueden evaluar sin escribir el archivo—
  // sino el dato que esas fórmulas van a sumar, que es lo que cambia.
  console.log('\n  QUÉ VAN A MOSTRAR LOS BLOQUES QUE DEJARON DE LEER COMPRAS (año completo)')
  console.log(`  ${'BLOQUE · FILA'.padEnd(46)} ${'ACTUAL'.padStart(15)} ${'VACIADO'.padStart(15)} ${'DIF'.padStart(12)}`)
  const bloques = [
    ['Cargas Soc. §2 · F931', { rubros: [RUBRO_CARGAS], real: true }],
    ['Cargas Soc. §2 · Deuda previsional en cuotas', { rubros: [RUBRO_PLANES], real: true }],
    ...ORGANISMOS_GREMIALES.map(([r, contrapartes]) =>
      [`Cargas Soc. §2 · ${r}`, { rubros: [RUBRO_GREMIALES], contrapartes, real: true }]),
    ['Cargas Soc. §2 · CONTROL sin clasificar', { rubros: [RUBRO_GREMIALES], real: true, menosOrganismos: true }],
    ['Cargas Soc. §4 · Cuotas sin pagar', { rubros: [RUBRO_PLANES], real: false }],
    ['Impuestos §5 · Prendario cuota (año)', { rubros: ['Financiero'], contrapartes: CONTRAPARTES_PRENDARIO }],
    ['Impuestos §5 · Prendario por vencer', { rubros: ['Financiero'], contrapartes: CONTRAPARTES_PRENDARIO, real: false, desde: corte }],
  ]
  for (const [nombre, f] of bloques) {
    const a = comoCelda(A.consolidado, f)
    const b = comoCelda(B.consolidado, f)
    const dif = Math.round((b - a) * 100) / 100
    const marca = /CONTROL/.test(nombre) ? (Math.abs(b) <= 1 ? ' ✓' : ' ✗') : (Math.abs(dif) <= 1 ? ' ✓' : '  ')
    console.log(`  ${nombre.padEnd(46)} ${pesos(a).padStart(15)} ${pesos(b).padStart(15)} ${pesos(dif).padStart(12)}${marca}`)
  }

  const sa = netoPorSemana(A.consolidado, corte)
  const sb = netoPorSemana(B.consolidado, corte)
  console.log('\n  LAS PRÓXIMAS 8 SEMANAS (neto de caja)')
  console.log(`  ${'SEMANA DEL'.padEnd(12)} ${'ACTUAL'.padStart(16)} ${'VACIADO'.padStart(16)} ${'DIFERENCIA'.padStart(16)}`)
  for (const k of [...new Set([...sa.keys(), ...sb.keys()])].sort((x, y) => x - y)) {
    const a = sa.get(k) ?? 0
    const b = sb.get(k) ?? 0
    console.log(`  ${isoDeSerial(k).padEnd(12)} ${pesos(a).padStart(16)} ${pesos(b).padStart(16)} `
      + `${pesos(Math.round((b - a) * 100) / 100).padStart(16)}`)
  }

  console.log(malParado.length
    ? `\n  ✗ DENTRO de la ventana del extracto el vaciado todavía le saca plata a: ${malParado.join(' · ')}`
    : '\n  ✓ DENTRO de la ventana del extracto ningún rubro crítico pierde plata: las fuentes propias '
      + 'reponen todo lo que el vaciado se lleva.')
  const antes = sumarDif(difs, (d) => !d.conExtracto, 'pierde')
  if (antes > 1) {
    console.log(`  ⚠ ANTES del ${isoDeSerial(desdeExtracto)} el vaciado se lleva ${pesos(antes)} que NINGUNA `
      + 'fuente puede reponer: el extracto no llega a esas fechas. Las dos salidas son importar el '
      + 'extracto de enero a mayo (scripts/importar-banco.mjs) o NO vaciar las filas anteriores a junio.')
  }
  if (malParado.length) process.exitCode = 1
}

const neto = (libro) => libro.reduce((a, m) => a + m.signo * m.importe, 0)

/**
 * NÚCLEO PURO: lo que va a sumar una celda que lee el libro con ese filtro.
 *
 * Es la contracara en JavaScript de `terminoLibro`: mismos campos, misma semántica (`real: true` =
 * estado REAL, `false` = todavía no salió). No se puede reusar el constructor de fórmulas porque eso
 * devuelve texto para el Sheet; lo que se comparte es el FILTRO, que viaja en el mismo objeto.
 */
function comoCelda(libro, f) {
  const orgs = new Set(ORGANISMOS_GREMIALES.flatMap(([, c]) => c))
  let total = 0
  for (const m of libro) {
    if (f.rubros && !f.rubros.includes(m.rubro)) continue
    if (f.contrapartes && !f.contrapartes.includes(m.contraparte)) continue
    if (f.real === true && m.estado !== 'REAL') continue
    if (f.real === false && m.estado === 'REAL') continue
    if (f.desde && m.fecha < f.desde) continue
    // El control del desglose: el rubro entero MENOS lo que las cuatro filas por organismo se llevan.
    if (f.menosOrganismos && orgs.has(m.contraparte)) continue
    total += Math.abs(m.importe)
  }
  return Math.round(total * 100) / 100
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
