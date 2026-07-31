// EL ÍNDICE DE DRIVE, SIN DRIVE Y SIN BASE.
//
// Acá vive TODA la lógica del indexador que se puede decidir con la cabeza: cómo se arma la
// fila de un archivo, cuándo hay que reescribirla y cuándo no, cuáles son las raíces a
// recorrer y qué se puede borrar sin riesgo. Nada de esto llama a la API de Drive ni a
// Postgres — eso lo hace scripts/indexar-drive.mjs, que es la cáscara.
//
// Por qué separado: las tres decisiones que importan (¿esta fila cambió?, ¿esta corrida es
// confiable?, ¿este archivo desapareció de verdad?) son las que rompen en producción de la
// peor manera — borrando el catálogo entero por un error de red. Separadas se testean con
// dobles, en frío, sin depender de que Drive conteste.
//
// CERO IA: no importa el cliente de Anthropic, ni el reasoner, ni nada que llame a un
// modelo. La indexación es determinística a propósito: se puede reconstruir de cero y da
// exactamente lo mismo.

import { plano, sinExtension, tokensDeArchivo, hashDe } from './drive-busqueda/normalizar.mjs'

export const FOLDER = 'application/vnd.google-apps.folder'

/** La raíz histórica: la carpeta `administracion`. Sigue siendo el default para que la
 *  corrida actual no cambie de comportamiento si nadie configura nada. */
export const RAIZ_ADMINISTRACION = '1a_3sIbioAQm0EcuJTbu3L6q_hy_LHUXs'

/** Campos que se le piden a Drive. `owners(emailAddress)` es nuevo: sin él no se puede
 *  saber de quién es un archivo, y "¿quién subió esto?" es media respuesta de casi
 *  cualquier pregunta sobre el data room. */
export const CAMPOS_DRIVE =
  'nextPageToken,files(id,name,mimeType,size,modifiedTime,owners(emailAddress),driveId)'

/** Profundidad máxima del recorrido. El data room real llega a 6; 7 deja margen sin que un
 *  ciclo de atajos convierta la corrida en infinita. */
export const PROFUNDIDAD_MAX = 7

/** Fracción mínima de lo que ya había en la base que una corrida tiene que haber visto para
 *  que se le permita borrar. Una corrida que ve la mitad del data room no descubrió que se
 *  borraron 1.200 archivos: se quedó sin permisos o sin red. */
export const PISO_BORRADO = 0.7

/** mime → palabra que una persona entiende. Es lo que se muestra y lo que se filtra. */
export function tipoLegible(m) {
  const s = String(m ?? '')
  if (s === FOLDER) return 'carpeta'
  if (s.includes('spreadsheet') || s.includes('excel')) return 'planilla'
  if (s.includes('document') || s.includes('word')) return 'documento'
  if (s.includes('pdf')) return 'pdf'
  if (s.includes('image')) return 'imagen'
  return 'archivo'
}

/** El dueño, si Drive lo informó. En unidades compartidas `owners` puede venir vacío: la
 *  unidad es la dueña, no una persona. En ese caso queda `null` y no se inventa nada. */
export function emailDeOwners(owners) {
  if (!Array.isArray(owners)) return null
  const email = owners.find((o) => o?.emailAddress)?.emailAddress
  return email ? String(email).toLowerCase() : null
}

/**
 * Las raíces a indexar, desde `ORQ_DRIVE_INDEX_ROOTS` (ids separados por coma).
 *
 * Un solo índice lógico puede alimentarse de varias carpetas o unidades compartidas: el
 * data room no tiene por qué ser una sola carpeta para siempre. Sin la variable, la única
 * raíz es `administracion` — el comportamiento de hoy, intacto.
 *
 * El rótulo de cada raíz (el primer segmento del `path`) se puede fijar con `id:rotulo`;
 * si no, se resuelve preguntándole a Drive el nombre de la carpeta.
 */
export function raicesDesdeEnv(env = process.env) {
  const crudo = String(env?.ORQ_DRIVE_INDEX_ROOTS ?? '').trim()
  if (!crudo) return [{ id: RAIZ_ADMINISTRACION, rotulo: 'administracion' }]
  const vistos = new Set()
  const salida = []
  for (const parte of crudo.split(',')) {
    const [id, rotulo] = parte.split(':').map((s) => String(s ?? '').trim())
    if (!id || vistos.has(id)) continue
    vistos.add(id)
    salida.push({ id, rotulo: rotulo || null })
  }
  if (!salida.length) return [{ id: RAIZ_ADMINISTRACION, rotulo: 'administracion' }]
  return salida
}

/**
 * Archivo de Drive + su lugar en el árbol → la fila del índice, con las columnas de
 * búsqueda ya calculadas.
 *
 * Las cuatro columnas nuevas salen del MISMO módulo que usa el buscador
 * (`drive-busqueda/normalizar.mjs`). Si un día el indexador normalizara distinto que el
 * buscador, el índice y la consulta hablarían idiomas distintos y no se encontrarían nunca
 * — que es exactamente el defecto que este trabajo vino a arreglar.
 */
export function filaIndice(archivo, { path, depth, parentId } = {}) {
  const name = String(archivo?.name ?? '')
  const mime = String(archivo?.mimeType ?? '')
  const ruta = String(path ?? '')
  const modified = archivo?.modifiedTime ?? null
  return {
    drive_file_id: String(archivo?.id ?? ''),
    name,
    path: ruta,
    mime_type: mime,
    is_folder: mime === FOLDER,
    tipo: tipoLegible(mime),
    size_bytes: archivo?.size != null ? Number(archivo.size) : null,
    modified_time: modified,
    parent_id: parentId ?? archivo?.parentId ?? null,
    depth: depth ?? null,
    nombre_norm: plano(sinExtension(name)),
    path_norm: plano(ruta),
    tokens: tokensDeArchivo({ name, path: ruta }),
    owner_email: emailDeOwners(archivo?.owners),
    hash: hashDe({ name, path: ruta, modified_time: modified, mime_type: mime }),
  }
}

/**
 * ¿Hay que escribir esta fila?
 *
 * `insertar` si nunca se la vio. `actualizar` si el hash cambió (cambió el nombre, la ruta,
 * la fecha o el tipo) o si la fila vieja todavía no tiene hash — las 2.465 que ya están se
 * escribieron antes de que estas columnas existieran. `omitir` en cualquier otro caso: no
 * tiene sentido reescribir 2.465 filas cada 6 horas para dejarlas exactamente igual.
 *
 * El caso del dueño es aparte a propósito: `owner_email` NO entra en el hash (que un archivo
 * cambie de dueño no cambia cómo se lo busca), pero el backfill no puede completarlo —sale
 * de la API de Drive, no del nombre—. Sin esta excepción, un archivo que nadie toca nunca
 * jamás tendría dueño. Se rellena una vez y después vuelve a `omitir`.
 *
 * @param {{drive_file_id:string, hash:string, owner_email:string|null}} fila la calculada ahora
 * @param {Map<string,{hash:string, owner_email?:string|null}>|null} enBase lo ya guardado
 */
export function decidirEscritura(fila, enBase) {
  const previa = enBase instanceof Map ? enBase.get(fila?.drive_file_id) : enBase?.[fila?.drive_file_id]
  if (!previa) return 'insertar'
  if (!previa.hash) return 'actualizar'
  if (previa.hash !== fila.hash) return 'actualizar'
  if (!previa.owner_email && fila?.owner_email) return 'actualizar'
  return 'omitir'
}

/**
 * Qué se puede borrar, y sobre todo cuándo NO se puede.
 *
 * Un archivo que ya no está en Drive no puede seguir apareciendo en las búsquedas: mandar a
 * alguien a un enlace muerto es peor que no encontrarlo. Pero borrar por un recorrido
 * parcial es catastrófico e irreversible — un token vencido a mitad de camino haría
 * desaparecer medio catálogo sin que nadie se entere hasta que alguien busque algo.
 *
 * Por eso hacen falta las tres condiciones juntas: la corrida terminó, no hubo ni un error,
 * y vio al menos PISO_BORRADO de lo que ya había. Si alguna falla, se informa el motivo y
 * no se borra nada.
 */
export function planDeBorrado({ vistos, enBase, corridaCompleta, errores = 0, piso = PISO_BORRADO } = {}) {
  const set = vistos instanceof Set ? vistos : new Set(vistos ?? [])
  const previos = Array.isArray(enBase) ? enBase : [...(enBase?.keys?.() ?? [])]
  const faltantes = previos.filter((id) => !set.has(id))
  if (!corridaCompleta) return { borrar: [], motivo: 'la corrida no terminó: no se borra nada' }
  if (errores > 0) return { borrar: [], motivo: `hubo ${errores} error(es) en el recorrido: no se borra nada` }
  if (previos.length && set.size / previos.length < piso) {
    const pct = ((set.size / previos.length) * 100).toFixed(0)
    return { borrar: [], motivo: `la corrida vio ${pct}% de lo indexado (piso ${piso * 100}%): parece parcial, no se borra nada` }
  }
  if (!faltantes.length) return { borrar: [], motivo: 'no desapareció ningún archivo' }
  return { borrar: faltantes, motivo: `${faltantes.length} archivo(s) ya no están en Drive` }
}
