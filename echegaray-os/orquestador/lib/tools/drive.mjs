// Tools de Drive/Sheets tipadas como CAPACIDAD. Cada tool declara su `capability`
// (la que gobierna la policy) y su `account` (qué cuenta Google toca). El schema es
// la definición que ve el modelo (Anthropic tools). `run` recibe el input del modelo
// y el cliente Google inyectado. READ-ONLY en esta fase (solo drive.read).
//
// Las tools de escritura (drive.write/mail.send) NO ejecutan acá: el ejecutor las
// encola en pending_operations (requires_approval). Sus definiciones se agregan
// cuando exista la pantalla de aprobación (Fase 5).

/** Devuelve el registry de tools de lectura, cerrado sobre un cliente Google. */
export function driveReadTools(google) {
  return {
    'drive.read': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'drive_read',
        description:
          'Lee un Google Sheet de Drive y devuelve las celdas de un rango. Usá esto para consultar datos reales de la empresa (caja, P&L, presupuestos) en vez de decir "desconocido". Pasá file_id si lo tenés, o query con el nombre del archivo.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string', description: 'ID del archivo de Drive (preferido si lo conocés)' },
            query: { type: 'string', description: 'nombre exacto del archivo si no tenés file_id, ej. "Flujo de Caja - Cash Flow"' },
            range: { type: 'string', description: 'rango A1, ej. "RESUMEN!A1:F60". Por defecto A1:F60 de la primera pestaña.' },
          },
        },
      },
      async run(input) {
        let fileId = input?.file_id
        if (!fileId && input?.query) {
          const files = await google.searchFile(input.query)
          if (!files.length) return { error: `no encontré ningún archivo llamado "${input.query}"` }
          fileId = files[0].id
        }
        if (!fileId) return { error: 'falta file_id o query' }
        const range = input?.range || 'A1:F60'
        const values = await google.readSheetValues(fileId, range)
        return { file_id: fileId, range, rows: values.length, values }
      },
    },
  }
}
