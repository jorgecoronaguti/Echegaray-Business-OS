// EL CATÁLOGO DE PLANTILLAS NATIVAS DE ECSAS. Nueve dominios reales, uno por cada cosa que la
// empresa produce y hoy arma a mano cada vez.
//
// ═══ NO HAY UN SOLO DATO ACÁ ADENTRO ═══
//
// Ni un CUIT, ni una dirección, ni un precio, ni un plazo, ni una carpeta de Drive. Sólo huecos con
// nombre. El día que una plantilla traiga un número escrito, ese número va a salir firmado en una
// oferta sin que nadie lo haya decidido.
//
// ═══ CÓMO SE LEE UNA SECCIÓN CUANDO EL ARCHIVO ES UNA PRESENTACIÓN ═══
//
// La misma sección sirve para las dos caras, y el mapeo es fijo (lo aplica `plantillas-motor.mjs`):
// una sección con una LISTA es una lámina de puntos, con una TABLA una lámina de tabla, con DATOS
// una lámina de indicadores, y con un solo PÁRRAFO un corte de sección. No hay elección de forma:
// es la misma regla que hace que la décima presentación se vea como la primera.

import { validarPlantilla } from './plantillas-contrato.mjs'

const campo = (clave, rotulo, tipo = 'texto', requerido = false, ayuda) => ({ clave, rotulo, tipo, requerido, ...(ayuda ? { ayuda } : {}) })
const FORMA = { forma_decidida_por: 'MOTOR', parametros_de_forma_aceptados: 0 }
const DESTINO = (politica, nota) => ({ politica, carpeta_id: null, ...(nota ? { nota } : {}) })
const BASE = { origen: 'NATIVA', source_file_id: null, version: 1, layout_rules: FORMA }

const IDENTIDAD = [campo('cliente', 'Cliente', 'texto', true), campo('obra', 'Obra', 'texto', true), campo('fecha', 'Fecha', 'fecha', true)]
const ficha = () => ({ tipo: 'datos', pares: [{ clave: 'Cliente', valor: '{{cliente}}' }, { clave: 'Obra', valor: '{{obra}}' }, { clave: 'Fecha', valor: '{{fecha}}' }] })

/** Las nueve. El orden es el de la lista del dueño. */
const CRUDAS = [
  {
    ...BASE,
    template_id: 'oferta.obra.v1', domain: 'oferta', file_type: 'doc',
    fields: [...IDENTIDAD, campo('alcance', 'Alcance ofertado', 'lista', true), campo('exclusiones', 'Exclusiones', 'lista', true, 'lo que NO entra: es lo que después se cobra como adicional'), campo('validez', 'Validez de la oferta', 'texto', true), campo('condiciones', 'Condiciones comerciales', 'lista', false)],
    required_data: ['cliente', 'obra', 'fecha', 'alcance', 'exclusiones', 'validez'],
    output_naming: 'Oferta · {{cliente}} · {{obra}} · {{fecha}}',
    destination_policy: DESTINO('CARPETA_EXPLICITA', 'una oferta va a la carpeta del cliente, y esa carpeta la elige quien la manda'),
    sections: [
      { id: 'encabezado', titulo: 'Oferta', nivel: 1, bloques: [ficha()] },
      { id: 'alcance', titulo: 'Alcance ofertado', nivel: 1, bloques: [{ tipo: 'lista', desde: 'alcance' }] },
      { id: 'exclusiones', titulo: 'Exclusiones', nivel: 1, bloques: [{ tipo: 'parrafo', texto: 'Lo siguiente NO está incluido en esta oferta. Cualquier trabajo de esta lista se cotiza aparte.' }, { tipo: 'lista', desde: 'exclusiones' }] },
      { id: 'condiciones', titulo: 'Condiciones', nivel: 1, obligatoria: false, bloques: [{ tipo: 'lista', desde: 'condiciones' }, { tipo: 'parrafo', texto: 'Validez de esta oferta: {{validez}}.' }] },
    ],
  },
  {
    ...BASE,
    template_id: 'presupuesto.obra.v1', domain: 'presupuesto', file_type: 'doc',
    fields: [...IDENTIDAD, campo('partidas', 'Partidas', 'lista', true, 'cada una con descripcion, unidad, cantidad, precio_unitario, total — ya calculados y formateados'), campo('total', 'Total', 'texto', true), campo('nota_de_alcance', 'Nota de alcance', 'texto', false)],
    required_data: ['cliente', 'obra', 'fecha', 'partidas', 'total'],
    output_naming: 'Presupuesto · {{obra}} · {{fecha}}',
    destination_policy: DESTINO('CARPETA_EXPLICITA'),
    sections: [
      { id: 'encabezado', titulo: 'Presupuesto', nivel: 1, bloques: [ficha()] },
      { id: 'partidas', titulo: 'Partidas', nivel: 1, bloques: [{ tipo: 'tabla', columnas: ['Descripción', 'Unidad', 'Cantidad', 'Precio unitario', 'Total'], desde: 'partidas', celdas: ['descripcion', 'unidad', 'cantidad', 'precio_unitario', 'total'] }] },
      { id: 'total', titulo: 'Total', nivel: 1, bloques: [{ tipo: 'datos', pares: [{ clave: 'Total del presupuesto', valor: '{{total}}' }] }] },
      { id: 'alcance', titulo: 'Alcance', nivel: 1, obligatoria: false, bloques: [{ tipo: 'parrafo', texto: '{{nota_de_alcance}}' }] },
    ],
  },
  {
    ...BASE,
    template_id: 'informe.avance_obra.v1', domain: 'informe', file_type: 'doc',
    fields: [...IDENTIDAD, campo('periodo', 'Período', 'texto', true), campo('resumen', 'Resumen', 'texto', true), campo('ejecutado', 'Ejecutado en el período', 'lista', true), campo('proximo', 'Próximo período', 'lista', false), campo('desvios', 'Desvíos', 'lista', false)],
    required_data: ['cliente', 'obra', 'fecha', 'periodo', 'resumen', 'ejecutado'],
    output_naming: 'Informe de avance · {{obra}} · {{periodo}}',
    destination_policy: DESTINO('CARPETA_DE_LA_OBRA'),
    sections: [
      { id: 'encabezado', titulo: 'Informe de avance', nivel: 1, bloques: [ficha(), { tipo: 'datos', pares: [{ clave: 'Período', valor: '{{periodo}}' }] }] },
      { id: 'resumen', titulo: 'Resumen', nivel: 1, bloques: [{ tipo: 'parrafo', texto: '{{resumen}}' }] },
      { id: 'ejecutado', titulo: 'Ejecutado en el período', nivel: 1, bloques: [{ tipo: 'lista', desde: 'ejecutado' }] },
      { id: 'desvios', titulo: 'Desvíos', nivel: 1, obligatoria: false, bloques: [{ tipo: 'lista', desde: 'desvios' }] },
      { id: 'proximo', titulo: 'Próximo período', nivel: 1, obligatoria: false, bloques: [{ tipo: 'lista', desde: 'proximo' }] },
    ],
  },
  {
    ...BASE,
    template_id: 'certificado.avance.v1', domain: 'certificado', file_type: 'doc',
    fields: [...IDENTIDAD, campo('numero', 'Número de certificado', 'texto', true), campo('periodo', 'Período certificado', 'texto', true), campo('items', 'Ítems certificados', 'lista', true, 'cada uno con item, avance, monto ya formateados'), campo('monto_del_periodo', 'Monto del período', 'texto', true), campo('acumulado', 'Acumulado', 'texto', false)],
    required_data: ['cliente', 'obra', 'fecha', 'numero', 'periodo', 'items', 'monto_del_periodo'],
    output_naming: 'Certificado {{numero}} · {{obra}} · {{periodo}}',
    destination_policy: DESTINO('CARPETA_DE_LA_OBRA'),
    sections: [
      { id: 'encabezado', titulo: 'Certificado de avance N° {{numero}}', nivel: 1, bloques: [ficha(), { tipo: 'datos', pares: [{ clave: 'Período certificado', valor: '{{periodo}}' }] }] },
      { id: 'items', titulo: 'Ítems certificados', nivel: 1, bloques: [{ tipo: 'tabla', columnas: ['Ítem', 'Avance', 'Monto'], desde: 'items', celdas: ['item', 'avance', 'monto'] }] },
      { id: 'cierre', titulo: 'Monto', nivel: 1, bloques: [{ tipo: 'datos', pares: [{ clave: 'Monto del período', valor: '{{monto_del_periodo}}' }, { clave: 'Acumulado', valor: '{{acumulado}}' }] }] },
    ],
  },
  {
    ...BASE,
    template_id: 'reporte.financiero_mensual.v1', domain: 'reporte_financiero', file_type: 'doc',
    fields: [campo('periodo', 'Período', 'texto', true), campo('fecha', 'Fecha', 'fecha', true), campo('criterio', 'Criterio', 'texto', true, 'PERCIBIDO para caja, DEVENGADO para P&L: no se mezclan'), campo('indicadores', 'Indicadores', 'lista', true, 'cada uno con rotulo y valor ya formateado'), campo('lectura', 'Lectura', 'texto', true), campo('alertas', 'Alertas', 'lista', false)],
    required_data: ['periodo', 'fecha', 'criterio', 'indicadores', 'lectura'],
    output_naming: 'Reporte financiero · {{periodo}}',
    destination_policy: DESTINO('CARPETA_EXPLICITA', 'un reporte financiero no se deja suelto en la raíz'),
    sections: [
      { id: 'encabezado', titulo: 'Reporte financiero {{periodo}}', nivel: 1, bloques: [{ tipo: 'datos', pares: [{ clave: 'Período', valor: '{{periodo}}' }, { clave: 'Criterio', valor: '{{criterio}}' }, { clave: 'Fecha', valor: '{{fecha}}' }] }] },
      { id: 'indicadores', titulo: 'Indicadores', nivel: 1, bloques: [{ tipo: 'tabla', columnas: ['Indicador', 'Valor'], desde: 'indicadores', celdas: ['rotulo', 'valor'] }] },
      { id: 'lectura', titulo: 'Lectura', nivel: 1, bloques: [{ tipo: 'parrafo', texto: '{{lectura}}' }] },
      { id: 'alertas', titulo: 'Alertas', nivel: 1, obligatoria: false, bloques: [{ tipo: 'lista', desde: 'alertas' }] },
    ],
  },
  {
    ...BASE,
    template_id: 'presentacion.avance_obra.v1', domain: 'presentacion', file_type: 'slides', tipo_deck: 'AVANCE_OBRA',
    fields: [...IDENTIDAD, campo('periodo', 'Período', 'texto', true), campo('indicadores', 'Indicadores', 'lista', true, 'entre 2 y 4, con rotulo y valor'), campo('ejecutado', 'Ejecutado', 'lista', true), campo('proximo', 'Próximo período', 'lista', false)],
    required_data: ['cliente', 'obra', 'fecha', 'periodo', 'indicadores', 'ejecutado'],
    output_naming: 'Avance {{obra}} · {{periodo}}',
    destination_policy: DESTINO('CARPETA_DE_LA_OBRA'),
    sections: [
      { id: 'estado', titulo: 'Estado de la obra', nivel: 1, bloques: [{ tipo: 'datos', pares: [{ clave: 'Período', valor: '{{periodo}}' }] }] },
      { id: 'indicadores', titulo: 'Los números del período', nivel: 1, bloques: [{ tipo: 'tabla', columnas: ['Indicador', 'Valor'], desde: 'indicadores', celdas: ['rotulo', 'valor'] }] },
      { id: 'ejecutado', titulo: 'Ejecutado en el período', nivel: 1, bloques: [{ tipo: 'lista', desde: 'ejecutado' }] },
      { id: 'proximo', titulo: 'Próximo período', nivel: 1, obligatoria: false, bloques: [{ tipo: 'lista', desde: 'proximo' }] },
    ],
  },
  {
    ...BASE,
    template_id: 'obra.documentacion_entrega.v1', domain: 'documentacion_obra', file_type: 'doc',
    fields: [...IDENTIDAD, campo('entregables', 'Entregables', 'lista', true, 'cada uno con documento, estado, observacion'), campo('responsable', 'Responsable', 'texto', true), campo('observaciones', 'Observaciones', 'texto', false)],
    required_data: ['cliente', 'obra', 'fecha', 'entregables', 'responsable'],
    output_naming: 'Documentación de entrega · {{obra}} · {{fecha}}',
    destination_policy: DESTINO('CARPETA_DE_LA_OBRA'),
    sections: [
      { id: 'encabezado', titulo: 'Documentación de entrega', nivel: 1, bloques: [ficha(), { tipo: 'datos', pares: [{ clave: 'Responsable', valor: '{{responsable}}' }] }] },
      { id: 'entregables', titulo: 'Entregables', nivel: 1, bloques: [{ tipo: 'tabla', columnas: ['Documento', 'Estado', 'Observación'], desde: 'entregables', celdas: ['documento', 'estado', 'observacion'] }] },
      { id: 'observaciones', titulo: 'Observaciones', nivel: 1, obligatoria: false, bloques: [{ tipo: 'parrafo', texto: '{{observaciones}}' }] },
    ],
  },
  {
    ...BASE,
    template_id: 'control.planilla_obra.v1', domain: 'planilla_control', file_type: 'sheet',
    estado: 'DECLARADA_NO_IMPLEMENTADA',
    fields: [campo('obra', 'Obra', 'texto', true), campo('fecha', 'Fecha', 'fecha', true), campo('items', 'Ítems a controlar', 'lista', true)],
    required_data: ['obra', 'fecha', 'items'],
    output_naming: 'Planilla de control · {{obra}} · {{fecha}}',
    destination_policy: DESTINO('CARPETA_DE_LA_OBRA'),
    // DECLARADA Y NO IMPLEMENTADA, A PROPÓSITO. Una planilla de control es un Sheet, y este motor
    // no escribe Sheets: la escritura de Sheets tiene su propio circuito (guarda de escritura,
    // candados, firma) y saltearlo desde acá es exactamente cómo se borró una pestaña entera. El
    // motor devuelve UNSUPPORTED_OPERATION nombrando el motivo, en vez de crear medio archivo.
    sections: [{ id: 'items', titulo: 'Ítems', nivel: 1, bloques: [{ tipo: 'tabla', columnas: ['Ítem', 'Estado'], desde: 'items', celdas: ['item', 'estado'] }] }],
  },
  {
    ...BASE,
    template_id: 'admin.nota.v1', domain: 'documento_administrativo', file_type: 'doc',
    fields: [campo('destinatario', 'Destinatario', 'texto', true), campo('asunto', 'Asunto', 'texto', true), campo('fecha', 'Fecha', 'fecha', true), campo('cuerpo', 'Cuerpo', 'texto', true), campo('firma', 'Firma', 'texto', true)],
    required_data: ['destinatario', 'asunto', 'fecha', 'cuerpo', 'firma'],
    output_naming: 'Nota · {{asunto}} · {{fecha}}',
    destination_policy: DESTINO('CARPETA_EXPLICITA'),
    sections: [
      { id: 'encabezado', titulo: '{{asunto}}', nivel: 1, bloques: [{ tipo: 'datos', pares: [{ clave: 'Para', valor: '{{destinatario}}' }, { clave: 'Fecha', valor: '{{fecha}}' }] }] },
      { id: 'cuerpo', titulo: 'Nota', nivel: 1, bloques: [{ tipo: 'parrafo', texto: '{{cuerpo}}' }] },
      { id: 'firma', titulo: 'Firma', nivel: 1, bloques: [{ tipo: 'parrafo', texto: '{{firma}}' }] },
    ],
  },
]

/** El catálogo VALIDADO. Si una plantilla no cumple el contrato, este módulo no carga: una
 *  plantilla rota descubierta en producción ya escribió un archivo mal. */
export const CATALOGO = Object.freeze(CRUDAS.map((p) => {
  const v = validarPlantilla(p)
  if (!v.ok) throw new Error(`plantilla inválida en el catálogo: ${v.errores.join(' · ')}`)
  return Object.freeze(v.plantilla)
}))

/** Una plantilla por su id. PURA. `null` si no existe — el motor lo traduce a TEMPLATE_NOT_FOUND. */
export const plantilla = (templateId) => CATALOGO.find((p) => p.template_id === String(templateId)) ?? null

/** Las plantillas de un dominio. PURA. */
export const plantillasDeDominio = (dominio) => CATALOGO.filter((p) => p.domain === String(dominio))

/** El catálogo como lo ve quien elige: id, dominio, tipo y qué datos exige. PURA. */
export const indice = () => CATALOGO.map((p) => ({
  template_id: p.template_id, domain: p.domain, file_type: p.file_type, version: p.version,
  estado: p.estado, required_data: p.required_data, output_naming: p.output_naming,
  destination_policy: p.destination_policy.politica,
}))
