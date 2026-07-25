// PLAN 2 — TOOLS de ESCRITURA sobre el AppSheet "Pedidos de Materiales" (Sheet de respaldo
// GESTION DE MATERIALES). El OS pasa a poder MODIFICAR la app, no solo leerla. Efecto
// externo (la gente de campo lo ve en vivo) → capability 'appsheet.write' = requires_approval:
// cae en Pendientes con el detalle y recién al aprobar se escribe. Fuente: skill appsheet-desarrollo.
//
// No toca la DEFINICIÓN de la app (vistas/lógica/permisos): eso vive en el editor de AppSheet.
// Solo escribe DATOS en la pestaña PEDIDOS (columnas A:F = ID_PEDIDO, OBRA, FECHA, MATERIAL,
// CANTIDAD, ESTADO), que AppSheet refleja tras su sync.

const SHEET_ID = process.env.ORQ_APPSHEET_PEDIDOS_SHEET_ID || '1yKoO0gUZysWfamTLR38TWn_sfOMZDMeyqHSNSFCWCec'
const TAB = 'PEDIDOS'

// Fecha de hoy en formato del Sheet (DD/MM/YYYY, es_MX/es_AR).
function hoyDDMMYYYY() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

async function leerPedidos(google) {
  // readSheetValues ya devuelve el array de filas (j.values || []).
  const res = await google.readSheetValues(SHEET_ID, `${TAB}!A1:F1000`)
  return Array.isArray(res) ? res : []
}

export function appsheetPedidosTools({ google } = {}) {
  const need = () => {
    if (!google) return { error: 'no hay cuenta de Google conectada para escribir en el Sheet' }
    return null
  }
  return {
    'appsheet.write.estado': {
      capability: 'appsheet.write',
      account: 'ecsas',
      schema: {
        name: 'appsheet_pedido_estado',
        description: 'Cambia el ESTADO de un pedido de materiales existente (ej. marcarlo ENTREGADO) en la app AppSheet. Efecto externo (lo ve el campo): REQUIERE aprobación. Pasá id_pedido y estado.',
        input_schema: {
          type: 'object',
          properties: { id_pedido: { type: 'string' }, estado: { type: 'string' } },
          required: ['id_pedido', 'estado'],
        },
      },
      async run(input) {
        const err = need(); if (err) return err
        const id = String(input?.id_pedido ?? '').trim()
        const estado = String(input?.estado ?? '').trim()
        if (!id || !estado) return { error: 'faltan id_pedido y estado' }
        const rows = await leerPedidos(google)
        const idx = rows.findIndex((r, i) => i > 0 && String(r[0] ?? '').trim() === id)
        if (idx < 0) return { error: `no encontré el pedido ${id} en la app` }
        const fila = idx + 1 // 1-based en el Sheet
        const anterior = rows[idx][5] ?? ''
        // yaGuardado: el Sheet de pedidos lo edita el equipo de campo por AppSheet; la guarda central
        // (firma) lo detectaría como "editado" y bloquearía este write-back de estado, rompiendo el sync.
        await google.updateSheetValues(SHEET_ID, `${TAB}!F${fila}`, [[estado]], { yaGuardado: true })
        return { ok: true, id_pedido: id, estado, estado_anterior: anterior, fila, material: rows[idx][3] ?? null, obra: rows[idx][1] ?? null }
      },
    },
    'appsheet.write.nuevo': {
      capability: 'appsheet.write',
      account: 'ecsas',
      schema: {
        name: 'appsheet_pedido_nuevo',
        description: 'Agrega un nuevo pedido de materiales a la app AppSheet. Efecto externo (lo ve el campo): REQUIERE aprobación. Pasá obra, material, cantidad; estado opcional (default PENDIENTE), fecha opcional (default hoy, DD/MM/YYYY).',
        input_schema: {
          type: 'object',
          properties: {
            obra: { type: 'string' },
            material: { type: 'string' },
            cantidad: { type: 'number' },
            estado: { type: 'string' },
            fecha: { type: 'string' },
          },
          required: ['obra', 'material', 'cantidad'],
        },
      },
      async run(input) {
        const err = need(); if (err) return err
        const obra = String(input?.obra ?? '').trim()
        const material = String(input?.material ?? '').trim()
        const cantidad = input?.cantidad
        if (!obra || !material || cantidad == null) return { error: 'faltan obra, material y cantidad' }
        const estado = String(input?.estado ?? 'PENDIENTE').trim() || 'PENDIENTE'
        const fecha = String(input?.fecha ?? '').trim() || hoyDDMMYYYY()
        const rows = await leerPedidos(google)
        // Nuevo ID = (máximo ID numérico existente) + 1; si no hay numéricos, cuenta de filas.
        let maxId = 0
        for (let i = 1; i < rows.length; i++) {
          const n = Number(String(rows[i][0] ?? '').trim())
          if (Number.isFinite(n) && n > maxId) maxId = n
        }
        const nuevoId = String(maxId + 1)
        await google.appendSheetValues(SHEET_ID, `${TAB}!A1:F1`, [[nuevoId, obra, fecha, material, cantidad, estado]], { yaGuardado: true }) // alta aprobada; el Sheet lo edita AppSheet
        return { ok: true, id_pedido: nuevoId, obra, material, cantidad, estado, fecha }
      },
    },
  }
}
