// Tool de APRENDIZAJE (PRP-016 F1-auto): el modelo la llama SOLO cuando el dueño le
// enseña o lo corrige con un HECHO DURABLE, sin que el dueño tenga que decir "recordá".
// Guarda en conocimiento_empresa con origen_task_id NULL (owner-taught, separado del
// ruido de la vigilancia). Lectura/Nivel A — reusa 'drive.read' (auto) para no requerir
// una migración de policy. Efecto: solo escribe una fila de conocimiento propio; seguro.
import { query } from '../db.mjs'
import { proposeSkillImprovement } from '../skill-proposals.mjs'

export function learnTools() {
  return {
    'learn.save': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'aprender',
        description:
          'Guardá un HECHO DURABLE que el dueño te enseñó o con el que te CORRIGIÓ: un proveedor clave, un criterio/preferencia de trabajo, un precio de referencia, un dato estable de una obra o cliente. El OS lo recordará y lo usará en próximas respuestas (interés compuesto: menos preguntar, menos API). NO uses esto para acciones/tareas puntuales, ni datos que cambian seguido (saldos del día), ni cosas que ya están en un archivo. Pasá afirmacion (el hecho claro y completo, autocontenido) y area (dominio: finanzas, obra, presupuesto, compras, etc.). REGLA CRÍTICA: esto guarda lo que el DUEÑO te enseñó, NO tu propio análisis. Si te hizo una PREGUNTA, la respuesta va en tu texto al dueño — nunca metas tu respuesta acá y contestes "Guardado". Guardar no es responder: si llamás a esta herramienta, tu mensaje final igual tiene que contener la respuesta completa.',
        input_schema: {
          type: 'object',
          properties: {
            afirmacion: { type: 'string', description: 'el hecho durable, claro y autocontenido' },
            area: { type: 'string', description: 'dominio, ej. "obra", "presupuesto", "finanzas"' },
          },
          required: ['afirmacion'],
        },
      },
      async run(input) {
        const af = String(input?.afirmacion || '').trim()
        if (af.length < 4) return { error: 'afirmacion muy corta o vacía' }
        const clave = af.toLowerCase().replace(/\s+/g, ' ').slice(0, 200)
        const area = String(input?.area || 'general').slice(0, 40)
        const { rows } = await query(
          `insert into public.conocimiento_empresa (area, afirmacion, clave, confianza)
           values ($1, $2, $3, 'alta')
           on conflict (clave) do update set veces_confirmado = public.conocimiento_empresa.veces_confirmado + 1, updated_at = now(), vigente = true
           returning veces_confirmado`,
          [area, af.slice(0, 1000), clave],
        )
        // PRP-016 F3: recurrencia (≥2) ⇒ proponer revisar la skill del dominio (no la muta).
        const veces = rows[0]?.veces_confirmado ?? 0
        if (veces >= 2) await proposeSkillImprovement({ area, afirmacion: af, veces })
        return { ok: true, aprendido: af.slice(0, 160) }
      },
    },
  }
}
