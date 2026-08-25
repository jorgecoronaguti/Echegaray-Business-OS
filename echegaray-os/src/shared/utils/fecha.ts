// FECHA Y HORA EN CASTELLANO, SIN LA TRAMPA DE LAS 12 HORAS.
//
// POR QUÉ EXISTE (23/07). El Calendario Financiero decía "Generado … 23/7/2026, 05:33:02" para un
// snapshot generado a las 17:33. `toLocaleString('es-AR')` sin opciones devuelve el reloj de 12 horas
// y NO agrega el "a. m./p. m.": 17:33 sale como 05:33. En una pantalla de plata, leer una cifra como
// si fuera de la madrugada anterior cambia la decisión — parece vieja cuando está fresca.
//
// Se resuelve en un solo lugar para que ninguna pantalla lo repita mal.

/** Fecha y hora local, reloj de 24 horas: "23/07/2026, 17:33". */
export const fechaHora = (d: Date | string | number) =>
  new Date(d).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

/** Sólo la fecha: "23/07/2026". */
export const fechaCorta = (d: Date | string | number) =>
  new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS FECHAS DE TABLA — vivían en `features/obras/components/formato.ts` (bajo `fecha` y
// `fechaCorta`) y en `features/integraciones/components/formato.ts` (bajo `dm` y `dmHora`).
//
// SE SEPARAN POR CÓMO LEEN EL INSTANTE, NO POR CÓMO LO ESCRIBEN. Las de sufijo `ISO` leen un
// `YYYY-MM-DD` como día calendario —en UTC o por corte de texto— y por eso nunca se corren un día;
// las de sufijo `Local` parsean el instante en el huso del navegador, que es lo correcto cuando el
// dato es un `timestamptz` (un pedido cargado 23:30 en Argentina es de ESE día, no del siguiente).
// Dan el mismo texto para una fecha sin hora y textos distintos para un instante con huso: son dos
// reglas, y por eso quedan como dos funciones y no como una con bandera.
//
// EL CERO A LA IZQUIERDA SE PONE A MANO, y no es capricho: `toLocaleDateString('es-AR', {day:
// '2-digit', month: '2-digit'})` SIN año devuelve «23/4» — ICU ignora el `2-digit` del mes cuando el
// formato no lleva año. En una columna de fechas, unas con dos dígitos y otras con uno, los días
// dejan de alinearse y la columna deja de poder barrerse con la vista, que es lo único para lo que
// existe una columna de fechas en mono tabular.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** «26/06/25» — un ISO (YYYY-MM-DD) leído en UTC para que no se corra un día. Vacío → '—'. */
export const diaMesAnioISO = (iso: string | null | undefined) =>
  iso
    ? new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC',
      })
    : '—'

/** «26/06» — el formato de la columna PLAZO, donde el año no aporta y sí ocupa. Se corta del texto
 *  del ISO: sin `Date` de por medio no hay huso que pueda correr el día. Vacío → null. */
export const diaMesISO = (iso: string | null | undefined) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null

const dosDigitos = (n: number) => String(n).padStart(2, '0')

function comoFecha(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** «20/08» en huso local. Vacío o fecha rota → null, para que el llamador escriba la ausencia. */
export function diaMesLocal(iso: string | null | undefined): string | null {
  const d = comoFecha(iso)
  return d ? `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}` : null
}

/** «20/08/26» en huso local — para el timeline de una herramienta, donde el orden es el dato. */
export function diaMesAnioLocal(iso: string | null | undefined): string | null {
  const d = comoFecha(iso)
  return d ? `${diaMesLocal(iso)}/${dosDigitos(d.getFullYear() % 100)}` : null
}
