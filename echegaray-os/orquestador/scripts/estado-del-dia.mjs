#!/usr/bin/env node
// ESTADO DEL DÍA — el resumen diario para el bot. Determinístico: SÓLO LEE (git, GitHub, systemd,
// journal, el Sheet de sólo lectura) y arma un mensaje de a lo sumo 25 líneas en español. No hace
// ninguna llamada a un LLM.
//
// Junta:
//   · los commits de HOY en origin/main (cantidad + asunto recortado a 70 caracteres)
//   · el estado de Vercel del último sha de main (gh api .../commits/<sha>/status)
//   · los servicios systemd de usuario echegaray-* en estado FAILED, y el resumen de los demás
//   · la última línea que auditar-cash-flow-contra-libro.mjs dejó en el journal (el script no tiene
//     `--resumen` y esta herramienta NUNCA lo corre para conseguir el dato — sólo relee lo que ya
//     quedó registrado; si nunca corrió, lo dice)
//   · el «Saldo final» de diciembre 2026 del Cash Flow Mensual (lectura de sólo lectura del Sheet)
//
//   node orquestador/scripts/estado-del-dia.mjs --solo-mostrar     imprime, no envía
//   node orquestador/scripts/estado-del-dia.mjs                    lo manda por avisar-al-dueno.mjs
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { APP_DIR, REPO_ROOT } from '../lib/config.mjs'
import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { CASHFLOW_ID, parseMonto } from '../lib/cash-briefing.mjs'

const ejecutar = promisify(execFile)
const bandera = (n) => process.argv.includes(`--${n}`)

// ═══ 1) COMMITS DE HOY EN origin/main ═══
export async function commitsDeHoy(cwd = APP_DIR, ahora = new Date()) {
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0)
  try { await ejecutar('git', ['fetch', 'origin', 'main', '--quiet'], { cwd, timeout: 30000 }) } catch { /* si no hay red, se sigue con lo que haya en local */ }
  const { stdout } = await ejecutar('git', [
    'log', 'origin/main', `--since=${inicio.toISOString()}`, `--until=${ahora.toISOString()}`,
    '--pretty=format:%H%x01%s',
  ], { cwd, timeout: 15000 })
  const lineas = stdout.split('\n').filter(Boolean)
  return lineas.map((l) => { const [sha, asunto] = l.split('\u0001'); return { sha: sha.slice(0, 7), asunto: (asunto || '').slice(0, 70) } })
}

export async function ultimoShaMain(cwd = APP_DIR) {
  const { stdout } = await ejecutar('git', ['rev-parse', 'origin/main'], { cwd, timeout: 15000 })
  return stdout.trim()
}

export async function ownerRepo(cwd = APP_DIR) {
  const { stdout } = await ejecutar('git', ['remote', 'get-url', 'origin'], { cwd, timeout: 10000 })
  const m = stdout.trim().match(/[/:]([^/:]+)\/([^/]+?)(\.git)?$/)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

// ═══ 2) VERCEL DEL ÚLTIMO SHA ═══
export async function estadoVercel(sha) {
  const or = await ownerRepo()
  if (!or) return { estado: 'DESCONOCIDO', detalle: 'no pude leer el remoto de git' }
  try {
    const { stdout } = await ejecutar('gh', ['api', `repos/${or.owner}/${or.repo}/commits/${sha}/status`], { timeout: 20000 })
    const j = JSON.parse(stdout)
    const vercel = (j.statuses || []).find((s) => /vercel/i.test(s.context || '')) || j.statuses?.[0]
    return { estado: j.state || 'DESCONOCIDO', detalle: vercel?.description || vercel?.context || '' }
  } catch (e) {
    return { estado: 'DESCONOCIDO', detalle: `gh api falló: ${String(e.message || e).slice(0, 100)}` }
  }
}

// ═══ 3) SYSTEMD — servicios de usuario echegaray-* ═══
export async function serviciosEchegaray() {
  try {
    const { stdout } = await ejecutar('systemctl', ['--user', 'list-units', 'echegaray-*.service', '--all', '--no-legend', '--plain'], { timeout: 15000 })
    const filas = stdout.split('\n').filter(Boolean).map((l) => {
      const [unidad, carga, activo, sub, ...resto] = l.trim().split(/\s+/)
      return { unidad, carga, activo, sub, descripcion: resto.join(' ') }
    })
    const fallidos = filas.filter((f) => f.activo === 'failed' || f.sub === 'failed')
    return { total: filas.length, fallidos, activos: filas.filter((f) => f.activo === 'active').length }
  } catch (e) {
    return { total: 0, fallidos: [], activos: 0, error: String(e.message || e).slice(0, 120) }
  }
}

// ═══ 4) ÚLTIMO RESULTADO DEL AUDITOR CASH-FLOW↔LIBRO, DESDE EL JOURNAL — NUNCA SE CORRE ACÁ ═══
// El script no tiene `--resumen`. Esta función NO lo ejecuta: sólo relee lo que auditar-cash-flow-
// contra-libro.mjs ya dejó escrito en el journal de journalctl (si algún día corre dentro de un
// pipeline que loguea a systemd). Si nunca corrió, lo dice — no se inventa un resultado.
const PATRONES_AUDITOR = [
  /las dos vistas muestran exactamente lo que dice el libro/,
  /no muestran el mismo per[ií]odo/,
  /LAS VISTAS MUESTRAN del/,
]
export async function ultimoResultadoAuditor() {
  try {
    const { stdout } = await ejecutar('journalctl', ['--user', '--since', '30 days ago', '-o', 'short-iso'], { timeout: 20000, maxBuffer: 32 * 1024 * 1024 })
    const lineas = stdout.split('\n')
    for (let i = lineas.length - 1; i >= 0; i -= 1) {
      const l = lineas[i]
      if (PATRONES_AUDITOR.some((re) => re.test(l))) {
        const fechaM = l.match(/^(\S+)/)
        return { encontrado: true, linea: l.replace(/^.*?:\s*/, '').slice(0, 160), fecha: fechaM?.[1] || null }
      }
    }
    return { encontrado: false }
  } catch (e) {
    return { encontrado: false, error: String(e.message || e).slice(0, 120) }
  }
}

// ═══ 5) CF MENSUAL — «Saldo final» de la columna «dic 26» ═══
export async function saldoFinalDic26() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const filas = await google.readSheetValues(CASHFLOW_ID, "'Cash Flow Mensual'!A1:Z80")
  const iHeader = filas.findIndex((r) => /^\s*concepto\s*$/i.test(String(r?.[0] ?? '')))
  if (iHeader < 0) return { encontrado: false, motivo: 'no encontré la fila «Concepto»' }
  const cabecera = filas[iHeader]
  const iCol = cabecera.findIndex((c) => /^\s*dic\s*26\s*$/i.test(String(c ?? '')))
  if (iCol < 0) return { encontrado: false, motivo: 'no encontré la columna «dic 26»' }
  const fila = filas.slice(iHeader + 1).find((r) => /^\s*saldo final\s*$/i.test(String(r?.[0] ?? '')))
  if (!fila) return { encontrado: false, motivo: 'no encontré la fila «Saldo final»' }
  return { encontrado: true, valor: parseMonto(fila[iCol]) }
}

const pesos = (n) => '$' + Math.round(n).toLocaleString('es-AR')

// ═══ FORMATO DEL MENSAJE — PURA, se prueba con fixtures sin salir a la red ═══
export function formatearMensaje({ fecha, commits, shaMain, vercel, servicios, auditor, cf }) {
  const L = []
  L.push(`📋 Estado del día — ${fecha}`)
  L.push('')
  L.push(`Commits en main hoy: ${commits.length}`)
  for (const c of commits.slice(0, 6)) L.push(`  · ${c.sha} ${c.asunto}`)
  if (commits.length > 6) L.push(`  · … y ${commits.length - 6} más`)
  L.push('')
  L.push(`Vercel (${shaMain ? shaMain.slice(0, 7) : '—'}): ${vercel.estado === 'success' ? '✓' : vercel.estado === 'DESCONOCIDO' ? '？' : '✗'} ${vercel.estado}${vercel.detalle ? ' — ' + vercel.detalle : ''}`)
  L.push('')
  if (servicios.error) L.push(`Servicios systemd: DESCONOCIDO (${servicios.error})`)
  else if (servicios.fallidos.length === 0) L.push(`Servicios systemd: ${servicios.activos} activos de ${servicios.total}, ninguno en FAILED`)
  else {
    L.push(`Servicios systemd: ${servicios.fallidos.length} en FAILED (de ${servicios.total}, ${servicios.activos} activos)`)
    for (const f of servicios.fallidos.slice(0, 5)) L.push(`  · ${f.unidad}`)
  }
  L.push('')
  if (auditor.encontrado) L.push(`Auditor cash-flow↔libro (${auditor.fecha || 'fecha desconocida'}): ${auditor.linea}`)
  else L.push('Auditor cash-flow↔libro: DESCONOCIDO — sin corridas registradas en el journal (no se corrió para generar este aviso)')
  L.push('')
  if (cf.encontrado) L.push(`CF Mensual — Saldo final dic 26: ${pesos(cf.valor)} [CIERRE PROYECTADO, no es caja de hoy]`)
  else L.push(`CF Mensual — Saldo final dic 26: DESCONOCIDO (${cf.motivo})`)
  return L.slice(0, 25).join('\n')
}

async function main() {
  const soloMostrar = bandera('solo-mostrar')
  const ahora = new Date()
  const dd = String(ahora.getDate()).padStart(2, '0')
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const fecha = `${dd}/${mm}/${ahora.getFullYear()}`

  const [commits, servicios, auditor, cf] = await Promise.all([
    commitsDeHoy().catch((e) => { console.error('commits falló:', e.message); return [] }),
    serviciosEchegaray(),
    ultimoResultadoAuditor(),
    saldoFinalDic26().catch((e) => ({ encontrado: false, motivo: `error leyendo el Sheet: ${String(e.message || e).slice(0, 100)}` })),
  ])
  const shaMain = await ultimoShaMain().catch(() => null)
  const vercel = shaMain ? await estadoVercel(shaMain) : { estado: 'DESCONOCIDO', detalle: 'sin sha de origin/main' }

  const mensaje = formatearMensaje({ fecha, commits, shaMain, vercel, servicios, auditor, cf })

  if (soloMostrar) { console.log(mensaje); return }

  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(REPO_ROOT, 'echegaray-os', 'orquestador', 'scripts', 'avisar-al-dueno.mjs')], { stdio: ['pipe', 'inherit', 'inherit'] })
    p.on('error', reject)
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`avisar-al-dueno salió con código ${code}`))))
    p.stdin.write(mensaje)
    p.stdin.end()
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('estado-del-dia falló:', e.stack || e.message); process.exitCode = 1 })
}
