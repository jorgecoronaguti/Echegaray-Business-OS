// EL COMPROBANTE LEÍDO CONTRA EL PADRÓN DE ARCA. CERO MODELO.
//
// La conciliación es NÚCLEO PURO. La única función con entrada/salida es `candidatasArca`, al final
// del archivo, y recibe el puerto de base inyectado: está acá —y no en el repositorio del chat—
// porque preguntarle al padrón por un comprobante es parte de esta capacidad, no del canal por el
// que llegó la foto. Tenerla en `comunicacion/` obligaba al cargador de línea de comandos a escribir
// su propio SQL, y esa segunda consulta indexaba por número pelado y daba falsos positivos.
//
// ═══ POR QUÉ EXISTE (03/08) ═══
//
// La visión leyó `0004-00036542`. El número real era `0004-00003642`: **un dígito de más**. Como la
// deduplicación se apoya en el número, ese comprobante no colapsó contra el que YA estaba en Compras
// fila 802 y quedó a un click de entrar dos veces en el Flujo de Fondos. Un dígito mal leído = una
// compra contada dos veces en el cash flow, y nadie lo nota hasta el cierre.
//
// `public.comprobantes_arca` es el padrón REAL de comprobantes recibidos: lo que la empresa recibió
// según ARCA, no según una foto. Contra él no sólo se detecta el duplicado: **se corrige el número
// mal leído**. Si CUIT + fecha + total matchean una fila, el número bueno es el de ARCA.
//
// ═══ LAS TRAMPAS DE FORMATO, QUE SON LAS QUE HACEN QUE ESTO NO MATCHEE NUNCA ═══
//
// · ARCA guarda `punto_venta` y `numero` POR SEPARADO y SIN ceros a la izquierda (`4` y `3642`).
//   Compras usa `0004-00003642`. Sin normalizar, ninguna clave coincide jamás.
// · Corralón Progreso factura como **PEREZ GARCIA MARISOL BIBIANA**. El nombre de fantasía del
//   desplegable no es la razón social del padrón: matchear proveedores POR NOMBRE contra ARCA no
//   funciona y no se intenta. Se matchea por CUIT, por CAE o por importe.
// · El CAE tiene 14 dígitos y es la clave más fuerte que existe; se usa cuando está.
//
// ═══ QUE ESTÉ EN ARCA NO ES UN DUPLICADO ═══
//
// TODA factura electrónica recibida está en ARCA. Encontrarla ahí prueba que existe y da su número
// verdadero — no prueba que ya esté cargada. El duplicado se busca en Compras y en el registro de
// lo ya cargado, nunca en el padrón. Confundir las dos cosas convierte cada carga legítima en una
// alarma, y una alarma que suena siempre deja de leerse.
//
// ═══ Y SI NO ESTÁ ═══
//
// No estar en ARCA es INFORMACIÓN, no un error: puede ser un ticket no electrónico, un comprobante
// de otro mes o el sync atrasado. Se declara y se sigue. Bloquear la carga por eso convertiría una
// integración en un obstáculo.

import { numeroCanonico, soloDigitos, caeCanonico } from './lectura.mjs'
import { aNumero, redondear2 } from '../carga-comprobantes.mjs'

/** Tolerancia al comparar importes. Debajo de esto es redondeo del comprobante, no otra factura. */
export const TOLERANCIA = 0.5

export const VIA = Object.freeze({
  CAE: 'cae',
  CUIT_FECHA_TOTAL: 'cuit+fecha+total',
  CUIT_NUMERO: 'cuit+numero',
  FECHA_TOTAL: 'fecha+total',
})

export const ESTADO_ARCA = Object.freeze({
  COINCIDE: 'coincide',
  SIN_REGISTRO: 'sin_registro',
  NO_VERIFICADO: 'no_verificado',
})

/** `{punto_venta:'4', numero:'3642'}` → `0004-00003642`. Es el formato de la columna H de Compras. */
export function numeroDeArca(fila = {}) {
  const pv = soloDigitos(fila.punto_venta)
  const nu = soloDigitos(fila.numero)
  if (!nu) return null
  return `${(pv || '0').padStart(4, '0')}-${nu.padStart(8, '0')}`
}

/** Fecha de una fila de ARCA (`date` de Postgres o texto) → `AAAA-MM-DD`. */
export function fechaIsoDeArca(v) {
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
  }
  const s = String(v ?? '').trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** `DD/MM/AAAA` → `AAAA-MM-DD`. La fecha del comprobante leído viene en formato es-AR. */
export function fechaIsoDeComprobante(v) {
  const m = String(v ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

const mismoImporte = (a, b) => a != null && b != null && Math.abs(redondear2(a - b)) <= TOLERANCIA

/**
 * Concilia UN comprobante leído contra las filas candidatas de `comprobantes_arca`.
 *
 * Cuatro pasadas, de la más fuerte a la más débil; cada una exige **exactamente una** fila. Dos
 * filas candidatas no son una coincidencia: son una ambigüedad, y corregir un número contra la fila
 * equivocada es peor que no corregirlo.
 *
 * Además, una coincidencia por CAE o por número se DESCARTA si el importe no cierra: un CAE mal
 * leído de una foto puede caer sobre otra factura, y el importe es el control cruzado que lo agarra.
 *
 * @param {object} comprobante  el ya normalizado por `lectura.mjs`
 * @param {Array<object>} filas filas de `public.comprobantes_arca`
 * @returns {{estado:string, via?:string, fila?:object, numeroArca?:string, numeroCorregido?:boolean, total?:number}}
 */
export function conciliarConArca(comprobante = {}, filas = []) {
  if (!Array.isArray(filas) || !filas.length) return { estado: ESTADO_ARCA.SIN_REGISTRO }

  const cae = caeCanonico(comprobante.cae)
  const cuit = soloDigitos(comprobante.cuit)
  const numero = numeroCanonico(comprobante.numero)
  const fecha = fechaIsoDeComprobante(comprobante.fecha)
  // El total del comprobante puede venir negativo (nota de crédito); ARCA lo guarda positivo.
  const total = comprobante.total == null ? null : Math.abs(aNumero(comprobante.total) ?? 0)

  const unica = (lista, via) => (lista.length === 1 ? resolver(lista[0], via, { numero, total }) : null)

  if (cae) {
    const r = unica(filas.filter((f) => caeCanonico(f.cae) === cae), VIA.CAE)
    if (r) return r
  }
  if (cuit.length === 11 && fecha && total != null) {
    const r = unica(filas.filter((f) => soloDigitos(f.emisor_cuit) === cuit
      && fechaIsoDeArca(f.fecha_emision) === fecha
      && mismoImporte(aNumero(f.imp_total), total)), VIA.CUIT_FECHA_TOTAL)
    if (r) return r
  }
  if (cuit.length === 11 && numero) {
    const r = unica(filas.filter((f) => soloDigitos(f.emisor_cuit) === cuit
      && numeroDeArca(f) === numero), VIA.CUIT_NUMERO)
    if (r) return r
  }
  // SIN CUIT: la foto muchas veces no lo deja leer (o trae el del comprador). Fecha + total exacto es
  // débil pero verificable, y se DECLARA como tal en `via` para que quien lo muestre no lo presente
  // como una certeza.
  if (fecha && total != null) {
    const r = unica(filas.filter((f) => fechaIsoDeArca(f.fecha_emision) === fecha
      && mismoImporte(aNumero(f.imp_total), total)), VIA.FECHA_TOTAL)
    if (r) return r
  }
  return { estado: ESTADO_ARCA.SIN_REGISTRO }
}

function resolver(fila, via, { numero, total }) {
  const numeroArca = numeroDeArca(fila)
  const totalArca = aNumero(fila.imp_total)
  // CONTROL CRUZADO. Una coincidencia por CAE o por número que no cierra por importe no es la misma
  // factura: se descarta en vez de arrastrar el error a la corrección del número.
  if ((via === VIA.CAE || via === VIA.CUIT_NUMERO) && total != null && !mismoImporte(totalArca, total)) return null
  return {
    estado: ESTADO_ARCA.COINCIDE,
    via,
    fila,
    numeroArca,
    numeroCorregido: Boolean(numeroArca && numero && numeroArca !== numero),
    total: totalArca,
    iva: aNumero(fila.total_iva),
    neto: aNumero(fila.neto_gravado),
    cae: caeCanonico(fila.cae),
    emisorCuit: soloDigitos(fila.emisor_cuit) || null,
    emisorNombre: fila.emisor_nombre ?? null,
  }
}

/** ¿Los importes leídos cierran entre sí? `neto + IVA + otros tributos = total`. */
export function importesCierran(c = {}) {
  const total = c.total == null ? null : Math.abs(aNumero(c.total) ?? 0)
  const neto = c.neto == null ? null : Math.abs(aNumero(c.neto) ?? 0)
  if (total == null || neto == null) return null // no se puede afirmar ni una cosa ni la otra
  const iva = Math.abs(aNumero(c.iva) ?? 0)
  const otros = Math.abs(aNumero(c.otrosTributos) ?? 0)
  return Math.abs(redondear2(neto + iva + otros - total)) <= TOLERANCIA
}

/**
 * Aplica la conciliación sobre el comprobante: corrige el número, completa CUIT y CAE, y deja
 * escrito de dónde salió cada cosa. **MUTA** el comprobante a propósito — es del ítem que lo llama.
 *
 * ═══ LOS IMPORTES: CUÁNDO MANDA EL PAPEL Y CUÁNDO MANDA EL PADRÓN ═══
 *
 * Por defecto manda el papel: el total que el dueño está mirando tiene que ser el que ve en el
 * mensaje. Pero medido contra la foto real, la visión leyó **IVA $10,76** donde decía $10.760,33 —se
 * comió el separador de miles— y con eso la columna M habría quedado $10.750 arriba. El síntoma es
 * detectable sin ningún modelo: `neto + IVA + otros` no cerraba con el total.
 *
 * Entonces: **si los importes leídos NO cierran entre sí y ARCA identificó la fila, mandan los de
 * ARCA**, que es el libro fiscal de ese mismo comprobante. Y se declara, porque un importe que
 * cambió sin que nadie lo vea es indistinguible de un error. Si cierran, no se toca nada: que ARCA
 * diga otra cosa es un hallazgo para mostrar, no una corrección para aplicar en silencio.
 *
 * @returns {object} el bloque `arca` que se le cuelga al ítem
 */
export function aplicarArca(comprobante = {}, conciliacion = {}) {
  if (conciliacion.estado !== ESTADO_ARCA.COINCIDE) {
    return { estado: conciliacion.estado ?? ESTADO_ARCA.NO_VERIFICADO }
  }
  const bloque = {
    estado: ESTADO_ARCA.COINCIDE,
    via: conciliacion.via,
    numero: conciliacion.numeroArca,
    total: conciliacion.total,
    iva: conciliacion.iva,
    neto: conciliacion.neto,
    cae: conciliacion.cae,
    emisorCuit: conciliacion.emisorCuit,
    emisorNombre: conciliacion.emisorNombre,
  }
  if (conciliacion.numeroCorregido) {
    // Queda escrito EN EL COMPROBANTE, no sólo en el bloque de ARCA: el mensaje tiene que poder
    // decir "había leído X, el bueno es Y" y el dueño tiene que poder desmentirlo. Una corrección
    // silenciosa de un número es indistinguible de un error.
    bloque.numeroLeido = comprobante.numero ?? null
    comprobante.numeroLeidoMal = comprobante.numero ?? null
    comprobante.numero = conciliacion.numeroArca
  } else if (!comprobante.numero && conciliacion.numeroArca) {
    comprobante.numero = conciliacion.numeroArca
  }
  // El CUIT del emisor es del padrón, no de la foto: la foto trae dos CUIT y el modelo elige mal.
  if (conciliacion.emisorCuit) comprobante.cuit = conciliacion.emisorCuit
  if (conciliacion.cae && !comprobante.cae) comprobante.cae = conciliacion.cae

  // Los importes leídos que no cierran se reemplazan por los del libro fiscal. El signo se
  // conserva: ARCA guarda todo positivo y una nota de crédito entra en negativo.
  if (importesCierran(comprobante) === false && conciliacion.total != null) {
    const signo = comprobante.esNotaCredito ? -1 : 1
    bloque.importesCorregidos = { total: comprobante.total, iva: comprobante.iva, neto: comprobante.neto }
    comprobante.total = redondear2(Math.abs(conciliacion.total) * signo)
    comprobante.iva = conciliacion.iva == null ? comprobante.iva : redondear2(Math.abs(conciliacion.iva) * signo)
    comprobante.neto = conciliacion.neto == null ? comprobante.neto : redondear2(Math.abs(conciliacion.neto) * signo)
  }
  return bloque
}

// ═══ EL PADRÓN — LA ÚNICA CONSULTA ═══════════════════════════════════════════
//
// Antes había dos formas de preguntarle a `public.comprobantes_arca`: ésta, y un `indiceArca()`
// dentro del cargador que se traía la tabla entera y la indexaba por NÚMERO PELADO —sin punto de
// venta y sin CUIT—. Dos comprobantes de proveedores distintos con el mismo correlativo caían en la
// misma clave, y el cargador avisaba "ya figura en ARCA" sobre una factura que nunca vio. Con una
// sola consulta y una sola conciliación, ese falso positivo no tiene dónde volver a aparecer.

/**
 * Los datos con los que se le pregunta al padrón por UN comprobante leído.
 * El CUIT se exige completo: once dígitos o nada. Media identidad es peor que ninguna.
 */
export function clavesDeBusqueda(c = {}) {
  const cuit = soloDigitos(c?.cuit)
  return {
    cae: caeCanonico(c?.cae),
    cuit: cuit.length === 11 ? cuit : null,
    fechaIso: fechaIsoDeComprobante(c?.fecha),
  }
}

/**
 * Filas CANDIDATAS del padrón para conciliar UN comprobante leído.
 *
 * Trae poco a propósito: el CAE exacto, el CUIT del emisor, y todo lo emitido ese día. Con eso
 * `conciliarConArca` resuelve las cuatro pasadas sin traerse el padrón entero a memoria por cada
 * foto — y la pasada "fecha + total" necesita ver a TODOS los emisores de ese día para poder
 * afirmar que la coincidencia es única. Quien decide cuál es —si es que alguna— es la conciliación.
 *
 * `tipo_libro = 'R'` es el libro de RECIBIDOS (compras). El de emitidos son las ventas de la
 * empresa y no tiene nada que ver con un comprobante de gasto.
 *
 * Nunca lanza: si la tabla no existe o la base no contesta, devuelve `[]` y la conciliación queda
 * "no verificada". No poder verificar no es lo mismo que no estar.
 *
 * @param {{query:Function}} port
 * @param {object} comprobante  el leído (o cualquier objeto con cae/cuit/fecha)
 */
export async function candidatasArca(port, comprobante = {}) {
  if (typeof port?.query !== 'function') return []
  const { cae, cuit, fechaIso } = clavesDeBusqueda(comprobante)
  if (!cae && !cuit && !fechaIso) return []
  try {
    const { rows } = await port.query(
      `select emisor_cuit, emisor_nombre, punto_venta, numero, cae, fecha_emision, tipo_comprobante,
              imp_total::float8 imp_total, total_iva::float8 total_iva, neto_gravado::float8 neto_gravado
         from public.comprobantes_arca
        where tipo_libro = 'R'
          and ( ($1::text is not null and cae = $1)
             or ($2::text is not null and emisor_cuit = $2)
             or ($3::date is not null and fecha_emision = $3) )
        limit 500`,
      [cae, cuit, fechaIso])
    return rows ?? []
  } catch { return [] }
}
