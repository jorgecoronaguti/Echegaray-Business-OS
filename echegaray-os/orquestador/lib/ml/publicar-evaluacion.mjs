// QUÉ DE LAS EVALUACIONES PUEDE SALIR DE LA VM, Y QUÉ NO. NÚCLEO PURO.
//
// ═══ LA DISTINCIÓN QUE HAY QUE HACER EXPLÍCITA ═══
//
// «Los datos son sensibles» es cierto y no alcanza como respuesta, porque mezcla dos cosas muy
// distintas: lo que NO SE PUEDE subir y lo que simplemente NO SE EVALUÓ. Este archivo separa las
// dos, campo por campo, para que la decisión quede escrita en vez de intuida.
//
//   NO SALE NUNCA   el texto de una pregunta (lleva nombres de empleados y de clientes)
//                   los importes reales · los CUIT · los nombres de proveedores
//                   los ids de Drive (identifican un documento de la empresa)
//                   cualquier fragmento de un documento
//
//   SÍ PUEDE SALIR  el ESQUEMA del dataset · cuántas preguntas hay de cada familia
//                   las MÉTRICAS: recall, MRR, latencia, RAM
//                   qué modelo, qué revisión, qué licencia, qué estado
//                   el hash del dataset — identifica la versión sin revelar su contenido
//
// Lo que sale no dice nada de Echegaray como empresa: dice qué modelos evaluó y con qué resultado.
// Eso es exactamente lo que sirve tener versionado fuera de la VM, porque si el disco se pierde, la
// HISTORIA DE MEDICIONES es lo que no se puede reconstruir — los datos sí, están en el Sheet.

/** Los campos que se van del dataset. Lista blanca, no negra: lo que no está declarado no sale. */
const CAMPOS_PUBLICABLES = ['nombre', 'version', 'creado', 'total', 'familias', 'hash', 'corpus']

/**
 * El manifiesto público de un dataset de evaluación. Sin una sola pregunta adentro.
 * @param {object} dataset lo que devuelve `cargarDataset`
 */
export function manifiestoDe(dataset) {
  const m = {}
  for (const k of CAMPOS_PUBLICABLES) if (dataset[k] !== undefined) m[k] = dataset[k]
  m.sensibilidad = 'las preguntas NO se publican: llevan nombres de personas, CUIT e importes reales'
  m.publicado = new Date().toISOString().slice(0, 10)
  // El hash viaja para poder decir «esta métrica se midió contra ESTA versión» sin revelar cuál es.
  if (!m.hash) throw new Error('un manifiesto sin hash no sirve: no se puede saber qué versión midió')
  return m
}

/** Verifica que un objeto NO lleve nada que no deba salir. Se corre ANTES de subir, siempre: una
 *  lista blanca mal escrita es un error de una línea con consecuencia permanente. */
/**
 * LOS TRES HALLAZGOS SUSTANTIVOS, SOBRE TEXTO PLANO.
 *
 * Se separó de `esPublicable` el 05/09/2026 porque el gateway necesita el mismo criterio ANTES de
 * mandarle un texto a un proveedor externo en modo sombra, y ahí no hay un objeto con campos: hay
 * un prompt. Dos copias de «qué es un dato sensible» divergen el día que se agrega la cuarta
 * comprobación y sólo una se entera.
 */
export function hallazgosEnTexto(txt) {
  const hallazgos = []
  if (/\b\d{2}-?\d{8}-?\d\b/.test(txt)) hallazgos.push('parece contener un CUIT')
  if (/\$\s?\d{1,3}(\.\d{3})+/.test(txt)) hallazgos.push('parece contener un importe en pesos')
  if (/[A-ZÁÉÍÓÚÑ]{3,},\s*[A-ZÁÉÍÓÚÑ]{3,}/.test(txt)) hallazgos.push('parece contener un nombre de persona («APELLIDO, NOMBRE»)')
  return hallazgos
}

/** Verifica que un objeto NO lleve nada que no deba salir. Se corre ANTES de subir, siempre: una
 *  lista blanca mal escrita es un error de una línea con consecuencia permanente. */
export function esPublicable(obj) {
  const txt = JSON.stringify(obj)
  const hallazgos = hallazgosEnTexto(txt)
  // LOS CAMPOS QUE LLEVAN CONTENIDO, y no la palabra «proveedor» a secas.
  //
  // La primera versión incluía `proveedor` en esta lista y bloqueó los umbrales calibrados, donde
  // «proveedor» es el nombre de una CATEGORÍA DE ENTIDAD —al lado de «cliente», «empleado» y
  // «material»— y no el nombre de ningún proveedor. Un guardián que bloquea lo inocuo no protege
  // más: enseña a esquivarlo, y ahí sí se cuela lo que importa. Los datos reales de un proveedor
  // los atrapan igual las tres comprobaciones sustantivas: CUIT, importe y nombre de persona.
  if (/"(texto|preguntas|fragmento|concepto|nombre_archivo|drive_file_id|correcto|extracto|pasajes|razon_social)"\s*:/.test(txt)) {
    hallazgos.push('lleva un campo de contenido o un identificador de documento')
  }
  return { publicable: hallazgos.length === 0, hallazgos }
}

/**
 * Los umbrales calibrados, listos para publicar.
 *
 * El archivo entero NO se puede subir: su campo `comoSeMidio` nombra las tablas del negocio y su
 * `porQue` cita proveedores reales. Los NÚMEROS sí — son la calibración, que es justamente lo que
 * hay que poder comparar dentro de seis meses. Se copian los campos declarados y nada más.
 */
export function umbralesPublicables(cfg) {
  return {
    version: cfg.version,
    fecha: cfg.fecha,
    resolverVersion: cfg.resolverVersion,
    modeloEmbeddings: cfg.modeloEmbeddings,
    entidades: Object.fromEntries(Object.entries(cfg.entidades ?? {}).map(([k, v]) => [k, {
      auto: v.auto, sugerido: v.sugerido, margen: v.margen, calibrado: v.calibrado,
      // De la medición salen los CONTEOS, no los ejemplos.
      medicion: v.medicion ? {
        positivos: v.medicion.positivos, negativosEvaluados: v.medicion.negativosEvaluados,
        falsosPositivos: v.medicion.falsosPositivos, falsosNegativos: v.medicion.falsosNegativos,
      } : null,
    }])),
  }
}

/** El registro de modelos, listo para publicar: ids, revisiones, licencias, estados y métricas. */
export function registroPublicable(inventario) {
  return inventario.map((m) => ({
    capacidad: m.capacidad,
    modelo: m.modelo,
    revision: m.revision ?? null,
    licencia: m.licencia,
    ejecucion: m.ejecucion,
    estado: m.estado,
    // La medición sale entera: son números sobre modelos, no sobre la empresa.
    medido: m.medido ?? null,
    // El porqué NO sale: está escrito con ejemplos reales del negocio.
    tienePorQue: Boolean(m.porQue),
  }))
}
