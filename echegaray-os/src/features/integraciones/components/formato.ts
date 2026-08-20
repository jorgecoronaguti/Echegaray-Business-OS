// FORMATO DE LAS CELDAS DE OPERACIÓN. Sólo presentación: ningún número se calcula acá.
//
// `dm` es la fecha corta de tabla («20/08»): en una lista de esta semana el año es ruido, y las
// filas se comparan por día. La fecha completa vive en la ficha y en el timeline, donde sí importa.

// EL CERO A LA IZQUIERDA SE PONE A MANO, y no es capricho: `toLocaleDateString('es-AR', {day:
// '2-digit', month: '2-digit'})` SIN año devuelve «23/4», no «23/04» — ICU ignora el `2-digit` del
// mes cuando el formato no lleva año. En una columna de fechas, unas con dos dígitos y otras con
// uno, los días dejan de alinearse y la columna deja de poder barrerse con la vista, que es lo
// único para lo que existe una columna de fechas en mono tabular.
const dosDigitos = (n: number) => String(n).padStart(2, '0')

function comoFecha(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** «20/08». Vacío → null, para que el llamador escriba la ausencia con `<Nulo>`. */
export function dm(iso: string | null | undefined): string | null {
  const d = comoFecha(iso)
  return d ? `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}` : null
}

/** «20/08/26» — para el timeline de una herramienta, donde el orden es el dato. */
export function dmHora(iso: string | null | undefined): string | null {
  const d = comoFecha(iso)
  return d ? `${dm(iso)}/${dosDigitos(d.getFullYear() % 100)}` : null
}

/** Cantidades en es-AR, sin inventar decimales. `null` sigue siendo null: no es cero. */
export function cantidad(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}
