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
  const filas = async (sq, pa) => (await c.query(sq, pa)).rows
  const UID = {}
  const como = async (uid) => {
    await c.query('reset role')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
    await c.query('set local role authenticated')
  }
  const comoDios = async () => { await c.query('reset role') }
  /** Un intento que TIENE que fallar, sin llevarse la transacción puesta. */
  const rechaza = async (sql, params, re, mensaje) => {
    await c.query('savepoint intento')
    let error = null
    try { await c.query(sql, params) } catch (e) { error = e }
    if (error) await c.query('rollback to savepoint intento'); else await c.query('release savepoint intento')
    assert.ok(error, mensaje ?? `la base ACEPTÓ lo que tenía que rechazar`)
    assert.match(String(error.message), re, `rechazó por el motivo equivocado: ${error.message}`)
  }
  try {
    await c.query('begin')
    const dirP = await uno(`select id from public.perfiles where rol='direccion' order by id limit 1`)
    const jefesP = await filas(`select id from public.perfiles where rol='jefe_obra' order by id limit 2`)
    UID.direccion = dirP.id
    UID.jefe = jefesP[0].id
    // El rol `administracion` no existe en ningún perfil real: se promueve DENTRO de la transacción
    // y el rollback lo deshace. Está declarado en el DoD como límite.
    UID.administracion = jefesP[1].id
    await filas(`update public.perfiles set rol='administracion' where id=$1`, [UID.administracion])

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

    await t.test('REPRODUCIBILIDAD sobre el caso REAL · RUN1 = RUN2 en ENTRADA **Y RESULTADO** (§39)', () => {
      // ═══ HASHEAR LA ENTRADA DOS VECES ES UNA TAUTOLOGÍA ═══
      // Lo encontró la auditoría adversarial: `huellaDeEntradas` sobre el mismo objeto da igual por
      // construcción. Ahora se compara también la huella del RESULTADO, que es la que puede diferir.
      const dos = correr(entrada)
      assert.equal(q.huella.sha256, dos.huella.sha256, 'entradas')
      assert.equal(q.huellaResultado.sha256, dos.huellaResultado.sha256, 'RESULTADO')
      assert.equal(q.costoDirecto.parcial, dos.costoDirecto.parcial)
    })

    await t.test('REPRODUCIBILIDAD · el control PUEDE dar rojo: correr en 2027 NO da lo mismo', () => {
      // MUTACIÓN QUE LO PONE ROJO: en `huellaDeEntradas`, sacar `hoy` de `partes`.
      //
      // El caso concreto que la tautología escondía: la misma cotización corrida un año después
      // tiene precios vencidos que hoy están vigentes. El resultado cambia y la huella de entradas
      // decía «iguales».
      const enElFuturo = correr({ ...entrada, hoy: new Date('2027-08-29T12:00:00Z') })
      assert.notEqual(q.huella.sha256, enElFuturo.huella.sha256, 'la fecha de corrida ES una entrada')
      assert.notEqual(q.huellaResultado.sha256, enElFuturo.huellaResultado.sha256)
      const vencidosHoy = q.metricas.precios_vencidos
      const vencidosDespues = enElFuturo.metricas.precios_vencidos
      assert.ok(vencidosDespues >= vencidosHoy, `hoy ${vencidosHoy} vencidos, en 2027 ${vencidosDespues}`)
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
      // ═══ SE COMPARAN CONJUNTOS, NO UN TIPO ═══
      //
      // La versión anterior comparaba `ready` y UN tipo. La auditoría adversarial mostró que los
      // conjuntos reales eran DISJUNTOS —SQL veía [PRECIO_DESACTUALIZADO, SIN_PRECIO,
      // SIN_PRECIO_CALCULABLE] y JS veía [AMBIGUO, CONFLICTO, …]— y el vigilante decía que sí.
      //
      // El gate de la base es estructuralmente más ciego y eso NO se puede arreglar: hay fuentes
      // que no están en Postgres. Se declaran, y el test falla si aparece un tipo FUERA de la lista.
      const SOLO_LOS_VE_EL_MOTOR = new Set([
        'CONFLICTO',              // heredado del corpus documental: biblioteca.json no está en la base
        'FALTA_DATO',             // idem, y los huecos declarados del proyecto
        'AMBIGUO',                // exclusión candidata: sale de leer las frases del contrato
        'EXCLUSION_CON_COMPUTO',  // exige confirmación humana; el alcance del corpus no está en la base
        'FUGA_ENTRE_CLIENTES',    // el barrido corre sobre el texto que produce el motor
        'FUGA_NO_VERIFICABLE',
        'UNIDAD_INCOMPATIBLE',    // la unidad se valida contra el catálogo del motor
      ])
      const sql = (await uno(`select public.cot_gate_congelado($1) g`, [cot.id])).g
      const js = gateDeCongelado({ cascada: q.cascada, cola: q.cola })
      assert.equal(sql.ready, js.ready, `SQL dice ready=${sql.ready} y JS dice ready=${js.ready}`)

      const tiposSql = new Set(sql.blocking_issues.map((b) => b.tipo))
      const tiposJs = new Set(js.blocking_issues.map((b) => b.tipo))
      // 1 · todo lo que ve SQL lo tiene que ver el motor: el motor nunca puede ser más ciego.
      const soloSql = [...tiposSql].filter((t) => !tiposJs.has(t))
      assert.deepEqual(soloSql, [], `SQL bloquea por tipos que el MOTOR no ve: ${soloSql.join(', ')}`)
      // 2 · lo que sólo ve el motor tiene que estar en la lista declarada. Un tipo nuevo rompe.
      const soloJs = [...tiposJs].filter((t) => !tiposSql.has(t))
      const noDeclarados = soloJs.filter((t) => !SOLO_LOS_VE_EL_MOTOR.has(t))
      assert.deepEqual(noDeclarados, [], `el motor bloquea por tipos que SQL no ve y que NO están declarados como ceguera estructural: ${noDeclarados.join(', ')}`)
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

    await t.test('el adaptador NO FABRICA la fecha de cotización de un subcontrato', async () => {
      // MUTACIÓN QUE LO PONE ROJO: en `pg.mjs`, volver a `cotizadoEn: iso(hoy)`.
      //
      // Ponerle `hoy` a un subcontrato cargado hace meses lo dejaba VIGENTE PARA SIEMPRE: la guarda
      // de vencimiento nunca podía dispararse porque el dato que mira lo inventaba el adaptador.
      await filas(`insert into public.cotizacion_partida (cotizacion_id, orden, codigo, descripcion, cantidad, unidad, subcontratada, precio_subcontrato, creado_en)
               values ($1, 98, 'ZZ-SUB-VIEJO', 'ZZ sanitaria contratada hace ocho meses', 1, 'un', true, 8500000, now() - interval '240 days')`, [cot.id])
      const est = await leerEstado({ query }, cot.id)
      const sub = est.partidas.find((p) => p.codigo === 'ZZ-SUB-VIEJO')
      const hoyIso = new Date().toISOString().slice(0, 10)
      assert.notEqual(sub.subcontrato.cotizadoEn, hoyIso, 'la fecha NO puede ser la de hoy')
      assert.ok(sub.subcontrato.cotizadoEn < hoyIso)
      assert.match(sub.subcontrato.fuente, /fecha aproximada por creado_en/,
        'y se DECLARA que es una aproximación: la tabla no guarda la fecha del subcontratista')
      await filas(`delete from public.cotizacion_partida where cotizacion_id=$1 and codigo='ZZ-SUB-VIEJO'`, [cot.id])
    })

    await t.test('el barrido recibe RELACIONES del orquestador, no sólo desde su test', () => {
      // MUTACIÓN QUE LO PONE ROJO: en `correr`, sacar `relaciones: relacionesExternas`.
      //
      // `barridoDeFuga` declara la relación como «la MÁS grave» —el presupuesto construido sobre
      // datos de otra obra— y esa rama sólo era alcanzable desde su propio test: el orquestador
      // nunca le pasaba relaciones.
      const conRelacion = correr({
        ...entrada,
        relacionesExternas: [{ tipo: 'analisis_heredado_de', referencia: 'cot-2025-118', cliente: 'GRUPO NATANIA' }],
      })
      assert.equal(conRelacion.gate.ready, false)
      assert.ok(conRelacion.fuga.materiales.some((h) => h.lugar === 'RELACION' && h.cliente === 'GRUPO NATANIA'),
        JSON.stringify(conRelacion.fuga.materiales))
      assert.ok(conRelacion.gate.blocking_issues.some((b) => b.tipo === 'FUGA_ENTRE_CLIENTES'))
    })

    await t.test('el PRECIO VENCIDO bloquea en la BASE y lo destraba un override firmado', async () => {
      // MUTACIÓN QUE LO PONE ROJO: en `cot_gate_congelado`, volver a tratar el vencido por
      // materialidad (el `if v_conocido > 0 and r.subtotal / v_conocido >= v_umbral`).
      const g = (await uno(`select public.cot_gate_congelado($1) g`, [cot.id])).g
      const vencidos = g.blocking_issues.filter((b) => b.tipo === 'PRECIO_DESACTUALIZADO')
      assert.ok(vencidos.length > 0, 'el presupuesto real tiene precios de más de 180 días y tienen que bloquear')
      assert.match(vencidos[0].detalle, /HISTORICO distinto de VALIDADO/)

      // El override lo firma alguien con COMMERCIAL_WRITE, y sin firma no entra.
      // La entidad es `codigo (NOMBRE)`: se compara ENTERA. Filtrar por `startsWith(codigo)` cazaba
      // «40», «41»… cuando el código es «4» — 400 recursos tienen código puramente numérico.
      const entidad = vencidos[0].entidad
      const codigo = String(entidad).split(' ')[0]
      await como(UID.jefe)
      await rechaza(`insert into public.cotizacion_override_precio (cotizacion_id, recurso_codigo, motivo) values ($1,$2,'lo asumo')`,
        [cot.id, codigo], /row-level security|violates/i, 'el jefe de obra no puede asumir un precio vencido')
      await como(UID.administracion)
      await c.query(`insert into public.cotizacion_override_precio (cotizacion_id, recurso_codigo, motivo) values ($1,$2,'el material no movió')`, [cot.id, codigo])
      await comoDios()
      const g2 = (await uno(`select public.cot_gate_congelado($1) g`, [cot.id])).g
      assert.equal(g2.blocking_issues.filter((b) => b.tipo === 'PRECIO_DESACTUALIZADO' && b.entidad === entidad).length, 0,
        'EL EFECTO: con el override firmado ESE recurso deja de bloquear')
      assert.ok(g2.blocking_issues.some((b) => b.tipo === 'PRECIO_DESACTUALIZADO'),
        'y los OTROS vencidos siguen bloqueando: el override es por recurso, no un interruptor general')
      assert.ok(g2.warnings.some((w) => String(w.detalle ?? '').includes('asumido por')), 'y queda como advertencia con quién lo asumió')
      await filas(`delete from public.cotizacion_override_precio where cotizacion_id=$1`, [cot.id])
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
