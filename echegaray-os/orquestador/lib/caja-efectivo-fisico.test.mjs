// TESTS DE LA CAJA FÍSICA. Herméticos: ni Sheet, ni base, ni red.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  IDENTIDAD, efectivoEnCaja, formulaCajaEnPesos, NETO_NO_SUMA_EN_PESOS,
  celdaCobrosEfectivo, celdaPagosEfectivo, celdaDepositosEfectivo, origenCajaEnPesos,
} from './caja-efectivo-fisico.mjs'
import {
  formulaNetaEfectivoPosterior, formulaCobrosEfectivoPosteriores,
  formulaComprasEfectivoPosteriores, formulaDepositosEfectivoPosteriores,
  formulaCobrosPosteriores, formulaChequesDebitadosPosteriores,
  formulaComprasPagadasPosteriores, formulaNetaPosterior, COB, CHQ, CMP,
} from './caja-posterior-al-corte.mjs'

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1 · EL MODELO CIERRA. Con los números reales medidos el 31/07 sobre el archivo.
//
// Este es el test que importa. Los otros verifican el TEXTO de una fórmula; éste verifica que la
// aritmética del modelo sea la de una caja física de verdad y no una suma que crece para siempre.

test('el modelo cierra: arqueo + cobrado − depositado − pagado, con los números reales del 31/07', () => {
  // Medido en vivo: arqueo del 30/07 en $0, y las dos cobranzas en efectivo de LA ESTRELLA del 31/07.
  const medido = {
    arqueo: 0,
    cobrado: 2313579.74 + 17476079.99, // f35 + f36 de Cobranzas, forma Efectivo, estado Cobrado
    depositado: 0,                     // ningún "Deposito de efectivo" en _BANCO_RAW después del 30/07
    pagado: 0,                         // ninguna compra Pagado/Efectivo con Fecha de caja > 30/07
  }
  // A centavos: en punto flotante la suma da …,729999997, que es también lo que devuelve la celda
  // real C13. Comparar a centavos es lo correcto para plata, no un atajo para tapar el redondeo.
  assert.equal(Math.round(efectivoEnCaja(medido) * 100) / 100, 19789659.73)
})

test('el modelo cierra también cuando el efectivo SALE: la caja no puede crecer para siempre', () => {
  // El caso que hace la diferencia entre un modelo y una suma. Toda la historia real del archivo:
  // $137.935.305,73 cobrados en efectivo y $137.291.028,34 pagados en efectivo. Si el modelo ignorara
  // el lado de las salidas, "Caja en pesos" declararía $137,9 millones en un cajón casi vacío.
  const caja = efectivoEnCaja({ arqueo: 1000000, cobrado: 137935305.73, depositado: 9960000, pagado: 137291028.34 })
  assert.equal(Math.round(caja * 100) / 100, -8315722.61)
  // Y el modelo NO miente sobre el signo: si da negativo es porque falta una fuente (las extracciones
  // de efectivo del banco anteriores al extracto), no porque haya que taparlo con un MAX(0;…).
  assert.ok(caja < 0, 'un resultado negativo tiene que salir negativo: es el aviso de que falta un arqueo')
})

test('un depósito mueve el efectivo de canal, no lo destruye: baja la caja exactamente lo que sube el banco', () => {
  const antes = efectivoEnCaja({ arqueo: 0, cobrado: 10000000 })
  const despues = efectivoEnCaja({ arqueo: 0, cobrado: 10000000, depositado: 4000000 })
  assert.equal(antes - despues, 4000000)
})

test('sin movimientos, la caja es exactamente el arqueo', () => {
  assert.equal(efectivoEnCaja({ arqueo: 1725000 }), 1725000)
  assert.equal(efectivoEnCaja(), 0)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2 · LA FÓRMULA DE "CAJA EN PESOS"

test('"Caja en pesos" suma el arqueo Y el neto posterior — es el pedido del dueño', () => {
  const f = formulaCajaEnPesos({ arqueo: '$C$7', tc: '$D$7', neta: '$C$13' })
  assert.match(f, /^=/)
  assert.match(f, /N\(\$C\$7\)/, 'el arqueo entra coaccionado: la celda la tipea una persona')
  assert.match(f, /\+\$C\$13/, 'y el neto de movimientos posteriores TIENE que estar sumado')
  assert.match(f, /IF\(\$D\$7="";1;\$D\$7\)/, 'respeta el tipo de cambio como el resto del bloque')
})

test('"Caja en pesos" NO se queda vacía cuando hay movimientos pero el arqueo está en blanco', () => {
  // Desde este cambio es la única celda que aporta el efectivo al total. Devolver "" con movimientos
  // cargados haría que el total pierda esa plata sin dar error — el modo de falla más peligroso.
  const f = formulaCajaEnPesos({ arqueo: '$C$7', tc: '$D$7', neta: '$C$13' })
  assert.match(f, /IF\(AND\(\$C\$7="";\$C\$13=0\);""/, 'sólo queda vacía si NO hay arqueo NI movimientos')
  assert.doesNotMatch(f, /IF\(\$C\$7="";""/, 'no puede vaciarse mirando sólo el arqueo')
})

test('la fila del neto no aporta valor en pesos: es la garantía anti-doble-conteo', () => {
  assert.equal(NETO_NO_SUMA_EN_PESOS, '')
})

test('formulaCajaEnPesos aborta si le falta una referencia, en vez de armar una fórmula rota', () => {
  assert.throws(() => formulaCajaEnPesos({ arqueo: '$C$7', tc: '$D$7' }), /necesita las tres referencias/)
  assert.throws(() => formulaCajaEnPesos({}), /necesita las tres referencias/)
})

test('el desglose usa las MISMAS fórmulas que la línea neta, no una copia', () => {
  const a = '$F$7'
  // Si alguien reescribiera una de las tres a mano, el desglose podría sumar distinto que el número
  // de arriba. Se comparan literalmente contra la fuente.
  // Desde el 01/08 llevan además la MISMA guarda de arqueo que abre el total: sin fecha, 0 y no el
  // histórico. Es lo que impedía que el desglose contradijera a su total (ver el bloque del desglose).
  const guarda = `=IF(NOT(ISNUMBER(${a}));0;`
  assert.equal(celdaCobrosEfectivo(a), `${guarda}${formulaCobrosEfectivoPosteriores(a)})`)
  assert.equal(celdaPagosEfectivo(a), `${guarda}-(${formulaComprasEfectivoPosteriores(a)}))`)
  assert.equal(celdaDepositosEfectivo(a), `${guarda}-(${formulaDepositosEfectivoPosteriores(a)}))`)
  // Los dos que descargan la caja van con signo negativo: el desglose se lee sumando de arriba abajo.
  assert.match(celdaPagosEfectivo(a), /;-\(/)
  assert.match(celdaDepositosEfectivo(a), /;-\(/)
})

test('el desglose cierra contra la línea neta: los tres sumandos son los mismos tres términos', () => {
  const a = '$F$7'
  const neta = formulaNetaEfectivoPosterior(a)
  for (const parte of [formulaCobrosEfectivoPosteriores(a), formulaComprasEfectivoPosteriores(a), formulaDepositosEfectivoPosteriores(a)]) {
    assert.ok(neta.includes(parte), 'la línea neta tiene que estar hecha exactamente de los tres términos del desglose')
  }
})

test('el texto de origen explica por qué el saldo en pesos difiere del importe de al lado', () => {
  const t = origenCajaEnPesos()
  assert.match(t, /Arqueo de caja/)
  assert.match(t, /NUNCA se pisa/)
  assert.ok(t.includes(IDENTIDAD), 'cita la identidad, no la parafrasea')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3 · RANGOS ABIERTOS. El test que falla si vuelve a aparecer una fila final.
//
// POR QUÉ ES UN TEST Y NO UNA CONVENCIÓN. Un rango con fila final (`$M$5:$M$400`) no da error cuando
// la pestaña la pasa: deja de ver lo nuevo, en silencio, y la caja miente para abajo. Medido el 31/07:
// Cobranzas tenía datos hasta la fila 358 contra un rango que terminaba en la 400. Cuarenta y dos
// filas de aire. Este test es la única cosa que impide que vuelva.

const TODAS = (ref) => [
  formulaCobrosPosteriores(ref), formulaChequesDebitadosPosteriores(ref), formulaComprasPagadasPosteriores(ref),
  formulaNetaPosterior(ref), formulaCobrosEfectivoPosteriores(ref), formulaComprasEfectivoPosteriores(ref),
  formulaDepositosEfectivoPosteriores(ref), formulaNetaEfectivoPosterior(ref),
  celdaCobrosEfectivo(ref), celdaPagosEfectivo(ref), celdaDepositosEfectivo(ref),
]

test('los rangos son ABIERTOS: ninguna fórmula lleva fila final', () => {
  for (const f of TODAS('$F$7')) {
    // Un rango de columna cerrado se ve como `$M$5:$M$400`: letra, $, dígitos después de los dos puntos.
    const cerrados = f.match(/\$[A-Z]{1,2}\$\d+:\$[A-Z]{1,2}\$\d+/g)
    assert.equal(cerrados, null,
      `esta fórmula tiene un rango con fila final y se va a fosilizar: ${cerrados?.join(' · ')}\n  ${f}`)
    // Y sí tiene la forma abierta.
    assert.match(f, /\$[A-Z]{1,2}\$\d+:\$[A-Z]{1,2}(?![$\d])/, 'tiene que haber al menos un rango abierto')
  }
})

test('las definiciones de columnas ya no declaran una fila final', () => {
  for (const [nombre, c] of Object.entries({ COB, CHQ, CMP })) {
    assert.equal(c.hasta, undefined, `${nombre}.hasta tiene que desaparecer: una fila final se fosiliza`)
    assert.ok(Number.isInteger(c.desde) && c.desde > 0, `${nombre}.desde sigue haciendo falta`)
  }
})

test('el rango abierto no se puede reintroducir desde el generador de CAJA', () => {
  // El generador escribe sus propias fórmulas para los cheques y la tarjeta con filas finales; ésas
  // son otro frente. Lo que este test protege es que las fórmulas del EFECTIVO —las que alimentan
  // "Caja en pesos"— no vuelvan a llevar una fila final tipeada en el script.
  const src = readFileSync(new URL('./caja-posterior-al-corte.mjs', import.meta.url).pathname, 'utf8')
  assert.doesNotMatch(src, /hasta:\s*\d+/, 'ninguna definición de columnas puede volver a declarar `hasta`')
  assert.doesNotMatch(src, /rango\(\s*[^)]*,\s*c\.hasta\s*\)/, 'rango() ya no acepta fila final')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4 · LAS TRAMPAS DEL ARCHIVO: locale, paréntesis, criterio por estado

test('separador es_AR: las fórmulas van con `;`, nunca con `,`', () => {
  // El archivo es es-AR y `formulaValue` se interpreta EN EL LOCALE DEL ARCHIVO: una coma deja
  // #ERROR! en la celda. Ya rompió CAJA y la ARRAYFORMULA de Compras.
  for (const f of [...TODAS('$F$7'), formulaCajaEnPesos({ arqueo: '$C$7', tc: '$D$7', neta: '$C$13' })]) {
    // Se ignoran las comas que estén DENTRO de un literal de texto (no hay ninguna hoy, pero si
    // mañana un rótulo la lleva, el test no tiene que dar un falso positivo).
    const sinTextos = f.replace(/"[^"]*"/g, '""')
    assert.doesNotMatch(sinTextos, /,/, `esta fórmula lleva una coma como separador y va a dar #ERROR!:\n  ${f}`)
    assert.match(f, /;/, 'y sí tiene que usar `;`')
  }
})

test('paréntesis balanceados en todas las fórmulas', () => {
  for (const f of [...TODAS('$F$7'), formulaCajaEnPesos({ arqueo: '$C$7', tc: '$D$7', neta: '$C$13' })]) {
    let n = 0
    for (const ch of f.replace(/"[^"]*"/g, '""')) {
      if (ch === '(') n++
      else if (ch === ')') n--
      assert.ok(n >= 0, `se cierra un paréntesis que no se abrió:\n  ${f}`)
    }
    assert.equal(n, 0, `paréntesis desbalanceados:\n  ${f}`)
  }
})

test('el criterio es por ESTADO, no por fecha: un proyectado NO es plata en la caja', () => {
  // El defecto ya dejó un pendiente en $0 en este archivo: decidir "cobrado" porque la fecha ya pasó.
  // Un cobro está cobrado cuando lo dice su ESTADO. Medido el 31/07, en Cobranzas hay $57.678.591,76
  // en efectivo con estado Pendiente / Proyectado / Facturado — plata que NO está en ningún cajón.
  const f = formulaCobrosEfectivoPosteriores('$F$7')
  assert.match(f, /'Cobranzas'!\$O\$5:\$O;"Cobrado"/, 'filtra por la columna de ESTADO con el valor "Cobrado"')
  const g = formulaComprasEfectivoPosteriores('$F$7')
  assert.match(g, /'Compras'!\$X\$4:\$X="Pagado"/, 'y del lado del pago, sólo lo que está Pagado')
})

test('la ventana del arqueo es EXCLUSIVA (`>`), para que un arqueo nuevo colapse lo viejo', () => {
  const f = formulaCobrosEfectivoPosteriores('$F$7')
  assert.match(f, /">"&\$F\$7/)
  assert.doesNotMatch(f, />=/, 'con `>=` el movimiento del día del arqueo se contaría dos veces')
})

test('la partición por canal se mantiene: el efectivo va a la caja y NUNCA al banco', () => {
  // La garantía anti-doble-conteo del diseño. Si la línea bancaria dejara de excluir el efectivo, el
  // mismo cobro estaría en el banco y en el cajón a la vez.
  assert.match(formulaCobrosPosteriores('$F$9'), /"<>Efectivo"/)
  assert.match(formulaCobrosEfectivoPosteriores('$F$7'), /;"Efectivo";/)
  assert.doesNotMatch(formulaComprasPagadasPosteriores('$F$9'), /"Efectivo"/)
  assert.match(formulaComprasEfectivoPosteriores('$F$7'), /="Efectivo"/)
})

test('sin arqueo con fecha, la línea neta da 0: no se inventa plata que nadie contó', () => {
  const f = formulaNetaEfectivoPosterior('$F$7')
  assert.match(f, /^=IF\(NOT\(ISNUMBER\(\$F\$7\)\);0;/)
})


// ═══ EL DESGLOSE NO PUEDE CONTRADECIR A SU TOTAL (01/08) ═══
//
// Visto en la pestaña real con la fecha de arqueo vacía: el total decía "—" y abajo "(−) pagado en
// efectivo −$126.617.300". La causa es una asimetría de Sheets contra una celda vacía: el SUMIFS de
// cobros no matchea nada y el SUMPRODUCT de pagos trata el vacío como CERO y toma TODAS las fechas.

test('sin fecha de arqueo, NINGÚN renglón del desglose muestra el histórico', () => {
  const a = '$F$7'
  for (const celda of [celdaCobrosEfectivo(a), celdaPagosEfectivo(a), celdaDepositosEfectivo(a)]) {
    assert.match(celda, /^=IF\(NOT\(ISNUMBER\(\$F\$7\)\);0;/, 'la guarda del total tiene que estar también acá')
  }
})
