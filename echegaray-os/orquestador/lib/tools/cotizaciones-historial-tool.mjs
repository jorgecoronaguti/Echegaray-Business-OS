// Tool: HISTORIAL de cotizaciones leído del data room (área Comercial).
// El historial comercial real vive en administracion/PRESUPUESTOS/<CLIENTE>/<TRABAJO>/ —
// 53 clientes y ~400 trabajos. No se le pide al dueño que lo cargue: se lee. 0 API.
import { historialCotizaciones } from '../cotizaciones-historial.mjs'

export function cotizacionesHistorialTools() {
  return {
    'cotizacion.historial': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'cotizaciones_historial',
        description:
          'HISTORIAL REAL de todo lo que la empresa cotizó, leído del data room (administracion/PRESUPUESTOS, organizado por CLIENTE y por TRABAJO). Sin "cliente" devuelve el panorama: cuántos clientes, cuántos trabajos cotizados y el ranking de clientes por cantidad de trabajos. Con "cliente" devuelve TODOS los trabajos cotizados a ese cliente, con qué documentos tiene cada expediente (planilla de cotización, presupuesto, pliego, planos, orden de compra, remito) y la última actividad. USALO para "¿qué le cotizamos a ARCOR?", "¿cotizamos algo parecido antes?", "¿tenemos antecedente de este tipo de trabajo?", "¿cuántas cotizaciones hicimos?". Es el mejor antecedente para cotizar algo nuevo: buscar el trabajo parecido y mirar su expediente. OJO: dice qué se cotizó, NO si se ganó ni con qué margen.',
        input_schema: {
          type: 'object',
          properties: { cliente: { type: 'string', description: 'cliente a buscar (parcial, ej. "arcor", "saint"); vacío = panorama general' } },
        },
      },
      async run(input) {
        try {
          return await historialCotizaciones({ cliente: input?.cliente })
        } catch (e) {
          return { error: `no pude leer el historial de cotizaciones: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
