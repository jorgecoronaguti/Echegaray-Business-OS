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
import { colDe, grilla, ultimoDiaCargado, rangosDeJornales, RANGOS_RETIRADOS } from './jornales-pestana.mjs'
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

test('"registro cargado al …" es una FÓRMULA: era el último texto estampado de la pestaña', () => {
  // Era `cargada hasta el ${cargaAlDia}`, medido en JS sobre las horas del espejo: honesto el día que
  // se escribía y congelado a partir del siguiente.
  const nota = g.filas.map((f) => String(f[2] ?? '')).find((c) => /registro cargado/.test(c))
  assert.ok(nota, 'desapareció la nota de hasta dónde llega el registro')
  assert.ok(nota.startsWith('='), `la nota volvió a ser texto estampado: ${nota}`)
  assert.match(nota, /MAXIFS\(/)
  assert.doesNotMatch(nota, /\d{1,2}\/\d{1,2}(\/\d{2,4})?"/, 'hay una fecha estampada en la nota')
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

test('LA COLUMNA "Banco" DE OFICINA ES DEL DUEÑO: el generador NO puede emitir el centinela ahí', () => {
  // ÉSTA ES LA CAUSA RAÍZ DE `OFICINA_BANCO` CIEGO. El comentario del generador decía —desde el primer
  // día— que estas celdas no se emiten para que la fusión preserve lo que carga el dueño; el código
  // las emitía con VACIO, que significa lo contrario ("es mi celda y va vacía"), y el worker se las
  // borraba cada 2 h. Revertirlo a VACIO pone rojo esto y el test de arriba.
  const iBanco = g.filas[g.o0 - 2].indexOf('Banco')
  assert.ok(iBanco > 0, 'desapareció el encabezado "Banco" del bloque de Oficina')
  for (let r = g.o0; r <= g.oFin; r++) {
    assert.notEqual(g.filas[r - 1][iBanco], VACIO,
      `fila ${r}: la columna Banco lleva el centinela — el generador le borra al dueño lo que cargue`)
  }
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
import { parsearAcuerdos, escalonDe } from '../lib/uocra-acuerdos.mjs'
import { mesesDelMotor } from '../lib/motor-salarial.mjs'
import { auditarPatron } from '../lib/patron-pestana.mjs'

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
const conMotor = () => grilla({
  bloques: BLOQUES, pendientes: PEND, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }, { mes: 7, inicio: 12, fin: 15 }],
  ultimoDiaOfi: new Date(2026, 6, 31), escalones: ESC, bloqueBase: BLOQUES[1],
  categorias: ['OF', 'A', 'A M', 'OF M'], personasBase: 16,
  escalonVigente: escalonDe(ESC, '2026-08'),
  meses: mesesDelMotor(new Date(2026, 6, 31), PEND, [new Date(2026, 6, 31)]), hoy: HOY,
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

test('el hero son CINCO cifras y las tres particiones suman el titular, sin solaparse', () => {
  const hero = gm.filas.slice(3, 10).map((f) => String(f[0]))
  assert.ok(hero.some((h) => /REAL —/.test(h)))
  assert.ok(hero.some((h) => /COMPROMETIDO —/.test(h)))
  assert.ok(hero.some((h) => /PROYECTADO —/.test(h)))
  assert.ok(hero.some((h) => /Próximo pago/.test(h)))
  const titular = String(gm.filas[gm.titular - 1][1])
  // El titular es la SUMA de las tres, no una fórmula que vuelva a las fuentes: si fuera lo segundo,
  // las líneas de abajo podrían no cerrar contra él y nadie se enteraría.
  assert.match(titular, /^=B\d+\+B\d+\+B\d+$/, `el titular dejó de ser la suma de las tres particiones: ${titular}`)
})

test('COMPROMETIDO sale POR DIFERENCIA: entre REAL y el registro no puede quedar un hueco', () => {
  const comp = String(gm.filas.find((f) => /COMPROMETIDO/.test(String(f[0])))[1])
  assert.match(comp, /-SUMPRODUCT\(\(\$N\$\d+:\$N\$\d+<>""\)/, 'si se calcula aparte, una quincena puede caer en las dos o en ninguna')
})

test('el próximo pago descarta el 0 de MINIFS: si no, muestra el 30/12/1899', () => {
  const prox = String(gm.filas.find((f) => /Próximo pago/.test(String(f[0])))[1])
  assert.match(prox, /MINIFS/)
  assert.match(prox, /IF\(MAX\(/, 'sin descartar los ceros, MIN(0; fecha) siempre da 0')
  assert.ok(gm.fechasHero.length === 1, 'esa celda tiene que recibir formato de FECHA, no de moneda')
})

test('B3 · el "escalón que viene" NO puede mostrar un número de otro año', () => {
  // La fixture tiene septiembre de 2025 y NO tiene septiembre de 2026 — el caso exacto del defecto.
  const fila = gm.filas.find((f) => /El escalón que viene/.test(String(f[0])))
  assert.match(String(fila[0]), /SIN ACUERDO PUBLICADO/)
  // Y las dos filas de abajo (básico y margen del mes que viene) quedan sin número, no con el de 2025.
  const i = gm.filas.indexOf(fila)
  assert.equal(gm.filas[i + 1][1], '', 'está trayendo el básico de 2025 como "el que viene"')
  const texto = gm.filas.flat().map(String).join(' ')
  assert.doesNotMatch(texto, /MATCH\(TEXT\(TODAY\(\);"mmmm"\)/, 'volvió el MATCH por nombre de mes')
})

test('B7 · ningún DATE con mes 13 o 14: diciembre se paga en enero del año que viene', () => {
  const texto = gm.filas.flat().map(String).join(' ')
  assert.doesNotMatch(texto, /DATE\(\d{4};1[3-9];/, 'volvió el mes 13')
  assert.match(texto, /DATE\(2027;1;/, 'el retiro de diciembre tiene que salir en enero de 2027')
})

test('el canario del espejo está en la pestaña: si el bloque se movió, lo dice', () => {
  const canario = gm.filas.flat().map(String).find((c) => /el bloque del espejo se movió/.test(c))
  assert.ok(canario, 'sin canario, un rango de filas absoluto que quedó viejo devuelve el plantel de antes en silencio')
})

test('la columna "Equivale a (convenio)" del plantel no lleva el centinela en ninguna fila', () => {
  for (let r = gm.plantel.fPrimera; r <= gm.plantel.fUltima; r++) {
    assert.equal(gm.filas[r - 1][4], '', `fila ${r}: el generador le borraría al dueño la categoría que cargue`)
  }
})
