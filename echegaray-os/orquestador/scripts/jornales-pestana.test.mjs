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

test('hasta dónde llega el registro se dice UNA vez, en el subtítulo, y por FÓRMULA', () => {
  // Era `cargada hasta el ${cargaAlDia}`, medido en JS sobre las horas del espejo: honesto el día que
  // se escribía y congelado a partir del siguiente. Y estaba DOS veces —en el subtítulo y al lado del
  // titular—, donde la copia quedaba tapada por el propio titular en cuerpo 13. Ahora vive sólo en la
  // fila 2, que es donde la gramática pone la fecha de corte de una pestaña.
  const subtitulo = String(g.filas[1][0] ?? '')
  assert.ok(subtitulo.startsWith('='), `el subtítulo volvió a ser texto estampado: ${subtitulo}`)
  assert.match(subtitulo, /MAXIFS\(/)
  assert.doesNotMatch(subtitulo, /\d{1,2}\/\d{1,2}(\/\d{2,4})?"/, 'hay una fecha estampada en el subtítulo')
  // Y la copia NO vuelve: al lado del titular no puede haber texto, porque el importe le pasa por
  // encima. Se comprueba sobre la fila del titular, no sobre la pestaña entera.
  assert.equal(String(g.filas[g.titular - 1][2] ?? '').replace(VACIO, ''), '',
    'volvió la glosa al lado del titular: el importe en cuerpo 13 la tapa')
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

test('el próximo pago: el IMPORTE en la B y la FECHA en la C, como toda la pestaña', () => {
  const fila = gm.filas.find((f) => /Próximo pago/.test(String(f[0])))
  // LA REGLA DE COLUMNA: la B es el importe en las catorce filas de esta pestaña. Acá estaba al revés
  // —fecha en la B, plata en la C— y era la única fila del hero donde la columna de los pesos no tenía
  // pesos: el ojo baja por la columna de importes y tropieza con un 17/08/2026.
  assert.match(String(fila[1]), /SUMIFS/, 'la B del próximo pago tiene que ser cuánto')
  assert.match(String(fila[2]), /MINIFS/, 'la C tiene que ser cuándo')
  assert.match(String(fila[2]), /IF\(MAX\(/, 'sin descartar los ceros, MIN(0; fecha) siempre da 0')
  // Y el importe se busca por la celda de la fecha, que ahora es la C: si quedara apuntando a la B
  // sumaría contra un importe y devolvería 0 sin dar error.
  assert.match(String(fila[1]), new RegExp(`C${gm.filas.indexOf(fila) + 1}`))
  assert.ok(gm.fechasHero.length === 1, 'esa celda tiene que recibir formato de FECHA, no de moneda')
  const reqs = requestsDeFormato(1, gm.filas, gm)
  assert.equal(formatoDe(reqs, gm.fechasHero[0], 2).type, 'DATE', 'la C del hero salió como plata')
  assert.equal(formatoDe(reqs, gm.fechasHero[0], 1).type, 'CURRENCY', 'la B del hero salió como fecha')
})

test('B3 · el "escalón que viene" NO puede mostrar un número de otro año', () => {
  // La fixture tiene septiembre de 2025 y NO tiene septiembre de 2026 — el caso exacto del defecto.
  const fila = gm.filas.find((f) => /El escalón que viene/.test(String(f[0])))
  assert.match(String(fila[0]), /SIN ACUERDO PUBLICADO/)
  // Y las dos filas de abajo NO SE EMITEN. Antes se emitían vacías: dos rótulos sin cifra debajo de
  // una oración que ya explicaba la ausencia. Traer el básico de 2025 sigue prohibido, y ahora además
  // no queda el hueco — la ausencia se declara una vez, en palabras.
  const i = gm.filas.indexOf(fila)
  assert.doesNotMatch(String(gm.filas[i + 1][0] ?? ''), /Básico de .* desde ese mes/,
    'volvió la fila vacía del básico del mes que viene')
  assert.equal(gm.ratios.length, 1, 'sin acuerdo publicado hay UN margen, no dos')
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
  const ofiProy = gm.filas.slice(gm.o0 - 1, gm.oFin).filter((f) => String(f[3]) === 'proyección')
  assert.ok(ofiProy.length >= 5, `esperaba meses de oficina proyectados y hay ${ofiProy.length}`)
  for (const f of ofiProy) {
    assert.match(String(f[6]), anclaEnEscalon, 'un mes de oficina se proyecta fuera del cuadro del escalón')
    assert.match(String(f[6]), /\/INDEX/, 'oficina perdió su propio mes base: se le aplica el aumento de otro')
  }

  // DIRECCIÓN: la misma columna, el mismo cuadro, y la base es el MES EN CURSO por fórmula —el importe
  // sale de la última carga en Compras, o sea que es el valor de hoy.
  const dir = gm.filas.slice(gm.d0 - 1, gm.dFin)
  for (const f of dir) {
    assert.match(String(f[6]), anclaEnEscalon, 'el retiro de un mes volvió a proyectarse sin ajuste')
    assert.match(String(f[6]), /EOMONTH\(TODAY\(\);0\)/, 'la base del ajuste quedó estampada en un mes fijo')
  }
  // Y el proyectado MULTIPLICA por ese factor, con la celda validada: `total*""` daría 0 y borraría el
  // retiro del mes sin dar un solo error.
  const r = gm.d0
  assert.match(String(dir[0][7]), new RegExp(`\\*IFERROR\\(IF\\(ISNUMBER\\(G${r}\\);G${r};1\\);1\\)`),
    `el retiro de un mes dejó de escalar por la paritaria: ${dir[0][7]}`)
})

test('el supuesto de la proyección se declara CON EL DATO, y ningún mes queda estampado en el código', () => {
  // La línea que explica el driver sale de la réplica ya parseada: si mañana se pega un acuerdo nuevo,
  // cambia sola. Un mes escrito en el código envejece al día siguiente y nadie se entera.
  const glosa = gm.filas.map((f) => String(f[0] ?? '')).find((c) => /PARITARIA UOCRA/.test(c))
  assert.ok(glosa, 'desapareció la línea que declara con qué sube la proyección')
  assert.match(glosa, /Agosto \+1,9%/, 'el rótulo tiene que salir de la réplica de la fixture')
  assert.match(glosa, /PROYECCIÓN, no acuerdo/, 'no se puede presentar lo proyectado como acuerdo')
  // LA PRUEBA DE QUE NO ESTÁ ESTAMPADO: con otra réplica, la línea dice otro mes.
  const otra = parsearAcuerdos([['Acuerdo Abril 2026'], ...cinco('Mayo\n+2,4%', [6100, 5200, 4800, 4420, 806000])]).escalones
  const g2 = grilla({
    bloques: BLOQUES, pendientes: PEND, bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }],
    ultimoDiaOfi: new Date(2026, 6, 31), escalones: otra, bloqueBase: BLOQUES[1],
    categorias: ['OF'], personasBase: 16, escalonVigente: null,
    meses: mesesDelMotor(new Date(2026, 6, 31), PEND, [new Date(2026, 6, 31)]), hoy: HOY,
  })
  const glosa2 = g2.filas.map((f) => String(f[0] ?? '')).find((c) => /PARITARIA UOCRA/.test(c))
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
  assert.equal(String(gm.filas[gm.p0 - 2][6]), 'Σ $/hora convenio', 'el encabezado de 1.3 quedó con la base vieja')
  // 5 · cada quincena proyectada busca SU mes en ese cuadro y multiplica por horas × días…
  const q = gm.filas[gm.p0 - 1]
  assert.match(String(q[6]), new RegExp(`INDEX\\(\\$F\\$${gm.esc.f0}:\\$F\\$${gm.esc.f1};MATCH\\(EOMONTH\\(`))
  assert.match(String(q[7]), /^=IFERROR\(G\d+\*F\d+\*D\d+/)
  // 6 · …y esa columna H es la que publica el rango que consumen Cargas Sociales, el Libro, CAJA y los
  //     cash flows. Si alguien la mueve de columna, la base nueva no llega a ninguna otra pestaña.
  const proy = rangosDeJornales(gm).find((x) => x.nombre === 'JORNALES_PROY_TOTAL')
  assert.equal(proy.c0, 7, 'JORNALES_PROY_TOTAL dejó de apuntar a la columna donde cae la valuación al convenio')
  assert.equal(proy.r0, gm.p0)
})

test('EL SUPUESTO SE LEE EN LA PESTAÑA, ARRIBA DEL CUADRO QUE LO USA', () => {
  // Un número que se lee como un hecho y es una hipótesis es peor que no tenerlo: acá abajo hay diez
  // quincenas valuadas a una escala que hoy NO se paga.
  const linea = gm.filas.map((f) => String(f[0] ?? '')).find((c) => /SUPUESTO DEL DUEÑO/.test(c))
  assert.ok(linea, 'desapareció la línea que declara que la proyección asume el 100% del convenio')
  assert.match(linea, /100% DEL CONVENIO/)
  assert.match(linea, /POR DEBAJO/, 'sin esto se lee como que hoy pagamos la escala')
  // Va ANTES del cuadro 1.2, que es el que la aplica — no al final de la pestaña.
  assert.ok(gm.filas.findIndex((f) => /SUPUESTO DEL DUEÑO/.test(String(f[0] ?? ''))) < gm.esc.f0 - 1)
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
  const linea = g2.filas.map((f) => String(f[0] ?? '')).find((c) => /PACTADO|SUPUESTO DEL DUEÑO/.test(c))
  assert.match(linea, /PACTADO/, 'la pestaña anuncia el convenio y el cuadro está usando el pactado')
  assert.doesNotMatch(linea, /SUPUESTO DEL DUEÑO/)
  assert.equal(String(g2.filas[g2.p0 - 2][6]), 'Σ $/hora pactada', 'el encabezado también tiene que decir la verdad')
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
  assert.match(aviso, /Ayudante: réplica 4948 ≠ verificado 5399/)
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL FORMATO, PROBADO EN FRÍO (06/08). Los dos defectos de abajo se vieron MIRANDO la pestaña y
// ninguno da error: una cifra mal formateada es plausible y equivocada, que es la peor clase.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { requestsDeFormato } from './jornales-pestana.mjs'

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
  const linea = gm.filas.map((f) => String(f[0] ?? '')).filter((c) => /COUNTA\(\$A\$/.test(c))
  assert.equal(linea.length, 1, 'la línea del convenio tiene que existir UNA sola vez')
  // ═══ Y DESDE EL 07/08 YA NO PIDE: DECLARA (equivalencia del dueño) ═══
  // Las cuatro categorías del plantel tienen equivalente, así que la línea dice contra qué compara el
  // bloque en vez de pedir una carga manual que ya no hace falta.
  assert.match(linea[0], /OF, OF M→Oficial/)
  assert.match(linea[0], /A, A M→Ayudante/)
  assert.match(linea[0], /manda la tuya/, 'la columna «Convenio» sigue siendo del dueño y su valor gana')
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
  // El encabezado de la G de Oficina decía "Ajuste inflación" desde antes de que el bloque dejara de
  // ajustar por inflación: hoy usa el factor del escalón salarial, igual que la obra.
  assert.equal(encabezadoDe(gm.o0 - 1)[6], 'Ajuste escalón')
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

test('la proyección: las horas por persona NO son plata, y la Σ $/hora SÍ', () => {
  const reqs = requestsDeFormato(1, gm.filas, gm)
  const finProy = gm.p0 + gm.nProy - 1
  for (const f of [gm.p0, finProy]) {
    // F = "Horas por persona" (7,166). Sin formato propio se la comía el barrido de moneda: "$7".
    const horas = formatoDe(reqs, f, 5)
    assert.equal(horas.type, 'NUMBER', `fila ${f}: las horas volvieron a dibujarse como plata`)
    assert.match(horas.pattern, /0\.00/, 'con un decimal, 7,166 se muestra "7,2": el redondeo presentado como el dato')
    // G = "Σ $/hora del mes": pesos por hora. Iba con el patrón "0.00" heredado del ajuste por
    // inflación del layout viejo, o sea crudo y sin el $, mientras la misma columna del registro va
    // con moneda. Dos formatos para la misma magnitud en la misma pestaña.
    const sigma = formatoDe(reqs, f, 6)
    assert.equal(sigma.type, 'CURRENCY', `fila ${f}: la Σ $/hora sigue cruda`)
  }
  // Y la celda MEDIDA de la que salen esas diez filas se ve igual que ellas: la misma cifra no puede
  // mostrarse de dos maneras en la misma pestaña.
  for (const f of gm.cantidades) assert.match(formatoDe(reqs, f, 1).pattern, /0\.00/)
})
