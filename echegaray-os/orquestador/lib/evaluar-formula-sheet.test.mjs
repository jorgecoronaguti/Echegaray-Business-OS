// EL INSTRUMENTO SE MIDE ANTES DE MEDIR CON ÉL.
//
// Este evaluador existe para que un test pueda decir "el promedio da 360.342,50" en vez de "la
// fórmula contiene la palabra SUMPRODUCT". Si el evaluador se equivoca, los tests que lo usan pasan
// en verde sobre un número inventado — o sea, un control validado contra la misma información que
// produce. Por eso acá se lo prueba contra casos cuyo resultado se puede calcular a mano.
import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarFormula, ErrorHoja, celdasDelRango, hojaDeGrilla, aSerial } from './evaluar-formula-sheet.mjs'

const HOY = new Date(Date.UTC(2026, 7, 13)) // 13/08/2026, el día que se encontró el defecto
const ev = (f, hoja = {}) => evaluarFormula(f, { hoja, hoy: HOY })

test('la aritmética y la precedencia son las de Sheets, no las del orden de lectura', () => {
  assert.equal(ev('=2+3*4'), 14)
  assert.equal(ev('=(2+3)*4'), 20)
  assert.equal(ev('=-3+10'), 7)
  assert.equal(ev('=10/4'), 2.5)
  // La comparación es el nivel MÁS FLOJO: primero suma, después compara. Si fuera al revés,
  // `1+1<3` daría 1+(1<3)=2 y todas las máscaras de mes cerrado quedarían mal.
  assert.equal(ev('=1+1<3'), 1)
})

test('una comparación vale 1 o 0, que es lo que hace posible la máscara de SUMPRODUCT', () => {
  assert.equal(ev('=5>3'), 1)
  assert.equal(ev('=5<3'), 0)
  assert.equal(ev('=A1:C1>0', { A1: 10, B1: 0, C1: 4 }).join(','), '1,0,1')
})

test('SUMPRODUCT multiplica elemento a elemento y suma — el corazón de la ventana de meses', () => {
  const hoja = { A1: 10, B1: 20, C1: 30, A2: 1, B2: 0, C2: 1 }
  assert.equal(ev('=SUMPRODUCT(A1:C1*A2:C2)', hoja), 40)
  assert.equal(ev('=SUMPRODUCT((A1:C1>15)*(A2:C2=1))', hoja), 1) // sólo C: >15 y con máscara
  assert.equal(ev('=SUM(A1:C1)', hoja), 60)
  assert.equal(ev('=MAX(A1:C1;100)', hoja), 100)
  assert.equal(ev('=COUNTIF(A1:C1;">15")', hoja), 2)
})

test('dos rangos de distinto largo son un error de hoja, no un resultado a medias', () => {
  assert.throws(() => ev('=SUMPRODUCT(A1:C1*A2:B2)', { A1: 1, B1: 1, C1: 1, A2: 1, B2: 1 }), ErrorHoja)
})

test('EOMONTH y TODAY dan el mismo serial que Sheets: de ahí sale "el mes en curso"', () => {
  assert.equal(ev('=TODAY()'), aSerial(HOY))
  // El primero del mes en curso, la definición que usa la pestaña: 01/08/2026.
  assert.equal(ev('=EOMONTH(TODAY();-1)+1'), aSerial(new Date(Date.UTC(2026, 7, 1))))
  assert.equal(ev('=EOMONTH(TODAY();0)'), aSerial(new Date(Date.UTC(2026, 7, 31))))
  // Y una fecha del encabezado se compara como número contra esa expresión.
  assert.equal(ev('=A1<EOMONTH(TODAY();-1)+1', { A1: new Date(Date.UTC(2026, 6, 1)) }), 1, 'julio ya cerró')
  assert.equal(ev('=A1<EOMONTH(TODAY();-1)+1', { A1: new Date(Date.UTC(2026, 7, 1)) }), 0, 'agosto NO cerró')
})

test('IFERROR absorbe el #REF! de otra pestaña — así el factor de inflación cae en 1', () => {
  assert.equal(ev('=IFERROR(Parámetros!$C$74;1)'), 1)
  assert.equal(ev('=IFERROR(1/0;"cero")'), 'cero')
  // Pero NO absorbe un error de programa: lo que el instrumento no sabe hacer tiene que gritar, o el
  // test daría verde sobre el valor por defecto del IFERROR sin haber evaluado nada.
  assert.throws(() => ev('=IFERROR(VLOOKUP(1;2;3);1)'), /no está soportada/)
  assert.throws(() => ev('=IFERROR(SUM(A1:B2);1)', { A1: 1, B1: 2, A2: 3, B2: 4 }), /rectangular/)
})

test('IF no evalúa la rama que no se toma: sin eso, un #REF! del otro lado rompería la buena', () => {
  assert.equal(ev('=IF(1;7;Parámetros!$C$74)'), 7)
  assert.equal(ev('=IF(0;Parámetros!$C$74;9)'), 9)
})

test('una celda con fórmula se resuelve sola, y una circular grita', () => {
  assert.equal(ev('=B1*2', { B1: '=A1+1', A1: 4 }), 10)
  assert.throws(() => ev('=A1', { A1: '=A1+1' }), /circular/)
})

test('una celda vacía vale cero, pero un rótulo en el medio de la cuenta es un error', () => {
  assert.equal(ev('=SUM(A1:C1)', { A1: 5, C1: 5 }), 10)
  assert.throws(() => ev('=A1+1', { A1: 'TOTAL' }), ErrorHoja)
})

test('el rango se expande en las celdas reales, y la grilla del generador se mapea a A1', () => {
  assert.deepEqual(celdasDelRango('$R$5:$T$5'), ['R5', 'S5', 'T5'])
  assert.deepEqual(celdasDelRango('B4:B6'), ['B4', 'B5', 'B6'])
  const hoja = hojaDeGrilla([['x', 1], ['y', 2]])
  assert.equal(hoja.A1, 'x')
  assert.equal(hoja.B2, 2)
})

// ─────────────────────────────────────────────────────────────────────────────
// TEXT() — LAS DOS REGLAS OPUESTAS DE LA MISMA LÍNEA
// ─────────────────────────────────────────────────────────────────────────────

test('el patrón de TEXT va en notación US y se RINDE en es-AR: la coma agrupa, no separa decimales', () => {
  // EL DEFECTO QUE MOTIVÓ ESTE SOPORTE (13/08): la pestaña OBRAS publicó "$ 23795136,0" donde iba
  // "$ 23.795.136". El patrón se había escrito "#.##0" razonando que en es-AR los miles van con
  // punto — pero el patrón que viaja por la API es US, y ese punto se leyó como el DECIMAL.
  // El separador de ARGUMENTOS sí va en locale (`;`): dos reglas opuestas en la misma línea.
  assert.equal(ev('=TEXT(23795136;"$ #,##0")'), '$ 23.795.136')
  assert.equal(ev('=TEXT(65000000;"$ #,##0")'), '$ 65.000.000')
  assert.equal(ev('=TEXT(0;"$ #,##0")'), '$ 0')
  assert.equal(ev('=TEXT(-1234567;"$ #,##0")'), '-$ 1.234.567')
  // Y el patrón equivocado devuelve el número CRUDO: es lo que hace fallar al test que lo usa.
  assert.equal(ev('=TEXT(65000000;"$ #.##0")'), '$ 65000000,000')
})

test('TEXT también rinde fechas desde el serial', () => {
  assert.equal(ev('=TEXT(46261;"dd/mm")'), '27/08')
  assert.equal(ev('=TEXT(46261;"dd/mm/yyyy")'), '27/08/2026')
  assert.equal(ev('=TEXT(46261;"dd/mm/yy")'), '27/08/26')
})

test('un patrón que el modelo no sabe rendir REVIENTA: un texto inventado haría pasar un test vacío', () => {
  assert.throws(() => ev('=TEXT(1;"0.0%")'), /patrón de número no soportado/)
  assert.throws(() => ev('=TEXT(1;"#,##0;(#,##0)")'), /patrón de número no soportado/)
})
