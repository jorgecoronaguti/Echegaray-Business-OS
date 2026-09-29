// LAS CELDAS DE DATOS DEL RECIBO EN BLANCO, YA FILTRADAS: una celda sin valor no existe.
//
// Dueño, 29/09/2026: «no podés dejar cuadros vacíos en el modelo de recibo de sueldo en blanco». Antes cada
// celda sin dato se dibujaba con «—». Vive acá y no en el componente para poder probarlo sin renderizar: el
// componente sólo pinta lo que devuelve esta función. Cada bloque es una fila de la grilla del papel; un
// bloque sin ninguna celda con valor se omite entero.

import { periodoDePago, type ReciboContador } from './reciboFormatoContador.ts'

/** [rótulo, valor, esTexto] — `esTexto` deja partir el valor entre palabras; los numéricos no se parten. */
export type CeldaDelRecibo = readonly [string, string, boolean?]

export interface EmpleadoParaCeldas {
  nombre: string
  legajo: string | null
  cuil: string | null
  /** ISO. */
  ingreso: string | null
  antiguedad?: string | null
  calificacion?: string | null
  periodo?: string | null
  modalidad?: string | null
  obraSocial?: string | null
  lugarYFechaDePago?: string | null
}

const ddmmaaaa = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const plata = (n: number): string => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type Candidata = readonly [string, string | null | undefined, boolean?]

const conValor = (celdas: readonly Candidata[]): CeldaDelRecibo[] =>
  celdas.filter((c): c is CeldaDelRecibo => c[1] != null && c[1].trim() !== '')

export function bloquesDeDatos(
  recibo: Pick<ReciboContador, 'categoria' | 'valorHora' | 'sueldoBruto'>, empleado: EmpleadoParaCeldas, quincena: { desde: string },
): CeldaDelRecibo[][] {
  const p = periodoDePago(quincena.desde)
  const bloques: Candidata[][] = [
    [
      ['Q', String(p.q)], ['MES', p.mes], ['AÑO', p.anio], ['APELLIDO Y NOMBRE', empleado.nombre, true], ['N° LEGAJO', empleado.legajo],
      ['REM. ASIGNADA', recibo.valorHora == null ? null : plata(recibo.valorHora)],
      ['SUELDO BRUTO', recibo.sueldoBruto == null ? null : plata(recibo.sueldoBruto)], ['C.U.I.L.', empleado.cuil],
    ],
    [
      ['FECHA INGRESO', empleado.ingreso ? ddmmaaaa(empleado.ingreso) : null], ['ANTIGÜEDAD', empleado.antiguedad],
      ['CALIFICACIÓN PROFESIONAL', empleado.calificacion, true], ['PERIODO', empleado.periodo],
    ],
    [['CATEGORÍA LABORAL', recibo.categoria, true], ['MODALIDAD DE CONTRATACIÓN', empleado.modalidad, true]],
    [['OBRA SOCIAL', empleado.obraSocial, true], ['LUGAR Y FECHA DE PAGO', empleado.lugarYFechaDePago, true], ['PERIODO DE PAGO', p.texto, true]],
  ]
  return bloques.map(conValor).filter((b) => b.length > 0)
}
