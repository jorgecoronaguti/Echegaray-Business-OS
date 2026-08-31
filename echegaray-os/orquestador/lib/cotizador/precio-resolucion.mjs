// CÓMO XSAS CONSIGUE UN PRECIO SOLO — la cascada del §8, entera y en un solo lugar.
//
// ═══ EL PROBLEMA QUE RESUELVE ═══
//
// Medido el 30/08/2026 sobre la base real: de 389 recursos con precio, **285 están vencidos y 38 no
// tienen fecha. Quedan 66 usables: el 17%**. Con eso, cualquier presupuesto que toque más de cinco
// recursos sale con la mitad de las líneas en rojo, y el sistema le pide al dueño que resuelva 285
// cosas de a una. Eso no es un cotizador: es una lista de tareas con forma de cotizador.
//
// La salida NO es actualizar los 285 a mano —el dueño lo prohibió textualmente y tiene razón: en
// seis meses vuelven a estar vencidos—. La salida es que el sistema sepa CONSEGUIR un precio, y que
// moleste sólo cuando de verdad quedó una decisión.
//
// ═══ EL ORDEN NO ES UN DETALLE: ES LA PROCEDENCIA ═══
//
//   1. INTERNO      — el catálogo de ECSAS, si está vigente. Es lo que la empresa ya decidió.
//   2. COMPRA_ECSAS — lo que ECSAS PAGÓ. Es el hecho más fuerte que existe: hay una factura.
//   3. COMPARABLE   — una observación de un recurso equivalente. Es una inferencia, y se dice.
//   4. WEB          — una lista publicada. Sirve, y NO asciende.
//
// Se toma el PRIMERO que esté vigente y se para ahí. Bajar un escalón sin necesidad degrada la
// procedencia de un número que ya teníamos con mejor respaldo, y esa degradación no se ve en el
// total: se ve el día que el cliente pregunta de dónde salió.
//
// ═══ LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO ═══
//
//   · NO PROMEDIA. Dos fuentes que no coinciden no se resuelven con su media: eso fabrica un número
//     que nadie observó y que no se puede citar. Se elige una, con su motivo, y la otra queda
//     escrita como descartada. `outlier.mjs` decide cuándo la diferencia obliga a preguntar.
//   · NO ESCRIBE $0 NUNCA. `SIN_PRECIO` sale con `valor: null`. Está probado con una aserción
//     explícita, no con una convención.
//   · NO ASCIENDE LA WEB. Un precio de internet no puede llevar `EXPERIENCIA_ECSAS` ni
//     `BASE_MAESTRA` como fuente: el constructor lo rechaza y tira. No es una advertencia en un
//     comentario, es un `throw`.
//   · NO DECIDE SOLO CUANDO HAY PLATA EN JUEGO. Materialidad manda: un clavo sin precio no frena
//     una oferta de $180 M; el hormigón sí.

import { ESTADO, TIPO_ISSUE, SEVERIDAD, issue } from './contrato.mjs'
import { FUENTE } from '../plano/fuente.mjs'
import { vigenciaDerivada, TRAMO_PARITARIA_HASTA, TRAMO_PARITARIA_FUENTE } from './vigencia.mjs'
import { evaluarCambio, IMPACTO_MATERIAL } from './outlier.mjs'

/** De dónde puede salir un precio. El orden del objeto ES el orden de la cascada. */
export const ORIGEN = Object.freeze({
  INTERNO: 'INTERNO',
  COMPRA_ECSAS: 'COMPRA_ECSAS',
  COMPARABLE: 'COMPARABLE',
  WEB: 'WEB',
})

export const ORDEN_CASCADA = Object.freeze([ORIGEN.INTERNO, ORIGEN.COMPRA_ECSAS, ORIGEN.COMPARABLE, ORIGEN.WEB])

/**
 * QUÉ FUENTE DEL CONTRATO LE CORRESPONDE A CADA ORIGEN. Esta tabla es la que impide que un precio de
 * internet se guarde como experiencia propia: no hay ninguna entrada que mande `WEB` a
 * `EXPERIENCIA_ECSAS`, y `candidatoDePrecio` no acepta que se la pasen por afuera.
 */
export const FUENTE_DE_ORIGEN = Object.freeze({
  INTERNO: FUENTE.BASE_MAESTRA,
  COMPRA_ECSAS: FUENTE.EXPERIENCIA_ECSAS,   // una factura pagada SÍ es experiencia de ECSAS
  COMPARABLE: FUENTE.INFERIDO,
  WEB: FUENTE.WEB,
})

/**
 * ¿ESTE ORIGEN OBSERVÓ AL RECURSO, O LO INFIRIÓ DE OTRA COSA?
 *
 * `INTERNO` y `COMPRA_ECSAS` son observaciones DEL RECURSO: el catálogo lo dice de él, la factura
 * se pagó por él. `COMPARABLE` y `WEB` son inferencias SOBRE él — uno le copia el precio a otro
 * recurso, el otro lo lee de una página que no es de esta empresa.
 *
 * La distinción no cambia la cascada (eso lo hace `ORDEN_CASCADA`): decide cuál de dos candidatos
 * VENCIDOS se le muestra a la persona que va a resolver. Ver `sinVigente`.
 */
export const ES_DEL_RECURSO = Object.freeze({
  INTERNO: true,
  COMPRA_ECSAS: true,
  COMPARABLE: false,
  WEB: false,
})

/** En qué puede terminar una resolución. */
export const RESULTADO = Object.freeze({
  VIGENTE: 'VIGENTE',                   // había un precio interno vigente: no hubo que hacer nada
  ACTUALIZADO: 'ACTUALIZADO',           // el sistema consiguió un precio nuevo y defendible, solo
  NECESITA_HUMANO: 'NECESITA_HUMANO',   // hay número pero queda una decisión real
  SIN_PRECIO: 'SIN_PRECIO',             // no hay con qué. NUNCA cero
})

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))
const dias = (desde, hasta) => Math.floor((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)

/**
 * UN CANDIDATO A PRECIO. PURA, congelada, y VALIDA en el constructor.
 *
 * Los cuatro `throw` de acá son las cuatro maneras en que un precio se vuelve indefendible, y ninguna
 * se detecta después: un precio sin fecha no se puede vencer, uno sin fuente no se puede volver a
 * consultar, un cero no es un precio, y una fuente ascendida miente sobre su procedencia para
 * siempre.
 */
export function candidatoDePrecio({
  recursoCodigo, valor, moneda = 'ARS', origen, observadoEn,
  detalleFuente = null, evidencia = null, proveedor = null, confianza = null,
} = {}) {
  if (!ORIGEN[origen]) throw new Error(`«${origen}» no es un origen de precio conocido: ${ORDEN_CASCADA.join(', ')}`)
  if (!recursoCodigo) throw new Error('un candidato a precio sin recurso no se puede aplicar a nada')
  if (!observadoEn) throw new Error(`el precio de ${recursoCodigo} vino sin fecha: sin fecha no se puede saber si venció`)
  const v = Number(valor)
  if (!Number.isFinite(v) || v <= 0) throw new Error(`«${valor}» no es un precio de ${recursoCodigo}: un precio de cero o negativo no es un precio, es un hueco`)
  if (!detalleFuente) throw new Error(`el precio de ${recursoCodigo} vino sin detalle de fuente: no se puede volver a consultar`)
  return Object.freeze({
    recursoCodigo: String(recursoCodigo), valor: v, moneda: String(moneda), origen,
    fuente: FUENTE_DE_ORIGEN[origen],
    detalleFuente: String(detalleFuente),
    observadoEn: iso(observadoEn),
    proveedor, confianza,
    evidencia: evidencia ? Object.freeze({ ...evidencia }) : null,
    // Se repite en el objeto a propósito: quien lea SÓLO este candidato tiene que ver el límite.
    esHechoEcsas: origen === ORIGEN.COMPRA_ECSAS,
  })
}

/**
 * CUÁNTO PESA ESTE RECURSO EN EL COSTO. PURA.
 *
 * `null` en `costoConocido` o en el impacto NO se lee como cero: devuelve `material: true` con el
 * motivo, porque suponer que algo no importa cuando no se sabe cuánto importa es el supuesto que
 * nadie puede defender después. Es la misma regla que `issue()` aplica al campo `impact`.
 */
export function materialidadDe({ impacto = null, costoConocido = null } = {}) {
  if (impacto === null || costoConocido === null || !(Number(costoConocido) > 0)) {
    return { fraccion: null, material: true, porQue: 'no se sabe cuánta plata mueve este recurso: se trata como material hasta que se sepa' }
  }
  const fraccion = Math.abs(Number(impacto)) / Number(costoConocido)
  return {
    fraccion,
    material: fraccion >= IMPACTO_MATERIAL,
    porQue: `mueve $${Number(impacto).toLocaleString('es-AR')} sobre $${Number(costoConocido).toLocaleString('es-AR')} = ${(fraccion * 100).toFixed(2)}% del costo (material desde ${(IMPACTO_MATERIAL * 100).toFixed(0)}%)`,
  }
}

/**
 * ¿ESTE CANDIDATO SIGUE VIGENTE HOY? PURA. La vigencia sale de `vigencia.mjs`, derivada.
 *
 * Devuelve el candidato con `vigencia`, `antiguedadDias`, `vigente` y `estado`. Un precio fechado en
 * el futuro sale `ERROR` y NO vigente: una fecha imposible no es un precio fresco, es un dedazo.
 */
export function evaluarCandidato(cand, { recurso = {}, materialidad = null, serie = [], tramoParitariaHasta = TRAMO_PARITARIA_HASTA, hoy = new Date() } = {}) {
  const vig = vigenciaDerivada({
    tipo: recurso.tipo, familia: recurso.familia, serie, origen: cand.origen,
    // La moneda viaja porque un precio en dólares no envejece con la inflación en pesos: el
    // VIBRO COMPACTADOR NIWA de la base está en USD y el IPC del INDEC no mide su deriva.
    moneda: cand.moneda,
    materialidad, tramoParitariaHasta, observadoEn: cand.observadoEn, hoy,
  })
  const edad = dias(cand.observadoEn, iso(hoy))
  if (edad < 0) {
    return Object.freeze({ ...cand, vigencia: vig, antiguedadDias: edad, vigente: false, estado: ESTADO.ERROR, porQue: `está fechado el ${cand.observadoEn}, en el futuro` })
  }

  // ═══ CADUCAR Y DEGRADARSE NO SON LO MISMO ═══
  //
  // Un precio de material se DEGRADA: la pregunta es cuánta antigüedad se aguanta, y la contesta el
  // cociente. Un básico de convenio CADUCA: está exactamente bien hasta el último día del tramo
  // firmado y exactamente mal al día siguiente, porque lo que cambió no es el mercado sino la
  // escala. Contra una fecha dura no se compara una antigüedad — se compara HOY.
  if (vig.caducaEl) {
    const vigenteHoy = iso(hoy) <= vig.caducaEl
    return Object.freeze({
      ...cand, vigencia: vig, antiguedadDias: edad, vigente: vigenteHoy,
      estado: vigenteHoy ? ESTADO.EXTRAIDO : ESTADO.HISTORICO,
      porQue: vigenteHoy
        ? `rige hasta el ${vig.caducaEl} (${vig.porQue})`
        : `CADUCÓ el ${vig.caducaEl} y hoy es ${iso(hoy)} — ${vig.porQue}`,
    })
  }

  const vigente = edad <= vig.dias
  return Object.freeze({
    ...cand, vigencia: vig, antiguedadDias: edad, vigente,
    estado: vigente ? ESTADO.EXTRAIDO : ESTADO.HISTORICO,
    porQue: vigente
      ? `${edad} días de antigüedad sobre una vigencia de ${vig.dias} (${vig.porQue})`
      : `venció: ${edad} días de antigüedad contra una vigencia de ${vig.dias} días — ${vig.porQue}`,
  })
}

/**
 * PASO 8 Y 9: COMPARAR LAS FUENTES ENTRE SÍ Y DETECTAR EL ATÍPICO. PURA.
 *
 * NO promedia y NO descarta solo: le pregunta a `evaluarCambio` de `outlier.mjs` —el mismo juez que
 * ya decide si un cambio de cotización se aplica— si la diferencia entre lo que teníamos y lo que
 * encontramos se puede aplicar sin preguntar. La señal que manda ahí es el IMPACTO, no el factor.
 */
export function compararFuentes({ elegido, incumbente = null, recurso = {}, impacto = null, costoConocido = null } = {}) {
  if (!incumbente || incumbente.valor === elegido.valor) return { veredicto: 'APLICAR', porQue: null, issue: null }
  // ═══ UN INCUMBENTE VENCIDO NO ES UNA LÍNEA DE BASE ═══
  //
  // Medido: la primera corrida sobre el catálogo real mandó a resolución humana 7 de los 8 recursos
  // que la cascada había resuelto con una FACTURA PAGADA. El motivo era que el precio del catálogo
  // —de 2017, de 2021, de 2022— difería más de 3× de la factura de 2026. Eso no es un valor atípico:
  // es la inflación acumulada de cuatro años, y llamarla «outlier» convierte el mecanismo en un
  // generador de preguntas sin respuesta posible («¿está seguro de que el ripio subió?»).
  //
  // Un factor sólo significa algo entre dos números comparables. Si el que había ya venció, no hay
  // contra qué comparar: gana el nuevo, y la diferencia queda ESCRITA como dato, no como bloqueo.
  if (incumbente.vigente === false) {
    return {
      veredicto: 'APLICAR',
      porQue: `el precio que había (${incumbente.moneda} ${incumbente.valor}, del ${incumbente.observadoEn}) ya estaba vencido: un precio vencido no es una línea de base contra la cual medir un salto — la diferencia es tiempo, no anomalía`,
      issue: null,
    }
  }
  if (incumbente.moneda !== elegido.moneda) {
    return { veredicto: 'RESOLVER', porQue: `el precio que había está en ${incumbente.moneda} y el nuevo en ${elegido.moneda}: no se comparan sin tipo de cambio declarado`, issue: null }
  }
  const v = evaluarCambio({
    campo: 'precio unitario', entidad: `${recurso.codigo ?? elegido.recursoCodigo} (${recurso.nombre ?? 'sin nombre'})`,
    valorAnterior: incumbente.valor, valorNuevo: elegido.valor,
    impacto, costoConocido,
  })
  return { veredicto: v.veredicto, porQue: v.porQue, issue: v.issue ?? null, senales: v.senales }
}

/**
 * LA CASCADA ENTERA. PURA. Devuelve SIEMPRE el precio con `provenance` y el recorrido completo.
 *
 * `candidatos` ya vienen construidos con `candidatoDePrecio` —los arma la cáscara de Postgres o el
 * resolvedor web—. Este módulo no sale a buscar nada: decide.
 */
export function resolverPrecio({
  recurso = {}, candidatos = [], serie = [], impacto = null, costoConocido = null,
  // El default es el tramo REAL cableado en `vigencia.mjs` desde `uocra-paritaria.mjs`: quien no
  // sabe que existe una paritaria igual obtiene la respuesta correcta.
  tramoParitariaHasta = TRAMO_PARITARIA_HASTA, hoy = new Date(),
} = {}) {
  const mat = materialidadDe({ impacto, costoConocido })
  const evaluados = candidatos.map((c) => evaluarCandidato(c, { recurso, materialidad: mat.fraccion, serie, tramoParitariaHasta, hoy }))
  const recorrido = ORDEN_CASCADA.map((o) => pasoDeCascada(o, evaluados))
  const incumbente = evaluados.find((c) => c.origen === ORIGEN.INTERNO) ?? null

  for (const origen of ORDEN_CASCADA) {
    const vigentes = evaluados.filter((c) => c.origen === origen && c.vigente)
    if (!vigentes.length) continue
    // Entre varios del mismo origen gana el más reciente; el desempate final es por valor para que
    // dos corridas con los mismos datos elijan el mismo (§39).
    const elegido = [...vigentes].sort((a, b) => b.observadoEn.localeCompare(a.observadoEn) || a.valor - b.valor)[0]
    return armar({ recurso, elegido, evaluados, recorrido, mat, incumbente, impacto, costoConocido, hoy })
  }
  return sinVigente({ recurso, evaluados, recorrido, mat, hoy })
}

const pasoDeCascada = (origen, evaluados) => {
  const del = evaluados.filter((c) => c.origen === origen)
  if (!del.length) return { paso: origen, estado: 'SIN_CANDIDATO', porQue: `no había ningún precio de origen ${origen}` }
  const vig = del.filter((c) => c.vigente)
  return vig.length
    ? { paso: origen, estado: 'RESUELVE', porQue: `${vig.length} candidato(s) vigente(s)` }
    : { paso: origen, estado: 'VENCIDO', porQue: del.map((c) => c.porQue).join(' · ') }
}

/** El caso bueno: hay un candidato vigente. Falta ver si CAMBIA algo material respecto de lo que había. */
function armar({ recurso, elegido, evaluados, recorrido, mat, incumbente, impacto, costoConocido, hoy }) {
  const esElQueYaTeniamos = incumbente && elegido.origen === ORIGEN.INTERNO
  const cotejo = esElQueYaTeniamos
    ? { veredicto: 'APLICAR', porQue: null, issue: null }
    : compararFuentes({ elegido, incumbente, recurso, impacto, costoConocido })
  const necesitaFirma = cotejo.veredicto === 'RESOLVER' || cotejo.veredicto === 'RECHAZAR'
  return precio({
    recurso, elegido, evaluados, recorrido, mat, hoy,
    resultado: esElQueYaTeniamos ? RESULTADO.VIGENTE : (necesitaFirma ? RESULTADO.NECESITA_HUMANO : RESULTADO.ACTUALIZADO),
    estado: necesitaFirma ? ESTADO.PROPUESTO : ESTADO.EXTRAIDO,
    cotejo,
    porQue: esElQueYaTeniamos
      ? `el precio interno sigue vigente: ${elegido.porQue}`
      : `resuelto en ${elegido.origen}: ${elegido.detalleFuente} · ${elegido.porQue}${necesitaFirma ? ` — PERO ${cotejo.porQue}` : ''}`,
  })
}

/** El caso feo: no hay nada vigente. Hay que decir si hay número viejo o no hay nada, y no confundirlos. */
function sinVigente({ recurso, evaluados, recorrido, mat, hoy }) {
  const viejos = evaluados.filter((c) => c.estado === ESTADO.HISTORICO)
  if (!viejos.length) {
    return precio({
      recurso, elegido: null, evaluados, recorrido, mat, hoy,
      resultado: RESULTADO.SIN_PRECIO, estado: ESTADO.FALTA_DATO, cotejo: null,
      porQue: evaluados.length
        ? `los ${evaluados.length} candidatos son inutilizables: ${evaluados.map((c) => c.porQue).join(' · ')}`
        : 'se recorrió la cascada entera —catálogo interno, compras reales de ECSAS, observaciones comparables y web— y ninguna fuente tiene este recurso',
    })
  }
  // ═══ ENTRE DOS QUE NO CIERRAN, GANA LA PROCEDENCIA ANTES QUE LA FECHA ═══
  //
  // Ninguno de estos candidatos cierra un presupuesto: todos salen NECESITA_HUMANO. Pero UNO se le
  // muestra a la persona que va a decidir, y ordenando sólo por fecha un COMPARABLE de 2026 —que es
  // el precio de OTRO recurso— desplazaba a la observación propia de 2017. Más reciente no es más
  // cierto cuando cambia la procedencia: una inferencia sobre este recurso nunca es mejor evidencia
  // sobre él que una observación de él mismo, por más nueva que sea.
  //
  // El desplazado NO se esconde: sigue entero en `provenance.descartados`, con su origen, su valor
  // y su fecha. La regla no es tapar el comparable, es no ponerlo primero.
  const mejor = [...viejos].sort((a, b) => Number(ES_DEL_RECURSO[b.origen] ?? false) - Number(ES_DEL_RECURSO[a.origen] ?? false)
    || b.observadoEn.localeCompare(a.observadoEn)
    || a.valor - b.valor)[0]
  const inferidosDesplazados = viejos.filter((c) => c !== mejor && !ES_DEL_RECURSO[c.origen])
  return precio({
    recurso, elegido: mejor, evaluados, recorrido, mat, hoy,
    resultado: RESULTADO.NECESITA_HUMANO, estado: ESTADO.HISTORICO, cotejo: null,
    porQue: `el único precio que hay venció y NO se usa en silencio: ${mejor.porQue}`
      + (inferidosDesplazados.length
        ? ` — se muestra éste, que es una observación del propio recurso, y no ${inferidosDesplazados.map((c) => `el ${c.origen} del ${c.observadoEn}`).join(' ni ')}, que son inferencias más nuevas pero sobre otra cosa`
        : ''),
  })
}

/**
 * LA FORMA ÚNICA DE SALIDA. Los ocho campos que el programa exige —`recurso, valor, moneda, fuente,
 * fecha, vigencia, evidencia, provenance`— más el porqué y el issue.
 *
 * `valor` es `null` cuando no hay precio. La aserción de acá abajo no es defensiva: es el invariante
 * que más plata mueve del programa, y prefiere romper la corrida antes que publicar un $0.
 */
function precio({ recurso, elegido, evaluados, recorrido, mat, resultado, estado, cotejo, porQue, hoy }) {
  const sinValor = resultado === RESULTADO.SIN_PRECIO
  if (sinValor && elegido) throw new Error('SIN_PRECIO con un candidato elegido es una contradicción')
  const salida = Object.freeze({
    recurso: recurso.codigo ?? elegido?.recursoCodigo ?? null,
    nombre: recurso.nombre ?? null,
    valor: sinValor ? null : elegido.valor,
    moneda: sinValor ? null : elegido.moneda,
    fuente: sinValor ? FUENTE.FALTA_DATO : elegido.fuente,
    detalleFuente: sinValor ? null : elegido.detalleFuente,
    fecha: sinValor ? null : elegido.observadoEn,
    vigencia: sinValor ? null : Object.freeze({ dias: elegido.vigencia.dias, venceEl: venceEl(elegido), porQue: elegido.vigencia.porQue, origenDeriva: elegido.vigencia.origenDeriva }),
    evidencia: sinValor ? null : elegido.evidencia,
    provenance: Object.freeze({
      resueltoEn: elegido?.origen ?? null,
      esHechoEcsas: elegido?.esHechoEcsas ?? false,
      recorrido: Object.freeze(recorrido),
      descartados: Object.freeze(evaluados.filter((c) => c !== elegido).map((c) => ({ origen: c.origen, valor: c.valor, observadoEn: c.observadoEn, detalleFuente: c.detalleFuente, porQue: c.porQue }))),
      materialidad: Object.freeze(mat),
      cotejo: cotejo ? Object.freeze({ veredicto: cotejo.veredicto, porQue: cotejo.porQue }) : null,
      decididoEn: iso(hoy),
    }),
    estado, resultado, porQue,
    issue: null,
  })
  return Object.freeze({ ...salida, issue: issueDeResolucion(salida, mat) })
}

/** HASTA CUÁNDO VALE. Con fecha dura de caducidad es esa fecha; si no, la antigüedad admitida
 *  sumada a la observación. Un `dias` en null (convenio sin observación fechada) no se suma. */
const venceEl = (c) => c.vigencia.caducaEl
  ?? (c.vigencia.dias === null ? null : iso(new Date(Date.parse(`${c.observadoEn}T00:00:00Z`) + c.vigencia.dias * 86_400_000)))

/**
 * EL ISSUE QUE VA A LA COLA, O NADA. PURA.
 *
 * La MATERIALIDAD decide la severidad, no el tipo de problema: un clavo sin precio y el hormigón sin
 * precio son el mismo issue con dos consecuencias distintas. `BLOQUEANTE` es lo que hace que
 * `puedeCongelar` diga que no, así que ponerlo en un clavo frenaría una oferta de $180 M por $400.
 */
export function issueDeResolucion(p, mat) {
  if (p.resultado === RESULTADO.VIGENTE || p.resultado === RESULTADO.ACTUALIZADO) return null
  const quien = p.nombre ? `${p.recurso} (${p.nombre})` : String(p.recurso)
  const critico = mat.material
  if (p.resultado === RESULTADO.SIN_PRECIO) {
    return issue({
      type: TIPO_ISSUE.SIN_PRECIO, severity: critico ? SEVERIDAD.BLOQUEANTE : SEVERIDAD.MEDIA,
      entity: quien, impact: null, recommended_action: 'set_resource_price',
      detalle: `${p.porQue} · ${mat.porQue}`,
    })
  }
  return issue({
    type: p.provenance.cotejo?.veredicto === 'RESOLVER' ? TIPO_ISSUE.OUTLIER_PENDING : TIPO_ISSUE.PRECIO_DESACTUALIZADO,
    severity: critico ? SEVERIDAD.ALTA : SEVERIDAD.BAJA,
    entity: quien, impact: mat.fraccion === null ? null : p.valor,
    evidence: { detalleFuente: p.detalleFuente, fecha: p.fecha, vigencia: p.vigencia?.dias ?? null },
    recommended_action: 'set_resource_price',
    detalle: `${p.porQue} · ${mat.porQue}`,
  })
}

export { TRAMO_PARITARIA_HASTA, TRAMO_PARITARIA_FUENTE }

/** ¿Esta resolución todavía necesita a una persona? PURA. Es la pregunta del paso 12. */
export const necesitaHumano = (p) => p.resultado === RESULTADO.NECESITA_HUMANO || p.resultado === RESULTADO.SIN_PRECIO
