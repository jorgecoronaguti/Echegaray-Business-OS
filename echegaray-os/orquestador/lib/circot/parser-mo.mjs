// LEER LOS COSTOS ORIENTADORES DE MANO DE OBRA DEL CIRCOT. Puro: entra texto posicionado, sale
// una tabla normalizada. Sin red, sin modelo, sin Drive.
//
// ═══ POR QUÉ EL ORDEN DE LECTURA NO SIRVE ═══
//
// El PDF emite los cinco encabezados «RUBRO: …» DESPUÉS de los 33 ítems de la página. Medido sobre
// `JULIO_2026_MANO DE OBRA_CIRCOT.pdf`: leído en orden, «Demolición de cubierta de tejas» queda
// colgando de FUNDACIONES o de nada. El rubro de un ítem no es el que vino antes en el flujo de
// texto: es el que está dibujado ARRIBA en la hoja. Por eso este parser trabaja sobre renglones con
// Y y no sobre una cadena.
//
// ═══ QUÉ ES ESTO Y QUÉ NO ES ═══
//
// El CIRCOT es el Centro de Investigación para la Racionalización de la Construcción Tradicional de
// la UNSJ, y publica valores ORIENTADORES para San Juan. Es REFERENCIA_EXTERNA_LOCAL: sirve para
// detectar partidas que faltan, para contrastar una MO que se fue de escala y para tener un piso y
// un techo cuando ECSAS no tiene el dato. NO es experiencia ECSAS, NO es norma, y NO puede
// sobrescribir un precio, un rendimiento ni una línea de la Base Maestra. La propia publicación lo
// dice: «los costos allí considerados no pueden aplicarse indiscriminadamente».

/** Un importe argentino sin decimales («8.277», «137.085») a número. Devuelve null si el texto no
 *  tiene la forma exacta de un importe: adivinar un precio mal leído es peor que no leerlo. PURA. */
export function importeAr(texto) {
  const t = String(texto ?? '').replace(/\s/g, '')
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$/.test(t) && !/^\d+(?:,\d{1,2})?$/.test(t)) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Un código estable para el ítem. No lo trae el PDF, y sin él no se puede referenciar una fila ni
 *  comparar dos meses. Se deriva del rubro y la descripción, así que es el mismo todos los meses
 *  mientras el CIRCOT no cambie el texto. PURA. */
export function codigoDe(rubro, descripcion) {
  const slug = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `CIRCOT-${slug(rubro)}-${slug(descripcion)}`
}

/** Los calificativos que el CIRCOT mete DENTRO de la descripción y que cambian qué incluye el
 *  precio. Se extraen aparte porque «Hierro sobre encofrado. MO-» y «Hierro sobre encofrado» no
 *  cotizan lo mismo, y el que compara tiene que verlo. PURA. */
// `\w` NO incluye las acentuadas: con él, «Col. Hormigón. MO s/ elevación» perdía «elevaci» y
// quedaba como «Col. Hormigón. ón». Un calificativo mal recortado deja una descripción rota en la
// tabla de referencia y contra eso se comparan después nuestras partidas.
const CALIFICATIVOS = /(solo\s+MO|MO\s*-|MO\s+s\/\s*[^\s.,;]+|incluido\s+[^.,;]+|c\/\s*molinete\s+manual|\(s\/\s*[^)]+\))/i

/** Una descripción → { descripcion limpia, observaciones }. PURA. */
export function partirDescripcion(cruda) {
  const t = String(cruda ?? '').replace(/\s+/g, ' ').trim()
  const m = t.match(CALIFICATIVOS)
  if (!m) return { descripcion: t, observaciones: null }
  const limpia = t.replace(m[0], '').replace(/\s*[.,]\s*$/, '').replace(/\s+/g, ' ').trim()
  return { descripcion: limpia || t, observaciones: m[0].trim() }
}

const RE_RUBRO = /RUBRO:\s*([^$]+?)(?:MO\s*m[íi]n|MO\s*m[áa]x|$)/i
const RE_RUBRO_PELADO = /^[A-ZÁÉÍÓÚÑÜ°ºª()./\s-]{4,60}$/

/**
 * ¿ESTE RENGLÓN ES UN ENCABEZADO DE RUBRO? PURA.
 *
 * MEDIDO, Y POR ESO ESTÁ ESCRITO ACÁ: los trece primeros rubros del CIRCOT llevan el prefijo
 * «RUBRO: », y los CUATRO ÚLTIMOS —INSTALACIONES ELÉCTRICAS, INSTALACIONES SANITARIAS,
 * INSTALACIONES DE GAS, EQUIPAMIENTO— no lo llevan. Buscando sólo el prefijo, esos 41 ítems
 * heredan el último rubro que sí lo tenía y quedan clasificados como VIDRIOS. No falla nada, no
 * hay renglones sin leer, y la tabla queda mal.
 *
 * El segundo reconocimiento es por FORMA: un renglón de una sola celda, todo en mayúsculas, sin
 * dígitos y sin importes. El encabezado de página queda afuera porque tiene el año.
 */
export function encabezadoDeRubro(renglon) {
  const texto = String(renglon?.texto ?? '').trim()
  const conPrefijo = texto.match(RE_RUBRO)
  if (conPrefijo) return conPrefijo[1].replace(/\s+/g, ' ').trim()
  const celdas = (renglon?.items ?? []).filter((i) => String(i?.texto ?? '').trim())
  if (celdas.length !== 1) return null
  if (/\d|\$/.test(texto) || !RE_RUBRO_PELADO.test(texto)) return null
  if (/RUBROS?\s*\//.test(texto)) return null
  return texto.replace(/\s+/g, ' ').trim()
}
const RE_IMPORTE = /^\$\s*[\d.,]+$/
const RE_UNIDAD_SUELTA = /^(m2|m3|m²|m³|ml|m|u|un|gl|kg)$/i

/** La unidad como la escribe el CIRCOT → la que usa el OS. `U` y `u` son unidad; `ml` es metro
 *  lineal. No se inventan equivalencias: lo que no está en la tabla sale tal cual. PURA. */
const UNIDADES = Object.freeze({ m2: 'm2', 'm²': 'm2', m3: 'm3', 'm³': 'm3', ml: 'm', m: 'm', u: 'un', un: 'un', kg: 'kg', gl: 'gl' })
export const normalizarUnidad = (u) => UNIDADES[String(u ?? '').trim().toLowerCase()] ?? (String(u ?? '').trim() || null)

/**
 * UN RENGLÓN DE ÍTEM, LEÍDO POR COLUMNAS Y NO POR TEXTO. PURA.
 *
 * Concatenar el renglón y buscar «Unid:» funciona en 133 de las 171 filas y falla en 38: en los
 * rubros de instalaciones el CIRCOT NO imprime la etiqueta, y la unidad queda pegada al final de la
 * descripción («…pilar y bajadagl», «…polietileno tricapau»). Un parser de texto lee ahí una
 * descripción rarísima sin unidad; uno de columnas ve tres celdas distintas y no se confunde.
 *
 * Las columnas no se buscan por coordenada fija —el PDF las corre entre páginas— sino por forma:
 * los dos últimos fragmentos con forma de importe son MO mín. y MO máx., y lo que queda entre el
 * marcador «Item:» y ellos es descripción + unidad.
 */
export function parsearRenglonItem(fragmentos = []) {
  const f = fragmentos.map((x) => String(x?.texto ?? x ?? '').trim()).filter(Boolean)
  if (!f.length || !/^Item:/i.test(f[0])) return { ok: false, porQue: 'el renglón no empieza con el marcador «Item:»' }
  const importes = []
  for (let i = f.length - 1; i >= 1 && importes.length < 2; i--) if (RE_IMPORTE.test(f[i])) importes.unshift(i)
  if (importes.length < 2) return { ok: false, porQue: 'faltan las dos celdas de importe (MO mín. y MO máx.)' }
  const min = importeAr(f[importes[0]].replace('$', ''))
  const max = importeAr(f[importes[1]].replace('$', ''))
  if (min === null || max === null) return { ok: false, porQue: 'los importes no tienen forma de importe argentino' }

  const medio = f.slice(1, importes[0])
  const ultimo = medio[medio.length - 1] ?? ''
  const conEtiqueta = ultimo.match(/^Unid\.?:?\s*(.+)$/i)
  const unidadCruda = conEtiqueta ? conEtiqueta[1].trim() : (RE_UNIDAD_SUELTA.test(ultimo) ? ultimo : null)
  if (!unidadCruda) return { ok: false, porQue: `no se pudo aislar la unidad: la última celda antes de los importes dice «${ultimo}»` }
  const descripcion = medio.slice(0, -1).join(' ').replace(/\s+/g, ' ').trim()
  if (!descripcion) return { ok: false, porQue: 'la fila tiene unidad e importes pero no descripción' }
  return { ok: true, descripcion, unidadCruda, unidad: normalizarUnidad(unidadCruda), mo_min: min, mo_max: max }
}

/**
 * LA TABLA NORMALIZADA. PURA.
 *
 * `paginas` es lo que devuelve `renglones()` de la ingesta de PDF: por página, renglones ordenados
 * de arriba hacia abajo, cada uno con sus fragmentos ya ordenados por X. El rubro corriente se
 * arrastra dentro de la página y también ENTRE páginas —la tabla de REVOQUES sigue en la hoja
 * siguiente sin repetir el encabezado—, pero cada vez que aparece uno nuevo, manda el nuevo.
 *
 * Todo renglón que parece un ítem y no se puede leer entero sale en `noLeidos`. Un parser que
 * descarta en silencio lo que no entiende produce una tabla que parece completa.
 */
export function parsearManoDeObra(paginas = [], { periodo = null, fuente = null, archivo = null } = {}) {
  const items = []
  const noLeidos = []
  let rubro = null
  for (const [i, renglones] of paginas.entries()) {
    for (const r of renglones) {
      const texto = String(r?.texto ?? '')
      const encabezado = encabezadoDeRubro(r)
      if (encabezado) rubro = encabezado
      if (!/^Item:/i.test(texto)) continue
      const leido = parsearRenglonItem(r?.items ?? [])
      if (!leido.ok) { noLeidos.push({ pagina: i + 1, texto: texto.slice(0, 160), porQue: leido.porQue }); continue }
      const { descripcion, observaciones } = partirDescripcion(leido.descripcion)
      items.push({
        codigo: codigoDe(rubro, descripcion),
        rubro, descripcion,
        unidad: leido.unidad, unidadCruda: leido.unidadCruda,
        mo_min: leido.mo_min, mo_max: leido.mo_max,
        moneda: 'ARS',
        periodo, fuente, archivo,
        pagina: i + 1,
        observaciones,
        clasificacion: 'REFERENCIA_EXTERNA_LOCAL',
      })
    }
  }
  // Los rubros salen de los ítems y no de los encabezados vistos: un encabezado sin una sola fila
  // debajo no es un rubro de la tabla, es un renglón que se parecía a uno.
  const rubros = [...new Set(items.map((i) => i.rubro))]
  return { periodo, fuente, archivo, rubros, items, noLeidos, total: items.length }
}
