#!/usr/bin/env node
// LA SONDA DEL FLUJO DE CAJA — cada minuto, por `echegaray-sonda-flujo-caja.timer`.
//
// Pregunta a Drive si el archivo cambió; si cambió, corre el sync de Compras (su propia unidad, con su
// lock y su timeout) y lee la columna «Qué hacer» de Proveedores para traer a `public.proveedor_notas`
// lo que el dueño escribió o borró a mano. La lógica vive en `lib/sonda-flujo-caja.mjs` y
// `lib/proveedores-notas-hoja.mjs`, probadas con dobles; acá sólo se cablea.
//
// NO ESCRIBE UNA SOLA CELDA DEL SHEET: el cliente de Google se abre con alcance de SÓLO LECTURA.
//
//   node orquestador/scripts/sonda-flujo-caja.mjs           # una vuelta
//   node orquestador/scripts/sonda-flujo-caja.mjs --seco    # dice qué haría: no lanza el sync, no toca la
//                                                           # base ni el estado (sí lee Drive y el Sheet)
//   --archivo=<id> (o ORQ_CASHFLOW_ID)                      # otro archivo: una COPIA para probar. No lanza
//                                                           # el sync de producción y usa su propio estado.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { closePool, query } from '../lib/db.mjs'
import { CASHFLOW_ID } from '../lib/cash-briefing.mjs'
import { anteriorAJson, anteriorDeJson } from '../lib/proveedores-notas-hoja.mjs'
import { rescatarNotas } from '../lib/proveedores-notas-rescate.mjs'
import { guardarEstado, leerEstado, rutaDelEstado } from '../lib/sonda-estado.mjs'
import { vueltaDeSonda } from '../lib/sonda-flujo-caja.mjs'

const correr = promisify(execFile)
const SECO = process.argv.includes('--seco')
/** `--archivo=<id>` u `ORQ_CASHFLOW_ID`: para probar contra una COPIA del Flujo de Caja. */
const ARCHIVO = process.argv.find((a) => a.startsWith('--archivo='))?.slice('--archivo='.length)
  || process.env.ORQ_CASHFLOW_ID || CASHFLOW_ID
const ES_EL_REAL = ARCHIVO === CASHFLOW_ID
const UNIDAD_SYNC = 'echegaray-compras-sync.service'
const UNIDAD_PIPELINE = 'echegaray-flujo-caja.service'
/** El espejo de CAJA (18/09/2026): `scripts/sync-caja-espejo.mjs`, sólo lee el Sheet. */
const UNIDAD_CAJA = 'echegaray-caja-espejo.service'
const ESTADO = rutaDelEstado(ARCHIVO)

/** `activating` es un oneshot corriendo. Sin systemd de usuario, no hay nada corriendo que esperar. */
async function unidadCorriendo(unidad) {
  try {
    const { stdout } = await correr('systemctl', ['--user', 'show', '-p', 'ActiveState', '--value', unidad])
    return ['activating', 'active', 'reloading', 'deactivating'].includes(stdout.trim())
  } catch { return false }
}

async function sincronizarCompras() {
  // El sync lee SIEMPRE el Flujo de Caja real: contra una copia, lanzarlo no probaría nada.
  if (!ES_EL_REAL) { console.log(`archivo de prueba ${ARCHIVO}: no lanzo el sync de Compras de producción`); return }
  if (SECO) { console.log(`[seco] lanzaría systemctl --user start ${UNIDAD_SYNC}`); return }
  // Bloqueante a propósito: si falla, la versión no se da por atendida (ver lib/sonda-flujo-caja.mjs).
  await correr('systemctl', ['--user', 'start', UNIDAD_SYNC], { timeout: 200_000 })
}

/** SIN BLOQUEAR: la unidad tiene su propio timeout y no corre dos veces a la vez (oneshot). */
async function sincronizarCaja() {
  if (!ES_EL_REAL) return
  if (SECO) { console.log(`[seco] lanzaría systemctl --user start --no-block ${UNIDAD_CAJA}`); return }
  await correr('systemctl', ['--user', 'start', '--no-block', UNIDAD_CAJA], { timeout: 20_000 })
}

function notasDesde(google) {
  return async (anteriorJson) => {
    if (await unidadCorriendo(UNIDAD_PIPELINE)) {
      return { omitida: true, linea: 'notas: el pipeline arrancó en el medio — no leo «Qué hacer» y la versión queda sin atender' }
    }
    const r = await rescatarNotas({ google, fileId: ARCHIVO, query, anterior: anteriorDeJson(anteriorJson), escribir: !SECO })
    if (r.sinEvidencia) return { notas: anteriorJson, linea: `notas: ${r.sinEvidencia}` }
    const partes = [
      `${r.guardar.length} guardada(s)${r.guardar.length ? ` (${r.guardar.map((g) => g.proveedor).join(', ')})` : ''}`,
      `${r.borrar.length} borrada(s)${r.borrar.length ? ` (${r.borrar.join(', ')})` : ''}`,
    ]
    if (r.retenidos.length) {
      partes.push(`⚠ ${r.retenidos.length} borrado(s) RETENIDO(S): ${r.retenidos.join(', ')} — `
        + (r.constancias === null ? 'sin la cola (20260917T1410) quedan sólo en este log' : `${r.constancias} constancia(s) nueva(s) en la app`))
    }
    if (r.desplazadas.length) partes.push(`${r.desplazadas.length} texto(s) movido(s) por la dinámica, no guardado(s): ${r.desplazadas.map((x) => `fila ${x.fila}`).join(', ')}`)
    return { notas: anteriorAJson(r.siguiente), linea: `${SECO ? '[seco] ' : ''}notas del Sheet: ${partes.join(' · ')}` }
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const r = await vueltaDeSonda({
    leerVersion: () => google.getVersion(ARCHIVO),
    leerEstado: () => leerEstado(ESTADO),
    guardarEstado: (e) => (SECO ? undefined : guardarEstado(ESTADO, e)),
    syncCorriendo: () => unidadCorriendo(UNIDAD_SYNC),
    pipelineCorriendo: () => unidadCorriendo(UNIDAD_PIPELINE),
    sincronizarCompras,
    sincronizarCaja,
    sincronizarNotas: notasDesde(google),
    log: (s) => console.log(s),
  })
  await closePool()
  if (r.ok === false) process.exitCode = 1
}
main().catch(async (e) => { console.error('sonda-flujo-caja falló:', e.message); await closePool().catch(() => {}); process.exit(1) })
