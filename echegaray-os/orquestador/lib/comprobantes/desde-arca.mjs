// COMPLETAR UN COMPROBANTE DESDE EL LIBRO DE ARCA — la otra mitad del camino sin modelo.
//
// ═══ QUÉ RESUELVE ═══
//
// El QR de AFIP da la identidad exacta (CUIT, punto de venta, número, fecha, total, CAE) y no da lo
// que la pestaña Compras necesita para la fila: la RAZÓN SOCIAL, el NETO GRAVADO y el IVA
// DISCRIMINADO. Eso está en `public.comprobantes_arca`, el libro que la empresa recibe — dato
// fiscal, no una lectura.
//
// ═══ LA COBERTURA, MEDIDA (25/08/2026) ═══
//
// De las 575 filas de Compras con número de comprobante, **441 (77%) tienen su par exacto en ARCA**.
// De esas 441, el IVA de ARCA coincide con el cargado en 392 (89%) y el neto en 360 (82%). Las
// diferencias no son errores del cruce: son percepciones sumadas al neto y notas de crédito.
//
// ═══ Y EL LÍMITE QUE HAY QUE DECIR ═══
//
// **ARCA VA ATRASADO.** El libro llegaba hasta el 21/08 el día que se midió: un comprobante de hoy
// NO está. Este camino sirve para el histórico y para la carga diferida, no para cargar la factura
// que acaba de sacar el proveedor. Por eso no reemplaza la lectura: la ADELANTA cuando puede, y
// cuando no puede lo dice en vez de inventar.
//
// El cruce es por CUIT + punto de venta + número, normalizando: la pestaña escribe el CUIT con
// guiones (`23-36911157-4`) y el comprobante con ceros (`0004-00003755`); ARCA los guarda pelados
// (`23369111574`, `4`, `3755`). Ignorar eso da CERO coincidencias sobre 575 filas que sí cruzan —
// que fue exactamente lo que pasó en la primera medición.

/** Sólo los dígitos. Un CUIT es el mismo con guiones, con puntos o pelado. */
export const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '')

/** `0004-00003755` → `{ puntoVenta: 4, numero: 3755 }`. Null si no tiene esa forma. */
export function partesDelNumero(comprobante) {
  const m = String(comprobante ?? '').trim().match(/^(\d+)\s*-\s*(\d+)$/)
  if (!m) return null
  return { puntoVenta: Number(m[1]), numero: Number(m[2]) }
}

/**
 * BUSCA EL COMPROBANTE EN EL LIBRO RECIBIDO. Devuelve lo que ARCA declara, o null.
 *
 * `tipo_libro = 'R'` son los recibidos —las compras—; `'E'` son los emitidos, que son las ventas de
 * la empresa y NO tienen nada que hacer acá. Confundirlos cargaría una venta como gasto.
 *
 * @param consultar la función de consulta (se inyecta: este módulo no abre conexiones)
 */
export async function buscarEnArca(consultar, { cuit, puntoVenta, numero }) {
  const cu = soloDigitos(cuit)
  if (!cu || puntoVenta == null || numero == null) return null
  const { rows } = await consultar(
    `select emisor_nombre, emisor_cuit, punto_venta, numero, fecha_emision, tipo_comprobante, cae,
            neto_gravado, neto_no_gravado, exento, total_iva, otros_tributos, imp_total, iva_por_alicuota
     from public.comprobantes_arca
     where tipo_libro = 'R'
       and regexp_replace(emisor_cuit, '[^0-9]', '', 'g') = $1
       and ltrim(punto_venta, '0') = $2
       and ltrim(numero, '0') = $3
     limit 2`,
    [cu, String(Number(puntoVenta)), String(Number(numero))],
  )
  // DOS FILAS PARA LA MISMA IDENTIDAD NO SE RESUELVEN ADIVINANDO. Es un duplicado en el libro y hay
  // que mirarlo: devolver la primera cargaría una de las dos al azar.
  if (rows.length !== 1) return null
  const a = rows[0]
  const num = (v) => (v == null || v === '' ? null : Number(v))
  return {
    razonSocial: a.emisor_nombre ?? null,
    cuit: soloDigitos(a.emisor_cuit),
    comprobante: `${String(a.punto_venta).padStart(4, '0')}-${String(a.numero).padStart(8, '0')}`,
    fecha: a.fecha_emision ?? null,
    cae: a.cae ?? null,
    neto: num(a.neto_gravado),
    netoNoGravado: num(a.neto_no_gravado),
    exento: num(a.exento),
    iva: num(a.total_iva),
    otrosTributos: num(a.otros_tributos),
    total: num(a.imp_total),
    ivaPorAlicuota: a.iva_por_alicuota ?? null,
    via: 'arca',
  }
}

/**
 * EL COMPROBANTE ARMADO SIN NINGÚN MODELO — QR + ARCA.
 *
 * Devuelve `{ comprobante, completo, falta, via }`. `completo` es cierto sólo cuando están los
 * campos con los que se puede escribir la fila: proveedor, número, fecha, neto, IVA y total. Si
 * falta alguno se dice CUÁL — un comprobante a medias que se presenta como completo termina en una
 * fila con un cero donde iba un importe.
 *
 * LA OBRA NUNCA SALE DE ACÁ. Ni el QR ni ARCA saben a qué obra va el gasto: eso lo dice la anotación
 * manuscrita o la persona. Este módulo no la inventa ni la sugiere.
 */
export async function comprobanteSinModelo(consultar, desdeQr) {
  if (!desdeQr) return { comprobante: null, completo: false, falta: ['qr'], via: null }

  const [arca, maestro] = await Promise.all([
    buscarEnArca(consultar, desdeQr),
    proveedorPorCuit(consultar, desdeQr.cuit),
  ])
  const c = {
    cuit: desdeQr.cuit,
    // EL NOMBRE DEL MAESTRO GANA sobre la razón social del padrón. «PEREZ GARCIA MARISOL BIBIANA»
    // es quien factura; «Corralon Progreso» es como se llama en la pestaña y en el desplegable
    // estricto de la columna E. Escribir la razón social ahí dejaría la celda fuera del vocabulario
    // de todos los cruces — el error que `alta-proveedor.mjs` documenta con nombre y apellido.
    proveedor: maestro ?? arca?.razonSocial ?? null,
    razonSocialPadron: arca?.razonSocial ?? null,
    comprobante: desdeQr.comprobante,
    tipo: desdeQr.tipo,
    esNotaCredito: desdeQr.esNotaCredito,
    fecha: desdeQr.fecha,
    neto: arca?.neto ?? null,
    iva: arca?.iva ?? null,
    otrosTributos: arca?.otrosTributos ?? null,
    // EL TOTAL DEL QR MANDA sobre el de ARCA: el QR lo firmó el emisor al emitir; ARCA lo transcribe.
    total: desdeQr.total ?? arca?.total ?? null,
    cae: desdeQr.cae ?? arca?.cae ?? null,
    via: [desdeQr ? 'qr_afip' : null, arca ? 'arca' : null, maestro ? 'maestro' : null].filter(Boolean).join('+'),
  }
  const falta = ['proveedor', 'neto', 'iva', 'total'].filter((k) => c[k] == null)
  return { comprobante: c, completo: falta.length === 0, falta, via: c.via }
}

/**
 * EL NOMBRE CON EL QUE LA EMPRESA LLAMA A ESE CUIT. Sale del maestro, no del padrón.
 *
 * Es determinístico y está SIEMPRE disponible —no depende de que ARCA haya sincronizado—, así que
 * resuelve solo la razón social incluso para la factura que el proveedor emitió hace cinco minutos.
 * Null si ese CUIT no está en el maestro: ahí el proveedor es nuevo y lo da de alta
 * `lib/alta-proveedor.mjs`, que ya sabe que la identidad es el CUIT y no el nombre.
 */
export async function proveedorPorCuit(consultar, cuit) {
  const cu = soloDigitos(cuit)
  if (cu.length !== 11) return null
  try {
    const { rows } = await consultar(
      `select nombre from public.proveedores
       where regexp_replace(coalesce(cuit, ''), '[^0-9]', '', 'g') = $1 limit 2`,
      [cu],
    )
    // Dos proveedores con el mismo CUIT es un problema del maestro y no se resuelve eligiendo uno.
    return rows.length === 1 ? (rows[0].nombre ?? null) : null
  } catch { return null }
}
