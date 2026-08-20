import test from 'node:test'
import assert from 'node:assert/strict'
import { CAMPOS, ordenar, valorDe, proximaDireccion, esCampo, type FilaOrdenable } from './ordenObras.ts'

const o = (obra_id: string, extra: Partial<FilaOrdenable> = {}): FilaOrdenable => ({ obra_id, nombre: obra_id, ...extra })
const ids = (l: readonly FilaOrdenable[]) => l.map((x) => x.obra_id)

// LA ETAPA SE ORDENA POR EL CICLO DE VIDA, NO POR EL ABECEDARIO. "Por etapa de avance" quiere decir
// Previo → Inicio → Desarrollo → Terminación → Cierre. Alfabéticamente daría Cierre primero: la obra
// que ya terminó arriba de la que arranca, que es justo al revés de lo que se está preguntando.
test('las etapas se ordenan por el ciclo de vida', () => {
  const l = [o('c', { etapa: 'cierre' }), o('p', { etapa: 'previo' }), o('d', { etapa: 'desarrollo' }), o('t', { etapa: 'terminacion' }), o('i', { etapa: 'inicio' })]
  assert.deepEqual(ids(ordenar(l, 'etapa', 'asc')), ['p', 'i', 'd', 't', 'c'])
  assert.deepEqual(ids(ordenar(l, 'etapa', 'desc')), ['c', 't', 'd', 'i', 'p'])
})

// LO QUE NO ESTÁ CARGADO NO ES CERO. Si el nulo compitiera, ordenar por contratado descendente
// pondría arriba las obras que nadie cargó — al revés de lo que busca el que ordena.
test('lo que no está cargado va último en las DOS direcciones', () => {
  const l = [o('sin', { monto_contratado: null }), o('chica', { monto_contratado: 100 }), o('grande', { monto_contratado: 900 })]
  assert.deepEqual(ids(ordenar(l, 'contratado', 'desc')), ['grande', 'chica', 'sin'])
  assert.deepEqual(ids(ordenar(l, 'contratado', 'asc')), ['chica', 'grande', 'sin'])
})

test('un 0% cargado NO es lo mismo que sin avance: el cero compite, el nulo no', () => {
  const l = [o('sin', { avance_pct: null }), o('cero', { avance_pct: 0 }), o('medio', { avance_pct: 50 })]
  assert.deepEqual(ids(ordenar(l, 'avance', 'asc')), ['cero', 'medio', 'sin'])
})

// SIN DESEMPATE, DOS OBRAS IGUALES SE INTERCAMBIAN ENTRE CORRIDAS Y LA TABLA PARPADEA AL RECARGAR.
test('el empate lo desempata el nombre, y el orden es total', () => {
  const l = [o('zeta', { nombre: 'Zeta', avance_pct: 50 }), o('alfa', { nombre: 'Alfa', avance_pct: 50 })]
  assert.deepEqual(ids(ordenar(l, 'avance', 'desc')), ['alfa', 'zeta'])
  assert.deepEqual(ids(ordenar(l, 'avance', 'asc')), ['alfa', 'zeta'])
})

test('el cliente se ordena por el nombre que la tabla MUESTRA, no por uno invisible', () => {
  const l = [o('b', { cliente_nombre: null, cliente_texto: 'ARCOR' }), o('a', { cliente_nombre: 'Messina' })]
  assert.deepEqual(ids(ordenar(l, 'cliente', 'asc')), ['b', 'a'])
  // Y sin ninguno de los dos, es un hueco: va último.
  assert.equal(valorDe(o('x'), 'cliente', () => null), null)
})

test('ordenar NO muta el arreglo que recibe', () => {
  const l = [o('b', { avance_pct: 1 }), o('a', { avance_pct: 9 })]
  const copia = [...l]
  ordenar(l, 'avance', 'desc')
  assert.deepEqual(ids(l), ids(copia))
})

test('sin campo no se reordena nada: manda el orden de la fuente', () => {
  const l = [o('b'), o('a')]
  assert.deepEqual(ids(ordenar(l, null, 'asc')), ['b', 'a'])
})

// El plazo no vive en la fila: llega de la otra lectura. Se pasa como función para no obligar a esta
// pantalla a fusionar las dos tablas sólo para poder ordenar.
test('el plazo se ordena con el desvío que trae la otra lectura', () => {
  const l = [o('sana'), o('atrasada'), o('sinPlan')]
  const desvio = (id: string) => (id === 'sana' ? 2 : id === 'atrasada' ? -30 : null)
  assert.deepEqual(ids(ordenar(l, 'plazo', 'asc', desvio)), ['atrasada', 'sana', 'sinPlan'])
})

test('el primer clic abre cada columna por donde importa, y el segundo la da vuelta', () => {
  assert.equal(proximaDireccion('costo', null, null), 'desc')   // el que más gastó primero
  assert.equal(proximaDireccion('nombre', null, null), 'asc')   // los textos, de la A a la Z
  assert.equal(proximaDireccion('costo', 'costo', 'desc'), 'asc')
  assert.equal(proximaDireccion('costo', 'avance', 'asc'), 'desc')
})

test('un campo inventado en la URL no ordena nada', () => {
  assert.equal(esCampo('avance'), true)
  assert.equal(esCampo('sueldo'), false)
  assert.equal(esCampo(undefined), false)
})

// ═══ LAS SIETE COLUMNAS DE LA CARTERA SON UN CONTRATO, NO UNA PREFERENCIA ═══
//
// `design/screens/obras.md` §1a las fija con nombre y con orden: **Obra | Cliente | Etapa | Avance |
// Plazo | Contratado | Costo real**, y agrega *"Todas las columnas ordenan"*. `CAMPOS` es la única
// declaración de ese conjunto en todo el módulo —la tabla dibuja un `<ThOrden>` por entrada y el
// rótulo sale de acá—, así que una columna que se agrega, se saca o se renombra pasa por este
// objeto o no pasa.
//
// Sin esta prueba, sacar «Contratado» —la columna que sólo ve Administración, y por lo tanto la que
// nadie nota que falta cuando la mira un jefe de obra— no rompe nada: la tabla queda con seis
// columnas y compila.
test('la cartera declara exactamente las siete columnas del handoff, en su orden', () => {
  assert.deepEqual(Object.keys(CAMPOS), ['nombre', 'cliente', 'etapa', 'avance', 'plazo', 'contratado', 'costo'])
  assert.deepEqual(
    Object.values(CAMPOS),
    ['Obra', 'Cliente', 'Etapa', 'Avance', 'Plazo', 'Contratado', 'Costo real'],
  )
  // Y todas ordenan de verdad: `esCampo` es el guarda de la URL, y una columna que no lo pasa
  // dibuja un encabezado que al tocarlo no hace nada.
  for (const c of Object.keys(CAMPOS)) assert.ok(esCampo(c), `${c} tiene rótulo pero no ordena`)
})
