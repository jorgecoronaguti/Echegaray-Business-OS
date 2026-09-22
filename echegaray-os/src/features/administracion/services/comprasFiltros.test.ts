import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aParams, criteriosDeURL, hayCriterios, LLAVE, numeroDe, opcionesDe, pasaCriterios, periodoDe,
  SIN_ASIGNAR, textoDeImporte, tramoVisible, type Criteriable, type Criterios,
} from './comprasFiltros.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//   · Un criterio contra una celda vacía que «pasa» → filtrar por obra devolvería las filas sin obra.
//   · `min=0` leído como «sin filtro» → en una pestaña con notas de crédito son dos listas distintas.
//   · La fecha comparada con `new Date` → UTC corre el día en Argentina y el 1° del mes se pierde.
//   · El importe filtrado con signo → una nota de crédito de −$500.000 no aparece en «desde $100.000».
//   · Un desplegable armado con constantes → ofrece valores que no matchean y esconde los que sí.
//   · Un criterio que pisa a otro → «DUPEC + agosto» tiene que ser las dos cosas, no la última.

const fila = (over: Partial<Criteriable> = {}): Criteriable => ({
  proveedor: 'DUPEC',
  obra: { rotulo: 'OB-0007 · SAN FRANCISCO' },
  categoria: 'B',
  estado: 'Pendiente',
  total: 250000,
  fecha: '2026-08-04',
  tramo_vencimiento: '2 · Vence esta semana',
  ...over,
})

test('sin criterios pasa todo', () => {
  assert.equal(pasaCriterios(fila(), {}), true)
  assert.equal(hayCriterios({}), false)
})

test('los criterios se COMBINAN: hace falta cumplirlos todos', () => {
  const c: Criterios = { proveedor: 'DUPEC', periodo: '2026-08' }
  assert.equal(pasaCriterios(fila(), c), true)
  assert.equal(pasaCriterios(fila({ fecha: '2026-07-04' }), c), false, 'el período manda aunque el proveedor coincida')
  assert.equal(pasaCriterios(fila({ proveedor: 'MASS CONSULTORA' }), c), false, 'el proveedor manda aunque el período coincida')
})

test('un criterio contra una celda vacía NO pasa', () => {
  assert.equal(pasaCriterios(fila({ obra: null }), { obra: 'OB-0007 · SAN FRANCISCO' }), false)
  assert.equal(pasaCriterios(fila({ obra: { rotulo: null } }), { obra: 'OB-0007 · SAN FRANCISCO' }), false)
  assert.equal(pasaCriterios(fila({ fecha: null }), { desde: '2026-01-01' }), false)
})

test('el texto se compara exacto, no por contenido', () => {
  assert.equal(pasaCriterios(fila({ obra: { rotulo: 'OB-0007 · SAN FRANCISCO II' } }), { obra: 'OB-0007 · SAN FRANCISCO' }), false)
  assert.equal(pasaCriterios(fila({ obra: { rotulo: 'ob-0007 · san francisco' } }), { obra: 'OB-0007 · SAN FRANCISCO' }), true, 'las mayúsculas no cuentan')
})

// ═══ EL ARREGLO DEL 15/09/2026: EL FILTRO «OBRA» DEJA DE MIRAR EL TEXTO LIBRE DE LA J ═══
//
// EL DEFECTO, medido en producción ese día: el desplegable ofrecía «Administracion», «Almacen»,
// «ARCOR», «LA ESTRELLA», «MESSINA», «Papa», «Quattropani - Melisa García SAS», «SAINT GOBAIN»,
// «San Francisco», «Taller», «TALLER» y «Vehiculos / Maquinas». Doce opciones que no son doce obras:
// «Taller» y «TALLER» son la misma, «ARCOR» y «SAINT GOBAIN» son clientes, y ninguna se puede
// elegir en el desplegable de la fila — así que filtrar y asignar hablaban dos idiomas distintos.
//
// Estos tres tests se ponen ROJOS si `pasaCriterios` u `opcionesDe` vuelven a leer `obra_texto`:
// ninguna de estas filas lo tiene.

test('el filtro «Obra» compara contra el RÓTULO ÚNICO de Supabase, no contra la columna J', () => {
  const conTextoViejo = { ...fila({ obra: { rotulo: 'OB-0007 · SAN FRANCISCO' } }), obra_texto: 'San Francisco' } as Criteriable
  assert.equal(pasaCriterios(conTextoViejo, { obra: 'OB-0007 · SAN FRANCISCO' }), true)
  assert.equal(
    pasaCriterios(conTextoViejo, { obra: 'San Francisco' }), false,
    'el filtro sigue aceptando el texto crudo de la pestaña: dos vocabularios para la misma columna',
  )
})

test('«(sin asignar)» es el ÚNICO criterio de obra que trae las filas sin imputar', () => {
  const sinObra = fila({ obra: null })
  const conObra = fila({ obra: { rotulo: 'ES-ADM · Estructura – Administración' } })
  assert.equal(pasaCriterios(sinObra, { obra: SIN_ASIGNAR }), true)
  assert.equal(pasaCriterios(conObra, { obra: SIN_ASIGNAR }), false, '«sin asignar» trajo una fila imputada')
  // Y no se confunde con «Sin obra – cliente», que SÍ es una imputación.
  const sinObraDelCliente = fila({ obra: { rotulo: 'Sin obra – ARCOR' } })
  assert.equal(pasaCriterios(sinObraDelCliente, { obra: SIN_ASIGNAR }), false,
    '«Sin obra – cliente» es una decisión tomada, no una fila sin imputar')
  assert.equal(pasaCriterios(sinObraDelCliente, { obra: 'Sin obra – ARCOR' }), true)
})

test('las fechas se comparan como texto ISO, con los bordes incluidos', () => {
  assert.equal(pasaCriterios(fila({ fecha: '2026-08-01' }), { desde: '2026-08-01' }), true)
  assert.equal(pasaCriterios(fila({ fecha: '2026-08-31' }), { hasta: '2026-08-31' }), true)
  assert.equal(pasaCriterios(fila({ fecha: '2026-07-31' }), { desde: '2026-08-01' }), false)
  // La fecha llega de PostgREST como timestamp completo en algunas vistas: se recorta a 10.
  assert.equal(pasaCriterios(fila({ fecha: '2026-08-15T00:00:00Z' }), { desde: '2026-08-01', hasta: '2026-08-31' }), true)
})

test('el importe se filtra por valor absoluto: una nota de crédito es un movimiento de su tamaño', () => {
  assert.equal(pasaCriterios(fila({ total: -500000 }), { min: 100000 }), true)
  assert.equal(pasaCriterios(fila({ total: -50000 }), { min: 100000 }), false)
  assert.equal(pasaCriterios(fila({ total: 250000 }), { min: 100000, max: 300000 }), true)
  assert.equal(pasaCriterios(fila({ total: null }), { min: 0 }), false, 'sin importe no se puede juzgar')
})

test('min=0 es un filtro puesto, no la ausencia de filtro', () => {
  assert.equal(numeroDe('0'), 0)
  assert.equal(numeroDe(''), undefined)
  assert.equal(numeroDe('  '), undefined)
  assert.equal(numeroDe('no'), undefined)
  assert.equal(numeroDe('1.500.000,50'), 1500000.5, 'acepta el formato es-AR que el dueño tipea')
  assert.equal(hayCriterios({ min: 0 }), true)
})

test('el tramo de vencimiento pierde su prefijo de orden para mostrarse y para filtrar', () => {
  assert.equal(tramoVisible('1 · Vencido'), 'Vencido')
  assert.equal(tramoVisible('3 · 8 a 30 días'), '8 a 30 días')
  assert.equal(tramoVisible(null), '')
  assert.equal(pasaCriterios(fila(), { vencimiento: 'Vence esta semana' }), true)
  assert.equal(pasaCriterios(fila({ tramo_vencimiento: null }), { vencimiento: 'Vencido' }), false)
})

test('el período sale de la fecha y nunca se inventa', () => {
  assert.equal(periodoDe('2026-09-07'), '2026-09')
  assert.equal(periodoDe(null), '')
  assert.equal(periodoDe('sept-26'), '', 'un mes en texto no es una fecha ISO')
})

test('la URL va y vuelve sin perder ni agregar nada', () => {
  const c: Criterios = { proveedor: 'DUPEC', obra: 'MESSINA', min: 100000, periodo: '2026-08' }
  const params = aParams(c)
  assert.deepEqual(params, { [LLAVE.proveedor]: 'DUPEC', [LLAVE.obra]: 'MESSINA', [LLAVE.min]: '100000', [LLAVE.periodo]: '2026-08' })
  assert.deepEqual(criteriosDeURL(params), {
    proveedor: 'DUPEC', obra: 'MESSINA', min: 100000, periodo: '2026-08',
    categoria: undefined, estado: undefined, medio: undefined, vencimiento: undefined, desde: undefined, hasta: undefined, max: undefined,
  })
})

test('D07 · el medio «A rendir» se ofrece aunque ninguna fila lo tenga, y filtra exacto', () => {
  const filas = [fila({ proveedor: 'DUPEC' }), { ...fila({ proveedor: 'Corralón El Nogal' }), tipo_pago: 'A rendir' } as Criteriable,
    { ...fila({ proveedor: 'X' }), tipo_pago: 'Mercado Pago' } as Criteriable]
  const o = opcionesDe(filas)
  assert.ok(o.medios.includes('A rendir'))
  assert.ok(o.medios.includes('Transferencia'), 'la lista del panel de pago se ofrece entera')
  assert.equal(o.medios.at(-1), 'Mercado Pago', 'lo que la pestaña trae además se agrega al final')
  assert.equal(opcionesDe([]).medios.includes('A rendir'), true)
  assert.deepEqual(filas.filter((f) => pasaCriterios(f, { medio: 'a rendir' })).map((f) => f.proveedor), ['Corralón El Nogal'])
  assert.deepEqual(criteriosDeURL(aParams({ medio: 'A rendir' })).medio, 'A rendir')
})

test('un valor ilegible en la URL se ignora: no vacía la lista', () => {
  const c = criteriosDeURL({ [LLAVE.min]: 'ochenta', [LLAVE.proveedor]: '   ' })
  assert.equal(c.min, undefined)
  assert.equal(c.proveedor, undefined)
  assert.equal(hayCriterios(c), false)
})

test('los desplegables se arman con lo que la pestaña TIENE, y las anuladas no cuentan', () => {
  const filas = [
    fila({ proveedor: 'DUPEC', obra: { rotulo: 'OB-0003 · MESSINA' }, fecha: '2026-08-04', categoria: 'B', estado: 'Pendiente', tramo_vencimiento: '2 · Vence esta semana' }),
    fila({ proveedor: 'Combustibles Barcelo', obra: { rotulo: 'OB-0007 · SAN FRANCISCO' }, fecha: '2026-09-01', categoria: 'N', estado: 'Pagado', tramo_vencimiento: '1 · Vencido' }),
    { ...fila({ proveedor: 'FANTASMA SRL', obra: { rotulo: 'OB-9999 · OBRA MUERTA' } }), anulada: true } as Criteriable,
  ]
  const o = opcionesDe(filas)
  assert.deepEqual(o.obras, ['OB-0003 · MESSINA', 'OB-0007 · SAN FRANCISCO'],
    'el desplegable de obra dejó de armarse con los rótulos únicos')
  assert.equal(o.obras.includes(SIN_ASIGNAR), false, 'ofreció «sin asignar» sin que haya una sola fila sin imputar')
  assert.deepEqual(o.proveedores, ['Combustibles Barcelo', 'DUPEC'])
  assert.equal(o.proveedores.includes('FANTASMA SRL'), false, 'una anulada no puebla el desplegable')
  assert.deepEqual(o.categorias, ['B', 'N'])
  assert.deepEqual(o.estados, ['Pagado', 'Pendiente'])
  assert.deepEqual(o.periodos, ['2026-09', '2026-08'], 'del más nuevo al más viejo')
  assert.deepEqual(o.vencimientos, ['Vencido', 'Vence esta semana'], 'por urgencia, que es el orden que ya escribió el Sheet')
})

test('«(sin asignar)» aparece en el desplegable SÓLO cuando hay filas sin imputar', () => {
  // Al revés es peor que no tenerlo: una opción que devuelve la lista vacía manda a alguien a buscar
  // trabajo que no existe, y esconderla cuando el trabajo SÍ existe lo hace invisible.
  const o = opcionesDe([
    fila({ obra: { rotulo: 'OB-0003 · MESSINA' } }),
    fila({ obra: null }),
  ])
  assert.deepEqual(o.obras, ['OB-0003 · MESSINA', SIN_ASIGNAR])
  assert.equal(o.obras.at(-1), SIN_ASIGNAR, '«sin asignar» tiene que quedar al final, no mezclado entre las obras')
})

test('el desplegable no ofrece DOS VECES el mismo valor escrito distinto', () => {
  // ═══ EL DEFECTO QUE ATRAPA, medido el 15/09/2026 en producción ═══
  //
  // `pasaCriterios` compara con `trim().toLowerCase()`: elegir «DUPEC» YA traía también las filas de
  // «Dupec». Pero las opciones se juntaban con un `Set` de textos crudos, así que el desplegable
  // ofrecía las dos — dos entradas que filtran exactamente lo mismo. De los 132 proveedores de la
  // pestaña, `DUPEC`/`Dupec` y `FEMENIA`/`Femenia` eran ese caso.
  //
  // No se perdía ninguna fila; se perdía la confianza en la lista: quien elige no puede saber que da
  // igual cuál de las dos toque. El desplegable y el filtro tienen que tener UNA idea de «el mismo
  // valor», y la del filtro ya estaba escrita.
  const o = opcionesDe([
    fila({ proveedor: 'DUPEC' }),
    fila({ proveedor: 'DUPEC' }),
    fila({ proveedor: 'Dupec' }),
    fila({ proveedor: 'Combustibles Barcelo' }),
  ])
  assert.deepEqual(o.proveedores, ['Combustibles Barcelo', 'DUPEC'],
    'el desplegable volvió a ofrecer dos veces el mismo proveedor con otra mayúscula')
  // Y LA GRAFÍA QUE QUEDA ES LA MÁS USADA, no la primera que aparece: es la que el dueño escribe y
  // la que va a reconocer en la lista.
  const alReves = opcionesDe([
    fila({ proveedor: 'Dupec' }),
    fila({ proveedor: 'DUPEC' }),
    fila({ proveedor: 'DUPEC' }),
  ])
  assert.deepEqual(alReves.proveedores, ['DUPEC'], 'quedó la primera grafía en vez de la más frecuente')
  // La opción que quedó TIENE que seguir trayendo las filas de la otra grafía — si no, deduplicar
  // habría escondido trabajo en vez de ordenar la lista.
  assert.equal(pasaCriterios(fila({ proveedor: 'Dupec' }), { proveedor: 'DUPEC' }), true)
})

// ═══ AUDITORÍA 18/09/2026: «8.5» NO ES 85, Y EL IMPORTE NO CRECE ×10 EN CADA VUELTA ═══
//
// `numeroDe` sacaba TODOS los puntos antes de cambiar la coma, y el campo se precargaba con `toString()`:
// «1.500,50» quedaba 1500.5, el campo mostraba «1500.5», y al cambiar otro filtro se releía 15005.
// MUTACIÓN QUE LOS PONE ROJOS: volver a `replace(/\./g, '').replace(',', '.')`.

test('«8.5» ES OCHO Y MEDIO, NO 85', () => {
  assert.equal(numeroDe('8.5'), 8.5, 'MUTACIÓN: el punto decimal volvió a leerse como miles')
  assert.equal(numeroDe('12.50'), 12.5)
  assert.equal(numeroDe('1.500'), 1500)
  assert.equal(numeroDe('-1.500'), -1500, 'las notas de crédito van en negativo')
})

test('EL IMPORTE PRECARGADO, REENVIADO, ES EL MISMO: no crece en cada vuelta por la URL', () => {
  for (const tecleado of ['1.500,50', '8,5', '1.500', '250.000', '0,75']) {
    const primero = numeroDe(tecleado)
    let valor = primero
    // Tres vueltas: lo que el campo muestra se reenvía al cambiar otro filtro.
    for (let i = 0; i < 3; i++) valor = numeroDe(textoDeImporte(valor))
    assert.equal(valor, primero, `«${tecleado}» cambió al volver por la URL: ${primero} → ${valor}`)
  }
  assert.equal(textoDeImporte(undefined), undefined)
})
