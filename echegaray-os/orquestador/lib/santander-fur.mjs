// EL DISEÑO DE REGISTRO FUR DE SANTANDER, SIN I/O.
//
// Acá vive TODO lo que decide cómo se ve el archivo que el dueño sube al Online Banking para
// que el banco mueva plata: posiciones fijas, relleno, transliteración, dígitos verificadores y
// el trailer. Nada de esto lee Drive, Postgres ni el Sheet — eso lo hace
// scripts/santander-fur-fcl.mjs, que es la cáscara.
//
// POR QUÉ SEPARADO Y POR QUÉ PURO: un carácter corrido en este archivo no da un error de
// compilación ni un test rojo en otro lado — paga a otra cuenta o rebota el lote entero. La única
// forma de tener certeza es que cada regla sea una función que se pueda probar en frío contra un
// valor conocido. La evidencia que importa ya existe: los CBU que el banco ACEPTÓ en el lote de
// junio/julio 2026. Los tests los usan como caso de verdad.
//
// Fuente: guías «Pago de Haberes y Honorarios» y «Pago de Proveedores, Personalizados y Seguro»,
// Online Banking Cash Management (versión 2025 NOVIEMBRE), transcriptas el 10/09/2026.

/** Registros de longitud FIJA. No es un mínimo ni un máximo: si una línea no mide esto, el lote
 *  se rechaza entero (motivo R17, error de formato). */
export const LARGO_REGISTRO = 650

/** Fin de línea ASCII-DOS. El banco no acepta LF solo. */
export const CRLF = '\r\n'

/** Productos (TABLA 22). El FUR NO tiene un producto «AFON / Fondo de Cese»: por eso pagar el FCL
 *  por esta vía es un supuesto que sólo el banco puede confirmar (ver el resumen que emite el
 *  script). */
export const PRODUCTOS = Object.freeze({
  PROVEEDORES: '010', HABERES: '011', PERSONALIZADOS: '012', HONORARIOS: '013', SEGUROS: '016',
})

/** Layouts. `haberes` cubre 011/013; `proveedores` cubre 010/012. */
export const LAYOUT_HABERES = 'haberes'
export const LAYOUT_PROVEEDORES = 'proveedores'

/** Formas de pago (TABLA 2). 50 acredita en cuenta Santander — es la que corresponde al FCL,
 *  porque las cuentas AFON las abre el propio Santander a nombre del trabajador. */
export const FORMA_SANTANDER = '50'
export const FORMA_SNP = '52'
export const FORMA_CCI = '57'

/** Los únicos caracteres que el banco acepta (TABLA 1). Todo lo demás — acentos, diéresis,
 *  apóstrofes, «º», cualquier cosa fuera de ISO 8859-1 — hace fallar el archivo. */
const PERMITIDOS = /^[A-Za-zÑñ0-9 ¡!¿?(){}[\]<>".,;:/%\-_+*#=@&¦¢$]*$/

const ACENTOS = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u',
  â: 'a', ê: 'e', î: 'i', ô: 'o', û: 'u', ä: 'a', ë: 'e', ï: 'i', ö: 'o',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U', À: 'A', È: 'E', Ì: 'I', Ò: 'O', Ù: 'U',
  Â: 'A', Ê: 'E', Î: 'I', Ô: 'O', Û: 'U', Ä: 'A', Ë: 'E', Ï: 'I', Ö: 'O',
  ç: 'c', Ç: 'C', ª: 'a', º: 'o', '´': '', '’': '', '‘': '', "'": '', '`': '',
  '“': '"', '”': '"', '–': '-', '—': '-',
}

/**
 * Deja el texto en el alfabeto que el banco acepta.
 *
 * La Ñ SE CONSERVA a propósito: está en la tabla de permitidos y existe en ISO 8859-1. Pasarla a
 * N cambiaría el nombre del beneficiario contra el que el banco valida.
 *
 * Lo que no reconoce se reemplaza por espacio en vez de descartarse: perder un carácter corre
 * todo el resto del campo; un espacio conserva la longitud visual del nombre.
 */
export function transliterar(texto) {
  const s = String(texto ?? '')
  let out = ''
  for (const ch of s) {
    if (Object.hasOwn(ACENTOS, ch)) { out += ACENTOS[ch]; continue }
    out += PERMITIDOS.test(ch) ? ch : ' '
  }
  return out
}

/** Campo alfanumérico: transliterado, recortado a `long` y rellenado con ESPACIOS a la derecha. */
export function campoAlf(texto, long) {
  if (!Number.isInteger(long) || long <= 0) throw new Error(`campoAlf: longitud inválida ${long}`)
  return transliterar(texto).slice(0, long).padEnd(long, ' ')
}

/**
 * Campo numérico: rellenado con CEROS a la izquierda.
 *
 * `dec` son decimales IMPLÍCITOS (el archivo no lleva separador): 1379455.92 con dec=2 sale
 * «000000137945592». La conversión pasa por `toFixed` y no por `× 100`, porque el importe llega
 * de una planilla en punto flotante — 60940.799999999996 × 100 da 6094079.999… y truncar ahí
 * roba un centavo por trabajador. `toFixed(2)` redondea primero y recién después se saca el punto.
 *
 * Un valor que no entra en `long` NO se recorta: tira. Un importe recortado es plata mal pagada.
 */
export function campoNum(valor, long, dec = 0) {
  if (!Number.isInteger(long) || long <= 0) throw new Error(`campoNum: longitud inválida ${long}`)
  let crudo
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new Error(`campoNum: valor no finito ${valor}`)
    if (valor < 0) throw new Error(`campoNum: el archivo no lleva signo, y llegó ${valor}`)
    crudo = valor.toFixed(dec).replace('.', '')
  } else {
    crudo = String(valor ?? '').trim()
    if (dec > 0 && crudo.includes('.')) crudo = Number(crudo).toFixed(dec).replace('.', '')
    if (!/^\d*$/.test(crudo)) throw new Error(`campoNum: «${valor}» no es numérico`)
  }
  crudo = crudo.replace(/^0+(?=\d)/, '')
  if (crudo.length > long) throw new Error(`campoNum: «${valor}» no entra en ${long} posiciones`)
  return crudo.padStart(long, '0')
}

/** Suma ponderada módulo 10 — el esquema de DV que usan los dos bloques del CBU. */
function dvModulo10(digitos, pesos) {
  let suma = 0
  for (let i = 0; i < digitos.length; i++) suma += Number(digitos[i]) * pesos[i % pesos.length]
  return (10 - (suma % 10)) % 10
}

/**
 * ¿Es un CBU válido? Verifica los DOS dígitos verificadores, no sólo la longitud.
 *
 * POR QUÉ IMPORTA, MEDIDO: el 14/04/2026 el depósito de FCL de RETA se rechazó con «CUENTA NO
 * EXISTE» porque el Excel llevaba un CBU «muy parecido pero incorrecto». Un CBU con DV válido no
 * garantiza que la cuenta exista, pero un DV inválido garantiza que NO.
 *
 * Bloque 1 (8): entidad(3) + sucursal(4) + DV. Pesos 7,1,3,9 cíclicos.
 * Bloque 2 (14): 13 dígitos + DV. Pesos 3,9,7,1 cíclicos.
 */
export function cbuValido(cbu) {
  const s = String(cbu ?? '').replace(/\D/g, '')
  if (s.length !== 22) return false
  const b1 = s.slice(0, 8), b2 = s.slice(8)
  return dvModulo10(b1.slice(0, 7), [7, 1, 3, 9]) === Number(b1[7])
    && dvModulo10(b2.slice(0, 13), [3, 9, 7, 1]) === Number(b2[13])
}

/**
 * CBU de 22 a las 26 posiciones del registro (TABLA 14).
 *
 * No es un padding: el banco intercala un «0» fijo adelante y «000» entre los dos bloques. Meter
 * los 22 dígitos crudos y rellenar con ceros al final corre la cuenta cuatro lugares.
 */
export function cbuA26(cbu22) {
  const s = String(cbu22 ?? '').replace(/\D/g, '')
  if (s.length !== 22) throw new Error(`cbuA26: se esperaban 22 dígitos y llegaron ${s.length}`)
  if (!cbuValido(s)) throw new Error(`cbuA26: dígito verificador inválido en ${s}`)
  return `0${s.slice(0, 8)}000${s.slice(8)}`
}

/** CUIT/CUIL con DV válido (módulo 11, pesos 5,4,3,2,7,6,5,4,3,2). */
export function cuitValido(cuit) {
  const s = String(cuit ?? '').replace(/\D/g, '')
  if (s.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  let suma = 0
  for (let i = 0; i < 10; i++) suma += Number(s[i]) * pesos[i]
  const resto = suma % 11
  const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto
  return dv === Number(s[10])
}

/**
 * Código de Organismo / Número de Acuerdo: 17 posiciones que el header lleva en 002-018.
 *
 * `acuerdo` lo informa el BANCO. Cuando no se conoce se pasa '??' a propósito: el archivo se
 * genera igual para poder revisarlo, pero `validarArchivo` lo rechaza porque ese campo es
 * numérico. Un archivo que no puede subirse tiene que probarlo solo, no confiar en que alguien
 * lea la advertencia.
 */
export function codigoOrganismo({ cuit, producto, acuerdo }) {
  const c = String(cuit ?? '').replace(/\D/g, '')
  if (c.length !== 11) throw new Error(`codigoOrganismo: CUIT de ${c.length} dígitos`)
  const p = String(producto ?? '')
  if (!/^\d{3}$/.test(p)) throw new Error(`codigoOrganismo: producto «${producto}» no son 3 dígitos`)
  const a = String(acuerdo ?? '')
  if (a.length !== 2) throw new Error(`codigoOrganismo: acuerdo «${acuerdo}» no son 2 posiciones`)
  return `${c}0${p}${a}`
}

/** Header (H). Los dos layouts comparten las primeras 31 posiciones y difieren en 032-038. */
export function registroHeader({
  cuit, producto, acuerdo, canal = '007', envio = 1, validarCuil = 'S',
  layout = LAYOUT_HABERES, concepto = '',
}) {
  const cabeza = 'H' + codigoOrganismo({ cuit, producto, acuerdo })
    + campoNum(canal, 3) + campoNum(envio, 5) + campoNum(0, 5)
  const medio = layout === LAYOUT_PROVEEDORES
    ? campoAlf('', 2) + campoAlf(concepto, 5)
    : campoAlf('', 7)
  const linea = cabeza + medio + campoAlf(validarCuil || ' ', 1) + campoAlf('', 611)
  return exigirLargo(linea, 'header')
}

/**
 * Detalle (D) de Haberes/Honorarios (011/013).
 *
 * `periodo` va como AAAAMM en un campo NUMÉRICO de 15 — es el «número de comprobante» del tipo
 * RC, no una fecha: «202608» sale «000000000202608».
 */
export function detalleHaberes({
  beneficiario, nombre, cuil, cbu, importe, periodo, fechaPago,
  formaPago = FORMA_SANTANDER, direccion = '', email = '',
}) {
  const linea = 'D' + campoAlf('', 1) + campoNum(0, 1)
    + campoAlf(beneficiario, 15) + campoAlf('RC', 2) + campoNum(periodo, 15) + campoNum(0, 4)
    + campoAlf(nombre, 30) + campoAlf(direccion, 51) + campoNum(0, 5) + campoAlf('', 3)
    + campoAlf(email ? 'S' : '', 1) + campoAlf(email, 90) + campoAlf('', 4)
    + campoNum(String(cuil).replace(/\D/g, ''), 11) + campoAlf('', 162)
    + campoAlf('N', 1) + campoNum('0054', 4) + cbuA26(cbu)
    + campoNum(0, 8) + campoNum(fechaPago, 8) + campoNum(importe, 15, 2) + campoNum(formaPago, 2)
    + campoAlf('', 3) + campoNum(0, 11) + campoAlf('', 3) + campoNum(0, 11)
    + campoAlf('', 3) + campoNum(0, 11) + campoAlf('', 3) + campoNum(0, 25)
    + campoAlf('', 1) + campoNum(0, 17) + campoAlf('', 102)
  return exigirLargo(linea, 'detalle haberes')
}

/**
 * Detalle (D) de Proveedores/Personalizados (010/012).
 *
 * Diferencias que importan contra el de haberes: el número de comprobante es ALFANUMÉRICO, hay
 * tipo y sucursal de distribución («001» para toda forma de pago electrónica), la fecha de emisión
 * ocupa 428-435 (en haberes son ceros) y el número de liquidación de 506-524 es obligatorio.
 */
export function detalleProveedores({
  beneficiario, nombre, cuit, cbu, importe, comprobante = '', tipoComprobante = 'OP',
  fechaPago, fechaEmision, formaPago = FORMA_SANTANDER, direccion = '', localidad = '',
  codigoPostal = 0, email = '', liquidacion = 0, libre1 = '', libre2 = '', libre3 = '',
}) {
  const linea = 'D' + campoAlf('', 1) + campoNum(0, 1)
    + campoAlf(beneficiario, 15) + campoAlf(tipoComprobante, 2) + campoAlf(comprobante, 15)
    + campoNum(0, 4) + campoAlf(nombre, 30) + campoAlf(direccion, 30) + campoAlf(localidad, 20)
    + campoAlf('', 1) + campoNum(codigoPostal, 5) + campoAlf('', 3)
    + campoAlf(email ? 'S' : '', 1) + campoAlf(email, 90) + campoAlf('', 4)
    + campoNum(String(cuit).replace(/\D/g, ''), 11) + campoAlf('', 45)
    + campoAlf(libre1, 18) + campoAlf(libre2, 15) + campoAlf(libre3, 15) + campoAlf('', 60)
    + campoAlf('001', 3) + campoAlf('001', 3) + campoAlf('', 3)
    + campoAlf('N', 1) + campoNum('0054', 4) + cbuA26(cbu)
    + campoNum(fechaEmision || fechaPago, 8) + campoNum(fechaPago, 8)
    + campoNum(importe, 15, 2) + campoNum(formaPago, 2)
    + campoAlf('', 3) + campoNum(0, 11) + campoAlf('', 3) + campoNum(0, 11)
    + campoAlf('', 3) + campoNum(0, 11) + campoAlf('', 3)
    + campoNum(liquidacion, 19) + campoNum(0, 1) + campoNum(0, 3) + campoNum(0, 2)
    + campoAlf('', 1) + campoAlf('', 60) + campoAlf('', 36) + campoAlf('', 23)
  return exigirLargo(linea, 'detalle proveedores')
}

export function registroDetalle(pago, { layout = LAYOUT_HABERES } = {}) {
  return layout === LAYOUT_PROVEEDORES ? detalleProveedores(pago) : detalleHaberes(pago)
}

/**
 * Trailer (T). El banco NO suma los detalles: compara contra lo que declara la empresa, y una
 * diferencia rechaza el lote entero (motivo R37). Por eso `armarArchivo` lo calcula del mismo
 * texto que ya escribió, no de los objetos de entrada.
 */
export function registroTrailer({ total, cantidad }) {
  const linea = 'T' + campoNum(0, 15) + campoNum(total, 15, 2) + campoNum(cantidad, 7)
    + campoAlf('', 612)
  return exigirLargo(linea, 'trailer')
}

function exigirLargo(linea, que) {
  if (linea.length !== LARGO_REGISTRO) {
    throw new Error(`${que}: el registro mide ${linea.length} y tiene que medir ${LARGO_REGISTRO}`)
  }
  return linea
}

/**
 * Arma el archivo completo (Modelo 1: H · D… · T) y devuelve el texto con CRLF.
 *
 * El total del trailer se relee de las posiciones 444-458 de los detalles YA ESCRITOS. Sumar los
 * `importe` de la entrada validaría el trailer contra la misma información que produjo los
 * detalles: si `campoNum` redondeara mal, los dos lados mentirían igual y el control diría verde.
 */
export function armarArchivo({
  cuit, producto, acuerdo, envio = 1, canal = '007', validarCuil = 'S',
  layout = LAYOUT_HABERES, concepto = '', pagos = [],
}) {
  if (!Array.isArray(pagos) || pagos.length === 0) {
    throw new Error('armarArchivo: no hay ningún pago que informar')
  }
  const lineas = [registroHeader({ cuit, producto, acuerdo, canal, envio, validarCuil, layout, concepto })]
  for (const p of pagos) lineas.push(registroDetalle(p, { layout }))
  const centavos = lineas.slice(1)
    .reduce((acc, l) => acc + BigInt(l.slice(443, 458)), 0n)
  lineas.push(registroTrailer({ total: String(centavos), cantidad: pagos.length }))
  return lineas.join(CRLF) + CRLF
}

/**
 * Verifica un archivo ya armado, mirando SÓLO el texto.
 *
 * Es el control que puede decir que no: recibe el string y no sabe de dónde salió. Las posiciones
 * que revisa (CUIT/CUIL 224-234, CBU 402-427, importe 444-458) son las mismas en los dos layouts,
 * así que no necesita que le digan cuál es — y no puede equivocarse de layout.
 */
export function validarArchivo(texto) {
  const errores = []
  const lineas = String(texto ?? '').split(CRLF).filter((l, i, a) => !(l === '' && i === a.length - 1))
  if (lineas.length < 3) errores.push('el archivo no llega a tener H + un detalle + T')

  lineas.forEach((l, i) => {
    if (l.length !== LARGO_REGISTRO) errores.push(`línea ${i + 1}: mide ${l.length}, no ${LARGO_REGISTRO}`)
    if (!PERMITIDOS.test(l)) {
      const malos = [...new Set([...l].filter((c) => !PERMITIDOS.test(c)))].join('')
      errores.push(`línea ${i + 1}: caracteres que el banco no acepta «${malos}»`)
    }
  })

  const h = lineas[0] ?? ''
  if (h[0] !== 'H') errores.push('la primera línea no es el header (H)')
  else if (!/^\d{17}$/.test(h.slice(1, 18))) {
    errores.push('header: el Número de Acuerdo (002-018) no es numérico — el archivo NO se puede subir')
  }

  const detalles = lineas.filter((l) => l[0] === 'D')
  let suma = 0n
  for (const [i, l] of detalles.entries()) {
    const cuil = l.slice(223, 234)
    if (!cuitValido(cuil)) errores.push(`detalle ${i + 1}: CUIT/CUIL «${cuil}» con dígito verificador inválido`)
    const cbu26 = l.slice(401, 427)
    const cbu22 = cbu26.slice(1, 9) + cbu26.slice(12)
    if (cbu26[0] !== '0' || cbu26.slice(9, 12) !== '000' || !cbuValido(cbu22)) {
      errores.push(`detalle ${i + 1}: CBU «${cbu26}» mal formado o con dígito verificador inválido`)
    }
    const imp = l.slice(443, 458)
    if (!/^\d{15}$/.test(imp)) errores.push(`detalle ${i + 1}: importe no numérico`)
    else if (BigInt(imp) === 0n) errores.push(`detalle ${i + 1}: importe en cero`)
    else suma += BigInt(imp)
  }

  const t = lineas.at(-1) ?? ''
  if (t[0] !== 'T') errores.push('la última línea no es el trailer (T)')
  else {
    const declarado = t.slice(16, 31)
    const cant = t.slice(31, 38)
    if (BigInt(declarado || '0') !== suma) {
      errores.push(`trailer: declara ${declarado} y los detalles suman ${String(suma).padStart(15, '0')}`)
    }
    if (Number(cant) !== detalles.length) {
      errores.push(`trailer: declara ${Number(cant)} detalles y hay ${detalles.length}`)
    }
  }

  return {
    ok: errores.length === 0,
    errores,
    cantidad: detalles.length,
    totalCentavos: String(suma),
    total: Number(suma) / 100,
  }
}
