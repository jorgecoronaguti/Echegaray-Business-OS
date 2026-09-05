// QUÉ MODELO USA CADA CAPACIDAD, CON SU VERSIÓN CLAVADA. UNA TABLA, NO UN `latest` ESCONDIDO.
//
// ═══ POR QUÉ SE PINEA LA REVISIÓN ═══
//
// Un repositorio de Hugging Face es un repo git: su rama `main` se mueve, y el día que se mueve, el
// OS cambia de comportamiento sin que nadie haya tocado una línea. Eso no se puede auditar ni
// revertir. Cada entrada de esta tabla lleva `revision`, y el que no la lleva está declarado como
// `experimental` — no lo puede usar producción.
//
// ═══ EL ESTADO NO ES DECORATIVO ═══
//
//   experimental  se puede probar; produccion() lo rechaza
//   candidato     midió bien en un benchmark, todavía no reemplazó a nadie
//   produccion    lo usa el OS de verdad
//   retirado      quedó, para poder leer un registro histórico de costos sin adivinar
//
// Nada pasa a `produccion` sin un número medido: es la regla de cierre del OS aplicada a modelos.

export const ESTADO = Object.freeze({
  EXPERIMENTAL: 'experimental', CANDIDATO: 'candidato', PRODUCCION: 'produccion', RETIRADO: 'retirado',
  // DEPRECADO es distinto de RETIRADO y la diferencia importa: retirado es «ya no se usa»,
  // deprecado es «se midió, PERDIÓ, y queda escrito para no volver a probarlo sin un motivo nuevo».
  // Sin ese estado, un modelo descartado con evidencia vuelve a la lista de candidatos cada seis
  // meses porque nadie recuerda por qué se había ido.
  DEPRECADO: 'deprecado',
  // BLOQUEADO es una prohibición, no una preferencia: licencia incompatible o política de datos.
  BLOQUEADO: 'bloqueado',
})

/**
 * EL REGISTRO. Todo lo que dice acá está VERIFICADO contra el catálogo real el 04/09/2026, no
 * recordado: id, disponibilidad de ONNX y descargas se consultaron con el token del dueño.
 *
 * `medido` es lo que esta VM contestó, no lo que promete el model card. Si está en `null`, todavía
 * no se midió acá y por eso el estado no puede ser `produccion`.
 */
export const MODELOS = Object.freeze({
  'embeddings.es': {
    capacidad: 'embed',
    modelo: 'Xenova/multilingual-e5-small',
    revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'MIT (base intfloat/multilingual-e5-small)',
    dimensiones: 384,
    estado: ESTADO.PRODUCCION,
    dataset: 'documento_fragmento · 30 preguntas por tipo+periodo + 9 por persona, respuesta verificable',
    medido: {
      ms: 12, rssMb: 885, pesosMb: 118, vm: '4 cores · AVX-512 VNNI · sin GPU', fecha: '2026-09-04',
      // Preguntas cuya respuesta NO se deduce del tipo ni del periodo (n=9):
      dificil: { top1: 0.444, recall5: 0.556, mrr: 0.550 },
      // Preguntas por tipo + periodo (n=30), donde el filtro estructurado ya decide:
      porPeriodo: { top1: 0.067, recall5: 0.267, mrr: 0.156 },
      hibridoConLexico: { top1: 0.667, recall5: 0.889, mrr: 0.778 },
    },
    porQue: 'GANÓ el benchmark del 04/09/2026 contra `granite-embedding-97m-multilingual-r2` sobre los mismos 2.500 fragmentos y las mismas preguntas: Recall@5 26,7% contra 0,0% en el conjunto por período, y 885 MB de RSS contra 2.490 MB. No gana por popularidad: gana por 4 veces el recall a un tercio de la memoria.',
    alternativas: ['ibm-granite/granite-embedding-97m-multilingual-r2 (medido, perdió)', 'onnx-community/bge-m3-ONNX (568 MB de pesos: no entra cómodo en esta VM)'],
  },

  'embeddings.granite': {
    capacidad: 'embed',
    modelo: 'ibm-granite/granite-embedding-97m-multilingual-r2',
    revision: '835ad14087e140460703cf0fae09f97d469d65c2',
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'Apache-2.0',
    dimensiones: 384,
    estado: ESTADO.DEPRECADO,
    dataset: 'el mismo que embeddings.es',
    medido: { ms: 22, rssMb: 2490, pesosMb: 98, fecha: '2026-09-04', porPeriodo: { top1: 0, recall5: 0, mrr: 0.019 } },
    porQue: 'MEDIDO Y DESCARTADO. Sobre las mismas preguntas y el mismo pozo dio Recall@5 0,0% contra 26,7% de e5-small, tardó el doble por consulta y ocupó 2,8 veces la RAM. Su licencia es mejor (Apache-2.0 contra MIT) y su ONNX está cuantizado para esta CPU: nada de eso alcanzó. Queda escrito para no volver a probarlo sin un motivo nuevo.',
    alternativas: [],
  },
  'forecast.series': {
    capacidad: 'forecast',
    modelo: 'amazon/chronos-2',
    revision: null,
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'Apache-2.0',
    estado: ESTADO.BLOQUEADO,
    dataset: 'banco_movimientos · 100 dias / 14 semanas de historia',
    medido: {
      fecha: '2026-09-04',
      // Backtest de origen movil sobre la serie REAL, cinco lineas de base:
      diario: { mejor: 'estacionalSemanal', wape: 1.006, mae: 3852782 },
      semanal: { mejor: 'medianaMovil', wapeNeto: 1.039, wapeSalidas: 0.767 },
    },
    porQue: 'BLOQUEADO POR FALTA DE DATOS, no por el modelo. La serie de caja tiene 100 dias / 14 semanas, y las cinco lineas de base dejan WAPE entre 77% y 104%: el error es del tamano de la propia serie, o sea que la senal no esta en su pasado. Instalar 2 GB de torch para superar un 77% medido sobre 14 puntos seria medir ruido con mas decimales. Lo que SI predice esta caja son los compromisos conocidos —cheques con fecha, vencimientos, cobranzas—, que el OS ya tiene y `forecast.mjs` combina.',
    reingreso: 'volver a medir con 52 semanas de historia (aproximadamente septiembre de 2027) o cuando el WAPE de las lineas de base baje de 50%',
    alternativas: ['amazon/chronos-bolt-small', 'autogluon/chronos-2-small', 'kashif/chronos-2-onnx (ONNX, evitaria torch)'],
  },
  'clasificacion.zeroshot': {
    capacidad: 'classify',
    modelo: 'MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7',
    revision: null,
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'MIT',
    estado: ESTADO.EXPERIMENTAL,
    medido: null,
    porQue: 'clasifica contra etiquetas nuevas sin entrenar. Se usa SÓLO si las reglas no alcanzan.',
  },
  'documentos.layout': {
    capacidad: 'extractDocument',
    modelo: 'docling-project/docling-layout-heron-onnx',
    revision: null,
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'Apache-2.0',
    estado: ESTADO.EXPERIMENTAL,
    medido: null,
    porQue: 'PDF a texto y tablas. NO toca comprobantes que impactan plata: ésos siguen en Claude por decisión escrita en lib/ia/capacidad.mjs.',
  },
  'voz.es': {
    capacidad: 'transcribe',
    modelo: 'onnx-community/whisper-base',
    revision: '1846881b6b',
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'Apache-2.0 (base openai/whisper-base)',
    estado: ESTADO.CANDIDATO,
    dataset: 'pendiente: audios reales de obra. El ruido de una obra en San Juan no esta en ningun leaderboard.',
    medido: { pesosMb: 180, fecha: '2026-09-04' },
    porQue: 'el mas chico que transcribe espanol corrido. `whisper-small` son 547 MB y en una VM de 7 GB que ademas sostiene Postgres, el motor documental y ocho procesos del orquestador, esa diferencia es entre andar y competir por memoria. La interpretacion del parte ya esta implementada y probada sobre el ejemplo real; falta medir la TRANSCRIPCION contra audios de obra, y hasta entonces no pasa a produccion.',
    alternativas: ['onnx-community/whisper-small (547 MB)', 'Xenova/whisper-small'],
  },
  'vision.epp': {
    capacidad: 'vision',
    modelo: 'Xenova/siglip-base-patch16-224',
    revision: '4649052661e53c7000355844105f8a1792088239',
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'Apache-2.0 (base google/siglip-base-patch16-224)',
    estado: ESTADO.RECHAZADO,
    dataset: '160 imagenes reales del Drive; etiqueta deducida de la CARPETA, independiente del modelo',
    medido: {
      fecha: '2026-09-05', pesosMb: 94, rssMb: 781, msPorImagen: 435,
      ochoClases: { aciertos: 0.318, noDecidio: 0.545, errores: 0.136 },
      tresClases: { aciertos: 0.412, noDecidio: 0.471, errores: 0.118 },
    },
    porQue: 'RECHAZADO POR BENCHMARK, con licencia limpia y ejecutado. Los detectores de EPP del Hub corren todos sobre Ultralytics AGPL-3.0, asi que la alternativa correcta era zero-shot permisivo: SigLIP compara la imagen contra FRASES y devuelve confianza, que es justo lo que hace falta para decir «posible ausencia de casco» en vez de «incumplimiento». Se implemento y se midio sobre las imagenes reales. No alcanza: 31,8% en ocho tipos documentales y 41,2% en la pregunta binaria foto/documento/grafico. Los errores se concentran en logos. La guarda por RAZON evita adivinar —se abstiene en la mitad de los casos en vez de acusar— pero una capacidad que no decide la mitad de las veces no es produccion.',
    reingreso: 'el corpus tampoco ayuda: de 160 imagenes del Drive hay UNA fotografia de escena real. La capacidad de EPP no se puede evaluar sin fotos de obra. Cuando existan (canal de Mattermost, parte por voz con foto), volver a medir con este mismo banco.',
    alternativas: ['keremberke/yolov8*-hard-hat (sin licencia declarada)', 'Hansung-Cho/yolov8-ppe (pesos MIT sobre runtime Ultralytics AGPL-3.0)', 'qualcomm/PPE-Detection (BSD-3, sin pesos publicados)'],
  },
  'reranker.es': {
    capacidad: 'rerank',
    modelo: 'Xenova/bge-reranker-base',
    revision: '280bcc27a84e0b898c251e06fddb25171bd9b101',
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'MIT (base BAAI/bge-reranker-base)',
    estado: ESTADO.CANDIDATO,
    dataset: 'las 9 preguntas por persona del benchmark de recuperacion',
    medido: {
      fecha: '2026-09-04', pesosMb: 279, rssMb: 714,
      sinReranker: { top1: 0.667, recall3: 0.778, mrr: 0.736, ms: 636 },
      conReranker: { top1: 0.778, recall3: 0.778, mrr: 0.796, ms: 1730 },
    },
    porQue: 'MEJORA +6,0 puntos de MRR y +11,1 de Top-1, a cambio de 2,7 veces la latencia y 279 MB. Queda CANDIDATO y no produccion porque el conjunto son 9 preguntas: la mejora es real y la muestra es chica. Nota metodologica que vale mas que el numero: la primera medicion dio -7,7 puntos porque se le pasaba `nombre + extracto` en vez del pasaje real. Condenarlo con eso habria sido condenarlo por como se lo llamaba.',
    alternativas: ['onnx-community/bge-reranker-v2-m3-ONNX (Apache-2.0, 571 MB)', 'jinaai/jina-reranker-v2 — DESCARTADO SIN PROBAR: CC-BY-NC-4.0, no comercial'],
  },

  'documentos.ocr': {
    capacidad: 'ocr',
    modelo: 'onnx-community/granite-docling-258M-ONNX',
    revision: 'e8602580df77443fc3421cf3bae0601da601e5c6',
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'Apache-2.0',
    estado: ESTADO.BLOQUEADO,
    dataset: '42 documentos reales del Drive, estratificados por carpeta',
    medido: { fecha: '2026-09-04', msPorPagina: 18863, rssMb: 1033, necesitanOcr: 0.024 },
    porQue: 'BLOQUEADO POR CALIDAD, medido en esta VM. Con cuantizacion q4 produce cajas de layout con el texto degenerado a «s.»; con q8 ALUCINA — devuelve ingles fluido inventado («The following is a list of the most important documents...») sobre un documento en espanol. Es el peor modo de fallar posible para un motor documental: seguro, legible y falso. Y ademas 19 s por pagina. El corpus no lo necesita: el 100% de los PDF de negocio traen capa de texto y solo el 2,4% son escaneos, casi todos logos.',
    reingreso: 'volver a medir si aparece un lote real de escaneos, o con una variante fp16/fp32 si la VM crece. Mientras tanto, un escaneo que impacte dinero va por Claude, que es la regla que el OS ya tiene.',
    alternativas: ['PaddlePaddle/PP-OCRv6_medium_rec_onnx (Apache-2.0, en/zh: no espanol)', 'allenai/olmOCR-2-7B (7B: no entra en esta VM)'],
  },

  'razonamiento': {
    capacidad: 'escalateToClaude',
    modelo: 'lib/ia/capacidad.mjs',
    revision: 'el del repo',
    ejecucion: 'remoto',
    proveedor: 'anthropic',
    licencia: 'comercial',
    estado: ESTADO.PRODUCCION,
    medido: { usdEn52Dias: 196.2, fuente: 'orq.chat_cost', fecha: '2026-09-04' },
    porQue: 'ya en producción. El router NO elige modelo de Claude: delega en lib/ia/, que es su única puerta.',
  },
})

/** El modelo de una clave, o null. Nunca devuelve uno `retirado`. */
export function modeloDe(clave) {
  const m = MODELOS[clave]
  return m && m.estado !== ESTADO.RETIRADO ? m : null
}

/**
 * El modelo que puede usar PRODUCCIÓN para una clave.
 *
 * Exige estado `produccion` Y una medición hecha en esta VM. «Parece funcionar mejor» no alcanza —
 * es la regla que el dueño puso por escrito y acá es código, no una intención.
 */
export function paraProduccion(clave) {
  const m = modeloDe(clave)
  if (!m) return { ok: false, porQue: `no hay modelo registrado para «${clave}»` }
  // UN BLOQUEO DE LICENCIA MANDA SOBRE TODO LO DEMÁS. Da igual lo bien que mida: si el permiso
  // legal no está, no entra. Es lo único de esta función que no se resuelve con un benchmark.
  if (m.bloqueado) return { ok: false, modelo: m, porQue: `«${clave}» está BLOQUEADO: ${m.bloqueado}` }
  if (m.estado !== ESTADO.PRODUCCION) return { ok: false, modelo: m, porQue: `«${clave}» está en estado ${m.estado}: producción sólo usa lo que pasó a produccion` }
  if (!m.medido) return { ok: false, modelo: m, porQue: `«${clave}» no tiene una medición en esta VM` }
  if (m.proveedor !== 'anthropic' && !m.revision) return { ok: false, modelo: m, porQue: `«${clave}» no tiene la revisión clavada: producción no depende de una rama que se mueve` }
  return { ok: true, modelo: m }
}

/** Qué usa hoy producción, para poder contestar «¿qué modelos corren y cuánto cuestan?». */
export function inventario() {
  return Object.entries(MODELOS).map(([clave, m]) => ({
    clave, capacidad: m.capacidad, modelo: m.modelo, revision: m.revision ?? '—',
    ejecucion: m.ejecucion, proveedor: m.proveedor, licencia: m.licencia, estado: m.estado,
    medido: m.medido ? 'sí' : 'no',
    bloqueado: m.bloqueado ? 'SÍ' : '',
  }))
}
