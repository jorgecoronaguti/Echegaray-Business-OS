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
  reason?: string | null
  textoOriginal?: string | null
}

/** Lo que la validación del command layer ya resolvió: a qué partida apunta y con qué valor. */
export interface Validado {
  partida?: { id?: string; codigo?: string | null; descripcion?: string; precioSubcontrato?: number | null }
  anterior?: unknown
  partidas?: { id?: string }[]
  valor?: number
  unidad?: string
  proveedor?: string
  parametro?: string
  moneda?: string
}

export interface PlanEscritura {
  tabla: 'cotizacion_partida' | 'cotizaciones' | 'cotizacion_alcance'
  /**
   * `update` apunta a una fila por `id`. `upsert` no la tiene todavía: una decisión de alcance
   * puede ser la primera sobre ese patrón o la revisión de una anterior, y las dos son el mismo
   * gesto. La clave la impone la base (`unique (cotizacion_id, patron)`), no esta capa.
   */
  operacion: 'update' | 'upsert'
  /** Sólo en `update`. En `upsert` la fila la identifica `onConflict`. */
  id?: string
  onConflict?: string
  /**
   * EL PREDICADO DE CONCURRENCIA: cómo tiene que estar la fila para que este cambio sea válido.
   *
   * ═══ EL DEFECTO QUE ESTO IMPIDE (auditoría delta, 29/08/2026) ═══
   *
   * Sin él, dos personas hablándole al mismo presupuesto se pisan sin ruido: A lee 480, B escribe
   * 1200, A dice «son 520» y el UPDATE por `id` lo aplica. Los 1200 de B mueren mudos, el evento
   * registra `antes: 480` —que es FALSO— y el outlier midió un +8 % cuando el cambio real fue un
   * −57 %: la guarda del §20 corrió contra un estado que ya no existía.
   *
   * Con el predicado, ese UPDATE afecta CERO filas y el turno tiene que decir que hubo conflicto en
   * vez de festejar. `null` significa «este cambio no depende del estado previo» —el upsert de
   * alcance es un gesto declarativo: la última decisión gana y eso está bien—.
   */
  esperado?: Record<string, unknown> | null
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
        tabla: 'cotizacion_partida', operacion: 'update', id,
        // La cantidad tiene que seguir siendo la que la validación leyó. Si otro la movió, este
        // cambio se calculó contra un estado muerto y no se aplica.
        esperado: { cantidad: validado.anterior ?? null },
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
        tabla: 'cotizacion_partida', operacion: 'update', id,
        esperado: { precio_subcontrato: validado.partida?.precioSubcontrato ?? null },
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
        tabla: 'cotizaciones', operacion: 'update', id: cotizacionId,
        esperado: { [columna]: validado.anterior ?? null },
        // Se guarda en FRACCIÓN, que es lo que la vista multiplica. `validar()` del motor ya
        // convirtió «19» a 0,19: escribir 19 daría un beneficio de 1.900 % y —como todos los
        // escalones se multiplican por la misma base— el resultado se vería coherente.
        columnas: { [columna]: validado.valor },
        detalle: `${validado.parametro} = ${validado.valor}`,
      },
    }
  }

  if (intencion.action === 'exclude_scope' || intencion.action === 'include_scope') {
    const patron = String(intencion.target ?? '').trim()
    if (!patron) return { ok: false, porQue: 'no se dijo qué sacar o poner' }
    const estado = intencion.action === 'exclude_scope' ? 'EXCLUIDO' : 'INCLUIDO'
    const n = (validado.partidas ?? []).length
    return {
      ok: true,
      plan: {
        // Sin predicado a propósito: una decisión de alcance es DECLARATIVA —«esto no va»— y la
        // última gana. No hay un valor previo contra el que se haya calculado nada.
        tabla: 'cotizacion_alcance', operacion: 'upsert', onConflict: 'cotizacion_id,patron', esperado: null,
        columnas: {
          cotizacion_id: cotizacionId, patron, estado,
          // La FUENTE es lo que hace revisable la decisión: quién y por dónde. §5 la exige.
          fuente: 'CONVERSACION', texto_literal: intencion.textoOriginal ?? null,
          motivo: intencion.reason ?? null,
        },
        detalle: `${patron}: ${estado} — toca ${n} ${n === 1 ? 'partida' : 'partidas'}`,
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA DECISIÓN DE ESCRITURA — pura, y por eso testeable
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ POR QUÉ ESTO SALIÓ DE LA SERVER ACTION (auditoría delta, vuelta 2) ═══
//
// El arreglo del lost update estaba CORRECTO y DESPROTEGIDO: el auditor mutó las tres piezas —borrar
// `esperado`, matar la relectura, matar el aviso de cero filas— y las tres quedaron VERDES con 540
// tests. `concurrencia.pg.test.mjs` probaba la semántica de SQL, no que esta capa la usara.
//
// Una server action necesita cookies y un request: desde `node --test` es inalcanzable, así que lo
// que vivía adentro no se podía probar. Ahora las tres decisiones son funciones puras y la action es
// cáscara — el mismo patrón que `preparacionObra.ts`. Un refactor que saque `esperado` ya no puede
// reabrir el lost update en silencio.

/** Una condición del predicado de concurrencia, lista para traducirse a PostgREST o a SQL. */
export interface Condicion {
  columna: string
  valor: unknown
  /** `is` para los nulos: `= NULL` nunca es cierto en SQL y dejaría el UPDATE en cero filas SIEMPRE. */
  operador: 'eq' | 'is'
}

/**
 * EL PREDICADO DE CONCURRENCIA DE UN PLAN. PURA.
 *
 * Un plan sin `esperado` devuelve lista vacía, y eso es una decisión declarada —el upsert de alcance
 * es un gesto declarativo donde la última decisión gana—, no un olvido. Lo que NO puede pasar es que
 * un `update` de cantidad o de política llegue sin condiciones: eso es el lost update.
 */
export function predicadoDe(plan: PlanEscritura): Condicion[] {
  return Object.entries(plan.esperado ?? {}).map(([columna, valor]) => ({
    columna,
    valor,
    operador: valor === null || valor === undefined ? 'is' : 'eq',
  }))
}

/**
 * ¿ESTE PLAN TIENE QUE DEFENDERSE DE UNA CARRERA? PURA.
 *
 * Un `update` sobre un valor que alguien más puede estar moviendo, sí. Un `upsert` declarativo, no.
 * Está separado de `predicadoDe` para que el test pueda exigir las dos cosas: que los que deben
 * traer predicado lo traigan, y que el que no debe, no lo traiga.
 */
export const exigePredicado = (plan: PlanEscritura): boolean => plan.operacion === 'update'

export type Veredicto =
  | { tipo: 'APLICADO' }
  | { tipo: 'CONFLICTO'; esperado: Record<string, unknown>; actual: Record<string, unknown> | null }
  | { tipo: 'DESAJUSTE'; pedido: Record<string, unknown>; quedo: Record<string, unknown> | null }

/**
 * QUÉ PASÓ DESPUÉS DE ESCRIBIR. PURA.
 *
 * `filasTocadas` es lo que devolvió el `.select()` del UPDATE. **Cero filas no es un error de la
 * base**: es la señal de que el predicado no matcheó, o sea que alguien movió la fila entre que se
 * leyó y que se escribió. Sin este chequeo el turno salía «Aplicado» sobre un UPDATE que no tocó
 * nada — y eso pasa igual cuando la RLS filtra la fila, que fue como lo tropecé midiendo la policy.
 *
 * `quedo` es la fila RELEÍDA. Que el UPDATE no diera error no prueba que el dato esté: un trigger
 * puede haberlo pisado, un `numeric` puede haber redondeado. La regla madre del programa dice que
 * lo que prueba una escritura es el dato leído en su destino, y ésta es la única capa que escribe.
 */
export function veredictoDeEscritura(
  { plan, filasTocadas, quedo }:
  { plan: PlanEscritura; filasTocadas: number; quedo: Record<string, unknown> | null },
): Veredicto {
  if (filasTocadas === 0) {
    return { tipo: 'CONFLICTO', esperado: plan.esperado ?? {}, actual: quedo }
  }
  // Se comparan como texto: PostgREST devuelve `numeric` como string y `520` no es `'520'`.
  const desajuste = Object.entries(plan.columnas)
    .filter(([c]) => quedo !== null && c in quedo)
    .filter(([c, v]) => String((quedo as Record<string, unknown>)[c]) !== String(v))
  if (desajuste.length > 0) {
    return { tipo: 'DESAJUSTE', pedido: Object.fromEntries(desajuste), quedo }
  }
  return { tipo: 'APLICADO' }
}

/** «cantidad 480». Sin adornos: es para que una persona compare dos números. PURA. */
export function describir(v: Record<string, unknown> | null | undefined): string {
  if (!v) return 'nada'
  const partes = Object.entries(v).map(([c, x]) => `${c} ${x === null || x === undefined ? 'sin cargar' : String(x)}`)
  return partes.length ? partes.join(', ') : 'nada'
}
