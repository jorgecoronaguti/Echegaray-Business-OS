#!/usr/bin/env node
// TOPE DE CONTEXTO — GLOBAL. Va en ~/.claude/settings.json (PreToolUse *) y corre en TODA sesión de la
// máquina: nueva, reanudada, en un worktree o fuera del repo. Lo instala scripts/recursos/instalar.sh.
//
// 28/09/2026 — el dueño: «que esas optimizaciones se respeten en todas las sesiones de claude». Nació
// cubriendo sólo subagentes. 29/09: también la sesión principal — lecturas enteras de archivos grandes
// y crecimiento del contexto (la lógica, pura y con tests, está en .claude/hooks/tope-contexto-agente.mjs).
//
// LA LIB ES LA COPIA INSTALADA AL LADO (tope-lib.mjs), no el checkout de producción: un hook global que
// importa de un checkout se rompe —en silencio— el día que ese checkout cambia de forma.
//
// SIN DOBLES. En el repo corre además el hook del proyecto, que sólo niega por tope de SUBAGENTE: acá
// ese tope se salta cuando `enRepo`. La lectura y el crecimiento de la sesión principal los hace SÓLO
// este hook, así que no hay dos negaciones ni dos avisos del mismo evento.
//
// Registro: una línea en topes.jsonl por negación o aviso (y por evento de subagente, como antes).
// NUNCA ROMPE: sin la lib, sin transcript o ante cualquier error, sale 0 en silencio.
import fs from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = dirname(fileURLToPath(import.meta.url))
const RAIZ = process.env.ECOS_RAIZ || resolve(BIN, '..')
const REG = join(RAIZ, 'topes.jsonl')
const SES = join(RAIZ, 'sesiones')
const anotar = (x) => { try { fs.appendFileSync(REG, JSON.stringify({ t: new Date().toISOString(), ...x }) + '\n') } catch {} }
const salir = (hso) => { if (hso) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...hso } })); process.exit(0) }

try {
  let s = ''; for await (const c of process.stdin) s += c
  const ev = JSON.parse(s)
  const lib = await import(join(BIN, 'tope-lib.mjs'))
  const dir = process.env.CLAUDE_PROJECT_DIR ?? ''
  const enRepo = fs.existsSync(`${dir}/.claude/hooks/tope-contexto-agente.mjs`) || fs.existsSync(`${dir}/echegaray-os/.claude/hooks/tope-contexto-agente.mjs`)

  // 1. Tope de subagente (retomar o seguir pidiendo herramientas por encima de 250k).
  const { modo, ruta, id } = lib.rutaDelAgente(ev)
  if (modo) {
    const contexto = lib.contextoDelTranscript(ruta)
    const motivo = lib.decidir({ modo, contexto })
    anotar({ modo, id, tool: ev.tool_name, contexto, niega: !!motivo, enRepo })
    if (motivo && !enRepo) salir({ permissionDecision: 'deny', permissionDecisionReason: motivo })
    if (modo === 'reanudar') process.exit(0)
  }

  // 2. Lectura entera y crecimiento (sesión principal; la lectura también vale para subagentes).
  const contexto = modo ? lib.contextoDelTranscript(ruta) : lib.contextoDelTranscript(ev.transcript_path)
  const archivo = lib.archivoDeLectura(ev.tool_name, ev.tool_input)
  let tamano = null
  if (archivo) { try { tamano = fs.statSync(resolve(ev.cwd ?? process.cwd(), archivo)).size } catch {} }
  // El aviso de crecimiento es de la conversación principal: un subagente ya tiene su tope propio.
  const clave = String(ev.session_id ?? '').replace(/[^\w-]/g, '')
  const marca = clave && join(SES, `${clave}.tope.json`)
  let banda = Infinity
  if (!modo && marca) { banda = 0; try { banda = JSON.parse(fs.readFileSync(marca, 'utf8')).banda ?? 0 } catch {} }
  const r = lib.decidirPrincipal({ tool: ev.tool_name, input: ev.tool_input, contexto, tamano, banda })
  if (r.banda && marca) { try { fs.mkdirSync(SES, { recursive: true }); fs.writeFileSync(marca, JSON.stringify({ banda: r.banda })) } catch {} }
  if (r.niega || r.aviso) anotar({ modo: modo ?? 'principal', sesion: clave, tool: ev.tool_name, contexto, archivo, tamano, niega: !!r.niega, aviso: !!r.aviso })
  if (r.niega) salir({ permissionDecision: 'deny', permissionDecisionReason: r.niega })
  if (r.aviso) salir({ additionalContext: r.aviso })
} catch { /* nunca rompe */ }
process.exit(0)
