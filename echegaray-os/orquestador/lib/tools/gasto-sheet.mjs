// Buscar un GASTO/factura dentro del Flujo de Fondos real (Google Sheet "Flujo de Caja -
// Cash Flow", pestaña Compras) y devolver si está, en qué FILA, y el LINK directo a esa fila.
// Es lo que el dueño quiere al mandar una foto: "¿está este gasto en el flujo de fondos y
// dónde?". La búsqueda corre en el tool (lee la pestaña una vez y matchea en JS) → 0 tokens
// del modelo; devuelve solo las coincidencias. Capability drive.read → inline, sin aprobación.

const CASHFLOW_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const COMPRAS_GID = 1666326819
// Layout de la pestaña Compras (encabezados en fila 3, datos desde la 4):
//  A=ID B=Categoría C=Fecha D=Fecha(mes) E=Proveedor F=Modalidad G=Tipo H=N°Comprobante
//  I=UnidadNegocio J=Cliente/Asignación K=Detalles/Obra L=Concepto M=Importe N=IVA
const COL = { fecha: 2, proveedor: 4, tipo: 6, comprobante: 7, unidad: 8, asignacion: 9, obra: 10, concepto: 11, importe: 12 }
const PRIMERA_FILA_DATOS = 4

/** "$44.664,00" (es-AR) → 44664.00 ; "" → null */
function parseMonto(s) {
  const t = String(s ?? '').replace(/[^\d.,-]/g, '')
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isNaN(n) ? null : n
}
/** número de comprobante "11-079782" → "079782" (parte después del guión, sin ceros). */
function numParte(s) {
  const p = String(s ?? '').split('-').pop() || ''
  return p.replace(/\D/g, '').replace(/^0+/, '')
}

export function gastoSheetTools(google) {
  return {
    'gasto.buscar_en_flujo': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'buscar_gasto_en_flujo',
        description: 'Busca un GASTO/factura dentro del Flujo de Fondos real (Sheet "Flujo de Caja - Cash Flow", pestaña Compras) y dice si está cargado, en qué FILA, con qué obra/concepto, y da el LINK directo a esa fila. Usalo cuando el dueño pregunta "¿está este gasto en el flujo de fondos?" / "mostrame dónde está" (con o sin foto). Extraé de la factura proveedor, número e importe y pasá los que tengas. Devuelve las filas que coinciden con su link. 0 coincidencias = no está cargado en el flujo. Llamalo UNA vez por factura.',
        input_schema: {
          type: 'object',
          properties: {
            proveedor: { type: 'string', description: 'nombre del proveedor (o una palabra distintiva)' },
            numero: { type: 'string', description: 'número del comprobante (ej. "079782" o "11-079782")' },
            importe: { type: 'number', description: 'importe total de la factura' },
          },
        },
      },
      async run(input) {
        const prov = String(input?.proveedor ?? '').trim()
        const provTok = prov ? (prov.toUpperCase().split(/\s+/).find((w) => w.length >= 4) || prov).toUpperCase() : null
        const num = numParte(input?.numero)
        const imp = input?.importe != null && !Number.isNaN(Number(input.importe)) ? Number(input.importe) : null
        if (!provTok && !num && imp == null) return { error: 'pasá al menos uno: proveedor, numero o importe.' }
        let filas
        try {
          filas = await google.readSheetValues(CASHFLOW_ID, 'Compras!A4:N1000')
        } catch (e) {
          return { error: `no pude leer el Flujo de Fondos: ${String(e?.message ?? e).slice(0, 140)}` }
        }
        const matches = []
        for (let i = 0; i < (filas || []).length; i++) {
          const r = filas[i]
          if (!r || !r.length) continue
          const rowProv = String(r[COL.proveedor] ?? '').toUpperCase()
          const rowNum = numParte(r[COL.comprobante])
          const rowImp = parseMonto(r[COL.importe])
          const okProv = provTok ? rowProv.includes(provTok) : false
          const okNum = num ? rowNum === num : false
          const okImp = imp != null && rowImp != null ? Math.abs(rowImp - imp) <= Math.max(1, imp * 0.005) : false
          // Match si coincide el número (fuerte), o proveedor+importe juntos, o importe+número.
          const score = (okProv ? 1 : 0) + (okNum ? 2 : 0) + (okImp ? 1 : 0)
          const hit = okNum || (okProv && okImp)
          if (hit) {
            const fila = PRIMERA_FILA_DATOS + i
            matches.push({
              score,
              fila,
              fecha: r[COL.fecha] ?? null,
              proveedor: r[COL.proveedor] ?? null,
              comprobante: r[COL.comprobante] ?? null,
              importe: r[COL.importe] ?? null,
              obra: r[COL.asignacion] || r[COL.obra] || '(sin asignar)',
              concepto: r[COL.concepto] ?? null,
              link: `https://docs.google.com/spreadsheets/d/${CASHFLOW_ID}/edit#gid=${COMPRAS_GID}&range=A${fila}:N${fila}`,
            })
          }
        }
        matches.sort((a, b) => b.score - a.score)
        return {
          buscado: { proveedor: prov || null, numero: num || null, importe: imp },
          en_flujo_de_fondos: matches.length > 0,
          coincidencias: matches.length,
          pestana: 'Compras',
          gastos: matches.slice(0, 10).map(({ score, ...m }) => m),
          nota: matches.length === 0 ? 'NO figura en la pestaña Compras del Flujo de Fondos. Puede no estar cargado, o los datos de la foto no coinciden.' : null,
        }
      },
    },
  }
}
