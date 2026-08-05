// La banda de "Cheques Emitidos" se construye sola: acá se prueba lo que NO se puede ver mirando.
//
// Las dos cosas que ya rompieron esta pestaña en la vida real:
//   1. Un ancla en un rótulo que una persona puede borrar (el dueño borró "TIPO" y el generador
//      insertó 12 filas a ciegas, dejando la pestaña con DOS bandas superpuestas).
//   2. Una fórmula de total que cita filas fijas y se desalinea cuando la banda cambia de alto.
import test from 'node:test'
import assert from 'node:assert/strict'
import { bandaFilas, ubicarRegistro } from './cheques-emitidos-tablero.mjs'

const HDR = 20
const banda = bandaFilas(HDR)
const colA = banda.map((f) => f[0])
const filaDe = (re) => colA.findIndex((a) => re.test(String(a ?? ''))) + 1

test('la banda tiene el alto declarado y una sola grilla de 13 columnas', () => {
  assert.equal(banda.length, HDR - 1)
  assert.ok(banda.every((f) => f.length === 13), 'alguna fila no tiene 13 columnas')
})

test('la gramática: título, subtítulo, y tres secciones numeradas y corridas', () => {
  assert.equal(banda[0][0], 'Cheques emitidos')
  assert.match(banda[1][0], /^="Cuánto de lo firmado/)
  const secciones = colA.filter((a) => /^\d+ · /.test(String(a ?? '')))
  assert.equal(secciones.length, 3)
  secciones.forEach((s, i) => assert.match(String(s), new RegExp(`^${i + 1} · `), `la sección ${i + 1} está fuera de orden`))
})

test('ni un número pegado: todo lo que va en la columna B es fórmula', () => {
  for (const f of banda) {
    if (f[1] === '') continue
    assert.ok(String(f[1]).startsWith('=') || f[1] === 'Monto', `valor pegado en la banda: ${f[1]}`)
  }
})

test('el total de los tramos suma EXACTAMENTE las filas de los tramos', () => {
  const fTotal = filaDe(/^⇒ Comprometido, no debitado/)
  const fPrimerTramo = filaDe(/^Vencido —/)
  const fUltimoTramo = filaDe(/^Sin fecha de pago cargada/)
  assert.ok(fTotal && fPrimerTramo && fUltimoTramo)
  assert.equal(banda[fTotal - 1][1], `=SUM(B${fPrimerTramo}:B${fUltimoTramo})`)
  // Y los tramos son consecutivos: si alguien mete una fila en el medio, el total la comería.
  assert.equal(fUltimoTramo - fPrimerTramo, 4, 'los cinco tramos tienen que ir pegados')
})

test('el titular resta las dos líneas que están justo arriba', () => {
  const fTitular = filaDe(/^⇒ Con esto podés pagar/)
  assert.equal(banda[fTitular - 1][1], `=IF(ISNUMBER(B${fTitular - 2});B${fTitular - 2}-B${fTitular - 1};"⚠ falta el saldo de CAJA")`)

})

test('los tramos cubren toda la recta del tiempo, sin huecos ni superposición', () => {
  const f = (re) => String(banda[filaDe(re) - 1][1])
  assert.match(f(/^Vencido —/), /<TODAY\(\)\)/)
  assert.match(f(/^Esta semana/), />=TODAY\(\)\)\*\(\$I\$20:\$I<TODAY\(\)\+7\)/)
  assert.match(f(/^Hasta fin de este mes/), />=TODAY\(\)\+7\)/)
  assert.match(f(/^Más adelante/), />=MAX\(TODAY\(\)\+7;EOMONTH\(TODAY\(\);0\)\+1\)\)/)
  assert.match(f(/^Sin fecha/), /NOT\(ISNUMBER/)
})

test('la plata disponible se cita POR NOMBRE — ni por celda ni por rótulo', () => {
  // ═══ ESTE TEST EXIGÍA LO CONTRARIO Y SE DIO VUELTA (05/08) ═══
  //
  // Pedía `MATCH("Total disponibilidades"; CAJA!$A$1:$A$200; 0)` y lo defendía así: "si el rótulo
  // cambia la celda tiene que gritar, no mentir". La mitad estaba bien —gritar es mejor que mentir— y
  // cuando el rediseño de CAJA le agregó tres palabras al rótulo, gritó. Pero gritar no es la
  // respuesta correcta cuando el dato SÍ está: la pestaña quedó publicando "⚠ falta el saldo de CAJA"
  // sobre una CAJA que tenía su total perfectamente calculado.
  //
  // Un match exacto contra un texto es un contrato entre pestañas escrito en el idioma equivocado. El
  // contrato es el RANGO CON NOMBRE, que CAJA reapunta en cada corrida a la fila real de su total:
  // sobrevive a que se muevan las filas Y a que se reescriba el rótulo.
  const f = String(banda[filaDe(/^Plata disponible hoy/) - 1][1])
  assert.ok(f.includes('CAJA_TOTAL_DISPONIBLE'), 'el saldo de CAJA se cita por rango con nombre')
  assert.doesNotMatch(f, /MATCH\(/, 'un rótulo se puede reescribir; un nombre no')
  assert.doesNotMatch(f, /CAJA!\$?[A-Z]/, 'y menos todavía por celda: CAJA se reescribe entera')
  assert.match(f, /⚠/, 'y si CAJA todavía no publicó su total, lo dice en vez de mostrar un cero')
})

test('la banda NUNCA escribe en la columna F: CAJA la suma como si fuera un cheque', () => {
  for (const f of banda) assert.equal(f[5], '', 'hay contenido en la columna F de la banda')
})

// ═══ EL DEFECTO QUE EL DUEÑO REPORTÓ EL 03/08 ═══
//
// La pestaña decía "al 24/7/2026" con cheques cargados al 03/08: la fecha era la del día en que
// corrió el generador, no la del último cheque. El registro lo carga el dueño A MANO, así que cambia
// sin que corra nadie — y el rótulo se quedaba atrás para siempre.

test('el corte del subtítulo sale del registro, no del reloj de la corrida', () => {
  const sub = String(banda[1][0])
  // Dos corridas distintas tienen que producir EXACTAMENTE el mismo texto: si dependiera de la fecha
  // del sistema, este archivo volvería a estampar la fecha del día.
  assert.equal(sub, String(bandaFilas(HDR)[1][0]), 'el subtítulo cambia entre corridas: depende del reloj')
  assert.ok(sub.startsWith('='), 'tiene que ser fórmula: un texto no lo recalcula Sheets')
  assert.match(sub, /\$C\$20:\$C/, 'la fecha sale de la columna C (fecha de emisión) del registro')
  const sinMascara = sub.replace(/"dd\/mm\/yyyy"/g, '')
  assert.doesNotMatch(sinMascara, /\d{1,2}\/\d{1,2}\/\d{2,4}/, 'quedó una fecha estampada en el subtítulo')
})

test('el corte no puede irse al futuro por un cheque diferido', () => {
  // La columna I trae fechas de pago diferidas (septiembre). Si el corte se calculara sobre ella —o
  // sobre C sin filtrar— el subtítulo declararía frescura de algo que todavía no pasó.
  assert.match(String(banda[1][0]), /<=TODAY\(\)/)
})

test('el subtítulo se ancla al ancla calculada, nunca a una fila escrita a mano', () => {
  // Una fila fija ya dio #NUM! en cadena y contaminó el titular de CAJA cuando el bloque se corrió.
  assert.match(String(bandaFilas(30)[1][0]), /\$C\$30:\$C/, 'el rango tiene que seguir al HDR real')
})

test('el registro se ubica por el DATO (FISICO/ECHEQ), no por un rótulo borrable', () => {
  const colA = [['Cheques emitidos'], [''], ['Tipo'], ['FISICO'], ['ECHEQ']]
  assert.deepEqual(ubicarRegistro(colA), { primera: 4, hdr: 3 })
  // Sin rótulo "TIPO" —el dueño lo borró— igual encuentra el registro.
  assert.deepEqual(ubicarRegistro([['x'], [''], [''], ['ECHEQ']]), { primera: 4, hdr: 3 })
  // Y si no hay registro, no adivina: devuelve null y el script aborta.
  assert.equal(ubicarRegistro([['x'], ['y']]), null)
})

// ═══ 3. EL RÓTULO DE CORTE SE MUEVE CON LAS DOS PUERTAS, NO SÓLO CON LA EMISIÓN ═══
//
// El pedido del dueño (03/08): *"siempre q modifiques valores de caja con el extracto q te envio […]
// las fechas que aparecen se deben actualizar de manera automatica"*. Marcar DEBITADO=SI ES una
// modificación que viene del extracto, y mueve los dos números grandes de la banda. Con la emisión
// como única fuente ese hecho no movía el rótulo.

const subtitulo = String(banda[1][0])

test('el corte mira TAMBIÉN la fecha de pago de los cheques ya debitados', () => {
  // Si alguien vuelve a dejar sólo la emisión, este test se cae.
  assert.match(subtitulo, new RegExp(`UPPER\\(\\$K\\$${HDR}:\\$K\\)="SI"`),
    'marcar DEBITADO=SI tiene que mover el rótulo: es la puerta del extracto')
  assert.match(subtitulo, new RegExp(`\\$I\\$${HDR}:\\$I`), 'la fecha del débito sale de la columna I')
  assert.match(subtitulo, new RegExp(`\\$C\\$${HDR}:\\$C`), 'y la emisión sigue contando')
  assert.match(subtitulo, /^="[^"]*"&IF\(MAX\(/, 'las dos puertas se combinan con MAX, no se elige una')
})

test('la fecha de pago SIN debitar no cuenta: es una previsión, no un hecho', () => {
  // Un MAX pelado sobre la columna I metería los diferidos no debitados: un cheque con fecha de pago
  // hoy que el banco todavía no debitó declararía frescura de algo que no ocurrió (Regla de Oro 2).
  // La única aparición legítima de la columna I es dentro de un MAX que arranca con el filtro.
  const conFiltro = `MAX((UPPER($K$${HDR}:$K)="SI")*IF(ISNUMBER($I$${HDR}:$I)`
  const sinFiltro = subtitulo.split(conFiltro).join('')
  assert.ok(!sinFiltro.includes(`$I$${HDR}:$I`) || !/MAX\(IF\(ISNUMBER\(\$I/.test(sinFiltro),
    'hay un MAX sobre la fecha de pago que NO exige DEBITADO="SI"')
})

test('ninguna de las dos puertas declara frescura del futuro', () => {
  // La columna I trae diferidos a septiembre y la C podría traer un año mal tipeado: sin `<=TODAY()`
  // el corte diría septiembre. Se comprueba puerta por puerta, no contando apariciones — la
  // expresión se repite cuatro veces dentro del rótulo y un conteo no dice CUÁL falta.
  for (const col of ['C', 'I']) {
    assert.match(subtitulo, new RegExp(`IF\\(ISNUMBER\\(\\$${col}\\$${HDR}:\\$${col}\\);\\$${col}\\$${HDR}:\\$${col};0\\)<=TODAY\\(\\)`),
      `la puerta de la columna ${col} no filtra el futuro`)
  }
})

test('el rótulo no trae ninguna fecha estampada: si la trajera, quedaría clavada', () => {
  assert.doesNotMatch(subtitulo.replace(/"dd\/mm\/yyyy"/g, ''), /\d{1,2}\/\d{1,2}\/\d{2,4}/)
})

test('separador es-AR: ni una coma en la parte CALCULADA de la fórmula', () => {
  // La coma es el separador DECIMAL en es-AR: una coma entre argumentos parte la fórmula. Se miran
  // sólo los operadores, no los literales — el rótulo es prosa en castellano y ahí la coma es la
  // puntuación, no un separador ("de la cuenta, y cuándo sale").
  const soloCalculo = subtitulo.replace(/"(?:[^"]|"")*"/g, '')
  assert.doesNotMatch(soloCalculo, /,/, `hay una coma separando argumentos: ${soloCalculo}`)
})
