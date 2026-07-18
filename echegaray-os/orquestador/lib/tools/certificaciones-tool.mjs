// Tool: REGISTRAR una certificación de obra (ingreso DEVENGADO). La empresa "quiere empezar a
// tener" certificaciones — esto se lo permite desde el chat. Interno/reversible (patrón 'aprender':
// capability drive.read = inline, sin aprobación, sin efecto externo Nivel E). El monto lo dicta el
// dueño; el chat lo confirma. Alimenta salud_obra (margen devengado = certificado − costo real).
import { registrarCertificacion, certificacionesDeObra } from '../certificaciones.mjs'
import { resolverObra } from '../obras.mjs'

export function certificacionesTools() {
  return {
    'certificacion.registrar': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'registrar_certificacion',
        description:
          'REGISTRA una certificación de obra (ingreso DEVENGADO — lo que la empresa certifica como avance facturable). USALO cuando el dueño diga "certificá $X en [obra]", "registrá la certificación de [obra] por $X", "la obra [X] certificó $Y en [mes]". Es lo que le da al OS el ingreso devengado para calcular el MARGEN real por obra (margen = certificado − costo). El monto lo da el dueño; confirmá SIEMPRE en tu respuesta qué registraste (obra, monto, fecha). NO inventes montos. Obras válidas: La Estrella, San Francisco, Messina, ARCOR, Galpones.',
        input_schema: {
          type: 'object',
          properties: {
            obra: { type: 'string', description: 'nombre/texto de la obra, ej. "San Francisco"' },
            monto: { type: 'number', description: 'monto certificado (número, sin símbolos)' },
            fecha: { type: 'string', description: 'fecha de la certificación DD/MM/AAAA (o el mes); si falta, hoy' },
            numero: { type: 'string', description: 'número de certificado, si lo tiene' },
            descripcion: { type: 'string', description: 'qué se certifica (opcional)' },
          },
          required: ['obra', 'monto'],
        },
      },
      async run(input) {
        try {
          if (!input?.obra || input?.monto == null) return { error: 'faltan "obra" y "monto"' }
          return await registrarCertificacion(input)
        } catch (e) {
          return { error: `no pude registrar la certificación: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
    'certificacion.ver': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'ver_certificaciones',
        description:
          'Lista las certificaciones REGISTRADAS de una obra (número, fecha, monto certificado/facturado/cobrado). USALO para "¿qué certificaciones tiene [obra]?", "¿cuánto llevamos certificado en [obra]?". Números reales de lo cargado, 0 inventado.',
        input_schema: { type: 'object', properties: { obra: { type: 'string', description: 'nombre de la obra' } }, required: ['obra'] },
      },
      async run(input) {
        try {
          if (!input?.obra) return { error: 'falta "obra"' }
          const r = await resolverObra(input.obra)
          if (!r.obra_id) return { error: `"${input.obra}" no resuelve a una obra` }
          const rows = await certificacionesDeObra(r.obra_id)
          return { obra: r.obra_id, n: rows.length, total_certificado: rows.reduce((s, c) => s + (c.monto || 0), 0), certificaciones: rows }
        } catch (e) {
          return { error: `no pude leer las certificaciones: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
