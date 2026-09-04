// EL PLAZO DE COBRO SALE DE LA ORDEN DE COMPRA, QUE ES EL DOCUMENTO QUE LO PACTA.
//
// ═══ EL DEFECTO, MEDIDO SOBRE EL ARCHIVO VIVO (04/09/2026) ═══
//
// El plazo de cobro de una factura NO salía de la OC en ningún caso. Convivía de tres formas
// incompatibles en la misma pestaña `Cobranzas`, sobre 95 filas por $850.769.919 (43 pendientes por
// $352.417.885):
//
//   1. `PLAZO_COBRO_DIAS = 30` en `cobranzas-vencido.mjs` — una constante global que gobierna el
//      aging de las 43 pendientes.
//   2. Texto tipeado a mano en la columna H, que además manda: `H100 = "00002-00002266 · cta. cte.
//      15 días"` con `Q100 = =P100+15`. Ningún script del repo escribe ese texto.
//   3. Fechas clavadas: 82 filas de 95 tienen la fecha de cobro como serial sin fórmula.
//
// Y las 13 filas que sí calculan `=P+N` declaran CUATRO plazos distintos —30d×8, 75d×2, 70d×1,
// 15d×2—, así que una constante única no puede estar bien nunca.
//
// EL DATO ESTABA MAL, Y SE PUEDE PROBAR. La OC 00002-00002266 dice, con todas las letras,
// `Cond.Compra : 6 CUENTA CORRIENTE 30 DIAS`. La fila 100 proyecta a 15. Son $12.154.975 entrando
// quince días antes de lo pactado, en una proyección que alimenta el calendario de cobros, CAJA y
// la proyección de IVA.
//
// ═══ POR QUÉ LA OC Y NO OTRA COSA ═══
//
// Porque es el documento donde el cliente escribe la condición que acepta pagar. El mismo cliente
// tiene OCs a 15 y a 30 días (MESSINA: la 00002-00000279 dice 15, la 00002-00002266 dice 30), así
// que ni siquiera una condición por CLIENTE alcanza: el plazo es de la ORDEN, no del cliente.
//
// La condición viaja en el PDF de la OC en un campo estructurado —`Cond.Compra : <código>
// <descripción>`— y se lee sin OCR: los 10 PDFs de MESSINA encontrados en Drive dieron texto
// nativo. Los códigos observados son 3 (cta. cte. 15 días), 6 (cta. cte. 30 días), 18 (cheque a 30
// días) y 21 (50% anticipado / 50% contra entrega).
//
// ═══ LAS TRES REGLAS QUE HACEN QUE ESTO NO MIENTA ═══
//
// **1. Un plazo supuesto nunca se ve igual que uno pactado.** Toda resolución sale con `origen` y
// `certeza`. Un número sin su origen es indistinguible de uno inventado, y el defecto que estamos
// arreglando es exactamente ése.
//
// **2. Una condición que NO es un plazo en días no se convierte en uno.** La OC 00002-00002173 dice
// "50% ANTICIPADO - 50% CONTRA ENTREGA": eso es un hito, no una cuenta corriente. Devolver 30 ahí
// sería fabricar un dato teniendo el documento delante. Sale FALTA_DATO con el texto literal, y NO
// cae a la constante: la OC ya habló, y lo que dijo no se mide en días.
//
// **3. El texto tipeado en la celda es un RECLAMO, no una fuente.** "cta. cte. 15 días" escrito a
// mano al lado del número de OC no prueba nada — la OC decía 30. Se lee para CONTRASTARLO contra lo
// pactado y publicar la discrepancia, nunca para alimentar el cálculo.
//
// ═══ EL ANCLA: LA FACTURA, NO LA VENTA ═══
//
// "Cuenta corriente 30 días" se cuenta desde la factura. En Cobranzas son dos columnas distintas —C
// "Fecha de Venta" y P "Fecha de Factura"— y difieren en 46 de las 95 filas, hasta 82 días (ARCOR
// factura contra aprobación de certificado). Las fórmulas `=P+N` del propio archivo anclan en P, y
// esta librería también. `cobranzas-vencido.mjs` ancla en C: es una diferencia REAL que este
// trabajo declara y no resuelve (ver el informe).

import { PLAZO_COBRO_DIAS } from './cobranzas-vencido.mjs'

/** DE DÓNDE SALIÓ EL PLAZO. La cascada, en orden de precedencia. */
export const ORIGEN = Object.freeze({
  ORDEN_DE_COMPRA: 'ORDEN_DE_COMPRA',
  CONDICION_CLIENTE: 'CONDICION_CLIENTE',
  SUPUESTO_GLOBAL: 'SUPUESTO_GLOBAL',
})

/** CUÁNTO VALE ESE PLAZO como afirmación. `FALTA_DATO` no trae número: trae el motivo. */
export const CERTEZA = Object.freeze({
  PACTADO: 'PACTADO',
  SUPUESTO: 'SUPUESTO',
  FALTA_DATO: 'FALTA_DATO',
})

/**
 * EL PLAZO QUE SE USA CUANDO NO HAY NINGUNO PACTADO.
 *
 * Es la MISMA constante de `cobranzas-vencido.mjs`, importada y no redefinida: dos números 30 en dos
 * archivos son dos definiciones del mismo concepto esperando a divergir.
 */
export const PLAZO_SUPUESTO_DIAS = PLAZO_COBRO_DIAS

// ═══════════════════════════════════════════════════════════════════════════════
// EL NÚMERO DE ORDEN DE COMPRA QUE DECLARA UNA CELDA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OC CON MARCADOR: la palabra "OC" delante. Es la forma segura, y la única que se acepta cuando la
 * celda tiene además texto libre —que es donde viven los importes de contrato ("Total Obra:
 * $47.590.272", "s/ total 65.000.000") que un extractor ingenuo leería como número de orden.
 */
const OC_CON_MARCADOR = /\bOC\s*[:.\-]?\s*(\d{1,5}\s*-\s*\d{6,8}|\d{8})\b/i

/** OC MESSINA: punto de venta y número, con guion. `02-00002097` y `00002-00002097` son la misma. */
const OC_PUNTO_VENTA = /(?:^|[^\d.,])(\d{1,5})\s*-\s*(\d{6,8})(?![\d.,])/

/**
 * OC ARCOR SIN MARCADOR: ocho dígitos que ocupan la celda ENTERA, con a lo sumo un sufijo corto de
 * centro de costo ("53312775 6A"). El anclaje a la celda entera es lo que la vuelve segura: un
 * importe siempre viene acompañado de texto o de separadores de miles.
 */
const OC_SUELTA = /^\s*(\d{8})(?:\s+[0-9A-Z]{1,3})?\s*$/i

/**
 * EL NÚMERO DE ORDEN DE COMPRA QUE DECLARA UNA CELDA "ORDEN DE COMPRA", NORMALIZADO.
 *
 * Devuelve `00002-00002266` (punto de venta a 5, número a 8) o `53312775`, o `null` si la celda no
 * declara ninguna. Se equivoca hacia el `null`: una OC que no se lee deja la fila en FALTA_DATO y se
 * ve; una OC inventada produce un plazo creíble y falso.
 *
 * @param {unknown} texto la celda tal cual
 * @returns {string|null}
 */
export function numeroDeOrdenDeCompra(texto) {
  const t = String(texto ?? '').trim()
  if (!t) return null
  const conMarcador = OC_CON_MARCADOR.exec(t)
  if (conMarcador) return normalizarOC(conMarcador[1])
  const sola = OC_SUELTA.exec(t)
  if (sola) return sola[1]
  // Sin marcador y con texto alrededor sólo se acepta la forma punto-de-venta–número, que ningún
  // importe tiene: los montos del archivo usan punto de miles y coma decimal, nunca guion.
  const pv = OC_PUNTO_VENTA.exec(t)
  if (pv) return `${pv[1].padStart(5, '0')}-${pv[2].padStart(8, '0')}`
  return null
}

function normalizarOC(bruto) {
  const t = String(bruto).replace(/\s+/g, '')
  const pv = /^(\d{1,5})-(\d{6,8})$/.exec(t)
  if (pv) return `${pv[1].padStart(5, '0')}-${pv[2].padStart(8, '0')}`
  return t
}

/**
 * LA CLAVE CON LA QUE SE BUSCA EL PDF DE LA OC EN DRIVE.
 *
 * Los archivos de MESSINA se llaman `OC_32_0000200002266.pdf`: punto de venta y número PEGADOS. Los
 * de ARCOR, por el número solo. Buscar por el número con guion no encuentra nada.
 */
export const claveDeBusquedaDrive = (oc) => String(oc ?? '').replace(/-/g, '')

/**
 * EL PLAZO QUE ALGUIEN TIPEÓ EN LA CELDA. NO ES UNA FUENTE: es un reclamo a contrastar.
 *
 * @returns {number|null} los días declarados en el texto, si los declara
 */
export function plazoTipeadoEnCelda(texto) {
  const m = /(\d{1,3})\s*d[ií]as/i.exec(String(texto ?? ''))
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 && n <= 365 ? n : null
}

// ═══════════════════════════════════════════════════════════════════════════════
// LA CONDICIÓN QUE DECLARA EL PDF DE LA ORDEN DE COMPRA
// ═══════════════════════════════════════════════════════════════════════════════

/** El campo estructurado de la OC de MESSINA. Corta en "COMPRADOR:", que es lo que le sigue. */
const CAMPO_CONDICION = /Cond\.?\s*Compra\s*:?\s*(\d{1,3})?\s*([^\n]*?)(?:\s*COMPRADOR\s*:|\s*$)/i

/**
 * QUÉ CONDICIÓN DE PAGO DECLARA EL TEXTO DE UNA ORDEN DE COMPRA.
 *
 * `dias` es `null` siempre que la condición no se mida en días —y eso NO es un fallo de lectura,
 * es la respuesta correcta: "50% anticipado / 50% contra entrega" es un hito, y convertirlo en un
 * número sería fabricar el dato con el documento delante.
 *
 * @param {unknown} textoPdf el texto plano del PDF
 * @returns {{codigo:string|null, descripcion:string, tipo:string, dias:number|null, instrumento:string|null}|null}
 */
export function condicionDeOrdenDeCompra(textoPdf) {
  const m = CAMPO_CONDICION.exec(String(textoPdf ?? ''))
  if (!m) return null
  const codigo = m[1] ?? null
  const descripcion = String(m[2] ?? '').replace(/\s+/g, ' ').trim()
  if (!descripcion) return null
  return { codigo, descripcion, ...clasificarCondicion(descripcion) }
}

/**
 * LA DESCRIPCIÓN → TIPO, DÍAS E INSTRUMENTO.
 *
 * Cada forma se reconoce EXPLÍCITAMENTE. Lo que no entra en ninguna sale `no_reconocida` con
 * `dias: null`: el catálogo de códigos del cliente puede crecer, y una condición nueva tiene que
 * aparecer como pregunta, no como 30 días silenciosos.
 */
function clasificarCondicion(descripcion) {
  const d = descripcion.toUpperCase()
  // Un hito manda sobre cualquier número que la frase pueda contener: "50% ANTICIPADO - 50% CONTRA
  // ENTREGA A 30 DIAS" no es una cuenta corriente a 30 días.
  if (/ANTICIPAD|CONTRA\s+ENTREGA|CONTRA\s+RECEPCI|HITO|CERTIFICAC/.test(d)) {
    return { tipo: 'hitos', dias: null, instrumento: null }
  }
  if (/^\s*CONTADO\b/.test(d)) return { tipo: 'contado', dias: 0, instrumento: null }
  const cc = /CUENTA\s+CORRIENTE\s+(\d{1,3})\s*D[IÍ]AS/.exec(d)
  if (cc) return { tipo: 'cuenta_corriente', dias: Number(cc[1]), instrumento: null }
  // "CHEQUE A 30 DIAS": la caja entra al vencimiento del cheque, no cuando se recibe el papel. El
  // instrumento viaja declarado porque cambia el riesgo, no la fecha.
  const chq = /CHEQUE\s*(?:A\s*)?(\d{1,3})\s*D[IÍ]AS/.exec(d)
  if (chq) return { tipo: 'cheque', dias: Number(chq[1]), instrumento: 'cheque' }
  return { tipo: 'no_reconocida', dias: null, instrumento: null }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LA CASCADA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DE DÓNDE SALE EL PLAZO DE ESTA FILA, Y CON QUÉ CERTEZA.
 *
 * Precedencia: **OC leída > condición cargada a mano para ese cliente > constante global.** Con una
 * excepción que es todo el punto del módulo: si la OC se leyó y su condición NO se mide en días, la
 * cascada SE DETIENE en FALTA_DATO. No se sigue bajando, porque el documento que pacta ya habló.
 *
 * @param {object} e
 * @param {unknown} e.textoOrdenCompra la celda H de Cobranzas
 * @param {unknown} e.cliente la celda G, para la capa manual
 * @param {Map<string,object>} [e.ocLeidas] OC normalizada → condición leída del PDF
 * @param {Map<string,object>} [e.condicionesCliente] cliente → {dias, fuente}
 * @param {number} [e.plazoSupuesto] el último recurso
 * @returns {{dias:number|null, origen:string, certeza:string, orden_compra:string|null,
 *            evidencia:string, instrumento:string|null, discrepancia:object|null}}
 */
export function resolverPlazoDeCobro({
  textoOrdenCompra, cliente, ocLeidas = new Map(),
  condicionesCliente = new Map(), plazoSupuesto = PLAZO_SUPUESTO_DIAS,
} = {}) {
  const oc = numeroDeOrdenDeCompra(textoOrdenCompra)
  const tipeado = plazoTipeadoEnCelda(textoOrdenCompra)
  const base = { orden_compra: oc, instrumento: null, discrepancia: null }

  const leida = oc ? ocLeidas.get(oc) : null
  if (leida && Number.isFinite(leida.dias)) {
    return {
      ...base, dias: leida.dias, origen: ORIGEN.ORDEN_DE_COMPRA, certeza: CERTEZA.PACTADO,
      instrumento: leida.instrumento ?? null,
      evidencia: `OC ${oc}: «${leida.descripcion}»${leida.drive_file_id ? ` (${leida.drive_file_id})` : ''}`,
      discrepancia: tipeado !== null && tipeado !== leida.dias
        ? { tipeado_en_celda: tipeado, pactado_en_oc: leida.dias, dias_de_diferencia: leida.dias - tipeado }
        : null,
    }
  }
  if (leida) {
    // La OC existe, se leyó, y su condición no se mide en días. Se detiene acá A PROPÓSITO.
    return {
      ...base, dias: null, origen: ORIGEN.ORDEN_DE_COMPRA, certeza: CERTEZA.FALTA_DATO,
      evidencia: `OC ${oc}: «${leida.descripcion}» — la condición no se mide en días (${leida.tipo})`,
    }
  }

  const manual = cliente ? buscarCondicionCliente(condicionesCliente, cliente) : null
  if (manual && Number.isFinite(manual.dias)) {
    return {
      ...base, dias: manual.dias, origen: ORIGEN.CONDICION_CLIENTE, certeza: CERTEZA.PACTADO,
      instrumento: manual.instrumento ?? null,
      evidencia: `condición cargada para ${manual.cliente}: ${manual.dias} días — ${manual.fuente ?? 'sin fuente declarada'}`,
    }
  }

  return {
    ...base, dias: plazoSupuesto, origen: ORIGEN.SUPUESTO_GLOBAL, certeza: CERTEZA.SUPUESTO,
    evidencia: oc
      ? `sin la OC ${oc} archivada y sin condición cargada para el cliente: ${plazoSupuesto} días supuestos`
      : `la fila no declara orden de compra y no hay condición cargada para el cliente: ${plazoSupuesto} días supuestos`,
  }
}

/** El cliente de Cobranzas se tipea con variantes ("MESSINA", "MESSINA S.A."): se compara en plano. */
function buscarCondicionCliente(mapa, cliente) {
  const plano = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const c = plano(cliente)
  if (!c) return null
  for (const [k, v] of mapa) {
    const kp = plano(k)
    if (kp && (c === kp || c.startsWith(kp) || kp.startsWith(c))) return { ...v, cliente: k }
  }
  return null
}

/**
 * LA FECHA DE COBRO QUE SE DESPRENDE DEL PLAZO, EN SERIAL DE SHEETS.
 *
 * Ancla en la FECHA DE FACTURA. `null` cuando no hay plazo (FALTA_DATO) o no hay factura: una fila
 * sin fecha proyectada se ve; una proyectada desde 1899 se suma a la caja de esta semana.
 */
export function fechaDeCobroProyectada(serialFactura, dias) {
  const f = Number(serialFactura)
  if (!(f > 0) || !Number.isFinite(Number(dias))) return null
  return f + Number(dias)
}
