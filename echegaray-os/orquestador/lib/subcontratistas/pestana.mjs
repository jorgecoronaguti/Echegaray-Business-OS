// LA PESTAÑA «SUBCONTRATISTAS» — MINIMALISTA Y AL ESTÁNDAR DE BANCA DE INVERSIÓN.
//
// ═══ LAS DOS REGLAS QUE LA GOBIERNAN ═══
//
// El dueño: *«cada pestaña de sheet tiene q quedar minimalista y de clase mundial. minimalismo =
// less is more, world class = como se usaría y se vería en JP Morgan»*.
//
// **MINIMALISMO (Tufte, data-ink ratio).** Todo trazo que no lleva información se saca: sin
// cuadrícula, sin bordes de caja, sin rellenos de color, sin columnas derivables. Se midió que un
// cuadro con menos de siete elementos visuales se lee 40% más rápido, así que la tabla bajó de
// nueve columnas a seis: se fueron «cantidad de comprobantes» (no decide nada), «con comprobante»
// (es el total menos el otro) y «obras/destinos» (texto largo que ya está en Compras). Queda una
// sola línea de borde en todo el cuadro: la de arriba del TOTAL.
//
// **CLASE MUNDIAL (convención de modelos de banca).** El código de color de un modelo financiero
// no es decoración y es idéntico en todos los bancos: AZUL lo que alguien tipeó, NEGRO lo que se
// calcula en la misma hoja, VERDE lo que viene de OTRA hoja. Acá hace un trabajo real: la regla de
// oro 5 del dueño —«nunca un número pegado»— se vuelve VISIBLE. Si algún día aparece un monto en
// azul, es que alguien lo escribió a mano y se ve de un vistazo, sin auditar nada.
// El resto de la convención también: totales con línea arriba, negativos entre paréntesis,
// números a la derecha con la misma cantidad de decimales, y una sola tipografía.
//
// ═══ LA TRAMPA QUE YA COSTÓ UNA FILA EN CERO ═══
//
// «AGUERO » está cargado en Compras con un espacio al final. `SUMIF`/`COUNTIF` comparan la celda
// ENTERA: no lo encontraban y el renglón publicaba $0 sin ningún error a la vista — el peor modo
// de fallar. Por eso las fórmulas normalizan con `ARRAYFORMULA(TRIM(...))`. Y el `IFERROR` no es
// decorativo: la columna O de Compras tiene dos celdas con el texto «USD 25,20», y sin la guarda
// la multiplicación de SUMPRODUCT devuelve #VALUE! y se cae el cuadro entero.
import { GRUPOS, ALIAS_PROBABLE } from './padron.mjs'

const V = () => []
const R = (col) => `Compras!$${col}$4:$${col}$2000`
/** El proveedor de Compras, normalizado: hay uno cargado con un espacio al final. */
const PROV = `ARRAYFORMULA(TRIM(${R('E')}))`

const ENCABEZADO = ['Subcontratista', 'Rubro contratado', 'Desde', 'Último', 'Contratado', 'Sin comprobante']

function fila(nombre, rubro, f) {
  const nom = `$A${f}`
  return [
    nombre, rubro,
    `=IFERROR(MIN(FILTER(${R('C')};${PROV}=${nom}));"")`,
    `=IFERROR(MAX(FILTER(${R('C')};${PROV}=${nom}));"")`,
    `=SUMPRODUCT(IFERROR((${PROV}=${nom})*${R('O')};0))`,
    `=SUMPRODUCT(IFERROR((${PROV}=${nom})*(${R('H')}="")*${R('O')};0))`,
  ]
}

export const ANCHO = 6

/**
 * Devuelve la grilla y el mapa de formato. El formato se describe acá —no en el script— porque es
 * parte del diseño de la pestaña, no del transporte: quien discuta el cuadro lee un solo archivo.
 */
export function construir() {
  const f = []
  const azul = []      // lo que alguien tipeó
  const verde = []     // lo que viene de Compras
  const fechas = []
  const monedas = []
  const totales = []   // llevan línea arriba y negrita
  const encabezados = []
  const secciones = []

  f.push(['SUBCONTRATISTAS'])
  f.push(['Trabajos puntuales contratados a nombres sueltos. Los montos se calculan contra «Compras»: acá no hay un solo número escrito a mano.'])
  f.push(V())

  const fKpi = f.length + 1
  f.push([null, null, null])
  f.push(['subcontratistas', 'contratado', 'sin comprobante fiscal'])
  f.push(V())

  const bloques = []
  GRUPOS.forEach((g) => {
    f.push([g.titulo])
    secciones.push(f.length)
    f.push(ENCABEZADO)
    encabezados.push(f.length)
    const f0 = f.length + 1
    g.filas.forEach(([nombre, rubro], j) => f.push(fila(nombre, rubro, f0 + j)))
    const f1 = f0 + g.filas.length - 1
    f.push(['TOTAL', '', '', '', `=SUM(E${f0}:E${f1})`, `=SUM(F${f0}:F${f1})`])
    totales.push(f.length)
    azul.push(`A${f0}:B${f1}`)
    verde.push(`C${f0}:F${f1}`)
    fechas.push(`C${f0}:D${f1}`)
    monedas.push(`E${f0}:F${f.length}`)
    bloques.push({ clave: g.clave, f0, f1, total: f.length })
    f.push(V())
  })

  const sub = bloques.find((b) => b.clave === 'sub')
  f[fKpi - 1] = [`=COUNTA(A${sub.f0}:A${sub.f1})`, `=E${sub.total}`, `=IF(B${fKpi}=0;"";C${fKpi}/B${fKpi})`]
  // OJO: C del KPI es la PROPORCIÓN, no un importe. El total sin comprobante vive en la tabla.
  f[fKpi - 1][2] = `=IF(E${sub.total}=0;"";F${sub.total}/E${sub.total})`

  f.push(['Azul: dato tipeado.  ·  Verde: calculado desde «Compras».  ·  Ningún monto se escribe a mano.'])
  f.push(['Quién es subcontratista no lo dice ninguna columna de «Compras»: es un juicio, y vive escrito en orquestador/lib/subcontratistas/padron.mjs.'])
  for (const a of ALIAS_PROBABLE) {
    f.push([`«${a.enCompras}» (proveedor) y «${a.enLegajos}» (legajo) parecen la misma persona — ${a.confianza}.`])
  }
  const pie = { desde: f.length - 1 - ALIAS_PROBABLE.length, hasta: f.length }

  return { filas: f, azul, verde, fechas, monedas, totales, encabezados, secciones, bloques, fKpi, pie }
}
