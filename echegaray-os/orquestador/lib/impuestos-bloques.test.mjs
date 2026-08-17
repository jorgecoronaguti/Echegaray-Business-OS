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
import { origenDelMes, ORIGEN, bloqueIva, bloqueCierre } from './impuestos-bloques.mjs'
import { crearGrilla } from './impuestos-grilla.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { anclaDeProyeccion } from './iva-libre-disponibilidad.mjs'

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

// ── LA COLUMNA DE JULIO, Y POR QUÉ SE RECUPERA (17/08) ───────────────────────────────────────────
//
// EL DEFECTO COMPLETO, MEDIDO EN EL ARCHIVO. La columna H (julio-26) del cuadro de IVA está corrida
// UNA FILA HACIA ARRIBA: alguien pegó los cinco valores del mes arrancando en la fila del encabezado.
//
//   H53 encabezado  = 23.623.111,82  ← el DÉBITO de julio, encima de donde va "jul-26"
//   H54 débito      = 11.328.237,58  ← el CRÉDITO
//   H55 crédito     = 0              ← el "a pagar"
//   H56 a pagar     = 7.050.036,33   ← la LIBRE DISPONIBILIDAD, publicada como IVA A PAGAR EN EFECTIVO
//   H57 libre disp  = "⚠ vence 20/08" ← la leyenda, que es lo que hace estallar el hero
//
// Los tres primeros importes son los del comentario de `iva-libre-disponibilidad.mjs` al centavo.
// El daño caro no es el #VALUE!: es la fila 56, que es la que leen el Libro y el cash flow, diciendo
// que en julio hay que pagar $7.050.036 de IVA cuando ese número es plata A FAVOR. Signo invertido en
// la fila del contrato.
//
// EL GENERADOR NO PODÍA ARREGLARLO PORQUE SE ANCLABA EN LA LEYENDA: con `esNumero("⚠ vence 20/08")`
// dando true, el ancla caía en julio y `ofOAjeno` devolvía AJENO —"no la toques"— para toda la
// columna. La corrupción quedaba congelada para siempre. Con el ancla en junio, julio vuelve a ser un
// mes calculable y las cinco celdas se reescriben.
// La fila 57 EXACTA del archivo el 17/08, como la lee el generador (FORMATTED_VALUE).
const FILA_LIBRE_REAL = ['$20.803.502', '$25.836.241', '$16.413.003', '$18.757.047', '$19.326.154',
  '$19.344.911', '⚠ vence 20/08', '—', '—', '—', '—', '—']
/** El ancla NO se fija a mano: sale de la fila real, que es donde vive el defecto. */
const anclaReal = () => anclaDeProyeccion(FILA_LIBRE_REAL, [1, 2, 3, 4, 5, 6]).ultimoMesConDato

test('con el ancla en junio, JULIO se recalcula: la columna corrida no queda congelada', () => {
  const { G, iva } = armarBloque({ arca: { meses: [1, 2, 3, 4, 5, 6, 7, 8] }, ancla: anclaReal(), hoy: '2026-08-17' })
  // AJENO viaja a la celda como cadena vacía: es la marca de "preservar lo que haya".
  for (const [nombre, fila] of [['débito', iva.fDeb], ['crédito', iva.fCred],
    ['a pagar', iva.fAPagar], ['libre disponibilidad', iva.fLibre]]) {
    const v = String(celda(G, fila, 7))
    assert.notEqual(v, '', `julio quedaría PRESERVADO en ${nombre}: el valor corrido no se corrige nunca`)
    assert.ok(v.startsWith('='), `julio se recalcula desde ARCA en ${nombre} y da "${v}"`)
  }
  assert.equal(iva.porOrigen.ajeno.length, 0, 'ningún mes queda intocable con las seis DDJJ presentadas')
})

test('ninguna celda de IMPORTE del cuadro de IVA lleva texto — sólo la fila de procedencia', () => {
  // La regla que la pestaña violaba: una leyenda no puede vivir en una celda que promete un importe,
  // porque otras fórmulas la suman. El aviso tiene su lugar —la fila "DDJJ presentada" y la columna
  // de procedencia—, y las cuatro filas de plata no son ese lugar.
  const { G, iva } = armarBloque({ arca: { meses: [7, 8] }, ancla: anclaReal() })
  for (const fila of [iva.fDeb, iva.fCred, iva.fAPagar, iva.fLibre]) {
    for (const m of [1, 6, 7, 8, 12]) {
      const v = celda(G, fila, m)
      if (typeof v === 'number' || v === '' || String(v).startsWith('=')) continue
      assert.fail(`fila ${fila}, mes ${m}: "${v}" no es ni número ni fórmula, y está en una fila de importes`)
    }
  }
  // Y la leyenda de procedencia SÍ está, en la fila que le corresponde.
  assert.match(String(celda(G, iva.fDDJJ, 7)), /ARCA/, 'el aviso vive en "DDJJ presentada"')
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

// ── EL HUECO SE DECLARA EN LA PANTALLA, NO SÓLO EN LA CONSOLA (17/08) ────────────────────────────
//
// Arreglar `esNumero` evita el número inventado, pero por sí solo cambia una falla ruidosa por una
// silenciosa: el generador recalcula la columna que una persona escribió a mano y nadie se entera de
// que había algo puesto ahí. La sección 10 es donde viven los huecos declarados de esta pestaña, y
// una leyenda sentada en una celda de importe es exactamente eso.

test('un texto donde va un importe se declara como HUECO en la sección 10', () => {
  const G = crearGrilla(2026)
  bloqueCierre(G, {
    proy: { meses: [7, 8], supuesto: 'x', textoDondeVaImporte: [{ mes: 7, valor: '⚠ vence 20/08' }] },
    vencimientos: { iibb: 'día 20' },
  })
  const fila = G.filas.find((f) => /libre disponibilidad/i.test(String(f[0] ?? '')))
  assert.ok(fila, 'la sección 10 nombra la fila donde estaba el texto')
  assert.match(String(fila[0]), /jul/i, 'dice de qué MES era la celda: sin eso no se sabe dónde ir')
  // La prosa va en la columna de procedencia (la última), nunca en la de importes.
  assert.match(String(fila[fila.length - 1]), /HUECO DECLARADO/)
  assert.match(String(fila[fila.length - 1]), /⚠ vence 20\/08/, 'cita el texto que había, para poder recuperarlo')
  assert.equal(fila[1], VACIO, 'la columna B es de plata: el aviso no se sienta ahí')
})

test('sin texto mal puesto la sección 10 no inventa un aviso', () => {
  const G = crearGrilla(2026)
  bloqueCierre(G, { proy: { meses: [7], supuesto: 'x', textoDondeVaImporte: [] }, vencimientos: { iibb: 'día 20' } })
  assert.equal(G.filas.filter((f) => /libre disponibilidad/i.test(String(f[0] ?? ''))).length, 0)
})
