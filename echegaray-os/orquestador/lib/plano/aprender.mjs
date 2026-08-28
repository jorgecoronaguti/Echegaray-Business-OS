// LO QUE DEJA UNA COTIZACIÓN COMPARADA — conocimiento con CONDICIÓN, no con nombre propio.
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO ═══
//
// «Quattropani → usar la partida X» no es un aprendizaje: es una respuesta memorizada que no sirve
// para el plano siguiente y que además es peligrosa, porque el próximo galpón no es éste. Un
// aprendizaje útil dice CUÁNDO se aplica: «si el elemento no declara espesor y la partida candidata
// lo declara en su nombre, no son la misma cosa». Esa frase sirve para cualquier obra y se puede
// contrastar.
//
// Por eso cada aprendizaje que sale de acá tiene `condicion` —la señal observable que lo dispara— y
// `porQue` —la evidencia medida que lo respalda—. Sin las dos no se emite.
//
// ═══ POR QUÉ NO HAY MEMORIA NUEVA ═══
//
// El aprendizaje va a `public.conocimiento_empresa`, que es donde ya vive todo lo que la empresa
// aprendió, con su `tipo` (HECHO · INFERENCIA · CANDIDATO · VALIDADO · DESCARTADO) y su `clave`
// única. La gobernanza tampoco se toca: `obra-plan-real.mjs` ya dice que un caso aislado entra como
// CANDIDATO y que hacen falta dos casos comparables de OBRAS DISTINTAS para VALIDADO. Una obra no
// valida nada, por más que la comparación contra su histórico haya salido bien.

/** Un aprendizaje candidato. `condicion` es lo que lo dispara; `nombresPropios` viaja aparte y sólo
 *  como evidencia — nunca dentro de la afirmación. */
export function aprendizaje({ clave, condicion, afirmacion, porQue, evidencia = {}, area = 'cotizacion' }) {
  return Object.freeze({ clave, condicion, afirmacion, porQue, evidencia, area, tipo: 'CANDIDATO' })
}

const money = (n) => `$ ${Math.round(Number(n ?? 0)).toLocaleString('es-AR')}`

/**
 * LOS APRENDIZAJES QUE SALEN DE UNA COMPARACIÓN. PURA.
 *
 * No emite uno por cada diferencia: eso sería copiar el diff a la base. Emite uno por cada PATRÓN
 * que la comparación demuestra, con la cantidad de casos que lo sostienen. Un patrón que aparece
 * una sola vez se emite igual —es un candidato— pero dice que apareció una sola vez.
 */
export function aprendizajesDe(comp, { proyecto = null, obra = null } = {}) {
  const out = []
  const d = comp?.diferencias ?? []

  // ── 1. EL ALCANCE NO ESTÁ EN EL PLANO ──
  const sobran = d.filter((x) => x.tipo === 'sobra_en_v0')
  if (sobran.length) {
    out.push(aprendizaje({
      clave: 'plano-cotizacion:alcance-no-esta-en-el-plano',
      condicion: 'se pide cotizar a partir de planos y el pedido no declara el alcance (mano de obra sola o con materiales, qué sectores entran, qué se excluye)',
      afirmacion: 'El alcance de una cotización NO se deduce de un plano. Un plano dibuja todo lo que se va a construir; una oferta cubre lo que se acordó cubrir. Sin alcance declarado, el cómputo de un plano es un TECHO —lo máximo que podría entrar— y no una oferta. Antes de cotizar hay que preguntar: ¿mano de obra sola o con materiales? ¿qué sectores quedan afuera?',
      porQue: `${sobran.length} partida(s) por ${money(sobran.reduce((a, x) => a + (x.v0?.subtotal ?? 0), 0))} que XSAS computó del plano y el histórico no cotizó`,
      evidencia: { proyecto, obra, partidas: sobran.map((x) => ({ codigo: x.codigo, descripcion: x.descripcion, subtotal: x.v0?.subtotal })) },
    }))
  }

  // ── 2. HAY PARTIDAS QUE NO SON ELEMENTOS DIBUJADOS ──
  const noVistas = d.filter((x) => x.tipo === 'falta_en_v0' && x.causa?.clave === 'interpretacion_del_plano')
  if (noVistas.length) {
    out.push(aprendizaje({
      clave: 'plano-cotizacion:tareas-de-proceso-no-se-dibujan',
      condicion: 'se computa una obra a partir de sus elementos dibujados',
      afirmacion: 'Un cómputo hecho SÓLO de elementos dibujados pierde sistemáticamente las tareas de proceso, que ningún plano dibuja porque no son objetos: replanteo, excavación, hormigón de limpieza, capa aisladora, compactación, retiro de escombros, limpieza final. No se leen del plano — se DERIVAN de otras partidas (el replanteo sale de la superficie cubierta, la excavación del volumen de bases y vigas de fundación, el hormigón de limpieza de la superficie de las bases). Mientras el motor no tenga esas derivaciones, un presupuesto salido de un plano está incompleto por diseño, no por error de lectura.',
      porQue: `${noVistas.length} partida(s) del histórico que XSAS no identificó como elemento en ninguna lámina: ${noVistas.map((x) => x.codigo).join(', ')}`,
      evidencia: { proyecto, obra, partidas: noVistas.map((x) => ({ codigo: x.codigo, descripcion: x.descripcion, subtotal: x.historico?.subtotal })) },
    }))
  }

  // ── 3. UNA PARTIDA QUE DECLARA UNA DIMENSIÓN NO ES UNA PARTIDA GENÉRICA ──
  const porDimension = d.filter((x) => x.tipo === 'sobra_en_v0' && /\b\d+\s?(cm|mm|m)\b|e\s?=\s?0?[.,]\d/i.test(String(x.descripcion ?? '')))
  if (porDimension.length) {
    out.push(aprendizaje({
      clave: 'plano-cotizacion:partida-con-dimension-en-el-nombre',
      condicion: 'el elemento leído del plano NO declara su espesor/sección y la partida candidata SÍ lo declara en su nombre (PLATEA 50CM, CONTRAPISO e=0,10 m, MURO e=0,20)',
      afirmacion: 'Cuando la partida lleva una dimensión en el nombre y el elemento del plano no la declara, NO son la misma cosa: la partida está afirmando un espesor que nadie leyó, y ese espesor es casi todo el costo. Corresponde PARTIDA_CANDIDATA y preguntar el espesor, no elegir la partida y arrastrar su dimensión.',
      porQue: `${porDimension.length} caso(s) medido(s), el mayor por ${money(Math.max(...porDimension.map((x) => x.v0?.subtotal ?? 0)))}`,
      evidencia: { proyecto, obra, partidas: porDimension.map((x) => ({ codigo: x.codigo, descripcion: x.descripcion, subtotal: x.v0?.subtotal })) },
    }))
  }

  // ── 4. LO QUE NO SE PUDO ABRIR ──
  const porDoc = d.filter((x) => x.causa?.clave === 'documentacion_faltante')
  if (porDoc.length) {
    out.push(aprendizaje({
      clave: 'plano-cotizacion:elemento-detectado-sin-medida',
      condicion: 'XSAS detecta un elemento en el plano, lo especifica bien, y no puede medirlo ni contarlo después de la segunda pasada',
      afirmacion: 'Un elemento detectado y no medido NO es un elemento que falta: es una pregunta concreta y corta para el proyectista o para el DWG. Vale más entregar esa lista —«¿cuántas correas C140 y de qué largo?»— que completar el número. La lista de huecos es un entregable de la cotización, no un residuo.',
      porQue: `${porDoc.length} partida(s) del histórico cuyo elemento XSAS sí vio pero no pudo medir`,
      evidencia: { proyecto, obra, partidas: porDoc.map((x) => ({ codigo: x.codigo, detalle: x.detalle })) },
    }))
  }

  // ── 5. EL DESVÍO TOTAL, COMO HECHO MEDIDO ──
  if (comp?.desvioTotalPct !== null && comp?.desvioTotalPct !== undefined) {
    out.push(aprendizaje({
      clave: 'plano-cotizacion:desvio-primera-cotizacion-automatica',
      condicion: 'se mide una cotización generada por XSAS desde planos contra la cotización que hizo una persona para la misma obra',
      afirmacion: `Una cotización generada sólo desde planos, sin alcance declarado y sin las tareas derivadas, quedó ${comp.desvioTotalPct > 0 ? 'por encima' : 'por debajo'} del histórico en ${Math.abs(comp.desvioTotalPct)} % del costo directo, con ${comp.partidasV0} partidas contra ${comp.partidasHistorico}. La cercanía del total NO significa que el cómputo esté bien: son omisiones y excesos que se compensan, y por partida las diferencias son mucho mayores que el total.`,
      porQue: `V0 ${money(comp.totalV0)} contra histórico ${money(comp.totalHistorico)} · ${comp.diferencias.length} diferencias clasificadas`,
      evidencia: { proyecto, obra, porCausa: comp.porCausa, coincidentes: comp.coincidentes },
    }))
  }
  return out
}

/**
 * LOS APRENDIZAJES QUE DEJA HABER ABIERTO LA DOCUMENTACIÓN. PURA.
 *
 * No salen de comparar contra un histórico —para eso está `aprendizajesDe`— sino de MEDIR la propia
 * corrida: cuántas vistas tenía la lámina, cuántos bloques tenía el CAD, cuánto subió lo detectado
 * al leer por vistas. Cada uno se emite SÓLO si la corrida lo demuestra, con el número medido
 * adentro del `porQue`, y ninguno menciona el proyecto en la afirmación: la condición es la señal
 * observable que lo dispara en cualquier obra.
 */
export function aprendizajesDeIngesta(r, { proyecto = null } = {}) {
  const out = []
  const seg = (r?.documental?.segmentaciones ?? []).flatMap((s) => s.laminas)
  const porTitulos = seg.filter((l) => l.metodo === 'TITULOS')
  if (porTitulos.length) {
    const regiones = porTitulos.reduce((a, l) => a + l.regiones.length, 0)
    out.push(aprendizaje({
      clave: 'xsas:lamina-cad-se-segmenta-por-titulos',
      area: 'computo',
      condicion: 'una lámina viene de un PDF exportado de CAD y hay que separar sus vistas',
      afirmacion: 'Una lámina exportada de CAD NO se puede partir en sus vistas por espacio en blanco: el marco, las líneas de cota y los llamados conectan todos los dibujos entre sí, y agrupar por cercanía devuelve una sola región que tapa la hoja entera. Se separa por los TÍTULOS que el propio proyectista escribió al pie de cada vista, que son los textos de mayor cuerpo de la lámina y llevan vocabulario de vista (planta, corte, detalle, estructura). El título sin el cuerpo de letra agarra cada «ver detalle» del dibujo; el cuerpo sin el título agarra el número de plano.',
      porQue: `${porTitulos.length} lámina(s) segmentadas por título dieron ${regiones} vistas; el mismo material agrupado por espacio en blanco daba 1 por lámina, con cualquier holgura`,
      evidencia: { proyecto, laminas: porTitulos.map((l) => ({ regiones: l.regiones.length, titulos: l.regiones.map((x) => x.titulo).slice(0, 12) })) },
    }))
  }
  if ((r?.porRegion ?? []).length && r?.computo?.detectados) {
    out.push(aprendizaje({
      clave: 'xsas:leer-por-vistas-revela-lo-que-la-lamina-entera-esconde',
      area: 'computo',
      condicion: 'se computa una obra mirando la lámina completa en vez de cada vista por separado',
      afirmacion: 'Mirar la lámina entera subestima el cómputo y no se nota: a la resolución en que entra una lámina A1, un símbolo de 8 mm ocupa cuatro píxeles y los elementos chicos directamente no se ven. Leer VISTA POR VISTA, recortada y ampliada, multiplica los elementos detectados. La cobertura RELATIVA puede bajar al hacerlo, y eso no es un retroceso: es que aparece lo que faltaba y antes no se contaba en el denominador.',
      porQue: `leer por vistas detectó ${r.computo.detectados} elementos en ${r.porRegion.length} vistas y computó ${r.computo.computados}`,
      evidencia: { proyecto, vistas: r.porRegion.length, detectados: r.computo.detectados, computados: r.computo.computados },
    }))
  }
  const cad = r?.medicionCad
  if (cad && cad.bloquesDisponibles !== undefined) {
    out.push(aprendizaje({
      clave: 'xsas:el-conteo-de-bloques-cad-sirve-si-la-estructura-usa-bloques',
      area: 'computo',
      condicion: 'el proyecto trae un DWG/DXF y hay elementos sin cantidad',
      afirmacion: 'Contar los INSERT de un bloque resuelve una cantidad de forma exacta y sin costo, pero SÓLO sirve si la pieza está dibujada como bloque. Hay proyectos donde la estructura se dibuja con líneas sueltas y los únicos bloques son los artefactos sanitarios y los símbolos de acotación: ahí el CAD aporta cotas y capas, no cantidades. Antes de esperar que el CAD resuelva el conteo hay que mirar QUÉ bloques tiene, y si son de mobiliario o de anotación, la cantidad sigue faltando.',
      porQue: `el CAD del proyecto tenía ${cad.bloquesDisponibles} bloque(s) con nombre propio y ${cad.cotas} cota(s) medidas; el conteo de bloques resolvió ${cad.resueltos.length} elemento(s)`,
      evidencia: { proyecto, bloques: cad.bloquesDisponibles, cotas: cad.cotas, resueltos: cad.resueltos.length },
    }))
  }
  if ((r?.proyecto?.conflictos ?? []).length) {
    out.push(aprendizaje({
      clave: 'xsas:cruzar-documentos-produce-conflictos-que-hay-que-declarar',
      area: 'computo',
      condicion: 'un proyecto trae más de un documento que habla de lo mismo (dos CAD, plano y memoria, pliego y planilla)',
      afirmacion: 'Cruzar la documentación de un proyecto SIEMPRE produce contradicciones, y son información: dos CAD del mismo edificio con conteos distintos del mismo bloque, o un pliego que asigna dos materiales al mismo rubro. Ninguna se resuelve eligiendo la fuente de más peso — el peso sirve para saber a quién preguntarle primero. Un conflicto sin resolver deja la cotización INCOMPLETA, porque el precio de esa partida no está determinado.',
      porQue: `${r.proyecto.conflictos.length} conflicto(s) entre documentos del mismo proyecto`,
      evidencia: { proyecto, conflictos: r.proyecto.conflictos.map((c) => ({ que: c.que, versiones: c.versiones?.map((v) => `${v.clase}:${v.valor}`) })).slice(0, 10) },
    }))
  }
  return out
}

/**
 * ESCRIBIRLOS. Siempre CANDIDATO: es la primera obra que atraviesa este circuito y la gobernanza
 * de `obra-plan-real.mjs` exige dos casos comparables de obras distintas para VALIDADO. Que la
 * comparación contra un histórico haya salido parecida no valida nada — el histórico es UN caso.
 */
export async function persistirAprendizajes({ query }, aprendizajes = [], { fuente = 'xsas:plano-cotizacion' } = {}) {
  const escritos = []
  for (const a of aprendizajes) {
    await query(
      `insert into public.conocimiento_empresa (area, afirmacion, clave, confianza, tipo, fuente, evidencia, veces_confirmado)
            values ($1, $2, $3, 'media', 'CANDIDATO', $4, $5, 1)
       on conflict (clave) do update set
         afirmacion = excluded.afirmacion, evidencia = excluded.evidencia,
         veces_confirmado = public.conocimiento_empresa.veces_confirmado + 1,
         updated_at = now(), vigente = true`,
      [a.area, a.afirmacion, a.clave, fuente, JSON.stringify({ condicion: a.condicion, porQue: a.porQue, ...a.evidencia })])
    escritos.push(a.clave)
  }
  return escritos
}
