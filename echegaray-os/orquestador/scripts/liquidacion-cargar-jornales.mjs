#!/usr/bin/env node
// DEJA CARGADAS EN EL MÓDULO LIQUIDACIÓN LAS QUINCENAS YA CERRADAS DE 2026 QUE VIVEN EN «JORNALES».
//
//   node orquestador/scripts/liquidacion-cargar-jornales.mjs                  → dry: muestra y no escribe
//   node orquestador/scripts/liquidacion-cargar-jornales.mjs --aplicar        → escribe Postgres
//   ... --anio 2026 --hoy 2026-09-09 --hoja "Oficina 26" --incluir-bajas
//
// Pedido del dueño, 09/09/2026: «dejar cargados todos los datos de liquidación de horas de las
// quincenas pasadas del 2026, según lo indica el Sheet JORNALES». Y el 15/09/2026: «está mal lo
// histórico de las quincenas tanto en horas como en montos pagados».
//
// ═══ EL SHEET ES FUENTE Y NADA MÁS ═══
//
// No se escribe una sola celda: se leen «Obreros 26» y «Oficina 26» y se escribe Postgres. Por eso
// este script se puede correr desde un worktree — un generador corrido desde un worktree ya borró la
// pestaña Proveedores entera. «Pagado el» y «EFECTIVO redondeado» son columnas del dueño: no se tocan.
//
// ═══ QUÉ SE LEE (el plan, puro y probado, está en lib/liquidacion-jornales-plan.mjs) ═══
//
//   · «Obreros 26» → grupo `obreros`; «Oficina 26» → grupo `oficina` (hasta el 15/09 no se leía).
//   · Las filas BAJA se leen y, SIN `--incluir-bajas`, quedan afuera con su importe en
//     `monto_excluido`: que la planilla las sume no prueba que se hayan pagado.
//   · Dos bloques con la misma quincena dan UNA línea por persona (la del primero); la repetida se
//     declara afuera.
//   · Quién es cada fila: puente CUIL → tabla de alias → nombre exacto → el mismo `emparejarPersona`
//     que ya cargó sus horas. No se da de alta a nadie (dueño, 09/09/2026).
//
// ═══ LA QUINCENA EN CURSO NO SE CARGA ═══
//
// El bloque abierto se sigue editando todos los días. Congelarlo sería registrar algo que no pasó.
//
// ═══ UNA QUINCENA PUEDE ENTRAR PARCIAL, PERO NUNCA EN SILENCIO ═══
//
// Lo que queda afuera se imprime por quincena, con nombre y motivo, Y QUEDA ESCRITO EN LA BASE:
// `liquidacion_quincena.monto_excluido` + `excluidas` (nombre, importe, motivo, fila) + `observacion`.
//
// ═══ POR QUÉ ENTRA COMO `cerrada` ═══
//
// Una quincena `abierta` RECALCULA sus cifras en cada lectura desde `registros_hh`; la de marzo
// mostraría $0 encima de una liquidación real. Entra `cerrada` con `cerrada_en = now()` y
// `cerrada_por` en NULL porque no la cerró una persona: la cargó este script.

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { CUIL_POR_PERSONA_DE_PLANILLA } from '../lib/nomina-banco-recibo.mjs'
import { claveNombre, resolverPersona } from '../lib/liquidacion-jornales.mjs'
import { emparejarPersona, indicePersonas } from '../lib/jornales-a-registros-hh.mjs'
import {
  excluidasParaBase, HOJAS_LIQUIDACION, observacionDeCarga, planDeHoja, separarSalteadas,
} from '../lib/liquidacion-jornales-plan.mjs'

const JORNALES_ID = '1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk'

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null)
const APLICAR = process.argv.includes('--aplicar')
const INCLUIR_BAJAS = process.argv.includes('--incluir-bajas')
const ANIO = Number(arg('--anio') ?? 2026)
const HOY = arg('--hoy') ? new Date(`${arg('--hoy')}T12:00:00Z`) : new Date()
const SOLO_HOJA = arg('--hoja')

const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`
const redondear2 = (n) => Math.round((Number(n) || 0) * 100) / 100

async function contextoDePersonas() {
  const { rows } = await query(
    'select id, nombre_completo, cuil, es_prueba from public.personas where nombre_completo is not null',
  )
  const personas = rows.map((r) => {
    const clave = claveNombre(r.nombre_completo)
    return { id: r.id, nombre: r.nombre_completo, clave, tokens: clave.split(' ').filter(Boolean) }
  })
  const porCuil = new Map(rows.filter((r) => r.cuil).map((r) => [r.cuil, { id: r.id, nombre: r.nombre_completo }]))
  const puente = new Map(
    Object.entries(CUIL_POR_PERSONA_DE_PLANILLA).filter(([, c]) => c).map(([n, c]) => [claveNombre(n), c]),
  )
  return { personas, porCuil, puente, indice: indicePersonas(rows) }
}

async function planear(google, h, ctx) {
  const rango = `'${h.hoja}'!A1:AT991`
  // DOS LECTURAS DEL MISMO RANGO, y no es redundancia: la formateada es la única que deja leer el
  // «17/8» de los encabezados, y la cruda es la única que trae los centavos.
  const [grid, gridCrudo] = await Promise.all([
    google.readSheetValues(JORNALES_ID, rango),
    google.readSheetValues(JORNALES_ID, rango, { render: 'UNFORMATTED_VALUE' }),
  ])
  const plan = planDeHoja({
    grid: grid ?? [], gridCrudo, anio: ANIO, hoy: HOY, incluirBajas: INCLUIR_BAJAS,
    rotulos: h.rotulos, filaRotulos: h.filaRotulos,
    resolver: (l) => resolverPersona(l.clave, { ...ctx, nombre: l.nombre }),
  })
  if (plan.bloques === 0) throw new Error(`no encontré ni un bloque en '${h.hoja}': NO cargo nada`)
  return plan
}

const afueraTexto = (c) => {
  const por = {}
  for (const l of c.excluidas) por[l.motivo] = (por[l.motivo] ?? 0) + 1
  return `  ⚠ afuera ${ars(c.montoExcluido)} (${Object.entries(por).map(([m, n]) => `${n} ${m}`).join(', ')})`
}

function imprimirTabla(h, plan, existentes, estados) {
  console.log(`\n══ ${h.hoja} → grupo ${h.grupo}: ${plan.bloques} bloque(s) · en curso ${plan.enCurso?.desde}..${plan.enCurso?.hasta}`)
  console.log('quincena                líneas   total Sheet      cargable  bajas+  estado')
  // LA GUARDA VIVE EN EL LIB (`separarSalteadas`, probada): lo que ya firmó, selló, reabrió o corrigió
  // una persona en la base no se reescribe — ni líneas, ni `observacion`, ni `monto_excluido`.
  const { salteadas } = separarSalteadas(plan.quincenas, h.grupo, estados)
  const motivoDe = new Map(salteadas.map((q) => [q.desde, q.salteada]))
  const aCargar = []
  for (const q of plan.quincenas) {
    const ya = existentes.get(`${h.grupo}|${q.desde}|${q.hasta}`)
    const afuera = q.control.excluidas.length ? afueraTexto(q.control) : ''
    const estado = q.enCurso ? 'EN CURSO — no se carga'
      : motivoDe.has(q.desde) ? `SALTEADA: ${motivoDe.get(q.desde)}`
        : !q.control.cierra ? `NO CIERRA: plata ilegible en ${q.control.bloqueantes.length} línea/s`
          : `${ya ? `ya cargada (${ya} líneas)` : 'a cargar'}${afuera}`
    if (!q.enCurso && !motivoDe.has(q.desde) && q.control.cierra) aCargar.push(q)
    console.log(`${q.desde}..${q.hasta}  ${String(q.lineas.length).padStart(4)}  `
      + `${ars(q.control.totalSheet).padStart(13)} ${ars(q.control.totalCargable).padStart(13)} `
      + `${String(q.control.bajasCargadas).padStart(6)}  ${estado}`)
  }
  for (const a of plan.avisos) console.log(`   ⚠ ${a}`)
  return aCargar
}

function imprimirDetalle(h, plan, ctx) {
  const cerradas = plan.quincenas.filter((q) => !q.enCurso)
  const lineas = cerradas.flatMap((q) => q.lineas.map((l) => ({ q, l })))
  const porVia = (via) => new Map(lineas.filter(({ l }) => l.via === via).map(({ l }) => [l.clave, `${l.nombre} → ${l.personaBase}`]))
  const listar = (titulo, filas) => { if (filas.length) { console.log(`\n${titulo}`); for (const f of filas) console.log(`   · ${f}`) } }
  listar('RESUELTAS POR LA TABLA DE ALIAS (revisadas por el dueño el 09/09, en el código):', [...porVia('alias').values()])
  listar('RESUELTAS POR emparejarPersona (el mismo que cargó sus horas en registros_hh):', [...porVia('emparejado').values()])
  // UN CONTROL, NO UNA CORRECCIÓN: si la vía que ganó acá manda la fila a otra persona que la que
  // recibió sus horas, las dos cargas de la misma planilla se contradicen.
  listar('⚠ DISCREPANCIA CON EL IMPORTADOR DE HORAS (misma fila, otra persona):', lineas.flatMap(({ q, l }) => {
    const m = l.persona_id ? emparejarPersona(l.nombre, ctx.indice) : null
    return m?.estado === 'ok' && m.persona.id !== l.persona_id
      ? [`${q.desde} fila ${l.fila} ${l.nombre}: acá ${l.personaBase} (${l.via}), horas en ${m.persona.nombre_completo}`] : []
  }))
  listar('EFECTIVO DERIVADO DE LA CADENA DE PAGO (la celda estaba vacía, no en cero):',
    lineas.filter(({ l }) => l.efectivoDerivado).map(({ q, l }) => `${q.desde} fila ${l.fila} ${l.nombre}: ${ars(l.enEfectivo)}`))
  listar('LÍNEAS CON PLATA ILEGIBLE — voltean su quincena entera:',
    cerradas.flatMap((q) => q.control.bloqueantes.map((l) => `${q.desde} fila ${l.fila} ${l.nombre}: ${l.incompleta}`)))
  listar(`LO QUE QUEDA AFUERA EN ${h.hoja}, POR QUINCENA (se escribe en liquidacion_quincena.excluidas):`,
    cerradas.flatMap((q) => q.control.excluidas.map((l) => `${q.desde}..${q.hasta}  f${String(l.fila).padEnd(4)} ${l.nombre.padEnd(22)} ${ars(l.cobra).padStart(12)}  ${l.motivo}${l.incompleta ? ` · ${l.incompleta}` : ''}${l.candidatos?.length ? ` · candidatos: ${l.candidatos.join(' / ')}` : ''}`)))
}

async function escribir(h, aCargar) {
  for (const q of aCargar) {
    const { rows } = await query(
      `insert into public.liquidacion_quincena (desde, hasta, grupo, estado, cerrada_en)
       values ($1::date, $2::date, $3, 'cerrada', now())
       on conflict (desde, hasta, grupo) do update set grupo = excluded.grupo
       returning id`, [q.desde, q.hasta, h.grupo],
    )
    const id = rows[0].id
    // EL FALTANTE SE ESCRIBE SIEMPRE, TAMBIÉN CUANDO ES CERO: NULL significaría «nadie lo midió».
    await query(
      `update public.liquidacion_quincena set monto_excluido = $2, excluidas = $3::jsonb, observacion = $4
        where id = $1`,
      [id, redondear2(q.control.montoExcluido), JSON.stringify(excluidasParaBase(q.control)), observacionDeCarga(h.hoja, q.control)],
    )
    for (const l of q.control.cargables) {
      await query(
        `insert into public.liquidacion_linea
           (liquidacion_id, persona_id, horas, valor_hora, cobra, adelanto, ya_transferido,
            por_banco, en_efectivo, total)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (liquidacion_id, persona_id) do update set
           horas = excluded.horas, valor_hora = excluded.valor_hora, cobra = excluded.cobra,
           adelanto = excluded.adelanto, ya_transferido = excluded.ya_transferido,
           por_banco = excluded.por_banco,
           en_efectivo = excluded.en_efectivo, total = excluded.total, actualizado_en = now()`,
        [id, l.persona_id, l.horas, l.valorHora, l.cobra, l.adelanto, l.yaTransferido, l.porBanco, l.enEfectivo, l.total],
      )
    }
    const falta = q.control.montoExcluido ? `  ⚠ AFUERA ${ars(q.control.montoExcluido)}` : ''
    console.log(`   ✔ ${h.grupo} ${q.desde}..${q.hasta}  ${q.control.cargables.length} línea(s)  ${ars(q.control.totalCargable)}${falta}`)
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  const ctx = await contextoDePersonas()
  const { rows: yaHay } = await query(
    'select q.grupo, q.desde::text, q.hasta::text, count(l.id)::int n from public.liquidacion_quincena q'
    + ' left join public.liquidacion_linea l on l.liquidacion_id = q.id group by 1,2,3',
  )
  const existentes = new Map(yaHay.map((r) => [`${r.grupo}|${r.desde}|${r.hasta}`, r.n]))
  const { rows: estadoRows } = await query(
    `select q.grupo, q.desde::text, q.hasta::text, q.estado, q.cerrada_por::text,
            (select count(*)::int from public.liquidacion_linea l where l.liquidacion_id = q.id
               and (l.horas_manual is not null or l.cobra_manual is not null or l.adelanto_manual is not null
                 or l.ya_transferido_manual is not null or l.por_banco_manual is not null
                 or l.en_efectivo_manual is not null or l.total_manual is not null)) lineas_manuales,
            (select count(*)::int from public.liquidacion_linea l where l.liquidacion_id = q.id and l.sellado_en is not null) lineas_selladas,
            (select count(*)::int from public.liquidacion_reapertura r where r.liquidacion_id = q.id) reaperturas
       from public.liquidacion_quincena q`,
  )
  const estados = new Map(estadoRows.map((r) => [`${r.grupo}|${r.desde}|${r.hasta}`, r]))
  const hojas = HOJAS_LIQUIDACION.filter((h) => !SOLO_HOJA || h.hoja === SOLO_HOJA)
  if (!hojas.length) throw new Error(`--hoja «${SOLO_HOJA}» no es una de ${HOJAS_LIQUIDACION.map((h) => h.hoja).join(' / ')}`)
  console.log(`bajas: ${INCLUIR_BAJAS ? 'SE CARGAN (--incluir-bajas)' : 'se leen y quedan AFUERA (sin --incluir-bajas)'}`)
  const planes = []
  for (const h of hojas) {
    const plan = await planear(google, h, ctx)
    const aCargar = imprimirTabla(h, plan, existentes, estados)
    imprimirDetalle(h, plan, ctx)
    planes.push({ h, aCargar })
  }
  console.log('\nRESUMEN')
  for (const { h, aCargar } of planes) {
    const afuera = aCargar.reduce((a, q) => a + q.control.montoExcluido, 0)
    console.log(`   ${h.hoja}: ${aCargar.length} quincena(s) cargables · `
      + `${aCargar.reduce((a, q) => a + q.control.cargables.length, 0)} línea(s) · `
      + `${ars(aCargar.reduce((a, q) => a + q.control.totalCargable, 0))} · `
      + `${aCargar.filter((q) => !q.control.completa).length} PARCIALES dejando ${ars(afuera)} afuera`)
  }
  if (!APLICAR) return console.log('\n(sin --aplicar: no escribí nada)')
  for (const { h, aCargar } of planes) await escribir(h, aCargar)
}

main().then(closePool, async (e) => { console.error(e); await closePool(); process.exitCode = 1 })
