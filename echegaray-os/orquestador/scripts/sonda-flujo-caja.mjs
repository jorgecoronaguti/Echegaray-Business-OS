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
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { closePool } from '../lib/db.mjs'
import { CASHFLOW_ID } from '../lib/cash-briefing.mjs'
import { borrarNotas, guardarNotas, leerNotas } from '../lib/proveedor-notas.mjs'
import {
  anteriorAJson, anteriorDeJson, edicionesDelDueno, observarCuadro, RANGO_PROVEEDORES,
} from '../lib/proveedores-notas-hoja.mjs'
import { vueltaDeSonda } from '../lib/sonda-flujo-caja.mjs'

const correr = promisify(execFile)
const SECO = process.argv.includes('--seco')
const UNIDAD_SYNC = 'echegaray-compras-sync.service'
const UNIDAD_PIPELINE = 'echegaray-flujo-caja.service'
// FUERA DEL REPO: producción corre desde otro checkout y el estado no es código.
const ESTADO = process.env.ORQ_SONDA_ESTADO
  || join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'echegaray-os', 'sonda-flujo-caja.json')

/** `activating` es un oneshot corriendo. Sin systemd de usuario, no hay nada corriendo que esperar. */
async function unidadCorriendo(unidad) {
  try {
    const { stdout } = await correr('systemctl', ['--user', 'show', '-p', 'ActiveState', '--value', unidad])
    return ['activating', 'active', 'reloading', 'deactivating'].includes(stdout.trim())
  } catch { return false }
}

async function leerEstado() {
  try { return JSON.parse(await readFile(ESTADO, 'utf8')) } catch { return null }
}

/** Escritura atómica: un corte a mitad de camino no deja un JSON roto que parezca «primera lectura». */
async function guardarEstado(e) {
  if (SECO) return
  await mkdir(dirname(ESTADO), { recursive: true })
  await writeFile(`${ESTADO}.tmp`, JSON.stringify(e))
  await rename(`${ESTADO}.tmp`, ESTADO)
}

async function sincronizarCompras() {
  if (SECO) { console.log(`[seco] lanzaría systemctl --user start ${UNIDAD_SYNC}`); return }
  // Bloqueante a propósito: si falla, la versión no se da por atendida (ver lib/sonda-flujo-caja.mjs).
  await correr('systemctl', ['--user', 'start', UNIDAD_SYNC], { timeout: 200_000 })
}

function notasDesde(google) {
  return async (anteriorJson) => {
    if (await unidadCorriendo(UNIDAD_PIPELINE)) {
      return { notas: anteriorJson, linea: 'notas: el pipeline del Flujo de Caja está corriendo — no leo «Qué hacer» a mitad de camino' }
    }
    const [visible, formulas] = await Promise.all([
      google.readSheetValues(CASHFLOW_ID, RANGO_PROVEEDORES, { render: 'FORMATTED_VALUE' }),
      google.readSheetValues(CASHFLOW_ID, RANGO_PROVEEDORES, { render: 'FORMULA' }),
    ])
    const r = edicionesDelDueno({
      observacion: observarCuadro({ visible: visible ?? [], formulas: formulas ?? [] }),
      anterior: anteriorDeJson(anteriorJson),
      enBase: await leerNotas(CASHFLOW_ID),
    })
    if (r.sinEvidencia) return { notas: anteriorJson, linea: `notas: ${r.sinEvidencia}` }
    if (!SECO) {
      await guardarNotas(CASHFLOW_ID, r.guardar)
      await borrarNotas(CASHFLOW_ID, r.borrar)
    }
    const partes = [
      `${r.guardar.length} guardada(s)${r.guardar.length ? ` (${r.guardar.map((g) => g.proveedor).join(', ')})` : ''}`,
      `${r.borrar.length} borrada(s)${r.borrar.length ? ` (${r.borrar.join(', ')})` : ''}`,
    ]
    if (r.retenidos.length) partes.push(`⚠ ${r.retenidos.length} borrado(s) RETENIDO(S) por exceder el tope: ${r.retenidos.join(', ')}`)
    if (r.desplazadas.length) partes.push(`${r.desplazadas.length} texto(s) movido(s) por la dinámica, no guardado(s): ${r.desplazadas.map((x) => `fila ${x.fila}`).join(', ')}`)
    return { notas: anteriorAJson(r.siguiente), linea: `${SECO ? '[seco] ' : ''}notas del Sheet: ${partes.join(' · ')}` }
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const r = await vueltaDeSonda({
    leerVersion: () => google.getVersion(CASHFLOW_ID),
    leerEstado,
    guardarEstado,
    syncCorriendo: () => unidadCorriendo(UNIDAD_SYNC),
    sincronizarCompras,
    sincronizarNotas: notasDesde(google),
    log: (s) => console.log(s),
  })
  await closePool()
  if (r.ok === false) process.exitCode = 1
}
main().catch(async (e) => { console.error('sonda-flujo-caja falló:', e.message); await closePool().catch(() => {}); process.exit(1) })
