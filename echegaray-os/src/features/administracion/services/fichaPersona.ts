// LO QUE LA FICHA DE UNA PERSONA AFIRMA — las reglas, sin base y sin React.
//
// Tres cosas que la pantalla 20 del Design canónico dice y que no se pueden dejar en el JSX, porque
// las tres tienen una forma de mentir que no rompe nada:
//
//   1. LA ANTIGÜEDAD. Se muestra en el slab («3,4 a desde 03/2023»). Sin fecha de alta NO es 0
//      años: es que no se cargó el papel. Un «0 a» al lado del nombre de alguien que entró en 2019
//      es la clase de dato que después alguien usa para calcular una indemnización.
//   2. EL ESTADO DE UN PAPEL. `documentacion_legajo` tiene `presente` Y `drive_file_id`, y no
//      significan lo mismo: `presente = true` sin archivo es «alguien dijo que lo tiene», no «está».
//   3. QUÉ SE PIDIÓ Y NO LLEGÓ. El ciclo del Design («solicitado → subido → en revisión →
//      aprobado / requiere corrección») NO existe en la base: acá sólo hay tres estados reales, y
//      los que faltan no se dibujan. Inventar «en revisión» sería fabricar un hecho de RRHH.

// RUTA CON EXTENSIÓN: `node --test` resuelve el import de VALOR de verdad, y `'../types'` a secas
// es un directorio — ERR_UNSUPPORTED_DIR_IMPORT antes de la primera aserción. El mismo motivo por
// el que `cuadrillasService` importa `tipoHora.ts` con extensión.
import { faltaEnElLegajo, type DocumentoLegajo } from '../types/index.ts'

// ═══ ANTIGÜEDAD ═══

/** Años de antigüedad con un decimal, o `null` si no hay fecha de alta cargada.
 *
 *  `hoy` entra por parámetro y no se lee del reloj: una regla que consulta la hora no se puede
 *  probar dos veces con el mismo resultado. */
export function antiguedadEnAnios(fechaIngreso: string | null, hoy: string): number | null {
  if (!fechaIngreso) return null
  const alta = Date.parse(`${fechaIngreso.slice(0, 10)}T00:00:00Z`)
  const hasta = Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(alta) || Number.isNaN(hasta)) return null
  // UN ALTA EN EL FUTURO NO ES ANTIGÜEDAD NEGATIVA. Pasa con una carga anticipada; devolver -0,2
  // dibujaría un número que no significa nada al lado del nombre.
  if (hasta < alta) return null
  const anios = (hasta - alta) / (365.25 * 24 * 3600 * 1000)
  return Math.round(anios * 10) / 10
}

// ═══ EL ESTADO DE UN PAPEL DEL LEGAJO ═══

/**
 * Los TRES estados que la base puede sostener. El Design dibuja cinco; los otros dos —«en revisión»
 * y «requiere corrección»— necesitan un revisor, una fecha de revisión y un motivo, y ninguna de las
 * tres columnas existe en `documentacion_legajo`. Se declara, no se simula.
 */
export type EstadoDocumento = 'cargado' | 'sin_archivo' | 'solicitado'

export function estadoDocumento(d: Pick<DocumentoLegajo, 'drive_file_id' | 'presente'>): EstadoDocumento {
  // EL ARCHIVO MANDA SOBRE LA CASILLA. `presente` lo tilda una persona; `drive_file_id` es el
  // vínculo que se puede abrir. Cuando discrepan, el que se puede verificar es el vínculo: una fila
  // que dice «lo tenemos» y no se puede abrir es un legajo que parece completo en la auditoría del
  // IERIC y no lo está.
  if (d.drive_file_id) return 'cargado'
  if (d.presente) return 'sin_archivo'
  return 'solicitado'
}

/** Qué palabra lleva cada estado y qué acción ofrece. La acción es texto a la derecha de la fila
 *  (Design §Document request row), más oscura cuando alguien tiene que hacer algo. */
export const DOCUMENTO_ESTADO: Record<EstadoDocumento, { palabra: string; accion: string; pide: boolean }> = {
  cargado: { palabra: 'cargado', accion: 'Ver', pide: false },
  sin_archivo: { palabra: 'sin archivo', accion: 'Subir', pide: true },
  solicitado: { palabra: 'solicitado', accion: 'Subir', pide: true },
}

/**
 * Los papeles que el legajo PIDE y todavía no tienen ni una fila.
 *
 * A quien ya no está no se le pide nada: su apto médico caducó con el vínculo, y una lista de
 * cuatro faltantes en un legajo cerrado es trabajo que nadie va a hacer nunca.
 */
export function solicitadosDelLegajo(documentos: DocumentoLegajo[], enLaEmpresa: boolean): string[] {
  return enLaEmpresa ? faltaEnElLegajo(documentos) : []
}

/** Cuántos papeles piden acción: los que no se pueden abrir más los que ni siquiera existen. */
export function papelesPendientes(documentos: DocumentoLegajo[], enLaEmpresa: boolean): number {
  const sinArchivo = documentos.filter((d) => estadoDocumento(d) !== 'cargado').length
  return sinArchivo + solicitadosDelLegajo(documentos, enLaEmpresa).length
}
