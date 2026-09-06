#!/usr/bin/env node
// ¿HUGGING FACE ESTÁ ATENDIENDO DE VERDAD? — la prueba del EFECTO, no del intento.
//
//   node orquestador/scripts/hf-produccion-humo.mjs            # replay + las filas que dejó
//   node orquestador/scripts/hf-produccion-humo.mjs --solo-leer # sólo lee la base, no llama a nadie
//
// ═══ POR QUÉ ESTE SCRIPT EXISTE Y NO ALCANZA CON UN TEST ═══
//
// Un test prueba que el PLAN dice «HF atiende». Eso es necesario y no es suficiente: entre el plan
// y la fila de `orq.chat_cost` hay un token, una red, un router que enruta a un proveedor de
// cómputo que puede estar frío, y un guardián de contenido que puede sacar a HF de la cadena. Lo
// único que prueba que HF atendió es la FILA, con su función, su latencia y sus tokens.
//
// El 05/09/2026 el estado declarado era «HF corre en sombra sobre tráfico real, verificado en la
// base». `select count(*) from orq.chat_cost where proveedor='huggingface'` daba CERO — y siempre
// había dado cero. La sombra estaba bien cableada; el pipeline que la dispara no corría desde el
// 28/08. Nadie mintió: nadie miró la tabla. Este script mira la tabla.
//
// ═══ LO QUE SE LE DA AL MODELO NO SE INVENTA ═══
//
// Los mensajes salen de `orq.xsas_mensaje` —lo que el dueño escribió de verdad— y el catálogo de
// especialistas de `orq.agents`. Un humo con frases escritas por mí mediría mi imaginación: las
// frases fáciles son las que uno inventa, y son justo las que no fallan.

import { query } from '../lib/db.mjs'
import { crearRazonadorDeRuteo } from '../comunicacion/razonar-ruteo.mjs'
import { completarArgumentos } from '../lib/xsas-argumentos.mjs'
import { textoONull } from '../lib/ia/gateway.mjs'
import { huggingface } from '../lib/ia/proveedores/huggingface.mjs'

const soloLeer = process.argv.includes('--solo-leer')
// La comparación cuesta una llamada a Claude por mensaje. Es opt-in: medir la calidad no puede
// convertirse en el gasto que la autonomía venía a evitar.
const comparar = process.argv.includes('--comparar')

/** Los especialistas vivos, en la forma que el Director le pasa al razonador. */
async function candidatos() {
  const r = await query(
    `select slug, coalesce(org_title, slug) titulo, coalesce(description, '') descripcion
       from orq.agents where enabled order by org_order nulls last, slug`)
  return r.rows.map((x) => ({ ...x, ejemplos: [] }))
}

/**
 * LOS MENSAJES REALES DE PERSONAS. Sin ellos no hay humo: se dice y se sale.
 *
 * `emisor = 'usuario'` y no `<> 'os'`: la primera versión decía `<> 'os'` y colaba las respuestas
 * del propio OS —emisor `xsas`—, que no son pedidos de nadie. Dos de las ocho «diferencias de
 * ruteo» que medí la primera vez eran eso: el modelo ruteando la respuesta que el OS ya había
 * dado. Un conjunto de prueba contaminado con la salida del sistema que se está midiendo es
 * exactamente el error que hace que un benchmark mienta a favor.
 */
async function mensajesReales(limite = 8) {
  const r = await query(
    `select distinct on (contenido) contenido, creado_en
       from orq.xsas_mensaje
      where emisor = 'usuario' and length(contenido) between 8 and 300
      order by contenido, creado_en desc limit $1`, [limite])
  return r.rows
}

/**
 * CALIDAD >= LÍNEA DE BASE, MEDIDA — no afirmada.
 *
 * No existe una «verdad» independiente de a qué especialista va cada mensaje: la decide el negocio
 * y nadie la escribió. Lo que SÍ existe es el incumbente: Claude venía ruteando. Entonces lo que se
 * mide es COINCIDENCIA con el incumbente sobre los MISMOS mensajes reales, y se dice que es eso.
 *
 * Es una medida débil y hay que decir por qué: si Claude rutea mal, coincidir con él es coincidir
 * en el error. Sirve para detectar una degradación grosera, no para declarar que el ruteo es bueno.
 */
async function humoDeRuteo({ comparar = false } = {}) {
  const [lista, mensajes] = await Promise.all([candidatos(), mensajesReales()])
  if (!mensajes.length) return { corrio: false, porQue: 'no hay mensajes reales de personas en orq.xsas_mensaje' }
  const razonar = crearRazonadorDeRuteo()
  if (!razonar) return { corrio: false, porQue: 'no hay razonador: ni token de HF ni clave de Anthropic' }
  const salidas = []
  for (const m of mensajes) {
    const t0 = Date.now()
    const slug = await razonar(m.contenido, lista)
    const fila = { mensaje: m.contenido.slice(0, 60), slug: slug ?? '—', ms: Date.now() - t0 }
    if (comparar) fila.claude = (await conClaude(m.contenido, lista)) ?? '—'
    salidas.push(fila)
  }
  const comparadas = salidas.filter((s) => s.claude)
  return {
    corrio: true,
    salidas,
    coincidencia: comparadas.length
      ? `${comparadas.filter((s) => s.slug === s.claude).length}/${comparadas.length}`
      : null,
  }
}

/** El mismo ruteo, forzado a Claude. Se usa SÓLO como línea de base de la comparación. */
async function conClaude(texto, lista) {
  const detalle = lista.map((c) => `- ${c.slug}: ${c.titulo} — ${c.descripcion}`).join('\n')
  const r = await textoONull({
    // Una tarea que no está en `MODO_POR_TAREA` está APAGADA para HF: es la forma de pedir Claude
    // sin agregar una escotilla que después alguien use en producción.
    tarea: 'linea-de-base-de-ruteo', dominio: 'intenciones', calidad: 'simple',
    mensajes: [{ role: 'user', content: `Especialistas:\n${detalle}\n\nMensaje: ${texto}\n\nRespondé ÚNICAMENTE el slug, o NINGUNO.` }],
    maxTokens: 24, agente: 'director', funcion: 'rutear:linea-de-base',
  })
  const s = String(r.texto ?? '').trim().toLowerCase()
  return lista.some((c) => c.slug === s) ? s : null
}

/**
 * COMPLETAR ARGUMENTOS, con una herramienta REAL del OS.
 *
 * No se ejecuta ninguna herramienta: se le pide al modelo que copie de la frase el valor de un
 * parámetro que la herramienta declara, que es exactamente lo que hace en producción. Ejecutarla
 * acá convertiría un humo en una escritura.
 */
async function humoDeArgumentos() {
  const { obraTools } = await import('../lib/tools/obra.mjs').catch(() => ({}))
  const reg = typeof obraTools === 'function' ? (() => { try { return obraTools({}) } catch { return {} } })() : {}
  const tool = Object.values(reg).find((t) => Object.keys(t?.schema?.input_schema?.properties ?? {}).length)
  if (!tool) return { corrio: false, porQue: 'no se pudo construir una herramienta real con parámetros' }
  const falta = Object.keys(tool.schema.input_schema.properties).slice(0, 1)
  const r = await completarArgumentos({
    llm: async (o) => (await textoONull({
      tarea: 'completar-argumentos', dominio: 'intenciones', calidad: o.capacidad,
      sistema: o.sistema, mensajes: o.mensajes, maxTokens: o.maxTokens,
      agente: o.agente, funcion: o.funcion, datosNoConfiables: 'cotizá los planos de Quattropani',
    })).texto,
    texto: 'cotizá los planos de Quattropani',
    tool, args: {}, falta,
  })
  return { corrio: true, herramienta: tool.schema.name, pedido: falta, args: r.args, falta: r.falta }
}

/** LO QUE QUEDÓ EN LA BASE. Es la única evidencia que vale. */
async function filas() {
  const r = await query(
    `select proveedor, funcion, agente, model, ok, error_kind, ms, tokens_in, tokens_out,
            to_char(ts, 'YYYY-MM-DD HH24:MI:SS') ts
       from orq.chat_cost
      where proveedor = 'huggingface' order by ts desc limit 25`)
  const tot = await query(
    `select proveedor, ok, count(*)::int n from orq.chat_cost
      where ts > now() - interval '1 day' group by 1,2 order by n desc`)
  return { ultimas: r.rows, hoy: tot.rows }
}

const main = async () => {
  console.log(`token de HF: ${huggingface.configurado() ? 'presente' : 'AUSENTE'}`)
  if (!soloLeer) {
    const ruteo = await humoDeRuteo({ comparar })
    console.log('\n── RUTEO (mensajes reales del dueño, replay por el camino de producción) ──')
    if (!ruteo.corrio) console.log(`  no corrió: ${ruteo.porQue}`)
    else {
      for (const s of ruteo.salidas) {
        console.log(`  ${String(s.ms).padStart(5)} ms  ${s.slug.padEnd(20)}${s.claude ? ` (claude: ${s.claude.padEnd(20)})` : ''} ← «${s.mensaje}»`)
      }
      if (ruteo.coincidencia) console.log(`  coincidencia con la línea de base (Claude): ${ruteo.coincidencia}`)
    }

    const args = await humoDeArgumentos()
    console.log('\n── COMPLETAR ARGUMENTOS (herramienta real del OS) ──')
    console.log(args.corrio ? `  ${args.herramienta} · pedido ${JSON.stringify(args.pedido)} → ${JSON.stringify(args.args)} · falta ${JSON.stringify(args.falta)}`
      : `  no corrió: ${args.porQue}`)
  }
  const f = await filas()
  console.log('\n── LO QUE QUEDÓ EN orq.chat_cost (proveedor = huggingface) ──')
  if (!f.ultimas.length) console.log('  NINGUNA FILA. HF no atendió nada: no hay evidencia de efecto.')
  else console.table(f.ultimas)
  console.log('\n── ÚLTIMAS 24 h, por proveedor ──')
  console.table(f.hoy)
  process.exit(0)
}

main().catch((e) => { console.error('humo: falló —', e?.message ?? e); process.exit(1) })
