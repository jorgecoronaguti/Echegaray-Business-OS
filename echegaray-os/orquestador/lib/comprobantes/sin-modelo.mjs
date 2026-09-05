// LEER UN COMPROBANTE SIN GASTAR UN TOKEN — el camino que existía y no estaba enchufado.
//
// ═══ EL DEFECTO, MEDIDO EL 05/09/2026 ═══
//
// `pdf-afip.mjs` lee una factura electrónica en PDF con CERO modelo: el texto lo escribió el sistema
// de facturación del proveedor, cada importe viene rotulado por AFIP y la aritmética se verifica
// contra sí misma. Está escrito, documentado, medido sobre seis PDFs reales… y **lo importaba
// únicamente su propio test**. Ningún camino de producción lo llamaba: TODO PDF iba a Claude.
//
// Código probado que nunca corre no es una capacidad pendiente: es un defecto. Esto lo enchufa.
//
// ═══ POR QUÉ LA GANANCIA ES CHICA, Y LO DIGO IGUAL ═══
//
// De los 111 adjuntos guardados, **102 son JPEG y 7 son PDF**. Esto resuelve el 6%, no el 94%. La
// plata de la visión está en los planos ($17,69 de $42,62), no acá ($1,50). Enchufarlo es correcto
// —es gratis, está probado y hoy es un defecto— pero no es la palanca, y presentarlo como si lo
// fuera sería mentir con un número verdadero.
//
// ═══ LA DECISIÓN QUE HACE QUE ESTO FUNCIONE ═══
//
// `necesitaRevision` pide una segunda lectura, con el modelo grande, cuando NO encuentra anotación
// manuscrita. Es correcto para una foto: en esta empresa alguien anota a mano sobre el papel a qué
// obra va el gasto, y no encontrarlo suele ser que el modelo no miró bien.
//
// En un PDF de factura electrónica NO HAY MANO. El proveedor lo emitió y lo mandó por mail; nadie
// escribió encima. Aplicarle ese control convertiría cada PDF en dos llamadas a Claude para buscar
// algo que no puede existir — o sea, lo contrario de lo que este archivo viene a hacer. Por eso el
// camino determinístico devuelve su lectura SIN pasar por la revisión, y lo dice en `via`.
//
// La contracara: un PDF **escaneado** (una foto adentro de un PDF) sí puede tener mano encima. Ése
// no llega acá: `comprobanteDesdePdf` devuelve `null` cuando el texto tiene menos de 200 caracteres,
// que es exactamente la firma de un escaneo. Cae al camino de siempre.

import { comprobanteDesdePdf } from './pdf-afip.mjs'

/**
 * LA LECTURA DETERMINÍSTICA, EN LA FORMA QUE EL RESTO DEL PIPELINE YA ENTIENDE.
 *
 * `comprobanteDesdePdf` devuelve el IVA SUMADO, no abierto por alícuota. Se deposita entero en
 * `iva_21` a propósito: los dos consumidores de este campo —`ivaPlausible` e
 * `identidadDelComprobante`— usan `iva_21 + iva_105`, así que la suma da idéntica. Abrirlo por
 * alícuota acá sería reimplementar un parseo que ya existe del otro lado, y tener dos.
 *
 * @returns el crudo, o `null` si la lectura no se puede afirmar
 */
export function crudoDesdePdf(salida) {
  // `comprobanteDesdePdf` devuelve un SOBRE —`{comprobante, completo, falta, via}`—, no el objeto
  // plano. Lo escribí contra el contrato que supuse y el test lo agarró en la primera corrida.
  //
  // Y EL DESEMPATE ES POR TIPO, NO POR PRESENCIA. Las dos formas tienen una clave `comprobante`: en
  // el sobre es el OBJETO con los campos, y en el objeto plano es el STRING «00009-00003204». Un
  // `salida?.comprobante ?? salida` devolvía el string y rompía los cuatro casos de golpe. Se mira
  // qué ES, no si está.
  const c = (salida && typeof salida.comprobante === 'object' && salida.comprobante !== null)
    ? salida.comprobante
    : salida
  if (!c) return null
  // ── LOS DOS REQUISITOS PARA NO PREGUNTARLE A NADIE ──
  //
  // `cuadra === true` es la aritmética del propio PDF cerrando contra sí misma: neto + IVA + otros
  // tributos = total, con los importes que AFIP rotuló. `cuit` no nulo significa que hubo UN solo
  // CUIT ajeno al nuestro, o sea que el emisor no es ambiguo.
  //
  // Cualquiera de las dos en falso NO es un error: es que este camino no alcanza, y el papel sigue
  // al camino de siempre. Afirmar con la mitad de la evidencia sería peor que pagar la llamada.
  if (c.cuadra !== true || !c.cuit) return null

  return {
    legible: true,
    cuit: c.cuit,
    // El número viene como «00009-00003204»: punto de venta a 5 dígitos, que es como lo imprime
    // AFIP en este formato. NO se recorta a 4: el identificador es el que está en el papel.
    numero: c.comprobante,
    punto_venta: c.puntoVenta,
    tipo: c.tipo,
    es_nota_credito: c.esNotaCredito,
    fecha: c.fecha,
    neto_gravado: c.neto,
    iva_21: c.iva,
    iva_105: 0,
    otros_tributos: c.otrosTributos,
    total: c.total,
    cae: c.cae,
    // NO HAY MANO EN UN PDF ELECTRÓNICO. `null` acá no es «no la encontré»: es que no existe, y por
    // eso este camino no pasa por `necesitaRevision`, que trataría la ausencia como un defecto.
    anotacion_manuscrita: null,
    condicion_manuscrita: null,
    via: c.via,
  }
}

/**
 * INTENTA LEER EL ADJUNTO SIN MODELO. Devuelve `null` cuando no corresponde o no alcanza.
 *
 * `leer` se inyecta para poder probar esto sin PyMuPDF ni disco. En producción es `leerDocumento`
 * de `lib/documentos/leer.mjs`, que ya sabe decidir si una página tiene capa de texto — la
 * bifurcación económica del pipeline entero, y no hacía falta escribirla dos veces.
 */
export async function leerSinModelo(adjunto, { leer = null, logger = null } = {}) {
  if (adjunto?.mediaType !== 'application/pdf' || !adjunto?.data) return null

  let texto = ''
  try {
    const cargar = leer ?? (await import('../documentos/leer.mjs')).leerDocumento
    const bytes = Buffer.from(adjunto.data, 'base64')
    const doc = await cargar(bytes, { nombre: adjunto.nombre ?? 'comprobante.pdf', mimeDeclarado: 'application/pdf' })
    if (!doc?.ok || doc.necesitaOcr) return null
    texto = String(doc.texto ?? '')
  } catch (e) {
    // Que el extractor falle NO puede romper la lectura: se cae al camino de siempre, que es el que
    // funcionaba ayer. Un atajo que rompe el camino principal deja de ser un atajo.
    logger?.warn?.('comprobantes: no pude leer la capa de texto', { motivo: String(e?.message ?? e).slice(0, 120) })
    return null
  }

  const c = comprobanteDesdePdf(texto, { nombreArchivo: adjunto.nombre ?? null })
  const crudo = crudoDesdePdf(c)
  if (!crudo) return null

  logger?.info?.('comprobantes: leído sin modelo', { via: crudo.via, numero: crudo.numero })
  return { ok: true, crudo, via: crudo.via }
}
