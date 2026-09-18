// DOS FOTOS DEL MISMO PAPEL QUE SE LEEN DISTINTO: GANA LA QUE SE LEYÓ MEJOR.
// NÚCLEO PURO, CERO MODELO Y CERO RED.
//
// ═══ EL DEFECTO, MEDIDO SOBRE LOS FAJOS REALES DEL 13 Y 14/08 ═══
//
// El dueño mandó la misma tanda de siete fotos varias veces: primero los `.jpg` que exportó a mano y
// después los `.HEIC` originales del iPhone. Son archivos distintos —otro `fileId`, otros bytes— pero
// **el mismo papel**. Y el modelo de visión no leyó lo mismo las dos veces:
//
//   | papel      | una lectura                    | la otra                        | la verdad (ARCA/Compras) |
//   |------------|--------------------------------|--------------------------------|--------------------------|
//   | IMG_7573   | `0001-00002807` $220.540.034   | `0038-00002807` $2.205.400,34  | la segunda               |
//   | IMG_7574   | `00016-00029784` AXION         | `00016-00029754` CLAVERO       | pv 16, nro 29784         |
//   | IMG_7572   | `0015-00015751`                | `0001-00015751`                | la segunda (fila 841)    |
//
// Como la clave de idempotencia sale del número, dos lecturas distintas del mismo papel producen dos
// ítems distintos: uno se cargó y **el otro quedó trabado en el fajo abierto**. Al 14/08 ese fajo
// tenía adentro un Trielec de $220.540.034 cuyo gemelo real ($2.205.400,34) ya estaba en la fila 844:
// a un click de duplicar el gasto por CIEN VECES su valor.
//
// ═══ LA REGLA ═══
//
// **Dos ítems son el mismo papel si vinieron del mismo archivo de origen y además lo que se leyó de
// los dos coincide en algo verificable.** El nombre solo no alcanza —dos papeles distintos pueden
// llamarse `image.jpg`— y las señales solas tampoco —dos facturas del mismo proveedor por el mismo
// importe existen—. Hacen falta las dos cosas.
//
// Y EL VETO, que es lo que impide perder un gasto: si las dos lecturas tienen fecha, total y
// correlativo, y **los tres difieren**, no son el mismo papel por más que el archivo se llame igual.
// Ahí no se une nada. Unir dos gastos distintos es el error caro de este archivo, y por eso la duda
// se resuelve SIEMPRE en contra de unir.
//
// ═══ Y CUÁL DE LAS DOS GANA ═══
//
// La que se puede cargar. Después, la que ARCA verificó. Después, la que más lecturas independientes
// respaldaron. Recién al final, la primera. Ninguno de los criterios mira la foto: todos miran
// evidencia que ya está sobre la mesa cuando se decide.

import { faltantesDe, POLITICA } from './faltantes.mjs'
import { soloDigitos, numeroCanonico, claseDeComprobante } from './lectura.mjs'
import { identidadProveedor } from './compras-vivas.mjs'
import { normalizar } from '../carga-comprobantes.mjs'

/**
 * El nombre del archivo sin su extensión, en minúsculas. `IMG_7573.HEIC` y `IMG_7573.jpg` son la
 * misma foto exportada dos veces: es la identidad que le pone la cámara al papel, y es la única que
 * sobrevive a que el modelo lea distinto.
 */
export function nombreBase(nombre) {
  const s = String(nombre ?? '').trim().toLowerCase()
  if (!s) return null
  return s.replace(/\.[a-z0-9]{1,5}$/, '') || null
}

/** Todos los nombres base con los que entró un ítem: el suyo y el de sus copias. */
export function basesDe(item = {}) {
  const l = [nombreBase(item?.origen?.nombre)]
  for (const c of item?.copias ?? []) l.push(nombreBase(c?.nombre))
  return new Set(l.filter(Boolean))
}

/** Los 8 dígitos del correlativo, que es lo que NO cambia cuando el OCR se come el punto de venta. */
export function correlativoDe(c = {}) {
  const n = numeroCanonico(c?.numero)
  return n ? n.slice(-8) : null
}

const cuitDe = (c) => { const d = soloDigitos(c?.cuit); return d.length === 11 ? d : null }
const totalDe = (c) => (typeof c?.total === 'number' && Number.isFinite(c.total) ? Math.round(Math.abs(c.total) * 100) : null)
const pvDe = (c) => { const n = numeroCanonico(c?.numero); return n ? n.slice(0, 4) : null }

/**
 * Qué comparten dos lecturas. Se cuentan aparte las señales FUERTES (identifican un comprobante) de
 * las DÉBILES (lo hacen probable), porque no valen lo mismo y la regla las pesa distinto.
 */
export function senalesCompartidas(a = {}, b = {}) {
  const x = a?.comprobante ?? {}
  const y = b?.comprobante ?? {}
  const igual = (f) => { const u = f(x); const v = f(y); return u != null && v != null && u === v }
  const fuertes = []
  if (igual(cuitDe)) fuertes.push('cuit')
  if (igual((c) => (soloDigitos(c?.cae).length === 14 ? soloDigitos(c.cae) : null))) fuertes.push('cae')
  if (igual(correlativoDe)) fuertes.push('correlativo')
  if (igual(totalDe)) fuertes.push('total')
  const debiles = []
  if (igual((c) => normalizar(c?.proveedor) || null)) debiles.push('proveedor')
  if (igual(pvDe)) debiles.push('punto de venta')
  if (igual((c) => c?.fecha ?? null)) debiles.push('fecha')
  return { fuertes, debiles }
}

/**
 * EL VETO. Los tres datos duros presentes en las dos lecturas y los tres distintos ⇒ son dos papeles.
 *
 * Es el que impide que un `image.jpg` mandado dos veces por dos comprobantes distintos se fusione y
 * uno de los dos desaparezca. Una foto que quedó afuera se ve y se vuelve a mandar; un gasto que se
 * fusionó con otro no se ve nunca más.
 */
export function sonPapelesDistintos(a = {}, b = {}) {
  const x = a?.comprobante ?? {}
  const y = b?.comprobante ?? {}
  const difiere = (f) => { const u = f(x); const v = f(y); return u != null && v != null && u !== v }
  return difiere(totalDe) && difiere((c) => c?.fecha ?? null) && difiere(correlativoDe)
}

// ═══ DOS FOTOS DEL MISMO TICKET, EN ARCHIVOS DISTINTOS Y SIN CUIT LEGIBLE (18/09/2026) ═══
//
// EL AGUJERO, y es plata que entra dos veces. `colapsarRepetidos` une por `claveComprobante`, que
// sin CUIT se degrada a `p:<proveedor normalizado>|<n°>`. Si el mismo ticket se fotografía dos veces
// y el modelo lee el nombre distinto —«NEUMAGOM S.A.S.» contra «Neumagom»— las dos claves difieren,
// no se colapsan, y como la pestaña todavía no tiene escrita la primera fila, la barrera de
// duplicados entre corridas tampoco puede frenar a la segunda: entran DOS gastos.
//
// `mismoPapel` (abajo) no lo cubre: exige que las dos lecturas compartan el ARCHIVO base, y acá son
// dos fotos distintas (`IMG_001` y `IMG_002`). Hasta el 18/09 esto lo tapaba, sin querer, que ARCA
// le pegara el CUIT al comprobante: las dos lecturas terminaban con el mismo CUIT y la misma clave
// fuerte. Ese pegado se sacó —le ponía al comprobante el CUIT de OTRA empresa cuando la vía era
// débil— y al sacarlo quedó este hueco a la vista.
//
// ═══ LA CLAVE SECUNDARIA, ELEGIDA CON LA MEDICIÓN ═══
//
// Medido sobre las 980 filas de Compras (18/09):
//   · (número, fecha, total) iguales con proveedor DISTINTO → **0 casos**. Es una huella segura.
//   · (fecha, total) SIN el número → 42 repetidos, y 5 de ellos son de proveedores distintos:
//     «SERVICIOS TALLER» vs «Lucas Guzman», «ARCA» vs «Sueldos», «Banco» vs «Sueldos»… todos sin
//     número. O sea: sacar el número de la huella uniría gastos que no tienen nada que ver.
//
// Por eso la huella EXIGE número, y por eso lleva además la clase (`F`/`NC`/`ND`): una nota de
// crédito comparte numeración con su factura y confundirlas ya costó $41,9M.
//
// Y pide que los proveedores sean COMPATIBLES con la misma tolerancia que usa la búsqueda contra la
// pestaña (`identidadProveedor`: iguales, uno vacío, o subcadena de 4+). Es la guarda contra el
// riesgo espejo —dos proveedores realmente distintos que casualmente compartan número, fecha e
// importe—: hoy no hay ninguno, pero cuesta nada y es lo único que separa «el mismo papel leído
// distinto» de «dos papeles que se parecen».

/** La huella de papel de un comprobante: clase, número, fecha y total. `null` si falta alguno. */
export function huellaDePapel(c = {}) {
  const numero = numeroCanonico(c?.numero)
  const total = totalDe(c)
  const fecha = c?.fecha ?? null
  if (!numero || !fecha || total == null) return null
  return `${claseDeComprobante(c)}|${numero}|${fecha}|${total}`
}

/**
 * ¿Son el MISMO comprobante aunque sus claves no coincidan? Para dos fotos del mismo ticket cuyo
 * nombre de proveedor se leyó distinto y sin CUIT que las una.
 *
 * NO reemplaza a la clave: sólo une lo que la clave dejó separado, y sólo con la huella completa.
 *
 * @returns {{si:boolean, porque:string|null}}
 */
export function mismoComprobanteAunqueElNombreCambie(a = {}, b = {}) {
  const x = a?.comprobante ?? {}
  const y = b?.comprobante ?? {}
  const h = huellaDePapel(x)
  if (!h || h !== huellaDePapel(y)) return { si: false, porque: null }
  // `identidadProveedor` compara primero por CUIT: dos CUIT distintos son dos proveedores distintos
  // y ahí no se une nada, por más que el número, la fecha y el total coincidan.
  if (identidadProveedor(x, { cuit: y.cuit, proveedor: y.proveedor }) === 'distinto') return { si: false, porque: null }
  return { si: true, porque: `mismo comprobante ${numeroCanonico(x.numero)}, misma fecha y mismo total` }
}

/**
 * ¿Estos dos ítems son el mismo papel fotografiado dos veces?
 *
 * @returns {{si:boolean, porque:string|null}}
 */
export function mismoPapel(a = {}, b = {}) {
  const basesA = basesDe(a)
  const compartida = [...basesDe(b)].some((n) => basesA.has(n))
  if (!compartida) return { si: false, porque: null }
  if (sonPapelesDistintos(a, b)) return { si: false, porque: null }
  const { fuertes, debiles } = senalesCompartidas(a, b)
  if (fuertes.length >= 1) return { si: true, porque: `mismo archivo y mismo ${fuertes[0]}` }
  if (debiles.length >= 2) return { si: true, porque: `mismo archivo, mismo ${debiles[0]} y misma ${debiles[1]}` }
  return { si: false, porque: null }
}

/** Cuántos datos duros trajo esta lectura. Empata poco y desempata bien. */
export function camposDuros(item = {}) {
  const c = item?.comprobante ?? {}
  let n = 0
  for (const v of [c.cae, c.cuit, c.numero, c.fecha, c.total, c.neto, c.iva, c.obra, c.detalleObra, c.concepto]) {
    if (v != null && v !== '') n++
  }
  return n
}

/**
 * La calidad de una lectura, en el orden en que se decide. Más alto es mejor.
 *
 * `votos` lo pone quien agrupa: cuántas lecturas independientes dijeron exactamente lo mismo. Dos
 * pasadas del modelo que coinciden es evidencia de verdad, y es gratis: ya se leyeron.
 */
export function calidadDeLectura(item = {}, { votos = 1, ahora } = {}) {
  return {
    cargable: faltantesDe(item, POLITICA.CHAT, ahora ? { ahora } : {}).length === 0 ? 1 : 0,
    arca: item?.arca?.estado === 'coincide' ? 1 : 0,
    votos,
    campos: camposDuros(item),
  }
}

/** Compara dos calidades en orden de precedencia. > 0 ⇒ `a` es mejor. */
export function comparar(a, b) {
  return (a.cargable - b.cargable) || (a.arca - b.arca) || (a.votos - b.votos) || (a.campos - b.campos)
}

/**
 * De un grupo de lecturas del MISMO papel, cuál se queda y cuáles quedan como copias.
 *
 * @param {Array<{item:object, votos?:number}>} candidatos  en el orden en que llegaron
 * @returns {{ganador:object, perdedores:object[], porque:string}}
 */
export function mejorDe(candidatos = [], { ahora } = {}) {
  const lista = candidatos.filter((c) => c?.item)
  if (!lista.length) return { ganador: null, perdedores: [], porque: 'no hay candidatos' }
  let mejor = lista[0]
  let calMejor = calidadDeLectura(mejor.item, { votos: mejor.votos ?? 1, ahora })
  for (const c of lista.slice(1)) {
    const cal = calidadDeLectura(c.item, { votos: c.votos ?? 1, ahora })
    // ESTRICTAMENTE MEJOR para reemplazar: ante un empate perfecto gana el que llegó primero, que es
    // la única forma de que el resultado no dependa del orden en que Mattermost devolvió los archivos.
    if (comparar(cal, calMejor) > 0) { mejor = c; calMejor = cal }
  }
  return {
    ganador: mejor.item,
    perdedores: lista.filter((c) => c !== mejor).map((c) => c.item),
    porque: calMejor.cargable ? 'es la única lectura que se puede cargar' : 'es la lectura más completa',
  }
}
