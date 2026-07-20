// Tool: SINCRONIZAR NÓMINA — el agente que mantiene vivo lo que en el Sheet no puede ser fórmula.
import { sincronizarNomina, formatSync } from '../nomina-sync.mjs'
import { sheetRenderTools } from './sheet-render.mjs'
import { driveWriteTools } from './drive-write.mjs'
import { replicarNomina, formatReplica } from '../nomina-replica.mjs'
import { replicarCobranzas, formatCobranzas } from '../cobranzas-replica.mjs'
import { refrescarEspejo, formatEspejo } from '../espejo-jornales.mjs'

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
            forzar: { type: 'boolean', description: 'true = reescribe el cuadro de quincenas aunque la cantidad no haya cambiado. Usalo para REPARAR la pestaña si alguien movió, borró o pegó filas y quedó desordenada.' },
          },
        },
      },
      async run({ anio, solo_revisar, forzar } = {}) {
        try {
          // PRIMERO el espejo: si _J_OBREROS está vacío, el detector encuentra 0 quincenas y el
          // agente reescribe el cuadro en cero. Le pasó al dueño el 20/07.
          let espejo = null
          try { espejo = await refrescarEspejo(google) }
          catch (e) { espejo = { error: String(e?.message ?? e).slice(0, 160) } }
          const r = await sincronizarNomina(google, {
            file_id: FLUJO, folder_ddjj: DDJJ, anio, escribir: !solo_revisar, forzar,
          })
          if (r.error) return r
          if (r.spec_quincenas?.length) {
            // Si entró una quincena nueva, primero se INSERTA la fila justo antes del TOTAL. Google
            // reajusta solo el SUM del total, el bloque POR CLIENTE y la proyección. Escribir encima
            // del TOTAL en vez de insertar rompería los tres.
            if (r.insertar_filas > 0) {
              const ins = driveWriteTools(google)['drive.insertrows']
              await ins.run({ file_id: FLUJO, tab: 'Jornales por Quincena', at_row: r.fila_total, count: r.insertar_filas })
            }
            // Se reescribe SOLO el cuerpo del cuadro (desde la fila 6): el encabezado, el bloque por
            // cliente y el de proyección son fórmulas que no hay que tocar.
            const render = sheetRenderTools(google)['sheet.render']
            await render.run({
              file_id: FLUJO, tab: 'Jornales por Quincena', anclaje: `A${r.fila_inicio}`, filas: r.spec_quincenas,
            })
          }
          // REGLA DE ORO: todo replicado en Supabase. Se hace SIEMPRE, incluso cuando el Sheet no
          // cambió — porque lo que puede haber cambiado es la base (un deploy, un truncate) y la web
          // tiene que poder leer esto sin depender de que alguien haya tocado la planilla.
          let replica = null
          try { replica = await replicarNomina(google, { file_id: FLUJO }) }
          catch (e) { replica = { error: String(e?.message ?? e).slice(0, 160) } }
          let cobr = null
          try { cobr = await replicarCobranzas(google, { file_id: FLUJO }) }
          catch (e) { cobr = { error: String(e?.message ?? e).slice(0, 160) } }
          return { ...r, replica, espejo, cobranzas: cobr, resumen_texto: `${formatEspejo(espejo)}\n\n${formatSync(r)}\n\n${formatReplica(replica)}\n\n${formatCobranzas(cobr)}` }
        } catch (e) {
          return { error: `no pude sincronizar: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
