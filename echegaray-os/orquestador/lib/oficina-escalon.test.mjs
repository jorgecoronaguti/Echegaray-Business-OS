// LO QUE SE PRUEBA ACÁ ES QUE LA PROYECCIÓN DE OFICINA NO PUEDA VOLVER A SER MUDA NI A APAGARSE.
//
// Los tres defectos que estos tests atrapan, en orden de plata:
//   1. Un mes proyectado sobre un tramo INVENTADO se veía igual que uno sobre un acuerdo FIRMADO.
//   2. Con la cadena a medio firmar, decir "no sé" (la trampa de la Σ del convenio, que se apaga
//      entera y en silencio: $79.753.312 publicados donde el piso pedía $109.714.182).
//   3. Un escalón que baja publicando para diciembre menos de lo último efectivamente pagado.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LINEA_DRIVER_OFICINA, estadoOficinaDelMes, expresionFactorOficina, formulaProyectadoOficina,
  origenDelEscalon, periodoDe,
} from './oficina-escalon.mjs'
import { parsearAcuerdos } from './uocra-acuerdos.mjs'
import { LARGO_NOTA, sub } from './patron-pestana.mjs'
import { ALERTA } from './glifos.mjs'

const cinco = (rotulo, [oe, of, mo, ay, se]) => [
  [rotulo, 'Oficial Especializado', 'Hora', String(oe), '', '', String(oe), String(oe)],
  ['', 'Oficial', '', String(of)], ['', 'Medio Oficial', '', String(mo)],
  ['', 'Ayudante', '', String(ay)], ['', 'Sereno', 'Mes', String(se)],
]
// La misma réplica que usa el test del generador: acuerdo de Mayo 2026 con julio y agosto publicados.
// Septiembre en adelante NO tiene acuerdo — es donde el escalón pasa a ser proyección.
const { escalones: ESC } = parsearAcuerdos([
  ['Acuerdo Mayo 2026'],
  ...cinco('Agosto\n+1,9%', [7420, 6348, 5866, 5399, 980858]),
  ...cinco('Julio\n+2%', [6800, 5817, 5375, 4948, 898817]),
  ['Acuerdo Septiembre 2025'],
  ...cinco('Septiembre\n(1,3% s/ago)', [5069, 4336, 4006, 3687, 672072]),
])

test('el mes con TODOS los tramos firmados nombra el acuerdo, igual que el cuadro 4.2', () => {
  // Base junio → agosto: los tramos de julio (2%) y agosto (1,9%) salen los dos del acuerdo publicado.
  const o = origenDelEscalon({ escalones: ESC, periodoBase: '2026-06', periodoMes: '2026-08' })
  assert.equal(o.clase, 'firmado')
  assert.equal(o.rotulo, 'Ac.Mayo 2026', 'el mismo texto que publica «De dónde sale» en 4.2')
  assert.doesNotMatch(o.rotulo, /▲/, 'un acuerdo firmado no lleva alerta: la alerta dejaría de significar algo')
})

test('LA TRAMPA: con la cadena a medio firmar NO devuelve vacío, dice hasta dónde', () => {
  // Base junio → diciembre. Julio y agosto están firmados; septiembre a diciembre son proyección.
  // La respuesta útil no es "no sé" ni "firmado" a secas: es hasta qué mes hay acuerdo.
  const o = origenDelEscalon({ escalones: ESC, periodoBase: '2026-06', periodoMes: '2026-12' })
  assert.equal(o.clase, 'mixto')
  assert.equal(o.rotulo, `${ALERTA} firmado hasta 08/2026`)
  assert.notEqual(o.rotulo, '', 'devolver vacío es la trampa que apagó la Σ del convenio de obra')
})

test('sin un solo tramo firmado en el camino, la fila lo dice entero', () => {
  const o = origenDelEscalon({ escalones: ESC, periodoBase: '2026-09', periodoMes: '2026-12' })
  assert.equal(o.clase, 'proyectado')
  assert.equal(o.rotulo, `${ALERTA} escalón proyectado`)
})

test('el mes base no lleva rótulo y los anteriores declaran su otro criterio', () => {
  assert.deepEqual(origenDelEscalon({ escalones: ESC, periodoBase: '2026-06', periodoMes: '2026-06' }),
    { clase: 'base', rotulo: '' })
  // Un mes ANTERIOR al base no se ajusta hacia adelante: su importe es la base deflactada. Decir
  // "proyección" a secas se lee como un olvido de carga, y es otro criterio.
  const atras = origenDelEscalon({ escalones: ESC, periodoBase: '2026-06', periodoMes: '2026-03' })
  assert.equal(atras.clase, 'atras')
  assert.equal(atras.rotulo, 'antes del mes base')
})

test('sin mes base cerrado no se inventa un origen', () => {
  // No hay de dónde proyectar y el bloque ya deja «Proyectado» vacío: el estado no puede afirmar que
  // el aumento sale de un acuerdo cuando no hay base contra la cual medirlo.
  assert.deepEqual(origenDelEscalon({ escalones: ESC, periodoBase: null, periodoMes: '2026-12' }),
    { clase: 'sin_base', rotulo: '' })
})

test('NINGÚN ESTADO INVENTA UN "el escalón baja": desde los acuerdos no puede pasar', () => {
  // Se intentó publicarlo y no se pudo: `pctDeRotulo` lee el tramo con una expresión SIN SIGNO, así
  // que un rótulo "-5%" entra como +5%. Un estado que no puede encenderse se lee como que alguien
  // está mirando, y no hay nadie. El recorte vive en la celda, que es por donde sí puede llegar.
  const { escalones: baja } = parsearAcuerdos([
    ['Acuerdo Mayo 2026'],
    ...cinco('Agosto\n-5%', [7000, 6000, 5500, 5100, 950000]),
    ...cinco('Julio\n+2%', [6800, 5817, 5375, 4948, 898817]),
  ])
  const o = origenDelEscalon({ escalones: baja, periodoBase: '2026-07', periodoMes: '2026-08' })
  assert.notEqual(o.rotulo, '', 'igual tiene que decir de dónde sale el aumento')
  assert.ok(['firmado', 'mixto', 'proyectado'].includes(o.clase), `clase inesperada: ${o.clase}`)
})

test('el estado une los dos hechos y el mes pagado no arrastra ninguno', () => {
  const firmado = { rotulo: 'Ac.Mayo 2026' }
  assert.equal(estadoOficinaDelMes({ pago: 'proyección', origen: firmado }), 'proyección · Ac.Mayo 2026')
  assert.equal(estadoOficinaDelMes({ pago: 'parcial', origen: firmado }), 'parcial · Ac.Mayo 2026')
  // Un mes PAGADO es un hecho: no tiene proyección adentro y un sufijo de escalón lo haría dudar.
  assert.equal(estadoOficinaDelMes({ pago: 'pagado', origen: firmado }), 'pagado')
  // Sin origen se conserva el comportamiento anterior, no se emite un "·" colgando.
  assert.equal(estadoOficinaDelMes({ pago: 'proyección', origen: { rotulo: '' } }), 'proyección')
})

test('ningún estado se pasa del tope de la grilla: la columna D está en el MEDIO', () => {
  // `auditarPatron` marca `nota-en-el-medio` cualquier texto de más de 60 caracteres que no esté en la
  // primera ni en la última columna. Se mide el más largo que este cuadro puede producir.
  const largos = [
    origenDelEscalon({ escalones: ESC, periodoBase: '2026-06', periodoMes: '2026-12' }),
    origenDelEscalon({ escalones: ESC, periodoBase: '2026-09', periodoMes: '2026-12' }),
    origenDelEscalon({ escalones: ESC, periodoBase: '2026-06', periodoMes: '2026-08' }),
  ].map((origen) => estadoOficinaDelMes({ pago: 'proyección', origen }))
  for (const s of largos) assert.ok(s.length <= LARGO_NOTA, `"${s}" mide ${s.length} y el tope es ${LARGO_NOTA}`)
})

test('la línea del driver entra en la glosa: 60 contando el prefijo de sub()', () => {
  // Si alguien la alarga, la pestaña vuelve a la prosa que el dueño rechazó — y el test de glosas del
  // generador se pondría rojo sin decir cuál fue.
  const linea = sub(LINEA_DRIVER_OFICINA)
  assert.ok(linea.length <= LARGO_NOTA, `la línea mide ${linea.length} y el tope es ${LARGO_NOTA}`)
  assert.match(LINEA_DRIVER_OFICINA, /%/, 'tiene que declarar el driver: por qué sube este número')
  assert.match(LINEA_DRIVER_OFICINA, /piso/, 'y que no hay piso: el hueco mudo es el defecto que se arregla')
  // Y NO PUEDE TRAER VOCABULARIO GREMIAL. El dueño ordenó que el convenio viviera junto y debajo de
  // las tres nóminas; esta línea está en el medio. Si alguien la reescribe nombrando el convenio, el
  // test de la pestaña se pone rojo — éste dice antes por qué.
  for (const palabra of [/paritaria/i, /convenio/i, /escal[óo]n/i, /categor[íi]a/i, /b[áa]sico/i]) {
    assert.doesNotMatch(LINEA_DRIVER_OFICINA, palabra, 'lo gremial va entero en la sección 4, no en el medio')
  }
})

test('EL PISO EN LA FÓRMULA: hacia adelante recorta, hacia atrás no', () => {
  const base = { celdaBase: '$C$44', celdaFactor: 'B50', celdaPagado: 'C50' }
  const adelante = formulaProyectadoOficina({ ...base, conBloque: false, conPiso: true })
  assert.equal(adelante, '=$C$44*MAX(1;B50)')
  // Un mes anterior al base se deflacta: con el piso puesto se lo sobreestimaría todos los meses.
  assert.equal(formulaProyectadoOficina({ ...base, conBloque: false, conPiso: false }), '=$C$44*B50')
  // El mes PARCIAL sigue proyectando sólo lo que falta, con el piso adentro.
  assert.equal(formulaProyectadoOficina({ ...base, conBloque: true, conPiso: true }),
    '=MAX(0;$C$44*MAX(1;B50)-N(C50))')
})

test('el literal del piso va con "/" y ";" — nunca una coma decimal', () => {
  // `*0,5` escrito por API viaja en el locale es_AR del archivo, donde la coma separa argumentos: la
  // celda queda en #ERROR. Acá el separador de MAX es ";" y el piso es un 1 entero.
  const f = expresionFactorOficina('B50', true)
  assert.equal(f, 'MAX(1;B50)')
  assert.doesNotMatch(f, /\d,\d/, 'un decimal con coma parte la fórmula en dos argumentos')
})

test('periodoDe arma el mismo formato que el parser de acuerdos', () => {
  // Si esto se desalinea, `origenDelEscalon` no encuentra ningún tramo y todos los meses caerían a
  // "sin base" — la proyección quedaría muda otra vez, sin dar un error.
  assert.equal(periodoDe(2026, 8), '2026-08')
  assert.equal(periodoDe(2026, 12), '2026-12')
  assert.ok(ESC.some((e) => e.periodo === periodoDe(2026, 8)), 'el período tiene que existir en la réplica parseada')
})
