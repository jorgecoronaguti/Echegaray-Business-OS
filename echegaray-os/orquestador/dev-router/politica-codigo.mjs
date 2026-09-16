/**
 * politica-codigo.mjs — LA PUERTA DE EGRESO DEL CÓDIGO DEL REPO.
 *
 * DECISIÓN DE PRIVACIDAD, DECLARADA (16/09/2026)
 * ─────────────────────────────────────────────
 * El 04/09/2026 el dueño dijo «nada de openai compatible, todo es Claude acá». El 16/09/2026 pidió
 * explícitamente usar HF PRO, Inference Providers y HF Jobs para que el desarrollo no se frene
 * cuando Claude no está. El pedido de hoy es posterior y manda. Lo que NO fue revertido y sigue
 * vigente es la política de `lib/ml/politica.mjs`: el techo de HF remoto es INTERNAL.
 *
 * Eso obliga a una decisión que no se resuelve en silencio: **mandar código de este repo a un
 * Inference Provider de terceros (novita, featherless, together…) es sacar propiedad de Echegaray
 * de la VM.** Acá se resuelve así, y queda escrito:
 *
 *   1. El código de UI, tests, tipos y utilidades del OS se clasifica INTERNAL: describe cómo se ve
 *      y cómo se prueba el sistema, no dice cuánto cobra un cliente ni cuánto gana un empleado.
 *   2. NO SE CLASIFICA POR ARCHIVO SINO POR FRAGMENTO, y el fragmento se escanea antes de salir.
 *      Un archivo «inocente» con un CUIT hardcodeado adentro no sale. La clasificación del repo
 *      entero sería una promesa; el escaneo del fragmento es un control.
 *   3. Nada que huela a credencial, token, cadena de conexión, CUIT/CUIL, nombre de persona del
 *      padrón o importe con nombre propio sale, aunque el dominio esté permitido. Falla cerrado.
 *   4. `supabase/migrations`, `orquestador/datos`, `.env`, `decisiones-del-dueno.json` y todo lo que
 *      toque banco, nómina o clientes NO SALE NUNCA a un proveedor externo nuevo. Eso es Claude o
 *      es local, y si Claude no está, la tarea espera. Esperar es un resultado legítimo.
 *
 * Ya hubo un incidente: una captura con datos de clientes reales se fue a un proveedor sin pasar
 * por el adapter. Por eso este módulo no es un consejo: el ejecutor remoto no recibe nada que no
 * haya pasado por `revisarEgreso()`.
 */

/** Rutas cuyo CONTENIDO no sale de la VM hacia un proveedor externo nuevo, nunca. */
export const RUTAS_PROHIBIDAS = [
  /(^|\/)\.env/, /(^|\/)supabase\/migrations\//, /(^|\/)orquestador\/datos\//,
  /decisiones-del-dueno\.json$/, /(^|\/)\.claude\/estado\//,
  /(banco|nomina|nómina|liquidacion-pagos|padron|padrón|cobranzas|cheques)/i,
  /\.(pem|key|p12|pfx|crt)$/, /credenciales/i,
]

/**
 * Patrones que descalifican un FRAGMENTO aunque su ruta esté permitida.
 * Cada uno tiene nombre para que el motivo del bloqueo sea legible en la bitácora.
 */
export const PATRONES_SENSIBLES = [
  ['token-hf', /\bhf_[A-Za-z0-9]{16,}/],
  ['token-github', /\bgh[pousr]_[A-Za-z0-9]{16,}/],
  ['clave-privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
  ['cadena-conexion', /\b(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/[^\s'"]*:[^\s'"]*@/],
  ['url-supabase', /https:\/\/[a-z0-9]{16,}\.supabase\.co/],
  // El `\b` final estaba mal: «service_role_key» no matcheaba porque después de «role» viene «_»,
  // que es carácter de palabra. Lo encontró el test, no la revisión. Ahora se acepta el sufijo.
  ['clave-generica', /\b(api[_-]?key|secret|password|passwd|service[_-]?role|access[_-]?token|bearer)[a-z_]*\s*[:=]\s*['"][^'"]{8,}/i],
  ['token-supabase', /\bsb[pd]_[A-Za-z0-9]{16,}/],
  ['cuit-cuil', /\b(20|23|24|27|30|33|34)[-\s]?\d{8}[-\s]?\d\b/],
  ['cbu', /\b\d{22}\b/],
  ['email-real', /\b[A-Za-z0-9._%+-]+@(?!example\.|test\.)[A-Za-z0-9.-]+\.(com|ar|net|org)\b/],
]

/** Dominios de trabajo de desarrollo y su sensibilidad a efectos de egreso. */
export const DOMINIOS = Object.freeze({
  'codigo-ui': 'INTERNAL',
  'codigo-tests': 'INTERNAL',
  'codigo-tipos': 'INTERNAL',
  'codigo-utilidades': 'INTERNAL',
  'codigo-nucleo': 'CONFIDENTIAL',
  'migraciones': 'RESTRICTED',
  'datos-negocio': 'RESTRICTED',
})

/** Clasifica una ruta del repo en un dominio de desarrollo. */
export function dominioDe(ruta) {
  const p = String(ruta || '')
  if (/supabase\/migrations|\.sql$/.test(p)) return 'migraciones'
  if (/orquestador\/datos\/|\.csv$|\.xlsx$/.test(p)) return 'datos-negocio'
  if (/\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)tests?\//.test(p)) return 'codigo-tests'
  if (/\.d\.ts$|(^|\/)types?\//.test(p)) return 'codigo-tipos'
  if (/\.(tsx|jsx|css|scss)$|(^|\/)components?\//.test(p)) return 'codigo-ui'
  if (/(^|\/)orquestador\/(lib|engines|handlers|comunicacion)\//.test(p)) return 'codigo-nucleo'
  return 'codigo-utilidades'
}

/**
 * ¿Puede este fragmento salir hacia un proveedor externo nuevo (HF / Inference Provider)?
 *
 * Falla cerrado: ante la duda, `permitido: false`. Devuelve SIEMPRE el porqué, porque un bloqueo
 * sin motivo es indistinguible de un bug y termina en que alguien lo apaga.
 *
 * @returns {{permitido:boolean, dominio:string, sensibilidad:string, porQue:string, hallazgos:string[]}}
 */
export function revisarEgreso({ ruta, texto = '', autorizadoPorElDueno = false, proveedor = 'huggingface' } = {}) {
  const dominio = dominioDe(ruta)
  const sensibilidad = DOMINIOS[dominio] ?? 'CONFIDENTIAL'
  const no = (porQue, hallazgos = []) => ({ permitido: false, dominio, sensibilidad, porQue, hallazgos })

  if (proveedor === 'local' || proveedor === 'claude' || proveedor === 'anthropic') {
    return { permitido: true, dominio, sensibilidad, porQue: 'no es un proveedor externo nuevo', hallazgos: [] }
  }
  if (!ruta) return no('sin ruta no se puede clasificar el fragmento')
  for (const re of RUTAS_PROHIBIDAS) {
    if (re.test(ruta)) return no(`la ruta «${ruta}» está en la lista que no sale de la VM (${re})`)
  }

  const hallazgos = []
  for (const [nombre, re] of PATRONES_SENSIBLES) if (re.test(texto)) hallazgos.push(nombre)
  if (hallazgos.length) return no(`el fragmento contiene ${hallazgos.join(', ')}`, hallazgos)

  if (sensibilidad === 'RESTRICTED') return no(`«${dominio}» es RESTRICTED: no sale`)
  if (sensibilidad === 'CONFIDENTIAL' && !autorizadoPorElDueno) {
    return no(`«${dominio}» es CONFIDENTIAL y el dueño no autorizó este caso — corre local, con Claude, o espera`)
  }
  return { permitido: true, dominio, sensibilidad, porQue: `«${dominio}» es ${sensibilidad} y el fragmento pasó el escaneo`, hallazgos: [] }
}
