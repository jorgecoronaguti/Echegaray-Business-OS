#!/usr/bin/env node
// KNOWLEDGE REUSE, MEDIDO CONTRA LA BASE REAL. Sólo lee.
//
//   node orquestador/scripts/xsas-planreal-reuso.mjs [--cotizacion <uuid>]
//
// ═══ DE DÓNDE SALE CADA NÚMERO ═══
//
// El numerador y el denominador NO se deducen del resultado: se leen de las tablas que registran la
// procedencia en el momento en que la decisión se tomó.
//
//   · PRECIO       `public.recurso_precio_resolucion` — trae `fuente` (de dónde salió el candidato)
//                  y `resultado` (si la decisión cerró sola o terminó en una persona). Las DOS hacen
//                  falta: un candidato de la Base Maestra que terminó en `NECESITA_HUMANO` usó el
//                  conocimiento propio y NO resolvió con él.
//   · MAPEO        `cotizacion_partida.tarea_tipo_id` — enganchada a la Base Maestra o no.
//   · APRENDIZAJE  `public.conocimiento_empresa` en estado VALIDADO. Un CANDIDATO no se aplica: por
//                  gobernanza todavía no es conocimiento reutilizable, es una hipótesis.
//
// ═══ LO QUE ESTE SCRIPT NO PUEDE HACER ═══
//
// No sabe qué aprendizaje se aplicó a QUÉ decisión: `conocimiento_empresa` no registra consumo. Por
// eso la familia «aprendizaje» entra con lo que hoy es cierto —cuántos VALIDADO existen— y si no hay
// ninguno la familia aporta cero elegibles, no cero reuso. La diferencia importa: cero elegibles no
// baja la tasa; cero reuso sí.

import { getPool } from '../lib/db.mjs'
import { reusoDeConocimiento, ORIGEN_ES_REUSO } from '../lib/cotizador/metricas.mjs'
import { FUENTE_DE_ORIGEN, RESULTADO } from '../lib/cotizador/precio-resolucion.mjs'

const cotArg = process.argv.includes('--cotizacion') ? process.argv[process.argv.indexOf('--cotizacion') + 1] : null

/** La tabla guarda la FUENTE del contrato; la métrica razona en ORIGEN. Se invierte el mapeo que ya
 *  existe en vez de escribir uno nuevo: dos tablas de equivalencia se desincronizan en un mes. */
const ORIGEN_DE_FUENTE = Object.fromEntries(Object.entries(FUENTE_DE_ORIGEN).map(([o, f]) => [f, o]))

/** Una decisión cerrada por el sistema. `NECESITA_HUMANO` y `SIN_PRECIO` NO cerraron. */
const CERRO = Object.freeze({ [RESULTADO.VIGENTE]: true, [RESULTADO.ACTUALIZADO]: true, [RESULTADO.NECESITA_HUMANO]: false, [RESULTADO.SIN_PRECIO]: false })

async function main() {
  const pool = getPool()
  try {
    const { rows: res } = await pool.query('select resultado, fuente from public.recurso_precio_resolucion')
    const resoluciones = res.map((r) => ({
      // `origen: null` cuando la fuente no corresponde a ningún origen de precio (FALTA_DATO). Eso
      // la manda a «sin procedencia», que es lo honesto: no es reuso ni deja de serlo, no se sabe.
      origen: ORIGEN_DE_FUENTE[r.fuente] ?? null,
      resuelta: CERRO[r.resultado] ?? null,
    })).map((r) => (typeof r.resuelta === 'boolean' ? r : { origen: r.origen }))

    const filtroCot = cotArg ? 'where cotizacion_id = $1' : ''
    const { rows: [map] } = await pool.query(
      `select count(*)::int total, count(tarea_tipo_id)::int mapeadas from public.cotizacion_partida ${filtroCot}`,
      cotArg ? [cotArg] : [])
    const mapeos = [
      ...Array.from({ length: map.mapeadas }, () => ({ estado: 'MAPEADA' })),
      ...Array.from({ length: map.total - map.mapeadas }, () => ({ estado: 'SIN_PARTIDA' })),
    ]

    const { rows: [con] } = await pool.query("select count(*) filter (where tipo = 'VALIDADO')::int validados, count(*) filter (where tipo = 'CANDIDATO')::int candidatos from public.conocimiento_empresa where vigente")
    // Un VALIDADO existe pero nadie registra que se haya CONSUMIDO en una decisión. Entra como cero
    // elegibles hasta que exista ese registro: inventar el consumo sería fabricar el numerador.
    const aprendizajesAplicados = []

    const m = reusoDeConocimiento({ resoluciones, mapeos, aprendizajesAplicados })

    console.log('\n═══ KNOWLEDGE REUSE ═══')
    console.table([{
      estado: m.knowledge_reuse_estado,
      tasa: typeof m.knowledge_reuse_rate === 'number' ? `${(m.knowledge_reuse_rate * 100).toFixed(1)} %` : m.knowledge_reuse_rate,
      numerador: m.knowledge_reuse_numerador,
      denominador: m.knowledge_reuse_denominador,
      elegibles: m.knowledge_reuse_elegibles,
      'sin procedencia': m.knowledge_reuse_sin_procedencia,
      cobertura: typeof m.knowledge_reuse_cobertura === 'number' ? `${(m.knowledge_reuse_cobertura * 100).toFixed(1)} %` : m.knowledge_reuse_cobertura,
    }])
    console.log('POR FAMILIA')
    console.table(Object.entries(m.knowledge_reuse_por_familia).map(([familia, v]) => ({ familia, ...v })))
    console.log('LAS RESOLUCIONES DE PRECIO, COMO ESTÁN REGISTRADAS')
    console.table(await (async () => (await pool.query(
      `select fuente, resultado, count(*)::int, coalesce(bool_or(true) filter (where false), false) x
         from public.recurso_precio_resolucion group by 1,2 order by 3 desc`)).rows.map((r) => ({
      fuente: r.fuente, resultado: r.resultado, n: r.count,
      'origen': ORIGEN_DE_FUENTE[r.fuente] ?? '— (no es un origen de precio)',
      'cuenta como reuso': ORIGEN_ES_REUSO[ORIGEN_DE_FUENTE[r.fuente]] === true && CERRO[r.resultado] === true,
    })))())
    console.log(`\nCONOCIMIENTO DE LA EMPRESA: ${con.validados} VALIDADO · ${con.candidatos} CANDIDATO`)
    if (!con.validados) console.log('⚠ ningún VALIDADO: la familia «aprendizaje» aporta 0 elegibles, que NO es lo mismo que 0 reuso.')
    console.log('⚠ nadie registra qué aprendizaje se aplicó a qué decisión: esa familia NO se puede medir todavía.')
  } finally {
    await pool.end()
  }
}

await main()
