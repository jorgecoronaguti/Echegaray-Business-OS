// Tool: NO CONFORMIDADES de obra (área Calidad). Greenfield ("no existe, hay que empezar a tenerlo").
// Trata el desvío de calidad como proceso detección→tratamiento→cierre. Interno/reversible, 0 API.
import { registrarNC, estadoNC } from '../no-conformidades.mjs'

export function noConformidadesTools() {
  return {
    'nc.registrar': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'registrar_no_conformidad',
        description:
          'REGISTRA una NO CONFORMIDAD de calidad (desvío detectado en obra: material fuera de especificación, ejecución defectuosa, retrabajo, incumplimiento de pliego) o AVANZA su estado (abierta → en_tratamiento → cerrada). USALO cuando el dueño diga "hubo un problema de calidad en [obra]", "el hormigón de [obra] no cumplió", "cerramos la no conformidad de [obra]". Pasá obra, descripción (qué pasó), gravedad (leve/moderada/grave/critica) y estado. Al cerrar podés pasar acción correctiva. NO inventes. Confirmá siempre qué registraste. Obras: La Estrella, San Francisco, Messina, ARCOR, Galpones.',
        input_schema: {
          type: 'object',
          properties: {
            obra: { type: 'string', description: 'nombre de la obra' },
            descripcion: { type: 'string', description: 'qué pasó (el desvío de calidad)' },
            gravedad: { type: 'string', description: 'leve | moderada | grave | critica' },
            tipo: { type: 'string', description: 'material | ejecucion | documentacion | seguridad (opcional)' },
            estado: { type: 'string', description: 'abierta | en_tratamiento | cerrada (default abierta)' },
            accion_correctiva: { type: 'string', description: 'qué se hizo para corregirla (opcional)' },
            detectada_por: { type: 'string', description: 'quién la detectó (opcional)' },
          },
          required: ['descripcion'],
        },
      },
      async run(input) {
        try {
          if (!input?.descripcion) return { error: 'necesito la descripción de la no conformidad (qué pasó)' }
          return await registrarNC(input)
        } catch (e) {
          return { error: `no pude registrar la no conformidad: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
    'nc.estado': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'no_conformidades_estado',
        description:
          'Estado de las NO CONFORMIDADES de calidad: cuántas abiertas vs cerradas, el desglose por gravedad, las GRAVES/CRÍTICAS abiertas (lo que hay que atacar ya) y el tiempo promedio de cierre. USALO para "¿cómo venimos con calidad?", "¿qué no conformidades tenemos abiertas?", "¿hay algo grave sin resolver?", "no conformidades de [obra]". Pasá "obra" para una obra o vacío para todas. Números reales de lo cargado, 0 inventado.',
        input_schema: { type: 'object', properties: { obra: { type: 'string', description: 'nombre de la obra (opcional; vacío = todas)' } } },
      },
      async run(input) {
        try {
          return await estadoNC(input?.obra)
        } catch (e) {
          return { error: `no pude leer las no conformidades: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
