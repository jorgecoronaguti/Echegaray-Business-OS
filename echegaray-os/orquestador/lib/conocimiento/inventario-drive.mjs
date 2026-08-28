// PRIMERO MIRAR, DESPUÉS DECIDIR — el inventario de una carpeta de Drive, clasificado por lo que
// XSAS le puede sacar a cada archivo.
//
// ═══ POR QUÉ EL INVENTARIO VA ANTES QUE CUALQUIER LECTURA ═══
//
// La carpeta que señaló el dueño es `administracion` entera: 3.629 entradas, 1,6 GB sólo en PDF.
// Empezar a leer sin inventariar es empezar a gastar tiempo por orden alfabético. El inventario
// cuesta una consulta a `drive_index` —que ya existe y un timer refresca cada 6 h— y dice qué hay.
//
// ═══ «NO ÚTIL» CON MOTIVO ES UNA RESPUESTA CORRECTA ═══
//
// Un recibo de sueldo no le sirve a un motor de cotización, y decirlo es más honesto que buscarle
// un uso. Lo que NO es aceptable es que desaparezca del recuento: por eso cada archivo sale
// clasificado y con el porqué, y la suma de las clases da el total.

/** La carpeta `administracion` de Drive: la que señaló el dueño, y de la que cuelga todo lo demás.
 *  Vive acá —y no en el script que la usó primero— porque ya son tres los comandos que la estudian y
 *  un id de carpeta repetido en tres archivos es un id que en algún momento va a diferir. */
export const RAIZ_ADMINISTRACION = '1a_3sIbioAQm0EcuJTbu3L6q_hy_LHUXs'

/** Qué se le puede extraer a cada clase de archivo. Es el índice del circuito de estudio. */
export const CLASE = Object.freeze({
  COTIZACION_ECSAS: 'COTIZACION_ECSAS',   // la práctica: rubros, unidades, coeficientes, notas
  PRECIO: 'PRECIO',                       // ítem, unidad, composición, rendimiento, fecha del precio
  RENDIMIENTO: 'RENDIMIENTO',             // actividad, unidad, h/unidad, cuadrilla, condiciones
  MEDICION: 'MEDICION',                   // tipo de elemento, unidad, regla, inclusiones, exclusiones
  REGLAMENTO: 'REGLAMENTO',               // reglamento, versión, jurisdicción, artículo, vigencia
  FABRICANTE: 'FABRICANTE',               // producto, uso, consumo, compatibilidad, limitaciones
  PROYECTO: 'PROYECTO',                   // obra ejecutada: experiencia ECSAS
  NO_UTIL: 'NO_UTIL',                     // y por qué
})

export const QUE_SE_EXTRAE = Object.freeze({
  [CLASE.COTIZACION_ECSAS]: ['rubros y su orden', 'unidad por partida', 'horas por unidad', 'coeficientes de precio', 'notas de alcance', 'forma de pago'],
  [CLASE.PRECIO]: ['ítem', 'unidad', 'precio', 'fecha del precio', 'jurisdicción'],
  [CLASE.RENDIMIENTO]: ['actividad', 'unidad', 'h/unidad', 'cuadrilla', 'condiciones'],
  [CLASE.MEDICION]: ['tipo de elemento', 'unidad', 'regla de medición', 'inclusiones', 'exclusiones'],
  [CLASE.REGLAMENTO]: ['reglamento', 'versión', 'jurisdicción', 'artículo', 'requisito', 'vigencia'],
  [CLASE.FABRICANTE]: ['producto', 'uso', 'consumo', 'rendimiento', 'compatibilidad', 'limitaciones'],
  [CLASE.PROYECTO]: ['qué se ejecutó', 'para quién', 'cuándo', 'con qué alcance'],
  [CLASE.NO_UTIL]: [],
})

const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * LAS REGLAS, EN ORDEN. La primera que engancha decide.
 *
 * El orden importa y no es alfabético: lo que DESCARTA va primero. Un recibo de sueldo guardado
 * dentro de `PRESUPUESTOS - CLIENTES` sigue siendo un recibo de sueldo.
 *
 * Y `donde: 'nombre'` tampoco es un detalle. La primera versión miraba ruta+nombre para la regla de
 * cotización, y como la carpeta raíz se llama «PRESUPUESTOS - CLIENTES», los 1.091 archivos de
 * adentro —planos, actas, fotos— quedaban clasificados COTIZACION_ECSAS. Una regla que engancha con
 * todo no clasifica nada.

 */
export const REGLAS = Object.freeze([
  { clase: CLASE.NO_UTIL, cuando: /recibos? de sueldo|recibo \d|telegrama|\bdni\b|\bcuil\b|alta afip|baja \d|certificado de cobertura|libreta|f\.?931/, donde: 'ambos', porQue: 'documento laboral o previsional de una persona: es dato de legajo, no conocimiento de cotización' },
  { clase: CLASE.NO_UTIL, cuando: /facturas?\b|^\d{11}_\d{3}_|nota de credito|remito|comprobante de transferencia|extracto/, donde: 'ambos', porQue: 'comprobante fiscal o bancario: lo consume el circuito de compras y caja, no el de cotización' },
  { clase: CLASE.NO_UTIL, cuando: /logo|caratula|whatsapp|^img[-_]|^foto/, donde: 'nombre', porQue: 'material gráfico sin contenido técnico' },
  { clase: CLASE.RENDIMIENTO, cuando: /horas? de hombre|horas hombre|\bhh\b|rendimient|gasto de mano de obra|descripcion de tareas/, donde: 'nombre', porQue: 'nombra horas de mano de obra por tarea: es de donde sale un rendimiento' },
  { clase: CLASE.PRECIO, cuando: /costos? sugerid|lista de precio|precios de referencia|analisis de precio|\bapu\b|tarifario|escala salarial/, donde: 'nombre', porQue: 'lista de precios o análisis de precio unitario: ítem, unidad y fecha del precio' },
  { clase: CLASE.MEDICION, cuando: /acta de medicion|regla de medicion|\bnrm\b|planilla de computo/, donde: 'nombre', porQue: 'define cómo se mide un trabajo: unidad, inclusiones y exclusiones' },
  { clase: CLASE.REGLAMENTO, cuando: /cirsoc|inpres|\biram\b|reglamento|especificaciones tecnicas|especificacion tecnica|pliego|memoria descriptiva|normativa|programa de seguridad/, donde: 'nombre', porQue: 'documento normativo o de especificación: artículo, requisito y vigencia' },
  { clase: CLASE.FABRICANTE, cuando: /ficha tecnica|hoja de seguridad|catalogo|manual|instructivo|datasheet/, donde: 'nombre', porQue: 'documentación de producto: consumo, rendimiento y limitaciones de uso' },
  { clase: CLASE.COTIZACION_ECSAS, cuando: /cotizacion|cotizacion interna|presupuesto|listado de tareas|computo|oferta|adicional/, donde: 'nombre', porQue: 'es una cotización o un cómputo de ECSAS: de acá sale la práctica de cotización' },
  { clase: CLASE.PROYECTO, cuando: /presupuestos - clientes/, donde: 'ruta', porQue: 'documento de una obra cotizada o ejecutada: sirve como experiencia ECSAS' },
])

/** Clasifica UN archivo. Devuelve siempre una clase y siempre un porqué. PURA. */
export function clasificar({ nombre = '', ruta = '', esCarpeta = false } = {}) {
  if (esCarpeta) return { clase: CLASE.NO_UTIL, porQue: 'es una carpeta, no un documento', regla: null }
  const n = sinAcentos(nombre)
  const r = sinAcentos(ruta)
  for (const regla of REGLAS) {
    const texto = regla.donde === 'nombre' ? n : regla.donde === 'ruta' ? r : `${r} ${n}`
    if (regla.cuando.test(texto)) return { clase: regla.clase, porQue: regla.porQue, regla: String(regla.cuando) }
  }
  return { clase: CLASE.NO_UTIL, porQue: 'ninguna regla lo reconoce: no se sabe qué se le podría extraer, y suponerlo sería inventarlo', regla: null }
}

/** El inventario de una lista de archivos, con el recuento por clase y por formato. PURA. */
export function inventariar(archivos = [], { formatoDe = () => null } = {}) {
  const fichas = archivos.map((a) => {
    const c = clasificar(a)
    return { ...a, ...c, seExtrae: QUE_SE_EXTRAE[c.clase], formato: formatoDe(a) }
  })
  const cuenta = (campo) => fichas.reduce((acc, f) => { const k = f[campo] ?? 'sin dato'; acc[k] = (acc[k] ?? 0) + 1; return acc }, {})
  return {
    total: fichas.length,
    porClase: cuenta('clase'),
    porFormato: cuenta('formato'),
    utiles: fichas.filter((f) => f.clase !== CLASE.NO_UTIL).length,
    noUtiles: fichas.filter((f) => f.clase === CLASE.NO_UTIL).length,
    fichas,
  }
}

/** El subárbol de una carpeta de Drive, leído del índice que ya mantiene el OS. */
export async function subarbol({ query }, raizId) {
  const { rows } = await query(
    `with recursive arbol as (
        select drive_file_id, name, path, mime_type, is_folder, tipo, size_bytes, modified_time, 0 as nivel
          from public.drive_index where drive_file_id = $1
        union all
        select h.drive_file_id, h.name, h.path, h.mime_type, h.is_folder, h.tipo, h.size_bytes, h.modified_time, a.nivel + 1
          from public.drive_index h join arbol a on h.parent_id = a.drive_file_id)
      select * from arbol where nivel > 0 order by path, name`, [raizId])
  return rows.map((f) => ({
    driveId: f.drive_file_id, nombre: f.name, ruta: f.path, mime: f.mime_type,
    esCarpeta: f.is_folder, tipo: f.tipo, bytes: f.size_bytes === null ? null : Number(f.size_bytes),
    modificado: f.modified_time ? new Date(f.modified_time).toISOString().slice(0, 10) : null,
  }))
}
