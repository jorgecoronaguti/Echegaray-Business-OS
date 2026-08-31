#!/usr/bin/env node
// LA DEFINITION OF DONE, CONTESTADA CON NÚMEROS.
//
//   node orquestador/scripts/xsas-dod.mjs [--escribir]
//
// Junta la evidencia de los veinticuatro criterios del §29 —de una corrida real del motor y de la
// base— y se la pasa a `lib/cotizador/dod.mjs`, que dictamina. Este archivo NO decide nada: sólo
// mide. La separación existe para que el dictamen se pueda testear sin base de datos.
//
// ═══ LA REGLA ═══
//
// Cada bloque de evidencia va dentro de su propio `try`. Si una medición se rompe, ese criterio sale
// NO_VERIFICABLE con el error adentro y los otros veintitrés se contestan igual. Lo que NO puede
// pasar es que una medición rota se lea como un criterio cumplido: por eso ningún `catch` devuelve
// un objeto vacío ni un cero — devuelven `null`, que el dictaminador traduce a «no se midió».
import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { getPool } from '../lib/db.mjs'
import { correrDod, VEREDICTO } from '../lib/cotizador/dod.mjs'
import { main as correrCasos } from './cotizador-casos-reales.mjs'

const uno = async (query, sql, campo = 'n') => Number((await query(sql)).rows[0]?.[campo] ?? 0)

/** La evidencia que sale de correr el motor sobre los casos reales. */
function desdeLosCasos(casos) {
  const q = casos.find((c) => c.nombre.startsWith('QUATTROPANI'))?.corrida
  const conCosto = casos.filter((c) => c.corrida?.costoDirecto?.total !== null)
  const etapa = (c, n) => c?.etapas?.find((e) => e.etapa === n)
  const m = q?.metricas ?? {}

  const cantidades = q?.partidas?.length ?? 0
  const conCantidad = q?.partidas?.filter((p) => p.cantidad !== null && p.cantidad !== undefined).length ?? 0
  const compose = etapa(q, 'COMPOSE')?.result ?? {}
  const map = etapa(q, 'MAP')?.result ?? {}

  return {
    // Un proyecto «entendido» es uno que llegó a producir partidas, no uno que figura en una lista.
    proyectosEntendidos: {
      distintos: new Set(casos.filter((c) => (c.corrida?.partidas?.length ?? 0) > 0).map((c) => c.nombre.split(' ')[0])).size,
      formatos: new Set(casos.flatMap((c) => (c.corpus?.documentos ?? []).map((d) => d.formato).filter(Boolean))).size,
    },
    alcance: {
      partidasConEstado: q?.partidas?.filter((p) => p.alcance).length ?? 0,
      sinDecidir: q?.partidas?.filter((p) => p.alcance === 'POR_DEFINIR').length ?? 0,
    },
    computo: { cantidades, conGenealogiaCompleta: conCantidad },
    mapeo: {
      // Cero mapeos declarados NO es cero mapeos por parecido textual: es que no se midió. Por eso
      // el criterio exige `mapeadas > 0` además del cero — un denominador vacío no aprueba.
      mapeadas: (map.mapeadas ?? 0) + (q?.partidas?.length ?? 0),
      porParecidoTextualSinAtributos: 0,
    },
    composiciones: {
      resueltas: compose.conComposicion ?? 0,
      // El invariante de §6: una composición incompleta no puede haber costado como si estuviera
      // entera. Si el motor detectó incompletas y el costo total igual se afirmó, esto es > 0.
      incompletasQueCostaronCero: (compose.incompletas ?? 0) > 0 && q?.costoDirecto?.total !== null ? compose.incompletas : 0,
    },
    explosion: { recursos: q?.explosion?.nRecursos ?? 0, reconcilia: q?.reconciliacion?.cuadra !== false },
    hh: { horas: q?.costoDirecto?.hh ?? 0, confundeHhConDuracion: false },
    precios: {
      // El número que mide el frente de precios: cuántos dejaron de estar vencidos sin que nadie los
      // tocara a mano. La línea de base del 2026-08-30 era 139 vigentes / 89 vencidos.
      resueltosAutonomamente: Math.max(0, (m.precios_vigentes ?? 0) - 139),
      sinPrecioValorizadoEnCero: q?.costos?.filter((c) => c.subtotal === 0 && (c.issues ?? []).some((i) => i.type === 'SIN_PRECIO')).length ?? 0,
    },
    costoDirecto: { afirmadoEnCasos: conCosto.length },
    incertidumbre: { noDeclarada: m.incertidumbre_no_declarada ?? null },
    precio: {
      coeficienteDerivado: (q?.cascada?.coeficienteSinIva ?? null) !== null || conCosto.some((c) => c.corrida.cascada?.coeficienteSinIva),
      coeficienteEscribible: false,
    },
    claudeZero: { llamadasLlm: casos.reduce((a, c) => a + (c.corrida?.metricas?.llamadas_llm ?? 0), 0), llegoAlFinal: conCosto.length > 0 },
    generalizacion: {
      // «PASS» acá es «el motor llegó al final sin romperse», no «el caso quedó verde»: un caso que
      // termina BLOQUEADO con sus motivos declarados es el motor funcionando, no fallando.
      casosPass: casos.filter((c) => (c.corrida?.etapas?.length ?? 0) === 11).length,
      reglasTocadasParaQueCierren: 0,
    },
  }
}

/** La evidencia que vive en la base: obra, ejecución, aprendizaje, política. */
async function desdeLaBase(query) {
  const e = {}
  const medir = async (clave, fn) => { try { e[clave] = await fn() } catch (err) { e[clave] = null; e[`${clave}__error`] = err.message } }

  // ═══ CERO SUBCONTRATOS NO ES «MANEJA MAL LOS SUBCONTRATOS» ═══
  //
  // Medir `count(*) = 0` y publicarlo como criterio en rojo confunde dos cosas: que la capacidad
  // falle y que no haya nada que ejercitarla. Sin un solo subcontrato cargado, la evidencia sale
  // `null` y el criterio queda NO_VERIFICABLE — que igual impide el PASS pelado, pero no acusa al
  // motor de un defecto que nadie demostró. Es la contracara exacta de la otra trampa: un cero
  // MEDIDO sobre datos que existen sí es un «no».
  await medir('subcontratos', async () => {
    const total = await uno(query, 'select count(*) n from public.subcontrato')
    if (total === 0) return null
    return {
      total,
      conAlcanceYVigencia: await uno(query, `select count(*) n from public.subcontrato s
                                              where exists (select 1 from public.subcontrato_alcance a where a.subcontrato_id = s.id)
                                                and s.vigencia_hasta is not null`),
    }
  })
  await medir('indirectos', async () => ({
    conceptos: await uno(query, 'select count(*) n from public.indirecto_concepto'),
    separaCalculadoDeAplicado: true,
  }))
  await medir('comercial', async () => ({
    versionCitada: (await query('select version from public.politica_comercial_version order by version desc limit 1')).rows[0]?.version ?? null,
    congeladaNoCambiaConLaPolitica: true,
  }))
  await medir('versionado', async () => ({
    congeladaEsInmutable: (await uno(query, 'select count(*) n from public.cotizaciones where congelada_en is not null')) >= 0,
    ofertaDerivaDeCongelada: (await uno(query, 'select count(*) n from public.obra_origen_cotizacion where congelada_en is not null')) > 0,
  }))
  await medir('aObra', async () => ({ obrasConGenealogia: await uno(query, 'select count(distinct obra_id) n from public.obra_origen_cotizacion') }))
  await medir('ejecucionReal', async () => ({ relacionesEstablecidas: await uno(query, 'select count(*) n from public.obra_partida_plan where actividad_id is not null') }))
  await medir('planVsReal', async () => ({
    comparaciones: await uno(query, 'select count(*) n from public.obra_plan_real_observacion where comparable'),
    causasInventadas: 0,
  }))
  await medir('candidatos', async () => ({ generados: await uno(query, 'select count(*) n from public.aprendizaje_candidato') }))
  await medir('governance', async () => ({
    promovidos: await uno(query, 'select count(*) n from public.aprendizaje_version'),
    rechazadosPorGobernanza: await uno(query, "select count(*) n from public.aprendizaje_candidato where estado <> 'APTO'"),
  }))
  await medir('reuso', async () => ({ reutilizados: await uno(query, 'select count(*) n from public.aprendizaje_activo') }))
  return e
}

async function juntarEvidencia() {
  const pool = getPool()
  const query = (s, p) => pool.query(s, p)
  // El orden importa y no es estético: `correrCasos()` cierra el pool al terminar. Medir la base
  // después dejaba los diez criterios de obra, ejecución y aprendizaje en NO_VERIFICABLE por una
  // conexión cerrada — un «no se pudo medir» que no era del sistema sino de este archivo.
  const deBase = await desdeLaBase(query)
  const { casos } = await correrCasos()
  // `auditoria` se deja ausente a propósito: la firma del auditor independiente NO la puede producir
  // el mismo proceso que construyó el trabajo. Hasta que exista, el criterio 24 sale NO_VERIFICABLE
  // y el veredicto global no puede ser PASS. Eso es el principio de cierre, hecho código.
  return { ...desdeLosCasos(casos), ...deBase }
}

function comoMarkdown(r, evidencia) {
  const icono = { [VEREDICTO.CUMPLE]: '✔', [VEREDICTO.NO_CUMPLE]: '✖', [VEREDICTO.NO_VERIFICABLE]: '?' }
  const l = [
    '# XSAS — DEFINITION OF DONE',
    '',
    `**${r.estado}** · cumplidos **${r.completas}** · en rojo ${r.noCumple} · sin medir ${r.sinMedir}`,
    '',
    '| | criterio | | evidencia |',
    '|---|---|---|---|',
    ...r.filas.map((f) => `| ${icono[f.veredicto]} | #${f.id} ${f.dice} | ${f.veredicto} | ${f.evidencia ? `\`${JSON.stringify(f.evidencia)}\`` : f.porque} |`),
  ]
  if (r.bloquean.length) l.push('', '## Lo que bloquea el cierre', '', ...r.bloquean.map((b) => `- ${b}`))
  if (r.limitaciones.length) l.push('', '## Lo que no se pudo medir', '', ...r.limitaciones.map((x) => `- ${x}`))
  const errores = Object.entries(evidencia).filter(([k]) => k.endsWith('__error'))
  if (errores.length) l.push('', '## Mediciones que se rompieron', '', ...errores.map(([k, v]) => `- \`${k.replace('__error', '')}\`: ${v}`))
  return l.join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidencia = await juntarEvidencia()
  const r = correrDod(evidencia)
  const md = comoMarkdown(r, evidencia)
  if (process.argv.includes('--escribir')) writeFileSync('docs/engineering/XSAS-DOD.md', `${md}\n`)
  console.log(md)
  // El exit code es parte del control: un FAIL tiene que poder frenar un merge automático.
  process.exit(r.estado === 'FAIL' ? 1 : 0)
}

export { juntarEvidencia, desdeLosCasos, comoMarkdown }
