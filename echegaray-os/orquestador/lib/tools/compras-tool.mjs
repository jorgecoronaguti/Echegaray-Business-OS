// Tool: inteligencia de COMPRAS por proveedor (área Compras/Logística). Fuente ARCA (verdad fiscal
// de lo facturado). Complementa a costos_obras (el corte por OBRA viene del Flujo de Fondos). 0 API.
import { gastoProveedores } from '../compras-proveedores.mjs'

export function comprasTools() {
  return {
    'compras.proveedores': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'gasto_por_proveedor',
        description:
          'Inteligencia de COMPRAS por proveedor, de los comprobantes de ARCA (lo que la empresa compró/le facturaron): total gastado, ranking de proveedores, cuántas facturas, promedio, hace cuánto le compraste a cada uno, y la CONCENTRACIÓN (si un proveedor concentra mucho gasto = riesgo de dependencia). USALO para "¿a quién le compro más?", "¿cuánto le gasté a ALUMETAL?", "¿está concentrada mi compra?", "ranking de proveedores". Pasá "proveedor" para el detalle de uno (o dejalo vacío para el ranking general). Números REALES de ARCA, 0 inventado. El corte por OBRA está en costos_obras (Flujo de Fondos). Límite honesto: las facturas son a nivel total, no hay precio unitario por material.',
        input_schema: { type: 'object', properties: { proveedor: { type: 'string', description: 'nombre (o parte) de un proveedor para ver su detalle; vacío = ranking general' } } },
      },
      async run(input) {
        try {
          return await gastoProveedores({ proveedor: input?.proveedor })
        } catch (e) {
          return { error: `no pude calcular el gasto por proveedor: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
