// EL ESTADO DEL PRESUPUESTO Y LO QUE HABILITA.
//
// ═══ CINCO ESTADOS, LOS QUE ADMITE EL CHECK ═══
//
// `borrador · enviada · adjudicada · perdida · anulada`. El mockup del contrato visual muestra
// además «En análisis» y «Vencida»: NO existen en el modelo y no se inventan acá. Un sexto estado
// que la pantalla acepta y la base rechaza produce el peor error posible —el que aparece recién al
// guardar—, y si se colara por un camino sin validar dejaría filas que ninguna consulta agrupa.
// Queda declarado como divergencia del contrato, no resuelto por cuenta propia.
//
// ═══ EL CICLO NO ES UNA MÁQUINA DE ESTADOS ESTRICTA, PERO TAMPOCO ES LIBRE ═══
//
// De `adjudicada` no se vuelve a `borrador`: la oferta ya salió y hay una obra colgando. Lo que se
// hace es una VERSIÓN NUEVA, que es una fila nueva. Las transiciones de acá son las que la pantalla
// ofrece; la base no las hace cumplir todavía (ver la limitación declarada en el informe).

import type { EstadoPresupuesto, PresupuestoCascada } from '../types/index.ts'
import type { TonoEstado } from '@/shared/components/ds'

export interface LecturaEstado {
  clave: EstadoPresupuesto
  label: string
  tono: TonoEstado
  /** Para los filtros de la cartera y el KPI de conversión. */
  grupo: 'abierto' | 'adjudicado' | 'cerrado'
}

const LECTURA: Record<EstadoPresupuesto, LecturaEstado> = {
  // Borrador NO es un problema: es trabajo en curso. Punto hueco, como «no arrancó».
  borrador:   { clave: 'borrador',   label: 'Borrador',   tono: 'pendiente', grupo: 'abierto' },
  // Enviada espera respuesta del cliente: es lo único que el dueño puede empujar hoy.
  enviada:    { clave: 'enviada',    label: 'Enviada',    tono: 'curso',     grupo: 'abierto' },
  adjudicada: { clave: 'adjudicada', label: 'Adjudicada', tono: 'pos',       grupo: 'adjudicado' },
  perdida:    { clave: 'perdida',    label: 'Perdida',    tono: 'neg',       grupo: 'cerrado' },
  // Anulada la retiramos nosotros: no se perdió contra nadie y no puede ensuciar la conversión
  // como si un cliente nos hubiera dicho que no. Por eso es 'cerrado' y no 'perdida'.
  anulada:    { clave: 'anulada',    label: 'Anulada',    tono: 'nulo',      grupo: 'cerrado' },
}

export function lecturaEstado(estado: string | null | undefined): LecturaEstado {
  const e = (estado ?? '') as EstadoPresupuesto
  // Un estado que la base tenga y este módulo no conozca se muestra como lo que es —desconocido—
  // en vez de caerse o de disfrazarse del primero de la lista.
  return LECTURA[e] ?? { clave: 'borrador', label: estado || 'sin estado', tono: 'nulo', grupo: 'abierto' }
}

/** Los estados a los que se puede pasar desde uno dado. Vacío = el ciclo terminó acá. */
export function transicionesDe(estado: EstadoPresupuesto): EstadoPresupuesto[] {
  switch (estado) {
    case 'borrador':   return ['enviada', 'anulada']
    case 'enviada':    return ['adjudicada', 'perdida', 'anulada']
    // De adjudicada no se retrocede: hay una obra colgando. Se hace una versión nueva.
    case 'adjudicada': return []
    case 'perdida':    return ['anulada']
    case 'anulada':    return []
    default:           return []
  }
}

/**
 * ¿SE PUEDE CONVERTIR EN PLAN DE OBRA?
 *
 * Tres condiciones, y las tres son de negocio, no de pantalla:
 *   · adjudicada — un plan de obra sobre una oferta que no se ganó es trabajo tirado;
 *   · congelada  — el plan tiene que salir del costo que se ofertó, no del de hoy;
 *   · con obra   — la conversión escribe en `obra_actividad`, que exige una obra existente.
 *
 * Devuelve el MOTIVO cuando no se puede: un botón deshabilitado sin explicación obliga a adivinar.
 */
export function puedeConvertir(c: PresupuestoCascada): { puede: boolean; motivo: string | null } {
  if (c.estado !== 'adjudicada') return { puede: false, motivo: 'Se convierte cuando el presupuesto está adjudicado.' }
  if (!c.congelada_en) return { puede: false, motivo: 'Primero se congela: el plan sale del costo que se ofertó, no del de hoy.' }
  if (!c.obra_canonica_id) return { puede: false, motivo: 'Falta vincular la obra: las actividades se crean dentro de una obra.' }
  return { puede: true, motivo: null }
}

/**
 * ¿SE PUEDE CONGELAR?
 *
 * ═══ ANTES ESTA FUNCIÓN NO MIRABA EL GATE, Y EL BOTÓN ERA DECORATIVO (QA visual, 29/08/2026) ═══
 *
 * Miraba `congelada_en` y `n_partidas === 0`, nada más. La pantalla dibujaba al lado «NO se congela:
 * 1 bloqueo(s)» —el gate que `freeze.mjs` ya calculaba— y el botón seguía habilitado. El QA lo
 * apretó: quedó una versión marcada como salida, con un bloqueante vivo y precio $0.
 *
 * Ahora recibe el GATE y devuelve sus motivos. La cerradura de verdad está en la base
 * (`cot_congelar_con_gate` levanta excepción si el gate no pasa) — esto evita el viaje y, sobre
 * todo, evita ofrecer un gesto que va a fallar. Las dos cosas hacen falta: sin la de la base, un
 * POST directo se saltea la pantalla; sin ésta, el botón miente.
 *
 * `gate` opcional para no romper a quien todavía no lo tiene: con `null` NO se afloja el criterio,
 * se declara que no se pudo mirar.
 */
export function puedeCongelar(
  c: PresupuestoCascada,
  gate?: { ready: boolean; blocking_issues: { tipo: string; entidad: string }[]; porQue: string } | null,
): { puede: boolean; motivo: string | null } {
  if (c.congelada_en) return { puede: false, motivo: 'Ya está congelado. Para cambiarlo se crea una versión nueva.' }
  if (c.n_partidas === 0) return { puede: false, motivo: 'No tiene partidas: no hay composición que congelar.' }
  if (gate === undefined || gate === null) {
    return { puede: false, motivo: 'No pude evaluar qué falta para congelar. No se ofrece congelar a ciegas.' }
  }
  if (!gate.ready) return { puede: false, motivo: gate.porQue }
  return { puede: true, motivo: null }
}
