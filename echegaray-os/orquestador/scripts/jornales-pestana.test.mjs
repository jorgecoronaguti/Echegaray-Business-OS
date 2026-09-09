// LO QUE SE PRUEBA ACÁ ES QUE EL CUADRO NO PUEDA VOLVER A CONGELARSE, Y QUE NINGUNA FÓRMULA APUNTE A
// LA COLUMNA DE AL LADO.
//
// Las dos formas concretas en que esta pestaña ya falló:
//   1. Un texto estampado en la corrida ("cargada hasta el 21/07") que se lee como si fuera de hoy.
//   2. Una letra de columna copiada de OTRO layout. La fila 4 de la pestaña viva usa
//      `MAXIFS($B:$B;$K:$K;">0")` y anda bien: ahí la K es el TOTAL. En el layout de este generador
//      la K es "Σ $/hora" —siempre distinta de cero—, así que la misma fórmula copiada al pie de la
//      letra contesta otra pregunta SIN dar un solo error.
import test from 'node:test'
import assert from 'node:assert/strict'
import { colDe, grilla, ultimoDiaCargado, rangosDeJornales, RANGOS_RETIRADOS, ubicarParametros } from './jornales-pestana.mjs'
import { PARAMETROS_JORNADA } from '../lib/jornada-uocra.mjs'
import {
  repartoQuincena, repartoPersona, filasDePersonas, ACUERDO_BANCO,
  canalesProyectados, DIRECCION_POR_BANCO,
} from '../lib/jornales-reparto-pago.mjs'
import { verificarRangos, explicarProblemas } from '../lib/rangos-con-nombre.mjs'
import { VACIO, tiene } from '../lib/preservar-anotaciones.mjs'

// Bloques mínimos con la forma que `filasQuincenas` y el cuadro de oficina esperan.
const bloques = [
  { filaFecha: 6, inicio: 7, fin: 20 },
  { filaFecha: 30, inicio: 31, fin: 44 },
]
const pendientes = [{ desde: new Date(2026, 7, 1) }, { desde: new Date(2026, 7, 16) }]
const bloquesOfi = [{ mes: 6, inicio: 5, fin: 8 }, { mes: 7, inicio: 12, fin: 15 }]
const g = grilla({ bloques, pendientes, bloquesOfi })
const colA = g.filas.map((f) => String(f[0] ?? ''))

// EL ORÁCULO ES EL ENCABEZADO QUE LA GRILLA ESCRIBE DE VERDAD, NO UNA LETRA COPIADA ACÁ.
//
// La versión anterior de estos tests clavaba 'J' porque el registro tenía doce columnas. Al entrar
// "Se paga el" y "Pagado el" pasó a catorce y el TOTAL se corrió a la K — y los tests se pusieron
// rojos afirmando una letra que ya no era. Clavar la letra en el test reproduce, del lado del
// control, exactamente el defecto que el control existe para atrapar. Se lee de la fila que la
// grilla emitió: si una fórmula apunta a la columna de al lado, sigue saltando.
const encabezado = g.filas.find((f) => f[0] === 'Desde' && f[1] === 'Hasta' && f.includes('Total'))
const letraDe = (rotulo) => String.fromCharCode(65 + encabezado.indexOf(rotulo))

test('cada letra sale del encabezado real del registro, no de otro layout', () => {
  // Si alguien copia una fórmula de la pestaña viva —o de una versión anterior de este generador—
  // con la letra puesta a mano, apunta a otra columna y devuelve un número plausible y equivocado.
  assert.ok(encabezado, 'no está el encabezado del registro')
  for (const rotulo of ['Desde', 'Hasta', 'Total', '$/hora', 'Pagado el']) {
    assert.equal(colDe(rotulo), letraDe(rotulo), `"${rotulo}": colDe y el encabezado no coinciden`)
  }
  // Y las dos que más se confunden entre sí no pueden ser la misma columna.
  assert.notEqual(colDe('Total'), colDe('$/hora'))
})

test('una columna que ya no existe GRITA, no cae a un default', () => {
  assert.throws(() => colDe('Hs extra'), /no tiene la columna/)
})

test('el subtítulo es una fórmula viva y no trae ninguna fecha estampada', () => {
  const subtitulo = String(g.filas[1][0])
  assert.ok(subtitulo.startsWith('='), `el subtítulo quedó como texto: ${subtitulo.slice(0, 60)}`)
  assert.doesNotMatch(subtitulo.replace(/"dd\/mm\/yyyy"/g, ''), /\d{1,2}\/\d{1,2}\/\d{2,4}/)
})

test('la frescura sale del importe cargado, no del encabezado de la quincena', () => {
  // El defecto: la planilla escribe la fila de la quincena —con su "Hasta"— el día que la abre,
  // catorce días antes de que tenga un peso adentro. Un MAX sobre las fechas declara frescura por
  // un encabezado vacío.
  const subtitulo = String(g.filas[1][0])
  const T = letraDe('Total'); const H = letraDe('Hasta')
  assert.match(subtitulo, new RegExp(`MAXIFS\\(\\$${H}\\$\\d+:\\$${H}\\$\\d+;\\$${T}\\$\\d+:\\$${T}\\$\\d+;">0";\\$${H}\\$\\d+:\\$${H}\\$\\d+;"<="&TODAY\\(\\)\\)`),
    `la frescura no está condicionada al TOTAL (columna ${T}): ${subtitulo.slice(0, 120)}`)
})

test('hasta dónde llega el registro se dice UNA vez, en el subtítulo, y por FÓRMULA', () => {
  // Era `cargada hasta el ${cargaAlDia}`, medido en JS sobre las horas del espejo: honesto el día que
  // se escribía y congelado a partir del siguiente. Y estaba DOS veces —en el subtítulo y al lado del
  // titular—, donde la copia quedaba tapada por el propio titular en cuerpo 13. Ahora vive sólo en la
  // fila 2, que es donde la gramática pone la fecha de corte de una pestaña.
  const subtitulo = String(g.filas[1][0] ?? '')
  assert.ok(subtitulo.startsWith('='), `el subtítulo volvió a ser texto estampado: ${subtitulo}`)
  assert.match(subtitulo, /MAXIFS\(/)
  assert.doesNotMatch(subtitulo, /\d{1,2}\/\d{1,2}(\/\d{2,4})?"/, 'hay una fecha estampada en el subtítulo')
  // La parte que medía «no hay prosa adentro del hero» se fue con el hero (09/09/2026). Lo que la
  // reemplaza es más fuerte y mira la pestaña entera, no un cuadro: `pestanas-sin-prosa.test.mjs`.
})

test('los rangos del registro son CERRADOS y arrancan donde arranca el registro', () => {
  // Abierto (`$B$83:$B`) barrería la proyección y la nómina de oficina, que también tienen fechas en
  // la columna B y hablan de otra cosa. La fila de arranque sale de DÓNDE ESTÁ el encabezado del
  // registro, no del número de sección: la sección se movió de la 4 a la 5 al entrar el bloque de
  // Dirección, y anclar en "4 · " habría medido otro bloque sin dar un solo error.
  const f0 = g.filas.indexOf(encabezado) + 2 // 1-based, y la primera fila va después del encabezado
  const subtitulo = String(g.filas[1][0])
  const H = letraDe('Hasta')
  assert.match(subtitulo, new RegExp(`\\$${H}\\$${f0}:\\$${H}\\$${f0 + bloques.length - 1}`),
    `el rango del registro no coincide con el layout (arranca en ${f0})`)
})

test('el registro conserva su encabezado completo: es el contrato de las letras', () => {
  assert.ok(encabezado, 'no está el encabezado del registro')
  assert.equal(encabezado[colDe('Total').charCodeAt(0) - 65], 'Total')
  assert.equal(encabezado.length, colA.length && encabezado.length, 'el encabezado no puede venir recortado')
})

test('el último día cargado del espejo se saca del MÁXIMO, no de la última celda', () => {
  // Las filas de fecha tienen huecos (feriados, días sin cuadrilla) y vienen desordenadas.
  const d = ultimoDiaCargado(['5/1', '9/1', '6/1', '', '7/1'], 2026)
  assert.equal(d.getDate(), 9)
  assert.equal(d.getMonth(), 0)
})

// ═══ LOS RANGOS CON NOMBRE, CONTRA LA GRILLA QUE LA PESTAÑA ESCRIBE DE VERDAD (03/08) ═══
//
// El defecto que trajo este bloque: de los 47 rangos con nombre del archivo, TRES apuntaban a celdas
// sin un solo dato — y `SUMPRODUCT(…*N(RANGO))` sobre celdas vacías vale 0, así que las dos líneas de
// sueldos de administración de CAJA decían $0 con el cuadro cuadrando. Ningún error, ningún descuadre.
//
// El oráculo NO es una lista de filas escrita acá: es la grilla que `grilla()` acaba de armar. Clavar
// las coordenadas en el test reproduciría, del lado del control, exactamente el defecto que el control
// existe para atrapar — que es la razón por la que estos tests leen el encabezado y no una letra.
test('NINGÚN RANGO CON NOMBRE APUNTA A CELDAS VACÍAS NI A LA COLUMNA DE AL LADO', () => {
  const problemas = verificarRangos(g.filas, rangosDeJornales(g))
  assert.deepEqual(problemas, [], explicarProblemas(problemas))
})

test('LA COLUMNA "Banco" DE OFICINA ES DEL GENERADOR: ninguna celda queda abierta a otro cuadro', () => {
  // ═══ EL DEFECTO QUE ESTE TEST FIJA, MEDIDO EN LA PESTAÑA VIVA (14/08) ═══
  //
  // La columna nació como carga del dueño (01/08) y los meses sin bloque iban con `''` = "no es mía,
  // preservá lo que haya". Desde que el generador la lee de la W de `_J_OFICINA` es DERIVADA, y ese
  // `''` dejó de proteger un dato para proteger basura: mayo–agosto quedaron con las ventanas del
  // CALENDARIO (`=SUMIFS($H$79:$H$90;…)`) y diciembre con `=SUM(F$36:F$47)` —un total adentro del
  // cuerpo de la tabla— que la fila de total volvía a sumar. El canal publicaba $5.238.607 contra
  // $2.619.303 reales, exactamente el doble, sin una sola celda en rojo.
  //
  // Volver a `''` en el generador pone rojo esto.
  const iBanco = g.filas[g.o0 - 2].indexOf('Banco')
  assert.ok(iBanco > 0, 'desapareció el encabezado "Banco" del bloque de Oficina')
  for (let r = g.o0; r <= g.oFin; r++) {
    const c = g.filas[r - 1][iBanco]
    assert.notEqual(c, '', `fila ${r}: la celda de Banco queda abierta — ahí se instaló la fórmula de otro cuadro`)
    // Y lo que sí escribe es SU fuente o nada: nunca un total de la propia columna.
    if (c !== VACIO) {
      assert.match(String(c), /^=SUM\('_J_OFICINA'!W\d+:W\d+\)/, `fila ${r}: Banco no sale de la W del espejo`)
    }
  }
  // LA FILA DE TOTAL SUMA LAS DOCE FILAS DE MES Y NINGUNA MÁS. Diciembre es un mes, no un subtotal.
  const total = String(g.filas[g.oFin][iBanco] ?? '')
  assert.equal(total, `=SUM(F$${g.o0}:F$${g.oFin})`, 'el total de Banco dejó de cerrar contra el cuerpo del cuadro')
  assert.equal(g.oFin - g.o0 + 1, 12, 'el cuerpo del cuadro tiene que ser doce meses, ni uno más')
})

test('EL ADELANTO DE OFICINA SALE DE LA X DEL ESPEJO — la misma fuente y la misma regla que el banco', () => {
  // El dueño: *"quiero q la tabla de 'oficina' sea igual que la de 'obreros'"*. La de obreros abre el
  // canal en Banco · Adelanto · Total recibo; ésta leía sólo la W y la Z, con la X ahí, cargada, sin
  // que ninguna celda la mirara. El adelanto no es un detalle de tesorería: sale ANTES del día de pago.
  const iAdel = g.filas[g.o0 - 2].indexOf('Adelanto')
  assert.equal(iAdel, 6, 'el adelanto tiene que ir pegado al banco: son la misma pregunta')
  const conFuente = []
  for (let r = g.o0; r <= g.oFin; r++) {
    const c = String(g.filas[r - 1][iAdel] ?? '')
    assert.notEqual(c, '', `fila ${r}: la celda de Adelanto queda abierta al residuo del layout anterior`)
    if (c.startsWith('=')) {
      assert.match(c, /^=SUM\('_J_OFICINA'!X\d+:X\d+\)/, `fila ${r}: el adelanto no sale de la X del espejo`)
      conFuente.push(r)
    }
  }
  assert.equal(conFuente.length, 2, 'los dos meses con bloque en la fixture tienen que traer su adelanto')
})

test('EL ANCHO NO CAMBIÓ: el cuadro de Oficina sigue midiendo OCHO columnas', () => {
  // Agregar el canal sin sacar nada llevaba el cuadro a diez y dejaba la pestaña con tres anchos de
  // grilla (8, 10 y 14) — el defecto que el auditor de patrón ya rechazó una vez y que el dueño llama
  // "descuadrado". El ancho es el contrato: para que entre una columna, sale otra.
  const ancho = (fila) => {
    const f = g.filas[fila - 1].map((c) => (c === VACIO ? '' : String(c ?? '')))
    let n = f.length
    while (n > 0 && !f[n - 1]) n--
    return n
  }
  assert.equal(ancho(g.o0 - 1), 8, 'el encabezado de Oficina se pasó del ancho de la pestaña')
  assert.equal(ancho(g.d0 - 1), 8, 'el encabezado de Dirección se pasó del ancho de la pestaña')
})

test('el bloque de Dirección tiene el mismo cuidado en su columna "Banco"', () => {
  const iBanco = g.filas[g.d0 - 2].indexOf('Banco')
  assert.ok(iBanco > 0, 'desapareció el encabezado "Banco" del bloque de Dirección')
  for (let r = g.d0; r <= g.dFin; r++) assert.notEqual(g.filas[r - 1][iBanco], VACIO, `fila ${r}: centinela en una columna del dueño`)
})

test('OFICINA_EFECTIVO SE RETIRA: un nombre sin bloque es peor que ningún nombre', () => {
  // Quedó de la primera versión del bloque (dos columnas de entrada), clavado en la columna J filas
  // 26-37 de ese layout. Nadie lo republica, así que no se mueve nunca. Un nombre que devuelve vacío
  // da 0 en silencio; sin el nombre, la fórmula da #NAME? — ruidoso, visible, arreglable.
  const nombres = rangosDeJornales(g).map((d) => d.nombre)
  assert.ok(!nombres.includes('OFICINA_EFECTIVO'), 'no hay columna "Efectivo": el efectivo es Pagado − Banco')
  assert.ok(RANGOS_RETIRADOS.includes('OFICINA_EFECTIVO'), 'si no se retira, sigue ahí devolviendo cero para siempre')
})

test('los rangos de Oficina que SÍ funcionan siguen funcionando', () => {
  // El control de que el arreglo no rompió lo que andaba: PAGO, PAGADO y PROYECTADO tenían dato antes
  // y lo siguen teniendo. Un arreglo que apaga la señal de al lado no es un arreglo.
  const d = Object.fromEntries(rangosDeJornales(g).map((x) => [x.nombre, x]))
  for (const n of ['OFICINA_PAGO', 'OFICINA_PAGADO', 'OFICINA_PROYECTADO']) {
    const { c0, r0, r1 } = d[n]
    const con = [...Array(r1 - r0 + 1).keys()].filter((k) => tiene(g.filas[r0 - 1 + k][c0])).length
    assert.ok(con > 0, `${n} se quedó sin una sola celda con dato`)
  }
})

test('LA COLUMNA 14 DE LA GRILLA JAMÁS LLEVA EL CENTINELA — es la del dueño, no una columna de prosa', () => {
  // 4ª reincidencia del mismo borrado (06/08): vaciarColumnaDeProsa(grid, ANCHO-1) pisaba "Pagado el"
  // con VACIO después de copiarla. Este guardián escanea la grilla ENTERA: si cualquier vía futura
  // vuelve a poner el centinela en la columna del dueño, esto se pone rojo antes de llegar al Sheet.
  const g = grilla({ bloques, pendientes, bloquesOfi })
  for (const [i, fila] of g.filas.entries()) {
    assert.notEqual(fila?.[13], VACIO, `fila ${i + 1}: el centinela VACIO en la columna del dueño`)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL MOTOR SALARIAL — FASE 2 (06/08). Lo que se prueba acá es que la reconstrucción no rompió EL
// CONTRATO (los 22 rangos con nombre y sus consumidores) y que los defectos que vino a matar están
// muertos por construcción, no por un número corregido a mano.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { parsearAcuerdos, escalonDe, escalonVigenteEn } from '../lib/uocra-acuerdos.mjs'
import { mesesDelMotor, formulaSigmaDelMes } from '../lib/motor-salarial.mjs'
import { auditarPatron, glosasLargas } from '../lib/patron-pestana.mjs'
import { contrastarEscala } from '../lib/uocra-paritaria.mjs'

const cinco = (rotulo, [oe, of, mo, ay, se]) => [
  [rotulo, 'Oficial Especializado', 'Hora', String(oe), '', '', String(oe), String(oe)],
  ['', 'Oficial', '', String(of)], ['', 'Medio Oficial', '', String(mo)],
  ['', 'Ayudante', '', String(ay)], ['', 'Sereno', 'Mes', String(se)],
]
const { escalones: ESC } = parsearAcuerdos([
  ['Acuerdo Mayo 2026'],
  ...cinco('Agosto\n+1,9%', [7420, 6348, 5866, 5399, 980858]),
  ...cinco('Julio\n+2%', [6800, 5817, 5375, 4948, 898817]),
  ['Acuerdo Septiembre 2025'],
  ...cinco('Septiembre\n(1,3% s/ago)', [5069, 4336, 4006, 3687, 672072]),
])
const HOY = new Date(2026, 7, 6)
const PEND = [
  { desde: new Date(2026, 7, 4), hasta: new Date(2026, 7, 15) },
  { desde: new Date(2026, 7, 16), hasta: new Date(2026, 7, 31) },
  { desde: new Date(2026, 8, 1), hasta: new Date(2026, 8, 15) },
]
const BLOQUES = [{ filaFecha: 6, inicio: 7, fin: 20 }, { filaFecha: 494, inicio: 495, fin: 510 }]
// Las dieciséis personas del bloque abierto del espejo, que es el que se está pagando.
const PERSONAS = [...Array(16).keys()].map((i) => 495 + i)
const conMotor = (extra = {}) => grilla({
  bloques: BLOQUES, pendientes: PEND, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }, { mes: 7, inicio: 12, fin: 15 }],
  ultimoDiaOfi: new Date(2026, 6, 31), escalones: ESC, bloqueBase: BLOQUES[1],
  categorias: ['OF', 'A', 'A M', 'OF M'], personasBase: 16,
  escalonVigente: escalonDe(ESC, '2026-08'),
  meses: mesesDelMotor(new Date(2026, 6, 31), PEND, [new Date(2026, 6, 31)]), hoy: HOY,
  personasPago: PERSONAS,
  ...extra,
})
const gm = conMotor()
/** La pestaña como la ve el auditor: el centinela es una celda vacía y una fórmula es su resultado. */
const comoSeVe = (g) => g.filas.map((f) => f.map((c) => {
  const s = String(c ?? '')
  return s === VACIO ? '' : (s.startsWith('=') ? '123' : s)
}))

test('EL CONTRATO: los 22 rangos con nombre siguen publicados y ninguno quedó ciego', () => {
  const nombres = rangosDeJornales(gm).map((d) => d.nombre)
  // Los que consumen el Libro, CAJA, el cash flow, el calendario y la conciliación. Si uno se cae,
  // esas pestañas devuelven 0 sin dar error — que es exactamente cómo se rompió CAJA en julio.
  for (const n of [
    'JORNALES_REAL_DESDE', 'JORNALES_REAL_HASTA', 'JORNALES_REAL_PAGO', 'JORNALES_REAL_TOTAL',
    'JORNALES_REAL_PAGADO', 'JORNALES_REAL_BANCO', 'JORNALES_REAL_ADELANTO', 'JORNALES_REAL_RECIBO',
    'JORNALES_PROY_DESDE', 'JORNALES_PROY_HASTA', 'JORNALES_PROY_PAGO', 'JORNALES_PROY_TOTAL',
    'OFICINA_PAGO', 'OFICINA_PAGADO', 'OFICINA_PROYECTADO', 'OFICINA_BANCO',
    'DIRECCION_PAGO', 'DIRECCION_PAGADO', 'DIRECCION_PROYECTADO',
  ]) assert.ok(nombres.includes(n), `se cayó ${n}: sus consumidores van a devolver 0 sin dar error`)
  const problemas = verificarRangos(gm.filas, rangosDeJornales(gm))
  assert.deepEqual(problemas, [], explicarProblemas(problemas))
})

test('JORNALES_REAL_PERSONAS es NUEVO y apunta a "Personas": lo consume la dotación de Cargas', () => {
  const d = rangosDeJornales(gm).find((x) => x.nombre === 'JORNALES_REAL_PERSONAS')
  assert.ok(d, 'sin este nombre, Cargas Sociales no tiene contra qué contrastar la dotación de la DDJJ')
  assert.equal(d.ancla.texto, 'Personas')
})

test('la pestaña con el motor adentro cumple el patrón: cero defectos', () => {
  const d = auditarPatron(comoSeVe(gm))
  assert.deepEqual(d, [], d.map((x) => `fila ${x.fila} · ${x.regla} · ${x.detalle}`).join('\n'))
})

test('A3 · NINGUNA QUINCENA PROYECTADA CITA EL BLOQUE DE INFLACIÓN DE PARÁMETROS', () => {
  // Era `INDEX('Parámetros'!$C$74:$C$90; MATCH(EOMONTH(...)))`: el factor IPC ACUMULADO desde julio,
  // aplicado sobre un Σ$/hora que YA era de agosto. El aumento de agosto se contaba dos veces.
  const proy = gm.filas.slice(gm.p0 - 1, gm.p0 + PEND.length - 1)
  const texto = proy.flat().map(String).join(' ')
  assert.doesNotMatch(texto, /Par[áa]metros'!\$[AC]\$7[0-9]/, 'la proyección volvió a proyectar por IPC')
  assert.match(texto, /MATCH\(EOMONTH\(A\d+;0\)/, 'tiene que buscar SU mes en el cuadro del escalón')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL RECLAMO DEL 13/08 (segundo rechazo del diseño), CONVERTIDO EN TRES CONTROLES
//
// *"no logro entender cuanto tengo q pagar en cada grupo de empleados si ya esta el monto proyectado
// o es lo real. en el medio hay cuestiones gremiales q confunden"*.
//
// Las tres respuestas que la pestaña tiene que dar de un golpe de vista son las tres afirmaciones que
// se miden acá abajo. Revertir cualquiera de ellas pone rojo exactamente un test.
// ═══════════════════════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL RECLAMO DEL 14/08 (QUINTO RECHAZO), CONVERTIDO EN CONTROLES
//
// *"HOY QUIERO CERRAR LA QUINCENA Y NO SE EXACTAMENTE CUANTO TENGO Q PAGAR A LOS OBREROS POR BANCO Y
// CUANTO POR EFECTIVO. el cuadro principal de CUANTO HAY QUE PAGAR mezcla conceptos proyectados ya
// pagados, proximos cuando, es un desastre q no se entiende"*. Y después: *"te he dicho q el acuerdo
// es 50 y 50 todas las quincenas"*.
// ═══════════════════════════════════════════════════════════════════════════════════════════════








test('PAGO 6 · LA ARITMÉTICA DEL 50/50, CONTRA LOS NÚMEROS REALES DE LA QUINCENA 03/08→15/08', () => {
  // ═══ EL TEST QUE PRUEBA EL NÚMERO, NO EL STRING ═══
  //
  // Los de arriba prueban que la fórmula dice lo que quisimos escribir. Éste prueba que el criterio DA
  // BIEN, corriendo la misma aritmética que la fórmula pone en la celda contra las cifras leídas de
  // '_J_OBREROS'!B497:AB511 el 14/08.
  const quincena = repartoQuincena([
    { total: 473000, adelanto: 240000 },   // Tello Juan: adelantó MÁS que su mitad
    { total: 419800, adelanto: 209100 },   // Sosa Raul: queda al límite
    { total: 5650000, adelanto: 529544 },  // el resto del plantel, agregado
  ])
  assert.equal(quincena.total, 6542800, 'el total de la quincena no es el de la planilla')
  assert.equal(quincena.banco, 3271400, 'el 50% por banco no da lo que el dueño tiene que transferir')
  assert.equal(quincena.adelanto, 978644, 'los adelantos ya entregados no dan')
  assert.equal(quincena.efectivo, 2292756, 'los billetes a juntar no dan')
  // Y LAS DOS IDENTIDADES, sobre los números: son las mismas que las fórmulas escriben en la pestaña.
  assert.equal(quincena.total - quincena.adelanto, quincena.neto)
  assert.equal(quincena.banco + quincena.efectivo, quincena.neto)
  // EL NEGATIVO EXISTE Y SE CUENTA: Tello queda en 233.000 − 236.500 = −3.500.
  assert.equal(repartoPersona({ total: 473000, adelanto: 240000 }).efectivo, -3500)
  assert.equal(quincena.negativos, 1, 'la quincena no detecta a quien adelantó más que su mitad')
  // Y EL DATO CARGADO LE GANA AL CÁLCULO, también del lado del núcleo.
  assert.equal(repartoPersona({ total: 400000, adelanto: 0, banco: 300000 }).banco, 300000)
  assert.equal(repartoPersona({ total: 400000, adelanto: 0, banco: 300000 }).bancoCalculado, false)
  assert.equal(ACUERDO_BANCO, 0.5, 'el acuerdo del dueño dejó de ser 50/50')
})

test('PAGO 6bis · LAS DOS MITADES DE LA PROYECCIÓN SUMAN EL TOTAL, POR CONSTRUCCIÓN', () => {
  // La identidad no se verifica leyendo dos fórmulas y confiando: se construye. `banco` es `efectivo`
  // más dirección entera, así que banco + efectivo = obreros + oficina + dirección SIEMPRE — y es lo
  // que autorizó a sacar la columna TOTAL del calendario sin perder el número.
  const c = canalesProyectados({ obreros: 'D29', oficina: 'E29', direccion: 'F29' })
  assert.equal(c.efectivo, '=(D29+E29)/2')
  assert.equal(c.banco, `${c.efectivo}+F29`, 'banco dejó de ser el efectivo más el retiro entero de dirección')
  // LA TRAMPA DEL LOCALE: en es_AR la coma separa argumentos, así que `*0,5` parte la fórmula en dos y
  // la celda queda en #ERROR. El acuerdo se escribe `/2` y el 0,5 vive sólo del lado del JavaScript.
  for (const f of [c.banco, c.efectivo]) assert.doesNotMatch(f, /0[,.]5/)
  // Y DIRECCIÓN VA ENTERA, no a la mitad: la orden del dueño del 03/08.
  assert.equal(DIRECCION_POR_BANCO, 1, 'dirección dejó de cobrar todo por banco sin que nadie lo dijera')
})

test('PAGO 7 · las filas del cuadro son PERSONAS, no filas numeradas del espejo', () => {
  // Un bloque del espejo trae filas numeradas que no son gente: la de totales y alguna intermedia con
  // importes y sin nombre. Emitir un renglón por cada una llenaría el cuadro de fantasmas con $0 — y
  // el criterio tiene que ser el MISMO que usa el registro para contar personas (nombre en la B).
  const espejo = []
  espejo[9] = ['1', 'Tello Juan']
  espejo[10] = ['2', 'Sosa Raul']
  espejo[11] = ['3', '']              // fila numerada SIN nombre: no es una persona
  espejo[12] = ['4', '   ']           // ni ésta, que sólo tiene espacios
  assert.deepEqual(filasDePersonas(espejo, { inicio: 10, fin: 13 }), [10, 11])
  // El cuadro que listaba personas se retiró el 09/09/2026; el criterio sigue vivo porque de él sale
  // el rango del espejo con el que otras vistas cuentan la cuadrilla de la quincena.
})





test('B3 · el "escalón que viene" NO puede mostrar un número de otro año', () => {
  // ═══ EL DEFECTO ORIGINAL (06/08): «septiembre*» caía en el acuerdo de 2025 ═══
  //
  // El bloque buscaba el mes con `MATCH(TEXT(fecha;"mmmm")&"*")` sobre una réplica que apila dos años
  // y medio: devolvía el Ayudante a $3.687 y el cuadro decía que el escalón que viene BAJA. `IFERROR`
  // no disparaba porque la fórmula SÍ encontraba una fila.
  //
  // ═══ Y DESDE EL 09/09/2026 LA AUSENCIA NO SE ANUNCIA: NO SE EMITE ═══
  //
  // La fila decía «· ▲ El escalón que viene — sin acuerdo publicado» con la celda vacía al lado. Es un
  // renglón que existe para explicar que no hay nada que mostrar, y el dueño mandó sacar exactamente
  // eso. Que no haya acuerdo lo grita el log de la corrida, donde alguien puede ir a buscarlo.
  assert.ok(!gm.filas.some((f) => /escalón que viene/i.test(String(f[0] ?? ''))),
    'sin acuerdo publicado se emitió igual el renglón que anuncia que no hay nada')
  const fracciones = [gm.fShare, gm.fAdel, gm.fAcuerdo, gm.fShareOfi, gm.fAcuerdoOfi]
  assert.equal(gm.ratios.filter((f) => !fracciones.includes(f)).length, 1,
    'sin acuerdo publicado hay UN margen, no dos')
  const texto = gm.filas.flat().map(String).join(' ')
  assert.doesNotMatch(texto, /MATCH\(TEXT\(TODAY\(\);"mmmm"\)/, 'volvió el MATCH por nombre de mes')
  // Y NINGUNA CIFRA DE OTRO AÑO ENTRA POR LA ESCALA DE ABAJO: sale del escalón vigente, resuelto por
  // el parser con el año deducido, no de un MATCH por nombre.
  const escala = gm.filas.findIndex((f) => String(f[0] ?? '') === 'Escala del convenio ($/hora)')
  assert.ok(escala > 0, 'se fue la escala del convenio')
  for (let r = escala + 1; r < escala + 5; r++) {
    const v = String(gm.filas[r][1] ?? '')
    assert.ok(!v || /INDEX\('_UOCRA_RAW'/.test(v), `la escala trajo un valor que no sale de la réplica: ${v}`)
  }
})
test('B7 · ningún DATE con mes 13 o 14: diciembre se paga en enero del año que viene', () => {
  const texto = gm.filas.flat().map(String).join(' ')
  assert.doesNotMatch(texto, /DATE\(\d{4};1[3-9];/, 'volvió el mes 13')
  assert.match(texto, /DATE\(2027;1;/, 'el retiro de diciembre tiene que salir en enero de 2027')
})

test('UN SOLO DRIVER: obra, OFICINA y DIRECCIÓN se proyectan con el factor de paritaria del cuadro 1.2', () => {
  // ═══ LA ORDEN DEL DUEÑO (07/08) ═══
  // *"en la pestaña jornales por quincena necesito q las proyecciones en oficina y direccion sean
  // tomando el porcentaje de incremento en uocra, por mas q no esten en ese gremio y convenio y no
  // tengan categoria"*. Dirección repetía el mismo importe los doce meses —una hipótesis que nadie
  // escribió, aplicada a cuatro meses de caja— y Oficina ya usaba el factor pero por otro camino.
  const esc = gm.esc
  const anclaEnEscalon = new RegExp(`INDEX\\(\\$E\\$${esc.f0}:\\$E\\$${esc.f1};MATCH\\(`)

  // OFICINA: los meses sin cargar toman el factor RELATIVO a su propio mes base (su planilla va
  // atrasada). Sin la división se le aplicaría el aumento acumulado desde antes de su último sueldo.
  // CAMBIO DE CONTRATO (14/08): el «Estado» de un mes proyectado ahora dice además de dónde sale su
  // aumento (`proyección · Ac.Mayo 2026`, `proyección · ▲ firmado hasta 08/2026`). Se filtra por
  // prefijo — con la igualdad exacta este test se quedaba con CERO filas y pasaba sin mirar nada, que
  // es la peor forma de romperlo.
  const ofiProy = gm.filas.slice(gm.o0 - 1, gm.oFin).filter((f) => String(f[3]).startsWith('proyección'))
  assert.ok(ofiProy.length >= 5, `esperaba meses de oficina proyectados y hay ${ofiProy.length}`)
  // EL FACTOR VIVE EN LA B DESDE EL 14/08 (la G pasó a ser «Adelanto»). El índice sale de acá y no
  // del encabezado a propósito: si mañana se mueve otra vez, este test tiene que ponerse rojo.
  const cAjuste = gm.filas[gm.o0 - 2].indexOf('Ajuste escalón')
  assert.equal(cAjuste, 1, 'el ajuste del escalón se movió de columna sin avisar')
  for (const f of ofiProy) {
    assert.match(String(f[cAjuste]), anclaEnEscalon, 'un mes de oficina se proyecta fuera del cuadro del escalón')
    assert.match(String(f[cAjuste]), /\/INDEX/, 'oficina perdió su propio mes base: se le aplica el aumento de otro')
  }

  // ═══ DIRECCIÓN: EL ANCLA ES EL MES DEL IMPORTE, NO EL DEL CALENDARIO (14/08) ═══
  //
  // El dueño: "está mal hecha la proyección de aumentos en el grupo de 'dirección' porque no habría
  // aumento reflejado en el mes siguiente". Era `EOMONTH(TODAY();0)`: el importe base sale de la última
  // carga de Compras —el retiro de JULIO, pagado el 03–04/08— y anclar en agosto le daba factor 1 al
  // mes siguiente al último pagado. $888.113 de menos a diciembre, y un tramo MÁS por cada 1° de mes
  // que pasara, porque el ancla caminaba con el reloj mientras la base se quedaba quieta.
  const dir = gm.filas.slice(gm.d0 - 1, gm.dFin)
  for (const f of dir) {
    assert.match(String(f[1]), anclaEnEscalon, 'el retiro de un mes volvió a proyectarse sin ajuste')
    assert.doesNotMatch(String(f[1]), /EOMONTH\(TODAY\(\);0\)/,
      'el ancla volvió al mes del calendario: el mes siguiente al último pagado se queda sin aumento')
    assert.match(String(f[1]), /EOMONTH\(MAX\(FILTER\('Compras'!\$AD/,
      'el ancla dejó de salir del MISMO dato que el importe base')
    assert.match(String(f[1]), /;-1\)/, 'el retiro de M se paga en M+1: sin el -1 el ancla se corre un mes')
  }
  // Y el proyectado MULTIPLICA por ese factor, con la celda validada: `total*""` daría 0 y borraría el
  // retiro del mes sin dar un solo error.
  const r = gm.d0
  assert.match(String(dir[0][7]), new RegExp(`\\*IFERROR\\(IF\\(ISNUMBER\\(B${r}\\);B${r};1\\);1\\)`),
    `el retiro de un mes dejó de escalar por la paritaria: ${dir[0][7]}`)
})

test('el escalón declara mes por mes si es acuerdo o proyección — y ningún mes queda estampado', () => {
  // ═══ LA GLOSA SE FUE, LA COLUMNA SE QUEDA (09/09/2026) ═══
  //
  // Arriba del cuadro había dos líneas: «· ▲ Escala vencida…» y «· Paritaria UOCRA · Agosto +1,9%
  // hasta 31/08/2026». Decían en prosa lo que la columna «Estado» publica MES POR MES, que es donde
  // sirve: un mes proyectado sobre un acuerdo firmado y uno que repite el último tramo conocido no
  // son lo mismo para quien decide, y el número viaja hasta CAJA.
  assert.ok(!gm.filas.some((f) => /Paritaria UOCRA|Escala vencida/i.test(String(f[0] ?? ''))),
    'volvió la glosa del convenio arriba del cuadro')
  const estados = gm.filas.map((f) => String(f[7] ?? ''))
  assert.ok(estados.some((x) => /proyección/.test(x)),
    'ningún mes del escalón se declara PROYECCIÓN: lo estimado se está publicando como acuerdo')
  assert.ok(estados.some((x) => /acuerdo firmado|Ac\./.test(x)),
    'ningún mes se declara ACUERDO FIRMADO: el cuadro ya no distingue lo firmado de lo proyectado')
  // Y NINGÚN MES ESCRITO EN EL CÓDIGO: el rótulo de cada escalón sale de la réplica ya parseada, así
  // que el día que se pegue un acuerdo nuevo el cuadro cambia solo.
  const otra = parsearAcuerdos([['Acuerdo Abril 2026'], ...cinco('Mayo\n+2,4%', [6100, 5200, 4800, 4420, 806000])]).escalones
  const g2 = grilla({
    bloques: BLOQUES, pendientes: PEND, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }],
    ultimoDiaOfi: new Date(2026, 6, 31), escalones: otra, bloqueBase: BLOQUES[1],
    categorias: ['OF'], personasBase: 16, escalonVigente: null,
    meses: mesesDelMotor(new Date(2026, 6, 31), PEND, [new Date(2026, 6, 31)]), hoy: HOY,
  })
  // El cuadro publica el rótulo del escalón que la RÉPLICA trajo, no un mes escrito en el código: con
  // otra réplica el contenido de la columna «Escalón publicado» cambia solo.
  const publicados = g2.filas.slice(g2.esc.f0 - 1, g2.esc.f1).map((f) => String(f[1] ?? '')).join(' | ')
  const deLaOtra = gm.filas.slice(gm.esc.f0 - 1, gm.esc.f1).map((f) => String(f[1] ?? '')).join(' | ')
  assert.notEqual(publicados, deLaOtra, 'el cuadro del escalón no siguió a la réplica: publica lo mismo con otra fuente')
})
test('CADA Σ SE ANCLA EN EL MES DE SU PROPIA FUENTE: la del aumento en el escalón, la pactada en obra', () => {
  // ═══ EL DEFECTO QUE ESTE TEST CUIDA, Y POR QUÉ CAMBIÓ DE ANCLA EL 07/08 ═══
  //
  // El cuadro 1.2 arranca en el mes MÁS VIEJO de los tres bloques —casi siempre el de Oficina, que va
  // atrasada—. Si la Σ se divide por el factor de una fila que no es la de SU mes, la proyección entera
  // se lleva un tramo de paritaria de más o de menos, en silencio y con un total plausible.
  //
  // Cuál es "su mes" depende de la fuente, y son dos distintas:
  //   · la Σ PACTADA sale del plantel de la última quincena CERRADA de obra  → `periodoBase`.
  //   · la Σ del CONVENIO sale de las celdas «Básico convenio» de 1.1, que leen el escalón VIGENTE de
  //     la réplica —el mes en curso, un mes por delante—                     → `periodoConvenio`.
  // Anclar la del convenio en el mes de obra le sumaría el tramo de agosto dos veces.
  const mesesOfiAtras = mesesDelMotor(new Date(2026, 6, 31), PEND, [new Date(2026, 5, 30)])
  assert.equal(mesesOfiAtras[0].periodo, '2026-06')
  const conEscala = grilla({
    bloques: BLOQUES, pendientes: PEND, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }],
    ultimoDiaOfi: new Date(2026, 5, 30), escalones: ESC, bloqueBase: BLOQUES[1],
    categorias: ['OF'], personasBase: 16, escalonVigente: escalonDe(ESC, '2026-08'),
    meses: mesesOfiAtras, hoy: HOY, periodoBase: '2026-07',
  })
  const rAgosto = conEscala.esc.f0 + mesesOfiAtras.findIndex((m) => m.periodo === '2026-08')
  const sigmas = conEscala.filas.slice(conEscala.esc.f0 - 1, conEscala.esc.f1).map((f) => String(f[5]))
  for (const s of sigmas) {
    assert.match(s, new RegExp(`/\\$E\\$${rAgosto};`), `la Σ con aumento quedó anclada fuera del mes del escalón: ${s}`)
    assert.match(s, /N\(\$C\$\d+\)\+N\(\$D\$\d+\)/, `la base dejó de llevar el aumento: ${s}`)
  }

  // SIN ESCALA VIGENTE la proyección vuelve al jornal PACTADO — y entonces el ancla vuelve a ser el mes
  // base de obra. Si alguien deja el ancla del convenio en el camino de respaldo, obra se come el
  // aumento de agosto: es el defecto A3 bis, que sigue vivo en ese camino.
  const sinEscala = grilla({
    bloques: BLOQUES, pendientes: PEND, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }],
    ultimoDiaOfi: new Date(2026, 5, 30), escalones: ESC, bloqueBase: BLOQUES[1],
    categorias: ['OF'], personasBase: 16, escalonVigente: null,
    meses: mesesOfiAtras, hoy: HOY, periodoBase: '2026-07',
  })
  const rJulio = sinEscala.esc.f0 + mesesOfiAtras.findIndex((m) => m.periodo === '2026-07')
  for (const f of sinEscala.filas.slice(sinEscala.esc.f0 - 1, sinEscala.esc.f1)) {
    assert.match(String(f[5]), new RegExp(`/\\$E\\$${rJulio};`), `sin escala la Σ pactada quedó fuera del mes de obra: ${f[5]}`)
    assert.doesNotMatch(String(f[5]), /N\(\$D\$\d+\)/,
      'sin escala no hay aumento que sumar: el término del aumento no puede aparecer')
  }
})

test('LA CADENA COMPLETA: el plantel del espejo llega CON EL AUMENTO hasta JORNALES_PROY_TOTAL', () => {
  // ═══ LA ORDEN (29/08), QUE REEMPLAZA A LA DEL 07/08 ═══
  //
  // *"te pedi q del convenio sacar el 50% por categoria y eso es lo q le vamos a aumentar a cada
  // empleado sobre lo q cobran por hr hoy"*. La orden anterior —proyectar al 100% de la hora de
  // convenio— quedó derogada: revaluaba a todos a la escala y borraba lo que cada uno negoció.
  //
  // Este test recorre el cable entero: si se corta en cualquier eslabón, la proyección vuelve a la
  // tarifa de hoy SIN aumento —o peor, al piso— y el total sigue siendo un número plausible que nadie
  // puede distinguir a ojo.
  const p = gm.plantel
  // 1 · las personas por categoría salen del espejo —de la columna D—, no de una lista en el código.
  //     Era un COUNTIFS y desde el 28/08 es un SUMPRODUCT sobre `TRIM(D)`: el COUNTIFS comparaba la
  //     clave ya recortada contra el rango SIN recortar y nueve personas contaban cero. Lo que este
  //     eslabón cuida no cambió —que el conteo salga del espejo— pero la forma sí, y tiene que decir
  //     TRIM: sin él vuelve el defecto (ver `jornales-plantel-clave-recortada.test.mjs`).
  assert.match(String(gm.filas[p.fPrimera - 1][1]), /SUMPRODUCT\(--\(TRIM\('_J_OBREROS'!\$D\$\d+:\$D\$\d+\)=/)
  // 1 bis · lo que cobra HOY sale de la MISMA columna W del espejo. Es el término principal de la
  //     proyección desde el 29/08: si esta celda deja de leer el espejo, el aumento se aplicaría
  //     sobre un número escrito y nadie lo notaría.
  assert.match(String(gm.filas[p.fPrimera - 1][2]), /N\('_J_OBREROS'!\$W\$\d+:\$W\$\d+\)/)
  // 2 · el básico de cada categoría sale de la réplica del convenio…
  assert.match(String(gm.filas[p.fPrimera - 1][5]), /INDEX\('_UOCRA_RAW'!/)
  // 2 bis · …y el aumento se calcula PERSONA POR PERSONA contra ese básico: media brecha, recortada
  //     en cero para el que ya cobra el piso. No es `personas × constante` — dos Oficiales que cobran
  //     distinto tienen brechas distintas contra el mismo piso.
  const fAumento = String(gm.filas[p.fPrimera - 1][3])
  assert.match(fAumento, new RegExp(`\\(N\\(\\$F${p.fPrimera}\\)-N\\('_J_OBREROS'!\\$W`),
    `la Σ del aumento dejó de restar contra la columna de tarifas del espejo: ${fAumento}`)
  assert.match(fAumento, /\*50%\)$/, 'dejó de cerrar la MITAD de la brecha')
  assert.doesNotMatch(fAumento, /\d{4,}/, 'el aumento quedó estampado como importe')
  assert.doesNotMatch(fAumento, new RegExp(`^=N\\(\\$B${p.fPrimera}\\)\\*`),
    'volvió a ser personas × una constante: eso publica el promedio como si fuera el dato')
  // 2 ter · y la Σ con aumento de la categoría es lo de hoy más ese aumento.
  assert.match(String(gm.filas[p.fPrimera - 1][6]), new RegExp(`N\\(\\$C${p.fPrimera}\\)\\+N\\(\\$D${p.fPrimera}\\)`))
  // 3 · la Σ del cuadro 1.2 sale de las DOS celdas del total de 1.1 — y de NINGÚN número pegado.
  const fEsc = String(gm.filas[gm.esc.f0 - 1][5])
  assert.equal(gm.esc.conAumento, true, 'con escala vigente la proyección tiene que llevar el aumento')
  assert.match(fEsc, new RegExp(`N\\(\\$C\\$${p.fTotal}\\)\\+N\\(\\$D\\$${p.fTotal}\\)`),
    `la Σ del cuadro 1.2 dejó de salir del bloque 1.1: ${fEsc}`)
  // Y NO PUEDE VOLVER A SER EL PRODUCTO ESCALAR CONTRA LA ESCALA: ése era el piso.
  assert.doesNotMatch(fEsc, new RegExp(`SUMPRODUCT\\(\\$B\\$${p.fPrimera}`),
    'la Σ volvió a valuar el plantel a la hora del convenio')
  assert.doesNotMatch(fEsc, /\d{4,}/, 'apareció un importe estampado donde tiene que haber referencias')
  // 4 · el encabezado no puede mentir sobre cuál de las dos Σ es la que está abajo. Es el defecto de
  //     "Ajuste inflación" en Oficina: el rótulo sobrevivió al criterio que lo justificaba.
  assert.equal(String(gm.filas[gm.esc.f0 - 2][5]), 'Σ $/hora con aumento', 'el encabezado de 1.2 quedó con la base vieja')
  // El de 1.3 dice "aplicada" y no "convenio" desde el 07/08: abajo conviven las dos bases —lo que se
  // paga este mes va al pactado— y un encabezado que nombra una sola sería el defecto de "Ajuste
  // inflación", el rótulo que sobrevive al criterio que lo justificaba.
  // Desde el 09/09/2026 lo cerrado y lo proyectado comparten UN encabezado, y la valuación cae en la
  // columna «Total» de esa grilla: el eslabón que se controla es que la celda siga buscando SU mes en
  // el cuadro 2.2, no el rótulo.
  const iTotal = colDe('Total').charCodeAt(0) - 65
  assert.equal(String(gm.filas[gm.f0 - 2][iTotal]), 'Total', 'el encabezado de la grilla cambió de forma')
  // 5 · cada quincena proyectada busca SU mes en ese cuadro y multiplica por horas × días…
  const q = gm.filas[gm.p0 - 1]
  assert.match(String(q[iTotal]), new RegExp(`INDEX\\(\\$F\\$${gm.esc.f0}:\\$F\\$${gm.esc.f1};MATCH\\(EOMONTH\\(`))
  // `cantidades[0]` es la fila «Horas por persona y día — medidas»: se lee del contrato de la grilla y
  // no de un offset. Decía `gm.fShare - 1` —la fila de arriba de otra línea— y cuando esa línea se fue
  // el test quedó apuntando a cualquier lado: es el mismo defecto que anclar en la posición.
  // ═══ LAS HORAS DEJARON DE SER UNA SOLA CELDA (27/08) ═══
  //
  // Era `…*$B$<medidas>*NETWORKDAYS…`. Valuar la OBLIGACIÓN con el promedio de asistencia dejaba la
  // proyección 10,25% corta todos los meses (ver lib/jornales-piso-uocra.mjs). Ahora la celda elige:
  // horas medidas para lo que se paga dentro del mes —es lo que va a salir de la caja— y la jornada
  // para lo que se proyecta. Se controla que las DOS estén y que sigan multiplicando los días L-V:
  // con una sola, una de las dos preguntas queda contestada con la respuesta de la otra.
  const [fMed] = gm.cantidades
  // La rama del PACTADO: horas medidas × días lunes a viernes. Es lo que va a salir de la caja.
  assert.match(String(q[iTotal]), new RegExp(`\\*\\$B\\$${fMed}\\*NETWORKDAYS\\.INTL\\(A${gm.p0};B${gm.p0};"0000011"\\)`),
    `la rama del pactado dejó de valuarse con horas medidas × días L-V: ${q[iTotal]}`)
  // La rama del CONVENIO (07/09/2026): la Σ del cuadro 4.2 —con el aumento— por las MISMAS horas
  // medidas × días L-V. La jornada plena ($B$fJor) NO entra a esta celda: con 15 personas publicaba
  // $20M por mes para oct–dic contra $7M–$9M reales todos los meses del año, y el Cash Flow cerró el
  // año en $76M en vez de ~$187M el día que esa rama se pobló. La jornada queda para el control.
  assert.equal(String(q[iTotal]).split(`$B$${fMed}*NETWORKDAYS.INTL(A${gm.p0};B${gm.p0};"0000011")`).length - 1, 2,
    `las dos ramas tienen que valuarse con horas medidas × días L-V: ${q[iTotal]}`)
  // LA JORNADA PLENA NO ENTRA A ESTA CELDA. Desde el 09/09/2026 vive en «Parámetros» con rango con
  // nombre, así que el control mira los NOMBRES: si vuelven, vuelve el defecto de $20M por mes.
  for (const n of ['JORNADA_LUNES_JUEVES', 'JORNADA_VIERNES', 'JORNADA_SABADO']) {
    assert.ok(!String(q[iTotal]).includes(n), `la jornada plena volvió a la proyección: ${q[iTotal]}`)
  }
  // 6 · …y esa columna es la que publica el rango que consumen Cargas Sociales, el Libro, CAJA y los
  //     cash flows. APUNTA A "Obreros", NO AL "TOTAL" del calendario: el TOTAL ya trae oficina y
  //     dirección, que viajan por sus propios rangos, y sumarlas de nuevo las contaría dos veces.
  const proy = rangosDeJornales(gm).find((x) => x.nombre === 'JORNALES_PROY_TOTAL')
  assert.equal(proy.c0, iTotal, 'JORNALES_PROY_TOTAL dejó de apuntar a la columna donde cae la valuación al convenio')
  assert.equal(proy.ancla.texto, 'Total', 'JORNALES_PROY_TOTAL se corrió a una columna que no es la de la quincena')
  assert.equal(proy.r0, gm.p0)
})

test('LOS TRES CANALES PROYECTADOS SALEN DEL ACUERDO Y SIEMPRE SUMAN EL TOTAL', () => {
  // ═══ DOS NÚMEROS PARA EL MISMO CANAL ES LO QUE NO SE ENTENDÍA (14/08) ═══
  //
  // Esta columna multiplicaba por un share MEDIDO sobre el histórico (84,2% en efectivo) mientras el
  // pago se hacía 50/50 por acuerdo del dueño. La misma pestaña daba dos respuestas a «por qué canal
  // sale la plata». Desde el 09/09/2026 las quincenas proyectadas usan las MISMAS tres columnas que
  // las cerradas —Banco · Adelanto · Recibo— y la identidad la garantiza la aritmética: el recibo es
  // el RESTO, así que no puede haber una fila donde las partes no cierren contra su total.
  const L = (rotulo) => colDe(rotulo)
  const r = gm.p0
  const cel = (rotulo) => String(gm.filas[r - 1][L(rotulo).charCodeAt(0) - 65])
  assert.equal(cel('Banco'), `=$${L('Total')}${r}/2`, `el banco proyectado dejó de salir del acuerdo 50/50: ${cel('Banco')}`)
  // `/2` y NUNCA `*0,5`: un literal decimal escrito por API viaja en el locale es_AR del archivo y
  // ahí la coma es el separador de argumentos — el 0,5 se parte en dos y la celda queda en #ERROR.
  assert.doesNotMatch(cel('Banco'), /0[,.]5/, 'el 50% se escribió como literal decimal: en es_AR eso es un #ERROR')
  // El adelanto es lo único MEDIDO de los tres: no es un canal, es CUÁNDO sale la plata, y el acuerdo
  // no lo dice. Sale del ponderado del año sobre las quincenas ya pagadas.
  assert.match(cel('Adelanto'), new RegExp(`^=\\$${L('Total')}${r}\\*\\$B\\$${gm.fAdel}$`), `el adelanto proyectado: ${cel('Adelanto')}`)
  // Y EL RECIBO ES EL RESTO: la identidad Banco + Adelanto + Recibo = Total es del código, no de la
  // disciplina de quien edita. Con tres fórmulas independientes, un día dejan de sumar.
  assert.equal(cel('Recibo'), `=$${L('Total')}${r}-${L('Banco')}${r}-${L('Adelanto')}${r}`)
  // LAS DOS LÍNEAS DE AUDITORÍA DE INCUMPLIMIENTO NO VUELVEN. El dueño: *"te he dicho q el acuerdo es
  // 50 y 50 todas las quincenas y asi y todo no se entiende nada"*.
  const texto = gm.filas.flat().map(String).join(' ')
  assert.doesNotMatch(texto, /por banco · /, 'volvió la brecha contra el acuerdo al bloque que decide el pago')
  assert.doesNotMatch(texto, /contra el acuerdo 50\/50 declarado/, 'volvió la línea de incumplimiento')
})

test('EL SUPUESTO SE LEE EN LA FILA DE CADA CATEGORÍA, NO EN UNA GLOSA ARRIBA DEL CUADRO', () => {
  // La línea «· Aumento: cierra el 50% de la brecha al piso…» se retiró el 09/09/2026. El criterio no
  // se pierde: la columna «Estado» de CADA categoría lo dice, y ahí sirve —el aumento se calcula
  // persona por persona contra su propio básico, así que una glosa única sobre el cuadro promedia lo
  // que el cuadro justamente no promedia—.
  assert.ok(!gm.filas.some((f) => /Aumento: cierra el 50%/.test(String(f[0] ?? ''))),
    'volvió la glosa del supuesto arriba del cuadro')
  assert.ok(!gm.filas.map((f) => String(f[0] ?? '')).some((c) => /100% del convenio/i.test(c)),
    'volvió a anunciar el piso del convenio que el dueño rechazó')
  const estado = String(gm.filas[gm.plantel.fPrimera - 1][7])
  assert.match(estado, /cierra el 50% de la brecha al piso/)
  assert.match(estado, /MIN\(FILTER\(/, 'el Estado dejó de mirar al que MENOS cobra de la categoría')
  assert.match(String(gm.filas[gm.plantel.fPrimera - 1][2]),
    /SUMPRODUCT\(--\(TRIM\('_J_OBREROS'!\$D\$\d+:\$D\$\d+\)="[^"]*"\);N\('_J_OBREROS'!\$W/,
    'el pactado dejó de leerse del espejo')
})
test('LA LÍNEA LA DECIDE EL CUADRO: tener la escala a mano no es haberla podido usar', () => {
  // EL DEFECTO QUE ESTO ATRAPA, encontrado al revertir el arreglo a propósito (07/08). La línea se
  // emitía mirando `escalonVigente` y el cuadro decidía con `conAumento`, que además exige que el mes
  // del escalón esté EN el cuadro para tener dónde anclar. Con la escala presente pero su mes fuera de
  // la tabla, la pestaña anunciaba el criterio nuevo arriba de una proyección hecha sobre el jornal de
  // hoy pelado. Dos flags para la misma decisión: el modo de falla más caro de este libro.
  const mesesSinAgosto = mesesDelMotor(new Date(2026, 5, 30), [
    { desde: new Date(2026, 6, 1), hasta: new Date(2026, 6, 15) },
  ], [new Date(2026, 5, 30)])
  assert.ok(!mesesSinAgosto.some((m) => m.periodo === '2026-08'), 'la fixture tiene que dejar agosto afuera')
  const g2 = grilla({
    bloques: BLOQUES, pendientes: [{ desde: new Date(2026, 6, 1), hasta: new Date(2026, 6, 15) }],
    bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }], ultimoDiaOfi: new Date(2026, 5, 30),
    escalones: ESC, bloqueBase: BLOQUES[1], categorias: ['OF'], personasBase: 16,
    // La escala de agosto EXISTE y llega al generador… pero su mes no está en el cuadro del escalón.
    escalonVigente: escalonDe(ESC, '2026-08'),
    meses: mesesSinAgosto, hoy: HOY, periodoBase: '2026-06',
  })
  assert.equal(g2.esc.conAumento, false, 'sin el mes del escalón en el cuadro no hay dónde anclar la Σ')
  // LA LÍNEA QUE ANUNCIABA EL AUMENTO SE FUE (09/09/2026): era prosa arriba del cuadro. Lo que se
  // controla ahora es el EFECTO, que es más fuerte que el anuncio — con el cuadro incapaz de anclar
  // la Σ, la celda de obra no puede traer la frontera convenio/pactado.
  assert.ok(!g2.filas.some((f) => /Aumento: cierra|sin aumento/i.test(String(f[0] ?? ''))),
    'volvió la glosa que anunciaba el criterio arriba del cuadro')
  // El encabezado del calendario ya no nombra la base (13/08): la Σ vive dentro de la celda de obra.
  // Lo que se controla es que esa celda NO traiga la rama del convenio cuando el cuadro no puede usarla.
  assert.doesNotMatch(String(g2.filas[g2.p0 - 1][colDe('Total').charCodeAt(0) - 65]), /EOMONTH\(TODAY\(\);0\)\);\$C\$/,
    'la celda de obra trajo la frontera convenio/pactado con el cuadro incapaz de anclar la Σ')
})

test('EL 01/09 LA PROYECCIÓN NO VUELVE SOLA AL PACTADO: la escala rige hasta que otra la reemplaza', () => {
  // ═══ EL DEFECTO, REPRODUCIDO CON LA FECHA QUE LO DISPARA (07/08) ═══
  //
  // El motor resolvía el escalón vigente por igualdad exacta de período. El acuerdo publicado termina
  // el 31/08 y la réplica no trae septiembre: el 01/09, sin que nadie tocara un archivo, la base de la
  // proyección perdía el término del aumento —volvía al jornal de hoy pelado— y la glosa de Cargas
  // seguía declarando que el aumento estaba adentro. Ninguna celda daba error.
  const sept = new Date(2026, 8, 1)
  assert.equal(escalonDe(ESC, '2026-09'), null, 'la fixture tiene que NO traer septiembre: es el ANTES')
  const vigente = escalonVigenteEn(ESC, sept)
  assert.equal(vigente.periodo, '2026-08', 'el escalón que rige en septiembre es el último publicado')
  const pend = [
    { desde: new Date(2026, 8, 1), hasta: new Date(2026, 8, 15) },
    { desde: new Date(2026, 8, 16), hasta: new Date(2026, 8, 30) },
    { desde: new Date(2026, 9, 1), hasta: new Date(2026, 9, 15) },
  ]
  const g = grilla({
    bloques: BLOQUES, pendientes: pend, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }, { mes: 7, inicio: 12, fin: 15 }],
    ultimoDiaOfi: new Date(2026, 6, 31), escalones: ESC, bloqueBase: BLOQUES[1],
    categorias: ['OF', 'A', 'A M', 'OF M'], personasBase: 16, escalonVigente: vigente,
    meses: mesesDelMotor(new Date(2026, 6, 31), pend, [new Date(2026, 6, 31), sept]), hoy: sept,
  })
  assert.equal(g.esc.conAumento, true, 'en septiembre la proyección se cayó sola al jornal de hoy sin aumento')
  assert.equal(String(g.filas[g.esc.f0 - 2][5]), 'Σ $/hora con aumento')
  // Y la Σ sale del ÚLTIMO ESCALÓN: el bloque 1.1 tiene que leer las filas de agosto en la réplica,
  // que es la escala que sigue rigiendo. Si leyera otro grupo, la base sería de otro mes.
  const basico = String(g.filas[g.plantel.fPrimera - 1][5])
  assert.match(basico, new RegExp(`\\$D\\$${vigente.categorias.Oficial.fila - 1}`),
    `«Básico convenio» dejó de leer el grupo del escalón vigente: ${basico}`)
  for (let r = g.esc.f0; r <= g.esc.f1; r++) {
    assert.match(String(g.filas[r - 1][5]), new RegExp(`N\\(\\$C\\$${g.plantel.fTotal}\\)\\+N\\(\\$D\\$${g.plantel.fTotal}\\)`),
      'la Σ del cuadro 1.2 dejó de llevar el aumento en septiembre')
  }
  // La glosa que anunciaba el criterio se retiró el 09/09/2026; lo que la reemplaza es el EFECTO, que
  // ya se midió arriba: `esc.conAumento` en true y las doce filas del escalón citando las dos celdas
  // del total de 2.1. Un anuncio se puede escribir sin que el cuadro lo aplique; esas fórmulas no.
  assert.ok(!g.filas.some((f) => /Aumento: cierra|sin aumento/i.test(String(f[0] ?? ''))),
    'volvió la glosa del criterio arriba del cuadro')
})

test('LA FRONTERA DEL MES EN CURSO VIVE EN LA CELDA: lo que se paga este mes va al PACTADO', () => {
  // ═══ LA ORDEN DEL DUEÑO (07/08) ═══
  // *"la caja comprometida … no debe ir comiéndome la libre disponibilidad"*. Las quincenas de agosto
  // valuadas al convenio inflaban la comprometida del mes con ~$1,3M que no van a salir: este mes se
  // paga el pactado. El supuesto es planificación y arranca el mes que viene.
  //
  // La elección es POR FILA y la decide su fecha de PAGO, no el mes de la quincena: la segunda
  // quincena de agosto se paga en septiembre, así que dos filas del mismo mes caen de lados distintos.
  for (let i = 0; i < PEND.length; i++) {
    const r = gm.p0 + i
    const s = String(gm.filas[r - 1][colDe('Total').charCodeAt(0) - 65])
    assert.match(s, new RegExp(`N\\(C${r}\\)>0`), `la fila ${r} no mira SU fecha de pago: ${s}`)
    assert.match(s, new RegExp(`C${r}<=EOMONTH\\(TODAY\\(\\);0\\)`), `la frontera no es el fin del mes en curso: ${s}`)
    // La rama del pactado: la Σ del plantel de 1.1 escalada por el factor del mes, anclada en el mes
    // base de OBRA. Si se anclara en otra fila, la quincena se comería un tramo de paritaria entero.
    assert.match(s, new RegExp(`\\$C\\$${gm.plantel.fTotal}\\*INDEX\\(\\$E\\$${gm.esc.f0}:\\$E\\$${gm.esc.f1};`),
      `la rama del pactado no sale del plantel de 1.1: ${s}`)
    // El `*` y no `;` desde el 27/08: la rama del pactado sigue multiplicando por sus horas DENTRO
    // del mismo IF, porque las dos bases dejaron de multiplicarse por lo mismo (ver
    // `expresionMasaDeLaQuincena`). Con `;` este control dejaría de mirar la rama que le importa.
    assert.match(s, new RegExp(`/\\$E\\$${gm.esc.rAnclaBase}\\*`), `la Σ pactada quedó anclada fuera del mes de obra: ${s}`)
    // …y la del convenio sigue siendo la columna F del cuadro 1.2.
    assert.match(s, new RegExp(`INDEX\\(\\$F\\$${gm.esc.f0}:\\$F\\$${gm.esc.f1};`), `se perdió la rama del convenio: ${s}`)
    assert.doesNotMatch(s, /,/, 'separador es-AR')
  }
  // NINGÚN MES ESCRITO: la frontera se mueve sola el 1° de cada mes, sin esperar una corrida.
  assert.doesNotMatch(String(gm.filas[gm.p0 - 1][colDe('Total').charCodeAt(0) - 65]), /DATE\(\d{4}/)
  // Y SIN CONVENIO NO HAY DOS BASES ENTRE LAS CUALES ELEGIR: el cuadro ya publica la pactada.
  const sinConv = formulaSigmaDelMes('A35', { f0: 25, f1: 30, conAumento: false }, 'C35')
  assert.doesNotMatch(sinConv, /TODAY/)
})

test('EL SERENO NO PUEDE ENTRAR A UNA COLUMNA DE $/hora: cobra por MES', () => {
  // $980.858 es el sueldo mensual del Sereno. Si el dueño escribe "Sereno" en la columna «Convenio»
  // —que es suya y gana—, el INDEX de «Básico convenio» le devolvía ese importe a una columna que
  // después se multiplica por horas y días. El guard ya existía en `mapearEscala` y esta fórmula no lo
  // había heredado. Ahora el MATCH sólo busca en las filas por hora: un "Sereno" no matchea.
  const ago = escalonDe(ESC, '2026-08')
  const f = String(gm.filas[gm.plantel.fPrimera - 1][5])
  assert.match(f, new RegExp(`\\$B\\$${ago.categorias['Oficial Especializado'].fila}:\\$B\\$${ago.categorias.Ayudante.fila}`),
    `el rango de búsqueda no es el de las categorías por hora: ${f}`)
  assert.doesNotMatch(f, new RegExp(`:\\$B\\$${ago.categorias.Sereno.fila}`), 'la fila del Sereno sigue adentro del MATCH')
})

test('LA ESCALA VERIFICADA A MANO CONTROLA A LA RÉPLICA — y calla cuando coinciden', () => {
  // Todo el bloque 4 sale de _UOCRA_RAW, que llega por IMPORTHTML. Si el sitio cambia de forma, la
  // réplica devuelve la tabla del mes pasado y se ve igual de sana: un control no se valida contra la
  // misma información que produce. Lo único que puede notarlo es la escala verificada el 07/08 contra
  // dos fuentes, que la réplica no produjo.
  // ═══ EL CONTROL SIGUE MIDIENDO; LO QUE SE FUE ES SU RENGLÓN (09/09/2026) ═══
  //
  // Un control nunca se valida contra la misma información que produce: todo el bloque sale de
  // `_UOCRA_RAW` por IMPORTHTML, y si el sitio cambia de forma la réplica devuelve una tabla vieja y
  // se ve igual de sana. Lo único que puede notarlo es la escala verificada a mano contra dos
  // fuentes. Eso NO se toca. Lo que se retiró es la celda «· ▲ Réplica ≠ escala verificada en N
  // categoría(s)» arriba del cuadro: quien puede reparar el IMPORTHTML lee la corrida, no la pestaña.
  assert.ok(!gm.filas.some((f) => /escala verificada/.test(String(f[0] ?? ''))),
    'volvió el aviso del control a una celda: su lugar es el log de la corrida')
  const vieja = parsearAcuerdos([['Acuerdo Mayo 2026'], ...cinco('Agosto\n+1,9%', [6800, 5817, 5375, 4948, 898817])]).escalones
  const g2 = grilla({
    bloques: BLOQUES, pendientes: PEND, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }],
    ultimoDiaOfi: new Date(2026, 6, 31), escalones: vieja, bloqueBase: BLOQUES[1],
    categorias: ['OF'], personasBase: 16, escalonVigente: escalonDe(vieja, '2026-08'),
    meses: mesesDelMotor(new Date(2026, 6, 31), PEND, [new Date(2026, 6, 31)]), hoy: HOY,
  })
  assert.ok(!g2.filas.some((f) => /escala verificada/.test(String(f[0] ?? ''))),
    'el aviso volvió a la pestaña: su lugar es el log de la corrida')
  // ═══ EL DETALLE SALIÓ DE LA CELDA Y LA MEDICIÓN NO (13/08) ═══
  //
  // La celda decía las cinco categorías con sus dos importes cada una: 300+ caracteres cortados en
  // pantalla justo cuando el control importa. Ahora publica el ALCANCE y el detalle va al log de la
  // corrida (09/09/2026). Lo que este test exige es la MEDICIÓN, que es lo que no puede apagarse:
  // cuántas categorías desviaron y con qué importe exacto. Si `contrastarEscala` dejara de comparar,
  // esto se pone rojo aunque el log siga imprimiendo algo.
  assert.equal(contrastarEscala(vieja).length, 5, 'el control dejó de medir las cinco categorías')
  assert.ok(contrastarEscala(vieja).includes('Ayudante: réplica 4948 ≠ verificado 5399'),
    'el contraste contra la escala verificada dejó de medir el desvío por categoría')
})

test('el canario del espejo está en la pestaña: si el bloque se movió, lo dice', () => {
  const canario = gm.filas.flat().map(String).find((c) => /el espejo se movió/.test(c))
  assert.ok(canario, 'sin canario, un rango de filas absoluto que quedó viejo devuelve el plantel de antes en silencio')
})

test('la columna "Equivale a (convenio)" del plantel no lleva el centinela en ninguna fila', () => {
  for (let r = gm.plantel.fPrimera; r <= gm.plantel.fUltima; r++) {
    assert.equal(gm.filas[r - 1][4], '', `fila ${r}: el generador le borraría al dueño la categoría que cargue`)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL FORMATO, PROBADO EN FRÍO (06/08). Los dos defectos de abajo se vieron MIRANDO la pestaña y
// ninguno da error: una cifra mal formateada es plausible y equivocada, que es la peor clase.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { requestsDeFormato, ANCHO } from './jornales-pestana.mjs'

/** El numberFormat que termina aplicándose a una celda: gana el ÚLTIMO pedido que la cubre. */
const formatoDe = (reqs, fila, col) => {
  let fmt = null
  for (const r of reqs) {
    const g = r.repeatCell
    if (!g) continue
    const { startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 } = g.range
    if (fila - 1 < r0 || fila - 1 >= r1 || col < c0 || col >= c1) continue
    const n = g.cell?.userEnteredFormat?.numberFormat
    if (n) fmt = n
  }
  return fmt
}

test('LA INSTRUCCIÓN DEL CONVENIO SE DICE UNA VEZ Y CONTADA, no una por categoría', () => {
  // El cuadro que ABRE la pestaña repetía "escribí la categoría del convenio en la columna de al lado"
  // en las cuatro filas de categorías. Un pedido no es un estado: se dice una vez, arriba, con la
  // cuenta de lo que falta. Cuatro renglones idénticos empujan hacia abajo lo único que el bloque
  // contesta y hacen que el ojo lea el cuadro como si estuviera roto.
  const texto = comoSeVe(gm).flat().map(String)
  assert.equal(texto.filter((c) => /columna de al lado/.test(c)).length, 0,
    'volvió la instrucción repetida fila por fila')
  // ═══ Y DESDE EL 06/09 LA EQUIVALENCIA VIAJA EN LA FILA DE CADA CATEGORÍA ═══
  //
  // Era una línea arriba del cuadro con las cuatro traducciones juntas: 85 caracteres contra un tope
  // de 60, o sea un GLOSARIO, que es de lo que el contrato dice que no va. Lo que este test cuida no
  // cambió —que la traducción esté UNA vez y no repetida como instrucción fila por fila— y ahora
  // cada fila dice la suya, que es donde se necesita.
  const rotulos = gm.filas.map((f) => String(f[0] ?? ''))
  // El cuadro de categorías aparece UNA vez por bloque de plantel, y «OF → Oficial» es su fila: si
  // aparece dos veces en el mismo bloque, volvió la repetición fila por fila.
  assert.equal(rotulos.filter((c) => c === 'OF → Oficial').length, 1, 'la equivalencia de OF, una sola vez')
  assert.ok(rotulos.some((c) => /→ Ayudante$/.test(c)), 'ninguna fila declara la equivalencia de Ayudante')
  // Y ninguna la dice DOS veces: ni la de arriba ni un glosario que vuelva.
  assert.equal(rotulos.filter((c) => /→.*·.*→/.test(c)).length, 0, 'volvió el glosario de equivalencias')
  // ═══ "manda la tuya" SE MUDÓ AL ENCABEZADO DE LA COLUMNA (13/08) ═══
  //
  // La frase colgaba de la glosa de arriba del cuadro. Una instrucción sobre una columna se lee en su
  // encabezado, que es donde mira el que va a escribir en ella: ahora la columna se llama «Convenio
  // (tuya)». Lo que este test cuida no cambió — que la pestaña siga diciendo, en alguna parte, que esa
  // celda es del dueño. Si el "(tuya)" se cae, el dueño no tiene forma de saber que puede escribir ahí.
  assert.match(String(gm.filas[gm.plantel.fPrimera - 2][4]), /\(tuya\)/,
    'el encabezado dejó de declarar que la columna «Convenio» es del dueño y su valor gana')
  // Y el estado por fila sigue siendo corto y contestando lo único que el bloque contesta.
  const estados = gm.filas.slice(gm.plantel.fPrimera - 1, gm.plantel.fUltima).map((f) => String(f[7]))
  for (const e of estados) {
    assert.match(e, /cierra el 50% de la brecha al piso|ya cobra el piso/,
      `el estado por fila dejó de opinar: ${e}`)
    assert.doesNotMatch(e, /"—"/, 'con equivalencia declarada la fila ya tiene respuesta: el "—" es de antes')
  }
})

test('NINGUNA COLUMNA MUDA: toda columna con dato tiene encabezado, y el encabezado no miente', () => {
  const vista = comoSeVe(gm)
  const encabezadoDe = (fila) => vista[fila - 1].map((c) => String(c ?? ''))
  // Oficina y Dirección: la D traía "proyección" bajo un encabezado vacío.
  assert.equal(encabezadoDe(gm.o0 - 1)[3], 'Estado')
  assert.equal(encabezadoDe(gm.d0 - 1)[3], 'Estado')
  for (const f of [gm.o0, gm.d0]) {
    assert.ok(String(vista[f - 1][3]).trim(), `la fila ${f} dejó su columna Estado vacía`)
  }
  // El encabezado del ajuste decía "Ajuste inflación" desde antes de que el bloque dejara de ajustar
  // por inflación: hoy usa el factor del escalón salarial, igual que la obra. Vive en la B desde el
  // 14/08, cuando la G pasó a ser «Adelanto» — y las DOS columnas de canal quedaron pegadas.
  assert.equal(encabezadoDe(gm.o0 - 1)[1], 'Ajuste escalón')
  assert.equal(encabezadoDe(gm.o0 - 1)[5], 'Banco')
  assert.equal(encabezadoDe(gm.o0 - 1)[6], 'Adelanto')
  assert.deepEqual(encabezadoDe(gm.d0 - 1), encabezadoDe(gm.o0 - 1),
    'Oficina y Dirección dejaron de ser el mismo cuadro: dos tablas pegadas con columnas distintas se leen corridas')
  // Y "Desde", en la tabla de personas de Dirección, coronaba tres celdas vacías.
  for (let f = gm.dp0; f <= gm.dpFin; f++) {
    assert.match(String(gm.filas[f - 1][4] ?? ''), /^=IFERROR\(MIN\(FILTER\(/,
      `la persona de la fila ${f} no trae su fecha de inicio`)
  }
  // La ficha del convenio dejó de flotar seis columnas a la derecha de su línea de vigencia.
  const vig = vista[gm.fVig - 1]
  assert.match(String(vig[0]), /CCT 76\/75/, 'el convenio se separó otra vez de su vigencia')
  assert.equal(vig.slice(1).filter((c) => String(c).trim()).length, 0, 'quedó un rótulo suelto en el medio')
})

test('LA JERARQUÍA LLEGA A LA PESTAÑA: dos secciones en 11 y cinco sub-secciones en 10', () => {
  // ═══ EL DEFECTO (06/08), MEDIDO SOBRE EL PDF DE LA PESTAÑA VIVA ═══
  //
  // Ningún título de esta pestaña recibía su tipografía: cinco secciones y tres sub-secciones
  // dibujadas igual que una fila de datos, en un solo tono, sin nada que el ojo pueda seguir. Dos
  // causas — el centinela que la piel leía como contenido (arreglado en estilo-statement) y las
  // sub-secciones que su gramática no reconocía. Este test mide el EFECTO sobre esta pestaña, que es
  // lo que se rompe si cualquiera de las dos vuelve.
  const reqs = requestsDeFormato(1, gm.filas, gm)
  const vista = comoSeVe(gm)
  const tipografiaDe = (fila) => {
    let t = null
    for (const r of reqs) {
      const g = r.repeatCell
      if (!g || fila - 1 < g.range.startRowIndex || fila - 1 >= g.range.endRowIndex) continue
      if (g.cell?.userEnteredFormat?.textFormat) t = g.cell.userEnteredFormat.textFormat
    }
    return t
  }
  const secciones = vista.map((f, i) => [String(f[0] ?? ''), i + 1])
    .filter(([a]) => /^\d+ · /.test(a))
  assert.equal(secciones.length, 2, `la pestaña tiene DOS secciones (calendario y convenio) y encontré ${secciones.length}`)
  for (const [a, fila] of secciones) {
    assert.equal(tipografiaDe(fila)?.bold, true, `la sección "${a.slice(0, 30)}" no está en negrita`)
    assert.equal(tipografiaDe(fila)?.fontSize, 11, `la sección "${a.slice(0, 30)}" no tiene su cuerpo`)
  }
  const subs = vista.map((f, i) => [String(f[0] ?? ''), i + 1]).filter(([a]) => /^\d+\.\d+ · /.test(a))
  assert.equal(subs.length, 5, `esperaba 1.1, 1.2, 2.1, 2.2 y 2.3 y encontré ${subs.length}`)
  for (const [a, fila] of subs) {
    assert.equal(tipografiaDe(fila)?.bold, true, `la sub-sección "${a.slice(0, 30)}" no está en negrita`)
    assert.equal(tipografiaDe(fila)?.fontSize, 10, `una sub-sección no pesa lo mismo que su sección`)
  }
  // Y las reglas se dibujan del ancho del BLOQUE. Con el centinela, `anchoDe` contaba las catorce
  // columnas siempre y toda regla salía del ancho de la hoja: líneas largas sobre la nada.
  const reglas = reqs.filter((r) => r.updateBorders?.top?.style === 'SOLID')
  assert.ok(reglas.some((r) => r.updateBorders.range.endColumnIndex < ANCHO),
    'ninguna regla se acortó al ancho de su bloque: el centinela sigue contando como contenido')
})

// ═══ LA COLUMNA «Pagado el» — LO QUE EL DUEÑO VIO EL 18/08 ═══
//
// *"jornales por quincena sigue roto desde fila 126 en adelante"* · *"no estás respetando que si yo
// hago una modificación así sea de formato en una celda, la tenés que respetar y no volver a lo de
// antes en la barrida"*.
//
// Las dos frases son el mismo defecto. El barrido de moneda iba de la B a la N e incluía la columna
// del dueño, así que siete fechas suyas que un rediseño anterior dejó desplazadas en las filas 126 a
// 132 —el título del cuadro 5 y sus notas— se dibujaban «$46.160», «$46.176»… La N está declarada
// suya desde el 31/07 y `push()` la rellena con `''` en vez del centinela justamente por eso:
// preservar el valor y repintarle el formato encima es preservar a medias.
test('el barrido de moneda NO toca la columna del dueño, en ninguna fila de la pestaña', () => {
  const reqs = requestsDeFormato(1, gm.filas, gm)
  const N = ANCHO - 1
  const moneda = reqs.filter((r) => r.repeatCell?.cell?.userEnteredFormat?.numberFormat?.type === 'CURRENCY')
  for (const r of moneda) {
    assert.ok(r.repeatCell.range.endColumnIndex <= N,
      `un barrido de moneda llega hasta la columna ${r.repeatCell.range.endColumnIndex}: pisa «Pagado el»`)
  }
  // Y NINGÚN formato de moneda cae sobre la N en ninguna fila — ni por el barrido ni por una regla
  // suelta. Se mide sobre filas del registro y sobre filas de PROSA, que es donde estaban los siete
  // seriales: una regla que sólo cubre la tabla deja el resto de la columna pintado de pesos.
  for (const f of [4, Math.round(gm.filas.length / 2), gm.f0, gm.fTotalReal, gm.filas.length]) {
    assert.notEqual(formatoDe(reqs, f, N)?.type, 'CURRENCY', `fila ${f}: «Pagado el» dibujada como plata`)
  }
})

test('«Pagado el» recibe el tipo que declara su encabezado —fecha— en TODA la columna', () => {
  // No es opinar sobre el formato del dueño: es decir de qué es la columna. Sin esta regla un serial
  // suyo se dibuja "46160" pelado, que se lee peor que "$46.160". Y tiene que cubrir la columna
  // entera, no sólo las filas de quincena: los siete desplazados estaban FUERA de la tabla.
  const reqs = requestsDeFormato(1, gm.filas, gm)
  // POR RÓTULO Y NO POR `ANCHO - 1`: el 09/09/2026 la columna bajó de la N a la M y una constante
  // escrita acá habría seguido midiendo la de al lado. `colDe` contesta la de hoy.
  const N = colDe('Pagado el').charCodeAt(0) - 65
  assert.equal(N, ANCHO - 1, '«Pagado el» dejó de ser la última columna: el mecanismo de copia la ancla ahí')
  for (const f of [4, gm.f0, gm.fTotalReal, gm.filas.length]) {
    assert.equal(formatoDe(reqs, f, N)?.type, 'DATE', `fila ${f}: «Pagado el» no se dibuja como fecha`)
  }
})

test('la columna «Estado» del registro es una FRASE, no plata', () => {
  // Dice "pagada el 18/5" o "cerrada · a pagar" y sale de una fórmula, así que el pase por contenido
  // la saltea —ve un `=`— y se quedaba con el barrido de moneda encima.
  const reqs = requestsDeFormato(1, gm.filas, gm)
  for (const f of [gm.f0, gm.fTotalReal]) {
    assert.equal(formatoDe(reqs, f, ANCHO - 2)?.type, 'TEXT', `fila ${f}: «Estado» del registro dibujada como plata`)
  }
})

test('la grilla de quincenas dibuja cantidades donde hay cantidades y plata donde hay plata', () => {
  // ═══ UNA SOLA TABLA, UN SOLO JUEGO DE REGLAS (09/09/2026) ═══
  //
  // El calendario tenía sus propias reglas de formato indexadas por SU número de columna, distintas
  // de las del registro. Con las dos mitades bajo el mismo encabezado, cada regla se aplica una vez
  // de la primera quincena cerrada a la fila del total proyectado: no puede quedar media tabla con
  // el formato del layout anterior. Y las columnas se piden por RÓTULO — un índice escrito a mano es
  // cómo el 29/08 «Aumento $/hora» heredó el PERCENT de «Margen» y $3.174 salieron «317400,0%».
  const reqs = requestsDeFormato(1, gm.filas, gm)
  const c = (rotulo) => colDe(rotulo).charCodeAt(0) - 65
  const finProy = gm.p0 + gm.nProy - 1
  for (const f of [gm.f0, gm.fTotalReal - 1, gm.p0, finProy]) {
    for (const rotulo of ['Días', 'Personas']) {
      assert.equal(formatoDe(reqs, f, c(rotulo)).type, 'NUMBER', `fila ${f}: «${rotulo}» no es una cantidad`)
    }
    assert.match(formatoDe(reqs, f, c('Horas')).pattern, /0\.0/, `fila ${f}: «Horas» dejó de tener decimales`)
    for (const rotulo of ['Banco', 'Adelanto', 'Recibo', 'Total']) {
      assert.equal(formatoDe(reqs, f, c(rotulo)).type, 'CURRENCY', `fila ${f}: «${rotulo}» dejó de dibujarse como plata`)
    }
    assert.equal(formatoDe(reqs, f, c('Estado')).type, 'TEXT', `fila ${f}: «Estado» dibujada como plata`)
  }
  // Las dos mediciones de arriba del cuadro NO son plata y cada una tiene su formato: las horas por
  // persona con dos decimales —con uno, 7,166 se muestra "7,2" y el redondeo pasa por dato— y la
  // fracción de adelanto como PORCENTAJE. Sin esto el barrido de moneda las dibuja "$7" y "$0".
  for (const f of gm.cantidades) assert.match(formatoDe(reqs, f, 1).pattern, /0\.00/)
  assert.equal(formatoDe(reqs, gm.fAdel, 1).type, 'PERCENT',
    'la fracción de adelantos se dibuja como plata: "$0" en vez de "13,7%"')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL CALENDARIO DE PAGO (13/08). El dueño, sobre el 1.3: *"dice quincena y hasta en la primera fila
// q sale aparecen la misma fecha, no se determinar cuanto es lo q proyectado que voy a pagar en las
// quincena de obreros, mes de administracion y oficina … necesito saber cuanto seria el total de
// todo lo q resta pagar quincena por quincena"*.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { quincenasPendientes } from './jornales-pestana.mjs'
import { COL_PROYECCION } from '../lib/nomina-sync.mjs'

test('LA FILA DE UN DÍA SIN DÍA LABORABLE NO SE EMITE — el defecto que el dueño vio', () => {
  // El caso exacto: la planilla cargó hasta el sábado 31/10/2026, así que lo que "queda" del tramo es
  // el domingo 1° de noviembre… no, el tramo siguiente. El caso real es el otro: carga hasta el
  // sábado y el resto del tramo es un domingo solo. Acá: carga al 14/11 (sábado) → resta el domingo
  // 15/11, cero días laborables, cero pesos, y el cuadro publicaba una fila igual.
  const q = quincenasPendientes(new Date(2026, 10, 15))
  assert.equal(q[0].desde.getDate(), 16, `la primera fila sigue siendo el domingo suelto: ${q[0].desde}`)
  // Y toda fila emitida tiene al menos un día que se paga: una fila que informa cero ocupa el
  // renglón más leído del cuadro y hace dudar de las diez de abajo.
  for (const x of q) assert.ok(x.dias > 0, `${x.desde} → ${x.hasta} se emitió con ${x.dias} días laborables`)
})

test('el RESTO de la quincena en curso se marca como tal, y la fila lo DICE con sus fechas', () => {
  // Cuando la carga llega al 13/08 lo que queda del tramo son dos días: la fila se emite —esos
  // jornales se pagan— pero no es una quincena entera.
  const q = quincenasPendientes(new Date(2026, 7, 13))
  assert.equal(q[0].resto, true, 'el resto de la quincena en curso dejó de marcarse')
  assert.equal(q[1].resto, false, 'una quincena que arranca el 16 no es un resto')
  // ═══ LA GLOSA SE FUE (09/09/2026), Y LO QUE LA REEMPLAZA ES MÁS FUERTE ═══
  //
  // Decía «· La 1ª fila es el RESTO de la quincena en curso»: prosa, y de la que el dueño mandó
  // sacar. La columna «Desde» ya no se llama «Quincena» —dice qué mide— y la fila publica sus DOS
  // fechas y sus DÍAS, así que un tramo de dos días se lee como lo que es sin que nadie lo explique.
  const g2 = grilla({ bloques: BLOQUES, pendientes: q, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }] })
  assert.ok(!g2.filas.map((f) => String(f[0] ?? '')).some((c) => /RESTO/.test(c)),
    'volvió la glosa del resto: la fila ya lo dice con sus fechas y sus días')
  assert.equal(g2.filas[g2.f0 - 2][0], 'Desde', 'la primera columna volvió a prometer una quincena entera')
  // Y la fila del resto trae su propio conteo de días laborables, que es lo que la distingue.
  assert.match(String(g2.filas[g2.p0 - 1][colDe('Días').charCodeAt(0) - 65]), /^=NETWORKDAYS\.INTL\(/)
})

test('LA GRILLA CIERRA CON DOS SUBTOTALES, Y CADA UNO SUMA SU PROPIO TRAMO', () => {
  // ═══ LO QUE REEMPLAZA A LOS TRES TESTS DEL CALENDARIO DE OCHO COLUMNAS (09/09/2026) ═══
  //
  // Medían un cuadro que ya no existe: el que tenía una columna por nómina (Obreros · Oficina ·
  // Dirección) y repartía cada mes de los dos bloques mensuales en la quincena que lo pagaba. Ese
  // reparto se retiró con las columnas —oficina y dirección publican su total en su propio bloque y
  // viajan al Cash Flow por sus rangos con nombre—, así que su control (`formulaControlCalendario`)
  // no tiene qué verificar. Lo que SÍ hay que sostener es que las dos mitades de la grilla cierren
  // cada una contra sus propias filas, sin pisarse.
  const c = (rotulo) => colDe(rotulo)
  const real = gm.filas[gm.fTotalReal - 1]
  const proy = gm.filas[gm.fTotalProy - 1]
  assert.match(String(real[0]), /^⇒ Pagado en el año/)
  assert.match(String(proy[0]), /^⇒ A pagar hasta diciembre/)
  const fin = gm.p0 + gm.nProy - 1
  for (const rotulo of ['Banco', 'Adelanto', 'Recibo', 'Total']) {
    const L = c(rotulo)
    const i2 = L.charCodeAt(0) - 65
    // Lo pagado se cierra contra la fila de ARRIBA (`INDEX(col;ROW()-1)`): una quincena insertada al
    // final del tramo entra sola al total. Es el techo de 14 quincenas, arreglado de raíz.
    assert.equal(String(real[i2]), `=SUM(${L}$${gm.f0}:INDEX(${L}:${L};ROW()-1))`,
      `el total de lo pagado dejó de crecer con el registro en «${rotulo}»`)
    // Y lo proyectado suma SÓLO sus filas: si tomara desde `f0` contaría lo ya pagado otra vez.
    assert.equal(String(proy[i2]), `=SUM(${L}${gm.p0}:${L}${fin})`,
      `el total proyectado no suma su tramo en «${rotulo}»`)
  }
  // NINGUNA COLUMNA DE NÓMINA AJENA EN LA GRILLA: oficina y dirección tienen sus propios bloques y
  // sus propios rangos. Una columna suya acá las llevaría dos veces al Cash Flow (~$50M el 13/08).
  const cabecera = gm.filas[gm.f0 - 2].map(String)
  assert.ok(!cabecera.includes('Oficina') && !cabecera.includes('Dirección'),
    'volvió una columna de otra nómina a la grilla de quincenas')
})

test('EL PROYECTADO NO SE CUENTA DOS VECES EN CAJA: el rango publicado es el de obra', () => {
  // ═══ EL DEFECTO QUE ESTO EVITA ═══
  // `JORNALES_PROY_TOTAL` lo consumen sync-caja-nucleo, Cargas Sociales y los dos cash flows. Oficina
  // y dirección YA viajan por OFICINA_PROYECTADO y DIRECCION_PROYECTADO: si este nombre apuntara a
  // una columna que las incluyera, esas dos nóminas se sumarían dos veces —~$50M el 13/08— con un
  // número perfectamente plausible y ninguna celda en rojo.
  const proy = rangosDeJornales(gm).find((x) => x.nombre === 'JORNALES_PROY_TOTAL')
  assert.equal(proy.ancla.texto, 'Total')
  // Y el lector de la caja tiene que leer la MISMA columna: su declaración vive en nomina-sync, que
  // es el módulo que escribe el cuadro. Dos definiciones de dónde está el total es cómo se
  // desincronizó este mismo cuadro en julio (la base terminó con cero quincenas reales).
  assert.equal(COL_PROYECCION.total, proy.c0, 'el lector de la caja y el rango publicado apuntan a columnas distintas')
  // NINGUNA COLUMNA DE OTRA NÓMINA QUE PODER LEER POR ERROR. `oficina` y `direccion` se retiraron del
  // contrato con las columnas: un índice con nombre inocente apuntando a algo que NO se puede
  // consumir es exactamente cómo se vuelve a contar dos veces.
  assert.equal(COL_PROYECCION.oficina, undefined, 'volvió el índice de la columna de oficina')
  assert.equal(COL_PROYECCION.direccion, undefined, 'volvió el índice de la columna de dirección')
  assert.equal(COL_PROYECCION.consolidado, undefined, 'volvió el índice de la columna consolidada')
  // Y las dos mitades del contrato son la MISMA lista: la proyección comparte el encabezado.
  for (const [k, v] of Object.entries(COL_PROYECCION)) {
    assert.equal(colDe(gm.filas[gm.f0 - 2][v]), String.fromCharCode(65 + v), `«${k}» no cae bajo su encabezado`)
  }
})


test('OFICINA · CADA MES PROYECTADO DICE DE DÓNDE SALE SU AUMENTO, COMO EL CUADRO DE OBRA', () => {
  // ═══ EL DEFECTO (14/08) ═══
  //
  // El dueño: *"jornales con el cuadro del grupo oficina como la proyeccion de obreros"*. La de
  // obreros publica mes por mes el origen del factor (`Ac.Mayo 2026` / `proyección`) y su estado
  // (`✓ acuerdo firmado` / `▲ proyección`). La de oficina publicaba un factor de cuatro decimales y
  // la palabra "proyección", idéntica para un mes apoyado en un acuerdo FIRMADO y para uno apoyado en
  // la repetición del último tramo conocido. Y ese número viaja por `OFICINA_PROYECTADO` a CAJA.
  //
  // La réplica de la fixture tiene acuerdo hasta AGOSTO y la planilla de oficina cierra el 31/07, así
  // que el mes base es JULIO: agosto se apoya en un tramo firmado y de septiembre en adelante la
  // cadena se corta.
  const estado = (mes) => String(gm.filas[gm.o0 - 1 + mes - 1][3])
  assert.equal(estado(8), 'proyección · Ac.Mayo 2026', 'agosto tiene acuerdo firmado y se leía igual que diciembre')
  // ═══ Y LA CADENA A MEDIO FIRMAR DEGRADA PARCIAL, NUNCA SE APAGA ═══
  //
  // Es la trampa que costó $29.960.870 en el cuadro de obra el mismo día: la Σ del convenio devuelve
  // `""` ENTERA si a una sola categoría le falta el básico, el término `convenio` del MAX quedó en
  // cero y la proyección cayó a la demanda de obra sin que nada se pusiera en rojo. Acá el
  // equivalente sería decir "no sé" desde septiembre. Se dice HASTA DÓNDE hay acuerdo.
  for (const mes of [9, 10, 11, 12]) {
    // SIN EL GLIFO DE ALERTA (09/09/2026). Que un mes futuro no tenga acuerdo firmado es lo NORMAL
    // —el convenio se firma por tramos— y un ▲ dibujado en cinco de doce filas todos los meses deja
    // de significar algo el día que importa. El rótulo dice lo mismo, con las mismas palabras.
    assert.equal(estado(mes), 'proyección · firmado hasta 08/2026',
      `${mes}: un mes sin acuerdo se lee igual que uno firmado`)
    assert.notEqual(estado(mes), 'proyección', 'volvió a ser mudo')
    assert.notEqual(estado(mes), '', 'se apagó en silencio, que es peor que ser mudo')
  }
  // UN MES PAGADO NO ARRASTRA ESCALÓN: es un hecho y no tiene proyección adentro.
  assert.equal(estado(6), 'pagado')
  assert.equal(estado(7), 'pagado', 'el mes base es un hecho, no una proyección')
  // Y UN MES ANTERIOR AL BASE QUE LA PLANILLA NUNCA CARGÓ DECLARA SU OTRO CRITERIO: su importe es la
  // base DEFLACTADA, no ajustada hacia adelante. "proyección" a secas se leía como un olvido de carga.
  assert.equal(estado(3), 'proyección · antes del mes base')
  // Y NINGUNO SE PASA DEL TOPE DE LA GRILLA: la columna «Estado» está en el MEDIO, y ahí un texto
  // largo desparrama la fila (regla `nota-en-el-medio` de auditarPatron).
  for (let mes = 1; mes <= 12; mes++) {
    assert.ok(estado(mes).length <= 60, `${mes}: "${estado(mes)}" mide ${estado(mes).length}`)
  }
})

test('OFICINA · EL RIGOR NO SE PAGA CON UNA COLUMNA: OFICINA_PROYECTADO no se movió', () => {
  // El rango alimenta CAJA y los dos cash flows. Publicar el origen del aumento tentaba a agregar las
  // dos columnas que usa el cuadro 4.2 («De dónde sale» y «Estado»), y eso corría «Proyectado» de la
  // H: los consumidores seguirían leyendo el nombre y devolverían otra cosa, sin dar un solo error.
  const d = rangosDeJornales(gm).find((x) => x.nombre === 'OFICINA_PROYECTADO')
  assert.ok(d, 'se cayó OFICINA_PROYECTADO: CAJA y los dos cash flows devuelven 0 sin avisar')
  assert.equal(d.ancla.texto, 'Proyectado', 'el rango dejó de apuntar a la columna del proyectado')
  assert.equal(d.c0, 7, 'el proyectado se corrió de la H: los consumidores leen otra columna')
  assert.equal(d.c1, 7)
  // Y EL ENCABEZADO SIGUE MIDIENDO OCHO. Dos anchos de grilla en el mismo tab es el defecto que el
  // auditor de patrón rechaza y que el dueño llama "descuadrado".
  // El relleno de la fila es el centinela VACIO hasta el ancho físico de la pestaña: lo que se mide es
  // cuántos ENCABEZADOS hay, que es el ancho de la grilla que el lector ve.
  const enc = gm.filas[gm.o0 - 2].filter(tiene)
  assert.equal(enc.length, 8, `el bloque de oficina dejó de medir 8: ${enc.join(' · ')}`)
  assert.deepEqual(enc,
    ['Mes', 'Ajuste escalón', 'Pagado', 'Estado', 'Se paga el', 'Banco', 'Adelanto', 'Proyectado'])
})

test('OFICINA · EL PISO: hacia adelante el sueldo nominal no baja, hacia atrás sí', () => {
  // ═══ POR QUÉ HAY PISO Y CUÁL ES (14/08) ═══
  //
  // Obreros tiene el piso del convenio. Buscado en todo el repositorio: no hay escala publicada para
  // el personal administrativo —las cinco categorías de la réplica son de obra—, así que Oficina NO
  // tiene piso de convenio y la pestaña lo declara en vez de dejar el hueco mudo.
  //
  // El que sí existe es aritmético: `base × factor` con el factor viniendo de una celda que puede dar
  // menos de 1 (el parámetro PARITARIA_UOCRA_PROYECTADA es del dueño y es editable) o no ser un
  // número (y entonces la multiplicación cruda da CERO, que se lee como un mes sin sueldo y viaja a
  // la caja). Sin `MAX(1;…)` este test se pone rojo.
  const proy = (mes) => String(gm.filas[gm.o0 - 1 + mes - 1][7])
  // El mes base de la fixture es JULIO (la planilla cierra el 31/07). De agosto a diciembre, con piso.
  for (const mes of [8, 9, 10, 11, 12]) {
    assert.match(proy(mes), /MAX\(1;B\d+\)/, `${mes}: la proyección puede caer por debajo del último mes pagado`)
  }
  // ANTES DEL MES BASE NO HAY PISO, y no es un olvido: un mes que la planilla nunca cargó se proyecta
  // deflactando la base, y ahí un factor menor que 1 es lo correcto —en marzo se cobraba menos—.
  for (const mes of [1, 2, 3, 4, 5]) {
    assert.doesNotMatch(proy(mes), /MAX\(1;/, `${mes}: un mes anterior al base quedó sobreestimado por el piso`)
  }
  // `MAX(1;…)` y NUNCA `MAX(1,0;…)`: un literal decimal escrito por API viaja en el locale es_AR del
  // archivo, donde la coma separa argumentos, y la celda queda en #ERROR.
  for (let mes = 1; mes <= 12; mes++) assert.doesNotMatch(proy(mes), /\d,\d/, `${mes}: decimal con coma dentro de la fórmula`)
})

test('OFICINA · el driver NO se declara en prosa: lo publica la columna «Ajuste escalón»', () => {
  // La línea «· Aumenta por el mismo % que obra — sin piso propio» se retiró el 09/09/2026. Decía en
  // palabras lo que la columna B publica con cuatro decimales, mes por mes: que oficina sube por el
  // MISMO factor de escalón que obra. Y que no tiene piso propio no es información que el cuadro
  // pueda contestar —no hay escala de administración en ninguna fuente del OS— así que anunciarlo era
  // explicar una ausencia. El porqué completo sigue en `lib/oficina-escalon.mjs`.
  assert.ok(!gm.filas.some((f) => /sin piso propio|Aumenta por el mismo/.test(String(f[0] ?? ''))),
    'volvió la glosa del driver arriba del cuadro de oficina')
  // Y EL DRIVER SIGUE SIENDO EL MISMO QUE EL DE OBRA, que es lo que la glosa afirmaba: el factor de
  // cada mes sale del cuadro 2.2, no de una fórmula propia. Si se separaran, la pestaña tendría dos
  // definiciones de «cuánto suben los sueldos».
  for (const mes of [9, 10, 11, 12]) {
    const factor = String(gm.filas[gm.o0 - 1 + mes - 1][1])
    assert.match(factor, new RegExp(`\\$E\\$${gm.esc.f0}:\\$E\\$${gm.esc.f1}`),
      `${mes}: el ajuste de oficina dejó de salir del cuadro del escalón`)
  }
})

test('UN MES DE OFICINA A MEDIO CARGAR NO PUEDE SER LA BASE DE LOS QUE SIGUEN', () => {
  // ═══ EL DEFECTO, MEDIDO EN LA PESTAÑA VIVA (13/08) ═══
  // La planilla llegaba al 15/08 y agosto figuraba "pagado $814.500" —media quincena—. La base de la
  // proyección era "la última celda con dato", así que septiembre a diciembre salían $830k, $846k,
  // $862k y $878k contra los ~$3,5M que promedian los meses cerrados: la oficina venía proyectada
  // CUATRO VECES por debajo, y el cash flow leía ese número por rango con nombre.
  const g2 = grilla({
    bloques: BLOQUES, pendientes: PEND,
    bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }, { mes: 7, inicio: 12, fin: 15 }, { mes: 8, inicio: 20, fin: 23 }],
    ultimoDiaOfi: new Date(2026, 7, 15), escalones: ESC, bloqueBase: BLOQUES[1],
    categorias: ['OF'], personasBase: 16, escalonVigente: escalonDe(ESC, '2026-08'),
    meses: mesesDelMotor(new Date(2026, 6, 31), PEND, [new Date(2026, 7, 15)]), hoy: HOY,
  })
  const filaDe = (mes) => g2.filas[g2.o0 - 1 + mes - 1]
  // Julio está cerrado; agosto está a medias y lo dice.
  //
  // CAMBIO DE CONTRATO (14/08): el «Estado» de un mes NO cerrado dice además de dónde sale su aumento
  // (`parcial · Ac.Mayo 2026`), así que la igualdad exacta pasó a prefijo. Lo que se mide sigue siendo
  // lo mismo: que agosto no se declare pagado con la planilla al 15.
  assert.equal(String(filaDe(7)[3]), 'pagado')
  assert.ok(String(filaDe(8)[3]).startsWith('parcial'), 'agosto sigue declarándose pagado con la planilla al 15')
  const rJulio = g2.o0 + 6
  // La base de TODOS los meses proyectados es julio —el último CERRADO—, no agosto. Y desde el 14/08
  // el factor va con su piso: hacia adelante un sueldo nominal no baja (ver lib/oficina-escalon.mjs).
  for (const mes of [9, 10, 11, 12]) {
    assert.match(String(filaDe(mes)[7]), new RegExp(`^=\\$C\\$${rJulio}\\*MAX\\(1;B`), `${mes}: la base no es el último mes cerrado`)
  }
  // Y agosto proyecta sólo lo que le falta, sin perder lo que ya se pagó ni generar un negativo.
  assert.equal(String(filaDe(8)[7]), `=MAX(0;$C$${rJulio}*MAX(1;B${g2.o0 + 7})-N(C${g2.o0 + 7}))`)
  // El ajuste de escalón del mes parcial también se mide desde julio: con la base vieja, agosto
  // recibía factor 1 sobre un mes que ya no era el suyo.
  assert.match(String(filaDe(8)[1]), /MATCH\(EOMONTH\(DATE\(2026;8;1\);0\)/)
  assert.match(String(filaDe(8)[1]), /EOMONTH\(DATE\(2026;7;1\);0\)/)
})


test('NINGUNA COLUMNA DE TEXTO ALINEADA A LA DERECHA — el texto se derramaba sobre el número de al lado', () => {
  // ═══ VISTO EN EL PDF PUBLICADO (13/08) ═══
  // «-16,7%» encima de «ebajo del convenio» en 1.1, y «mes base: factor 1,» cortado en 1.2. No era el
  // ancho: el barrido de moneda alinea a la DERECHA toda la grilla de la B en adelante, y una celda de
  // texto alineada a la derecha con OVERFLOW_CELL se derrama hacia la izquierda, sobre el número que
  // sí tiene contenido. A la derecha de estas columnas no hay nada hasta la N.
  const reqs = requestsDeFormato(1, gm.filas, gm)
  const alineacionDe = (fila, col) => {
    let v = null
    for (const r of reqs) {
      const g2 = r.repeatCell
      if (!g2 || !g2.range) continue
      const { startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 } = g2.range
      if (fila - 1 < r0 || fila - 1 >= r1 || col < c0 || col >= c1) continue
      const a = g2.cell?.userEnteredFormat?.horizontalAlignment
      if (a) v = a
    }
    return v
  }
  // ═══ EL FORMATO ESTÁ INDEXADO POR NÚMERO DE COLUMNA Y NO SABE QUE CAMBIÓ DE DUEÑO (29/08) ═══
  //
  // La columna 6 de 1.1 era «Margen» —un ratio, pintado PERCENT— y con el rehacer pasó a ser
  // «Aumento $/hora». El `fmt` no se movió: los $3.174 de un Oficial se habrían dibujado
  // «317400,0%» en la pestaña, con el número correcto adentro de la celda. Ninguna prueba de
  // fórmulas lo ve —la fórmula está bien— y la corrida no lo imprime. Este assert es lo único que
  // puede notarlo sin abrir el archivo.
  const formatoDe = (fila, col) => {
    let v = null
    for (const r of reqs) {
      const g2 = r.repeatCell
      if (!g2?.range) continue
      const { startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 } = g2.range
      if (fila - 1 < r0 || fila - 1 >= r1 || col < c0 || col >= c1) continue
      const f = g2.cell?.userEnteredFormat?.numberFormat
      if (f) v = f
    }
    return v
  }
  assert.equal(formatoDe(gm.plantel.fPrimera, 6)?.type, 'CURRENCY',
    'el aumento de la hora se está dibujando como porcentaje: $3.174 se lee «317400,0%»')
  assert.equal(formatoDe(gm.plantel.fPrimera, 1)?.type, 'NUMBER', 'las personas dejaron de ser un entero')

  // 1.1 · «Convenio» (columna del dueño) y «Estado».
  for (const col of [4, 7]) {
    assert.equal(alineacionDe(gm.plantel.fPrimera, col), 'LEFT', `1.1 col ${col}: el texto vuelve a taparle el número a la izquierda`)
    assert.equal(alineacionDe(gm.plantel.fTotal, col), 'LEFT', `1.1 total col ${col}`)
  }
  // 1.2 · «Escalón publicado», «De dónde sale» y «Estado».
  for (const col of [1, 6, 7]) {
    assert.equal(alineacionDe(gm.esc.f0, col), 'LEFT', `1.2 col ${col}: el texto vuelve a taparle el número a la izquierda`)
    assert.equal(alineacionDe(gm.esc.f1, col), 'LEFT', `1.2 última fila col ${col}`)
  }
  // Y la plata sigue a la derecha: la corrección no puede desalinear la columna de importes.
  assert.equal(alineacionDe(gm.esc.f0, 5), 'RIGHT', 'la Σ $/hora de 1.2 se fue a la izquierda')
})

test('MINIMALISMO: NINGÚN RÓTULO DE LA COLUMNA A PASA DE 60 CARACTERES', () => {
  // ═══ EL TEST QUE HABÍA MEDÍA SI LA GLOSA ENTRABA; EL DUEÑO SE QUEJÓ DE QUE EXISTIERA (13/08) ═══
  //
  // Acá vivía un tope de 290 caracteres —el ancho físico de la fila, 330px de la A más trece de 112—.
  // Con ese tope la pestaña pasaba en verde con 3.118 caracteres de párrafo en la columna A, que es
  // exactamente lo que el dueño rechazó: *"tiene muchas palabras y frases y explicación que nadie
  // lee"*. "Entra en la fila" nunca fue el estándar; el estándar es que no haya nada que leer.
  //
  // 60 es `LARGO_NOTA`, el umbral que este repo ya usaba para decir que un texto DEJÓ DE SER UN RÓTULO
  // y pasó a ser una nota. No es un número nuevo: es el mismo, aplicado a la columna que lo tenía
  // exceptuado.
  //
  // Y SE MIDE ADENTRO DE LAS FÓRMULAS. Las dos glosas más largas que rechazó el dueño —el supuesto del
  // convenio (374) y la equivalencia de categorías (172)— eran literales dentro de un `=IF(…)`: el
  // test viejo las salteaba con `if (a.startsWith('='))` y por eso nunca las vio.
  const largas = glosasLargas(gm.filas)
  assert.deepEqual(largas, [],
    largas.map((x) => `fila ${x.fila}: ${x.largo} caracteres — "${x.texto.slice(0, 80)}…"`).join('\n'))
})

test('el rediseño no se puede deshacer por una glosa: el tope vale para las TRES fixtures', () => {
  // La misma medida sobre las variantes que disparan las ramas de error —sin escala, sin acuerdo, sin
  // meses de oficina—: son justamente las que traían los párrafos más largos, porque un mensaje de
  // alarma es donde más tienta explicarse. Si una rama vuelve a la prosa, esto se pone rojo.
  const sinEscala = grilla({
    bloques: BLOQUES, pendientes: PEND, bloquesOfi: [],
    escalones: [], bloqueBase: BLOQUES[1], categorias: ['OF'], personasBase: 16,
    escalonVigente: null, meses: mesesDelMotor(new Date(2026, 6, 31), PEND, [new Date(2026, 6, 31)]), hoy: HOY,
  })
  for (const [nombre, g] of [['sin escala', sinEscala], ['con motor', gm]]) {
    const largas = glosasLargas(g.filas)
    assert.deepEqual(largas, [], `${nombre} · ${largas.map((x) => `fila ${x.fila}: ${x.largo} — "${x.texto.slice(0, 80)}…"`).join('\n')}`)
  }
})

test('la medida ve el texto ADENTRO de la fórmula — si no, el párrafo vuelve por esa puerta', () => {
  // El control del control: sin esto, `glosasLargas` daría cero sobre una pestaña llena de párrafos
  // escondidos en literales, que es exactamente el estado del que se partió.
  const conParrafo = [['t'], ['sub'], [`=IF(A1=0;"${'x'.repeat(120)} palabras";"corto")`]]
  const d = glosasLargas(conParrafo)
  assert.equal(d.length, 1, 'una glosa de 128 caracteres adentro de un IF pasó como si no existiera')
  assert.equal(d[0].fila, 3)
  // Y una máscara de formato larga NO es una glosa: sin el filtro, `TEXT(x;"#,##0")` daría falso rojo.
  assert.deepEqual(glosasLargas([['t'], ['sub'], [`=TEXT(A1;"${'#,##0'.repeat(20)}")`]]), [])
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PEDIDO DEL 03/08, QUE ESTUVO CUATRO MESES SIN EJECUTAR
//
// *"el valor q me mostras de la quincena es el estimado, quiero ese y el real"*.
//
// Lo que hacía imposible contestarlo hasta el 14/08 es que el único origen del número era JORNALES:
// "estimado" y "real" eran la misma celda leída dos veces. Ahora el extracto del Santander prueba la
// mitad bancaria, y estos controles existen para que ese real NO pueda volver a salir de la planilla.
// ═══════════════════════════════════════════════════════════════════════════════════════════════







// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE SE PUBLICÓ MUDO (15/08): EL ANCLA VACÍA, Y LA GEOMETRÍA QUE TIENE QUE SEGUIR AL REGISTRO
//
// El cuadro salió con el estimado y sin el real, diciendo "el extracto todavía no los muestra". Era
// falso. El ancla era `$B$fReg` —la columna «Hasta»— y de las quince filas del registro OCHO tienen
// `=""` ahí, incluida la última. Con `N($B$148)=0` las cuatro celdas del renglón se apagaban solas.
//
// Y el segundo control es el de la lección ya escrita en este repo: anclar en "el último" es anclar
// en la posición. Un rango con nombre que no CREZCA con su bloque señala a enero para siempre.
// ═══════════════════════════════════════════════════════════════════════════════════════════════



test('RANGOS · cada nombre publicado CRECE con su bloque — no se queda en la primera fila', () => {
  // ═══ LA LECCIÓN QUE ESTE TEST FIJA ═══
  //
  // "Anclar en 'el último' es anclar en la posición". Un rango con nombre que apunta a una fila fija
  // dentro de una tabla que crece hacia abajo señala a enero para siempre, y nadie se entera: lo que
  // lo consume devuelve un número perfectamente plausible.
  //
  // Se mide comparando DOS grillas que sólo difieren en una quincena más. Cada rango del registro
  // tiene que valer una fila más y terminar en la última quincena, no en la primera.
  const conUna = grilla({ bloques: BLOQUES, pendientes: PEND, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }] })
  const conDos = grilla({
    bloques: [...BLOQUES, { filaFecha: 60, inicio: 61, fin: 74 }],
    pendientes: PEND, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }],
  })
  const mapa = (g) => new Map(rangosDeJornales(g).map((r) => [r.nombre, r]))
  const a = mapa(conUna)
  const b = mapa(conDos)
  const delRegistro = [...a.keys()].filter((n) => n.startsWith('JORNALES_REAL_'))
  assert.ok(delRegistro.length >= 8, 'se perdieron los rangos del registro')
  for (const n of delRegistro) {
    // 1. Termina en la ÚLTIMA quincena del registro, nunca antes.
    assert.equal(a.get(n).r1, conUna.fLast, `${n} no llega a la última quincena`)
    assert.equal(b.get(n).r1, conDos.fLast, `${n} no llega a la última quincena`)
    // 2. Vale una fila más cuando entra una quincena más: eso es lo que prueba que no está clavado.
    assert.equal(b.get(n).r1 - b.get(n).r0, a.get(n).r1 - a.get(n).r0 + 1, `${n} no creció con el registro`)
    // 3. Y NUNCA es una sola fila: un rango de una fila sobre una tabla de quince es el defecto.
    assert.ok(a.get(n).r1 > a.get(n).r0, `${n} quedó reducido a una fila`)
  }
  // Los otros tres bloques, con el mismo criterio: cada rango cubre su bloque entero.
  const bloque = { JORNALES_PROY_: [conUna.p0, conUna.p0 + conUna.nProy - 1], OFICINA_: [conUna.o0, conUna.oFin], DIRECCION_: [conUna.d0, conUna.dFin] }
  for (const [prefijo, [r0, r1]] of Object.entries(bloque)) {
    const suyos = [...a.values()].filter((r) => r.nombre.startsWith(prefijo))
    assert.ok(suyos.length, `no hay ningún rango ${prefijo}*`)
    for (const r of suyos) {
      assert.equal(r.r0, r0, `${r.nombre} no arranca donde su bloque`)
      assert.equal(r.r1, r1, `${r.nombre} no termina donde su bloque`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL PISO DEL CONVENIO, CABLEADO: que las dos entradas nuevas lleguen a la celda (27/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Las reglas viven en lib/jornales-piso-uocra.mjs y su test las prueba. Lo que se prueba ACÁ es el
// cableado, que es donde el arreglo se puede perder sin que nada se ponga rojo: la fila de la jornada,
// que la columna «Obreros» la use, y que el control mire las celdas testigo. Un revert de la llamada
// deja las libs intactas y el número corto — exactamente el modo en que este defecto llegó a agosto.

test('LA JORNADA VIVE EN «Parámetros», con rótulo y rango con nombre — no como tres cifras sueltas', () => {
  // ═══ EL RECLAMO, TEXTUAL (09/09/2026) ═══
  //
  // El dueño listó lo que había que sacar de la pestaña y ahí estaba: *«900,0% | 8 | $4 | sábado
  // supuesto»*. Eran las tres celdas de la jornada —9, 8 y 4— en una fila de una pestaña donde todo
  // lo demás es plata: el barrido de moneda las dibujaba como pesos y como porcentaje, y la glosa de
  // al lado era la cuarta cosa en el mismo renglón.
  //
  // NO SE PIERDEN. Son ENTRADAS del dueño —el sábado sobre todo, que es un SUPUESTO y no una regla
  // declarada— y su lugar es la pestaña de entradas. Un criterio que sólo se puede cambiar editando
  // JavaScript no se cambia: envejece.
  assert.ok(!gm.filas.some((f) => /Horas de jornada/.test(String(f[0] ?? ''))),
    'volvió la fila de la jornada al medio de la pestaña')
  assert.ok(!gm.filas.flat().map(String).join(' ').includes('sábado supuesto'),
    'volvió la glosa del supuesto del sábado a una celda')
  // Las tres filas se aseguran en «Parámetros» con su rótulo, su valor y su nota, y cada una publica
  // su rango con nombre: la fórmula que las use las lee por NOMBRE, no por número de fila.
  // `ubicarParametros` con su lista por defecto es LO QUE EL GENERADOR ASEGURA en cada corrida: si
  // las tres no están ahí, la pestaña las perdió y nadie puede cambiarlas sin tocar código.
  const rangos = ubicarParametros([]).map((p) => p.rango)
  for (const n of ['JORNADA_LUNES_JUEVES', 'JORNADA_VIERNES', 'JORNADA_SABADO']) {
    assert.ok(rangos.includes(n), `el parámetro ${n} no se asegura en «Parámetros»`)
  }
  assert.deepEqual(PARAMETROS_JORNADA.map((p) => p.valor), [9, 8, 4],
    'los valores de la jornada del dueño cambiaron sin decirlo')
  // Y la nota del sábado tiene que seguir declarando que es un SUPUESTO: es lo único que separa un
  // dato de una hipótesis en esa fila.
  assert.match(PARAMETROS_JORNADA[2].nota, /SUPUESTO/)
})

test('LA COLUMNA «Obreros» PROYECTA CON LAS HORAS MEDIDAS DE LOS DOS LADOS DE LA FRONTERA (07/09/2026)', () => {
  // Hasta hoy la rama de "lo que se debe" multiplicaba la Σ del convenio por la jornada plena (9/8/4 h
  // por día de semana, sin ausentismo). Esa celda es la que el libro toma como jornal PROYECTADO y la
  // que Cargas Sociales usa de base: con el plantel de 15 publicaba $9,9M–$11,3M por quincena para
  // oct–dic, entre 2 y 2,5 veces lo que salió de la caja en cada mes de 2026. Un cash flow es
  // percibido: proyecta lo que va a salir, calibrado con las quincenas cerradas, no la obligación
  // teórica a asistencia perfecta. La base sí cambia en la frontera (pactada → con aumento).
  const medidas = gm.filas.findIndex((f) => String(f[0] ?? '').includes('Horas por persona y día')) + 1
  const iTotal = colDe('Total').charCodeAt(0) - 65
  assert.equal(gm.filas[gm.f0 - 2][iTotal], 'Total', 'no está el encabezado de la grilla de quincenas')
  const proyectada = String(gm.filas[gm.p0 - 1][iTotal] ?? '')
  // Las horas MEDIDAS aparecen en las DOS ramas, multiplicando días L-V.
  assert.equal(proyectada.split(`$B$${medidas}*NETWORKDAYS.INTL(`).length - 1, 2,
    `las dos ramas tienen que llevar horas medidas: ${proyectada.slice(0, 220)}`)
  // La jornada plena y sus máscaras por día de semana NO entran a la celda que el libro lee. Desde
  // el 09/09/2026 la jornada vive en «Parámetros», así que se buscan sus NOMBRES y sus máscaras.
  for (const x of ['JORNADA_LUNES_JUEVES', 'JORNADA_VIERNES', 'JORNADA_SABADO', '"0000111"', '"1111011"', '"1111101"']) {
    assert.ok(!proyectada.includes(x), `la jornada plena (${x}) volvió a la proyección: ${proyectada.slice(0, 200)}`)
  }
  // La frontera sigue siendo UNA y decide la base.
  assert.equal(proyectada.split('EOMONTH(TODAY();0)').length - 1, 1)
  // La comprobación de que la jornada seguía viva en el control del piso se fue con ese control
  // (09/09/2026): publicaba «▲ la proyección se mide con 007 h y la jornada es 008 h» todos los días
  // y el dueño lo mandó sacar. La jornada sigue gobernando la obligación desde `lib/jornada-uocra.mjs`.
})


test('el plantel del piso sale de la quincena EN CURSO y el cuadro 4.1 lo dice', () => {
  const t = gm.filas.map((f) => String(f[0] ?? ''))
  assert.ok(t.some((s) => s.includes('Plantel vigente')),
    'el título del 4.1 volvió a nombrar la quincena cerrada sobre el plantel de hoy')
  // Y con el bloque abierto sin gente el rótulo cambia: un título fijo miente en uno de los dos casos.
  const gc = conMotor({ origenPlantel: 'cerrada' })
  assert.ok(gc.filas.map((f) => String(f[0] ?? '')).some((s) => s.includes('Plantel de la última cerrada')))
})
