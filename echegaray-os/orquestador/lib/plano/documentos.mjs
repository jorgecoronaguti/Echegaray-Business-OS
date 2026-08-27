// EL CONJUNTO DOCUMENTAL DE UN PROYECTO, Y LA LÍNEA QUE NO SE CRUZA.
//
// ═══ LA VALIDACIÓN CIEGA NO ES UNA DISCIPLINA, ES UN FILTRO ═══
//
// La carpeta de un proyecto en el data room tiene, mezclados, los planos con los que hay que
// cotizar y la cotización que ya se hizo. Un pipeline que lee «toda la documentación» y después
// dice que acertó no probó nada: leyó la respuesta. Y la trampa no requiere mala fe — alcanza con
// que un archivo se llame «LISTADO DE TAREAS A EJECUTAR» para que el listado de partidas correcto
// entre por la puerta de atrás.
//
// Por eso la separación es del CÓDIGO y no del criterio de quien corre el pipeline: `partirDocumentos`
// devuelve dos conjuntos disjuntos y el pipeline sólo recibe el primero. Lo reservado no está
// «desaconsejado»: no está.
//
// ═══ QUÉ CUENTA COMO RESPUESTA ═══
//
// Todo lo que contiene el resultado del trabajo que se está pidiendo: presupuesto, cotización,
// cómputo, listado de tareas, contrato (que lleva el precio), y también los presupuestos de
// materiales pedidos PARA este proyecto —un proveedor que cotizó las 12 columnas ya resolvió el
// cómputo de las columnas—. La memoria descriptiva se reserva por venir pegada al contrato: es
// documentación técnica legítima, pero en este data room viaja en el mismo PDF que el precio.

import { clasificarDocumento, legibilidadDe, LECTURA, TIPO_DOC } from '../documentacion-obra.mjs'

/** Los formatos que la VISIÓN sí puede mirar aunque `legibilidadDe` los declare no legibles: esa
 *  función responde «¿puedo extraer texto?», que hasta ahora era la única lectura que existía. Un
 *  PDF de plano y una foto de un plano se miran igual desde que hay visión, y un `.dwg` sigue sin
 *  poder mirarse — la distinción es real y por eso no se toca `legibilidadDe`: se la extiende acá. */
const MIRABLE = /(pdf|png|jpe?g|webp|gif)$/i

/** Los tipos documentales que REVELAN el resultado. Si el documento es uno de éstos, no entra a la
 *  primera pasada por más útil que sea. */
export const REVELAN = Object.freeze([TIPO_DOC.presupuesto, TIPO_DOC.computo, TIPO_DOC.contrato, TIPO_DOC.certificado])

/** Nombres que revelan el resultado aunque el clasificador no los reconozca. Salen de los nombres
 *  reales del data room, no de un vocabulario teórico. */
const NOMBRES_QUE_REVELAN = /(cotizacion|presupuesto|computo|c[óo]mputo|listado de tareas|memoria descriptiva|contrato|oferta|analisis de precio|gastos)/i

/** Las carpetas donde vive el resultado. Una cotización de proveedor guardada en
 *  «Presupuestos de Materiales» del propio proyecto ya trae resuelto el cómputo de ese rubro. */
const CARPETAS_QUE_REVELAN = /(cotizacion|presupuesto|contrato|facturas)/i

/**
 * ¿ESTE DOCUMENTO REVELA LA RESPUESTA? PURA.
 *
 * La prueba de carpeta se hace SOBRE LA RUTA RELATIVA al proyecto, y ese detalle no es cosmético:
 * la carpeta de Quattropani cuelga de «administracion/PRESUPUESTOS - CLIENTES/», así que mirando la
 * ruta absoluta TODO el proyecto —los planos incluidos— «cuelga de una carpeta de presupuestos» y
 * el filtro se come el conjunto entero. Medido: 33 documentos, 0 insumos. El nombre de la carpeta
 * que contiene al proyecto describe el archivo de la empresa, no el documento.
 */
export function revelaElResultado(doc, { carpetaObra = '' } = {}) {
  const c = clasificarDocumento(doc, { carpetaObra })
  if (REVELAN.includes(c.tipo)) return { revela: true, porQue: `es ${c.tipo} (${c.senal})` }
  if (NOMBRES_QUE_REVELAN.test(String(doc?.name ?? ''))) return { revela: true, porQue: 'el nombre del archivo anuncia el resultado' }
  const ruta = String(doc?.path ?? '')
  const base = String(carpetaObra || '')
  const relativa = base && ruta.startsWith(base) ? ruta.slice(base.length) : ruta
  const carpetas = relativa.split('/').slice(0, -1).join('/')
  if (CARPETAS_QUE_REVELAN.test(carpetas)) return { revela: true, porQue: 'cuelga de una carpeta del proyecto que contiene el resultado' }
  return { revela: false, porQue: null }
}

/**
 * EL CONJUNTO DOCUMENTAL, PARTIDO EN DOS. Devuelve `insumos` (con qué se cotiza) y `reservados`
 * (contra qué se valida después). Cada documento lleva por qué quedó donde quedó y si el OS puede
 * leerlo — un `.dwg` es un plano y NO es legible, y esas dos cosas se dicen juntas.
 */
export function partirDocumentos(filas = [], { carpetaObra = '' } = {}) {
  const insumos = []
  const reservados = []
  for (const f of filas) {
    if (f?.is_folder) continue
    const doc = { name: f.name, path: f.path, mime_type: f.mime_type, drive_file_id: f.drive_file_id, size_bytes: f.size_bytes }
    const clase = clasificarDocumento(doc, { carpetaObra })
    const lect = legibilidadDe(doc)
    const r = revelaElResultado(doc, { carpetaObra })
    const mirable = MIRABLE.test(String(doc.name)) && lect.forma !== LECTURA.noLegible
    const enriquecido = { ...doc, tipo: clase.tipo, senal: clase.senal, lectura: lect.forma, legible: mirable, porQueNoLegible: mirable ? null : lect.motivo, porQue: r.porQue }
    if (r.revela) reservados.push(enriquecido); else insumos.push(enriquecido)
  }
  return { insumos, reservados }
}

/** Los planos legibles de un conjunto de insumos, que son los únicos que se pueden interpretar.
 *  Un `.dwg` sale aparte y con nombre: «no lo pude abrir» es un dato del cierre, no un silencio. */
export function planosDe(insumos = []) {
  const esPlano = (d) => String(d.tipo ?? '').startsWith('plano')
  return {
    legibles: insumos.filter((d) => esPlano(d) && d.legible),
    noLegibles: insumos.filter((d) => esPlano(d) && !d.legible),
    otros: insumos.filter((d) => !esPlano(d)),
  }
}
