// LA CADENA DEL LOST UPDATE, BLINDADA — planDe → esperado → base → cero filas → CONFLICTO → relectura.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE (auditoría delta, vuelta 2) ═══
//
// El arreglo del lost update estaba CORRECTO y DESPROTEGIDO. El auditor mutó las tres piezas —borrar
// `esperado` del plan, matar la relectura, matar el aviso de cero filas— y las tres quedaron VERDES
// con 540 tests. `concurrencia.pg.test.mjs` probaba que SQL se comporta como SQL; nadie probaba que
// esta capa lo usara.
//
// Es la misma clase de agujero que la key de la cola: un arreglo sin test es un arreglo que el
// próximo refactor borra en silencio. Acá se ejercita la cadena COMPLETA, y el eslabón que toca la
// base lo toca de verdad.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  planDe, predicadoDe, exigePredicado, veredictoDeEscritura, describir,
  type Plan, type PlanEscritura,
} from './conversacionPlan.ts'
import { conversar, estadoDesdeFilas } from './cotizadorPuente.ts'
import { paraElMotor } from './conversacionPlan.ts'
import type { PartidaValorizada, PresupuestoCascada } from '../types/index.ts'
import { getPool } from '../../../../orquestador/lib/db.mjs'

const COT = '11111111-1111-1111-1111-111111111111'

const PRESUPUESTO = {
  id: COT, numero: 'TEST-LU', version: 1,
  pct_gastos_generales: 0.27, pct_beneficio: 0.15, pct_financiero: 0.02, factor_financiero: 0.5,
  pct_iibb: 0.035, pct_ganancias: 0.015, pct_cheque: 0.012, pct_iva: 0.21,
  costo_directo: 12000000, venta_sin_iva: 20160000,
} as unknown as PresupuestoCascada

const PARTIDA = {
  partida_id: 'aaa', cotizacion_id: COT, orden: 1, rubro: 'Albanileria',
  codigo: '01.01', descripcion: 'Mamposteria de ladrillo hueco', cantidad: 480, unidad: 'm2',
  tarea_tipo_id: null, analisis_id: null, metodo_medicion: null, subcontratada: false,
  precio_subcontrato: null, congelada: false, costo_unitario: 25000, hs_unitarias: 1,
  subtotal: 12000000, hh: 480, sin_analisis: false,
} as PartidaValorizada

/** Corre un turno igual que la server action y devuelve el plan que salió del MOTOR, no uno a mano. */
async function planDeFrase(texto: string): Promise<Plan | null> {
  const lista = [PARTIDA]
  const estado = estadoDesdeFilas({ presupuesto: PRESUPUESTO, partidas: lista })
  const caja: { plan: Plan | null } = { plan: null }
  await conversar({
    texto, rol: 'DUENO', actor: 'test', usarModelo: false, confirmado: true,
    estado: { ...estado, partidas: paraElMotor(lista) },
    mutar: ({ intent, validado }) => { caja.plan = planDe(intent, validado, COT); return estado },
  })
  return caja.plan
}

describe('1 · el plan EMITE el predicado con el valor que se leyó', () => {
  test('«la mamposteria son 520 m2» defiende la cantidad anterior, no la nueva', async () => {
    const p = await planDeFrase('la mamposteria son 520 m2')
    assert.ok(p?.ok, 'el motor no produjo plan')
    // MUTACIÓN QUE LO PONE ROJO: sacar `esperado` de `planDe`. Es la primera de las tres que el
    // auditor corrió en verde.
    assert.deepEqual(p.plan.esperado, { cantidad: 480 }, 'el plan no defiende el valor que leyó')
    assert.notDeepEqual(p.plan.esperado, { cantidad: 520 }, 'defiende el valor NUEVO: no protege nada')
  })

  test('«beneficio 19%» defiende el porcentaje anterior', async () => {
    const p = await planDeFrase('beneficio 19%')
    assert.ok(p?.ok)
    assert.deepEqual(p.plan.esperado, { pct_beneficio: 0.15 })
  })

  test('todo plan de UPDATE trae predicado; el upsert declarativo NO', async () => {
    for (const frase of ['la mamposteria son 520 m2', 'beneficio 19%']) {
      const p = await planDeFrase(frase)
      assert.ok(p?.ok)
      assert.equal(exigePredicado(p.plan), true)
      assert.ok(predicadoDe(p.plan).length > 0, `«${frase}» produce un UPDATE sin predicado: eso es el lost update`)
    }
    const alcance = await planDeFrase('saca la mamposteria')
    assert.ok(alcance?.ok)
    assert.equal(exigePredicado(alcance.plan), false)
    assert.deepEqual(predicadoDe(alcance.plan), [], 'el upsert declarativo no debe llevar predicado')
  })

  test('un valor previo NULL se defiende con `is`, nunca con `eq`', () => {
    const cond = predicadoDe({ tabla: 'cotizacion_partida', operacion: 'update', id: 'x', esperado: { precio_subcontrato: null }, columnas: {}, detalle: '' })
    assert.deepEqual(cond, [{ columna: 'precio_subcontrato', valor: null, operador: 'is' }])
  })
})

/** El `await` de nivel de módulo no entra dentro de un `describe`: se resuelve una vez, acá. */
const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

describe('2 · contra la BASE: el predicado del plan frena la carrera', () => {
  test('A pierde su cambio contra B, y el plan de A afecta CERO filas', { skip: !hayBase }, async () => {
    const c = await getPool().connect()
    await c.query('begin')
    try {
      const { rows: [cot] } = await c.query(`insert into public.cotizaciones (numero, version, vigente, estado, obra_nombre)
        values ('TEST-LU-' || substr(gen_random_uuid()::text, 1, 8), 1, false, 'borrador', 'Carrera') returning id`)
      const { rows: [fila] } = await c.query(`insert into public.cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad)
        values ($1, 1, 'Mamposteria', 480, 'm2') returning id`, [cot.id])

      // EL PLAN SALE DEL MOTOR, no se escribe a mano: eso es lo que estaba sin cubrir.
      const p = await planDeFrase('la mamposteria son 520 m2')
      assert.ok(p?.ok)

      // B mueve la fila mientras A escribe.
      await c.query('update public.cotizacion_partida set cantidad = 1200 where id = $1', [fila.id])

      // A aplica su plan, traducido a SQL con el MISMO predicado que la action manda a PostgREST.
      const cond = predicadoDe(p.plan)
      const donde = cond.map((x, i) => `${x.columna} ${x.operador === 'is' ? 'is null' : `= $${i + 2}`}`).join(' and ')
      const args = [fila.id, ...cond.filter((x) => x.operador === 'eq').map((x) => x.valor)]
      const r = await c.query(`update public.cotizacion_partida set cantidad = ${Number(p.plan.columnas.cantidad)} where id = $1 and ${donde}`, args)
      assert.equal(r.rowCount, 0, 'el plan del motor pisó el cambio de B')

      // ── 3 · CERO FILAS ⇒ CONFLICTO, con los DOS valores, leyendo el destino.
      const { rows: [quedo] } = await c.query('select cantidad from public.cotizacion_partida where id = $1', [fila.id])
      const v = veredictoDeEscritura({ plan: p.plan, filasTocadas: r.rowCount, quedo })
      assert.equal(v.tipo, 'CONFLICTO', 'cero filas se dio por «Aplicado»')
      assert.deepEqual(v.esperado, { cantidad: 480 })
      assert.equal(Number((v.actual as { cantidad: unknown }).cantidad), 1200)
      // Y el mensaje nombra los dos: sin eso, «volvé a intentar» no explica nada.
      assert.match(describir(v.esperado), /480/)
      assert.match(describir(v.actual), /1200/)
    } finally {
      await c.query('rollback')
      c.release()
    }
  })
})

describe('3 · la relectura del destino, y el aviso de cero filas', () => {
  const plan: PlanEscritura = {
    tabla: 'cotizacion_partida', operacion: 'update', id: 'aaa',
    esperado: { cantidad: 480 }, columnas: { cantidad: 520 }, detalle: '',
  }

  test('cero filas NUNCA es «Aplicado»', () => {
    // MUTACIÓN QUE LO PONE ROJO: la tercera del auditor — quitar el aviso de cero filas.
    assert.equal(veredictoDeEscritura({ plan, filasTocadas: 0, quedo: { cantidad: 1200 } }).tipo, 'CONFLICTO')
    assert.equal(veredictoDeEscritura({ plan, filasTocadas: 0, quedo: null }).tipo, 'CONFLICTO')
  })

  test('una fila tocada pero un valor distinto en el destino es DESAJUSTE, no éxito', () => {
    // MUTACIÓN QUE LO PONE ROJO: la segunda del auditor — matar la relectura. Un trigger que pisa
    // el valor, o un `numeric` que redondea, salían como «Aplicado».
    const v = veredictoDeEscritura({ plan, filasTocadas: 1, quedo: { cantidad: 999 } })
    assert.equal(v.tipo, 'DESAJUSTE')
    assert.deepEqual((v as { pedido: unknown }).pedido, { cantidad: 520 })
  })

  test('el numeric que PostgREST manda como STRING no se lee como desajuste', () => {
    // `520` no es `'520'`. Sin la comparación por texto, TODA escritura de un numeric se habría
    // reportado como desajuste y la conversación no habría podido aplicar nada.
    assert.equal(veredictoDeEscritura({ plan, filasTocadas: 1, quedo: { cantidad: '520' } }).tipo, 'APLICADO')
  })

  test('y cuando todo salió bien, dice APLICADO', () => {
    assert.equal(veredictoDeEscritura({ plan, filasTocadas: 1, quedo: { cantidad: 520 } }).tipo, 'APLICADO')
  })
})
