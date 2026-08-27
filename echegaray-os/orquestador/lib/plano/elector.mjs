// ELEGIR LA PARTIDA — el modelo decide entre candidatos, nunca los inventa.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR, MEDIDO ═══
//
// Con el matcheo por vocabulario solo, la corrida sobre Quattropani mandó SIETE elementos metálicos
// distintos —la cercha, la viga 2C200, las correas C140, las correas KL, el perfil 2K1, el cordón
// CM1 y la columna de escalera CMe— a una sola partida: «T1110 CERCHA P/TECHO METALICO», 300,82 ml,
// $22,9 M. Todos comparten el vocabulario del acero y ninguno más es una cercha. El número salía
// redondo, con su APU y su respaldo, y era falso.
//
// El puntaje no puede arreglar eso: no está midiendo lo que hay que medir. «Correa C140» y «Cercha
// para techo metálico» se parecen como TEXTO y son cosas distintas como CONSTRUCCIÓN. Esa distancia
// es conocimiento de ingeniería, y es exactamente donde un modelo aporta lo que el código no tiene.
//
// ═══ LA CERRADURA ═══
//
// El modelo recibe una lista CERRADA de candidatos —los que el código ya filtró por unidad— y sólo
// puede devolver un código de esa lista o `null`. Cualquier otra cosa se descarta y el elemento
// queda `PARTIDA_CANDIDATA`. Así el modelo aporta criterio técnico sin poder tocar la Base Maestra
// ni fabricar un precio: lo que elige ya existía, con su análisis y su composición.
//
// Y `null` es una respuesta de primera clase. «Ninguna de estas partidas es esto» es el resultado
// correcto para una correa en una Base Maestra que no tiene correas, y forzarla adentro para que el
// presupuesto se vea completo es la forma de contaminarla.

import { CAPACIDAD } from '../ia/cliente.mjs'
import { extraerJson } from './interpretar.mjs'
import { FUENTE } from './fuente.mjs'

/** El pedido: un elemento por renglón con su evidencia, y debajo sus candidatos posibles. PURA. */
export function pedido(mapeos = []) {
  const bloques = mapeos.map((m, i) => {
    const c = m.computo
    const cands = m.candidatos.map((x) => `      · ${x.codigo} — ${x.nombre} [${x.unidad}]`).join('\n')
    return [
      `${i + 1}. ELEMENTO ${c.id} — ${c.nombre}`,
      `   sistema constructivo: ${c.sistema} · cantidad computada: ${c.cantidad?.valor} ${c.unidad}`,
      c.material ? `   material: ${c.material}` : null,
      c.especificacion ? `   especificación: ${c.especificacion}` : null,
      `   el plano dice: «${c.evidencia?.textoLiteral ?? '—'}»${c.evidencia?.vista ? ` (${c.evidencia.vista})` : ''}`,
      `   candidatos de la Base Maestra:\n${cands || '      (ninguno compatible en esa unidad)'}`,
    ].filter(Boolean).join('\n')
  })
  return [
    'Sos un ingeniero civil de una constructora argentina asignando partidas de presupuesto.',
    '',
    'Para cada ELEMENTO leído de un plano te doy los CANDIDATOS de nuestra base de análisis de',
    'precios que tienen la unidad correcta. Elegí el que corresponde TÉCNICAMENTE, o ninguno.',
    '',
    ...bloques,
    '',
    'Devolvés SÓLO este JSON:',
    '{"elecciones":[{"elemento":"CORREA-C140","codigo":null,"porque":"ninguna de las candidatas es una correa: T1110 es la cercha, que es otra pieza"},',
    '               {"elemento":"C1","codigo":"T1010","porque":"columna de carga de hormigón armado, que es exactamente lo que es C1"}]}',
    '',
    'REGLAS QUE NO SE NEGOCIAN:',
    '1. "codigo" tiene que ser UNO de los códigos que te listé para ESE elemento, o null. No existe',
    '   ninguna otra opción: no inventes códigos ni propongas partidas nuevas.',
    '2. null ES LA RESPUESTA CORRECTA cuando ninguna candidata es técnicamente lo mismo. Una correa',
    '   no es una cercha, una base no es una losa, una viga metálica no es una viga de hormigón, un',
    '   contrapiso de 10 cm no es un piso calcáreo con contrapiso de 20. Meterlo igual para que el',
    '   presupuesto se vea completo es peor que dejarlo pendiente: se cotiza un precio que no es.',
    '3. Mirá el MATERIAL y el ESPESOR/SECCIÓN antes que el nombre. «Columna» sola no dice si es de',
    '   hormigón o metálica; el elemento sí lo dice.',
    '4. SI LA PARTIDA LLEVA UNA DIMENSIÓN EN EL NOMBRE («PLATEA 50CM», «CONTRAPISO e=0,10 m»,',
    '   «PISO DE HORMIGON - 20CM») y el elemento del plano NO declara ese espesor, la respuesta es',
    '   null. Elegirla haría que la partida afirme por su cuenta un espesor que nadie leyó, y el',
    '   espesor es casi todo el costo. Medido: «Platea s/Calculo» → «PLATEA 50CM» sobre 191,92 m²',
    '   metió $ 29,6 M inventados en una cotización.',
    '5. "porque" en una línea, concreta, en castellano.',
  ].join('\n')
}

/**
 * ELEGIR. Una llamada para TODOS los elementos: la decisión de cada uno se toma mejor viendo el
 * conjunto —si dos elementos compiten por la misma partida, se nota— y una llamada por elemento
 * sobre 24 elementos sería pagar 24 veces por leer las mismas reglas.
 *
 * Devuelve los mapeos revisados. Si el modelo no contesta o falla, se devuelven los del código sin
 * tocar: degradar es perder criterio, no perder el resultado.
 */
export async function elegir({ pedir, mapeos = [], logger = null } = {}) {
  const revisables = mapeos.filter((m) => m.candidatos?.length)
  if (!revisables.length) return { mapeos, uso: null, cambios: [] }

  let crudo = null
  let uso = null
  try {
    uso = await pedir({
      capacidad: CAPACIDAD.COMPLEX,
      sistema: 'Sos un ingeniero civil asignando partidas. Devolvés SÓLO JSON válido, sin markdown.',
      mensajes: [{ role: 'user', content: pedido(revisables) }],
      maxTokens: 8000,
      agente: 'xsas-ingenieria',
      funcion: 'elegir-partida',
      logger,
    })
    crudo = extraerJson(uso.texto)
  } catch (e) {
    logger?.warn?.('plano: el elector de partidas falló', { motivo: String(e?.message ?? e).slice(0, 120) })
    return { mapeos, uso: null, cambios: [] }
  }
  if (!crudo?.elecciones) return { mapeos, uso, cambios: [] }

  const porElemento = new Map(crudo.elecciones.map((e) => [String(e.elemento), e]))
  const cambios = []
  const revisados = mapeos.map((m) => {
    const e = porElemento.get(String(m.elemento))
    if (!e) return m
    // LA LISTA CERRADA. Un código que el modelo se inventó no existe para este elemento.
    const elegido = e.codigo ? m.candidatos.find((c) => c.codigo === e.codigo) : null
    if (e.codigo && !elegido) {
      cambios.push({ elemento: m.elemento, que: `el modelo propuso «${e.codigo}», que no estaba entre sus candidatos — se ignora` })
      return m
    }
    if (!elegido) {
      if (m.estado === 'MAPEADA') cambios.push({ elemento: m.elemento, que: `desmapeada: ${e.porque ?? 'ninguna candidata es técnicamente lo mismo'}` })
      return { ...m, estado: 'PARTIDA_CANDIDATA', tarea: null, fuente: FUENTE.FALTA_DATO, porQue: `el criterio técnico descartó las candidatas — ${e.porque ?? 'ninguna es lo mismo'}` }
    }
    if (m.tarea?.codigo === elegido.codigo) return { ...m, porQue: `${m.porQue} · confirmado por criterio técnico: ${e.porque ?? ''}`.trim() }
    cambios.push({ elemento: m.elemento, que: `${m.tarea?.codigo ?? 'sin partida'} → ${elegido.codigo}: ${e.porque ?? ''}` })
    return {
      ...m, estado: 'MAPEADA', fuente: FUENTE.BASE_MAESTRA,
      tarea: { id: elegido.id ?? null, codigo: elegido.codigo, nombre: elegido.nombre, unidad: elegido.unidad },
      porQue: `elegida por criterio técnico entre ${m.candidatos.length} candidatas: ${e.porque ?? ''}`.trim(),
    }
  })
  return { mapeos: revisados, uso, cambios }
}
