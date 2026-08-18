// LA DDJJ NOMINATIVA DE UOCRA, LEÍDA DEL PDF REAL.
//
// ═══ POR QUÉ EXISTE (18/08/2026) ═══
//
// La pestaña "Cargas Sociales" afirmaba, al pie del cuadro de Fondo de Cese:
//
//     "Fondo de Cese (Ley 22.250) — no lo declara la DDJJ: su devengado no se controla contra
//      nada, sólo se sabe lo que salió de la caja."
//
// **Es falso, y la consecuencia es cara.** La DDJJ Nominativa de UOCRA declara, mes a mes, el
// renglón "Total Aportes Devengados al Fondo de Cese Laboral". Los seis PDF de 2026 están en Drive
// desde febrero, en la misma carpeta que IIBB e IVA — que el OS SÍ lee. UOCRA era la única
// subcarpeta de las cuatro que no leía nadie.
//
// Con el devengado a la vista, el Fondo de Cese pasa de "no se controla contra nada" a tener sus
// dos puntas. Y en la construcción esto no es un detalle contable: bajo la Ley 22.250 no existe la
// indemnización por antigüedad, el costo del despido se paga mes a mes a este fondo, y un fondo
// atrasado es incumplimiento que habilita reclamos.
//
// ═══ SE LEE DEL PDF, NO SE TIPEA ═══
//
// El PDF es el comprobante de presentación: trae el período, el tipo de boleta y la fecha de
// aceptación. Un número tipeado a mano en una planilla no se puede volver a verificar contra nada.
//
// OJO CON EL FORMATO: este PDF escribe los importes con PUNTO decimal (721871.71), al revés que las
// DDJJ de IIBB e IVA, que vienen en es-AR (721.871,71). Usar el parser de aquéllas acá multiplicaría
// por mil o devolvería cero según el caso — por eso `monto()` es propio y está probado.

/** "721871.71" → 721871.71. Este formulario NO usa formato es-AR: el punto es decimal. */
export const monto = (s) => {
  const t = String(s ?? '').trim().replace(/\s/g, '')
  if (!t) return null
  // Un separador de miles con coma ("6,654,791.21") se saca; el punto decimal se respeta.
  const v = Number(t.replace(/,/g, ''))
  return Number.isFinite(v) ? v : null
}

/** Busca el número que sigue a un rótulo. Por rótulo y NUNCA por posición: el texto del PDF sale
 *  desordenado y los tabuladores cambian entre meses. */
const trasRotulo = (texto, re) => {
  const m = texto.match(re)
  return m ? monto(m[1]) : null
}

/**
 * NÚCLEO PURO: el texto del PDF → los datos de la DDJJ.
 *
 * @param {string} texto texto plano del PDF
 * @returns {{periodo:string|null, tipo_boleta:string|null, trabajadores:number|null,
 *            remuneraciones:number|null, seguro_vida:number|null, fics:number|null,
 *            fondo_cese_devengado:number|null, otros_conceptos:number|null,
 *            total_determinado:number|null}}
 */
export function parsearUocra(texto = '') {
  const t = String(texto)

  // "Periodo : 01 / 2026" → "2026-01". Se normaliza a ISO para poder ordenar y cruzar por período,
  // que es como lo consume todo el resto del OS.
  const per = t.match(/Periodo\s*:?\s*(\d{2})\s*\/\s*(\d{4})/i)
  const periodo = per ? `${per[2]}-${per[1]}` : null

  const boleta = t.match(/Boleta\s+Tipo\s*:?\s*(\w+)/i)

  return {
    periodo,
    tipo_boleta: boleta ? boleta[1] : null,
    trabajadores: trasRotulo(t, /Cantidad\s+Total\s+de\s+Trabajadores\s*\t?\s*([\d.,]+)/i),
    remuneraciones: trasRotulo(t, /Suma\s+Total\s+de\s+Remuneraciones\s*\t?\s*([\d.,]+)/i),
    seguro_vida: trasRotulo(t, /Total\s+de\s+Aportes\s+Seguro\s+de\s+Vida\s*\t?\s*([\d.,]+)/i),
    // EL RENGLÓN QUE MOTIVA TODO ESTE ARCHIVO.
    fondo_cese_devengado: trasRotulo(t, /Total\s+Aportes\s+Devengados\s+al\s+Fondo\s+de\s+Cese\s+Laboral\s*:?\s*\t?\s*([\d.,]+)/i),
    fics: trasRotulo(t, /Total\s+de\s+Aportes\s+FICS\s*:?\s*\t?\s*([\d.,]+)/i),
    otros_conceptos: trasRotulo(t, /Total\s+Otros\s+Conceptos\s*\t?\s*([\d.,]+)/i),
    // "Total Determinado" viene SOLO en su renglón, sin nada a la derecha: el importe está en la
    // línea siguiente. Por eso este rótulo se busca con salto de línea y no con tabulador.
    total_determinado: trasRotulo(t, /Total\s+Determinado\s*\n\s*([\d.,]+)/i),
  }
}

/** La carpeta de las DDJJ de UOCRA en Drive. Hermana de las de IIBB e IVA, que el OS ya leía. */
export const CARPETA_UOCRA = '1nURWIZqNN_0TMZB--O_jSseVWGGPih0u'

/**
 * Lee las DDJJ de UOCRA desde los PDF de Drive.
 *
 * Un fallo de lectura NO se degrada a cero: se avisa y esa fila no entra. Un cero silencioso en un
 * aporte declarado se lee como "no se debe nada", que es lo contrario de "no pude leerlo".
 */
export async function leerUocra(google) {
  const archivos = await google.listFolder(CARPETA_UOCRA)
    .catch((e) => { console.error(`  ⚠ no pude listar la carpeta de UOCRA: ${e.message}`); return [] })
  const pdfs = archivos.filter((f) => /\.pdf$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name))
  const out = []
  for (const f of pdfs) {
    try {
      const pdf = await google.readPdfText(f.id, { maxChars: 8000 })
      const d = parsearUocra(pdf?.text ?? '')
      if (!d.periodo) { console.error(`  ⚠ ${f.name}: no pude leerle el período — no entra`); continue }
      out.push({ ...d, archivo: f.name, drive_file_id: f.id })
    } catch (e) {
      console.error(`  ⚠ ${f.name}: ${String(e.message).slice(0, 120)} — no entra`)
    }
  }
  return out
}
