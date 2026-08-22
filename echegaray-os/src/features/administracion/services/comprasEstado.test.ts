import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarFiltro, controlDe, filtroDe, FILTROS, type ControlEntrada, type FiltroCompras,
} from './comprasEstado.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN, uno por uno:
//
//   · «Confirmada» tapando «Sin imputar» → el gasto se da por trabajado por haber mirado el papel.
//   · El aviso de posible duplicado que no se apaga nunca → el KPI no baja por más que se trabaje.
//   · Un tipo de ARCA desconocido presentado como comprobante normal → es el bug de $41,9M vestido
//     de otra cosa: lo que no se pudo clasificar tiene que verse, no pasar.
//   · El conteo del KPI y el filtro de la lista escritos por separado → «7 sin imputar», nueve filas.
//   · UN GASTO DE ESTRUCTURA CONTADO COMO «SIN IMPUTAR» → el KPI pide un trabajo que no existe, y
//     el gasto que de verdad no llega a ninguna obra (rótulo sin alias) se muestra como imputado.

const base: ControlEntrada = {
  estado_control: 'sin_revisar',
  tiene_posible_duplicado: false,
  signo: 1,
  emisor_cuit: '30708332599',
  comprobante: '0003-00018497',
  obra_texto: 'Escuela San Juan',
  imputacion: 'obra',
}
const con = (p: Partial<ControlEntrada>): ControlEntrada => ({ ...base, ...p })

test('el comprobante completo, imputado y sin parecidos está sincronizado', () => {
  assert.equal(controlDe(base).clave, 'sincronizada')
  assert.equal(controlDe(base).tono, 'pos')
})

test('confirmar NO imputa: un comprobante confirmado sin obra sigue diciendo Sin imputar', () => {
  const c = controlDe(con({ estado_control: 'confirmado', obra_texto: null, imputacion: 'sin_identificar' }))
  assert.equal(c.clave, 'sin-imputar', 'la confirmación tapó que el gasto no tiene obra')
  assert.equal(c.tono, 'warn')
  // Con obra, la confirmación sí es lo último que pasó y es lo que se muestra.
  assert.equal(controlDe(con({ estado_control: 'confirmado' })).clave, 'confirmada')
})

test('un gasto de Estructura NO está sin imputar: ya está donde va', () => {
  // Es el defecto 4.6: «Sueldos», «UOCRA» o «Administración» tienen rótulo y clasificación, y el
  // binario viejo (`obra_texto is null`) los daba por imputados sólo por tener texto, mientras el
  // KPI «sin imputar» no los distinguía de una obra real.
  const e = controlDe(con({ obra_texto: 'Sueldos', imputacion: 'estructura' }))
  assert.equal(e.clave, 'sincronizada', 'un gasto de Estructura aparece como trabajo pendiente')
  assert.equal(controlDe(con({ obra_texto: 'Sueldos', imputacion: 'estructura', estado_control: 'confirmado' })).clave, 'confirmada')
})

test('un rótulo que el diccionario no conoce NO es «sin imputar» ni «imputado»: es sin resolver', () => {
  // El gasto no llega a ninguna obra y nadie se entera. El trabajo es declarar el alias, no elegir
  // obra: son dos acciones distintas y por eso son dos estados distintos.
  const c = controlDe(con({ obra_texto: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', imputacion: 'sin_resolver' }))
  assert.equal(c.clave, 'sin-resolver')
  assert.equal(c.tono, 'warn')
  assert.notEqual(c.clave, 'sincronizada', 'un rótulo sin alias se mostró como imputado')
})

test('sin `imputacion` se cae al criterio viejo, y falla del lado que PIDE trabajo', () => {
  assert.equal(controlDe(con({ imputacion: null, obra_texto: null })).clave, 'sin-imputar')
  assert.equal(controlDe(con({ imputacion: null, obra_texto: '   ' })).clave, 'sin-imputar')
  assert.equal(controlDe(con({ imputacion: null })).clave, 'sincronizada')
})

test('el aviso de posible duplicado se apaga cuando una persona lo resuelve, y sólo entonces', () => {
  assert.equal(controlDe(con({ tiene_posible_duplicado: true })).clave, 'duplicado')
  assert.equal(controlDe(con({ tiene_posible_duplicado: true })).tono, 'neg')
  assert.equal(controlDe(con({ tiene_posible_duplicado: true, estado_control: 'confirmado' })).clave, 'confirmada')
  // «Dejar en revisión» es una respuesta: el comprobante pasa a la cola de trabajo humano.
  assert.equal(controlDe(con({ tiene_posible_duplicado: true, estado_control: 'en_revision' })).clave, 'por-revisar')
})

test('lo marcado para volver gana sobre todo lo demás', () => {
  assert.equal(
    controlDe(con({ estado_control: 'en_revision', obra_texto: null, imputacion: 'sin_identificar', signo: null })).clave,
    'por-revisar',
  )
})

test('un papel que el OS no pudo clasificar se ve: tipo desconocido, sin CUIT o sin número', () => {
  // signo null = el código de ARCA no está en la tabla. Tratarlo como uno más es exactamente el
  // error que costó $41.953.276 en el libro de compras.
  assert.equal(controlDe(con({ signo: null })).clave, 'sin-clasificar')
  assert.equal(controlDe(con({ emisor_cuit: null })).clave, 'sin-clasificar')
  assert.equal(controlDe(con({ emisor_cuit: '   ' })).clave, 'sin-clasificar')
  assert.equal(controlDe(con({ comprobante: null })).clave, 'sin-clasificar')
  // …y no lo tapa la falta de obra, que es un problema menor y de otra naturaleza.
  assert.equal(controlDe(con({ signo: null, obra_texto: null, imputacion: 'sin_identificar' })).clave, 'sin-clasificar')
})

test('un ?f= desconocido no vacía la lista: cae en capturadas', () => {
  assert.equal(filtroDe('duplicados'), 'duplicados')
  assert.equal(filtroDe('cualquier-cosa'), 'capturadas')
  assert.equal(filtroDe(undefined), 'capturadas')
  assert.equal(filtroDe(null), 'capturadas')
})

// ═══ EL CONTEO Y LA LISTA SALEN DEL MISMO PREDICADO ═══
//
// El doble espía registra qué le pidieron al query. Si mañana alguien cambia el filtro de la lista y
// se olvida del conteo —o al revés—, este test no se entera… salvo que los dos pasen por acá, que es
// justamente lo que afirma: hay UNA función y las dos llamadas la usan.
class QuerySpia {
  readonly llamadas: string[] = []
  eq(columna: string, valor: unknown): this {
    this.llamadas.push(`eq:${columna}=${String(valor)}`)
    return this
  }
  is(columna: string, valor: null): this {
    this.llamadas.push(`is:${columna}=${String(valor)}`)
    return this
  }
}

test('cada KPI aplica su predicado, y «capturadas» no aplica ninguno', () => {
  const esperado: Record<FiltroCompras, string[]> = {
    capturadas: [],
    'por-revisar': ['eq:estado_control=en_revision'],
    // NO es `is:obra_texto=null`: ese predicado contaba como pendiente a los gastos de Estructura
    // que tenían rótulo y dejaba fuera a los rótulos sin alias, que son los que no llegan a nadie.
    'sin-imputar': ['eq:imputacion=sin_identificar'],
    'sin-resolver': ['eq:imputacion=sin_resolver'],
    estructura: ['eq:imputacion=estructura'],
    duplicados: ['eq:tiene_posible_duplicado=true', 'eq:estado_control=sin_revisar'],
  }
  for (const [filtro, llamadas] of Object.entries(esperado)) {
    const q = new QuerySpia()
    aplicarFiltro(q, filtro as FiltroCompras)
    assert.deepEqual(q.llamadas, llamadas, `el filtro «${filtro}» dejó de pedir lo que cuenta`)
  }
  // UN KPI SIN PREDICADO SE VE IGUAL QUE UNO CON PREDICADO: muestra el libro entero y su número
  // miente. Este assert obliga a que agregar una clave a FILTROS traiga su fila a este test.
  assert.deepEqual(FILTROS, Object.keys(esperado), 'hay un filtro sin predicado declarado')
})

test('«duplicados» cuenta sólo los SIN RESOLVER: sin eso el KPI nunca bajaría', () => {
  const q = new QuerySpia()
  aplicarFiltro(q, 'duplicados')
  assert.ok(
    q.llamadas.includes('eq:estado_control=sin_revisar'),
    'el filtro de duplicados dejó de excluir los ya resueltos',
  )
})
