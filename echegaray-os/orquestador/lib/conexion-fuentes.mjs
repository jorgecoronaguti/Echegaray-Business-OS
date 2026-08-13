// ¿DE QUÉ SE ALIMENTA CADA PESTAÑA? — la fuente, leída del CÓDIGO que la escribe.
//
// NÚCLEO PURO: recibe el texto de los archivos y devuelve qué fuentes externas aparecen, con la línea
// literal que lo prueba. No abre archivos ni la red; el que lee es `auditar-conexion-flujo.mjs`.
//
// POR QUÉ SE MIRA EL CÓDIGO Y NO SE DECLARA A MANO (13/08/2026). Una tabla tipeada "esta pestaña sale
// de ARCA" envejece igual que los números pegados que este mismo auditor persigue: el día que el
// generador cambia de fuente, la tabla sigue diciendo lo de antes y nadie se entera. La fuente se
// DEDUCE del archivo que hoy escribe la pestaña, y cada hallazgo viene con su evidencia (archivo,
// línea y texto) para que un tercero pueda contradecirlo sin creerme.
//
// SE SIGUE LA CADENA DE IMPORTS, no sólo el script. `obras-pestana.mjs` no toca la base: quien trae
// los datos es `lib/obras-datos.mjs`. Mirar un solo nivel habría contestado "no tiene fuente" sobre
// una pestaña que sí la tiene — y una respuesta falsa es peor que un hueco declarado.

const RE_IMPORT = /from\s+'(\.{1,2}\/[^']+)'/g
const CASHFLOW_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/**
 * Los detectores de fuente externa. Cada uno con el motivo por el que ese texto PRUEBA la fuente.
 * Deliberadamente conservadores: preferimos un "no pude determinarla" a una fuente inventada.
 */
export const DETECTORES = [
  { tipo: 'API ARCA', re: /_ARCA_RAW|\barca\b|\bafip\b|afipsdk|comprobantes_arca/i },
  { tipo: 'API BCRA', re: /\bbcra\b|api\.bcra\.gob\.ar/i },
  { tipo: 'Google Drive', re: /drive\.google\.com|downloadBytes|fetchAttachment|buscarArchivos|ORQ_DRIVE_[A-Z_]*/i },
  { tipo: 'Banco (extracto)', re: /banco_movimientos|_BANCO_RAW|santander/i },
  { tipo: 'Postgres', re: /from\s+'\.\.\/lib\/db\.mjs'|\bquery\(/ },
]

/** Las rutas relativas que importa un archivo. */
export function importsLocales(src) {
  return [...String(src ?? '').matchAll(RE_IMPORT)].map((m) => m[1])
}

/** Hasta `tope` líneas donde aparece el patrón: {linea, texto}. La evidencia es del texto, no del intento. */
export function evidencias(src, re, tope = 2) {
  const out = []
  const lineas = String(src ?? '').split('\n')
  for (let i = 0; i < lineas.length && out.length < tope; i++) {
    if (re.test(lineas[i])) out.push({ linea: i + 1, texto: lineas[i].trim().slice(0, 110) })
  }
  return out
}

/** Los fragmentos de SQL de un archivo: literales que tienen SELECT y FROM. */
export function sqlDelCodigo(src) {
  const s = String(src ?? '')
  const trozos = [...s.matchAll(/`([^`]*)`/g), ...s.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1])
  return trozos.filter((t) => /\bselect\b/i.test(t) && /\bfrom\b/i.test(t))
}

/** Las tablas que nombra un SQL. Un `from (select…)` no da tabla y se omite: no se adivina. */
export function tablasDeSQL(sql) {
  const out = new Set()
  for (const m of String(sql ?? '').matchAll(/\b(?:from|join|into|update)\s+(?:only\s+)?([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi)) {
    const t = m[1].toLowerCase()
    if (t !== 'select' && t !== 'lateral') out.add(t)
  }
  return [...out]
}

/**
 * Los OTROS archivos de Google que cita el código: ids literales distintos al del Flujo de Caja y
 * variables de entorno `ORQ_*_ID`. Es como entra el espejo de JORNALES, que vive en otro Sheet.
 */
export function sheetsExternos(src, idPropio = CASHFLOW_ID) {
  const s = String(src ?? '')
  const out = new Set()
  for (const m of s.matchAll(/\b[A-Za-z0-9_-]{40,50}\b/g)) {
    // UN ID DE GOOGLE TIENE MAYÚSCULAS Y DÍGITOS. Sin ese filtro entraba el nombre de una nota de
    // memoria citada en un comentario ("anclar-en-el-ultimo-es-anclar-en-la-posicion", 44 caracteres)
    // y el mapa declaraba un Sheet externo que no existe. Una fuente inventada es peor que un hueco.
    if (m[0] === idPropio || !/[A-Z]/.test(m[0]) || !/\d/.test(m[0])) continue
    out.add(m[0])
  }
  // Las variables de entorno que apuntan a OTRO archivo dicen a qué apuntan en el nombre. `ORQ_WORKER_ID`
  // es el id de un proceso, no de una planilla: sin esta restricción figuraba como Sheet externo.
  for (const m of s.matchAll(/ORQ_[A-Z0-9_]*(?:SHEET|SPREADSHEET|CASHFLOW|JORNALES|PLANILLA|DOC)[A-Z0-9_]*_ID\b/g)) {
    if (m[0] !== 'ORQ_CASHFLOW_ID') out.add(m[0])
  }
  return [...out]
}

/** Qué pestañas del MISMO archivo lee el código en JS (las fórmulas no lo muestran: es un rango en un string). */
export function pestanasLeidasEnCodigo(src, titulos = []) {
  const s = String(src ?? '')
  return titulos.filter((t) => s.includes(`'${t}!`) || s.includes('`' + `${t}!`) || s.includes(`"${t}!`))
}

/** Las fuentes que declara UN archivo, con su evidencia. */
export function fuentesDeTexto(src, archivo, titulos = []) {
  const out = []
  for (const d of DETECTORES) {
    const ev = evidencias(src, d.re)
    if (!ev.length) continue
    const detalle = d.tipo === 'Postgres'
      ? [...new Set(sqlDelCodigo(src).flatMap(tablasDeSQL))].join(', ') || '(consulta sin tabla literal)'
      : ''
    out.push({ tipo: d.tipo, detalle, archivo, evidencia: ev })
  }
  for (const id of sheetsExternos(src)) {
    out.push({ tipo: 'Otro Sheet', detalle: id, archivo, evidencia: evidencias(src, new RegExp(id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'))) })
  }
  const leidas = pestanasLeidasEnCodigo(src, titulos)
  if (leidas.length) out.push({ tipo: 'Pestañas del mismo archivo', detalle: leidas.join(', '), archivo, evidencia: [] })
  return out
}

/**
 * LOS LIBS DE PLOMERÍA, deducidos por USO y no por una lista tipeada.
 *
 * POR QUÉ HACE FALTA. Seguir los imports hasta el fondo hacía que cada pestaña "se alimentara" de
 * ARCA, del BCRA, de Drive y del banco a la vez: `google.mjs` nombra a los cuatro en sus propios
 * comentarios y lo importan los treinta generadores. Un mapa donde todas las pestañas tienen todas
 * las fuentes no dice nada.
 *
 * El criterio es estructural: **un lib que importan muchos generadores es infraestructura, no la
 * fuente de una pestaña**. Se mantiene solo — el día que un lib de dominio se vuelva transversal,
 * este umbral lo va a reclasificar sin que nadie edite una lista.
 *
 * @param {Map<string,string>} porArchivo  ruta → texto, de los scripts del pipeline
 */
export function librosComunes(porArchivo, umbral = 5) {
  const cuenta = new Map()
  for (const [ruta, src] of porArchivo) {
    for (const rel of new Set(importsLocales(src))) {
      const abs = resolverRelativo(ruta, rel)
      cuenta.set(abs, (cuenta.get(abs) ?? 0) + 1)
    }
  }
  return new Set([...cuenta].filter(([, n]) => n >= umbral).map(([r]) => r))
}

/**
 * Las fuentes de un script SIGUIENDO SUS IMPORTS locales hasta `tope` niveles.
 *
 * @param {(ruta:string)=>string|null} cargar  lector inyectado: devuelve el texto o null si no está
 * @param {string} entrada  ruta del script dueño de la pestaña
 * @param {Set<string>} [omitir]  los libs de plomería: no se abren ni se atribuyen a la pestaña
 * @returns {{fuentes:Array, archivos:string[], faltantes:string[]}}
 */
export function fuentesDeCadena(cargar, entrada, { titulos = [], tope = 2, omitir = new Set() } = {}) {
  const vistos = new Set()
  const faltantes = []
  const fuentes = []
  const cola = [[entrada, 0]]
  while (cola.length) {
    const [ruta, nivel] = cola.shift()
    // El script de entrada nunca se omite: es el dueño declarado de la pestaña.
    if (vistos.has(ruta) || (omitir.has(ruta) && ruta !== entrada)) continue
    vistos.add(ruta)
    const src = cargar(ruta)
    if (src == null) { faltantes.push(ruta); continue }
    fuentes.push(...fuentesDeTexto(src, ruta, titulos))
    if (nivel >= tope) continue
    for (const rel of importsLocales(src)) cola.push([resolverRelativo(ruta, rel), nivel + 1])
  }
  return { fuentes: agrupar(fuentes), archivos: [...vistos], faltantes }
}

/** Resuelve `../lib/x.mjs` contra la ruta del archivo que lo importa, sin depender de `path`. */
export function resolverRelativo(desde, rel) {
  const base = String(desde).split('/').slice(0, -1)
  for (const parte of String(rel).split('/')) {
    if (parte === '.' || parte === '') continue
    if (parte === '..') base.pop()
    else base.push(parte)
  }
  return base.join('/')
}

/** Los tipos cuyo `detalle` es un CONJUNTO (tablas, pestañas): se unen en vez de repetirse. */
const UNIBLES = new Set(['Postgres', 'Pestañas del mismo archivo'])

/** Una fuente por (tipo, detalle): el mismo Postgres visto en cuatro libs es UNA fuente. */
function agrupar(fuentes) {
  const m = new Map()
  for (const f of fuentes) {
    const k = UNIBLES.has(f.tipo) ? f.tipo : `${f.tipo}|${f.detalle}`
    if (!m.has(k)) { m.set(k, { ...f, archivos: [f.archivo] }); continue }
    const a = m.get(k)
    if (!a.archivos.includes(f.archivo)) a.archivos.push(f.archivo)
    if (!a.evidencia.length) a.evidencia = f.evidencia
    if (UNIBLES.has(f.tipo)) {
      const partes = new Set([...a.detalle.split(', '), ...f.detalle.split(', ')].filter(Boolean))
      partes.delete('(consulta sin tabla literal)')
      a.detalle = [...partes].sort().join(', ') || '(consulta sin tabla literal)'
    }
  }
  // Se rearma explícito: `archivo` (singular) ya se consolidó en `archivos` y no debe sobrevivir.
  return [...m.values()].map((f) => ({ tipo: f.tipo, detalle: f.detalle, evidencia: f.evidencia, archivos: f.archivos }))
}
