// LO QUE XSAS RESUELVE SIN MODELO — el registro de capacidades determinísticas del gateway.
//
// ═══ DE DÓNDE SALE CADA COSA (nada de esto se inventó acá) ═══
//
//   · las TOOLS son las que ya existen en `lib/tools/`, con su `capability` y su `input_schema`;
//   · las FRASES del atajo son literales de la propia `description` de la tool que atienden
//     («USALO cuando el dueño pregunte "¿cómo venimos?"»), no de mi criterio — el mismo método con
//     el que `elegir-capacidad.mjs` sacó sus keywords de las `description` de las skills;
//   · el vínculo SKILL → TOOL se DERIVA: el catálogo ya publica, por skill, los módulos del OS que
//     la skill cita y que existen (`ficha.modulos`). Si uno de esos módulos es un archivo de
//     `lib/tools/`, sus tools son las de esa skill. No hay una tabla escrita a mano que se pueda
//     quedar vieja: si la skill deja de citar el módulo, el vínculo desaparece solo.
//
// ═══ POR QUÉ IMPORTA EL ORDEN ═══
//
// Lookup EXACTO antes que semántico. Una intención pedida por su nombre (un botón, un timer) es un
// `Map.get`; una frase que ya sabemos qué significa no puede costar una clasificación. Recorrer las
// 44 skills —o preguntarle a un modelo— para descubrir que «cómo venimos» es el estado de la
// empresa sería pagar por lo que un índice ya sabe.
//
// ═══ POR QUÉ EL NÚCLEO ES 0-API Y GOOGLE ES OPCIONAL ═══
//
// Las tools del núcleo leen Postgres y calculan. Las que necesitan Google (Sheets, Drive) se cargan
// SÓLO si el adapter inyecta un cliente. Así el gateway contesta con Workspace caído y sin
// credenciales —que es justo el escenario en el que hace falta que conteste— y gana las de Google
// cuando están, sin dos registros distintos.

/** Fábricas sin dependencias externas: Postgres y cálculo. */
const FABRICAS_0API = Object.freeze([
  ['./tools/os-data.mjs', 'osDataTools'],
  ['./tools/obra.mjs', 'obraTools'],
  ['./tools/rendimiento.mjs', 'rendimientoTools'],
  ['./tools/legajos-tool.mjs', 'legajosTools'],
  ['./tools/indices-tool.mjs', 'indicesTools'],
  ['./tools/biblioteca-area-tool.mjs', 'bibliotecaAreaTools'],
  ['./tools/cotizaciones-tool.mjs', 'cotizacionesTools'],
  // Ésta RECIBE un cliente de Google pero no lo exige: sin él resuelve la posición de caja como
  // «sin dato» y sigue dando el resto del cuadro. Por eso vive del lado 0-API — «¿cómo venimos?» es
  // la pregunta que menos puede depender de que Workspace conteste.
  ['./tools/estado-empresa-tool.mjs', 'estadoEmpresaTools'],
  // Internet NO necesita Google: `web-search` habla con su propio proveedor y `web_leer`/`web_navegar`
  // bajan la página. Entra del lado 0-API porque su dependencia es la red, no Workspace, y porque
  // lo que devuelve ya sale marcado como REFERENCIA_EXTERNA por `web/contenido-externo.mjs`.
  ['./tools/web.mjs', 'webSearchTools'],
])

/** Fábricas que reciben un cliente de Google. Sin cliente NO se cargan: una tool que va a fallar
 *  igual no tiene por qué figurar como disponible. */
const FABRICAS_GOOGLE = Object.freeze([
  ['./tools/ingenieria-financiera-tool.mjs', 'ingenieriaFinancieraTools'],
  ['./tools/tesoreria-tool.mjs', 'tesoreriaTools'],
  // Slides. `crear_presentacion_google_slides` es de ESCRITURA (`drive.write`): sin esa capability
  // en el pedido, `puedeUsar` la rechaza antes de correrla. Sin cliente de Google no se registra.
  ['./tools/presentacion-tool.mjs', 'presentacionTools'],
])

/** `./tools/x.mjs` → `orquestador/lib/tools/x.mjs`, que es como el catálogo nombra los módulos. */
const comoLoNombraElCatalogo = (ruta) => ruta.replace(/^\.\//, 'orquestador/lib/')

let _cache = null

/**
 * EL REGISTRO DE TOOLS DEL GATEWAY. Se carga una vez por proceso (por combinación con/sin Google).
 * Una fábrica que no se puede importar NO tumba las demás: se anota en `fallaron` y el gateway
 * sigue con lo que sí cargó — degradar es perder una capacidad, no perder el sistema.
 *
 * @returns {Promise<{mapa:Map<string,object>, porArchivo:Map<string,string[]>, fallaron:string[]}>}
 */
export async function toolsDelNucleo({ google = null, refrescar = false } = {}) {
  const llave = google ? 'con-google' : 'solo-os'
  if (_cache?.llave === llave && !refrescar) return _cache.valor
  const mapa = new Map()
  const porArchivo = new Map()
  const fallaron = []
  const fabricas = google ? [...FABRICAS_0API, ...FABRICAS_GOOGLE] : FABRICAS_0API
  for (const [ruta, nombre] of fabricas) {
    try {
      const mod = await import(ruta)
      const claves = []
      for (const [clave, tool] of Object.entries(mod[nombre](google))) {
        mapa.set(clave, tool)
        claves.push(clave)
      }
      porArchivo.set(comoLoNombraElCatalogo(ruta), claves)
    } catch (e) {
      fallaron.push(`${ruta}: ${String(e?.message ?? e).slice(0, 80)}`)
    }
  }
  _cache = { llave, valor: { mapa, porArchivo, fallaron } }
  return _cache.valor
}

/** Tira el caché. Lo usan los tests que inyectan tools de mentira. */
export function invalidarTools() { _cache = null }

/**
 * ATAJOS EXACTOS. Frase normalizada → tool. Si mañana la tool cambia de nombre, el atajo queda
 * huérfano y el test que cruza atajos contra el registro se pone rojo.
 */
export const ATAJOS = Object.freeze({
  'como venimos': 'os.estado_empresa',
  'como estamos': 'os.estado_empresa',
  'como estamos como empresa': 'os.estado_empresa',
  'dame el panorama': 'os.estado_empresa',
  'como viene el negocio': 'os.estado_empresa',
  'cual es hoy mi mayor problema': 'os.estado_empresa',
  'estado de la empresa': 'os.estado_empresa',
  'donde se va la plata': 'os.costos_obras',
  'donde va la plata': 'os.costos_obras',
  'como venimos por obra': 'os.costos_obras',
  'ranking de costos por obra': 'os.costos_obras',
  'costos por obra': 'os.costos_obras',
})

/** Sin tildes, sin signos, sin espacios de más. Lo mínimo para que «¿Cómo venimos?» y «como
 *  venimos» sean la misma llave. No hay stemming: un atajo es exacto o no es. */
export function normalizarFrase(t) {
  return String(t ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** El atajo exacto para un texto, o null. PURA y O(1). */
export function atajoPara(texto, atajos = ATAJOS) {
  return atajos[normalizarFrase(texto)] ?? null
}

/**
 * ARMA LOS ARGUMENTOS DE UNA TOOL con el contexto YA AUTORIZADO del pedido.
 *
 * Sólo se llenan propiedades que la tool declara en su `input_schema`: el contexto de una pantalla
 * no puede inyectar un parámetro que la tool no pidió. Si falta un `required`, devuelve `falta` y
 * el gateway NO ejecuta — decir qué dato falta es mejor que correr con un hueco.
 *
 * @returns {{args:object, falta:string[]}}
 */
export function argumentosPara(tool, { contexto = {}, entidad = {} } = {}) {
  const props = tool?.schema?.input_schema?.properties ?? {}
  const requeridos = tool?.schema?.input_schema?.required ?? []
  const args = {}
  for (const prop of Object.keys(props)) {
    const v = contexto[prop] ?? entidad[prop] ?? entidad[`${prop}_id`]
    if (v != null && v !== '') args[prop] = v
  }
  return { args, falta: requeridos.filter((r) => args[r] == null) }
}

/** ¿Este actor puede correr esta tool? Falla cerrado: sin la capability en `permisos`, no corre.
 *  Los permisos los llena el ADAPTER desde la fuente real; el gateway sólo los compara. */
export function puedeUsar(actor, tool) {
  const cap = tool?.capability
  if (!cap) return false
  return Array.isArray(actor?.permisos) && actor.permisos.includes(cap)
}

/** Las tools de una skill, DERIVADAS de los módulos que la skill cita y que existen. PURA. */
export function toolsDeSkill(ficha, porArchivo) {
  const out = []
  for (const m of ficha?.modulos ?? []) for (const t of porArchivo.get(m) ?? []) out.push(t)
  return [...new Set(out)]
}
