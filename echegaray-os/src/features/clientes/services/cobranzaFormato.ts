// CÓMO SE ESCRIBE UN NÚMERO Y UNA FECHA EN LAS PANTALLAS 28 · 31 · 32.
//
// ═══ POR QUÉ NO ALCANZA CON `plataCorta` ═══
//
// `shared/utils/format.ts` ya tiene la familia del OS y esta capa NO la reemplaza: `plata` y
// `plataCorta` siguen siendo las de todas las demás pantallas. Pero el zip escribe la plata de
// cobranzas de una forma propia y consistente en las tres pantallas — `$ 8,20 M`, con espacio
// después del signo, dos decimales SIEMPRE y la escala M fija (`28:88`, `32:66`) — y `plataCorta`
// da `$8,2M`. Portar «casi» ese formato es la diferencia de la que se quejó el dueño cuatro veces.
//
// LA ESCALA ES FIJA A PROPÓSITO. Una columna donde una fila dice `$ 5,80 M` y la de abajo
// `$ 840.000` no se puede comparar de un vistazo, que es para lo único que existe una columna de
// montos alineada en mono. El costo está declarado: un pago chico se lee `$ 0,05 M`, y por eso el
// panel del pago escribe el monto ENTERO (`32:433`), donde el número exacto sí es el dato.

import { diaMesISO } from '../../../shared/utils/fecha.ts'

/** `9300000` → `9,30`. El número de la banda de antigüedad y de la columna REPARO (`28:122`). */
export function enMillones(n: number | null | undefined, decimales = 2): string | null {
  if (n == null || !Number.isFinite(n)) return null
  return (n / 1_000_000).toLocaleString('es-AR', {
    minimumFractionDigits: decimales, maximumFractionDigits: decimales,
  })
}

/** `8200000` → `$ 8,20 M`. Vacío → `—`: un monto que no existe NUNCA se escribe `$ 0,00 M`. */
export function montoM(n: number | null | undefined): string {
  const m = enMillones(n)
  return m === null ? '—' : `$ ${m} M`
}

/** `3100000` → `$ 3.100.000` — el monto exacto del panel del pago (`32:433`). */
export function pesos(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$ ${Math.round(n).toLocaleString('es-AR')}`
}

/** `2026-09-17` → `17/09`. Es `diaMesISO` del OS; se re-exporta para no tener dos reglas de fecha. */
export const diaMes = (iso: string | null | undefined): string | null => diaMesISO(iso)

/** `2026-09-17` → `17/09/2026`. El año COMPLETO, que es como lo escribe el campo de fecha del panel
 *  (`32:416`) — `diaMesAnioISO` del OS da `17/09/26`, que es el formato de las tablas de Obras. */
export function diaMesAnio(iso: string | null | undefined): string | null {
  if (!iso || iso.length < 10) return null
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/** Días CALENDARIO entre dos ISO, positivo hacia adelante. Se calcula en UTC sobre el día pelado:
 *  con husos de por medio, «vence hoy» y «venció ayer» se intercambian según la hora del servidor. */
export function diasEntre(desde: string | null | undefined, hasta: string | null | undefined): number | null {
  if (!desde || !hasta) return null
  const a = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}

/** «Marta Ruiz» → «MR». Una sola palabra da sus dos primeras letras; sin nombre, `?`. */
export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/** El instante de la columna ÚLTIMO INGRESO: «hoy 08:12» el mismo día, «20/08 16:40» antes
 *  (`31:110`, `31:135`). `null` = nunca entró, y eso lo dibuja la pantalla con su propio ícono. */
export function momentoCorto(at: string | null | undefined, hoyISO: string): string | null {
  if (!at) return null
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  // TODO EN HUSO LOCAL, incluido el «¿es hoy?»: un ingreso de las 21:30 de Argentina cae en el día
  // siguiente en UTC, y la columna diría «22/08 21:30» sobre algo que pasó hoy. Comparar el día
  // local contra el día local es la única forma de que «hoy» signifique hoy.
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const mismoDia = `${d.getFullYear()}-${mm}-${dd}` === hoyISO.slice(0, 10)
  return mismoDia ? `hoy ${hora}` : `${dd}/${mm} ${hora}`
}
