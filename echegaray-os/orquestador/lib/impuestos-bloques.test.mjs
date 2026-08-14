// LA CASCADA DE TRES ESTADOS DEL CUADRO 4 DE IVA.
//
// El defecto que atrapa: el cuadro sabía decir "DDJJ presentada" o "PROYECCIÓN del Libro" y no tenía
// un estado para el mes VENCIDO QUE TODAVÍA NO SE PRESENTÓ — justo el mes del que ARCA ya tiene los
// comprobantes reales, adentro del mismo archivo, en _ARCA_RAW. Ese mes se proyectaba con el Libro
// teniendo el hecho a mano.
//
// Si alguien vuelve a la cascada de dos ramas, estos tests se ponen rojos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { origenDelMes, ORIGEN, bloqueIva } from './impuestos-bloques.mjs'
import { crearGrilla } from './impuestos-grilla.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA CASCADA, EN FRÍO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const CTX = {
  mesesDDJJ: [1, 2, 3, 4, 5, 6],
  ancla: 6,
  mesesArca: [1, 2, 3, 4, 5, 6, 7, 8],
  mesesProy: [7, 8, 9, 10, 11, 12],
  mesEnCurso: 8,
}

test('la DDJJ presentada le gana a ARCA: el dato oficial no se recalcula', () => {
  // La F.2051 lleva percepciones, ajustes y prorrateos que los comprobantes no tienen. Recalcularla
  // desde ARCA sería producir una segunda versión del mismo número, y la peor de las dos.
  for (const m of [1, 2, 3, 4, 5, 6]) assert.equal(origenDelMes(m, CTX), ORIGEN.ddjj)
})

test('el mes VENCIDO sin DDJJ pero CON comprobantes sale de ARCA, no de una proyección', () => {
  // ESTE es el hueco que se cierra: julio está cerrado, no se presentó todavía, y ARCA tiene sus
  // comprobantes. Antes se proyectaba con el promedio del Libro teniendo el hecho en el archivo.
  assert.equal(origenDelMes(7, CTX), ORIGEN.arca)
})

test('el mes EN CURSO con comprobantes es ARCA PARCIAL — no se confunde con un mes cerrado', () => {
  // Un mes que no terminó tiene una PORCIÓN de sus comprobantes. Tratarlo como cerrado subestima el
  // débito e infla la libre disponibilidad que se arrastra a todos los meses que siguen.
  assert.equal(origenDelMes(8, CTX), ORIGEN.arcaParcial)
})

test('el mes sin DDJJ y sin comprobantes sigue proyectándose desde el Libro', () => {
  for (const m of [9, 10, 11, 12]) assert.equal(origenDelMes(m, CTX), ORIGEN.proyeccion)
})

test('EL MES AJENO SIGUE INTACTO aunque ARCA tenga sus comprobantes', () => {
  // Julio lo calculó una PERSONA a mano y `respetar-ediciones` no protege importes: si ARCA le ganara
  // al ancla, la corrida siguiente le borraría tres números al dueño. Es la séptima pérdida de trabajo
  // de la lista, y no ocurre.
  const ctx = { ...CTX, ancla: 7 }
  assert.equal(origenDelMes(7, ctx), ORIGEN.ajeno)
  // Y el mes en curso, que está por encima del ancla, sí puede usar ARCA.
  assert.equal(origenDelMes(8, ctx), ORIGEN.arcaParcial)
})

test('un mes POSTERIOR al corriente no se da por cerrado aunque tenga una factura adelantada', () => {
  // Se emiten facturas con fecha futura. Una sola no convierte septiembre en un hecho.
  const ctx = { ...CTX, mesesArca: [...CTX.mesesArca, 9] }
  assert.equal(origenDelMes(9, ctx), ORIGEN.proyeccion)
})

test('sin comprobantes cargados la cascada se comporta EXACTAMENTE como antes', () => {
  // La rama nueva no puede cambiar el cuadro el día que ARCA está vacío: sería un cambio invisible.
  const ctx = { ...CTX, mesesArca: [] }
  assert.equal(origenDelMes(7, ctx), ORIGEN.proyeccion)
  assert.equal(origenDelMes(8, ctx), ORIGEN.proyeccion)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL EFECTO EN LAS CELDAS — que la fórmula quede escrita, y contra la réplica
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const armarBloque = ({ arca = { meses: [] }, hoy = '2026-08-07', ancla = 6 } = {}) => {
  const G = crearGrilla(2026)
  const iva = bloqueIva(G, {
    anio: 2026,
    hoy,
    arca,
    ivaOficial: [1, 2, 3, 4, 5, 6].map((m) => ({
      periodo: `2026-0${m}`, debito: 10, credito: 5, a_pagar_efectivo: 0, libre_disp: 1e6,
      fecha_presentacion: '19/02/2026', nro_transaccion: '1234',
    })),
    proy: {
      meses: [7, 8, 9, 10, 11, 12],
      ultimoMesConDato: ancla,
      brutoDebito: (m) => [`BRUTO_DEB_${m}`],
      brutoCredito: (m) => [`BRUTO_CRE_${m}`],
    },
  })
  return { G, iva }
}

/** La celda del mes m (1..12) de la fila f. La columna B es enero, así que m+0 sobre el índice. */
const celda = (G, f, m) => G.filas[f - 1][m]

test('el débito del mes ARCA es una FÓRMULA contra _ARCA_RAW, nunca un número pegado', () => {
  // La regla de oro del dueño: si el insumo está en el Sheet, la celda se calcula. Pegado, el cuadro
  // envejece el día que el sync trae una factura más y nadie se entera.
  const { G, iva } = armarBloque({ arca: { meses: [7, 8] } })
  const deb = String(celda(G, iva.fDeb, 7))
  assert.ok(deb.startsWith('='), `julio tiene que ser fórmula y es "${deb}"`)
  assert.match(deb, /_ARCA_RAW!\$A\$4:\$A="2026-07"/, 'filtra por el período, como texto')
  assert.match(deb, /_ARCA_RAW!\$B\$4:\$B="Ventas"/, 'el débito sale del libro de VENTAS')
  const cred = String(celda(G, iva.fCred, 7))
  assert.match(cred, /_ARCA_RAW!\$B\$4:\$B="Compras"/, 'el crédito sale del libro de COMPRAS')
})

test('la fórmula de ARCA va en locale es-AR: separador ";" y ni una coma de argumento', () => {
  const { G, iva } = armarBloque({ arca: { meses: [7] } })
  const f = String(celda(G, iva.fDeb, 7))
  assert.ok(f.includes(';'), 'sin ";" la fórmula no se puede escribir por API en es_AR')
  // La única coma admisible sería decimal; no hay ninguna en esta fórmula.
  assert.ok(!f.includes(','), `la fórmula lleva una coma: "${f}"`)
})

test('LA NOTA DE CRÉDITO RESTA también en el IVA — el signo entra en la suma', () => {
  // Sumar notas de crédito como si fueran facturas costó $41,9M de error una vez. La réplica guarda
  // el signo en la columna F y la fórmula multiplica: si alguien saca ese factor, esto se pone rojo.
  const { G, iva } = armarBloque({ arca: { meses: [7] } })
  for (const fila of [iva.fDeb, iva.fCred]) {
    assert.match(String(celda(G, fila, 7)), /ISNUMBER\(_ARCA_RAW!\$F\$4:\$F\)/)
  }
})

test('el MES EN CURSO nunca queda por debajo de la proyección: MAX de los dos', () => {
  // Un mes a medio cargar, tomado como cerrado, deja una libre disponibilidad inflada que se arrastra
  // a todos los meses siguientes y el cash flow reserva de menos. Mismo criterio que el impuesto al
  // cheque: MAX(lo que ya ocurrió; lo que se proyecta). Y a los DOS términos por igual.
  const { G, iva } = armarBloque({ arca: { meses: [7, 8] }, hoy: '2026-08-07' })
  const deb = String(celda(G, iva.fDeb, 8))
  assert.match(deb, /^=MAX\(/)
  assert.match(deb, /_ARCA_RAW/)
  assert.match(deb, /BRUTO_DEB_8/, 'el otro término es la proyección del Libro del mismo mes')
  const cred = String(celda(G, iva.fCred, 8))
  assert.match(cred, /^=MAX\(/)
  assert.match(cred, /BRUTO_CRE_8/)
  // Y el mes CERRADO no lleva MAX: ahí el hecho manda solo.
  assert.ok(!String(celda(G, iva.fDeb, 7)).startsWith('=MAX('))
})

test('la fila de procedencia distingue ARCA de una PROYECCIÓN, y el parcial del cerrado', () => {
  // Verlos con la misma leyenda hacía discutir un número que no había que discutir: un mes de ARCA es
  // un hecho sobre comprobantes reales; una proyección es un supuesto sobre el Libro.
  const { G, iva } = armarBloque({ arca: { meses: [7, 8] } })
  assert.equal(celda(G, iva.fDDJJ, 7), '▲ ARCA (sin DDJJ)')
  assert.equal(celda(G, iva.fDDJJ, 8), '▲ ARCA parcial')
  assert.equal(celda(G, iva.fDDJJ, 9), '▲ PROYECCIÓN')
  // Y el mes con DDJJ sigue mostrando su comprobante de presentación.
  assert.match(String(celda(G, iva.fDDJJ, 3)), /^19\/02·N…1234$/)
})

test('el arrastre del mes ARCA usa la MISMA aritmética que la proyección', () => {
  // El estado cambia de dónde salen el débito y el crédito, no cómo se acumula el saldo. Dos
  // aritméticas para la misma fila serían dos verdades del mismo año.
  const { G, iva } = armarBloque({ arca: { meses: [7, 8] } })
  const aPagar = String(celda(G, iva.fAPagar, 7))
  assert.match(aPagar, /^=MAX\(0;/)
  // Enero es la columna B, así que junio es la G: el mes ARCA arranca del saldo del mes anterior.
  assert.match(aPagar, new RegExp(`G${iva.fLibre}`), 'toma la libre disponibilidad de junio')
  assert.match(String(celda(G, iva.fLibre, 7)), /^=MAX\(0;/)
})

test('el mes del DUEÑO se preserva: ni fórmula de ARCA ni celda vaciada', () => {
  // La grilla traduce el centinela AJENO a cadena vacía, que es lo ÚNICO que `fusionar()` preserva.
  // VACIO significaría "es mi celda y va vacía" — o sea, borrarle el trabajo al dueño.
  const { G, iva } = armarBloque({ arca: { meses: [7, 8] }, ancla: 7 })
  assert.equal(celda(G, iva.fDeb, 7), '')
  assert.equal(celda(G, iva.fDDJJ, 7), '')
  assert.notEqual(celda(G, iva.fDeb, 7), VACIO)
})

test('sin comprobantes en ARCA el cuadro queda IDÉNTICO al de antes', () => {
  // El cambio no puede alterar en silencio un cuadro que hoy no tiene datos nuevos.
  const conArca = armarBloque({ arca: { meses: [] } })
  for (const m of [7, 8, 9]) {
    assert.match(String(celda(conArca.G, conArca.iva.fDeb, m)), /BRUTO_DEB_/)
    assert.equal(celda(conArca.G, conArca.iva.fDDJJ, m), '▲ PROYECCIÓN')
  }
})
