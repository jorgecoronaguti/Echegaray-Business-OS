// Tool: RECLAMO DE COBRANZA — de "tenés $15M vencidos" a un documento listo para mandar.
//
// Detectar no cobra. El trabajo que quedaba humano (buscar la factura, calcular la antigüedad,
// redactar con el tono que corresponde) ahora sale con los datos reales del OS.
import { componerReclamo, cobranzasVencidasPorCliente } from '../reclamo-cobranza.mjs'

export function reclamoCobranzaTools(google) {
  return {
    'cobranza.reclamo': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'preparar_reclamo_cobranza',
        description:
          'Prepara el RECLAMO de una cobranza vencida con los datos reales del OS: número de factura, concepto, fecha de vencimiento, días de atraso y monto. Ajusta el tono según la antigüedad (recordatorio hasta 15 días, reclamo hasta 45, reclamo formal después). USALO cuando el dueño diga "reclamale a X", "mandale la nota de cobranza", "qué le reclamo a La Estrella", "armame el reclamo". Sin cliente, devuelve la lista de los que tienen vencido. Con crear_documento=true deja el texto en un Google Doc y devuelve el link (y el PDF si se lo pedís). NUNCA manda el mail solo: eso lo decide el dueño. IMPORTANTE al presentarlo: lo proyectado no se reclama porque todavía no se facturó, y lo vencido sin número de comprobante tampoco — en ese caso corresponde pedir una conciliación de cuenta. Decile al dueño qué quedó afuera y por qué.',
        input_schema: {
          type: 'object',
          properties: {
            cliente: { type: 'string', description: 'cliente a reclamar (opcional: sin esto lista los que tienen vencido)' },
            crear_documento: { type: 'boolean', description: 'true = dejar el reclamo en un Google Doc' },
            exportar_pdf: { type: 'boolean', description: 'true = además generar el PDF (requiere crear_documento)' },
          },
        },
      },
      async run(input) {
        try {
          const grupos = await cobranzasVencidasPorCliente()
          if (!grupos.length) return { hay_vencido: false, nota: 'No hay cobranzas vencidas.' }

          if (!input?.cliente) {
            return {
              hay_vencido: true,
              clientes: grupos.map((g) => ({
                cliente: g.cliente,
                partidas: g.comprobantes.length,
                total: g.comprobantes.reduce((a, c) => a + (Number(c.total) || 0), 0),
              })),
              nota: 'Decime a cuál querés reclamarle y preparo la nota.',
            }
          }

          const norm = (s) => String(s || '').toLowerCase()
          const g = grupos.find((x) => norm(x.cliente).includes(norm(input.cliente)) || norm(input.cliente).includes(norm(x.cliente)))
          if (!g) {
            return { error: `no encontré cobranzas vencidas de "${input.cliente}"`, clientes_con_vencido: grupos.map((x) => x.cliente) }
          }

          const r = componerReclamo({ cliente: g.cliente, comprobantes: g.comprobantes }, new Date())
          if (!r.puede_reclamar || !input?.crear_documento) return r

          if (!google?.createDoc) return { ...r, nota: 'No hay cuenta de Google autorizada para crear el documento; te dejo el texto.' }
          const doc = await google.createDoc(r.asunto, r.cuerpo)
          let pdf = null
          if (input?.exportar_pdf && google.exportarComoPdf && doc?.id) {
            pdf = await google.exportarComoPdf(doc.id, { nombre: r.asunto }).catch(() => null)
          }
          return { ...r, documento: doc, pdf, nota: 'Documento creado. Revisalo antes de mandarlo: el OS no envía nada por su cuenta.' }
        } catch (e) {
          return { error: `no pude preparar el reclamo: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
