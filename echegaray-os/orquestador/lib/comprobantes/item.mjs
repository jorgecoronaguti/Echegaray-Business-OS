// UN COMPROBANTE LEÍDO → EL ÍTEM DEL FAJO. NÚCLEO PURO, CERO MODELO Y CERO RED.
//
// Vivía dentro de `comunicacion/comprobantes/flujo.mjs`, que es el archivo que ORQUESTA —baja los
// adjuntos, consulta ARCA, abre el fajo, decide cuándo se escribe—. Esto no orquesta nada: dado lo
// que devolvió la visión y dadas las listas del Sheet, decide QUÉ VA EN CADA COLUMNA. Es la decisión
// más delicada del módulo (imputa plata a una obra) y merece probarse sola, sin Mattermost y sin
// Postgres, que es exactamente lo que permite tenerla acá.
//
// LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO: **un valor entra a una celda sólo si la lista de esa
// columna lo tiene EXACTO, o si el texto del papel lo identifica sin ambigüedad.** Nunca "el más
// parecido". Preguntar está bien; no mirar está mal; elegir entre dos es lo único inaceptable.

import { matchProveedor } from '../carga-comprobantes.mjs'
import { normalizarLectura, claveComprobante } from './lectura.mjs'
import { imputacionDeAnotacion } from './imputacion.mjs'
import { imputacionDelModelo, valorDeLista } from './desplegables.mjs'
import { MAX_OPCIONES } from './fajo.mjs'

/**
 * Un adjunto ya bajado → el ítem del fajo (comprobante + preguntas abiertas).
 *
 * `listas` son los desplegables ESTRICTOS. Si no se pudieron leer (`ok:false`), NO se marca al
 * proveedor como nuevo: se lo deja tal cual y se declara que no se pudo verificar. Decir "este
 * proveedor no existe" porque falló una lectura sería fabricar un hallazgo.
 *
 * `textoPost` es lo que la persona ESCRIBIÓ al mandar la foto. Es la segunda fuente de la obra y no
 * un adorno: mandar la foto con "ARCOR" al lado es la forma más natural de decir a qué obra va, y
 * mucho más frecuente que anotarla a mano en el papel antes de fotografiarlo. Sin mirarla, el bot
 * preguntaba por una obra que la persona acababa de escribir un renglón más arriba.
 *
 * EL ORDEN IMPORTA: manda lo que dice el COMPROBANTE; el texto del chat sólo se usa cuando el papel
 * no dice nada. Y las dos pasan por el MISMO matcheo estricto contra el desplegable, que devuelve
 * null si la referencia es ambigua. Escribir "ARCOR" no mete "ARCOR" en la celda: mete el rótulo del
 * desplegable que matchea sin ambigüedad, o no mete nada y se pregunta.
 */
export function armarItem({ lectura, adjunto, listas, textoPost = null } = {}) {
  const crudo = lectura ?? {}
  const { comprobante, faltantes, dudas } = normalizarLectura(lectura)
  const listasOk = listas?.ok !== false && (listas?.proveedores?.length ?? 0) > 0

  let proveedorNuevo = false
  if (listasOk && comprobante.proveedor) {
    // EL DESPLEGABLE ES EL ÁRBITRO, NO EL MODELO. Cuando hubo revisión, las dos pasadas pueden haber
    // leído nombres distintos del mismo membrete ("Néstor Rubén Corralón Progreso" y "MATERIALES DE
    // CONSTRUCCION"): se prueban las dos contra la lista estricta y gana la que matchea. Si ninguna
    // matchea, queda la principal marcada como nueva, igual que antes.
    let m = matchProveedor(comprobante.proveedor, listas.proveedores)
    if (m.esNuevo && comprobante.proveedorAlt) {
      const alt = matchProveedor(comprobante.proveedorAlt, listas.proveedores)
      if (!alt.esNuevo) m = alt
    }
    comprobante.proveedor = m.valor
    proveedorNuevo = m.esNuevo === true
  }
  delete comprobante.proveedorAlt

  // 1º el papel, 2º lo que escribió la persona. Nunca al revés.
  const vocabulario = { obras: listas?.obras ?? [], detalles: listas?.detalles ?? {} }
  let imp = imputacionDeAnotacion(comprobante.anotacion, vocabulario)
  let obraVia = imp.obra ? 'comprobante' : null

  // ═══ LO QUE EL MODELO ENTENDIÓ DE LA ANOTACIÓN (04/08) ═══
  //
  // `imputacionDeAnotacion` matchea TEXTO contra texto: resuelve "Messinas BSA" → MESSINA, pero no
  // "HW DX 2018" → Vehiculos / Maquinas, porque ahí no hay nada parecido que comparar — hay que
  // saber que eso es un vehículo. Al modelo se le dan ahora las listas de las tres columnas mientras
  // mira la foto (`bloqueImputacion`), que es la misma información que tiene una persona.
  //
  // SE VALIDA IGUAL, y por eso esto no afloja nada: sólo entra si el valor está EXACTO en el
  // desplegable estricto (`imputacionDelModelo`). Un valor inventado por el modelo no llega a una
  // celda; queda como si no hubiera contestado y se pregunta con el menú.
  const delModelo = imputacionDelModelo(crudo, listas)
  if (!imp.obra && delModelo.obra) {
    imp = { ...imp, obra: delModelo.obra }
    obraVia = 'manuscrita'
    comprobante.porQueEsaObra = String(crudo?.por_que_esa_obra ?? '').slice(0, 120) || null
  }
  if (delModelo.unidad && !comprobante.unidad) comprobante.unidad = delModelo.unidad
  if (delModelo.categoria && !comprobante.categoria) comprobante.categoria = delModelo.categoria
  // LA FORMA DE PAGO YA VIENE FILTRADA CONTRA SU DESPLEGABLE. Lo que la visión leyó en `forma_pago`
  // es texto libre del papel —ahí decía "Importe" y "30 DIAS FECHA FACTURA"— y sólo sobrevive si es
  // uno de los seis valores de la columna P. Si no lo es, la celda queda vacía a propósito.
  comprobante.formaPago = delModelo.formaPago ?? null

  // Y por último lo que la persona escribió al mandar la foto.
  if (!imp.obra) {
    const porTexto = imputacionDeAnotacion(textoPost, vocabulario)
    if (porTexto.obra) { imp = porTexto; obraVia = 'mensaje' }
  }

  comprobante.obra = imp.obra ?? null
  comprobante.obraVia = obraVia
  // K "Detalles / Obra" no tiene desplegable: su lista legítima es el vocabulario que el dueño ya
  // usó en esa obra. Se completa sólo cuando la anotación identifica UNO solo; si "BSA" puede ser
  // tres detalles distintos de MESSINA, la obra queda resuelta y el detalle vacío.
  //
  // El detalle que propuso el modelo sólo vale si es de la obra que quedó elegida: el vocabulario de
  // esta columna es POR OBRA, y poner el frente de otra obra es imputar mal con más precisión.
  //
  // ═══ LA TOLERANCIA DEPENDE DE LA FUERZA DE LA EVIDENCIA (04/08) ═══
  //
  // El 04/08 el bot escribió `Rodrigo Echegaray` en la columna K. Es un nombre de persona sacado de
  // las observaciones IMPRESAS de una factura, no un frente ni un vehículo. Pudo entrar porque esa
  // columna no tiene desplegable: su única lista es lo que alguien escribió ahí alguna vez, y eso
  // incluye lo que se escribió UNA vez.
  //
  // Las dos vías que completan K no valen lo mismo, y por eso no se les pide lo mismo:
  //   · `imputacionDeAnotacion` exige que el TEXTO ESCRITO EN EL PAPEL matchee el rótulo. Es evidencia
  //     del comprobante: alcanza con que esa obra lo haya usado una vez.
  //   · lo que el MODELO eligió de la lista es evidencia mucho más débil —eligió, no leyó— y por eso
  //     sólo puede elegir vocabulario FIRME: lo que esa obra ya usó más de una vez. Un frente real
  //     aparece decenas de veces; el ruido, una sola.
  if (!imp.detalle && comprobante.obra) {
    const det = valorDeLista(crudo?.detalle_obra, listas?.detallesFirmes?.[comprobante.obra])
    if (det) { imp = { ...imp, detalle: det, detalleVia: 'manuscrita' } }
  }
  comprobante.detalleObra = imp.detalle ?? null
  comprobante.detalleVia = imp.detalleVia ?? null

  const k = claveComprobante(comprobante)
  return {
    comprobante,
    clave: k?.clave ?? null,
    claveFuerte: k?.fuerte ?? false,
    proveedorNuevo,
    listasVerificadas: listasOk,
    // LOS DESPLEGABLES VIAJAN CON EL ÍTEM. El mensaje se vuelve a dibujar en cada click, desde el
    // fajo que está en Postgres: si las listas se releyeran de Google ahí, sería una llamada por
    // click y —peor— se podría ofrecer algo distinto de lo que después se valida. Lo que se ofrece y
    // lo que se acepta salen de la misma lista, guardada una sola vez.
    opciones: opcionesParaImputar(listas),
    faltantes,
    dudas,
    origen: { fileId: adjunto?.fileId ?? null, nombre: adjunto?.nombre ?? null },
  }
}

/**
 * Las listas ESTRICTAS con las que se va a preguntar la imputación, acotadas para que quepan en el
 * fajo. El detalle (columna K) no tiene desplegable: su vocabulario legítimo es el que el dueño ya
 * usó en esa obra, y por eso va por obra.
 */
export function opcionesParaImputar(listas = {}) {
  const acotar = (a) => (Array.isArray(a) ? a : []).map((v) => String(v).trim()).filter(Boolean).slice(0, MAX_OPCIONES)
  const detalle = {}
  for (const [obra, vals] of Object.entries(listas?.detalles ?? {})) {
    const l = acotar(vals)
    if (l.length) detalle[obra] = l
  }
  return {
    obra: acotar(listas?.obras), unidad: acotar(listas?.unidades),
    categoria: acotar(listas?.categorias), detalle,
  }
}

