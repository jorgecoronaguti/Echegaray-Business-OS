// QUÉ ESCRIBE UN CASILLERO DE LA GRILLA DE ASISTENCIA — decidido acá, fuera del componente.
//
// El dueño, 10/09/2026, textual: *«no me sirve no poder editar las horas desde ahí mismo, en el
// casillero de las horas»*. Hasta hoy la celda sólo aceptaba un número, y sólo en los días que ya
// eran «horas»: para pasar una licencia a día trabajado, o para reconocerle horas a una ausencia,
// había que abrir el panel lateral. El casillero ahora edita las dos cosas —cuántas horas y QUÉ es
// ese día—, y esta función es la que decide qué se le pide al servidor.
//
// VIVE FUERA DEL COMPONENTE Y FUERA DE LA ACCIÓN por lo mismo que `planDeJornada`: un archivo
// `'use server'` no puede exportar una función pura, y una regla que se prueba sin base ni sesión es
// la única que queda atrapada para siempre. Lo que sigue es la regla, no un comentario sobre ella.

import { leerHoras } from './jornadaPorObra.ts'
import { motivosDeDiaNoTrabajado } from './motivoDeAusencia.ts'
import type { OpcionInline } from '@/shared/components/ds/InlineEdit'

/** El valor del desplegable cuando el día se trabajó. Coincide con el `estado` de la corrección. */
export const TRABAJO = 'presente'
/** El día vuelve a no tener nada: ni horas, ni ausencia, ni declaración. Ver `corregirJornada`. */
export const SIN_NOVEDAD = 'sin_novedad'
/** Un día no trabajado viaja con su motivo pegado: `no_vino:enfermedad`. El motivo —y no el
 *  desplegable— es lo que decide si el día queda como AUSENCIA o como LICENCIA (`tipoDeMotivo`),
 *  así que ofrecer «Ausente» y «Licencia» como dos opciones sueltas sería una segunda definición de
 *  la misma regla, y el día que se toque una las dos discreparían. */
export const NO_VINO = 'no_vino'

export interface PedidoDeCelda {
  /** Lo elegido en el desplegable de estado. */
  estado: string
  /** Lo tipeado en el campo de horas, crudo. La coma del teclado del teléfono se acepta. */
  horas: string
  fecha: string
  /** El día de HOY según el servidor. Nunca el del navegador: a las 23:55 con otra zona horaria, un
   *  día pasado se convertiría en futuro y la pantalla rechazaría una carga legítima. */
  hoy: string
  /** De qué obra salen hoy las horas de ese día. `null` = el día no tiene nada cargado. */
  obraOrigen: string | null
  /** A qué obra se le imputa lo que se escriba. `null` cuando la persona no tiene obra activa. */
  obraDestino: string | null
}

/** Exactamente la entrada de `correccionSchema`. No se re-declara el tipo: si el schema cambia, esto
 *  tiene que dejar de compilar. */
export interface CorreccionDeCelda {
  fecha: string
  obra_origen: string | null
  obra_destino: string | null
  estado: 'presente' | 'ausente' | 'sin_novedad'
  horas: number | null
  motivo: string | null
}

export type PlanDeCelda =
  | { ok: true; correccion: CorreccionDeCelda }
  | { ok: false; error: string }

/** Las opciones del desplegable de la celda, en el orden en que se usan: lo más frecuente primero. */
export function opcionesDeEstadoDeCelda(): OpcionInline[] {
  return [
    { valor: TRABAJO, etiqueta: 'Trabajó' },
    ...motivosDeDiaNoTrabajado().map((m) => ({
      valor: `${NO_VINO}:${m.clave}`,
      // EL TIPO ADELANTE porque es lo que cambia el efecto sobre el legajo y sobre lo que se paga:
      // «Licencia · enfermedad» y «Ausente · falta» no son la misma decisión.
      etiqueta: `${m.tipo === 'licencia' ? 'Licencia' : 'Ausente'} · ${m.etiqueta.toLowerCase()}`,
    })),
    { valor: SIN_NOVEDAD, etiqueta: 'Sin novedad (dejar el día libre)' },
  ]
}

/**
 * Qué opción muestra el desplegable para lo que YA está guardado.
 *
 * La celda de la grilla guarda la ETIQUETA del motivo, no su clave (ver `CeldaObra.motivo`), así que
 * la vuelta se hace por etiqueta contra el mismo catálogo. Si no se reconoce, el desplegable NO
 * elige un motivo parecido: se queda sin selección —`''`— y quien corrige elige. Adivinar la causa
 * de una ausencia es fabricar un dato sobre el legajo de alguien.
 */
export function estadoElegidoDeCelda(celda: { estado: string; motivo: string | null }): string {
  if (celda.estado === 'horas') return TRABAJO
  if (celda.estado === 'ausente' || celda.estado === 'licencia') {
    const etiqueta = (celda.motivo ?? '').trim().toLowerCase()
    const m = motivosDeDiaNoTrabajado().find((x) => x.etiqueta.trim().toLowerCase() === etiqueta)
    return m ? `${NO_VINO}:${m.clave}` : ''
  }
  return SIN_NOVEDAD
}

/**
 * LA REGLA. Qué corrección manda la celda, o por qué no manda ninguna.
 *
 * ═══ LAS HORAS TRABAJADAS DE UN DÍA FUTURO NO SE CARGAN ═══
 *
 * Trabajar es un HECHO, y un hecho que no pasó no se declara: escribir 9 horas el viernes que viene
 * mete costo de mano de obra en una obra por trabajo que nadie hizo todavía, y ese número entra en
 * el costo por obra y en la liquidación de la quincena. La licencia, la ausencia programada y «sin
 * novedad» sí van a futuro: no son hechos, son DECISIONES —un parte médico de diez días, unas
 * vacaciones aprobadas— y de eso se trata programarlas.
 */
export function planDeCelda(p: PedidoDeCelda): PlanDeCelda {
  const base = { fecha: p.fecha, obra_origen: p.obraOrigen }

  if (p.estado === SIN_NOVEDAD) {
    return { ok: true, correccion: { ...base, obra_destino: null, estado: 'sin_novedad', horas: null, motivo: null } }
  }

  if (p.estado.startsWith(`${NO_VINO}:`)) {
    const motivo = p.estado.slice(NO_VINO.length + 1)
    if (motivo === '') return { ok: false, error: 'Elegí por qué no vino' }
    // LA AUSENCIA ES DE LA PERSONA Y VIAJA SIN OBRA (dueño, 08/09/2026). Las horas van en `null`: las
    // resuelve el servidor con la jornada de referencia y la tabla que dice qué motivo se paga.
    // Mandar acá el número que había en la celda reconocería horas por un día que la regla no paga.
    return { ok: true, correccion: { ...base, obra_destino: null, estado: 'ausente', horas: null, motivo } }
  }

  if (p.estado !== TRABAJO) return { ok: false, error: 'Elegí qué fue ese día' }

  if (p.fecha > p.hoy) {
    return { ok: false, error: 'Ese día todavía no pasó: las horas trabajadas se cargan el día que se trabajan. Lo que sí se puede programar es una licencia o una ausencia.' }
  }
  const { horas, error } = leerHoras(p.horas)
  if (error) return { ok: false, error }
  if (horas === null) return { ok: false, error: 'Poné cuántas horas hizo' }
  // TRABAJAR ES TRABAJAR EN UNA OBRA: sin destino no hay a quién imputarle el costo, y elegir una
  // por descarte movería mano de obra de una obra a otra sin que nadie lo decida.
  if (p.obraDestino === null) {
    return { ok: false, error: 'Esa persona no tiene obra activa: elegí la obra antes de cargarle horas.' }
  }
  return { ok: true, correccion: { ...base, obra_destino: p.obraDestino, estado: 'presente', horas, motivo: null } }
}
