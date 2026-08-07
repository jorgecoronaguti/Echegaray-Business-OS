// LO QUE SE PRUEBA ACÁ ES LA ORDEN DEL 07/08: la proyección de obreros se valúa al 100% del convenio.
//
// El defecto que estos tests atrapan NO es "la cuenta da mal": es que la base vuelva a ser el jornal
// PACTADO (que está 15% debajo de la escala), que la Σ quede CONGELADA en un número en vez de salir del
// espejo, o que la pestaña publique el supuesto como si fuera el jornal vigente. Los tres se ven igual
// de sanos en pantalla.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  formulaSigmaConvenio, lineaSupuestoConvenio, sigmaConvenioDelPlantel, NOTA_SUPUESTO_CONVENIO,
} from './proyeccion-convenio.mjs'
import { parsearAcuerdos } from './uocra-acuerdos.mjs'

const cinco = (rotulo, [oe, of, mo, ay, se]) => [
  [rotulo, 'Oficial Especializado', 'Hora', String(oe), '', '', String(oe), String(oe)],
  ['', 'Oficial', '', String(of)], ['', 'Medio Oficial', '', String(mo)],
  ['', 'Ayudante', '', String(ay)], ['', 'Sereno', 'Mes', String(se)],
]
const { escalones } = parsearAcuerdos([
  ['Acuerdo Mayo 2026'],
  ...cinco('Agosto\n+1,9%', [7420, 6348, 5866, 5399, 980858]),
])
const AGOSTO = escalones[0]

/** El plantel real del 07/08: 4 OF · 2 A · 2 A M · 8 OF M. Columna B nombre, columna D categoría. */
const PLANTEL = [
  ...Array(4).fill('OF'), ...Array(2).fill('A'), ...Array(2).fill('A M'), ...Array(8).fill('OF M'),
]
const espejoCon = (cats, filaInicio = 495) => {
  const grid = []
  cats.forEach((c, i) => { grid[filaInicio - 1 + i] = ['1', `Persona ${i + 1}`, '45000', c] })
  return { grid, bloque: { inicio: filaInicio, fin: filaInicio + cats.length - 1 } }
}

test('LA Σ DEL PLANTEL AL CONVENIO: 12 Oficiales + 4 Ayudantes = $97.772 a valores de agosto', () => {
  // El número del dueño, con la equivalencia que él declaró (OF y OF M→Oficial · A y A M→Ayudante).
  // Si alguien vuelve a valuar sobre el jornal PACTADO, esto da $85.900 y se pone rojo.
  const { grid, bloque } = espejoCon(PLANTEL)
  const s = sigmaConvenioDelPlantel(grid, bloque, AGOSTO)
  assert.equal(s.personas, 16)
  assert.equal(s.total, 12 * 6348 + 4 * 5399)
  assert.equal(s.total, 97772)
  assert.deepEqual(s.sinEscala, [])
  // Y abierto por categoría, para que el log de la corrida pueda mostrar de dónde sale cada peso.
  const oficiales = s.porCategoria.filter((c) => c.convenio === 'Oficial').reduce((n, c) => n + c.personas, 0)
  assert.equal(oficiales, 12, 'el sufijo M tiene que mapear igual: es la orden expresa del dueño')
})

test('UN CAMBIO DE CATEGORÍA EN EL ESPEJO MUEVE LA PROYECCIÓN — no es una constante', () => {
  // Ascender un ayudante a oficial tiene que costar exactamente la diferencia de escala. Si la Σ
  // estuviera pegada, este test daría el mismo número y no habría forma de notarlo en el Sheet.
  const base = sigmaConvenioDelPlantel(...Object.values(espejoCon(PLANTEL)), AGOSTO)
  const ascendido = [...PLANTEL]
  ascendido[ascendido.indexOf('A')] = 'OF'
  const s = sigmaConvenioDelPlantel(...Object.values(espejoCon(ascendido)), AGOSTO)
  assert.equal(s.total - base.total, 6348 - 5399)
})

test('UN ALTA EN EL ESPEJO MUEVE LA PROYECCIÓN, y una categoría desconocida NO se adivina', () => {
  const s = sigmaConvenioDelPlantel(...Object.values(espejoCon([...PLANTEL, 'OF'])), AGOSTO)
  assert.equal(s.personas, 17)
  assert.equal(s.total, 97772 + 6348)
  // Una categoría que no está en la tabla de equivalencia no vale cero en silencio: se cuenta como
  // persona y se nombra aparte. Inventarle una escala sería fabricar un dato.
  const raro = sigmaConvenioDelPlantel(...Object.values(espejoCon([...PLANTEL, 'ZZ'])), AGOSTO)
  assert.equal(raro.personas, 17)
  assert.equal(raro.total, 97772, 'le puso escala a una categoría que no tiene equivalente declarado')
  assert.deepEqual(raro.sinEscala, ['ZZ'])
})

test('sin escalón vigente no hay Σ del convenio: cero personas valuadas, y se dice cuáles', () => {
  const { grid, bloque } = espejoCon(PLANTEL)
  const s = sigmaConvenioDelPlantel(grid, bloque, null)
  assert.equal(s.total, 0)
  assert.equal(s.personas, 16, 'las personas existen aunque no haya escala: el hueco es de la réplica')
  assert.deepEqual(s.sinEscala, ['OF', 'A', 'A M', 'OF M'])
})

test('LA Σ DE LA PESTAÑA SALE POR FÓRMULA DE LAS DOS COLUMNAS VIVAS DEL BLOQUE 1.1', () => {
  // B = personas por categoría (COUNTIFS sobre el espejo) · F = básico del convenio (INDEX sobre la
  // réplica). El producto escalar de las dos se mueve solo con un alta, una baja, un cambio de
  // categoría o un acuerdo nuevo. Si alguien la reemplaza por un número, esto se pone rojo.
  assert.equal(formulaSigmaConvenio(18, 21), 'SUMPRODUCT($B$18:$B$21;$F$18:$F$21)')
  // Separador de argumentos en es-AR: punto y coma. Con coma, Sheets rechaza la fórmula entera.
  assert.doesNotMatch(formulaSigmaConvenio(18, 21), /,/)
  assert.equal(formulaSigmaConvenio(0, 0), null, 'sin bloque no hay Σ que armar')
  assert.equal(formulaSigmaConvenio(18, 17), null)
})

test('LA PESTAÑA DECLARA QUE ES UN SUPUESTO, NO EL JORNAL VIGENTE', () => {
  const l = lineaSupuestoConvenio({ sigma: formulaSigmaConvenio(18, 21), celdaPersonas: '$B$22' })
  assert.match(l, /^=IF\(/, 'la línea tiene que evaluar la Σ real: es además el canario de la réplica')
  assert.match(l, /SUPUESTO DEL DUEÑO/)
  assert.match(l, /100% DEL CONVENIO/)
  assert.match(l, /POR DEBAJO/, 'sin esto se lee como que hoy pagamos la escala, y no la pagamos')
  assert.match(l, /&\$B\$22&/, 'la cantidad de personas tiene que salir de la celda, no del código')
  // NINGÚN MES NI IMPORTE ESTAMPADO: un número escrito acá envejece el día que entra un obrero.
  assert.doesNotMatch(l, /97\.?772|85\.?900/)
  assert.doesNotMatch(l, /agosto|Agosto|2026/)
  // Y si la Σ da 0 —réplica caída— la línea lo dice en vez de dejar publicar $0 de jornales.
  assert.match(l, /queda VACÍA/)
})

test('SIN ESCALA LA LÍNEA AVISA QUE LA BASE VOLVIÓ AL PACTADO: el criterio no cambia en silencio', () => {
  const l = lineaSupuestoConvenio({ sigma: null, celdaPersonas: '$B$22' })
  assert.match(l, /^ {3}· /, 'sin Σ es prosa, no fórmula: no hay nada que evaluar')
  assert.match(l, /PACTADO/)
  assert.match(l, /_UOCRA_RAW/, 'tiene que decir QUÉ fuente falta, o nadie sabe qué arreglar')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REALIDAD ÚNICA — el dueño avisó que "esto puede impactar en varias pestañas a la vez". La forma
// correcta de que impacte es que NADIE MÁS defina la base: la masa se calcula una vez y las demás
// pestañas la heredan por rango con nombre. Lo que sigue lo verifica sobre el repositorio, no sobre
// una afirmación mía — un grep que hice yo hoy no impide que mañana alguien copie la fórmula.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const RAIZ = new URL('../', import.meta.url)
/** Todo el código fuente del orquestador, sin los tests: un test que se cite a sí mismo no prueba nada. */
const fuentes = () => ['lib', 'scripts'].flatMap((dir) => {
  const base = new URL(`${dir}/`, RAIZ)
  return readdirSync(base)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .map((f) => ({ archivo: `orquestador/${dir}/${f}`, texto: readFileSync(new URL(f, base), 'utf8') }))
})

test('LA BASE SE DEFINE EN UN SOLO ARCHIVO: dos definiciones son dos empresas distintas', () => {
  const todos = fuentes()
  assert.ok(todos.length > 100, `sólo leyó ${todos.length} archivos: el escaneo no está mirando el repo`)
  // La Σ AL CONVENIO: el producto escalar de las columnas del bloque 1.1. Sólo lo arma el motor.
  const arman = todos.filter((f) => /SUMPRODUCT\(\$B\$\$\{|SUMPRODUCT\(\$B\$\d+:\$B\$\d+;\$F\$/.test(f.texto))
  assert.deepEqual(arman.map((f) => f.archivo), ['orquestador/lib/proyeccion-convenio.mjs'],
    'alguien más arma la Σ del convenio: dos definiciones de la misma masa salarial')
  // Y la Σ PACTADA —columna W del espejo—: sólo la lee el bloque 1.1, que es el control, no la
  // proyección. Si aparece en otro generador, ahí hay una segunda base y nadie va a notar cuál manda.
  const pactada = todos.filter((f) => /R\('W'\)|_J_OBREROS'!\$W/.test(f.texto))
  assert.deepEqual(pactada.map((f) => f.archivo), ['orquestador/lib/motor-salarial.mjs'],
    'el jornal pactado se lee desde otro archivo: volvió a haber dos bases')
})

test('LAS PESTAÑAS CONSUMIDORAS HEREDAN POR RANGO CON NOMBRE — ninguna recalcula la masa', () => {
  // Cada una de estas es una pestaña que muestra o multiplica los jornales proyectados. Si alguna
  // dejara de leer el rango y volviera a la planilla, la valuación al convenio no le llegaría — y su
  // número seguiría siendo plausible. Es exactamente cómo se rompió CAJA en julio.
  const consumidores = {
    'orquestador/lib/cargas-cadena.mjs': 'Cargas Sociales — jornalesDelMes(): la base de contribuciones',
    'orquestador/lib/cash-flow-lineas.mjs': 'Cash Flow — la línea de jornales, por fecha de caja',
    'orquestador/scripts/libro-movimientos-pestana.mjs': 'Libro / _MOVIMIENTOS, y de ahí CAJA',
    'orquestador/scripts/resumen-pestana.mjs': 'Resumen — las seis quincenas que vienen',
    'orquestador/scripts/conciliar-caja-vs-cashflow.mjs': 'la conciliación caja vs cash flow',
  }
  const porArchivo = Object.fromEntries(fuentes().map((f) => [f.archivo, f.texto]))
  for (const [archivo, para] of Object.entries(consumidores)) {
    assert.ok(porArchivo[archivo], `desapareció ${archivo} (${para})`)
    assert.match(porArchivo[archivo], /JORNALES_PROY_TOTAL/,
      `${archivo} dejó de leer el rango con nombre: ${para} se quedó con la masa vieja`)
  }
})

test('EL SUPUESTO LLEGA A CARGAS SOCIALES, que no muestra la masa sino que la MULTIPLICA', () => {
  // Contribuciones, IERIC, FODECO y FCL corren SOBRE la remuneración proyectada: el supuesto llega
  // compuesto hasta la última fila de esa pestaña. Declararlo sólo en Jornales lo deja fuera de donde
  // se lee — y una limitación declarada en otra pestaña no está declarada.
  const bloques = readFileSync(new URL('cargas-bloques.mjs', new URL('lib/', RAIZ)), 'utf8')
  assert.match(bloques, /NOTA_SUPUESTO_CONVENIO/, 'Cargas Sociales publica el número sin decir qué asume')
  assert.match(NOTA_SUPUESTO_CONVENIO, /100% de la hora de convenio/)
  assert.match(NOTA_SUPUESTO_CONVENIO, /Jornales por Quincena 1\.2/, 'sin la referencia nadie puede ir a verlo')
  assert.match(NOTA_SUPUESTO_CONVENIO, /por debajo/, 'sin esto se lee como el jornal vigente')
  // El texto vive UNA vez: si alguien lo re-escribe a mano en la otra pestaña, envejecen distinto.
  assert.doesNotMatch(bloques, /100% de la hora de convenio/)
})
