// LOS INVARIANTES QUE SE MUDARON A `_CAJA_ANEXO`, VERIFICADOS EN FRÍO.
//
// POR QUÉ ESTE ARCHIVO EXISTE (05/08/2026). Cuando CAJA pasó de 143 filas a 45, siete bloques de
// control se mudaron a la pestaña auxiliar. Cada uno de esos bloques tenía tests que probaban un
// defecto real y caro —el efectivo contado dos veces, la nómina que salía por los dos canales, el
// cheque endosado que el cash flow seguía esperando—. **Un invariante que se muda de archivo y no se
// muda de test es un invariante que se perdió**, y la mudanza habría dejado la pestaña más linda y más
// ciega. Estos tests son los mismos, apuntando a donde ahora vive el código.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  grillaAnexo, ANCHO_ANEXO, SELLO_EFECTIVO, HISTORICO_EFECTIVO, claveDeRotulo, FECHA_DEL_CONTEO,
  FECHA_ULTIMO_EFECTIVO,
} from './caja-anexo.mjs'
import { rescatarAnexo } from '../scripts/caja-anexo-pestana.mjs'
import { ANEXO, DESDE_CAJA } from './caja-anexo-nombres.mjs'
import { ESPECIE_ANEXO, PUEDE_ESTAR_VACIO } from './caja-anexo-nombres.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { MARCAS } from './cheques-cobertura.mjs'
// La fila donde arranca el registro de Cheques Emitidos NO se escribe a mano en un test: es lo que
// este cambio vino a cerrar. Ver lib/cheques-emitidos-geometria.mjs.
import { FILA_DATO0 } from './cheques-emitidos-geometria.mjs'

const vacia = (s) => s === '' || s === VACIO
const REFS = { bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', tarjeta: 'Tarjeta de Credito', cierre: 60, inicio: 50, cab: 5 }
const CARTERA = { origen: 'test', enCartera: [{ numero: '00000514', emisor: 'Mineral Del Río' }], endosados: [{ numero: '00000313', beneficiario: 'ALUMETAL S.A' }] }
const construir = () => grillaAnexo({ refs: REFS, cartera: CARTERA, conceptosCiegos: ['descubierto', 'Comisiones', 'Impuesto al cheque'] })

const filaDe = (g, re) => g.filas.findIndex((f) => re.test(String(f?.[0] ?? '').trim())) + 1
const celda = (g, fila, col) => String(g.filas[fila - 1]?.[col] ?? '')
/**
 * Una fila COMO LA DEVUELVE LA API, para probar el rescate contra su entrada real: `readSheetGrid`
 * entrega una celda por columna con `valor` (el texto tal cual, con su sangría) y `numero`.
 */
const celdas = (rotulo, numeros = {}) => Array.from({ length: ANCHO_ANEXO }, (_, i) => ({
  valor: i === 0 ? rotulo : null,
  numero: Object.hasOwn(numeros, i) ? numeros[i] : null,
}))

test('el anexo se construye sin red, sin base y sin escribir una celda', () => {
  const g = construir()
  assert.ok(g.filas.length > 60, 'el detalle entero tiene que estar')
  for (const f of g.filas) assert.equal(f.length, ANCHO_ANEXO, 'una fila más ancha que la tabla hace fallar el batch ENTERO')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DESGLOSE DEL EFECTIVO — SE VE Y NO SUMA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el desglose del efectivo está entero: los seis históricos, cada uno en su renglón', () => {
  // Un total solo no se puede discutir: $19,7 millones de efectivo en un cajón es un número que hay que
  // poder abrir. Desde el sello (07/08) cada renglón es el HISTÓRICO COMPLETO de su canal — sin ventana
  // de fecha, porque el día no puede ordenar dos hechos del mismo día — y el neto es la SUMA de lo que
  // se ve, así que el desglose no puede decir otra cosa que el total.
  const g = construir()
  const renglones = [
    [/\(\+\) cobrado en efectivo — desde el conteo/i, false],
    [/\(−\) pagado en efectivo — desde el conteo/i, true],
    [/\(−\) jornales pagados en efectivo — desde el conteo/i, true],
    [/\(−\) sueldos de OFICINA en efectivo — desde el conteo/i, true],
    [/\(\+\) extraído del banco — desde el conteo/i, false],
    [/\(−\) depositado en el banco — desde el conteo/i, true],
  ]
  for (const [re, resta] of renglones) {
    const f = filaDe(g, re)
    assert.ok(f > 0, `falta el renglón del desglose: ${re}`)
    assert.match(celda(g, f, 2), /^=/, `${re}: el desglose tiene que ser fórmula`)
    // El desglose se VE y no SUMA en pesos: la columna E va vacía o el mismo efectivo entraría dos veces.
    assert.ok(vacia(celda(g, f, 4)), `${re}: el desglose NO puede aportar valor en pesos`)
    assert.ok(!celda(g, f, 2).includes('ARQUEO'), `${re}: el histórico no puede depender de la fecha del arqueo`)
    if (resta) assert.match(celda(g, f, 2), /^=-\(/, `${re}: una descarga tiene que ir restando`)
  }
  // Y los renglones son EXACTAMENTE los que el neto y el sello suman: filasHistorico los delimita.
  const [f0, f1] = g.filasHistorico
  assert.equal(f1 - f0 + 1, 6, 'seis renglones de histórico, ni uno más')
  assert.equal(filaDe(g, renglones[0][0]), f0)
  assert.equal(filaDe(g, renglones[5][0]), f1)
})

test('EL SELLO: con conteo nuevo se autocancela (neto 0 = "lo contado, tal cual"); sellado, resta el número sellado', () => {
  // El defecto que este diseño cierra, medido en vivo dos veces en 24 horas y en los dos sentidos:
  // el conteo del mediodía no veía el pago de la tarde, y el conteo de la tarde volvía a restar un
  // pago que ya tenía adentro. El dueño: "yo se q ahora hay 5920000, por que no myestra eso mismo".
  const g = construir()
  const sello = celda(g, g.fSello, 2)
  const [f0, f1] = g.filasHistorico
  assert.match(sello, new RegExp(`SUM\\(C${f0}:C${f1}\\)`), 'el sello viejo se autocancela restando el histórico ENTERO')
  // CON VENTANA EL SELLO YA NO RESTA (15/08/2026): los renglones cuentan sólo lo posterior al instante
  // sellado, así que restarles la foto del histórico los contaría dos veces. Ver caja-anexo.mjs.
  assert.match(sello, /;0\)$/, 'con el conteo sellado el sello aporta 0: la ventana ya hizo el corte')
  assert.match(sello, /<>N\(CAJA_ARQUEO_ARS\)/, 'la vigencia compara el VALOR del arqueo contra la copia sellada')
  // CAMBIO DE CONTRATO (15/08): la FECHA salió de la identidad del conteo. El dueño la borró
  // ("no te guíes en eso sino en lo q marca los timestamps del código") y mientras se comparara, un 0
  // contra el 46241 sellado resellaba en cada corrida y se tragaba los movimientos adentro del conteo.
  assert.doesNotMatch(sello, /CAJA_ARQUEO_ARS_FECHA/,
    'ninguna celda que el dueño pueda borrar puede intervenir en la vigencia del sello')
  assert.ok(!sello.includes(','), 'es-AR: separador ; — una coma acá es un decimal, no un argumento')
  // El neto es la suma de TODO lo visible: los seis históricos y el sello. Nada por fuera. Y desde el
  // 14/08 lleva además la guarda de lo imposible (su propio test, más abajo).
  const neto = celda(g, g.fNeto, 2)
  // LA GUARDA CUELGA DEL SELLO, NO DE LA CELDA. Ése es todo el bug del 15/08: al borrar D7 el neto
  // quedó en 0 y el automático se apagó entero. Si hay sello estampado por el código, hay ventana.
  assert.match(neto, new RegExp(`^=IF\\(NOT\\(ISNUMBER\\(\\$F\\$${g.fSello}\\)\\);0;`))
  assert.doesNotMatch(neto, /CAJA_ARQUEO_ARS_FECHA/, 'la fecha tipeada ya no puede apagar el mecanismo')
  assert.ok(neto.includes(`SUM(C${f0}:C${g.fSello})`), 'el neto suma exactamente el bloque visible')
  // Sin sellos previos, D del sello y D del estado salen en 0: fuerzan "conteo sin sellar" — el lado
  // que muestra lo contado tal cual, nunca un descuento fantasma.
  assert.equal(g.filas[g.fSello - 1][3], 0)
  assert.equal(g.filas[g.fEstado - 1][3], 0)
})

test('el sello RESCATADO viaja a su celda: regenerar el anexo no puede deshacer el sello', () => {
  // EL RESCATE SE ARMA CON EL PRODUCTOR REAL (`rescatarAnexo` sobre filas como las devuelve la API), no
  // con un Map tipeado a mano. Escrito a mano, este test pasaba en verde mientras el rescate vivo no
  // encontraba NUNCA el sello: comparaba el rótulo del Sheet recortado contra una constante con seis
  // espacios de sangría. Ver el test del rescate, abajo.
  const cargado = rescatarAnexo([
    celdas(SELLO_EFECTIVO.sello, { 3: -2000000, 5: 46240 }),
    celdas(SELLO_EFECTIVO.estado, { 3: 5920000 }),
  ])
  const g = grillaAnexo({ refs: REFS, cartera: CARTERA, conceptosCiegos: [], cargado })
  assert.equal(g.filas[g.fSello - 1][3], -2000000, 'el número sellado se re-emite donde estaba')
  assert.equal(g.filas[g.fSello - 1][5], 46240, 'con la fecha del conteo al que pertenece')
  assert.equal(g.filas[g.fEstado - 1][3], 5920000, 'y la copia del valor del arqueo, para detectar el próximo conteo')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL RESCATE POR RÓTULO Y EL EFECTIVO IMPOSIBLE — LOS DOS DEFECTOS DEL 14/08/2026
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EL SELLO SE RESCATA DE VERDAD: el rótulo del Sheet viene con su sangría', () => {
  // EL DEFECTO, medido contra la pestaña viva el 14/08: la API devuelve
  // `"      · (−) lo que ya estaba adentro del conteo — SELLO"` con los seis espacios, y el rescate lo
  // recortaba antes de comparar contra la constante. No coincidía nunca: el mapa salía VACÍO, cada
  // regeneración escribía 0 en el sello, `necesitaSello` daba verdadero siempre y el anexo RESELLABA
  // EN CADA CORRIDA contra el histórico de ese instante. El efectivo publicado volvía al arqueo cada
  // dos horas y un pago en billetes desaparecía adentro del sello: la caja física mintiendo hacia
  // arriba, en silencio. Revertir la normalización de la clave pone esto en rojo.
  const cargado = rescatarAnexo([
    celdas(SELLO_EFECTIVO.sello, { 3: -138242851.2, 5: 46241 }),
    celdas(SELLO_EFECTIVO.estado, { 3: 4320000 }),
    celdas(HISTORICO_EFECTIVO[3].rotulo, { 3: -18773559.7 }),
  ])
  assert.equal(cargado.get(claveDeRotulo(SELLO_EFECTIVO.sello))?.selloNeto, -138242851.2)
  assert.equal(cargado.get(claveDeRotulo(SELLO_EFECTIVO.estado))?.selloValor, 4320000)
  assert.equal(cargado.get(claveDeRotulo(HISTORICO_EFECTIVO[3].rotulo))?.selloLinea, -18773559.7,
    'y el sello DE CADA RENGLÓN, que es lo que dice quién se movió')
})

// EL SELLO POR RENGLÓN SE RETIRA (15/08/2026). Con los seis renglones acotados al instante del conteo,
// su columna D —la foto del histórico COMPLETO al sellar— dejó de significar algo, y peor: el techo la
// restaba. Con ella puesta, el control publicaba techo −$141.300.064 y gritaba "efectivo imposible"
// sobre una caja perfectamente sana. Se emite 0 y la columna queda como testigo del layout, no como
// dato. El sello TOTAL (fila del SELLO) sigue vivo para el caso "conteo nuevo sin sellar".
test('EL SELLO POR RENGLÓN YA NO SE RE-EMITE: con ventana, restarlo rompía el techo', () => {
  const cargado = rescatarAnexo(HISTORICO_EFECTIVO.map((l, i) => celdas(l.rotulo, { 3: -1000 * (i + 1) })))
  const g = grillaAnexo({ refs: REFS, cartera: CARTERA, conceptosCiegos: [], cargado })
  const [f0, f1] = g.filasHistorico
  for (let f = f0; f <= f1; f++) {
    assert.equal(g.filas[f - 1][3], 0, 'la foto del histórico completo ya no vuelve a su celda')
    assert.ok(vacia(String(g.filas[f - 1][4] ?? '')), 'y la columna de pesos sigue vacía: el desglose no suma')
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA FECHA DE LOS DOS CONTEOS — DE ACÁ SALE `CAJA!D7` Y `CAJA!D8` (16/08/2026)
//
// El dueño: *"no completaste las fechas de saldos"*. Estaban vacías desde que él borró la celda donde
// las tipeaba, y él lo hizo a propósito: *"para q no te guíes en eso sino en lo q marca los timestamps
// del código"*. El dato no lo puede calcular Sheets —depende de CUÁNDO cambió una celda—, así que lo
// estampa la corrida desde el centinela y CAJA lo cita por nombre.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LOS DOS RENGLONES DE FECHA DE CONTEO EXISTEN y quedan FUERA de la suma del cajón', () => {
  const g = construir()
  assert.ok(g.fFechaArs > g.fSello && g.fFechaUsd > g.fSello,
    'van DEBAJO del sello: todo lo que esté en la columna C entre el histórico y el sello ENTRA al neto')
  for (const f of [g.fFechaArs, g.fFechaUsd]) {
    for (const c of [2, 3, 4]) {
      assert.ok(vacia(String(g.filas[f - 1][c] ?? '')), `la columna ${c} tiene que estar vacía: no es plata`)
    }
    assert.ok(String(g.filas[f - 1][6] ?? '').length > 40, 'cada renglón dice de dónde sale su número')
  }
  // Y LOS DOS NOMBRES APUNTAN A LA COLUMNA F, que es la única de fechas del anexo. En la E —que va con
  // formato de moneda— el serial 46248 se dibujaría "$46.248".
  const destino = (n) => g.destinos.find((d) => d.name === n)
  assert.equal(destino(ANEXO.conteoArsDia)?.col, 6)
  assert.equal(destino(ANEXO.conteoUsdDia)?.col, 6)
  assert.equal(destino(ANEXO.conteoArsDia)?.fila, g.fFechaArs)
  assert.equal(destino(ANEXO.conteoUsdDia)?.fila, g.fFechaUsd)
})

test('LA FECHA ESTAMPADA SE RESCATA: sin esto, cada regeneración borraría la fecha de CAJA', () => {
  // Es la misma trampa que ya costó el sello y la carga tardía: el valor lo escribe la corrida DESPUÉS
  // de la grilla, así que si la grilla lo emite vacío y el estampado falla (base caída, un 429), la
  // fecha del saldo desaparece de la portada por un problema de infraestructura.
  const cargado = rescatarAnexo([
    celdas(FECHA_DEL_CONTEO.ars, { 5: 46248 }),
    celdas(FECHA_DEL_CONTEO.usd, { 5: 46239 }),
  ])
  assert.equal(cargado.get(claveDeRotulo(FECHA_DEL_CONTEO.ars))?.dia, 46248)
  const g = grillaAnexo({ refs: REFS, cartera: CARTERA, conceptosCiegos: [], cargado })
  assert.equal(g.filas[g.fFechaArs - 1][5], 46248, 'la fecha del conteo en pesos vuelve a su celda')
  assert.equal(g.filas[g.fFechaUsd - 1][5], 46239)
})

test('SIN CONTEO, la celda queda VACÍA — y el nombre se publica igual o CAJA daría #NAME?', () => {
  // Es el estado de los dólares hoy (`CAJA_ARQUEO_USD` = 0). Una fecha ahí afirmaría un arqueo que
  // nunca ocurrió; retirar el nombre dejaría `CAJA!D8` en error. Las dos cosas están declaradas.
  const g = construir()
  assert.ok(vacia(String(g.filas[g.fFechaUsd - 1][5] ?? '')), 'sin conteo no hay fecha que emitir')
  assert.ok(g.destinos.some((d) => d.name === ANEXO.conteoUsdDia), 'y el nombre se publica igual')
  assert.ok(PUEDE_ESTAR_VACIO[ANEXO.conteoUsdDia]?.length > 40, 'con el motivo escrito, no en silencio')
})

test('EL EFECTIVO NO PUEDE PUBLICARSE NEGATIVO: la guarda está en el neto, y el neto es lo que CAJA lee', () => {
  // El 14/08 el neto publicó −$19.371.781,38 sobre un conteo de $4.320.000 y CAJA DISPONIBLE se fue a
  // −$194.181. La fórmula tiene que degradar al conteo (neto 0) cuando el cajón daría negativo — nunca
  // publicar el imposible, que viaja a los dos cash flow, a Postgres y al Director.
  const g = construir()
  const neto = celda(g, g.fNeto, 2)
  const [f0] = g.filasHistorico
  const cajon = `N(CAJA_ARQUEO_ARS)+SUM(C${f0}:C${g.fSello})`
  assert.ok(neto.includes(`(${cajon}<0)`),
    `el neto tiene que degradar a 0 cuando el cajón daría negativo. Es: ${neto}`)
  assert.ok(!neto.includes(','), 'es-AR: separador ; — una coma acá es un decimal, no un argumento')
})

test('NI POSITIVO IMPOSIBLE: el techo entra a la misma guarda que el piso', () => {
  // EL 15/08. La guarda del 14/08 atajaba el cajón negativo y dejaba pasar el inflado, porque era
  // positivo: la pestaña publicó $58.646.092 sobre un conteo de $12.000.000, con las dos líneas que
  // CARGAN el cajón quietas en cero. Un cajón tampoco puede tener MÁS que lo contado más lo que entró.
  const g = construir()
  const neto = celda(g, g.fNeto, 2)
  const [f0] = g.filasHistorico
  const entrada = HISTORICO_EFECTIVO.map((l, i) => (l.entra ? f0 + i : 0)).filter(Boolean)
  assert.deepEqual(entrada.length, 2, 'cobrado en efectivo y extraído del banco son las que cargan')
  for (const f of entrada) {
    // CON VENTANA, `C` YA ES LO QUE ENTRÓ DESPUÉS DEL CONTEO (15/08). Restarle su sello —la foto del
    // histórico completo— lo mandaba a un negativo enorme y el techo dejaba de controlar.
    assert.ok(neto.includes(`+C${f}`), `el techo tiene que sumar lo que entró por la fila ${f}`)
    assert.ok(!neto.includes(`(C${f}-N($D$${f}))`), 'con ventana el techo no resta el sello de su propia fila')
    assert.ok(neto.includes(`ISNUMBER($D$${f})`),
      `sin el sello de la fila ${f} el techo no se puede medir, y un techo inventado no controla nada`)
  }
  // Y el control publicado mide LAS DOS PUNTAS, no sólo la de abajo.
  const control = celda(g, g.fImposible, 4)
  assert.match(control, /MAX\(0;-\(/, 'lo que falta para llegar a cero')
  assert.match(control, /MAX\(0;\(/, 'y lo que sobra por encima del techo')
})

test('EL CONTROL SE PUBLICA CON NOMBRE Y FUERA DEL BLOQUE QUE MIDE', () => {
  const g = construir()
  const f = g.fImposible
  assert.ok(f > g.fSello, 'un control que cae adentro del rango del neto se sumaría a lo que mide')
  assert.ok(vacia(celda(g, f, 2)), 'por eso su columna C va vacía: C entre el histórico y el sello ES el neto')
  const control = celda(g, f, 4)
  assert.match(control, new RegExp(`^=IF\\(NOT\\(ISNUMBER\\(\\$F\\$${g.fSello}\\)\\);0;MAX\\(0;-\\(`),
    'vale 0 cuando el efectivo es posible, y cuelga del SELLO — no de la celda que el dueño puede borrar')
  const destino = g.destinos.find((d) => d.name === ANEXO.efectivoImposible)
  assert.deepEqual({ fila: destino?.fila, col: destino?.col }, { fila: f, col: 5 },
    'CAJA lo lee por nombre: sin publicarlo, la alerta de la portada mira una celda que no existe')
  assert.equal(ESPECIE_ANEXO[ANEXO.efectivoImposible], 'importe')
})

test('EL CONTROL CORRE SIEMPRE Y GRITA POR STDOUT, aunque el sellado se caiga', () => {
  // "Pase lo que pase con el sello": el sellado está envuelto en un `.catch` que lo degrada a aviso, y
  // un control encadenado adentro de ese catch no correría justo el día en que el sello falla. Y el
  // grito tiene que salir por STDOUT: el runner del pipeline escanea la salida estándar buscando la
  // marca de alerta, así que un `console.warn` (stderr) no llega al resumen de la corrida — que es
  // cómo se venían perdiendo estos avisos.
  const src = readFileSync(new URL('../scripts/caja-anexo-pestana.mjs', import.meta.url), 'utf8')
  const sellar = src.indexOf('await sellarConteo(google, g)')
  const controlar = src.indexOf('await controlarEfectivo(google, g)')
  assert.ok(sellar > 0 && controlar > sellar, 'el control va DESPUÉS de sellar, y como sentencia propia')
  const linea = src.slice(controlar).split('\n')[0]
  assert.ok(linea.includes('console.log('), `si ni siquiera se puede controlar, eso también se grita por stdout: ${linea}`)
  assert.ok(!/console\.(warn|error)\(/.test(linea), 'stderr no entra al resumen del pipeline')
})

test('EL ESTADO DEL SELLO DICE CUÁNTO SE MOVIÓ EL HISTÓRICO, no sólo que está vigente', () => {
  // El 14/08 esta fila decía "✓ sellado al conteo del 07/08". Era verdad y el número estaba roto igual:
  // un sello vigente no dice nada del histórico del que depende. Sin el monto movido al lado, la línea
  // es una decoración.
  const g = construir()
  const estado = celda(g, g.fEstado, 2)
  const [f0] = g.filasHistorico
  const movido = `TEXT(SUM(C${f0}:C${g.fSello});"$#,##0")`
  assert.ok(estado.includes(movido), 'el movimiento desde el sello, dibujado')
  // Y —lo que importa— EN EL BRAZO SANO. El 14/08 el sello estaba vigente: si el monto movido sólo
  // apareciera en el brazo de la alerta, la línea que el dueño lee todos los días seguiría siendo un ✓
  // mudo hasta que fuera demasiado tarde.
  assert.ok(estado.includes(`"✓ sellado al conteo del "&TEXT(N($F$${g.fSello});"dd/mm HH:mm")&" · el histórico se movió "&${movido}`),
    `el estado SELLADO tiene que decir cuánto se movió el histórico. Es: ${estado}`)
  assert.match(estado, /IMPOSIBLE/, 'y el estado imposible se nombra con todas las letras')
  assert.match(estado, /✓ sellado al conteo del/, 'sin perder el estado sano')
  assert.ok(!estado.replace(/"[^"]*"/g, '""').includes(','), 'es-AR: separador ; fuera de los textos')
})

test('la nómina en efectivo DESCARGA la caja física y la de banco NO: son canales distintos', () => {
  // El dueño, sobre el 31/07: cobranzas en efectivo, compras, y jornales pagados 50% en efectivo y 50%
  // por transferencia. Ni una mitad ni la otra bajaba ninguna disponibilidad: la nómina no es una compra
  // ni un cheque. La plata se pagaba y no salía de la pestaña.
  const g = construir()
  const efvo = celda(g, filaDe(g, /jornales pagados en efectivo — desde el conteo/i), 2)
  assert.match(efvo, /JORNALES_REAL_ADELANTO/)
  assert.match(efvo, /JORNALES_REAL_RECIBO/)
  assert.ok(!efvo.includes('JORNALES_REAL_BANCO'), 'lo que salió por banco no puede salir también del cajón')
  const bco = celda(g, filaDe(g, /jornales pagados por transferencia después del corte/i), 2)
  assert.match(bco, /JORNALES_REAL_BANCO/)
  assert.ok(!/ADELANTO|RECIBO/.test(bco), 'lo que salió en billetes no puede salir también del banco')
})

test('la oficina DESCARGA los dos canales, cada uno del suyo', () => {
  const g = construir()
  const bco = celda(g, filaDe(g, /sueldos de OFICINA por transferencia/i), 2)
  assert.match(bco, /OFICINA_BANCO/)
  assert.ok(!bco.includes('OFICINA_EFECTIVO'), 'lo que salió en billetes no puede salir también del banco')
  const efvo = celda(g, filaDe(g, /sueldos de OFICINA en efectivo/i), 2)
  // El efectivo sale POR DIFERENCIA (Pagado − Banco): así los dos canales suman siempre lo pagado.
  assert.match(efvo, /N\(OFICINA_PAGADO\)-N\(OFICINA_BANCO\)/)
  assert.match(efvo, /ISNUMBER\(OFICINA_BANCO\)/, 'con la celda vacía no se asume "todo efectivo"')
})

test('la extracción SUMA al cajón — es el espejo del depósito, que resta', () => {
  // La caja física sólo sabía BAJAR hacia el banco y nunca subir desde él: una asimetría que sólo puede
  // dar de menos.
  const g = construir()
  const c = celda(g, filaDe(g, /extraído del banco — desde el conteo/i), 2)
  assert.match(c, /extraccion/)
  assert.ok(!/^=-\(/.test(c), 'la extracción CARGA la caja: no lleva signo negativo')
})

test('el neto de efectivo incorpora la nómina y la oficina VÍA SU DESGLOSE: suma los renglones a la vista', () => {
  // Antes el neto era una megafórmula que repetía los seis términos; hoy es la SUMA del desglose (los
  // términos viven una sola vez, en sus renglones). El invariante es el mismo: la nómina en billetes y
  // la oficina DESCARGAN la caja física, y los dólares no entran al cajón de pesos.
  const g = construir()
  const [f0, f1] = g.filasHistorico
  const bloque = g.filas.slice(f0 - 1, f1).map((f) => String(f?.[2] ?? '')).join('\n')
  assert.match(bloque, /JORNALES_REAL_ADELANTO/, 'el desglose que el neto suma resta la nómina en billetes')
  assert.match(bloque, /OFICINA_PAGADO/, 'y los sueldos de oficina')
  // Y el cajón de PESOS no se come los dólares: U$S 15.000 entrando como $15.000 es el importe correcto
  // en la moneda equivocada, que no da error y está mal por dos órdenes de magnitud.
  assert.match(bloque, /"<>USD"/, 'la línea de pesos excluye explícitamente los cobros en dólares')
  assert.equal(filaDe(g, /NETO de efectivo posterior al arqueo/i), g.fNeto, 'el neto vive donde el nombre lo publica')
})

test('el canal no declarado se NOMBRA, no se adivina', () => {
  const g = construir()
  const monto = celda(g, filaDe(g, /sin declarar por qué canal/i), 2)
  assert.match(monto, /OFICINA_PAGADO/)
  assert.match(monto, /\(1-ISNUMBER\(OFICINA_BANCO\)\)/, 'sólo los meses SIN canal declarado')
  // Y no se reparte mitad y mitad porque suele ser así: eso sería fabricar el dato.
  assert.ok(!/0[,.]5|\/2/.test(monto))
})

test('las filas de oficina se llaman OFICINA, no administración', () => {
  // Son dos grupos con dos criterios distintos: **oficina son 2 empleados, 50% banco y 50% efectivo;
  // administración cobra TODA por banco.** Con el rótulo viejo, una diferencia de oficina se lee como un
  // faltante de administración y manda a buscar a un cuadro donde no está.
  const g = construir()
  const mal = g.filas.map((f) => String(f?.[0] ?? '')).filter((t) => /sueldos de administraci[oó]n/i.test(t))
  assert.deepEqual(mal, [], 'ninguna fila que lee OFICINA_* puede llamarse "de administración"')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA CARTERA — EL CANARIO Y EL CONTROL CONTRA OTRA FUENTE
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('cada valor en cartera trae su importe por FÓRMULA, no pegado', () => {
  // Acá se pegaba `e.importe` desde un array escrito a mano. Por eso CAJA mostraba $10.000.000 de
  // cartera teniendo $10.290.000: entró el cheque 514 a la base y a la réplica, y la celda siguió
  // mostrando lo de la semana pasada sin dar un solo error.
  const g = construir()
  const f = filaDe(g, /^Cheque 00000514/)
  assert.ok(f > 0, 'el detalle tiene que listar el cheque')
  assert.match(celda(g, f, 2), /^=SUMIFS/, 'el importe le pregunta a la réplica por SU cheque')
  assert.match(celda(g, f, 5), /^=IF\(COUNTIFS/, 'y la fecha también, devolviendo "" si el cheque no está')
})

test('el endosado se ve y NO suma: son los $20.000.000 que el cuadro creía tener', () => {
  const g = construir()
  const f = filaDe(g, /YA NO ES NUESTRO/)
  assert.ok(f > 0, 'un cheque endosado tiene que quedar a la vista')
  assert.ok(vacia(celda(g, f, 2)), 'pero sin importe: esa plata se le entregó a un tercero')
})

test('EL CONTROL DE LA CARTERA MIRA OTRA FUENTE QUE EL TOTAL, o no controla nada', () => {
  // El total sale de la réplica del banco; esta línea le pregunta lo mismo a COBRANZAS. Cobranzas sabe
  // que el echeq se cobró —y es cierto— pero no sabe qué pasó DESPUÉS con el valor: eso sólo lo sabe el
  // banco. La diferencia son cheques que se endosaron para pagarle a alguien.
  const g = construir()
  const fCtrl = filaDe(g, /Control: qué dice Cobranzas/)
  assert.match(celda(g, fCtrl, 2), /Cobranzas!/, 'el control tiene que salir de Cobranzas')
  assert.match(celda(g, g.fDifCartera, 2), new RegExp(DESDE_CAJA.cartera), 'y restarse contra el total de CAJA, por nombre')
  assert.ok(!celda(g, fCtrl, 2).includes('_CHEQUES_RAW'),
    'si el control saliera de la misma réplica que el total, daría cero por construcción')
})

test('el canario compara el detalle escrito contra la fuente viva', () => {
  // Las filas del detalle las escribe el generador; el total es una fórmula viva. Si entra un cheque y
  // el anexo no se regenera, el detalle listaría uno menos y NADIE lo vería: el total seguiría bien.
  const g = construir()
  const f = filaDe(g, /¿el detalle está al día\?/)
  assert.ok(f > 0)
  const v = celda(g, f, 6)
  assert.match(v, /COUNTIFS/, 'cuenta cuántos hay de verdad')
  assert.match(v, /▲/, 'y avisa cuando no coinciden')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS CONTROLES DEL CALENDARIO — EL RIESGO DECLARADO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EL RIESGO DECLARADO: si cheques-cobertura no corrió, la pestaña lo dice en vez de mostrar $0', () => {
  // El término de cheques del calendario lee la MARCA que escribe `cheques-cobertura`. Si ese agente no
  // corrió, la columna está vacía, el término da $0 y el piso SUBE sin que se haya pagado nada — el mismo
  // modo de falla, "cero sin avisar", que este trabajo entero vino a matar.
  const g = construir()
  const f = filaDe(g, /riesgo: cheques no debitados SIN marca/i)
  assert.ok(f > 0, 'el control de cobertura tiene que existir')
  assert.match(celda(g, f, 3), new RegExp(`\\$M\\$${FILA_DATO0}:\\$M\\$400=""`), 'cuenta los cheques que todavía no tienen marca')
  assert.match(celda(g, f, 3), /<>"SI"/, 'entre los NO debitados: un cheque ya debitado no le importa al calendario')
})

test('el riesgo de los no marcados se parte en "falta correr el agente" y "falta el dato"', () => {
  // Eran $38.377.479 en un solo renglón rojo. Medido: el 90,6% sólo necesitaba que corriera el agente y
  // el 9,4% que una persona cargara el N° de comprobante. Verlos juntos hacía leer un agujero de $38,4M
  // donde el trabajo humano pendiente era $3,6M.
  const g = construir()
  const con = celda(g, filaDe(g, /con N° de comprobante ya cargado/i), 3)
  const sin = celda(g, filaDe(g, /SIN N° de comprobante/i), 3)
  assert.ok(con && sin, 'el riesgo volvió a ser un solo renglón inaccionable')
  for (const f of [con, sin]) {
    assert.match(f, new RegExp(`\\$M\\$${FILA_DATO0}:\\$M\\$400=""`))
    assert.match(f, new RegExp(`UPPER\\('Cheques Emitidos'!\\$K\\$${FILA_DATO0}:\\$K\\$400\\)<>"SI"`))
    assert.match(f, new RegExp(`\\$H\\$${FILA_DATO0}:\\$H\\$400`), 'la partición tiene que mirar la columna del N° de comprobante')
  }
  // Complementarios: si los dos usaran la misma condición, uno sería siempre cero y nadie se enteraría.
  assert.notEqual(con, sin)
  assert.ok(sin.includes('(1-('), 'el renglón "sin N°" tiene que ser la negación del otro')
})

test('LO QUE EL CALENDARIO EXCLUYE A PROPÓSITO SE PUBLICA CON SU MONTO', () => {
  // Una exclusión invisible es indistinguible de un olvido. Los $12.188.441 de cheques ya debitados se
  // dejan afuera porque el saldo del banco ya los tiene descontados — y eso tiene que poder leerse, con
  // su número, al lado del control hermano que mide los sin marca.
  const g = construir()
  const f = filaDe(g, /ya debitados y sin factura/)
  assert.ok(f > 0, 'la exclusión tiene que estar declarada')
  const v = celda(g, f, 3)
  assert.ok(v.includes('="SI"'), 'mide justamente los DEBITADOS, que es lo que el término excluye')
  assert.ok(v.includes(MARCAS.falta), 'y sólo los que no tienen factura en Compras')
})

test('los conceptos sin fuente con fecha se NOMBRAN, con su cero declarado', () => {
  // Un cero con nombre es una limitación conocida; un cero mudo es un bug. Los tres valen cero porque el
  // banco los debita solo, sin factura, y su único registro es el extracto — que sólo cubre el pasado.
  const g = construir()
  const f = filaDe(g, /concepto\(s\) del cash flow sin fuente con fecha/)
  assert.ok(f > 0, 'el control tiene que existir')
  assert.equal(g.filas[f - 1][3], 0, 'el monto declarado es cero, escrito')
  for (const n of ['descubierto', 'Comisiones', 'Impuesto al cheque']) {
    assert.ok(celda(g, f, 6).includes(n), `el control tiene que nombrar "${n}"`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// VENCIDO SIN CONCILIAR Y TRAZABILIDAD
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EL CERO DEL BLOQUE DE VENCIDOS NO PUEDE QUEDAR MUDO', () => {
  // "Está todo conciliado" y "hace tres semanas que nadie carga un movimiento" se dibujan igual.
  const g = construir()
  const f = filaDe(g, /¿el cero es real\?/)
  assert.ok(f > 0)
  const dicta = celda(g, f, 6)
  const fUlt = filaDe(g, /Último cobro efectivamente registrado/)
  assert.ok(fUlt > 0, 'sin la fecha del último cobro no se puede distinguir orden de silencio')
  assert.ok(dicta.includes(`$F$${fUlt}`), 'el veredicto tiene que MIRAR esa fecha')
  assert.ok(dicta.includes('TODAY()-$F$'), 'y medir cuántos días pasaron')
  assert.ok(dicta.includes('NOT(ISNUMBER('), 'y si Cobranzas no tiene ninguna fecha usable, tampoco festeja')
})

test('los estados de Cobranzas NO se suman entre sí en el cuadro de vencidos', () => {
  // Un "Pendiente" vencido (factura emitida que no entró) se RECLAMA; un "Proyectado" vencido (una fecha
  // estimada que no se cumplió) se REPROYECTA. Sumarlos en una fila borra la diferencia.
  const g = construir()
  const filas = g.filas.filter((f) => /^Cobros en "/.test(String(f?.[0] ?? ''))).map((f) => String(f[2]))
  assert.equal(filas.length, 3, 'una fila por estado esperado: Pendiente, Facturado, Proyectado')
  for (const f of filas) {
    const cuantos = ['Pendiente', 'Proyectado', 'Facturado', 'Cobrado', 'CANCELAR'].filter((e) => f.includes(`="${e}"`))
    assert.equal(cuantos.length, 1, `una fila suma ${cuantos.length} estados: ${cuantos.join('+')}`)
  }
})

test('la trazabilidad es la IDENTIDAD COMPLETA: cobrado = depositado + gastado + cajón vivo', () => {
  // La ventana fosilizada (22/06–22/07, constantes de la captura) más los depósitos SIN ventana y
  // NINGÚN término de gasto publicaron $12,2M "sin explicar" que eran plata gastada y registrada
  // (dictamen 07/08). Ahora todo va a historia completa hasta HOY y la resta la cierra el cajón VIVO.
  const g = construir()
  const cob = celda(g, filaDe(g, /Cobrado en EFECTIVO — historia completa/), 4)
  const dep = celda(g, filaDe(g, /Depositado en efectivo al banco — historia completa/), 4)
  const gasto = celda(g, filaDe(g, /Pagado en efectivo — Compras/), 4)
  const cajon = celda(g, filaDe(g, /Efectivo en el cajón HOY/), 4)
  const sinExpl = celda(g, filaDe(g, /⇒ EFECTIVO SIN EXPLICAR/), 4)
  // Sin fechas clavadas: la única cota temporal es HOY (un "Cobrado" con fecha futura no es billete).
  assert.ok(![...cob.matchAll(/DATE\(\d+;\d+;\d+\)/g)].length, 'la ventana fosilizada volvió')
  assert.match(cob, /"Cobrado"/)
  assert.match(cob, /<=TODAY\(\)/)
  assert.ok(dep.includes('_BANCO_RAW'), 'los depósitos salen del extracto, no de un número pegado')
  // El gasto: Compras por MONTO PAGADO (los parciales también salieron) + jornales + oficina por caja.
  assert.match(gasto, /'Compras'!\$P\$4:\$P="Efectivo"/)
  assert.match(gasto, /N\('Compras'!\$T\$4:\$T\)/)
  // El cajón VIVO (arqueo ± posteriores), el mismo número de CAJA!B7 — no el arqueo crudo.
  assert.match(cajon, /N\(CAJA_ARQUEO_ARS\)\+N\(ANEXO_EFECTIVO_NETO\)/)
  // Y la identidad usa los SEIS términos: cobrado − duplicado + extraído − depositado − gastado − cajón.
  const ext = celda(g, filaDe(g, /Extraído del banco en efectivo/), 4)
  assert.ok(ext.includes('_BANCO_RAW'), 'las extracciones salen del extracto')
  assert.match(sinExpl, /^=E\d+-E\d+\+E\d+-E\d+-E\d+-E\d+$/)
})

test('la alerta de efectivo sin explicar cierra contra el CAJÓN VIVO, no el arqueo crudo', () => {
  // Con la identidad a historia completa (dictamen 07/08), lo que cierra la resta es lo que HAY hoy
  // en la caja física — arqueo ± movimientos posteriores, el mismo número de CAJA!B7 —, y ambos
  // términos van POR NOMBRE para sobrevivir a cualquier compactación del anexo.
  const g = construir()
  const f = filaDe(g, /^Efectivo en el cajón HOY/)
  assert.ok(f > 0)
  assert.match(celda(g, f, 4), /N\(CAJA_ARQUEO_ARS\)\+N\(ANEXO_EFECTIVO_NETO\)/)
  // Y LA FECHA VA GUARDADA CON ISNUMBER: `=CAJA_ARQUEO_ARS_FECHA` sobre una celda vacía devuelve 0, y el
  // 0 con formato de fecha se dibuja "30/12/1899". Es el defecto `fecha_cero` del auditor de pantalla.
  assert.match(celda(g, f, 5), /^=IF\(ISNUMBER\(/, 'una fecha vacía no puede dibujarse como 30/12/1899')
})

test('NINGUNA celda de fecha se escribe como una referencia cruda: el serial 0 es 30/12/1899', () => {
  // El auditor de pantalla lo reportaba como `fecha_cero`. La causa es siempre la misma: `=X` donde X
  // puede estar vacío devuelve 0, y 0 con formato de fecha es el 30 de diciembre de 1899.
  const g = construir()
  for (const [i, fila] of g.filas.entries()) {
    const v = String(fila?.[5] ?? '')
    if (!v.startsWith('=')) continue
    assert.ok(/ISNUMBER|IFERROR|TODAY|COUNTIFS|SUMIFS|MAX|""/.test(v),
      `fila ${i + 1}: la fecha "${v}" no está guardada — si la fuente está vacía va a dibujar 30/12/1899`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CONTRATO DE NOMBRES — LO QUE HACE POSIBLE LA MUDANZA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('todos los nombres que CAJA cita se publican, y cada uno declara su especie', () => {
  // `rangos-nombrados.mjs` relee cada celda después de publicar y compara contra la ESPECIE prometida:
  // un nombre publicado sobre una celda vacía o sobre un texto es el defecto que dejó
  // `ARCA_COMPRAS_TOTAL` devolviendo un número de comprobante. Sin especie declarada, no se verifica.
  const g = construir()
  const publicados = new Set(g.destinos.map((d) => d.name))
  for (const n of Object.values(ANEXO)) {
    assert.ok(publicados.has(n), `${n} lo cita CAJA y el anexo no lo publica: quedaría en #NAME?`)
  }
  for (const d of g.destinos) {
    assert.ok(Number.isFinite(d.fila) && d.fila >= 1, `${d.name} apunta a una fila inválida`)
    // LA EXCEPCIÓN ES NOMINAL Y TRAE SU MOTIVO ESCRITO. Un nombre cuya celda puede estar legítimamente
    // vacía no puede declarar especie —`publicar` descartaría el destino y el nombre no se crearía,
    // dejando #NAME? en CAJA—, así que la regla se relaja SÓLO para los que están en la lista.
    const excusa = PUEDE_ESTAR_VACIO[d.name]
    if (excusa) {
      assert.ok(excusa.length > 40, `${d.name} está exceptuado sin explicar por qué`)
      assert.ok(!(d.especie ?? ESPECIE_ANEXO[d.name]),
        `${d.name} puede estar vacío Y declara especie: publicar lo descartaría y el nombre no existiría`)
      continue
    }
    assert.ok(d.especie ?? ESPECIE_ANEXO[d.name], `${d.name} se publica sin declarar especie: no se puede verificar`)
    // Y la celda a la que apunta tiene que tener ALGO: un nombre sobre una celda vacía es tan mudo como
    // uno sobre un texto, y la API lo acepta con un 200.
    const v = g.filas[d.fila - 1]?.[d.col - 1]
    assert.ok(v !== undefined && !vacia(v), `${d.name} apunta a una celda vacía (fila ${d.fila}, col ${d.col})`)
  }
})

test('el anexo NUNCA cita a CAJA por celda: sólo por rango con nombre', () => {
  // Es la propiedad entera de este rediseño. Un intento anterior no movió el anexo porque los bloques de
  // arriba lo referenciaban por celda; si el anexo volviera a citar `Caja!$E$12`, la mudanza se
  // desharía sola en la primera corrida que mueva una fila.
  const g = construir()
  for (const [i, fila] of g.filas.entries()) {
    for (const c of fila) {
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      assert.ok(!/'?Caja'?!\$?[A-Z]/.test(s), `fila ${i + 1}: el anexo cita a CAJA por celda:\n  ${s.slice(0, 120)}`)
    }
  }
})

test('ninguna fórmula del anexo usa la coma como separador de ARGUMENTOS (es_AR usa `;`)', () => {
  const g = construir()
  for (const [i, fila] of g.filas.entries()) {
    for (const [j, c] of fila.entries()) {
      if (j >= ANCHO_ANEXO - 1) continue
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      const sospechosas = s.replace(/"[^"]*"/g, '""').replace(/(?<=\d),(?=\d)/g, '')
      assert.doesNotMatch(sospechosas, /,/, `fila ${i + 1} col ${j}: coma entre argumentos → #ERROR! en es-AR:\n  ${s}`)
    }
  }
})

test('la celda de CARGA del anexo sale AUSENTE cuando no se leyó nada', () => {
  // El "Dólar declarado" es lo único que una persona escribe acá. Una celda AUSENTE la preserva la
  // fusión; el centinela VACIO la BORRARÍA. La diferencia ya borró el conteo del dueño una vez.
  const g = construir()
  for (const col of [2, 5]) {
    assert.equal(g.filas[g.fDec - 1][col], undefined, 'sin dato no se sobrescribe: es el lado seguro')
  }
})

test('con el dólar declarado ya cargado, se RE-EMITE en su fila nueva', () => {
  const cargado = new Map([['Dólar declarado por la empresa (opcional)', { saldo: 1450, fecha: 46233, origen: 'banco' }]])
  const g = grillaAnexo({ refs: REFS, cartera: CARTERA, conceptosCiegos: [], cargado })
  assert.equal(g.filas[g.fDec - 1][2], 1450, 'el valor tiene que viajar con su bloque')
  assert.equal(g.filas[g.fDec - 1][5], 46233)
})


test('TEXTO EN UNA COLUMNA DE PLATA: sólo los encabezados que el formateador declara', () => {
  // Mismo invariante que CAJA. El formateador del anexo ubica sus encabezados por el rótulo de la
  // columna A y les devuelve el formato de TEXTO; cualquier otra constante en C, D o E se dibuja con
  // formato de moneda y hace desconfiar de la fila entera. La regex es la MISMA que la del formateador:
  // si alguien agrega un encabezado con otro rótulo, esto se pone rojo en vez de salir mal dibujado.
  const g = construir()
  const ES_CABECERA = /^(Concepto|Línea|Valor|Qué|Horizonte)/
  for (const [i, f] of g.filas.entries()) {
    for (const col of [2, 3, 4]) {
      const v = f[col]
      if (typeof v !== 'string' || vacia(v) || v.startsWith('=') || !Number.isNaN(Number(v))) continue
      assert.match(String(f[0] ?? ''), ES_CABECERA,
        `fila ${i + 1} col ${String.fromCharCode(65 + col)}: "${v}" es texto en una columna de plata fuera de un encabezado`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA FECHA DEL ÚLTIMO MOVIMIENTO DE EFECTIVO — DE ACÁ SALE `CAJA!D7` (24/08/2026)
//
// El dueño: *"la fila 7 q marca el efectivo disponible me confunde con la fecha del saldo porque se
// realizaron cobranzas en efectivo y pagos pero no me indica la fecha del ultimo movimiento de
// efectivo"*. El neto se movía con seis fuentes y la fecha se quedaba en el conteo.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EL RENGLÓN DE LA FECHA DEL ÚLTIMO MOVIMIENTO usa EL MISMO ANCLA que los seis del histórico', () => {
  const g = construir()
  const f = g.fUltimoEfectivo
  assert.ok(f > g.fSello, 'va DEBAJO del sello: en la columna C entre el histórico y el sello todo ENTRA al neto')
  // EL DEFECTO QUE ATRAPA: si la fecha se anclara en otra celda que el importe, publicaría una ventana
  // distinta de la que suma — un saldo nuevo con fecha vieja, o frescura por plata no contada.
  assert.ok(celda(g, f, 5).includes(`$F$${g.fSello}`),
    'el ancla es el INSTANTE sellado, el mismo que reciben los seis renglones del neto')
  // Y EL PISO ES EL DÍA QUE CAJA MUESTRA, no INT del instante: el instante puede caer del otro lado de
  // la medianoche y publicaría un día que el conteo no tuvo (ver diaDelConteo).
  assert.ok(celda(g, f, 5).includes(`MAX(${ANEXO.conteoArsDia};`))
  assert.ok(!celda(g, f, 5).includes(`MAX(INT($F$${g.fSello});`))
  // Las columnas de plata quedan vacías: no es plata, y en la E heredaría formato de moneda.
  for (const c of [2, 3, 4]) assert.ok(vacia(celda(g, f, c)), `la columna ${c} no lleva nada: no es plata`)
  assert.ok(FECHA_ULTIMO_EFECTIVO.origen.length > 40, 'el renglón dice de dónde sale su número')
})

test('el nombre que CAJA cita para la fecha del saldo apunta a la COLUMNA F de ese renglón', () => {
  const g = construir()
  const d = g.destinos.find((x) => x.name === ANEXO.ultimoEfectivoDia)
  assert.equal(d?.fila, g.fUltimoEfectivo)
  assert.equal(d?.col, 6, 'la F es la única columna de fechas del anexo: en la E se dibujaría "$46.248"')
  // Va sin especie y con su excusa escrita, como las otras dos fechas: `publicar` con especie
  // declarada descarta el destino vacío y CAJA quedaría en #NAME?.
  assert.ok(!(d?.especie ?? ESPECIE_ANEXO[ANEXO.ultimoEfectivoDia]))
  assert.ok(PUEDE_ESTAR_VACIO[ANEXO.ultimoEfectivoDia]?.length > 40, 'con el motivo escrito, no en silencio')
})

test('el control "Efectivo en el cajón HOY" fecha con LO MISMO que CAJA!D7 — una plata, una fecha', () => {
  const g = construir()
  const f = filaDe(g, /^Efectivo en el cajón HOY/)
  assert.ok(f > 0, 'el renglón existe')
  // Muestra EXACTAMENTE el mismo número que la fila 7 de CAJA. Si cada uno armara su fecha, el archivo
  // tendría dos fechas para la misma plata — el defecto de este cambio, en chico.
  assert.equal(celda(g, f, 5),
    `=IF(ISNUMBER(${ANEXO.conteoArsDia});IF(ISNUMBER(${ANEXO.ultimoEfectivoDia});${ANEXO.ultimoEfectivoDia};${ANEXO.conteoArsDia});"")`)
})
