// EL ÍNDICE DE DRIVE, SIN DRIVE Y SIN BASE.
//
// Acá vive TODA la lógica del indexador que se puede decidir con la cabeza: cómo se arma la
// fila de un archivo, cuándo hay que reescribirla y cuándo no, cuáles son las raíces a
// recorrer y de qué archivos se puede afirmar que ya no están. Nada de esto llama a la API
// de Drive ni a Postgres — eso lo hace scripts/indexar-drive.mjs, que es la cáscara.
//
// Por qué separado: las tres decisiones que importan (¿esta fila cambió?, ¿esta corrida es
// confiable?, ¿este archivo desapareció de verdad?) son las que rompen en producción de la
// peor manera. Separadas se testean con dobles, en frío, sin depender de que Drive conteste.
//
// ESTE MÓDULO YA NO BORRA NADA (10/09/2026). `planDeBorrado` sacaba del catálogo lo que una
// corrida no veía; ahora `planDeAusencia` lo MARCA, con la misma disciplina que
// `legajos-sincro.mjs` usa sobre los papeles de legajo desde el 19/08. Si alguien vuelve a
// escribir un delete acá, el test «el plan no puede borrar» se pone rojo.
//
// CERO IA: no importa el cliente de Anthropic, ni el reasoner, ni nada que llame a un
// modelo. La indexación es determinística a propósito: se puede reconstruir de cero y da
// exactamente lo mismo.

import { plano, sinExtension, tokensDeArchivo, hashDe } from './drive-busqueda/normalizar.mjs'

export const FOLDER = 'application/vnd.google-apps.folder'

/** La raíz histórica: la carpeta `administracion`. */
export const RAIZ_ADMINISTRACION = '1a_3sIbioAQm0EcuJTbu3L6q_hy_LHUXs'

/**
 * LA SEGUNDA RAÍZ, Y POR QUÉ ESTÁ EN EL CÓDIGO Y NO EN UNA VARIABLE (07/09/2026).
 *
 * `archivo-fiscal` es donde viven las DDJJ F931, los VEP y los tickets de pago — la fuente del
 * cuadro «DECLARADO EN LA DDJJ F931» de Cargas Sociales. NO está adentro de `administracion`: es
 * una carpeta hermana, así que el default de una sola raíz nunca la miraba.
 *
 * ═══ LO QUE COSTÓ, MEDIDO ═══
 *
 * Sus 24 archivos entraron al índice el 19/08, cuando alguien corrió una vez con
 * `ORQ_DRIVE_INDEX_ROOTS` puesta a mano. Esa variable no está en `worker.env`, así que el timer
 * diario siguió corriendo sobre `administracion` sola y esa carpeta quedó congelada 19 días. El
 * `2026-08 F.931.pdf` se subió el 05/09 y el OS no lo vio: Cargas Sociales seguía diciendo que la
 * última declaración era la de julio, y el dueño tuvo que corregirlo — «hay info hasta agosto».
 *
 * Va en el código y no en la variable a propósito. Una fuente crítica que sólo se lee cuando
 * alguien se acuerda de exportar una env no es una fuente: es una casualidad. El token de AfipSDK
 * desapareció de ese mismo archivo el 01/09 y dejó ARCA congelado — el mismo modo de falla, dos
 * veces en una semana. `ORQ_DRIVE_INDEX_ROOTS` sigue mandando cuando está: lo que cambia es que
 * ausente ya no significa «mirá sólo administracion».
 */
export const RAIZ_ARCHIVO_FISCAL = '1-7RmmzQeJA2g2O7GqZi4o_WQtiTQLc7l'

/** Las raíces que se indexan cuando nadie configuró nada. */
export const RAICES_POR_DEFECTO = Object.freeze([
  { id: RAIZ_ADMINISTRACION, rotulo: 'administracion' },
  { id: RAIZ_ARCHIVO_FISCAL, rotulo: 'archivo-fiscal' },
])

/**
 * Campos que se le piden a Drive.
 *
 * `owners(emailAddress)`: sin él no se puede saber de quién es un archivo, y "¿quién subió
 * esto?" es media respuesta de casi cualquier pregunta sobre el data room.
 *
 * Los tres del 10/09/2026 son el puente con la app:
 *  · `md5Checksum` es la huella del CONTENIDO. El `hash` de al lado es de metadatos (nombre,
 *    ruta, fecha, mime) y no puede contestar «lo que subí llegó igual» ni «estas dos copias
 *    son el mismo papel». Viene NULL en los formatos nativos de Google, que no tienen bytes.
 *  · `trashed` hace VISIBLE la papelera. Sin él, un archivo mandado a la papelera y un
 *    archivo borrado de verdad le llegan al índice exactamente iguales: como una ausencia.
 *  · `webViewLink` es el enlace que Drive dice que abre ese archivo. Se guarda en vez de
 *    armarlo con el id: la URL de una unidad compartida no es la de My Drive, y una URL
 *    inventada manda a alguien a un 404 que parece un problema de permisos.
 */
export const CAMPOS_DRIVE =
  'nextPageToken,files(id,name,mimeType,size,modifiedTime,owners(emailAddress),driveId'
  + ',md5Checksum,trashed,webViewLink)'

/** Profundidad máxima del recorrido. El data room real llega a 6; 7 deja margen sin que un
 *  ciclo de atajos convierta la corrida en infinita. */
export const PROFUNDIDAD_MAX = 7

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
 * data room no tiene por qué ser una sola carpeta para siempre. Sin la variable se indexan
 * `RAICES_POR_DEFECTO` — `administracion` Y `archivo-fiscal`; ver por qué en esa constante.
 *
 * El rótulo de cada raíz (el primer segmento del `path`) se puede fijar con `id:rotulo`;
 * si no, se resuelve preguntándole a Drive el nombre de la carpeta.
 */
export function raicesDesdeEnv(env = process.env) {
  const crudo = String(env?.ORQ_DRIVE_INDEX_ROOTS ?? '').trim()
  if (!crudo) return RAICES_POR_DEFECTO.map((r) => ({ ...r }))
  const vistos = new Set()
  const salida = []
  for (const parte of crudo.split(',')) {
    const [id, rotulo] = parte.split(':').map((s) => String(s ?? '').trim())
    if (!id || vistos.has(id)) continue
    vistos.add(id)
    salida.push({ id, rotulo: rotulo || null })
  }
  if (!salida.length) return RAICES_POR_DEFECTO.map((r) => ({ ...r }))
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
    // ── Lo que Drive sabe del archivo y el hash de arriba no puede saber ──────
    // `md5` puede ser null y eso NO es un defecto: los Docs, Sheets y Slides nativos no
    // tienen bytes propios y Drive no devuelve checksum para ellos. Nunca se rellena con ''
    // ni con un hash calculado: un md5 inventado es peor que ninguno, porque una comparación
    // posterior lo va a creer.
    md5: archivo?.md5Checksum ? String(archivo.md5Checksum) : null,
    // `trashed` se guarda tal cual lo dice Drive. Es un hecho del archivo, no una ausencia.
    trashed: archivo?.trashed === true,
    web_view_link: archivo?.webViewLink ? String(archivo.webViewLink) : null,
  }
}

/**
 * ¿Hay que escribir esta fila?
 *
 * `insertar` si nunca se la vio. `actualizar` si el hash cambió (cambió el nombre, la ruta,
 * la fecha o el tipo) o si la fila vieja todavía no tiene hash — las 2.465 que ya están se
 * escribieron antes de que estas columnas existieran. `omitir` en cualquier otro caso: no
 * tiene sentido reescribir 4.232 filas cada 6 horas para dejarlas exactamente igual.
 *
 * Hay cuatro excepciones, y las cuatro existen por el mismo motivo: son datos que el hash NO
 * mira y que un backfill no puede completar solo, porque salen de la API de Drive y no del
 * nombre. Sin ellas, un archivo que nadie toca nunca jamás tendría dueño, md5 ni enlace.
 *
 *  · `owner_email` faltante y ahora disponible → se rellena una vez y vuelve a `omitir`.
 *  · `md5` faltante y ahora disponible → ídem (es el backfill de las 4.232 filas viejas).
 *  · `md5` DISTINTO del guardado → el contenido cambió. Ésta es la única condición de todo
 *    el módulo que habla de contenido y no de metadatos: Drive suele mover `modifiedTime`
 *    cuando cambia el archivo, pero una copia, una restauración de versión o una escritura
 *    por API pueden no hacerlo, y ahí el hash de metadatos dice «igual» sobre bytes distintos.
 *  · `trashed` distinto del guardado → el archivo entró o salió de la papelera. Se compara
 *    sólo si lo guardado ES un booleano: `undefined` (la fila vieja, de antes de la columna)
 *    no significa `false`, significa que no se sabe, y no puede disparar 4.232 UPDATEs.
 *
 * @param {{drive_file_id:string, hash:string, owner_email:string|null, md5:string|null, trashed:boolean}} fila la calculada ahora
 * @param {Map<string,{hash:string, owner_email?:string|null, md5?:string|null, trashed?:boolean}>|null} enBase lo ya guardado
 */
export function decidirEscritura(fila, enBase) {
  const previa = enBase instanceof Map ? enBase.get(fila?.drive_file_id) : enBase?.[fila?.drive_file_id]
  if (!previa) return 'insertar'
  if (!previa.hash) return 'actualizar'
  if (previa.hash !== fila.hash) return 'actualizar'
  if (!previa.owner_email && fila?.owner_email) return 'actualizar'
  if (fila?.md5 && previa.md5 !== fila.md5) return 'actualizar'
  if (typeof previa.trashed === 'boolean' && previa.trashed !== fila?.trashed) return 'actualizar'
  return 'omitir'
}

/**
 * QUÉ ARCHIVOS YA NO ESTÁN, Y SOBRE TODO DE CUÁLES NO SE PUEDE AFIRMAR NADA.
 *
 * ═══ POR QUÉ ESTO REEMPLAZÓ A `planDeBorrado` (10/09/2026) ═══
 *
 * El plan anterior BORRABA las filas que una corrida no veía, con tres guardas: la corrida
 * terminó, no hubo ni un error, y vio al menos el 70% de lo indexado. Las tres protegen del
 * fallo grosero —quedarse sin token a mitad del recorrido— y de ninguna manera del fallo
 * real: UNA carpeta que contesta 403 y doscientas filas buenas que desaparecen del catálogo
 * para siempre. El error es irreversible: el `path`, los vínculos y el histórico de esas
 * filas no se reconstruyen, y nadie se entera hasta que alguien busca algo.
 *
 * La disciplina que se copia es la de `legajos-sincro.mjs` (`documentosAusentes`), en
 * producción desde el 19/08 sobre 975 papeles de legajo: NUNCA SE BORRA, SE MARCA, y sólo se
 * marca lo que faltó en una carpeta que se pudo listar ENTERA en esta corrida. Un control
 * que no pudo mirar no dice «no está»: dice que no sabe.
 *
 * ═══ LAS TRES CLASES DE FILA ═══
 *
 *  · Vista → si estaba marcada ausente, se REVIVE (`ausente_en_drive = false`). La fila
 *    nunca se había ido, así que conserva todo lo que colgaba de ella.
 *  · No vista y su carpeta padre se listó entera → se MARCA (`ausente_desde = now()`). Si ya
 *    estaba marcada no se vuelve a tocar: `ausente_desde` es «desde cuándo falta», y
 *    pisarlo en cada corrida lo convertiría en «hace seis horas» para siempre.
 *  · No vista y su carpeta padre NO se listó entera (error de Drive, carpeta que ya no
 *    existe, raíz que se sacó de la configuración) → NO SE TOCA. Ni marcar ni revivir.
 *
 * Un archivo en la PAPELERA se ve en el recorrido (se lista sin `trashed=false`), entra en
 * `vistos` y por lo tanto NO es un ausente: se guarda con `trashed = true`, que es un hecho
 * distinto y una decisión distinta de quien lo mire.
 *
 * Las raíces (`parent_id` null) nunca se marcan: nadie listó a su padre.
 *
 * @param {{indiceActual: Array<{drive_file_id:string, parent_id:string|null, ausente_en_drive?:boolean}>,
 *          vistos: Set<string>|Iterable<string>,
 *          carpetasListadasEnteras: Set<string>|Iterable<string>}} args
 * @returns {{marcar:string[], revivir:string[], intactas:number, motivo:string}}
 */
export function planDeAusencia({ indiceActual, vistos, carpetasListadasEnteras } = {}) {
  const seVio = vistos instanceof Set ? vistos : new Set(vistos ?? [])
  const enteras = carpetasListadasEnteras instanceof Set
    ? carpetasListadasEnteras
    : new Set(carpetasListadasEnteras ?? [])
  const filas = Array.isArray(indiceActual) ? indiceActual : []

  const marcar = []
  const revivir = []
  let intactas = 0
  for (const f of filas) {
    const id = f?.drive_file_id
    if (!id) continue
    if (seVio.has(id)) {
      if (f.ausente_en_drive === true) revivir.push(id)
      continue
    }
    // No se la vio. La única pregunta que importa: ¿alguien MIRÓ donde tenía que estar?
    if (!f.parent_id || !enteras.has(f.parent_id)) { intactas++; continue }
    if (f.ausente_en_drive === true) continue   // ya marcada: no se repisa ausente_desde
    marcar.push(id)
  }

  const motivo = `${marcar.length} para marcar ausente · ${revivir.length} para revivir · `
    + `${intactas} sin novedad (su carpeta no se listó entera en esta corrida). NADA SE BORRA.`
  return { marcar, revivir, intactas, motivo }
}

/**
 * POR QUÉ ESTA RAÍZ NO SIRVE. Puro, para poder probarlo sin Drive.
 *
 * Mismo patrón que `uocra-ddjj.mjs`: una carpeta en la papelera Drive la SIGUE devolviendo
 * por id, y listarla devuelve cero archivos y cero errores. Con el índice viejo eso era el
 * peor escenario posible —una corrida perfectamente exitosa que no ve nada— y con el nuevo
 * sería un marcado masivo de ausentes igual de falso. Se aborta la corrida entera con el
 * motivo escrito, en vez de escribir una conclusión que nadie pidió.
 */
export function porQueLaRaizNoSirve(meta) {
  if (!meta) return 'no existe o no tengo acceso'
  if (meta.trashed === true) {
    return 'está EN LA PAPELERA — Drive la sigue devolviendo por id, vacía y sin error, '
      + 'y este indexador leería eso como «desaparecieron todos sus archivos»'
  }
  if (meta.mimeType && meta.mimeType !== FOLDER) return `no es una carpeta (${meta.mimeType})`
  return null
}
