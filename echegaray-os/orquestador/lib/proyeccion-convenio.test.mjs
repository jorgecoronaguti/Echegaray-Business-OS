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

test('LA Σ DEL PLANTEL CON EL AUMENTO: media brecha hasta el piso, sin pasarlo nunca', () => {
  // ═══ EL CRITERIO QUE EL DUEÑO CONFIRMÓ EL 29/08 ═══
  //
  // *"Cerrar el 50% de la brecha hasta el piso de UOCRA, sin pasar nunca el piso. - ahora si"*. No es
  // el plantel revaluado a la escala —eso daría $97.772 y borraría lo que cada uno negoció— ni
  // `hoy + 50% del básico`, que daría $130.486 y pasaría el piso: es lo que cobran hoy ($81.600) más
  // media brecha por persona ($8.086).
  const { grid, bloque } = espejoCon(PLANTEL)
  const s = sigmaConAumentoDelPlantel(grid, bloque, AGOSTO)
  assert.equal(s.personas, 16)
  assert.equal(s.hoy, 81600, 'la tarifa de hoy sale de la columna W del espejo')
  assert.equal(s.aumento, 4 * 374 + 8 * 574 + 2 * 449.5 + 2 * 549.5)
  assert.equal(s.aumento, 8086)
  assert.equal(s.total, 89686)
  // LOS TRES NÚMEROS QUE NO PUEDEN VOLVER, escritos acá para reconocerlos si reaparecen: $97.772 es
  // el plantel valuado A LA ESCALA (el piso), $130.486 es `hoy + 50% × básico` y $146.658 es
  // `1,5 × básico`. Los tres pasan o igualan el piso, y el dueño frenó exactamente eso.
  assert.notEqual(s.total, 97772, 'volvió a valuar el plantel A LA HORA DEL CONVENIO')
  assert.notEqual(s.total, 130486, 'volvió `hoy + 50% × básico`')
  assert.ok(s.total < 97772, 'la Σ con aumento pasó el piso del plantel')
  assert.deepEqual(s.sinEscala, [])
  assert.equal(s.bajoConvenio.length, 16, 'los 16 siguen bajo su piso: se cerró media brecha')
  // Y abierto por categoría, para que el log de la corrida pueda mostrar de dónde sale cada peso.
  const oficiales = s.porCategoria.filter((c) => c.convenio === 'Oficial').reduce((n, c) => n + c.personas, 0)
  assert.equal(oficiales, 12, 'el sufijo M tiene que mapear igual: es la orden expresa del dueño')
  // Y el aumento POR HORA de cada categoría, que es lo que el cuadro publica en su columna.
  // El aumento POR PERSONA de la categoría (todas las de este fixture cobran igual dentro de su
  // código, así que el de la primera es el de todas).
  assert.equal(s.porCategoria.find((c) => c.codigo === 'OF').aumentoHora, 374)
  assert.equal(s.porCategoria.find((c) => c.codigo === 'A').aumentoHora, 449.5)
})

test('UN CAMBIO DE CATEGORÍA EN EL ESPEJO MUEVE LA PROYECCIÓN — no es una constante', () => {
  // Ascender un ayudante a oficial tiene que costar exactamente la diferencia de escala. Si la Σ
  // estuviera pegada, este test daría el mismo número y no habría forma de notarlo en el Sheet.
  const base = sigmaConAumentoDelPlantel(...Object.values(espejoCon(PLANTEL)), AGOSTO)
  const ascendido = [...PLANTEL]
  ascendido[ascendido.indexOf('A')] = 'OF'
  const s = sigmaConAumentoDelPlantel(...Object.values(espejoCon(ascendido)), AGOSTO)
  // EL ASCENSO MUEVE DOS COSAS, NO UNA: la tarifa que cobra ($5.600 en vez de $4.500, porque en el
  // espejo un Oficial cobra más) y su brecha contra el piso ($748 contra $899, o sea $374 de aumento
  // en vez de $449,50 — sube de categoría y su aumento BAJA, porque queda más cerca de su piso).
  assert.equal(s.total - base.total, (5600 - 4500) + (374 - 449.5))
  assert.equal(s.total - base.total, 1024.5)
})

test('UN ALTA EN EL ESPEJO MUEVE LA PROYECCIÓN, y una categoría desconocida NO se adivina', () => {
  const s = sigmaConAumentoDelPlantel(...Object.values(espejoCon([...PLANTEL, 'OF'])), AGOSTO)
  assert.equal(s.personas, 17)
  assert.equal(s.total, 89686 + 5600 + 374, 'el alta suma SU tarifa y SU aumento')
  assert.equal(s.total, 95660)
  // Una categoría que no está en la tabla de equivalencia no vale cero en silencio: se cuenta como
  // persona y se nombra aparte. Inventarle una escala sería fabricar un dato.
  const raro = sigmaConAumentoDelPlantel(...Object.values(espejoCon([...PLANTEL, 'ZZ'])), AGOSTO)
  assert.equal(raro.personas, 17)
  // La persona con categoría desconocida NO recibe aumento —no hay básico del cual sacarlo— pero
  // SIGUE COBRANDO lo que cobra. En este fixture su tarifa es 0 (no está en la tabla sintética), así
  // que el total no se mueve; lo que la nombra es `sinEscala`, no un agujero en la Σ.
  assert.equal(raro.total, 89686, 'le puso aumento a una categoría que no tiene equivalente declarado')
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
  assert.match(l, /Aumento: cierra el 50% de la brecha al piso/i)
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
  assert.match(String(dice(81600, 8086)), /Aumento: cierra el 50% de la brecha al piso · 16 personas/)
  assert.doesNotMatch(l, /100% del convenio/i, 'volvió a anunciar el piso que el dueño rechazó')
  assert.doesNotMatch(l, /hoy \+ 50% del básico/i, 'volvió a anunciar la primera lectura, la que pasaba el piso')
  assert.match(l, /&\$B\$22&/, 'la cantidad de personas tiene que salir de la celda, no del código')
  // NINGÚN MES NI IMPORTE ESTAMPADO: un número escrito acá envejece el día que entra un obrero.
  assert.doesNotMatch(l, /97\.?772|85\.?900|130\.?486|89\.?686/)
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

/**
 * UNA SEGUNDA BASE ES CÓDIGO QUE LEE, NO UN COMENTARIO QUE EXPLICA.
 *
 * El 12/09/2026 este control se puso rojo sin que nadie hubiera tocado una fórmula:
 * `scripts/jornales-pestana.mjs:2151` documenta en su JSDoc por qué NO califica los rangos del
 * espejo —escribe `'_J_OBREROS'!$W$1:$W$2` dentro de la explicación— y el barrido leía el archivo
 * crudo. Un control que confunde la documentación con el hecho hace dos daños a la vez: acusa a
 * quien explicó bien, y enseña a no escribir el rango en el comentario. El rango en la prosa es
 * justo lo que hay que poder escribir.
 *
 * Se quitan los bloques delimitados por barra-asterisco enteros y las líneas de `//`. El `//` se
 * exige pegado al margen o precedido por un espacio, así que un `https://` y un `'_J_OBREROS'!$W`
 * escritos dentro de un literal sobreviven.
 */
function sinComentarios(texto) {
  return String(texto ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}

/** Todo el código fuente del orquestador, sin los tests: un test que se cite a sí mismo no prueba nada. */
const fuentes = () => ['lib', 'scripts'].flatMap((dir) => {
  const base = new URL(`${dir}/`, RAIZ)
  return readdirSync(base)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .map((f) => ({
      archivo: `orquestador/${dir}/${f}`,
      texto: sinComentarios(readFileSync(new URL(f, base), 'utf8')),
    }))
})

test('EL BARRIDO MIRA CÓDIGO, NO PROSA — y sigue pudiendo decir que no', () => {
  // Fixture propio: las dos formas de escribir el rango del espejo en una explicación, y la forma
  // de LEERLO de verdad. Si `sinComentarios` se pasa de listo y borra código, la tercera cae.
  const enBloque = "/**\n * los rangos del espejo (`'_J_OBREROS'!$W$1:$W$2`) quedan como están\n */\nexport const a = 1\n"
  const enLinea = "// se lee R('W') del espejo, no acá\nexport const b = 2\n"
  const codigoDeVerdad = "const W = R('W')\nconst r = `'_J_OBREROS'!$W$1:$W$2`\n"
  const lee = (t) => /R\('W'\)|_J_OBREROS'!\$W/.test(sinComentarios(t))
  assert.equal(lee(enBloque), false, 'el JSDoc que explica el rango no es una segunda base')
  assert.equal(lee(enLinea), false, 'el comentario de una línea tampoco')
  assert.equal(lee(codigoDeVerdad), true, 'SI ESTO ES FALSE EL CONTROL ES UNA CONSTANTE: ya no caza nada')
  // Y el código que queda sigue siendo código: el stripper no puede comerse la línea de al lado.
  assert.match(sinComentarios(enBloque), /export const a = 1/)
  assert.match(sinComentarios(enLinea), /export const b = 2/)
})

/**
 * LOS ARCHIVOS QUE SE APROPIAN DE LA Σ: la definen por su cuenta, o la nombran sin importarla.
 *
 * PURA y con su fixture abajo, porque un detector que sólo se corre contra el repo de hoy no puede
 * demostrar que sabe decir que NO.
 */
function seApropianDeLaSigma(fuentes, definidor = 'orquestador/lib/proyeccion-convenio.mjs') {
  return fuentes
    .filter((f) => f.archivo !== definidor && f.texto.includes('formulaSigmaConAumento'))
    .filter((f) => /export function formulaSigmaConAumento/.test(f.texto)
      || !/from '\.{1,2}\/(?:lib\/)?proyeccion-convenio\.mjs'/.test(f.texto))
    .map((f) => f.archivo)
}

test('EL DETECTOR DE LA Σ PUEDE DECIR QUE NO: segunda definición y uso sin import', () => {
  const base = { archivo: 'orquestador/lib/proyeccion-convenio.mjs', texto: 'export function formulaSigmaConAumento() {}' }
  const copia = { archivo: 'orquestador/lib/copion.mjs', texto: 'export function formulaSigmaConAumento() { return 1 }' }
  const suelto = { archivo: 'orquestador/scripts/suelto.mjs', texto: 'const x = formulaSigmaConAumento(1, 2, 3)' }
  const bueno = {
    archivo: 'orquestador/scripts/bueno.mjs',
    texto: "import { formulaSigmaConAumento } from '../lib/proyeccion-convenio.mjs'\nformulaSigmaConAumento(1,2,3)",
  }
  assert.deepEqual(seApropianDeLaSigma([base, copia, suelto, bueno]),
    ['orquestador/lib/copion.mjs', 'orquestador/scripts/suelto.mjs'])
  // Si el que importa bien también cayera, el control sería una alarma que suena siempre: inútil.
  assert.deepEqual(seApropianDeLaSigma([base, bueno]), [])
})

test('LA BASE SE DEFINE EN UN SOLO ARCHIVO: dos definiciones son dos empresas distintas', () => {
  const todos = fuentes()
  assert.ok(todos.length > 100, `sólo leyó ${todos.length} archivos: el escaneo no está mirando el repo`)

  // ═══ EL DETECTOR ERA UN FÓSIL, Y POR ESO ESTE CONTROL ESTABA APAGADO (12/09/2026) ═══
  //
  // Buscaba la forma de la fórmula: `SUMPRODUCT($B;$F)`. La Σ dejó de ser un producto escalar el
  // 29/08 —el dueño rechazó valuar el plantel al convenio: hoy es «lo que se paga + lo que suma el
  // aumento», dos celdas de la fila de total del cuadro 1.1—. Desde entonces el único
  // `SUMPRODUCT($B;$F)` que quedaba en el repo era EL COMENTARIO de este mismo archivo que cuenta esa
  // historia: el control se daba verde citándose a sí mismo, y una segunda definición de la Σ real le
  // habría pasado por al lado sin que nadie se entere.
  //
  // NO SE REEMPLAZA POR LA FORMA NUEVA, Y ESO SE MIDIÓ. El esqueleto de hoy
  // —`IF(N(#)=0;"";N(#)+N(#))`— es el idioma genérico de «sumá dos celdas si la primera no está
  // vacía»: `cash-flow-meses.mjs:396` y `cash-flow-semanas.mjs:272` encadenan saldo inicial +
  // resultado con exactamente esa forma y no tienen nada que ver con la masa salarial. Un detector
  // así acusa a los inocentes, y un control que acusa a cualquiera se apaga a la semana.
  //
  // Lo que SÍ distingue una segunda base es el DUEÑO de la definición: la Σ la arma una función
  // exportada por este archivo, y quien la necesita la importa. Eso es lo que se controla, con su
  // fixture arriba para probar que sabe decir que no.
  assert.deepEqual(seApropianDeLaSigma(todos), [],
    'alguien más arma la Σ del convenio: dos definiciones de la misma masa salarial')
  const usan = todos.filter((f) => f.texto.includes('formulaSigmaConAumento')).map((f) => f.archivo)
  assert.deepEqual(usan.sort(), [
    'orquestador/lib/motor-salarial.mjs',      // el cuadro 1.1, que es el control
    'orquestador/lib/proyeccion-convenio.mjs', // la definición
    'orquestador/scripts/jornales-pestana.mjs', // el generador que la escribe
  ], 'cambió quién usa la Σ: si es un consumidor nuevo, declaralo acá con para qué la usa')

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
    fRem: decl.fRem, fEmp: decl.fEmp, C: COLS, fDeclTot: decl.fDeclTot,
    bloqueBase: { inicio: 495, fin: 510 }, baseJornales,
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
  assert.match(glosa, /50% de la brecha/, 'Cargas Sociales publica el número sin decir qué asume')
  // Se prohíbe la AFIRMACIÓN, no la palabra: la glosa dice «No es el 100% de la escala ni un piso»,
  // que es exactamente lo que hay que decir. Lo que no puede volver es «viene valuada al 100%…».
  assert.doesNotMatch(glosa, /valuada al 100%/,
    'la glosa volvió a anunciar el piso que el dueño rechazó')
  assert.match(glosa, /Jornales por Quincena 1\.1/, 'sin la referencia nadie puede ir a verlo')
  assert.match(glosa, /NUNCA pasa ese piso/, 'sin esto el aumento se lee como una revaluación al convenio')
  assert.match(glosa, /dentro del mes en curso/, 'no dice que lo que sale de la caja este mes va sin aumento')
  // El texto vive UNA vez: si alguien lo re-escribe a mano en la otra pestaña, envejecen distinto.
  const bloques = readFileSync(new URL('cargas-bloques.mjs', new URL('lib/', RAIZ)), 'utf8')
  assert.doesNotMatch(bloques, /50% de la brecha/)
})

test('LA GLOSA DE CARGAS DICE LA VERDAD EN LOS DOS ESTADOS: la decide lo que el cuadro USÓ', () => {
  // ═══ EL DEFECTO (07/08) ═══
  // La nota se concatenaba SIEMPRE, sin saber con qué base había quedado valuada la masa. Con la
  // réplica del convenio caída, Jornales publica los jornales al PACTADO y esta pestaña seguía
  // declarando el 100% de la escala: una glosa que afirma un supuesto que el número no tiene adentro
  // hace que el que lee ajuste hacia abajo un número que ya estaba abajo.
  const alPactado = glosaDeCargas('pactado')
  assert.match(alPactado, /SIN el aumento/)
  assert.doesNotMatch(alPactado, /50% de la brecha/, 'declara un supuesto que la masa no tiene adentro')
  assert.match(alPactado, /Jornales por Quincena 1\.1/, 'igual tiene que decir dónde mirarlo')
  // Y SI NO SE PUDO LEER, LO DICE. Afirmar cualquiera de las dos sin evidencia es peor que las dos.
  const sinSenal = glosaDeCargas(null)
  assert.match(sinSenal, /No pude leer/)
  assert.doesNotMatch(sinSenal, /50% de la brecha entre/)
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
  // $5.200 de tarifa + $574 de media brecha contra el piso de Oficial ($6.348). Con el criterio
  // anterior daba $8.374 y con el piso $6.348: los dos pasan o igualan la escala.
  assert.equal(s.total, 5200 + (6348 - 5200) / 2)
  assert.equal(s.total, 5774)
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
  // Su tarifa no cambia por lo que el dueño escriba —es lo que cobra— pero SU BRECHA sí: pasa a
  // medirse contra el piso de Ayudante ($5.399), así que el aumento cae de $574 a $99,50.
  assert.equal(s.total, 5200 + (5399 - 5200) / 2)
  assert.equal(s.total, 5299.5)
  // Y el plantel entero con la misma mezcla: la Σ no puede depender de cómo se tipeó el espacio.
  const sucio = espejoCon(PLANTEL.map((c) => (c === 'OF M' ? 'OF  M ' : `${c} `)))
  const limpio = espejoCon(PLANTEL)
  assert.equal(sigmaConAumentoDelPlantel(sucio.grid, sucio.bloque, AGOSTO).total,
    sigmaConAumentoDelPlantel(limpio.grid, limpio.bloque, AGOSTO).total)
  assert.equal(sigmaConAumentoDelPlantel(sucio.grid, sucio.bloque, AGOSTO).porCategoria.length, 4)
})
