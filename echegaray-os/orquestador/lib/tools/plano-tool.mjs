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
import { agruparPartidas, armar, persistir, cascadaDe } from '../plano/cotizacion-v0.mjs'
import { subirPlanosAlProyecto } from '../plano/adjuntos.mjs'
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
    `📐 ${r.documentos.planos.legibles.length} plano(s) interpretados de ${r.documentos.total} documentos en Drive` +
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
          const r = await correr({ query, google, termino: proyecto })
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
      // Acepta los ADJUNTOS del pedido: un plano que llega por /xsas se sube al Drive del proyecto
      // y se indexa ANTES de correr el pipeline — mismo camino, misma genealogía (ver
      // `lib/plano/adjuntos.mjs`). El gateway sólo pasa adjuntos a tools que lo declaran acá.
      adjuntos: true,
      schema: {
        name: 'analizar_planos_y_cotizar',
        description:
          'LEE LOS PLANOS de un cliente u obra en Drive, los INTERPRETA visualmente (láminas, vistas, cortes, cotas, planillas), CUENTA y MIDE los elementos, los mapea contra la Base Maestra de análisis de precios y devuelve una COTIZACIÓN BORRADOR con su cascada de precio. USALO cuando el dueño diga "analizá los planos de [cliente]", "armame una cotización de [obra]", "computá los planos de [X]", "¿cuánto sale [obra] según los planos?", "cotizame esta obra", "cotizame estos planos", "cotiza este proyecto". También acepta PLANOS ADJUNTOS: los sube al Drive del proyecto, los indexa y recién entonces cotiza, para que cada cantidad quede trazada a un archivo real. Cada cantidad queda trazada al archivo de Drive, la lámina y el texto literal del plano del que salió. NUNCA inventa una medida: lo que el plano no dice sale como faltante con nombre propio. La cotización queda en BORRADOR — no crea obras, no toca cotizaciones existentes y no manda nada al cliente.',
        input_schema: {
          type: 'object',
          properties: {
            proyecto: { type: 'string', description: 'cliente, obra o proyecto cuyos planos hay que analizar (ej. "Quattropani", "San Francisco")' },
            numero: { type: 'string', description: 'número para la cotización borrador (opcional; se genera solo)' },
          },
          required: ['proyecto'],
        },
      },
      async run(input) {
        const proyecto = String(input?.proyecto ?? '').trim()
        if (!proyecto) return { error: 'necesito de qué cliente u obra son los planos' }
        try {
          // Los adjuntos primero aterrizan en Drive + índice; el pipeline después los encuentra por
          // el MISMO término que cualquier plano histórico. Un error de subida no aborta: se declara.
          let subida = null
          const archivos = Array.isArray(input?.archivos) ? input.archivos : []
          if (archivos.length) {
            subida = await subirPlanosAlProyecto({ query, google }, proyecto, archivos)
            if (!subida.subidos.length) {
              return {
                error: `no pude subir ningún adjunto al Drive de «${proyecto}»: ${subida.errores.join(' · ')}`,
                resumen_texto: `Recibí ${archivos.length} adjunto(s) para cotizar «${proyecto}» pero no pude dejar ninguno en Drive: ${subida.errores.join(' · ')}. Sin el archivo en Drive no hay genealogía, así que no cotizo a ciegas.`,
              }
            }
          }
          const r = await correr({ query, google, termino: proyecto })
          if (!r.documentos.planos.legibles.length) {
            return {
              error: `no encontré ningún plano que pueda abrir para «${proyecto}» en Drive`,
              documentos_encontrados: r.documentos.total,
              planos_no_legibles: r.documentos.planos.noLegibles.map((d) => d.name),
              resumen_texto: `Busqué «${proyecto}» en el índice de Drive: ${r.documentos.total} documentos, ninguno es un plano que pueda abrir${r.documentos.planos.noLegibles.length ? ` (${r.documentos.planos.noLegibles.length} son DWG/CAD, que el OS no lee)` : ''}.`,
            }
          }
          const { partidas, candidatas } = agruparPartidas(r.mapeo.mapeos)
          const cot = armar({
            cliente: r.laminas[0]?.proyecto?.propietario ?? null,
            obraNombre: r.laminas[0]?.proyecto?.nombre ?? proyecto,
            partidas, composiciones: r.composiciones, candidatas,
          })
          const numero = String(input?.numero ?? `COT-XSAS-${proyecto.toUpperCase().slice(0, 12).replace(/\s+/g, '-')}-${Date.now().toString(36).slice(-4)}`)
          const { cotizacionId } = await persistir({ query }, cot, {
            numero,
            notas: `generada por XSAS desde ${r.documentos.planos.legibles.map((d) => d.name).join(' + ')}`,
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
            planos_subidos: subida ? subida.subidos : [],
            resumen_texto: resumen({ r, cot, cascada, numero })
              + (subida ? `\n\n📎 ${subida.subidos.length} adjunto(s) quedaron en Drive («${subida.carpetaPath}»)${subida.errores.length ? ` · ${subida.errores.length} no se pudieron subir: ${subida.errores.join(' · ')}` : ''}` : ''),
          }
        } catch (e) {
          return { error: `no pude analizar los planos de ${proyecto}: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
