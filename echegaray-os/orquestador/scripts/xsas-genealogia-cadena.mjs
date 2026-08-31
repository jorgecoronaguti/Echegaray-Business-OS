// LA CADENA ENTERA, RECONSTRUIDA — DE LA EVIDENCIA AL DATO REAL Y DE VUELTA.
//
// ═══ QUÉ TIENE QUE PODER HACER UN AUDITOR CON ESTO ═══
//
// Agarrar un número del presupuesto y llegar hasta la frase del plano de donde salió, sin
// preguntarle nada a nadie. Y al revés: agarrar un parte de obra y llegar al mismo plano. Los once
// eslabones son DOCUMENTO, ELEMENTO, COMPUTO, PARTIDA, COMPOSICION, RECURSO, PRICE_OBSERVATION,
// COSTO, QUOTE_VERSION, WORK_ACTIVITY, ACTUAL.
//
// ═══ LO QUE ESTE SCRIPT MIDIÓ SOBRE LOS DATOS REALES (31/08/2026) ═══
//
// NINGUNA cotización real tiene la cadena completa. Está partida en dos mitades que no se tocan:
//   · COT-2026-001 v1 (congelada, obra `quattropani`): tiene de PARTIDA hasta ACTUAL —231 líneas de
//     composición, 26 actividades de obra, 3 ejecuciones— y CERO filas en `computo`. Sus 26
//     cantidades no tienen documento de origen.
//   · COT-XSAS-* : tienen `computo` con documento, lámina y la frase literal del plano, y no tienen
//     composición, ni congelado, ni obra.
// O sea: los eslabones existen todos, pero nunca sobre la misma cotización. Por eso este script
// hace dos cosas distintas — recorre lo REAL y dice dónde se corta, y arma una fixture con los once
// eslabones poblados para demostrar que la cadena SE PUEDE recorrer entera cuando los datos están.
//
// USO:  node orquestador/scripts/xsas-genealogia-cadena.mjs

import { getPool } from '../lib/db.mjs'
import { crearBorradorValido, congelarBorrador } from './xsas-freeze-fixture.mjs'

export const ESLABONES = Object.freeze([
  'DOCUMENTO', 'ELEMENTO', 'COMPUTO', 'PARTIDA', 'COMPOSICION', 'RECURSO',
  'PRICE_OBSERVATION', 'COSTO', 'QUOTE_VERSION', 'WORK_ACTIVITY', 'ACTUAL',
])

/** Qué eslabones trajo la cadena. Un `[]` es un HUECO declarado, no un eslabón ausente: la
 *  diferencia es todo el punto — un hueco visible se puede ir a buscar. */
export function eslabonesPresentes(cadena) {
  const tiene = (k) => {
    const v = cadena?.[k]
    if (v === null || v === undefined) return false
    if (Array.isArray(v)) return v.length > 0
    if (k === 'COSTO') return v.costo_partida !== null && v.costo_partida !== undefined
    if (k === 'ACTUAL') return (v.ejecuciones ?? []).length > 0 || (v.costo_real ?? []).length > 0
    return true
  }
  const presentes = ESLABONES.filter(tiene)
  return { presentes, faltantes: ESLABONES.filter((k) => !tiene(k)), completa: presentes.length === ESLABONES.length }
}

const cadenaDe = async (c, partidaId) => (await c.query('select public.xsas_genealogia_cadena($1) as v', [partidaId])).rows[0].v

/** Recorre TODAS las partidas reales y dice dónde se corta cada cadena. Sólo lectura. */
async function barridoReal(c) {
  const { rows } = await c.query(`select p.id, p.codigo, c.numero, c.version
    from public.cotizacion_partida p join public.cotizaciones c on c.id = p.cotizacion_id
    order by c.numero, c.version, p.orden`)
  const resumen = new Map()
  let mejor = null
  for (const p of rows) {
    const e = eslabonesPresentes(await cadenaDe(c, p.id))
    const k = `${p.numero} v${p.version}`
    const r = resumen.get(k) ?? { n: 0, max: 0, faltantes: null }
    r.n++
    if (e.presentes.length > r.max) { r.max = e.presentes.length; r.faltantes = e.faltantes }
    resumen.set(k, r)
    if (!mejor || e.presentes.length > mejor.n) mejor = { n: e.presentes.length, partida: p, faltantes: e.faltantes }
  }
  return { resumen, mejor }
}

/** Le agrega a la fixture los dos eslabones de obra, para poder recorrer la cadena entera. Usa una
 *  obra que YA existe: crear una obra canónica para una prueba sería fabricar un proyecto. */
async function completarConObra(c, fx) {
  const { rows: [obra] } = await c.query('select id from public.obra_canonica limit 1')
  if (!obra) return { obraId: null, porQue: 'no hay ninguna obra canónica en esta base' }
  const { rows: [act] } = await c.query(`insert into public.obra_actividad
    (obra_id, nombre, tipo, orden, estado, fuente, clave, metodo_avance, unidad, cantidad_objetivo,
     cotizacion_partida_id, analisis_id, tarea_tipo_id, hh_plan)
    values ($1, 'ZZ-XSAS Tabique de hormigón armado', 'tarea', 9990, 'en_curso', 'ZZ-XSAS',
            $2, 'cantidad', 'm3', $3, $4, $5, $6, 100) returning id`,
  [obra.id, `zz-xsas-${fx.sufijo}`, fx.cantidad, fx.partidaId, fx.analisisId, fx.tareaTipoId])
  await c.query(`insert into public.obra_ejecucion (obra_id, actividad_id, fecha, cantidad, fuente, metodo)
    values ($1, $2, current_date, 7.5, 'ZZ-XSAS', 'cantidad')`, [obra.id, act.id])
  await c.query(`insert into public.obra_partida_costo_real
    (obra_id, cotizacion_partida_id, actividad_id, tipo, recurso_nombre, unidad, cantidad,
     precio_unitario, monto, moneda, fecha, proveedor, comprobante, fuente)
    values ($1, $2, $3, 'MATERIAL', 'Hormigón H21 elaborado', 'm3', 7.5, 158000, 1185000, 'ARS',
            current_date, 'Proveedor de prueba', 'ZZ-XSAS-FC-0001', 'ZZ-XSAS')`,
  [obra.id, fx.partidaId, act.id])
  return { obraId: obra.id, actividadId: act.id }
}

function imprimirCadena(cad) {
  for (const k of ESLABONES) {
    const v = cad[k]
    const n = Array.isArray(v) ? v.length : 1
    const muestra = Array.isArray(v) ? JSON.stringify(v[0] ?? null) : JSON.stringify(v)
    console.log(`  ${k.padEnd(18)} ${Array.isArray(v) ? `${n}×` : '  '} ${muestra.slice(0, 190)}`)
  }
}

async function main() {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    console.log('══ BARRIDO DE LO REAL — dónde se corta cada cadena ══')
    const { resumen, mejor } = await barridoReal(c)
    for (const [k, r] of resumen) console.log(`  ${k.padEnd(30)} ${r.n} partidas · mejor cadena ${r.max}/11 · faltan: ${r.faltantes.join(', ') || '—'}`)
    console.log(`\n  la cadena real más larga: ${mejor.partida.numero} v${mejor.partida.version} / ${mejor.partida.codigo} → ${mejor.n}/11`)
    console.log('  CADENA REAL:')
    imprimirCadena(await cadenaDe(c, mejor.partida.id))

    console.log('\n══ CADENA COMPLETA SOBRE LA FIXTURE — los once eslabones ══')
    const fx = await crearBorradorValido(c)
    // ═══ HAY QUE CONGELAR ANTES DE RECORRER ═══
    // `cotizacion_partida_composicion` NACE en el congelado: es el snapshot de la composición, no un
    // borrador de ella. Sobre el DRAFT la cadena da 7/11 —faltan COMPOSICION, RECURSO,
    // PRICE_OBSERVATION y COSTO— y eso no es un hueco de datos: es que todavía no hay nada
    // congelado que mirar. Medido antes de agregar esta línea.
    if (!await congelarBorrador(c, fx)) console.log('  NO_MEDIDO: sin perfil `direccion` no se puede congelar, y sin congelar no hay composición')
    const obra = await completarConObra(c, fx)
    const cad = await cadenaDe(c, fx.partidaId)
    const e = eslabonesPresentes(cad)
    console.log(`  completa=${e.completa} · ${e.presentes.length}/11 · faltan: ${e.faltantes.join(', ') || '—'}`)
    imprimirCadena(cad)

    console.log('\n══ LA VUELTA — del parte de obra al plano ══')
    const { rows: [ej] } = await c.query('select id from public.obra_ejecucion where actividad_id = $1', [obra.actividadId])
    const { rows: [v] } = await c.query('select public.xsas_genealogia_desde_ejecucion($1) as v', [ej.id])
    console.log(`  ejecución ${v.v.ejecucion_id} · ${v.v.cantidad_real} ejecutados el ${v.v.fecha}`)
    console.log(`  → partida ${v.v.cadena.PARTIDA.codigo} → elemento ${JSON.stringify(v.v.cadena.ELEMENTO[0])}`)
    console.log(`  → documento ${JSON.stringify(v.v.cadena.DOCUMENTO[0])}`)
    console.log(`  → la frase: ${v.v.cadena.COMPUTO[0]?.criterio}`)
    console.log(`  ${v.v.porQue}`)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
    await getPool().end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
