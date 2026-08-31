// LA MEMORIA DE LAS DECISIONES, CONTRA LA BASE VIVA. Escribe de verdad y deshace con ROLLBACK.
//
// Lo que se prueba acá NO se puede probar con un fixture: que la segunda corrida no vuelva a
// preguntar depende de que la fila esté REALMENTE en Postgres, la lea REALMENTE la consulta con su
// índice, y que la clave sea la que dice ser. Un doble en memoria contestaría que sí a todo.
//
// Y lo que prueba la escritura es la fila releída, nunca el `insert` que no explotó. Este repo ya
// pagó esa lección con los 204 de PostgREST.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { seleccionar } from './plano/seleccion.mjs'
import { preguntaParaCerrar, huellaDePregunta, claveDeElemento } from './base-maestra-pregunta.mjs'
import { paresComplementarios } from './base-maestra-completitud.mjs'
import { resolverConMemoria, contestarYGuardar, decisionVigente, historialDeElemento, RESOLUCION } from './base-maestra-decision.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

// Un uuid fijo: `auth.uid()` es null en una conexión directa, y `decidido_por` es NOT NULL.
const QUIEN = '00000000-0000-4000-8000-0000000000aa'

const T1018 = { id: 'a', codigo: 'T1018', nombre: 'MAMPOSTERÍA LADRILLON CERÁMICO e = 0,20 m', unidad: 'M2' }
const T1019 = { id: 'b', codigo: 'T1019', nombre: 'MAMPOSTERÍA DE BLOCK DE HORMIGON', unidad: 'M2' }
const T1107_1 = { id: 'c', codigo: 'T1107.1', nombre: 'PISO DE HORMIGON ALISADO MECÁNICO - MANO DE OBRA', unidad: 'M2' }
const T1107_2 = { id: 'd', codigo: 'T1107.2', nombre: 'PISO DE HORMIGON ALISADO MECÁNICO - MATERIALES H17, 15cm y #6 15-15', unidad: 'M2' }
const COSTOS = { T1018: 39332, T1019: 38000, 'T1107.1': 17550.9, 'T1107.2': 28939.5 }

/** Un mapeo abierto tal como sale de `seleccionarTodas` — con el cómputo pegado. */
const mapeoDe = (nombre, unidad, catalogo, cantidad = 520) => {
  const computo = { id: 'X-1', nombre, unidad, cantidad: { valor: cantidad } }
  return { computo, ...seleccionar(computo, catalogo) }
}

/** Todo dentro de una transacción que termina en ROLLBACK: se escribe de verdad y no queda nada. */
async function enEnsayo(fn) {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    return await fn({ query: (s, p) => c.query(s, p) })
  } finally {
    await c.query('rollback')
    c.release()
  }
}

test('LA SEGUNDA CORRIDA NO VUELVE A PREGUNTAR — leído en destino', { skip: !hayBase }, async () => {
  await enEnsayo(async (db) => {
    const catalogo = [T1018, T1019]
    const m = mapeoDe('MAMPOSTERÍA LADRILLON CERÁMICO', 'M2', catalogo)

    // ── CORRIDA 1 ──
    const a = await resolverConMemoria(db, m, { costos: COSTOS })
    assert.equal(a.resolucion, RESOLUCION.HAY_QUE_PREGUNTAR)
    assert.equal(a.pregunta.atributo, 'espesor_m')

    const guardado = await contestarYGuardar(db, a.pregunta, 'T1018', { quien: QUIEN })
    assert.equal(guardado.ok, true)

    // EL EFECTO, NO EL INTENTO: la fila releída de Postgres, con su decidido_en puesto por la base.
    assert.ok(guardado.guardada?.id, 'sin fila releída no hay evidencia de que se escribió')
    assert.equal(guardado.guardada.elemento, 'mamposteria ladrillon ceramico')
    assert.deepEqual(guardado.guardada.codigos, ['T1018'])
    assert.equal(guardado.guardada.decidido_por, QUIEN)
    assert.ok(guardado.guardada.decidido_en, 'la fecha la pone la base, no el proceso')

    // Y una lectura INDEPENDIENTE de la que escribió — no se le cree al returning solo.
    const enDestino = await db.query('select respuesta, huella, codigos from public.base_maestra_decision where id = $1', [guardado.guardada.id])
    assert.equal(enDestino.rows.length, 1)
    assert.equal(enDestino.rows[0].respuesta, 'T1018')

    // ── CORRIDA 2 · el mismo elemento, en otra obra (otra cantidad, otro id de cómputo) ──
    const b = await resolverConMemoria(db, mapeoDe('MAMPOSTERÍA LADRILLON CERÁMICO', 'M2', catalogo, 340), { costos: COSTOS })
    assert.equal(b.resolucion, RESOLUCION.CERRADO_POR_DECISION_PREVIA, 'ésta es la limitación que había que cerrar')
    assert.deepEqual(b.resultado.codigos, ['T1018'])
    assert.equal(b.resultado.reusada, true)
    assert.match(b.porQue, /ya contestó esta misma pregunta/)
  })
})

test('UNA DECISIÓN VIEJA NO CIERRA UNA PREGUNTA NUEVA', { skip: !hayBase }, async () => {
  await enEnsayo(async (db) => {
    const catalogo = [T1018, T1019]
    const m = mapeoDe('MAMPOSTERÍA LADRILLON CERÁMICO', 'M2', catalogo)
    const p1 = (await resolverConMemoria(db, m, { costos: COSTOS })).pregunta
    await contestarYGuardar(db, p1, 'T1018', { quien: QUIEN })

    // Entra al catálogo una mampostería de ladrillón a 0,15. Ahora hay DOS espesores posibles: la
    // pregunta ya no es «¿es 0,20?», es «¿cuál de los dos?». Nadie contestó ESA.
    const T1018b = { id: 'e', codigo: 'T1018B', nombre: 'MAMPOSTERÍA LADRILLON CERÁMICO e = 0,15 m', unidad: 'M2' }
    const conNueva = [T1018, T1019, T1018b]
    const p2 = preguntaParaCerrar(mapeoDe('MAMPOSTERÍA LADRILLON CERÁMICO', 'M2', conNueva), { costos: { ...COSTOS, T1018B: 31000 } })
    assert.notEqual(huellaDePregunta(p1), huellaDePregunta(p2), 'otra opción sobre la mesa es otra pregunta')

    const r = await resolverConMemoria(db, mapeoDe('MAMPOSTERÍA LADRILLON CERÁMICO', 'M2', conNueva), { costos: { ...COSTOS, T1018B: 31000 } })
    assert.equal(r.resolucion, RESOLUCION.HAY_QUE_PREGUNTAR,
      'cerrar con la respuesta vieja sería poner en boca de alguien una decisión que no tomó — y firmada con su uuid')
    assert.equal(r.decisionPrevia, null)

    // La decisión vieja NO se borró: sigue ahí, para su propia pregunta.
    assert.equal((await historialDeElemento(db, 'MAMPOSTERÍA LADRILLON CERÁMICO')).length, 1)
  })
})

test('la huella distingue el TIPO de pregunta, no sólo los códigos', { skip: !hayBase }, async () => {
  await enEnsayo(async (db) => {
    const pares = paresComplementarios([T1107_1, T1107_2])
    const m = mapeoDe('PISO DE HORMIGON ALISADO MECÁNICO', 'M2', [T1107_1, T1107_2], 300)
    const a = await resolverConMemoria(db, m, { costos: COSTOS, paresComplementarios: pares })
    assert.equal(a.pregunta.tipo, 'VAN_JUNTAS')
    await contestarYGuardar(db, a.pregunta, 'JUNTAS', { quien: QUIEN })

    const b = await resolverConMemoria(db, m, { costos: COSTOS, paresComplementarios: pares })
    assert.equal(b.resolucion, RESOLUCION.CERRADO_POR_DECISION_PREVIA)
    assert.deepEqual(b.resultado.codigos, ['T1107.1', 'T1107.2'], 'las dos mitades, no una')

    // El MISMO elemento y los MISMOS códigos, pero sin conocer que son complementarias: el motor
    // preguntaría CUAL_DE_ESTAS, que es otra pregunta. La respuesta «JUNTAS» no la contesta.
    const sinPares = await resolverConMemoria(db, m, { costos: COSTOS, paresComplementarios: [] })
    assert.equal(sinPares.pregunta.tipo, 'CUAL_DE_ESTAS')
    assert.equal(sinPares.resolucion, RESOLUCION.HAY_QUE_PREGUNTAR)
  })
})

test('la respuesta guardada se vuelve a validar contra las opciones de HOY', { skip: !hayBase }, async () => {
  await enEnsayo(async (db) => {
    const m = mapeoDe('PISO DE HORMIGON ALISADO MECÁNICO', 'M2', [T1107_1, T1107_2], 300)
    const pares = paresComplementarios([T1107_1, T1107_2])
    const p = (await resolverConMemoria(db, m, { costos: COSTOS, paresComplementarios: pares })).pregunta

    // Se fuerza en la base una respuesta que YA NO es una opción, conservando la huella. Es el caso
    // de una partida dada de baja del catálogo después de que alguien la eligiera.
    await db.query(
      `insert into public.base_maestra_decision (elemento, unidad, tipo_pregunta, pregunta, respuesta, codigos, huella, decidido_por)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [claveDeElemento('PISO DE HORMIGON ALISADO MECÁNICO'), 'M2', p.tipo, p.pregunta, 'T9999', ['T9999'], huellaDePregunta(p), QUIEN],
    )
    const r = await resolverConMemoria(db, m, { costos: COSTOS, paresComplementarios: pares })
    assert.equal(r.resolucion, RESOLUCION.HAY_QUE_PREGUNTAR, 'el segundo candado: la huella coincidió y la respuesta ya no existe')
    assert.ok(r.decisionPrevia, 'y se dice cuál era, en vez de hacer de cuenta que no había nada')
    assert.match(r.porQue, /ya no es una de las opciones/)
  })
})

test('la base RECHAZA una decisión sin huella — el CHECK puede decir que no', { skip: !hayBase }, async () => {
  await enEnsayo(async (db) => {
    await assert.rejects(
      () => db.query(
        `insert into public.base_maestra_decision (elemento, unidad, tipo_pregunta, pregunta, respuesta, codigos, huella, decidido_por)
         values ('x','M2','ATRIBUTO','¿?','T1','{T1}','',$1)`, [QUIEN]),
      /base_maestra_decision_huella_presente/,
      'una fila sin huella no se puede reusar ni auditar: no entra',
    )
  })
})

test('la tabla es append-only: la segunda decisión no pisa a la primera, y gana la última', { skip: !hayBase }, async () => {
  await enEnsayo(async (db) => {
    const catalogo = [T1018, T1019]
    const m = mapeoDe('MAMPOSTERÍA LADRILLON CERÁMICO', 'M2', catalogo)
    const p = (await resolverConMemoria(db, m, { costos: COSTOS })).pregunta
    await contestarYGuardar(db, p, 'T1018', { quien: QUIEN })
    await db.query('select pg_sleep(0.01)')
    await contestarYGuardar(db, p, 'NO_HAY_ANALISIS', { quien: QUIEN })

    assert.equal((await historialDeElemento(db, 'MAMPOSTERÍA LADRILLON CERÁMICO')).length, 2,
      'que alguien haya cambiado de opinión es información, no un error que corregir')
    const v = await decisionVigente(db, { elemento: 'MAMPOSTERÍA LADRILLON CERÁMICO', unidad: 'M2', huella: huellaDePregunta(p) })
    assert.equal(v.respuesta, 'NO_HAY_ANALISIS', 'gana la última por decidido_en')
  })
})

test('no se guarda una respuesta que no cerró nada', { skip: !hayBase }, async () => {
  await enEnsayo(async (db) => {
    const m = mapeoDe('MAMPOSTERÍA LADRILLON CERÁMICO', 'M2', [T1018, T1019])
    const p = (await resolverConMemoria(db, m, { costos: COSTOS })).pregunta
    const r = await contestarYGuardar(db, p, 'creo que era el de 20', { quien: QUIEN })
    assert.equal(r.ok, false)
    assert.equal(r.guardada, null)
    assert.equal((await historialDeElemento(db, 'MAMPOSTERÍA LADRILLON CERÁMICO')).length, 0)
  })
})

// NO se cierra el pool acá. `getPool()` es COMPARTIDO, y cuando `node --test` corre varios archivos
// juntos un `end()` en uno le arranca las conexiones a los otros: medido contra
// `base-maestra-metalica.pg.test.mjs`, que pasaba solo y fallaba entero al correr en la misma
// invocación. Ninguno de los `.pg.test.mjs` del repo lo cierra, por esto mismo.
