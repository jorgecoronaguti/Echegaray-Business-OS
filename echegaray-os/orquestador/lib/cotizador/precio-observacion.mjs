// LA OBSERVACIÓN DE PRECIO CANÓNICA — y los TRES ACTOS que hasta hoy estaban mezclados en uno.
//
// ═══ POR QUÉ HAY QUE SEPARARLOS ═══
//
// «Actualizar el precio del panel» suena a una sola cosa y son tres, con dueños distintos, evidencia
// distinta y consecuencias distintas:
//
//   1. OBSERVACIÓN — alguien vio un número en algún lado. Es un HECHO sobre el mundo. No decide
//      nada, no reemplaza nada, y sigue siendo cierto aunque se descarte: «el 31/08/2026 tal página
//      publicaba $X» no deja de ser verdad porque hayamos elegido otro precio.
//   2. SELECCIÓN   — entre varias observaciones, una gana. Es un JUICIO, lo hace una regla con
//      nombre y versión, y las perdedoras NO se borran: quedan como descartadas con su motivo.
//   3. APLICACIÓN  — el número elegido se escribe en el catálogo y a partir de ahí multiplica
//      cantidades en una oferta. Es un ACTO con efecto económico, y necesita una AUTORIZACIÓN:
//      una regla de governance que lo permita, o la firma de una persona. Nunca «porque sí».
//
// Cuando los tres viven en la misma fila —que es lo que pasa hoy en `public.recurso_precio`— se
// pierden las tres respuestas de golpe: no se puede saber qué se descartó, ni con qué criterio, ni
// quién se hizo cargo. Y la fila anterior se pisa, con lo cual tampoco queda la serie.
//
// ═══ LO QUE ESTE MÓDULO NO HACE ═══
//
// No sale a buscar (eso es `precio-buscador-web.mjs`), no decide si la web alcanza (eso es
// `precio-governance.mjs`) y no escribe (eso es la cáscara de Postgres). Define la FORMA y las
// invariantes, y las hace cumplir en el constructor: un precio de cero o negativo, una observación
// sin fecha, una `valid_until` inventada o una aplicación sin autorización **tiran**, no advierten.
//
// ═══ `valid_until` SÓLO CUANDO EXISTE DE VERDAD ═══
//
// Una cotización de proveedor que dice «validez 15 días» TIENE una fecha de vencimiento: es un
// hecho del documento. Una página web no la tiene. Calcular una y guardarla en el mismo campo mezcla
// un hecho con una estimación, y seis meses después nadie distingue cuál era cuál. Acá `validoHasta`
// es SÓLO el hecho declarado por la fuente; la vigencia estimada la calcula `vigencia.mjs` y viaja
// aparte, etiquetada como derivada.

import { createHash } from 'node:crypto'
import { normalizarUnidad } from './unidades.mjs'

/** DE QUÉ CLASE DE FUENTE SALIÓ. El orden es la jerarquía del §2 del pedido, de más fuerte a más
 *  débil, y `ORDEN_FUENTE` lo usa la selección. Cambiar el orden acá cambia la jerarquía en todo el
 *  sistema: es a propósito que haya UN solo lugar donde hacerlo. */
export const TIPO_FUENTE = Object.freeze({
  COMPRA_ECSAS: 'COMPRA_ECSAS',           // 1 · una factura que ECSAS pagó
  COTIZACION_PROVEEDOR: 'COTIZACION_PROVEEDOR', // 2 · un proveedor le puso precio A ECSAS
  CATALOGO_INTERNO: 'CATALOGO_INTERNO',   // 3 · lo que la empresa ya decidió
  FABRICANTE: 'FABRICANTE',               // 4 · lista del que lo fabrica o distribuye
  WEB: 'WEB',                             // 5 · una página publicada
  REFERENCIA_TECNICA: 'REFERENCIA_TECNICA', // 6 · índice, revista técnica, cámara
  MODELO: 'MODELO',                       // 7 · un modelo lo INTERPRETA. Nunca lo afirma
  HUMANO: 'HUMANO',                       // 8 · una persona lo decidió y lo firma
})

export const ORDEN_FUENTE = Object.freeze([
  TIPO_FUENTE.COMPRA_ECSAS, TIPO_FUENTE.COTIZACION_PROVEEDOR, TIPO_FUENTE.CATALOGO_INTERNO,
  TIPO_FUENTE.FABRICANTE, TIPO_FUENTE.WEB, TIPO_FUENTE.REFERENCIA_TECNICA,
  TIPO_FUENTE.MODELO, TIPO_FUENTE.HUMANO,
])

/** Las que son EXPERIENCIA DE ECSAS: la empresa pagó o le cotizaron a ella. Ninguna otra puede
 *  ascender a esta lista, y `esExperienciaEcsas` es la única función que la consulta. */
const EXPERIENCIA_ECSAS = Object.freeze([TIPO_FUENTE.COMPRA_ECSAS, TIPO_FUENTE.COTIZACION_PROVEEDOR])
export const esExperienciaEcsas = (tipo) => EXPERIENCIA_ECSAS.includes(tipo)

/** Qué dijo la fuente sobre el IVA. `NO_DECLARADO` NO es «sin IVA»: son 21% que nadie decidió. */
export const IVA = Object.freeze({ SIN_IVA: 'SIN_IVA', CON_IVA: 'CON_IVA', NO_DECLARADO: 'NO_DECLARADO' })

/** Y sobre el flete. Un precio puesto en obra y uno retirado en depósito no son el mismo precio:
 *  en San Juan la diferencia de un camión de hormigón no es un detalle. */
export const FLETE = Object.freeze({ INCLUIDO: 'INCLUIDO', NO_INCLUIDO: 'NO_INCLUIDO', NO_DECLARADO: 'NO_DECLARADO' })

/** Dónde rige el precio. Un precio de Buenos Aires no es un precio de San Juan y el flete es la
 *  mitad de la diferencia. `NO_DECLARADA` se dice, no se supone. */
export const JURISDICCION_POR_DEFECTO = 'AR-SJ'

const iso = (v) => {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

/**
 * LA ESPECIFICACIÓN NORMALIZADA — lo que hace que se pueda BUSCAR POR ESPECIFICACIÓN Y NO POR NOMBRE.
 * PURA.
 *
 * «Panel Chapa Trape Blanco Pur 50 Mm Foil Blanco» y «panel aislante 50mm PUR techo trapezoidal» son
 * el mismo producto escrito por dos personas distintas. Lo que los iguala no es el nombre: son los
 * ATRIBUTOS MEDIBLES —espesor 50 mm, material PUR, perfil trapezoidal— más la unidad de venta.
 *
 * Se extraen los números con unidad física y las palabras significativas, se ordenan y se sacan las
 * de relleno. El resultado es determinístico: la misma entrada da la misma spec, siempre, y por eso
 * se puede usar de clave de comparabilidad y de semilla de búsqueda.
 */
export function especificacionNormalizada({ nombre = '', unidad = null, familia = null } = {}) {
  const crudo = String(nombre).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[«»"'`]/g, ' ')
  // Los atributos medibles: «50 mm», «12,5mm», «ø 16», «2,4 x 1,2», «n 27».
  const medidas = [...crudo.matchAll(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m2|m3|m|kg|gr?|lt?|l|pulg|"|'')\b/g)]
    .map((m) => `${m[1].replace(',', '.')}${m[2].replace('"', 'pulg').replace("''", 'pulg')}`)
  const diametros = [...crudo.matchAll(/(?:ø|diam(?:etro)?\.?)\s*(\d+(?:[.,]\d+)?)/g)].map((m) => `d${m[1].replace(',', '.')}`)
  const RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'para', 'por', 'en', 'a', 'y', 'o', 'x'])
  const palabras = crudo.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !RELLENO.has(w) && !/^\d+$/.test(w))
  const u = normalizarUnidad(unidad)
  const partes = [...new Set([...palabras, ...medidas, ...diametros])].sort()
  return Object.freeze({
    spec: partes.join(' '),
    atributos: Object.freeze([...new Set([...medidas, ...diametros])].sort()),
    palabras: Object.freeze([...new Set(palabras)].sort()),
    unidad: u?.canonica ?? null,
    dimension: u?.dimension ?? null,
    familia: familia ? String(familia).toUpperCase() : null,
  })
}

/** El hash de contenido de una observación: la misma observación leída dos veces da el mismo id, y
 *  por eso se puede deduplicar sin comparar campo por campo. NO incluye la fecha de carga —eso
 *  cambiaría el hash de un hecho idéntico— pero SÍ la de observación, porque el mismo precio de dos
 *  días distintos son dos hechos. */
export const hashDeObservacion = (o) => createHash('sha256').update([
  o.recursoCodigo, o.valor, o.moneda, o.unidad, o.tipoFuente, o.fuenteId ?? '', o.url ?? '',
  o.observadoEn, o.iva, o.flete, o.jurisdiccion, JSON.stringify(o.baseDeCantidad ?? null),
].join('|')).digest('hex').slice(0, 32)

/**
 * ACTO 1 · UNA OBSERVACIÓN DE PRECIO. PURA, congelada y VALIDADA en el constructor.
 *
 * Los `throw` son las maneras en que una observación se vuelve indefendible, y ninguna se detecta
 * después: un precio de cero no es un precio, uno sin fecha no se puede vencer, uno sin fuente no se
 * puede volver a consultar, y una `validoHasta` sin que la fuente la haya declarado es una
 * estimación disfrazada de hecho.
 */
export function observacion({
  recursoId = null, recursoCodigo, descripcion = null, spec = null,
  valor, moneda = 'ARS', unidad, baseDeCantidad = null,
  tipoFuente, fuenteId = null, proveedor = null, fabricante = null, url = null, documento = null,
  observadoEn, validoDesde = null, validoHasta = null, validoHastaLoDiceLaFuente = false,
  jurisdiccion = JURISDICCION_POR_DEFECTO, iva = IVA.NO_DECLARADO, flete = FLETE.NO_DECLARADO,
  confianza = null, evidencia = null, procedencia = null,
} = {}) {
  if (!TIPO_FUENTE[tipoFuente]) throw new Error(`«${tipoFuente}» no es un tipo de fuente conocido: ${ORDEN_FUENTE.join(', ')}`)
  if (!recursoCodigo) throw new Error('una observación de precio sin recurso no se puede aplicar a nada')
  const v = Number(valor)
  if (!Number.isFinite(v) || v <= 0) throw new Error(`«${valor}» no es un precio de ${recursoCodigo}: cero o negativo no es un precio, es un hueco`)
  if (!observadoEn) throw new Error(`la observación de ${recursoCodigo} vino sin fecha: sin fecha no se puede saber si venció`)
  if (!unidad) throw new Error(`la observación de ${recursoCodigo} vino sin unidad: un número sin unidad no se puede multiplicar por una cantidad`)
  if (!url && !documento && !fuenteId) throw new Error(`la observación de ${recursoCodigo} no dice de dónde salió: sin fuente citable no se puede volver a consultar`)
  if (validoHasta && !validoHastaLoDiceLaFuente) {
    throw new Error(`la observación de ${recursoCodigo} trae validoHasta=${iso(validoHasta)} sin que la fuente lo declare: una vigencia estimada NO va en el campo del hecho — la calcula vigencia.mjs y viaja aparte`)
  }
  const base = {
    recursoId, recursoCodigo: String(recursoCodigo),
    descripcion: descripcion ?? null,
    spec: spec ?? especificacionNormalizada({ nombre: descripcion ?? recursoCodigo, unidad }).spec,
    valor: v, moneda: String(moneda), unidad: String(unidad),
    // «$12.000 la bolsa de 50 kg» — el precio es 12.000 y la BASE es 50 kg. Sin esto, dividir es
    // adivinar y multiplicar es peor.
    baseDeCantidad: baseDeCantidad ? Object.freeze({ ...baseDeCantidad }) : null,
    tipoFuente, fuenteId, proveedor, fabricante, url, documento,
    observadoEn: iso(observadoEn), validoDesde: iso(validoDesde), validoHasta: iso(validoHasta),
    jurisdiccion, iva, flete,
    confianza, evidencia: evidencia ? Object.freeze({ ...evidencia }) : null,
    procedencia: procedencia ? Object.freeze({ ...procedencia }) : null,
    esExperienciaEcsas: esExperienciaEcsas(tipoFuente),
  }
  return Object.freeze({ ...base, hash: hashDeObservacion(base) })
}

/** En qué puede terminar el juicio de la selección. */
export const VEREDICTO = Object.freeze({
  ELEGIDA: 'ELEGIDA',
  DESCARTADA: 'DESCARTADA',
  SIN_CANDIDATA: 'SIN_CANDIDATA',
})

/**
 * ACTO 2 · LA SELECCIÓN. PURA.
 *
 * Elige por JERARQUÍA DE FUENTE primero y por fecha después, y devuelve TODAS las descartadas con su
 * motivo. `regla` es obligatoria y lleva versión: una selección que no puede decir con qué criterio
 * eligió no se puede auditar ni reproducir cuando el criterio cambie.
 *
 * NO promedia y NO mezcla monedas: dos observaciones en monedas distintas no se comparan sin un tipo
 * de cambio declarado, y este módulo no tiene ninguno.
 */
export function seleccionar({ observaciones = [], regla = null, admisible = null } = {}) {
  if (!regla?.id || !regla?.version) throw new Error('una selección sin regla identificada y versionada no se puede auditar: falta {id, version}')
  const evaluadas = observaciones.map((o) => {
    const veredicto = typeof admisible === 'function' ? admisible(o) : { ok: true, porQue: 'sin filtro de admisibilidad' }
    return { observacion: o, admisible: veredicto.ok !== false, porQue: veredicto.porQue ?? null }
  })
  const candidatas = evaluadas.filter((e) => e.admisible)
  if (!candidatas.length) {
    return Object.freeze({
      veredicto: VEREDICTO.SIN_CANDIDATA, elegida: null, regla: Object.freeze({ ...regla }),
      descartadas: Object.freeze(evaluadas.map(resumirDescarte)),
      porQue: observaciones.length
        ? `las ${observaciones.length} observaciones fueron descartadas: ${evaluadas.map((e) => e.porQue).filter(Boolean).join(' · ')}`
        : 'no hay ninguna observación de precio para este recurso',
    })
  }
  const orden = (e) => ORDEN_FUENTE.indexOf(e.observacion.tipoFuente)
  const mejor = [...candidatas].sort((a, b) => orden(a) - orden(b)
    || b.observacion.observadoEn.localeCompare(a.observacion.observadoEn)
    || a.observacion.valor - b.observacion.valor)[0]
  return Object.freeze({
    veredicto: VEREDICTO.ELEGIDA,
    elegida: mejor.observacion,
    regla: Object.freeze({ ...regla }),
    descartadas: Object.freeze(evaluadas.filter((e) => e !== mejor).map(resumirDescarte)),
    porQue: `gana ${mejor.observacion.tipoFuente} del ${mejor.observacion.observadoEn} (puesto ${orden(mejor) + 1} de la jerarquía) por la regla ${regla.id} v${regla.version}`,
  })
}

const resumirDescarte = (e) => Object.freeze({
  hash: e.observacion.hash, tipoFuente: e.observacion.tipoFuente, valor: e.observacion.valor,
  moneda: e.observacion.moneda, observadoEn: e.observacion.observadoEn,
  url: e.observacion.url, admisible: e.admisible,
  porQue: e.admisible ? 'admisible pero no ganó la jerarquía' : e.porQue,
})

/**
 * ACTO 3 · LA APLICACIÓN. PURA. Es lo único que tiene efecto económico, y por eso es lo único que
 * exige AUTORIZACIÓN.
 *
 * `autorizacion` la produce `precio-governance.mjs` y tiene que decir QUÉ REGLA o QUIÉN autorizó.
 * Acá se verifica que exista y que sea coherente con la observación que se está aplicando — si el
 * hash no coincide, la autorización es de otra cosa y no sirve.
 *
 * **Nunca se fabrica una firma humana.** Una autorización de tipo HUMANO sin `firmadaPor` tira.
 */
export function aplicar({ seleccion = null, autorizacion = null, destino = null, cuando = new Date() } = {}) {
  if (seleccion?.veredicto !== VEREDICTO.ELEGIDA || !seleccion.elegida) {
    throw new Error('no se puede aplicar una selección que no eligió nada: eso escribiría un hueco')
  }
  if (!autorizacion) throw new Error(`aplicar el precio de ${seleccion.elegida.recursoCodigo} sin autorización es exactamente la autonomía que el programa NO pide`)
  if (autorizacion.permite !== true) {
    throw new Error(`la governance NO autoriza aplicar este precio: ${autorizacion.porQue ?? 'sin motivo declarado'}`)
  }
  if (autorizacion.observacionHash && autorizacion.observacionHash !== seleccion.elegida.hash) {
    throw new Error('la autorización es de OTRA observación: su hash no coincide con el de la que se está aplicando')
  }
  if (autorizacion.autorizadoPorTipo === 'HUMANO' && !autorizacion.firmadaPor) {
    throw new Error('una autorización humana sin firmante es una firma fabricada: se rechaza')
  }
  if (!destino) throw new Error('aplicar sin destino declarado no deja rastro de dónde se escribió')
  return Object.freeze({
    observacion: seleccion.elegida,
    valor: seleccion.elegida.valor,
    moneda: seleccion.elegida.moneda,
    unidad: seleccion.elegida.unidad,
    destino: String(destino),
    aplicadoEn: cuando instanceof Date ? cuando.toISOString() : String(cuando),
    autorizacion: Object.freeze({ ...autorizacion }),
    procedencia: Object.freeze({
      acto1_observacion: seleccion.elegida.hash,
      acto2_seleccion: Object.freeze({ regla: seleccion.regla, porQue: seleccion.porQue, descartadas: seleccion.descartadas.length }),
      acto3_aplicacion: `autorizada por ${autorizacion.autorizadoPorTipo}:${autorizacion.autorizadoPor}${autorizacion.firmadaPor ? ` · firma de ${autorizacion.firmadaPor}` : ''}`,
    }),
  })
}
