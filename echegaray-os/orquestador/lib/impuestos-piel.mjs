// LA PIEL DE "IMPUESTOS Y FINANCIEROS" — la misma que CAJA, Cheques y Cargas Sociales.
//
// Sin reja, secciones y encabezados por tipografía + hairline (no barras rellenas), totales rulados,
// moneda sin decimales, aire. Lo propio de esta pestaña son tres cosas: la grilla mensual, las filas
// que NO son plata (alícuotas, fechas de DDJJ) y los meses PROYECTADOS en ámbar.

import { skinRequests, conContenido, MUTED, ACENTO } from './estilo-statement.mjs'
import { borrarNotas } from './nota-celda.mjs'
import { requestsTextoPorContenido } from './formato-texto-por-contenido.mjs'
import { ANCHO } from './impuestos-grilla.mjs'
import { ALERTA, ALERTA_HEREDADA } from './glifos.mjs'

/** La columna A de una alarma ARRANCA con la marca. Anclada: "…⚠…" en el medio no es una alarma. */
const MARCA_ALERTA_INICIAL = new RegExp(`^[${ALERTA}${ALERTA_HEREDADA}]`)

const AMBAR = { red: 1, green: 0.97, blue: 0.88 }
const ALARMA = { red: 0.7, green: 0.2, blue: 0.1 }
/** Un renglón vacío entre bloques respira; uno de datos no. Es el "espacio en blanco" del dueño. */
const ALTO_SEPARADOR = 32

/** El ancho de la columna A, la de los rótulos. El porqué del número está donde se aplica. */
export const ANCHO_ROTULO = 500

/**
 * NÚCLEO PURO: qué trato tipográfico le toca a cada fila, decidido por el CONTENIDO.
 *
 * ═══ POR QUÉ SE DECIDE ACÁ Y NO EN LA PIEL COMPARTIDA (06/08) ═══
 *
 * Mirando la pestaña renderizada, el dueño tenía tres cosas que no se ven en el código:
 *
 *   · el ÚNICO importe con jerarquía era el saldo a favor, y todos los demás pesaban igual entre sí:
 *     un total del hero se veía exactamente como un renglón de detalle nueve bloques más abajo;
 *   · los desgloses del hero competían con sus propios totales, en el mismo cuerpo y el mismo color;
 *   · las seis limitaciones declaradas del cierre salían en NEGRITA ROJA con una regla encima cada
 *     una, porque la piel compartida clasifica todo lo que empieza con "⚠" como total. Seis alarmas
 *     al pie no son seis alarmas: son ruido que enseña a ignorar la próxima que sí lo sea.
 *
 * La diferencia entre una alarma y una limitación declarada es si el renglón trae PLATA calculada:
 * "⚠ vencido s/verificar" lleva una suma de celdas y decide algo; "⚠ Impuesto de sellos · s/d" dice
 * que no hay dato. Se decide por contenido —como el formato de texto— y no por una lista de filas
 * que hay que mantener.
 *
 * @param {any[][]} filas la grilla del generador (índice 0 → fila 1)
 * @param {{desde:number, hasta:number, titular:number}} hero el bloque de posición, en filas 1-based.
 *   El titular queda AFUERA: se lo lleva la piel compartida, que es la única que lo agranda.
 * @returns {{alarmas:number[], notas:number[], subitems:number[], totalesHero:number[], separadores:number[]}}
 */
export function tratamientoDeFilas(filas = [], hero = null) {
  const t = { alarmas: [], notas: [], subitems: [], totalesHero: [], separadores: [] }
  const conPlata = (f) => (f || []).slice(1, 14).some((c) => typeof c === 'number'
    || (typeof c === 'string' && c.startsWith('=')))
  filas.forEach((f, i) => {
    const fila = i + 1
    const a = conContenido(f?.[0]) ? String(f[0]) : ''
    if (!a && !(f || []).some(conContenido)) { t.separadores.push(fila); return }
    // Las DOS alertas: la vigente y la que quedó publicada en las celdas. Ver `ALERTA_HEREDADA`.
    if (MARCA_ALERTA_INICIAL.test(a)) { (conPlata(f) ? t.alarmas : t.notas).push(fila); return }
    if (/^\s{2,}·\s/.test(a)) { t.subitems.push(fila); return }
    if (hero && fila >= hero.desde && fila <= hero.hasta && fila !== hero.titular && /^⇒/.test(a)) {
      t.totalesHero.push(fila)
    }
  })
  return t
}

/**
 * NÚCLEO PURO: los requests que dan los tres pesos de lectura de esta pestaña.
 *
 * Tres y no más, que es lo que un ojo distingue sin esfuerzo: el TITULAR (lo pone la piel
 * compartida), los totales del hero, y el cuerpo. Todo lo que no decide —los desgloses, las
 * limitaciones declaradas— se apaga para que los importes queden solos adelante.
 */
export function requestsDeJerarquia(sheetId, g) {
  const t = tratamientoDeFilas(g.filas || [], g.hero ? { ...g.hero, titular: g.titular } : null)
  const rq = []
  const texto = (filas, format, cols = [0, ANCHO]) => {
    for (const f of filas) {
      rq.push({
        repeatCell: {
          range: { sheetId, startRowIndex: f - 1, endRowIndex: f, startColumnIndex: cols[0], endColumnIndex: cols[1] },
          cell: { userEnteredFormat: { textFormat: { ...format, fontFamily: 'Arial' } } },
          fields: 'userEnteredFormat.textFormat',
        },
      })
    }
  }
  // El total del hero pesa más que un total de detalle: son las tres cifras con las que se decide.
  texto(t.totalesHero, { foregroundColor: ACENTO, bold: true, fontSize: 11 })
  // El desglose es el respaldo del total, no su competencia.
  texto(t.subitems, { foregroundColor: MUTED, bold: false, fontSize: 9 })
  // Una alarma con plata adentro se ve; una limitación declarada se lee cuando se la busca.
  texto(t.alarmas, { foregroundColor: ALARMA, bold: true, fontSize: 10 }, [0, 1])
  texto(t.notas, { foregroundColor: MUTED, bold: false, fontSize: 9 })
  // Y la regla que la piel compartida le puso a cada "⚠" por clasificarlo como total: seis reglas al
  // pie de la pestaña, una debajo de la otra, sobre renglones que no totalizan nada.
  for (const f of t.notas) {
    rq.push({
      updateBorders: {
        range: { sheetId, startRowIndex: f - 1, endRowIndex: f, startColumnIndex: 0, endColumnIndex: ANCHO },
        top: { style: 'NONE' },
      },
    })
  }
  // EL AIRE. El dueño pidió "mucho espacio en blanco": entre bloque y bloque hay UNA fila, y a 21 px
  // no separa nada. Se agranda el separador en vez de agregar filas — una fila nueva correría todas
  // las referencias de abajo.
  for (const f of t.separadores) {
    rq.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: f - 1, endIndex: f },
        properties: { pixelSize: ALTO_SEPARADOR },
        fields: 'pixelSize',
      },
    })
  }
  return rq
}

/**
 * @param {object} g la grilla armada: {filas, titular, hero, alicuotas, textos, ambar, congeladas}
 * @param {number} filasHoja cuántas filas tiene hoy la pestaña
 */
export async function formatear(google, fileId, sheetId, g, filasHoja = 0) {
  // SIN NOTAS. El dueño: "quitá las notas de impuestos y financieros, son confusas". Veintiocho
  // triangulitos amarillos son veintiocho invitaciones a interrumpir la lectura. La trazabilidad no
  // se pierde: cada sección declara su fuente en su título, y lo que hace falta ver —una fecha
  // supuesta, un mes proyectado— viaja en el rótulo o en el color, no escondido detrás de un hover.
  const { requests: notas } = borrarNotas(g.filas, ANCHO - 1, sheetId)
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  // Los doce meses más el total: moneda sin decimales, a la derecha. Es lo que permite comparar hacia
  // abajo sin volver a leer el encabezado en cada bloque. El cero se dibuja "—": un guión es "no hay
  // nada que pagar ese día", y un $0 se lee como un importe que alguien calculó.
  fmt(r(3, n, 1, 14), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  // La columna A rebalsa sobre las celdas vacías de su derecha: así un título de sección no se parte.
  fmt(r(0, n, 0, 1), 'userEnteredFormat.wrapStrategy', { wrapStrategy: 'OVERFLOW_CELL' })

  g.filas.forEach((f, i) => {
    const a = String(f?.[0] ?? '')
    // Los encabezados son rótulos, no importes: sin formato de moneda encima.
    if (/^(Concepto|Fecha y concepto|Línea de financiamiento|LA POSICIÓN)/.test(a)) {
      fmt(r(i, i + 1, 1, 14), 'userEnteredFormat(numberFormat,horizontalAlignment)', { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' })
    }
  })
  for (const f of g.alicuotas ?? []) fmt(r(f - 1, f, 1, 14), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.00%;;"—"' } })
  for (const f of g.textos ?? []) fmt(r(f - 1, f, 1, 14), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' })

  // ═══ EL ÁMBAR VA POR CELDA, NO POR COLUMNA (06/08) ═══
  //
  // Antes pintaba la columna del mes entera de la fila 4 para abajo. Con la posición y el calendario
  // ARRIBA del detalle, la columna B ya no es "enero": es el importe del hero y el del calendario.
  // Pintar la columna habría teñido de proyección la posición de HOY, que es exactamente lo contrario
  // de lo que el color dice. Una proyección que se ve igual que un hecho termina leyéndose como un
  // hecho; un hecho pintado de proyección también miente, y en el sentido que más caro sale.
  for (const { fila, mes } of g.ambar ?? []) {
    fmt(r(fila - 1, fila, mes, mes + 1), 'userEnteredFormat.backgroundColor', { backgroundColor: AMBAR })
  }

  // Al sacar el muro de texto de la derecha, las filas quedaban con el alto que ese texto necesitaba
  // para envolver: la pestaña medía tres pantallas de aire.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n }, properties: { pixelSize: 21 }, fields: 'pixelSize' } })
  // 400 Y NO 360 (06/08). El rótulo más largo de la pestaña es el del hero —"⇒ PRÓXIMO VENCIMIENTO ·
  // 07/08 · Prendario Ford XLS (Santander)"— y a 360 px se dibujaba cortado al medio, con el
  // paréntesis abierto, porque la celda de al lado tiene el importe y no hay adónde rebalsar. Un
  // titular cortado no es un titular: es un error de imprenta. El rótulo además se acortó (el emisor
  // entre paréntesis se saca), así que son dos cinturones para el mismo problema.
  //
  // ═══ 500 DESDE EL 15/08: EL RENGLÓN DEL CALENDARIO CRECIÓ CON LA DECISIÓN DEL DUEÑO ═══
  //
  // Una línea del calendario ya no es sólo el vencimiento: cuando el dueño la revisó, lleva su
  // veredicto pegado al final. `A26` mide 86 caracteres —"16/07 · Ingresos Brutos San Juan (DGR) ·
  // jun ✓ 13/08 lo revisó el dueño: «no afectan»"— y en 400px entran 70, con el importe al lado
  // impidiendo el derrame. Lo que se cortaba era el final: justo la parte que dice que ese
  // vencimiento YA está resuelto, o sea la razón por la que no hay que hacer nada con él.
  //
  // SE ENSANCHA EN VEZ DE ACORTAR PORQUE ALCANZA: 86 caracteres piden 490px. El criterio del archivo
  // es acortar cuando ningún ancho razonable entra; acá entra con 500 y sobra para un rótulo más
  // largo. Acortar habría significado tirar el nombre de quien decidió o su palabra textual, que es
  // lo único que hace verificable la decisión.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: ANCHO_ROTULO }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 13 }, properties: { pixelSize: 108 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 124 }, fields: 'pixelSize' } })
  // La columna de procedencia ya no muestra texto (se vacía): angosta.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } })
  req.push(...notas)

  // ═══ DOS GUARDAS ANTES DE FORMATEAR ═══
  //
  // 1. LA GRILLA TIENE QUE ENTRAR EL BLOQUE. La pestaña tenía 69 filas, el bloque creció, el formateo
  //    pidió `A70:O69` y Google rechazó el lote ENTERO con 400. Lo grave no fue el error: los VALORES
  //    ya se habían escrito, así que quedaron las fórmulas nuevas sin el rango con nombre que publican
  //    las líneas de abajo —que nunca se ejecutaron— y la pestaña mostró `#NAME?` en toda la
  //    proyección. Una escritura a medias es peor que ninguna.
  // 2. UN RANGO VACÍO NO SE MANDA. Un `startRowIndex >= endRowIndex` cuesta el lote completo. Se
  //    descarta acá, una vez, en vez de esperar que cada `fmt` de arriba se acuerde.
  let alto = filasHoja ?? 0
  if (n > alto) {
    await google.spreadsheetBatchUpdate(fileId, [{ appendDimension: { sheetId, dimension: 'ROWS', length: n + 5 - alto } }])
    console.log(`  la grilla pasa de ${alto} a ${n + 5} filas: el bloque no entraba`)
    alto = n + 5
  }
  const vacio = (q) => {
    const g0 = q?.repeatCell?.range ?? q?.updateCells?.range ?? q?.unmergeCells?.range
    return g0 && Number(g0.startRowIndex ?? 0) >= Number(g0.endRowIndex ?? 0)
  }
  const descartados = req.filter(vacio).length
  if (descartados) console.log(`  ⚠ ${descartados} pedido(s) de formato con rango vacío, descartados`)
  await google.spreadsheetBatchUpdate(fileId, req.filter((q) => !vacio(q)))
  // CONGELADAS HASTA EL HERO: al desplazarse por el detalle, la posición sigue arriba. Es lo que
  // pidió el dueño ("la pantalla muestra PRIMERO la posición") y no sirve de nada si se va al scrollear.
  await google.spreadsheetBatchUpdate(fileId, skinRequests({
    sheetId, filas: g.filas, cols: ANCHO, congeladas: g.congeladas ?? 2, titular: g.titular, filasHoja: alto,
  }))

  // ═══ LA JERARQUÍA PROPIA DE ESTA PESTAÑA — DESPUÉS DE LA PIEL, O LA PIEL SE LA LLEVA PUESTA ═══
  const jerarquia = requestsDeJerarquia(sheetId, g)
  if (jerarquia.length) await google.spreadsheetBatchUpdate(fileId, jerarquia)

  // ═══ UN TEXTO SE DIBUJA COMO TEXTO, DECIDIDO POR CONTENIDO ═══
  // Una celda que dice "s/d" con formato de plata se lee como si hubiera un importe que no se ve. No
  // se arregla con una lista de rangos que hay que mantener: se decide por CONTENIDO. Va DESPUÉS de
  // la piel, o la piel se lo lleva puesto: los `repeatCell` se aplican en orden.
  const { requests: rTxt, celdas } = requestsTextoPorContenido(sheetId, g.filas || [])
  if (rTxt.length) await google.spreadsheetBatchUpdate(fileId, rTxt)
  if (celdas) console.log(`  ${celdas} celda(s) de TEXTO con su formato de texto (no de plata)`)
  // Ninguna fila queda OCULTA: un colapso de una versión anterior dejó filas con hiddenByUser=true,
  // y borrar el grupo no las vuelve a mostrar.
  await google.spreadsheetBatchUpdate(fileId, [{ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n + 5 }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } }]).catch(() => {})
}
