// DE QUÉ FILA DE COMPRAS ES ESTE ARCHIVO — y con qué confianza se sabe.
//
// ═══ TRES MANERAS QUE NO VALEN LO MISMO ═══
//
// El canal de comprobantes tiene 110 archivos. De algunos el OS sabe con certeza a qué gasto
// pertenecen porque los cargó él mismo; del resto hay que deducirlo. Mezclar las dos cosas sería
// presentar una inferencia con la misma cara que un hecho, y este repo ya paga caro cada vez que eso
// pasa. Por eso:
//
//   · `registro`     — HECHO. El bot bajó ese `fileId`, lo leyó y escribió la fila; el par
//                      (fileId → clave) quedó guardado en `comunicacion.comprobante_fajos.items`.
//                      Confianza 1. No se recalcula ni se discute.
//   · `match_numero` — CÁLCULO. Se leyó el papel y se buscó su fila. Lleva `confianza` explícita.
//   · `sin_vincular` — NO SE PUDO. Se lista para que una persona lo asigne. Nunca se adivina: un
//                      adjunto colgado de la factura equivocada es peor que un adjunto sin colgar,
//                      porque el primero se ve como respaldo y no lo es.
//
// ═══ POR QUÉ EL MATCHEO ARRANCA POR LA CLAVE Y NO POR EL NÚMERO ═══
//
// «Emparejar sólo por N° de comprobante» ya produjo un reporte de $71.191.410 faltantes que era
// falso. Y el número solo no distingue una NOTA DE CRÉDITO de la factura que anula: comparten
// numeración, las dos se llaman «nota», y confundirlas costó $41,9M.
//
// `claveComprobante` —la misma que escribió las claves que hoy hay en la base— ya resuelve las tres
// cosas: normaliza el punto de venta (los ceros de relleno no son identidad), le pone marca `NC|` a
// las notas, y sólo cae a `p:<proveedor>|` cuando no hay CUIT. El importe NO es el matcher: es la
// CONFIRMACIÓN de un match que ya se hizo por identidad.
//
// ═══ LA AMBIGÜEDAD NO SE RESUELVE, SE DECLARA ═══
//
// Si dos filas de Compras comparten clave —la misma factura cargada dos veces, que es justo lo que
// la columna «¿Comprobante repetido?» sirve para mirar—, elegir una sería inventar. Devuelve
// `sin_vincular` con el motivo adentro para que la sub-vista lo muestre y una persona decida.

import { claveComprobante, clavesEquivalentes, numeroCanonico } from './lectura.mjs'

/** Tolerancia del importe: 1 %. Un redondeo de IVA o una percepción entran; otra factura no. */
export const TOLERANCIA = 0.01

export const MOTIVO = Object.freeze({
  SIN_NUMERO: 'el papel no dice número de comprobante',
  SIN_FILA: 'no hay ninguna fila de Compras con ese comprobante',
  AMBIGUO: 'hay más de una fila de Compras con ese comprobante',
  IMPORTE: 'la fila existe pero el importe no coincide',
})

/**
 * ¿Dos importes son el mismo gasto?
 *
 * SE COMPARAN LOS VALORES ABSOLUTOS, y es una decisión: la pestaña guarda las notas de crédito en
 * NEGATIVO (`-686070`) y el papel dice `686070`. Comparar con signo haría que ninguna nota de
 * crédito encontrara nunca su fila. El signo ya está resuelto donde corresponde —en la clave, que
 * lleva la marca `NC|`—, así que acá no puede volver a decidir nada.
 */
export function importeCoincide(a, b, tolerancia = TOLERANCIA) {
  const x = Math.abs(Number(a) || 0)
  const y = Math.abs(Number(b) || 0)
  if (!x || !y) return false
  return Math.abs(x - y) <= Math.max(x, y) * tolerancia
}

/** Todas las formas en que esta clave se pudo haber escrito (la de hoy y las del padding viejo). */
const formas = (clave) => (clave ? [clave, ...clavesEquivalentes(clave)] : [])

/**
 * NÚCLEO PURO: a qué fila de Compras pertenece esta lectura.
 *
 * @param {{cuit?:string|null, tipo?:string|null, numero?:string|null, proveedor?:string|null,
 *          total?:number|null, esNotaCredito?:boolean, esNotaDebito?:boolean}} lectura
 *        lo que se entendió del papel
 * @param {Array<{clave:string|null, comprobante:string|null, total:number|null, fila:number}>} compras
 *        las filas de `public.compra_sheet`
 * @returns {{vinculado_por:'match_numero', clave:string, fila:number, confianza:number}
 *          |{vinculado_por:'sin_vincular', motivo:string, candidatas?:number[]}}
 */
export function vincularLectura(lectura = {}, compras = []) {
  const numero = numeroCanonico(lectura.numero)
  if (!numero) return { vinculado_por: 'sin_vincular', motivo: MOTIVO.SIN_NUMERO }

  const propia = claveComprobante({
    cuit: lectura.cuit, tipo: lectura.tipo, numero: lectura.numero,
    proveedor: lectura.proveedor, esNotaCredito: lectura.esNotaCredito,
    esNotaDebito: lectura.esNotaDebito,
  })?.clave ?? null

  // ── 1. POR IDENTIDAD ──────────────────────────────────────────────────────────────────────────
  const buscadas = new Set(formas(propia))
  let candidatas = buscadas.size ? compras.filter((c) => c.clave && buscadas.has(c.clave)) : []

  // ── 2. SI NO HAY, POR NÚMERO CANÓNICO ─────────────────────────────────────────────────────────
  //
  // 212 de 882 filas de la pestaña no tienen número, y 385 no tienen CUIT: una lectura con CUIT
  // bueno puede no encontrar su fila porque la FILA es la incompleta. Bajar al número canónico es el
  // respaldo — pero entonces el importe deja de ser confirmación y pasa a ser parte de la identidad,
  // porque el número solo no alcanza para distinguir a dos proveedores.
  let porNumero = false
  if (!candidatas.length) {
    porNumero = true
    candidatas = compras.filter((c) => numeroCanonico(c.comprobante) === numero
      && importeCoincide(c.total, lectura.total))
  }

  if (!candidatas.length) return { vinculado_por: 'sin_vincular', motivo: MOTIVO.SIN_FILA }
  if (candidatas.length > 1) {
    return {
      vinculado_por: 'sin_vincular', motivo: MOTIVO.AMBIGUO,
      candidatas: candidatas.map((c) => c.fila),
    }
  }

  const [c] = candidatas
  const confirmado = importeCoincide(c.total, lectura.total)
  // Un match por identidad con importe distinto NO se descarta —el papel puede traer percepciones
  // que la fila cargó aparte— pero baja de confianza y se declara.
  if (!porNumero && !confirmado) {
    return { vinculado_por: 'match_numero', clave: c.clave, fila: c.fila, confianza: 0.6, aviso: MOTIVO.IMPORTE }
  }
  // Identidad + importe = lo más fuerte que se puede afirmar sin haberlo visto cargar.
  // Sólo número + importe: el CUIT no participó, así que dos proveedores distintos con el mismo
  // número y un importe parecido serían indistinguibles. Se afirma menos.
  return { vinculado_por: 'match_numero', clave: c.clave, fila: c.fila, confianza: porNumero ? 0.7 : 0.95 }
}

/**
 * EL VÍNCULO QUE NO HAY QUE CALCULAR: el que el bot ya dejó escrito.
 *
 * `comunicacion.comprobante_fajos.items[]` guarda, por cada archivo que procesó, `origen.fileId` y
 * la `clave` que terminó en la pestaña. Eso es un hecho registrado, no una deducción — y cubre
 * gratis todo lo que el bot cargó, sin gastar una sola llamada al modelo de visión.
 *
 * @param {Array<{file_id:string, clave:string|null, estado:string, fila?:number|null,
 *                numero?:string|null}>} items filas ya aplanadas
 * @returns {Map<string, {clave:string, fila:number|null, numero:string|null}>} fileId → vínculo
 */
export function registroPorArchivo(items = []) {
  const m = new Map()
  for (const it of items) {
    if (!it?.file_id || !it?.clave) continue
    // UN FAJO `descartado` NO VINCULA NADA. El dueño lo descartó: esa foto no terminó en ninguna
    // fila de Compras. Como el mismo archivo puede aparecer en un fajo descartado Y en uno cargado
    // —un fajo descartado se vuelve a mandar—, sólo se miran los cargados y gana el último.
    if (it.estado !== 'cargado') continue
    m.set(it.file_id, { clave: it.clave, fila: it.fila ?? null, numero: it.numero ?? null })
  }
  return m
}

/**
 * EL REGISTRO → LA FILA DE HOY, verificando que siga siendo la misma.
 *
 * ═══ POR QUÉ NO ALCANZA CON COMPARAR LA CLAVE ═══
 *
 * Medido el 25/08 sobre los 70 archivos del registro: buscando por igualdad de clave sólo 37
 * encuentran su fila. Los otros 33 fallan por dos motivos que no son errores de nadie:
 *
 *   · La pestaña tiene CUIT en 497 de 882 filas. Donde falta, la fila se identifica
 *     `p:<proveedor>|<número>` y el registro —que leyó el CUIT del papel— dice `c:<cuit>|<número>`.
 *     Son la misma compra escrita con dos identidades porque una de las dos fuentes sabe menos.
 *   · El registro tiene claves con la forma vieja del punto de venta (`00113-…`, cinco dígitos) y la
 *     pestaña la nueva (`0113-…`). `clavesEquivalentes` traduce de la nueva a la vieja, no al revés.
 *
 * ═══ LA FILA GUARDADA ES MEJOR EVIDENCIA, PERO SE VERIFICA ═══
 *
 * `comunicacion.comprobantes_cargados.fila` es el renglón donde el bot escribió. Eso resuelve 60 de
 * 70. Pero un renglón es una POSICIÓN: si el dueño inserta una fila arriba, el 810 pasa a ser otra
 * compra y el adjunto quedaría colgado de la factura equivocada — que es peor que no colgarlo,
 * porque se ve como respaldo y no lo es.
 *
 * Entonces la fila no se cree: se COMPRUEBA. Si el comprobante que hoy está en ese renglón tiene el
 * mismo número canónico que el que el bot cargó, el vínculo es un hecho. Si no, se descarta la fila
 * y se cae a la clave. Verificado sobre los 60: ninguno estaba corrido.
 *
 * @param {{clave:string, fila:number|null, numero:string|null}} r
 * @param {Array<{fila:number, clave:string|null, comprobante:string|null}>} compras
 * @returns {{vinculado_por:'registro', clave:string|null, fila:number, confianza:1}
 *          |{vinculado_por:'sin_vincular', motivo:string}}
 */
export function vincularPorRegistro(r = {}, compras = []) {
  const esperado = numeroCanonico(r.numero)
  if (r.fila && esperado) {
    const enEsaFila = compras.find((c) => c.fila === r.fila)
    if (enEsaFila && numeroCanonico(enEsaFila.comprobante) === esperado) {
      return { vinculado_por: 'registro', clave: enEsaFila.clave ?? r.clave, fila: r.fila, confianza: 1 }
    }
  }
  // El respaldo: la clave tal cual, y sus formas viejas.
  const buscadas = new Set(formas(r.clave))
  const porClave = compras.filter((c) => c.clave && buscadas.has(c.clave))
  if (porClave.length === 1) {
    return { vinculado_por: 'registro', clave: porClave[0].clave, fila: porClave[0].fila, confianza: 1 }
  }
  return {
    vinculado_por: 'sin_vincular',
    motivo: porClave.length > 1 ? MOTIVO.AMBIGUO : MOTIVO.SIN_FILA,
  }
}
