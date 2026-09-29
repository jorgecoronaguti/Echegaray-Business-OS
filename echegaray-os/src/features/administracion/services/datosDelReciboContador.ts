// LOS DATOS DE LA PERSONA Y DEL PERÍODO QUE LLEVA EL «RECIBO EN BLANCO», Y DE QUÉ CAMPO SALE CADA UNO.
//
// Dueño, 29/09/2026: «todas esas celdas vacías contienen datos que se encuentran en los legajos del personal
// pero no estás usando las tablas de supabase correctas». El papel imprimía «—» en diez celdas aunque el
// legajo ya viaja al panel (`DetalleLaboral`, el mismo que muestra la ficha): se leía sólo Legajo y CUIL.
//
// UNA FUENTE POR CONCEPTO: nada se consulta acá. Los campos de la persona salen de los bloques del legajo que
// arma `getDatosDeLaSolapaHoras` desde `persona_legajo` (la vista con portero; `personas` está cerrada a la
// web). Lo que ninguna tabla guarda queda `null` y el papel dice «—»: un dato inventado en un recibo es peor
// que el hueco.
//
// SIN FUENTE HOY (medido el 29/09/2026 en `personas`, `persona_legajo`, `recibo_sueldo_linea`,
// `recibo_sueldo_concepto`, `nomina_recibo_neto`, `recibo_empleado`, `haberes_acreditados_banco`,
// `jornal_quincena`): fecha reconocida, fecha de pago de aportes, nombre del banco, sección. El encabezado del
// PDF del estudio (donde están) no se importó a ninguna columna. Por eso esas cuatro celdas se RETIRARON del
// papel (dueño, 29/09: «no cuadros vacíos»): volverán cuando el encabezado se importe. Y toda celda que salga
// sin valor (obra social sin cargar, ingreso sin fecha) no se dibuja: ver `Datos`.
//
// LA FECHA DE PAGO SÍ TIENE FUENTE (`nomina_recibo_neto.fecha_pago`, y `jornal_quincena.fecha_pago` como segunda):
// la medición del 29/09 la dio por ausente por mirar el legajo y no las tablas de nómina; la auditoría lo corrigió.
// Se lee en `fechaDePagoDelRecibo.ts` y llega por el detalle laboral.
//
// UN DATO INFERIDO NO SE PRESENTA COMO HECHO (regla de oro 2): lleva «*» y una nota al pie que dice de dónde salió.
// Son inferencias la calificación (es el oficio del legajo), la antigüedad (calculada desde el ingreso, no la
// reconocida), el lugar de pago (domicilio del empleador) y la fecha si viene de `jornal_quincena`.

import type { DetalleLaboral } from './detalleLaboral.ts'
import { EMPLEADOR, periodoDePago } from './reciboFormatoContador.ts'

export interface DatosDelLegajoParaRecibo {
  legajo: string | null
  cuil: string | null
  antiguedad: string | null
  calificacion: string | null
  periodo: string
  modalidad: string | null
  obraSocial: string | null
  /** «domicilio*, dd/mm/aaaa»; sin fecha real, sólo «domicilio*»: nunca una raya. */
  lugarYFechaDePago: string
  /** Una línea por dato marcado con «*», para el pie del papel. */
  notasInferidas: string[]
}

const MARCA = '*'
const fechaDdMmAaaa = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Un campo del legajo por su rótulo; los mismos que muestra `DetalleLaboralDeLaPersona`. `null` = sin cargar. */
export function campoDelLegajo(detalle: DetalleLaboral | undefined, rotulo: string): string | null {
  const v = [...(detalle?.legajo ?? []), ...(detalle?.laboral ?? [])].find((c) => c.rotulo === rotulo)?.valor ?? null
  return v != null && v.trim() !== '' ? v : null
}

/**
 * ANTIGÜEDAD — ES UN CÁLCULO, NO UN DATO GUARDADO: meses cumplidos entre la fecha reconocida (o, si no hay,
 * el ingreso) y el último día de la quincena liquidada. Sin ninguna de las dos fechas, `null`.
 */
export function antiguedadAl(hasta: string, reconocida: string | null, ingreso: string | null): string | null {
  const desde = reconocida ?? ingreso
  if (!desde || !/^\d{4}-\d{2}-\d{2}/.test(desde) || desde.slice(0, 10) > hasta) return null
  let meses = (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 + Number(hasta.slice(5, 7)) - Number(desde.slice(5, 7))
  if (Number(hasta.slice(8, 10)) < Number(desde.slice(8, 10))) meses -= 1
  const a = Math.floor(meses / 12)
  const m = meses % 12
  const partes = [a > 0 ? `${a} ${a === 1 ? 'año' : 'años'}` : null, m > 0 ? `${m} ${m === 1 ? 'mes' : 'meses'}` : null].filter(Boolean)
  return partes.length ? partes.join(' ') : 'menos de 1 mes'
}

/** `modalidad_liquidacion` viene «hora» u «HORA» según quién cargó el legajo; el papel lo escribe igual. */
const modalidadLegible = (v: string | null): string | null => (v == null ? null : v.toLowerCase() === 'hora' ? 'Por hora' : v)

export function datosDelLegajoParaRecibo(
  detalle: DetalleLaboral | undefined, quincena: { desde: string; hasta: string }, ingresoIso: string | null,
): DatosDelLegajoParaRecibo {
  const p = periodoDePago(quincena.desde)
  const notas: string[] = []
  const inferido = (valor: string | null, nota: string): string | null => {
    if (valor == null) return null
    notas.push(nota)
    return `${valor}${MARCA}`
  }
  const pago = detalle?.fechaDePago ?? null
  // Del recibo del estudio es un hecho; la de la quincena puede ser un supuesto y se marca.
  const fecha = pago == null ? null : pago.origen === 'recibo' ? fechaDdMmAaaa(pago.fecha) : `${fechaDdMmAaaa(pago.fecha)}${MARCA}`
  if (pago?.origen === 'jornal') notas.push('FECHA DE PAGO: fecha de caja de la quincena, puede ser un supuesto; no es la del recibo del estudio.')
  const antiguedad = inferido(antiguedadAl(quincena.hasta, null, ingresoIso),
    'ANTIGÜEDAD: calculada desde la fecha de ingreso; no es la antigüedad reconocida.')
  // La «calificación profesional» del papel es el oficio del legajo (ALBAÑIL); la categoría UOCRA va aparte.
  const calificacion = inferido(campoDelLegajo(detalle, 'Oficio'),
    'CALIFICACIÓN PROFESIONAL: es el oficio del legajo, no la calificación que fija el estudio.')
  notas.push('LUGAR DE PAGO: domicilio del empleador; el lugar de pago no está registrado.')
  return {
    legajo: campoDelLegajo(detalle, 'Legajo'),
    cuil: campoDelLegajo(detalle, 'CUIL'),
    antiguedad,
    calificacion,
    periodo: `${p.mes}/${p.anio}`,
    modalidad: modalidadLegible(campoDelLegajo(detalle, 'Modalidad')),
    obraSocial: campoDelLegajo(detalle, 'Obra social'),
    lugarYFechaDePago: fecha == null ? `${EMPLEADOR.domicilio}${MARCA}` : `${EMPLEADOR.domicilio}${MARCA}, ${fecha}`,
    notasInferidas: notas,
  }
}
