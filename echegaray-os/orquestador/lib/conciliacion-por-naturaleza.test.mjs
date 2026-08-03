import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GRUPOS, segunBanco, VENTANA, sinPestanaDuena, RAW } from './conciliacion-por-naturaleza.mjs'
import { clasificarMovimiento, COBERTURA_NATURALEZA } from './banco-santander.mjs'

test('el importe del banco se devuelve en POSITIVO', () => {
  // Los egresos vienen negativos del extracto. Compararlos contra el positivo de una pestaña sin
  // invertir el signo daría el doble y parecería un desvío enorme donde no hay ninguno.
  assert.ok(segunBanco('Sueldos').startsWith('-SUMIFS'))
})

test('sólo mira lo que SALE: un cobro no se compara contra una pestaña de pagos', () => {
  assert.match(segunBanco('Cheques y echeq'), /"sale"/)
})

test('la ventana se lee de la réplica, no se escribe a mano', () => {
  assert.match(VENTANA.desde, new RegExp(`MIN\\(${RAW.hoja}!`))
  assert.match(VENTANA.hasta, new RegExp(`MAX\\(${RAW.hoja}!`))
})

test('las fórmulas van en es-AR', () => {
  for (const g of GRUPOS) {
    if (!g.formula) continue
    const f = g.formula('D1', 'D2')
    assert.ok(!f.includes(','), `una coma rompe la fórmula en es-AR: ${g.naturaleza}`)
  }
})

test('toda naturaleza que DEBE reconciliarse contra una pestaña tiene su grupo', () => {
  // ESTE TEST DABA FALSA CONFIANZA (28/07). Probaba una lista CURADA de 12 conceptos que —sin
  // querer— esquivaba justo las naturalezas sin grupo ("Ajuste sin detalle", los créditos). Ahora
  // itera la declaración canónica de cobertura: cada naturaleza marcada `grupoConciliacion` TIENE
  // que estar en GRUPOS. Si el clasificador aprende una naturaleza de egreso nueva y se olvida el
  // grupo, esto se rompe en vez de pasar por no haberla puesto en la lista de prueba.
  const conocidas = new Set(GRUPOS.map((g) => g.naturaleza))
  for (const cob of COBERTURA_NATURALEZA.filter((x) => x.grupoConciliacion)) {
    assert.ok(conocidas.has(cob.naturaleza), `"${cob.naturaleza}" debe reconciliarse pero no tiene grupo en GRUPOS`)
  }
})

test('el clasificador NUNCA produce una naturaleza sin declaración de cobertura', () => {
  // El puente entre lo que el banco puede decir y lo que el cash flow contempla. Un concepto real
  // que caiga en una naturaleza no declarada sería plata suelta sin que nada avise.
  const declaradas = new Set(COBERTURA_NATURALEZA.map((x) => x.naturaleza))
  const conceptos = [
    'Pago Haberes - 123', 'Impuesto Ley 25.413 Debito 0,6%', 'Transferencia Realizada - A Herrajes',
    'Echeq Clearing Recibido 24hs', 'Compra Con Tarjeta De Debito - Merpago', 'Pago De Servicios - Imp.afip',
    'Prestamos Prendarios - -', 'Pago Tarjeta De Credito Visa', 'Debito Automatico - Sancor',
    'Cobro De Interes Por Descubierto', 'Cheque Debitado', 'Canje Interno Recibido 24 Hs',
    'Ajuste Sin Detalle', 'Deposito De Efectivo - Sucursal', 'Transferencia Recibida - De Cliente',
    'Transferencia Recibida - De 30710630670',
  ]
  for (const c of conceptos) {
    assert.ok(declaradas.has(clasificarMovimiento(c)), `"${c}" → "${clasificarMovimiento(c)}" sin declaración de cobertura`)
  }
})

test('ningún grupo queda sin pestaña dueña', () => {
  // ESTE TEST NACIÓ AL REVÉS Y ESO IMPORTA. Afirmaba que el impuesto al cheque y el costo del
  // descubierto no tenían dueño, y era falso: el Cash Flow Mensual tiene las dos líneas. Llegué a
  // publicar esa alerta en CAJA. Un test que consagra una conclusión sin verificarla contra el
  // archivo la vuelve permanente — por eso ahora exige lo contrario: todo grupo tiene dueño, y si
  // aparece uno sin dueño hay que ir a buscar dónde debería estar antes de declararlo huérfano.
  assert.deepEqual(sinPestanaDuena().map((g) => g.naturaleza), [])
})

test('cada grupo dice qué significa la comparación', () => {
  for (const g of GRUPOS) assert.ok(g.nota && g.nota.length > 30, `${g.naturaleza} sin nota`)
})

/** Quita los literales entre comillas: lo que queda es la sintaxis de la fórmula. */
const sinLiterales = (f) => String(f).replace(/"(?:[^"]|"")*"/g, '""')

test('el grupo de cheques trae detalle accionable, no sólo un total', () => {
  // Un desvío de $899.154 no le sirve a nadie; "N° 218 Corralón Progreso $200.000" se resuelve en
  // dos minutos. El detalle lista los cheques que el banco debitó y la pestaña no marca.
  const g = GRUPOS.find((x) => x.naturaleza === 'Cheques y echeq')
  assert.ok(typeof g.detalle === 'function', 'el grupo de cheques tiene que traer detalle')
  const f = g.detalle()
  assert.ok(f.includes('Cheques Emitidos'), 'lee la pestaña de cheques')
  assert.ok(f.includes('<>"SI"'), 'sólo los NO debitados')
  // La coma sólo se prohíbe FUERA de un literal: dentro de un patrón como "$#,##0" es correcta y
  // necesaria —los patrones de formato de Sheets usan siempre la coma para los miles, sin importar
  // el locale—. Chequear la cadena entera marcaba como error una fórmula bien escrita.
  assert.ok(!sinLiterales(f).includes(','), `es-AR: coma fuera de un literal en ${f}`)
})

test('EL CONTROL DE LOS SUELDOS DE ADMINISTRACIÓN NO SE VALIDA CONTRA SU PROPIA FUENTE (03/08)', () => {
  // POR QUÉ EXISTE. La línea 54 de CAJA —"Sueldos de administración pagados sin declarar por qué
  // canal salieron"— es el control de las dos líneas de sueldos de administración, y sale de los
  // MISMOS dos rangos que ellas: OFICINA_PAGADO y OFICINA_BANCO. Cuando OFICINA_BANCO quedó ciego,
  // las dos líneas dieron $0 y el control informó "sin problemas" mirando el mismo agujero.
  //
  // El contraste tiene que venir de una fuente que la planilla no produce: el extracto. El grupo
  // "Sueldos" compara los débitos de haberes del banco contra lo que la planilla dice haber pagado
  // por transferencia — y hasta hoy ese lado sólo tenía la obra. Sin la oficina, un OFICINA_BANCO
  // ciego se absorbía en el desvío sin nombre.
  const g = GRUPOS.find((x) => x.naturaleza === 'Sueldos')
  const f = g.formula('D1', 'D2')
  assert.match(f, /JORNALES_REAL_BANCO/, 'la nómina de obra por transferencia')
  assert.match(f, /OFICINA_BANCO/, 'y la de administración: el banco paga las dos por el mismo lote de haberes')
  assert.match(f, /ISNUMBER\(OFICINA_PAGO\)/, 'la oficina se acota por su fecha de pago, no se suma el año entero')
  // Y sigue leyendo el EXTRACTO del otro lado: si esto se cayera, el control volvería a validarse
  // contra la misma planilla que produce el número.
  assert.match(segunBanco('Sueldos'), new RegExp(RAW.hoja))
})

test('la nota del grupo Sueldos declara la limitación de la fecha de la oficina', () => {
  // La oficina se filtra por "Se paga el", que es una fecha de CRITERIO (fin de mes + desfase), no el
  // día registrado en que salió la plata. Una limitación sin declarar anula el criterio que toca.
  const g = GRUPOS.find((x) => x.naturaleza === 'Sueldos')
  assert.match(g.nota, /Se paga el/)
})
