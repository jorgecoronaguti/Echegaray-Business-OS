// Tool: ANALIZAR LOS PLANOS DE UN PROYECTO Y ARMAR LA COTIZACIÓN BORRADOR.
//
// Es la MISMA capacidad que corre `scripts/plano-a-cotizacion.mjs`: las dos llaman a
// `lib/plano/pipeline.mjs`. Mattermost es una cara, la app va a ser otra y el script es la tercera;
// la lógica vive en una sola. Por eso esta tool no sabe nada de chat: arma el resultado estructurado
// y un `resumen_texto` de pocas líneas, que es lo que el gateway entrega a quien haya preguntado.
//
// ═══ POR QUÉ EL RESUMEN ES CORTO Y EL DETALLE VIVE EN LA COTIZACIÓN ═══
//
// Un cómputo de 46 elementos no se lee en un chat. Lo que una persona necesita en el canal es si
// puede confiar en el número y qué le falta para cerrarlo; el detalle —partida por partida, con la
// lámina y el texto del plano de donde salió cada cantidad— queda en `cotizacion_partida` y en
// `public.computo`, que es donde se puede auditar y desde donde después se adjudica la obra.
//
// ═══ `os.write` — LA CAPABILITY DESCRIBE EL EFECTO, NO EL ORIGEN (27/08/2026) ═══
//
// Decía `drive.read` y el comentario de al lado admitía, en la misma frase, que «escribe en Postgres
// una cotización en BORRADOR». La capability describía DE DÓNDE LEE en vez de QUÉ DEJA, y por eso
// las dos cerraduras de `xsas-permisos.mjs` no se enteraban y la escritura no quedaba firmada:
// `escribeAfuera('drive.read')` es false. Medido contra el gateway vivo: un `jefe_obra` ejecutó esta
// tool y recibió la cascada comercial completa.
//
// Un borrador que queda en `public.cotizaciones` + `cotizacion_partida` + `public.computo` ES una
// escritura, aunque nadie lo haya adjudicado. Sigue sin tocar Drive, sin tocar el Sheet y sin crear
// ninguna obra — eso no la vuelve de lectura.

import { query } from '../db.mjs'
import { correr } from '../plano/pipeline.mjs'
// UNA corrida paga viva por proyecto: dos «cotizá quattropani» a la vez no duplican visión.
import { conCorridaExclusiva } from '../ia/fusible.mjs'
import { agruparPartidas, armar, persistir, cascadaDe } from '../plano/cotizacion-v0.mjs'
import { razonar, textoDeRazonamiento } from '../plano/razonamiento.mjs'

const money = (n) => (n === null || n === undefined ? 'sin dato' : `$ ${Math.round(Number(n)).toLocaleString('es-AR')}`)

/** El resumen ejecutivo. Ocho renglones: qué leyó, qué computó, cuánto da y qué falta definir. */
export function resumen({ r, cot, cascada, numero }) {
  const faltantes = r.computo.items.filter((i) => i.cantidad === null)
  const noLegibles = r.documentos.planos.noLegibles
  return [
    `**${(cot.obraNombre ?? '').toUpperCase()}** — cotización borrador ${numero}`,
    '',
    // EL ESTADO VA ARRIBA DEL TOTAL. Quien lee un número primero ya no lee igual lo que sigue.
    `🚦 **${r.control?.estado ?? 'SIN CONTROL'}** — ${r.control?.porQue ?? 'no se pudo evaluar la cobertura'}`,
    `📐 ${r.documentos.planos.legibles.length} plano(s) interpretados de ${r.documentos.total} documentos ${r.soloAdjuntos ? 'adjuntos (no se buscó en Drive)' : 'en Drive'}` +
      (noLegibles.length ? ` · ${noLegibles.length} no los puedo abrir (${noLegibles.map((d) => d.name).join(', ')})` : ''),
    `🔍 ${r.computo.detectados} elementos detectados · ${r.computo.computados} computados · ${r.computo.conHueco} sin medida en la documentación`,
    `📋 ${cot.partidas.length} partidas de la Base Maestra · ${cot.candidatas.length} elementos sin partida que la cubra`,
    `💰 costo directo ${money(cascada?.costo_directo)} · **venta sin IVA ${money(cascada?.venta_sin_iva)}** · ${Math.round(cascada?.hh_previstas ?? 0)} HH`,
    '',
    `⚠️ **ES UN TECHO, NO UNA OFERTA.** Sale sólo del plano: no incluye el alcance (¿mano de obra sola o con materiales? ¿qué queda afuera?) ni las tareas que ningún plano dibuja (replanteo, excavación, limpieza final). Falta definir ${faltantes.length} medida(s) y ${cot.candidatas.length} partida(s).`,
    faltantes.length ? `\nLo primero que necesito del proyectista: ${faltantes.slice(0, 5).map((f) => f.nombre).join(' · ')}${faltantes.length > 5 ? ` (+${faltantes.length - 5})` : ''}` : '',
    // Las preguntas agrupadas: las tres que destraban más partidas, no las veintidós sueltas.
    r.control?.preguntas?.length ? `\n❓ Las ${Math.min(3, r.control.preguntas.length)} respuestas que más destraban (de ${r.control.preguntas.length} pendientes):\n${r.control.preguntas.slice(0, 3).map((q) => `· [${q.destraba.length}] ${q.pregunta} → ${q.quienLoTiene}`).join('\n')}` : '',
    r.control?.omisionesCircot?.length ? `\n🔎 El CIRCOT ${r.referenciaCircot?.periodo ?? ''} señala ${r.control.omisionesCircot.length} partida(s) que suelen ir en estos rubros y no están — a confirmar, no las agrego solo.` : '',
    (r.checklist ?? []).some((c) => c.estado === 'APLICA') ? `\n📑 Checklist ${r.tipoObra?.tipo}: falta(n) ${r.checklist.filter((c) => c.estado === 'APLICA').map((c) => c.partida).slice(0, 6).join(' · ')}` : '',
  ].filter(Boolean).join('\n')
}

export function planoTools(google) {
  return {
    // ═══ EL RAZONAMIENTO DEL COTIZADOR (dueño, 02/09/2026) — LECTURA, NO ESCRIBE NADA ═══
    //
    // Contesta los pasos que un cotizador se hace sobre los planos de un proyecto: superficies,
    // bases por tipo con secciones, muertos de anclaje, fundación lineal, sísmica, columnas y
    // encadenados, luces entre apoyos, el barrido de lo leído, y las excavaciones CON profundidad
    // (o su faltante con nombre). Reusa el MISMO pipeline que cotiza — con las láminas ya
    // interpretadas en caché la corrida no paga ninguna llamada de visión.
    'plano.razonamiento': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'razonamiento_del_cotizador',
        description:
          'RESPONDE, paso por paso y con cita del plano, el razonamiento geométrico del cotizador sobre un proyecto: superficies (impronta, cubierta, semicubierta), cuántas bases por tipo y sus secciones, muertos de anclaje, vigas de fundación, arriostramientos, vigas de carga, si la documentación menciona lo sísmico, columnas y encadenados, luces entre columna y columna, el barrido X/Y del plano y las excavaciones con su PROFUNDIDAD. USALO cuando el dueño pregunte "cuántas bases tiene [obra]", "qué superficie cubierta tiene [obra]", "qué profundidad tienen las excavaciones de [obra]", "qué luces hay entre columnas", "razonamiento del cotizador de [obra]", "qué secciones tienen las columnas". Lo que la documentación no declara sale como FALTA con nombre — nunca una medida típica ni un supuesto.',
        input_schema: {
          type: 'object',
          properties: {
            proyecto: { type: 'string', description: 'cliente, obra o proyecto cuyos planos hay que razonar (ej. "Quattropani")' },
          },
          required: ['proyecto'],
        },
      },
      async run(input) {
        const proyecto = String(input?.proyecto ?? '').trim()
        if (!proyecto) return { error: 'necesito de qué cliente u obra son los planos' }
        try {
          const r = await conCorridaExclusiva(`plano:${proyecto}`, () => correr({ query, google, termino: proyecto }))
          if (!r.documentos.planos.legibles.length) {
            return {
              error: `no encontré ningún plano que pueda abrir para «${proyecto}» en Drive`,
              resumen_texto: `Busqué «${proyecto}» en el índice de Drive: ${r.documentos.total} documentos, ninguno es un plano que pueda abrir.`,
            }
          }
          const rz = razonar(r)
          return {
            proyecto,
            planos: r.documentos.planos.legibles.map((d) => d.name),
            pasos: rz,
            llamadas_ia: r.ia.llamadas,
            resumen_texto: textoDeRazonamiento(rz, { proyecto }),
          }
        } catch (e) {
          return { error: `no pude razonar los planos de ${proyecto}: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
    'plano.cotizar': {
      capability: 'os.write',
      account: 'ecsas',
      // Acepta los ADJUNTOS del pedido y los procesa EN MEMORIA. XSAS no escribe en Drive por su
      // cuenta (decisión del dueño, 02/09/2026): el rastro persistente del adjunto es
      // `orq.xsas_adjunto` (bytes por actor+hash), y la genealogía del cómputo lo cita como
      // `adjunto:<hash>`. Subir algo a Drive es una acción aparte que sólo pide el dueño.
      adjuntos: true,
      schema: {
        name: 'analizar_planos_y_cotizar',
        description:
          'LEE LOS PLANOS de un cliente u obra en Drive, los INTERPRETA visualmente (láminas, vistas, cortes, cotas, planillas), CUENTA y MIDE los elementos, los mapea contra la Base Maestra de análisis de precios y devuelve una COTIZACIÓN BORRADOR con su cascada de precio. USALO cuando el dueño diga "analizá los planos de [cliente]", "armame una cotización de [obra]", "computá los planos de [X]", "¿cuánto sale [obra] según los planos?", "cotizame esta obra", "cotizame estos planos", "cotiza este proyecto", "empecemos a cotizar", "empezá a cotizar", "vamos a cotizar", "quiero cotizar esto", "arrancá la cotización", "presupuestame esta obra", "armame el presupuesto de esto". También acepta PLANOS ADJUNTOS: los procesa directamente en memoria, sin subirlos a Drive ni tocar carpetas. Cada cantidad queda trazada al documento del que salió (archivo de Drive o adjunto por hash), la lámina y el texto literal del plano. NUNCA inventa una medida: lo que el plano no dice sale como faltante con nombre propio. La cotización queda en BORRADOR — no crea obras, no toca cotizaciones existentes y no manda nada al cliente.',
        input_schema: {
          type: 'object',
          properties: {
            proyecto: { type: 'string', description: 'cliente, obra o proyecto cuyos planos hay que analizar (ej. "Quattropani", "San Francisco")' },
            numero: { type: 'string', description: 'número para la cotización borrador (opcional; se genera solo)' },
            conDrive: { type: 'boolean', description: 'sólo si el dueño pide EXPLÍCITAMENTE sumar los planos que ya están en Drive a los adjuntos. Por defecto false: con adjuntos se cotiza SOLO lo adjuntado.' },
          },
          required: ['proyecto'],
        },
      },
      async run(input) {
        const proyecto = String(input?.proyecto ?? '').trim()
        if (!proyecto) return { error: 'necesito de qué cliente u obra son los planos' }
        try {
          // Los adjuntos entran al pipeline EN MEMORIA — no se suben a Drive ni se indexan.
          // Su identidad es el hash del contenido (la misma del caché de interpretación) y sus
          // bytes ya persisten en `orq.xsas_adjunto`, así que la genealogía no pierde el origen.
          const archivos = Array.isArray(input?.archivos) ? input.archivos : []
          // ═══ CON ADJUNTOS, LOS ADJUNTOS SON LA DOCUMENTACIÓN (dueño, 02/09/2026) ═══
          // `proyecto` deja de ser un término de búsqueda y pasa a ser el RÓTULO de la obra: no se
          // consulta el índice de Drive ni se baja un solo archivo. Es lo que revierte el defecto
          // medido —«google download 404» con el plano adjunto en la mano— y también el riesgo más
          // caro: que el rótulo inferido arrastre la carpeta de OTRA obra al mismo cómputo.
          // Sumar Drive vuelve a ser posible, pero pedido explícitamente.
          const conDrive = input?.conDrive === true
          const soloAdjuntos = archivos.length > 0 && !conDrive
          const r = await conCorridaExclusiva(`plano:${proyecto}`, () => correr({ query, google, termino: proyecto, adjuntos: archivos, conDrive: soloAdjuntos ? false : (archivos.length ? true : null) }))
          if (!r.documentos.planos.legibles.length) {
            const noLegibles = r.documentos.planos.noLegibles
            const cad = noLegibles.length ? ` (${noLegibles.length} son DWG/CAD, que el OS no lee)` : ''
            return {
              error: soloAdjuntos
                ? `ninguno de los ${archivos.length} archivo(s) que adjuntaste es un plano que pueda abrir`
                : `no encontré ningún plano que pueda abrir para «${proyecto}» en Drive`,
              documentos_encontrados: r.documentos.total,
              planos_no_legibles: noLegibles.map((d) => d.name),
              resumen_texto: soloAdjuntos
                ? `Miré SÓLO los ${archivos.length} adjunto(s) —no busqué en Drive—: ninguno es un plano que pueda abrir${cad}.`
                : `Busqué «${proyecto}» en el índice de Drive: ${r.documentos.total} documentos, ninguno es un plano que pueda abrir${cad}.`,
            }
          }
          const { partidas, candidatas } = agruparPartidas(r.mapeo.mapeos)
          const cot = armar({
            cliente: r.laminas[0]?.proyecto?.propietario ?? null,
            obraNombre: r.laminas[0]?.proyecto?.nombre ?? proyecto,
            partidas, composiciones: r.composiciones, candidatas,
          })
          const numero = String(input?.numero ?? `COT-XSAS-${proyecto.toUpperCase().slice(0, 12).replace(/\s+/g, '-')}-${Date.now().toString(36).slice(-4)}`)
          // EL PASO A PASO ES LA GUÍA (dueño, 02/09 + «Presupuestos v5 · Lectura del plano»):
          // la lectura estructurada del plano PERSISTE con la cotización que derivó de ella,
          // para que la pantalla del presupuesto la muestre siempre — no sólo esta respuesta.
          const rz = razonar(r)
          const { cotizacionId } = await persistir({ query }, cot, {
            numero,
            notas: `generada por XSAS desde ${r.documentos.planos.legibles.map((d) => d.name).join(' + ')}`,
            razonamiento: rz,
          })
          const cascada = await cascadaDe({ query }, cotizacionId)
          return {
            cotizacion_id: cotizacionId,
            numero,
            // Campos de CONTRATO para la composición (A.output → B.input): el proyecto que se
            // cotizó y el cliente real del plano. Datos que ya existían; sólo se declaran.
            proyecto,
            cliente: cot.cliente ?? null,
            planos: r.documentos.planos.legibles.map((d) => d.name),
            planos_no_legibles: r.documentos.planos.noLegibles.map((d) => d.name),
            control: r.control ? { estado: r.control.estado, cobertura: r.control.cobertura, supuestos_ocultos: r.control.supuestosOcultos.length, preguntas: r.control.preguntas } : null,
            procesos_derivados: r.procesos ?? null,
            checklist: r.checklist ?? [],
            huella: r.huella ?? null,
            elementos_detectados: r.computo.detectados,
            elementos_computados: r.computo.computados,
            partidas: cot.partidas.length,
            sin_partida: cot.candidatas.length,
            faltantes: r.computo.items.filter((i) => i.cantidad === null).map((i) => ({ elemento: i.id, nombre: i.nombre, falta: i.faltan })),
            cascada,
            llamadas_ia: r.ia.llamadas,
            // La misma lectura, dos formas: la ESTRUCTURA para que la pantalla dibuje el paso a
            // paso completándose, el TEXTO para el chat. Ninguna se recalcula distinto.
            razonamiento: rz,
            razonamiento_texto: textoDeRazonamiento(rz, { proyecto }),
            planos_adjuntos: archivos.map((a) => a?.nombre).filter(Boolean),
            // Qué documentación miró esta corrida, dicho por ella misma: sin este campo, «cotizó
            // con lo adjuntado» y «cotizó con media carpeta de Drive» se leen igual.
            solo_adjuntos: r.soloAdjuntos === true,
            resumen_texto: resumen({ r, cot, cascada, numero })
              + (archivos.length ? `\n\n📎 ${archivos.length} adjunto(s) procesados en memoria — no se subió nada a Drive.` : ''),
          }
        } catch (e) {
          return { error: `no pude analizar los planos de ${proyecto}: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
