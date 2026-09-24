#!/usr/bin/env node
// EL VIGÍA: SI EL SHEET CAMBIÓ, LA APP SE ENTERA EN MINUTOS, NO EN DOS HORAS.
//
// Pedido del dueño (24/09/2026): «quiero todo en tiempo real». El Cash Flow del Sheet ya es vivo
// (`_MOVIMIENTOS` apunta con fórmulas a Nómina, Cargas Sociales y Jornales), pero la app lee Postgres,
// y Postgres se copiaba del Sheet sólo en la corrida de cada 2 h. Este vigía corre cada 2 minutos
// (timer echegaray-vigia-sheet), pregunta a Drive la versión del archivo y, SÓLO si cambió desde la
// última copia, corre las dos sincronizaciones que alimentan la app:
//   · sync-flujo-fondos.mjs     `_MOVIMIENTOS` (valores ya recalculados) → public.flujo_*
//   · impuestos-a-postgres.mjs  «Impuestos y Financieros»               → public.impuesto_posicion
//
// NO rehace el libro ni ninguna pestaña: eso sigue siendo la corrida de 2 h. Si la corrida grande
// está en marcha, no se pisa con ella (candado de archivo). Una versión que no se pudo leer no
// dispara nada: el vigía falla cerrado y lo dice en el log.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, closeSync, unlinkSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DIR = join(homedir(), '.echegaray-os', 'vigia-sheet')
const ESTADO = join(DIR, 'ultima-version.json')
const CANDADO = join(DIR, 'corriendo.lock')
const PASOS = [
  ['orquestador/scripts/sync-flujo-fondos.mjs'],
  ['orquestador/scripts/impuestos-a-postgres.mjs', '--aplicar'],
]

function tomarCandado() {
  // Un candado de más de 15 minutos es de una vuelta que murió: sin esto el vigía quedaría trabado.
  try { if (Date.now() - statSync(CANDADO).mtimeMs > 15 * 60_000) unlinkSync(CANDADO) } catch { /* no había */ }
  try { const fd = openSync(CANDADO, 'wx'); writeFileSync(fd, String(process.pid)); closeSync(fd); return true } catch { return false }
}

async function main() {
  mkdirSync(DIR, { recursive: true })
  // La corrida grande escribe el libro: copiarlo a medio escribir sería publicar un número que no existe.
  const grande = spawnSync('systemctl', ['--user', 'is-active', 'echegaray-flujo-caja.service'], { encoding: 'utf8' }).stdout.trim()
  if (grande === 'active' || grande === 'activating') { console.log('· la corrida de 2 h está en marcha: espero a la próxima vuelta'); return }
  if (!tomarCandado()) { console.log('· otra vuelta del vigía sigue corriendo'); return }
  try {
    const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
    const v = await google.getVersion(ID)
    const version = String(v?.version ?? '')
    if (!version) { console.log('✗ Drive no devolvió la versión del archivo: no sincronizo a ciegas'); process.exitCode = 1; return }
    const previa = existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, 'utf8')).version : null
    if (previa === version) return
    console.log(`Sheet cambió (versión ${previa ?? '—'} → ${version}, modificado ${v.modifiedTime}): sincronizo la app`)
    let ok = true
    for (const [script, ...args] of PASOS) {
      const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 8 * 60_000 })
      const cola = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ')
      console.log(`  ${r.status === 0 ? '✓' : '✗'} ${script} · ${cola}`)
      if (r.status !== 0) ok = false
    }
    // Sólo se da por copiada la versión si las dos copias salieron bien: si una falló, la próxima
    // vuelta lo reintenta en vez de quedarse con la app atrasada y el vigía creyendo que está al día.
    if (ok) writeFileSync(ESTADO, JSON.stringify({ version, modifiedTime: v.modifiedTime, copiadaEn: new Date().toISOString() }))
    else process.exitCode = 1
  } finally {
    try { unlinkSync(CANDADO) } catch { /* ya no estaba */ }
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1 })
