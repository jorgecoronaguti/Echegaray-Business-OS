// LA DDJJ ANUAL DE GANANCIAS SOCIEDADES (F.713), LEÍDA DEL PDF QUE ARCHIVA LA EMPRESA.
//
// NÚCLEO PURO: recibe el texto del PDF («Declaraciones Juradas · Ganancias Sociedades», el que baja
// Mis Declaraciones de ARCA) y devuelve los campos del formulario por su RÓTULO, no por posición: el
// texto sale con tabulaciones y columnas cruzadas (R5 imprime dos columnas en la misma línea).
//
// ═══ DE DÓNDE SALE (17/09/2026) ═══
//
// `ddjj ganancias 2025.pdf` (Drive 1ccne303eneBBVzeS0H3v0D2tzSlZ4BBD) en «administracion / Archivos
// GESTIÓN ECSAS / BALANCES». Período fiscal 2025, cierre de ejercicio en octubre, presentada el
// 11/03/2026 (transacción 4233520187): determinado $7.310.161,73; anticipos cancelados con el impuesto
// al cheque $862.379,56; cómputo del impuesto al cheque $6.447.782,16; retenciones y percepciones
// $5.726.886,85. Total a pagar $0,00 y SALDO A FAVOR DEL CONTRIBUYENTE $5.726.886,84.

const montoAR = (s) => (s === null || s === undefined ? null : Number(String(s).replace(/\./g, '').replace(',', '.')))

/**
 * @param {string} texto
 * @returns {null | {periodo_fiscal:string, mes_cierre:number, periodo:string, fecha_presentacion:string|null,
 *   transaccion:string|null, rectificativa:number|null, determinado:number, anticipos_credeb:number,
 *   computo_credeb:number, retenciones:number, anticipos_efectivo:number, saldo_favor_anterior:number,
 *   total_a_pagar:number, saldo_a_favor:number}}
 */
export function parsearDDJJGanancias(texto = '') {
  const t = String(texto)
  if (!/Ganancias Sociedades/i.test(t) || !/Formulario 713/i.test(t)) return null
  const buscar = (re) => { const m = re.exec(t); return m ? m[1] : null }
  const num = (re) => montoAR(buscar(re))
  const ano = buscar(/Per[ií]odo Fiscal:\s*(\d{4})00/)
  const cierre = buscar(/Mes de Cierre\s+Per[ií]odo\s+C\.U\.I\.T\.\s*\n\s*(\d{1,2})\s/)
  if (!ano || !cierre) return null
  const d = {
    periodo_fiscal: ano,
    mes_cierre: Number(cierre),
    // El período del registro es el MES DE CIERRE del ejercicio: el F.713 2025 de esta empresa cierra el 31/10/2025.
    periodo: `${ano}-${String(cierre).padStart(2, '0')}`,
    fecha_presentacion: buscar(/Fecha Presentaci[oó]n:\s*(\d{2}\/\d{2}\/\d{4})/),
    transaccion: buscar(/Transacci[oó]n:\s*(\d+)/),
    rectificativa: /0-ORIGINAL/.test(t) ? 0 : null,
    determinado: num(/g Total Impuesto Determinado\s+([\d.]+,\d{2})/),
    anticipos_credeb: num(/r Anticipos Cancelados Credeb\s+([\d.]+,\d{2})/),
    computo_credeb: num(/u C[oó]mputo Credeb para cancelaci[oó]n DJ\s+([\d.]+,\d{2})/),
    retenciones: num(/z Retenciones y\/o Percepciones\s+([\d.]+,\d{2})/),
    anticipos_efectivo: num(/aa Total antic\.ingresados[\s\S]{0,120}?135\/06-\s+([\d.]+,\d{2})/),
    saldo_favor_anterior: num(/ag Saldo a Favor Periodo Anterior\s+([\d.]+,\d{2})/),
    total_a_pagar: num(/d Total a pagar\s+([\d.]+,\d{2})/),
    saldo_a_favor: num(/af Saldo a favor\s+([\d.]+,\d{2})/),
  }
  // Sin determinado o sin la forma de ingreso el formulario no se leyó: no se devuelve a medias.
  if (d.determinado === null || d.total_a_pagar === null) return null
  return d
}
