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
    revision: null, // ← se clava al pasar a producción, con el sha del repo
    ejecucion: 'local-cpu',
    proveedor: 'local',
    licencia: 'MIT',
    dimensiones: 384,
    estado: ESTADO.CANDIDATO,
    medido: { ms: 7, rssMb: 584, pesosMb: 130, vm: '4 cores · AVX-512 VNNI · sin GPU', fecha: '2026-09-04' },
    porQue: 'multilingüe con español nativo, INT8, 7 ms por embedding en esta VM. `intfloat/multilingual-e5-small` publica además un build `qint8_avx512_vnni` para exactamente este procesador.',
    alternativas: ['sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', 'BAAI/bge-m3'],
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
    licencia: 'GPL-3.0', // ← copyleft: revisar antes de producción
    estado: ESTADO.EXPERIMENTAL,
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
  }))
}
