// TOOLS DE DATOS DEL OS: exponen los números que el OS YA CALCULA como herramientas, para que
// el agente pueda COMPONER deliverables (armar una tabla de IVA del año en un Sheet, un reporte,
// etc.) con datos reales — en vez de que esos cálculos sólo existan como texto del chat. Este es
// el puente que faltaba entre "el OS sabe el dato" y "el OS arma el documento con el dato".
//
// Capability 'drive.read' → corre inline (como la tool 'aprender'), sin aprobación (es lectura).
// NUNCA fabrican: un período sin datos viene marcado, y el agente debe dejarlo como "sin datos".
import { posicionIvaAnio } from '../libro-iva.mjs'

export function osDataTools() {
  return {
    'os.iva_anual': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'os_iva_posicion_anual',
        description:
          'Devuelve la POSICIÓN DE IVA mes por mes de un año, con números REALES de los comprobantes de ARCA cargados (débito fiscal, crédito fiscal, posición a pagar / a favor por mes). Los meses sin comprobantes vienen con disponible:false y en "meses_sin_datos" — NO los inventes: en la tabla dejalos como "sin datos" y avisá que falta cargarlos de ARCA. USALO cuando el dueño pida ARMAR/actualizar una tabla o planilla de IVA del año: pedís esto para tener los números reales, y con ellos componés la tabla en un Sheet (drive_add_tab → drive_batch_update con los valores → drive_format_cells/drive_freeze para dejarla prolija; drive_add_pivot si querés resumir). Pasá anio (ej. "2026"); si no, usa el año actual.',
        input_schema: { type: 'object', properties: { anio: { type: 'string', description: 'año, ej. "2026"' } } },
      },
      async run(input) {
        try {
          return await posicionIvaAnio(input?.anio)
        } catch (e) {
          return { error: `no pude calcular la posición de IVA: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
