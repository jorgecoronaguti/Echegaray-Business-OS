// Tool: EXPORTAR A PDF cualquier archivo nativo de Google.
//
// Auditoría 2026-07-19: el chat ya ejecutaba sobre Drive, Sheets y Docs, pero de PDF solo sabía
// LEER. Este era uno de los dos huecos reales para "si le pido que ejecute cosas en drive, sheet,
// doc, slide, pdf, que las haga".
//
// EL OTRO HUECO —crear presentaciones— vivía acá como `drive.create_slides` y SE FUE (2026-08-27):
// armaba las láminas con los layouts predefinidos de Google y no había forma de que el resultado se
// pareciera a la empresa. Lo reemplaza `tools/presentacion-tool.mjs`, con la plantilla ECSAS y
// control de calidad antes de escribir. Dos tools que crean presentaciones serían dos verdades.
//
// Requiere actuar como usuario autorizado (OAuth): la cuenta de servicio sola no puede crear
// archivos (403 por scopes). Ambas cuentas del dominio ya están autorizadas con Drive completo.
export function slidesPdfTools(google) {
  return {
    'drive.export_pdf': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'exportar_a_pdf',
        description:
          'EXPORTA a PDF un archivo nativo de Google (Sheet, Doc o presentación) y guarda el PDF en Drive. USALO cuando el dueño pida "pasame esto a PDF", "generá el PDF del presupuesto", "mandame el informe en PDF". Pasá el id del archivo de Drive; opcionalmente el nombre del PDF y la carpeta destino. Devuelve el link del PDF generado. Sirve para dejar un presupuesto, un informe o un acta en un formato que se le puede mandar al cliente.',
        input_schema: {
          type: 'object',
          properties: {
            archivo_id: { type: 'string', description: 'id del archivo de Drive a exportar (Sheet, Doc o Slides)' },
            nombre: { type: 'string', description: 'nombre del PDF resultante (opcional; por defecto el del original)' },
            carpeta_id: { type: 'string', description: 'id de la carpeta destino (opcional)' },
          },
          required: ['archivo_id'],
        },
      },
      async run(input) {
        try {
          if (!google?.exportarComoPdf) return { error: 'no hay cuenta de Google autorizada para escribir en Drive' }
          if (!input?.archivo_id) return { error: 'necesito el id del archivo a exportar' }
          const r = await google.exportarComoPdf(input.archivo_id, { nombre: input.nombre, parentId: input.carpeta_id })
          return { exportado: true, ...r }
        } catch (e) {
          return { error: `no pude exportar a PDF: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
