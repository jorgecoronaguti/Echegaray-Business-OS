// UN COMPROBANTE LEÍDO → el objeto que el cargador ya sabe escribir. NÚCLEO PURO.
//
// ═══ QUÉ RESUELVE ═══
//
// El dueño saca una foto y la manda al canal. Entre esa foto y la fila de "Compras" hay una sola
// pregunta difícil: **qué números son cuáles**. Todo lo demás ya existe —el contrato de columnas
// (`lib/carga-comprobantes.mjs`) y el cargador (`scripts/cargar-comprobantes-compras.mjs`)— y no se
// reescribe acá.
//
// ═══ LAS DOS REGLAS DURAS DEL REPO, Y POR QUÉ VIVEN EN ESTE ARCHIVO ═══
//
// 1. **M = Total − IVA.** No la aplica este archivo: la aplica `valoresInput`. Lo que sí es
//    responsabilidad de acá es GARANTIZAR QUE EL TOTAL VIAJE. Si el total no llega, `valoresInput`
//    cae al neto crudo del comprobante y la percepción de IIBB/SUSS —o el impuesto interno del
//    combustible— queda afuera del Total del Sheet. Esa es, textual, la carga MAL hecha que este
//    repo ya pagó. Por eso `normalizar` rechaza un comprobante sin total.
//
// 2. **UNA NOTA DE CRÉDITO VA CON SIGNO NEGATIVO.** Contarlas como compras costó $41,9M de error y
//    $7,2M de IVA sin declarar. El signo se aplica ACÁ, sobre los importes leídos, y no en
//    `valoresInput`: así el cargador de línea de comandos —que recibe fajos armados a mano y tiene
//    sus propios tests— sigue comportándose exactamente igual que antes. Un comprobante que sale de
//    este archivo ya trae el signo puesto, venga por el chat o por donde sea.
//
// ═══ ACÁ NO HAY MODELO ═══
//
// La llamada de visión vive en `vision.mjs`, al lado. Están separados a propósito y hay un test que
// lo hace cumplir: la clave de idempotencia, el signo, la obra y la validación las usan la puerta,
// el agrupado y la escritura, y ninguno de esos caminos puede terminar arrastrando el cliente de un
// modelo por un import. Un modelo en un camino que tiene que ser determinístico es lo más grave que
// puede pasar en este subsistema.
//
// ═══ LO QUE NO HACE ═══
//
// No inventa. Si la foto no dice la obra, `obra` queda en null y alguien la pregunta. Si el emisor
// no está en el desplegable estricto, se marca y se pregunta. Un dato que el papel no muestra no
// existe: es la regla de oro #1 del OS.

import { aNumero, redondear2, normalizar } from '../carga-comprobantes.mjs'

/** Formatos que un modelo de visión puede mirar. Cualquier otro se rechaza ANTES de gastar nada. */
export const MEDIA_SOPORTADOS = Object.freeze([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
])

/** Techo de tamaño por adjunto. Arriba de esto la API rechaza y no vale la pena intentarlo. */
export const MAX_BYTES_ADJUNTO = 5 * 1024 * 1024

/** Sólo dígitos. Un CUIT con guiones y uno sin guiones son el mismo CUIT. */
export function soloDigitos(v) {
  return String(v ?? '').replace(/\D/g, '')
}

/**
 * Número de comprobante canónico: `PPPP-NNNNNNNN`.
 *
 * POR QUÉ NORMALIZAR. La misma factura se lee "0113-00010489", "113-10489" y "0113 00010489" según
 * cómo salga la foto. Si la clave de idempotencia se armara con el texto crudo, el mismo comprobante
 * mandado dos veces entraría dos veces — que es exactamente lo que hay que impedir. Devuelve null si
 * no hay dígitos: sin número no hay clave, y eso se trata aparte.
 */
export function numeroCanonico(v) {
  const s = String(v ?? '').trim()
  if (!s) return null
  const m = s.match(/(\d{1,5})\s*[-–/ ]\s*(\d{1,10})/)
  if (m) return `${m[1].padStart(4, '0')}-${m[2].padStart(8, '0')}`
  const d = soloDigitos(s)
  if (!d) return null
  // Sin separador: los últimos 8 dígitos son el correlativo y lo de adelante, el punto de venta.
  if (d.length > 8) return `${d.slice(0, d.length - 8).padStart(4, '0')}-${d.slice(-8)}`
  return `0000-${d.padStart(8, '0')}`
}

/**
 * Letra del comprobante → el valor que espera el desplegable G, vía `tipoComprobante`.
 * Una nota de crédito es 'NC' cualquiera sea su letra: el desplegable tiene un solo "N C".
 */
export function tipoDesdeLectura({ letra, esNotaCredito } = {}) {
  if (esNotaCredito) return 'NC'
  const s = String(letra ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  if (!s) return null
  if (/NOTA\s*(DE\s*)?CREDITO|^N\s*\/?\s*C$|^NC/.test(s)) return 'NC'
  // Se saca la palabra del comprobante y queda la letra. Filtrar por caracteres ("quedate con las
  // A, B y C") parece equivalente y no lo es: sobre "FACTURA B" deja "ACAB" y devuelve una A. El
  // test lo agarró antes de que un gasto quedara con el tipo de comprobante equivocado.
  const limpio = s.replace(/FACTURAS?|FACT|FAC|COMPROBANTE|TICKET|\bF\b/g, ' ').trim()
  const m = limpio.match(/\b([ABC])\b/)
  return m ? m[1] : null
}

/**
 * OBRA desde la anotación manuscrita, contra la lista ESTRICTA del desplegable J.
 *
 * NO INFIERE NADA. "Estrella" escrito a mano matchea la obra "Estrella" del desplegable; un
 * comprobante sin anotación devuelve null y el bot pregunta. Inferir la obra por el proveedor o por
 * la fecha sería fabricar imputación contable, que es la peor forma de fabricar un dato: no se nota
 * hasta que el margen de la obra está mal.
 *
 * @param {string|null} anotacion  lo que el modelo transcribió, tal cual
 * @param {string[]} obras         valores exactos del desplegable estricto
 * @returns {{valor:string, via:string}|null}
 */
export function obraDeAnotacion(anotacion, obras = []) {
  const a = normalizar(anotacion)
  if (!a || !Array.isArray(obras) || !obras.length) return null
  const exacta = obras.find((o) => normalizar(o) === a)
  if (exacta) return { valor: exacta, via: 'exacta' }
  // Contención en los dos sentidos: la anotación puede decir menos ("Estrella") o más
  // ("obra Estrella 2do piso") que el rótulo del desplegable.
  const candidatas = obras.filter((o) => {
    const n = normalizar(o)
    return n.length >= 4 && (a.includes(n) || n.includes(a))
  })
  // AMBIGUA = NO RESUELTA. Si la anotación matchea dos obras, elegir una es tirar una moneda
  // sobre a qué obra se le carga el costo. Se devuelve null y se pregunta.
  return candidatas.length === 1 ? { valor: candidatas[0], via: 'parcial' } : null
}

/**
 * Clave de idempotencia de un comprobante: **(CUIT emisor, tipo, número)**.
 *
 * Es una sola cadena y NO una tupla de columnas anulables a propósito. En este repo ya vivió un
 * índice único sobre 206 NULLs sin restringir nada: con `cuit` nulo, `unique (cuit,tipo,numero)` deja
 * entrar el mismo comprobante infinitas veces. Acá la columna es TEXT NOT NULL y el único que decide
 * su forma es esta función.
 *
 * Si no hay CUIT (un ticket que no lo imprime), se degrada al nombre del proveedor normalizado y se
 * DECLARA en el prefijo: `p:` es una clave más débil y quien la lea tiene que saberlo.
 *
 * @returns {{clave:string, fuerte:boolean}|null}  null = no hay con qué deduplicar
 */
export function claveComprobante({ cuit, tipo, numero, proveedor } = {}) {
  const n = numeroCanonico(numero)
  const t = String(tipo ?? '').toUpperCase().replace(/\s+/g, '') || null
  if (!n || !t) return null
  const c = soloDigitos(cuit)
  if (c.length === 11) return { clave: `c:${c}|${t}|${n}`, fuerte: true }
  const p = normalizar(proveedor)
  if (!p) return null
  return { clave: `p:${p}|${t}|${n}`, fuerte: false }
}

/** Problemas que impiden ARMAR el comprobante. Distintos de los de `validar` del cargador. */
export const FALTA = Object.freeze({
  TOTAL: 'total',
  FECHA: 'fecha',
  PROVEEDOR: 'proveedor',
  NUMERO: 'numero',
  ILEGIBLE: 'ilegible',
})

/**
 * Lectura cruda del modelo → comprobante normalizado, **con el signo ya aplicado**.
 *
 * Lo que devuelve entra tal cual a `valoresInput` del contrato de columnas. Los importes salen como
 * NÚMEROS (no como texto es-AR) porque el signo hay que poder aplicarlo, y multiplicar un string por
 * −1 es cómo se fabrica un NaN silencioso.
 *
 * @param {object} crudo  el JSON que devolvió el modelo
 * @returns {{comprobante:object, faltantes:string[], dudas:string[]}}
 */
export function normalizar_lectura(crudo = {}) {
  const esNC = crudo.es_nota_credito === true
  const signo = esNC ? -1 : 1
  const con = (v) => { const n = aNumero(v); return n == null ? null : redondear2(Math.abs(n) * signo) }

  const iva21 = con(crudo.iva_21) ?? 0
  const iva105 = con(crudo.iva_105) ?? 0
  // El IVA que va a la columna N es la SUMA de las alícuotas. Se leen por separado igual, y viajan
  // en `detalle`, porque controlar contra ARCA exige saber cuánto salió a cada alícuota.
  const iva = redondear2(iva21 + iva105)
  const total = con(crudo.total)
  const neto = con(crudo.neto_gravado)
  const otros = con(crudo.otros_tributos) ?? 0

  const proveedor = String(crudo.emisor ?? '').trim() || null
  const cuit = soloDigitos(crudo.cuit)
  const tipo = tipoDesdeLectura({ letra: crudo.letra, esNotaCredito: esNC })
  const numero = numeroCanonico(crudo.numero)
  const fecha = fechaDeLectura(crudo.fecha)

  const faltantes = []
  if (crudo.legible === false) faltantes.push(FALTA.ILEGIBLE)
  if (total == null) faltantes.push(FALTA.TOTAL)
  if (!fecha) faltantes.push(FALTA.FECHA)
  if (!proveedor) faltantes.push(FALTA.PROVEEDOR)
  if (!numero) faltantes.push(FALTA.NUMERO)

  return {
    comprobante: {
      proveedor,
      cuit: cuit.length === 11 ? cuit : null,
      tipo,
      esNotaCredito: esNC,
      numero,
      fecha,
      // `neto` va informativo: `valoresInput` DERIVA M = total − iva cuando hay total, y ese es el
      // camino correcto. Se conserva para poder mostrar la discrepancia (la percepción absorbida).
      neto,
      iva: iva === 0 ? null : iva,
      total,
      otrosTributos: otros === 0 ? null : otros,
      condicion: textoODefault(crudo.condicion_venta),
      formaPago: textoODefault(crudo.forma_pago),
      concepto: textoODefault(crudo.concepto),
      anotacion: textoODefault(crudo.anotacion_manuscrita),
      detalle: { iva21: iva21 || null, iva105: iva105 || null },
    },
    faltantes,
    dudas: Array.isArray(crudo.dudas) ? crudo.dudas.map((d) => String(d).slice(0, 160)).slice(0, 5) : [],
  }
}

/** Alias en camelCase, que es como se escribe el resto del repo. */
export const normalizarLectura = normalizar_lectura

function textoODefault(v) {
  const s = String(v ?? '').trim()
  return s && !/^(null|n\/a|-|—)$/i.test(s) ? s : null
}

/** Fecha del comprobante → DD/MM/AAAA, o null. Un año de dos dígitos se completa a 20xx. */
export function fechaDeLectura(v) {
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    const d = Number(m[1]); const mes = Number(m[2])
    if (d < 1 || d > 31 || mes < 1 || mes > 12) return null
    return `${String(d).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${y}`
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}`
  return null
}

