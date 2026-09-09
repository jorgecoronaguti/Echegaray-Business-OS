#!/usr/bin/env node
// DEJA CARGADAS EN EL MÓDULO LIQUIDACIÓN LAS QUINCENAS YA CERRADAS DE 2026 QUE VIVEN EN «JORNALES».
//
//   node orquestador/scripts/liquidacion-cargar-jornales.mjs             → dry: muestra y no escribe
//   node orquestador/scripts/liquidacion-cargar-jornales.mjs --aplicar   → escribe Postgres
//   ... --anio 2026 --hoy 2026-09-09
//
// Pedido del dueño, 09/09/2026: «dejar cargados todos los datos de liquidación de horas de las
// quincenas pasadas del 2026, según lo indica el Sheet JORNALES».
//
// ═══ EL SHEET ES FUENTE Y NADA MÁS ═══
//
// No se escribe una sola celda: se lee `'Obreros 26'` (gid 1233944089) y se escribe Postgres. Por
// eso este script se puede correr desde un worktree — un generador corrido desde un worktree ya
// borró la pestaña Proveedores entera. «Pagado el» y «EFECTIVO redondeado» son columnas del dueño:
// se leen si hacen falta, no se tocan nunca.
//
// ═══ LA QUINCENA EN CURSO NO SE CARGA ═══
//
// El bloque abierto (01–15/09 al momento de escribir esto) se sigue editando todos los días.
// Congelarlo en la base como si fuera un pago hecho sería registrar algo que todavía no pasó.
//
// ═══ UNA QUINCENA PUEDE ENTRAR PARCIAL, PERO NUNCA EN SILENCIO ═══
//
// Decisión del dueño, 09/09/2026: *«no des de alta a nadie, son inactivos los que no están en esta
// quincena»*. Seis nombres de la planilla no existen en `public.personas` y no se crean; sus líneas
// no tienen dónde ir (`liquidacion_linea.persona_id` es NOT NULL con FK). La quincena entra igual
// con las líneas que sí matchean, y el importe que quedó afuera se imprime por quincena y con
// nombre en esta misma corrida, Y ADEMÁS QUEDA ESCRITO EN LA BASE desde la migración
// 20260909T1800: `liquidacion_quincena.monto_excluido` + `excluidas` (nombre e importe) +
// `observacion`. Antes el faltante vivía sólo en esta consola y quien mirara Postgres veía un total
// corto sin la marca de que lo era — que es indistinguible de uno completo.
//
// ═══ POR QUÉ ENTRA COMO `cerrada` ═══
//
// Una quincena `abierta` es, por contrato de la tabla, una cuyas cifras la web RECALCULA en cada
// lectura desde `registros_hh`. Marzo de 2026 no tiene registros_hh que reproduzcan estas horas: si
// entrara abierta, la pantalla mostraría $0 encima de una liquidación real. Entra `cerrada` con
// `cerrada_en = now()`, que es literalmente cuándo quedó congelada en la base, y `cerrada_por` en
// NULL porque no la cerró una persona: la cargó este script.

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { detectarQuincenas } from '../lib/nomina-sync.mjs'
import { CUIL_POR_PERSONA_DE_PLANILLA } from '../lib/nomina-banco-recibo.mjs'
import {
  claveNombre, columnasDelBloque, controlDeCierre, lineasDelBloque,
  primeraFecha, quincenaDeFecha, quincenaEnCurso,
} from '../lib/liquidacion-jornales.mjs'

const JORNALES_ID = '1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk'
const HOJA = 'Obreros 26'
const GRUPO = 'obreros'

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null)
const APLICAR = process.argv.includes('--aplicar')
const ANIO = Number(arg('--anio') ?? 2026)
const HOY = arg('--hoy') ? new Date(`${arg('--hoy')}T12:00:00Z`) : new Date()

const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`
const redondear2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** El faltante SIEMPRE al lado del total: un total corto sin marca se lee igual que uno completo. */
const afueraTexto = (c) => `  ⚠ ${c.excluidas.length} sin persona · afuera ${ars(c.montoExcluido)}`

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  const RANGO = `'${HOJA}'!A1:AT991`
  // DOS LECTURAS DEL MISMO RANGO, y no es redundancia: la formateada es la única que deja leer el
  // «17/8» de los encabezados (cruda llega como serial y no se detecta un solo bloque), y la cruda
  // es la única que trae los centavos (formateada, las 274 líneas cerraban $3,62 cortas).
  const [grid, gridCrudo] = await Promise.all([
    google.readSheetValues(JORNALES_ID, RANGO),
    google.readSheetValues(JORNALES_ID, RANGO, { render: 'UNFORMATTED_VALUE' }),
  ])
  const bloques = detectarQuincenas(grid ?? [])
  if (bloques.length === 0) throw new Error(`no encontré ni un bloque en '${HOJA}': NO cargo nada`)

  const enCurso = quincenaEnCurso(HOY)
  const { rows: personasRows } = await query(
    'select id, nombre_completo from public.personas where nombre_completo is not null',
  )
  const personas = personasRows.map((r) => {
    const clave = claveNombre(r.nombre_completo)
    return { id: r.id, nombre: r.nombre_completo, clave, tokens: clave.split(' ').filter(Boolean) }
  })
  const { rows: conCuil } = await query('select id, nombre_completo, cuil from public.personas where cuil is not null')
  const porCuil = new Map(conCuil.map((r) => [r.cuil, { id: r.id, nombre: r.nombre_completo }]))
  const puente = new Map(
    Object.entries(CUIL_POR_PERSONA_DE_PLANILLA).filter(([, c]) => c).map(([n, c]) => [claveNombre(n), c]),
  )

  const { resolverPersona } = await import('../lib/liquidacion-jornales.mjs')
  const quincenas = []
  const sinPersona = new Map()
  for (const bloque of bloques) {
    const ddmm = primeraFecha(grid, bloque)
    const rango = ddmm ? quincenaDeFecha(ddmm, ANIO) : null
    if (!rango) { console.log(`⚠ bloque en fila ${bloque.inicio}: sin fecha legible — NO se carga`); continue }
    const { cols, faltan } = columnasDelBloque(grid, bloque)
    if (faltan.length) {
      console.log(`⚠ ${rango.desde}: faltan los rótulos ${faltan.join(', ')} — NO se carga`)
      continue
    }
    const lineas = lineasDelBloque(grid, bloque, cols, gridCrudo)
    for (const l of lineas) {
      const r = resolverPersona(l.clave, { puente, porCuil, personas })
      l.persona_id = r.persona?.id ?? null
      l.personaBase = r.persona?.nombre ?? null
      l.via = r.via
      if (!l.persona_id && !l.incompleta) {
        const e = sinPersona.get(l.clave) ?? { nombre: l.nombre, via: r.via, candidatos: r.candidatos, monto: 0, q: 0 }
        e.monto += l.cobra ?? 0; e.q++
        sinPersona.set(l.clave, e)
      }
    }
    quincenas.push({
      ...rango,
      etiqueta: ddmm,
      enCurso: enCurso && rango.desde === enCurso.desde,
      control: controlDeCierre(lineas),
      lineas,
    })
  }

  const { rows: yaHay } = await query(
    'select q.desde::text, q.hasta::text, count(l.id)::int n from public.liquidacion_quincena q'
    + ' left join public.liquidacion_linea l on l.liquidacion_id = q.id where q.grupo = $1'
    + ' group by 1,2', [GRUPO],
  )
  const existentes = new Map(yaHay.map((r) => [`${r.desde}|${r.hasta}`, r.n]))

  console.log(`${HOJA}: ${bloques.length} bloque(s) · quincena en curso ${enCurso?.desde}..${enCurso?.hasta}\n`)
  console.log('quincena            líneas  total Sheet      cargable        dif   estado')
  let totalAnio = 0
  const aCargar = []
  for (const q of quincenas) {
    totalAnio += q.control.totalSheet
    const ya = existentes.get(`${q.desde}|${q.hasta}`)
    const afuera = q.control.excluidas.length
      ? `${afueraTexto(q.control)}` : ''
    const estado = q.enCurso ? 'EN CURSO — no se carga'
      : !q.control.cierra ? `NO CIERRA: plata ilegible en ${q.control.bloqueantes.length} línea/s`
        : ya ? `ya cargada (${ya} líneas)${afuera}` : `a cargar${afuera}`
    if (!q.enCurso && q.control.cierra) aCargar.push(q)
    console.log(`${q.desde}..${q.hasta}  ${String(q.lineas.length).padStart(4)}  `
      + `${ars(q.control.totalSheet).padStart(13)} ${ars(q.control.totalCargable).padStart(13)} `
      + `${ars(q.control.diferencia).padStart(11)}   ${estado}`)
  }
  const totalAfuera = quincenas.filter((q) => !q.enCurso).reduce((a, q) => a + q.control.montoExcluido, 0)
  console.log(`\nTOTAL AÑO EN LA PLANILLA: ${ars(totalAnio)}`
    + '   (cifra de control externa: «Jornales por Quincena» publica REAL_TOTAL $135.539.027)')

  if (sinPersona.size) {
    console.log('\nPERSONAS SIN RESOLVER EN public.personas — NO SE DAN DE ALTA (decisión del dueño'
      + ` 09/09) y su línea NO ENTRA. La quincena entra parcial. Total afuera: ${ars(totalAfuera)}`)
    for (const [, e] of [...sinPersona].sort((a, b) => b[1].monto - a[1].monto)) {
      const extra = e.candidatos ? ` · candidatos: ${e.candidatos.join(' / ')}` : ''
      console.log(`   · ${e.nombre.padEnd(24)} ${String(e.q).padStart(2)} quincena(s)  ${ars(e.monto).padStart(13)}  ${e.via}${extra}`)
    }
  }
  const porAlias = new Map()
  for (const q of quincenas) for (const l of q.lineas) {
    if (l.via === 'alias') porAlias.set(l.clave, `${l.nombre} → ${l.personaBase}`)
  }
  if (porAlias.size) {
    console.log('\nRESUELTAS POR LA TABLA DE ALIAS (revisadas por el dueño el 09/09, en el código):')
    for (const v of porAlias.values()) console.log(`   · ${v}`)
  }
  const derivadas = quincenas.flatMap((q) => q.lineas.filter((l) => l.efectivoDerivado).map((l) => `${q.desde} fila ${l.fila} ${l.nombre}: EFECTIVO derivado ${ars(l.enEfectivo)}`))
  if (derivadas.length) {
    console.log('\nEFECTIVO DERIVADO DE LA CADENA DE PAGO (la celda estaba vacía, no en cero):')
    for (const d of derivadas) console.log(`   · ${d}`)
  }
  const rotas = quincenas.flatMap((q) => q.lineas.filter((l) => l.incompleta).map((l) => ({ q: q.desde, l })))
  if (rotas.length) {
    console.log('\nLÍNEAS CON PLATA ILEGIBLE — voltean su quincena entera:')
    for (const { q, l } of rotas) console.log(`   · ${q} fila ${l.fila} ${l.nombre}: ${l.incompleta}`)
  }
  console.log('\nLO QUE QUEDA AFUERA, POR QUINCENA (se escribe en liquidacion_quincena.excluidas):')
  for (const q of quincenas) {
    if (q.enCurso || !q.control.excluidas.length) continue
    for (const l of q.control.excluidas) {
      console.log(`   · ${q.desde}..${q.hasta}  ${l.nombre.padEnd(22)} ${ars(l.cobra).padStart(12)}  sin persona en la base`)
    }
  }

  console.log(`\nRESUMEN  ${aCargar.length} quincena(s) cerradas con la plata legible`
    + ` · ${aCargar.reduce((a, q) => a + q.control.cargables.length, 0)} línea(s) cargables`
    + ` · ${ars(aCargar.reduce((a, q) => a + q.control.totalCargable, 0))}`
    + ` · ${aCargar.filter((q) => !q.control.completa).length} entran PARCIALES`
    + ` dejando ${ars(totalAfuera)} afuera`)

  // ADELANTO Y YA_TRANSFERIDO SÍ TIENEN COLUMNA en 20260909T1200 (se verificó contra
  // information_schema, no contra el archivo del repo: una migración en el repo no está aplicada).
  // Lo que NO tiene destino es «Pagado el» y el «EFECTIVO redondeado» del dueño, que esta pestaña
  // tampoco trae. `ya_transferido` recibe la columna sin rótulo que la planilla descuenta entre
  // BANCO y ADELANTO desde el 17/8 — por qué, en `columnasSinRotuloEntre`.
  if (!APLICAR) return console.log('\n(sin --aplicar: no escribí nada)')


  for (const q of aCargar) {
    const { rows } = await query(
      `insert into public.liquidacion_quincena (desde, hasta, grupo, estado, cerrada_en)
       values ($1::date, $2::date, $3, 'cerrada', now())
       on conflict (desde, hasta, grupo) do update set grupo = excluded.grupo
       returning id`, [q.desde, q.hasta, GRUPO],
    )
    const id = rows[0].id
    // EL FALTANTE SE ESCRIBE SIEMPRE, TAMBIÉN CUANDO ES CERO. Un NULL ahí significaría «nadie lo
    // midió» y esta corrida sí lo midió: una quincena completa tiene que poder decir que lo está.
    await query(
      `update public.liquidacion_quincena
          set monto_excluido = $2, excluidas = $3::jsonb, observacion = $4
        where id = $1`,
      [
        id,
        redondear2(q.control.montoExcluido),
        JSON.stringify(q.control.excluidas.map((l) => ({
          nombre: l.nombre, importe: redondear2(l.cobra ?? 0),
        }))),
        q.control.excluidas.length
          ? `Cargada desde JORNALES '${HOJA}'. ${q.control.excluidas.length} persona(s) de la`
            + ' planilla no existen en public.personas y el dueño decidió no darlas de alta'
            + ' (09/09/2026): su línea no entró y su importe está en monto_excluido.'
          : `Cargada desde JORNALES '${HOJA}'. Entró completa: ninguna línea quedó afuera.`,
      ],
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
        [id, l.persona_id, l.horas, l.valorHora, l.cobra, l.adelanto, l.yaTransferido,
          l.porBanco, l.enEfectivo, l.total],
      )
    }
    const falta = q.control.montoExcluido
      ? `  ⚠ AFUERA ${ars(q.control.montoExcluido)} (${q.control.excluidas.map((l) => l.nombre).join(', ')})` : ''
    console.log(`   ✔ ${q.desde}..${q.hasta}  ${q.control.cargables.length} línea(s)  ${ars(q.control.totalCargable)}${falta}`)
  }
}

main().then(closePool, async (e) => { console.error(e); await closePool(); process.exitCode = 1 })
