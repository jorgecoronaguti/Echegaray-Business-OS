// CÓMO SE LLAMA UN PAPEL DEL LEGAJO EN LA PANTALLA — la regla, sin React.
//
// La ficha 20 dibujaba el nombre CRUDO del archivo de Drive: «Recibo 2026-07 Q2 - AGUERO CRISTIAN
// (firmado).pdf». El canónico dibuja «Recibo julio 2026» con el archivo abajo. La diferencia no es
// cosmética: la lista de Documentación existe para contestar *qué papeles tiene esta persona*, y
// seis nombres de archivo con su extensión, su sufijo de versión y el apellido repetido no la
// contestan de un vistazo.
//
// ═══ DE DÓNDE SALE EL PERÍODO, Y DE DÓNDE NO ═══
//
// `documentacion_legajo` NO tiene columna de período. Tiene `fecha_documento`, que es la fecha DEL
// documento —cuándo se firmó, cuándo se cargó—, y no el mes que liquida. El mockup lo muestra
// separado a propósito: «Recibo julio 2026 / firmado 05/08». Derivar «agosto» de un recibo de julio
// firmado el 05/08 sería fabricar un hecho laboral, así que el período se lee ÚNICAMENTE del nombre
// del archivo, donde la administración ya lo escribe («Recibo 2026-07 …»). Si no está ahí, el rótulo
// va sin período — nunca con uno inventado.
//
// ═══ EL NOMBRE CRUDO NO SE TIRA ═══
//
// Es la única forma de encontrar el archivo en Drive cuando algo no cuadra. Viaja al `title` de la
// fila: fuera del camino de quien barre la lista, disponible para quien se detiene.

import type { DocumentoLegajo } from '../types/index.ts'

/** Cómo se llama cada categoría del `CHECK` de la base cuando la lee una persona. Las claves son
 *  exactamente `CATEGORIAS_DOCUMENTO`; agregar una categoría sin agregarla acá deja el rótulo crudo,
 *  que es degradarse, no romperse. */
export const ETIQUETA_DOCUMENTO: Record<string, string> = {
  dni: 'DNI',
  cuil: 'CUIL',
  alta_temprana: 'Alta temprana',
  // «HM» / «libreta» en el nombre del archivo es la LIBRETA DEL IERIC, no una historia médica.
  ieric: 'Libreta IERIC',
  contrato: 'Contrato',
  art: 'Constancia ART',
  libreta_fondo_cese: 'Libreta de fondo de cese',
  examen_medico: 'Examen médico',
  epp: 'Entrega de EPP',
  capacitacion: 'Capacitación',
  recibo_sueldo: 'Recibo',
  licencia_conducir: 'Licencia de conducir',
  baja: 'Baja',
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** El período escrito EN EL NOMBRE del archivo, en `AAAA-MM`. Sólo eso: `AAAA_MM` y `MM-AAAA`
 *  aparecen en tres archivos y en ninguno de forma consistente, así que reconocerlos daría un
 *  período correcto a veces y uno dado vuelta el resto. */
export function periodoDelNombre(nombre: string | null | undefined): string | null {
  const m = /(20\d{2})[-/](0[1-9]|1[0-2])(?!\d)/.exec(String(nombre ?? ''))
  if (!m) return null
  return `${MESES[Number(m[2]) - 1]} ${m[1]}`
}

/**
 * El rótulo curado de un papel del legajo, y el nombre crudo que lo respalda.
 *
 * `titulo` es lo que se dibuja; `archivo` es lo que va al `title` de la fila (o `null` si el papel
 * fue pedido y todavía no llegó ningún archivo).
 *
 * SIN CATEGORÍA NO HAY RÓTULO QUE INVENTAR: un documento cargado como `otro`, o con un tipo que esta
 * pantalla no conoce, cae al nombre del archivo. Es peor de leer y es honesto — nombrarlo «Documento»
 * escondería que nadie lo clasificó.
 */
export function rotuloDocumento(
  d: Pick<DocumentoLegajo, 'nombre' | 'tipo_documento'>,
): { titulo: string; archivo: string | null } {
  const archivo = d.nombre?.trim() ? d.nombre.trim() : null
  const etiqueta = d.tipo_documento ? ETIQUETA_DOCUMENTO[d.tipo_documento] : undefined
  if (!etiqueta) return { titulo: archivo ?? 'sin nombre', archivo }

  // EL PERÍODO SÓLO DONDE SIGNIFICA ALGO. Un DNI no tiene mes; si el archivo se llamó «DNI 2026-07»
  // porque así se escaneó, escribir «DNI julio 2026» afirmaría una vigencia que nadie cargó.
  const periodo = d.tipo_documento === 'recibo_sueldo' ? periodoDelNombre(archivo) : null
  return { titulo: periodo ? `${etiqueta} ${periodo}` : etiqueta, archivo }
}
