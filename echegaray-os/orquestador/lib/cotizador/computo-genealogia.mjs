// LA GENEALOGÍA DE UNA CANTIDAD — la definición vive UNA vez, acá, y es PURA.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO ═══
//
// `public.computo` tenía UN solo escritor: el `for` de adentro de `plano/cotizacion-v0.mjs::persistir()`.
// No era una capacidad, era un efecto lateral de un caller. Medido el 03/09/2026 sobre la base real:
//
//   origen = 'xsas:plano'  →  12 cotizaciones,  58 partidas,  73 líneas de cómputo
//   origen = 'os'          →   7 cotizaciones, 110 partidas,   0 líneas de cómputo
//
// Las 110 partidas del negocio de verdad —COT-2026-001/002/003— no se pueden auditar: la cantidad
// entró por `cotizacion_partida.cantidad` desde el formulario (`actionsPartida.ts`), desde el chat
// (`conversacionPlan.ts`) o copiada por `nuevaVersion`, y ninguno de esos tres pasa por el `for`.
// La trazabilidad existía en el camino de laboratorio y no en el productivo.
//
// Acá vive la RESPUESTA a «¿de dónde salió esta cantidad?» en una forma que los dos transportes
// —el pool de `pg` del orquestador y PostgREST desde la web— insertan sin volver a interpretarla:
// las claves de las filas que devuelve SON los nombres de columna.
//
// ═══ UNA CANTIDAD TIPEADA TAMBIÉN TIENE GENEALOGÍA, Y ES PEOR ═══
//
// Un número que escribió una persona no llega hasta un documento ni hasta una cita: llega hasta la
// persona. Eso NO es lo mismo que no tener cómputo, y hoy `computo_de_partida` no las distingue —
// las 110 partidas dicen «sin cómputo cargado», que también es lo que dice una partida que nadie
// tocó todavía. La línea con `origen = 'estimacion'` convierte ese silencio en un dato: la partida
// declara que su número no tiene medición detrás, y `n_estimadas` de la vista lo cuenta.
//
// Lo que este módulo NO hace: forzar a que la partida cuadre con su cómputo. La migración
// 20260821T4900 lo dice explícito —hay divergencias legítimas y taparlas con un trigger las volvería
// invisibles—, y por eso `planDeComputoManual` se APARTA cuando la partida ya tiene líneas medidas.

/** Los cuatro que admite el CHECK de `public.computo.origen`. Cambiar esta lista sin cambiar la
 *  migración deja un insert que falla en producción y en ningún test. */
export const ORIGEN_COMPUTO = Object.freeze({
  PLANO: 'plano',
  RELEVAMIENTO: 'relevamiento',
  ESTIMACION: 'estimacion',
  IMPORTADO: 'importado',
})

/** Los orígenes que significan QUE ALGUIEN MIDIÓ. `estimacion` no está: es el único que no sostiene
 *  el número con nada más que la palabra de quien lo escribió. */
export const ORIGENES_MEDIDOS = Object.freeze([
  ORIGEN_COMPUTO.PLANO, ORIGEN_COMPUTO.RELEVAMIENTO, ORIGEN_COMPUTO.IMPORTADO,
])

/** Cómo se reconoce la línea que representa una cantidad tipeada. Va en `elemento` y no en una
 *  columna nueva porque `elemento` es lo que se lee en la tabla: quien abre el cómputo ve el rótulo
 *  sin tener que saber qué significa `origen = 'estimacion'`. */
export const ELEMENTO_CARGA_MANUAL = 'CANTIDAD CARGADA A MANO'

const CRITERIO_MANUAL_POR_DEFECTO =
  'sin memoria de cálculo: el número lo tipeó una persona y no hay documento ni medición que lo sostenga'

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v)

/** ¿Esta fila de `computo` es la que representa una cantidad tipeada? Mira el par (origen, elemento)
 *  y no sólo el origen: una estimación con su propio criterio escrito por alguien es otra cosa y no
 *  se pisa. */
export function esCargaManual(fila) {
  return Boolean(fila) && fila.origen === ORIGEN_COMPUTO.ESTIMACION && fila.elemento === ELEMENTO_CARGA_MANUAL
}

/**
 * LA LÍNEA DE UNA CANTIDAD MEDIDA SOBRE UN PLANO. PURA.
 *
 * Es el texto que el piloto verificó de punta a punta: partida → elemento → documento → cita
 * literal → fórmula → cantidad. El criterio lleva las tres cosas juntas porque las tres se leen
 * juntas cuando llega la revisión siguiente del plano y hay que decidir qué se recomputa.
 */
export function lineaMedidaDePlano(l = {}) {
  if (!esNumero(l.cantidad) || l.cantidad === 0) {
    throw new Error(`una línea de cómputo con cantidad «${l.cantidad}» no se escribe: el CHECK exige cantidad <> 0 y un cero no aporta nada`)
  }
  return {
    documento_drive_id: l.documentoId ?? null,
    documento_nombre: l.documento ?? null,
    revision: l.revision ?? null,
    elemento: `${l.elemento} — ${l.nombre}`,
    sector: l.lamina ?? null,
    unidad: l.unidad ?? null,
    cantidad: l.cantidad,
    origen: ORIGEN_COMPUTO.PLANO,
    criterio: `${l.criterio} · entradas ${JSON.stringify(l.entradas)} · el plano dice «${l.textoLiteral}»${l.vista ? ` (${l.vista})` : ''}`,
  }
}

/**
 * LA LÍNEA DE UNA CANTIDAD TIPEADA. PURA.
 *
 * `documento_nombre` queda en NULL a propósito: `computo_de_partida` cuenta documentos distintos con
 * `count(distinct documento_nombre)`, y poner un rótulo acá haría que una partida sin ningún
 * documento se publicara como si tuviera uno.
 */
export function lineaCargadaAMano({ cantidad, unidad = null, criterio = null, donde = null } = {}) {
  if (!esNumero(cantidad) || cantidad === 0) {
    throw new Error(`una línea de cómputo con cantidad «${cantidad}» no se escribe: el CHECK exige cantidad <> 0 y un cero no aporta nada`)
  }
  const explicacion = criterio && String(criterio).trim() ? String(criterio).trim() : CRITERIO_MANUAL_POR_DEFECTO
  return {
    documento_drive_id: null,
    documento_nombre: null,
    revision: null,
    elemento: ELEMENTO_CARGA_MANUAL,
    sector: null,
    unidad: unidad ?? null,
    cantidad,
    origen: ORIGEN_COMPUTO.ESTIMACION,
    criterio: donde ? `${explicacion} · cargada en ${donde}` : explicacion,
  }
}

const nada = (porQue) => Object.freeze({ accion: 'nada', fila: null, id: null, idsABorrar: Object.freeze([]), porQue })

/**
 * QUÉ HACER CON LA GENEALOGÍA CUANDO ALGUIEN FIJA UNA CANTIDAD A MANO. PURA.
 *
 * Recibe las líneas que la partida YA tiene y la cantidad nueva; devuelve la única operación que
 * corresponde. Es la función que decide, y por eso vive acá y no repartida entre el formulario, el
 * chat y el copiado de versiones — que es exactamente cómo llegamos a que ninguno de los tres
 * escribiera nada.
 *
 * Las tres reglas, en orden:
 *  1 · Si la partida tiene líneas MEDIDAS, no se toca nada. La divergencia entre lo que dice la
 *      partida y lo que suma su cómputo se PUBLICA (`computo_de_partida.lectura`), no se corrige.
 *  2 · Una cantidad ausente o cero no se registra: el CHECK exige `cantidad <> 0`, y «sin cargar»
 *      nunca es cero. Si había una línea manual, se borra — el cómputo no puede seguir afirmando un
 *      número que la partida ya no declara.
 *  3 · Hay como mucho UNA línea manual por partida, y se actualiza. Sumar una por cada edición
 *      convertiría la memoria de cálculo en un historial de tecleos que además no suma la cantidad.
 *
 * Devuelve `{ accion, fila, id, idsABorrar, porQue }`: `id` es la línea que se actualiza y
 * `idsABorrar` las sobrantes — el caller no tiene que decidir nada, sólo ejecutar las dos listas.
 */
export function planDeComputoManual({ lineas = [], cantidad = null, unidad = null, criterio = null, donde = null } = {}) {
  const previas = Array.isArray(lineas) ? lineas : []
  const medidas = previas.filter((l) => ORIGENES_MEDIDOS.includes(l?.origen))
  if (medidas.length) {
    return nada(`la partida ya tiene ${medidas.length} línea(s) de cómputo medidas: la cantidad tipeada NO las pisa, y la diferencia se publica en computo_de_partida`)
  }
  const manuales = previas.filter(esCargaManual)
  const idsManuales = manuales.map((l) => l.id).filter(Boolean)

  if (!esNumero(cantidad) || cantidad === 0) {
    const porQue = cantidad === 0
      ? 'una cantidad en cero no es una medición y el CHECK de computo la rechaza: no se registra genealogía de un cero'
      : 'la partida quedó sin cantidad: «sin cargar» no tiene genealogía que registrar'
    return manuales.length
      ? Object.freeze({ accion: 'borrar', fila: null, id: null, idsABorrar: Object.freeze(idsManuales), porQue })
      : nada(porQue)
  }

  const fila = lineaCargadaAMano({ cantidad, unidad, criterio, donde })
  if (!manuales.length) return Object.freeze({ accion: 'insertar', fila, id: null, idsABorrar: Object.freeze([]), porQue: null })
  return Object.freeze({
    accion: 'actualizar', fila,
    id: idsManuales[0] ?? null,
    idsABorrar: Object.freeze(idsManuales.slice(1)),
    porQue: manuales.length > 1
      ? `la partida tenía ${manuales.length} líneas manuales y sólo puede haber una: se conserva la primera y se borran las demás`
      : null,
  })
}
