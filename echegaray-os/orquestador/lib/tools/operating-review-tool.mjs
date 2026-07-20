// Tool: OPERATING REVIEW — el paso entre detectar y decidir. 0 API para abrir y listar.
import { abrirReview, leerReview, formatReview, decidirPunto } from '../operating-review.mjs'

export function operatingReviewTools() {
  return {
    'os.operating_review': {
      capability: 'os.read',
      schema: {
        name: 'operating_review',
        description:
          'Abre (o continúa) la REVISIÓN OPERATIVA de un área: junta los hallazgos que el OS ya detectó ' +
          '—acciones abiertas de los especialistas y pendientes del backlog— y les pone la estructura ' +
          'esperado → real → desvío → causa → decisión → responsable → fecha. USALA cuando el dueño diga ' +
          '"revisemos administración y finanzas", "prepará la reunión de X", "qué hay que decidir en X", ' +
          '"pasemos en limpio los pendientes de X". Es idempotente: llamarla dos veces NO duplica puntos. ' +
          'NO inventa causas ni decisiones: lo que no tiene evidencia queda marcado como faltante. Un punto ' +
          'sin decisión + responsable + fecha NO está resuelto, y el impacto en $ suma sólo lo cuantificable ' +
          '(los puntos sin monto no son cero: son plata sin medir).',
        input_schema: {
          type: 'object',
          properties: {
            area: { type: 'string', description: 'Área a revisar ("administracion_finanzas", "finanzas", "obras"…).' },
            desde: { type: 'string', description: 'Inicio del período YYYY-MM-DD. Por defecto, el 1º del mes actual.' },
            hasta: { type: 'string', description: 'Fin del período YYYY-MM-DD. Por defecto, hoy.' },
          },
          required: ['area'],
        },
      },
      async run({ area, desde, hasta } = {}) {
        try {
          const r = await abrirReview({ area, desde, hasta })
          if (r.error) return r
          return { ...r, resumen_texto: formatReview(r) }
        } catch (e) {
          return { error: `no pude abrir el review: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },

    'os.decidir_punto_review': {
      capability: 'os.write',
      schema: {
        name: 'decidir_punto_review',
        description:
          'Registra la DECISIÓN de un punto de una revisión operativa: causa, decisión, responsable y fecha ' +
          'límite. Es un registro INTERNO (no ejecuta pagos, ni manda nada afuera). Exige responsable y una ' +
          'decisión con texto: una decisión sin dueño no se ejecuta, y el OS no la da por tomada. Usala ' +
          'DESPUÉS de que el dueño diga qué hacer con un punto, nunca por tu cuenta.',
        input_schema: {
          type: 'object',
          properties: {
            punto_id: { type: 'string', description: 'ID del punto (viene en el detalle del review).' },
            causa: { type: 'string', description: 'Por qué pasó. Sólo si hay evidencia; si no, omitir.' },
            decision: { type: 'string', description: 'Qué se hace.' },
            responsable: { type: 'string', description: 'Quién lo hace. Obligatorio.' },
            fecha_limite: { type: 'string', description: 'Para cuándo, YYYY-MM-DD.' },
            impacto: { type: 'string', description: 'Impacto esperado de la decisión.' },
          },
          required: ['punto_id', 'decision', 'responsable'],
        },
      },
      async run(args = {}) {
        try {
          return await decidirPunto(args)
        } catch (e) {
          return { error: `no pude registrar la decisión: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },

    'os.leer_review': {
      capability: 'os.read',
      schema: {
        name: 'leer_review',
        description: 'Lee una revisión operativa ya abierta por su id, con el estado de cada punto.',
        input_schema: {
          type: 'object',
          properties: { review_id: { type: 'string', description: 'ID del review.' } },
          required: ['review_id'],
        },
      },
      async run({ review_id } = {}) {
        try {
          const r = await leerReview(review_id)
          return r.error ? r : { ...r, resumen_texto: formatReview(r) }
        } catch (e) {
          return { error: `no pude leer el review: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
