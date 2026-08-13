import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NOMBRES_DIRECCION, DIA_PAGO_DEFAULT, PARAMETRO_DIA_PAGO, regexDireccion, esRetiro,
  formulaRetiroMensual, formulaPrimerRetiro, formulaPagadoMes, formulaSePagaElDireccion,
  formulaProyectadoMes, formulaDireccion, condicionesPagoDelMes,
} from './direccion-retiros.mjs'
import { formulaAdministracion, formulaOficina } from './cash-flow-lineas.mjs'
import { REGLAS } from './rubro-caja.mjs'

const balanceado = (f) => [...f].reduce((n, c) => n + (c === '(' ? 1 : c === ')' ? -1 : 0), 0) === 0

// ═══ UN EVALUADOR MÍNIMO — PARA PROBAR EL NÚMERO, NO LA FORMA ═══
//
// Estas fórmulas terminan en una celda del Sheet real, así que un test que sólo mire su texto prueba
// que la escribí como la escribí. Lo que hay que probar es otra cosa: que sobre las filas REALES de
// Compras la celda rinde 04/08/2026. Esto compila la fórmula EMITIDA —no una copia del criterio
// escrita en JS, que envejecería por su lado— a predicados, y los corre contra un fajo de filas.
//
// FALLA RUIDOSO ANTE UNA CONDICIÓN QUE NO CONOCE. Es la parte que lo hace un test y no un adorno: si
// mañana la fórmula cambia de forma, `predicado` tira, el test se pone rojo y alguien mira. Un
// evaluador que ignora lo que no entiende aprueba cualquier cosa.

/** El serial de Sheets de una fecha: días desde el 30/12/1899. */
const serial = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)

const COL_AD = "'Compras'!$AD$4:$AD"
const COL_O = "'Compras'!$O$4:$O"
/** Parte una lista de argumentos por su separador de NIVEL SUPERIOR: los `;` de un DATE() no cuentan. */
const args = (s, sep = ';') => {
  const out = []
  let nivel = 0; let ini = 0; let comillas = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '"') comillas = !comillas
    else if (comillas) continue
    else if (c === '(' || c === '{') nivel++
    else if (c === ')' || c === '}') nivel--
    else if (c === sep && nivel === 0) { out.push(s.slice(ini, i)); ini = i + 1 }
  }
  out.push(s.slice(ini))
  return out
}

/** Una condición de Sheets → una función que dice si una fila de Compras la cumple. */
const predicado = (cond) => {
  let m = cond.match(/^REGEXMATCH\(LOWER\('Compras'!\$K\$4:\$K&""\);"(.+)"\)$/)
  if (m) { const re = new RegExp(m[1], 'i'); return (f) => re.test(String(f.persona ?? '').toLowerCase()) }
  m = cond.match(/^REGEXMATCH\('Compras'!\$Z\$4:\$Z&"";"(.+)"\)$/)
  if (m) { const re = new RegExp(m[1]); return (f) => re.test(String(f.estado ?? '')) }
  m = cond.match(/^\((.+?)(>=|<)DATE\((\d+);(\d+);(\d+)\)\)$/)
  if (m && m[1] === `IF(ISNUMBER(${COL_AD});${COL_AD};0)`) {
    const s = serial(Number(m[3]), Number(m[4]), Number(m[5]))
    return m[2] === '>=' ? (f) => f.caja >= s : (f) => f.caja < s
  }
  throw new Error(`el evaluador del test no reconoce esta condición: ${cond}`)
}

/** Lo que rinde la celda "Se paga el" del bloque Dirección sobre unas filas de Compras. */
const evaluarSePagaEl = (formula, filas, diaPago = DIA_PAGO_DEFAULT) => {
  const m = formula.match(/^=IFERROR\(MAX\(FILTER\((.+)\)\);DATE\((\d+);(\d+);DIRECCION_DIA_PAGO\)\)$/)
  assert.ok(m, `la celda ya no es "el máximo de las fechas que pagaron el mes; si no hay, la prevista": ${formula}`)
  const [rango, ...conds] = args(m[1])
  assert.equal(rango, COL_AD, 'la fecha de un hecho sale de la fecha de caja de Compras')
  const preds = conds.map(predicado)
  const fechas = filas.filter((f) => preds.every((p) => p(f))).map((f) => f.caja)
  return fechas.length ? Math.max(...fechas) : serial(Number(m[2]), Number(m[3]), diaPago)
}

/** Lo que rinde la celda "Pagado" del mismo mes, sobre las mismas filas. */
const evaluarPagado = (formula, filas) => {
  const m = formula.match(/^=SUMPRODUCT\((.+)\)$/)
  assert.ok(m, `"Pagado" ya no es un SUMPRODUCT: ${formula}`)
  const partes = args(m[1], '*')
  assert.equal(partes.pop(), `IF(ISNUMBER(${COL_O});${COL_O};0)`, 'lo que se suma es el importe de Compras')
  const preds = partes.map(predicado)
  return filas.filter((f) => preds.every((p) => p(f))).reduce((a, f) => a + f.importe, 0)
}

// ═══ LAS FILAS REALES QUE PAGARON JULIO (verificadas contra el extracto, 06/08) ═══
// Dos débitos de $3.000.000 el 03/08 —uno a nombre de Ana Laura Echegaray, que es el retiro de Jorge
// Corona— y el retiro de Jorge Echegaray EN EFECTIVO el 04/08. El dueño los confirmó: "sí fueron
// retiros". Las dos filas de abajo son las trampas que ya mordieron: la compra de materiales que
// contiene la palabra "Corona" y el retiro de agosto, todavía sin pagar.
const COMPRAS_JULIO = [
  { persona: 'Jorge Corona', importe: 3000000, caja: serial(2026, 8, 3), estado: '✅ Pagado' },
  { persona: 'Rodrigo Echegaray', importe: 3000000, caja: serial(2026, 8, 3), estado: '✅ Pagado' },
  { persona: 'Jorge Echegaray', importe: 3000000, caja: serial(2026, 8, 4), estado: '✅ Pagado' },
  { persona: 'Corona de arranque y bomba de agua', importe: 310000, caja: serial(2026, 8, 3), estado: '✅ Pagado' },
  { persona: 'Jorge Corona', importe: 3000000, caja: serial(2026, 9, 10), estado: '🟢 Vigente' },
]

const TODAS = () => [
  formulaRetiroMensual('$A$47'),
  formulaPrimerRetiro(),
  ...Array.from({ length: 12 }, (_, i) => formulaPagadoMes(i + 1, 2026)),
  ...Array.from({ length: 12 }, (_, i) => formulaSePagaElDireccion(i + 1, 2026)),
  formulaProyectadoMes('E60', 'C60', '$B$50', '$E$50'),
  formulaDireccion('$C$3', '$D$3'),
  formulaAdministracion('$C$3', '$D$3'),
]

test('el regex de las tres personas está ANCLADO en los dos extremos', () => {
  const re = new RegExp(regexDireccion(), 'i')
  for (const n of NOMBRES_DIRECCION) assert.ok(re.test(n.toLowerCase()), `${n} no matchea su propio regex`)

  // LA FILA REAL QUE ROMPÍA SIN EL ANCLA. Compras tiene "Corona de arranque y bomba de agua" de
  // Zabala Repuestos por $310.000 — una compra de materiales. Sin el `^…$` entraba como un retiro de
  // Jorge Corona, y el bloque habría proyectado ese importe doce veces.
  assert.equal(re.test('corona de arranque y bomba de agua'), false)
  assert.equal(re.test('jorge echegaray oviedo s.a.'), false)
  assert.equal(re.test('emiliano maldonado'), false, 'Emiliano es Oficina: lo trae la planilla, no este bloque')
  assert.equal(re.test('juan pablo nievas'), false, 'Juan Pablo es Oficina: contarlo acá sería duplicarlo')
})

test('esRetiro coincide con el regex, incluidos los bordes', () => {
  assert.ok(esRetiro('Jorge Corona'))
  assert.ok(esRetiro('  jorge corona  '), 'el nombre viene con espacios de la planilla')
  assert.equal(esRetiro('Corona de arranque y bomba de agua'), false)
  assert.equal(esRetiro(''), false)
  assert.equal(esRetiro(null), false)
})

test('un mes PAGADO no se proyecta — la proyección se apaga sola', () => {
  const f = formulaProyectadoMes('E60', 'C60', '$B$50', '$E$50')
  // El orden importa: primero "no sé cuánto es", después "ya se pagó", después "todavía no corría".
  assert.match(f, /IF\(N\(\$B\$50\)=0;""/)
  assert.match(f, /IF\(N\(C60\)>0;""/)
  assert.match(f, /IF\(E60<\$E\$50;""/)
  // Y el ÚNICO camino que devuelve plata es el que pasa los tres filtros.
  assert.ok(f.endsWith(';$B$50)))'), `la rama con plata no es la última: ${f}`)
})

test('EL RETIRO PROYECTADO ESCALA POR LA PARITARIA, Y EL FACTOR SE VALIDA ANTES DE MULTIPLICAR', () => {
  // Los doce meses repetían el mismo importe: el retiro de diciembre valía lo mismo que el de agosto,
  // en una economía donde el jornal de obra sube todos los meses. El dueño ordenó el driver (07/08):
  // el % de la paritaria UOCRA, "por más q no esten en ese gremio y convenio".
  const f = formulaProyectadoMes('E60', 'C60', '$B$50', '$E$50', 'G60')
  assert.match(f, /\$B\$50\*IFERROR\(IF\(ISNUMBER\(G60\);G60;1\);1\)/, `no escala por el factor: ${f}`)
  // POR QUÉ NO ALCANZA `$B$50*G60`: si la celda del factor quedara vacía o con texto, el producto da 0
  // o #VALUE!. El 0 es la peor de las dos — borra el retiro del mes sin dar un solo error, que es
  // exactamente el modo de falla que este bloque existe para evitar. Sin factor usable, no se ajusta.
  assert.doesNotMatch(f, /\$B\$50\*G60/)
  // Los tres apagados siguen intactos y en orden: el ajuste no puede encender un mes que no corresponde.
  assert.match(f, /^=IF\(N\(\$B\$50\)=0;"";IF\(N\(C60\)>0;"";IF\(E60<\$E\$50;"";/)
  // Y sin celda de factor la fórmula queda como estaba: un mes sin factor no se inventa uno.
  assert.equal(formulaProyectadoMes('E60', 'C60', '$B$50', '$E$50'),
    '=IF(N($B$50)=0;"";IF(N(C60)>0;"";IF(E60<$E$50;"";$B$50)))')
})

test('sin fecha de inicio cargada la proyección da CERO, no doce meses', () => {
  // La celda "Desde" vacía devuelve "" (texto). En Sheets un número siempre es menor que un texto,
  // así que `E60 < ""` es VERDADERO y la fórmula devuelve "". Es el lado seguro del error: sin
  // evidencia de que el retiro exista, el cuadro no inventa $78.000.000 al año.
  const f = formulaProyectadoMes('E60', 'C60', '$B$50', '$E$50')
  assert.match(f, /IF\(E60<\$E\$50;"";\$B\$50\)/)
})

test('lo pagado sale del ESTADO de la fila, no de que la fecha ya haya pasado', () => {
  const f = formulaPagadoMes(7, 2026)
  // Una fila con fecha de caja vencida y estado "🟢 Vigente" es un pago previsto que NO salió.
  // Tomarla como pagada apagaría la proyección de un mes que se sigue debiendo.
  assert.match(f, /REGEXMATCH\('Compras'!\$Z\$4:\$Z&"";"Pagado"\)/)
  // LA VENTANA ES LA DEL MES SIGUIENTE: el retiro de julio se paga el 10/08 — los pagos del 03-04/08
  // confirman JULIO, no agosto (el defecto de los $9M dobles, 06/08).
  assert.match(f, /DATE\(2026;8;1\)/)
  assert.match(f, /DATE\(2026;9;1\)/)
  // Dentro de SUMPRODUCT, N() no se expande sobre un rango: tiene que ser IF(ISNUMBER(...)).
  assert.ok(!/\*N\('Compras'/.test(f), `N() sobre un rango adentro de SUMPRODUCT no se expande: ${f}`)
})

test('el retiro de diciembre se paga en ENERO del año siguiente, y el mes 13 no existe', () => {
  // Es percibido: ese pago no es caja de 2026 y el cuadro tiene que dejarlo caer fuera de la ventana.
  //
  // ESTE TEST CONSAGRABA EL DEFECTO (06/08 — B7 de la auditoría). Exigía `DATE(2026;13;…)`. Sheets lo
  // resuelve por desborde y devuelve 10/01/2027, así que el número salía bien; pero la celda declara
  // un mes que no existe, y el día que esa fórmula se copie a otra pestaña o se traduzca a SQL, el
  // desborde no la va a salvar. Un test que exige la forma equivocada la vuelve intocable.
  // Sin ninguna fila de Compras que lo pague, diciembre cae en su fecha PREVISTA — y esa fecha es de
  // enero, no de un mes 13.
  assert.equal(evaluarSePagaEl(formulaSePagaElDireccion(12, 2026), []), serial(2027, 1, DIA_PAGO_DEFAULT))
  assert.doesNotMatch(formulaSePagaElDireccion(12, 2026), /DATE\(\d{4};1[3-9];/)
  // Y la ventana de "pagado" del mes de diciembre tampoco puede tener meses 13 ni 14.
  const dic = formulaPagadoMes(12, 2026)
  assert.match(dic, /DATE\(2027;1;1\)/)
  assert.match(dic, /DATE\(2027;2;1\)/)
  assert.doesNotMatch(dic, /DATE\(\d{4};1[3-9];/)
})

test('EL CASO REAL: julio se pagó el 03 y el 04/08, y la celda dice 04/08 — no la fecha prevista', () => {
  // ═══ EL DEFECTO QUE ESTE TEST ATRAPA ═══
  //
  // La celda devolvía SIEMPRE el DIA_PAGO del mes siguiente. Julio figuraba pagado $9.000.000 y "se
  // paga el 10/08": una fecha FUTURA para plata que ya había salido. Como el cash flow imputa este
  // bloque por DIRECCION_PAGO, el libro pedía caja para el 10/08 por algo ya debitado — un
  // COMPROMETIDO fantasma, sin un solo error de fórmula y sin un descuadre.
  //
  // 46238 = 04/08/2026. Es el valor que el dueño ya dejó en la celda viva por edición quirúrgica: el
  // generador tiene que producir ESE número o la próxima regeneración se lo pisa.
  const julio = evaluarSePagaEl(formulaSePagaElDireccion(7, 2026), COMPRAS_JULIO)
  assert.equal(julio, 46238, 'el retiro de julio se termina de pagar el 04/08/2026')
  assert.equal(julio, serial(2026, 8, 4))
  // MÁX Y NO MÍN: el mes se cierra cuando salió el ÚLTIMO peso. Con el MÍN diría 03/08 —un día antes
  // de estarlo— y volvería a haber un compromiso abierto por el efectivo del 04.
  assert.notEqual(julio, serial(2026, 8, 3))

  // LA MISMA VENTANA QUE "PAGADO": las dos celdas de la fila tienen que hablar de las MISMAS filas de
  // Compras. Cuando cada una definía la suya, el cuadro dijo las dos cosas a la vez.
  assert.equal(evaluarPagado(formulaPagadoMes(7, 2026), COMPRAS_JULIO), 9000000)
})

test('un mes que todavía se debe conserva su fecha PREVISTA', () => {
  // Agosto tiene su retiro cargado en Compras con fecha de caja 10/09 y estado 🟢 Vigente: es un pago
  // previsto que NO salió. Ni suma en "Pagado" ni le puede dar la fecha a "Se paga el" — si lo hiciera,
  // el cuadro daría por saldado un mes que se sigue debiendo, que es el error caro.
  assert.equal(evaluarPagado(formulaPagadoMes(8, 2026), COMPRAS_JULIO), 0)
  assert.equal(
    evaluarSePagaEl(formulaSePagaElDireccion(8, 2026), COMPRAS_JULIO),
    serial(2026, 9, DIA_PAGO_DEFAULT),
  )
})

test('la compra de materiales con la palabra "Corona" no le mueve la fecha a ningún mes', () => {
  // $310.000 de Zabala Repuestos, fecha de caja 03/08, pagada. Si entrara, sumaría en "Pagado" y
  // además fecharía meses que nadie pagó.
  const soloTrampa = COMPRAS_JULIO.filter((f) => f.persona.startsWith('Corona de'))
  assert.equal(evaluarPagado(formulaPagadoMes(7, 2026), soloTrampa), 0)
  assert.equal(
    evaluarSePagaEl(formulaSePagaElDireccion(7, 2026), soloTrampa),
    serial(2026, 8, DIA_PAGO_DEFAULT),
  )
})

test('"Pagado" y "Se paga el" salen de UNA sola definición de las filas que pagan el mes', () => {
  // El desacuerdo entre las dos celdas es el defecto original, así que la garantía no puede ser la
  // disciplina de quien las escriba: las dos se arman con `condicionesPagoDelMes`, y esto lo mide.
  const conds = condicionesPagoDelMes(7, 2026)
  const pagado = formulaPagadoMes(7, 2026)
  const cuando = formulaSePagaElDireccion(7, 2026)
  for (const c of conds) {
    assert.ok(pagado.includes(c), `"Pagado" no usa la condición compartida: ${c}`)
    assert.ok(cuando.includes(c), `"Se paga el" no usa la condición compartida: ${c}`)
  }
  // Y ninguna de las dos agrega condiciones propias: mismo conteo de condiciones en las dos.
  assert.equal(args(cuando.match(/FILTER\((.+)\)\);DATE/)[1]).length - 1, conds.length)
  assert.equal(args(pagado.match(/^=SUMPRODUCT\((.+)\)$/)[1], '*').length - 1, conds.length)
})

test('el día de pago es un PARÁMETRO de la pestaña, no una constante en el código', () => {
  assert.equal(PARAMETRO_DIA_PAGO.rango, 'DIRECCION_DIA_PAGO')
  assert.equal(PARAMETRO_DIA_PAGO.valor, DIA_PAGO_DEFAULT)
  // MEDIDO: las cinco filas de sueldos de administración de julio tienen fecha de caja 10/08.
  assert.equal(DIA_PAGO_DEFAULT, 10)
  assert.ok(PARAMETRO_DIA_PAGO.nota.length > 40, 'un parámetro sin nota es una constante escondida')
})

test('"Sueldos de administración" del cash flow es OFICINA + DIRECCIÓN, sin Compras', () => {
  const f = formulaAdministracion('$C$3', '$D$3')
  for (const n of ['OFICINA_PAGO', 'OFICINA_PAGADO', 'OFICINA_PROYECTADO',
    'DIRECCION_PAGO', 'DIRECCION_PAGADO', 'DIRECCION_PROYECTADO']) {
    assert.ok(f.includes(n), `la línea no lee ${n}`)
  }
  // Si leyera Compras además de la planilla, contaría el mismo sueldo dos veces.
  assert.ok(!f.includes('Compras!'), `la línea que SUMA no puede leer Compras: ${f}`)
  // Y es exactamente la suma de las dos mitades, sin nada en el medio.
  assert.equal(f, `=${formulaOficina('$C$3', '$D$3').slice(1)}+${formulaDireccion('$C$3', '$D$3').slice(1)}`)
})

test('el rubro de sueldos de administración YA NO se paga desde Compras', () => {
  // Es la mitad del arreglo: si la regla siguiera diciendo `paga: 'compras'`, la cobertura del cash
  // flow reportaría Compras como fuente de una línea que ya no la lee, y el próximo que audite el
  // archivo iría a buscar la diferencia al lugar equivocado.
  const r = REGLAS.find((x) => x.rubro === 'Nómina · Sueldos administración')
  assert.equal(r.paga, 'Jornales por Quincena')
  assert.equal(r.detalle, 'Jornales por Quincena')
})

test('todas las fórmulas son es-AR y cierran sus paréntesis', () => {
  for (const f of TODAS()) {
    assert.ok(f.startsWith('='), `no empieza con "=": ${f}`)
    assert.ok(balanceado(f), `paréntesis desbalanceados: ${f}`)
    // El separador de argumentos en es_AR es ";" — la coma es el separador DECIMAL. Una coma acá
    // deja la celda en #ERROR! y ya rompió CAJA una vez.
    const sinTexto = f.replace(/"[^"]*"/g, '""')
    assert.ok(!sinTexto.includes(','), `usa coma como separador: ${f}`)
  }
})

test('las fórmulas citan las columnas de Compras que corresponden', () => {
  // K = "Detalles / Obra" (ahí está el nombre) · O = "Total" · AD = "Fecha de caja" · Z = "Estado pago".
  // Verificado contra el encabezado real de la fila 3 de Compras el 01/08.
  assert.match(formulaRetiroMensual('$A$47'), /'Compras'!\$K\$4:\$K/)
  assert.match(formulaRetiroMensual('$A$47'), /'Compras'!\$O\$4:\$O/)
  assert.match(formulaPrimerRetiro(), /'Compras'!\$AD\$4:\$AD/)
  assert.match(formulaPagadoMes(1, 2026), /'Compras'!\$Z\$4:\$Z/)
})

test('el importe mensual es el de la carga MÁS RECIENTE, ordenada por fecha y no por fila', () => {
  const f = formulaRetiroMensual('$A$47')
  // PROBADO EN UNA COPIA DEL SHEET REAL (01/08): LOOKUP(2;1/cond;rango) —el idioma estándar— devuelve
  // ERROR sobre estos datos, mientras SUMIFS sobre la misma condición devuelve $3.000.000 y COUNTIF
  // devuelve 1. LOOKUP hace búsqueda binaria y no está garantizado sobre un rango con errores
  // intercalados; ya dejó un saldo falso en CAJA una vez. Que no vuelva a entrar por descuido.
  assert.ok(!f.includes('LOOKUP('), `LOOKUP no es confiable acá y está probado que falla: ${f}`)
  // Ordena por la fecha de caja (columna 2 del array) de mayor a menor y toma la primera.
  assert.match(f, /SORT\(FILTER\(/)
  assert.match(f, /;2;0\);1;1\)/, 'ordena por fecha DESC y toma la fila 1, columna 1 (el importe)')
  // El array literal de dos columnas lleva "\" en es_AR — con "," la celda queda en #ERROR!
  assert.match(f, /\{'Compras'!\$O\$4:\$O\\'Compras'!\$AD\$4:\$AD\}/)
  assert.match(f, /IFERROR\(/, 'sin persona cargada tiene que dar "" y no #N/A')
})
