// DE UNA PLANILLA A CANTIDADES QUE SE PUEDEN DEFENDER. PURO — 0 red, 0 tokens.
//
// ═══ QUÉ PROBLEMA RESUELVE ═══
//
// La DoD dejó el criterio #3 en NO_VERIFICABLE con una frase exacta: «las 26 partidas de la corrida
// traen cantidad pero ninguna trae evidencia, fuente ni nota». Eso pasaba porque las 26 salían de
// `leerEstado()` —filas de Postgres precargadas—, y una fila de la base no tiene de dónde sacar la
// evidencia: el documento que la originó ya no está en el camino.
//
// Este módulo cierra ese hueco por el otro lado: toma la planilla YA LEÍDA por
// `ingesta/planilla.mjs` —con hoja, celda, fórmula e inputs— y produce cantidades donde cada una
// arrastra la cadena completa hasta los números que una persona escribió a mano.
//
//   P3 = H3          ← la celda del resumen
//   H3 = C3*D3*E3*F3 ← el cómputo
//   C3 = 11, D3 = 1.2, E3 = 1, F3 = 0.75   ← las hojas del árbol: literales, nadie los calculó
//
// Con esa cadena, «9,9 m³ de hormigón» deja de ser un número dicho de memoria: es 11 bases de
// 1,20 × 1,00 × 0,75, y cada factor se puede discutir por separado.
//
// ═══ LO QUE NO HACE, A PROPÓSITO ═══
//
// NO recalcula. El valor que informa es el que la planilla trae cacheado, y la fórmula viaja al lado
// para que se pueda auditar. Reimplementar el motor de cálculo de Excel para «verificar» sería
// construir un segundo evaluador que se desincroniza — y `evaluar-formula-sheet.mjs` ya existe para
// cuando haga falta esa comprobación, que es una decisión distinta y de otro dueño.
//
// NO elige entre dos bloques de cantidades cuando los dos califican. Devuelve los dos y quien llama
// decide con criterio de negocio: elegir en silencio inventa el resultado de una discusión que no
// ocurrió.
//
// NO convierte un hueco en cero. Una celda sin valor sale como FALTA_DATO con su ubicación, no como
// una cantidad de 0 — y una celda `#REF!` sale como ERROR, que tampoco es 0.

import { FUENTE, dato, evidencia, faltaDato } from '../plano/fuente.mjs'
import { filaDe, filasDe, letraDeColumna } from '../ingesta/planilla.mjs'

/** En qué estado quedó una cantidad. No hay un estado «cero»: el cero es un valor, no un estado. */
export const ESTADO = Object.freeze({
  DEFENDIBLE: 'DEFENDIBLE',
  SIN_UNIDAD: 'SIN_UNIDAD',
  ERROR: 'ERROR',
  FALTA_DATO: 'FALTA_DATO',
})

/** Los rótulos que se reconocen en un encabezado. Salen de los encabezados REALES del data room
 *  (`Cantidad`, `Unidad`, `Vol Total`, `Tipo`, `Proveedor`), no de un vocabulario teórico. */
export const ROTULO = Object.freeze({
  cantidad: /^(cant\.?|cantidad|total|vol\.?\s*total|superficie|metros?|m2|m3|ml)$/i,
  unidad: /^(un\.?|unidad|unidades|u\.?m\.?|medida)$/i,
  descripcion: /^(descripci[oó]n|detalle|item|[ií]tem|tarea|designaci[oó]n|elemento|rubro)$/i,
  tipo: /^(tipo|clase|calidad|material)$/i,
  proveedor: /^(proveedor|prov\.?|origen)$/i,
})

/** El texto normalizado de una celda de encabezado. PURA. */
const rotulo = (c) => String(c?.texto ?? c?.valor ?? '').trim().replace(/\s+/g, ' ')

/**
 * LA FILA DE ENCABEZADO DE UNA HOJA. PURA.
 *
 * Se busca en las primeras `hasta` filas la que más rótulos conocidos tenga. NO se asume la fila 1:
 * en el COMPUTO.xlsx de Quattropani el encabezado está en la 2 y la 1 trae un título suelto
 * («Resumen»). Devuelve `null` si ninguna fila llega a dos rótulos — una hoja sin encabezado
 * reconocible se declara, no se adivina.
 */
export function encabezadoDe(hoja, { hasta = 12, minimo = 2 } = {}) {
  let mejor = null
  for (const f of filasDe(hoja).filter((n) => n <= hasta)) {
    const celdas = [...filaDe(hoja, f).values()]
    const cuenta = celdas.filter((c) => Object.values(ROTULO).some((re) => re.test(rotulo(c)))).length
    if (cuenta >= minimo && (!mejor || cuenta > mejor.cuenta)) mejor = { fila: f, cuenta, celdas }
  }
  return mejor
}

/** Las columnas contiguas de un encabezado, partidas en bloques por los huecos. PURA.
 *  Cada bloque es una tabla distinta: en el COMPUTO real, B–N es el cómputo dimensional y P–S es el
 *  resumen, y son dos tablas que comparten fila de encabezado y filas de datos. */
export function bloquesDe(encabezado) {
  const cols = (encabezado?.celdas ?? []).slice().sort((a, b) => a.columna - b.columna)
  const bloques = []
  let actual = null
  for (const c of cols) {
    if (!actual || c.columna > actual.hasta + 1) { actual = { desde: c.columna, hasta: c.columna, columnas: [] }; bloques.push(actual) }
    actual.hasta = c.columna
    actual.columnas.push({ letra: c.letra, columna: c.columna, rotulo: rotulo(c) })
  }
  return bloques
}

/** El papel de cada columna de un bloque. PURA. */
export function papelesDe(bloque) {
  const papel = {}
  for (const c of bloque.columnas ?? []) {
    for (const [nombre, re] of Object.entries(ROTULO)) {
      if (re.test(c.rotulo) && !papel[nombre]) papel[nombre] = c.letra
    }
  }
  return papel
}

/**
 * LOS BLOQUES QUE SON UNA TABLA DE CANTIDADES. PURA.
 *
 * Califica el que tiene columna de cantidad Y columna de unidad: sin unidad, un número es una cifra
 * y no una cantidad —11 bases y 11 m³ se escriben igual—. Si califican varios se devuelven TODOS.
 *
 * En el COMPUTO real hay dos columnas rotuladas «Cantidad»: la C (cuántas piezas) y la P (la
 * cantidad del resumen, con su unidad al lado). Quedarse con la primera que aparece daba «11» donde
 * la cantidad de obra es «9,9 m³». La unidad es la que desempata, y por eso está en la condición.
 */
export function bloquesDeCantidad(encabezado) {
  return bloquesDe(encabezado)
    .map((b) => ({ ...b, papeles: papelesDe(b) }))
    .filter((b) => b.papeles.cantidad && b.papeles.unidad)
}

/**
 * LA CADENA DE DERIVACIÓN DE UNA CELDA. PURA.
 *
 * Sigue las fórmulas hacia atrás hasta llegar a números que nadie calculó. Es la respuesta a «¿de
 * dónde salió esto?» y lo único que convierte una cantidad en algo discutible.
 *
 * Los rangos (`SUMA(P3:P10)`) se registran como rango y no se expanden: se declara que el input es
 * un rango, que es lo cierto, en vez de fabricar diez eslabones. Las referencias a OTRA hoja se
 * marcan `externa` — este recorrido tiene una hoja sola, y decir que un input «no está» cuando en
 * realidad está en otra pestaña sería un FALTA_DATO falso.
 */
export function cadenaDe(hoja, direccion, { profundidad = 8, vistas = new Set() } = {}) {
  const c = (hoja?.celdas ?? []).find((x) => x.celda === direccion)
  if (!c) return { celda: direccion, hoja: hoja?.nombre ?? null, estado: 'AUSENTE', valor: null, formula: null, inputs: [] }
  const base = { celda: direccion, hoja: hoja?.nombre ?? null, tipo: c.tipo, valor: c.valor, texto: c.texto, formula: c.formula }
  if (!c.formula) return { ...base, estado: c.tipo === 'ERROR' ? 'ERROR' : 'LITERAL', inputs: [] }
  if (profundidad <= 0 || vistas.has(direccion)) return { ...base, estado: 'CORTADA', inputs: [], porQue: vistas.has(direccion) ? 'referencia circular' : 'se alcanzó el fondo del recorrido' }
  const siguientes = new Set([...vistas, direccion])
  const inputs = c.inputs.map((r) => {
    if (r.hoja) return { celda: `${r.hoja}!${r.desde}${r.hasta ? ':' + r.hasta : ''}`, estado: 'EXTERNA', valor: null, formula: null, inputs: [] }
    if (r.rango) return { celda: `${r.desde}:${r.hasta}`, estado: 'RANGO', valor: null, formula: null, inputs: [] }
    return cadenaDe(hoja, r.desde, { profundidad: profundidad - 1, vistas: siguientes })
  })
  return { ...base, estado: 'CALCULADA', inputs }
}

/** Los eslabones de una cadena, aplanados en el orden en que se recorrieron. PURA. */
export function aplanar(cadena, salida = []) {
  if (!cadena) return salida
  salida.push({ celda: cadena.celda, estado: cadena.estado, valor: cadena.valor, formula: cadena.formula })
  for (const i of cadena.inputs ?? []) aplanar(i, salida)
  return salida
}

/** El nombre del elemento de una fila: la primera celda de TEXTO a la izquierda del bloque. PURA.
 *  En el COMPUTO real el bloque de resumen (P–S) no tiene columna de descripción, y el nombre del
 *  elemento vive en la B — la misma fila, otra tabla. Buscar sólo adentro del bloque devolvía
 *  cantidades anónimas. */
export function elementoDe(hoja, fila, bloque, papeles) {
  const celdas = filaDe(hoja, fila)
  if (papeles.descripcion) {
    const c = celdas.get(papeles.descripcion)
    if (c && c.tipo === 'TEXTO') return { nombre: String(c.valor), celda: c.celda }
  }
  for (let col = 1; col < bloque.desde; col++) {
    const c = celdas.get(letraDeColumna(col))
    if (c && c.tipo === 'TEXTO' && String(c.valor).trim()) return { nombre: String(c.valor).trim(), celda: c.celda }
  }
  return null
}

/** La línea literal de una fila, para que la evidencia tenga QUÉ dice y no sólo DÓNDE. PURA. */
export function literalDe(hoja, fila) {
  return [...filaDe(hoja, fila).values()]
    .map((c) => `${c.letra}=${c.texto ?? ''}`)
    .join(' | ')
    .slice(0, 300)
}

/**
 * UNA FILA DEL BLOQUE, CONVERTIDA EN CANTIDAD CON PROCEDENCIA. PURA.
 *
 * La fuente es `CALCULADO` cuando la celda trae fórmula y `DOCUMENTO_TECNICO` cuando es un número
 * escrito a mano — y no al revés: un número tipeado en una planilla es una afirmación del documento,
 * no un cálculo, y merecen confianza distinta.
 */
export function cantidadDeFila(hoja, fila, bloque, { documento, hash = null, driveId = null } = {}) {
  const papeles = bloque.papeles ?? papelesDe(bloque)
  const celdas = filaDe(hoja, fila)
  const cCant = celdas.get(papeles.cantidad)
  const cUni = celdas.get(papeles.unidad)
  const el = elementoDe(hoja, fila, bloque, papeles)
  if (!el && !cCant) return null
  const ubicacion = `${hoja.nombre}!${papeles.cantidad}${fila}`
  const ev = evidencia({ archivo: documento, archivoId: driveId, lamina: hoja.nombre, textoLiteral: literalDe(hoja, fila), ubicacion })
  const comun = {
    elemento: el?.nombre ?? null,
    elementoCelda: el?.celda ?? null,
    hoja: hoja.nombre,
    fila,
    documento,
    hash,
    unidad: cUni?.valor != null ? String(cUni.valor) : null,
    evidencia: ev,
  }
  if (!cCant || cCant.tipo === 'VACIA') {
    return { ...comun, estado: ESTADO.FALTA_DATO, valor: null, cadena: null, provenance: [ubicacion], dato: faltaDato({ que: `cantidad de «${el?.nombre ?? 'elemento sin nombre'}»`, porque: `la celda ${ubicacion} está vacía en el documento`, unidad: comun.unidad }) }
  }
  if (cCant.tipo === 'ERROR') {
    return { ...comun, estado: ESTADO.ERROR, valor: null, cadena: null, provenance: [ubicacion], dato: faltaDato({ que: `cantidad de «${el?.nombre ?? 'elemento sin nombre'}»`, porque: `la celda ${ubicacion} tiene un error de planilla (${cCant.texto}): un error no es un cero`, unidad: comun.unidad }) }
  }
  if (cCant.tipo !== 'NUMERO') {
    return { ...comun, estado: ESTADO.FALTA_DATO, valor: null, cadena: null, provenance: [ubicacion], dato: faltaDato({ que: `cantidad de «${el?.nombre ?? 'elemento sin nombre'}»`, porque: `la celda ${ubicacion} tiene «${cCant.texto}», que no es un número`, unidad: comun.unidad }) }
  }
  const cadena = cadenaDe(hoja, cCant.celda)
  const plano = aplanar(cadena)
  return {
    ...comun,
    estado: comun.unidad ? ESTADO.DEFENDIBLE : ESTADO.SIN_UNIDAD,
    valor: cCant.valor,
    formula: cCant.formula,
    cadena,
    provenance: plano.map((p) => `${hoja.nombre}!${p.celda}${p.formula ? ` = ${p.formula}` : ` = ${p.valor}`}`),
    literales: plano.filter((p) => p.estado === 'LITERAL').map((p) => ({ celda: `${hoja.nombre}!${p.celda}`, valor: p.valor })),
    dato: dato({
      valor: cCant.valor,
      unidad: comun.unidad,
      fuente: cCant.formula ? FUENTE.CALCULADO : FUENTE.DOCUMENTO_TECNICO,
      evidencia: ev,
      formula: cCant.formula,
      entradas: plano.filter((p) => p.estado === 'LITERAL').map((p) => `${p.celda}=${p.valor}`),
      nota: comun.unidad ? null : `la fila no declara unidad: ${cCant.valor} sin unidad no es una cantidad de obra`,
    }),
  }
}

/**
 * EL TAKEOFF DE UNA HOJA. PURA. Devuelve una entrada por fila de cada bloque de cantidades.
 *
 * Cuando la hoja tiene MÁS DE UN bloque que califica, salen los dos con su nombre de bloque: la
 * decisión de cuál vale es de negocio y se toma arriba, con las dos cifras a la vista.
 */
export function takeoffDeHoja(hoja, { documento, hash = null, driveId = null } = {}) {
  const enc = encabezadoDe(hoja)
  if (!enc) return { hoja: hoja?.nombre ?? null, encabezado: null, bloques: [], cantidades: [], porQue: 'ninguna de las primeras 12 filas tiene dos rótulos reconocibles: no hay tabla que leer acá' }
  const bloques = bloquesDeCantidad(enc)
  if (!bloques.length) {
    return { hoja: hoja.nombre, encabezado: enc.fila, bloques: [], cantidades: [], porQue: `la fila ${enc.fila} es un encabezado pero ningún bloque tiene columna de cantidad Y de unidad juntas: un número sin unidad no es una cantidad de obra` }
  }
  const cantidades = []
  for (const b of bloques) {
    const marca = `${letraDeColumna(b.desde)}–${letraDeColumna(b.hasta)}`
    for (const f of filasDe(hoja).filter((n) => n > enc.fila)) {
      const c = cantidadDeFila(hoja, f, b, { documento, hash, driveId })
      if (c) cantidades.push({ ...c, bloque: marca })
    }
  }
  return { hoja: hoja.nombre, encabezado: enc.fila, bloques: bloques.map((b) => ({ marca: `${letraDeColumna(b.desde)}–${letraDeColumna(b.hasta)}`, papeles: b.papeles })), cantidades, porQue: null }
}

/** Cómo se comparan dos cantidades del mismo elemento. Un 0,5% de diferencia es redondeo; un 10% es
 *  otra decisión de proyecto. El umbral se declara acá y NO se toca para que un caso cierre. */
export const TOLERANCIA_RELATIVA = 0.005

/**
 * DOS LECTURAS DEL MISMO ELEMENTO, CONTRASTADAS. PURA.
 *
 * Devuelve un `CONFLICTO` por cada elemento donde las dos fuentes dicen cosas distintas, CON LAS DOS
 * CITAS. No resuelve: no hay forma de saber desde acá si «Real» le gana a «Presupuestado» — eso lo
 * decide quien conoce la obra. Lo que sí hace es impedir que la diferencia pase inadvertida.
 */
export function contrastar(a = [], b = [], { etiquetaA = 'A', etiquetaB = 'B' } = {}) {
  const porNombre = new Map()
  for (const x of b) if (x.elemento) porNombre.set(String(x.elemento).trim().toLowerCase(), x)
  const conflictos = []
  const coinciden = []
  const soloA = []
  for (const x of a) {
    if (!x.elemento) continue
    const y = porNombre.get(String(x.elemento).trim().toLowerCase())
    if (!y) { soloA.push(x); continue }
    porNombre.delete(String(x.elemento).trim().toLowerCase())
    const va = x.valor
    const vb = y.valor
    if (va == null || vb == null) {
      conflictos.push(conflicto(x, y, etiquetaA, etiquetaB, 'CANTIDAD_AUSENTE', 'una de las dos fuentes no tiene cantidad para este elemento'))
      continue
    }
    if (x.unidad && y.unidad && x.unidad !== y.unidad) {
      conflictos.push(conflicto(x, y, etiquetaA, etiquetaB, 'UNIDAD_DISTINTA', `«${x.unidad}» contra «${y.unidad}»: comparar los números sería sumar peras con metros`))
      continue
    }
    const escala = Math.max(Math.abs(va), Math.abs(vb), 1e-9)
    if (Math.abs(va - vb) / escala > TOLERANCIA_RELATIVA) {
      conflictos.push(conflicto(x, y, etiquetaA, etiquetaB, 'CANTIDAD_DISTINTA', `${va} contra ${vb} (${((va - vb) / escala * 100).toFixed(1)}%)`))
    } else coinciden.push({ elemento: x.elemento, valor: va, unidad: x.unidad })
  }
  return { conflictos, coinciden, soloA, soloB: [...porNombre.values()] }
}

/** Un conflicto con las DOS citas. Sin las dos, es una opinión sobre cuál está mal. PURA. */
function conflicto(x, y, etiquetaA, etiquetaB, clase, porQue) {
  return {
    clase,
    elemento: x.elemento,
    porQue,
    citas: [
      { fuente: etiquetaA, valor: x.valor, unidad: x.unidad, ubicacion: x.evidencia?.ubicacion ?? null, formula: x.formula ?? null, literal: x.evidencia?.textoLiteral ?? null },
      { fuente: etiquetaB, valor: y.valor, unidad: y.unidad, ubicacion: y.evidencia?.ubicacion ?? null, formula: y.formula ?? null, literal: y.evidencia?.textoLiteral ?? null },
    ],
  }
}

/** El recuento de un takeoff, con cada categoría dicha por separado. Ninguna se deduce restando:
 *  «NO_MEDIDO nunca es 0%» empieza por no calcular un total que tape las categorías. PURA. */
export function medirTakeoff(cantidades = []) {
  const por = (e) => cantidades.filter((c) => c.estado === e).length
  return {
    filas: cantidades.length,
    defendibles: por(ESTADO.DEFENDIBLE),
    sinUnidad: por(ESTADO.SIN_UNIDAD),
    error: por(ESTADO.ERROR),
    faltaDato: por(ESTADO.FALTA_DATO),
    conFormula: cantidades.filter((c) => c.formula).length,
    conEvidencia: cantidades.filter((c) => c.evidencia).length,
    conElemento: cantidades.filter((c) => c.elemento).length,
  }
}
