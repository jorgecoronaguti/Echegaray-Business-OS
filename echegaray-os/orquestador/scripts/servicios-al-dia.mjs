#!/usr/bin/env node
// ¿QUÉ DAEMON DE PRODUCCIÓN ARRANCÓ ANTES DEL ÚLTIMO CAMBIO DEL CHECKOUT? — SÓLO LECTURA.
//
// ═══ EL DEFECTO QUE MIRA (23/09/2026) ═══
//
// `produccion-al-dia.mjs` avanza el checkout de producción, pero un daemon que ya estaba corriendo
// sigue con el código viejo en memoria y systemd lo muestra `active`. No hay ningún error: el bot
// contesta, el worker toma tareas, y todo con la lógica de ayer. Este chequeo es el control externo:
// no le pregunta al script que reinicia si reinició, le pregunta a systemd CUÁNDO arrancó cada
// daemon y a git CUÁNDO cambió el disco. Un control nunca se valida contra la información que
// produce lo que controla.
//
// «Último cambio del checkout» es el momento en que HEAD SE MOVIÓ (reflog), no la fecha del commit:
// un commit hecho a las 10:00 en desarrollo puede llegar al checkout de producción a las 12:00, y
// un daemon reiniciado a las 11:00 sigue viejo. Si el reflog no está (checkout recién clonado), se
// cae a la fecha del commit y lo dice.
//
// Uso:  node orquestador/scripts/servicios-al-dia.mjs [ruta-del-checkout] [--json]
// Sale con 1 si algún daemon activo arrancó antes del último cambio del checkout; con 2 si no pudo
// leer git o systemd. No escribe nada, no reinicia nada: eso lo hace produccion-al-dia.mjs.

import { execFileSync } from 'node:child_process'
import { DAEMONS_DEL_REPO } from './produccion-al-dia.mjs'

const args = process.argv.slice(2)
const REPO = args.find((a) => !a.startsWith('--')) ?? '/home/jorge/echegaray-os/produccion/echegaray-os'
const JSON_SALIDA = args.includes('--json')

/**
 * NÚCLEO PURO: el veredicto de un daemon, dado su estado, su arranque (epoch en segundos) y el
 * momento del último cambio del checkout (epoch en segundos).
 *
 * @returns {{ veredicto: 'al-dia'|'atrasado'|'no-activo'|'sin-dato', porQue: string }}
 */
export function evaluarServicio({ activeState, arranque, cambioCheckout }) {
  if (activeState !== 'active') {
    // Parado no es atrasado: no tiene código en memoria. Y si está parado, suele ser a propósito.
    return { veredicto: 'no-activo', porQue: `está ${activeState || 'sin estado'}: no hay código viejo en memoria` }
  }
  if (!Number.isFinite(arranque) || !Number.isFinite(cambioCheckout)) {
    return { veredicto: 'sin-dato', porQue: 'no tengo el momento de arranque o el del último cambio del checkout' }
  }
  if (arranque < cambioCheckout) {
    return { veredicto: 'atrasado', porQue: `arrancó ${formatear(arranque)}, el checkout cambió ${formatear(cambioCheckout)}: lleva el código anterior en memoria` }
  }
  return { veredicto: 'al-dia', porQue: `arrancó ${formatear(arranque)}, después del último cambio (${formatear(cambioCheckout)})` }
}

/** Código de salida del chequeo: 1 si hay al menos un atrasado. Puro, para probarlo. */
export function codigoDeSalida(veredictos) {
  return veredictos.some((v) => v === 'atrasado') ? 1 : 0
}

function formatear(epoch) {
  return new Date(epoch * 1000).toLocaleString('es-AR', { timeZone: 'America/Argentina/San_Juan', hour12: false })
}

function git(a) {
  return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim()
}

/** Momento en que HEAD se movió por última vez (reflog). Si no hay reflog, la fecha del commit. */
export function leerCambioCheckout() {
  const head = git(['log', '-1', '--format=%h %cI %s'])
  const [hash, fechaCommit, ...resto] = head.split(' ')
  const commit = { hash, fechaCommit, asunto: resto.join(' ') }
  const reflog = (() => {
    try { return git(['reflog', 'show', '--date=iso-strict', '-n1', 'HEAD']) } catch { return '' }
  })()
  const fecha = parsearFechaReflog(reflog)
  if (fecha) return { ...commit, cambio: fecha, fuente: 'reflog' }
  return { ...commit, cambio: Math.floor(Date.parse(fechaCommit) / 1000), fuente: 'fecha del commit (sin reflog)' }
}

/** `d89e2693 HEAD@{2026-09-23T08:46:33-03:00}: merge origin/main: Fast-forward` → epoch en segundos. */
export function parsearFechaReflog(linea) {
  // Sólo ISO: `HEAD@{0}` es un selector por posición, y Date.parse("0") devuelve el año 2000 sin quejarse.
  const iso = linea.match(/HEAD@\{(\d{4}-\d{2}-\d{2}T[^}]+)\}/)?.[1]
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

/** `ActiveEnterTimestamp=@1790163993` (con `--timestamp=unix`) → 1790163993. Vacío → null. */
export function parsearEpoch(valor) {
  const m = String(valor ?? '').match(/^@?(\d+)$/)
  return m ? Number(m[1]) : null
}

function leerServicios(unidades) {
  const salida = execFileSync(
    'systemctl',
    ['--user', 'show', '--timestamp=unix', '--property=Id,ActiveState,SubState,ActiveEnterTimestamp,NRestarts', ...unidades],
    { encoding: 'utf8' },
  )
  const out = {}
  for (const bloque of salida.split(/\n\s*\n/)) {
    const prop = (p) => bloque.match(new RegExp(`^${p}=(.*)$`, 'm'))?.[1]
    const id = prop('Id')
    if (!id) continue
    out[id] = { activeState: prop('ActiveState'), subState: prop('SubState'), arranque: parsearEpoch(prop('ActiveEnterTimestamp')), reinicios: prop('NRestarts') }
  }
  return out
}

function main() {
  let checkout
  let servicios
  try {
    checkout = leerCambioCheckout()
    servicios = leerServicios(DAEMONS_DEL_REPO.map((d) => d.unit))
  } catch (e) {
    console.error(`servicios-al-día: no pude leer git o systemd (${String(e?.message ?? e).slice(0, 160)})`)
    process.exit(2)
  }

  const filas = DAEMONS_DEL_REPO.map(({ unit }) => {
    const s = servicios[unit] ?? {}
    const { veredicto, porQue } = evaluarServicio({ activeState: s.activeState, arranque: s.arranque, cambioCheckout: checkout.cambio })
    return { unit, veredicto, activeState: s.activeState ?? null, subState: s.subState ?? null, arranque: s.arranque ?? null, reinicios: s.reinicios ?? null, porQue }
  })
  const codigo = codigoDeSalida(filas.map((f) => f.veredicto))

  if (JSON_SALIDA) {
    console.log(JSON.stringify({ repo: REPO, checkout, filas, codigo }, null, 2))
  } else {
    console.log(`checkout ${REPO}`)
    console.log(`HEAD ${checkout.hash} «${checkout.asunto}» — último cambio ${formatear(checkout.cambio)} (${checkout.fuente})`)
    const ancho = Math.max(...filas.map((f) => f.unit.length))
    for (const f of filas) {
      console.log(`  ${f.veredicto.padEnd(9)} ${f.unit.padEnd(ancho)}  ${f.activeState ?? '?'}/${f.subState ?? '?'}  ${f.porQue}`)
    }
    const atrasados = filas.filter((f) => f.veredicto === 'atrasado').map((f) => f.unit)
    console.log(atrasados.length
      ? `ATRASADOS (${atrasados.length}): ${atrasados.join(', ')} → systemctl --user restart ${atrasados.join(' ')}`
      : 'todos los daemons activos arrancaron después del último cambio del checkout')
  }
  process.exit(codigo)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
