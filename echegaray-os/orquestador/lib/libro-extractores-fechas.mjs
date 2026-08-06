// LA ARITMÉTICA DE FECHAS DEL LIBRO — el serial de Sheets, y nada más.
//
// ═══ POR QUÉ EXISTE ═══
//
// Los extractores y el portón de conciliación tienen que reproducir EN JAVASCRIPT fechas que la
// planilla calcula con `EOMONTH(...)+20`, `TODAY()+7` y `MAX(...)`. Si cada uno se escribe su propia
// conversión de serial a fecha, la primera que se corra un día distinto va a discrepar con la otra por
// un día y la diferencia va a aparecer como plata de más o de menos en un tramo — sin un solo error.
//
// TODO EN UTC, A PROPÓSITO. Un `new Date(serial * 86400000)` en horario local corre la fecha una hora
// y, en el huso de San Juan (UTC−3), el resultado cae el día anterior. Es el mismo modo de falla que
// ya obligó a `jornales-fecha-pago.mjs` a trabajar a mediodía UTC.
//
// EL ORIGEN ES 30/12/1899 y no 01/01/1900: Sheets (como Excel) arrastra el bug del año 1900 bisiesto,
// así que el serial 1 es el 31/12/1899. Escrito una vez acá, no se vuelve a escribir en ningún lado.

/** El día cero del serial de Sheets, en milisegundos UTC. */
export const EPOCA = Date.UTC(1899, 11, 30)
const DIA = 86400000

/** NÚCLEO PURO: (año, mes 1-12, día) → serial de Sheets. */
export const serialDe = (anio, mes, dia) => Math.round((Date.UTC(anio, mes - 1, dia) - EPOCA) / DIA)

/** NÚCLEO PURO: serial de Sheets → Date en UTC. */
export const fechaDeSerial = (serial) => new Date(EPOCA + Math.round(serial) * DIA)

/** NÚCLEO PURO: serial → 'YYYY-MM-DD'. Para que un concepto del libro se lea sin abrir la planilla. */
export const isoDeSerial = (serial) => (Number.isFinite(serial) ? fechaDeSerial(serial).toISOString().slice(0, 10) : '')

/**
 * NÚCLEO PURO: el `EOMONTH(fecha; k)` de Sheets, en serial — el ÚLTIMO día del mes `k` meses después.
 *
 * `Date.UTC(a, m + 1, 0)` es el día 0 del mes siguiente, que es el último del mes pedido, y JS
 * normaliza solo el desborde de diciembre a enero del año que viene. Ese caso no es teórico: el IVA
 * del período diciembre vence el 20/01 del año SIGUIENTE, y es el que un `mes+1` ingenuo rompe.
 */
export function eomonth(serial, k = 0) {
  const d = fechaDeSerial(serial)
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Number(k) + 1, 0) - EPOCA) / DIA)
}

/** NÚCLEO PURO: el último día del mes `mes` del año `anio`, en serial. El `EOMONTH(DATE(a;m;1);0)`. */
export const finDeMes = (anio, mes) => Math.round((Date.UTC(anio, mes, 0) - EPOCA) / DIA)
