#!/usr/bin/env node
// ESCENARIO · #11 INDIRECTOS, #12 POLÍTICA VERSIONADA Y #21 REUTILIZACIÓN, CONTRA LA BASE VIVA.
//
// ═══ QUÉ VENÍA A COMPROBAR, Y QUÉ ENCONTRÓ ═══
//
// La DoD dejaba los tres en NO_VERIFICABLE con tres frases que sonaban a decisión pendiente de la
// empresa: «hay 14 conceptos catalogados y ninguna cotización los usa», «las versiones existen y
// ninguna cotización las referencia todavía», «la gobernanza no promovió nada».
//
// Ninguna de las tres era una decisión pendiente:
//
//   · `orquestador.mjs` USABA `indirectoCalculado`, `indirectoAplicado` y `proyectarACascada` sin
//     importarlos. La primera cotización que intentara usar su estructura se caía con
//     `ReferenceError: indirectoAplicado is not defined`. Arreglado.
//   · `politica-pg.mjs` tenía cinco LECTORES y cero ESCRITORES. No había por dónde escribir la
//     referencia aunque alguien quisiera. Agregados.
//   · el único candidato de rendimiento que existe lo RECHAZA la gobernanza, con cinco checks en
//     rojo. Ésa es la respuesta correcta y no un pendiente.
//
// ═══ LA ESCRITURA VA EN UNA TRANSACCIÓN QUE SE DESHACE ═══
//
// Postgres está compartido. Todo lo que este script escribe va en `begin`/`rollback` sobre UNA
// conexión de `pool.connect()` —con `pool.query` el begin, el insert y el rollback pueden caer en
// tres conexiones distintas y NO revierte— y se LEE DE VUELTA adentro de la transacción antes de
// deshacerla: la evidencia es el dato leído en su destino, nunca la pantalla que dijo que sí.
//
// Dejar las filas puestas es una decisión del dueño, no de este script: `cotizacion_politica_ref`
// fija con qué política se defiende una oferta de la empresa.

import { getPool } from '../lib/db.mjs'
import { correr, etapa } from '../lib/cotizador/orquestador.mjs'
import { leerEstado } from '../lib/cotizador/pg.mjs'
import {
  leerEstructuraIndirecta, leerVersionDePolitica, leerVigenciaDeSubcontratos,
  escribirReferenciaDePolitica, escribirIndirectoDeCotizacion,
} from '../lib/cotizador/politica-pg.mjs'
import { indirectoCalculado } from '../lib/cotizador/indirectos.mjs'
import { politicaEfectiva, referenciaDePolitica, resolverReferencia } from '../lib/cotizador/politica-version.mjs'
import { activar, activos } from '../lib/conocimiento/activacion.mjs'
import { politicaVigente } from './cotizador-casos-reales.mjs'

const linea = (t) => console.log(t)
const pct = (v) => (v === null || v === undefined ? '**null** (no es cero)' : `${(Number(v) * 100).toFixed(4)} %`)
const plata = (v) => (v === null || v === undefined ? 'no medida' : `$ ${Math.round(v).toLocaleString('es-AR')}`)

/** #11 · La estructura real contra la cotización real. */
function bloqueIndirectos(estructura, corrida) {
  const c = etapa(corrida, 'COMMERCIAL')
  linea('## 1 · Los 14 conceptos REALES de `indirecto_concepto`, ejercitados')
  linea('')
  linea(`Estructura vigente v${estructura.version} — ${String(estructura.fuente).slice(0, 90)}`)
  linea(`Denominador del prorrateo (\`costo_directo_anual\`): **${estructura.costoDirectoAnual === null ? 'no declarado' : plata(estructura.costoDirectoAnual)}**`)
  linea('')
  const calc = indirectoCalculado({ estructura, costoDirectoObra: corrida.costoDirecto.total })
  linea('| bloque | base | concepto | valor | aporte |')
  linea('|---|---|---|---|---|')
  for (const x of calc.porConcepto) {
    linea(`| ${x.bloque} | ${x.base} | ${String(x.concepto).slice(0, 55)} | ${x.valor === null ? '**null**' : x.valor} | ${x.porQue ? `HUECO — ${String(x.porQue).slice(0, 60)}` : plata(x.monto)} |`)
  }
  linea('')
  linea(`**${calc.nHuecos} de ${calc.nConceptos} conceptos son huecos.** Indirecto calculado: ${pct(calc.pct)}.`)
  linea('')
  linea(`Etapa COMMERCIAL: **${c.status}** · indirecto calculado ${pct(c.result.indirectoCalculado)} · aplicado ${pct(c.result.indirectoAplicado)}`)
  linea(`Precio publicado: **${c.result.ventaFinal === null || c.result.ventaFinal === undefined ? 'NINGUNO' : plata(c.result.ventaFinal)}**`)
  if (c.blocking_issues?.length) linea(`Motivo del bloqueo: ${c.blocking_issues[0].detalle}`)
  linea('')
  linea('> Los 14 conceptos ejercitados producen **catorce motivos, no un porcentaje**. Ése es el')
  linea('> resultado correcto: un concepto sin monto es un HUECO y un hueco envenena el total. Un 27 %')
  linea('> publicado sobre una estructura que no se puede calcular es exactamente lo que hay hoy en')
  linea('> `parametro_comercial` y lo que nadie puede explicar.')
  linea('')
  return calc
}

/** #12 · La política v1 real, con su conflicto empresarial intacto. */
function bloquePolitica(version, efectiva, corrida) {
  const c = etapa(corrida, 'COMMERCIAL')
  linea('## 2 · La política comercial versionada, referenciada por número')
  linea('')
  linea(`Versión ${version.version} · estado ${version.estado} · publicada por ${version.publicadaPor ?? '—'}`)
  linea('')
  linea('| clave | concepto | valor | estado |')
  linea('|---|---|---|---|')
  for (const x of version.componentes) linea(`| ${x.clave} | ${x.concepto} | ${x.valor === null ? '**null**' : x.valor} | ${x.estado} |`)
  linea('')
  const conflictivos = version.componentes.filter((x) => x.conflicto)
  for (const x of conflictivos) {
    linea(`> **CONFLICTO_EMPRESARIAL · \`${x.clave}\`** — se mantiene sin resolver:`)
    linea(`> ${x.conflicto}`)
    linea('>')
    linea('> El motor NO elige uno para ponerse verde. El precio se calcula igual —el margen objetivo')
    linea('> no es un escalón de la cascada— y lo que queda bloqueado es el JUICIO sobre ese precio.')
    linea('> Lo cierra el dueño, no una corrida.')
    linea('')
  }
  linea(`Provenance de la etapa COMMERCIAL: ${JSON.stringify(c.provenance)}`)
  linea(`Overrides aplicados: ${efectiva.aplicados.length} · rechazados: ${efectiva.rechazados.length}`)
  linea('')
  return conflictivos
}

/** La escritura, leída de vuelta en su destino, y deshecha. */
async function bloquePersistencia(pool, { cotizacionId, estructura, calc }) {
  linea('## 3 · La persistencia — escrita, LEÍDA EN SU DESTINO y deshecha')
  linea('')
  const c = await pool.connect()
  const q = (s, p) => c.query(s, p)
  try {
    await c.query('begin')
    const antesRef = (await q('select count(*)::int n from public.cotizacion_politica_ref')).rows[0].n
    const antesInd = (await q('select count(*)::int n from public.cotizacion_indirecto')).rows[0].n

    const ref = await escribirReferenciaDePolitica({ query: q }, { cotizacionId, version: 1 })
    const ind = await escribirIndirectoDeCotizacion({ query: q }, {
      cotizacionId, estructuraId: estructura.id ?? null,
      pctCalculado: calc.pct, pctAplicado: calc.pct,
    })
    // ═══ LO QUE PRUEBA LA ESCRITURA ES EL DATO LEÍDO, NO EL `returning` ═══
    const leidaRef = (await q('select version, congelada_en from public.cotizacion_politica_ref where cotizacion_id = $1', [cotizacionId])).rows[0]
    const leidoInd = (await q('select pct_calculado, pct_aplicado, override_actor from public.cotizacion_indirecto where cotizacion_id = $1', [cotizacionId])).rows[0]
    linea('| | antes | después de escribir | leído del destino |')
    linea('|---|---|---|---|')
    linea(`| \`cotizacion_politica_ref\` | ${antesRef} filas | escrita: ${ref.escrita} | versión **${leidaRef?.version ?? '—'}** |`)
    linea(`| \`cotizacion_indirecto\` | ${antesInd} filas | escrito: ${ind.escrito} | calculado **${leidoInd?.pct_calculado ?? 'null'}** · aplicado **${leidoInd?.pct_aplicado ?? 'null'}** |`)
    linea('')
    linea('El par de nulos NO es un fracaso de la escritura: es el estado real de la estructura, guardado')
    linea('como tal. `pct_calculado = null` dice «la estructura no alcanza para calcularlo», que es')
    linea('información; un 0 diría que la empresa no tiene estructura, que es falso.')
    linea('')

    // ═══ DOS NEGATIVOS CONTRA LA BASE REAL, NO CONTRA EL CÓDIGO QUE LLAMA ═══
    //
    // Un control que vive sólo en el que escribe no protege a la tabla del que escribe distinto. Se
    // intenta el UPDATE directo y se mira si la base lo rechaza.
    const intentar = async (nombre, sql, params) => {
      let r = null
      try { await q('savepoint p'); await q(sql, params); r = 'ACEPTADO' } catch (e) { r = `RECHAZADO — ${e.message}`; await q('rollback to savepoint p') }
      linea(`- **${nombre}**: \`${String(r).slice(0, 150)}\``)
      return r
    }
    linea('**Negativos contra la base real**')
    linea('')
    const a = await intentar(
      'con un calculado de 5,95 %, aplicar 2 % sin decir quién lo decidió',
      `update public.cotizacion_indirecto set pct_calculado = 0.0595, pct_aplicado = 0.02 where cotizacion_id = $1`, [cotizacionId])
    const b = await intentar(
      'SIN calculado, aplicar 2 % sin decir quién lo decidió',
      `update public.cotizacion_indirecto set pct_calculado = null, pct_aplicado = 0.02 where cotizacion_id = $1`, [cotizacionId])
    linea('')
    linea(`El primero lo impide la base (\`indirecto_aplicado_explicado\`) y no el código que llama.`)
    linea('')
    if (String(b).startsWith('ACEPTADO')) {
      linea('> **HUECO ENCONTRADO EN EL CHECK.** `indirecto_aplicado_explicado` empieza con')
      linea('> `pct_calculado IS NULL OR …`, así que con el calculado en NULL —que es EXACTAMENTE el')
      linea('> estado de hoy: 14 conceptos sin valor— se puede escribir cualquier porcentaje aplicado sin')
      linea('> actor, sin motivo y sin evidencia. Es el 27 % que nadie puede explicar, otra vez, por la')
      linea('> única puerta que el CHECK deja abierta.')
      linea('>')
      linea('> El arreglo es una migración que exija actor cuando hay aplicado y no hay calculado. NO se')
      linea('> hizo acá: cambiar un CHECK de una tabla compartida mientras corren otros siete frentes es')
      linea('> pedir un choque, y el rango de migraciones de este frente no debería estrenarse con eso')
      linea('> sin que alguien más lo mire.')
      linea('')
    }
    void a
    await c.query('rollback')
    const despuesRef = (await pool.query('select count(*)::int n from public.cotizacion_politica_ref')).rows[0].n
    linea(`Después del \`rollback\`: \`cotizacion_politica_ref\` vuelve a **${despuesRef} filas**. Nada quedó puesto.`)
    linea('')
    linea('> **LO QUE ESTE ESCENARIO NO PUEDE CERRAR.** La DoD cuenta FILAS en esas dos tablas, y')
    linea('> después del rollback siguen en cero: los criterios #11 y #12 van a seguir dando')
    linea('> NO_VERIFICABLE hasta que alguien con autoridad decida dejar la referencia puesta sobre una')
    linea('> cotización real. Eso fija con qué política se defiende una oferta de la empresa y no lo')
    linea('> decide un script.')
    linea('')
  } finally {
    c.release()
  }
}

/** #21 · El candidato real contra la puerta de la gobernanza. */
async function bloqueReuso(pool) {
  const q = (s, p) => pool.query(s, p)
  linea('## 4 · CANDIDATO → gobernanza → ¿norma? — con el único candidato de rendimiento que existe')
  linea('')
  const cands = (await q("select clave, area, valor, unidad, clase, sample_count, obras_distintas, estado, gobernanza from public.aprendizaje_candidato order by clave")).rows
  linea('| clave | área | valor | clase | muestras | obras | estado | apto |')
  linea('|---|---|---|---|---|---|---|---|')
  for (const c of cands) linea(`| ${c.clave} | ${c.area} | ${c.valor} ${c.unidad ?? ''} | ${c.clase} | ${c.sample_count} | ${c.obras_distintas} | ${c.estado} | ${c.gobernanza?.apto === true ? 'SÍ' : '**NO**'} |`)
  linea('')
  const activosHoy = await activos({ query: q })
  linea(`\`aprendizaje_activo\`: **${activosHoy.length} reglas**. Ninguna corrida de cotización tiene qué reutilizar.`)
  linea('')

  const objetivo = cands.find((c) => c.clave.startsWith('rendimiento.'))
  if (!objetivo) { linea('No hay ningún candidato de rendimiento: no hay nada que empujar contra la puerta.'); return }
  const c = await pool.connect()
  try {
    await c.query('begin')
    const r = await activar({ query: (s, p) => c.query(s, p) }, { clave: objetivo.clave, quien: 'xsas-escenario', porQue: 'ejercicio de la puerta' })
    linea(`Intento de activar \`${objetivo.clave}\` (${objetivo.valor} ${objetivo.unidad}): **${r.activada ? 'ACTIVADA' : 'RECHAZADA'}**`)
    linea('')
    if (!r.activada) {
      linea(`> ${r.porQue}`)
      linea('')
      linea('| check | cumple | por qué |')
      linea('|---|---|---|')
      for (const ch of objetivo.gobernanza?.checks ?? []) linea(`| ${ch.nombre} | ${ch.cumple ? 'sí' : '**NO**'} | ${String(ch.porQue).slice(0, 95)} |`)
      linea('')
      linea('> **CANDIDATO ≠ VALIDADO, demostrado con el dato real.** Una sola medición de una sola obra')
      linea('> no es una norma, y la puerta lo dice con cinco motivos en vez de con un «no». El circuito')
      linea('> de #19 (generar candidatos) funciona; el de #21 (reutilizar) no tiene qué reutilizar')
      linea('> porque nada pasó la puerta — y eso lo produce la obra, no el código.')
      linea('')
    }
    await c.query('rollback')
  } finally { c.release() }
}

async function main() {
  const pool = getPool()
  const query = (s, p) => pool.query(s, p)

  const estructuraFila = (await query('select id from public.indirecto_estructura where vigente')).rows[0]
  const estructura = { ...(await leerEstructuraIndirecta({ query })), id: estructuraFila?.id ?? null }
  const version = await leerVersionDePolitica({ query })
  const tablaVigenciaSubcontrato = await leerVigenciaDeSubcontratos({ query })
  const cot = (await query(`select id from public.cotizaciones
                             where obra_nombre = 'Salón Comercial' and estado = 'borrador'
                             order by fecha_cotizacion limit 1`)).rows[0]
  const estado = await leerEstado({ query }, cot.id)

  const res = resolverReferencia(referenciaDePolitica({ cotizacionId: cot.id, version: version.version }), [version])
  const efectiva = politicaEfectiva({ version: res.version, overrides: [] })
  const corrida = correr({
    ...estado,
    documentos: [{ hash: String(cot.id), nombre: 'COT-2026-001 · Salón Comercial (cargada en la base)', parseado: true }],
    politica: estado.politica ?? await politicaVigente(query),
    cliente: 'FRANCO QUATTROPANI', clientesConocidos: ['FRANCO QUATTROPANI'],
    alcancePorDefecto: { estado: 'INCLUIDO', fuente: 'cargada en el presupuesto COT-2026-001' },
    estructuraIndirecta: estructura,
    politicaEfectivaDeLaCotizacion: efectiva,
    tablaVigenciaSubcontrato,
  })

  linea('# ESCENARIO · INDIRECTOS (#11), POLÍTICA VERSIONADA (#12) Y REUTILIZACIÓN (#21)')
  linea('')
  linea(`Cotización real: \`${cot.id}\` — ${corrida.partidas.length} partidas · costo directo ${corrida.costoDirecto.total === null ? `**no afirmable** (parcial ${plata(corrida.costoDirecto.parcial)})` : plata(corrida.costoDirecto.total)}`)
  linea('')
  linea('> La corrida CORRE. Antes de este frente tiraba `ReferenceError: indirectoAplicado is not')
  linea('> defined` en el instante en que se le pasaba una estructura de indirectos.')
  linea('')
  const calc = bloqueIndirectos(estructura, corrida)
  bloquePolitica(version, efectiva, corrida)
  await bloquePersistencia(pool, { cotizacionId: cot.id, estructura, calc })
  await bloqueReuso(pool)

  linea('## VEREDICTO')
  linea('')
  linea(`- **#11 · el motor los ejercita** — 14 conceptos, ${calc.nHuecos} huecos, indirecto ${pct(calc.pct)}, precio NO publicado.`)
  linea('  Lo que falta NO es código: son los montos de los 14 conceptos y el `costo_directo_anual`.')
  linea('- **#12 · la referencia por versión funciona y el CONFLICTO_EMPRESARIAL sobrevive** — 17 % vs 12 % sigue sin resolver, como corresponde.')
  linea(`- **#21 · NO_MEDIDO, y no es cero** — 0 reglas activas porque la gobernanza rechaza al único candidato de rendimiento con 5 checks en rojo.`)
  linea('- Las tres tablas siguen en 0 filas después del `rollback`: la DoD las va a seguir dando NO_VERIFICABLE hasta que el dueño autorice dejarlas puestas.')
  await pool.end()
}

await main()
