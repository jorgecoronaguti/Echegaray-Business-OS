// CATÁLOGO DE CAPACIDADES (las skills de `.claude/skills/`) — UNA sola lista.
//
// El problema que resuelve: las 44 skills eran archivos en disco y nada más. `skill-map.mjs`
// decide cuáles se inyectan por capacidad (18 de las 44), `context-assembler.mjs` las lee del
// disco, `seed-inteligencia-organizacional.mjs` registraba 26 en `public.knowledge_frameworks`
// — y ningún lugar podía contestar "¿qué capacidades tiene el OS, cuáles están conectadas y
// cuáles no llega a usar nadie?". Este módulo es la lectura canónica del disco, y
// `scripts/xsas-skills-sync.mjs` la proyecta a `knowledge_frameworks` (la tabla que YA existía;
// no se crea ninguna nueva).
//
// FUENTE DE VERDAD = EL DISCO. La tabla es una proyección consultable, nunca al revés: si alguien
// edita una fila a mano, la próxima corrida del sync la vuelve a poner igual al archivo.
//
// Nada de esto se inventa: cada campo sale del frontmatter de la SKILL.md, del mapa de capacidades
// en código, o de la existencia verificable de un módulo del OS en disco. Los campos que las
// SKILL.md NO declaran (inputs, outputs, fuentes estructuradas, permisos finos) quedan ausentes —
// no se rellenan con suposiciones.
import { readdir, readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CAPABILITY_SKILLS } from './skill-map.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SKILLS_DIR = path.join(REPO_ROOT, '.claude', 'skills')

// ── Área dueña de cada skill ────────────────────────────────────────────────────────────────
// Vivía dentro de `scripts/seed-inteligencia-organizacional.mjs`, que era el único escritor de
// `knowledge_frameworks`. Ahora hay dos escritores (el seed y el sync) y un mapa duplicado sería
// la trampa de siempre: dos definiciones del mismo hecho que se corrigen una sola vez. Vive acá.
// Sólo las que tienen dueño INEQUÍVOCO; las metodológicas no son de un área de negocio y van con
// área nula (antes quedaban directamente FUERA del catálogo, que es peor: invisibles).
export const SKILL_AREA = {
  'costos-presupuestacion': 'comercial',
  'derecho-construccion-contratos': 'contabilidad_legales',
  'contabilidad-constructoras': 'contabilidad_legales',
  'impuestos-construccion': 'contabilidad_legales',
  'derecho-laboral-construccion': 'personas',
  'seguridad-higiene-art': 'personas',
  'finanzas-tesoreria-construccion': 'administracion_finanzas',
  'administracion-operativa-construccion': 'administracion_finanzas',
  'cash-flow-operativo': 'administracion_finanzas',
  'arquitectura-integracion-finanzas-obras': 'administracion_finanzas',
  'google-sheets-business-systems': 'administracion_finanzas',
  'compras-abastecimiento-subcontratacion': 'compras',
  'equipos-flota-construccion': 'compras',
  'ingenieria-civil-construccion': 'obras',
  'direccion-obra': 'obras',
  'planificacion-produccion': 'obras',
  'calidad-obra': 'calidad',
  'gestion-empresarial-riesgos': 'gestion_general',
  'orquestador-de-razonamiento-y-skills': 'gestion_general',
  'reportes-automaticos-y-comunicaciones': 'gestion_general',
  'orden-documental-dataroom': 'gestion_general',
  'lectura-drive-documentos-multiformato': 'gestion_general',
  'integraciones-apis-sistemas-externos': 'gestion_general',
  'web-ux-deploy-operacion-producto': 'gestion_general',
  'discovery-drive-echegaray': 'gestion_general',
  'appsheet-desarrollo': 'gestion_general',
  // Dominio financiero que el seed no registraba (no estaban en su mapa): existen, tienen dueño.
  'admin-finanzas-sheets-clase-mundial': 'administracion_finanzas',
  'financial-engineering': 'administracion_finanzas',
  'lectura-bancaria-impacto-sheet': 'administracion_finanzas',
  'carga-gastos-multimedia': 'administracion_finanzas',
  'tesoreria-inversiones-corporativas': 'administracion_finanzas',
  // El contrato de diseño de app.ecsas.com.ar: es del producto interno, no de un área de obra.
  'diseno-ui-ux-producto-os': 'gestion_general',
  // Cómo el OS arma una presentación: sirve a todas las áreas, no es de ninguna.
  'crear-presentacion-google-slides': 'gestion_general',
  // Cómo el OS genera una imagen original. Misma naturaleza que la de Slides: transversal.
  'generar-imagen': 'gestion_general',
}

// ── Skills que NO son de este OS ────────────────────────────────────────────────────────────
// Vinieron de una plantilla genérica y proponen un stack que el OS NO usa: `ai` cablea Vercel AI
// SDK + OpenRouter cuando el único cliente de modelos permitido es `orquestador/lib/ia/cliente.mjs`;
// `add-login` inyecta un login que ya existe (Supabase Auth + RLS). Dejarlas activas es tener dos
// verdades del mismo concepto. NO se borran acá —eso lo decide el dueño—: se marcan.
export const SKILLS_AJENAS = {
  'ai': 'plantilla genérica (Vercel AI SDK + OpenRouter); el OS usa orquestador/lib/ia/cliente.mjs',
  'add-login': 'plantilla genérica de auth; el OS ya tiene Supabase Auth + RLS en producción',
  'image-generation': 'plantilla genérica (OpenRouter + Gemini); la capacidad canónica del OS es `generar-imagen` (orquestador/lib/imagen/)',
}

// Skills que gobiernan el trabajo de Claude Code (no del negocio) y NO declaran `metadata.type`.
// Sin esta lista el guardrail las marcaría sin declarar para siempre: el frontmatter se arregla en
// el árbol principal (`.claude/` no se toca desde un worktree — ya borró una pestaña entera), así
// que la declaración vive acá hasta que alguien les ponga el `type`.
export const SKILLS_CLI = {
  'backlog': 'flujo de trabajo de Claude Code: ejecuta tareas en paralelo en worktrees',
  'traspaso': 'flujo de trabajo de Claude Code: cierra la sesión dejando el estado escrito',
}

/** Capacidades (`advise.*`) que declaran cada skill. Invierte CAPABILITY_SKILLS. PURA. */
export function capacidadesPorSkill() {
  const m = new Map()
  for (const [cap, skills] of Object.entries(CAPABILITY_SKILLS)) {
    for (const s of skills) m.set(s, [...(m.get(s) || []), cap])
  }
  return m
}

// Frontmatter YAML mínimo: name, description (una línea, "..." o bloque |), allowed-tools y
// metadata.type. No se usa un parser YAML completo a propósito — es el mismo subconjunto que ya
// parsea `inventario_skills.py`, y una dependencia nueva por cuatro campos no se justifica.
const RE_FM = /^---\r?\n([\s\S]*?)\r?\n---/

/** Extrae {nombre, descripcion, tools[], tipo} del frontmatter. PURA. {} si no hay frontmatter. */
export function parseFrontmatter(md) {
  const m = RE_FM.exec(String(md || ''))
  if (!m) return {}
  const lineas = m[1].split('\n')
  const out = { tools: [] }
  let bloque = null // clave cuyo valor sigue en líneas indentadas ('description' o 'metadata')
  for (const linea of lineas) {
    const indentada = /^\s+\S/.test(linea)
    if (bloque === 'description' && indentada) { out.descripcion = `${out.descripcion} ${linea.trim()}`.trim(); continue }
    if (bloque === 'metadata' && indentada) {
      const t = /^\s+type:\s*(.+)$/.exec(linea)
      if (t) out.tipo = t[1].trim().replace(/^["']|["']$/g, '')
      continue
    }
    bloque = null
    const kv = /^([a-zA-Z_-]+):\s*(.*)$/.exec(linea)
    if (!kv) continue
    const [, clave, valor] = kv
    if (clave === 'name') out.nombre = valor.trim().replace(/^["']|["']$/g, '')
    else if (clave === 'description') { out.descripcion = valor.trim().replace(/^["']|["']$/g, '').replace(/^\|-?$/, ''); bloque = 'description' }
    else if (clave === 'allowed-tools') out.tools = partirTools(valor)
    else if (clave === 'metadata') bloque = 'metadata'
  }
  return out
}

/** `Read, Bash(curl *) Write` → ['Read','Bash','Write']. Los argumentos entre paréntesis son
 *  restricciones del engine, no herramientas distintas: se colapsan al nombre. PURA. */
export function partirTools(valor) {
  return [...new Set(String(valor || '')
    .split(/[,\s]+/)
    .map((t) => t.replace(/\(.*$/, '').replace(/[^\w-]/g, '').trim())
    .filter(Boolean))]
}

// Módulos del OS citados en el cuerpo de la skill. Es la ÚNICA evidencia verificable de que una
// skill tiene una capacidad determinística detrás: si el archivo existe, hay código que produce
// el resultado sin modelo. Si la skill lo cita y NO existe, la cita es vieja y no cuenta.
const RE_MODULO = /orquestador\/[\w./-]+\.mjs/g

async function modulosQueExisten(md) {
  const citados = [...new Set(String(md || '').match(RE_MODULO) || [])].filter((p) => !p.endsWith('.test.mjs'))
  const vivos = []
  for (const rel of citados) {
    try { await stat(path.join(REPO_ROOT, rel)); vivos.push(rel) } catch { /* cita vieja: no cuenta */ }
  }
  return vivos.sort()
}

/**
 * ESTADO OPERATIVO de una skill, por criterio verificable (nunca por opinión):
 *   · legacy          — declarada ajena a este OS (SKILLS_AJENAS)
 *   · operativa       — alguna capacidad del ruteo la declara ⇒ el chat/worker la puede activar
 *   · parcial         — nadie la rutea, PERO hay módulos del OS que la implementan (existe el
 *                       motor, falta el cable)
 *   · herramienta_cli — metodológica/técnica sin capacidad ni módulo: sirve a Claude Code, no al OS
 *   · huerfana        — conocimiento de dominio que nadie puede activar ni ejecutar
 * PURA.
 */
export function clasificar({ clave, tipo, capacidades = [], modulos = [] }) {
  if (SKILLS_AJENAS[clave]) return 'legacy'
  if (capacidades.length) return 'operativa'
  if (modulos.length) return 'parcial'
  if (SKILLS_CLI[clave] || tipo === 'methodology' || tipo === 'technical' || tipo === 'meta-orchestration') return 'herramienta_cli'
  return 'huerfana'
}

/**
 * Cuánta IA necesita la skill para producir su resultado. Derivado, no declarado:
 *   · ninguno       — hay módulo del OS y la skill no es de criterio: responde código, 0 API
 *   · asistido      — hay módulo (trae el dato) y además criterio experto que lo interpreta
 *   · razonamiento  — no hay código detrás: el criterio ES la respuesta
 * PURA.
 */
export function nivelIa({ tipo, modulos = [] }) {
  if (!modulos.length) return 'razonamiento'
  return tipo === 'expert-domain' ? 'asistido' : 'ninguno'
}

// ── Lectura del disco, CACHEADA ─────────────────────────────────────────────────────────────
// Las 44 SKILL.md pesan ~560 KB. Leerlas en cada consulta sería absurdo: la metadata es estable
// (cambia cuando alguien edita una skill, o sea casi nunca). Se lee una vez por proceso. El
// contenido COMPLETO no se cachea: eso lo sigue haciendo context-assembler sólo para las ≤4 que
// la tarea necesita — el catálogo guarda la ficha, no el texto.
const _cache = new Map()

/**
 * Ficha de cada skill del disco: {clave, nombre, descripcion, tipo, tools, area, capacidades,
 * modulos, estadoOperativo, nivelIa, hash, bytes}. Ordenado por clave.
 * @param {{dir?:string, refrescar?:boolean}} [opts]
 */
export async function leerCatalogoDeDisco({ dir = SKILLS_DIR, refrescar = false } = {}) {
  if (!refrescar && _cache.has(dir)) return _cache.get(dir)
  const capacidades = capacidadesPorSkill()
  const entradas = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory())
  const fichas = []
  for (const d of entradas) {
    let md
    try { md = await readFile(path.join(dir, d.name, 'SKILL.md'), 'utf8') } catch { continue }
    const fm = parseFrontmatter(md)
    const ficha = {
      clave: d.name,
      nombre: fm.nombre || d.name,
      descripcion: fm.descripcion || null,
      tipo: fm.tipo || null,
      tools: fm.tools || [],
      area: SKILL_AREA[d.name] || null,
      capacidades: capacidades.get(d.name) || [],
      modulos: await modulosQueExisten(md),
      ruta: `.claude/skills/${d.name}/SKILL.md`,
      hash: createHash('sha256').update(md).digest('hex').slice(0, 16),
      bytes: Buffer.byteLength(md),
      motivoLegacy: SKILLS_AJENAS[d.name] || null,
    }
    ficha.estadoOperativo = clasificar(ficha)
    ficha.nivelIa = nivelIa(ficha)
    fichas.push(ficha)
  }
  fichas.sort((a, b) => a.clave.localeCompare(b.clave))
  _cache.set(dir, fichas)
  return fichas
}

/** Tira el caché (lo usa el sync y los tests que crean skills de mentira). */
export function invalidarCache() { _cache.clear() }

/**
 * GUARDRAIL. Claves en disco que nadie declaró: ni tienen área, ni capacidad que las rutee, ni
 * están marcadas como ajenas. Una skill nueva cae acá hasta que alguien decida qué es — que es
 * exactamente lo que pasó con las 18 que quedaban fuera del catálogo sin que nadie lo notara.
 * PURA (recibe las fichas ya leídas).
 */
export function skillsSinDeclarar(fichas) {
  const tiposQueSeDeclaranSolos = new Set(['methodology', 'technical', 'meta-orchestration'])
  return (fichas || [])
    .filter((f) => !f.area && !f.capacidades.length && !SKILLS_AJENAS[f.clave] && !SKILLS_CLI[f.clave] && !tiposQueSeDeclaranSolos.has(f.tipo))
    .map((f) => f.clave)
}

/** Resumen por estado operativo, para el sync y el informe. PURA. */
export function resumenPorEstado(fichas) {
  const out = {}
  for (const f of fichas || []) out[f.estadoOperativo] = (out[f.estadoOperativo] || 0) + 1
  return out
}
