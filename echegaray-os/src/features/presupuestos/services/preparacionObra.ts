// 13 · PREPARAR LA OBRA — la aritmética de la pantalla, sin una línea de React.
//
// ═══ POR QUÉ ESTO NO VIVE EN EL COMPONENTE ═══
//
// La pantalla decide, sobre una tabla de ocho a cuarenta filas, QUÉ se convierte y CUÁNTO se lleva
// el plan. Un conteo que se equivoca no da error: da un número más chico, y el que aprieta «Crear
// la obra» se entera tres semanas después de que faltan dos partidas. Acá adentro se puede probar
// con `node --test`; adentro de un `.tsx` no.
//
// ═══ LAS TRES AUSENCIAS QUE ESTA PANTALLA DISTINGUE ═══
//
// · SIN CÓMPUTO (`cantidad = null`) — no se puede convertir. El control de cierre de
//   `convertir_partida_a_plan` ni siquiera corre, y las actividades nacerían con un objetivo que
//   nadie midió. Se dibuja apagada y no entra en la selección.
// · SIN ANÁLISIS (`hh = null`) — se convierte igual, sin HH y sin plazo. Es deuda de carga
//   declarada, no un impedimento. El total de HH del plan NO la cuenta como 0.
// · YA CONVERTIDA — existe en `obra_actividad`. No se ofrece de nuevo: la función se niega a correr
//   dos veces y ofrecerlo sería prometer un gesto que va a fallar.

import type { MetodoMedicion, PartidaValorizada } from '../types/index.ts'

/** Lo que la conversión ya dejó en la obra, contado sobre `obra_actividad`. La forma mínima que
 *  esta capa necesita: el servicio que la lee vive en `conversionService.ts` y arrastra Supabase. */
export interface ConversionHecha {
  frentes: number
  actividades: number
  hh: number | null
}

export type EstadoPreparacion = 'convertible' | 'convertida' | 'sin_computo'

export interface FilaPreparacion {
  partidaId: string
  codigo: string | null
  nombre: string
  rubro: string | null
  cantidad: number | null
  unidad: string | null
  /** HH del análisis congelado. `null` = sin análisis, NUNCA 0. */
  hh: number | null
  estado: EstadoPreparacion
  /** Cómo se va a medir el avance de lo que nazca. `null` sólo en las que no se convierten. */
  metodo: MetodoMedicion | null
  /** La actividad que va a nacer, con su nombre real. `null` cuando no se convierte. */
  destino: string | null
  /** Cuántos frentes deja. En la conversión en lote es siempre 1 —un frente por partida, la regla
   *  «obra chica sin burocracia»—; en la ya convertida es lo que existe de verdad. */
  frentes: number | null
  subcontratada: boolean
}

/**
 * EL MÉTODO POR DEFECTO DE UNA FILA.
 *
 * El de la partida cuando lo declara —lo eligió alguien al cotizar— y `cantidad` si no. NUNCA
 * `pasos` por defecto: los pasos salen de una plantilla de secuencia, y una actividad marcada «por
 * pasos» sin pasos cargados no se puede medir de ninguna manera.
 *
 * Una partida SUBCONTRATADA se mide por cantidad y no admite otra cosa: la función de conversión
 * fuerza `v_metodo := 'cantidad'` porque un paquete no consume horas nuestras.
 */
export function metodoPorDefecto(p: Pick<PartidaValorizada, 'metodo_medicion' | 'subcontratada'>): MetodoMedicion {
  if (p.subcontratada) return 'cantidad'
  return p.metodo_medicion ?? 'cantidad'
}

/** Si esta partida deja elegir el método, o la base ya lo tiene decidido. */
export const metodoEsElegible = (p: Pick<PartidaValorizada, 'subcontratada'>) => !p.subcontratada

export function estadoDePartida(
  p: Pick<PartidaValorizada, 'cantidad'>, conversion: ConversionHecha | undefined,
): EstadoPreparacion {
  if (conversion) return 'convertida'
  if (p.cantidad === null) return 'sin_computo'
  return 'convertible'
}

/**
 * LAS FILAS DE LA TABLA — el orden es el del presupuesto, sin reordenar.
 *
 * Reordenar por estado (primero las convertibles) parece una ayuda y no lo es: el que compara la
 * pantalla contra el PDF del presupuesto pierde la referencia y tiene que buscar fila por fila.
 */
export function filasDePreparacion(
  partidas: readonly PartidaValorizada[],
  conversiones: Readonly<Record<string, ConversionHecha>>,
  metodos: Readonly<Record<string, MetodoMedicion>> = {},
): FilaPreparacion[] {
  return partidas.map((p) => {
    const hecha = conversiones[p.partida_id]
    const estado = estadoDePartida(p, hecha)
    const metodo = estado === 'sin_computo'
      ? null
      : (metodoEsElegible(p) ? metodos[p.partida_id] ?? metodoPorDefecto(p) : metodoPorDefecto(p))
    return {
      partidaId: p.partida_id,
      codigo: p.codigo,
      nombre: p.descripcion,
      rubro: p.rubro,
      cantidad: p.cantidad,
      unidad: p.unidad,
      hh: p.hh,
      estado,
      metodo,
      destino: estado === 'sin_computo' ? null : p.descripcion,
      frentes: hecha ? hecha.frentes : (estado === 'convertible' ? 1 : null),
      subcontratada: p.subcontratada,
    }
  })
}

/** Las que se pueden marcar. Las convertidas y las que no tienen cómputo, no. */
export const seleccionables = (filas: readonly FilaPreparacion[]): FilaPreparacion[] =>
  filas.filter((f) => f.estado === 'convertible')

export interface ResumenDelPlan {
  /** Cuántas actividades ejecutables nacen. Un frente sin plantilla = una actividad. */
  actividades: number
  frentes: number
  /** HH del plan que nace. `null` cuando NINGUNA de las elegidas tiene análisis: no es 0 HH. */
  hh: number | null
  /** Cuántas de las elegidas no tienen HH: su plan nace sin plazo y hay que decirlo. */
  sinAnalisis: number
  /** Cuántas se van a medir por pasos — el único método que produce un % con etapas reales. */
  conPasos: number
  elegidas: number
}

/**
 * LO QUE SE LLEVA EL PLAN, contado sobre la selección.
 *
 * `hh` suma sólo las que tienen análisis y devuelve `null` si no hay ninguna. Sumar los NULL como 0
 * publicaría «0 HH del plan» sobre una obra entera sin analizar, que es la afirmación contraria a
 * la verdadera: no es que no haya trabajo, es que nadie lo midió.
 */
export function resumenDelPlan(
  filas: readonly FilaPreparacion[], seleccion: ReadonlySet<string>,
): ResumenDelPlan {
  const elegidas = filas.filter((f) => f.estado === 'convertible' && seleccion.has(f.partidaId))
  const conHH = elegidas.filter((f) => f.hh != null)
  return {
    actividades: elegidas.length,
    frentes: elegidas.reduce((t, f) => t + (f.frentes ?? 0), 0),
    hh: conHH.length ? conHH.reduce((t, f) => t + (f.hh as number), 0) : null,
    sinAnalisis: elegidas.length - conHH.length,
    conPasos: elegidas.filter((f) => f.metodo === 'pasos').length,
    elegidas: elegidas.length,
  }
}

/**
 * EL AVISO DE LA BARRA — qué se pierde al crear el plan con esta selección.
 *
 * Uno solo y el más caro primero. Tres avisos apilados en la barra de acción se leen como
 * decoración; el que decide necesita saber cuál es el que le va a doler.
 */
export function avisoDeLaSeleccion(r: ResumenDelPlan): string | null {
  if (r.elegidas === 0) return null
  if (r.sinAnalisis > 0) {
    return r.sinAnalisis === 1
      ? '1 partida sin análisis: nace sin HH y sin plazo'
      : `${r.sinAnalisis} partidas sin análisis: nacen sin HH y sin plazo`
  }
  const sinPasos = r.elegidas - r.conPasos
  if (sinPasos > 0) {
    return sinPasos === 1
      ? '1 sin pasos: su avance va a ser estimado'
      : `${sinPasos} sin pasos: su avance va a ser estimado`
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ANTES DE CREAR — el checklist del canónico 13, con lo que la base sabe y NADA más.

export interface ItemChecklist {
  clave: string
  titulo: string
  /** Por qué importa. Sólo en los pendientes: el que está en verde no necesita explicación. */
  detalle: string | null
  cumple: boolean
  /** Un pendiente que IMPIDE crear, contra uno que sólo deja deuda. */
  bloquea: boolean
}

export interface DatosDePreparacion {
  adjudicado: boolean
  congelado: boolean
  obraVinculada: boolean
  jefeObra: string | null
  inicioPlan: string | null
  montoContratado: number | null
  driveCarpeta: string | null
}

/**
 * QUÉ FALTA ANTES DE CREAR.
 *
 * Los dos primeros BLOQUEAN porque los hace cumplir `actionsConversion`: sin adjudicar no hay obra
 * que preparar, y sin congelar el plan saldría con el costo VIVO de la base maestra — la línea base
 * de la obra se movería sola cada vez que alguien actualiza un precio de material.
 *
 * Los otros tres no bloquean: son deuda declarada. Un jefe de obra sin asignar no impide crear el
 * plan, impide cargar partes; decirlo acá es distinto de impedirlo.
 */
export function checklistDeCreacion(d: DatosDePreparacion): ItemChecklist[] {
  return [
    {
      clave: 'adjudicado',
      titulo: d.adjudicado ? 'Presupuesto adjudicado' : 'El presupuesto todavía no está adjudicado',
      detalle: d.adjudicado ? null : 'sin adjudicar no hay obra que preparar',
      cumple: d.adjudicado,
      bloquea: true,
    },
    {
      clave: 'congelado',
      titulo: d.congelado ? 'Presupuesto congelado' : 'El presupuesto no está congelado',
      detalle: d.congelado ? null : 'el plan sale del costo que se ofertó, no del vivo',
      cumple: d.congelado,
      bloquea: true,
    },
    {
      clave: 'obra',
      titulo: d.obraVinculada ? 'Obra vinculada' : 'Sin obra vinculada',
      detalle: d.obraVinculada ? null : 'las actividades se crean dentro de una obra',
      cumple: d.obraVinculada,
      bloquea: true,
    },
    {
      clave: 'inicio',
      titulo: d.inicioPlan ? 'Fecha de arranque definida' : 'La obra no tiene fecha de inicio',
      detalle: d.inicioPlan ? null : 'sin fecha las actividades nacen sin dimensión temporal',
      cumple: d.inicioPlan != null,
      bloquea: true,
    },
    {
      clave: 'jefe',
      titulo: d.jefeObra ? 'Jefe de obra asignado' : 'Jefe de obra sin asignar',
      detalle: d.jefeObra ? null : 'hace falta para cargar partes',
      cumple: d.jefeObra != null,
      bloquea: false,
    },
    {
      clave: 'contrato',
      titulo: d.montoContratado != null ? 'Contrato cargado' : 'Monto contratado sin cargar',
      detalle: d.montoContratado != null ? null : 'sin contrato no hay margen contra el que medir',
      cumple: d.montoContratado != null,
      bloquea: false,
    },
    {
      clave: 'drive',
      titulo: d.driveCarpeta ? 'Carpeta de Drive vinculada' : 'Carpeta de Drive sin vincular',
      detalle: d.driveCarpeta ? null : 'los planos no tienen dónde vivir',
      cumple: d.driveCarpeta != null,
      bloquea: false,
    },
  ]
}

/** Los pendientes que impiden crear. Vacío = la primaria se puede apretar. */
export const bloqueosDeCreacion = (items: readonly ItemChecklist[]): ItemChecklist[] =>
  items.filter((i) => i.bloquea && !i.cumple)
