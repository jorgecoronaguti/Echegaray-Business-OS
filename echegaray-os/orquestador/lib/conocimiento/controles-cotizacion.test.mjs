// TODO CONTROL TIENE QUE PODER DAR ROJO, Y TIENE QUE PODER DECIR QUE NO MIRÓ.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA QUE NO SE REPITA ═══
//
// `supuestosOcultos()` era estructuralmente incapaz de devolver algo distinto de 0. Nadie lo notó
// porque su salida —«0 hallazgos»— es idéntica a la de un control que miró y no encontró nada.
// Dejó pasar $ 4.149.546 adentro de un precio. Un control que sólo se prueba en verde no está
// probado: está acompañado.
//
// ═══ POR QUÉ CADA ESCENARIO ARMA UN .xlsx DE VERDAD ═══
//
// La entrada se construye por la RUTA DE PRODUCCIÓN: bytes → `leerArchivo` → `leerOferta` /
// `leerPresupuesto` / `leerGastosGenerales` → la regla, con la misma función `estudiarTanda` que
// usa el comando. Armar el objeto `cotizacion` a mano empezaría DESPUÉS del tramo donde vivían los
// cuatro defectos que aparecieron construyendo este circuito, y los dejaría pasar a los cuatro.
//
// ═══ LA TABLA ES EL CONTRATO ═══
//
// `ESCENARIOS_ROJOS` tiene una entrada por control. La última prueba compara esa tabla contra
// `CONTROLES`: un control nuevo sin escenario que lo ponga en rojo pone el archivo en rojo. Es la
// única forma de que la regla «todo control con un estado verde necesita su negative test» no
// dependa de que alguien se acuerde.
import assert from 'node:assert/strict'
import test from 'node:test'
import { estudiar, libro } from './cotizacion-fixture.mjs'
import { CONTROLES, RESULTADO, controlDe, correrControl, pasarControles, paso } from './controles-cotizacion.mjs'
import { coberturaDeRenglones, referenciasDe } from './hallazgos-celdas.mjs'
import { TIPO } from './hallazgo.mjs'

const RUTA = (obra, archivo) => `administracion/PRESUPUESTOS - CLIENTES/CLI/${obra}/${archivo}`

/** N libros iguales en obras distintas. Los controles cruzados necesitan más de uno para poder
 *  mirar, y sin obras distintas la madurez de la práctica no se puede calcular. */
const tanda = (n, opciones = {}) => Array.from({ length: n }, (_, i) => libro(
  `c${i}.xlsx`, RUTA(`OBRA ${i}`, `c${i}.xlsx`), typeof opciones === 'function' ? opciones(i) : opciones,
))

const correr = async (libros) => pasarControles((await estudiar(libros)).cotizaciones)

const control = (r, id) => {
  const c = r.corridas.find((x) => x.id === id)
  assert.ok(c, `no existe el control ${id}`)
  return c
}

/**
 * UN ESCENARIO POR CONTROL: cómo se arma la planilla que lo tiene que poner en rojo, y qué tipo de
 * hallazgo tiene que emitir. `tipo` no es decorativo: sin él un escenario podría dar rojo por otro
 * defecto colateral y el test pasaría probando otra cosa.
 */
const ESCENARIOS_ROJOS = Object.freeze([
  {
    control: 'oferta-con-el-cierre-roto', tipo: TIPO.OFERTA_ROTA,
    que: 'el cierre de la oferta entero en #DIV/0!',
    libros: () => tanda(1, { subtotalRoto: true }),
  },
  {
    control: 'iva-escrito-a-mano', tipo: TIPO.IVA_ESCRITO_A_MANO,
    que: 'el IVA tipeado al lado de renglones que SÍ tienen fórmula',
    // La fórmula del renglón no es adorno: sin ninguna fórmula en la hoja, el control no puede
    // distinguir «el IVA está tipeado» de «no veo fórmulas» y contesta NO_SE_PUDO_MIRAR. Que este
    // escenario tenga que ser realista para dar rojo es la prueba de que la distinción funciona.
    libros: () => tanda(1, { ivaConFormula: false, formulasExtra: [{ hoja: 'OFERTA', celda: 'E14', formula: 'C14*D14', valor: 1000 }] }),
  },
  {
    control: 'aritmetica-de-la-oferta', tipo: TIPO.SUBTOTAL_NO_CIERRA,
    que: 'la suma de los ítems que no da el subtotal declarado',
    libros: () => tanda(1, { subtotal: 998, iva: 209.58, total: 1207.58 }),
  },
  {
    control: 'rotulo-contra-coeficiente', tipo: TIPO.ROTULO_CONTRADICE_COEFICIENTE,
    que: 'el rótulo que promete 0,6 % y la fórmula que aplica 4 %',
    libros: () => tanda(1, { coeficienteGG: 0.04 }),
  },
  {
    control: 'coeficiente-inestable', tipo: TIPO.COEFICIENTE_INESTABLE,
    que: 'el mismo concepto de GG con coeficientes de 0,006 a 0,06 entre tres cotizaciones',
    libros: () => tanda(3, (i) => ({ coeficienteGG: [0.006, 0.03, 0.06][i] })),
  },
  {
    control: 'unidad-contradictoria', tipo: TIPO.UNIDAD_CONTRADICTORIA,
    que: 'la partida T1001 medida en M2 en una cotización y en ML en la otra',
    libros: () => [
      libro('a.xlsx', RUTA('OBRA A', 'a.xlsx'), { partidas: [['T1001', null, 'REPLANTEO', 'M2', null, null, 1000, 500, 500, 0, 46000, null, 0.06, 0.06]] }),
      libro('b.xlsx', RUTA('OBRA B', 'b.xlsx'), { partidas: [['T1001', null, 'REPLANTEO', 'ML', null, null, 1000, 500, 500, 0, 46000, null, 0.06, 0.06]] }),
    ],
  },
  {
    control: 'partida-sin-datos', tipo: TIPO.PARTIDA_SIN_DATOS,
    que: 'los renglones «sin datos» que viajan dentro del presupuesto',
    libros: () => tanda(1, { tareasExtra: ['sin datos'] }),
  },
  {
    control: 'datos-comerciales-de-otro-cliente', tipo: TIPO.DATOS_DE_OTRO_CLIENTE,
    que: 'la oferta de otro cliente guardada en las columnas de al lado',
    libros: () => tanda(1, { bloquesAjenos: ['OTRO CLIENTE SA'] }),
  },
  {
    control: 'indirecto-siempre-en-cero', tipo: TIPO.INDIRECTO_SIEMPRE_EN_CERO,
    que: 'un concepto de gastos generales listado en las cinco cotizaciones y cotizado en $ 0 en las cinco',
    libros: () => tanda(5, { importeGG: 0 }),
  },
  {
    control: 'coeficiente-de-ajuste-sin-criterio', tipo: TIPO.COEFICIENTE_AJUSTE_SIN_CRITERIO,
    que: 'la partida multiplicada por 1,5 sin que nada diga por qué',
    libros: () => tanda(1, { coeficientesAjuste: [1.5] }),
  },
  {
    control: 'referencia-rota-en-el-presupuesto', tipo: TIPO.REFERENCIA_ROTA,
    que: 'la fila del presupuesto cuyo nombre de tarea es #REF!',
    libros: () => tanda(1, { tareasExtra: ['#REF!'] }),
  },
  {
    control: 'celdas-en-error', tipo: TIPO.CELDA_EN_ERROR,
    que: 'un #REF! en la hoja Análisis, que no toca ninguna de las reglas de la plantilla',
    libros: () => tanda(1, { erroresExtra: [{ hoja: 'Análisis', celda: 'G6', texto: '#REF!' }] }),
  },
  {
    control: 'formula-sobre-celda-rota', tipo: TIPO.FORMULA_SOBRE_CELDA_ROTA,
    que: 'la fórmula sana que multiplica una celda que está en #REF!',
    libros: () => tanda(1, {
      erroresExtra: [{ hoja: 'Análisis', celda: 'G6', texto: '#REF!' }],
      formulasExtra: [{ hoja: 'Análisis', celda: 'H6', formula: 'G6*2', valor: 0 }],
    }),
  },
  {
    control: 'renglon-que-no-multiplica', tipo: TIPO.RENGLON_INCOHERENTE,
    que: 'el renglón que declara 9999 donde 10 × 100 da 1000',
    libros: () => tanda(1, { items: [['REPLANTEO', 'M2', 10, 100, 9999]], subtotal: 9999, iva: 2099.79, total: 12098.79 }),
  },
])

// ═══════════════════ CADA CONTROL, EN ROJO, POR LA RUTA DE PRODUCCIÓN ═══════════════════

for (const e of ESCENARIOS_ROJOS) {
  test(`ROJO · ${e.control}: ${e.que}`, async () => {
    const r = await correr(e.libros())
    const c = control(r, e.control)
    assert.equal(c.estado, RESULTADO.HALLAZGO, `${e.control} no dio rojo: quedó en ${c.estado}`)
    assert.ok(c.hallazgos.some((h) => h.tipo === e.tipo), `${e.control} dio rojo pero no emitió ${e.tipo}`)
    // Sin cita no es un hallazgo: hay que poder ir al archivo, a la hoja y a la celda.
    for (const h of c.hallazgos) {
      assert.ok(h.evidencia.length > 0, `${h.tipo} salió sin evidencia`)
      assert.ok(h.evidencia.every((x) => x.cita && x.ubicacion), `${h.tipo} tiene evidencia sin cita o sin ubicación`)
    }
  })
}

test('la tabla de escenarios cubre TODOS los controles: uno nuevo sin negative test pone esto en rojo', () => {
  const conRojo = new Set(ESCENARIOS_ROJOS.map((e) => e.control))
  const sinRojo = CONTROLES.map((c) => c.id).filter((id) => !conRojo.has(id))
  assert.deepEqual(sinRojo, [], `estos controles pueden devolver verde y no hay ninguna prueba de que puedan devolver rojo: ${sinRojo.join(', ')}`)
  const inventados = [...conRojo].filter((id) => !CONTROLES.some((c) => c.id === id))
  assert.deepEqual(inventados, [], `la tabla nombra controles que no existen: ${inventados.join(', ')}`)
})

// ═══════════════════ VERDE DE VERDAD, Y LA DIFERENCIA CON «NO MIRÉ» ═══════════════════

test('VERDE · una planilla sana no dispara ningún control que haya podido mirarla', async () => {
  const r = await correr(tanda(5))
  const conHallazgo = r.corridas.filter((c) => c.estado === RESULTADO.HALLAZGO)
  assert.deepEqual(conHallazgo.map((c) => c.id), [], `una planilla sana disparó ${conHallazgo.length} control(es)`)
  assert.ok(r.resumen.limpios > 0, 'ningún control llegó a mirar: el verde sería falso')
})

test('un control que no pudo mirar NO dice LIMPIO, y eso rompe el «pasó»', async () => {
  const r = await correr(tanda(1))
  const cruzado = control(r, 'indirecto-siempre-en-cero')
  assert.equal(cruzado.estado, RESULTADO.NO_SE_PUDO_MIRAR)
  assert.equal(paso(r), false, 'la tanda «pasó» con un control que ni siquiera pudo mirar')
})

test('el control cruzado sobre UNA cotización dice NO_SE_PUDO_MIRAR: es el caso de supuestosOcultos()', async () => {
  const una = await correr(tanda(1))
  assert.equal(control(una, 'coeficiente-inestable').estado, RESULTADO.NO_SE_PUDO_MIRAR)
  assert.equal(control(una, 'unidad-contradictoria').estado, RESULTADO.NO_SE_PUDO_MIRAR)
  // Y con material suficiente sí mira, así que el NO_SE_PUDO_MIRAR no es una excusa permanente.
  const tres = await correr(tanda(3))
  assert.equal(control(tres, 'coeficiente-inestable').estado, RESULTADO.LIMPIO)
  assert.equal(control(tres, 'unidad-contradictoria').estado, RESULTADO.LIMPIO)
})

test('el motivo de lo que no se pudo mirar viaja con el control, no se pierde', async () => {
  const r = await correr(tanda(1))
  const motivos = r.sinMirar.filter((s) => s.control === 'coeficiente-inestable')
  assert.equal(motivos.length, 1)
  assert.match(motivos[0].porQue, /hacen falta al menos 3/)
})

test('sin lista de cotizaciones NINGÚN control dice LIMPIO: una lista vacía no es una planilla sana', () => {
  const r = pasarControles([])
  const verdes = r.corridas.filter((c) => c.estado !== RESULTADO.NO_SE_PUDO_MIRAR)
  assert.deepEqual(verdes.map((c) => c.id), [], 'con cero cotizaciones hubo controles que se declararon limpios')
  assert.equal(paso(r), false)
})

test('una hoja OFERTA sin NINGUNA fórmula no se juzga: es el defecto que daba rojo en 12 de 13 ofertas', async () => {
  const { cotizaciones } = await estudiar(tanda(1))
  // Se le saca a la cotización lo que el lector le había dado, que es exactamente lo que pasaba
  // cuando `xlsx` corría sin `cellFormula: true`.
  const sinFormulas = cotizaciones.map((c) => ({ ...c, formulas: { ...c.formulas, OFERTA: {} } }))
  const c = correrControl(CONTROLES.find((x) => x.id === 'iva-escrito-a-mano'), sinFormulas)
  assert.equal(c.estado, RESULTADO.NO_SE_PUDO_MIRAR)
  assert.match(c.cobertura.sinMirar[0].porQue, /NINGUNA fórmula/)
})

test('una cotización estudiada sin inventario de celdas no pasa por limpia en los controles de celda', async () => {
  const { cotizaciones } = await estudiar(tanda(1))
  // `delete` sobre una copia y no una desestructuración con descarte: el descarte deja una variable
  // sin usar que el lint marca, y silenciarla con un guión bajo esconde qué se está sacando.
  const viejas = cotizaciones.map((c) => { const copia = { ...c }; delete copia.celdasRotas; return copia })
  for (const id of ['celdas-en-error', 'formula-sobre-celda-rota']) {
    const c = correrControl(CONTROLES.find((x) => x.id === id), viejas)
    assert.equal(c.estado, RESULTADO.NO_SE_PUDO_MIRAR, `${id} se declaró limpio sin inventario de celdas`)
  }
})

// ═══════════════════ LAS CINCO REGLAS DEL DUEÑO ═══════════════════

test('un valor 0 NO es un error: un indirecto en cero en UNA cotización de cinco no dispara nada', async () => {
  const r = await correr(tanda(5, (i) => ({ importeGG: i === 0 ? 0 : 600 })))
  const c = control(r, 'indirecto-siempre-en-cero')
  assert.equal(c.estado, RESULTADO.LIMPIO, 'un 0 suelto se denunció como error')
})

test('NULL no es cero: el renglón sin cantidad no se compara, se cuenta como no mirado', async () => {
  const { cotizaciones } = await estudiar([
    libro('a.xlsx', RUTA('OBRA A', 'a.xlsx'), { items: [['REPLANTEO', 'M2', null, 100, 1000]], subtotal: 1000 }),
  ])
  const cobertura = coberturaDeRenglones(cotizaciones)
  assert.ok(cobertura.salteados >= 1, 'el renglón sin cantidad se comparó como si la cantidad valiera 0')
  assert.ok(Object.keys(cobertura.motivos).some((m) => m.startsWith('OFERTA')), 'no se declaró por qué no se miró')
  const r = pasarControles(cotizaciones)
  assert.equal(control(r, 'renglon-que-no-multiplica').estado, RESULTADO.LIMPIO)
  assert.deepEqual(control(r, 'renglon-que-no-multiplica').hallazgos, [], 'el renglón sin cantidad se denunció como incoherente')
})

test('una celda vacía no significa que el control se realizó: el renglón mirado se cuenta aparte', async () => {
  const { cotizaciones } = await estudiar(tanda(1))
  const cobertura = coberturaDeRenglones(cotizaciones)
  assert.ok(cobertura.mirados > 0, 'no se contó ni un renglón mirado sobre una planilla sana')
})

// ═══════════════════ EL PUENTE CON EL DATASET ═══════════════════

test('todo tipo de hallazgo sabe qué control lo detectó, y ningún control queda sin tipo', () => {
  for (const t of Object.values(TIPO)) {
    assert.ok(controlDe(t), `el tipo ${t} no lo emite ningún control: el dataset no podría decir quién lo detectó`)
  }
  for (const c of CONTROLES) assert.ok(c.tipos.length > 0, `${c.id} no declara qué tipo emite`)
})

// ═══════════════════ EL LECTOR DE REFERENCIAS, QUE ES DONDE SE ESCONDEN LOS FALSOS ═══════════════════

test('referenciasDe no confunde el nombre de una función con una celda', () => {
  assert.deepEqual(referenciasDe('LOG10(2)'), [])
  assert.deepEqual(referenciasDe('SUM(A1:A3)').map((r) => [r.desde.columna, r.desde.fila, r.hasta.fila]), [[1, 1, 3]])
  assert.equal(referenciasDe("'Análisis'!G6*2")[0].hoja, 'Análisis')
  assert.equal(referenciasDe('G6*2', { hojaPropia: 'GG' })[0].hoja, 'GG')
})
