#!/usr/bin/env node
// DESPLEGAR: llevar un commit de `origin/main` al checkout productivo y reiniciar lo que corresponda.
//
//   node orquestador/scripts/desplegar.mjs              → despliega origin/main
//   node orquestador/scripts/desplegar.mjs <sha>        → despliega ese commit (rollback incluido)
//   node orquestador/scripts/desplegar.mjs --estado     → qué está desplegado y desde cuándo
//   node orquestador/scripts/desplegar.mjs --dry        → dice qué haría, no toca nada
//
// La decisión de si avanza o no vive en `lib/despliegue.mjs` y se testea sin git. Acá están los
// efectos: fetch, checkout, restart, y la VERIFICACIÓN de que los servicios quedaron arriba —que es
// lo único que prueba un despliegue. Que el checkout haya devuelto 0 no prueba nada.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { decidirDespliegue, DAEMONS, unidadesARepuntar } from '../lib/despliegue.mjs'

const DIR_PROD = process.env.ORQ_DEPLOY_DIR || '/home/jorge/echegaray-os/produccion'
const DIR_DEV = '/home/jorge/echegaray-os/app'
const REGISTRO = path.join(os.homedir(), '.config', 'echegaray-orq', 'DESPLEGADO')
const APP = 'echegaray-os'

const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim()

const UNIDADES = path.join(os.homedir(), '.config', 'systemd', 'user')
const DIR_DEV_APP = '/home/jorge/echegaray-os/app/echegaray-os'

/**
 * ¿QUEDÓ ALGUNA UNIDAD MIRANDO AL ÁRBOL DE DESARROLLO?
 *
 * `unidadesARepuntar` existía y la usaba sólo su test — o sea, el BLOCKER que este despliegue dice
 * cerrar no tenía guardián ejecutable, y un `WorkingDirectory` que volviera al árbol de trabajo
 * pasaba el despliegue en verde. Lo marcó la auditoría del 27/08. Ahora se comprueba antes de tocar
 * nada: es barato, es determinístico, y es exactamente lo que el despliegue promete.
 */
function unidadesQueMiranADesarrollo() {
  let archivos = []
  try { archivos = fs.readdirSync(UNIDADES).filter((f) => f.endsWith('.service')) } catch { return [] }
  const unidades = archivos.map((nombre) => {
    let texto = ''
    try { texto = fs.readFileSync(path.join(UNIDADES, nombre), 'utf8') } catch { /* ilegible */ }
    return { nombre, texto }
  })
  return unidadesARepuntar(unidades, { dirDesarrollo: DIR_DEV_APP })
}
const git = (args, cwd = DIR_PROD) => sh('git', args, cwd)
const systemctl = (args) => sh('systemctl', ['--user', ...args])

function registroLeer() {
  try { return JSON.parse(fs.readFileSync(REGISTRO, 'utf8')) } catch { return null }
}

function estado() {
  const sueltas = unidadesQueMiranADesarrollo()
  console.log(sueltas.length
    ? `ATENCIÓN: ${sueltas.length} unidad(es) miran al árbol de desarrollo: ${sueltas.join(', ')}`
    : 'unidades: ninguna mira al árbol de desarrollo (salvo las declaradas de desarrollo)')
  const r = registroLeer()
  const vivo = git(['rev-parse', 'HEAD'])
  console.log(`checkout productivo: ${DIR_PROD}`)
  console.log(`HEAD:                ${vivo}  ${git(['log', '-1', '--format=%s'])}`)
  console.log(`registrado:          ${r ? `${r.sha} · ${r.desplegado_en} · por ${r.por}` : '(sin registro)'}`)
  if (r && r.sha !== vivo) console.log('ATENCIÓN: el registro y el HEAD del checkout NO coinciden.')
  for (const u of DAEMONS) {
    let act = 'desconocido'
    try { act = systemctl(['is-active', u]) } catch (e) { act = String(e.stdout ?? '').trim() || 'inactive' }
    console.log(`  ${act === 'active' ? '✔' : '✘'} ${u.padEnd(38)} ${act}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--estado')) return estado()
  const dry = args.includes('--dry')
  const forzar = args.includes('--forzar')
  const pedido = args.find((a) => !a.startsWith('--'))

  if (!fs.existsSync(path.join(DIR_PROD, '.git'))) {
    console.error(`no existe el checkout productivo en ${DIR_PROD}`)
    process.exit(2)
  }

  const sueltas = unidadesQueMiranADesarrollo()
  if (sueltas.length) {
    console.error(`estas unidades apuntan al árbol de desarrollo y no deberían: ${sueltas.join(', ')}`)
    console.error('desplegar así deja producción ejecutando el árbol donde se edita. NO avanzo.')
    process.exit(1)
  }

  git(['fetch', '--quiet', 'origin', 'main'])
  let objetivo = null
  try { objetivo = git(['rev-parse', pedido || 'origin/main']) } catch { objetivo = null }

  // «Está en main» es una pregunta de ancestría, no de nombre: un sha suelto que nunca se mergeó
  // pasa cualquier control por nombre y falla éste.
  let estaEnMain = false
  if (objetivo) {
    try { git(['merge-base', '--is-ancestor', objetivo, 'origin/main']); estaEnMain = true } catch { estaEnMain = false }
  }
  const sucios = git(['status', '--porcelain']).split('\n').filter(Boolean)
  const desplegado = git(['rev-parse', 'HEAD'])

  const d = decidirDespliegue({ objetivo, desplegado, estaEnMain, sucios, forzar })
  if (!d.avanza) {
    console.log(`NO AVANZA: ${d.motivo}`)
    if (d.sucios?.length) d.sucios.forEach((s) => console.log(`  ${s}`))
    process.exit(d.motivo === 'producción ya está en ese commit' ? 0 : 1)
  }

  console.log(`desplegar ${d.desde?.slice(0, 8) ?? '(nada)'} → ${objetivo.slice(0, 8)}  ${git(['log', '-1', '--format=%s', objetivo])}`)
  if (dry) { console.log('(--dry: no se tocó nada)'); return }

  git(['checkout', '--detach', '--quiet', objetivo])

  // node_modules NO está versionado y no se reinstala en cada despliegue: se enlaza por hardlink
  // desde el árbol de desarrollo la primera vez (0 bytes de disco, 0,4 s). Si el package-lock
  // cambió, esto lo dice en vez de arrastrar dependencias viejas en silencio.
  const nm = path.join(DIR_PROD, APP, 'node_modules')
  if (!fs.existsSync(nm)) {
    console.log('node_modules ausente: enlazando desde el árbol de desarrollo…')
    sh('cp', ['-al', path.join(DIR_DEV, APP, 'node_modules'), nm])
  }
  // El lock NO está versionado en este repo, así que la comparación es contra el que hay en el árbol
  // de desarrollo y sólo si existe: un aviso, no un bloqueo.
  const lockProd = path.join(DIR_PROD, APP, 'package-lock.json')
  const lockDev = path.join(DIR_DEV, APP, 'package-lock.json')
  if (fs.existsSync(lockProd) && fs.existsSync(lockDev)
      && fs.readFileSync(lockProd, 'utf8') !== fs.readFileSync(lockDev, 'utf8')) {
    console.log('AVISO: package-lock.json difiere del árbol de desarrollo — correr `npm ci` en producción.')
  }

  fs.writeFileSync(REGISTRO, `${JSON.stringify({
    sha: objetivo,
    asunto: git(['log', '-1', '--format=%s', objetivo]),
    desplegado_en: new Date().toISOString(),
    por: process.env.USER || 'desconocido',
    anterior: d.desde,
  }, null, 2)}\n`)

  console.log('reiniciando daemons…')
  for (const u of DAEMONS) {
    try { systemctl(['restart', u]) } catch (e) { console.log(`  ✘ ${u}: ${String(e.message).slice(0, 100)}`) }
  }
  await new Promise((r) => setTimeout(r, 3000))

  let todos = true
  for (const u of DAEMONS) {
    let act = 'inactive'
    try { act = systemctl(['is-active', u]) } catch (e) { act = String(e.stdout ?? '').trim() || 'inactive' }
    if (act !== 'active') todos = false
    console.log(`  ${act === 'active' ? '✔' : '✘'} ${u.padEnd(38)} ${act}`)
  }
  console.log(todos ? `DESPLEGADO ${objetivo}` : 'DESPLIEGUE INCOMPLETO: hay servicios que no quedaron activos')
  process.exit(todos ? 0 : 1)
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
