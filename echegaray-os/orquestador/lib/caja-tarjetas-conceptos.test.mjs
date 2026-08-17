// LOS CONCEPTOS DE LA FILA DE TARJETAS — EL DEFECTO QUE EL DUEÑO RECLAMÓ TRES VECES (16/08/2026)
//
// Textual: *"no estas tomando bien los conceptos q surgen de compras proveedores cobranzas, y por
// ende las tarjetas estan todas mal"*. Y antes: *"de repente debemos mas en lo q falta del mes q lo
// q ya se ha pagado"*.
//
// Hubo DOS correcciones fallidas antes de ésta, y las dos tocaron la FRASE. El defecto no estaba en
// la frase: estaba en qué se suma adentro del número. Medido contra el Sheet vivo el 16/08, la
// tarjeta "FALTA PAGAR ESTE MES" publicaba $122.325.841 y la suma era FIEL al libro — lo que estaba
// mal era lo que entraba:
//
//   COMPROMETIDO   $70.420.524   obligación: la factura del proveedor, el cheque librado
//   PROYECTADO     $37.977.572   NADIE DEBE ESTO: materiales estimados, "Estructura esperada",
//                                "Recurrente esperado · Movistar", nafta por cuota
//   VENCIDO        $13.927.745   estaba previsto, la fecha pasó y nadie lo concilió
//
// `libro-movimientos.mjs` cita la regla absoluta de la skill de tesorería en su propia cabecera:
// *"Nunca se suman dos categorías distintas en la misma columna sin distinguirlas"*. El libro la
// cumple —el estado es un campo, no una propiedad de la vista— y la tarjeta que lo publica la
// rompía: metía las tres en un titular rotulado "FALTA PAGAR", al lado de "pagaste $69M" que sí son
// pagos reales. Comparar pagos reales contra deuda+presupuesto es comparar dos cosas distintas, y
// es literalmente lo que el dueño señaló.
//
// ESTOS TESTS FIJAN EL CONCEPTO, NO EL TEXTO. Si alguien vuelve a meter el plan de gasto adentro de
// la deuda, o vuelve a apagar los ingresos dejando el gasto prendido, se ponen rojos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { tarjetas, NO_REAL, FIN_DE_MES, DEUDA, PLAN } from './caja-tarjetas.mjs'
import { terminoLibro } from './libro-sumas.mjs'

const REF = {
  total: '$C$15', fecha: '$D$15', invArs: '$C$11', invUsd: '$C$12', invFecha: '$D$11',
  pisoSimple: '$I$15', pisoFecha: '$G$15',
}
const de = (clave) => tarjetas(REF).find((t) => t.clave === clave)

const term = (estados, signo = -1) => terminoLibro({ signo, estados, hasta: FIN_DE_MES, medida: 'magnitud' })

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// DEFECTO 1 — UNA TARJETA QUE DICE "SE DEBE" CON GASTO QUE NADIE DEBE TODAVÍA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la tarjeta de DEUDA no puede contener PROYECTADO: eso es presupuesto, no obligación', () => {
  // $37.977.572 de materiales estimados y "Estructura esperada" viajaban adentro de un número
  // rotulado "FALTA PAGAR". Un gasto planeado no es una deuda: si no entra plata, no se compra.
  const c = de('comprometida')
  assert.ok(!c.valor.includes('"PROYECTADO"'),
    'el titular de la deuda suma PROYECTADO: gasto planeado publicado como plata que se debe')
  assert.ok(c.valor.includes('"COMPROMETIDO"'), 'la deuda tiene que sumar lo COMPROMETIDO')
})

test('DEUDA y PLAN son DISJUNTOS y EXHAUSTIVOS: partir el número no puede perder ni duplicar plata', () => {
  // La garantía algebraica del corte. `DEUDA ∪ PLAN` tiene que dar exactamente los tres estados que
  // el titular viejo sumaba (NO_REAL), y `DEUDA ∩ PLAN` tiene que ser vacío. Sin esto, "separar los
  // conceptos" puede esconder un pedazo de plata en la costura — que es peor que el defecto original.
  assert.deepEqual([...DEUDA].sort().concat([...PLAN].sort()).sort(), [...NO_REAL].sort(),
    'la unión de DEUDA y PLAN tiene que ser exactamente NO_REAL: ni un estado de más, ni uno de menos')
  assert.equal(DEUDA.filter((e) => PLAN.includes(e)).length, 0,
    'ningún estado puede estar en los dos: se contaría dos veces')
})

test('el PLAN se publica al lado de la deuda: separar los conceptos no es esconder uno', () => {
  // Los dos importan. Lo que no puede pasar es que vivan bajo el mismo rótulo.
  const c = de('comprometida')
  assert.ok(c.contexto.includes(term(PLAN)),
    'el gasto planeado tiene que estar publicado en la tarjeta, con la fórmula viva del libro')
  assert.match(c.contexto, /M plan/, 'y nombrado como plan, para que no se lea como deuda')
})

test('el rótulo no puede prometer deuda si adentro hay presupuesto', () => {
  const c = de('comprometida')
  assert.doesNotMatch(c.rotulo, /FALTA PAGAR/,
    '"falta pagar" sobre un número que incluye presupuesto es la frase que el dueño rechazó dos veces')
  assert.match(c.rotulo, /DEUDA/, 'el rótulo tiene que nombrar el concepto que el número mide')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// DEFECTO 2 — UN ESCENARIO QUE APAGA LOS INGRESOS Y DEJA EL GASTO PRENDIDO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('SI NO COBRÁS MÁS: apagar los ingresos apaga lo que depende de ellos', () => {
  // La resta `A3 − C3` asumía CERO ingresos y conservaba el 100% del gasto proyectado. Si no entra
  // plata, esos materiales no se compran: el escenario se contradecía a sí mismo y por eso el número
  // no servía para decidir. Con la deuda sola en C3, la resta pasa a ser coherente sin cambiar de
  // forma — sigue siendo la resta de las dos tarjetas vecinas, verificable con los ojos.
  const l = de('libre')
  assert.equal(l.valor, '=N($A$3)-N($C$3)')
  assert.ok(!l.valor.includes('"PROYECTADO"'), 'el escenario sin ingresos no puede ejecutar el plan')
  assert.match(l.contexto, /sin el plan/,
    'el supuesto tiene que estar escrito: sin ingresos no se gasta el plan')
})

test('SALDO AL CIERRE sí gasta el plan: es el escenario de actividad normal', () => {
  // El par de escenarios sólo cierra si el otro extremo SÍ incluye el gasto planeado. Un cierre que
  // cobra los $151,8M y no descuenta los $38,0M que va a gastar publica $38,0M de plata que no va a
  // estar. Es el error simétrico del anterior y sale del mismo descuido.
  const t = de('cierre')
  assert.ok(t.valor.includes(`-${term(PLAN)}`),
    'el cierre tiene que restar el plan de gasto: cobrando todo, también se gasta todo')
  assert.ok(t.valor.includes(terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })),
    'y sumar los cobros del mes con la definición única del libro')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA RECONCILIACIÓN — SI UN NÚMERO DE CAJA NO SE PUEDE CRUZAR CONTRA SU PESTAÑA, NO SE PUBLICA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Cada tarjeta tiene una pestaña DUEÑA del dato, y el camino para cruzarla tiene que existir:
//
//   CAJA DISPONIBLE  → el panel de cuentas de esta misma pestaña (fila "Total disponibilidades")
//   DEUDA            → `_MOVIMIENTOS` filtrado por estado, y de ahí a su columna Origen:
//                      `Proveedores` / `Compras` (la comercial), `Cheques Emitidos`, `Jornales`
//   SI NO COBRÁS     → las dos tarjetas vecinas, por referencia a A3 y C3
//   CAJA INVERTIDA   → las filas Balanz del panel de cuentas
//   SALDO AL CIERRE  → sus tres hermanas más `Cobranzas`, vía el libro
//
// El eslabón que ESTE test puede verificar en frío es el primero y el que ya se rompió antes: que
// ninguna tarjeta invente un número. Toda cifra es una referencia a una celda de la propia pestaña o
// un `terminoLibro` sobre `_MOVIMIENTOS` —que arrastra la columna `Origen` de cada fila, y por eso el
// número se puede abrir hasta la pestaña que lo produjo—. Una constante tipeada acá cortaría esa
// cadena y sería inauditable: se vería idéntica a la calculada y envejecería sin avisar.

test('NINGUNA tarjeta inventa un número: todo sale del libro o de una celda de la pestaña', () => {
  const conocidos = [
    terminoLibro({ signo: -1, estados: DEUDA, hasta: FIN_DE_MES, medida: 'magnitud' }),
    terminoLibro({ signo: -1, estados: PLAN, hasta: FIN_DE_MES, medida: 'magnitud' }),
    terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' }),
  ]
  for (const t of tarjetas(REF)) {
    // Se le sacan los términos canónicos del libro y las referencias a celdas: no puede quedar
    // ninguna cifra suelta. `N(...)` y los `$A$3` se van con el reemplazo de referencias.
    let resto = t.valor
    for (const c of conocidos) resto = resto.split(c).join('')
    resto = resto.replace(/\$?[A-Z]+\$?\d+/g, '')
    assert.doesNotMatch(resto, /\d/,
      `la cifra de "${t.clave}" tiene un número que no sale del libro ni de una celda: ${t.valor}`)
  }
})

test('UNA SOLA definición del plan y de los cobros en toda la fila', () => {
  // El plan aparece en el contexto de la deuda y adentro del cierre; los cobros, en el contexto del
  // escenario y adentro del cierre. Si cada uno se escribiera por su lado, podría existir el día en
  // que una tarjeta diga que el plan es $38,0M y la de al lado descuente otra cosa — y la identidad
  // de la fila dejaría de cerrar sin que nada se ponga rojo.
  const plan = terminoLibro({ signo: -1, estados: PLAN, hasta: FIN_DE_MES, medida: 'magnitud' })
  const cobros = terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })
  assert.ok(de('comprometida').contexto.includes(plan) && de('cierre').valor.includes(plan),
    'el plan que se publica tiene que ser el mismo que el cierre descuenta')
  assert.ok(de('libre').contexto.includes(cobros) && de('cierre').valor.includes(cobros),
    'los cobros que se publican tienen que ser los mismos que el cierre suma')
})

test('LA IDENTIDAD DE LA FILA: cierre = disponible − deuda + cobros − plan', () => {
  // Las cinco tarjetas cuentan una historia y la última es la consecuencia de las otras. Si la
  // identidad no se puede escribir con los números publicados, la fila son cinco cifras sueltas.
  const cobros = terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })
  assert.equal(de('cierre').valor, `=N($A$3)-N($C$3)+${cobros}-${term(PLAN)}`)
})
