// LA DDJJ DE INGRESOS BRUTOS DE SAN JUAN, LEÍDA DEL PDF REAL.
//
// POR QUÉ EXISTE (20/07). El dueño: "IIBB tenés que buscarlo en Drive, ahí puede haber datos de
// cuánto se ha ido pagando". Tenía razón: en Drive hay una carpeta con las DDJJ mensuales de la
// Dirección General de Rentas de San Juan, que el índice del OS no tenía cargada.
//
// Y EL DATO REAL CORRIGE LO QUE ME HABÍAN DICHO. La alícuota que la empresa declara NO es 3%:
//   · 410021 CONSTRUCCIÓN, REFORMA Y REPARACIÓN DE EDIFICIOS NO RESIDENCIALES → 2,00%
//   · 711001 SERVICIOS RELACIONADOS CON LA CONSTRUCCIÓN → 3,00% (no se usa: base $0)
// El 3% existe en la ley, pero es para servicios. Echegaray declara todo por 410021 al 2%.
// Estimar al 3% inflaba el impuesto un 50%.
//
// Y HAY ALGO MÁS IMPORTANTE QUE LA ALÍCUOTA: la empresa NO PAGA IIBB. Las retenciones y
// percepciones que sufre superan al impuesto determinado, y el saldo a favor se arrastra y crece.
// Junio 2026 cerró con $923.311,91 A FAVOR del contribuyente. Poner "IIBB a pagar" en el cash flow
// habría sido inventar un egreso que no existe — mientras el problema real es el opuesto: hay plata
// de la empresa inmovilizada en el fisco provincial, igual que con el IVA.
//
// SE LEE DEL PDF Y NO SE TIPEA. El PDF de la DDJJ es la fuente primaria: tiene el número de control,
// la fecha de presentación y el detalle por código de actividad. Un número tipeado a mano en una
// planilla no se puede volver a verificar contra nada.

/** Convierte "1.453.715,15" a número. Formato es-AR: punto de miles, coma decimal. PURA. */
export const montoAR = (s) => {
  const t = String(s ?? '').trim().replace(/\./g, '').replace(',', '.')
  const v = parseFloat(t)
  return Number.isFinite(v) ? v : 0
}

/**
 * NÚCLEO PURO: extrae los datos de una DDJJ de IIBB de San Juan desde el texto del PDF.
 *
 * El PDF sale de un formulario y el texto viene desordenado — los rótulos y los importes no siempre
 * quedan en la misma línea. Por eso cada dato se busca por su rótulo propio y NO por posición.
 *
 * @param {string} texto texto plano del PDF
 * @returns {{periodo:string|null, actividades:Array, base_total:number, impuesto_determinado:number,
 *            retenciones:number, saldo_favor_anterior:number, a_ingresar:number, a_favor:boolean,
 *            fecha_presentacion:string|null, nro_control:string|null}}
 */
export function parsearDDJJ(texto = '') {
  const t = String(texto)
  const buscar = (re) => { const m = re.exec(t); return m ? m[1] : null }

  // Una línea por código de actividad: código, alícuota, tratamiento (D/O/E), base, impuesto.
  // Sólo interesan las que tienen base > 0: el formulario lista todas las actividades inscriptas.
  const actividades = []
  const re = /(\d{6})\s+([^$\n]+?)\s*\$?\s*([\d.,]+)\s+([DOE])\s+([\d.]+,\d{2})\s*\$?\s*([\d.]+,\d{2})/g
  let m
  while ((m = re.exec(t)) !== null) {
    const base = montoAR(m[5])
    if (base <= 0) continue
    actividades.push({
      codigo: m[1],
      descripcion: m[2].trim().replace(/\s+/g, ' '),
      alicuota: montoAR(m[3]) / 100,
      tratamiento: m[4],
      base_imponible: base,
      impuesto: montoAR(m[6]),
    })
  }

  const num = (re) => montoAR(buscar(re) ?? '0')
  return {
    periodo: buscar(/Periodo:[\s\S]{0,400}?(\d{4}-\d{2})/) ?? buscar(/(\d{4}-\d{2})\s+N° DDJJ/),
    actividades,
    base_total: actividades.reduce((s, a) => s + a.base_imponible, 0),
    impuesto_determinado: num(/Total Impuesto Determinado\s*\$?\s*([\d.]+,\d{2})/),
    retenciones: num(/Total Retenciones y Percepciones\s*\$?\s*([\d.]+,\d{2})/),
    saldo_favor_anterior: num(/Saldo a favor Decalaraci[^\n]*?\n?[^$]*?\$?\s*([\d.]+,\d{2})/),
    a_ingresar: num(/Monto a Ingresar\s*\n?\s*\$?\s*([\d.]+,\d{2})/),
    // El formulario imprime este rótulo cuando el resultado es crédito, no deuda.
    a_favor: /A favor del Contribuyente/i.test(t),
    fecha_presentacion: buscar(/Fecha Present\.:\s*(\d{2}\/\d{2}\/\d{4})/),
    nro_control: buscar(/N° DE CONTROL\s*\n?\s*(\d{6,})/),
  }
}

/**
 * NÚCLEO PURO: la alícuota que la empresa DECLARA, sacada de sus propias DDJJ.
 * No es un dato de la ley: es lo que efectivamente usó, ponderado por base imponible. Si declara por
 * dos códigos con alícuotas distintas, el promedio ponderado es la única alícuota que sirve para
 * proyectar.
 * @param {Array} ddjjs salida de parsearDDJJ
 * @returns {{alicuota:number|null, base:number, impuesto:number, codigos:Array<string>}}
 */
export function alicuotaDeclarada(ddjjs = []) {
  const act = ddjjs.flatMap((d) => d.actividades ?? [])
  const base = act.reduce((s, a) => s + a.base_imponible, 0)
  const impuesto = act.reduce((s, a) => s + a.impuesto, 0)
  return {
    alicuota: base > 0 ? impuesto / base : null,
    base,
    impuesto,
    codigos: [...new Set(act.map((a) => a.codigo))].sort(),
  }
}
