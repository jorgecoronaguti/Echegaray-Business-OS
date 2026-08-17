// LO QUE EL DUEÑO CONFIRMÓ A MANO, CUANDO NINGUNA FUENTE PODÍA PROBARLO.
//
// POR QUÉ EXISTE (17/08/2026). El libro tiene tres testigos de que una obligación se pagó: la
// pestaña que la declara, el extracto del banco, y nada más. Cuando los dos primeros callan, el OS
// publica deuda — y hacerlo en silencio ya le costó al dueño dos números falsos en un día.
//
// Pero hay un cuarto testigo, y es el más fuerte de todos: **él**. Los jornales salen en buena parte
// por caja física y el extracto no los ve nunca; el detalle de un VEP no está en ningún lado hasta
// que alguien abre "Mis Pagos". Preguntarle cuesta cinco segundos y convierte una inferencia de
// magnitud en un hecho conciliado.
//
// ═══ POR QUÉ NO SE ESCRIBE EN SU COLUMNA ═══
//
// La tentación era cargar la fecha prevista en «Pagado el» de esas filas y listo. No se hace, por
// dos razones que este repo ya pagó:
//
//   1. **Sería fabricar un dato.** Lo que él confirmó es QUE ESTÁ PAGADA, no CUÁNDO. Escribir el
//      "se paga el" en la columna de "pagado el" convierte una previsión en un hecho observado, y
//      esa fecha después decide en qué mes el Cash Flow muestra el egreso.
//   2. **Su columna es suya.** El OS no escribe ahí ni con permiso: si mañana él carga la fecha
//      real, tiene que ganarle a lo que haya, y la única forma de garantizarlo es no haber escrito.
//
// Acá se registra la AFIRMACIÓN, que es exactamente lo que él dio. La fecha sigue saliendo de la
// prevista, igual que para cualquier quincena marcada con fecha ilegible — el mismo camino, sin un
// mecanismo nuevo.
//
// ═══ CÓMO SE AGREGA UNA ═══
//
// Sólo con la pregunta y la respuesta textuales, y la fecha en que se preguntó. Una confirmación sin
// su cita no se distingue de una suposición que alguien escribió con confianza, y en seis meses nadie
// va a poder decir cuál era cuál. Si el dueño se retracta, se BORRA la entrada: no se edita el
// motivo para que diga otra cosa.

/**
 * Quincenas del registro de obra que el dueño declaró pagadas cuando ni la planilla ni el extracto
 * podían probarlo. La clave es el cierre de la quincena (columna "Hasta") en ISO, porque es lo único
 * que no se mueve: la fila cambia de número cada vez que el registro crece.
 */
export const QUINCENAS_CONFIRMADAS = new Map([
  ['2026-04-30', { el: '2026-08-17', monto: 9939650 }],
  ['2026-05-16', { el: '2026-08-17', monto: 10105210 }],
  ['2026-05-30', { el: '2026-08-17', monto: 8593590 }],
  ['2026-06-15', { el: '2026-08-17', monto: 9393250 }],
  ['2026-06-30', { el: '2026-08-17', monto: 9384100 }],
])

/**
 * La cita, para que la confirmación se pueda auditar sin preguntarle de nuevo.
 *
 * 17/08/2026 — Pregunta: "Cinco quincenas ($47.415.800) figuran impagas y ninguna fuente puede
 * probarlas: el extracto arranca el 28/05 y esas se pagaron en buena parte por caja física.
 * ¿Cuáles pagaste?" — Respuesta del dueño: **"Todas las cinco están pagadas"**.
 */
export const MOTIVO_QUINCENAS = 'el dueño las confirmó pagadas el 17/08/2026 (caja física: ninguna '
  + 'fuente del OS puede verlas)'

/**
 * Obligaciones sueltas confirmadas por el dueño. La clave es el concepto tal como lo publica el
 * libro, porque es lo que se puede cruzar sin depender de una fila.
 *
 * 17/08/2026 — Pregunta: "El 11/08 el banco pagó a ARCA $8.235.742, único pago AFIP de agosto. El
 * F931 de julio ($7.074.772) vencía el 10/08. ¿Ese débito fue el F931?" — Respuesta del dueño:
 * **"Sí, era el F931 de julio"**.
 *
 * Sin esta confirmación el retiro era una inferencia de MAGNITUD —"el banco le pagó a ARCA más de lo
 * que el libro decía deberle"— y el auditor la rechazó con razón: el patrón citado como respaldo se
 * contradecía solo (el pago del 20/07 fue de $4.859.763, MENOS que un F931 mensual). Publicar eso
 * como REAL habría sido presentar una estimación como hecho.
 */
export const OBLIGACIONES_CONFIRMADAS = new Map([
  ['F931 · nómina de jul-26', {
    el: '2026-08-17',
    monto: 7074772,
    motivo: 'el dueño confirmó el 17/08/2026 que el pago a ARCA del 11/08 ($8.235.742) fue este F931',
  }],
])

/**
 * ¿El dueño confirmó esta quincena? `hasta` es el cierre en ISO.
 * @param {string|null} hasta
 * @returns {boolean}
 */
export function quincenaConfirmada(hasta) {
  return hasta !== null && QUINCENAS_CONFIRMADAS.has(String(hasta))
}

/**
 * ¿El dueño confirmó esta obligación? `concepto` es el que publica el libro.
 * @param {string|null} concepto
 * @returns {{el:string, monto:number, motivo:string}|null}
 */
export function obligacionConfirmada(concepto) {
  return OBLIGACIONES_CONFIRMADAS.get(String(concepto ?? '')) ?? null
}

/** El total confirmado, para que un informe pueda decir cuánto de la caja se apoya en su palabra. */
export function totalConfirmado() {
  let n = 0
  for (const q of QUINCENAS_CONFIRMADAS.values()) n += q.monto
  for (const o of OBLIGACIONES_CONFIRMADAS.values()) n += o.monto
  return n
}
