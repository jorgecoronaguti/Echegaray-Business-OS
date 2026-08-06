// EL LIBRO CANÓNICO DE MOVIMIENTOS — cada movimiento existe UNA sola vez.
//
// ═══ POR QUÉ EXISTE (05/08/2026) ═══
//
// El dueño: *"No quiero tres motores de cálculo. Construí una única tabla financiera canónica donde
// cada movimiento exista una sola vez y desde ella alimentá Caja, Cash Flow Semanal y Cash Flow
// Mensual. No quiero lógica duplicada. No quiero SUMPRODUCT repetidos. No quiero fórmulas gigantes."*
//
// Hoy ya hay una fuente única, pero es de FÓRMULAS: `CUADRO` + `expresionReal(l, desde, hasta)` en
// `cash-flow-lineas.mjs`. Las tres vistas usan la misma función —hay un test que lo prueba— y por eso
// no pueden discrepar en QUÉ cuentan. Lo que falta es la otra mitad: cada CELDA sigue recalculando su
// número con un SUMPRODUCT sobre Compras, Cobranzas, Cheques y el resto. De ahí salen las fórmulas de
// ochocientos caracteres, la imposibilidad de auditar una celda a ojo, y la lentitud del archivo.
//
// Este módulo es la MATERIALIZACIÓN: una fila por movimiento, clasificada una sola vez. Después, una
// celda de cualquier vista es un `SUMIFS` corto sobre este libro — y una corrección se hace en un
// lugar, que es literalmente lo que el dueño pidió.
//
// ═══ LO QUE ESTE ARCHIVO NO HACE ═══
//
// No lee Google, no escribe Google, no toca la base. Es núcleo puro: recibe las filas ya leídas de
// cada pestaña y devuelve movimientos. Eso lo hace verificable en frío, sin red, con datos armados a
// mano — que es la única forma de probar la deduplicación, que es donde se pierde la plata.
//
// ═══ EL ESTADO ES LA REGLA ABSOLUTA ═══
//
// De la skill de tesorería, textual: *"Todo movimiento se clasifica explícitamente como uno de: REAL ·
// COMPROMETIDO · PROYECTADO · VENCIDO. Nunca se suman dos categorías distintas en la misma columna sin
// distinguirlas. Un proyectado que se cumple se marca como real — no se duplica sumando ambos."*
//
// Por eso el estado es un campo del movimiento y no una propiedad de la vista: si la vista lo decide,
// dos vistas lo deciden distinto.

import { rubroDeCaja, SIN_CLASIFICAR } from './rubro-caja.mjs'
import { clienteCanonico } from './libro-clientes.mjs'

/** Lo que la caja hace con el movimiento. `+1` entra, `-1` sale. Nunca cero: un movimiento neutro no
 *  es un movimiento — es dos, y contarlo como uno esconde uno de los dos lados. */
export const ENTRA = 1
export const SALE = -1

/**
 * EL ESTADO — la regla absoluta del criterio percibido.
 *
 * · `REAL`         la plata YA se movió. Hay respaldo: un débito en el extracto, un cobro acreditado.
 * · `COMPROMETIDO` está firmado y entregado, con fecha, pero todavía no salió de la cuenta. El caso
 *                  canónico es el cheque emitido y no debitado: salió de tus manos, no de tu cuenta.
 * · `PROYECTADO`   se espera que ocurra. Es una estimación con fecha, no un hecho.
 * · `VENCIDO`      estaba previsto para una fecha que ya pasó y nadie lo marcó como real. NO es un
 *                  cuarto tipo de plata: es un PROYECTADO que necesita que alguien lo mire. Se
 *                  distingue porque mezclarlo con el resto del proyectado esconde el trabajo pendiente.
 */
export const ESTADOS = Object.freeze(['REAL', 'COMPROMETIDO', 'PROYECTADO', 'VENCIDO'])

/**
 * LA ACTIVIDAD — RT 8/9 y NIC 7. No es decoración: define en qué bloque del estado de flujo de
 * efectivo cae el movimiento, y el uso del descubierto es FINANCIACIÓN aunque se sienta como caja.
 */
export const ACTIVIDADES = Object.freeze(['operativa', 'inversion', 'financiacion'])

/**
 * EL INSTRUMENTO — con qué se movió la plata.
 *
 * Importa por una razón que ya costó plata: **un cheque se identifica por (instrumento, número)**, y
 * el FISICO 313 no es el ECHEQ 313. Sin el instrumento, la clave de deduplicación fusiona dos cheques
 * distintos en uno y desaparece un pago.
 */
export const INSTRUMENTOS = Object.freeze([
  'transferencia', 'cheque', 'echeq', 'tarjeta', 'efectivo', 'debito', 'desconocido',
])

const norm = (s) => String(s ?? '').trim()
const claveNorm = (s) => norm(s).toLowerCase().replace(/\s+/g, ' ')
/** Un número de comprobante escrito de seis maneras distintas es el mismo número. */
const soloDigitos = (s) => norm(s).replace(/\D/g, '').replace(/^0+/, '')

/**
 * NÚCLEO PURO: arma un movimiento normalizado, o explota diciendo qué le falta.
 *
 * FALLA CERRADO A PROPÓSITO. Un movimiento sin fecha, sin importe o sin estado no es "un movimiento
 * incompleto": es un agujero en el libro que después aparece como una diferencia sin causa, que es
 * exactamente lo que el dueño no acepta. Mejor romper acá, con el nombre del campo que falta.
 *
 * @param {object} m
 * @returns {object} el movimiento normalizado
 */
export function movimiento(m = {}) {
  const falta = []
  if (!Number.isFinite(m.fecha)) falta.push('fecha (serial de Sheets)')
  if (!Number.isFinite(m.importe)) falta.push('importe')
  if (m.signo !== ENTRA && m.signo !== SALE) falta.push('signo (+1 entra / -1 sale)')
  if (!ESTADOS.includes(m.estado)) falta.push(`estado (uno de ${ESTADOS.join('/')})`)
  if (!m.origen?.pestana) falta.push('origen.pestana')
  if (falta.length) {
    throw new Error(`libro-movimientos: no puedo construir el movimiento, falta ${falta.join(' · ')}. `
      + `Lo que llegó: ${JSON.stringify(m).slice(0, 180)}`)
  }
  // ═══ EL IMPORTE SE GUARDA SIEMPRE POSITIVO, Y EL SIGNO APARTE ═══
  //
  // Guardar "-45.695" y además un signo es tener el mismo hecho dos veces, y el día que uno de los dos
  // se invierta la suma da un número plausible y equivocado. El signo manda; el importe es magnitud.
  const importe = Math.abs(m.importe)
  const actividad = ACTIVIDADES.includes(m.actividad) ? m.actividad : 'operativa'
  const instrumento = INSTRUMENTOS.includes(m.instrumento) ? m.instrumento : 'desconocido'
  return Object.freeze({
    fecha: m.fecha,
    signo: m.signo,
    importe,
    moneda: norm(m.moneda) || 'ARS',
    importeOrigen: Number.isFinite(m.importeOrigen) ? Math.abs(m.importeOrigen) : importe,
    tipoCambio: Number.isFinite(m.tipoCambio) ? m.tipoCambio : 1,
    concepto: norm(m.concepto),
    rubro: norm(m.rubro) || SIN_CLASIFICAR,
    actividad,
    estado: m.estado,
    instrumento,
    contraparte: norm(m.contraparte),
    cuit: soloDigitos(m.cuit) || '',
    comprobante: norm(m.comprobante),
    obra: norm(m.obra),
    // ═══ EL CLIENTE SE CANONIZA ACÁ Y NO EN CADA EXTRACTOR ═══
    //
    // Cada fuente lo nombra distinto ("LA ESTRELLA" en Compras, "LA ESTRELLA /ALIMENTOS DEL SUR SAS"
    // en Cobranzas) y son SIETE extractores. Con la traducción en cada uno, el que se agregue mañana
    // se olvida de llamarla y sus filas caen en el residuo sin que nada avise. Acá no se puede olvidar:
    // el que no manda `cliente` obtiene el vacío, que es la respuesta correcta para el que no lo tiene.
    cliente: clienteCanonico(m.cliente),
    origen: Object.freeze({ pestana: norm(m.origen.pestana), fila: m.origen.fila ?? null }),
    clave: claveDe({ ...m, importe, instrumento }),
  })
}

/**
 * NÚCLEO PURO: LA CLAVE DE DEDUPLICACIÓN. Acá es donde se pierde o se duplica la plata.
 *
 * ═══ LAS TRAMPAS YA PAGADAS, CADA UNA CON SU FACTURA ═══
 *
 * · **Un cheque se identifica por (instrumento, número, SIGNO), NUNCA por el número solo.** El FISICO
 *   313 y el ECHEQ 313 son dos cheques distintos. Y el signo no es un adorno: el cheque 514 que un
 *   cliente me entregó (ENTRA, está en `_CHEQUES_RAW` como valor en cartera) y el cheque 514 que yo
 *   libré (SALE, está en "Cheques Emitidos") son dos hechos opuestos que comparten número. Sin el
 *   signo, la cartera y el compromiso colapsan en una sola fila y desaparece uno de los dos.
 * · **La referencia del banco es la clave, no el saldo corrido.** Usar el saldo dejó entrar 68
 *   duplicados: el saldo cambia cuando se inserta un movimiento anterior, así que la misma operación
 *   se ve distinta en dos importaciones.
 * · **Un comprobante se identifica por (CUIT, número, SIGNO).** Sin el signo, una nota de crédito y su
 *   factura colapsan en una sola fila: así se sumaron $41,9M de notas como si fueran compras.
 *
 * CUANDO NO HAY IDENTIFICADOR PROPIO, la clave incluye el ORIGEN (pestaña + fila). Es deliberado y hay
 * que decirlo: dos filas distintas de la misma pestaña son dos movimientos aunque digan lo mismo. Un
 * pago de $750.000 al mismo proveedor el mismo día puede ser dos cuotas de un plan — colapsarlas
 * "porque son iguales" es inventar que una no existió.
 */
export function claveDe(m = {}) {
  const inst = INSTRUMENTOS.includes(m.instrumento) ? m.instrumento : 'desconocido'
  // Un cheque tiene identidad propia: su número, dentro de su especie y de su dirección.
  const nCheque = soloDigitos(m.numeroCheque)
  if ((inst === 'cheque' || inst === 'echeq') && nCheque) {
    return `${inst}:${nCheque}:${m.signo === SALE ? 'S' : 'E'}`
  }
  // El banco: su referencia es única y sobrevive a que se reordenen los movimientos.
  const ref = norm(m.referenciaBanco)
  if (ref) return `banco:${claveNorm(ref)}`
  // Un comprobante fiscal: CUIT + número + signo. El signo distingue la nota de crédito de su factura.
  const nComp = soloDigitos(m.comprobante)
  const cuit = soloDigitos(m.cuit)
  if (nComp && cuit) return `comp:${cuit}:${nComp}:${m.signo === SALE ? 'S' : 'E'}`
  // Sin identificador propio, el origen ES la identidad. Ver el comentario de arriba.
  return `origen:${claveNorm(m.origen?.pestana)}:${m.origen?.fila ?? '?'}`
}

/**
 * NÚCLEO PURO: deduplica un libro, y DICE qué colapsó.
 *
 * NO ALCANZA CON DEVOLVER LA LISTA LIMPIA. Una deduplicación silenciosa que se come un pago real es
 * indistinguible de una que funciona: las dos devuelven menos filas. Por eso devuelve también los
 * grupos que colapsó, con sus orígenes, para que un control pueda mirarlos.
 *
 * GANA EL MÁS FUERTE, NO EL PRIMERO. Si el mismo hecho llega como PROYECTADO desde una pestaña y como
 * REAL desde el extracto, vale el REAL — es la regla "un proyectado que se cumple se marca como real,
 * no se duplica sumando ambos". El orden de llegada no puede decidir eso.
 */
export function deduplicar(movimientos = []) {
  const FUERZA = { REAL: 3, COMPROMETIDO: 2, VENCIDO: 1, PROYECTADO: 0 }
  const porClave = new Map()
  const colapsos = []
  for (const m of movimientos) {
    const ya = porClave.get(m.clave)
    if (!ya) { porClave.set(m.clave, m); continue }
    colapsos.push({ clave: m.clave, se_queda: ya.origen, se_descarta: m.origen, importe: m.importe })
    if (FUERZA[m.estado] > FUERZA[ya.estado]) porClave.set(m.clave, m)
  }
  return { libro: [...porClave.values()], colapsos }
}

/**
 * NÚCLEO PURO: LAS TRANSFERENCIAS INTERNAS SON NEUTRAS PARA LA CAJA CONSOLIDADA.
 *
 * Mover plata del banco al cajón no cambia cuánta plata hay. Contarla una vez —porque uno de los dos
 * lados llegó y el otro no— la inventa o la desaparece. La regla es: **los dos lados o ninguno.**
 *
 * Devuelve los movimientos que SÍ cambian la caja consolidada, y aparte los pares internos, que se
 * conservan porque sí importan para la distribución POR CUENTA (que es otra pregunta).
 */
export function separarInternas(movimientos = []) {
  const internas = movimientos.filter((m) => m.rubro === RUBRO_INTERNO || m.actividad === 'interna')
  const consolidado = movimientos.filter((m) => !internas.includes(m))
  const suma = internas.reduce((a, m) => a + m.signo * m.importe, 0)
  return { consolidado, internas, netoInterno: suma }
}

/** El rótulo que marca un movimiento como traslado entre cuentas propias. */
export const RUBRO_INTERNO = 'Transferencia interna'

/**
 * NÚCLEO PURO: el estado de un movimiento con fecha, mirado contra el corte.
 *
 * Un PROYECTADO cuya fecha ya pasó y que nadie marcó como real no sigue siendo un proyectado: es un
 * VENCIDO, y esa distinción es la que hace visible el trabajo pendiente de conciliación. Un REAL o un
 * COMPROMETIDO no cambian por el paso del tiempo — ya ocurrieron o ya están firmados.
 */
export function estadoContraCorte(estado, fecha, corte) {
  if (estado !== 'PROYECTADO') return estado
  if (!Number.isFinite(fecha) || !Number.isFinite(corte)) return estado
  return fecha < corte ? 'VENCIDO' : 'PROYECTADO'
}

/**
 * NÚCLEO PURO: el rubro de un movimiento, con la MISMA taxonomía que ya usa todo el archivo.
 *
 * `rubro-caja.mjs` define los rubros UNA vez y de ahí salen la fórmula del Sheet y el SQL de Supabase.
 * El libro no puede inventar una segunda taxonomía: sería exactamente la duplicación que vino a matar.
 */
export function rubroDe(fila) {
  return rubroDeCaja(fila ?? {}) || SIN_CLASIFICAR
}

/**
 * NÚCLEO PURO: el saldo acumulado del libro dentro de una ventana `[desde, hasta)`.
 *
 * Es la única operación que las tres vistas necesitan, con distinta ventana:
 *   · CAJA     → un tramo de la escalera de vencimientos
 *   · Semanal  → un día
 *   · Mensual  → un mes
 *
 * Que sea UNA función es el punto entero de este archivo. Si mañana una vista necesita algo que ésta
 * no da, se le agrega un parámetro — no se copia.
 *
 * @param {Array} libro
 * @param {{desde?:number, hasta?:number, estados?:string[], signo?:number, rubros?:string[]}} f
 */
export function sumar(libro = [], f = {}) {
  const estados = f.estados ?? null
  const rubros = f.rubros ? new Set(f.rubros) : null
  let total = 0
  let filas = 0
  for (const m of libro) {
    if (Number.isFinite(f.desde) && m.fecha < f.desde) continue
    if (Number.isFinite(f.hasta) && m.fecha >= f.hasta) continue
    if (estados && !estados.includes(m.estado)) continue
    if (f.signo && m.signo !== f.signo) continue
    if (rubros && !rubros.has(m.rubro)) continue
    total += m.signo * m.importe
    filas++
  }
  return { total, filas }
}
