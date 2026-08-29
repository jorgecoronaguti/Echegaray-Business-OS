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
  formulaSigmaConAumento, lineaSupuestoAumento, sigmaConAumentoDelPlantel,
  baseDeJornales, quincenaConAumento, ROTULO_SIGMA, BASE_CON_AUMENTO,
} from './proyeccion-convenio.mjs'
import { expresionSinEscala } from './jornales-piso-uocra.mjs'
import { evaluarFormula } from './evaluar-formula-sheet.mjs'
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
// LA TARIFA DE HOY (columna W del espejo), sintética y del orden de las reales. Entró al fixture el
// 29/08: desde que la proyección es «lo de hoy + el aumento», sin esta columna la Σ mediría sólo el
// aumento y los tests estarían probando media aritmética.
const TARIFA = { OF: 5600, 'OF M': 5200, A: 4500, 'A M': 4300 }
const espejoCon = (cats, filaInicio = 495) => {
  const grid = []
  cats.forEach((c, i) => {
    const f = ['1', `Persona ${i + 1}`, '45000', c]
    f[22] = TARIFA[String(c).replace(/\s+/g, ' ').trim()] ?? 0
    grid[filaInicio - 1 + i] = f
  })
  return { grid, bloque: { inicio: filaInicio, fin: filaInicio + cats.length - 1 } }
}

test('LA Σ DEL PLANTEL CON EL AUMENTO: lo que cobran hoy MÁS el 50% del básico de su categoría', () => {
  // ═══ EL CRITERIO QUE EL DUEÑO ORDENÓ EL 29/08, EN ARITMÉTICA ═══
  //
  // *"del convenio sacar el 50% por categoria y eso es lo q le vamos a aumentar a cada empleado sobre
  // lo q cobran por hr hoy"*. No es el plantel revaluado a la escala —eso daría $97.772 y borraría lo
  // que cada uno negoció—: es lo que cobran hoy ($81.600) más el aumento ($48.886).
  const { grid, bloque } = espejoCon(PLANTEL)
  const s = sigmaConAumentoDelPlantel(grid, bloque, AGOSTO)
  assert.equal(s.personas, 16)
  assert.equal(s.hoy, 81600, 'la tarifa de hoy sale de la columna W del espejo')
  assert.equal(s.aumento, 12 * (6348 / 2) + 4 * (5399 / 2))
  assert.equal(s.aumento, 48886)
  assert.equal(s.total, 130486)
  // SI ALGUIEN VUELVE AL PISO, LA Σ CAE A $97.772 Y ESTE ASSERT LO AGARRA. El número de la versión
  // anterior sigue escrito acá a propósito: es el que hay que reconocer si reaparece.
  assert.notEqual(s.total, 97772, 'volvió a valuar el plantel A LA HORA DEL CONVENIO')
  assert.deepEqual(s.sinEscala, [])
  assert.deepEqual(s.bajoConvenio, [], 'con estas tarifas el aumento deja a todos sobre el mínimo legal')
  // Y abierto por categoría, para que el log de la corrida pueda mostrar de dónde sale cada peso.
  const oficiales = s.porCategoria.filter((c) => c.convenio === 'Oficial').reduce((n, c) => n + c.personas, 0)
  assert.equal(oficiales, 12, 'el sufijo M tiene que mapear igual: es la orden expresa del dueño')
  // Y el aumento POR HORA de cada categoría, que es lo que el cuadro publica en su columna.
  assert.equal(s.porCategoria.find((c) => c.codigo === 'OF').aumentoHora, 3174)
  assert.equal(s.porCategoria.find((c) => c.codigo === 'A').aumentoHora, 2699.5)
})

test('UN CAMBIO DE CATEGORÍA EN EL ESPEJO MUEVE LA PROYECCIÓN — no es una constante', () => {
  // Ascender un ayudante a oficial tiene que costar exactamente la diferencia de escala. Si la Σ
  // estuviera pegada, este test daría el mismo número y no habría forma de notarlo en el Sheet.
  const base = sigmaConAumentoDelPlantel(...Object.values(espejoCon(PLANTEL)), AGOSTO)
  const ascendido = [...PLANTEL]
  ascendido[ascendido.indexOf('A')] = 'OF'
  const s = sigmaConAumentoDelPlantel(...Object.values(espejoCon(ascendido)), AGOSTO)
  // EL ASCENSO MUEVE DOS COSAS, NO UNA: la tarifa que cobra ($5.600 en vez de $4.500, porque en el
  // espejo un Oficial cobra más) y el tamaño de su aumento ($3.174 en vez de $2.699,50, porque el
  // básico de su categoría es otro). $1.100 + $474,50. Con el criterio anterior —revaluar al
  // convenio— la diferencia era sólo la de la escala, $949: si este número vuelve a 949, alguien
  // volvió al piso.
  assert.equal(s.total - base.total, (5600 - 4500) + (6348 / 2 - 5399 / 2))
  assert.equal(s.total - base.total, 1574.5)
})

test('UN ALTA EN EL ESPEJO MUEVE LA PROYECCIÓN, y una categoría desconocida NO se adivina', () => {
  const s = sigmaConAumentoDelPlantel(...Object.values(espejoCon([...PLANTEL, 'OF'])), AGOSTO)
  assert.equal(s.personas, 17)
  assert.equal(s.total, 130486 + 5600 + 3174, 'el alta suma SU tarifa y SU aumento')
  assert.equal(s.total, 139260)
  // Una categoría que no está en la tabla de equivalencia no vale cero en silencio: se cuenta como
  // persona y se nombra aparte. Inventarle una escala sería fabricar un dato.
  const raro = sigmaConAumentoDelPlantel(...Object.values(espejoCon([...PLANTEL, 'ZZ'])), AGOSTO)
  assert.equal(raro.personas, 17)
  // La persona con categoría desconocida NO recibe aumento —no hay básico del cual sacarlo— pero
  // SIGUE COBRANDO lo que cobra. En este fixture su tarifa es 0 (no está en la tabla sintética), así
  // que el total no se mueve; lo que la nombra es `sinEscala`, no un agujero en la Σ.
  assert.equal(raro.total, 130486, 'le puso aumento a una categoría que no tiene equivalente declarado')
  assert.deepEqual(raro.sinEscala, ['ZZ'])
})

test('sin escalón vigente no hay AUMENTO, pero la gente sigue cobrando lo que cobra', () => {
  const { grid, bloque } = espejoCon(PLANTEL)
  const s = sigmaConAumentoDelPlantel(grid, bloque, null)
  // ═══ ESTO CAMBIÓ DE RESPUESTA EL 29/08, Y ES LA DECISIÓN CENTRAL DEL REHACER ═══
  //
  // Antes daba 0: sin escala no había piso que calcular, y el piso ERA todo el número. Ahora el
  // número tiene dos términos y sólo uno depende de la escala. Devolver 0 diría que dieciséis
  // personas dejan de cobrar porque un IMPORTHTML se cayó, que es falso y además apagaría la
  // proyección entera. Lo que se pierde es el aumento, y eso es lo que se declara.
  assert.equal(s.aumento, 0, 'sin escala no se puede calcular ningún aumento')
  assert.equal(s.hoy, 81600)
  assert.equal(s.total, 81600, 'la tarifa de hoy es un hecho de la planilla y no depende de la réplica')
  assert.equal(s.personas, 16, 'las personas existen aunque no haya escala: el hueco es de la réplica')
  assert.deepEqual(s.sinEscala, ['OF', 'A', 'A M', 'OF M'])
})

test('LA Σ DE LA PESTAÑA SALE DE DOS CELDAS VIVAS DEL CUADRO 1.1, NO DE UN NÚMERO', () => {
  // C = Σ de lo que se paga HOY (SUMPRODUCT sobre la columna W del espejo) · D = Σ del aumento
  // (personas × el % del básico de su categoría). Las dos se mueven solas con un alta, una baja, un
  // cambio de categoría o un acuerdo nuevo. Si alguien las reemplaza por un número, esto se pone rojo.
  const f = formulaSigmaConAumento(18, 21, 22)
  assert.match(f, /N\(\$C\$22\)\+N\(\$D\$22\)/, 'la Σ dejó de salir de la fila de total del cuadro')
  // ═══ EL PRODUCTO ESCALAR CONTRA LA ESCALA NO PUEDE VOLVER (29/08) ═══
  //
  // Era `SUMPRODUCT($B;$F)` = personas × básico: el plantel REVALUADO a la hora de convenio, que es
  // el piso que el dueño rechazó. Si esa forma reaparece, la pestaña vuelve a publicar un número que
  // nadie va a cobrar.
  assert.doesNotMatch(f, /SUMPRODUCT/, 'volvió a valuar el plantel a la hora del convenio')
  assert.doesNotMatch(f, /\$F\$/, 'la Σ volvió a colgar de la columna del básico')
  // Separador de argumentos en es-AR: punto y coma. Con coma, Sheets rechaza la fórmula entera.
  assert.doesNotMatch(f, /,/)
  assert.equal(formulaSigmaConAumento(0, 0, 0), null, 'sin bloque no hay Σ que armar')
  assert.equal(formulaSigmaConAumento(18, 17, 19), null)
  assert.equal(formulaSigmaConAumento(18, 21, 21), null, 'el total tiene que estar DEBAJO de las categorías')
})

test('EL GUARD DE LA Σ: sin plantel rinde VACÍO, no cero', () => {
  // ═══ EL DEFECTO, MEDIDO (07/08) ═══
  // Un `SUMPRODUCT` con la réplica caída da 0, NO error. Ese 0 se multiplica por horas y días, y $0 de
  // jornales viaja por JORNALES_PROY_TOTAL a Cargas, al Libro, a CAJA y a los dos cash flows. Vacío se
  // propaga solo —"" × factor es #VALUE! y el IFERROR de aguas abajo lo vuelve ""— y un hueco visible
  // es corregible; un total corto, no.
  const f = formulaSigmaConAumento(18, 21, 22)
  assert.match(f, /^IF\(N\(\$C\$22\)=0;""/, 'sin plantel la Σ volvió a publicar un número')
  assert.match(f, /;"";/, 'el guard tiene que rendir vacío: un 0 acá dice "no hay jornales que pagar"')
  // ═══ LO QUE ESTE GUARD YA NO PREGUNTA, Y POR QUÉ (29/08) ═══
  //
  // Preguntaba además si alguna categoría CON PERSONAS no tenía básico, y en ese caso apagaba la Σ
  // ENTERA. Con un piso era correcto: un piso incompleto no es un piso. Con un aumento aditivo, no:
  // que a una categoría le falte la escala significa que ESA gente no recibe aumento, no que las
  // otras dejen de cobrar. Apagar el total escondería quince sueldos ciertos detrás de uno incierto.
  // Quién quedó sin aumento lo cuenta el control de cobertura, sobre las mismas dos columnas.
  assert.ok(!f.includes(expresionSinEscala('$B$18:$B$21', '$F$18:$F$21')),
    'la Σ volvió a apagarse entera por una categoría sin escala')
  assert.doesNotMatch(f, /,/, 'separador es-AR')
  // La línea del canario evalúa ESTA MISMA expresión —no una copia—, así que hereda el guard.
  assert.match(lineaSupuestoAumento({ sigma: f, celdaPersonas: '$B$22' }), /IFERROR\(N\(IF\(N\(/)
})

test('LA FRONTERA DEL MES EN CURSO: lo que se paga este mes va al PACTADO, no al convenio', () => {
  // ═══ LA ORDEN DEL DUEÑO (07/08) ═══
  // *"la caja comprometida … no debe ir comiéndome la libre disponibilidad"*. Valuar al convenio una
  // quincena que se paga ESTE mes mete en la comprometida plata que no va a salir: hoy paga el
  // pactado. El supuesto es de PLANIFICACIÓN y empieza a correr el mes que viene.
  const hoy = new Date(2026, 7, 7) // agosto
  assert.equal(quincenaConAumento(new Date(2026, 7, 25), hoy), false, 'se paga en agosto: es caja comprometida')
  assert.equal(quincenaConAumento(new Date(2026, 7, 31), hoy), false, 'el último día del mes sigue siendo este mes')
  assert.equal(quincenaConAumento(new Date(2026, 8, 5), hoy), true, 'se paga en septiembre: planificación')
  // La frontera se mueve sola con el calendario: no hay un mes escrito en ninguna parte.
  assert.equal(quincenaConAumento(new Date(2026, 8, 5), new Date(2026, 8, 1)), false,
    'el 1° de septiembre esa misma quincena pasa a ser lo que sale de la caja este mes')
  // Sin fecha de pago no hay frontera que aplicar: queda la base del cuadro.
  assert.equal(quincenaConAumento(null, hoy), true)
})

test('LA PESTAÑA DECLARA CON QUÉ CRITERIO PROYECTA, Y NO ES EL JORNAL VIGENTE', () => {
  const l = lineaSupuestoAumento({ sigma: formulaSigmaConAumento(18, 21, 22), celdaPersonas: '$B$22' })
  assert.match(l, /^=IF\(/, 'la línea tiene que evaluar la Σ real: es además el canario de la réplica')
  // Las tres cosas que esta línea decide, con el criterio nuevo:
  //   · que lo proyectado NO es lo que se cobra hoy —lleva el aumento adentro—;
  //   · de dónde sale el tamaño del aumento (el % del básico de cada categoría);
  //   · y que las personas salgan de la celda, no del código.
  assert.match(l, /Con aumento/i)
  assert.match(l, /50% del básico/i)
  // ═══ DESDE CUÁNDO RIGE VA EN LA CELDA, NO EN UN COMENTARIO DEL CÓDIGO ═══
  //
  // El alcance temporal de una cifra es parte de la cifra (`encabezado-de-periodo-es-el-contrato`).
  // Que el aumento empiece en la quincena que se paga el mes que viene —y no en la que se está
  // pagando— era un supuesto declarado sólo en la cabecera del módulo: quien mira la pestaña no lee
  // el código y no tenía forma de saber sobre qué período está mirando el número.
  assert.match(l, /rige desde el mes de pago siguiente/,
    'la línea no dice desde cuándo rige el aumento: el que mira la pestaña no puede saberlo')

  // ═══ TRES ESTADOS, NO DOS: «hay plantel pero la escala no dio básicos» faltaba ═══
  //
  // Con plantel cargado y la escala caída ENTERA, la Σ total sigue siendo > 0 —la gente cobra lo que
  // cobra— así que la línea anunciaba «Con aumento» mientras el control de al lado gritaba que nadie
  // lo recibía. Dos celdas ciertas que juntas se leen mal.
  const conAumentoCero = lineaSupuestoAumento({
    sigma: formulaSigmaConAumento(18, 21, 22), celdaPersonas: '$B$22', celdaAumento: '$D$22',
  })
  assert.match(conAumentoCero, /IF\(IFERROR\(N\(\$D\$22\);0\)=0;/,
    'la línea no mira el término del AUMENTO: con la escala caída sigue anunciando que lo aplica')
  assert.match(conAumentoCero, /nadie recibe aumento/)
  // Y las tres ramas se evalúan de verdad, no se leen del texto: la celda tiene que decir cada cosa
  // en su estado. (`$C$22` es la Σ de hoy y `$D$22` la del aumento, las dos del total del cuadro.)
  const dice = (C, D) => evaluarFormula(conAumentoCero, { hoja: { $C$22: C, C22: C, D22: D, B22: 16 } })
  assert.match(String(dice(0, 0)), /Sin plantel/)
  assert.match(String(dice(81600, 0)), /nadie recibe aumento/)
  assert.match(String(dice(81600, 48886)), /Con aumento: hoy \+ 50% del básico · 16 personas/)
  assert.doesNotMatch(l, /100% del convenio/i, 'volvió a anunciar el piso que el dueño rechazó')
  assert.match(l, /&\$B\$22&/, 'la cantidad de personas tiene que salir de la celda, no del código')
  // NINGÚN MES NI IMPORTE ESTAMPADO: un número escrito acá envejece el día que entra un obrero.
  assert.doesNotMatch(l, /97\.?772|85\.?900|130\.?486/)
  assert.doesNotMatch(l, /agosto|Agosto|2026/)
  // Y SI LA Σ DA 0, EL AVISO DICE LO QUE PASA DE VERDAD: no que la proyección quedó vacía —no queda—
  // sino que no lleva el aumento adentro, que es la peor noticia y la que no se ve mirando la columna.
  assert.match(l, /va sin el aumento adentro/)
  assert.doesNotMatch(l, /proyecci[óo]n vac[íi]a/i)
})

test('SIN ESCALA LA LÍNEA AVISA QUE LA BASE VOLVIÓ A LA TARIFA DE HOY: no cambia en silencio', () => {
  const l = lineaSupuestoAumento({ sigma: null, celdaPersonas: '$B$22' })
  assert.match(l, /^ {3}· /, 'sin Σ es prosa, no fórmula: no hay nada que evaluar')
  assert.match(l, /base: hoy/i, 'tiene que decir a qué base volvió, no sólo que algo falta')
  assert.match(l, /sin aumento/i)
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
  const glosa = glosaDeCargas(BASE_CON_AUMENTO)
  assert.match(glosa, /Jornales proyectados × la relación de arriba/, 'la glosa perdió lo que ya decía')
  assert.match(glosa, /50% del básico de convenio/, 'Cargas Sociales publica el número sin decir qué asume')
  // Se prohíbe la AFIRMACIÓN, no la palabra: la glosa dice «No es el 100% de la escala ni un piso»,
  // que es exactamente lo que hay que decir. Lo que no puede volver es «viene valuada al 100%…».
  assert.doesNotMatch(glosa, /valuada al 100%/,
    'la glosa volvió a anunciar el piso que el dueño rechazó')
  assert.match(glosa, /Jornales por Quincena 1\.1/, 'sin la referencia nadie puede ir a verlo')
  assert.match(glosa, /no cuánto vale/, 'sin esto el aumento se lee como una revaluación al convenio')
  assert.match(glosa, /dentro del mes en curso/, 'no dice que lo que sale de la caja este mes va sin aumento')
  // El texto vive UNA vez: si alguien lo re-escribe a mano en la otra pestaña, envejecen distinto.
  const bloques = readFileSync(new URL('cargas-bloques.mjs', new URL('lib/', RAIZ)), 'utf8')
  assert.doesNotMatch(bloques, /50% del básico de convenio/)
})

test('LA GLOSA DE CARGAS DICE LA VERDAD EN LOS DOS ESTADOS: la decide lo que el cuadro USÓ', () => {
  // ═══ EL DEFECTO (07/08) ═══
  // La nota se concatenaba SIEMPRE, sin saber con qué base había quedado valuada la masa. Con la
  // réplica del convenio caída, Jornales publica los jornales al PACTADO y esta pestaña seguía
  // declarando el 100% de la escala: una glosa que afirma un supuesto que el número no tiene adentro
  // hace que el que lee ajuste hacia abajo un número que ya estaba abajo.
  const alPactado = glosaDeCargas('pactado')
  assert.match(alPactado, /SIN el aumento/)
  assert.doesNotMatch(alPactado, /50% del básico de convenio/, 'declara un supuesto que la masa no tiene adentro')
  assert.match(alPactado, /Jornales por Quincena 1\.1/, 'igual tiene que decir dónde mirarlo')
  // Y SI NO SE PUDO LEER, LO DICE. Afirmar cualquiera de las dos sin evidencia es peor que las dos.
  const sinSenal = glosaDeCargas(null)
  assert.match(sinSenal, /No pude leer/)
  assert.doesNotMatch(sinSenal, /50% del básico de convenio/)
  assert.notEqual(alPactado, sinSenal)
})

test('LA SEÑAL SE LEE DE LO QUE JORNALES PUBLICÓ — el encabezado, no una segunda decisión', () => {
  // Cargas Sociales no tiene a mano ni la réplica del convenio ni los meses del motor: si recalculara
  // la decisión habría dos definiciones de la misma cosa y podrían separarse sin que nada avise. Lee
  // el EFECTO —el encabezado que el cuadro dejó escrito— igual que resuelve las columnas de Compras.
  assert.equal(baseDeJornales([['Mes', 'Escalón publicado'], ['x', ROTULO_SIGMA.conAumento]]), BASE_CON_AUMENTO)
  assert.equal(baseDeJornales([[ROTULO_SIGMA.pactado]]), 'pactado')
  // 1.3 mezcla las dos bases por fila (la frontera del mes en curso): eso SÍ es el supuesto corriendo.
  assert.equal(baseDeJornales([[ROTULO_SIGMA.aplicada]]), BASE_CON_AUMENTO)
  // EL RÓTULO VIEJO YA NO ES UNA SEÑAL VÁLIDA. Si una pestaña quedó de una corrida anterior con «Σ
  // $/hora convenio», leerlo como "con aumento" haría que Cargas glose un supuesto que ese número no
  // tiene adentro: era un piso. Que devuelva null obliga a volver a generar Jornales, que es lo
  // correcto — y la glosa dice "no pude leer" en vez de afirmar.
  assert.equal(baseDeJornales([['Σ $/hora convenio']]), null,
    'un rótulo de una corrida vieja no puede pasar por la base nueva')
  assert.equal(baseDeJornales([]), null, 'sin lectura no se adivina una base')
  assert.equal(baseDeJornales([['Σ $/hora']]), null, 'un rótulo parecido no es el rótulo')
})

// ═══ EL CONTROL Y LA PESTAÑA TIENEN QUE NORMALIZAR IGUAL — SI NO, PUBLICAN DOS NÚMEROS (28/08) ═══
//
// `sigmaConvenioDelPlantel` es el OTRO camino con el que se controla la misma Σ que la pestaña calcula
// por fórmula. Leía la columna D con `.trim()` —puntas sí, medio no— mientras `categoriasDelBloque`
// usa `claveDeCategoria` y la fórmula compara contra `TRIM(D)`, que colapsa también los espacios
// internos. Con un `"OF  M"` en el espejo el control abría DOS filas, el lookup de la columna del
// dueño fallaba (`escritoPorCodigo` viene indexado por la clave normalizada) y el log imprimía
// $11.781 contra los $10.866 de la pestaña: dos números del mismo concepto, sin forma de decidir cuál
// miente. UN CONTROL NUNCA SE VALIDA CONTRA UNA NORMALIZACIÓN DISTINTA DE LA QUE PRODUCE EL NÚMERO.
//
// LA MUTACIÓN: volver la línea a `String(fila[COL_CATEGORIA] ?? '').trim()` pone rojos los dos tests.
test('un espacio de más en el espejo NO parte la categoría en dos filas del control', () => {
  const { grid, bloque } = espejoCon(['OF  M'])
  const s = sigmaConAumentoDelPlantel(grid, bloque, AGOSTO)
  assert.equal(s.porCategoria.length, 1, 'la misma categoría se contó dos veces con dos claves distintas')
  assert.equal(s.porCategoria[0].codigo, 'OF M', 'el código del log tiene que ser el mismo que el de la pestaña')
  assert.equal(s.personas, 1)
  // $5.200 de tarifa + $3.174 de aumento. Con el criterio anterior daba $6.348 —el básico pelado—:
  // si este número vuelve, alguien volvió a revaluar al convenio.
  assert.equal(s.total, 5200 + 3174)
  assert.equal(s.total, 8374)
})

test('la columna «Convenio» del dueño gana también en el control, no sólo en la fórmula', () => {
  // La sonda de la auditoría, literal: "OF  M" en el espejo y «Ayudante» escrito por el dueño. La
  // pestaña respeta esa celda —lo hace `expresionClaveConvenio`— y el control tiene que llegar al
  // mismo número. Con el `.trim()` viejo el lookup no encontraba la clave y el control valuaba al
  // Oficial: $6.348 contra los $5.399 que publica la pestaña.
  const { grid, bloque } = espejoCon(['OF  M'])
  const s = sigmaConAumentoDelPlantel(grid, bloque, AGOSTO, undefined, { 'OF M': 'Ayudante' })
  assert.equal(s.porCategoria.length, 1)
  assert.equal(s.porCategoria[0].convenio, 'Ayudante', 'se ignoró la celda del dueño: el lookup usó otra clave')
  // Su tarifa no cambia por lo que el dueño escriba —es lo que cobra— pero SU AUMENTO sí: pasa a
  // salir del básico de Ayudante. $5.200 + $2.699,50.
  assert.equal(s.total, 5200 + 5399 / 2)
  assert.equal(s.total, 7899.5)
  // Y el plantel entero con la misma mezcla: la Σ no puede depender de cómo se tipeó el espacio.
  const sucio = espejoCon(PLANTEL.map((c) => (c === 'OF M' ? 'OF  M ' : `${c} `)))
  const limpio = espejoCon(PLANTEL)
  assert.equal(sigmaConAumentoDelPlantel(sucio.grid, sucio.bloque, AGOSTO).total,
    sigmaConAumentoDelPlantel(limpio.grid, limpio.bloque, AGOSTO).total)
  assert.equal(sigmaConAumentoDelPlantel(sucio.grid, sucio.bloque, AGOSTO).porCategoria.length, 4)
})
