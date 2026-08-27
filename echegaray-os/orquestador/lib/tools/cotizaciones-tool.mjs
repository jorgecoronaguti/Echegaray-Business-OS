// Tool: BIBLIOTECA de cotizaciones (área Comercial). PRP Fase 1. Registra y sigue cada cotización
// (cliente, obra, monto, margen, estado ganada/perdida) para que dejen de perderse. Interno, 0 API.
import { registrarCotizacion, estadoCotizaciones, desvioCotizacionObra } from '../cotizaciones.mjs'

export function cotizacionesTools() {
  return {
    'cotizacion.registrar': {
      // ESCRIBE: hace un INSERT en `public.cotizaciones`. Declaraba `drive.read` y por eso las dos
      // cerraduras de `xsas-permisos.mjs` no se enteraban — un `jefe_obra` llegaba a ejecutarla.
      capability: 'os.write',
      account: 'ecsas',
      schema: {
        name: 'registrar_cotizacion',
        description:
          'REGISTRA una cotización en la biblioteca o AVANZA su estado (borrador → emitida → ganada/perdida). USALO cuando el dueño diga "cotizamos [obra] para [cliente] por $X", "ganamos la cotización de [cliente]", "perdimos la de [obra]". Guarda cliente, obra, monto de venta, costo estimado (del APU) y margen para que las cotizaciones NO se pierdan y se pueda aprender de ellas. Si sabés la obra canónica (La Estrella, San Francisco, Messina, ARCOR, Galpones) pasala en "obra" para enlazarla. El margen se deriva solo si das venta y costo. NO inventes montos. Confirmá siempre qué registraste.',
        input_schema: {
          type: 'object',
          properties: {
            cliente: { type: 'string', description: 'cliente al que se cotiza' },
            obra_nombre: { type: 'string', description: 'nombre de la obra/proyecto cotizado' },
            obra: { type: 'string', description: 'obra canónica si aplica (para enlazar; opcional)' },
            monto_venta: { type: 'string', description: 'precio de venta s/IVA cotizado (ej. "$47.590.271,50")' },
            costo_estimado: { type: 'string', description: 'costo estimado del APU (opcional, sirve para comparar vs real)' },
            margen_pct: { type: 'string', description: 'margen % (opcional; se deriva si das venta y costo)' },
            estado: { type: 'string', description: 'borrador | emitida | ganada | perdida (default emitida)' },
            notas: { type: 'string', description: 'notas/alcance (opcional)' },
          },
          required: [],
        },
      },
      async run(input) {
        try {
          if (!input?.cliente && !input?.obra_nombre) return { error: 'necesito al menos el cliente o el nombre de la obra cotizada' }
          return await registrarCotizacion(input)
        } catch (e) {
          return { error: `no pude registrar la cotización: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
    'cotizacion.estado': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'cotizaciones_estado',
        description:
          'Estado de la BIBLIOTECA de cotizaciones: cuántas hay en juego, ganadas y perdidas, la TASA DE CONVERSIÓN (ganadas / decididas), el monto total cotizado, el monto ganado y el margen promedio. USALO para "¿cómo venimos con las cotizaciones?", "¿cuánto tenemos cotizado?", "¿qué tasa de conversión tenemos?", "cotizaciones de [cliente]". Pasá "cliente" o "estado" para filtrar; vacío = todas. Números reales de lo cargado, 0 inventado.',
        input_schema: {
          type: 'object',
          properties: {
            cliente: { type: 'string', description: 'filtrar por cliente (opcional)' },
            estado: { type: 'string', description: 'filtrar por estado: borrador|emitida|ganada|perdida (opcional)' },
          },
        },
      },
      async run(input) {
        try {
          return await estadoCotizaciones(input || {})
        } catch (e) {
          return { error: `no pude leer las cotizaciones: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
    'cotizacion.desvio': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'cotizacion_vs_real',
        description:
          'APRENDIZAJE DE LA COTIZACIÓN: compara lo que se COTIZÓ para una obra contra lo que realmente COSTÓ. Devuelve el desvío de costo ($ y %), el margen estimado vs. el margen real, y la EROSIÓN DE MARGEN (cuántos puntos de margen se perdieron entre lo cotizado y la realidad). USALO para "¿cómo nos fue con lo que cotizamos en [obra]?", "¿cotizamos bien [obra]?", "¿cuánto margen perdimos en [obra]?", "desvío de [obra]". Es la señal para corregir la próxima cotización. Si no hay cotización cargada para esa obra lo dice — no inventa una base de comparación. Obras: La Estrella, San Francisco, Messina, ARCOR, Galpones.',
        input_schema: {
          type: 'object',
          properties: { obra: { type: 'string', description: 'nombre de la obra' } },
          required: ['obra'],
        },
      },
      async run(input) {
        try {
          if (!input?.obra) return { error: 'necesito la obra' }
          return await desvioCotizacionObra(input.obra)
        } catch (e) {
          return { error: `no pude calcular el desvío: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
