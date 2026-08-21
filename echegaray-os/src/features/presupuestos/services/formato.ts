// LOS NÚMEROS DEL PRESUPUESTO, ESCRITOS COMO SE LEEN EN SAN JUAN.
//
// ═══ POR QUÉ NO ALCANZA CON `@/shared/utils/format` ═══
//
// `money()` sirve tal cual y se reusa. `pct()` NO: devuelve `15,3%` —sin espacio y siempre con un
// decimal— y el contrato visual pide `12 %`, `3,5 %` y `17,0 %`, con espacio y con los decimales
// que el número tenga. Cambiar `pct()` para todo el OS movería el formato de ocho pantallas que
// nadie pidió tocar, así que el porcentaje del presupuesto se escribe acá, una vez, con su test.
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO ═══
//
// `null` NO ES CERO. Ninguna función de acá inventa un `0` ni un `$ 0`: cuando el dato no está,
// devuelven `null` y la pantalla escribe «sin cargar», «sin dato» o «sin análisis» según de qué
// ausencia se trate. Un `$ 0` en la columna SUBTOTAL afirma que la partida no vale nada; «sin
// cargar» dice la verdad, que es que nadie la midió todavía.

/**
 * Un `numeric` de Postgres puede llegar como número o como texto según por dónde entró (columna
 * directa vs. embebido en JSONB). Se normaliza en el borde para que adentro del módulo el contrato
 * se cumpla. Vacío, no finito o no numérico → `null`, que es «no hay dato», no cero.
 */
export function aNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const MILES = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

/** `$ 165.526.633`. Sin decimales: un presupuesto no se decide por centavos. */
export function plata(v: number | null | undefined): string | null {
  const n = aNumero(v)
  return n === null ? null : `$ ${MILES.format(Math.round(n))}`
}

/** El importe sin el signo, para las columnas que ya tienen el rótulo `$` en el encabezado. */
export function importe(v: number | null | undefined): string | null {
  const n = aNumero(v)
  return n === null ? null : MILES.format(Math.round(n))
}

/**
 * `0,17` → `17,0 %`. Recibe la FRACCIÓN, que es como la guarda `pct_margen` en la base.
 *
 * `decimales` por defecto 1: `12 %` se escribiría `12,0 %`, y el contrato lo muestra sin decimal
 * cuando es redondo. Por eso `auto`: hasta dos decimales, sin ceros de relleno.
 */
export function porcentajeDeFraccion(v: number | null | undefined, decimales: number | 'auto' = 1): string | null {
  const n = aNumero(v)
  return n === null ? null : porcentaje(n * 100, decimales)
}

/** `17` → `17 %`. Recibe el PORCENTAJE ya en escala 0–100 (lo que devuelve `margen_sobre_precio_pct`). */
export function porcentaje(v: number | null | undefined, decimales: number | 'auto' = 1): string | null {
  const n = aNumero(v)
  if (n === null) return null
  if (decimales === 'auto') {
    // Redondeo a 2 y se le sacan los ceros de la derecha: 12 → «12 %», 3,5 → «3,5 %», 17 → «17 %».
    const txt = Math.round(n * 100) / 100
    return `${String(txt).replace('.', ',')} %`
  }
  return `${n.toFixed(decimales).replace('.', ',')} %`
}

/** La cantidad del cómputo: `2,16`. Hasta 4 decimales porque a 4 redondea el control de la base. */
export function cantidad(v: number | null | undefined): string | null {
  const n = aNumero(v)
  if (n === null) return null
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 }).format(n)
}

/** HH SIN DECIMALES — contrato visual §Formato es-AR. 73, no 73,44. */
export function hh(v: number | null | undefined): string | null {
  const n = aNumero(v)
  return n === null ? null : MILES.format(Math.round(n))
}

/** El rendimiento SIEMPRE con 2 decimales: `34,00 hs/m³`. La precisión acá cambia la cotización. */
export function rendimiento(v: number | null | undefined): string | null {
  const n = aNumero(v)
  return n === null ? null : n.toFixed(2).replace('.', ',')
}

/** `28/02/2026` desde una fecha ISO. Sin hora: el presupuesto se fecha por día. */
export function fecha(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
