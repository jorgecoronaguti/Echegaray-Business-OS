// Los siete pasos como dato. Lo que se prueba acá es el CRITERIO DE CERTEZA: que un paso no pueda
// decir «firme» cuando le falta una cita, y que la plata de un paso sea null y no cero cuando
// ninguna de sus partidas tiene precio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { razonar } from './razonamiento.mjs'
import { vistaDePasos, certezaDeLectura, pasoDeItem, ESTADO, ESQUELETO } from './pasos-vista.mjs'

const lamina = (over = {}) => ({
  archivo: 'B-01.pdf',
  lamina: { codigo: 'B-01', vistas: ['fundaciones'] },
  grilla: { largoTotal: 40, anchoTotal: 32, lucesEntreEjes: [6, 6, 4.85], textoLiteral: '40,00 × 32,00' },
  elementos: [],
  proyecto: { superficie_cubierta_m2: 1284, notas_generales: [] },
  ...over,
})

const item = (id, over = {}) => ({ id, nombre: id, cantidadElementos: 4, lamina: 'B-01', dimensiones: { ancho_m: 1.8, alto_m: 0.5 }, ...over })

test('los siete pasos salen con su pregunta y en el orden de la lectura', () => {
  const pasos = vistaDePasos(razonar({ computo: { items: [] }, laminas: [lamina()], documentos: {} }))
  assert.equal(pasos.length, 7)
  assert.deepEqual(pasos.map((p) => p.id), ESQUELETO.map((e) => e.id))
  assert.deepEqual(pasos.map((p) => p.etiqueta), ['1', '2', 'x', '3', '4', '5', '6'])
  for (const p of pasos) assert.ok(p.pregunta.length > 10, `el paso ${p.id} tiene que traer su pregunta`)
})

test('un paso sin la cita del plano NO puede declararse firme', () => {
  // Base contada pero sin sección citada: se cuenta, no se cotiza.
  const items = [item('B1', { dimensiones: {} })]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const bases = pasos.find((p) => p.id === 'p2')
  assert.equal(bases.estado, ESTADO.SIN_DATO)
  assert.ok(bases.filas.some((f) => f.falta), 'la fila sin sección viene marcada como falta')
  assert.match(bases.supuesto, /supuesto/i)
})

test('con sección citada y cantidad, la base queda firme', () => {
  const items = [item('B1')]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  assert.equal(pasos.find((p) => p.id === 'p2').estado, ESTADO.FIRME)
})

test('el arriostramiento sin exigencia sísmica declarada queda en CONFLICTO, no en economía', () => {
  const items = [item('Arriostramiento transversal')]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const vigas = pasos.find((p) => p.id === 'p4')
  assert.equal(vigas.estado, ESTADO.CONFLICTO)
  assert.ok(vigas.filas.some((f) => f.disputa))
})

test('si el plano nombra la exigencia sísmica, el arriostramiento deja de estar en disputa', () => {
  const l = lamina({ proyecto: { notas_generales: ['Estructura según INPRES-CIRSOC 103 zona sísmica 4.'] } })
  const items = [item('Arriostramiento transversal')]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [l], documentos: {} }), { items })
  const vigas = pasos.find((p) => p.id === 'p4')
  assert.notEqual(vigas.estado, ESTADO.CONFLICTO)
  assert.match(vigas.supuesto, /INPRES/i)
})

test('sin ninguna lámina leída el barrido no dice que cierra', () => {
  const pasos = vistaDePasos(razonar({ computo: { items: [] }, laminas: [], documentos: {} }))
  assert.equal(pasos.find((p) => p.id === 'p7').estado, ESTADO.SIN_DATO)
})

test('un elemento sin paso asignado se ve en el barrido y no se cotiza en silencio', () => {
  const items = [item('Foso de bomba', { dimensiones: {} })]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const barrido = pasos.find((p) => p.id === 'p7')
  assert.equal(barrido.estado, ESTADO.REVISAR)
  assert.ok(barrido.filas.some((f) => f.v === 'sin paso'))
  assert.equal(pasoDeItem(items[0]), 'p7')
})

test('la plata de un paso es null cuando ninguna partida tiene precio — nunca cero', () => {
  const items = [item('B1', { cantidad: 4, costoUnitario: null })]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const bases = pasos.find((p) => p.id === 'p2')
  assert.equal(bases.deriva.partidas, 1)
  assert.equal(bases.deriva.importe, null)
  assert.equal(bases.deriva.sinCotizar, 1)
})

test('la plata se suma sólo de las partidas con precio, y las sin precio se cuentan', () => {
  const items = [
    item('B1', { cantidad: 4, costoUnitario: 100000 }),
    item('B2', { cantidad: 2, costoUnitario: null }),
  ]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const bases = pasos.find((p) => p.id === 'p2')
  assert.equal(bases.deriva.importe, 400000)
  assert.equal(bases.deriva.sinCotizar, 1)
})

test('un paso que no deriva partidas lo declara con cero partidas y sin importe', () => {
  const pasos = vistaDePasos(razonar({ computo: { items: [] }, laminas: [lamina()], documentos: {} }), { items: [] })
  const luces = pasos.find((p) => p.id === 'p6')
  assert.deepEqual(luces.deriva, { partidas: 0, importe: null, sinCotizar: 0 })
})

test('la certeza de la lectura es el PEOR de sus pasos', () => {
  const items = [item('Arriostramiento transversal')]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const c = certezaDeLectura(pasos)
  assert.equal(c.estado, ESTADO.CONFLICTO)
  assert.equal(c.total, 7)
})

test('sin razonamiento no hay pasos inventados', () => {
  assert.deepEqual(vistaDePasos(null), [])
  assert.deepEqual(certezaDeLectura([]), { estado: null, porEstado: {}, firmes: 0, pendientes: 0, hechos: 0, total: 0 })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA LECTURA EN CURSO — «todavía no llegué» NO es «lo miré y no está»
//
// El defecto que estos controles atrapan: durante los minutos que dura la lectura, la pantalla
// mostraba siete pasos animados por un temporizador de 620 ms. «Paso 3 de 7» sin haber leído nada
// es una estimación presentada como hecho. Y la corrección ingenua —publicar los pasos reales desde
// el primer avance— tiene su propio defecto: declara «sin dato» (el plano no lo trae, pedíselo al
// proyectista) sobre láminas que todavía no se abrieron.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const rzVacio = () => razonar({ computo: { items: [] }, laminas: [], documentos: {} })

test('lectura ABIERTA sin nada leído: los siete pasos existen y los siete son PENDIENTE', () => {
  const pasos = vistaDePasos(rzVacio(), { items: [], cerrada: false })
  assert.equal(pasos.length, 7, 'la guía completa se ve desde el primer segundo')
  assert.deepEqual([...new Set(pasos.map((p) => p.estado))], [ESTADO.PENDIENTE])
  assert.deepEqual(pasos.map((p) => p.titulo), ESQUELETO.map((e) => e.titulo), 'pendiente NO es un paso anónimo: trae su pregunta y su título')
})

test('la MISMA lectura, cerrada, no tiene un solo pendiente — ahí sí «sin dato» es una afirmación', () => {
  const pasos = vistaDePasos(rzVacio(), { items: [], cerrada: true })
  assert.equal(pasos.filter((p) => p.estado === ESTADO.PENDIENTE).length, 0)
  assert.ok(pasos.some((p) => p.estado === ESTADO.SIN_DATO), 'con la lectura cerrada, lo que no apareció es un faltante con nombre')
})

test('un paso PENDIENTE no publica filas, ni evidencia, ni supuesto, ni faltantes', () => {
  const p = vistaDePasos(rzVacio(), { items: [], cerrada: false }).find((x) => x.id === 'p3')
  assert.equal(p.estado, ESTADO.PENDIENTE)
  assert.deepEqual(p.filas, [], 'una fila «falta la profundidad» sobre un plano que no se abrió es un faltante inventado')
  assert.equal(p.evidencia, null)
  assert.equal(p.supuesto, null)
  assert.deepEqual(p.faltan, [])
})

test('en cuanto un paso MIDE algo pasa a EN CURSO — que no es una certeza, es un avance', () => {
  const items = [item('B1')]
  const abierta = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items, cerrada: false })
  const bases = abierta.find((p) => p.id === 'p2')
  assert.equal(bases.estado, ESTADO.EN_CURSO, 'ya midió 4 bases: eso es un avance, no una espera')
  assert.notEqual(bases.estado, ESTADO.FIRME, 'y tampoco es firme: faltan láminas que pueden completarlo o contradecirlo')
  // Y los que todavía no vieron nada siguen pendientes: la lectura avanza de a uno, no de golpe.
  assert.ok(abierta.some((p) => p.estado === ESTADO.PENDIENTE), 'si TODOS quedaran resueltos con una lámina, el paso a paso no mediría nada')
  // Cerrada, el MISMO dato sí puede declarar certeza.
  const cerrada = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items, cerrada: true })
  assert.equal(cerrada.find((p) => p.id === 'p2').estado, ESTADO.FIRME)
})

test('certezaDeLectura: `hechos` es el número que ve el dueño y sale de los datos, no de un reloj', () => {
  const items = [item('B1')]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items, cerrada: false })
  const c = certezaDeLectura(pasos)
  assert.equal(c.total, 7)
  assert.equal(c.hechos + c.pendientes, 7, 'los siete están siempre: los contestados más los que faltan')
  assert.ok(c.hechos > 0 && c.pendientes > 0, 'esta lectura está a mitad de camino — si diera 0 o 7 el control no probaría nada')
  assert.equal(c.estado, ESTADO.PENDIENTE, 'una lectura con pasos sin contestar no puede declararse firme por los que sí contestó')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LOS FALTANTES SON POR FILA, NO POR PASO (auditoría 03/09/2026)
//
// El defecto: `pendiente` se aplicaba al PASO entero, así que bastaba que un paso midiera UNA cosa
// para que publicara también todos sus huecos. Tras una sola lámina el paso 1 ya decía
// «superficie cubierta · ningún rótulo ni planta la declara» — sobre diecinueve láminas sin abrir.
// Es el mismo faltante fabricado que la invariante decía prohibir, un nivel más abajo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('un paso EN CURSO publica sus mediciones y NINGUNO de sus huecos', () => {
  // Una lámina con grilla (mide la impronta) pero sin superficie cubierta declarada: el paso 1
  // tiene una fila medida y dos faltantes.
  const rz = razonar({ computo: { items: [] }, laminas: [lamina({ proyecto: { notas_generales: [] } })], documentos: {} })
  const cerrado = vistaDePasos(rz, { items: [], cerrada: true }).find((p) => p.id === 'p1')
  assert.ok(cerrado.filas.some((f) => f.falta), 'con la lectura cerrada el faltante SÍ se nombra: es para pedírselo al proyectista')

  const enCurso = vistaDePasos(rz, { items: [], cerrada: false }).find((p) => p.id === 'p1')
  assert.equal(enCurso.estado, ESTADO.EN_CURSO)
  assert.ok(enCurso.filas.length > 0, 'lo que sí midió se ve: el paso a paso tiene que mostrar el avance')
  assert.equal(enCurso.filas.filter((f) => f.falta).length, 0, 'ni un hueco declarado sobre documentación que no se terminó de mirar')
  assert.deepEqual(enCurso.faltan, [], 'los faltantes con nombre se emiten al cerrar, no a mitad de camino')
  assert.equal(enCurso.supuesto, null, 'un supuesto es una conclusión sobre lo que falta')
})

// Un caso con las TRES cosas a la vez: una fila medida, una fila hueca, un faltante con nombre y
// un supuesto. Es el que de verdad ejerce el filtrado — con un paso que no tiene faltantes ni
// supuestos, publicarlos o no da igual y el control no puede dar rojo.
const CON_HUECOS = [
  item('B1'),                                                        // base con sección: se mide
  item('B2', { dimensiones: {} }),                                   // base sin sección: hueco + supuesto
  item('EXC1', { nombre: 'excavación de base', dimensiones: { ancho_m: 2.4, largo_m: 2.4, profundidad_m: 1.1 } }),
  item('EXC2', { nombre: 'excavación de pozo', dimensiones: { ancho_m: 1, largo_m: 1 } }),  // sin cota: faltante con nombre
]
const conHuecos = (cerrada) => vistaDePasos(
  razonar({ computo: { items: CON_HUECOS }, laminas: [lamina()], documentos: {} }),
  { items: CON_HUECOS, cerrada },
)

test('EN CURSO no emite los FALTANTES CON NOMBRE — se le pide al proyectista al cerrar, no antes', () => {
  const cerrado = conHuecos(true).find((p) => p.id === 'p3')
  assert.equal(cerrado.faltan.length, 1, 'con la lectura cerrada el faltante viaja: es lo que hay que ir a pedir')
  assert.match(cerrado.faltan[0], /profundidad/i)

  const abierto = conHuecos(false).find((p) => p.id === 'p3')
  assert.equal(abierto.estado, ESTADO.EN_CURSO)
  assert.deepEqual(abierto.faltan, [], 'mandarlo a buscar un dato que puede estar en la lámina 12 es hacerle perder el día')
  assert.equal(abierto.filas.length, 1, 'y lo que sí se midió se sigue viendo')
})

test('EN CURSO no publica el SUPUESTO — es una conclusión sobre lo que falta', () => {
  const cerrado = conHuecos(true).find((p) => p.id === 'p2')
  assert.match(cerrado.supuesto, /supuesto/i, 'al cerrar, el supuesto que sostendría el hueco se declara')

  const abierto = conHuecos(false).find((p) => p.id === 'p2')
  assert.equal(abierto.estado, ESTADO.EN_CURSO)
  assert.equal(abierto.supuesto, null, 'ofrecer un supuesto sobre un hueco que quizá no exista es inventar el problema y la solución')
})

test('EN CURSO conserva la evidencia y la derivación: lo medido es un hecho y se muestra', () => {
  const items = [item('B1')]
  const p2 = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items, cerrada: false })
    .find((p) => p.id === 'p2')
  assert.equal(p2.deriva.partidas, 1, 'las partidas derivadas hasta acá son un dato real: alimentan la columna del cómputo')
  assert.equal(p2.evidencia, 'B-01', 'la lámina de la que salió la medición no es una conclusión: es la cita')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA MONOTONÍA NO ES «POR CONSTRUCCIÓN» — LO QUE SE PUDO PROBAR Y LO QUE NO
//
// El docblock de la primera versión afirmaba que un paso que dejó de estar pendiente no volvía, y
// que por eso la barra nunca retrocedía. Era una afirmación sin control. Lo que estos tests
// establecen, con el camino que marcó la auditoría:
//
//   · LAS FILAS MEDIDAS SÍ RETROCEDEN. Un elemento incompleto del mismo tipo, aportado por una
//     lámina posterior, vuelve `sinCantidad` al grupo entero: una fila que era medición pasa a ser
//     hueco. Probado abajo.
//   · EL PASO no llega a volver a pendiente HOY porque `deriva.partidas` le hace de piso. Ese piso
//     no lo sostiene ninguna invariante declarada: es una consecuencia de que los items sólo se
//     acumulen y de que ningún rol de estos pasos quede fuera de `PASO_DE_ROL`. NO pude construir
//     un caso que lo rompa — y eso no es lo mismo que probar que no existe.
//
// Por eso la garantía de que la barra no retroceda vive donde SÍ se puede sostener: en `contestados`,
// la memoria de la corrida que lleva el handler.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const bases = (items, opciones = {}) => vistaDePasos(
  razonar({ computo: { items }, laminas: [lamina()], documentos: {} }),
  { items, cerrada: false, ...opciones },
).find((p) => p.id === 'p2')

test('las filas MEDIDAS de un paso sí retroceden: un elemento incompleto vuelve hueco al grupo', () => {
  const medidas = (p) => p.filas.length
  assert.equal(medidas(bases([item('B1')])), 1, 'con la lámina 1 el grupo B1 está contado y con sección')
  // La lámina siguiente trae otro B1 sin cantidad: `grupoPorTipo` marca `sinCantidad` al grupo.
  assert.equal(medidas(bases([item('B1'), item('B1', { cantidadElementos: null })])), 0,
    'si esto siguiera dando 1, «la evidencia sólo se acumula» sería cierto y el candado sobraría')
})

test('lo que sostiene al paso es `deriva.partidas`, no una invariante: queda declarado, no supuesto', () => {
  const p = bases([item('B1'), item('B1', { cantidadElementos: null })])
  assert.equal(p.filas.length, 0, 'sin una sola fila medida…')
  assert.equal(p.estado, ESTADO.EN_CURSO, '…el paso igual no retrocede, pero sólo porque sigue derivando partidas')
  assert.ok(p.deriva.partidas > 0, 'ese es el único piso que hay, y no lo declara ninguna invariante del módulo')
})

test('`contestados` sostiene el avance aunque la vista devuelva el paso a pendiente', () => {
  const vacio = { computo: { items: [] }, laminas: [], documentos: {} }
  const sinMemoria = vistaDePasos(razonar(vacio), { items: [], cerrada: false }).find((p) => p.id === 'p2')
  assert.equal(sinMemoria.estado, ESTADO.PENDIENTE, 'sin nada leído y sin memoria, el paso está pendiente')

  const conMemoria = vistaDePasos(razonar(vacio), { items: [], cerrada: false, contestados: new Set(['p2']) }).find((p) => p.id === 'p2')
  assert.equal(conMemoria.estado, ESTADO.EN_CURSO, 'ya había contestado en un avance anterior: el avance no se devuelve')
  assert.equal(certezaDeLectura([conMemoria]).hechos, 1, 'y «paso N de 7» no baja delante del dueño')
})

test('`contestados` NO inventa contenido: el paso sostenido no publica filas que no midió', () => {
  const vacio = { computo: { items: [] }, laminas: [], documentos: {} }
  const p = vistaDePasos(razonar(vacio), { items: [], cerrada: false, contestados: new Set(['p2']) }).find((x) => x.id === 'p2')
  assert.deepEqual(p.filas, [], 'sostener el avance no puede convertirse en fabricar mediciones')
  assert.deepEqual(p.faltan, [])
  assert.match(p.resumen, /Sin mediciones nuevas/)
})
