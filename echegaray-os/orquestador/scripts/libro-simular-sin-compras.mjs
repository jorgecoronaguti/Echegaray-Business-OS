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
// LAS COLUMNAS Y LA MARCA SALEN DEL BISTURÍ, no de una copia: si la planilla mueve una columna, la
// simulación y la escritura real tienen que moverse juntas o se mide una orden distinta de la que se da.
import { COL as COL_BISTURI, MARCA as ANULADA } from './compras-marcar-eliminado.mjs'
import { isoDeSerial } from '../lib/libro-extractores-fechas.mjs'
import { RANGO_TC, tipoCambioDeCelda } from '../lib/tipo-cambio.mjs'
import { query } from '../lib/db.mjs'
import { readFile } from 'node:fs/promises'
import { serialDe } from '../lib/libro-extractores-fechas.mjs'
import { pathToFileURL } from 'node:url'
import { realpathSync } from 'node:fs'
// LOS BLOQUES DE LAS PESTAÑAS LEEN EL LIBRO DESDE EL 11/09/2026, así que lo que van a mostrar se puede
// calcular acá con el MISMO filtro que escribe su fórmula. Las constantes se importan, no se tipean:
// una lista de contrapartes copiada daría un control que no mide lo que la celda va a decir.
import { CONTRAPARTES_PRENDARIO } from '../lib/impuestos-cuadro.mjs'
import { ORGANISMOS_GREMIALES } from '../lib/cargas-bloque-pagado.mjs'
import { RUBRO_CARGAS, RUBRO_GREMIALES, RUBRO_PLANES } from '../lib/libro-extractores-cargas.mjs'

const DETALLE = process.argv.includes('--detalle')
/** `--lista <archivo.json>`: las filas EXACTAS a anular, con su huella. Es lo que mide la orden real. */
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const LISTA = arg('--lista')
/** `--desde AAAA-MM-DD`: simular sólo las filas con fecha de caja ≥ ese día. */
const DESDE = arg('--desde')
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


const pesos = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-AR')}`
const mesDe = (serial) => isoDeSerial(serial).slice(0, 7)

/**
 * NÚCLEO PURO: la copia de Compras como quedaría después del vaciado.
 *
 * ═══ SE SIMULA LA MARCA COMPLETA DEL BISTURÍ, NO SÓLO LA X (auditoría de cierre, 11/09/2026) ═══
 *
 * Escribir sólo `ELIMINADO` en la X medía de menos y en la dirección peligrosa: **CAJA y
 * `sync-compras` suman Compras sin mirar la X**. Por eso `compras-marcar-eliminado.mjs` además pone en
 * CERO el neto, el IVA, el total y el monto pagado — y su propio comentario lo dice: *«el cero no es
 * cosmético»*. Las columnas se importan de ese módulo (`COL`), no se tipean: dos listas de índices se
 * separan el día que la planilla mueva una columna, y la simulación mediría otra cosa que el bisturí.
 *
 * ═══ TRES FORMAS DE ELEGIR QUÉ FILAS, Y LA BUENA ES LA LISTA ═══
 *
 * · `lista` — las filas EXACTAS de un archivo de respaldo, cada una verificada contra su HUELLA (id,
 *   fecha, proveedor, cliente, importe). Es lo que el bisturí va a marcar de verdad, así que es lo
 *   único que mide la orden y no una aproximación. Una huella que no coincide NO se anula y se grita:
 *   la fila se movió y marcarla a ciegas borraría otra cosa.
 * · `desde` — sólo filas con fecha de caja ≥ ese día. Contesta la pregunta del dueño: ¿y si vacío
 *   solamente lo que el extracto puede reponer?
 * · el REGEX de unidad, por defecto. Sirve para explorar, y el auditor tenía razón en desconfiar: el
 *   conjunto que mide (81 filas) no era el que se va a marcar (78 del encargo).
 *
 * @param {Array<Array>} filas Compras entera
 * @param {{lista?:Array<object>, desde?:number}} opciones
 * @returns {{filas:Array<Array>, anuladas:number, unidades:Map<string,number>, problemas:Array, saltadas:number}}
 */
export function comprasComoQuedaria(filas = [], { lista = null, desde = null } = {}) {
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
  const problemas = []
  let anuladas = 0
  let saltadas = 0
  const porFila = new Map((lista ?? []).map((x) => [Number(x.fila), x]))
  for (let i = 3; i < filas.length; i++) {
    const f = filas[i] ?? []
    const rubro = String(f[c.rubro] ?? '').trim()
    const unidad = String(f[idx.unidad] ?? '').trim()
    const pedida = porFila.get(i + 1)
    if (lista) {
      if (!pedida) continue
      const mal = desajusteDeHuella(f, pedida)
      if (mal) { problemas.push({ fila: i + 1, motivo: mal }); continue }
    } else {
      if (!rubro && !unidad) continue
      const seQueda = UNIDADES_QUE_SE_QUEDAN.some((re) => re.test(unidad)) && rubro !== RUBRO_SAC
      if (seQueda) continue
    }
    // `--desde` se aplica DESPUÉS de elegir la fila: el recorte es del alcance de la orden, no del
    // criterio de selección, y así las dos corridas (completa y recortada) eligen el mismo conjunto.
    const fechaCaja = typeof f[c.fechaCaja] === 'number' ? f[c.fechaCaja] : null
    if (desde !== null && (fechaCaja === null || fechaCaja < desde)) { saltadas += 1; continue }
    out[i] = filaMarcada(f, c)
    anuladas += 1
    unidades.set(unidad || '(vacía)', (unidades.get(unidad || '(vacía)') ?? 0) + 1)
  }
  return { filas: out, anuladas, unidades, problemas, saltadas }
}

/** La fila tal como la deja el bisturí: X=ELIMINADO y neto/IVA/total/pagado en CERO. PURO. */
function filaMarcada(f, c) {
  const copia = f.slice()
  copia[c.estado] = ANULADA
  for (const col of [COL_BISTURI.neto, COL_BISTURI.iva, COL_BISTURI.total, COL_BISTURI.pagado]) {
    // Sólo si la celda tenía un número: poner 0 donde había vacío inventaría un dato que el bisturí
    // tampoco escribe (su `nTieneNumero` hace exactamente esta pregunta antes de pisar el IVA).
    if (typeof copia[col] === 'number') copia[col] = 0
  }
  return copia
}

/**
 * NÚCLEO PURO: ¿la fila que está en el Sheet es la que la lista pidió marcar? Devuelve el motivo o null.
 *
 * Es la MISMA huella que verifica el bisturí (`compras-marcar-eliminado.mjs`): id de la A, fecha,
 * proveedor, cliente e importe. Si la planilla se reordenó, el número de fila apunta a otra compra —
 * y una simulación que anula otra fila mide una orden que nadie dio.
 */
export function desajusteDeHuella(f, pedida) {
  const norm = (v) => String(v ?? '').trim()
  const cent = (v) => Math.round((Number(v) || 0) * 100)
  const id = Number(f[COL_BISTURI.id]) || null
  if (pedida.id != null && id !== Number(pedida.id)) return `el id de la A es ${id} y la lista pide ${pedida.id}`
  if (norm(f[COL_BISTURI.proveedor]).toLowerCase() !== norm(pedida.proveedor).toLowerCase()) {
    return `el proveedor es "${norm(f[COL_BISTURI.proveedor])}" y la lista pide "${pedida.proveedor}"`
  }
  // El importe se compara SALVO que la fila ya esté marcada: el bisturí es idempotente y una fila ya
  // hecha tiene el total en cero, así que exigirle el importe original la reportaría como problema.
  const yaMarcada = norm(f[COL_BISTURI.estado]).toUpperCase() === ANULADA && cent(f[COL_BISTURI.total]) === 0
  if (!yaMarcada && cent(f[COL_BISTURI.total]) !== cent(pedida.total)) {
    return `el importe es ${f[COL_BISTURI.total]} y la lista pide ${pedida.total}`
  }
  return null
}

/**
 * Un cliente de Google que memoriza cada lectura y, opcionalmente, transforma la de Compras.
 *
 * Se decora por prototipo (`Object.create`) y no por spread para no copiar el objeto entero: el
 * cliente real tiene decenas de métodos y lo único que cambia acá es la puerta de lectura.
 */
function clienteCacheado(google, cache, { transformarCompras = null, tcDeRespaldo = null } = {}) {
  const d = Object.create(google)
  d.readSheetValues = async (fileId, rango, opts = {}) => {
    const clave = `${fileId}|${rango}|${opts.render ?? ''}`
    if (!cache.has(clave)) cache.set(clave, await google.readSheetValues(fileId, rango, opts))
    const filas = cache.get(clave)
    // ═══ EL TIPO DE CAMBIO SE DEGRADA A LA BASE, COMO EN PRODUCCIÓN (auditoría, 11/09/2026) ═══
    //
    // La simulación abortaba con «Cobranzas fila 62 está en USD y no tengo tipo de cambio»: el rango
    // `TIPO_CAMBIO_USD` sale de `IFERROR(GOOGLEFINANCE(...);"")` y devuelve vacío cuando la cotización
    // no responde. El informe no se podía reproducir por un dato que NO es el objeto de la medición.
    //
    // La misma degradación que ya usa producción: `public.tc_vigente()`, que devuelve el último
    // `TIPO_CAMBIO_USD` que `obras-economia-sync.mjs` persistió leyendo ESE MISMO rango. No es otra
    // fuente: es la misma, con memoria. Y si no hay ninguna de las dos, el libro aborta igual y el
    // script sale con código 2 diciendo que no pudo medir.
    if (rango === RANGO_TC && tcDeRespaldo && tipoCambioDeCelda(filas) === null) return [[tcDeRespaldo]]
    return transformarCompras && /^Compras!/.test(rango) ? transformarCompras(filas) : filas
  }
  return d
}

/** El tipo de cambio persistido que producción usa cuando el Sheet no contesta. `null` si tampoco está. */
async function tcVigenteDeLaBase() {
  try {
    const r = await query('select public.tc_vigente() as tc')
    const tc = Number(r.rows?.[0]?.tc)
    return Number.isFinite(tc) && tc > 0 ? tc : null
  } catch {
    return null
  }
}

/**
 * EL CÓDIGO DE SALIDA DISTINGUE «NO PUDE MEDIR» DE «MEDÍ Y DA MAL».
 *
 * 2 = falta un insumo y la simulación no llegó a medir nada (hoy: el tipo de cambio, sin el cual los
 * cobros en dólares no se pueden valuar y el libro aborta). 1 = midió y algún rubro crítico pierde
 * plata. Con un solo código, quien automatice esto no puede distinguir «el informe dice que falta
 * trabajo» de «el informe no existe».
 */
export const SALIDA_ERROR = (e) => (/tipo de cambio/i.test(String(e?.message ?? e)) ? 2 : 1)

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
export function diferencias(a, b, desdeExtracto) {
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
export const sumarDif = (difs, filtro, campo = 'delta') =>
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
  let A; let B; let info; let comprasA; let comprasB
  try {
    const seleccion = {
      lista: LISTA ? JSON.parse(await readFile(LISTA, 'utf8')) : null,
      desde: DESDE ? serialDe(Number(DESDE.slice(0, 4)), Number(DESDE.slice(5, 7)), Number(DESDE.slice(8, 10))) : null,
    }
    const tcDeRespaldo = await tcVigenteDeLaBase()
    const fuentesA = await extraerDeLasFuentes(clienteCacheado(google, cache, { tcDeRespaldo }), corte)
    // Los débitos viajan con el libro A porque de ellos sale la VENTANA DEL EXTRACTO, que es lo que
    // separa lo que una fuente bancaria puede reponer de lo que no.
    A = { ...consolidar(fuentesA.fuentes, { ...fuentesA, log: silencio }), debitos: fuentesA.debitosBanco }
    const compras = cache.get(`${ID}|Compras!A1:AN|UNFORMATTED_VALUE`)
    info = comprasComoQuedaria(compras ?? [], seleccion)
    comprasA = compras ?? []
    comprasB = info.filas
    const despues = await extraerDeLasFuentes(
      clienteCacheado(google, cache, {
        tcDeRespaldo, transformarCompras: (filas) => comprasComoQuedaria(filas, seleccion).filas,
      }), corte)
    B = consolidar(despues.fuentes, { ...despues, log: silencio })
  } finally {
    console.log = original
    console.warn = warn
  }

  console.log(`SIMULACIÓN SIN COMPRAS — corte ${isoDeSerial(corte)} · sólo lectura`)
  console.log(`  conjunto: ${LISTA ? `lista ${LISTA.split('/').pop()}` : 'regex de unidad (exploratorio)'}`
    + `${DESDE ? ` · sólo fecha de caja ≥ ${DESDE}` : ''}`)
  console.log(`  filas anuladas (X=ELIMINADO + neto/IVA/total/pagado en 0): ${info.anuladas}`
    + `${info.saltadas ? ` · ${info.saltadas} fuera del recorte de fecha` : ''}`
    + ` (unidades: ${[...info.unidades].map(([u, n]) => `${u} ${n}`).join(' · ')})`)
  for (const p of info.problemas) {
    console.log(`  ✖ fila ${p.fila}: ${p.motivo} — NO la anulo: la planilla se movió y marcarla a ciegas `
      + 'borraría otra compra')
  }
  console.log(`  libro TAL CUAL: ${A.consolidado.length} movimiento(s) · neto ${pesos(neto(A.consolidado))}`)
  console.log(`  libro VACIADO : ${B.consolidado.length} movimiento(s) · neto ${pesos(neto(B.consolidado))}`)

  const desdeExtracto = (A.debitos ?? []).reduce((a, d) => (a === null || d.fecha < a ? d.fecha : a), null)
  const difs = diferencias(netoPorRubroMes(A.consolidado), netoPorRubroMes(B.consolidado), desdeExtracto)
  console.log(`  el extracto de _BANCO_RAW empieza el ${isoDeSerial(desdeExtracto)}: lo anterior NO lo `
    + 'puede reponer ninguna fuente bancaria')

  // ═══ EL CRITERIO SE JUZGA POR CELDA (RUBRO × MES × ESTADO), NO POR NETO (auditoría, 11/09/2026) ═══
  //
  // El neto del rubro compensaba cosas que no se compensan: Gremiales perdía $4.458.876 REAL de junio a
  // agosto y salía ✓ porque la cadena agregaba PROYECTADO en otros meses; el SAC perdía $5.760.309 REAL
  // de junio y salía ✓ por el aguinaldo de diciembre. Un REAL que desaparece es un pago que el cuadro
  // ya no ve —cambia el saldo de ese mes y el arrastre de todos los siguientes— y un PROYECTADO de otro
  // mes no lo repone: son dos platas con fecha distinta y con estado distinto.
  //
  // ✓ exige que CADA celda REAL dentro de la ventana del extracto quede ≤ $1. Lo proyectado se informa
  // al lado, porque ahí un cambio puede ser una mejora (una línea que antes no existía).
  console.log('\n  LOS RUBROS QUE LA ORDEN PONE EN RIESGO — ✓ = ninguna celda REAL pierde con el extracto')
  console.log(`  ${'RUBRO'.padEnd(34)} ${'REAL pierde'.padStart(14)} ${'PROY pierde'.padStart(13)} ${'antes 28/05'.padStart(13)} ${'GANA'.padStart(13)}`)
  const malParado = []
  for (const r of CRITICOS) {
    const mio = difs.filter((d) => d.rubro === r)
    const realCon = sumarDif(mio, (d) => d.conExtracto && d.ventana === 'REAL', 'pierde')
    const proyCon = sumarDif(mio, (d) => d.conExtracto && d.ventana === 'FUTURO', 'pierde')
    const pierdeAntes = sumarDif(mio, (d) => !d.conExtracto, 'pierde')
    const gana = -sumarDif(mio, (d) => d.delta < 0)
    const ok = realCon <= 1
    if (!ok) malParado.push(`${r} ${pesos(realCon)} REAL`)
    console.log(`  ${ok ? '✓' : '✗'} ${r.slice(0, 32).padEnd(32)} ${pesos(realCon).padStart(14)} `
      + `${pesos(proyCon).padStart(13)} ${pesos(pierdeAntes).padStart(13)} ${pesos(gana).padStart(13)}`)
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

  // ═══ EL EFECTO FUERA DEL LIBRO: CAJA Y `sync-compras` SUMAN COMPRAS SIN MIRAR LA X ═══
  //
  // El auditor lo nombró y tenía razón: el libro saltea las filas anuladas, pero `caja-anexo-controles`
  // suma la columna O por SUMIFS, `direccion-retiros` filtra por O > 0 y `sync-compras` descarta la fila
  // sin importe. Medir sólo el libro deja ese daño afuera del informe.
  console.log('\n  EFECTO FUERA DEL LIBRO (lo que lee Compras directo, sin mirar la X)')
  for (const [nombre, valor] of efectoFueraDelLibro(comprasA, comprasB, corte)) {
    const [a, b] = valor
    console.log(`  ${nombre.padEnd(46)} ${pesos(a).padStart(15)} ${pesos(b).padStart(15)} ${pesos(Math.round((b - a) * 100) / 100).padStart(12)}`)
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
 * NÚCLEO PURO: lo que cambia en los consumidores que leen Compras DIRECTO, sin pasar por el libro.
 *
 * Tres, medidos en sus propios términos:
 *  · los egresos de los últimos 90 días que `caja-anexo-controles.mjs` usa para el ritmo de gasto
 *    (`SUMIFS(Compras!$O; AD>=TODAY()-90)`);
 *  · el pagado en efectivo, que esa misma pestaña suma por `(P="Efectivo")*N(T)`;
 *  · las filas que `sync-compras.mjs` dejaría de espejar en Postgres, porque descarta la fila sin
 *    importe — y con ellas se va lo que la web muestra de esas compras.
 *
 * @returns {Array<[string, [number, number]]>}
 */
export function efectoFueraDelLibro(antes = [], despues = [], corte = 0) {
  if (!antes.length) return []
  const c = columnasDeCompras(antes)
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const medir = (filas) => {
    let egr90 = 0; let efectivo = 0; let espejadas = 0
    for (let i = 3; i < filas.length; i++) {
      const f = filas[i] ?? []
      const total = num(f[COL_BISTURI.total])
      const fecha = num(f[c.fechaCaja])
      if (fecha >= corte - 90 && fecha <= corte) egr90 += total
      if (String(f[c.tipoPago] ?? '').trim().toLowerCase() === 'efectivo') efectivo += num(f[COL_BISTURI.pagado])
      if (total !== 0) espejadas += 1
    }
    return { egr90, efectivo, espejadas }
  }
  const a = medir(antes)
  const b = medir(despues)
  return [
    ['CAJA · egresos de Compras últimos 90 días', [a.egr90, b.egr90]],
    ['CAJA · pagado en efectivo (monto pagado)', [a.efectivo, b.efectivo]],
    ['sync-compras · filas con importe que se espejan', [a.espejadas, b.espejadas]],
  ]
}

/**
 * NÚCLEO PURO: lo que va a sumar una celda que lee el libro con ese filtro.
 *
 * Es la contracara en JavaScript de `terminoLibro`: mismos campos, misma semántica (`real: true` =
 * estado REAL, `false` = todavía no salió). No se puede reusar el constructor de fórmulas porque eso
 * devuelve texto para el Sheet; lo que se comparte es el FILTRO, que viaja en el mismo objeto.
 */
export function comoCelda(libro, f) {
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

// ═══ `main()` SÓLO COMO CLI (auditoría de cierre, 11/09/2026) ═══
//
// Este archivo EXPORTA funciones puras —`diferencias`, `comoCelda`, `netoPorSemana`,
// `comprasComoQuedaria`— que son justamente lo que decide el ✓/✗ del informe, así que tienen que poder
// probarse en frío. Sin esta guarda, importarlas para testearlas corría la simulación entera contra el
// Sheet vivo: dos corridas completas de lecturas cada vez que alguien ejecuta el test.
//
// `realpathSync` por el mismo motivo que en el generador del libro: el checkout de producción se alcanza
// por una ruta con enlaces y `import.meta.url` viene siempre resuelta.
const esCLI = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
if (esCLI) main().catch((e) => { console.error(e.message ?? e); process.exit(SALIDA_ERROR(e)) })
