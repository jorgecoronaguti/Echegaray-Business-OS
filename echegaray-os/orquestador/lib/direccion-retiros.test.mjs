import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NOMBRES_DIRECCION, DIA_PAGO_DEFAULT, PARAMETRO_DIA_PAGO, regexDireccion, esRetiro,
  formulaRetiroMensual, formulaPrimerRetiro, formulaPagadoMes, formulaSePagaElDireccion,
  formulaProyectadoMes, formulaDireccion,
} from './direccion-retiros.mjs'
import { formulaAdministracion, formulaOficina } from './cash-flow-lineas.mjs'
import { REGLAS } from './rubro-caja.mjs'

const balanceado = (f) => [...f].reduce((n, c) => n + (c === '(' ? 1 : c === ')' ? -1 : 0), 0) === 0

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
  assert.match(f, /DATE\(2026;7;1\)/)
  assert.match(f, /DATE\(2026;8;1\)/)
  // Dentro de SUMPRODUCT, N() no se expande sobre un rango: tiene que ser IF(ISNUMBER(...)).
  assert.ok(!/\*N\('Compras'/.test(f), `N() sobre un rango adentro de SUMPRODUCT no se expande: ${f}`)
})

test('el retiro de diciembre se paga en ENERO del año siguiente', () => {
  // Es percibido: ese pago no es caja de 2026 y el cuadro tiene que dejarlo caer fuera de la ventana.
  assert.equal(formulaSePagaElDireccion(12, 2026), '=DATE(2026;13;DIRECCION_DIA_PAGO)')
  assert.equal(formulaSePagaElDireccion(7, 2026), '=DATE(2026;8;DIRECCION_DIA_PAGO)')
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
