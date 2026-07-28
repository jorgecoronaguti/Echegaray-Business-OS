// Configuración validada del Work Fabric (Fase 0). Fail-fast: si falta o es
// inválida una variable crítica, el proceso no arranca (no queremos un worker a
// medio configurar tomando tareas reales). Secretos SIEMPRE por entorno, nunca
// en git (manejo seguro de secretos, decisión ratificada).
//
// Reutiliza el parser de .env ya existente (scripts/lib/env-file.mjs) para
// hidratar variables faltantes en desarrollo local, sin pisar las reales.
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { loadEnvLocalInto } from '../../scripts/lib/env-file.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// orquestador/lib -> echegaray-os (app Next) -> app (raíz git real)
export const APP_DIR = path.resolve(HERE, '..', '..')
export const REPO_ROOT = path.resolve(APP_DIR, '..')

// En desarrollo local, completar desde .env.local lo que no esté en el entorno.
// En la VM (systemd) las variables llegan por EnvironmentFile: tienen prioridad.
loadEnvLocalInto(process.env, path.join(APP_DIR, '.env.local'))
// Y ADEMÁS desde el EnvironmentFile de systemd (worker.env), donde vive DATABASE_URL.
// POR QUÉ (28/07): un proceso nuevo que no heredó las variables de systemd —típicamente un AGENTE en
// un worktree, o un script corrido a mano sin `source`— arrancaba SIN DATABASE_URL. Sin base, la
// guarda de escritura del Sheet se queda ciega (no puede leer firma/candado/registro de ediciones) y
// una corrida podía terminar borrando una pestaña. Cargar el mismo EnvironmentFile acá cierra ese
// agujero de raíz: cualquier proceso (incluido un worktree) alcanza Postgres y la guarda funciona.
// `loadEnvLocalInto` NO pisa lo que ya está: en la VM el EnvironmentFile de systemd sigue mandando.
loadEnvLocalInto(process.env, process.env.ORQ_ENV_FILE
  || path.join(os.homedir(), '.config', 'echegaray-orq', 'worker.env'))

const bool = (def) =>
  z.preprocess((v) => (v === undefined ? def : /^(1|true|yes|on)$/i.test(String(v))), z.boolean())

const ConfigSchema = z.object({
  // Conexión Postgres directa (portable, D2). Session pooler de Supabase en prod.
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
  DB_SSL: bool(true),

  // Ejes reservados (D4). Un solo valor hoy; el eje existe desde el día 1.
  TENANT: z.string().min(1).default('echegaray'),
  PROJECT: z.string().min(1).default('echegaray-os'),
  REPO: z.string().min(1).default('echegaray-os'),

  // Identidad del worker (para leases/heartbeat). Único por proceso.
  WORKER_ID: z.string().min(1).default(`${os.hostname()}:${process.pid}`),

  // Scheduler / leasing (Fase 1).
  CONCURRENCY: z.coerce.number().int().positive().max(64).default(1),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  LEASE_SECONDS: z.coerce.number().int().positive().default(900),
  HEARTBEAT_MS: z.coerce.number().int().positive().default(15000),
  MAX_ATTEMPTS: z.coerce.number().int().positive().max(20).default(3),
  BACKOFF_BASE_MS: z.coerce.number().int().positive().default(30000),

  // Workspaces (Fase 2): worktrees fuera del repo para no ensuciar el working tree.
  WORKSPACES_DIR: z.string().default(path.resolve(REPO_ROOT, '..', 'orq-workspaces')),

  // Motor de ejecución productivo: 'claude-cli' (Etapa 4: se retiró 'noop' como
  // motor de ejecución — los especialistas razonan de verdad, no sobre un stub).
  // 'fixture' es determinístico y SOLO para tests (gateado en engines/index.mjs).
  // Coerción defensiva: cualquier valor legacy (p.ej. 'noop') se degrada a
  // 'claude-cli' con seguridad, para que un env viejo nunca impida arrancar.
  // Motores válidos del sistema (arquitectura de DOS PUERTOS):
  //   'anthropic-api' → Reasoner (negocio 24×7, API oficial de Anthropic)
  //   'claude-cli'    → Builder  (desarrollo del propio OS: herramientas locales)
  //   'fixture'       → determinístico, SOLO tests (gateado en engines/index.mjs)
  // Coerción defensiva: cualquier valor legacy/desconocido se degrada a
  // 'claude-cli' con seguridad, pero los tres válidos se PRESERVAN (bugfix: antes
  // 'anthropic-api' se degradaba en silencio a 'claude-cli').
  ENGINE: z.preprocess(
    (v) => (['anthropic-api', 'claude-cli', 'fixture'].includes(v) ? v : 'claude-cli'),
    z.enum(['anthropic-api', 'claude-cli', 'fixture']),
  ).default('claude-cli'),
  ENGINE_TIMEOUT_MS: z.coerce.number().int().positive().default(1000 * 60 * 20),

  // Motor de razonamiento POR DEFECTO del negocio cuando la ruta no fija engine.
  // El Reasoner es Anthropic API (desacople de Claude Code). El Builder
  // (claude-cli) se fija explícitamente SOLO en el handler code_change.
  AI_ENGINE_DEFAULT: z.preprocess(
    (v) => (['anthropic-api', 'claude-cli', 'fixture'].includes(v) ? v : 'anthropic-api'),
    z.enum(['anthropic-api', 'claude-cli', 'fixture']),
  ).default('anthropic-api'),

  // --- Adaptador Anthropic (Reasoner) ------------------------------------
  // La CREDENCIAL (ANTHROPIC_API_KEY) NO se declara acá a propósito: es un
  // secreto puro de entorno; el SDK la lee de process.env. Nunca pasa por el
  // schema, el logger ni git.
  // Mapeo alias→ID de modelo: las rutas históricas usan 'sonnet'/'opus'/'haiku'
  // (semántica del CLI). El adaptador los traduce a IDs de la API con estos.
  ANTHROPIC_MODEL_SONNET: z.string().min(1).default('claude-sonnet-4-6'),
  ANTHROPIC_MODEL_HAIKU: z.string().min(1).default('claude-haiku-4-5'),
  ANTHROPIC_MODEL_OPUS: z.string().min(1).default('claude-opus-4-8'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().max(64000).default(8000),
  ANTHROPIC_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  ANTHROPIC_MAX_RETRIES: z.coerce.number().int().nonnegative().max(8).default(3),
  // Límite de concurrencia por PROVEEDOR (independiente de CONCURRENCY del worker):
  // acota los requests simultáneos a la API para no tocar rate limits (ITPM/OTPM).
  ANTHROPIC_MAX_CONCURRENCY: z.coerce.number().int().positive().max(32).default(4),
  // Circuit breaker del proveedor: tras N fallos consecutivos, corta en corto
  // durante el cooldown (protección contra tormentas de retries). Los errores de
  // credencial (401/403) abren el breaker más agresivo (ver lib/breaker.mjs).
  ANTHROPIC_BREAKER_THRESHOLD: z.coerce.number().int().positive().max(50).default(5),
  ANTHROPIC_BREAKER_COOLDOWN_MS: z.coerce.number().int().positive().default(30000),
  // Inyección de gobernanza: por defecto el Context Assembler inyecta un KERNEL
  // de gobernanza (misión + evidencia + estilo, destilado de CLAUDE.md). Con '1'
  // inyecta el CLAUDE.md raíz COMPLETO (más caro; usar sólo si hace falta).
  GOVERNANCE_FULL: bool(false),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.string().default('development'),
})

let cached = null

/** Carga y valida la configuración una sola vez. Lanza con detalle si algo falla. */
export function loadConfig() {
  if (cached) return cached
  const parsed = ConfigSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    DB_SSL: process.env.ORQ_DB_SSL,
    TENANT: process.env.ORQ_TENANT,
    PROJECT: process.env.ORQ_PROJECT,
    REPO: process.env.ORQ_REPO,
    WORKER_ID: process.env.ORQ_WORKER_ID,
    CONCURRENCY: process.env.ORQ_CONCURRENCY,
    POLL_INTERVAL_MS: process.env.ORQ_POLL_INTERVAL_MS,
    LEASE_SECONDS: process.env.ORQ_LEASE_SECONDS,
    HEARTBEAT_MS: process.env.ORQ_HEARTBEAT_MS,
    MAX_ATTEMPTS: process.env.ORQ_MAX_ATTEMPTS,
    BACKOFF_BASE_MS: process.env.ORQ_BACKOFF_BASE_MS,
    WORKSPACES_DIR: process.env.ORQ_WORKSPACES_DIR,
    ENGINE: process.env.ORQ_ENGINE,
    ENGINE_TIMEOUT_MS: process.env.ORQ_ENGINE_TIMEOUT_MS,
    AI_ENGINE_DEFAULT: process.env.ORQ_AI_ENGINE,
    ANTHROPIC_MODEL_SONNET: process.env.ANTHROPIC_MODEL_SONNET,
    ANTHROPIC_MODEL_HAIKU: process.env.ANTHROPIC_MODEL_HAIKU,
    ANTHROPIC_MODEL_OPUS: process.env.ANTHROPIC_MODEL_OPUS,
    ANTHROPIC_MAX_TOKENS: process.env.ANTHROPIC_MAX_TOKENS,
    ANTHROPIC_TIMEOUT_MS: process.env.ANTHROPIC_TIMEOUT_MS,
    ANTHROPIC_MAX_RETRIES: process.env.ANTHROPIC_MAX_RETRIES,
    ANTHROPIC_MAX_CONCURRENCY: process.env.ANTHROPIC_MAX_CONCURRENCY,
    ANTHROPIC_BREAKER_THRESHOLD: process.env.ANTHROPIC_BREAKER_THRESHOLD,
    ANTHROPIC_BREAKER_COOLDOWN_MS: process.env.ANTHROPIC_BREAKER_COOLDOWN_MS,
    GOVERNANCE_FULL: process.env.ORQ_GOVERNANCE_FULL,
    LOG_LEVEL: process.env.ORQ_LOG_LEVEL,
    NODE_ENV: process.env.NODE_ENV,
  })
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(
      `Configuración del orquestador inválida:\n${issues.join('\n')}\n` +
        `Definí las variables ORQ_* / DATABASE_URL (ver .env.local.example y orquestador/README.md).`,
    )
  }
  cached = Object.freeze({ ...parsed.data, APP_DIR, REPO_ROOT })
  return cached
}
