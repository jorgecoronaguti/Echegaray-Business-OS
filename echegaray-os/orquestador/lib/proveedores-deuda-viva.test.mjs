// LOS TESTS QUE TIENEN QUE PODER FALLAR.
//
// Cada uno de estos cuatro defectos ya rompió una pestaña de este archivo alguna vez, y ninguno da
// error en el Sheet: se ven como un cuadro prolijo que dice un número equivocado. Por eso el control
// no puede ser "lo miré y estaba bien".
//
//   1. UN RANGO CON FILA FINAL (`Compras!$O$4:$O$500`) se fosiliza: la compra 501 no existe para el
//      cuadro y nadie se entera.
//   2. UNA COMA COMO SEPARADOR en locale es_AR: la coma es el decimal, así que la fórmula entra rota
//      o —peor— entra y significa otra cosa.
//   3. "PAGADO" CALCULADO POR FECHA en vez de por estado: ya dejó un pendiente en $0 en este archivo.
//   4. UNA NOTA DEL DUEÑO QUE SE PIERDE al rehacer el bloque.
//
// Todo hermético: ni red, ni base, ni Sheet.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SEP, COLS_PROVEEDOR, COLS_FACTURA, PENDIENTE,
  rangosCompras, esRangoAbierto, referenciasCompras,
  formulaPorProveedor, formulaPorFactura, formulaControl,
  saldoNetoProveedor, deudaComercialTotal, reservaPara, formulaParcial1Sospechoso,
  filasLibreta, verificarMigracionNotas, esNombreSeguro,
} from './proveedores-deuda-viva.mjs'
import { expresionSaldo } from './deuda-por-tramos.mjs'

/** Las columnas reales de Compras, tal como las resuelve el generador por encabezado. */
const COLS = {
  prov: 'Compras!$E$4:$E',
  estado: 'Compras!$X$4:$X',
  comercial: 'Compras!$AJ$4:$AJ',
  total: 'Compras!$O$4:$O',
  pagado: 'Compras!$T$4:$T',
  parcial1: 'Compras!$U$4:$U',
  parcial2: 'Compras!$W$4:$W',
  fecha: 'Compras!$AD$4:$AD',
  comprobante: 'Compras!$H$4:$H',
  obra: 'Compras!$J$4:$J',
  tipoPago: 'Compras!$P$4:$P',
  categoria: 'Compras!$B$4:$B',
}

const R = rangosCompras(COLS)
const LIBRETA = 'PROV_LIBRETA'
const FORMULAS = () => ([
  ['por proveedor', formulaPorProveedor({ rangos: R, libreta: LIBRETA, reserva: 40 })],
  ['por factura', formulaPorFactura({ rangos: R, reserva: 150 })],
  ['control', formulaControl({ rangos: R, rangoSaldo: '$D$21:$D$60', que: 'el detalle por proveedor' })],
])

/** Saca del texto todo lo que está entre comillas: lo de adentro es un literal y no se audita igual. */
function sinLiterales(formula = '') {
  return String(formula).replace(/"(?:[^"]|"")*"/g, '«»')
}

// ── 1 · RANGOS ABIERTOS ─────────────────────────────────────────────────────────────────────────

test('esRangoAbierto distingue el rango vivo del fosilizado', () => {
  assert.equal(esRangoAbierto('Compras!$O$4:$O'), true)
  assert.equal(esRangoAbierto('Compras!$O$4:$O$500'), false, 'con fila final deja de ver lo nuevo')
  assert.equal(esRangoAbierto('Compras!$O$4'), false, 'una celda sola no es un rango de columna')
})

test('rangosCompras se niega a construir sobre un rango acotado', () => {
  assert.throws(
    () => rangosCompras({ ...COLS, total: 'Compras!$O$4:$O$500' }),
    /fila final/,
    'un rango con techo tiene que cortar la corrida, no pasar callado',
  )
})

test('rangosCompras exige todas las columnas que las fórmulas usan', () => {
  const { comercial, ...incompleto } = COLS
  void comercial
  assert.throws(() => rangosCompras(incompleto), /faltan referencias/)
})

test('NINGUNA referencia a Compras lleva fila final en ninguna fórmula de la sección', () => {
  for (const [nombre, f] of FORMULAS()) {
    const refs = referenciasCompras(f)
    assert.ok(refs.length > 0, `${nombre}: tiene que mirar Compras`)
    const fosiles = refs.filter((r) => /:\$[A-Z]{1,3}\$\d+$/.test(r))
    assert.deepEqual(fosiles, [], `${nombre}: rangos acotados que se van a fosilizar: ${fosiles.join(' · ')}`)
  }
})

test('el saldo neto y el titular usan LA MISMA resta canónica: Total - Pagado - Parcial 2', () => {
  // ═══ ESTE TEST EXIGÍA LA SEGUNDA DEFINICIÓN (19/08/2026) ═══
  //
  // Pedía cuatro SUMIFS y dos filtros `">0"`, o sea `Total − Pagado − POSITIVOS de Parcial 1 −
  // POSITIVOS de Parcial 2`. Eso NO es lo que define «lo que se debe» en este repositorio: la
  // canónica vive en `deuda-por-tramos.mjs` (`saldoDeLaFila` = O − T − W) y es la que escribe
  // `Compras!AL`, la que consume CAJA y la que usan el aging y los tres bloques de la pestaña.
  //
  // Con las dos conviviendo, el control del pie contradecía al cuadro de arriba por $136.000 y el
  // dueño lo leyó —bien— como "no lee bien de compras". El test verde era parte del problema: medía
  // que la fórmula siguiera siendo la equivocada.
  for (const expr of [saldoNetoProveedor(R, '"Alumetal"'), deudaComercialTotal(R)]) {
    for (const col of [R.total, R.pagado, R.parcial2]) {
      assert.ok(expr.includes(col), `falta ${col}`)
    }
    assert.ok(!expr.includes(R.parcial1),
      'Parcial 1 NO entra en la resta: es la derivada `=T−O` en 716 de 1.136 filas, no un tramo de pago')
    assert.equal((expr.match(/SUMIFS\(/g) ?? []).length, 3, 'tres SUMIFS: total, pagado y parcial 2')
    assert.equal((expr.match(/">0"/g) ?? []).length, 0,
      'sin filtro `">0"`: W nunca es negativa (medido: 0 fórmulas, 8 valores, 0 negativos), así que el filtro sobraba')
  }
})

test('el saldo del bloque dice EXACTAMENTE lo mismo que la canónica de deuda-por-tramos', () => {
  // La prueba de que no hay dos definiciones: las dos restan las mismas tres columnas de Compras.
  const canonica = expresionSaldo('Compras!')
  for (const col of ['O', 'T', 'W']) {
    assert.ok(canonica.includes(`$${col}$4:$${col}`), `la canónica tiene que restar ${col}`)
  }
  assert.ok(!canonica.includes('$U$4:$U'), 'la canónica NO resta Parcial 1')
  assert.ok(!deudaComercialTotal(R).includes(R.parcial1), 'y el titular del bloque tampoco')
})

test('el hallazgo de «Monto Parcial 1» nombra al proveedor y dice el monto', () => {
  const f = formulaParcial1Sospechoso(R)
  assert.ok(f.startsWith('='), 'es una fórmula viva, no un número calculado acá')
  assert.ok(f.includes(R.parcial1) && f.includes('>0'), 'mira los positivos de Parcial 1')
  assert.ok(f.includes(R.prov), 'nombra al proveedor: sin nombre no se puede ir a arreglarlo')
  assert.ok(f.includes('SUMPRODUCT'), 'cuenta y suma sobre rangos abiertos')
  // Y no puede quedarse callado cuando no hay ninguno: un control mudo no se distingue de uno roto.
  assert.ok(f.includes('✓'), 'dice algo también cuando no encuentra nada')
})

// ── 2 · LOCALE es_AR ────────────────────────────────────────────────────────────────────────────

test('el separador de argumentos es «;» y no aparece ni una coma fuera de un literal', () => {
  for (const [nombre, f] of FORMULAS()) {
    const desnuda = sinLiterales(f)
    assert.ok(!desnuda.includes(','), `${nombre}: hay una coma fuera de un literal — en es_AR la coma es el decimal`)
    assert.ok(desnuda.includes(SEP), `${nombre}: tiene que usar «;»`)
  }
})

test('no se usa NINGÚN literal de array {…}: su separador también cambia con el locale', () => {
  for (const [nombre, f] of FORMULAS()) {
    const desnuda = sinLiterales(f)
    assert.ok(!desnuda.includes('{'), `${nombre}: un literal de array no es portable — se usa HSTACK`)
  }
})

test('los paréntesis cierran en las tres fórmulas', () => {
  for (const [nombre, f] of FORMULAS()) {
    const desnuda = sinLiterales(f)
    let abiertos = 0
    for (const c of desnuda) {
      if (c === '(') abiertos++
      if (c === ')') abiertos--
      assert.ok(abiertos >= 0, `${nombre}: cierra un paréntesis que nunca se abrió`)
    }
    assert.equal(abiertos, 0, `${nombre}: quedan ${abiertos} paréntesis sin cerrar`)
  }
})

test('las comillas quedan balanceadas (un literal sin cerrar se come el resto de la fórmula)', () => {
  for (const [nombre, f] of FORMULAS()) {
    const comillas = (String(f).match(/"/g) ?? []).length
    assert.equal(comillas % 2, 0, `${nombre}: número impar de comillas`)
  }
})

test('toda fórmula arranca con «=» — una celda de texto no calcula nada', () => {
  for (const [nombre, f] of FORMULAS()) assert.ok(f.startsWith('='), `${nombre}: falta el =`)
})

// ── 3 · EL CRITERIO ES EL ESTADO, NO LA FECHA ───────────────────────────────────────────────────

test('lo pendiente se decide por ESTADO="Pendiente" en los dos bloques', () => {
  for (const [nombre, f] of [FORMULAS()[0], FORMULAS()[1]]) {
    assert.ok(f.includes(`"${PENDIENTE}"`), `${nombre}: no filtra por el estado`)
    assert.ok(f.includes(R.estado), `${nombre}: no mira la columna de estado de Compras`)
  }
})

test('la FECHA nunca decide si algo está pagado: sólo ordena y da el próximo pago', () => {
  for (const [nombre, f] of [FORMULAS()[0], FORMULAS()[1]]) {
    const desnuda = sinLiterales(f)
    assert.ok(!/TODAY\(\)/.test(desnuda), `${nombre}: TODAY() dentro del criterio convierte el cuadro en una foto del día`)
    assert.ok(!/NOW\(\)/.test(desnuda), `${nombre}: NOW() no puede intervenir en el criterio`)
  }
  // En el bloque por proveedor la fecha aparece SÓLO dentro del próximo pago (MINIFS/COUNTIFS con
  // ">0") y nunca como el filtro que arma la lista.
  const porProv = FORMULAS()[0][1]
  assert.ok(/MINIFS\(r_fecha/.test(porProv), 'el próximo pago sale de MINIFS sobre la fecha de caja')
  assert.ok(/UNIQUE\(FILTER\(r_prov[^)]*r_estado="Pendiente"/.test(porProv), 'la lista de proveedores se filtra por estado')
  // En el bloque factura por factura, la condición del FILTER no menciona la fecha.
  const porFac = FORMULAS()[1][1]
  const cond = porFac.match(/cond;\((.*?)\);base/)?.[1] ?? ''
  assert.ok(cond.length > 0, 'la condición del filtro tiene que ser legible')
  assert.ok(!cond.includes('r_fecha'), `la fecha no puede estar en la condición del filtro (está: ${cond})`)
})

test('el universo es el mismo del titular: comercial = 1 en los dos bloques y en el total', () => {
  const porProv = FORMULAS()[0][1]
  const porFac = FORMULAS()[1][1]
  assert.ok(porProv.includes('r_comercial;1'), 'el bloque por proveedor filtra comercial=1 en sus SUMIFS')
  assert.ok(porProv.includes('r_comercial=1'), 'y también al armar la lista de proveedores')
  assert.ok(porFac.includes('r_comercial=1'), 'el bloque por factura filtra comercial=1')
  assert.ok(deudaComercialTotal(R).includes(`${R.comercial}${SEP}1`), 'el titular filtra comercial=1')
})

// ── 4 · EL DERRAME ES UNA SOLA CELDA, ACOTADO, Y CONTROLADO ─────────────────────────────────────

test('cada bloque es UN ancla que derrama: ARRAY_CONSTRAIN a la reserva y al ancho de sus columnas', () => {
  const porProv = formulaPorProveedor({ rangos: R, libreta: LIBRETA, reserva: 40 })
  assert.ok(porProv.includes(`ARRAY_CONSTRAIN(SORT(viva;4;FALSE);40;${COLS_PROVEEDOR.length})`),
    'el derrame se acota a la reserva: si no, el día que crezca la lista el Sheet tira #REF! y desaparece la tabla')
  const porFac = formulaPorFactura({ rangos: R, reserva: 150 })
  assert.ok(porFac.includes(`;150;${COLS_FACTURA.length})`), 'ídem el bloque por factura')
})

test('una reserva de cero o negativa no se acepta: sería una tabla que no puede derramar', () => {
  assert.throws(() => formulaPorProveedor({ rangos: R, libreta: LIBRETA, reserva: 0 }), /reserva/)
  assert.throws(() => formulaPorFactura({ rangos: R, reserva: -1 }), /reserva/)
})

test('reservaPara deja aire sin dejar un agujero de filas muertas', () => {
  assert.equal(reservaPara(0), 12, 'con la lista vacía queda el piso')
  assert.equal(reservaPara(13), 21, '13 proveedores → 21 filas (60% de aire)')
  assert.equal(reservaPara(40), 64)
  assert.ok(reservaPara(100) < 200, 'el aire es proporcional, no un colchón fijo enorme')
})

test('el control compara el titular contra lo que el bloque muestra y puede dar distinto de cero', () => {
  const f = formulaControl({ rangos: R, rangoSaldo: '$D$21:$D$60', que: 'el detalle' })
  assert.ok(f.includes('SUM($D$21:$D$60)'), 'suma la columna de saldo del bloque')
  assert.ok(f.includes('SUMIFS('), 'y la compara contra el titular calculado sobre Compras')
  assert.ok(/IF\(dif=0/.test(f), 'el control se pronuncia: cierra o no cierra')
  assert.ok(/▲/.test(f), 'y cuando no cierra, avisa')
  // Un control que no puede fallar no controla nada (ya pasó en esta pestaña: =X-Y-(X-Y)).
  assert.ok(!/-\(.*\)\s*\)\s*;0\)\s*;IF\(dif=0/.test(f.replace(/\s/g, '')), 'no puede ser una identidad que dé siempre 0')
})

test('el control distingue el truncado de la deuda SIN proveedor: manda a arreglar el lugar correcto', () => {
  const f = formulaControl({ rangos: R, rangoSaldo: '$D$21:$D$60', que: 'el detalle' })
  // La deuda comercial pendiente sin nombre de proveedor la suma el titular y ningún bloque organizado
  // por proveedor la puede mostrar. Es un defecto de carga en Compras, no un bloque chico.
  assert.ok(f.includes(`${R.prov};""`), 'mide la deuda pendiente comercial con proveedor vacío')
  assert.ok(/huerfana/.test(f), 'y la nombra aparte del truncado')
  assert.ok(/SIN nombre de proveedor/.test(f), 'el mensaje dice qué hay que arreglar y dónde')
})

// ── 5 · LA LIBRETA DEL DUEÑO ────────────────────────────────────────────────────────────────────

test('la libreta vacía se siembra con las notas que hoy están en la pestaña', () => {
  const notas = new Map([['Hormiserv', 'Esperar al cobrador'], ['FEMENIA', 'echeq a 30 días']])
  const { filas, sembradas } = filasLibreta(notas, [])
  assert.equal(sembradas, 2)
  assert.deepEqual(filas, [['Hormiserv', 'Esperar al cobrador'], ['FEMENIA', 'echeq a 30 días']])
})

test('la libreta CON contenido del dueño no se toca: ni una celda', () => {
  const notas = new Map([['Hormiserv', 'lo que yo creía que decía']])
  const existente = [['Hormiserv', 'lo que él escribió después'], ['Alumetal', 'nota nueva suya']]
  const { filas, sembradas } = filasLibreta(notas, existente)
  assert.equal(sembradas, 0)
  assert.deepEqual(filas, [['', ''], ['', '']],
    'cadena vacía = "no es mi celda, preservala". El centinela VACIO la BORRARÍA: acá sería destruir su nota')
})

test('si una nota no llegó a la libreta, la migración NO pasa', () => {
  const notas = new Map([['Hormiserv', 'esperar cobrador'], ['La Isla Metal SRL', 'trueque con chatarra']])
  const ok = verificarMigracionNotas(notas, [['Hormiserv', 'esperar cobrador'], ['La Isla Metal SRL', 'trueque con chatarra']])
  assert.equal(ok.ok, true)
  const mal = verificarMigracionNotas(notas, [['Hormiserv', 'esperar cobrador']])
  assert.equal(mal.ok, false)
  assert.deepEqual(mal.perdidas, ['La Isla Metal SRL: trueque con chatarra'])
})

test('la verificación compara por nombre normalizado, no por grafía exacta', () => {
  const notas = new Map([['  Hormiserv  ', 'nota']])
  assert.equal(verificarMigracionNotas(notas, [['hormiserv', 'nota']]).ok, true)
})

test('la nota entra a la tabla viva por VLOOKUP contra el rango con nombre, no por posición', () => {
  const f = formulaPorProveedor({ rangos: R, libreta: LIBRETA, reserva: 40 })
  assert.ok(f.includes(`VLOOKUP(p;${LIBRETA};2;FALSE)`),
    'la nota viaja con SU proveedor: una nota pegada al lado de la fila se queda clavada cuando la lista se reordena')
  assert.ok(f.includes('IFERROR(VLOOKUP'), 'un proveedor sin nota no puede ensuciar la tabla con #N/A')
})

// ── 6 · EL ORDEN, QUE ES LA PREGUNTA DEL BLOQUE ─────────────────────────────────────────────────

test('por proveedor ordena por saldo descendente; factura por factura, por fecha de pago', () => {
  const porProv = formulaPorProveedor({ rangos: R, libreta: LIBRETA, reserva: 40 })
  assert.ok(porProv.includes('SORT(viva;4;FALSE)'), 'col 4 = saldo, descendente: primero a quien más se le debe')
  const porFac = formulaPorFactura({ rangos: R, reserva: 150 })
  assert.ok(porFac.includes('SORT(base;2;TRUE;1;TRUE)'), 'col 2 = fecha de pago ascendente: qué pago primero')
})

test('los rótulos son el contrato del ancho de cada bloque', () => {
  assert.equal(COLS_PROVEEDOR.length, 5)
  assert.equal(COLS_FACTURA.length, 7)
  assert.equal(COLS_PROVEEDOR[3], 'Saldo pendiente', 'la columna 4 es la que ordena y la que suma el control')
  assert.equal(COLS_FACTURA[1], 'Próximo pago', 'la columna 2 es la que ordena el detalle')
})

// ── 6 · LOS NOMBRES DE LAS VARIABLES DE `LET` ───────────────────────────────────────────────────
//
// EL TEST QUE NO EXISTÍA, Y POR ESO EL BLOQUE SALIÓ VACÍO EN PRODUCCIÓN.
//
// La primera corrida real dejó "factura por factura" sin una sola fila, con los 12 tests de este
// archivo en verde. Sheets devolvía `#NAME?` y el IFERROR que envuelve la fórmula se lo tragaba: cero
// filas y cero avisos. Dos variables se llamaban `nPa1` y `nPa2`, y `NPA1` ES una referencia de celda
// válida —columna NPA, fila 1—. Comprobado en el archivo real: `=ISREF(NPA1)` devuelve TRUE, y
// `=LET(nPa1;7;nPa1)` devuelve `#NAME?` mientras `=LET(nPag;7;nPag)` devuelve 7 (cuatro letras no
// forman una columna: el máximo es tres).
//
// Los tests de acá miraban el TEXTO de la fórmula —separadores, rangos abiertos, literales de array— y
// ninguno preguntaba si Sheets iba a poder LEER los nombres. Este sí, y es puro: no necesita el Sheet.
test('esNombreSeguro rechaza exactamente la forma A1 (1-3 letras + dígitos)', () => {
  for (const malo of ['nPa1', 'nPa2', 'A1', 'zz9', 'NPA1', 'abc123', 'r1']) {
    assert.equal(esNombreSeguro(malo), false, `"${malo}" se puede leer como referencia de celda`)
  }
  for (const bueno of ['nTot', 'nPag', 'saldo', 'cond', 'base', 'n_parcial1', 'r_prov', 'prov1_', 'a_1']) {
    assert.equal(esNombreSeguro(bueno), true, `"${bueno}" no es una referencia: tiene que servir`)
  }
})

test('NINGUNA variable de LET de la sección puede leerse como una referencia de celda', () => {
  // Se extraen los nombres declarados de las fórmulas de verdad: `LET(nombre;…;nombre;…)`, tomando el
  // token que está en posición de nombre (después de `LET(` o de un `;` que cierra un valor).
  for (const [que, f] of FORMULAS()) {
    const cuerpo = sinLiterales(f)
    const nombres = [...cuerpo.matchAll(/(?:LET\(|;)\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/g)].map((m) => m[1])
    assert.ok(nombres.length > 0, `${que}: no encontré ninguna declaración de LET`)
    for (const n of nombres) {
      assert.ok(esNombreSeguro(n),
        `${que}: la variable "${n}" se puede leer como referencia de celda (columna+fila). Sheets la `
        + `rechaza con #NAME? y el IFERROR de la fórmula lo esconde: el bloque queda VACÍO en silencio.`)
    }
  }
})

// ── 7 · LA ENVOLTURA QUE HACE QUE EL BLOQUE DEVUELVA FILAS ──────────────────────────────────────
//
// SEGUNDO defecto de la misma corrida, y el que quedaba después de arreglar los nombres: el bloque
// "factura por factura" seguía vacío. Medido en el archivo real, con la fórmula ya escrita en la celda:
// `SUMPRODUCT(cond)` daba 0 —siendo que hay 14 facturas pendientes— y `SUM(saldo)` colapsaba a un
// escalar. Una variable de LET que guarda un RANGO pierde la expansión a array en cuanto se la usa en
// una comparación o en aritmética elemento por elemento. Envuelta en ARRAYFORMULA: cond = 14 y el
// bloque derrama 14 renglones ordenados por fecha de pago.
//
// El bloque por proveedor NO la necesita: sus rangos viajan como argumentos de SUMIFS/COUNTIFS/MINIFS
// y dentro de MAP/LAMBDA, que ya evalúan por elemento. Por eso uno vivía y el otro no.
test('el bloque FACTURA POR FACTURA va envuelto en ARRAYFORMULA, o devuelve vacío en silencio', () => {
  const f = formulaPorFactura({ rangos: R, reserva: 30 })
  assert.match(f, /^=IFERROR\(ARRAYFORMULA\(LET\(/,
    'sin ARRAYFORMULA, `cond` colapsa a un escalar, FILTER da #N/A y el IFERROR lo deja en blanco')
  // Y el IFERROR sigue afuera: es lo que evita que un archivo recién armado muestre #N/A. Pero es
  // también lo que escondió el defecto durante toda una corrida — de ahí los dos tests de arriba.
  assert.ok(f.endsWith(`${SEP}"")`), 'el IFERROR envuelve todo, ARRAYFORMULA va adentro')
})

test('el bloque POR PROVEEDOR no necesita ARRAYFORMULA y no se la agrega de más', () => {
  // No es simetría por prolijidad: envolver un MAP/LAMBDA en ARRAYFORMULA cambia cómo se evalúa y no
  // hay ninguna medición que respalde hacerlo. Se deja como está, que es lo que funciona.
  const f = formulaPorProveedor({ rangos: R, libreta: LIBRETA, reserva: 40 })
  assert.doesNotMatch(f, /ARRAYFORMULA/, 'este bloque funciona sin envoltura: no se toca lo que anda')
})
