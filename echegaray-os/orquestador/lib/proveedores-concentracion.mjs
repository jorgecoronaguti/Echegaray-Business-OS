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

/** Offsets dentro de la grilla de Compras (que arranca en A). */
export const OFF = Object.freeze({ proveedor: 4, total: 14, comercial: 35, cuit: 38 })

/** Cuánto del gasto tiene que quedar VISIBLE. Ver la tabla de la cabecera. */
export const UMBRAL = 0.95

/** Los umbrales que se muestran en seco para poder discutir el corte con números. */
export const ESCALONES = Object.freeze([0.8, 0.9, 0.95, 0.98])

const esComercial = (f) => String(f?.[OFF.comercial] ?? '').trim() === '1'

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
 * @returns {Array<{proveedor:string, total:number, comprobantes:number}>}
 */
export function gastoPorProveedor(filas = []) {
  const cuenta = new Map()
  for (const f of filas) {
    if (!esComercial(f)) continue
    const p = String(f?.[OFF.proveedor] ?? '').trim()
    const a = cuenta.get(p) ?? { proveedor: p, total: 0, comprobantes: 0 }
    a.total += Number(f?.[OFF.total]) || 0
    a.comprobantes += p === '' ? 0 : 1 // COUNTA de la dinámica cuenta el proveedor, no la fila
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
 * @param {{umbral?:number}} opciones
 */
export function cortePorConcentracion(filas = [], { umbral = UMBRAL } = {}) {
  const orden = gastoPorProveedor(filas)
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
export function escalones(filas = [], umbrales = ESCALONES) {
  return umbrales.map((u) => {
    const c = cortePorConcentracion(filas, { umbral: u })
    return { umbral: u, listados: c.listados.length, restoN: c.resto.cantidad, restoTotal: c.resto.total }
  })
}

/**
 * LOS NOMBRES QUE VAN AL FILTRO DE LA DINÁMICA, COMO TEXTO.
 *
 * `visibleValues` compara la REPRESENTACIÓN del valor, no el valor: van strings siempre. Y nunca
 * `condition` — un filtro por condición sobre una columna de grid descarta TODAS las filas sin dar
 * error y la dinámica aparece perfecta y vacía.
 */
export function nombresVisibles(corte) {
  return (corte?.listados ?? []).map((p) => String(p.proveedor))
}
