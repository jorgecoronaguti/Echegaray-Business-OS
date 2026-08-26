// CÓMO SE LEE LA CARPETA DE LA OBRA — clasificación pura, sin red.
//
// Drive devuelve una lista plana de archivos y carpetas. Lo que el cliente necesita ver es otra cosa:
// su cotización, su contrato, los planos por disciplina con su revisión, y los certificados. Esa
// traducción es una REGLA DE NEGOCIO y por eso vive acá, separada de la llamada: se prueba con
// nombres reales de archivo y no hace falta Drive para saber si está bien.
//
// ═══ LO QUE NO SE HACE ═══
//
// No se adivina la revisión de un plano cuyo nombre no la trae. «rev 1» por defecto sería inventar el
// estado de un documento técnico, que es exactamente lo que un cliente NO puede recibir mal.

export type Disciplina = 'arquitectura' | 'estructura' | 'sanitaria_electrica' | 'terminaciones' | 'otra'

export type ArchivoDrive = {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string | null
  /** Sólo si alguien lo calculó. NUNCA se estima. */
  hojas?: number | null
}

export type Documento = {
  id: string
  nombre: string
  /** `null` = el nombre no la trae. Se escribe «sin revisión», no «rev 1». */
  revision: string | null
  hojas: number | null
  fecha: string | null
}

export type Planos = { disciplina: Disciplina; rotulo: string; docs: Documento[] }

export const ROTULO_DISCIPLINA: Record<Disciplina, string> = {
  arquitectura: 'Arquitectura',
  estructura: 'Estructura',
  sanitaria_electrica: 'Sanitaria y eléctrica',
  terminaciones: 'Terminaciones',
  otra: 'Otros planos',
}

/** El orden en que la maqueta las muestra. No es alfabético: es el orden en que se construye. */
export const ORDEN_DISCIPLINAS: Disciplina[] = ['arquitectura', 'estructura', 'sanitaria_electrica', 'terminaciones']

const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** La revisión tal como la escribe el estudio: `rev 4`, `REV.04`, `_r3_`. `null` si no está. */
export function revisionDe(nombre: string): string | null {
  // `\brev` NO sirve: en «ARQ_REV.04» el guion bajo es carácter de palabra y no hay borde antes de
  // «rev». Se pide inicio de cadena o un carácter que no sea letra.
  const n = sinTildes(nombre)
  const m = n.match(/(?:^|[^a-z])rev[\s._-]*(\d{1,2}|final)(?![a-z0-9])/) ?? n.match(/[_-]r(\d{1,2})(?![a-z0-9])/)
  if (!m) return null
  return m[1] === 'final' ? 'rev final' : `rev ${Number(m[1])}`
}

export function disciplinaDe(nombre: string): Disciplina {
  const n = sinTildes(nombre)
  if (/\b(arq|arquitectura)\b/.test(n)) return 'arquitectura'
  if (/\b(est|estructura|estructural|hormigon)\b/.test(n)) return 'estructura'
  if (/\b(san|sanitaria|electrica|elec|instalacion|instalaciones)\b/.test(n)) return 'sanitaria_electrica'
  if (/\b(term|terminacion|terminaciones)\b/.test(n)) return 'terminaciones'
  return 'otra'
}

export type Clasificado = {
  cotizacion: Documento | null
  contrato: Documento | null
  planos: Planos[]
  certificados: Documento[]
  /** Lo que no encajó en ningún lado. Se muestra: esconderlo haría desaparecer un papel real. */
  otros: Documento[]
  hojasTotales: number | null
}

const aDoc = (a: ArchivoDrive): Documento => ({
  id: a.id,
  nombre: a.name,
  revision: revisionDe(a.name),
  hojas: a.hojas ?? null,
  fecha: a.modifiedTime ? a.modifiedTime.slice(0, 10) : null,
})

/** NÚCLEO PURO: la carpeta plana de Drive, traducida a lo que el cliente entiende. */
export function clasificar(archivos: ArchivoDrive[]): Clasificado {
  const esCarpeta = (a: ArchivoDrive) => a.mimeType === 'application/vnd.google-apps.folder'
  const utiles = archivos.filter((a) => !esCarpeta(a))

  let cotizacion: Documento | null = null
  let contrato: Documento | null = null
  const certificados: Documento[] = []
  const porDisciplina = new Map<Disciplina, Documento[]>()
  const otros: Documento[] = []

  for (const a of utiles) {
    const n = sinTildes(a.name)
    const doc = aDoc(a)
    if (/cotizacion|presupuesto|ppto/.test(n)) {
      // Entre dos cotizaciones gana la de revisión más alta: es la vigente.
      if (!cotizacion || (doc.revision ?? '') > (cotizacion.revision ?? '')) cotizacion = doc
    } else if (/contrato/.test(n)) {
      contrato = contrato ?? doc
    } else if (/certificad/.test(n)) {
      certificados.push(doc)
    } else if (/plano|\brev\b|\.dwg$|\bpla\b/.test(n) || disciplinaDe(a.name) !== 'otra') {
      const d = disciplinaDe(a.name)
      porDisciplina.set(d, [...(porDisciplina.get(d) ?? []), doc])
    } else {
      otros.push(doc)
    }
  }

  const planos: Planos[] = [...ORDEN_DISCIPLINAS, 'otra' as Disciplina]
    .filter((d) => porDisciplina.has(d))
    .map((d) => ({ disciplina: d, rotulo: ROTULO_DISCIPLINA[d], docs: porDisciplina.get(d)! }))

  // LAS HOJAS SE SUMAN SÓLO SI TODAS SE CONOCEN. Un total armado con los que sí tienen dato diría
  // «13 hojas» cuando podrían ser treinta, y eso es peor que no decir nada.
  const todasLasHojas = planos.flatMap((p) => p.docs.map((d) => d.hojas))
  const hojasTotales = todasLasHojas.length && todasLasHojas.every((h) => h != null)
    ? (todasLasHojas as number[]).reduce((s, h) => s + h, 0)
    : null

  return { cotizacion, contrato, planos, certificados, otros, hojasTotales }
}

/** «hace 2 h», como en la maqueta. Es la frescura del cache, y se muestra siempre. */
export function haceCuanto(desde: Date | null, ahora = new Date()): string {
  if (!desde) return 'sin sincronizar'
  const min = Math.floor((ahora.getTime() - desde.getTime()) / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}
