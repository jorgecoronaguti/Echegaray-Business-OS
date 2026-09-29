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
// PDF del estudio (donde están) no se importó a ninguna columna.

import type { DetalleLaboral } from './detalleLaboral.ts'
import { EMPLEADOR, periodoDePago } from './reciboFormatoContador.ts'

export interface DatosDelLegajoParaRecibo {
  legajo: string | null
  cuil: string | null
  fechaReconocida: string | null
  antiguedad: string | null
  calificacion: string | null
  periodo: string
  banco: string | null
  seccion: string | null
  modalidad: string | null
  obraSocial: string | null
  lugarDePago: string
}

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
  return {
    legajo: campoDelLegajo(detalle, 'Legajo'),
    cuil: campoDelLegajo(detalle, 'CUIL'),
    fechaReconocida: null,
    antiguedad: antiguedadAl(quincena.hasta, null, ingresoIso),
    // La «calificación profesional» del papel es el oficio del legajo (ALBAÑIL); la categoría UOCRA va aparte.
    calificacion: campoDelLegajo(detalle, 'Oficio'),
    periodo: `${p.mes}/${p.anio}`,
    banco: null,
    seccion: null,
    modalidad: modalidadLegible(campoDelLegajo(detalle, 'Modalidad')),
    obraSocial: campoDelLegajo(detalle, 'Obra social'),
    // El lugar es el domicilio del empleador que imprime el recibo del estudio. La fecha de pago sólo existe
    // en `nomina_recibo_neto` cuando llegó el recibo real; hasta entonces no se escribe una.
    lugarDePago: EMPLEADOR.domicilio,
  }
}
