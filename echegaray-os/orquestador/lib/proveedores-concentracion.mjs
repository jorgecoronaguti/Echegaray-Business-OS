// DÓNDE DEJA DE INFORMAR LA CUENTA CORRIENTE.
//
// POR QUÉ EXISTE (04/08). La sección 2 listaba los 105 proveedores comerciales y terminaba en
// `Google $25` y `Estilo Herrajes $9.197`. La pregunta que esa sección contesta es CONCENTRACIÓN DE
// PROVEEDOR —con quién se gasta— y para eso las últimas sesenta filas no aportan nada: entierran las
// que sí. Un proveedor de $25 no se negocia, no se financia y no es un riesgo de suministro.
//
// EL CORTE ES POR PLATA ACUMULADA, NO POR CANTIDAD DE FILAS. `TOP = 30` (lo que había antes en el
// generador de texto) es un número arbitrario: con esta distribución dejaba $28M afuera, y el día
// que la empresa tenga 200 proveedores seguiría mostrando 30. El acumulado se mueve con la realidad.
//
// POR QUÉ 95% Y NO 80% NI 90%, medido sobre el archivo del 04/08/2026 ($286.407.051 en 105
// proveedores comerciales):
//
//   umbral   listados   resto (N)   resto ($)     el resto pesaría, entre los proveedores…
//   80%      19         86          56.703.726    el 2º más grande de la empresa
//   90%      32         73          28.227.929    el 2º más grande de la empresa
//   95%      47         58          13.917.592    el 3º
//   98%      63         42           5.603.868    el 12º
//
// Al 90% el renglón "resto" sería la SEGUNDA línea más grande del cuadro: deja de ser un residuo y
// pasa a ser un bloque escondido — justo lo que el corte quiere evitar. Al 98% se ahorran 42 filas de
// 105 y el cuadro sigue siendo una pared. El 95% es el único que corta de verdad (más de la mitad de
// las filas) dejando un resto que no compite con las líneas visibles. Es además el corte A+B del
// análisis ABC de abastecimiento, que es la disciplina que hace esta pregunta.
//
// EL UMBRAL ES UN PARÁMETRO DECLARADO, no un número enterrado: `escalones()` imprime la tabla de
// arriba en cada corrida en seco, así que moverlo es una decisión con evidencia y no una corazonada.

// ═══ LAS COLUMNAS LAS DA EL ENCABEZADO, NUNCA UN OFFSET (17/09/2026) ═══
//
// Acá vivía un objeto de offsets fijos { proveedor: 4, total: 14, comercial: 35, cuit: 38 }. El 14/09
// se insertó «Obra» en Compras L y todo lo de la derecha se corrió una columna: el corte siguió leyendo
// «IVA» como Total y «Orden sin fecha (OS)» como ¿comercial?. El TOTAL del pie (SUMIFS por encabezado)
// decía $340.854.882, el corte $408.845, y como el corte es quien elige qué proveedores lista la
// dinámica, Proveedores mostró UN proveedor y «Resto (126)» por $331M. `proveedores-cuenta-corriente.mjs`
// ya se había migrado; éste no. Ahora el índice es obligatorio y sale de `columnasDeCompras`
// (lib/proveedores-seccion2-pie.mjs): sin índice no hay respaldo posicional, hay error.

const CLAVES = ['proveedor', 'total', 'comercial']

function exigirIndices(idx) {
  const faltan = CLAVES.filter((k) => !Number.isInteger(idx?.[k]) || idx[k] < 0)
  if (faltan.length) {
    throw new Error(`proveedores-concentracion: faltan los índices de Compras por encabezado (${faltan.join(', ')}) — no se adivina una columna`)
  }
  return idx
}

/** Cuánto del gasto tiene que quedar VISIBLE. Ver la tabla de la cabecera. */
export const UMBRAL = 0.95

/** Los umbrales que se muestran en seco para poder discutir el corte con números. */
export const ESCALONES = Object.freeze([0.8, 0.9, 0.95, 0.98])


/**
 * EL GASTO POR PROVEEDOR, DE MAYOR A MENOR.
 *
 * El nombre se toma con `trim()` porque es la clave con la que después se filtra la dinámica: si acá
 * se agrupa " Alumetal" y el `visibleValues` dice "Alumetal", la dinámica no lo muestra y no da error.
 *
 * Las filas comerciales SIN NOMBRE de proveedor no se descartan: su plata existe y tiene que seguir
 * sumando. Van a un grupo aparte con nombre vacío, que nunca puede quedar listado (una dinámica no
 * puede filtrar por "el vacío") y por eso cae siempre en el resto — donde la plata se conserva.
 *
 * @param {Array<Array<any>>} filas  la grilla de Compras desde la primera fila de datos
 * @param {{proveedor:number, total:number, comercial:number}} idx  índices base 0, por encabezado
 * @returns {Array<{proveedor:string, total:number, comprobantes:number}>}
 */
export function gastoPorProveedor(filas = [], idx) {
  const { proveedor, total, comercial } = exigirIndices(idx)
  const cuenta = new Map()
  for (const f of filas) {
    if (String(f?.[comercial] ?? '').trim() !== '1') continue
    const crudo = String(f?.[proveedor] ?? '')
    const p = crudo.trim()
    const a = cuenta.get(p) ?? { proveedor: p, total: 0, comprobantes: 0, variantes: new Set() }
    a.total += Number(f?.[total]) || 0
    a.comprobantes += p === '' ? 0 : 1 // COUNTA de la dinámica cuenta el proveedor, no la fila
    if (p !== '') a.variantes.add(crudo)
    cuenta.set(p, a)
  }
  return [...cuenta.values()].sort((a, b) => b.total - a.total || a.proveedor.localeCompare(b.proveedor))
}

/**
 * EL CORTE: los proveedores que acumulan `umbral` del gasto, y todo lo demás en una línea.
 *
 * La invariante que hace que el corte sea aceptable —y que el test protege— es que
 * `sum(listados) + resto.total === total` AL PESO. Un corte que pierde plata es peor que la lista
 * larga: el cuadro pasaría a decir algo falso en vez de algo aburrido.
 *
 * El proveedor sin nombre nunca se lista aunque sea grande: la dinámica lo filtra por nombre y un
 * nombre vacío no se puede declarar en `visibleValues`. Sale reportado aparte para que se vea.
 *
 * @param {Array<Array<any>>} filas   la grilla de Compras
 * @param {{umbral?:number, idx:{proveedor:number, total:number, comercial:number}}} opciones
 */
export function cortePorConcentracion(filas = [], { umbral = UMBRAL, idx } = {}) {
  const orden = gastoPorProveedor(filas, idx)
  const total = orden.reduce((a, p) => a + p.total, 0)
  const comprobantes = orden.reduce((a, p) => a + p.comprobantes, 0)
  const listados = []
  let acumulado = 0
  for (const p of orden) {
    if (total > 0 && acumulado / total >= umbral) break
    if (p.proveedor === '') continue // no se puede filtrar por el vacío: va al resto
    listados.push(p)
    acumulado += p.total
  }
  const restoFilas = orden.filter((p) => !listados.includes(p))
  return {
    umbral,
    total,
    comprobantes,
    listados,
    visible: acumulado,
    cobertura: total > 0 ? acumulado / total : 0,
    sinNombre: orden.find((p) => p.proveedor === '') ?? null,
    resto: {
      cantidad: restoFilas.length,
      total: restoFilas.reduce((a, p) => a + p.total, 0),
      comprobantes: restoFilas.reduce((a, p) => a + p.comprobantes, 0),
    },
  }
}

/**
 * LA TABLA DE LA CABECERA, CALCULADA SOBRE EL ARCHIVO DE HOY.
 *
 * Se imprime en cada corrida en seco. Mover el umbral no es una opinión: es mirar esta tabla.
 */
export function escalones(filas = [], idx, umbrales = ESCALONES) {
  return umbrales.map((u) => {
    const c = cortePorConcentracion(filas, { umbral: u, idx })
    return { umbral: u, listados: c.listados.length, restoN: c.resto.cantidad, restoTotal: c.resto.total }
  })
}

/**
 * LOS NOMBRES QUE VAN AL FILTRO DE LA DINÁMICA, COMO TEXTO.
 *
 * `visibleValues` compara la REPRESENTACIÓN del valor, no el valor: van strings siempre. Y nunca
 * `condition` — un filtro por condición sobre una columna de grid descarta TODAS las filas sin dar
 * error y la dinámica aparece perfecta y vacía.
 *
 * ═══ VAN TODAS LAS GRAFÍAS CRUDAS, NO LA CLAVE RECORTADA (05/08) ═══
 *
 * Acá se agrupa por el nombre con `trim()`, y hasta hoy se filtraba por ESA clave. Medido en el
 * archivo: de los 47 nombres del corte, uno —`"AGUERO "`, con un espacio al final en Compras— no
 * existe con esa grafía en la columna origen, así que la dinámica NO lo lista. El cuadro no pierde
 * un peso —el resto es TOTAL menos lo listado, por fórmula— pero un proveedor del top 47 desaparece
 * de la vista y engorda una línea muda: la peor forma de equivocarse, porque el control cierra.
 *
 * La clave sigue siendo la recortada (un proveedor con y sin espacio es UN proveedor); al filtro van
 * todas las grafías con las que aparece. La dinámica las agrupa igual, porque agrupa por valor.
 */
export function nombresVisibles(corte) {
  return (corte?.listados ?? []).flatMap((p) => (
    p.variantes?.size ? [...p.variantes] : [String(p.proveedor)]))
}
