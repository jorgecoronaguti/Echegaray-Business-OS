// LAS PLANTILLAS ECSAS: cómo se arma un mazo entero, de la portada a las fuentes.
//
// ═══ QUÉ DECIDE ESTE ARCHIVO Y QUÉ NO ═══
//
// Decide: el esqueleto de cada tipo de presentación, la portada, los cortes de sección, el cierre,
// el reparto de contenido que no entra, y la lámina de fuentes. No decide una palabra del texto.
//
// ═══ POR QUÉ LA LÁMINA DE FUENTES SE AGREGA SOLA ═══
//
// Porque si dependiera de que el modelo se acuerde, un día no se acuerda. Toda referencia externa
// que alguna lámina haya citado termina listada al final, con su URL y cuándo se leyó. Es la misma
// regla de siempre: lo de afuera se muestra con su origen o no se muestra.
//
// PURO — no toca Google. `motor.mjs` es el que publica.

import { CONTENIDO, COLOR, LOGO, LOGO_URL, MARGEN, PAGINA, TIPO } from './marca.mjs'
import { medirBullets, medirTexto, repartirBullets } from './layout.mjs'
import {
  altoDisponible, bullets, CHROME, citaFuentes, encabezado, espacioPastilla, imagen, marcaEcsas,
  nota, pastillaOrigen, pie, rect, reiniciarIds, texto,
} from './cajas.mjs'
import { CUERPOS } from './componentes.mjs'

/** Lo único que cambia entre tipos de presentación: el rótulo de portada y el default del cierre.
 *  La grilla, la tipografía y el color NO cambian — un mazo comercial y uno de Dirección tienen que
 *  verse de la misma empresa. */
export const PERFIL = Object.freeze({
  CLIENTE: { etiqueta: 'Informe al cliente', cierre: 'Quedamos a disposición' },
  AVANCE_OBRA: { etiqueta: 'Avance de obra', cierre: 'Próxima medición' },
  COMERCIAL: { etiqueta: 'Propuesta comercial', cierre: 'Propuesta sujeta a confirmación' },
  DIRECCION: { etiqueta: 'Dirección', cierre: 'Decisiones pendientes' },
  TECNICO: { etiqueta: 'Informe técnico', cierre: 'Conclusiones' },
  PRESUPUESTO: { etiqueta: 'Presupuesto', cierre: 'Validez de la oferta' },
})

const BANDA_ALTO = 58

/** La banda blanca del pie de las láminas oscuras. Resuelve dos cosas de una: el logo siempre se ve
 *  (el PNG es oscuro sobre transparente, sobre grafito desaparecía) y la portada gana un piso. */
function bandaIdentidad({ derecha = null }) {
  const y = PAGINA.alto - BANDA_ALTO
  const cajas = [
    rect({ x: 0, y, ancho: PAGINA.ancho, alto: BANDA_ALTO, relleno: COLOR.papel }),
    rect({ x: 0, y, ancho: PAGINA.ancho, alto: 3, relleno: COLOR.amarillo }),
  ]
  if (LOGO_URL) {
    cajas.push(imagen({ x: MARGEN.izq, y: y + (BANDA_ALTO - LOGO.alto * 1.35) / 2, ancho: LOGO.ancho * 1.35, alto: LOGO.alto * 1.35, url: LOGO_URL }))
  } else {
    cajas.push(...marcaEcsas({ x: MARGEN.izq, y: y + (BANDA_ALTO - 30) / 2, alto: 30 }).cajas)
  }
  if (derecha) {
    cajas.push(texto({
      x: PAGINA.ancho / 2, y: y + BANDA_ALTO / 2 - 7, ancho: PAGINA.ancho / 2 - MARGEN.der, alto: 14,
      contenido: derecha, estilo: { ...TIPO.pie, color: COLOR.texto }, alineacion: 'END',
    }))
  }
  return cajas
}

/** PORTADA. Grafito a sangre, título abajo a la izquierda —donde el ojo occidental descansa— y la
 *  banda de identidad al pie. El bloque amarillo es el único elemento decorativo del mazo. */
export function portada(deck) {
  const perfil = PERFIL[deck.tipo]
  const contexto = [deck.cliente, deck.obra].filter(Boolean).join('  ·  ')
  const anchoTitulo = PAGINA.ancho - MARGEN.izq - 150
  const mT = medirTexto(deck.titulo, { ancho: anchoTitulo, tamano: TIPO.portadaTitulo.tamano, alto: TIPO.portadaTitulo.alto, negrita: true })
  const yTitulo = PAGINA.alto - BANDA_ALTO - 44 - mT.altoPt - (deck.subtitulo ? 42 : 0)
  const cajas = [
    rect({ x: 0, y: 0, ancho: PAGINA.ancho, alto: PAGINA.alto, relleno: COLOR.grafito }),
    rect({ x: MARGEN.izq, y: yTitulo - 62, ancho: 54, alto: 4, relleno: COLOR.amarillo }),
    texto({
      x: MARGEN.izq, y: yTitulo - 46, ancho: anchoTitulo, alto: 14,
      contenido: [perfil.etiqueta, contexto].filter(Boolean).join('  ·  ').toUpperCase(),
      estilo: { ...TIPO.kicker, color: COLOR.amarillo },
    }),
    texto({ x: MARGEN.izq, y: yTitulo, ancho: anchoTitulo, alto: mT.altoPt + 4, contenido: deck.titulo, estilo: TIPO.portadaTitulo }),
  ]
  if (deck.subtitulo) {
    const mS = medirTexto(deck.subtitulo, { ancho: anchoTitulo * 0.86, tamano: TIPO.portadaBajada.tamano, alto: TIPO.portadaBajada.alto })
    cajas.push(texto({ x: MARGEN.izq, y: yTitulo + mT.altoPt + 14, ancho: anchoTitulo * 0.86, alto: mS.altoPt + 2, contenido: deck.subtitulo, estilo: TIPO.portadaBajada }))
  }
  return { nombre: 'portada', fondo: COLOR.grafito, cajas: [...cajas, ...bandaIdentidad({ derecha: deck.fecha || null })] }
}

/** CORTE DE SECCIÓN. Existe para que un mazo de veinte láminas tenga capítulos: sin corte, la
 *  décima lámina y la undécima parecen la misma conversación. */
export function seccion(lamina, indice) {
  const cajas = [
    rect({ x: 0, y: 0, ancho: PAGINA.ancho, alto: PAGINA.alto, relleno: COLOR.grafito }),
    texto({ x: MARGEN.izq, y: 128, ancho: 120, alto: 66, contenido: String(indice).padStart(2, '0'), estilo: TIPO.seccionNumero }),
    rect({ x: MARGEN.izq, y: 206, ancho: 54, alto: 4, relleno: COLOR.amarillo }),
    texto({ x: MARGEN.izq, y: 224, ancho: PAGINA.ancho - MARGEN.izq * 2 - 120, alto: 70, contenido: lamina.titulo, estilo: TIPO.seccionTitulo }),
  ]
  if (lamina.bajada) {
    cajas.push(texto({ x: MARGEN.izq, y: 296, ancho: 430, alto: 44, contenido: lamina.bajada, estilo: TIPO.portadaBajada }))
  }
  return { nombre: 'seccion', fondo: COLOR.grafito, cajas }
}

/** CIERRE. */
export function cierre(lamina, deck) {
  const cajas = [
    rect({ x: 0, y: 0, ancho: PAGINA.ancho, alto: PAGINA.alto, relleno: COLOR.grafito }),
    rect({ x: MARGEN.izq, y: 132, ancho: 54, alto: 4, relleno: COLOR.amarillo }),
    texto({ x: MARGEN.izq, y: 154, ancho: 520, alto: 74, contenido: lamina.titulo, estilo: { ...TIPO.seccionTitulo, tamano: 30 } }),
  ]
  if (lamina.mensaje) cajas.push(texto({ x: MARGEN.izq, y: 236, ancho: 470, alto: 56, contenido: lamina.mensaje, estilo: TIPO.portadaBajada }))
  if (lamina.contacto) cajas.push(texto({ x: MARGEN.izq, y: 296, ancho: 470, alto: 30, contenido: lamina.contacto, estilo: TIPO.portadaPie }))
  // El orden ES el apilado: el fondo va primero o tapa todo lo que se dibujó antes.
  return { nombre: 'cierre', fondo: COLOR.grafito, cajas: [...cajas, ...bandaIdentidad({ derecha: deck.fecha || null })] }
}

/** LÁMINA DE FUENTES. La arma el motor, no el modelo. */
export function laminaFuentes(fuentes, { numero, total, deck } = {}) {
  const { cajas, y } = encabezado({ kicker: 'Referencias externas', titulo: 'De dónde salió la información de afuera' })
  const items = fuentes.map((f) => `${f.titulo} — ${f.url}${f.obtenido_en ? `  ·  leído ${f.obtenido_en}` : ''}${f.frescura ? `  ·  ${f.frescura}` : ''}`)
  const AVISO = 'Estas referencias NO son datos de Echegaray: se citan con su origen y su fecha, y hay que verificarlas antes de usarlas para decidir.'
  const mA = medirTexto(AVISO, { ancho: CONTENIDO.ancho, tamano: TIPO.subtitulo.tamano, alto: TIPO.subtitulo.alto })
  const yLista = y + mA.altoPt + 16
  const m = medirBullets(items, { ancho: CONTENIDO.ancho, tamano: 10.5, alto: 1.4 })
  return {
    nombre: 'fuentes',
    fondo: COLOR.papel,
    cajas: [
      ...cajas,
      texto({ x: CONTENIDO.x, y, ancho: CONTENIDO.ancho, alto: mA.altoPt + 2, contenido: AVISO, estilo: TIPO.subtitulo }),
      bullets({
        x: CONTENIDO.x, y: yLista, ancho: CONTENIDO.ancho,
        alto: Math.min(m.altoPt + 6, altoDisponible(yLista)), items,
        estilo: { ...TIPO.cuerpo, tamano: 10.5, color: COLOR.externo },
      }),
      // Lleva el mismo pie que el resto: una lámina sin numerar dentro de un mazo numerado se lee
      // como pegada de otro lado, que es justo lo contrario de lo que esta lámina quiere decir.
      ...(numero ? pie({ numero, total, obra: deck?.obra, cliente: deck?.cliente }) : []),
    ],
  }
}

/**
 * Lámina de contenido con su marco.
 *
 * EL PIE SE ARMA DE ABAJO HACIA ARRIBA, y no es un capricho: la cita de una fuente externa con una
 * URL larga ocupa dos líneas, no las 22 pt que se le reservaban a ojo. Con la reserva fija, la
 * primera lámina de prueba con fuente puso la cita encima del cuerpo. Ahora se MIDE la cita, se la
 * apoya sobre la línea del pie, y el cuerpo recibe lo que queda arriba.
 */
function laminaContenido(lamina, { deck, numero, total }) {
  const { cajas: cabeza, y } = encabezado({
    kicker: lamina.kicker || null, titulo: lamina.titulo, ancho: CONTENIDO.ancho - espacioPastilla(lamina.origen),
  })
  const base = CHROME.pieLinea - 12
  const cita = citaFuentes({ fuentes: lamina.fuentes, x: CONTENIDO.x, y: 0, ancho: CONTENIDO.ancho })
  const altoCita = cita.reduce((n, c) => n + c.alto, 0)
  const anotacion = nota({ contenido: lamina.nota, x: CONTENIDO.x, y: 0, ancho: CONTENIDO.ancho })
  const altoNota = anotacion.reduce((n, c) => n + c.alto, 0)
  const yCita = base - altoCita
  const yNota = yCita - (altoCita ? 6 : 0) - altoNota
  const techoPie = altoCita || altoNota ? Math.min(yNota, yCita) : base
  const alto = Math.max(40, techoPie - 14 - y)
  const cuerpo = CUERPOS[lamina.tipo]({ lamina, x: CONTENIDO.x, y, ancho: CONTENIDO.ancho, alto })
  return {
    nombre: lamina.tipo,
    fondo: COLOR.papel,
    lamina,
    cajas: [
      ...cabeza,
      ...pastillaOrigen({ origen: lamina.origen, x: CONTENIDO.x + CONTENIDO.ancho, y: MARGEN.sup }),
      ...cuerpo,
      ...anotacion.map((c) => ({ ...c, y: yNota })),
      ...cita.map((c) => ({ ...c, y: yCita })),
      ...pie({ numero, total, obra: deck.obra, cliente: deck.cliente }),
    ],
  }
}

/**
 * REPARTO. Una lámina de `puntos` cuyo contenido no entra se parte en las que hagan falta, y las
 * continuaciones llevan «(cont.)». La alternativa —achicar hasta que entre— produce la lámina de
 * cuerpo 7 que en una sala nadie lee.
 */
export function expandirLaminas(laminas) {
  const salida = []
  for (const l of laminas) {
    if (l.tipo !== 'puntos') { salida.push(l); continue }
    const { y } = encabezado({ kicker: l.kicker || null, titulo: l.titulo, ancho: CONTENIDO.ancho - espacioPastilla(l.origen) })
    const bajada = l.bajada ? medirTexto(l.bajada, { ancho: CONTENIDO.ancho * 0.86, tamano: TIPO.subtitulo.tamano, alto: TIPO.subtitulo.alto }).altoPt + 16 : 0
    // La misma cuenta que `laminaContenido`: si acá se reservara menos, el reparto dejaría láminas
    // que después no entran y el control de calidad las rebotaría sin que nadie sepa por qué.
    const altoCita = citaFuentes({ fuentes: l.fuentes, x: 0, y: 0, ancho: CONTENIDO.ancho }).reduce((n, c) => n + c.alto, 0)
    const altoNota = nota({ contenido: l.nota, x: 0, y: 0, ancho: CONTENIDO.ancho }).reduce((n, c) => n + c.alto, 0)
    const disponible = altoDisponible(y + bajada, { reservaPie: altoCita + altoNota + (altoCita && altoNota ? 6 : 0) + 2 })
    const grupos = repartirBullets(l.puntos, { ancho: CONTENIDO.ancho, altoDisponible: disponible, tamano: TIPO.bullet.tamano, alto: TIPO.bullet.alto })
    grupos.forEach((g, i) => salida.push({
      ...l,
      titulo: i === 0 ? l.titulo : `${l.titulo} (cont.)`,
      bajada: i === 0 ? l.bajada : null,
      puntos: g,
    }))
  }
  return salida
}

/**
 * COMPONE EL MAZO ENTERO. Devuelve `{laminas:[{nombre, fondo, cajas}], resumen}`. Sin red, sin
 * credenciales: es lo que permite que el control de calidad corra antes de crear nada en Drive.
 */
export function componerDeck(deck) {
  reiniciarIds()
  const cuerpo = expandirLaminas(deck.laminas)
  const fuentes = []
  for (const l of cuerpo) for (const f of l.fuentes || []) if (!fuentes.some((x) => x.url === f.url)) fuentes.push(f)
  const conFuentes = fuentes.length ? [...cuerpo, null] : cuerpo
  const total = conFuentes.length + 1
  const laminas = [portada(deck)]
  let seccionN = 0
  conFuentes.forEach((l, i) => {
    if (l === null) { laminas.push(laminaFuentes(fuentes, { numero: i + 2, total: total + 1, deck })); return }
    if (l.tipo === 'seccion') { seccionN += 1; laminas.push(seccion(l, seccionN)); return }
    if (l.tipo === 'cierre') { laminas.push(cierre(l, deck)); return }
    laminas.push(laminaContenido(l, { deck, numero: i + 2, total: total + 1 }))
  })
  return {
    laminas,
    resumen: {
      tipo: deck.tipo, laminas: laminas.length, pedidas: deck.laminas.length,
      partidas: cuerpo.length - deck.laminas.length, fuentes_externas: fuentes.length,
    },
  }
}
