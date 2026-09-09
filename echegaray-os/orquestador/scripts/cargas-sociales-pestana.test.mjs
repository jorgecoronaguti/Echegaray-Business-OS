// EL SUBTÍTULO DE "CARGAS SOCIALES" CRUZA UNA FUENTE VIVA CON UNA CONGELADA.
//
// Compras se mueve todos los días; el F931 sale de los PDF del data room y se queda en el último
// período presentado. Un MAX sobre las dos —el arreglo "obvio" cuando se sacó la fecha de la
// corrida— es PEOR que el texto estampado: pone la fecha de Compras arriba del cuadro "declarado en
// las DDJJ F931", que hace un mes y medio que no cambia. Eso es lo que estos tests impiden.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla } from './cargas-sociales-pestana.mjs'

const periodos = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
const conceptos = [
  { codigo: '301', rotulo: 'Aportes de Seguridad Social (301)', corto: 'Aportes de Seguridad Social' },
  { codigo: '351', rotulo: 'Contribuciones de Seguridad Social (351)', corto: 'Contribuciones de Seguridad Social' },
]
const C = {
  total: 'O', cliente: 'F', detalle: 'G', fecha: 'AD', rubro: 'K', proveedor: 'E', fechaFactura: 'C',
}
const g = grilla({ periodos, conceptos, ps: [], C })
const subtitulo = String(g.filas[1][0])

test('el subtítulo es una FÓRMULA: un texto queda clavado en el día de la corrida', () => {
  assert.ok(subtitulo.startsWith('='), `el subtítulo volvió a ser texto: ${subtitulo.slice(0, 80)}`)
})

test('no hay ninguna fecha estampada adentro', () => {
  assert.doesNotMatch(subtitulo.replace(/"dd\/mm"/g, ''), /\d{1,2}\/\d{1,2}\/\d{2,4}/)
})

test('cada fuente declara SU fecha: no hay un MAX que le preste frescura a la congelada', () => {
  assert.match(subtitulo, /"DDJJ F931 al "/, 'el F931 tiene que declarar la suya')
  assert.match(subtitulo, /"Compras al "/, 'y Compras la suya')
  // El defecto que esto ataja: una sola fecha para las dos.
  assert.doesNotMatch(subtitulo, /"al "&TEXT\(MAX\(/, 'volvió a resumir las dos fuentes en una sola fecha')
})

test('el F931 declara su PERÍODO, no el día en que se leyó el PDF', () => {
  // Una DDJJ de junio presentada el 16/07 habla de junio: decir "al 16/07" sería declarar frescura
  // de la gestión administrativa, no del dato.
  assert.match(subtitulo, /EOMONTH\(/, 'el período tiene que declararse como el último día que cubre')
  assert.match(subtitulo, /_F931_RAW!\$A\$4:\$A/)
  // Y sin DATEVALUE: en un libro es-AR puede leer el ISO como dd/mm y devolver otro mes SIN error.
  // Se mira sólo el tramo del F931 — en el de Compras el DATEVALUE es correcto y necesario, porque
  // esa columna sí trae fechas tipeadas "dd/mm/aaaa" que un MAX crudo ignoraría en silencio.
  const tramoF931 = subtitulo.split('&" · "&').find((t) => t.includes('_F931_RAW')) ?? ''
  assert.doesNotMatch(tramoF931, /DATEVALUE/, 'el período del F931 no puede depender del locale del libro')
  assert.match(tramoF931, /DATE\(VALUE\(LEFT\(/)
})

test('la fuente mensual avisa con su propio umbral, o el ▲ estaría prendido siempre', () => {
  assert.match(subtitulo, />45;/, 'el F931 tiene que usar el umbral mensual')
  assert.match(subtitulo, />7;/, 'y Compras el diario')
})

test('la columna de fecha de Compras se coacciona: mezcla serial y texto tipeado', () => {
  // Un MAX crudo ignora el texto EN SILENCIO y se queda con la última fecha que por casualidad entró
  // como número — justo las filas cargadas a mano quedan afuera.
  assert.match(subtitulo, /IFERROR\(DATEVALUE\(Compras!\$AD\$4:\$AD&""\);N\(Compras!\$AD\$4:\$AD\)\)/)
})

test('la fuente sin datos lo dice, y no muestra el 31/01/1900 que da EOMONTH(0;0)', () => {
  assert.match(subtitulo, /"DDJJ F931 sin datos"/)
})

test('separador es-AR en la parte calculada: una coma parte la fórmula', () => {
  const soloCalculo = subtitulo.replace(/"(?:[^"]|"")*"/g, '')
  assert.doesNotMatch(soloCalculo, /,/, `hay una coma separando argumentos: ${soloCalculo}`)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CADENA COMPLETA, ARMADA (06/08). Se ejercita la grilla ENTERA —no una fórmula suelta— porque los
// tres defectos que se arreglan acá sólo se ven en la pestaña armada: el SAC que se corta a mitad de
// año, la dotación promedio y el número pegado del hero.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { grilla as grillaCS, jornalesDelMes } from './cargas-sociales-pestana.mjs'
import {
  A_VERIFICAR, RANGO_FCL_PRIMER_ANIO, RANGO_IERIC, RANGO_DIA_PAGO_F931, PARAMETROS_CARGAS,
} from '../lib/cargas-cadena.mjs'
import { rangosDeCargas, ROTULOS_CARGAS, NOMBRES_CARGAS } from '../lib/libro-extractores-cargas.mjs'
import { SIN_DDJJ as SIN_DDJJ_CS } from '../lib/cargas-grilla.mjs'
import { total as rotuloTotalCS } from '../lib/patron-pestana.mjs'
import { verificarRangos as verificarRangosCS, explicarProblemas as explicarProblemasCS } from '../lib/rangos-con-nombre.mjs'
import { auditarPatron as patronCS } from '../lib/patron-pestana.mjs'
import { auditarDiseno } from '../lib/diseno-unificado.mjs'
import { VACIO as VACIO_CS } from '../lib/preservar-anotaciones.mjs'

/** El ancho de la pestaña: la última columna es la de prosa, que el generador vacía a propósito. */
const ANCHO_CS = 15

const COLS = {
  total: 'O', cliente: 'J', detalle: 'K', fecha: 'AD', rubro: 'AB', proveedor: 'E', fechaFactura: 'C',
  estado: 'X',
}
const PERIODOS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
const CONCEPTOS = [
  { codigo: '301', rotulo: 'Aportes de Seguridad Social (301)' },
  { codigo: '302', rotulo: 'Aportes de Obra Social (302)' },
  { codigo: '351', rotulo: 'Contribuciones de Seguridad Social (351)' },
  { codigo: '352', rotulo: 'Contribuciones de Obra Social (352)' },
  { codigo: '312', rotulo: 'L.R.T. — ART (312)' },
  { codigo: '028', rotulo: 'Seguro Colectivo de Vida Obligatorio (028)' },
]
const PLANES = [{
  nombre: 'Plan F931 W303094 — financiación de junio 2026', n: 3, pagadas: 0, saldo: 7484627,
  proxima: '2026-09-10', total: 7484627,
  porMes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2494876, 2494876, 2494876, 0],
}]
const gCS = grillaCS({
  periodos: PERIODOS, conceptos: CONCEPTOS, ps: PLANES, C: COLS,
  bloqueBase: { inicio: 495, fin: 510 },
})
const filaCS = (re) => gCS.filas.find((f) => re.test(String(f[0] ?? '')))
// LA ÚLTIMA, NO LA PRIMERA. Los rótulos FCL · UOCRA · IERIC · FODECO aparecen DOS veces: en el cuadro
// de lo pagado (sección 2) y en el de la proyección (sección 4). Buscar la primera medía el cuadro
// equivocado — que es, en chiquito, el mismo defecto de anclar en la posición que este repo ya pagó.
const filaProyCS = (re) => [...gCS.filas].reverse().find((f) => re.test(String(f[0] ?? '')))
const textoCS = gCS.filas.flat().map(String).join('\n')

test('LA PESTAÑA NO PUBLICA DEVENGADO: SAC, vacaciones y FCL devengado se fueron', () => {
  // ═══ POR QUÉ SE VAN (09/09/2026) ═══
  //
  // «Cargas Sociales» es una pestaña del Flujo de Caja: trabaja en PERCIBIDO. La sección 6 publicaba
  // SAC devengado, provisión acumulada de aguinaldo, vacaciones devengadas y Fondo de Cese devengado
  // — cuatro cifras DEVENGADAS, ninguna de las cuales el Libro Canónico lee (ver `rangosDeCargas`) y
  // ninguna de las cuales decide un peso de caja. Mezclar los dos criterios en un archivo es la
  // regla de oro 3, y el titular de la pestaña se fue por lo mismo.
  //
  // LO QUE SE PIERDE, DICHO: con la sección se fue el único lugar donde el Fondo de Cese devengado
  // (DDJJ de UOCRA) estaba al lado de lo pagado. Los dos pendientes siguen avisándose por consola
  // (el test de abajo lo exige) y las funciones siguen vivas en lib/vacaciones-construccion.mjs.
  for (const re of [/SAC/, /Vacaciones/, /Provisión acumulada/, /Fondo de Cese devengado/]) {
    assert.equal(filaCS(re), undefined, `volvió una fila de devengado a una pestaña percibida: ${re}`)
  }
})

test('A7 · LA DOTACIÓN ES LA ÚLTIMA REAL, NO UN AVERAGE — y se controla contra otra fuente', () => {
  const dot = filaCS(/^Dotación proyectada/)
  const celda = String(dot[7])
  assert.doesNotMatch(celda, /AVERAGE/, 'volvió el promedio: 21 personas que no fueron ciertas ningún mes')
  assert.match(celda, /INDEX\(.*COUNT\(/, 'tiene que tomar el último mes con DDJJ')
  // Y el control cruzado: la planilla de jornales, que es otra fuente.
  const ctrl = filaCS(/plantel de la última quincena/)
  assert.ok(ctrl, 'sin el contraste, la dotación se valida contra sí misma')
  assert.match(String(ctrl[1]), /JORNALES_REAL_PERSONAS/)
  // EL VEREDICTO ES UN GLIFO (09/09): la frase de 44 caracteres se fue por el minimalismo, pero el
  // control TIENE que seguir pudiendo decir que no — si acá quedara sólo el "✓", sería una constante.
  assert.match(String(ctrl[2]), /"▲"/, 'el control perdió su forma de decir que NO')
  assert.match(String(ctrl[2]), /"✓"/)
})

test('B13 · IERIC y FODECO multiplican la DOTACIÓN, no la remuneración', () => {
  const dot = gCS.filas.indexOf(filaCS(/^Dotación proyectada/)) + 1
  const rem = gCS.filas.indexOf(filaCS(/^Remuneración proyectada/)) + 1
  for (const r of ['IERIC', 'FODECO']) {
    const f = filaProyCS(new RegExp(`^${r}$`))
    assert.ok(f, `desapareció la fila de ${r}`)
    const c = String(f[8])
    assert.match(c, new RegExp(`\\*I\\$${dot}$`), `${r} volvió a proyectarse sobre la masa salarial`)
    assert.doesNotMatch(c, new RegExp(`\\$${rem}\\b`))
  }
  assert.match(textoCS, new RegExp(RANGO_IERIC))
})

test('FCL usa la alícuota legal por antigüedad, y la antigüedad sale del espejo', () => {
  const fcl = filaProyCS(/^FCL$/)
  assert.match(String(fcl[8]), new RegExp(RANGO_FCL_PRIMER_ANIO))
  const antig = filaCS(/en su primer año de antigüedad/)
  assert.ok(antig, 'falta la fila que mide la proporción del plantel en su primer año')
  assert.match(String(antig[1]), /'_J_OBREROS'!\$C\$495:\$C\$510/)
})

test('LO QUE NO SE PUDO VERIFICAR ESTÁ DECLARADO EN LA PESTAÑA, no sólo en el código', () => {
  // Sin esto, un número normativo inventado se lee igual que uno verificado. Es la condición que el
  // dueño puso para aceptar un parámetro en lugar de una alícuota citada.
  assert.ok(textoCS.includes(A_VERIFICAR), 'la marca de "a verificar" no llegó a ninguna celda de la pestaña')
  const conMarca = gCS.filas.filter((f) => f.some((c) => String(c ?? '').includes(A_VERIFICAR))).length
  assert.ok(conMarca >= 3, `sólo ${conMarca} fila(s) declaran el límite: FCL, IERIC y FODECO tienen que decirlo`)
})

test('B9 · LA DEUDA EN PLANES ES UNA FÓRMULA VIVA, no un número pegado', () => {
  const deuda = filaCS(/^⇒ Cuotas sin pagar/)
  const v = deuda[1]
  assert.equal(typeof v, 'string', `sigue siendo un número pegado: ${v}`)
  assert.ok(String(v).startsWith('='))
})

test('B8 · "POR PAGAR" INCLUYE EL MES EN CURSO — el criterio de posición perdía $2,97M', () => {
  // EL DEFECTO, MEDIDO EL 06/08. La fórmula sumaba las columnas cuyo número de mes fuera
  // `> MONTH(TODAY())`: agosto quedaba afuera ENTERO y el hero decía $4.989.751. Las cuotas de agosto
  // —$473.767 con vencimiento el 16 y $2.494.876 de la financiación de junio, ninguna pagada— no
  // estaban en ningún lado. Con el criterio por HECHO (lo que la planilla no marcó "Pagado") el hero
  // da $7.958.394,73, que es exactamente lo que el Libro ya trae como compromiso.
  const v = String(filaCS(/^⇒ Cuotas sin pagar/)[1])
  assert.doesNotMatch(v, /MONTH\(TODAY\(\)\)/,
    'volvió el criterio de posición: el mes en curso se pierde entero y con él la cuota que vence esta semana')
  assert.match(v, /"<>Pagado"/, 'lo que falta pagar es lo que la planilla no marcó pagado, no lo que vence después')
  assert.match(v, /Deuda previsional \(planes de pago\)/, 'tiene que filtrar por el rubro, no por el cliente')
  // La columna del estado es la del cargador (Pagado/Pendiente), NO el semáforo con emoji: "<>Pagado"
  // contra "✅ Pagado" no excluye nada y el hero mostraría el total del rubro, pagadas incluidas.
  assert.match(v, new RegExp(`Compras!\\$${COLS.estado}\\$4`), 'la columna de estado tiene que ser la resuelta por rótulo')
})

test('B11 · NINGÚN aviso ocupa una fila de la pestaña: los hallazgos salen por la corrida', () => {
  // ═══ ESTE TEST ESTÁ DADO VUELTA, Y ESTÁ DICHO POR QUÉ (06/09/2026) ═══
  //
  // Pedía lo contrario: que los cuatro avisos ▲ tuvieran su texto EN la celda y midieran más de 70
  // caracteres. Era la cura correcta para el defecto B11 —el aviso que quedaba mudo porque su
  // explicación vivía en la columna O, que este mismo generador vacía— y dejó de serlo el 05/09,
  // cuando el dueño prohibió la aclaración en el Sheet. Un aviso de 217 caracteres al pie de un
  // cuadro es exactamente lo que el contrato llama nota al pie.
  //
  // La cura de B11 no se pierde: un aviso mudo sigue siendo imposible, porque ahora no hay aviso en
  // la pestaña. Los dos que son hallazgos vivos salen por `grilla().avisos`, y el test de abajo mide
  // que sigan saliendo — si se borraran, este par de tests quedaría verde por partida doble y el
  // control no podría dar rojo.
  const esFilaSuelta = (f) => String(f[0] ?? '').trim()
    && f.slice(1, ANCHO_CS - 1).every((c) => c === '' || c == null || c === VACIO_CS)
  const notas = gCS.filas.filter((f) => esFilaSuelta(f) && /^▲/.test(String(f[0] ?? '')))
  assert.deepEqual(notas.map((f) => String(f[0]).slice(0, 60)), [],
    'volvió una nota al pie a «Cargas Sociales»')
})

test('los dos HALLAZGOS que estaban al pie siguen saliendo — por la corrida, no por la pestaña', () => {
  // Sacar la nota y no publicar el hallazgo en ningún lado sería apagar el aviso, que es la forma
  // exacta en que nace un control que no puede dar rojo. Los dos son accionables: conseguir los días
  // de vacaciones por tramo que confirme el contador, y conseguir el plan original de ARCA.
  const avisos = (gCS.avisos ?? []).join(' | ')
  assert.match(avisos, /Vacaciones/, 'el pendiente de los días por tramo dejó de avisarse')
  assert.match(avisos, /plan original de ARCA/, 'el pendiente del plan de ARCA dejó de avisarse')
  for (const a of gCS.avisos) assert.match(a, /^▲/, 'un aviso sin su marca no se distingue de un log')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL TITULAR (09/09/2026) — DOS PREGUNTAS, LAS DOS DE CAJA
//
// Decía «Costo laboral del año — devengado $100.057.714» y se partía en REAL · COMPROMETIDO ·
// PROYECTADO. Tres problemas en una sola tarjeta: publicaba un DEVENGADO en un archivo percibido,
// sumaba ocho meses declarados con cuatro proyectados en una cifra, y las tres particiones sólo
// existían para explicar ese número. El dueño aprobó reemplazarlo por lo que sí decide: cuánto salió
// y cuándo sale lo próximo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const heroCS = (re) => gCS.filas.findIndex((f) => re.test(String(f[0] ?? ''))) + 1

test('el titular es PERCIBIDO: lo pagado en el año y el próximo vencimiento', () => {
  const pagado = filaCS(/^⇒ Cargas sociales pagadas en el año/)
  assert.ok(pagado, 'se fue el titular: la pestaña vuelve a arrancar en un cuadro')
  // Es la suma de la fila de TOTAL del cuadro 2, que mide por HECHO ("Pagado" en Compras). No se
  // recalcula por otro camino: dos verdades para lo mismo es como se pierde la confianza en la hoja.
  const fPagTot = heroCS(/^⇒ Total pagado/)
  assert.equal(String(pagado[1]), `=SUM($B$${fPagTot}:$M$${fPagTot})`)
  // Los DOCE meses: la pregunta es cuánta plata salió este año, y la de enero salió este año aunque
  // su devengado sea de diciembre pasado. El hero viejo empezaba en febrero porque medía devengado.
  assert.doesNotMatch(String(pagado[1]), /^=SUM\(\$C\$/, 'volvió a saltearse enero: eso era del hero devengado')
})

test('NINGUNA cifra del titular habla en devengado', () => {
  // El archivo entero es percibido. Un «costo del año» arriba de todo obliga al que lo lee a
  // acordarse de que esa plata todavía no salió — y nadie se acuerda.
  const arriba = gCS.filas.slice(0, 8).flat().map(String).join(' ')
  assert.doesNotMatch(arriba, /devengado/i, 'el titular volvió a hablar en devengado')
  for (const re of [/^ {3}· REAL · /, /^ {3}· COMPROMETIDO · /, /^ {3}· PROYECTADO · /]) {
    assert.equal(filaCS(re), undefined, `volvió la partición del hero devengado: ${re}`)
  }
})

test('el próximo vencimiento sale de los RANGOS CON NOMBRE, no de un número de fila', () => {
  // Es la misma serie que lee el Libro Canónico. Con referencias por fila, el titular y el cash flow
  // podrían discrepar sobre cuál es el próximo vencimiento y ninguna celda se pondría roja.
  const prox = filaCS(/^⇒ Próximo vencimiento/)
  assert.ok(prox, 'se fue la segunda pregunta del titular')
  assert.match(String(prox[1]), new RegExp(`INDEX\\(${NOMBRES_CARGAS.declarado};`), 'el importe tiene que salir del declarado publicado')
  assert.match(String(prox[2]), new RegExp(`INDEX\\(${NOMBRES_CARGAS.fechas};`), 'y la fecha, de la fila de fechas publicada')
  // «La primera que NO pasó» incluye la de HOY: con MATCH(...;1)+1 el vencimiento desaparecía del
  // titular justo el día que vence, que es el día en que la pregunta importa.
  assert.match(String(prox[1]), /COUNTIF\(\w+;"<"&TODAY\(\)\)\+1/)
  // Y la fecha se declara como CELDA de fecha: el barrido de moneda la dibujaría «$46.305».
  assert.deepEqual(gCS.celdasFecha, [{ fila: heroCS(/^⇒ Próximo vencimiento/), col: 2 }])
})

test('los planes bajaron del titular a su cuadro, y sin la aclaración al lado', () => {
  // El renglón vivía en el hero con un texto explicativo en la celda C («financia parte de lo
  // comprometido; incluye deuda de 2025»). El titular ya no es una partición del costo del año, así
  // que el número no puede sumarse a nada por accidente y la aclaración no tiene qué prevenir.
  const planes = filaCS(/^⇒ Cuotas sin pagar/)
  assert.ok(planes, 'se perdió lo que falta pagar de los planes')
  assert.equal(String(planes[2] ?? ''), VACIO_CS, 'volvió una explicación al lado del importe')
  assert.ok(heroCS(/^⇒ Cuotas sin pagar/) > heroCS(/^4 · /i), 'tiene que estar dentro del cuadro de planes')
})

test('el control de integridad se declara para que la piel lo dibuje distinto', () => {
  // El cero de esta fila ES la respuesta, y salía como el mismo "—" que significa "no hay dato".
  // Las cuatro notas al pie que este test también declaraba se retiraron el 06/09: `pies` queda como
  // canal —el formato de una nota futura tiene que declararse, no adivinarse— pero llega vacío.
  assert.deepEqual(gCS.pies, [], 'una nota al pie volvió a declararse: el contrato la prohíbe')
  assert.deepEqual(gCS.controles, [heroCS(/^⇒ Diferencia — tiene que ser \$0/)])
})

test('la pestaña armada cumple el patrón de diseño: cero defectos', () => {
  const vista = gCS.filas.map((f) => f.map((c) => {
    const s = String(c ?? '')
    return s === VACIO_CS ? '' : (s.startsWith('=') ? '123' : s)
  }))
  const d = patronCS(vista)
  assert.deepEqual(d, [], d.map((x) => `fila ${x.fila} · ${x.regla} · ${x.detalle}`).join('\n'))
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CADENA PUBLICADA (06/08) — la fila que decía "ésta es la que tiene que mirar el cash flow" y
// que no miraba nadie. Sin estos tres rangos con nombre, el Libro proyecta las cargas con las filas
// planas tipeadas en Compras.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('la pestaña publica la serie de cargas, anclada a sus rótulos y sin rangos ciegos', () => {
  const quiero = rangosDeCargas(gCS.rangos)
  assert.deepEqual(quiero.map((r) => r.nombre), Object.values(NOMBRES_CARGAS))
  const problemas = verificarRangosCS(gCS.filas, quiero)
  assert.deepEqual(problemas, [], explicarProblemasCS(problemas))
})

test('los subtotales son DOS: el F931 y los gremiales son dos líneas del cash flow', () => {
  const f931 = filaCS(new RegExp(`^${ROTULOS_CARGAS.f931.replace(/[⇒]/, '⇒')}`))
  const grem = filaCS(new RegExp(ROTULOS_CARGAS.gremiales.slice(2, 30)))
  assert.ok(f931 && grem, 'sin los dos subtotales, los gremiales se mudan a la línea de cargas sociales')
  // El total del mes es la suma de los dos, no un SUM sobre el bloque: con las filas de subtotal
  // adentro del rango, cada concepto se contaría dos veces.
  const tot = String(filaCS(/^⇒ Total devengado en el mes/)[8])
  assert.doesNotMatch(tot, /SUM\(/, 'un SUM sobre el bloque ahora incluiría los dos subtotales')
  assert.match(tot, /^=I\d+\+I\d+$/)
})

test('la fila de fechas fecha la salida al MES SIGUIENTE, y diciembre cae en enero del año que viene', () => {
  const fechas = filaCS(new RegExp(ROTULOS_CARGAS.fechas.trim().slice(0, 20)))
  assert.ok(fechas, 'sin la fila de fechas el Libro no puede ubicar la cadena en ningún tramo del calendario')
  assert.equal(fechas[7], `=DATE(2026;8;MAX(1;N(${RANGO_DIA_PAGO_F931})))`, 'el devengado de julio sale en agosto')
  // DICIEMBRE SALE EN ENERO DEL AÑO QUE VIENE: son $10.507.157 (medidos el 06/08) que ninguna vista
  // levantaba, porque la grilla del año termina en diciembre. Y se escribe con su año, no como mes 13.
  assert.equal(fechas[12], `=DATE(2027;1;MAX(1;N(${RANGO_DIA_PAGO_F931})))`)
  assert.doesNotMatch(gCS.filas.flat().map(String).join(' '), /DATE\(\d{4};1[3-9];/, 'volvió el mes 13')
  assert.equal(fechas[13], VACIO_CS, 'una fila de fechas no se totaliza')
})

test('el día de pago vive en Parámetros, no adentro de la fórmula', () => {
  const p = PARAMETROS_CARGAS.find((x) => x.rango === RANGO_DIA_PAGO_F931)
  assert.ok(p, 'sin el parámetro, la fila de fechas queda en #NAME? y la cadena no entra al libro')
  assert.equal(p.valor, 10, 'la moda de los seis pagos reales de F931 cargados en Compras')
  assert.ok(p.nota.includes(A_VERIFICAR), 'el calendario de ARCA para F931 no está cableado: hay que decirlo')
})

test('B78 · el control de planes resta DOS CELDAS VIVAS: ninguna constante de la corrida', () => {
  const dif = filaCS(/^⇒ Diferencia — tiene que ser \$0/)
  assert.match(String(dif[1]), /^=\$B\$\d+-\$N\$\d+$/,
    `el control volvió a restar contra una constante: ${dif[1]}`)
})

test('NINGUNA FÓRMULA DE LA GRILLA LLEVA UN LITERAL DE MILLONES ADENTRO', () => {
  // Un número grande estampado en una fórmula es una foto del día de la corrida: el control que lo
  // usa da cero cuando se escribe y miente para siempre después. Se escanea la grilla entera y no
  // sólo el control, porque el defecto se repite solo.
  const culpables = []
  gCS.filas.forEach((f, i) => f.forEach((c, j) => {
    const s = String(c ?? '')
    if (!s.startsWith('=')) return
    // Los años (2026, 2027) son cuatro dígitos y son legítimos; un importe tiene siete o más.
    const m = s.match(/(?<![\d.,])\d{7,}(?![\d.,])/)
    if (m) culpables.push(`fila ${i + 1} col ${j}: …${s.slice(Math.max(0, s.indexOf(m[0]) - 24), s.indexOf(m[0]) + m[0].length)}`)
  }))
  assert.deepEqual(culpables, [], culpables.join('\n'))
})

test('lo que no es plata no se dibuja como plata: personas, proporción y fechas', () => {
  const fila = (re) => gCS.filas.findIndex((f) => re.test(String(f[0] ?? ''))) + 1
  assert.ok(gCS.cantidades.includes(fila(/plantel de la última quincena/)),
    'las 16 personas del control de plantel se dibujaban "$16"')
  assert.ok(gCS.ratios.includes(fila(/en su primer año de antigüedad/)),
    'la proporción 0,7 del plantel se dibujaba "$1"')
  assert.deepEqual(gCS.fechas, [fila(new RegExp(ROTULOS_CARGAS.fechas.trim().slice(0, 20)))],
    'la fila de fechas sin formato de fecha sale "$46.244"')
})

test('la cadena arranca en los jornales: la remuneración proyectada cuelga de sus rangos con nombre', () => {
  const j = jornalesDelMes('DATE(2026;9;1)')
  assert.match(j, /JORNALES_REAL_TOTAL/)
  assert.match(j, /JORNALES_PROY_TOTAL/)
  const rem = filaCS(/^Remuneración proyectada/)
  assert.match(String(rem[9]), /JORNALES_PROY_TOTAL/, 'la remuneración dejó de colgar de los jornales proyectados')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL BLOQUE 2 DECÍA "SALIÓ DE LA CAJA" SOBRE PLATA QUE NO SALIÓ (17/08/2026)
//
// Medido contra el Sheet vivo. La fila «F931» del bloque *"2 · PAGADO — ¿cuánto salió efectivamente
// de la caja?"* publicaba **$10.494.876 en ago-26**. Ninguno de esos pesos salió:
//
//   · Compras f469 — $8.000.000, ARCA, fecha de caja 10/08, estado **«Proyectado»**. Es el número
//     redondo tipeado que `libro-extractores-cargas.mjs` ya denuncia en su cabecera como previsión.
//   · Compras f725 — $2.494.876, cuota del plan W303094, fecha 16/08, estado **«Pendiente»**, rubro
//     «Deuda previsional (planes de pago)» — pero con "F931" en Cliente/Asignación, así que entraba
//     por la puerta del F931 Y volvía a contarse en la fila del plan de al lado.
//
// EL TOPE DE HOY NO ALCANZA, Y ÉSE ERA EL ERROR DE FONDO. El arreglo del 23/07 cortó el futuro
// (`<=TODAY()`), que resuelve los meses que vienen; no resuelve la fila de ESTE mes cuya fecha
// prevista ya pasó y que nadie marcó. Una fecha vencida no es un pago: es una previsión atrasada.
//
// Y LA PROPIA PESTAÑA YA SABÍA CÓMO SE PREGUNTA. Doce filas más arriba, el hero de planes de pago
// mide por HECHO (`"<>Pagado"` sobre la columna del cargador) y por eso da bien. Dos definiciones de
// "pagado" en la misma pestaña: la de arriba correcta y la de abajo por fecha. La consecuencia se
// propagaba al hero —REAL inflado ~$10,5M y COMPROMETIDO desinflado en lo mismo, porque sale por
// diferencia— y a la sección 3, que llegó a declarar $10.494.876 de sobrepago inexistente.
//
// LO QUE ESTOS TESTS NO HACEN, Y ES DELIBERADO: no leen la fila 25 para decidir nada. Un extractor
// que retire deuda porque este cuadro dice "pagado" estaría validando el control contra la misma
// información que lo produce (la fila sale de Compras, y la cadena existe para reemplazar a Compras).
// El candado de ese lado vive en `lib/libro-extractores-cargas.test.mjs`.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** Las filas del bloque 2. `filaCS` devuelve la PRIMERA coincidencia y el bloque 2 va antes que el 4,
 *  donde FCL/UOCRA/IERIC/FODECO vuelven a aparecer como proyección. */
const CONCEPTOS_PAGADOS = ['F931', 'Deuda previsional en cuotas', 'FCL', 'UOCRA', 'IERIC', 'FODECO']

test('2 · PAGADO: una fila que la planilla NO marcó "Pagado" no salió de la caja', () => {
  const sinEstado = []
  for (const rotulo of CONCEPTOS_PAGADOS) {
    const f = filaCS(new RegExp(`^${rotulo}$`))
    assert.ok(f, `no encontré la fila «${rotulo}» del bloque de lo pagado`)
    // Se mira una columna cualquiera de la grilla mensual (ago = índice 8): las doce se generan igual.
    const v = String(f[8] ?? '')
    if (!new RegExp(`Compras!\\$${COLS.estado}\\$4`).test(v) || !/"Pagado"/.test(v)) sinEstado.push(`${rotulo}: ${v}`)
  }
  assert.deepEqual(sinEstado, [],
    'estas filas dicen "salió de la caja" mirando sólo la FECHA. Al 17/08 eso publicó $10.494.876 de '
    + `F931 pagado en agosto contra $0 realmente pagados:\n${sinEstado.join('\n')}`)
})

test('2 · PAGADO: el tope de HOY se queda, pero ya no decide solo', () => {
  // El arreglo del 23/07 sigue vigente y hace falta: una fila marcada "Pagado" con fecha de caja
  // futura tampoco salió todavía. Los dos filtros son necesarios y ninguno reemplaza al otro.
  for (const rotulo of CONCEPTOS_PAGADOS) {
    assert.match(String(filaCS(new RegExp(`^${rotulo}$`))[8]), /TODAY\(\)/,
      `«${rotulo}» perdió el tope de hoy: lo previsto para diciembre volvería a contarse como pagado`)
  }
})

test('2 · PAGADO: la cuota de un plan no entra por la fila del F931', () => {
  // Compras f725 tiene "F931" en Cliente/Asignación y rubro «Deuda previsional (planes de pago)».
  // Con el criterio por cliente solo, sus $2.494.876 sumaban en la fila del F931 mientras la fila del
  // plan los contaba aparte: el mismo peso, dos veces, dentro del mismo cuadro.
  const f931 = String(filaCS(/^F931$/)[8])
  assert.match(f931, new RegExp(`Compras!\\$${COLS.rubro}\\$4`),
    'la fila del F931 no acota por rubro: una cuota de plan rotulada "F931" se cuenta como F931')
  assert.match(f931, /Nómina · Cargas sociales/, 'el rubro tiene que ser el de la taxonomía única')
})

test('2 · PAGADO: los gremiales se acotan a SU rubro', () => {
  for (const rotulo of ['FCL', 'UOCRA', 'IERIC', 'FODECO']) {
    const v = String(filaCS(new RegExp(`^${rotulo}$`))[8])
    assert.match(v, /Nómina · Gremiales/,
      `«${rotulo}» no acota por rubro: cualquier fila con ese texto en Cliente/Asignación entra al cuadro`)
  }
})

test('UNA SOLA DEFINICIÓN DE "PAGADO" EN TODA LA PESTAÑA', () => {
  // El defecto no fue una fórmula: fue que convivieran dos criterios para la misma palabra. Este test
  // los ata. Si mañana alguien agrega un cuadro de "lo que salió" con un tercer criterio, se pone rojo.
  const sinPagar = String(filaCS(/^⇒ Cuotas sin pagar/)[1])
  assert.match(sinPagar, new RegExp(`Compras!\\$${COLS.estado}\\$4`), 'el saldo de planes mide por estado')
  for (const rotulo of CONCEPTOS_PAGADOS) {
    assert.match(String(filaCS(new RegExp(`^${rotulo}$`))[8]), new RegExp(`Compras!\\$${COLS.estado}\\$4`),
      `«${rotulo}» mide "pagado" por un criterio distinto al del hero, en la misma pestaña`)
  }
})

// ═══ EL RANGO REAL SIGUE AL ÚLTIMO MES DECLARADO (27/08/2026, auditoría de la pestaña) ═══
//
// `REALES` estaba congelado en `$B$:$G$` —enero a junio— con julio ya presentado al lado. De ese
// rango salen la dotación proyectada, la relación entre remuneración declarada y jornales netos, y
// las cinco alícuotas medidas de la cadena. El defecto ya se conocía: está parchado para la fila
// COMPROMETIDO y no se generalizó. Este test es la generalización.
test('el rango de los meses reales crece con desdeProy y no se queda en junio', async () => {
  const { REALES, MESES_REALES } = await import('../lib/cargas-grilla.mjs')
  assert.equal(REALES(20, 7), '$B$20:$G$20', 'con junio declarado, B..G')
  assert.equal(REALES(20, 8), '$B$20:$H$20', 'con julio declarado, B..H — el defecto medido')
  assert.equal(REALES(20, 13), '$B$20:$M$20', 'con el año entero declarado, B..M')
  assert.deepEqual(MESES_REALES(8), [1, 2, 3, 4, 5, 6, 7], 'el denominador acompaña al numerador')
  assert.deepEqual(MESES_REALES(7), [1, 2, 3, 4, 5, 6])
})

test('REALES no tiene default: un rango congelado en silencio es el defecto que se está arreglando', async () => {
  const { REALES } = await import('../lib/cargas-grilla.mjs')
  assert.throws(() => REALES(20), /desdeProy/)
  assert.throws(() => REALES(20, null), /desdeProy/)
  assert.throws(() => REALES(20, 1), /desdeProy/)
})

test('la pestaña cumple el CONTRATO DE DISEÑO entero: encabezado, numeración y ni una explicación', () => {
  // ═══ POR QUÉ ADEMÁS DEL PATRÓN (06/09/2026) ═══
  //
  // `auditarPatron` mide la gramática de la pestaña —secciones, totales, encabezados— y da cero desde
  // hace tiempo. Lo que no miraba nadie es la PROSA fuera de la columna A y el encabezado de tres
  // filas: los cuatro desvíos que `auditar-diseno-unificado` le encontraba a esta pestaña (A66, A75,
  // A77 y A87, de 105 a 218 caracteres) pasaban por delante del patrón sin despeinarlo.
  //
  // La columna O se juzga VACÍA porque `main()` la vacía antes de escribir (`vaciarColumnaDeProsa`):
  // medirla con su texto adentro marcaría decenas de desvíos que el lector no tiene.
  const filas = gCS.filas.map((f) => (f || []).map((c, j) => {
    if (j === ANCHO_CS - 1 || c === VACIO_CS) return ''
    return c
  }))
  const mal = auditarDiseno(filas, { pestana: 'Cargas Sociales' })
  assert.deepEqual(mal, [], mal.map((x) => `${x.col ?? ''}${x.fila} · ${x.regla} · ${x.detalle}`).join('\n'))
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA PROYECCIÓN DENTRO DE «TOTAL DECLARADO» — UN NÚMERO CON OTRA TIPOGRAFÍA, NO UNA FRASE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('los meses sin DDJJ traen un NÚMERO, no «≈ $8.717.159 proy.»', () => {
  const decl = filaCS(new RegExp(`^${ROTULOS_CARGAS.declarado}`))
  const fSub = gCS.filas.findIndex((f) => String(f[0] ?? '').startsWith(ROTULOS_CARGAS.f931)) + 1
  // Septiembre (índice 9) es el primer mes sin DDJJ en el caso base (enero–junio declarados = julio).
  const sep = String(decl[7])
  assert.doesNotMatch(sep, /TEXT\(/, 'el importe volvió a ser una oración: no se suma, no se ordena, no se compara')
  assert.doesNotMatch(sep, /proy\./)
  // Y referencia el SUBTOTAL F931, no el «Total devengado en el mes»: esta fila ES
  // CARGAS_MES_F931_DECLARADO, y con los gremiales adentro el Libro los publicaría dos veces.
  assert.equal(sep, `=IF(N(H${fSub})=0;"${SIN_DDJJ_CS}";H${fSub})`)
})

test('la proyección se declara para que la piel la pinte gris e itálica', () => {
  // Sin esta declaración el número proyectado se dibuja idéntico al declarado, que es exactamente
  // mezclar dos ventanas de tiempo — y la palabra «proy.» ya no está para avisarlo.
  const fDecl = gCS.filas.findIndex((f) => String(f[0] ?? '').startsWith(ROTULOS_CARGAS.declarado)) + 1
  assert.deepEqual(gCS.proyectadas, [{ fila: fDecl, meses: [7, 8, 9, 10, 11, 12] }])
})

test('la fila «Total declarado» NO totaliza el año: sería declarado + proyectado en una cifra', () => {
  // Es el mismo número que el titular viejo publicaba como «Costo laboral del año — devengado»
  // ($100.057.714 en el archivo vivo). Un total que suma ocho meses declarados con cuatro
  // proyectados no es un total: es dos cosas sumadas sin decirlo.
  const decl = filaCS(new RegExp(`^${ROTULOS_CARGAS.declarado}`))
  assert.equal(decl[13], VACIO_CS)
})

test('los cuadros son CUATRO y están numerados 1, 2, 3, 4', () => {
  const secciones = gCS.filas.map((f) => String(f[0] ?? '')).filter((t) => /^\d+ · /.test(t))
  assert.deepEqual(secciones.map((t) => t.slice(0, 5)), ['1 · D', '2 · P', '3 · P', '4 · P'],
    `quedaron ${secciones.length} secciones: ${secciones.join(' | ')}`)
})

test('las filas de caja son filas del cuadro 3, y la «diferencia» estructural no está', () => {
  // La resta comparaba «previsto en Compras» —que sólo trae cuotas de planes— contra el devengado
  // entero: no podía dar cero ningún mes. Las otras tres filas siguen, dentro de la proyección.
  const f3 = gCS.filas.findIndex((f) => /^3 · /.test(String(f[0] ?? ''))) + 1
  const f4 = gCS.filas.findIndex((f) => /^4 · /.test(String(f[0] ?? ''))) + 1
  for (const re of [/^Cargas que salen en el mes/, /^Cuotas de planes de pago que vencen/, /^Previsto en Compras/]) {
    const i = gCS.filas.findIndex((f) => re.test(String(f[0] ?? ''))) + 1
    assert.ok(i > f3 && i < f4, `«${re}» quedó fuera del cuadro 3`)
  }
  assert.equal(filaCS(/diferencia contra lo proyectado/), undefined, 'volvió la resta que no puede dar cero')
})

test('la fila de cuotas que vencen REFERENCIA el total del cuadro 4, no lo recalcula', () => {
  const vencen = filaCS(/^Cuotas de planes de pago que vencen/)
  const fTot = gCS.filas.findIndex((f) => String(f[0] ?? '').startsWith(rotuloTotalCS('Total de cuotas del año'))) + 1
  assert.equal(String(vencen[9]), `=J${fTot}`, 'el mismo número por dos caminos es como aparecen dos verdades')
})
