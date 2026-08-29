// LOS CASOS REALES — Quattropani, el caso ciego, y las tres formas de cotizar (§35, §36, §37).
//
// ═══ EL MANDATO ═══
//
// «Quattropani sirve para ROMPER el sistema.» Ninguna aserción de acá se escribió mirando la salida
// del motor para que coincidiera: cada una protege un comportamiento que el programa exige, y
// varias se pusieron ANTES de saber qué iba a contestar. Las que fallaron corrigieron el motor, no
// el test — están anotadas en el commit.
//
// El material es real: `orquestador/datos/conocimiento/biblioteca.json` (170 documentos ya leídos)
// y las tablas `cotizaciones` / `cotizacion_partida` / `analisis_linea` / `recurso_precio`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getPool } from '../db.mjs'
import { correr, etapa } from './orquestador.mjs'
import { leerEstado } from './pg.mjs'
import { delProyecto, exclusionesDelProyecto, issuesDeCandidatas, huecosDelProyecto, clientesDelCorpus, tramoNegado } from './corpus.mjs'
import { gateDeCongelado } from './freeze.mjs'
import { ETAPA, STATUS, TIPO_ISSUE, SEVERIDAD } from './contrato.mjs'
import { ALCANCE } from './alcance.mjs'
import {
  baseMaestraCompleta, preciosVigentes, politicaVigente, partidasDesdeDictado,
} from '../../scripts/cotizador-casos-reales.mjs'

const BIBLIOTECA = JSON.parse(readFileSync(new URL('../../datos/conocimiento/biblioteca.json', import.meta.url), 'utf8'))
const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const POR_DEFECTO = { estado: ALCANCE.INCLUIDO, fuente: 'cargada en el presupuesto COT-2026-001' }

test('cotizador · los casos reales', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const query = (s, p) => c.query(s, p)
  const uno = async (s, p) => (await c.query(s, p)).rows[0]
  try {
    await c.query('begin')
    const clientes = clientesDelCorpus(BIBLIOTECA)
    const politica = await politicaVigente(query)

    // ═══ CASO 1 · QUATTROPANI, SOBRE SU PRESUPUESTO REAL ═══
    const cot = await uno(`select id, numero from public.cotizaciones
                            where obra_nombre='Salón Comercial' and estado='borrador' limit 1`)
    assert.ok(cot, 'no está cargado el presupuesto real del Salón Comercial')
    const corpus = delProyecto(BIBLIOTECA, 'quattropani')
    const estado = await leerEstado({ query }, cot.id)
    const ex = exclusionesDelProyecto(corpus.conocimientos, { partidas: estado.partidas })
    const entrada = {
      ...estado, documentos: corpus.documentos, alcance: ex.entradas,
      politica: estado.politica ?? politica, cliente: 'FRANCO QUATTROPANI', clientesConocidos: clientes,
      issuesHeredados: [...huecosDelProyecto(corpus.huecos), ...issuesDeCandidatas(ex.candidatas)],
      alcancePorDefecto: POR_DEFECTO,
    }
    const q = correr(entrada)

    await t.test('el material real está donde se dijo: 10 documentos y 26 partidas', () => {
      assert.equal(corpus.documentos.length, 10)
      assert.equal(estado.partidas.length, 26)
      assert.equal(estado.consultas, 5, 'y se leyó en cinco consultas, no en N+1')
    })

    await t.test('PROTEGIDO · «muros» NO excluye la CAPA AISLADORA EN MUROS', () => {
      // El falso positivo medido: «No se contempla revoques ni pintura en los muros» tiene «muros»
      // como complemento locativo, y existe `T1017 CAPA AISLADORA HORIZONTAL EN MUROS`. Si el
      // extractor lo aplicara, sacaría esa partida del total sin que nadie lo notara.
      assert.equal(ex.entradas.some((e) => e.patron === 'muros'), false)
      assert.ok(ex.candidatas.some((e) => e.patron === 'muros'), 'y NO desaparece: pregunta')
      const capa = q.partidas.find((p) => /CAPA AISLADORA/i.test(p.descripcion ?? ''))
      assert.ok(capa, 'la partida T1017 tiene que estar en el presupuesto real')
      assert.equal(capa.alcance, ALCANCE.INCLUIDO)
      assert.equal(capa.cuentaEnElTotal, true)
    })

    await t.test('PROTEGIDO · entrepiso y escalera SÍ se aplican: están en los DOS contratos', () => {
      assert.deepEqual(ex.entradas.map((e) => e.patron).sort(), ['entrepiso', 'escalera'])
      for (const e of ex.entradas) {
        assert.match(e.fuente, /CONTRATO/i)
        assert.match(e.textoLiteral, /entrepiso/i)
        assert.match(e.motivo, /corroborado en 2 documento/)
      }
    })

    await t.test('PRIMERA CORRIDA REAL DEL CRUCE · el presupuesto YA respeta el contrato', () => {
      // Resultado del cruce sobre material real: no hay ninguna partida de entrepiso ni de escalera
      // en COT-2026-001. Eso no es que el motor no haya mirado —las dos exclusiones se aplicaron—:
      // es que quien armó el presupuesto respetó la cláusula. El cruce lo CONFIRMA, que es
      // exactamente para lo que sirve.
      assert.equal(q.partidas.filter((p) => p.alcance === ALCANCE.EXCLUIDO).length, 0)
      assert.equal(q.partidas.some((p) => /entrepiso|escalera/i.test(p.descripcion ?? '')), false)
      assert.equal(etapa(q, ETAPA.SCOPE).result.excluidas, 0)
      assert.equal(etapa(q, ETAPA.SCOPE).result.incluidas, 26)
    })

    await t.test('PROTEGIDO · las DOS versiones contractuales llegan como CONFLICTO VIVO', () => {
      // §31: los conflictos se mantienen y sólo evidencia o autoridad los cierra. El motor lo
      // HEREDA con su dueño y NO lo resuelve ni le baja la severidad.
      // Se mira en `bloqueantes`, no en `issues`: la cola RECALCULA la severidad, así que
      // comprobarla sobre el issue de origen no prueba que bloquee — mutar la severidad de origen
      // salía verde. Lo que importa es que el conflicto esté del lado que frena el congelado.
      const conf = q.cola.bloqueantes.filter((i) => i.type === TIPO_ISSUE.CONFLICTO)
      assert.ok(conf.length >= 1, 'el conflicto de las dos versiones del contrato tiene que BLOQUEAR')
      assert.equal(conf[0].severity, SEVERIDAD.BLOQUEANTE)
      assert.equal(conf[0].bloquea, true)
      assert.ok(q.gate.blocking_issues.some((b) => b.tipo === 'CONFLICTO'),
        'y tiene que aparecer en el gate, que es lo que impide congelar')
      assert.match(conf[0].detalle, /dos versiones del mismo documento/)
      assert.match(conf[0].detalle, /lo resuelve: el dueño/)
      assert.equal(conf[0].recommended_action, null, 'no hay botón que cierre un conflicto contractual')
      assert.equal(q.gate.ready, false)
    })

    await t.test('PROTEGIDO · SIN_PRECIO ≠ 0 sobre datos reales: el costo directo NO se afirma', () => {
      // Tres recursos del presupuesto real no tienen ninguna observación de precio. El motor NO
      // publica el costo de los otros 107 con cara de completo.
      assert.equal(q.costoDirecto.total, null)
      assert.ok(q.costoDirecto.parcial > 70_000_000, `el parcial dio ${q.costoDirecto.parcial}`)
      assert.notEqual(q.costoDirecto.total, q.costoDirecto.parcial)
      assert.equal(q.cascada.ventaSinIva, null, 'y sin costo no hay precio')
      assert.equal(q.explosion.nSinPrecio, 3)
      const sp = q.cola.issues.filter((i) => i.type === TIPO_ISSUE.SIN_PRECIO)
      assert.equal(sp.length, 3)
      // El issue dice el NOMBRE, no sólo el código: 400 recursos tienen código numérico.
      assert.ok(sp.every((i) => /\(.+\)/.test(i.entity)), sp.map((i) => i.entity).join(' · '))
    })

    await t.test('PROTEGIDO · los precios vencidos se cuentan y NO se confunden con faltantes', () => {
      const m = q.metricas
      assert.ok(m.precios_vencidos > 0, 'el presupuesto real tiene precios de más de 180 días')
      assert.equal(m.precios_faltantes, 3)
      assert.notEqual(m.precios_vencidos, m.precios_faltantes)
      assert.ok(m.precios_vigentes > m.precios_vencidos)
    })

    await t.test('PROTEGIDO · las HH salen de las composiciones reales y no son cero', () => {
      assert.ok(q.costoDirecto.hh > 3_000, `dio ${q.costoDirecto.hh} h`)
      assert.ok(q.explosion.hhPorCategoria.length > 0)
      assert.ok(q.explosion.hhPorCategoria.every((h) => h.horas > 0))
    })

    await t.test('CLAUDE-ZERO sobre el caso REAL · cero llamadas al modelo (§34)', () => {
      assert.equal(q.metricas.llamadas_llm, 0)
      assert.equal(q.metricas.claude_avoidance_rate, 1)
      assert.equal(q.etapas.length, 11)
      assert.equal(q.ordenCorrecto, true)
      assert.equal(etapa(q, ETAPA.COST).status, STATUS.BLOQUEADA)
    })

    await t.test('REPRODUCIBILIDAD sobre el caso REAL · RUN1 = RUN2 (§39)', () => {
      const dos = correr(entrada)
      assert.equal(q.huella.sha256, dos.huella.sha256)
      assert.equal(q.costoDirecto.parcial, dos.costoDirecto.parcial)
      assert.deepEqual(q.cola.bloqueantes.map((i) => i.entity), dos.cola.bloqueantes.map((i) => i.entity))
    })

    await t.test('la huella del caso REAL se guarda en cotizacion_huella y se relee', async () => {
      const dir = await uno(`select id from public.perfiles where rol='direccion' limit 1`)
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: dir.id, role: 'authenticated' })])
      await c.query('set local role authenticated')
      await c.query(`insert into public.cotizacion_huella (cotizacion_id, version, sha256, partes, resumen)
                     values ($1, 42, $2, $3::jsonb, $4)`,
      [cot.id, q.huella.sha256, JSON.stringify(q.huella.partes), q.huella.resumen])
      await c.query('reset role')
      const h = await uno(`select sha256, resumen from public.cotizacion_huella where cotizacion_id=$1 and version=42`, [cot.id])
      assert.equal(h.sha256, q.huella.sha256)
      assert.match(h.resumen, /26 partidas/)
    })

    // ═══ MENOR 4 · EL GATE DE SQL Y EL DE JS TIENEN QUE COINCIDIR ═══
    await t.test('EL VIGILANTE · cot_gate_congelado (SQL) y gateDeCongelado (JS) dicen lo mismo', async () => {
      // Dos implementaciones del mismo gate sin nada que las compare es la receta del día siguiente.
      // No se comparan issue por issue —miran fuentes distintas— sino la DECISIÓN y los TIPOS.
      const sql = (await uno(`select public.cot_gate_congelado($1) g`, [cot.id])).g
      const js = gateDeCongelado({ cascada: q.cascada, cola: q.cola })
      assert.equal(sql.ready, js.ready, `SQL dice ready=${sql.ready} y JS dice ready=${js.ready}`)
      const tiposSql = new Set(sql.blocking_issues.map((b) => b.tipo))
      const tiposJs = new Set(js.blocking_issues.map((b) => b.tipo))
      assert.ok(tiposSql.has('SIN_PRECIO_CALCULABLE') === tiposJs.has('SIN_PRECIO_CALCULABLE'),
        `SIN_PRECIO_CALCULABLE: SQL ${tiposSql.has('SIN_PRECIO_CALCULABLE')} vs JS ${tiposJs.has('SIN_PRECIO_CALCULABLE')}`)
      // Y el vigilante tiene que poder dar ROJO: con un subcontrato sin precio, los DOS bloquean.
      await c.query(`insert into public.cotizacion_partida (cotizacion_id, orden, codigo, descripcion, cantidad, unidad, subcontratada)
                     values ($1, 99, 'ZZ-SUB', 'ZZ subcontrato sin precio', 1, 'un', true)`, [cot.id])
      const sql2 = (await uno(`select public.cot_gate_congelado($1) g`, [cot.id])).g
      const estado2 = await leerEstado({ query }, cot.id)
      const q2 = correr({ ...entrada, ...estado2, documentos: corpus.documentos, alcance: ex.entradas, alcancePorDefecto: POR_DEFECTO })
      const js2 = gateDeCongelado({ cascada: q2.cascada, cola: q2.cola })
      assert.equal(sql2.ready, false)
      assert.equal(js2.ready, false)
      assert.ok(sql2.blocking_issues.some((b) => b.tipo === 'SUBCONTRATO_SIN_PRECIO'))
      assert.ok(q2.cola.bloqueantes.some((i) => i.type === TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO),
        'el JS también tiene que ver el subcontrato sin precio')
      await c.query(`delete from public.cotizacion_partida where cotizacion_id=$1 and codigo='ZZ-SUB'`, [cot.id])
    })

    // ═══ MENOR 5 · LA FUGA AMPLIADA ═══
    await t.test('el barrido de fuga mira las CITAS DE EVIDENCIA y las FUENTES DE PRECIO', () => {
      const conFuga = correr({
        ...entrada,
        partidas: entrada.partidas.map((p, i) => (i === 0
          ? { ...p, evidencia: { archivo: 'Plano.pdf', textoLiteral: 'mismo detalle que en la obra de GRUPO NATANIA' } }
          : p)),
      })
      assert.equal(conFuga.gate.ready, false)
      assert.ok(conFuga.gate.blocking_issues.some((b) => b.tipo === 'FUGA_ENTRE_CLIENTES'),
        JSON.stringify(conFuga.gate.blocking_issues.map((b) => b.tipo)))
      assert.ok(conFuga.fuga.materiales.some((h) => h.lugar === 'CONTENIDO' && /evidencia/.test(h.origen)))
      // Y las fuentes de precio se revisan como METADATO interno: no bloquean, pero se ven.
      assert.ok(q.fuga.clientesRevisados > 10, `revisó ${q.fuga.clientesRevisados} clientes`)
    })

    // ═══ CASO 2 · CIEGO · LA ESTRELLA ═══
    await t.test('CASO CIEGO · LA ESTRELLA corre con el MISMO motor y cero ajustes (§36)', async () => {
      const bm = await baseMaestraCompleta(query)
      const precios = await preciosVigentes(query)
      const corpusE = delProyecto(BIBLIOTECA, 'estrella')
      assert.ok(corpusE.documentos.length >= 10, `sólo ${corpusE.documentos.length} documentos`)
      const map = partidasDesdeDictado([
        { que: 'MAMPOSTERÍA LADRILLON CERÁMICO', unidad: 'm2', cantidad: 340, sistema: 'mamposteria' },
        { que: 'PISO DE HORMIGON ALISADO MECÁNICO', unidad: 'm2', cantidad: 180, sistema: 'piso' },
        { que: 'REPLANTEO', unidad: 'm2', cantidad: 420, sistema: 'movimiento_suelo' },
      ], bm.tareas, bm.composiciones)
      const e = correr({
        documentos: corpusE.documentos, partidas: map.partidas, observaciones: precios,
        alcance: [], politica, cliente: 'LA ESTRELLA', clientesConocidos: clientes,
        issuesHeredados: huecosDelProyecto(corpusE.huecos),
        alcancePorDefecto: { estado: ALCANCE.INCLUIDO, fuente: 'dictado del jefe de obra' },
      })
      assert.equal(e.metricas.llamadas_llm, 0, 'el caso ciego tampoco llama al modelo')
      assert.equal(e.etapas.length, 11)
      assert.equal(e.reconciliacion.cuadra, true, e.reconciliacion.porQue)
      assert.equal(e.cascada.coeficienteSinIva, 1.681968, 'el mismo coeficiente de la empresa')
      // El motor NO mapeó lo que no podía mapear, y eso es el resultado, no una falla del caso.
      assert.equal(map.mapeadas, 1)
      assert.equal(map.sinMapear.length, 2)
    })

    // ═══ CASO 3 · LAS TRES FORMAS ═══
    await t.test('DOC INCOMPLETA bloquea MENOS que la completa: la documentación REVELA bloqueos', () => {
      // Contraintuitivo y medido: sacarle el contrato al mismo presupuesto baja los bloqueos de 7 a
      // 4, porque desaparecen el conflicto de versiones y las dos exclusiones ambiguas. Menos
      // documentación no es menos riesgo: es menos riesgo VISTO.
      const inc = correr({
        ...estado, documentos: corpus.documentos.slice(0, 2), alcance: [],
        politica: estado.politica ?? politica, cliente: 'FRANCO QUATTROPANI', clientesConocidos: clientes,
        alcancePorDefecto: POR_DEFECTO,
      })
      assert.ok(inc.gate.blocking_issues.length < q.gate.blocking_issues.length,
        `incompleta ${inc.gate.blocking_issues.length} vs completa ${q.gate.blocking_issues.length}`)
      assert.equal(inc.cola.issues.filter((i) => i.type === TIPO_ISSUE.CONFLICTO).length, 0)
      // Y el costo sigue sin afirmarse: los tres recursos sin precio no dependen del contrato.
      assert.equal(inc.costoDirecto.total, null)
    })

    await t.test('CÓMPUTO MANUAL SIN PLANOS · la cerradura del espesor funciona sobre el dictado', async () => {
      // Es la protección aprendida de Quattropani, medida en $29,6 M: el plano decía «Platea
      // s/Cálculo» y el matcheo eligió «PLATEA DE HORMIGON - 50CM». Acá el dueño dicta
      // «mampostería 520 m²» sin espesor y T1018 exige «e = 0,20 m»: NO se elige, se pregunta.
      const bm = await baseMaestraCompleta(query)
      const map = partidasDesdeDictado([
        { que: 'MAMPOSTERÍA LADRILLON CERÁMICO', unidad: 'm2', cantidad: 520, sistema: 'mamposteria' },
        { que: 'PISO DE HORMIGON ALISADO MECÁNICO', unidad: 'm2', cantidad: 300, sistema: 'piso' },
      ], bm.tareas, bm.composiciones)
      const mamp = map.sinMapear.find((x) => /MAMPOSTER/i.test(x.que))
      assert.ok(mamp, 'la mampostería sin espesor NO puede haber mapeado sola')
      assert.match(mamp.porQue, /exige un atributo que el plano no demuestra: espesor/)
      assert.match(mamp.porQue, /La respuesta correcta acá es la pregunta, no un precio que lo supone/)
      // Y el piso queda AMBIGUO entre la mitad de mano de obra y la de materiales: dos opciones.
      const piso = map.sinMapear.find((x) => /PISO/i.test(x.que))
      assert.equal(piso.estado, 'AMBIGUO')
      assert.match(piso.porQue, /son dos opciones, no una/)
      assert.equal(map.mapeadas, 0, 'un dictado de dos renglones sin más datos NO produce presupuesto')
    })

    await t.test('el alcance POR DEFECTO exige fuente: decir «todo incluido» es una afirmación', () => {
      // MUTACIÓN QUE LO PONE ROJO: en `cruzarAlcance`, sacar la guarda de `porDefecto.fuente`.
      //
      // Sobre el caso real, el default mueve 26 partidas de POR_DEFINIR a INCLUIDO y con eso el
      // presupuesto pasa de no costear nada a costear $79,5 M. Un movimiento de esa escala no puede
      // entrar sin decir quién lo afirma.
      assert.throws(
        () => correr({ ...entrada, alcancePorDefecto: { estado: ALCANCE.INCLUIDO } }),
        /exige fuente/)
      const sinDefault = correr({ ...entrada, alcancePorDefecto: null })
      assert.equal(sinDefault.partidas.filter((p) => p.alcance === ALCANCE.POR_DEFINIR).length, 26,
        'sin el default declarado, las 26 quedan sin decidir y NO se cotizan')
      assert.equal(sinDefault.costos.length, 0)
    })

    await t.test('el extractor de exclusiones lee las DOS formas de negar', () => {
      // La corrida sobre el contrato real destapó que «X queda excluido» pone lo negado ANTES de la
      // marca, y la primera versión leía el complemento.
      assert.deepEqual(tramoNegado('No se contempla entrepiso ni escalera.'), 'entrepiso ni escalera')
      assert.match(tramoNegado('Se ratifica que las estructuras del entrepiso y su escalera metálica quedan completamente excluidas de los trabajos'), /entrepiso/)
      assert.equal(tramoNegado('El contratista ejecutará la mampostería'), null)
    })
  } finally {
    await c.query('reset role').catch(() => {})
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
