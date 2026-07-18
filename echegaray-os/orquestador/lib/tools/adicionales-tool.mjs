// Tool: registrar y ver ADICIONALES de obra (área Obras). Greenfield ("no se manejan bien"). El
// adicional no cobrado es plata perdida → el OS lo trata como proceso. Interno/reversible (drive.read).
import { registrarAdicional, estadoAdicionales } from '../adicionales.mjs'

export function adicionalesTools() {
  return {
    'adicional.registrar': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'registrar_adicional',
        description:
          'REGISTRA un adicional de obra o AVANZA su estado en el flujo detectado→cotizado→aprobado→facturado→cobrado. USALO cuando el dueño diga "detectamos un adicional en [obra]", "el adicional de [obra] se aprobó por $X", "facturé el adicional de [obra]". El adicional NO cobrado es plata perdida, por eso se sigue como proceso. Pasá obra, concepto (qué es), estado (default "detectado"), y monto (obligatorio salvo en "detectado"). Confirmá SIEMPRE qué registraste. NO inventes montos. Obras: La Estrella, San Francisco, Messina, ARCOR, Galpones.',
        input_schema: {
          type: 'object',
          properties: {
            obra: { type: 'string', description: 'nombre de la obra' },
            concepto: { type: 'string', description: 'qué es el adicional (ej. "muro de contención extra")' },
            estado: { type: 'string', description: 'detectado | cotizado | aprobado | facturado | cobrado (default detectado)' },
            monto: { type: 'number', description: 'monto del adicional (obligatorio si no es "detectado")' },
            detectado_por: { type: 'string', description: 'quién lo detectó (opcional)' },
          },
          required: ['obra', 'concepto'],
        },
      },
      async run(input) {
        try {
          if (!input?.obra || !input?.concepto) return { error: 'faltan "obra" y "concepto"' }
          return await registrarAdicional(input)
        } catch (e) {
          return { error: `no pude registrar el adicional: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
    'adicional.estado': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'adicionales_estado',
        description:
          'Estado de los ADICIONALES: el embudo (detectados → aprobados → facturados → cobrados), el monto sin cobrar, y el KPI clave % COBRADO SOBRE APROBADO (cuánto del adicional aprobado realmente se cobró). USALO para "¿cómo venimos con los adicionales?", "¿cuánto tengo en adicionales sin cobrar?", "adicionales de [obra]". Pasá "obra" para una obra, o vacío para todas. Números reales de lo cargado, 0 inventado.',
        input_schema: { type: 'object', properties: { obra: { type: 'string', description: 'nombre de la obra (opcional; vacío = todas)' } } },
      },
      async run(input) {
        try {
          return await estadoAdicionales(input?.obra)
        } catch (e) {
          return { error: `no pude leer los adicionales: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
