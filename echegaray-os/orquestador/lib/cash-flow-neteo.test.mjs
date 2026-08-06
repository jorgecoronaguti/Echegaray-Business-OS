// LAS DEVOLUCIONES NETEAN EL EGRESO — Y EL RESULTADO DEL PERÍODO NO SE MUEVE UN PESO.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO MANTIENE MUERTO (06/08/2026) ═══
//
// El dueño, mirando la sub-línea "Ingresos reales · Otros": *"¿Qué sería «Otros» en Ingresos reales?
// Son valores que no sé dónde encontrar."* Medidos en el Libro ese día: 9 movimientos por $833k —
// siete notas de crédito de proveedores (DUPEC $531k, Corralón $165k, Ductos $491) y cinco
// anulaciones del impuesto al cheque del banco (~$136k, rubro "Financiero"). Todos entran con signo
// +1 y un rubro de EGRESO.
//
// Ninguno es un ingreso del negocio: son egresos que se corrigieron. Mostrarlos como ingreso inflaba
// las DOS cifras que se leen para decidir —"cuánto entra" y "cuánto sale"— por el mismo importe, y el
// Resultado quedaba bien igual. Un cuadro coherente y falso, que es la forma más cara de estar mal.
//
// ═══ POR QUÉ SE PRUEBA SOBRE LOS TÉRMINOS Y NO SOBRE LA CADENA DE LA FÓRMULA ═══
//
// Lo que hay que garantizar es una identidad ARITMÉTICA: cambiar la presentación no puede mover el
// neto. Contra una cadena de texto eso no se puede verificar — se afirma. Por eso `cash-flow-medidas`
// expone `terminosDeMedida`/`terminosDeRubro` (filtro + coeficiente) y acá se EVALÚAN sobre un libro
// sintético, con la misma semántica con la que `terminoLibro` los va a evaluar en la hoja.
//
// El libro sintético no es inventado: reproduce los importes medidos el 06/08 —$832.200 de
// devoluciones, $10,29M de valores en cartera— más los casos de borde que tienen que seguir cayendo
// donde caían.

import test from 'node:test'
import assert from 'node:assert/strict'
import { bloqueDeMedida, conceptosDe, filaDeConcepto } from './cash-flow-matriz.mjs'
import {
  MEDIDAS, filtroDeMedida, terminosDeMedida, terminosDeRubro, formulaMedida, formulaRubro,
} from './cash-flow-medidas.mjs'
import { RUBROS_EGRESO, RUBROS_INGRESO, OTROS, claveSub } from './cash-flow-rubros.mjs'

/** Las dos expresiones de ventana de una columna cualquiera. Son las MISMAS para los cuatro términos. */
const D = '$B$7'
const H = '$B$7+7'

/**
 * Evalúa un filtro de `terminoLibro` sobre un libro sintético — la misma semántica que la hoja.
 *
 * IGNORA LA VENTANA A PROPÓSITO, y eso no es una licencia: todos los términos de una medida llevan el
 * MISMO `desde`/`hasta` (lo verifica el primer test), así que la ventana no puede desbalancear la
 * identidad. Todos los movimientos del libro sintético caen dentro de la misma columna.
 */
function evaluar(filtro, libro) {
  return libro
    .filter((m) => (filtro.signo === undefined || m.signo === filtro.signo)
      && (!filtro.estados || filtro.estados.includes(m.estado))
      && (!filtro.rubros || filtro.rubros.includes(m.rubro)))
    .reduce((a, m) => a + (filtro.medida === 'magnitud' ? m.importe : m.importe * m.signo), 0)
}

const valorDe = (terminos, libro) => terminos.reduce((a, t) => a + t.coef * evaluar(t.filtro, libro), 0)

/** El subtotal de una medida como queda DESPUÉS del arreglo. */
const subtotal = (m, libro) => valorDe(terminosDeMedida(m, D, H), libro)

/** El subtotal como estaba ANTES: un solo término, sin restar las devoluciones. */
const subtotalAntes = (m, libro) => evaluar(filtroDeMedida(m, D, H), libro)

/** El resultado del período: la fila "Resultado" de las dos vistas, con la definición que se le pase. */
const resultado = (libro, como) => MEDIDAS.reduce((a, m) => a + m.signoNeto * como(m, libro), 0)

/** El neto del libro, sin pasar por ninguna medida: la verdad contra la que se mide todo. */
const netoDelLibro = (libro) => libro.reduce((a, m) => a + m.signo * m.importe, 0)

const mv = (signo, estado, rubro, importe) => ({ signo, estado, rubro, importe })

/**
 * EL LIBRO SINTÉTICO — una columna de tiempo, con los casos medidos y los de borde.
 *
 * Las devoluciones suman $832.200, que es el hallazgo del dueño. La cartera proyectada son los
 * $10,29M que hoy viven bajo "Ingresos proyectados". Los dos rubros desconocidos y el cobro devuelto
 * están para que "· Otros" siga teniendo con qué ponerse en rojo si el despeje se rompe.
 */
const LIBRO = Object.freeze([
  mv(1, 'REAL', 'Cobranzas', 164800000),
  mv(1, 'REAL', 'Materiales Civil', 531000), //  nota de crédito DUPEC
  mv(1, 'REAL', 'Materiales Civil', 165000), //  nota de crédito Corralón
  mv(1, 'REAL', 'Financiero', 136200), //        anulación del impuesto al cheque
  mv(1, 'REAL', 'Subsidio', 70000), //           rubro que la taxonomía no nombra
  mv(-1, 'REAL', 'Materiales Civil', 118000000),
  mv(-1, 'REAL', 'Financiero', 400000),
  mv(-1, 'REAL', 'Cobranzas', 96800), //         un cobro DEVUELTO: sale plata con rubro de ingreso
  mv(-1, 'REAL', 'Varios raros', 50000), //      rubro de egreso que la taxonomía no nombra
  mv(1, 'COMPROMETIDO', 'Valores en cartera', 10290000),
  mv(1, 'PROYECTADO', 'Estructura', 1000), //    una devolución del lado de lo que todavía no pasó
  mv(-1, 'PROYECTADO', 'Nómina · Jornales de obra', 21000000),
])

const M = Object.fromEntries(MEDIDAS.map((m) => [m.clave, m]))

// ══ (0) LA CONDICIÓN QUE HACE VÁLIDO TODO LO DEMÁS ════════════════════════════════════════════════

test('todos los términos de una medida miran la MISMA ventana: la columna no se puede partir', () => {
  for (const m of MEDIDAS) {
    for (const t of terminosDeMedida(m, D, H)) {
      assert.equal(t.filtro.desde, D, m.clave)
      assert.equal(t.filtro.hasta, H, m.clave)
      assert.deepEqual([...t.filtro.estados], [...m.estados], `${m.clave}: un término con otros estados`)
    }
  }
})

// ══ (a) EL RESULTADO NO SE MUEVE ══════════════════════════════════════════════════════════════════

test('LA IDENTIDAD: el Resultado del período es el mismo antes y después del cambio de presentación', () => {
  const antes = resultado(LIBRO, subtotalAntes)
  const ahora = resultado(LIBRO, subtotal)
  assert.equal(ahora, antes, 'cambiar dónde se MUESTRA una devolución no puede cambiar el neto')
  // Y las dos son el neto crudo del libro: la identidad no se sostiene contra sí misma.
  assert.equal(ahora, netoDelLibro(LIBRO))
  assert.equal(ahora, 36446400)
})

test('LO QUE SÍ CAMBIA, con número: entra $832.200 menos y sale $832.200 menos', () => {
  // Es el hallazgo del dueño, en las dos cifras que se leen para decidir. Si alguien "arreglara" esto
  // restando las devoluciones de un solo lado, el test de arriba se pone rojo por los mismos $832.200.
  const entraAntes = subtotalAntes(M.ingresoReal, LIBRO) + subtotalAntes(M.ingresoProyectado, LIBRO)
  const entraAhora = subtotal(M.ingresoReal, LIBRO) + subtotal(M.ingresoProyectado, LIBRO)
  const saleAntes = subtotalAntes(M.egresoReal, LIBRO) + subtotalAntes(M.egresoProyectado, LIBRO)
  const saleAhora = subtotal(M.egresoReal, LIBRO) + subtotal(M.egresoProyectado, LIBRO)
  assert.equal(entraAntes - entraAhora, 833200, 'las devoluciones REALES ($832.200) más la proyectada ($1.000)')
  assert.equal(saleAntes - saleAhora, 833200, 'y el egreso baja EXACTAMENTE lo mismo')
  assert.equal(subtotal(M.ingresoReal, LIBRO), 164870000)
  assert.equal(subtotal(M.egresoReal, LIBRO), 117714600)
})

// ══ (b) LOS INGRESOS NO CONTIENEN RUBROS DE EGRESO ════════════════════════════════════════════════

test('NINGÚN rubro de egreso suma en los ingresos, cualquiera sea el signo con que entre', () => {
  for (const rubro of RUBROS_EGRESO) {
    // Un libro de una sola fila: una devolución de ese rubro, con el signo que la mostraba como ingreso.
    const solo = [mv(1, 'REAL', rubro, 1000000)]
    assert.equal(subtotal(M.ingresoReal, solo), 0, `"${rubro}" todavía suma en Ingresos reales`)
    assert.equal(subtotalAntes(M.ingresoReal, solo), 1000000, 'el defecto era éste: entraba entero')
    // Y del lado del egreso RESTA: un millón devuelto es un millón menos de costo de ese rubro.
    assert.equal(subtotal(M.egresoReal, solo), -1000000)
    assert.equal(valorDe(terminosDeRubro(M.egresoReal, D, H, rubro), solo), -1000000)
  }
})

test('la sub-línea de un rubro de egreso es lo PAGADO menos lo DEVUELTO, y "Otros" cierra la resta', () => {
  const rubro = (m, r) => valorDe(terminosDeRubro(m, D, H, r), LIBRO)
  assert.equal(rubro(M.egresoReal, 'Materiales Civil'), 118000000 - 531000 - 165000)
  assert.equal(rubro(M.egresoReal, 'Financiero'), 400000 - 136200)
  // Un rubro cuyas devoluciones superan sus pagos da NEGATIVO, y se muestra así: es lo que pasó.
  assert.equal(rubro(M.egresoProyectado, 'Estructura'), -1000)

  // "Otros" se despeja del subtotal — el mismo despeje que escribe la celda. Tiene que dar exactamente
  // la plata cuyo rubro la taxonomía no nombra, ni un peso más.
  for (const m of MEDIDAS) {
    const listados = bloqueDeMedida('semana', m.clave).rubros
      .reduce((a, r) => a + rubro(m, r.rubro), 0)
    const otros = subtotal(m, LIBRO) - listados
    const esperado = { ingresoReal: 70000, ingresoProyectado: 0, egresoReal: 50000 + 96800, egresoProyectado: 0 }
    assert.equal(otros, esperado[m.clave], `${m.clave}: "· Otros" no es el resto exacto`)
  }
})

test('un ingreso genuino sin rubro conocido sigue apareciendo: "· Otros" de ingresos no es decorativa', () => {
  // Es la razón por la que la fila se sigue emitiendo aunque hoy valga $0 en el archivo vivo. Si se
  // dejara de emitir, este rubro nuevo se caería del cuadro y el subtotal cerraría consigo mismo.
  for (const tipo of ['semana', 'mes']) {
    assert.ok(filaDeConcepto(tipo, claveSub('ingresoReal', OTROS)) > 0)
    assert.ok(filaDeConcepto(tipo, claveSub('ingresoProyectado', OTROS)) > 0)
  }
  assert.equal(subtotal(M.ingresoReal, [mv(1, 'REAL', 'Subsidio', 70000)]), 70000)
})

// ══ (c) LA CARTERA, SÓLO BAJO PROYECTADOS ═════════════════════════════════════════════════════════

test('"Valores en cartera" se emite SÓLO bajo Ingresos proyectados', () => {
  // El dueño: "está en cero todos los períodos, no es útil". Es cero por construcción: cuando el valor
  // se acredita, la plata entra al libro por el banco con rubro "Cobranzas".
  for (const tipo of ['semana', 'mes']) {
    assert.deepEqual(bloqueDeMedida(tipo, 'ingresoReal').rubros.map((r) => r.rubro), ['Cobranzas'])
    assert.deepEqual(bloqueDeMedida(tipo, 'ingresoProyectado').rubros.map((r) => r.rubro), [...RUBROS_INGRESO])
    // La fila no existe: no es que exista y esté oculta. `filaDeConcepto` rompe, no devuelve null.
    assert.throws(() => filaDeConcepto(tipo, claveSub('ingresoReal', 'Valores en cartera')),
      /no tiene el concepto/, tipo)
    assert.equal(conceptosDe(tipo).filter((c) => c.clave.endsWith('::Valores en cartera')).length, 1)
  }
  // Y los $10,29M están donde tienen que estar, por fecha de acreditación.
  assert.equal(subtotal(M.ingresoProyectado, LIBRO), 10290000)
})

// ══ LO QUE LA HOJA VA A RECIBIR ═══════════════════════════════════════════════════════════════════

test('las fórmulas rendidas son es-AR y no derraman: dos SUMPRODUCT restados, sin una coma', () => {
  const todas = [
    ...MEDIDAS.map((m) => formulaMedida(m, D, H)),
    ...MEDIDAS.flatMap((m) => bloqueDeMedida('mes', m.clave).rubros.map((r) => formulaRubro(m, D, H, r.rubro))),
  ]
  for (const f of todas) {
    assert.ok(f.startsWith('='), f)
    assert.ok(!f.replace(/"[^"]*"/g, '""').includes(','), `coma fuera de comillas: ${f}`)
    assert.ok(!/ARRAYFORMULA|^=\s*(FILTER|SORTN|QUERY)\(/.test(f), f)
  }
  // El subtotal de ingresos resta el término de las devoluciones, con los catorce rubros adentro.
  const ing = formulaMedida(M.ingresoReal, D, H)
  assert.ok(ing.startsWith('=SUMPRODUCT(') && ing.includes(')-SUMPRODUCT('), ing)
  for (const r of RUBROS_EGRESO) assert.ok(ing.includes(`="${r}"`), `${r} no está en el término que se resta`)
  // Y la sub-línea de un rubro de egreso es UN término negado, sin filtro de signo: por ahí entra la
  // nota de crédito a restar. Con `$B$2:$B=-1` adentro, el neteo no ocurriría y nada daría error.
  const mat = formulaRubro(M.egresoReal, D, H, 'Materiales Civil')
  assert.ok(mat.startsWith('=-SUMPRODUCT('), mat)
  assert.ok(!mat.includes('$B$2:$B=-1'), `filtra el signo y entonces no netea: ${mat}`)
})
