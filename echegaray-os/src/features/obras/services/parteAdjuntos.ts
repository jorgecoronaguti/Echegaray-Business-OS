// LAS FOTOS Y EL REGISTRO MULTIMEDIA DEL PARTE DIARIO — las reglas, sin base, sin red y sin React.
//
// Pedido del dueño, 23/09/2026: «necesito que los partes diarios permitan la carga de muchas
// imágenes, fotos, registro multimedia de todo; actualmente se hace así: foto y descripción».
//
// Lo que se decide ANTES de subir (qué entra, con qué tipo, cómo se llama el objeto en Storage),
// lo que se decide DESPUÉS (cómo se agrupan y ordenan, qué se le dice a la persona) y la lectura
// del EXIF viven acá, puros, y se prueban con `node --test`. Lo impuro —canvas, `upload()`,
// `insert()`— está en `subidaAdjuntosDeParte.ts` y en `parteAdjuntosActions.ts`.
//
// ═══ ACÁ HAY LISTA BLANCA DE TIPOS, Y ES LA DIFERENCIA CON LOS DOCUMENTOS DE PROVEEDOR ═══
//
// Un documento se guarda y se baja; una foto del parte se MIRA en la pantalla. Lo que entra es lo
// que el navegador puede mostrar: imagen, video y PDF. La lista es la misma que el `allowed_mime_types`
// del bucket `partes-adjuntos` y que el CHECK de `obra_parte_adjunto.tipo_mime`, palabra por palabra:
// lo que rebota acá rebotaría igual allá, pero acá se puede explicar.

/** Qué es cada archivo para la pantalla: decide miniatura, visor y tope. */
export type ClaseDeAdjunto = 'imagen' | 'video' | 'pdf'

/** Tipo → extensión con la que se guarda el objeto. El tipo manda, nunca el nombre del teléfono. */
const TIPOS: Record<string, { ext: string; clase: ClaseDeAdjunto }> = {
  'image/jpeg': { ext: 'jpg', clase: 'imagen' },
  'image/png': { ext: 'png', clase: 'imagen' },
  'image/webp': { ext: 'webp', clase: 'imagen' },
  'image/heic': { ext: 'heic', clase: 'imagen' },
  'image/heif': { ext: 'heif', clase: 'imagen' },
  'video/mp4': { ext: 'mp4', clase: 'video' },
  'video/quicktime': { ext: 'mov', clase: 'video' },
  'application/pdf': { ext: 'pdf', clase: 'pdf' },
}

/** Cuando el navegador no trae `type` (Safari con HEIC, algunos Android con .mov), la extensión decide. */
const POR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', pdf: 'application/pdf',
}

export const TIPOS_ACEPTADOS = Object.keys(TIPOS)

/** Lo que el `<input type="file">` le muestra al sistema. */
export const ACCEPT = 'image/*,video/*,application/pdf'

/**
 * LOS TOPES, POR CLASE. El del bucket es 100 MB (`file_size_limit`) y es el del video: un clip de
 * un minuto de celular pesa 60–120 MB. Una imagen que llega acá con más de 25 MB es un error (las
 * fotos se comprimen antes; un HEIC/PNG que no se pudo comprimir sigue pesando menos que eso). El
 * PDF de 25 MB es un plano escaneado; más que eso va a Drive.
 */
export const MAX_BYTES: Record<ClaseDeAdjunto, number> = {
  imagen: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
}

/** Cuántos entran por tanda. Un parte con «muchas fotos» son 20–30; el tope es para no colgar el teléfono. */
export const MAX_ARCHIVOS = 40

/** La compresión de imágenes en el navegador: lado mayor y calidad JPEG. */
export const LADO_MAYOR_PX = 2000
export const CALIDAD_JPEG = 0.85

/** Lo mínimo que hace falta de un `File` para decidir. Estructural: un `File` encaja. */
export interface ArchivoElegible {
  name: string
  type?: string
  size: number
}

export type ControlDeAdjunto =
  | { ok: true; mediaType: string; clase: ClaseDeAdjunto; extension: string }
  | { ok: false; error: string }

const MB = (n: number) => `${Math.round(n / (1024 * 1024))} MB`

/** El tipo real de un archivo: el `type` del navegador, y si no lo trae (o miente con octet-stream), la extensión. */
export function tipoDe(f: ArchivoElegible): string {
  const declarado = String(f.type ?? '').split(';')[0].trim().toLowerCase()
  if (declarado && declarado !== 'application/octet-stream') return declarado
  const ext = (String(f.name ?? '').toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1]) ?? ''
  return POR_EXTENSION[ext] ?? declarado
}

/**
 * ¿ESTE ARCHIVO SE PUEDE SUBIR, Y CON QUÉ TIPO?
 *
 * El tipo decide si entra Y con qué `contentType` se guarda. Un archivo de 0 bytes no es un archivo:
 * Storage lo acepta y la grilla mostraría una miniatura rota que afirma que la evidencia existe.
 */
export function archivoAceptable(f: ArchivoElegible): ControlDeAdjunto {
  const nombre = String(f.name ?? '').trim()
  if (!nombre) return { ok: false, error: 'Un archivo sin nombre no se puede guardar.' }
  if (nombre.length > 255) return { ok: false, error: `«${nombre.slice(0, 40)}…» tiene un nombre demasiado largo.` }
  const tipo = tipoDe(f)
  const def = TIPOS[tipo]
  if (!def) return { ok: false, error: `«${nombre}» no es una foto, un video (MP4/MOV) ni un PDF.` }
  if (!(f.size > 0)) return { ok: false, error: `«${nombre}» está vacío.` }
  if (f.size > MAX_BYTES[def.clase]) {
    const que = def.clase === 'video' ? 'El video' : def.clase === 'pdf' ? 'El PDF' : 'La imagen'
    return { ok: false, error: `«${nombre}» pesa más de ${MB(MAX_BYTES[def.clase])}. ${que} largo va a Drive; acá dejá un recorte.` }
  }
  return { ok: true, mediaType: tipo, clase: def.clase, extension: def.ext }
}

export interface RevisionDeLote<T extends ArchivoElegible> {
  aceptados: { archivo: T; mediaType: string; clase: ClaseDeAdjunto; extension: string }[]
  rechazados: { nombre: string; error: string }[]
  sobrantes: string[]
  aviso: string | null
}

/**
 * QUÉ ENTRA Y QUÉ NO, ARCHIVO POR ARCHIVO — y el sobrante SE NOMBRA. Un archivo malo no voltea el
 * lote; el tope se aplica sobre los aceptados; recortar en silencio es perder fotos.
 */
export function revisarLote<T extends ArchivoElegible>(elegidos: readonly T[]): RevisionDeLote<T> {
  const aceptados: RevisionDeLote<T>['aceptados'] = []
  const rechazados: { nombre: string; error: string }[] = []
  const sobrantes: string[] = []
  for (const archivo of elegidos) {
    const c = archivoAceptable(archivo)
    if (!c.ok) rechazados.push({ nombre: archivo.name, error: c.error })
    else if (aceptados.length < MAX_ARCHIVOS) aceptados.push({ archivo, mediaType: c.mediaType, clase: c.clase, extension: c.extension })
    else sobrantes.push(archivo.name)
  }
  const partes = rechazados.map((r) => r.error)
  if (sobrantes.length) {
    partes.push(`Entran hasta ${MAX_ARCHIVOS} archivos por vez: ${sobrantes.length} ${sobrantes.length === 1 ? 'quedó' : 'quedaron'} afuera. Subilos en otra tanda.`)
  }
  return { aceptados, rechazados, sobrantes, aviso: partes.length ? partes.join(' ') : null }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** El id de `obra_canonica` es un slug (`galpon-9`). Nada que pueda meter una barra o un `..` en la ruta. */
const OBRA = /^[A-Za-z0-9_-]{1,80}$/
const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * EL NOMBRE DEL OBJETO EN EL BUCKET: `obra/<obra_id>/<fecha>/<uuid>.<ext>`.
 *
 * Las carpetas 2 y 3 son parte de la cerradura, no orden: la policy de Storage le pregunta a
 * `ve_obra()` por la 2ª, y el CHECK y la policy de la tabla cruzan las dos contra `obra_id` y `fecha`.
 * Se valida acá porque acá se puede explicar; allá el error sería un «row-level security» mudo.
 */
export function rutaDeAdjunto(p: { obraId: string; fecha: string; id: string; mediaType: string }): string {
  if (!OBRA.test(p.obraId)) throw new Error(`La ruta del adjunto necesita una obra válida; vino «${p.obraId}».`)
  if (!FECHA.test(p.fecha)) throw new Error(`La ruta del adjunto necesita una fecha AAAA-MM-DD; vino «${p.fecha}».`)
  if (!UUID.test(p.id)) throw new Error(`La ruta del adjunto necesita un uuid; vino «${p.id}».`)
  const def = TIPOS[p.mediaType]
  if (!def) throw new Error(`«${p.mediaType}» no es un tipo aceptado.`)
  return `obra/${p.obraId}/${p.fecha}/${p.id.toLowerCase()}.${def.ext}`
}

/** La misma pregunta que hace la policy de la tabla, del lado del servidor: ¿esta ruta es de ESTA obra y ESTE día? */
export function esRutaDelParte(ruta: string, obraId: string, fecha: string): boolean {
  if (!OBRA.test(obraId) || !FECHA.test(fecha)) return false
  const partes = String(ruta ?? '').split('/')
  return partes.length === 4 && partes[0] === 'obra' && partes[1] === obraId && partes[2] === fecha
    && /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(partes[3])
}

/** La fila de `public.obra_parte_adjunto` tal como la lee la pantalla. */
export interface AdjuntoDeParte {
  id: string
  obra_id: string
  fecha: string
  actividad_id: string | null
  ejecucion_id: string | null
  storage_path: string
  nombre_archivo: string
  tipo_mime: string
  tamano_bytes: number
  descripcion: string | null
  tomada_en: string | null
  subido_por: string
  creado_en: string
  borrado_en: string | null
}

export const claseDe = (tipoMime: string): ClaseDeAdjunto => TIPOS[tipoMime]?.clase ?? 'pdf'
export const esImagen = (tipoMime: string): boolean => claseDe(tipoMime) === 'imagen'
/** HEIC/HEIF: se guarda, pero Chrome y Android no lo dibujan. La miniatura lo dice en vez de salir rota. */
export const esHeic = (tipoMime: string): boolean => tipoMime === 'image/heic' || tipoMime === 'image/heif'
/** Lo que se puede comprimir en un canvas antes de subir. HEIC no: el navegador no lo decodifica (Safari sí, y ahí se intenta). */
export const seComprime = (tipoMime: string): boolean => esImagen(tipoMime)

/** El momento por el que se ordena: cuándo se sacó, y si no se sabe, cuándo se subió. */
export const momentoDe = (a: Pick<AdjuntoDeParte, 'tomada_en' | 'creado_en'>): string => a.tomada_en ?? a.creado_en

/** Vigentes, del más viejo al más nuevo del día: la mañana antes que la tarde. Empate → por creado_en, luego id. */
export function ordenarAdjuntos<T extends Pick<AdjuntoDeParte, 'id' | 'tomada_en' | 'creado_en' | 'borrado_en'>>(as: readonly T[]): T[] {
  return as.filter((a) => a.borrado_en == null).sort((x, y) =>
    momentoDe(x).localeCompare(momentoDe(y)) || x.creado_en.localeCompare(y.creado_en) || x.id.localeCompare(y.id))
}

export interface GrupoDelDia<T> { fecha: string; adjuntos: T[] }

/** Por día, el más reciente arriba (Documentos: «Registro fotográfico» por día). Dentro del día, por momento. */
export function agruparPorDia<T extends Pick<AdjuntoDeParte, 'id' | 'fecha' | 'tomada_en' | 'creado_en' | 'borrado_en'>>(as: readonly T[]): GrupoDelDia<T>[] {
  const porDia = new Map<string, T[]>()
  for (const a of ordenarAdjuntos(as)) {
    const lista = porDia.get(a.fecha) ?? []
    lista.push(a)
    porDia.set(a.fecha, lista)
  }
  return [...porDia.entries()].sort((x, y) => y[0].localeCompare(x[0])).map(([fecha, adjuntos]) => ({ fecha, adjuntos }))
}

export interface GrupoDeFrente<T> { actividadId: string | null; rotulo: string; adjuntos: T[] }

/**
 * Por frente, con «Del día» PRIMERO y después los frentes en el orden en que aparecen en el parte.
 * Un adjunto atado a una actividad que ya no está en la lista se dibuja con el id como rótulo
 * «frente sin nombre»: no se esconde ni se pasa a «del día» en silencio.
 */
export function agruparPorFrente<T extends Pick<AdjuntoDeParte, 'id' | 'actividad_id' | 'tomada_en' | 'creado_en' | 'borrado_en'>>(
  as: readonly T[], frentes: readonly { id: string; nombre: string }[],
): GrupoDeFrente<T>[] {
  const orden = new Map<string | null, GrupoDeFrente<T>>()
  orden.set(null, { actividadId: null, rotulo: 'Del día', adjuntos: [] })
  for (const f of frentes) orden.set(f.id, { actividadId: f.id, rotulo: f.nombre, adjuntos: [] })
  for (const a of ordenarAdjuntos(as)) {
    let g = orden.get(a.actividad_id)
    if (!g) {
      g = { actividadId: a.actividad_id, rotulo: 'frente sin nombre', adjuntos: [] }
      orden.set(a.actividad_id, g)
    }
    g.adjuntos.push(a)
  }
  return [...orden.values()].filter((g) => g.adjuntos.length > 0)
}

/** «3 fotos · 1 video» — el resumen del bloque. Cero → «sin fotos». */
export function resumenDeAdjuntos(as: readonly Pick<AdjuntoDeParte, 'tipo_mime' | 'borrado_en'>[]): string {
  const vivos = as.filter((a) => a.borrado_en == null)
  if (!vivos.length) return 'sin fotos'
  const n = { imagen: 0, video: 0, pdf: 0 }
  for (const a of vivos) n[claseDe(a.tipo_mime)]++
  const partes: string[] = []
  if (n.imagen) partes.push(`${n.imagen} ${n.imagen === 1 ? 'foto' : 'fotos'}`)
  if (n.video) partes.push(`${n.video} ${n.video === 1 ? 'video' : 'videos'}`)
  if (n.pdf) partes.push(`${n.pdf} PDF`)
  return partes.join(' · ')
}

/** El peso como lo lee una persona. */
export function pesoLegible(bytes: number): string {
  if (!(bytes > 0)) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** «14:32» del momento de la foto, en hora local. Si no se sabe cuándo se sacó, se dice. */
export function horaDe(a: Pick<AdjuntoDeParte, 'tomada_en' | 'creado_en'>): string {
  if (!a.tomada_en) return 'hora sin registrar'
  const d = new Date(a.tomada_en)
  return Number.isNaN(d.getTime()) ? 'hora sin registrar' : d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

const SIN_PERMISO = 'Tu usuario no puede cargar fotos en el parte de esta obra. Si creés que sí debería, avisale a Dirección.'

/** EL ERROR DE STORAGE O DE POSTGRES, DICHO EN CASTELLANO — y si no se reconoce, TAL CUAL. */
export function traducirError(mensaje: string): string {
  if (/permission denied|row-level security|violates row-level|not authorized/i.test(mensaje)) return SIN_PERMISO
  if (/relation .* does not exist|schema cache/i.test(mensaje)) {
    return 'Todavía no puedo recibir fotos por acá: falta aplicar la migración en la base. Avisale a Dirección.'
  }
  if (/bucket not found/i.test(mensaje)) return 'Todavía no está creado el depósito de fotos del parte. Avisale a Dirección.'
  if (/mime type .* is not supported|invalid mime type/i.test(mensaje)) return 'Ese tipo de archivo no entra: foto, video (MP4/MOV) o PDF.'
  if (/duplicate key|resource already exists|already exists/i.test(mensaje)) return 'Ese archivo ya estaba guardado.'
  if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(mensaje)) return 'Pesa más de lo que el depósito acepta (100 MB).'
  if (/jwt expired|invalid claim|token is expired/i.test(mensaje)) return 'Tu sesión venció mientras subía. Volvé a entrar y probá otra vez.'
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(mensaje)) return 'Se cortó la conexión mientras subía. Probá de nuevo cuando tengas señal.'
  if (/ruta_coherente|obra_parte_adjunto_ruta/i.test(mensaje)) return 'El archivo no corresponde a esta obra y este día.'
  return mensaje
}

// ═══ EXIF: CUÁNDO SE SACÓ LA FOTO ═══
//
// Se lee ANTES de comprimir, porque el canvas tira los metadatos. Sólo JPEG (HEIC y PNG no traen
// EXIF legible acá; el video tampoco). Se busca el APP1 «Exif», el encabezado TIFF, el IFD0, el
// puntero al Exif IFD (0x8769) y ahí el tag DateTimeOriginal (0x9003), «AAAA:MM:DD HH:MM:SS».
// Sin zona: la cámara escribe hora local, y se interpreta como hora local del que sube (la obra y
// el teléfono están en el mismo lugar). Si algo no cierra, `null`: «no se pudo leer», nunca inventar.

/** `AAAA:MM:DD HH:MM:SS` de EXIF → ISO local sin zona (`AAAA-MM-DDTHH:MM:SS`), o null si no es una fecha. */
export function fechaExifAIso(s: string | null | undefined): string | null {
  const m = String(s ?? '').match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, a, mes, d, h, mi, se] = m
  if (a === '0000' || Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31 || Number(h) > 23 || Number(mi) > 59 || Number(se) > 59) return null
  return `${a}-${mes}-${d}T${h}:${mi}:${se}`
}

/**
 * `DateTimeOriginal` de un JPEG, o null. Recibe los primeros bytes del archivo (con 128 KB alcanza:
 * el APP1 va al principio). Es un lector mínimo y defensivo: cualquier desborde devuelve null.
 */
export function fechaDeTomaExif(bytes: ArrayBuffer | Uint8Array): string | null {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  try {
    if (b.length < 4 || v.getUint16(0) !== 0xffd8) return null
    let p = 2
    while (p + 4 <= b.length) {
      if (b[p] !== 0xff) return null
      const marcador = b[p + 1]
      const largo = v.getUint16(p + 2)
      if (marcador === 0xe1 && p + 10 <= b.length
        && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) {
        return leerTiff(v, p + 10, Math.min(p + 2 + largo, b.length))
      }
      if (marcador === 0xda) return null // llegó la imagen sin APP1
      p += 2 + largo
    }
    return null
  } catch {
    return null
  }
}

function leerTiff(v: DataView, base: number, fin: number): string | null {
  const orden = v.getUint16(base)
  const le = orden === 0x4949
  if (!le && orden !== 0x4d4d) return null
  const u16 = (o: number) => v.getUint16(o, le)
  const u32 = (o: number) => v.getUint32(o, le)
  if (u16(base + 2) !== 0x2a) return null
  const ifd0 = base + u32(base + 4)
  const buscar = (ifd: number, tag: number): number | null => {
    if (ifd + 2 > fin) return null
    const n = u16(ifd)
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12
      if (e + 12 > fin) return null
      if (u16(e) === tag) return e
    }
    return null
  }
  const exifPtr = buscar(ifd0, 0x8769)
  if (exifPtr === null) return null
  const exifIfd = base + u32(exifPtr + 8)
  const tag = buscar(exifIfd, 0x9003)
  if (tag === null) return null
  const tipo = u16(tag + 2)
  const cuenta = u32(tag + 4)
  if (tipo !== 2 || cuenta < 19 || cuenta > 64) return null
  const off = base + u32(tag + 8)
  if (off + 19 > fin) return null
  let s = ''
  for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(off + i))
  return fechaExifAIso(s)
}

/**
 * ISO local sin zona → ISO con la zona del navegador. Es lo que va a `tomada_en` (timestamptz).
 * Vive aparte para que el test del EXIF no dependa de la zona de la máquina.
 */
export function aTimestampLocal(isoSinZona: string): string {
  const d = new Date(isoSinZona)
  return Number.isNaN(d.getTime()) ? isoSinZona : d.toISOString()
}

/** El lado destino de una imagen para que el mayor no pase de `LADO_MAYOR_PX`, sin agrandar. */
export function medidaComprimida(ancho: number, alto: number, lado = LADO_MAYOR_PX): { ancho: number; alto: number; reduce: boolean } {
  const mayor = Math.max(ancho, alto)
  if (!(mayor > lado)) return { ancho, alto, reduce: false }
  const f = lado / mayor
  return { ancho: Math.max(1, Math.round(ancho * f)), alto: Math.max(1, Math.round(alto * f)), reduce: true }
}

/** «Descripción del conjunto»: se aplica a cada archivo que no trae la suya. Vacío → null, nunca ''. */
export function descripcionFinal(propia: string | null | undefined, delConjunto: string | null | undefined): string | null {
  const p = String(propia ?? '').trim()
  if (p) return p.slice(0, 1000)
  const c = String(delConjunto ?? '').trim()
  return c ? c.slice(0, 1000) : null
}
