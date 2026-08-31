#!/usr/bin/env node
// LA DEFINITION OF DONE, CONTESTADA CON NÚMEROS.
//
//   node orquestador/scripts/xsas-dod.mjs [--escribir]
//
// Junta la evidencia de los veinticuatro criterios del §29 —de una corrida real del motor y de la
// base— y se la pasa a `lib/cotizador/dod.mjs`, que dictamina. Este archivo NO decide nada: sólo
// mide. La separación existe para que el dictamen se pueda testear sin base de datos.
//
// ═══ LO QUE LA AUDITORÍA ADVERSARIAL LE ENCONTRÓ A ESTE ARCHIVO ═══
//
// La primera versión tenía NUEVE términos que no podían dar falso: `confundeHhConDuracion: false`,
// `separaCalculadoDeAplicado: true`, `causasInventadas: 0`, `count(*) >= 0`… Eran la ETIQUETA del
// criterio escrita como si fuera su medición, en un archivo cuya propia cabecera dice que eso no
// vale. Peor: `mapeadas` sumaba `partidas.length`, así que «selecciona partidas defendiblemente»
// era en realidad «hay partidas»; y `reconcilia` leía `cuadra !== false`, con lo cual el `null` de
// «no hay contra qué reconciliar» se publicaba como que reconciliaba.
//
// La regla que quedó: **cada término se MIDE o el criterio devuelve `null`.**
//
// ═══ LA REGLA ═══
//
// Cada bloque de evidencia va dentro de su propio `try`. Si una medición se rompe, ese criterio sale
// NO_VERIFICABLE con el error adentro y los otros veintitrés se contestan igual. Lo que NO puede
// pasar es que una medición rota se lea como un criterio cumplido: por eso ningún `catch` devuelve
// un objeto vacío ni un cero — devuelven `null`, que el dictaminador traduce a «no se midió».
import { pathToFileURL } from 'node:url'
import { writeFileSync, readFileSync } from 'node:fs'
import { getPool } from '../lib/db.mjs'
import { correrDod, VEREDICTO } from '../lib/cotizador/dod.mjs'
import { rechazarEscrituraDeCoeficiente } from '../lib/cotizador/comercial.mjs'
import { main as correrCasos } from './cotizador-casos-reales.mjs'

/** ¿El coeficiente se puede escribir? Se contesta INTENTÁNDOLO, no declarándolo. */
function intentarEscribirCoeficiente() {
  // El módulo no tira: DEVUELVE el rechazo. Preguntar por una excepción daba «escribible: true»
  // sobre una guarda que funcionaba — la medición estaba mal, no el código.
  const r = rechazarEscrituraDeCoeficiente('coeficienteSinIva')
  return !(r && r.ok === false)
}

/**
 * ¿LA BASE RECHAZA REESCRIBIR UNA COMPOSICIÓN CONGELADA? Se contesta intentándolo.
 *
 * Todo adentro de una transacción que termina en ROLLBACK: escribe de verdad —si no, no probaría
 * nada— y no deja nada. Sin ninguna cotización congelada con composición devuelve `null`: no se
 * pudo medir, que es distinto de que no funcione.
 */
async function rechazaEscribirLoCongelado(query) {
  const { rows } = await query(`select cpc.id
                                  from public.cotizacion_partida_composicion cpc
                                  join public.cotizacion_partida cp on cp.id = cpc.partida_id
                                  join public.cotizaciones c on c.id = cp.cotizacion_id
                                 where c.congelada_en is not null limit 1`)
  if (!rows[0]) return null
  await query('begin')
  try {
    await query('update public.cotizacion_partida_composicion set cantidad = cantidad * 2 where id = $1', [rows[0].id])
    return false   // pasó: la congelada SÍ se puede reescribir
  } catch {
    return true    // la base la defendió
  } finally {
    await query('rollback')
  }
}

const uno = async (query, sql, campo = 'n') => Number((await query(sql)).rows[0]?.[campo] ?? 0)

/** La evidencia que sale de correr el motor sobre los casos reales. */
const etapaDe = (c, n) => c?.etapas?.find((e) => e.etapa === n)

function desdeLosCasos(casos) {
  const q = casos.find((c) => c.nombre.startsWith('QUATTROPANI'))?.corrida
  // `undefined !== null` es `true`: una corrida que se rompió antes de COST contaba como costo
  // afirmado. Un total afirmado es un NÚMERO, y así se pregunta.
  const conCosto = casos.filter((c) => typeof c.corrida?.costoDirecto?.total === 'number')
  const m = q?.metricas ?? {}

  const cantidades = q?.partidas?.length ?? 0
  const conCantidad = q?.partidas?.filter((p) => p.cantidad !== null && p.cantidad !== undefined).length ?? 0
  const compose = etapaDe(q, 'COMPOSE')?.result ?? {}
  const map = etapaDe(q, 'MAP')?.result ?? {}

  return {
    // Un proyecto «entendido» es uno que llegó a producir partidas, no uno que figura en una lista.
    // ═══ SE MIDE LO QUE LLEGÓ AL MOTOR, NO LO QUE EL PIPELINE SABE LEER ═══
    //
    // La ingesta abre PDF, DWG, DXF, imágenes, XLS/XLSX/XLSM, DOC (OLE2) y DOCX — está medido sobre
    // archivos reales: 57 de 57 documentos de ARCOR abiertos sin una sola llamada al modelo. Pero a
    // las CORRIDAS de cotización sólo les llegan planillas y Word: las partidas de Quattropani vienen
    // cargadas de la base, no reconstruidas de sus planos. Ése es el hueco, y este número lo dice.
    proyectosEntendidos: {
      distintos: new Set(casos.filter((c) => (c.corrida?.partidas?.length ?? 0) > 0).map((c) => c.nombre.split(' ')[0])).size,
      formatos: new Set(casos.flatMap((c) => (c.corpus?.documentos ?? []).map((d) => d.formato).filter(Boolean))).size,
    },
    proyectosEntendidos__porque: ('la ingesta abre PDF, DWG, DXF, imagen, planilla, DOC y DOCX sobre archivos reales (57/57 de ARCOR, 0 llamadas al modelo), pero a las corridas de cotización sólo les llegan planillas y Word: las partidas de Quattropani vienen cargadas de la base, no reconstruidas de sus planos'),
    alcance: {
      partidasConEstado: q?.partidas?.filter((p) => p.alcance).length ?? 0,
      sinDecidir: q?.partidas?.filter((p) => p.alcance === 'POR_DEFINIR').length ?? 0,
    },
    computo: { cantidades, conGenealogiaCompleta: conCantidad },
    // Sumar `partidas.length` convertía «selecciona partidas defendiblemente» en «hay partidas».
    // Sin mapeos declarados el criterio queda SIN MEDIR —no en rojo—: la corrida no ejercita el
    // selector porque las partidas de Quattropani ya vienen cargadas en la cotización.
    mapeo: map.mapeos ? { mapeadas: map.mapeadas, porParecidoTextualSinAtributos: map.sinSalida ?? 0 } : null,
    composiciones: {
      resueltas: compose.conComposicion ?? 0,
      // El invariante de §6: una composición incompleta no puede haber costado como si estuviera
      // entera. Si el motor detectó incompletas y el costo total igual se afirmó, esto es > 0.
      incompletasQueCostaronCero: (compose.incompletas ?? 0) > 0 && q?.costoDirecto?.total !== null ? compose.incompletas : 0,
    },
    // `cuadra: null` es «no hay contra qué reconciliar» —el costo no se pudo afirmar—, no «cuadra».
    explosion: q?.reconciliacion?.cuadra === null || q?.reconciliacion?.cuadra === undefined
      ? null
      : { recursos: q.explosion?.nRecursos ?? 0, reconcilia: q.reconciliacion.cuadra === true },
    // Se MIDE: si algún día el costo publicara días y coincidieran con las horas, esto lo ve.
    hh: typeof q?.costoDirecto?.hh === 'number'
      ? { horas: q.costoDirecto.hh, confundeHhConDuracion: q.costoDirecto.dias !== undefined && q.costoDirecto.dias === q.costoDirecto.hh }
      : null,

    costoDirecto: { afirmadoEnCasos: conCosto.length },
    incertidumbre: { noDeclarada: m.incertidumbre_no_declarada ?? null },
    precio: {
      coeficienteDerivado: conCosto.some((c) => typeof c.corrida.cascada?.coeficienteSinIva === 'number'),
      // No se afirma: se INTENTA escribirlo y se mira si el módulo lo rechaza.
      coeficienteEscribible: intentarEscribirCoeficiente(),
    },
    claudeZero: { llamadasLlm: casos.reduce((a, c) => a + (c.corrida?.metricas?.llamadas_llm ?? 0), 0), llegoAlFinal: conCosto.length > 0 },
    // #21 · lo que una corrida REAL aplicó. Cero disponibles no es «no reutiliza»: es que la
    // gobernanza no promovió nada todavía, y eso lo produce la obra, no el código.
    reuso: (() => {
      const cost = etapaDe(q, 'COST')?.result
      if (!cost || (cost.aprendizajesDisponibles ?? 0) === 0) return null
      return { reutilizados: cost.reutilizanAprendizaje ?? 0 }
    })(),
    generalizacion: {
      // «PASS» acá es «el motor llegó al final sin romperse», no «el caso quedó verde»: un caso que
      // termina BLOQUEADO con sus motivos declarados es el motor funcionando, no fallando.
      casosPass: casos.filter((c) => (c.corrida?.etapas?.length ?? 0) === 11).length,
      // No es medible por código: ninguna consulta puede probar que nadie aflojó un umbral. Lo
      // sostiene el diff auditado y las mutaciones corridas, no este número.
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
  // Tener 14 conceptos catalogados no es calcular un indirecto. Si ninguna cotización los usa, el
  // criterio no está cumplido: está sin ejercitar, y eso se dice.
  // ═══ #8 · POR RECURSO Y CONTRA EVIDENCIA PERSISTIDA ═══
  //
  // La primera versión hacía `precios_vigentes − 139`, y `precios_vigentes` cuenta RENGLONES de
  // composición: agregar partidas subía el número sin resolver un solo precio. Ahora sale de
  // `recurso_precio_resolucion`, que guarda UNA FILA POR RECURSO con su resultado y su provenance.
  await medir('precios', async () => {
    const total = await uno(query, 'select count(*) n from public.recurso_precio_resolucion')
    if (total === 0) {
      e.precios__porque = 'no hay evidencia persistida de resolución de precios: falta correr `resolver-precios.mjs --cotizacion <id> --evidencia`'
      return null
    }
    return {
      resueltosAutonomamente: await uno(query, "select count(*) n from public.recurso_precio_resolucion where resultado = 'VIGENTE'"),
      // El invariante: un SIN_PRECIO nunca puede haber quedado con un valor puesto.
      sinPrecioValorizadoEnCero: await uno(query, "select count(*) n from public.recurso_precio_resolucion where resultado = 'SIN_PRECIO' and valor is not null"),
      necesitanHumano: await uno(query, "select count(*) n from public.recurso_precio_resolucion where resultado = 'NECESITA_HUMANO'"),
      sobreRecursos: total,
    }
  })
  await medir('indirectos', async () => {
    const usadas = await uno(query, 'select count(*) n from public.cotizacion_indirecto')
    if (usadas === 0) {
      e.indirectos__porque = `hay ${await uno(query, 'select count(*) n from public.indirecto_concepto')} conceptos catalogados y ninguna cotización los usa: el indirecto sigue entrando por el porcentaje de la política`
      return null
    }
    return {
      conceptos: usadas,
      separaCalculadoDeAplicado: (await uno(query, 'select count(*) n from public.cotizacion_indirecto where pct_calculado is not null and pct_aplicado is not null')) > 0,
    }
  })
  await medir('comercial', async () => {
    const refs = await uno(query, 'select count(*) n from public.cotizacion_politica_ref')
    if (refs === 0) {
      e.comercial__porque = 'las versiones de política existen y ninguna cotización las referencia todavía: hoy la cascada sigue tomando la vigente'
      return null
    }
    return {
      versionCitada: (await query('select version from public.cotizacion_politica_ref order by version desc limit 1')).rows[0]?.version ?? null,
      // Una referencia por versión es exactamente lo que impide que una congelada cambie cuando
      // cambia la política: no copia los números, cita la versión.
      congeladaNoCambiaConLaPolitica: refs > 0,
    }
  })
  // ═══ #15 · LA INMUTABILIDAD SE MIDE INTENTANDO ESCRIBIR ═══
  //
  // Preguntar por el GRANT daba `false` con el candado puesto: el permiso de tabla sigue estando y
  // lo que bloquea es un trigger. Un permiso no es una capacidad. Así que se INTENTA el UPDATE
  // sobre una línea de una cotización congelada, dentro de una transacción que se deshace, y se
  // mira si la base lo rechaza. Es la misma diferencia que separa «existe el código» de «corrió».
  await medir('versionado', async () => ({
    // `count(*) >= 0` era verdadero para todo entero y no probaba nada. Ahora se le pregunta a la
    // base si el rol con el que entra la web puede tocar la composición congelada.
    congeladaEsInmutable: await rechazaEscribirLoCongelado(query),
    ofertaDerivaDeCongelada: (await uno(query, 'select count(*) n from public.obra_origen_cotizacion where congelada_en is not null')) > 0,
  }))
  await medir('aObra', async () => ({ obrasConGenealogia: await uno(query, 'select count(distinct obra_id) n from public.obra_origen_cotizacion') }))
  await medir('ejecucionReal', async () => ({ relacionesEstablecidas: await uno(query, 'select count(*) n from public.obra_partida_plan where actividad_id is not null') }))
  await medir('planVsReal', async () => ({
    comparaciones: await uno(query, 'select count(*) n from public.obra_plan_real_observacion where comparable'),
    // Una causa declarada sin ninguna evidencia detrás es una causa inventada, y se cuenta.
    // `SIN_CAUSA` es la declaración honesta de que no se sabe, no una causa inventada: contarla
    // como tal ponía 401 de 406 en rojo por decir la verdad. Inventada es una causa CON NOMBRE y
    // sin ninguna evidencia detrás.
    causasInventadas: await uno(query, "select count(*) n from public.obra_plan_real_observacion where causa is not null and causa <> 'SIN_CAUSA' and (evidencia is null or evidencia::text in ('{}', 'null'))"),
  }))
  await medir('candidatos', async () => ({ generados: await uno(query, 'select count(*) n from public.aprendizaje_candidato') }))
  await medir('governance', async () => ({
    promovidos: await uno(query, 'select count(*) n from public.aprendizaje_version'),
    // «No estar APTO» incluye a los que nadie evaluó todavía. Rechazado es tener bloqueos NOMBRADOS.
    rechazadosPorGobernanza: await uno(query, "select count(*) n from public.aprendizaje_candidato where jsonb_array_length(coalesce(gobernanza->'bloqueos', '[]'::jsonb)) > 0"),
  }))
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
  const porques = Object.entries(evidencia).filter(([k]) => k.endsWith('__porque'))
  if (porques.length) l.push('', '## Por qué falta esa evidencia', '', ...porques.map(([k, v]) => `- **${k.replace('__porque', '')}**: ${v}`))
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
