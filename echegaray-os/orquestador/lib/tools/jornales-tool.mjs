// Tool determinístico: total de JORNALES pagados en la ÚLTIMA quincena (obreros + oficina).
// Lee la planilla JORNALES real y usa la lib jornales (extractor verificado). Devuelve el número
// EXACTO por pestaña con las fechas de la quincena de cada una, para que el modelo NO tenga que
// escanear la planilla desordenada (antes: 10+ lecturas + web_search → número MAL). Solo lectura.
import { JORNALES_ID, TOTAL_COL, ultimaQuincena } from '../jornales.mjs'

export function jornalesTools(google) {
  return {
    'jornales.quincena': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'jornales_quincena',
        description: 'Calcula el TOTAL de JORNALES pagados a los empleados en la ÚLTIMA quincena registrada (obreros + oficina), leído de la planilla JORNALES de forma determinística y verificable. Usalo SIEMPRE que el dueño pregunte por lo que se paga/pagó a los empleados/obreros/personal por quincena (ej. "cuánto le pagamos a los empleados la quincena pasada", "jornales de la quincena", "cuánto es la quincena"). Devuelve, por pestaña (Obreros / Oficina): las fechas de la quincena, cuántas personas y el total pagado; más el total general. Si una pestaña tiene cargada una quincena más vieja que la otra (ej. oficina todavía no cargó la última), lo avisa — NO mezcles quincenas distintas como si fueran la misma. Si el dueño pide aplicar un % (ej. "subile 2% para transferir"), calculá total × (1 + %/100) y mostralo. NO inventes: el número sale de la planilla.',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          const out = {}
          for (const tab of Object.keys(TOTAL_COL)) {
            const values = await google.readSheetValues(JORNALES_ID, `${tab}!A1:AH990`).catch(() => [])
            const q = ultimaQuincena(values, TOTAL_COL[tab])
            out[tab] = q ? { quincena: `${q.desde} al ${q.hasta}`, personas: q.personas, total: q.total } : { error: 'sin datos legibles' }
          }
          const tabs = Object.entries(out).filter(([, v]) => v && v.total != null)
          const total_general = tabs.reduce((s, [, v]) => s + (v.total || 0), 0)
          // ¿las pestañas cubren la MISMA quincena?
          const quincenas = [...new Set(tabs.map(([, v]) => v.quincena))]
          const aviso = quincenas.length > 1
            ? `OJO: las pestañas tienen cargadas quincenas DISTINTAS (${tabs.map(([t, v]) => `${t}: ${v.quincena}`).join(' / ')}). Puede que una todavía no cargó la última quincena. NO sumes como si fueran la misma sin aclararlo.`
            : null
          return {
            por_pestana: out,
            total_general,
            misma_quincena: quincenas.length === 1,
            aviso,
            nota: 'Número determinístico leído de la planilla JORNALES (verificado contra el total que la propia planilla calcula). Para transferir con aumento, aplicá el % sobre el total y mostralo.',
          }
        } catch (e) {
          return { error: `no pude leer los jornales: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
