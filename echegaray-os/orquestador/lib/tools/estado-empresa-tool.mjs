// Tool: ESTADO DE LA EMPRESA — la capacidad del área Gestión General. Composición de fuentes
// únicas (no recalcula ninguna), 0 API.
import { estadoEmpresa, formatEstado } from '../estado-empresa.mjs'
import { cashBriefing } from '../cash-briefing.mjs'

export function estadoEmpresaTools(google) {
  return {
    'os.estado_empresa': {
      capability: 'os.read',
      schema: {
        name: 'estado_empresa',
        description:
          'Da el ESTADO GENERAL de la empresa con semáforo por indicador y la restricción principal del momento. USALO cuando el dueño pregunte "¿cómo venimos?", "¿cómo estamos como empresa?", "¿cuál es hoy mi mayor problema?", "dame el panorama", "¿cómo viene el negocio?". Compone caja, obligaciones vencidas, cobranzas vencidas, obras activas con su costo real y el gasto que no está imputado a ninguna obra. Cada indicador trae su lectura y, si está en rojo, la palanca concreta. Los indicadores en "sin dato" NO son un OK: son huecos reales que hay que decirle al dueño tal cual.',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          // La posición de caja tiene UNA fuente (el ledger del Flujo de Caja). Si no se puede leer,
          // el indicador queda en "sin dato" — nunca se estima.
          let cajaDisponible
          try {
            if (google?.readSheetValues) cajaDisponible = (await cashBriefing(google)).caja?.total
          } catch { cajaDisponible = undefined }
          const r = await estadoEmpresa({ cajaDisponible })
          return { ...r, resumen_texto: formatEstado(r) }
        } catch (e) {
          return { error: `no pude armar el estado de la empresa: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
