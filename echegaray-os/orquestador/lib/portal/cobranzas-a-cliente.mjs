// LA PROYECCIÓN DE COBRANZAS A LA CARA DEL CLIENTE — núcleo puro, sin Postgres y sin Google.
//
// Traduce filas de `public.cobranzas` (la réplica VIVA de la pestaña Cobranzas) a las dos tablas que
// consumen las pantallas 28/29/32: `certificado_cliente` y `esquema_pago`.
//
// Todo lo de acá es puro a propósito. Son las reglas que deciden qué ve un cliente externo de la
// empresa y con qué número: si vivieran dentro del script que habla con Postgres, la única forma de
// probarlas sería corriendo el sync contra la base real.
//
// ═══ POR QUÉ UNA FILA PUEDE PRODUCIR DOS COSAS ═══
//
// `esquema_pago` es el CALENDARIO: toda fila con plata y fecha entra, porque la pantalla 32 arma las
// fechas de todo lo que se va a cobrar. `certificado_cliente` es el DOCUMENTO que el cliente aprueba:
// entran sólo las filas que representan un comprobante emitido o una certificación numerada. No es
// doble conteo — son dos preguntas distintas sobre el mismo hecho, y viven en tablas distintas.

/** Los datos de Cobranzas arrancan en la fila 5; la columna A es `=IF(C5="";"";ROW()-4)`. */
export const FILA_BASE = 4

/**
 * La fila FÍSICA de la pestaña a partir del id de la columna A.
 *
 * No es cosmético: es la fila donde el worker va a escribir. Un id que no sea un entero positivo
 * devuelve null y la fila queda sin puente en vez de apuntar a la fila 4 (el encabezado), que es
 * exactamente donde una escritura rompería la tabla.
 */
export function filaSheetDe(sheetId) {
  const n = Number(String(sheetId ?? '').trim())
  if (!Number.isInteger(n) || n < 1) return null
  return n + FILA_BASE
}

/** Minúsculas, sin tildes y sin puntuación: para comparar «MESSINAS» con «Messina». */
export function normalizarTexto(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * RESUELVE EL CLIENTE DE UNA FILA. `indice` es [{alias, cliente_id}] armado desde `obra_alias`, que
 * son los alias que el DUEÑO ya declaró — no un diccionario inventado acá.
 *
 * Dos reglas que importan:
 *
 *  1. Se busca el alias MÁS LARGO que aparezca en el texto. «MESSINAS» contiene «messina», pero un
 *     texto como «la estrella / alimentos del sur» contiene tanto «estrella» como «alimentos sur»:
 *     el más largo es el más específico y es el que manda.
 *  2. Si los alias que coinciden apuntan a MÁS DE UN cliente distinto, NO se resuelve. Devolver
 *     cualquiera de los dos sería asignarle a un cliente la deuda de otro — y en un portal, dejar que
 *     un cliente vea la cuenta corriente de otro. La ambigüedad falla cerrada y se reporta.
 */
export function resolverCliente(textoObraCliente, indice = []) {
  const texto = normalizarTexto(textoObraCliente)
  if (!texto) return { cliente_id: null, motivo: 'sin_texto' }

  const golpes = indice
    .filter((e) => e.alias && texto.includes(normalizarTexto(e.alias)))
    .sort((a, b) => normalizarTexto(b.alias).length - normalizarTexto(a.alias).length)

  if (!golpes.length) return { cliente_id: null, motivo: 'sin_alias' }

  const distintos = [...new Set(golpes.map((g) => g.cliente_id))]
  if (distintos.length > 1) {
    return { cliente_id: null, motivo: 'ambiguo', candidatos: distintos }
  }
  return { cliente_id: distintos[0], motivo: 'alias', alias: golpes[0].alias }
}

/**
 * «Certificación 3/9» → {numero: 3, de: 9}. Devuelve null si el concepto no numera una certificación.
 * Tolera «Certificacion» sin tilde porque así se escribe la mitad de las veces en el Sheet.
 */
export function certificacionDeConcepto(concepto) {
  const m = String(concepto ?? '').match(/certificaci[oó]n\s*(\d+)\s*\/\s*(\d+)/i)
  if (!m) return null
  const numero = Number(m[1])
  const de = Number(m[2])
  if (!numero || !de || numero > de) return null
  return { numero, de }
}

/**
 * QUÉ ES ESTA FILA.
 *
 *  · `ajuste`      — nota de crédito. NUNCA es un certificado: pedirle a un cliente que «apruebe»
 *                    una NC no tiene sentido, y contarla como documento emitido inflaría la cartera.
 *                    Su importe ya viene NEGATIVO del Sheet (verificado: la NC de la fila 58 trae
 *                    −$96.800) y el signo NO se toca: darlo vuelta fue un error de $41,9M una vez.
 *  · `certificado` — tiene comprobante emitido (columna D: FA/FCE/A) o el concepto numera una
 *                    certificación. Es lo que el cliente aprueba en el portal.
 *  · `pago`        — el resto: anticipos y pagos sin comprobante. Entran al esquema, no al portal
 *                    como documento.
 */
export function clasificar(fila) {
  const factura = String(fila?.factura ?? '').trim().toUpperCase()
  if (factura === 'NC') return 'ajuste'
  if (certificacionDeConcepto(fila?.concepto)) return 'certificado'
  if (factura) return 'certificado'
  return 'pago'
}

const aFecha = (v) => {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Compara sólo la parte de fecha: una diferencia de horas no puede volver «vencido» a algo de hoy. */
const soloDia = (d) => (d ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : null)

/**
 * EL ESTADO DE UN PAGO DEL ESQUEMA, con la definición del propio Sheet.
 *
 * La columna U de Cobranzas dice, textual:
 *     =IF(O="Cobrado";"Cobrado"; IF(O="Pendiente"; IF(Q<TODAY();"Vencido"; Q-TODAY()); O))
 *
 * O sea: cobrado manda sobre todo; si no está cobrado y la fecha de la columna Q ya pasó, está
 * vencido. Esto NO inventa una definición nueva: la copia. Dos definiciones de «vencido» —la que ve
 * el dueño en el Sheet y la que ve el cliente en el portal— serían una discusión sin árbitro.
 *
 * `Proyectado` es previsión del dueño: nunca es «vencido» ni «a vencer», porque no hay nada emitido
 * que pueda vencer. Es `previsto`.
 */
export function estadoDePago(fila, hoy = new Date()) {
  const estado = String(fila?.estado ?? '').trim().toLowerCase()
  if (estado === 'cobrado') return 'cobrado'
  if (estado === 'proyectado') return 'previsto'

  const q = soloDia(aFecha(fila?.fecha_cobro))
  if (q === null) return 'previsto'          // sin fecha no se puede afirmar que venció
  return q < soloDia(aFecha(hoy)) ? 'vencido' : 'a_vencer'
}

/** El estado del DOCUMENTO. Un certificado cobrado ya no está «emitido»; uno impago y vencido, sí. */
export function estadoDeCertificado(fila, hoy = new Date()) {
  const e = estadoDePago(fila, hoy)
  if (e === 'cobrado') return 'cobrado'
  if (e === 'vencido') return 'vencido'
  return 'emitido'
}

/**
 * ¿SE PUEDE MOSTRAR ESTA FILA A UN CLIENTE?
 *
 * HALLAZGO del 25/08/2026, verificado contra la base: la columna B («Categoría») tiene dos valores,
 * `B` y `N`. Las 38 filas con `N` suman $299.985.659 y NINGUNA tiene comprobante en la columna D;
 * las 35 filas con factura son todas `B`. La lectura evidente es Blanco/Negro — facturado y no
 * facturado.
 *
 * Es una INFERENCIA, no un hecho confirmado por el dueño, y por eso esto falla cerrado: una fila `N`
 * no se ofrece al portal. Mostrarle a un cliente el registro de un cobro no facturado tiene efecto
 * fiscal y legal hacia afuera —Nivel E— y no es una decisión que tome un sync. Si el dueño confirma
 * que `N` significa otra cosa, se cambia esta única función.
 */
export function apto_para_portal(fila) {
  return String(fila?.categoria ?? '').trim().toUpperCase() !== 'N'
}

/** La huella con la que el worker verifica que la fila del Sheet sigue siendo la que era. */
export function huellaDe(fila) {
  return {
    huella_comprobante: String(fila?.numero_comprobante ?? '').trim() || null,
    huella_monto: fila?.monto_neto ?? null,
  }
}

const medioDe = (forma) => {
  const f = normalizarTexto(forma)
  if (!f) return null
  if (f.includes('transferencia')) return 'transferencia'
  if (f.includes('cheque') || f.includes('echeq')) return 'cheque'
  if (f.includes('efectivo')) return 'efectivo'
  return null            // «Compensación», «Endoso»… existen y no son ninguno de los tres
}

/**
 * LA PROYECCIÓN COMPLETA. Entra el conjunto de filas de la réplica; salen los registros a escribir.
 * No toca la base: devuelve qué habría que escribir, y el script decide cómo.
 */
export function proyectar(filas = [], indice = [], hoy = new Date()) {
  const certificados = []
  const pagos = []
  const sin_cliente = []
  let ajustes = 0

  for (const fila of filas) {
    // Sin importe no hay ni deuda ni cobro, y `CANCELAR` es una fila anulada en el Sheet.
    //
    // El NULL se descarta ANTES de convertir: `Number(null)` es 0 y `Number.isFinite(0)` es true, así
    // que una fila sin importe se colaba como un pago de $0 y el cliente lo veía en su portal. Lo
    // encontró el test de la fila CANCELAR, no una lectura del código.
    if (fila?.total_bruto === null || fila?.total_bruto === undefined || fila?.total_bruto === '') continue
    const total = Number(fila.total_bruto)
    if (!Number.isFinite(total) || String(fila?.estado ?? '').toUpperCase() === 'CANCELAR') continue

    const { cliente_id, motivo } = resolverCliente(fila?.obra_cliente, indice)
    if (!cliente_id) {
      sin_cliente.push({ sheet_id: fila?.sheet_id, texto: fila?.obra_cliente, motivo, total })
      continue
    }

    const tipo = clasificar(fila)
    if (tipo === 'ajuste') { ajustes += 1; continue }

    const cobranza_fila = filaSheetDe(fila?.sheet_id)
    const cert = certificacionDeConcepto(fila?.concepto)
    const comun = { cliente_id, cobranza_fila, ...huellaDe(fila), categoria: fila?.categoria ?? null }

    pagos.push({
      ...comun,
      concepto: fila?.concepto || (cert ? `Certificación ${cert.numero}/${cert.de}` : 'Cobro'),
      fecha: fila?.fecha_cobro ?? null,
      monto: total,
      estado: estadoDePago(fila, hoy),
      medio: medioDe(fila?.forma_cobro),
      apto_para_portal: apto_para_portal(fila),
    })

    if (tipo === 'certificado') {
      certificados.push({
        ...comun,
        numero: cert ? `Certificado ${cert.numero}` : (fila?.numero_comprobante || 'Comprobante'),
        factura: fila?.numero_comprobante
          ? `${String(fila.factura ?? '').trim()} ${fila.numero_comprobante}`.trim()
          : null,
        monto: total,
        emitido_at: fila?.fecha_emision ?? null,
        // Sin vencimiento propio en la fuente, vence = la fecha de la columna Q. Está declarado en el
        // contrato y es lo único que la pestaña ofrece.
        vence: fila?.fecha_cobro ?? null,
        estado: estadoDeCertificado(fila, hoy),
        apto_para_portal: apto_para_portal(fila),
      })
    }
  }

  return { certificados, pagos, sin_cliente, ajustes }
}
