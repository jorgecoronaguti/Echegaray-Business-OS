import test from 'node:test'
import assert from 'node:assert/strict'
import {
  componenteDe, clasificarFila, cuadroFlota, herenciaFinanciera, esObra, COMPONENTES,
} from './flota-costos.mjs'
import { resolverUnidad, UNIDADES } from './flota-unidades.mjs'

const fila = (o) => ({ proveedor: '', concepto: '', obra_texto: '', total: 0, fecha: null, ...o })
const comp = (f) => componenteDe(f, resolverUnidad(f.concepto))

test('contratar un camión ajeno no es un gasto de nuestro camión', () => {
  // "Viajes de Camion regador — 9 viajes" ($450.000 a ARCOR) nombra "camión" igual que
  // "Arreglo camion". Sin la exclusión, el Mercedes 608D carga un servicio que nunca lo tocó.
  assert.equal(comp(fila({ proveedor: 'Diego Morales', concepto: 'Viajes de Camion regador — 9 viajes', obra_texto: 'ARCOR', total: 450000 })), null)
  assert.equal(comp(fila({ proveedor: 'Perera Walter Daniel', concepto: 'Reparación — Arreglo camion', obra_texto: 'Taller' })), 'mantenimiento')
})

test('la máquina de soldar es herramienta de taller, no flota', () => {
  // Entraba por la familia genérica "máquina" y sumaba $404.930 al "sin unidad" de la flota,
  // empeorando el número que mide la calidad del dato con plata que nunca fue de un vehículo.
  assert.equal(comp(fila({ proveedor: 'Linarc', concepto: 'PINZAS DE MASA - REPARACION DABLES Y CONFIGURACION DE MAQUINA DE SOLDAR', obra_texto: 'TALLER' })), null)
  assert.equal(comp(fila({ proveedor: 'Ferretec', concepto: 'insumos — Manguitos para cables de maquina de soldar', obra_texto: 'Taller' })), null)
})

test('la estación de servicio vende más que combustible', () => {
  // Combustibles Barceló facturó almuerzos, café y un asado. Ser estación no alcanza: el concepto
  // además tiene que hablar de combustible, o el cuadro de flota se come la comida del equipo.
  assert.equal(comp(fila({ proveedor: 'Combustibles Barcelo', concepto: 'almuerzo — rodrigo', obra_texto: 'Administracion' })), null)
  assert.equal(comp(fila({ proveedor: 'Combustibles Barcelo', concepto: 'Bases de Tanque — Cafe para viaje', obra_texto: 'Administracion' })), null)
  assert.equal(comp(fila({ proveedor: 'Combustibles Barcelo', concepto: 'Combustible — Combustible', obra_texto: 'Taller' })), 'combustible')
})

test('un gasto de flota SIN unidad igual entra al cuadro', () => {
  // Si sólo entrara lo que nombra unidad, el renglón "sin unidad" daría 0 y mentiría justo en el
  // número que existe para medir si la medición sirve.
  assert.equal(comp(fila({ proveedor: 'Neumagom', concepto: 'Neumaticos — Neumaticos', obra_texto: 'Taller' })), 'neumaticos')
  assert.equal(comp(fila({ proveedor: 'Gimenez Mecanico', concepto: 'REPARACION CAJA DE TRANSMISION, EMBRAGUE', obra_texto: 'TALLER' })), 'mantenimiento')
})

test('el alquiler sólo cuenta cuando el equipo es de un tercero', () => {
  assert.equal(comp(fila({ proveedor: 'DUPEC', concepto: 'ALQUILER TIJERA 4X4', obra_texto: 'San Francisco' })), 'alquiler')
  assert.equal(comp(fila({ proveedor: 'DUPEC', concepto: 'ALQUILER DE EQUIPO — MINI RETRO EXCAVADORA', obra_texto: 'MESSINA' })), 'alquiler')
  // "Alquiler" sin equipo de tercero nombrado no es flota: puede ser el alquiler de una oficina.
  assert.equal(comp(fila({ proveedor: 'Robles Jose Maria', concepto: 'Alquiler mensual', obra_texto: 'Administracion' })), null)
})

test('seguro y patente existen como renglón aunque hoy den cero', () => {
  // Son los dos componentes que la flota necesita para un costo completo y que en Compras no tienen
  // ni una fila. Un renglón en $0 es una pregunta; un componente ausente es un agujero invisible.
  for (const k of ['seguro', 'registral']) {
    assert.ok(COMPONENTES.some((c) => c.clave === k), `falta el componente ${k}`)
  }
  assert.equal(comp(fila({ proveedor: 'Sancor Seguros', concepto: 'Poliza — Toyota EEA885', obra_texto: 'Administracion' })), 'seguro')
  assert.equal(comp(fila({ proveedor: 'Rentas San Juan', concepto: 'Patente — Ford XLS', obra_texto: 'Administracion' })), 'registral')
})

test('la cuota sin nombre hereda la unidad de su propia serie', () => {
  // "Cuota 15" no dice de qué camioneta es; "Cuota 21 — Prestamo Camioneta Ford XLS" sí. Son el
  // mismo préstamo. Sin herencia, $7.661.602 quedan "sin dueño" con el dueño a la vista.
  const filas = [
    fila({ proveedor: 'Banco', concepto: 'Cuota 15', obra_texto: 'Credito Prendario', total: 1275317, fecha: '2026-01-07' }),
    fila({ proveedor: 'Banco', concepto: 'Cuota 21 — Prestamo Camioneta Ford XLS', obra_texto: 'Credito Prendario', total: 1282811, fecha: '2026-07-07' }),
  ]
  const c = cuadroFlota(filas, { corte: '2026-08-13' })
  const xls = c.unidades.find((u) => u.clave === 'ford-xls')
  assert.equal(xls.real, 1275317 + 1282811)
  assert.equal(c.sinUnidad.real, 0)
})

test('con DOS préstamos en el grupo la herencia se apaga sola', () => {
  // El día que haya un segundo prendario, adivinar de cuál es la cuota sin nombre sería inventar.
  const filas = [
    fila({ proveedor: 'Banco', concepto: 'Cuota 15', obra_texto: 'Credito Prendario', total: 1000, fecha: '2026-01-07' }),
    fila({ proveedor: 'Banco', concepto: 'Cuota 21 — Prestamo Camioneta Ford XLS', obra_texto: 'Credito Prendario', total: 2000, fecha: '2026-07-07' }),
    fila({ proveedor: 'Banco', concepto: 'Cuota 3 — Prestamo Toyota AD119YO', obra_texto: 'Credito Prendario', total: 3000, fecha: '2026-07-07' }),
  ]
  const c = cuadroFlota(filas, { corte: '2026-08-13' })
  assert.equal(herenciaFinanciera(filas.map((f) => ({ fila: f, c: clasificarFila(f) }))).size, 0)
  assert.equal(c.sinUnidad.real, 1000, 'la cuota sin nombre vuelve a "sin unidad"')
})

test('lo que todavía no venció no se suma a lo que ya se pagó', () => {
  // Regla de oro 3. El prendario tiene el año entero cargado: al 13/08 hay 8 cuotas pagadas y 4 por
  // vencer. Un solo "costo 2026" mezcla plata que salió con plata que va a salir.
  const filas = [
    fila({ proveedor: 'Banco', concepto: 'Cuota 22 — Prestamo Camioneta Ford XLS', obra_texto: 'Credito Prendario', total: 1282811, fecha: '2026-08-07' }),
    fila({ proveedor: 'Banco', concepto: 'Cuota 23 — Prestamo Camioneta Ford XLS', obra_texto: 'Credito Prendario', total: 1282811, fecha: '2026-09-07' }),
  ]
  const c = cuadroFlota(filas, { corte: '2026-08-13' })
  assert.equal(c.totalReal, 1282811)
  assert.equal(c.totalComprometido, 1282811)
  const xls = c.unidades.find((u) => u.clave === 'ford-xls')
  assert.equal(xls.real, 1282811)
  assert.equal(xls.comprometido, 1282811)
})

test('el reparto es una PARTICIÓN: nada se pierde ni se cuenta dos veces', () => {
  const filas = [
    fila({ proveedor: 'Combustibles Barcelo', concepto: 'combustible — FORD XLS', obra_texto: 'Administracion', total: 100, fecha: '2026-05-01' }),
    fila({ proveedor: 'Combustibles Barcelo', concepto: 'Combustible — 50L C/U bobcat y camion', obra_texto: 'MESSINA', total: 200, fecha: '2026-05-02' }),
    fila({ proveedor: 'Combustibles Barcelo', concepto: 'Combustible — Combustible', obra_texto: 'Taller', total: 50, fecha: '2026-05-03' }),
    fila({ proveedor: 'Corralon Progreso', concepto: 'Mamposteria — cemento', obra_texto: 'LA ESTRELLA', total: 9999, fecha: '2026-05-04' }),
  ]
  const c = cuadroFlota(filas, { corte: '2026-12-31' })
  const suma = c.unidades.reduce((s, u) => s + u.real, 0) + c.sinUnidad.real
  assert.equal(suma, c.totalReal)
  assert.equal(c.totalReal, 350, 'el cemento de la obra no es flota')
  // La carga compartida NO se le da a ninguna de las dos unidades que nombra.
  assert.equal(c.unidades.find((u) => u.clave === 'camion-608d').real, 0)
  assert.equal(c.unidades.find((u) => u.clave === 'bobcat-s650').real, 0)
  assert.equal(c.sinUnidad.porCausa.compartido.real, 200)
})

test('una unidad sin gastos aparece en CERO, no ausente', () => {
  // Una unidad ausente del cuadro se lee como "no la miramos"; una en $0 se lee como "no gastó" — y
  // si eso es falso, hay un gasto cargándose con otro nombre.
  const c = cuadroFlota([], { corte: '2026-12-31' })
  assert.equal(c.unidades.length, UNIDADES.length)
  assert.ok(c.unidades.every((u) => u.real === 0 && u.comprometido === 0))
})

test('"Administracion" y "Taller" no son obras donde la unidad trabajó', () => {
  // La columna Cliente/Asignación mezcla obras con destinos de estructura. Leer "Administracion"
  // como obra inventaría utilización en una obra que no existe.
  assert.equal(esObra('Administracion'), false)
  assert.equal(esObra('Taller'), false)
  assert.equal(esObra('Credito Prendario'), false)
  assert.equal(esObra('MESSINA'), true)
  assert.equal(esObra('San Francisco'), true)
  assert.equal(esObra(''), false)
})

test('la utilización se registra sólo donde hay obra de verdad', () => {
  const filas = [
    fila({ proveedor: 'Combustibles Barcelo', concepto: 'combustible — BOBCAT', obra_texto: 'MESSINA', total: 100, fecha: '2026-05-01' }),
    fila({ proveedor: 'Combustibles Barcelo', concepto: 'combustible — BOBCAT', obra_texto: 'Taller', total: 70, fecha: '2026-05-02' }),
  ]
  const b = cuadroFlota(filas, { corte: '2026-12-31' }).unidades.find((u) => u.clave === 'bobcat-s650')
  assert.deepEqual(b.obras, { MESSINA: 100 })
  assert.equal(b.real, 170, 'el gasto entra igual aunque el destino no sea una obra')
})

test('pctSinUnidad se mide sobre lo REAL, no sobre lo comprometido', () => {
  // Meter el prendario futuro en el denominador bajaría el porcentaje sin que mejore un solo dato.
  const filas = [
    fila({ proveedor: 'Combustibles Barcelo', concepto: 'Combustible — Combustible', obra_texto: 'Taller', total: 100, fecha: '2026-05-01' }),
    fila({ proveedor: 'Combustibles Barcelo', concepto: 'combustible — FORD XLS', obra_texto: 'Taller', total: 300, fecha: '2026-05-01' }),
    fila({ proveedor: 'Banco', concepto: 'Cuota 26 — Prestamo Camioneta Ford XLS', obra_texto: 'Credito Prendario', total: 9600, fecha: '2026-12-07' }),
  ]
  const c = cuadroFlota(filas, { corte: '2026-08-13' })
  assert.equal(c.pctSinUnidad, 0.25)
})
