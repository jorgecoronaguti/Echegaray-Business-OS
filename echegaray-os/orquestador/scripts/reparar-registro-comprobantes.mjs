#!/usr/bin/env node
// REPARA EL REGISTRO DE LO CARGADO CONTRA LA PESTAÑA COMPRAS. LEE EL SHEET, ESCRIBE SÓLO EN POSTGRES.
//
// ═══ QUÉ TOCA Y QUÉ NO ═══
//
// Toca `comunicacion.comprobantes_cargados`, que es el RASTRO informativo de lo que el bot escribió:
// las columnas `fila`, `numero` y `total`. No toca `clave` —la barrera de deduplicación— y no escribe
// una sola celda de ningún Sheet: la única llamada a Google es `readSheetValues`. El freno de mano de
// Sheets no lo afecta porque no hay nada que frenar.
//
// El porqué de cada decisión está en `lib/comprobantes/reparacion-registro.mjs`, que es donde vive
// toda la lógica y donde la prueban los tests. Este archivo es el borde: lee, muestra, y —si se lo
// piden con todas las letras— aplica.
//
// ═══ ENSAYO POR DEFECTO ═══
//
//   node orquestador/scripts/reparar-registro-comprobantes.mjs              # ENSAYO: muestra y no toca
//   node orquestador/scripts/reparar-registro-comprobantes.mjs --json       # el plan, para consumirlo
//   node orquestador/scripts/reparar-registro-comprobantes.mjs --solo-fila  # sólo la columna `fila`
//   node orquestador/scripts/reparar-registro-comprobantes.mjs --aplicar    # ESCRIBE en Postgres
//
// Sin `--aplicar` no se escribe nada, y `--aplicar` vuelve a LEER la celda de cada fila antes de cada
// UPDATE: entre el plan y la escritura pasan segundos, y en esos segundos el dueño puede estar
// cargando comprobantes a mano. El UPDATE va condicionado a que la entrada siga como estaba.

import { RANGO, registroDeFila } from '../lib/comprobantes/auditoria.mjs'
import { planDeReparacion, informeDelPlan, confirmaLaCelda } from '../lib/comprobantes/reparacion-registro.mjs'
import { normalizar } from '../lib/carga-comprobantes.mjs'

export const ID_CASHFLOW = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/**
 * NOMBRE NORMALIZADO → CUIT, de fuentes INDEPENDIENTES del registro que se está auditando.
 *
 * Un control no se valida contra la información que él mismo produce: por eso el mapa NO se arma con
 * `comprobantes_cargados`, aunque ahí sobren pares (nombre, CUIT). Las dos fuentes legítimas son la
 * pestaña `Proveedores` del Sheet —donde el CUIT lo carga una persona— y `public.proveedores` más el
 * libro fiscal de ARCA, que trae la razón social exacta del organismo.
 *
 * UN NOMBRE CON DOS CUIT SE DESCARTA. En estos datos «VILLA DEL PINO» aparece con dos CUIT distintos:
 * emparejar por el primero que llegue sería inventar una identidad. Sin alias, el cruce cae al nombre
 * y al número+importe, que es exactamente lo que hacía antes.
 *
 * Nunca lanza: sin fuentes devuelve un mapa vacío y todo se comporta como si no existiera.
 */
export async function cuitPorProveedor({ google = null, port = null } = {}) {
  const vistos = new Map()
  const sumar = (nombre, cuit) => {
    const n = normalizar(nombre ?? '')
    const c = String(cuit ?? '').replace(/\D/g, '')
    if (!n || c.length !== 11) return
    const ya = vistos.get(n)
    if (ya && ya !== c) { vistos.set(n, '∅'); return }
    if (!ya) vistos.set(n, c)
  }
  try {
    const { proveedoresPorCuit } = await import('../lib/comprobantes/listas.mjs')
    for (const [cuit, nombre] of await proveedoresPorCuit(google)) sumar(nombre, cuit)
  } catch { /* sin la pestaña Proveedores quedan las otras fuentes */ }
  try {
    const { nombresPorCuit } = await import('../comunicacion/comprobantes/repositorio.mjs')
    for (const [cuit, nombres] of await nombresPorCuit(port)) for (const n of nombres) sumar(n, cuit)
  } catch { /* sin base, idem */ }
  const out = new Map()
  for (const [n, c] of vistos) if (c !== '∅') out.set(n, c)
  return out
}

/** El registro entero, con el importe ya numérico. Devuelve null —no [] — si no se puede consultar. */
export async function registroCompleto(port) {
  if (typeof port?.query !== 'function') return null
  const { rows } = await port.query(
    `select clave, cuit, tipo, numero, proveedor, total, fila, hoja, creado_at
       from comunicacion.comprobantes_cargados
      where coalesce(hoja,'Compras') = 'Compras'
      order by creado_at`)
  return rows.map((r) => ({ ...r, total: r.total == null ? null : Number(r.total) }))
}

/** Arma el plan. `google` y `port` entran inyectados para poder probarlo sin red. */
export async function planear({ google, port, soloFila = false } = {}) {
  // SIN `render`: los valores llegan FORMATEADOS en es-AR, que es el contrato de toda la pila de
  // comprobantes. Con UNFORMATTED_VALUE el punto decimal se lee como separador de miles.
  const filas = (await google.readSheetValues(ID_CASHFLOW, RANGO)) ?? []
  const compras = filas.map(registroDeFila).filter((r) => r.proveedor || r.numero || r.total != null)
  const entradas = await registroCompleto(port)
  if (!Array.isArray(entradas)) throw new Error('no se pudo leer comunicacion.comprobantes_cargados: no reparo a ciegas')
  const alias = await cuitPorProveedor({ google, port })
  return { ...planDeReparacion(entradas, compras, { cuitPorProveedor: alias, soloFila }), compras, alias }
}

/**
 * APLICA el plan, releyendo la celda antes de cada UPDATE.
 *
 * Dos guardas, no una:
 *   · se vuelve a correr `confirmaLaCelda` sobre la fila concreta (la relectura del enunciado), y
 *   · el UPDATE lleva en el `where` los valores VIEJOS de los campos que cambia. Si otro camino tocó
 *     esa entrada entre el plan y ahora, el update no afecta ninguna fila y se informa en vez de
 *     pisar lo que hizo el otro.
 *
 * @returns {Promise<{aplicados:Array, rechazados:Array}>}
 */
export async function aplicar({ port, plan, compras }) {
  const porFila = new Map(compras.map((c) => [c.fila, c]))
  const aplicados = []
  const rechazados = []
  for (const c of plan.cambios) {
    const celda = porFila.get(c.filaReal)
    if (!celda) { rechazados.push({ ...c, motivo: 'la fila desapareció entre el plan y la escritura' }); continue }
    // LA RELECTURA. No se confía del plan: se vuelve a preguntar si esa celda confirma este comprobante.
    const g = confirmaLaCelda(entradaDeCambio(c), celda, {})
    if (!g.confirma) { rechazados.push({ ...c, motivo: `la relectura no confirmó: ${g.motivo}` }); continue }
    const campos = c.campos
    const sets = campos.map((k, i) => `${k.campo} = $${i + 2}`)
    const donde = campos.map((k, i) => `${k.campo} is not distinct from $${i + 2 + campos.length}`)
    const params = [c.clave, ...campos.map((k) => k.nuevo), ...campos.map((k) => k.viejo)]
    const { rowCount } = await port.query(
      `update comunicacion.comprobantes_cargados set ${sets.join(', ')}
        where clave = $1 and ${donde.join(' and ')}`, params)
    if (rowCount) aplicados.push(c)
    else rechazados.push({ ...c, motivo: 'la entrada cambió entre el plan y la escritura: no la pisé' })
  }
  return { aplicados, rechazados }
}

/** El cambio, visto como la entrada del registro que era. Es lo que necesita `confirmaLaCelda`. */
function entradaDeCambio(c) {
  const viejo = (n) => c.campos.find((k) => k.campo === n)?.viejo
  return {
    clave: c.clave,
    cuit: (c.clave ?? '').startsWith('c:') ? (c.clave ?? '').slice(2).split('|')[0] : null,
    proveedor: c.proveedor,
    numero: c.campos.some((k) => k.campo === 'numero') ? viejo('numero') : c.numero,
    total: c.campos.some((k) => k.campo === 'total') ? viejo('total') : c.celda.total,
    fila: c.filaRegistrada,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const soloFila = args.includes('--solo-fila')
  const escribir = args.includes('--aplicar')

  const { makeGoogleClient } = await import('../lib/google.mjs')
  const google = await makeGoogleClient()
  const db = await import('../lib/db.mjs')
  const port = { query: (...a) => db.query(...a) }

  const plan = await planear({ google, port, soloFila })
  let resultado = null
  if (escribir) resultado = await aplicar({ port, plan, compras: plan.compras })

  if (json) {
    process.stdout.write(`${JSON.stringify({
      cambios: plan.cambios, salteadas: plan.salteadas, sinCambio: plan.sinCambio, resultado,
    }, null, 2)}\n`)
  } else {
    process.stdout.write(`${informeDelPlan(plan, { aplicado: escribir })}\n`)
    if (!escribir) {
      process.stdout.write('\n_ENSAYO: no se escribió nada. Para aplicarlo: `--aplicar`._\n')
    } else {
      process.stdout.write(`\n${resultado.aplicados.length} aplicado(s), ${resultado.rechazados.length} rechazado(s).\n`)
      for (const r of resultado.rechazados) process.stdout.write(`· ${r.clave}: ${r.motivo}\n`)
    }
  }
  await db.closePool?.().catch?.(() => {})
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e?.stack ?? e); process.exitCode = 1 })
}
