// QUÉ ESCRIBE CADA INTENCIÓN EN LA BASE. PURO — devuelve el plan, no lo aplica.
//
// ═══ POR QUÉ EL PLAN Y LA ESCRITURA ESTÁN SEPARADOS ═══
//
// `comandos.ejecutar()` del cotizador es SÍNCRONO y llama a `mutar` en el medio del pipeline, entre
// el outlier engine y el recálculo. Supabase es asíncrono. Meter un `await` ahí obligaría a volver
// asíncrono todo el command layer —incluidas las cuatro etapas que hoy se prueban sin red— para que
// una server action pudiera escribir una fila.
//
// Así, `mutar` devuelve un PLAN: qué tabla, qué fila, qué columnas. La server action lo aplica
// después, y sólo si el pipeline dijo que sí. La decisión de escribir queda donde estaba —en el
// motor— y la escritura queda donde puede estar.
//
// ═══ LO QUE NO TIENE PLAN NO SE FINGE ═══
//
// Seis de las catorce acciones no tienen dónde escribirse hoy: el alcance por partida (§5) vive en
// la tabla que creó la migración del CORE y este módulo todavía no la escribe; `undo` necesita el
// registro de eventos; `freeze` y `approve` ya tienen su propio camino con su RPC. Para ésas el
// plan es `null` CON MOTIVO, y la conversación contesta qué falta. Un plan vacío que devolviera
// «listo» sería un cambio que la persona cree hecho y no está en ninguna fila.

import type { PartidaValorizada } from '../types/index.ts'
import type { Rol } from '../../auth/types/index.ts'

/**
 * DEL ROL DE LA APP AL ROL DEL CONTRATO DEL COTIZADOR. PURA.
 *
 * Vive acá y no en el archivo `'use server'` por una razón que ya costó en este repo: una regla que
 * sólo se puede probar levantando la pantalla no se prueba nunca. Ésta decide quién puede tocar el
 * beneficio de la empresa, así que tiene test propio.
 *
 * `campo` y `cliente` caen en LECTOR y no en «sin rol»: `autorizar()` con un rol desconocido
 * contesta «rol desconocido», que suena a un bug del sistema; LECTOR contesta «esta acción exige
 * WRITE», que es la verdad. NULL también cae en LECTOR — una sesión sin perfil no escribe nada.
 */
export function rolDeContrato(rol: Rol | null | undefined): string {
  if (rol === 'direccion') return 'DUENO'
  if (rol === 'administracion') return 'ADMINISTRACION'
  if (rol === 'jefe_obra') return 'JEFE_DE_OBRA'
  return 'LECTOR'
}

/** La forma mínima de una intención del contrato. No se importa el `.mjs` sólo para un tipo. */
export interface Intencion {
  action: string
  target: string | null
  value: string | number | null
  unit?: string | null
  supplier?: string | null
}

/** Lo que la validación del command layer ya resolvió: a qué partida apunta y con qué valor. */
export interface Validado {
  partida?: { id?: string; codigo?: string | null; descripcion?: string }
  partidas?: { id?: string }[]
  valor?: number
  unidad?: string
  proveedor?: string
  parametro?: string
  moneda?: string
}

export interface PlanEscritura {
  tabla: 'cotizacion_partida' | 'cotizaciones'
  id: string
  columnas: Record<string, unknown>
  /** Qué se le dice a la persona que pasó. Sale del plan, no de una frase suelta. */
  detalle: string
}

export type Plan =
  | { ok: true; plan: PlanEscritura }
  | { ok: false; porQue: string }

/** Los ocho de la cascada: del nombre del motor al nombre de la columna. */
const COLUMNA_POLITICA: Record<string, string> = {
  pctGastosGenerales: 'pct_gastos_generales',
  pctBeneficio: 'pct_beneficio',
  pctFinanciero: 'pct_financiero',
  factorFinanciero: 'factor_financiero',
  pctIibb: 'pct_iibb',
  pctGanancias: 'pct_ganancias',
  pctCheque: 'pct_cheque',
  pctIva: 'pct_iva',
}

/**
 * EL PLAN DE ESCRITURA DE UNA INTENCIÓN YA AUTORIZADA Y VALIDADA. PURA.
 *
 * `cotizacionId` es de dónde salió el estado, y se usa como el `id` del UPDATE de política. Nunca
 * se toma de la intención: el modelo no elige sobre qué presupuesto escribe.
 */
export function planDe(intencion: Intencion, validado: Validado, cotizacionId: string): Plan {
  if (intencion.action === 'update_quantity') {
    const id = validado.partida?.id
    if (!id) return { ok: false, porQue: 'la validación no devolvió la partida: no sé qué fila actualizar' }
    return {
      ok: true,
      plan: {
        tabla: 'cotizacion_partida', id,
        columnas: { cantidad: validado.valor },
        detalle: `${validado.partida?.codigo ?? validado.partida?.descripcion}: cantidad = ${validado.valor} ${validado.unidad ?? ''}`.trim(),
      },
    }
  }

  if (intencion.action === 'set_subcontract') {
    const id = validado.partida?.id
    if (!id) return { ok: false, porQue: 'la validación no devolvió la partida: no sé qué fila actualizar' }
    // La MONEDA no tiene columna: `precio_subcontrato` es numeric a secas. Un precio en dólares
    // guardado ahí se leería como pesos y el presupuesto saldría mil veces más barato, así que se
    // rechaza en vez de convertirlo con una cotización que nadie declaró (§11: el FX es explícito).
    if (validado.moneda && validado.moneda !== 'ARS') {
      return { ok: false, porQue: `el precio vino en ${validado.moneda} y la columna precio_subcontrato no guarda moneda: cargarlo ahí lo volvería pesos en silencio` }
    }
    return {
      ok: true,
      plan: {
        tabla: 'cotizacion_partida', id,
        columnas: { subcontratada: true, precio_subcontrato: validado.valor },
        detalle: `${validado.partida?.codigo ?? validado.partida?.descripcion}: subcontratada a ${validado.proveedor} por ${validado.valor}`,
      },
    }
  }

  if (intencion.action === 'commercial_override') {
    const columna = validado.parametro ? COLUMNA_POLITICA[validado.parametro] : null
    if (!columna) return { ok: false, porQue: `«${validado.parametro}» no tiene columna en cotizaciones` }
    return {
      ok: true,
      plan: {
        tabla: 'cotizaciones', id: cotizacionId,
        // Se guarda en FRACCIÓN, que es lo que la vista multiplica. `validar()` del motor ya
        // convirtió «19» a 0,19: escribir 19 daría un beneficio de 1.900 % y —como todos los
        // escalones se multiplican por la misma base— el resultado se vería coherente.
        columnas: { [columna]: validado.valor },
        detalle: `${validado.parametro} = ${validado.valor}`,
      },
    }
  }

  return { ok: false, porQue: MOTIVO_SIN_PLAN[intencion.action] ?? `«${intencion.action}» todavía no se puede aplicar por conversación` }
}

/**
 * Por qué una acción del contrato todavía no se escribe desde acá. Cada una nombra QUÉ falta, no
 * «no implementado»: la diferencia es que esto se puede resolver leyéndolo.
 */
const MOTIVO_SIN_PLAN: Record<string, string> = {
  exclude_scope: 'el alcance por partida vive en la tabla que creó la migración del cotizador y este módulo todavía no la escribe: sacar una partida por conversación dejaría el cambio sin fila',
  include_scope: 'el alcance por partida todavía no se escribe desde este módulo (misma tabla que exclude_scope)',
  set_resource_price: 'el precio de un recurso se carga en la Base Maestra, que es su fuente: cambiarlo desde un presupuesto lo desincronizaría del resto',
  set_global_policy: 'la política GLOBAL se cambia en parametro_comercial, no desde una cotización: una conversación no mueve la política de la empresa (§17)',
  undo: 'deshacer necesita el registro de eventos del cotizador, que este módulo todavía no escribe',
  freeze: 'congelar tiene su propio botón, que llama a congelar_presupuesto() y copia la composición: hacerlo por chat saltearía esa copia',
  approve: 'aprobar todavía no tiene estado propio en el modelo',
}

/** Las partidas que el estado le da al command layer, con el id que el plan necesita. PURA. */
export function paraElMotor(partidas: PartidaValorizada[]) {
  return partidas.map((p) => ({
    id: p.partida_id,
    codigo: p.codigo,
    descripcion: p.descripcion,
    rubro: p.rubro,
    unidad: p.unidad,
    cantidad: p.cantidad,
    costoUnitario: p.costo_unitario,
    subtotal: p.subtotal,
    subcontratada: p.subcontratada,
    subcontrato: p.subcontratada ? { precio: p.precio_subcontrato, proveedor: null } : null,
    sinAnalisis: p.sin_analisis,
    congelada: p.congelada,
    alcance: null,
    evidencia: null,
    genealogia: null,
  }))
}
