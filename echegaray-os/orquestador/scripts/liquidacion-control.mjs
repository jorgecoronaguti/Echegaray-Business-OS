#!/usr/bin/env node
// CONTROL DE LA LIQUIDACIÓN DE HORAS — SÓLO LECTURA.
//
//   node --env-file=.env.local orquestador/scripts/liquidacion-control.mjs                 # todas las quincenas abiertas
//   node --env-file=.env.local orquestador/scripts/liquidacion-control.mjs --desde 2026-09-16
//   … --json                                                                                # para un timer
//
// Arma el cuadro con los MISMOS servicios que la pantalla (`leerCuadroDeLaQuincena`) y le corre los siete controles de
// `liquidacion-control-reglas.mjs`. Salida: una línea por hallazgo, lo escrito a mano aparte, y `N controles · M
// hallazgos`. Exit 0 sin hallazgos · 1 con hallazgos · 2 si algo no se pudo leer: «no pude mirar» nunca es verde.
//
// ═══ POR QUÉ NO PUEDE ESCRIBIR ═══
// Corre con la clave de servicio, que puede todo. El cliente que reciben los servicios está envuelto: `insert`,
// `update`, `upsert`, `delete` y `rpc` lanzan antes de salir. Si un servicio de lectura empezara a escribir, este
// control se cae con «no pude mirar» en vez de tocar la base.
//
// ═══ POR QUÉ `persona_legajo` SE LEE DE `personas` ═══
// `persona_legajo` es una vista con portero (`es_administracion()`) y la clave de servicio no tiene sesión: devuelve
// vacío sin error, y el cuadro saldría sin CUIL (sin recibos del estudio). La tabla debajo de la vista trae las mismas
// columnas; es la forma en que ya se armaba el cuadro real fuera de la web (cierre 02/10).

import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { leerCuadroDeLaQuincena } from '../../src/features/administracion/services/cuadroDeLaQuincenaService.ts'
import { quincenaDe } from '../../src/features/administracion/services/quincena.ts'
import { periodosQueCorresponden } from '../../src/features/administracion/services/recibosDelEstudio.ts'
import { estadoDelCuadro } from '../../src/features/administracion/services/estadoDelCuadro.ts'
import { codigoDeSalida, controlarQuincena, rotuloDeQuincena, textoDelInforme } from './liquidacion-control-reglas.mjs'

const ESCRITURAS = new Set(['insert', 'update', 'upsert', 'delete'])
/**
 * Las únicas funciones que la lectura del cuadro llama, todas `stable` (no pueden escribir). Una que no esté acá se
 * bloquea y el control dice «no pude mirar»: agregarla es una decisión, no un descuido.
 */
const RPC_DE_LECTURA = new Set(['sesion_es_de_prueba'])

/** El cliente de sólo lectura: la misma API de supabase-js, sin ninguna vía de escritura. */
export function clienteDeLectura(real) {
  const soloLectura = (builder, tabla) => new Proxy(builder, {
    get(t, k) {
      if (ESCRITURAS.has(k)) return () => { throw new Error(`control de sólo lectura: ${String(k)} sobre ${tabla} bloqueado`) }
      const v = t[k]
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
  return new Proxy(real, {
    get(t, k) {
      if (k === 'from') return (tabla) => soloLectura(t.from(tabla === 'persona_legajo' ? 'personas' : tabla), tabla)
      if (k === 'rpc') {
        return (fn, ...resto) => {
          if (!RPC_DE_LECTURA.has(fn)) throw new Error(`control de sólo lectura: rpc ${fn} bloqueado`)
          return t.rpc(fn, ...resto)
        }
      }
      const v = t[k]
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
}

/** Hoy en San Juan: la fecha con la que la pantalla decide qué días ya pasaron. */
const hoyEnSanJuan = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' })

/** PostgREST corta en 1.000 filas y contesta 200: llegar al tope es no haber visto todo. */
const TOPE = 1000
async function leer(consulta, que) {
  const { data, error } = await consulta
  if (error) throw new Error(`${que}: ${error.message}`)
  if ((data ?? []).length >= TOPE) throw new Error(`${que}: llegó al tope de ${TOPE} filas, la lectura puede estar cortada`)
  return data ?? []
}

async function quincenasAbiertas(sb) {
  const filas = await leer(sb.from('liquidacion_quincena').select('desde, hasta').eq('estado', 'abierta'), 'liquidacion_quincena')
  const unicas = new Map(filas.map((f) => [f.desde, { desde: f.desde, hasta: f.hasta }]))
  return [...unicas.values()].sort((a, b) => a.desde.localeCompare(b.desde))
}

/** Lo que el cuadro no trae y los controles 5–7 cruzan: la base de pagos, los RP y los recibos del estudio. */
async function leerBase(sb, q) {
  const cabeceras = await leer(sb.from('liquidacion_quincena').select('id').eq('desde', q.desde).eq('hasta', q.hasta), 'liquidacion_quincena')
  const ids = cabeceras.map((c) => c.id)
  const periodos = periodosQueCorresponden('mensual', q.desde)
  const [lineas, pagos, espejo, rps, estudio, nomina] = await Promise.all([
    leer(sb.from('liquidacion_linea').select('id, persona_id, liquidacion_id, pagado_efectivo, adelanto_manual').in('liquidacion_id', ids), 'liquidacion_linea'),
    leer(sb.from('liquidacion_pago_efectivo').select('linea_id, importe, origen, nota').in('liquidacion_id', ids), 'liquidacion_pago_efectivo'),
    leer(sb.from('jornales_bloque_persona').select('persona_id, adelanto').gte('quincena_desde', q.desde).lte('quincena_desde', q.hasta)
      .not('adelanto', 'is', null), 'jornales_bloque_persona'),
    leer(sb.from('recibo_pago_efectivo').select('codigo, persona_id, linea_id, liquidacion_id, concepto, importe, anulado_en')
      .like('concepto', 'Diferencia de pago%'), 'recibo_pago_efectivo'),
    leer(sb.from('recibo_sueldo_linea').select('persona_id, cuil, periodo, neto').in('periodo', periodos), 'recibo_sueldo_linea'),
    leer(sb.from('nomina_recibo_neto').select('cuil, periodo, neto').in('periodo', periodos), 'nomina_recibo_neto'),
  ])
  const espejoAdelanto = new Map()
  for (const e of espejo) espejoAdelanto.set(e.persona_id, (espejoAdelanto.get(e.persona_id) ?? 0) + Number(e.adelanto))
  return { lineas, pagos, espejoAdelanto, liquidaciones: new Set(ids), rps, estudio, nomina }
}

/** Una quincena: el cuadro de la pantalla + la base, y los controles. Lo que no se pudo leer va a `noPude`. */
async function mirarQuincena(sb, q, hoy, noPude) {
  const rotulo = rotuloDeQuincena(q)
  try {
    const cuadro = await leerCuadroDeLaQuincena(sb, q, hoy)
    // LA PANTALLA SE DEGRADA EN SILENCIO ANTE UNA LECTURA FALLIDA; EL CONTROL NO: un cuadro a medias no se controla.
    if (cuadro.liquidacion.errores.length > 0) {
      for (const e of cuadro.liquidacion.errores) noPude.push(`${rotulo} · ${e.que}: ${e.error}`)
      return null
    }
    const cerrados = new Set(cuadro.liquidacion.cuadros.map((c) => c.grupo)
      .filter((g) => estadoDelCuadro(cuadro.liquidacion.estados, g).estado === 'cerrada'))
    const base = await leerBase(sb, q)
    return controlarQuincena({ quincena: q, filas: cuadro.filas, cuadros: cuadro.liquidacion.cuadros, cerrados, base })
  } catch (e) {
    noPude.push(`${rotulo} · ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

const arg = (argv, n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null)

async function main(argv) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  const json = argv.includes('--json')
  const noPude = []
  const informes = []
  const desde = arg(argv, '--desde')
  if (!url || !clave) noPude.push('falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (correr con --env-file)')
  else if (desde != null && (!/^\d{4}-\d{2}-(01|16)$/.test(desde))) noPude.push(`--desde ${desde}: una quincena empieza el 01 o el 16`)
  else {
    const sb = clienteDeLectura(createClient(url, clave, { auth: { autoRefreshToken: false, persistSession: false } }))
    let quincenas = []
    try { quincenas = desde ? [quincenaDe(desde)] : await quincenasAbiertas(sb) } catch (e) { noPude.push(String(e?.message ?? e)) }
    const hoy = hoyEnSanJuan()
    for (const q of quincenas) {
      const i = await mirarQuincena(sb, q, hoy, noPude)
      if (i) informes.push(i)
    }
  }
  const codigo = codigoDeSalida(informes, noPude)
  if (json) console.log(JSON.stringify({ codigo, informes, noPude }, null, 2))
  else console.log(textoDelInforme(informes, noPude))
  process.exitCode = codigo
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2))
