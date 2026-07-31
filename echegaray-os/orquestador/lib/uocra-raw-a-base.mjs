// LA ESCALA DEL CONVENIO: UNA SOLA FUENTE, LA RÉPLICA DEL ACUERDO.
//
// ═══ EL PEDIDO (31/07): "uocra desactualizado" ═══
//
// Y era cierto a medias, que es lo peor. Al mirarlo:
//
//   · `_UOCRA_RAW` (la réplica del acuerdo, pegada en el Sheet) YA TIENE AGOSTO 2026: del Acuerdo Mayo
//     2026, +1,9% — Oficial Especializado $7.420, Oficial $6.348, Medio Oficial $5.866, Ayudante
//     $5.399, Sereno $980.858/mes. Verificado además contra el acuerdo publicado: el escalón de agosto
//     es +1,9%, coincide.
//   · `public.uocra_escala` (la tabla de la base) tenía SÓLO JULIO.
//
// DOS COPIAS DEL MISMO CONCEPTO QUE NO COINCIDEN. La pestaña de Jornales lee la réplica y muestra el
// mes en curso, así que se veía julio (hoy es 31/07) y mañana pasaba a agosto sola. Pero todo lo que
// consulta la BASE —el vigía, cualquier control— veía una escala vencida y avisaba de un atraso que en
// el Sheet no existía. Un concepto en dos lugares es la Regla de Realidad Única, y acá se rompía.
//
// LA RÉPLICA MANDA. Es la copia fiel del acuerdo que el dueño pega; la tabla pasa a derivarse de ella.
// No al revés: cargar la base a mano es lo que produjo la divergencia.
//
// ═══ LA FORMA DEL PEGADO, QUE ES LA FORMA DEL ACUERDO ═══
//
// El mes aparece UNA vez, en la primera de las cinco filas del grupo, con el porcentaje pegado y saltos
// de línea adentro ("Agosto\n+1,9%", "Febrero\n(1,8%\ns/Ene)"). Las otras cuatro filas tienen el mes
// vacío. El orden de las cinco categorías es el del convenio y no cambia entre acuerdos.
//
// Y las filas de encabezado de cada acuerdo ("Acuerdo Mayo 2026", "*(más Suma No Remunerativa…") no son
// datos: separan bloques. Se saltean por no tener categoría reconocible.

/** Las cinco categorías del convenio, en el orden en que el acuerdo las lista. */
export const CATEGORIAS = ['Oficial Especializado', 'Oficial', 'Medio Oficial', 'Ayudante', 'Sereno']

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 }

/**
 * El mes y el año de vigencia de un rótulo del pegado.
 *
 * "Agosto\n+1,9%" → mes 8. El AÑO no está en el rótulo: viene del encabezado del bloque
 * ("Acuerdo Mayo 2026") o, si no hay, del año que se pase por defecto. Un acuerdo puede fijar meses del
 * año siguiente, así que si el mes es menor al del acuerdo se asume el año siguiente.
 */
export function mesDeRotulo(rotulo, { anioAcuerdo = null, mesAcuerdo = null } = {}) {
  const t = String(rotulo ?? '').toLowerCase()
  const hit = Object.keys(MESES).find((m) => t.includes(m))
  if (!hit) return null
  const mes = MESES[hit]
  const anio = anioAcuerdo ?? new Date().getFullYear()
  // Un acuerdo de mayo 2026 que fija "enero" habla de enero de 2027.
  const rueda = mesAcuerdo && mes < mesAcuerdo ? anio + 1 : anio
  return { mes, anio: rueda, vigencia: `${rueda}-${String(mes).padStart(2, '0')}-01` }
}

/** El porcentaje del escalón, si el rótulo lo trae. Es informativo: el básico ya viene calculado. */
export const porcentajeDeRotulo = (rotulo) => {
  const m = String(rotulo ?? '').match(/([\d]+[.,]?[\d]*)\s*%/)
  return m ? Number(m[1].replace(',', '.')) : null
}

/** El encabezado de un bloque de acuerdo: "Acuerdo Mayo 2026" → {mes:5, anio:2026}. */
export function encabezadoDeAcuerdo(texto) {
  const t = String(texto ?? '')
  if (!/^\s*acuerdo\s/i.test(t)) return null
  const anio = Number(t.match(/(20\d{2})/)?.[1] ?? 0) || null
  const mes = MESES[Object.keys(MESES).find((m) => t.toLowerCase().includes(m)) ?? ''] ?? null
  return anio ? { mes, anio, nombre: t.trim().replace(/\s+/g, ' ') } : null
}

const num = (v) => {
  const s = String(v ?? '').replace(/[^\d,.-]/g, '')
  if (!s) return null
  // El pegado trae los básicos SIN separador de miles ("7420", "980858"): un punto o coma sería decimal.
  const n = Number(s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * NÚCLEO PURO: la escala, leída del pegado.
 *
 * @param {any[][]} filas las filas de _UOCRA_RAW tal como vienen del Sheet
 * @param {{col?:{mes:number,cat:number,por:number,basico:number}}} opts posiciones de columna
 * @returns {Array<{vigencia:string, zona:'A', categoria:string, basico_hora:number|null, mensual:number|null, porcentaje:number|null, acuerdo:string|null}>}
 */
export function escalaDeRaw(filas = [], { col = { mes: 0, cat: 1, por: 2, basico: 3 } } = {}) {
  const out = []
  let acuerdo = null
  let vig = null
  for (const f of filas) {
    const cel = (i) => String(f?.[i] ?? '').trim()
    const enc = encabezadoDeAcuerdo(cel(col.mes))
    if (enc) { acuerdo = enc; vig = null; continue }
    const rotMes = cel(col.mes)
    if (rotMes) {
      const m = mesDeRotulo(rotMes, { anioAcuerdo: acuerdo?.anio, mesAcuerdo: acuerdo?.mes })
      if (m) vig = { ...m, porcentaje: porcentajeDeRotulo(rotMes) }
      // Un rótulo con texto pero sin mes reconocible (la nota de la suma no remunerativa) no abre grupo.
      else continue
    }
    const cat = CATEGORIAS.find((c) => cel(col.cat).toLowerCase().startsWith(c.toLowerCase()))
      // "Medio Oficial" empieza igual que "Oficial"… no: el find recorre en orden y "Oficial
      // Especializado" va primero, "Oficial" después, "Medio Oficial" tiene su propio prefijo. Pero
      // "Oficial" haría match con "Oficial Especializado" si estuviera antes: el ORDEN del array importa.
    if (!cat || !vig) continue
    const porHora = /hora/i.test(cel(col.por)) || (cat !== 'Sereno' && !/mes/i.test(cel(col.por)))
    const valor = num(f?.[col.basico])
    if (valor === null) continue
    out.push({
      vigencia: vig.vigencia,
      zona: 'A',
      categoria: cat === 'Sereno' ? 'Sereno (mensual)' : cat,
      basico_hora: porHora ? valor : null,
      mensual: porHora ? null : valor,
      porcentaje: vig.porcentaje,
      acuerdo: acuerdo?.nombre ?? null,
    })
  }
  return out
}

/** La vigencia más nueva de una escala leída. Para poder decir hasta cuándo llega. */
export const vigenciaMaxima = (escala = []) => escala.reduce((m, e) => (!m || e.vigencia > m ? e.vigencia : m), null)
