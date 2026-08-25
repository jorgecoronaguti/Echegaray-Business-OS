// CÓMO ESCRIBE LOS NÚMEROS EL PORTAL — medido de `29` y `30`, que NO escriben como el resto del OS.
//
// ═══ DOS DECIMALES, Y NO ES UN CAPRICHO ═══
//
// Las carteras internas escriben `$ 34,2 M` (un decimal, `shared/components/canon/formato.ts`).
// El portal escribe `$ 26,40 M`, `$ 8,20 M`, `$ 1,56 M`, `$ 0,64 M`: DOS decimales, siempre. La
// diferencia es de destinatario. Adentro, el número se compara de un vistazo entre veinte filas y
// el segundo decimal es ruido; acá el número es LO QUE EL CLIENTE TIENE QUE PAGAR, y $ 1,5 M contra
// $ 1,56 M son sesenta mil pesos que él va a transferir de más o de menos.
//
// Y por lo mismo el portal NO cae al peso entero abajo del millón: el fondo de reparo del mockup es
// `$ 0,64 M` (línea 122 del `29`), no `$ 640.000`. En una barra donde los otros tres tramos están en
// millones, un tramo en pesos enteros se lee como si fuera el más grande.
//
// Reusar `millones()` del canon habría dado `$ 26,4 M` y `$ 640.000` en la misma barra: es
// exactamente el «parecido pero distinto» que costó cuatro entregas rechazadas.

/** Un `numeric` de Postgres llega como número o como texto. Vacío o no finito → `null`. */
function aNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const dosDecimales = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** `26400000` → `$ 26,40 M`. `null` devuelve `null`: quien llama decide qué palabra va en su lugar. */
export function millonesPortal(v: unknown): string | null {
  const n = aNumero(v)
  return n === null ? null : `$ ${dosDecimales(n / 1_000_000)} M`
}

/** `4100000` → `4,10`. Los rótulos DENTRO de los tramos de la barra van sin signo ni unidad. */
export function millonesDesnudo(v: unknown): string | null {
  const n = aNumero(v)
  return n === null ? null : dosDecimales(n / 1_000_000)
}

/** `4100000` → `4,10 M`. La leyenda del teléfono (`30`, líneas 97–105). */
export function millonesCorto(v: unknown): string | null {
  const n = aNumero(v)
  return n === null ? null : `${dosDecimales(n / 1_000_000)} M`
}

/**
 * `2026-07-22` → `22/07/26`. La cabecera de obra del `29` fecha con año de dos dígitos
 * («22/07/26 – 28/11/26»); las tablas usan `diaMes()` del canon, sin año.
 */
export function fechaCortaPortal(iso: string | null | undefined): string | null {
  const dia = (iso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const [a, m, d] = dia.split('-')
  return `${d}/${m}/${a.slice(2)}`
}

/**
 * El renglón chico debajo de la fecha de vencimiento: `en 24 d`, `20 d` (vencido), `hoy`.
 *
 * `dias` es vencimiento − hoy. NO se escribe «en 0 d»: el que vence hoy vence hoy, y esa palabra es
 * la que hace que alguien pague hoy.
 */
export function plazoTexto(dias: number): string {
  if (dias === 0) return 'hoy'
  return dias > 0 ? `en ${dias} d` : `${Math.abs(dias)} d`
}

/** `2` → `hace 2 días`, `1` → `ayer`, `0` → `hoy`. El sello del certificado a aprobar (`29:137`). */
export function haceTexto(dias: number | null): string | null {
  if (dias === null || !Number.isFinite(dias)) return null
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

/** `28` → `28 %`. El portal escribe el porcentaje entero en la cabecera y con un decimal adentro. */
export function porcentajePortal(v: unknown, decimales = 0): string | null {
  const n = aNumero(v)
  if (n === null) return null
  return `${n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`
}
