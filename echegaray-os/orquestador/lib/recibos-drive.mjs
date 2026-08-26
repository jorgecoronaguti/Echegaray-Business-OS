// LEER UN RECIBO DE CLIENTE DESDE DRIVE — todo lo que se decide SIN red, para poder probarlo.
//
// El barrido (qué carpeta se lista, qué PDF se baja) vive en
// `orquestador/scripts/recibos-drive-sembrar.mjs`. Acá están las reglas: qué archivo ES un recibo
// del cliente, qué dice su nombre, y qué se puede afirmar de su contenido. Separarlas es lo que
// permite probarlas con los nombres REALES de la carpeta sin tocar Google.
//
// ═══ LAS DOS CARPETAS QUE EXISTEN HOY (26/08/2026) ═══
//
//   administracion/PRESUPUESTOS - CLIENTES/LA ESTRELLA/RECIBOS/         → 11 recibos + 2 estados de deuda
//   administracion/PRESUPUESTOS - CLIENTES/JAVIER SANCHEZ/CERTIFICADOS/ → 12 recibos
//
// Y una trampa que ya estaba puesta: `ARCOR - SAN JUAN/ARCOR/SECONDI/8. AGOSTO/Recibos 1.pdf` son
// RECIBOS DE SUELDO del personal de un subcontratista, escaneados con CamScanner, dentro de la
// carpeta del cliente ARCOR. Se llaman igual y no son lo mismo: publicarlos en el portal le
// mostraría a ARCOR los sueldos de la gente de otra empresa.

/** Sin tildes, en minúscula y con los espacios colapsados. Comparar nombres de archivo de otra forma
 *  hace que «RECIBO» y «Recibo » sean cosas distintas. */
export const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** El nombre sin la extensión. `Recibo 17. r.pdf` → `Recibo 17. r`. */
export const sinExtension = (s) => String(s ?? '').replace(/\.[a-z0-9]{2,4}$/i, '')

/**
 * ES UN RECIBO DE SUELDO, NO EL RECIBO DE UN CLIENTE.
 *
 * Se pregunta por separado de todo lo demás porque es la única confusión con consecuencia grave:
 * un recibo de haberes publicado en el portal de un cliente es un dato personal de un tercero.
 * Falla cerrado — ante la duda, no es del cliente.
 */
export const esReciboDeSueldo = (nombre) =>
  /\b(sueldo|sueldos|haber|haberes|jornal|jornales|quincena|liq\.? ?final|liquidacion final)\b/.test(normalizar(nombre))

/** El archivo se llama «recibo…». Nada más: el resto lo decide DÓNDE está. */
export const esNombreDeRecibo = (nombre) => /^recibos?\b/.test(normalizar(sinExtension(nombre)))

/**
 * ESTA CARPETA ES LA DE LOS RECIBOS DEL CLIENTE.
 *
 * `RECIBOS` (La Estrella) y `CERTIFICADOS` (Javier Sánchez) son las dos que existen; el dueño usa
 * las dos palabras para lo mismo. `RECIBOS DE SUELDO` también empieza con «recibos» y NO es ésta.
 */
export const esCarpetaDeRecibos = (nombre) =>
  /\b(recibos?|certificados?)\b/.test(normalizar(nombre)) && !esReciboDeSueldo(nombre)

const DIAS_DEL_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * `30`, `6`, `26` → `2026-06-30`. `null` si el día no existe en ese mes.
 *
 * Un año de dos dígitos se completa con 20xx: los recibos de esta empresa son de 2025 y 2026, y no
 * hay ninguno de 1926. El corte en 70 es la convención de siempre, escrita para que se vea.
 */
export function aFechaISO(d, m, a) {
  const dia = Number(d); const mes = Number(m); let anio = Number(a)
  if (!Number.isInteger(dia) || !Number.isInteger(mes) || !Number.isInteger(anio)) return null
  if (anio < 100) anio += anio < 70 ? 2000 : 1900
  if (mes < 1 || mes > 12 || dia < 1 || dia > DIAS_DEL_MES[mes - 1]) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// El dueño escribe las fechas con `:` porque es lo que Drive guarda cuando en el Finder tipeó `/`.
// Los nombres REALES de la carpeta traen los dos puntos, comprobado listando Drive en vivo.
const SEP = '[:/.\\-]'
const CON_NUMERO_Y_FECHA = new RegExp(`^recibos?\\s*n?[°ºo]?\\s*(\\d{1,4})\\s*-\\s*(\\d{1,2})${SEP}(\\d{1,2})${SEP}(\\d{2,4})\\b`)
const SOLO_FECHA_CON_ANIO = new RegExp(`^recibos?\\s*(\\d{1,2})${SEP}(\\d{1,2})${SEP}(\\d{2,4})\\b`)
const SOLO_FECHA_SIN_ANIO = new RegExp(`^recibos?\\s*(\\d{1,2})${SEP}(\\d{1,2})\\s*$`)
const SOLO_NUMERO = /^recibos?\s*n?[°ºo]?\s*(\d{1,4})\b/

/**
 * QUÉ DICE EL NOMBRE DEL ARCHIVO. Lo que no dice queda en `null` y se explica en `faltan`.
 *
 * Los cuatro dialectos que usa el dueño, con su ejemplo real:
 *
 *   `RECIBO 11 - 31:7:26.pdf` → número 11 y fecha 2026-07-31
 *   `RECIBO 19:1:26.pdf`      → sin número, fecha 2026-01-19   (el 19 es el día, no el número)
 *   `RECIBO 27:10.pdf`        → sin número y SIN AÑO — la fecha queda en null, no se completa
 *   `Recibo 17. r.pdf`        → número 17, sin fecha
 *
 * El orden importa y es lo que la separa de una heurística: primero se pregunta si hay una FECHA,
 * porque `RECIBO 15:9` leído como número daría un recibo 15 que no existe.
 */
export function datosDelNombre(nombre) {
  const n = normalizar(sinExtension(nombre))
  const faltan = []
  let m = CON_NUMERO_Y_FECHA.exec(n)
  if (m) {
    const fecha = aFechaISO(m[2], m[3], m[4])
    if (!fecha) faltan.push('la fecha del nombre no es un día real')
    return { numero: m[1], fecha, faltan }
  }
  m = SOLO_FECHA_CON_ANIO.exec(n)
  if (m) {
    const fecha = aFechaISO(m[1], m[2], m[3])
    if (!fecha) faltan.push('la fecha del nombre no es un día real')
    return { numero: null, fecha, faltan: [...faltan, 'el nombre no trae número de recibo'] }
  }
  if (SOLO_FECHA_SIN_ANIO.test(n)) {
    // Día y mes sin año. Completarlo con el año del archivo sería una inferencia presentada como
    // dato: la fecha de un comprobante o se sabe o no se sabe.
    return { numero: null, fecha: null, faltan: ['el nombre trae día y mes pero no el año'] }
  }
  m = SOLO_NUMERO.exec(n)
  if (m) return { numero: m[1], fecha: null, faltan: ['el nombre no trae fecha'] }
  return { numero: null, fecha: null, faltan: ['el nombre no trae ni número ni fecha'] }
}

/** `1.234.567,89` → 1234567.89. Formato es-AR: el punto es de miles y la coma es decimal. */
export function aNumeroArgentino(s) {
  const limpio = String(s ?? '').replace(/\./g, '').replace(',', '.')
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

// La fórmula sacramental de un recibo argentino. Se pide LITERAL y no «un número con signo peso»:
// en un estado de cuenta hay veinte números con signo peso y ninguno es el importe del comprobante.
const RECIBI_LA_SUMA = /recib[íi][^$]{0,160}?\$\s*([\d.]{1,15},\d{2})/i
const IMPORTE_ROTULADO = /\b(?:importe|total recibido|son pesos)\s*:?\s*\$?\s*([\d.]{1,15},\d{2})/i

/**
 * EL IMPORTE QUE EL COMPROBANTE DECLARA, o `null`.
 *
 * ═══ POR QUÉ ESTO ES TAN ESTRICTO ═══
 *
 * Los 23 archivos que hay hoy NO son recibos con un importe: son el estado de cuenta del cliente
 * exportado a PDF —veinte filas de pagos, subtotales, IVA y un saldo—. Cualquier regla del tipo
 * «el número más grande» o «el último total» devolvería un número real de ese cuadro presentado
 * como el importe de un recibo, que es exactamente la clase de dato que no se le puede mostrar mal
 * a un cliente. Sin la frase que hace de un papel un recibo, no hay importe.
 */
export function importeDeclarado(texto) {
  const t = String(texto ?? '')
  const m = RECIBI_LA_SUMA.exec(t) ?? IMPORTE_ROTULADO.exec(t)
  return m ? aNumeroArgentino(m[1]) : null
}

/** El PDF es el cuadro de cuenta corriente del cliente, no un comprobante. Sólo para explicarlo en
 *  el informe: por qué ese recibo entró sin importe. */
export const esEstadoDeCuenta = (texto) =>
  /saldo pendiente/i.test(String(texto ?? '')) || (/forma de pago/i.test(String(texto ?? '')) && /sub ?total/i.test(String(texto ?? '')))

/**
 * DE QUÉ OBRA ES — `null` cuando no se puede afirmar.
 *
 * @param obraIds las obras que declaran como PROPIA la carpeta donde apareció el archivo.
 *
 * Cero obras (el archivo está en la carpeta del CLIENTE) y dos o más (Messina declara la misma
 * carpeta de Drive para «BSA - Planta» y «BSA - Adicional») dan la misma respuesta: no se sabe.
 * Elegir una sería inventar a qué obra se le imputa un cobro.
 */
export function obraDeLasCarpetas(obraIds) {
  const unicas = [...new Set((obraIds ?? []).filter(Boolean))]
  return unicas.length === 1 ? unicas[0] : null
}
