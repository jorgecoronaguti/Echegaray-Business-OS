// LA DDJJ DE IVA (F.2051), LEÍDA DEL PDF OFICIAL DE ARCA.
//
// POR QUÉ EXISTE (28/07). El IVA de la pestaña se CALCULABA desde los comprobantes de _ARCA_RAW
// (débito − crédito, arrastrando el saldo técnico). Su propio autor lo dejó anotado: "sigue sin
// reemplazar a la DDJJ… la diferencia contra el F2002 hay que mirarla, no taparla". El dueño trajo
// a Drive las F.2051 mensuales presentadas — la fuente PRIMARIA, con número de transacción y fecha
// de presentación. Igual que IIBB ya se lee de la DDJJ de Rentas, el IVA ahora se lee del F.2051.
//
// Y EL DATO OFICIAL CORRIGE DOS COSAS QUE NO SE VEÍAN:
//   1. La empresa NO paga IVA en efectivo: tiene un crédito de LIBRE DISPONIBILIDAD acumulado de
//      ~$19,3M (jun-26) que absorbe cualquier posición a favor de ARCA. En marzo la posición técnica
//      fue $10,75M a favor de ARCA y NO se pagó en efectivo: se consumió del crédito acumulado
//      (feb $25,84M → mar $16,41M). Poner "IVA a pagar" como salida de caja es inventar un egreso.
//   2. La plata inmovilizada en el fisco por IVA es esa libre disponibilidad (~$19,3M), no el
//      saldo técnico chico que mostraba el cálculo por comprobantes.
//
// SE LEE DEL PDF Y NO SE TIPEA. El F.2051 trae el N° de transacción, la fecha de presentación y el
// MD5. Un número tipeado a mano no se puede verificar contra nada. El texto del PDF viene de un
// formulario y a veces parte el rótulo del importe en dos líneas: por eso se normaliza el espacio y
// cada dato se busca por su ROTULO, nunca por posición.

/** "6.958.948,76" / "$ 6.958.948,76" → número. Formato es-AR: punto de miles, coma decimal. PURA. */
export const montoAR = (s) => {
  const t = String(s ?? '').replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const v = parseFloat(t)
  return Number.isFinite(v) ? v : 0
}

/** El primer importe monetario que aparece DESPUÉS del rótulo (mismo renglón o el siguiente). */
function importeTras(t, re) {
  const m = re.exec(t)
  if (!m) return null
  const resto = t.slice(m.index + m[0].length)
  const n = resto.match(/(-?\d{1,3}(?:\.\d{3})*,\d{2}|0,00)/)
  return n ? montoAR(n[1]) : null
}

/**
 * NÚCLEO PURO: extrae los datos de una DDJJ de IVA (F.2051) desde el texto del PDF.
 * @param {string} texto texto plano del PDF
 * @returns {{periodo:string|null, fecha_presentacion:string|null, nro_transaccion:string|null,
 *   debito:number, credito:number, saldo_tecnico_anterior:number, saldo_arca:number,
 *   saldo_contrib:number, debe_arca:boolean, posicion_tecnica:number, libre_disp_anterior:number,
 *   retenciones_percep:number, libre_disp:number, a_pagar_efectivo:number}}
 */
export function parsearDJIVA(texto = '') {
  // Normalizar el espacio: el PDF parte rótulos e importes en varias líneas.
  const t = String(texto).replace(/\s+/g, ' ').trim()

  const periodoRaw = (/Per[ií]odo\s*(\d{6})/.exec(t) || [])[1] || null
  const periodo = periodoRaw ? `${periodoRaw.slice(0, 4)}-${periodoRaw.slice(4, 6)}` : null
  const fecha_presentacion = (/Fecha de Presentaci[óo]n\s*(\d{2}\/\d{2}\/\d{4})/.exec(t) || [])[1] || null
  const nro_transaccion = (/Nro\.? de Transacci[óo]n\s*(\d+)/.exec(t) || [])[1] || null

  const debito = importeTras(t, /Total del d[ée]bito fiscal del per[ií]odo/) ?? 0
  const credito = importeTras(t, /Total del cr[ée]dito fiscal del per[ií]odo/) ?? 0
  const saldo_tecnico_anterior = importeTras(t, /Saldo t[ée]cnico a favor del contribuyente del per[ií]odo anterior/) ?? 0
  // La posición técnica del período: puede quedar a favor de ARCA (se debe) o del contribuyente.
  const saldo_arca = importeTras(t, /Saldo t[ée]cnico a favor de ARCA/) ?? 0
  const saldo_contrib = importeTras(t, /Saldo t[ée]cnico a favor del contribuyente(?! del per)/) ?? 0
  const libre_disp_anterior = importeTras(t, /Saldo a favor de libre disponibilidad del per[ií]odo anterior/) ?? 0
  const retenciones_percep = importeTras(t, /Total de retenciones, percepciones y pagos a cuenta/) ?? 0
  const libre_disp = importeTras(t, /Saldo de libre disponibilidad a favor del contribuyente del per[ií]odo/) ?? 0

  const debe_arca = saldo_arca > 0
  // Positivo = se debe (a favor de ARCA); negativo = a favor del contribuyente.
  const posicion_tecnica = debe_arca ? saldo_arca : -saldo_contrib
  // Lo que se paga EN EFECTIVO: la deuda técnica menos el crédito de libre disponibilidad que venía
  // y las retenciones/percepciones del período. Si el crédito la cubre, es 0 (el caso de todo 2026).
  const a_pagar_efectivo = Math.max(0, saldo_arca - libre_disp_anterior - retenciones_percep)

  return {
    periodo, fecha_presentacion, nro_transaccion,
    debito, credito, saldo_tecnico_anterior,
    saldo_arca, saldo_contrib, debe_arca, posicion_tecnica,
    libre_disp_anterior, retenciones_percep, libre_disp, a_pagar_efectivo,
  }
}

/**
 * Ordena las DDJJ del año y expone la posición oficial: la libre disponibilidad vigente (plata
 * inmovilizada real) y si en algún mes se pagó IVA en efectivo.
 * @param {Array} ddjjs resultado de parsearDJIVA por archivo
 */
export function posicionOficialIva(ddjjs = []) {
  const meses = ddjjs.filter((d) => d && d.periodo).sort((a, b) => a.periodo.localeCompare(b.periodo))
  const ultima = meses[meses.length - 1] ?? null
  return {
    meses,
    ultima,
    // La plata de la empresa inmovilizada en el fisco por IVA: el saldo de libre disponibilidad vigente.
    libre_disponibilidad: ultima?.libre_disp ?? 0,
    // ¿Sale plata por IVA en algún mes? En 2026: no (el crédito lo absorbe).
    paga_iva_efectivo: meses.some((d) => (d.a_pagar_efectivo ?? 0) > 0),
  }
}
