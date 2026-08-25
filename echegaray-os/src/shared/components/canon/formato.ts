// CÓMO ESCRIBE LOS IMPORTES EL ZIP — y por qué no es uno solo.
//
// ═══ EL ZIP USA DOS ESCALAS, Y LA DIFERENCIA ES DE NEGOCIO ═══
//
// Las CARTERAS que se recorren para comparar magnitudes escriben millones con un decimal:
// `14` (`$ 34,2 M`), `22` (`$ 42,6 M`), `25` (`$ 184,0 M`), `26` (KPIs). Las pantallas
// TRANSACCIONALES escriben el peso entero: `24` Compras (`$ 912.000`), `16` Análisis
// (`$ 168.000`), `23` Paquetes (`$ 3.500.000`).
//
// No es una inconsistencia del mockup: es la distinción entre EL NÚMERO QUE DECIDE y EL DETALLE.
// Nadie elige entre dos ofertas por $ 40.000 de diferencia sobre $ 34 M, y en cambio un comprobante
// de $ 912.000 se concilia contra el banco al peso. Redondear la cartera a millones es lo que hace
// que la columna se pueda comparar de un vistazo; redondear un comprobante sería perder el dato.
//
// LO QUE NUNCA PASA: que un `null` se escriba como `$ 0,0 M`. Un presupuesto sin partidas y un
// presupuesto de cero pesos son cosas opuestas, y la columna TOTAL de `14` lo dice con palabras
// («sin cotizar») en `#B54708`, no con un cero.

/** Un `numeric` de Postgres puede llegar como número o como texto. Vacío o no finito → `null`. */
function aNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * `34200000` → `$ 34,2 M`. La escala de las carteras.
 *
 * Un decimal SIEMPRE, incluso cuando es redondo (`$ 184,0 M`): sin el decimal fijo la columna deja
 * de alinearse en la coma y una columna de importes que no alinea es una columna que no se compara,
 * que es lo único para lo que existe.
 *
 * `null` devuelve `null` — quien llama decide qué palabra va en su lugar, porque no es la misma:
 * en `14` es «sin cotizar» y en una ficha puede ser «sin contrato».
 *
 * ═══ DESVÍO DECLARADO: POR DEBAJO DEL MILLÓN NO SE USA LA ESCALA «M» ═══
 *
 * Al pie de la letra, `millones(400000)` daría `$ 0,4 M`. Ese texto empieza con «$ 0» y a un ojo que
 * recorre una columna se lee como cero — que es exactamente el error que este repo persigue en todas
 * partes («el 0 no es vacío», la caja falsa de $ 384 M, las notas de crédito con el signo dado
 * vuelta). Hay además un control vivo que lo afirma: el e2e de la cartera exige que ninguna fila
 * diga «$ 0».
 *
 * El mockup NO tiene el caso: su presupuesto más chico es de $ 8,9 M, así que nunca tuvo que
 * decidirlo. Acá, debajo del millón se escribe el peso entero (`$ 912.000`): ocupa 9 caracteres
 * contra 8, entra igual en la columna de 106px, y no hay ningún importe que se lea como cero sin
 * serlo. Un cero de verdad sí sale `$ 0`, que es lo correcto.
 */
export function millones(v: unknown): string | null {
  const n = aNumero(v)
  if (n === null) return null
  if (n !== 0 && Math.abs(n) < 1_000_000) return pesos(n)
  return `$ ${(n / 1_000_000).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`
}

/** `912000` → `$ 912.000`. La escala transaccional: `24`, `23`, `16`. */
export function pesos(v: unknown): string | null {
  const n = aNumero(v)
  if (n === null) return null
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

/**
 * `16` escribe el precio unitario del insumo con DOS decimales (`$ 924,00`): a nivel de insumo el
 * centavo por unidad multiplicado por mil metros cuadrados sí mueve el costo de la partida.
 */
export function pesosConCentavos(v: unknown): string | null {
  const n = aNumero(v)
  if (n === null) return null
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * `16,8` → `16,8 %`. Recibe el porcentaje en escala 0–100, con el espacio antes del signo que usa
 * el zip en las nueve pantallas (`16,8 %`, no `16,8%`).
 */
export function porcentajeCanon(v: unknown, decimales = 1): string | null {
  const n = aNumero(v)
  if (n === null) return null
  return `${n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`
}

/** `3240` → `3.240`. Cantidades enteras: HH, partidas, unidades. */
export function entero(v: unknown): string | null {
  const n = aNumero(v)
  return n === null ? null : Math.round(n).toLocaleString('es-AR')
}

/**
 * `2026-08-18` → `18/08`. El zip fecha en día/mes SIN año en tablas y paneles: el año se deduce del
 * contexto y ocupa un tercio de una columna de 74px. La fecha completa se sigue escribiendo donde
 * el dato es de identidad (el alta de un proveedor en `23`: «12/03/2026»).
 */
export function diaMes(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return null
  // A MANO, NO `toLocaleDateString`. Con `{ day: '2-digit', month: '2-digit' }` y sin año, el ICU
  // de Node devuelve `18/8` —se come el cero del mes— y la columna deja de alinear: `18/8` y
  // `02/07` no ocupan lo mismo. El zip escribe `18/08` y `12/09` SIEMPRE con dos dígitos.
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}
