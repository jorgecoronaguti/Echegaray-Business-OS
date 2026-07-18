// TOOLS DE DATOS DEL OS: exponen los números que el OS YA CALCULA como herramientas, para que
// el agente pueda COMPONER deliverables (armar una tabla de IVA del año en un Sheet, un reporte,
// etc.) con datos reales — en vez de que esos cálculos sólo existan como texto del chat. Este es
// el puente que faltaba entre "el OS sabe el dato" y "el OS arma el documento con el dato".
//
// Capability 'drive.read' → corre inline (como la tool 'aprender'), sin aprobación (es lectura).
// NUNCA fabrican: un período sin datos viene marcado, y el agente debe dejarlo como "sin datos".
import { posicionIvaAnio } from '../libro-iva.mjs'
import { saludObra } from '../salud-obra.mjs'
import { resumenCostos } from '../obra-costos.mjs'
import { query } from '../db.mjs'

export function osDataTools() {
  return {
    // CHEQUEO DE REGISTRO de una factura/gasto: dado lo que el OS extrajo de una foto/PDF
    // (proveedor, CUIT, número, importe), busca en comprobantes_arca (lo que ARCA registró,
    // 459+) y dice si está registrada y dónde (obra/período). 0 API (consulta a Supabase).
    'os.buscar_comprobante': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'buscar_comprobante',
        description: 'Chequea si una FACTURA/comprobante de compra está REGISTRADA en ARCA (comprobantes_arca) y DÓNDE (obra/período). Usalo cuando el dueño manda la foto/PDF de una o más facturas y pregunta "¿está registrado este gasto?" / "¿dónde está?": extraé de la imagen proveedor, CUIT, número e importe total, y pasálos acá (los que tengas). Devuelve las coincidencias con emisor, tipo, punto de venta-número, fecha, importe, período y obra asignada. Si no hay coincidencias, el gasto NO está registrado en ARCA. Pasá al menos uno de: cuit, proveedor, numero o importe. Llamalo UNA vez por factura.',
        input_schema: {
          type: 'object',
          properties: {
            cuit: { type: 'string', description: 'CUIT del emisor (11 dígitos, sin guiones) — la clave más fuerte' },
            proveedor: { type: 'string', description: 'nombre del emisor/proveedor (o una palabra distintiva, ej. "ALUMETAL")' },
            numero: { type: 'string', description: 'número de la factura (sin el punto de venta)' },
            importe: { type: 'number', description: 'importe TOTAL de la factura' },
          },
        },
      },
      async run(input) {
        const cuit = String(input?.cuit ?? '').replace(/\D/g, '') || null
        const prov = String(input?.proveedor ?? '').trim() || null
        const num = String(input?.numero ?? '').trim() || null
        const imp = input?.importe != null && !Number.isNaN(Number(input.importe)) ? Number(input.importe) : null
        if (!cuit && !prov && !num && imp == null) return { error: 'pasá al menos uno: cuit, proveedor, numero o importe.' }
        // Palabra distintiva del proveedor (evita que "S A"/"SRL" ensucien el match).
        const provToken = prov ? (prov.toUpperCase().split(/\s+/).find((w) => w.length >= 4) || prov) : null
        try {
          const { rows } = await query(
            `select emisor_nombre, emisor_cuit, tipo_comprobante, punto_venta, numero,
                    to_char(fecha_emision,'DD/MM/YYYY') fecha, imp_total::float8 imp_total,
                    periodo, coalesce(obra_texto,'(sin obra asignada)') obra
               from comprobantes_arca
              where ($1::text is null or emisor_cuit = $1)
                and ($2::text is null or emisor_nombre ilike '%'||$2||'%')
                and ($3::text is null or numero = $3 or numero = ltrim($3,'0'))
                and ($4::float8 is null or abs(imp_total - $4) <= greatest(1, imp_total*0.005))
              order by fecha_emision desc limit 15`,
            [cuit, provToken, num, imp],
          )
          return {
            buscado: { cuit, proveedor: prov, numero: num, importe: imp },
            registrado: rows.length > 0,
            coincidencias: rows.length,
            comprobantes: rows.map((r) => ({
              proveedor: r.emisor_nombre, cuit: r.emisor_cuit,
              comprobante: `${r.tipo_comprobante === '1' ? 'FA A' : r.tipo_comprobante === '6' ? 'FA B' : 'tipo ' + r.tipo_comprobante} ${r.punto_venta}-${r.numero}`,
              fecha: r.fecha, importe: r.imp_total, periodo: r.periodo, obra: r.obra,
            })),
            nota: rows.length === 0 ? 'NO figura en comprobantes_arca (lo que ARCA registró). Puede no estar cargado, o los datos de la foto no coinciden.' : null,
          }
        } catch (e) {
          return { error: `no pude buscar el comprobante: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
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
    // SALUD ECONÓMICA DE UNA OBRA (capacidad-decisión, no dato suelto). Devuelve la LECTURA del
    // CFO: costo real (del eje canónico F0.2), consumo de presupuesto, y honesta sobre lo que
    // falta para cerrar el margen (certificación). NUNCA inventa ingreso ni margen. 0 API.
    'os.salud_obra': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'salud_obra',
        description:
          'La salud ECONÓMICA de una obra: costo real acumulado (respaldado por comprobantes, resuelto por el eje canónico de obras), consumo del presupuesto, margen real si hay certificación, y qué falta para cerrarlo. USALO cuando el dueño pregunte "¿cómo va [obra]?", "¿cuánto llevo gastado en [obra]?", "¿gana o pierde [obra]?", "¿en qué gasté en [obra]?". Devuelve la lectura lista + costo por rubro/proveedor + recomendación + siguiente paso. Es HONESTO: si falta la certificación (ingreso devengado), dice que ve el costo pero NO el margen — no lo inventes. Obras válidas: La Estrella, San Francisco, Messina, ARCOR, Galpones (acepta cualquier grafía). Pasá obra (el nombre o texto tal cual lo dijo el dueño).',
        input_schema: { type: 'object', properties: { obra: { type: 'string', description: 'nombre/texto de la obra, ej. "San Francisco" o "la estrella"' } }, required: ['obra'] },
      },
      async run(input) {
        try {
          if (!input?.obra) return { error: 'falta "obra" (nombre de la obra)' }
          return await saludObra(input.obra)
        } catch (e) {
          return { error: `no pude leer la salud de la obra: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
    // COSTO REAL POR OBRA (rollup de todas). Para "¿cómo venimos por obra?" / "¿dónde va la plata?".
    'os.costos_obras': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'costos_obras',
        description:
          'Costo real acumulado de TODAS las obras (rollup del eje canónico sobre los comprobantes), ordenado de mayor a menor, más los buckets de indirectos/estructura (Administracion, Taller, F931, UOCRA…) y excluidos. USALO para "¿cómo venimos por obra?", "¿dónde se va la plata?", "ranking de costos por obra". Números REALES, 0 inventado. No requiere parámetros.',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          return await resumenCostos()
        } catch (e) {
          return { error: `no pude calcular los costos por obra: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
