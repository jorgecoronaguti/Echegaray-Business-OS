// Logs estructurados (JSON por línea) a stdout — journald los captura tal cual
// en la VM. Correlacionables por correlation_id/task_id. Redacción defensiva de
// secretos: ninguna clave sensible se imprime, incluso si alguien la pasa por error.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const SENSITIVE = /(pass(word)?|secret|token|api[_-]?key|authorization|service_role|connection|database_url)/i

function redactValue(key, value) {
  if (typeof value === 'string' && SENSITIVE.test(key)) return '***'
  // redacta credenciales embebidas en URLs postgres://user:pass@host
  if (typeof value === 'string') return value.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, '$1***$2')
  return value
}

function redact(fields) {
  const out = {}
  for (const [k, v] of Object.entries(fields || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? redact(v) : redactValue(k, v)
  }
  return out
}

export function createLogger(baseFields = {}, level = process.env.ORQ_LOG_LEVEL || 'info') {
  const threshold = LEVELS[level] ?? LEVELS.info
  const base = redact(baseFields)

  function emit(lvl, msg, fields) {
    if (LEVELS[lvl] < threshold) return
    const line = { ts: new Date().toISOString(), level: lvl, msg, ...base, ...redact(fields) }
    const out = lvl === 'error' || lvl === 'warn' ? process.stderr : process.stdout
    out.write(JSON.stringify(line) + '\n')
  }

  return {
    debug: (msg, f) => emit('debug', msg, f),
    info: (msg, f) => emit('info', msg, f),
    warn: (msg, f) => emit('warn', msg, f),
    error: (msg, f) => emit('error', msg, f),
    /** Deriva un logger con campos fijos adicionales (ej. task_id, correlation_id). */
    child: (fields) => createLogger({ ...base, ...fields }, level),
  }
}
