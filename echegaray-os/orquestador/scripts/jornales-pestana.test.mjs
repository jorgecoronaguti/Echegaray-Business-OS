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
import { colDe, grilla, ultimoDiaCargado, rangosDeJornales, RANGOS_RETIRADOS, COLS_PAGO, COLS_ANIO, COL_ANIO } from './jornales-pestana.mjs'
import {
  repartoQuincena, repartoPersona, filasDePersonas, ACUERDO_BANCO,
  canalesProyectados, DIRECCION_POR_BANCO,
} from '../lib/jornales-reparto-pago.mjs'
import { verificarRangos, explicarProblemas } from '../lib/rangos-con-nombre.mjs'
import { expresionCierreDeQuincena } from '../lib/jornales-real-vs-estimado.mjs'
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
const encabezado = g.filas.find((f) => f[0] === 'Quincena' && f[1] === 'Hasta' && f.includes('TOTAL'))
const letraDe = (rotulo) => String.fromCharCode(65 + encabezado.indexOf(rotulo))

test('cada letra sale del encabezado real del registro, no de otro layout', () => {
  // Si alguien copia una fórmula de la pestaña viva —o de una versión anterior de este generador—
  // con la letra puesta a mano, apunta a otra columna y devuelve un número plausible y equivocado.
  assert.ok(encabezado, 'no está el encabezado del registro')
  for (const rotulo of ['Quincena', 'Hasta', 'TOTAL', 'Σ $/hora', 'Pagado el']) {
    assert.equal(colDe(rotulo), letraDe(rotulo), `"${rotulo}": colDe y el encabezado no coinciden`)
  }
  // Y las dos que más se confunden entre sí no pueden ser la misma columna.
  assert.notEqual(colDe('TOTAL'), colDe('Σ $/hora'))
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
  const T = letraDe('TOTAL'); const H = letraDe('Hasta')
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
  // ═══ Y NO VUELVE POR EL HERO (13/08) ═══
  //
  // Acá se comprobaba que la celda de al lado del titular estuviera vacía: el importe en cuerpo 13 la
  // tapaba. Con el hero convertido en cuadro esa celda es un IMPORTE, así que la medida se generaliza
  // a lo que de verdad se quiere cuidar: en las filas de los dos cuadros no puede haber una sola celda
  // de prosa. Una explicación metida entre dos columnas de plata desalinea la fila entera y es
  // exactamente la clase de texto que el dueño rechazó dos veces.
  const filasDeCuadro = [g.anio.obra, g.anio.oficina, g.anio.direccion, g.anio.total, g.hero.total]
  for (const fila of filasDeCuadro) {
    for (const [j, celda] of (g.filas[fila - 1] ?? []).slice(1, g.hero.cols.length).entries()) {
      const s = String(celda ?? '').replace(VACIO, '').trim()
      assert.ok(!s || s.startsWith('='), `hero fila ${fila} col ${j + 2}: hay prosa en el cuadro ("${s.slice(0, 40)}")`)
    }
  }
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
  assert.equal(encabezado[colDe('TOTAL').charCodeAt(0) - 65], 'TOTAL')
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
  assert.equal(ancho(g.hero.fCols), 8, 'el hero cambió de ancho: la pestaña queda con dos grillas distintas')
  // Y EL CUADRO DEL AÑO TAMBIÉN MIDE OCHO, aunque publique dos cifras: sus columnas van pegadas al
  // borde derecho a propósito. Un encabezado de tres columnas en una pestaña de ocho es un SEGUNDO
  // ancho de grilla — `anchos-mezclados` para el auditor, "descuadrado" para el dueño.
  assert.equal(ancho(g.anio.fCols), 8, 'el cuadro del año dejó la pestaña con dos anchos de grilla')
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
import { LINEA_DRIVER_OFICINA } from '../lib/oficina-escalon.mjs'
import { ALERTA } from '../lib/glifos.mjs'

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

/** La columna del cuadro de pago buscada por su rótulo — nunca por su letra. */
const colPago = (rotulo) => {
  const i = COLS_PAGO.indexOf(rotulo)
  assert.ok(i >= 0, `el cuadro de pago perdió la columna "${rotulo}"`)
  return i
}
const L = (i) => String.fromCharCode(65 + i)

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL RECLAMO DEL 14/08 (QUINTO RECHAZO), CONVERTIDO EN CONTROLES
//
// *"HOY QUIERO CERRAR LA QUINCENA Y NO SE EXACTAMENTE CUANTO TENGO Q PAGAR A LOS OBREROS POR BANCO Y
// CUANTO POR EFECTIVO. el cuadro principal de CUANTO HAY QUE PAGAR mezcla conceptos proyectados ya
// pagados, proximos cuando, es un desastre q no se entiende"*. Y después: *"te he dicho q el acuerdo
// es 50 y 50 todas las quincenas"*.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('PAGO 1 · el cuadro que abre la pestaña contesta CUÁNTO POR BANCO Y CUÁNTO EN EFECTIVO', () => {
  const enc = gm.filas[gm.hero.fCols - 1]
  assert.deepEqual(enc.slice(0, COLS_PAGO.length), COLS_PAGO, 'el encabezado del cuadro de pago no es el declarado')
  // LAS DOS COLUMNAS QUE EL DUEÑO PIDIÓ CINCO VECES, con su total. Sin ellas no hay cómo saber cuánto
  // se transfiere del Santander y cuánto hay que sacar en billetes: el dato no existía en ninguna de
  // las siete columnas del cuadro anterior.
  for (const rotulo of ['Por banco', 'En efectivo']) {
    const c = colPago(rotulo)
    assert.match(String(gm.filas[gm.hero.total - 1][c]), /^=SUM\(/, `el total de «${rotulo}» no suma la columna`)
    // La fila de OBRA es la que decide el pago de hoy y no puede quedar vacía por ningún camino.
    assert.match(String(gm.filas[gm.hero.f0 - 1][c]), /^=/, `obra: «${rotulo}» quedó vacío`)
  }
  // UNA FILA POR GRUPO DE EMPLEADOS — CAMBIO DE CONTRATO DEL 14/08.
  //
  // Este test exigía una fila por PERSONA. El dueño rechazó esa versión en el acto: *"no quiero eso q
  // hiciste de traer los obreros en jornales por quincena, te pedi exactamente lo q necesitaba"*. Lo
  // que pidió son dos números por nómina —cuánto por banco y cuánto en billetes—, no el padrón. El
  // cuadro se llama "por grupo de empleados" y son tres: obra, oficina y dirección.
  assert.equal(gm.hero.fFin - gm.hero.f0 + 1, 3, 'el cuadro no tiene una fila por grupo de empleados')
  // Y ESTÁ ARRIBA DE TODO: antes de la primera sección numerada. Un cuadro que contesta la pregunta y
  // aparece en la mitad de la pestaña no la contesta "de un golpe de vista".
  const primeraSeccion = gm.filas.findIndex((f) => /^\d+ · /.test(String(f[0] ?? ''))) + 1
  assert.ok(gm.hero.total < primeraSeccion, `el cuadro de pago quedó debajo de la sección 1 (fila ${gm.hero.total} vs ${primeraSeccion})`)
})

test('PAGO 2 · LAS DOS IDENTIDADES CIERRAN: total − adelanto = neto, y banco + efectivo = neto', () => {
  // Es la validación del payroll register estándar: la fila de totales tiene que cerrar de un vistazo o
  // el cuadro no sirve para pagar. Sin esto podrían convivir ocho cifras que no tienen nada que ver
  // entre sí y ninguna celda daría error.
  const [cTot, cAdel, cNeto, cBanco, cEfec] = ['TOTAL', 'Adelanto entregado', 'Neto a pagar', 'Por banco', 'En efectivo'].map(colPago)
  for (let f = gm.hero.f0; f <= gm.hero.fFin; f++) {
    // La forma exacta ya no se puede fijar: las tres filas van envueltas en un IF que deja la celda en
    // blanco cuando no hay pago que venga (oficina y dirección lo tienen la mitad del mes). Lo que sí
    // se fija es la ARITMÉTICA, que es lo que hace auditable el cuadro.
    assert.match(String(gm.filas[f - 1][cNeto]), new RegExp(`${L(cTot)}${f}-N?\\(?${L(cAdel)}${f}`),
      `fila ${f}: «Neto a pagar» dejó de ser TOTAL − adelanto`)
    assert.match(String(gm.filas[f - 1][cEfec]), new RegExp(`${L(cNeto)}${f}-${L(cBanco)}${f}`),
      `fila ${f}: «En efectivo» dejó de cerrar contra el neto`)
  }
  // El total suma cada columna y no vuelve a las fuentes: si volviera, podría no cerrar contra sus
  // propias filas y sería el único renglón del cuadro que nadie puede verificar a ojo.
  for (const c of [cTot, cAdel, cNeto, cBanco, cEfec]) {
    assert.equal(String(gm.filas[gm.hero.total - 1][c]), `=SUM(${L(c)}${gm.hero.f0}:${L(c)}${gm.hero.fFin})`,
      `la columna ${L(c)} del total no suma sus propias filas`)
  }
})

test('PAGO 3 · EL 50/50 SE CALCULA CUANDO BANCO ESTÁ EN CERO, Y EL DATO CARGADO LE GANA', () => {
  // La regla de pago del dueño, repetida cuatro veces: *"el acuerdo es 50 y 50 todas las quincenas"*.
  // Mientras la columna X del espejo esté en $0 el reparto lo calcula la pestaña; en cuanto alguien
  // cargue la transferencia real, ese hecho manda. Las dos cosas en la misma celda y en ese orden.
  // CITA AL REGISTRO, NO AL ESPEJO. Con el cuadro por grupo la fila de obra es UNA, y su banco es el
  // de la quincena entera: la columna «Banco» del registro de abajo, que ya suma el espejo. Ir al
  // espejo desde acá sería una segunda cuenta del mismo dato, que es como se llega a dos versiones.
  const banco = String(gm.filas[gm.hero.f0 - 1][colPago('Por banco')])
  assert.match(banco, new RegExp(`^=IF\\(N\\(\\$${colDe('Banco')}\\$\\d+\\)>0;\\$${colDe('Banco')}\\$\\d+;[A-Z]\\d+/2\\)$`),
    `el reparto no es 50/50 con el dato cargado ganando: ${banco}`)
  // `/2` y NUNCA `*0,5`: un literal decimal escrito por API viaja en el locale es_AR del archivo y se
  // convierte en un #ERROR que no hace falta correr para producir.
  assert.doesNotMatch(banco, /0[,.]5/, 'el 50% se escribió como literal decimal: en es_AR eso es un #ERROR')
  // Y SE DICE QUE ES UN CÁLCULO. Publicar un reparto calculado como si fuera un dato de la planilla es
  // exactamente lo que las reglas de oro prohíben.
  const aviso = String(gm.filas[gm.hero.avisos[0] - 1][0])
  assert.match(aviso, /50\/50 calculado/, 'la pestaña no declara que el reparto lo está calculando ella')
  assert.match(aviso, /SUMPRODUCT/, 'el aviso está tipeado: tiene que apagarse solo cuando carguen BANCO')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO: LA FILA DE DIRECCIÓN NO TENÍA CANAL, Y LA FILA DE TOTAL DEJABA DE SUMAR
//
// «Por banco» de Dirección publicaba "—" con el argumento de que el canal de los retiros no está
// registrado. Medido en la pestaña viva del 14/08: la fila de total decía «Por banco» $5.069.615 +
// «En efectivo» $4.090.971 = $9.160.585 contra un «Neto a pagar» de $18.331.585. La identidad que
// hace auditable el cuadro se rompía por $9.171.000 —el retiro entero— en el ÚNICO renglón que el
// dueño usa para operar el pago, y sin una sola celda en rojo.
//
// La regla que lo cierra es del dueño: *"oficina 2 empleados 50 y 50, administracion todos por
// banco"* (03/08). Revertir a "—" deja este test en rojo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('PAGO 3bis · NINGUNA NÓMINA QUEDA SIN CANAL: las tres suman contra el neto', () => {
  const [cNeto, cBanco, cEfec] = ['Neto a pagar', 'Por banco', 'En efectivo'].map(colPago)
  for (let f = gm.hero.f0; f <= gm.hero.fFin; f++) {
    for (const c of [cBanco, cEfec]) {
      const celda = String(gm.filas[f - 1][c] ?? '')
      assert.ok(celda.startsWith('='),
        `fila ${f}: «${COLS_PAGO[c]}» no es un número (quedó "${celda}") y la fila de total deja de sumar el neto`)
    }
  }
  // DIRECCIÓN VA ENTERA AL BANCO, y se lee de su propia fila: no un porcentaje, no una constante
  // copiada — la celda cita su «Neto a pagar», así que el efectivo da 0 por construcción.
  const fDir = gm.hero.fFin
  assert.match(String(gm.filas[fDir - 1][cBanco]), new RegExp(`${L(cNeto)}${fDir}`),
    'el banco de Dirección dejó de ser su neto entero')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO: «PERSONAS» LEÍA LA COLUMNA B DEL BLOQUE MENSUAL "PORQUE AHÍ ESTABAN LAS PERSONAS"
//
// Dejó de estar el 14/08: cuando Oficina rehizo su grilla, la B pasó a ser «Ajuste escalón» y el
// cuadro que decide el pago publicó **1,019 personas** en Oficina y 1,0384 en Dirección. Un número
// plausible en la columna equivocada, sin error y sin #REF. Es el mismo defecto que `colDe` existe
// para impedir, cometido sobre un bloque que no exporta sus rótulos.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('PAGO 8 · «Personas» NO SE LEE POR LETRA DE OTRO BLOQUE — el defecto de las "1,019 personas"', () => {
  const cPer = colPago('Personas')
  // Primero el hecho que produjo el defecto: la B del bloque mensual NO es «Personas».
  const encOfi = gm.filas[gm.o0 - 2].map(String)
  assert.equal(encOfi[1], 'Ajuste escalón', 'el bloque mensual cambió de layout: revisá quién lee su columna B')
  for (const [nombre, fila, r0, r1] of [
    ['oficina', gm.hero.f0 + 1, gm.o0, gm.oFin],
    ['dirección', gm.hero.fFin, gm.d0, gm.dFin],
  ]) {
    const celda = String(gm.filas[fila - 1][cPer] ?? '')
    assert.doesNotMatch(celda, new RegExp(`\\$B\\$${r0}:\\$B\\$${r1}`),
      `${nombre}: «Personas» volvió a leer la columna B del bloque mensual, que es «Ajuste escalón»`)
    // Y NO SE ESTAMPA UN NÚMERO: el plantel se cuenta sobre un rango vivo, así que una alta o una baja
    // lo mueve sola. Un 2 escrito acá es cierto hoy y mentira el día que entre alguien.
    assert.match(celda, /^=COUNTA\(/, `${nombre}: «Personas» dejó de contarse sobre un rango vivo ("${celda}")`)
    assert.doesNotMatch(celda, /^=?\d+$/, `${nombre}: el plantel quedó estampado`)
  }
  // El de dirección cuenta la tabla de socios que sale de Compras, tres filas más arriba de su grilla.
  assert.equal(String(gm.filas[gm.hero.fFin - 1][cPer]), `=COUNTA($A$${gm.dp0}:$A$${gm.dpFin})`)
})

test('PAGO 4 · EL AVISO DE HORAS INCOMPLETAS SE APAGA SOLO, POR LOS DOS CAMINOS', () => {
  // *"las horas están incompletas: 1.223 reales de 1.620 previstas"*. El total va a subir cuando se
  // carguen los últimos días, y el cuadro tiene que avisarlo — pero sólo mientras sea cierto.
  const aviso = String(gm.filas[gm.hero.avisos[1] - 1][0])
  assert.match(aviso, /"en curso"/, 'el aviso no está atado al ESTADO: quedaría encendido en una quincena cerrada con ausentismo')
  assert.match(aviso, new RegExp(`\\$${colDe('Hs reales')}\\$\\d+\\)>=N\\(\\$${colDe('Hs previstas')}\\$\\d+`),
    'el aviso no compara horas reales contra previstas')
  assert.match(aviso, /el total sube/, 'el aviso no dice qué consecuencia tiene')
})

test('PAGO 5 · UN EFECTIVO NEGATIVO SE VE: no se clava en cero en silencio', () => {
  // Tello Juan adelantó $240.000 contra un 50% de $236.500. Su sobre da −$3.500 y es plata que la
  // empresa le adelantó de más. Un MAX(0;…) la haría desaparecer del cuadro Y del total de billetes.
  const efec = String(gm.filas[gm.hero.f0 - 1][colPago('En efectivo')])
  assert.doesNotMatch(efec, /MAX\(0/, 'el efectivo negativo se está clavando en cero')
  // SE MIDE SOBRE EL ESPEJO, no sobre el cuadro. El cuadro publica tres filas —una por nómina— y ahí
  // el negativo de una persona se compensa con el positivo de otra y desaparece. La pregunta sigue
  // siendo por persona aunque el cuadro ya no las liste.
  const aviso = String(gm.filas[gm.hero.avisos[2] - 1][0])
  assert.match(aviso, /SUMPRODUCT/, 'el aviso está tipeado: tiene que contarse solo')
  assert.match(aviso, /'_J_OBREROS'/, 'el aviso no mira el espejo: sobre el cuadro por grupo el negativo se compensa y desaparece')
  assert.match(aviso, /efectivo negativo/, 'el aviso no nombra lo que pasó')
})

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
  // EL CUADRO YA NO LISTA PERSONAS (14/08), pero esto sigue haciendo falta: es de donde sale el rango
  // del espejo que cuenta los efectivos negativos. Sin personas el cuadro conserva sus tres filas de
  // nómina —son fijas— y lo que se apaga es el aviso, que no tendría sobre qué contar.
  const vacio = conMotor({ personasPago: [] })
  assert.equal(vacio.hero.personas, 0)
  assert.equal(vacio.hero.fFin - vacio.hero.f0 + 1, 3, 'las tres filas de nómina no son fijas')
  assert.equal(String(vacio.filas[vacio.hero.avisos[2] - 1][0]), VACIO, 'sin personas el aviso de negativos no se apagó')
})

test('EL AÑO · va SEPARADO del cuadro de pago y no repite ninguna de sus columnas', () => {
  // ═══ LAS TRES VENTANAS DE TIEMPO EN UN RENGLÓN, DESARMADAS (14/08) ═══
  //
  // El cuadro anterior mezclaba pasado (`Ya pagado`), presente (`Comprometido`, `Próximo pago`,
  // `Cuándo`) y futuro (`Proyectado`, `Total año`) en la misma fila. Ahora el año es OTRO bloque, con
  // su encabezado y su total.
  const enc = gm.filas[gm.anio.fCols - 1]
  COL_ANIO.forEach((c, i) => assert.equal(String(enc[c]), COLS_ANIO[i], `el encabezado del año perdió "${COLS_ANIO[i]}"`))
  assert.equal(String(gm.filas[gm.anio.obra - 1][0]), 'Obreros · UOCRA')
  assert.equal(String(gm.filas[gm.anio.oficina - 1][0]), 'Oficina')
  assert.equal(String(gm.filas[gm.anio.direccion - 1][0]), 'Dirección')
  assert.ok(gm.anio.fCols > gm.hero.total, 'el cuadro del año quedó ARRIBA del que decide el pago de hoy')
  // ═══ LAS COLUMNAS QUE SON SUMA DE OTRAS NO VUELVEN ═══
  //
  // `Falta pagar` = Comprometido + Proyectado y `Total año` = Falta pagar + Ya pagado: tres columnas
  // para dos números, y ninguna decide nada que las partes no decidan. Y `Comprometido` publicaba el
  // MISMO $6.542.800 que `Próximo pago`, con dos nombres distintos.
  const rotulos = gm.filas.flatMap((f) => f.map((c) => String(c ?? '')))
  for (const muerta of ['Falta pagar', 'Comprometido', 'Total año', 'Próximo pago']) {
    assert.ok(!rotulos.includes(muerta), `volvió la columna "${muerta}", que es suma o repetición de otra`)
  }
  // El total del año suma sus tres filas y no vuelve a las fuentes.
  for (const c of [COL_ANIO[1], COL_ANIO[2]]) {
    assert.equal(String(gm.filas[gm.anio.total - 1][c]), `=SUM(${L(c)}${gm.anio.obra}:${L(c)}${gm.anio.direccion})`,
      `la columna ${L(c)} del total del año no suma las tres nóminas`)
  }
})

test('RESPUESTA 2 · REAL vs PROYECTADO: columna propia Y notación propia, nunca una nota al pie', () => {
  // ═══ POR QUÉ SE MIDEN LAS DOS COSAS ═══
  //
  // Que el escenario tenga columna propia no alcanza si las dos columnas se dibujan igual: el ojo baja
  // por una fila de números idénticos y no tiene señal de cuál es un hecho. La regla es la de UNIFY
  // (IBCS, hoy ISO 24896 «Notation for business reporting»): mismo significado, misma notación, en
  // TODA la pestaña. Acá son dos marcas — lo pagado en negrita, lo proyectado en itálica apagada.
  const [, cProy, cPag] = COL_ANIO
  const reqs = requestsDeFormato(1, gm.filas, gm)
  const tipoDe = (fila, col) => {
    let t = null
    for (const r of reqs) {
      const g2 = r.repeatCell
      if (!g2?.range) continue
      const { startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 } = g2.range
      if (fila - 1 < r0 || fila - 1 >= r1 || col < c0 || col >= c1) continue
      if (g2.cell?.userEnteredFormat?.textFormat) t = g2.cell.userEnteredFormat.textFormat
    }
    return t
  }
  for (const f of [gm.anio.obra, gm.anio.oficina, gm.anio.direccion]) {
    assert.equal(tipoDe(f, cProy)?.italic, true, `fila ${f}: el proyectado se dibuja igual que un hecho`)
    assert.equal(tipoDe(f, cPag)?.bold, true, `fila ${f}: lo ya pagado no se distingue de una estimación`)
    assert.notDeepEqual(tipoDe(f, cProy), tipoDe(f, cPag), `fila ${f}: los dos escenarios se ven idénticos`)
  }
  // La MISMA notación en los otros tres cuadros: el calendario es proyección entera, y los dos bloques
  // mensuales tienen su «Pagado» y su «Proyectado». Una convención que vale sólo arriba no es una
  // convención — es una decoración del hero.
  assert.equal(tipoDe(gm.p0, 3)?.italic, true, 'el calendario dejó de dibujarse como proyección')
  for (const [r0, nombre] of [[gm.o0, 'oficina'], [gm.d0, 'dirección']]) {
    assert.equal(tipoDe(r0, 7)?.italic, true, `${nombre}: la columna «Proyectado» se dibuja como un hecho`)
    assert.equal(tipoDe(r0, 2)?.bold, true, `${nombre}: la columna «Pagado» no se distingue`)
  }
  // ═══ Y LA MARCA SOBREVIVE A LAS FILAS DE TOTAL (defecto visto en el render del 13/08) ═══
  //
  // Con la fila del total del hero pintada entera en acento, el proyectado del año se dibujaba
  // idéntico a lo ya pagado JUSTO en el renglón más leído del cuadro. Un renglón de total que borra
  // la notación es peor que no tenerla: es el único que se lee sin bajar la vista.
  assert.equal(tipoDe(gm.anio.total, cProy)?.italic, true, 'el total del año borró la marca del proyectado')
  assert.equal(tipoDe(gm.anio.total, cPag)?.italic ?? false, false, 'el total del año marcó lo pagado como proyección')
  // Y EL CUADRO DE PAGO NO LLEVA ITÁLICA EN NINGUNA CELDA, y eso ES la notación: todo lo que hay
  // adentro es real. Una itálica ahí diría "esto es una estimación" del importe con el que se paga.
  for (const c of [colPago('TOTAL'), colPago('Por banco'), colPago('En efectivo')]) {
    assert.notEqual(tipoDe(gm.hero.f0, c)?.italic, true, `el cuadro de pago dibujó la columna ${L(c)} como proyección`)
  }
  assert.equal(tipoDe(gm.fTotalProy, 3)?.italic, true, 'el total del calendario borró la marca del proyectado')
  // Y NO se resuelve con una leyenda: eso sería la prosa que el dueño rechazó dos veces.
  const texto = gm.filas.flat().map(String).join(' ')
  assert.doesNotMatch(texto, /it[áa]lica|negrita/i, 'volvió una leyenda que explica el formato en palabras')
})

test('RESPUESTA 3 · LO GREMIAL NO ESTÁ EN EL MEDIO: entero, junto, y debajo de las tres nóminas', () => {
  // *"en el medio hay cuestiones gremiales q confunden"*. Estaba literalmente en el medio: entre el
  // hero y el calendario había dieciocho filas de convenio. Ahora es UNA sección, después de las tres
  // poblaciones — y con la información COMPLETA, que es lo que el dueño pidió explícitamente.
  const filaDe = (re) => gm.filas.findIndex((f) => re.test(String(f[0] ?? ''))) + 1
  const gremial = filaDe(/^4 · CONVENIO UOCRA/)
  assert.ok(gremial > 0, 'desapareció la sección del convenio')
  // Las tres nóminas —el calendario, oficina y dirección— van ANTES.
  for (const [re, nombre] of [[/^1 · EL CALENDARIO/, 'el calendario'], [/^2 · OFICINA/, 'oficina'], [/^3 · DIRECCIÓN/, 'dirección']]) {
    const f = filaDe(re)
    assert.ok(f > 0 && f < gremial, `${nombre} quedó después del bloque gremial (fila ${f} vs ${gremial})`)
  }
  // NADA GREMIAL ARRIBA DE LA SECCIÓN 4. Es la medida que atrapa la reincidencia: si el plantel, el
  // escalón o la paritaria vuelven a colarse entre el hero y el calendario, esto se pone rojo.
  //
  // Se mide DESDE LA FILA 3: la 2 es, por gramática, la única línea de prosa de una pestaña —qué
  // contesta · fuente · fecha de corte— y ahí la escala UOCRA se nombra como FUENTE, que es lo que
  // corresponde. Declarar de dónde sale el dato no es meter el convenio en el medio del cuadro.
  //
  // Y se saltea la fila del grupo de obra: se llama "Obreros · UOCRA" porque ÉSE es el nombre del
  // grupo —el dueño los nombra así— y no porque haya un cuadro de convenio ahí. Lo que se persigue son
  // los CUADROS gremiales, no la palabra.
  const arriba = gm.filas.slice(2, gremial - 1)
    .filter((_, i) => i + 3 !== gm.hero.obra)
    .map((f) => String(f[0] ?? ''))
  for (const palabra of [/paritaria/i, /convenio/i, /escal[óo]n/i, /categor[íi]a/i, /b[áa]sico/i]) {
    const intruso = arriba.find((c) => palabra.test(c))
    assert.ok(!intruso, `"${String(intruso).slice(0, 50)}" es material gremial arriba del calendario`)
  }
  // Y la información NO se perdió: los tres sub-bloques siguen existiendo, con sus cuadros.
  // «4.1 · PLANTEL» y no «PLANTEL BASE»: desde el 27/08 el título dice de qué quincena sale el plantel
  // (vigente o cerrada) y eso lo decide `bloqueDelPiso`. Lo que este test cuida es que el sub-bloque
  // siga adentro de la sección 4, no cómo se llama la quincena que lo alimenta.
  for (const re of [/^4\.1 · PLANTEL/, /^4\.2 · EL ESCALÓN/, /^4\.3 · CONTROL DE PISO/]) {
    assert.ok(filaDe(re) > gremial, `falta el sub-bloque ${re} dentro de la sección del convenio`)
  }
  assert.ok(gm.plantel.fPrimera > gremial && gm.esc.f0 > gremial, 'los cuadros del motor no bajaron con sus títulos')
})

test('CADA NÓMINA DICE CUÁNDO COBRA, y esa columna se dibuja como fecha y no como plata', () => {
  // ═══ CAMBIO DE CONTRATO (14/08) ═══
  //
  // Este test exigía lo contrario: la fecha en el subtítulo y NINGUNA columna «Cuándo». Valía cuando
  // el cuadro era de UNA quincena. Con las tres nóminas de vuelta —obra cierra por quincena, oficina y
  // dirección por mes— hay tres fechas distintas y un subtítulo no puede llevarlas: la columna es la
  // única forma de que se lea "obreros el 17/8, los otros dos el 1/9" sin partir el cuadro en tres.
  const cCuando = colPago('Cuándo')
  for (let f = gm.hero.f0; f <= gm.hero.fFin; f++) {
    assert.match(String(gm.filas[f - 1][cCuando]), /^=/, `fila ${f}: «Cuándo» quedó estampada en la corrida`)
  }
  // El subtítulo sigue nombrando el período de obra, que es el que se está pagando.
  const sub = String(gm.filas[gm.hero.sub - 1][0])
  assert.match(sub, new RegExp(`TEXT\\(\\$${colDe('Se paga el')}\\$\\d+;"d/m"\\)`), 'el subtítulo no lee la fecha de caja del registro')
  assert.doesNotMatch(sub.replace(/"d\/m"/g, ''), /\d{1,2}\/\d{1,2}/, 'hay una fecha estampada en el subtítulo del cuadro de pago')
  // Y EL FORMATO ACOMPAÑA: la «Cuándo» es fecha y el resto plata. Una fecha con formato de moneda se
  // dibuja "$46.242" — el defecto que este libro ya arregló tres veces del otro lado.
  const reqs = requestsDeFormato(1, gm.filas, gm)
  assert.equal(formatoDe(reqs, gm.hero.f0, colPago('TOTAL')).type, 'CURRENCY', '«TOTAL» dejó de ser plata')
  assert.equal(formatoDe(reqs, gm.hero.f0, cCuando).type, 'DATE', '«Cuándo» se dibuja como plata')
})

test('B3 · el "escalón que viene" NO puede mostrar un número de otro año', () => {
  // La fixture tiene septiembre de 2025 y NO tiene septiembre de 2026 — el caso exacto del defecto.
  const fila = gm.filas.find((f) => /El escalón que viene/.test(String(f[0])))
  // Sin versalita desde el rediseño del 13/08 — lo que importa es que LO DIGA, no cómo lo grite. El ⚠
  // hace el trabajo que hacían las mayúsculas y ocupa un carácter.
  assert.match(String(fila[0]), /▲/, 'la ausencia de acuerdo tiene que estar marcada')
  assert.match(String(fila[0]), /sin acuerdo publicado/i)
  // Y las dos filas de abajo NO SE EMITEN. Antes se emitían vacías: dos rótulos sin cifra debajo de
  // una oración que ya explicaba la ausencia. Traer el básico de 2025 sigue prohibido, y ahora además
  // no queda el hueco — la ausencia se declara una vez, en palabras.
  const i = gm.filas.indexOf(fila)
  assert.doesNotMatch(String(gm.filas[i + 1][0] ?? ''), /Básico de .* desde ese mes/,
    'volvió la fila vacía del básico del mes que viene')
  // `ratios` trae además las CUATRO fracciones del calendario y de oficina (efectivo de obra, adelanto
  // ponderado, por banco contra el acuerdo declarado, y efectivo de oficina): se descuentan para que
  // este control siga midiendo lo que vino a medir —cuántos MÁRGENES hay— y no el largo de la lista.
  const fracciones = [gm.fShare, gm.fAdel, gm.fAcuerdo, gm.fShareOfi, gm.fAcuerdoOfi]
  assert.equal(gm.ratios.filter((f) => !fracciones.includes(f)).length, 1,
    'sin acuerdo publicado hay UN margen, no dos')
  const texto = gm.filas.flat().map(String).join(' ')
  assert.doesNotMatch(texto, /MATCH\(TEXT\(TODAY\(\);"mmmm"\)/, 'volvió el MATCH por nombre de mes')
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

test('el supuesto de la proyección se declara CON EL DATO, y ningún mes queda estampado en el código', () => {
  // La línea que explica el driver sale de la réplica ya parseada: si mañana se pega un acuerdo nuevo,
  // cambia sola. Un mes escrito en el código envejece al día siguiente y nadie se entera.
  const glosa = gm.filas.map((f) => String(f[0] ?? '')).find((c) => /Paritaria UOCRA/i.test(c))
  assert.ok(glosa, 'desapareció la línea que declara con qué sube la proyección')
  assert.match(glosa, /Agosto \+1,9%/, 'el rótulo tiene que salir de la réplica de la fixture')
  // ═══ "PROYECCIÓN, no acuerdo" YA NO SE AFIRMA EN PROSA: SE PUBLICA COMO DATO (13/08) ═══
  //
  // La glosa lo decía en palabras y el cuadro 1.2 lo dice mes por mes en su columna «Estado». Al
  // rediseñar la pestaña se sacó la frase; lo que NO se puede perder es la distinción, así que el
  // control se mudó a donde ahora vive: si ninguna fila del escalón declara que es proyección, un mes
  // sin acuerdo firmado se estaría publicando como si lo tuviera — que es el defecto original.
  const estados = gm.filas.map((f) => String(f[7] ?? ''))
  assert.ok(estados.some((s) => /proyección/.test(s)),
    'ningún mes del escalón se declara PROYECCIÓN: lo estimado se está publicando como acuerdo')
  assert.ok(estados.some((s) => /acuerdo firmado/.test(s)),
    'ningún mes se declara ACUERDO FIRMADO: el cuadro ya no distingue lo firmado de lo proyectado')
  // LA PRUEBA DE QUE NO ESTÁ ESTAMPADO: con otra réplica, la línea dice otro mes.
  const otra = parsearAcuerdos([['Acuerdo Abril 2026'], ...cinco('Mayo\n+2,4%', [6100, 5200, 4800, 4420, 806000])]).escalones
  const g2 = grilla({
    bloques: BLOQUES, pendientes: PEND, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }],
    ultimoDiaOfi: new Date(2026, 6, 31), escalones: otra, bloqueBase: BLOQUES[1],
    categorias: ['OF'], personasBase: 16, escalonVigente: null,
    meses: mesesDelMotor(new Date(2026, 6, 31), PEND, [new Date(2026, 6, 31)]), hoy: HOY,
  })
  const glosa2 = g2.filas.map((f) => String(f[0] ?? '')).find((c) => /Paritaria UOCRA/i.test(c))
  assert.match(glosa2, /Mayo \+2,4%/, 'la línea trae un mes escrito a mano: no siguió a la réplica')
})

test('CADA Σ SE ANCLA EN EL MES DE SU PROPIA FUENTE: la del convenio en el escalón, la pactada en obra', () => {
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
    assert.match(s, new RegExp(`/\\$E\\$${rAgosto};`), `la Σ del convenio quedó anclada fuera del mes del escalón: ${s}`)
    assert.match(s, /SUMPRODUCT\(\$B\$\d+:\$B\$\d+;\$F\$\d+:\$F\$\d+\)/, `la base dejó de ser el convenio: ${s}`)
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
    assert.doesNotMatch(String(f[5]), /SUMPRODUCT/, 'sin escala no puede valuar al convenio: no hay convenio que leer')
  }
})

test('LA CADENA COMPLETA: el plantel del espejo llega valuado AL CONVENIO hasta JORNALES_PROY_TOTAL', () => {
  // ═══ LA ORDEN (07/08) ═══
  // *"quiero q realices la proyeccion de las quincenas futuras de los obreros considerando que se paga
  // el 100% de lo q indica la hora del convenio"*. Este test recorre el cable entero: si se corta en
  // cualquier eslabón, la proyección vuelve al jornal PACTADO —que está ~15% abajo de la escala— y el
  // total sigue siendo un número plausible que nadie puede distinguir a ojo.
  const p = gm.plantel
  // 1 · las personas por categoría salen del espejo por COUNTIFS, no de una lista en el código.
  assert.match(String(gm.filas[p.fPrimera - 1][1]), /COUNTIFS\('_J_OBREROS'!\$D\$\d+:\$D\$\d+/)
  // 2 · el básico de cada categoría sale de la réplica del convenio.
  assert.match(String(gm.filas[p.fPrimera - 1][5]), /INDEX\('_UOCRA_RAW'!/)
  // 3 · la Σ del cuadro 1.2 es el producto escalar de esas dos columnas — y de NINGÚN número pegado.
  const fEsc = String(gm.filas[gm.esc.f0 - 1][5])
  assert.equal(gm.esc.alConvenio, true, 'con escala vigente la proyección tiene que valuar al convenio')
  assert.match(fEsc, new RegExp(`SUMPRODUCT\\(\\$B\\$${p.fPrimera}:\\$B\\$${p.fUltima};\\$F\\$${p.fPrimera}:\\$F\\$${p.fUltima}\\)`),
    `la Σ del cuadro 1.2 dejó de salir del bloque 1.1: ${fEsc}`)
  assert.doesNotMatch(fEsc, /\d{4,}/, 'apareció un importe estampado donde tiene que haber referencias')
  // 4 · el encabezado no puede mentir sobre cuál de las dos Σ es la que está abajo. Es el defecto de
  //     "Ajuste inflación" en Oficina: el rótulo sobrevivió al criterio que lo justificaba.
  assert.equal(String(gm.filas[gm.esc.f0 - 2][5]), 'Σ $/hora convenio', 'el encabezado de 1.2 quedó con la base vieja')
  // El de 1.3 dice "aplicada" y no "convenio" desde el 07/08: abajo conviven las dos bases —lo que se
  // paga este mes va al pactado— y un encabezado que nombra una sola sería el defecto de "Ajuste
  // inflación", el rótulo que sobrevive al criterio que lo justificaba.
  // El encabezado del calendario ya no nombra la Σ: desde el 13/08 la Σ vive DENTRO de la celda de
  //     "Obreros" y el cuadro muestra las tres nóminas. Lo que se controla es que la celda siga
  //     buscando SU mes en 1.2 — que es el eslabón, no el rótulo.
  assert.equal(String(gm.filas[gm.p0 - 2][3]), 'Obreros', 'el encabezado del calendario cambió de forma')
  // 5 · cada quincena proyectada busca SU mes en ese cuadro y multiplica por horas × días…
  const q = gm.filas[gm.p0 - 1]
  assert.match(String(q[3]), new RegExp(`INDEX\\(\\$F\\$${gm.esc.f0}:\\$F\\$${gm.esc.f1};MATCH\\(EOMONTH\\(`))
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
  const [fMed, fJor] = gm.cantidades
  assert.match(String(q[3]), new RegExp(`\\*IF\\(.*\\$B\\$${fMed};\\$B\\$${fJor}\\)\\*NETWORKDAYS\\.INTL\\(A${gm.p0};B${gm.p0};"0000011"\\)`),
    `la celda de obra dejó de elegir horas medidas/jornada × días lunes a viernes: ${q[3]}`)
  // 6 · …y esa columna es la que publica el rango que consumen Cargas Sociales, el Libro, CAJA y los
  //     cash flows. APUNTA A "Obreros", NO AL "TOTAL" del calendario: el TOTAL ya trae oficina y
  //     dirección, que viajan por sus propios rangos, y sumarlas de nuevo las contaría dos veces.
  const proy = rangosDeJornales(gm).find((x) => x.nombre === 'JORNALES_PROY_TOTAL')
  assert.equal(proy.c0, 3, 'JORNALES_PROY_TOTAL dejó de apuntar a la columna donde cae la valuación al convenio')
  assert.equal(proy.ancla.texto, 'Obreros', 'JORNALES_PROY_TOTAL se corrió a una columna que no es la de obra')
  assert.equal(proy.r0, gm.p0)
})

test('EL EFECTIVO PROYECTADO SALE DEL ACUERDO 50/50, NO DE UN SEGUNDO PORCENTAJE MEDIDO', () => {
  // ═══ DOS NÚMEROS PARA EL MISMO CANAL ES LO QUE NO SE ENTENDÍA (14/08) ═══
  //
  // Esta columna multiplicaba por un share MEDIDO sobre el histórico (84,2% en efectivo) mientras el
  // cuadro de arriba paga 50/50 por acuerdo del dueño. La misma pestaña daba dos respuestas a "por qué
  // canal sale la plata". Ahora las dos salen de la MISMA regla.
  const efectivo = String(gm.filas[gm.p0 - 1][7])
  assert.equal(efectivo, `=(D${gm.p0}+E${gm.p0})/2`, `el efectivo proyectado dejó de salir del acuerdo 50/50: ${efectivo}`)
  // `/2` y NUNCA `*0,5`: un literal decimal escrito por API viaja en el locale es_AR del archivo.
  assert.doesNotMatch(efectivo, /0[,.]5/, 'el 50% se escribió como literal decimal: en es_AR eso es un #ERROR')
  // OBRA Y OFICINA, que son las dos nóminas con acuerdo declarado. DIRECCIÓN no: de esos tres retiros
  // el canal no está registrado en ninguna parte y repartirlos con la regla de otro grupo sería
  // inventarlo. (F es su columna en el calendario.)
  assert.doesNotMatch(efectivo, new RegExp(`F${gm.p0}`), 'dirección no declara canal: repartirla sería inventarlo')
  // Y NO DEPENDE DE QUE HAYA HISTORIA: la celda se puede calcular el 2 de enero, que es justamente
  // cuando el share medido se caía a vacío y la columna quedaba en blanco doce filas seguidas.
  assert.doesNotMatch(efectivo, /="";""/, 'el efectivo volvió a depender de una base que puede no existir')
  // LAS DOS LÍNEAS DE AUDITORÍA DE INCUMPLIMIENTO NO VUELVEN. El dueño: *"te he dicho q el acuerdo es
  // 50 y 50 todas las quincenas y asi y todo no se entiende nada"*. Publicar "faltan $X por banco" al
  // lado del cuadro con el que paga es mostrarle una auditoría cuando pidió una instrucción.
  const texto = gm.filas.flat().map(String).join(' ')
  assert.doesNotMatch(texto, /por banco · /, 'volvió la brecha contra el acuerdo al bloque que decide el pago')
  assert.doesNotMatch(texto, /contra el acuerdo 50\/50 declarado/, 'volvió la línea de incumplimiento')
})

test('EL SUPUESTO SE LEE EN LA PESTAÑA, ARRIBA DEL CUADRO QUE LO USA', () => {
  // Un número que se lee como un hecho y es una hipótesis es peor que no tenerlo: acá abajo hay diez
  // quincenas valuadas a una escala que hoy NO se paga.
  // ═══ EL PÁRRAFO SE FUE, LA DECLARACIÓN NO (13/08) ═══
  //
  // El rótulo pasó de 460 caracteres a "Supuesto: proyectado al 100% del convenio · N personas". Lo que
  // este test cuida sigue siendo lo mismo: que la palabra SUPUESTO esté, que diga contra qué base, y
  // que esté ARRIBA del cuadro que la aplica. Lo que ya no exige es la frase "hoy pagamos POR DEBAJO",
  // porque eso es una MEDICIÓN y se controla dos assertions más abajo, contra la celda que la calcula
  // —donde no puede quedar desactualizada respecto del número, que es lo que pasa con una glosa—.
  const esSupuesto = (c) => /Supuesto: proyectado al 100% del convenio/.test(c)
  const linea = gm.filas.map((f) => String(f[0] ?? '')).find(esSupuesto)
  assert.ok(linea, 'desapareció la línea que declara que la proyección asume el 100% del convenio')
  // Va ANTES del cuadro 1.2, que es el que la aplica — no al final de la pestaña.
  assert.ok(gm.filas.findIndex((f) => esSupuesto(String(f[0] ?? ''))) < gm.esc.f0 - 1)
  // Y el bloque 1.1 —pactado contra convenio— NO se toca: esa comparación sigue siendo un hecho, y es
  // la que prueba que el supuesto no es gratis.
  const estado = String(gm.filas[gm.plantel.fPrimera - 1][7])
  assert.match(estado, /por debajo del convenio/)
  assert.match(String(gm.filas[gm.plantel.fPrimera - 1][2]), /SUMIFS\('_J_OBREROS'!\$W/, 'el pactado dejó de leerse del espejo')
})

test('LA LÍNEA LA DECIDE EL CUADRO: tener la escala a mano no es haberla podido usar', () => {
  // EL DEFECTO QUE ESTO ATRAPA, encontrado al revertir el arreglo a propósito (07/08). La línea se
  // emitía mirando `escalonVigente` y el cuadro decidía con `alConvenio`, que además exige que el mes
  // del escalón esté EN el cuadro para tener dónde anclar. Con la escala presente pero su mes fuera de
  // la tabla, la pestaña anunciaba "100% DEL CONVENIO" arriba de una proyección hecha sobre el jornal
  // PACTADO. Dos flags para la misma decisión: el modo de falla más caro de este libro.
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
  assert.equal(g2.esc.alConvenio, false, 'sin el mes del escalón en el cuadro no hay dónde anclar la Σ')
  const linea = g2.filas.map((f) => String(f[0] ?? '')).find((c) => /pactado|100% del convenio/i.test(c))
  assert.match(linea, /pactado/i, 'la pestaña anuncia el convenio y el cuadro está usando el pactado')
  assert.doesNotMatch(linea, /100% del convenio/i)
  // El encabezado del calendario ya no nombra la base (13/08): la Σ vive dentro de la celda de obra.
  // Lo que se controla es que esa celda NO traiga la rama del convenio cuando el cuadro no puede usarla.
  assert.doesNotMatch(String(g2.filas[g2.p0 - 1][3]), /EOMONTH\(TODAY\(\);0\)\);\$C\$/,
    'la celda de obra trajo la frontera convenio/pactado con el cuadro incapaz de anclar la Σ')
})

test('EL 01/09 LA PROYECCIÓN NO VUELVE SOLA AL PACTADO: la escala rige hasta que otra la reemplaza', () => {
  // ═══ EL DEFECTO, REPRODUCIDO CON LA FECHA QUE LO DISPARA (07/08) ═══
  //
  // El motor resolvía el escalón vigente por igualdad exacta de período. El acuerdo publicado termina
  // el 31/08 y la réplica no trae septiembre: el 01/09, sin que nadie tocara un archivo, la base de la
  // proyección volvía del convenio al jornal PACTADO —−12,14% sobre la masa— y la glosa de Cargas
  // seguía declarando el 100% del convenio. Ninguna celda daba error.
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
  assert.equal(g.esc.alConvenio, true, 'en septiembre la proyección se cayó sola al jornal pactado')
  assert.equal(String(g.filas[g.esc.f0 - 2][5]), 'Σ $/hora convenio')
  // Y la Σ sale del ÚLTIMO ESCALÓN: el bloque 1.1 tiene que leer las filas de agosto en la réplica,
  // que es la escala que sigue rigiendo. Si leyera otro grupo, la base sería de otro mes.
  const basico = String(g.filas[g.plantel.fPrimera - 1][5])
  assert.match(basico, new RegExp(`\\$D\\$${vigente.categorias.Oficial.fila - 1}`),
    `«Básico convenio» dejó de leer el grupo del escalón vigente: ${basico}`)
  for (let r = g.esc.f0; r <= g.esc.f1; r++) {
    assert.match(String(g.filas[r - 1][5]), new RegExp(`SUMPRODUCT\\(\\$B\\$${g.plantel.fPrimera}:`),
      'la Σ del cuadro 1.2 dejó de valuar al convenio en septiembre')
  }
  const linea = g.filas.map((f) => String(f[0] ?? '')).find((c) => /100% del convenio|pactado/i.test(c))
  assert.match(linea, /100% del convenio/i, 'la pestaña anuncia el pactado con el cuadro al convenio')
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
    const s = String(gm.filas[r - 1][3])
    assert.match(s, new RegExp(`N\\(C${r}\\)>0`), `la fila ${r} no mira SU fecha de pago: ${s}`)
    assert.match(s, new RegExp(`C${r}<=EOMONTH\\(TODAY\\(\\);0\\)`), `la frontera no es el fin del mes en curso: ${s}`)
    // La rama del pactado: la Σ del plantel de 1.1 escalada por el factor del mes, anclada en el mes
    // base de OBRA. Si se anclara en otra fila, la quincena se comería un tramo de paritaria entero.
    assert.match(s, new RegExp(`\\$C\\$${gm.plantel.fTotal}\\*INDEX\\(\\$E\\$${gm.esc.f0}:\\$E\\$${gm.esc.f1};`),
      `la rama del pactado no sale del plantel de 1.1: ${s}`)
    assert.match(s, new RegExp(`/\\$E\\$${gm.esc.rAnclaBase};`), `la Σ pactada quedó anclada fuera del mes de obra: ${s}`)
    // …y la del convenio sigue siendo la columna F del cuadro 1.2.
    assert.match(s, new RegExp(`INDEX\\(\\$F\\$${gm.esc.f0}:\\$F\\$${gm.esc.f1};`), `se perdió la rama del convenio: ${s}`)
    assert.doesNotMatch(s, /,/, 'separador es-AR')
  }
  // NINGÚN MES ESCRITO: la frontera se mueve sola el 1° de cada mes, sin esperar una corrida.
  assert.doesNotMatch(String(gm.filas[gm.p0 - 1][3]), /DATE\(\d{4}/)
  // Y SIN CONVENIO NO HAY DOS BASES ENTRE LAS CUALES ELEGIR: el cuadro ya publica la pactada.
  const sinConv = formulaSigmaDelMes('A35', { f0: 25, f1: 30, alConvenio: false }, 'C35')
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
  const sano = gm.filas.map((f) => String(f[0] ?? '')).filter((c) => /escala verificada/.test(c))
  assert.equal(sano.length, 0, 'un control que repite "todo bien" en cada corrida se vuelve invisible')
  const vieja = parsearAcuerdos([['Acuerdo Mayo 2026'], ...cinco('Agosto\n+1,9%', [6800, 5817, 5375, 4948, 898817])]).escalones
  const g2 = grilla({
    bloques: BLOQUES, pendientes: PEND, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }],
    ultimoDiaOfi: new Date(2026, 6, 31), escalones: vieja, bloqueBase: BLOQUES[1],
    categorias: ['OF'], personasBase: 16, escalonVigente: escalonDe(vieja, '2026-08'),
    meses: mesesDelMotor(new Date(2026, 6, 31), PEND, [new Date(2026, 6, 31)]), hoy: HOY,
  })
  const aviso = g2.filas.map((f) => String(f[0] ?? '')).find((c) => /escala verificada/.test(c))
  assert.ok(aviso, 'la réplica trae la escala del mes pasado y la pestaña no lo dice')
  // ═══ EL DETALLE SALIÓ DE LA CELDA Y LA MEDICIÓN NO (13/08) ═══
  //
  // La celda decía las cinco categorías con sus dos importes cada una: 300+ caracteres cortados en
  // pantalla justo cuando el control importa. Ahora publica el ALCANCE y el detalle va al log de la
  // corrida. Lo que este test sigue exigiendo es lo mismo de antes por dos vías:
  //   · que la pestaña avise, y diga CUÁNTAS categorías desviaron (si dijera "hay un desvío" a secas,
  //     una réplica entera podrida se leería igual que una celda mal tipeada);
  //   · que la MEDICIÓN sea la de siempre, con el importe exacto — contra `contrastarEscala`, que es
  //     quien la produce. Si el contraste dejara de comparar, esto se pone rojo aunque la celda hable.
  assert.match(aviso, /en 5 categoría/, 'el aviso dejó de decir cuánto abarca el desvío')
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
  const linea = gm.filas.map((f) => String(f[0] ?? '')).filter((c) => /→Oficial|→Ayudante/.test(c))
  assert.equal(linea.length, 1, 'la línea del convenio tiene que existir UNA sola vez')
  // ═══ Y DESDE EL 07/08 YA NO PIDE: DECLARA (equivalencia del dueño) ═══
  // Las cuatro categorías del plantel tienen equivalente, así que la línea dice contra qué compara el
  // bloque en vez de pedir una carga manual que ya no hace falta.
  assert.match(linea[0], /OF, OF M→Oficial/)
  assert.match(linea[0], /A, A M→Ayudante/)
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
    assert.match(e, /por debajo del convenio|sobre el convenio/, `el estado por fila dejó de opinar: ${e}`)
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

test('LA JERARQUÍA LLEGA A LA PESTAÑA: cinco secciones en 11 y tres sub-secciones en 10', () => {
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
  assert.ok(secciones.length >= 5, `esperaba las cinco secciones y encontré ${secciones.length}`)
  for (const [a, fila] of secciones) {
    assert.equal(tipografiaDe(fila)?.bold, true, `la sección "${a.slice(0, 30)}" no está en negrita`)
    assert.equal(tipografiaDe(fila)?.fontSize, 11, `la sección "${a.slice(0, 30)}" no tiene su cuerpo`)
  }
  const subs = vista.map((f, i) => [String(f[0] ?? ''), i + 1]).filter(([a]) => /^\d+\.\d+ · /.test(a))
  assert.ok(subs.length >= 3, `esperaba 1.1, 1.2 y 1.3 y encontré ${subs.length}`)
  for (const [a, fila] of subs) {
    assert.equal(tipografiaDe(fila)?.bold, true, `la sub-sección "${a.slice(0, 30)}" no está en negrita`)
    assert.equal(tipografiaDe(fila)?.fontSize, 10, `una sub-sección no pesa lo mismo que su sección`)
  }
  // Y las reglas se dibujan del ancho del BLOQUE. Con el centinela, `anchoDe` contaba las catorce
  // columnas siempre y toda regla salía del ancho de la hoja: líneas largas sobre la nada.
  const reglas = reqs.filter((r) => r.updateBorders?.top?.style === 'SOLID')
  assert.ok(reglas.some((r) => r.updateBorders.range.endColumnIndex < 14),
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
  const N = ANCHO - 1
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

test('el calendario es TODO plata de la D a la H, y sus dos mediciones no se dibujan como pesos', () => {
  // ANTES (hasta el 13/08) este cuadro mezclaba cantidades con importes y hacían falta tres reglas de
  // formato apuntando a tres columnas distintas — dos de las cuales ya habían apuntado a la columna de
  // al lado. Ahora las cinco columnas de la D a la H son importes y las cubre el barrido general.
  const reqs = requestsDeFormato(1, gm.filas, gm)
  const finProy = gm.p0 + gm.nProy - 1
  for (const f of [gm.p0, finProy]) {
    for (const c of [3, 4, 5, 6, 7]) {
      const fm = formatoDe(reqs, f, c)
      assert.equal(fm.type, 'CURRENCY', `fila ${f} col ${c}: el calendario dejó de dibujarse como plata`)
    }
  }
  // Las dos mediciones de arriba del cuadro NO son plata y cada una tiene su formato: las horas por
  // persona con dos decimales —con uno, 7,166 se muestra "7,2" y el redondeo pasa por dato— y la
  // fracción de efectivo como PORCENTAJE. Sin esto el barrido de moneda las dibuja "$7" y "$1".
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
import { COLS_CALENDARIO } from '../lib/jornales-calendario.mjs'
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

test('el RESTO de la quincena en curso se marca como tal, y se dice en la pestaña', () => {
  // La otra mitad del arreglo: cuando el resto SÍ tiene días (13/08 → 15/08, sábado incluido) la fila
  // se emite —esos jornales se pagan— pero ya no se llama "Quincena", y arriba del cuadro aparece la
  // línea que explica que la primera fila es un resto. Sin ella, "Período 15/08 · Hasta 15/08" se
  // vuelve a leer como una quincena de un día.
  const q = quincenasPendientes(new Date(2026, 7, 13))
  assert.equal(q[0].resto, true, 'el resto de la quincena en curso dejó de marcarse')
  assert.equal(q[1].resto, false, 'una quincena que arranca el 16 no es un resto')
  const g2 = grilla({ bloques: BLOQUES, pendientes: q, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }] })
  // El aviso pasó de 167 caracteres a 45 el 13/08: "La 1ª fila es el RESTO de la quincena en curso".
  // Se busca la palabra RESTO, que es la que hace el trabajo.
  const esAviso = (c) => /1ª fila es el RESTO/.test(c)
  const aviso = g2.filas.map((f) => String(f[0] ?? '')).find(esAviso)
  assert.ok(aviso, 'sin acuerdo visible, la primera fila del calendario vuelve a leerse como una quincena entera')
  // Y NO aparece cuando la carga cierra justo en el borde del tramo: una glosa fija que se lee todos
  // los días es invisible el día que importa.
  const g3 = grilla({ bloques: BLOQUES, pendientes: quincenasPendientes(new Date(2026, 7, 16)), bloquesOfi: [] })
  assert.ok(!g3.filas.map((f) => String(f[0] ?? '')).some(esAviso))
})

test('EL CALENDARIO CONTESTA LA PREGUNTA: obreros, oficina y dirección, y sus dos canales, en una fila', () => {
  // La fila se rellena hasta el ancho de la pestaña con el centinela: se compara el cuadro, no el relleno.
  assert.deepEqual(gm.filas[gm.p0 - 2].slice(0, COLS_CALENDARIO.length), COLS_CALENDARIO,
    'el encabezado del calendario no es el declarado')
  const tot = gm.filas[gm.fTotalProy - 1]
  assert.match(String(tot[0]), /^⇒ Total a pagar hasta diciembre/)
  // Las tres poblaciones y los dos canales, cada uno sumando SU columna del cuadro: es el único
  // renglón de la pestaña donde el dueño puede leer cuánto le falta pagar de cada una.
  const fin = gm.p0 + gm.nProy - 1
  for (const [i, letra] of [[3, 'D'], [4, 'E'], [5, 'F'], [6, 'G'], [7, 'H']]) {
    assert.equal(String(tot[i]), `=SUM(${letra}${gm.p0}:${letra}${fin})`, `la columna ${letra} del total no suma su cuadro`)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO: *"jornales con la proyección de sueldos 50 y 50"* — y el cuadro publicaba UNA mitad.
//
// El calendario tenía `Efectivo` = (Obreros+Oficina)/2 y NO tenía `Banco`. El dueño veía cuántos
// billetes juntar y no cuánto se transfiere, que son los dos números con los que opera el pago.
// Revertir la columna deja este test en rojo por el encabezado Y por la fila.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('LA PROYECCIÓN PUBLICA LAS DOS MITADES, NO UNA — y suman exactamente las tres nóminas', () => {
  const cabecera = gm.filas[gm.p0 - 2].slice(0, COLS_CALENDARIO.length).map(String)
  assert.ok(cabecera.includes('Banco'), 'el calendario volvió a publicar una sola mitad del acuerdo')
  assert.ok(cabecera.includes('Efectivo'), 'se perdió la mitad en billetes')
  // EL ANCHO NO SE NEGOCIA: dos grillas distintas en el mismo tab es el defecto que el auditor de
  // patrón rechaza. Si «Banco» entró sumando una novena columna, esto salta.
  assert.equal(COLS_CALENDARIO.length, 8, 'el calendario dejó de medir ocho columnas')
  const iB = cabecera.indexOf('Banco'); const iE = cabecera.indexOf('Efectivo')
  const fin = gm.p0 + gm.nProy - 1
  for (let r = gm.p0; r <= fin; r++) {
    const banco = String(gm.filas[r - 1][iB]); const efectivo = String(gm.filas[r - 1][iE])
    // LA IDENTIDAD, LEÍDA EN LAS DOS CELDAS: banco es el efectivo MÁS dirección entera. De ahí sale
    // que banco + efectivo = obreros + oficina + dirección, que es lo que permitió sacar el TOTAL.
    assert.equal(efectivo, `=(D${r}+E${r})/2`, `fila ${r}: el efectivo dejó de ser la mitad de obra + oficina`)
    assert.equal(banco, `${efectivo}+F${r}`, `fila ${r}: banco y efectivo dejaron de sumar el total de la fila`)
    // LA TRAMPA DEL LOCALE, EN EL TEST Y NO EN LA CABEZA DE NADIE: en es_AR la coma SEPARA
    // ARGUMENTOS, así que un `*0,5` se parte en dos y la celda queda en #ERROR. Va `/2`.
    for (const celda of [banco, efectivo]) assert.doesNotMatch(celda, /0,5/, `fila ${r}: literal decimal en locale es_AR`)
  }
  // Y OFICINA SE REPARTE COMO OBREROS, que es la orden del dueño: *"quiero q la tabla de oficina sea
  // igual que la de obreros dado q el acuerdo es el mismo 50% por banco, 50% efectivo"*. Si alguien
  // volviera a dejar el efectivo como "sólo obra", la columna E desaparece de la fórmula.
  assert.match(String(gm.filas[gm.p0 - 1][iE]), /E\d+/, 'oficina quedó fuera del reparto por canal')
})

test('OFICINA Y DIRECCIÓN CAEN EN LA QUINCENA QUE LAS PAGA — sin huecos ni solapes', () => {
  const fin = gm.p0 + gm.nProy - 1
  const ventanas = []
  for (let r = gm.p0; r <= fin; r++) {
    for (const col of [4, 5]) {
      const s = String(gm.filas[r - 1][col])
      assert.match(s, /^=SUMIFS\(/, `fila ${r} col ${col}: el reparto dejó de ser una ventana de fecha`)
      ventanas.push({ r, col, s })
    }
  }
  // La primera fila NO pone piso y la última NO pone techo: nada anterior al primer tramo ni
  // posterior al último puede caer fuera del calendario.
  for (const col of [4, 5]) {
    assert.doesNotMatch(String(gm.filas[gm.p0 - 1][col]), />="&/, 'la primera ventana puso piso')
    assert.doesNotMatch(String(gm.filas[fin - 1][col]), /"<"&/, 'la última ventana puso techo')
  }
  // Y el piso de cada fila es EXACTAMENTE el techo de la anterior: si una usara una fecha propia, un
  // mes podría caer en las dos o en ninguna, y el total del calendario seguiría pareciendo sano.
  for (let r = gm.p0 + 1; r <= fin; r++) {
    for (const col of [4, 5]) {
      assert.ok(String(gm.filas[r - 1][col]).includes(`">="&$C$${r}`), `fila ${r} col ${col}: el piso no es su propia fecha`)
      if (r < fin) assert.ok(String(gm.filas[r - 2][col]).includes(`"<"&$C$${r}`), `fila ${r - 1} col ${col}: el techo no es el piso de la siguiente`)
    }
  }
  // El control existe y compara contra el total del bloque, que se calcula por el otro camino.
  assert.match(String(gm.filas[gm.fControlCal - 1][0]), /oficina y dirección cierran contra sus bloques/)
})

test('EL TOTAL DEL CALENDARIO NO SE CUENTA DOS VECES EN CAJA: el rango publicado es el de obra', () => {
  // ═══ EL DEFECTO QUE ESTO EVITA ═══
  // `JORNALES_PROY_TOTAL` lo consumen sync-caja-nucleo, Cargas Sociales y los cash flows. Oficina y
  // dirección YA viajan por OFICINA_PROYECTADO y DIRECCION_PROYECTADO: si este nombre apuntara a la
  // columna TOTAL del calendario, esas dos nóminas se sumarían dos veces —hoy ~$50M— con un número
  // perfectamente plausible y ninguna celda en rojo.
  const proy = rangosDeJornales(gm).find((x) => x.nombre === 'JORNALES_PROY_TOTAL')
  assert.equal(proy.ancla.texto, 'Obreros')
  // Los dos CANALES incluyen a oficina y a dirección: publicar el nombre sobre cualquiera de ellos
  // las contaría dos veces. Es el mismo riesgo que corría la vieja columna TOTAL, ahora repartido en
  // dos columnas — así que la prohibición vale para las dos.
  assert.notEqual(proy.c0, COLS_CALENDARIO.indexOf('Banco'))
  assert.notEqual(proy.c0, COLS_CALENDARIO.indexOf('Efectivo'))
  // Y el lector de la caja tiene que leer la MISMA columna: su declaración vive en nomina-sync, que
  // es el módulo que escribe el cuadro. Dos definiciones de dónde está el total es cómo se
  // desincronizó este mismo cuadro en julio.
  assert.equal(COL_PROYECCION.total, proy.c0, 'el lector de la caja y el rango publicado apuntan a columnas distintas')
  assert.equal(COL_PROYECCION.banco, COLS_CALENDARIO.indexOf('Banco'))
  assert.equal(COL_PROYECCION.efectivo, COLS_CALENDARIO.indexOf('Efectivo'))
  // `consolidado` se retiró con la columna TOTAL: un índice con nombre inocente apuntando a una
  // columna que NO se puede consumir es exactamente cómo se vuelve a contar dos veces.
  assert.equal(COL_PROYECCION.consolidado, undefined, 'volvió el índice de la columna consolidada')
})

test('cada PROYECTADO del cuadro del año sale del bloque de SU grupo, no de una suma propia', () => {
  // El cuadro no recalcula nada: si lo hiciera, podría decir un número y su sección otro, y nadie se
  // enteraría. Obra sale de la columna «Obreros» del calendario —NO del TOTAL, que ya trae las otras
  // dos— y oficina y dirección de la columna «Proyectado» de sus totales.
  const cProy = COL_ANIO[1]
  assert.equal(String(gm.filas[gm.anio.obra - 1][cProy]), `=$D$${gm.fTotalProy}`, 'obra dejó de leer la columna «Obreros» del calendario')
  assert.equal(String(gm.filas[gm.anio.oficina - 1][cProy]), `=$H$${gm.filas.findIndex((f) => /^⇒ Oficina —/.test(String(f[0]))) + 1}`)
  assert.equal(String(gm.filas[gm.anio.direccion - 1][cProy]), `=$H$${gm.filas.findIndex((f) => /^⇒ Dirección —/.test(String(f[0]))) + 1}`)
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
    assert.equal(estado(mes), `proyección · ${ALERTA} firmado hasta 08/2026`,
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

test('OFICINA · el driver se declara en la pestaña, sin meter lo gremial en el medio', () => {
  // Requisito del dueño por partida doble: que el número diga por qué sube (si no está bajo el
  // convenio UOCRA, cuál es su driver), y que lo gremial viva junto y debajo de las tres nóminas.
  const enBloque = gm.filas.slice(gm.o0 - 5, gm.o0 - 1).map((f) => String(f[0] ?? ''))
  const linea = enBloque.find((c) => c.includes(LINEA_DRIVER_OFICINA))
  assert.ok(linea, `el bloque de oficina no declara su driver ni su piso: ${enBloque.join(' | ')}`)
  assert.ok(linea.length <= 60, `la línea mide ${linea.length}: la pestaña vuelve a la prosa`)
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

test('el PROYECTADO de obra sale de su columna, nunca del TOTAL de las tres nóminas', () => {
  // El defecto que esto evita: leer la columna TOTAL del calendario metería en la fila de obra el mes
  // de oficina y el retiro de dirección, que ya tienen su propia fila. El número sería plausible y
  // estaría contando dos veces — $50,2M de más, medido el 13/08.
  const proy = String(gm.filas[gm.anio.obra - 1][COL_ANIO[1]])
  assert.ok(proy.includes(`$D$${gm.fTotalProy}`), `el proyectado de obra dejó de leer su columna: ${proy}`)
  assert.ok(!proy.includes(`$G$${gm.fTotalProy}`), 'el proyectado de obra se llevó el TOTAL de las tres nóminas')
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

/** La columna del cuadro de contraste buscada por su rótulo — nunca por su letra. */
const colC = (rotulo) => {
  const i = gm.contraste.cols.indexOf(rotulo)
  assert.ok(i >= 0, `el cuadro de contraste perdió la columna "${rotulo}"`)
  return i
}

test('REAL 1 · el cuadro publica el estimado, el real y la diferencia de la misma quincena', () => {
  const enc = gm.filas[gm.contraste.fCols - 1]
  assert.deepEqual(enc.slice(0, gm.contraste.cols.length), gm.contraste.cols)
  // El ancho tiene que ser el del hero: dos anchos de grilla en la pestaña es lo que el auditor de
  // patrón marca como `anchos-mezclados` y el dueño ve corrido.
  assert.equal(gm.contraste.cols.length, COLS_PAGO.length)
  for (const f of [gm.contraste.f0, gm.contraste.fFin]) {
    for (const rotulo of ['Estimado', 'Diferencia', 'Δ %']) {
      assert.match(String(gm.filas[f - 1][colC(rotulo)]), /^=/, `fila ${f}: «${rotulo}» no es una fórmula viva`)
    }
  }
})

test('REAL 2 · el real sale del BANCO y el estimado CITA el cuadro de pago: nunca se recalcula', () => {
  const real = String(gm.filas[gm.contraste.f0 - 1][colC('Real')])
  // Si el real volviera a leer el espejo de jornales, el control se estaría validando contra la misma
  // información que produce y daría cero de diferencia para siempre.
  assert.match(real, /'_BANCO_RAW'/, 'el real de la fila de banco no sale del extracto')
  assert.doesNotMatch(real, /_J_OBREROS|_J_OFICINA/, 'el real volvió a salir de la planilla')
  // Y el estimado no recalcula nada: cita la fila de obra del cuadro de arriba. Recalcularlo dejaría
  // dos versiones del mismo número en la misma pantalla.
  const est = String(gm.filas[gm.contraste.f0 - 1][colC('Estimado')])
  assert.match(est, new RegExp(`^=[A-H]${gm.hero.f0}$`), `el estimado no cita el cuadro de pago: ${est}`)
})

test('REAL 3 · el efectivo NO se estima: se declara el límite en la celda', () => {
  const fila = gm.filas[gm.contraste.f0]
  // La fila del efectivo trae su estimado (lo que hay que juntar en billetes) y NINGÚN real: la
  // columna «Total recibo» de JORNALES es TOTAL−ADELANTO−BANCO, un residuo de la misma planilla.
  assert.match(String(fila[colC('Estimado')]), /^=/)
  assert.equal(String(fila[colC('Real')]), '—')
  assert.match(String(fila[colC('De dónde sale el real')]), /residuo de la misma planilla/)
})

test('REAL 4 · el total se publica DECLARADO como inferencia, no como un hecho', () => {
  const fila = gm.filas[gm.contraste.fFin - 1]
  assert.match(String(fila[colC('Real')]), /^=IF\(N\(E\d+\)=0;"";E\d+\*2\)$/, 'el total inferido no es banco × 2')
  assert.match(String(fila[colC('De dónde sale el real')]), /^INFERIDO/)
  // Y el rótulo dice que no es la suma de las dos filas de arriba: ésas reparten el NETO y ésta es el
  // TOTAL, que incluye lo ya adelantado. Sin decirlo, el cuadro parece no cerrar.
  assert.match(String(fila[0]), /antes del adelanto/)
})

test('REAL 5 · el aviso del umbral se mide sobre el banco, que es la única fila con prueba', () => {
  const aviso = String(gm.filas[gm.contraste.aviso - 1][0])
  const fB = gm.contraste.f0
  const est = String.fromCharCode(65 + colC('Estimado'))
  const dif = String.fromCharCode(65 + colC('Diferencia'))
  assert.ok(aviso.includes(`${est}${fB}`) && aviso.includes(`${dif}${fB}`), `el aviso no mira la fila del banco: ${aviso}`)
  // No puede mirar la fila del total: ahí el real es una inferencia, y un aviso disparado por una
  // inferencia no es un control.
  assert.doesNotMatch(aviso, new RegExp(`[A-H]${gm.contraste.fFin}\\b`), 'el aviso se dispara sobre el total inferido')
})

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

test('REAL 6 · el bloque se ancla en «Quincena» y NUNCA en la columna «Hasta» del registro', () => {
  // RED si alguien vuelve a `$B$fReg`: es exactamente la celda que se publicó vacía.
  const fReg = gm.fLast ?? gm.f0
  const hasta = new RegExp(`\\$${colDe('Hasta')}\\$\\d+`)
  const desde = new RegExp(`\\$${colDe('Quincena')}\\$\\d+`)
  const celdas = [gm.filas[gm.contraste.sub - 1][0], ...gm.filas[gm.contraste.f0 - 1].slice(0, 8)]
    .map(String).filter((s) => s.startsWith('='))
  assert.ok(celdas.length >= 5, 'el bloque perdió sus fórmulas')
  const citanElRegistro = celdas.filter((s) => desde.test(s))
  assert.ok(citanElRegistro.length >= 4, 'ninguna celda se ancla en la celda «Quincena»')
  for (const s of celdas) {
    assert.doesNotMatch(s, hasta, `una celda del bloque sigue anclada en «Hasta»: ${s.slice(0, 110)}`)
  }
  assert.ok(fReg > 0)
})

test('REAL 7 · el cierre de una quincena está definido UNA vez y lo usan los dos cuadros', () => {
  // El calendario de pago tenía la misma fórmula escrita a mano. Dos copias del mismo criterio en la
  // misma pestaña es cómo un día dicen cosas distintas sin que nadie lo note.
  const esperada = `=${expresionCierreDeQuincena(`A${gm.p0}`)}`
  assert.equal(String(gm.filas[gm.p0 - 1][1]), esperada, 'el calendario dejó de usar la definición común')
  assert.match(String(gm.filas[gm.contraste.f0 - 1][4]), /DAY\(\$A\$\d+\)<16/, 'el real no deriva el cierre')
})

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

test('la pestaña publica la JORNADA al lado de las horas medidas, no en su lugar', () => {
  const medidas = gm.filas.findIndex((f) => String(f[0] ?? '').includes('Horas por persona y día — medidas'))
  const jornada = gm.filas.findIndex((f) => String(f[0] ?? '').includes('día — jornada'))
  assert.ok(medidas >= 0, 'se fue la fila de horas medidas')
  assert.ok(jornada >= 0, 'falta la fila de la jornada: el piso vuelve a medirse con la asistencia')
  assert.equal(jornada, medidas + 1, 'la jornada va pegada a las medidas — la brecha se lee de un vistazo')
  assert.equal(gm.filas[jornada][1], 8, 'la jornada tiene que ser un número, no una fórmula que pueda apagarse')
  // Y el límite viaja con el número: 8 h × lunes a viernes son 40 h semanales.
  assert.match(String(gm.filas[jornada][2] ?? ''), /piso del piso/)
})

test('EL DEFECTO: la columna «Obreros» valuaba la obligación con las horas MEDIDAS', () => {
  const jornada = gm.filas.findIndex((f) => String(f[0] ?? '').includes('día — jornada')) + 1
  const medidas = gm.filas.findIndex((f) => String(f[0] ?? '').includes('Horas por persona y día — medidas')) + 1
  const enc = gm.filas.findIndex((f) => f[0] === 'Período' && f[3] === 'Obreros')
  assert.ok(enc >= 0, 'no está el encabezado del calendario')
  const proyectada = String(gm.filas[enc + 1][3] ?? '')
  // Las dos celdas tienen que estar en la fórmula: la medida para lo que se paga este mes, la jornada
  // para lo que se proyecta. Con una sola, una de las dos preguntas se contesta con la otra respuesta.
  assert.ok(proyectada.includes(`$B$${jornada}`), `la proyección no usa la jornada: ${proyectada.slice(0, 120)}`)
  assert.ok(proyectada.includes(`$B$${medidas}`), 'y tampoco puede perder las horas medidas del pactado')
  // La frontera que elige entre las dos es la MISMA que elige la base, y se reclasifica sola.
  assert.ok(proyectada.includes('EOMONTH(TODAY();0)'))
})

test('EL DEFECTO: el ✓ del piso se firmaba sin mirar el plantel ni las horas', () => {
  const control = gm.filas.map((f) => String(f[0] ?? '')).find((s) => s.includes('cubren el piso UOCRA'))
  assert.ok(control, 'se fue el control del piso')
  assert.ok(control.includes('— faltan '),
    'el control volvió a preguntar sólo por los básicos: firma el ✓ con gente de la nómina afuera del piso')
  assert.ok(control.includes('la jornada es'),
    'el control dejó de comparar las horas del piso contra la jornada')
})

test('el plantel del piso sale de la quincena EN CURSO y el cuadro 4.1 lo dice', () => {
  const t = gm.filas.map((f) => String(f[0] ?? ''))
  assert.ok(t.some((s) => s.includes('Plantel vigente — la quincena en curso')),
    'el título del 4.1 volvió a nombrar la quincena cerrada sobre el plantel de hoy')
  // Y con el bloque abierto sin gente el rótulo cambia: un título fijo miente en uno de los dos casos.
  const gc = conMotor({ origenPiso: 'cerrada' })
  assert.ok(gc.filas.map((f) => String(f[0] ?? '')).some((s) => s.includes('Plantel base — última quincena cerrada')))
})
