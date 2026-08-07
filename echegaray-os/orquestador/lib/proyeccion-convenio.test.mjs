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
  formulaSigmaConvenio, lineaSupuestoConvenio, sigmaConvenioDelPlantel,
  baseDeJornales, quincenaAlConvenio, ROTULO_SIGMA,
} from './proyeccion-convenio.mjs'
import { parsearAcuerdos } from './uocra-acuerdos.mjs'
import { crearGrilla } from './cargas-grilla.mjs'
import { bloqueDeclarado, bloquePagado, bloqueProyeccion } from './cargas-bloques.mjs'

/** Las columnas de Compras que usan los bloques de Cargas. Las letras dan igual: nada las resuelve acá. */
const COLS = {
  total: 'O', cliente: 'J', detalle: 'K', fecha: 'AD', rubro: 'AB', proveedor: 'E', fechaFactura: 'C', estado: 'X',
}

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
  const f = formulaSigmaConvenio(18, 21)
  assert.match(f, /SUMPRODUCT\(\$B\$18:\$B\$21;\$F\$18:\$F\$21\)/)
  // Separador de argumentos en es-AR: punto y coma. Con coma, Sheets rechaza la fórmula entera.
  assert.doesNotMatch(f, /,/)
  assert.equal(formulaSigmaConvenio(0, 0), null, 'sin bloque no hay Σ que armar')
  assert.equal(formulaSigmaConvenio(18, 17), null)
})

test('EL GUARD DE LA Σ: sin básicos rinde VACÍO, no cero — que es lo que la prosa promete', () => {
  // ═══ EL DEFECTO, MEDIDO (07/08) ═══
  // `SUMPRODUCT($B;$F)` con la réplica caída da 0, NO error: SUMPRODUCT trata el texto "" como cero.
  // Ese 0 se multiplica por horas y días, y $0 de jornales viaja por JORNALES_PROY_TOTAL a Cargas, al
  // Libro, a CAJA y a los dos cash flows — mientras la celda de al lado dice "queda VACÍA a propósito".
  // La celda que avisa y la que publica tienen que contar la misma historia.
  const f = formulaSigmaConvenio(18, 21)
  assert.match(f, /^IF\(OR\(/, 'la Σ volvió a ser un SUMPRODUCT pelado: con la réplica caída publica 0')
  assert.match(f, /SUMPRODUCT\(\$B\$18:\$B\$21;\$F\$18:\$F\$21\)=0/, 'falta el caso "no hay un solo peso valuado"')
  // Y EL AGUJERO CHICO: una categoría CON PERSONAS y sin básico se valuaba $0 adentro del total. El
  // total seguía siendo plausible y nadie podía verlo. `--(F="")` × personas lo detecta.
  assert.match(f, /SUMPRODUCT\(\$B\$18:\$B\$21;--\(\$F\$18:\$F\$21=""\)\)>0/,
    'una categoría sin escala vuelve a entrar al total valuada en cero')
  assert.match(f, /;"";/, 'el guard tiene que rendir vacío: un 0 acá dice "no hay jornales que pagar"')
  assert.doesNotMatch(f, /,/, 'separador es-AR')
  // La línea del canario evalúa ESTA MISMA expresión —no una copia—, así que hereda el guard.
  assert.match(lineaSupuestoConvenio({ sigma: f, celdaPersonas: '$B$22' }), /IFERROR\(N\(IF\(OR\(/)
})

test('LA FRONTERA DEL MES EN CURSO: lo que se paga este mes va al PACTADO, no al convenio', () => {
  // ═══ LA ORDEN DEL DUEÑO (07/08) ═══
  // *"la caja comprometida … no debe ir comiéndome la libre disponibilidad"*. Valuar al convenio una
  // quincena que se paga ESTE mes mete en la comprometida plata que no va a salir: hoy paga el
  // pactado. El supuesto es de PLANIFICACIÓN y empieza a correr el mes que viene.
  const hoy = new Date(2026, 7, 7) // agosto
  assert.equal(quincenaAlConvenio(new Date(2026, 7, 25), hoy), false, 'se paga en agosto: es caja comprometida')
  assert.equal(quincenaAlConvenio(new Date(2026, 7, 31), hoy), false, 'el último día del mes sigue siendo este mes')
  assert.equal(quincenaAlConvenio(new Date(2026, 8, 5), hoy), true, 'se paga en septiembre: planificación')
  // La frontera se mueve sola con el calendario: no hay un mes escrito en ninguna parte.
  assert.equal(quincenaAlConvenio(new Date(2026, 8, 5), new Date(2026, 8, 1)), false,
    'el 1° de septiembre esa misma quincena pasa a ser lo que sale de la caja este mes')
  // Sin fecha de pago no hay frontera que aplicar: queda la base del cuadro.
  assert.equal(quincenaAlConvenio(null, hoy), true)
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
  // El patrón se busca sobre las DOS formas en que puede aparecer escrito —con las filas interpoladas
  // o ya resueltas— porque lo que importa no es cómo se arma la cadena sino que la arme un solo lugar.
  const arman = todos.filter((f) => /SUMPRODUCT\(\$\{?B\}?;?|SUMPRODUCT\(\$B\$\d+:\$B\$\d+;\$F\$/.test(f.texto))
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL SUPUESTO EN CARGAS SOCIALES — SE PRUEBA LA CELDA, NO EL `import`
//
// Acá había un `assert.match(readFileSync('cargas-bloques.mjs'), /NOTA_SUPUESTO_CONVENIO/)`. Eso lo
// satisface el propio import: se podía borrar la interpolación de la nota en la fila —dejando la
// glosa muda— y el test seguía verde. Un test que mira el código fuente en vez del resultado no
// prueba el efecto, prueba que alguien escribió una palabra. Ahora se arma el bloque de verdad y se
// busca el texto EN LA CELDA que la pestaña va a publicar.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** La celda "De dónde sale" de la fila «Remuneración proyectada», armando el bloque como el generador. */
function glosaDeCargas(baseJornales) {
  const G = crearGrilla(2026)
  const decl = bloqueDeclarado(G, {
    anio: 2026,
    periodos: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
    conceptos: [{ codigo: '301', rotulo: 'Aportes de Seguridad Social (301)' }],
  })
  const pag = bloquePagado(G, { anio: 2026, C: COLS })
  const proy = bloqueProyeccion(G, {
    anio: 2026, desdeProy: 7, filaDecl: decl.filaDecl, filaPag: pag.filaPag,
    fRem: decl.fRem, fEmp: decl.fEmp, bloqueBase: { inicio: 495, fin: 510 }, baseJornales,
  })
  const fila = G.filas[proy.fRemProy - 1]
  assert.match(String(fila[0]), /Remuneración proyectada/, 'la fila que devolvió el bloque no es la que dice ser')
  return String(fila[fila.length - 1] ?? '')
}

test('EL SUPUESTO LLEGA A CARGAS SOCIALES, que no muestra la masa sino que la MULTIPLICA', () => {
  // Contribuciones, IERIC, FODECO y FCL corren SOBRE la remuneración proyectada: el supuesto llega
  // compuesto hasta la última fila de esa pestaña. Declararlo sólo en Jornales lo deja fuera de donde
  // se lee — y una limitación declarada en otra pestaña no está declarada.
  const glosa = glosaDeCargas('convenio')
  assert.match(glosa, /Jornales proyectados × la relación de arriba/, 'la glosa perdió lo que ya decía')
  assert.match(glosa, /100% de la hora de convenio/, 'Cargas Sociales publica el número sin decir qué asume')
  assert.match(glosa, /Jornales por Quincena 1\.2/, 'sin la referencia nadie puede ir a verlo')
  assert.match(glosa, /por debajo/, 'sin esto se lee como el jornal vigente')
  assert.match(glosa, /dentro del mes en curso/, 'no dice que lo que sale de la caja este mes va al pactado')
  // El texto vive UNA vez: si alguien lo re-escribe a mano en la otra pestaña, envejecen distinto.
  const bloques = readFileSync(new URL('cargas-bloques.mjs', new URL('lib/', RAIZ)), 'utf8')
  assert.doesNotMatch(bloques, /100% de la hora de convenio/)
})

test('LA GLOSA DE CARGAS DICE LA VERDAD EN LOS DOS ESTADOS: la decide lo que el cuadro USÓ', () => {
  // ═══ EL DEFECTO (07/08) ═══
  // La nota se concatenaba SIEMPRE, sin saber con qué base había quedado valuada la masa. Con la
  // réplica del convenio caída, Jornales publica los jornales al PACTADO y esta pestaña seguía
  // declarando el 100% de la escala: una glosa que afirma un supuesto que el número no tiene adentro
  // hace que el que lee ajuste hacia abajo un número que ya estaba abajo.
  const alPactado = glosaDeCargas('pactado')
  assert.match(alPactado, /PACTADO/)
  assert.doesNotMatch(alPactado, /100% de la hora de convenio/, 'declara un supuesto que la masa no tiene adentro')
  assert.match(alPactado, /Jornales por Quincena 1\.2/, 'igual tiene que decir dónde mirarlo')
  // Y SI NO SE PUDO LEER, LO DICE. Afirmar cualquiera de las dos sin evidencia es peor que las dos.
  const sinSenal = glosaDeCargas(null)
  assert.match(sinSenal, /No pude leer/)
  assert.doesNotMatch(sinSenal, /100% de la hora de convenio/)
  assert.notEqual(alPactado, sinSenal)
})

test('LA SEÑAL SE LEE DE LO QUE JORNALES PUBLICÓ — el encabezado, no una segunda decisión', () => {
  // Cargas Sociales no tiene a mano ni la réplica del convenio ni los meses del motor: si recalculara
  // la decisión habría dos definiciones de la misma cosa y podrían separarse sin que nada avise. Lee
  // el EFECTO —el encabezado que el cuadro dejó escrito— igual que resuelve las columnas de Compras.
  assert.equal(baseDeJornales([['Mes', 'Escalón publicado'], ['x', ROTULO_SIGMA.convenio]]), 'convenio')
  assert.equal(baseDeJornales([[ROTULO_SIGMA.pactado]]), 'pactado')
  // 1.3 mezcla las dos bases por fila (la frontera del mes en curso): eso SÍ es el supuesto corriendo.
  assert.equal(baseDeJornales([[ROTULO_SIGMA.aplicada]]), 'convenio')
  assert.equal(baseDeJornales([]), null, 'sin lectura no se adivina una base')
  assert.equal(baseDeJornales([['Σ $/hora']]), null, 'un rótulo parecido no es el rótulo')
})
