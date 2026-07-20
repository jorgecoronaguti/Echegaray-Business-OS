// Tool: SINCRONIZAR NÓMINA — el agente que mantiene vivo lo que en el Sheet no puede ser fórmula.
import { sincronizarNomina, formatSync } from '../nomina-sync.mjs'
import { sheetRenderTools } from './sheet-render.mjs'

const FLUJO = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DDJJ = '1em3q6p2Gy4SMk2zRfaATbVL0FWqOf0HB'

export function nominaSyncTools(google) {
  return {
    'os.sincronizar_nomina': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'sincronizar_nomina',
        description:
          'Actualiza las dos cosas de las pestañas de nómina que NO pueden ser una fórmula y por eso ' +
          'se quedan viejas en silencio: (1) las cargas sociales declaradas, que salen de los PDF de ' +
          'las DDJJ F931 en Drive, y (2) los rangos de cada quincena en el cuadro de jornales, que ' +
          'cambian cuando se carga una quincena nueva. Todo lo demás del Sheet ya se actualiza solo ' +
          'porque son fórmulas. Es idempotente: si no cambió nada, no reescribe. Corré esto cuando el ' +
          'contador suba un F931 nuevo o se cargue una quincena, o dejalo programado.',
        input_schema: {
          type: 'object',
          properties: {
            anio: { type: 'string', description: 'Año de las DDJJ a leer. Por defecto, el actual.' },
            solo_revisar: { type: 'boolean', description: 'true = informa qué cambiaría sin escribir.' },
          },
        },
      },
      async run({ anio, solo_revisar } = {}) {
        try {
          const r = await sincronizarNomina(google, {
            file_id: FLUJO, folder_ddjj: DDJJ, anio, escribir: !solo_revisar,
          })
          if (r.error) return r
          if (r.spec_quincenas?.length) {
            // Se reescribe SOLO el cuerpo del cuadro de quincenas (desde la fila 5), no la pestaña
            // entera: el encabezado y el bloque "por obra" son fórmulas que no hay que tocar.
            const render = sheetRenderTools(google)['sheet.render']
            await render.run({
              file_id: FLUJO, tab: 'Jornales por Quincena', anclaje: 'A5', filas: r.spec_quincenas,
            })
          }
          return { ...r, resumen_texto: formatSync(r) }
        } catch (e) {
          return { error: `no pude sincronizar: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
