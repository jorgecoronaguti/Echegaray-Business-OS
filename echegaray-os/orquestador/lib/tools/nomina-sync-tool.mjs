// Tool: SINCRONIZAR NÓMINA — el agente que mantiene vivo lo que en el Sheet no puede ser fórmula.
import { sincronizarNomina, formatSync } from '../nomina-sync.mjs'
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
          // ═══ ESTA TOOL YA NO ESCRIBE EL CUADRO DE QUINCENAS ═══
          //
          // Acá insertaba una fila antes del TOTAL y reescribía el cuerpo del cuadro. Era el segundo
          // escritor de "Jornales por Quincena", y de ahí salía el TECHO DE 14 QUINCENAS: una fila
          // insertada JUSTO en el borde de un rango no entra en ese rango, así que la quincena número
          // quince iba a quedar fuera del SUM del total del año sin dar un solo error.
          //
          // El dueño de esa pestaña es ahora scripts/jornales-pestana.mjs, que la reescribe entera en
          // cada corrida y cierra sus totales contra la fila de arriba. Esta tool sigue haciendo lo
          // que sólo ella puede: leer las DDJJ F931 de los PDF y replicar la nómina en Supabase.
          if (r.quincenas_nuevas > 0) {
            console.log(`nomina-sync: ${r.quincenas_nuevas} quincena(s) nueva(s) — las escribe jornales-pestana.mjs`)
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
