// LEER UN ENLACE DE DRIVE PEGADO. Puro, sin base y sin red: es lo único que se puede probar.
//
// ═══ POR QUÉ SE PARSEA EN VEZ DE PEDIR EL ID ═══
//
// Nadie en obra sabe qué es un "id de Drive". Lo que una persona tiene es lo que le da el botón
// Compartir, o lo que copió de la barra del navegador. Pedirle que extraiga 33 caracteres del medio
// de esa cadena es garantizar que la mitad de los vínculos entren mal — y un id mal copiado no
// falla: guarda, y abre un 404 recién cuando alguien hace clic tres semanas después.
//
// ═══ LA REGLA QUE NO SE ROMPE ═══
//
// NO SE ADIVINA. Si la URL no dice qué tipo de cosa es, `mime_type` queda en null y `tipo` cae en
// 'archivo' sólo cuando la forma de la URL lo respalda. Una URL que no es de Drive devuelve null,
// nunca un id inventado a partir de lo que se parezca: un vínculo silenciosamente equivocado es
// peor que un formulario que se planta y avisa.
//
// El test vive en `orquestador/lib/drive-url.test.mjs` e importa ESTE archivo, no una copia: Node 24
// saca los tipos solo. `claves-actividad.test.mjs` tuvo que leer el .ts y evaluarlo a mano porque
// todavía no existía esa capacidad; acá no hace falta, y probar una copia sería probar la copia.

import type { ReferenciaDrive, TipoDrive } from '../types'

// Los ids de Drive son base64url. Adentro de una URL alcanza con exigir el alfabeto: la posición ya
// la fijó el patrón. SUELTOS se exigen 20 caracteres o más y con el patrón ANCLADO — "contrato"
// entra en el alfabeto, y una dirección de Dropbox lleva veinte caracteres del alfabeto adentro.
// Cualquiera de las dos, aceptada, se guarda sin error y se convierte en un 404 semanas después.
const ID = '[A-Za-z0-9_-]+'
const ID_SUELTO = /^[A-Za-z0-9_-]{20,}$/

const GOOGLE_TIPO: Record<string, string> = {
  spreadsheets: 'application/vnd.google-apps.spreadsheet',
  document: 'application/vnd.google-apps.document',
  presentation: 'application/vnd.google-apps.presentation',
  forms: 'application/vnd.google-apps.form',
}

const CARPETA_MIME = 'application/vnd.google-apps.folder'

// Orden importante: la carpeta se prueba antes que el archivo porque `/drive/folders/` y
// `/drive/u/0/folders/` comparten prefijo con el resto de las rutas de drive.google.com.
const PATRONES: { re: RegExp; tipo: TipoDrive; mime: string | null }[] = [
  // https://drive.google.com/drive/folders/<id>  ·  .../drive/u/0/folders/<id>
  { re: new RegExp(`drive\\.google\\.com/drive/(?:u/\\d+/)?folders/(${ID})`), tipo: 'carpeta', mime: CARPETA_MIME },
  // https://drive.google.com/file/d/<id>/view  — la URL no dice qué hay adentro.
  { re: new RegExp(`drive\\.google\\.com/file/d/(${ID})`), tipo: 'archivo', mime: null },
  // https://drive.google.com/open?id=<id>  ·  .../uc?id=<id>&export=download
  { re: new RegExp(`drive\\.google\\.com/(?:open|uc)\\?(?:[^#]*&)?id=(${ID})`), tipo: 'archivo', mime: null },
]

/**
 * De un enlace de Drive (o de un id pelado) a la referencia. `null` si no es de Drive.
 *
 * `tipoDeclarado` sólo se usa cuando la entrada es un id suelto: ahí no hay URL que consultar y la
 * única fuente es lo que dijo la persona. Cuando la URL SÍ lo dice, la URL gana — alguien que pega
 * un enlace de carpeta en el formulario de archivo se equivocó de formulario, no de archivo.
 */
export function parsearReferenciaDrive(entrada: string, tipoDeclarado: TipoDrive = 'archivo'): ReferenciaDrive | null {
  const texto = String(entrada ?? '').trim()
  if (!texto) return null

  // docs.google.com/<producto>/d/<id>/edit — el producto ES el mime, y eso no es una inferencia:
  // está escrito en la URL.
  const doc = new RegExp(`docs\\.google\\.com/(${Object.keys(GOOGLE_TIPO).join('|')})/d/(${ID})`).exec(texto)
  if (doc) return { drive_file_id: doc[2], tipo: 'archivo', mime_type: GOOGLE_TIPO[doc[1]] }

  for (const p of PATRONES) {
    const m = p.re.exec(texto)
    if (m) return { drive_file_id: m[1], tipo: p.tipo, mime_type: p.mime }
  }

  // Un id pelado. `ID_SUELTO` está ANCLADO a propósito: sin `^...$` cualquier dirección de otro
  // servicio —Dropbox, SharePoint— tendría adentro veinte caracteres del alfabeto y entraría como
  // si fuera un archivo de la obra.
  if (ID_SUELTO.test(texto)) {
    return {
      drive_file_id: texto,
      tipo: tipoDeclarado,
      mime_type: tipoDeclarado === 'carpeta' ? CARPETA_MIME : null,
    }
  }

  return null
}

/** La URL para abrir el vínculo. Un id de carpeta abierto como archivo da 404: por eso el tipo. */
export function urlDeDrive(driveFileId: string, tipo: TipoDrive): string {
  return tipo === 'carpeta'
    ? `https://drive.google.com/drive/folders/${driveFileId}`
    : `https://drive.google.com/file/d/${driveFileId}/view`
}

/**
 * El rótulo de la columna TIPO. Del mime cuando lo hay, de la extensión del nombre cuando no.
 * Sin ninguno de los dos dice 'Archivo', que es lo único que se sabe — no 'Documento', que sería
 * afirmar algo sobre un contenido que nadie miró.
 */
export function etiquetaDeTipo(tipo: TipoDrive, mimeType: string | null, nombre: string | null): string {
  if (tipo === 'carpeta') return 'Carpeta'
  const mime = (mimeType ?? '').toLowerCase()
  if (mime.includes('folder')) return 'Carpeta'
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'Planilla'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'Presentación'
  if (mime.includes('pdf')) return 'PDF'
  if (mime.includes('image/')) return 'Imagen'
  if (mime.includes('document') || mime.includes('msword')) return 'Documento'

  const ext = (/\.([a-z0-9]{1,5})$/i.exec(String(nombre ?? '').trim())?.[1] ?? '').toLowerCase()
  const PorExt: Record<string, string> = {
    pdf: 'PDF', xlsx: 'Excel', xls: 'Excel', xlsm: 'Excel', csv: 'CSV',
    doc: 'Word', docx: 'Word', ppt: 'PowerPoint', pptx: 'PowerPoint',
    jpg: 'Imagen', jpeg: 'Imagen', png: 'Imagen', heic: 'Imagen', webp: 'Imagen',
    dwg: 'Plano', dxf: 'Plano', zip: 'Comprimido', rar: 'Comprimido', txt: 'Texto',
  }
  return PorExt[ext] ?? 'Archivo'
}
