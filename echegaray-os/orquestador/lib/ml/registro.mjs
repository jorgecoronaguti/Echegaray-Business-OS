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
    modelo: 'amazon/chronos-bolt-small',
    revision: null,
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'Apache-2.0',
    estado: ESTADO.EXPERIMENTAL,
    medido: null,
    porQue: 'pronostica series sin entrenamiento previo; la familia tiene 25M de descargas. NO reemplaza el forecast determinístico: aporta la banda de incertidumbre sobre el piso conocido.',
    alternativas: ['amazon/chronos-2', 'autogluon/chronos-bolt-small'],
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
    modelo: 'Xenova/whisper-base',
    revision: null,
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'MIT',
    estado: ESTADO.EXPERIMENTAL,
    medido: null,
    porQue: 'transcribe partes de obra dictados. Va por cola, nunca en línea: 30 s de audio son ~30-60 s de CPU.',
  },
  'vision.epp': {
    capacidad: 'analyzeImage',
    modelo: 'keremberke/yolov5s-construction-safety',
    revision: null,
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'GPL-3.0',
    estado: ESTADO.EXPERIMENTAL,
    bloqueado: 'LICENCIA GPL-3.0 — copyleft. Enlazarlo a un producto propietario obliga a liberar el derivado. BLOQUEADO para producción hasta revisión legal explícita del dueño. Cuando llegue la fase de visión hay que buscar una alternativa permisiva (Apache-2.0 o MIT).',
    medido: null,
    porQue: 'detecta casco y chaleco en fotos de obra; ~14 MB, entra en CPU. Nunca afirma un incumplimiento: propone una revisión.',
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
