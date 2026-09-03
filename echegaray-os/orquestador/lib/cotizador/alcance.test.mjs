// EL CRUCE EXCLUSIÓN ↔ CÓMPUTO, con el caso real que lo motivó.
//
// El contrato de Quattropani excluye el entrepiso y la escalera, y se computaron igual porque nadie
// leyó el contrato antes de computar. Este archivo existe para que eso deje de poder pasar en
// silencio: la partida excluida sale del total y el hecho queda DICHO con su plata al lado.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ALCANCE, entradaDeAlcance, alcanza, cruzarAlcance, paraCostear } from './alcance.mjs'
import { ESTADO, TIPO_ISSUE, SEVERIDAD } from './contrato.mjs'

const PARTIDAS = [
  { codigo: 'T1010', descripcion: 'COLUMNA DE CARGA H17', rubro: 'ESTRUCTURA DE HORMIGÓN ARMADO', subtotal: 30_000_000 },
  { codigo: 'T2050', descripcion: 'ENTREPISO DE HORMIGÓN', rubro: 'ESTRUCTURA DE HORMIGÓN ARMADO', subtotal: 4_150_000 },
  { codigo: 'T3100', descripcion: 'ESCALERA DE HORMIGÓN', rubro: 'ESTRUCTURA DE HORMIGÓN ARMADO', subtotal: 1_200_000 },
  { codigo: 'T9000', descripcion: 'PINTURA LATEX INTERIOR', rubro: 'TERMINACIONES', subtotal: 900_000 },
]

const CONTRATO_QUATTROPANI = [
  entradaDeAlcance({ patron: 'entrepiso', estado: ALCANCE.EXCLUIDO, fuente: 'contrato Quattropani cláusula de alcance', textoLiteral: 'no incluye entrepiso ni escalera' }),
  entradaDeAlcance({ patron: 'escalera', estado: ALCANCE.EXCLUIDO, fuente: 'contrato Quattropani cláusula de alcance', textoLiteral: 'no incluye entrepiso ni escalera' }),
  entradaDeAlcance({ patron: 'columna', estado: ALCANCE.INCLUIDO, fuente: 'contrato Quattropani cláusula de alcance' }),
]

test('EL CASO REAL: lo que el contrato excluye sale del total, y la plata se dice', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `cruzarAlcance`, `cuentaEnElTotal: true` siempre.
  const r = cruzarAlcance({ partidas: PARTIDAS, alcance: CONTRATO_QUATTROPANI })
  assert.equal(r.excluidas, 2)
  assert.equal(r.excluidoEnPlata, 5_350_000)
  const entrepiso = r.partidas.find((p) => p.codigo === 'T2050')
  assert.equal(entrepiso.alcance, ALCANCE.EXCLUIDO)
  assert.equal(entrepiso.cuentaEnElTotal, false)
  // ...y el cómputo NO se borra: si el cliente cambia de idea, vuelve entero.
  assert.equal(entrepiso.subtotal, 4_150_000)
})

test('la exclusión CON cómputo valorizado produce un issue con su impacto', () => {
  const r = cruzarAlcance({ partidas: PARTIDAS, alcance: CONTRATO_QUATTROPANI })
  const i = r.issues.filter((x) => x.type === TIPO_ISSUE.EXCLUSION_CON_COMPUTO)
  assert.equal(i.length, 2)
  assert.equal(i.find((x) => x.entity === 'T2050').impact, 4_150_000)
  assert.match(i[0].detalle, /sale del total y el cómputo se conserva/)
})

test('POR_DEFINIR no se cotiza: si nadie dijo que va, cotizarla es decidir por el cliente', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `paraCostear`, `p.alcance !== ALCANCE.EXCLUIDO`.
  const r = cruzarAlcance({ partidas: PARTIDAS, alcance: CONTRATO_QUATTROPANI })
  const pintura = r.partidas.find((p) => p.codigo === 'T9000')
  assert.equal(pintura.alcance, ALCANCE.POR_DEFINIR)
  assert.equal(pintura.estadoAlcance, ESTADO.FALTA_DATO)
  assert.deepEqual(paraCostear(r.partidas).map((p) => p.codigo), ['T1010'])
})

test('dos entradas que dicen cosas opuestas NO se resuelven por orden de llegada', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `cruzarAlcance`, `const estado = estados[0]` sin el bloque de
  // conflicto. Es la misma regla que `proyecto.mjs` aplica a los hechos documentales.
  const alcance = [
    entradaDeAlcance({ patron: 'pintura', estado: ALCANCE.EXCLUIDO, fuente: 'pliego art. 4.2' }),
    entradaDeAlcance({ patron: 'pintura', estado: ALCANCE.INCLUIDO, fuente: 'mail del cliente 22/08' }),
  ]
  const r = cruzarAlcance({ partidas: [PARTIDAS[3]], alcance })
  assert.equal(r.conflictos.length, 1)
  assert.equal(r.partidas[0].estadoAlcance, ESTADO.CONFLICTO)
  assert.equal(r.partidas[0].cuentaEnElTotal, false, 'ante un conflicto de alcance no se cotiza')
  const i = r.issues.find((x) => x.type === TIPO_ISSUE.CONFLICTO)
  assert.equal(i.severity, SEVERIDAD.BLOQUEANTE)
  assert.match(i.detalle, /pliego art. 4.2/)
  assert.match(i.detalle, /mail del cliente/)
})

test('una entrada de alcance SIN FUENTE no se construye: una exclusión mueve plata', () => {
  assert.throws(() => entradaDeAlcance({ patron: 'pintura', estado: ALCANCE.EXCLUIDO }), /sin decir de dónde sale/)
  assert.throws(() => entradaDeAlcance({ patron: null, fuente: 'x' }), /sin patrón/)
  assert.throws(() => entradaDeAlcance({ patron: 'x', estado: 'TAL_VEZ', fuente: 'y' }), /estado de alcance desconocido/)
})

test('el patrón se busca en descripción, código y rubro, sin tildes', () => {
  const e = entradaDeAlcance({ patron: 'TERMINACIONES', estado: ALCANCE.EXCLUIDO, fuente: 'pliego' })
  assert.equal(alcanza(e, PARTIDAS[3]), true, 'por rubro')
  assert.equal(alcanza(e, PARTIDAS[0]), false)
  const h = entradaDeAlcance({ patron: 'hormigon', estado: ALCANCE.INCLUIDO, fuente: 'pliego' })
  assert.equal(alcanza(h, { descripcion: 'ESTRUCTURA DE HORMIGÓN ARMADO' }), true, 'la tilde no separa')
})

test('sin ninguna entrada de alcance, TODO queda POR_DEFINIR — no incluido por defecto', () => {
  // MUTACIÓN QUE LO PONE ROJO: `const estado = estados[0] ?? ALCANCE.INCLUIDO`.
  const r = cruzarAlcance({ partidas: PARTIDAS, alcance: [] })
  assert.equal(r.porDefinir, 4)
  assert.equal(r.incluidas, 0)
  assert.equal(paraCostear(r.partidas).length, 0)
})

// ═══ DE QUÉ FILA SALIÓ CADA ISSUE (03/09/2026) ═══
//
// `issuesDePartidas` ya adjuntaba `evidence.partidaId` y `cruzarAlcance` no. Consecuencia medida
// sobre COT-2026-001, 26 partidas: la pantalla une los issues del motor con los huecos de las filas
// para contar PARTIDAS por resolver, no avisos — y sin el id no podía saber que el issue de alcance
// y el hueco de la fila eran la misma partida. Publicó 52 pendientes sobre 26 partidas.
//
// El id es la clave estable. `entity` cae al código, que puede faltar (dos partidas sin código
// colisionan) y no sirve para deduplicar.
describe('todo issue que nace de una partida dice de cuál', () => {
  const fila = (id, extra = {}) => ({
    id, codigo: null, descripcion: `partida ${id}`, cantidad: 10, subtotal: 1000, ...extra,
  })

  test('el issue de POR_DEFINIR lleva su partidaId', () => {
    const { issues } = cruzarAlcance({ partidas: [fila('p1')], alcance: [] })
    const suyo = issues.filter((i) => i.type === TIPO_ISSUE.FALTA_DATO)
    assert.equal(suyo.length, 1)
    assert.equal(suyo[0].evidence?.partidaId, 'p1')
  })

  test('el issue de CONFLICTO también', () => {
    const { issues } = cruzarAlcance({
      partidas: [fila('p2', { descripcion: 'pintura' })],
      alcance: [
        { patron: 'pintura', estado: 'INCLUIDO', fuente: 'pliego' },
        { patron: 'pintura', estado: 'EXCLUIDO', fuente: 'contrato' },
      ],
    })
    const suyo = issues.filter((i) => i.type === TIPO_ISSUE.CONFLICTO)
    assert.equal(suyo.length, 1)
    assert.equal(suyo[0].evidence?.partidaId, 'p2')
  })

  test('el de EXCLUSION_CON_COMPUTO conserva la fuente Y agrega la partida', () => {
    const { issues } = cruzarAlcance({
      partidas: [fila('p3', { descripcion: 'pintura' })],
      alcance: [{ patron: 'pintura', estado: 'EXCLUIDO', fuente: 'contrato', textoLiteral: 'sin pintura' }],
    })
    const suyo = issues.filter((i) => i.type === TIPO_ISSUE.EXCLUSION_CON_COMPUTO)
    assert.equal(suyo.length, 1)
    assert.equal(suyo[0].evidence?.partidaId, 'p3')
    assert.equal(suyo[0].evidence?.fuente, 'contrato', 'la fuente no se perdió al agregar el id')
  })

  test('NINGÚN issue de esta función sale sin partida: la unión los contaría dos veces', () => {
    const { issues } = cruzarAlcance({ partidas: [fila('a'), fila('b'), fila('c')], alcance: [] })
    assert.ok(issues.length >= 3, 'el test dejó de mirar donde tenía que mirar')
    for (const i of issues) {
      assert.ok(i.evidence?.partidaId, `«${i.type}» salió sin decir de qué partida`)
    }
  })
})
