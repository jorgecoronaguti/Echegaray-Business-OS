// LA CARTERA DE LA ENTRADA — el cliente, y sus obras en ejecución COLGANDO de él.
//
// ═══ POR QUÉ NO ES LA MISMA TABLA QUE `/clientes` (00 · Home Navegación v2) ═══
//
// Hasta el 24/08 esta mitad de la pantalla dibujaba `ListaClientes`, la cartera del canónico 25, con
// el argumento de que dos tablas del mismo maestro se contradicen. El mockup v2 dibuja otra cosa: la
// obra en ejecución es una FILA propia, indentada bajo su cliente y compartiendo sus columnas
// —contratado es plata en las dos, últ. mov. es una fecha en las dos—. Eso no es la cartera de
// clientes con una columna más: es la jerarquía del criterio 4 del patrón («jerarquía por
// indentación, no por contenedores»), y con ella la pregunta que contesta la pantalla cambia de
// «qué clientes tengo» a «qué le estoy ejecutando a cada uno».
//
// El maestro sigue viviendo en `/clientes`, con su alta, su archivado y su panel. Acá no se
// administra nada: se mira y se entra.
//
// ═══ CERO N+1 ═══
//
// Cuatro lecturas para TODA la cartera, ninguna por fila: los clientes, las obras `activa` de
// todos, el último parte de cada obra y los certificados de todas. Las cuatro salen en la MISMA
// tanda que los conteos de la barra. Una consulta por cliente serían cinco viajes hoy y treinta el
// día que la empresa crezca, que es exactamente cómo una pantalla de entrada se vuelve inusable.
//
// ═══ LO QUE NO SE INVENTA ═══
//
// · `avance_pct` en `null` NO es 0 %: no hay barra y la celda dice «sin medir».
// · `monto_contratado` en `null` NO es $ 0: dice «sin contrato», en ámbar, porque eso SÍ es trabajo.
// · `jefe_obra` en `null` dice «sin jefe»: medido el 25/08, 13 de las 14 obras activas no lo tienen.
// · El estado de certificación sale de `certificados`, que hoy está VACÍA (0 filas, medido el
//   25/08 con la clave de servicio). Con la tabla vacía toda obra dice «sin certificar», que es
//   cierto —no hay ninguno cargado—; si la LECTURA falla, dice «sin leer», que es otra cosa.
// · «vencido 12 d» del mockup NO se dibuja: ninguna tabla guarda el vencimiento de un certificado.
//   `certificados` tiene fecha de certificación, de facturación y de cobranza, y ninguna es un
//   plazo. Un «vencido» calculado sobre una fecha que no es la de vencimiento es un dato inventado.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientePanel } from '@/features/clientes/types'
import { avisoDeDatos } from '../../clientes/services/cartera.ts'
import { chipsDeCliente, leFaltaUnDato, margenDeLaFila, type Chip } from '../../clientes/services/chipsCartera.ts'
import { margenPct, sumaConHuecos, type EconomiaDeObra } from '../../clientes/services/economiaObras.ts'
import type { EconomiaDeCliente } from '../../clientes/services/economiaCliente.ts'

/** Una obra `activa`, tal como la lee la cartera. Es un subconjunto de `obra_panel`. */
export interface ObraDeCartera {
  obra_id: string
  nombre: string
  cliente_id: string | null
  avance_pct: number | null
  jefe_obra: string | null
}

/** El certificado más avanzado de una obra, ya resuelto a una frase. */
export interface EstadoCertificacion {
  texto: string
  /** `true` cuando lo que dice reclama trabajo: se pinta en ámbar. */
  reclama: boolean
}

export interface ObraEnCurso {
  obra_id: string
  nombre: string
  avance: number | null
  jefe: string | null
  /** Lo que OBRAS publica: contratado de la OC de Cobranzas. `null` = «sin precio en OBRAS». */
  contratado: number | null
  costoMo: number | null
  costoMateriales: number | null
  margen: number | null
  margenPct: number | null
  certificacion: EstadoCertificacion
  /** El último parte de la obra, `YYYY-MM-DD`. `null` = ninguno registrado. */
  /** LO COBRADO DE ESTA OBRA, criterio PERCIBIDO (`obra_cobranza`). `null` = ninguna cobranza
   *  imputada a la obra, que NO es «no cobró»: hoy Cobranzas anota el cobro contra el cliente. */
  cobrado: number | null
}

export interface ClienteEnCartera {
  cliente_id: string
  slug: string | null
  nombre: string
  /** Qué le falta al maestro. `null` = nada. */
  aviso: string | null
  /**
   * ¿TIENE UN CONTRATO CARGADO? Sale de `cliente_documento.rol = 'contrato'` y NO del monto: son
   * dos conceptos y hasta el 09/09/2026 la pantalla los decía con la misma palabra. `null` = no se
   * pudo leer la tabla de documentos, y entonces la fila NO dice «sin contrato».
   */
  tieneContrato: boolean | null
  /** Lo que le falta al MAESTRO, ya resuelto a chips. La fila no vuelve a decidir nada. */
  chips: Chip[]
  /**
   * ¿LE FALTA ALGO DEL MAESTRO QUE FRENA EL COBRO? CUIT, teléfono o el contrato SIN CARGAR
   * (`chipsCartera.leFaltaUnDato`). Es el mismo conjunto que dibuja los chips de la fila y el mismo
   * que recorta el filtro «Datos faltantes»: una sola cuenta, para que el contador del filtro no
   * pueda decir 4 mientras la tabla muestra 3.
   *
   * EL PRECIO FALTANTE NO ENTRA. Un hueco de OBRAS se resuelve en el Sheet, no en la ficha; era lo
   * que metía a Messina —con $156M publicados— en la lista de «datos faltantes».
   */
  faltaUnDato: boolean
  obras: number
  /**
   * LO CONTRATADO DE SUS OBRAS EN CURSO, de `cliente_economia.contratado_en_curso` — la vista, no
   * una suma hecha acá. `null` = ninguna obra en curso tiene precio en OBRAS, o no se pudo leer.
   */
  contratado: number | null
  /** Lo contratado de TODAS sus obras no fusionadas (`cliente_economia.contratado`), incluidas las
   *  cerradas. Es el denominador de la barra de cobro: lo cobrado del cliente no distingue obra. */
  contratadoTotal: number | null
  costoMo: number | null
  costoMateriales: number | null
  margen: number | null
  margenPct: number | null
  /** `true` cuando alguna obra en curso no tiene precio en OBRAS: el total suma sólo las que sí. */
  economiaParcial: boolean
  /**
   * LO COBRADO DEL CLIENTE, ACUMULADO Y SIN IVA (`cliente_economia.cobrado_neto_total`).
   *
   * NO es la suma de `obra_cobranza` de sus obras en curso, que es lo que era hasta el 10/09/2026 y
   * daba `null` en TODAS las filas: `cobranzas.obra_cliente` guarda una etiqueta de CLIENTE, no de
   * obra, así que casi ninguna cobranza llega a una obra. El cobro del cliente sí existe y sale de
   * `cliente_id`.
   *
   * SIN IVA porque lo contratado tampoco lo lleva: restar o dividir bruto contra neto daría clientes
   * que cobraron más de lo que contrataron.
   */
  cobrado: number | null
  /** `contratado (todas) − cobrado neto`. `null` si falta cualquiera de los dos. */
  pendienteContractual: number | null
  enCurso: ObraEnCurso[]
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LAS LECTURAS
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * LAS OBRAS EN EJECUCIÓN DE TODA LA CARTERA, EN UNA CONSULTA.
 *
 * `estado = 'activa'` y no `estado <> 'cerrada'`: MEDIDO el 24/08/2026 contra la base, la suma de
 * `cliente_panel.n_obras_activas` coincide con las obras en `activa`, no con las que no están
 * cerradas. Con el otro criterio, la fila del cliente y las filas de abajo se contradirían.
 *
 * Un fallo devuelve `null` —no un mapa vacío—: «no pude leer las obras» y «este cliente no tiene
 * ninguna en ejecución» son dos cosas distintas y la pantalla las dice distinto.
 */
export async function getObrasDeLaCartera(
  supabase: SupabaseClient,
): Promise<ObraDeCartera[] | null> {
  // SIN `monto_contratado` (H1, 10/09/2026). El precio de la obra sale de `obra_economia_cartera` y
  // de ninguna otra parte: mientras esta consulta lo siguiera trayendo, iba a volver a usarse como
  // respaldo y las dos definiciones seguirían vivas. Lo que se deja de pedir no se puede volver a
  // colar.
  const { data, error } = await supabase
    .from('obra_panel')
    .select('obra_id, nombre, cliente_id, avance_pct, jefe_obra')
    .eq('estado', 'activa')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })
  if (error) return null
  return (data ?? []) as ObraDeCartera[]
}

/**
 * LO COBRADO POR OBRA — `public.obra_cobranza`, criterio PERCIBIDO y UNA sola fuente.
 *
 * La vista ya decide qué está cobrado (`estado = 'cobrado'` y `fecha_cobro <= hoy`) y ata cada fila
 * de Cobranzas a su obra por `obra_alias`. Acá no se vuelve a decidir nada: recalcular el criterio
 * en la pantalla es cómo nacen dos definiciones de «cobrado».
 *
 * LA VISTA LLEVA `WHERE ve_economia()`: al jefe de obra le devuelve CERO FILAS, no un error. Por eso
 * un mapa vacío no significa «nadie cobró nada» y la pantalla, además, no ofrece la celda cuando el
 * rol no ve economía — no ofrecer lo que la base va a negar.
 *
 * `null` = la lectura falló, que no es lo mismo que «no hay cobranzas».
 */
export async function getCobradoPorObra(supabase: SupabaseClient): Promise<Map<string, number> | null> {
  const { data, error } = await supabase.from('obra_cobranza').select('obra_id, cobrado')
  if (error) return null
  const por = new Map<string, number>()
  for (const f of (data ?? []) as { obra_id: string; cobrado: number | null }[]) {
    // `cobrado` viene NULL cuando la obra tiene filas de Cobranzas pero ninguna cobrada. Eso NO es
    // cero cobrado: es que todavía no entró nada, y la barra lo dibuja como 0 sólo si la obra
    // aparece con un número. Un null no se guarda: el mapa dice quién tiene cobro, no quién no.
    if (f.cobrado != null) por.set(f.obra_id, Number(f.cobrado))
  }
  return por
}

/**
 * QUÉ CLIENTES TIENEN UN CONTRATO CARGADO — la fuente de «sin contrato», que NO es un monto.
 *
 * Un documento con `rol = 'contrato'` en la ficha del cliente. La lista de roles es cerrada
 * (`ROLES_DOCUMENTO`), así que esto no depende de cómo alguien haya escrito el nombre del archivo.
 *
 * Un fallo devuelve `null` —no un conjunto vacío—: si la lectura no pudo mirar, la pantalla no
 * puede afirmar que a nadie le falta el contrato, y tampoco puede acusar a todos de no tenerlo.
 */
export async function getContratosDeLaCartera(
  supabase: SupabaseClient,
): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from('cliente_documento')
    .select('cliente_id, rol')
    .eq('rol', 'contrato')
  if (error) return null
  const con = new Set<string>()
  for (const d of (data ?? []) as { cliente_id: string }[]) con.add(d.cliente_id)
  return con
}

/** Lo mínimo de un certificado para saber en qué punto del circuito está. */
export interface FilaCertificado {
  obra_canonica_id: string | null
  numero: string | null
  fecha_certificacion: string | null
  fecha_facturacion: string | null
  fecha_cobranza: string | null
}

export async function getCertificadosDeLaCartera(
  supabase: SupabaseClient,
): Promise<FilaCertificado[] | null> {
  const { data, error } = await supabase
    .from('certificados')
    .select('obra_canonica_id, numero, fecha_certificacion, fecha_facturacion, fecha_cobranza')
    .order('fecha_certificacion', { ascending: true })
  if (error) return null
  return (data ?? []) as FilaCertificado[]
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LO PURO — se prueba sin base
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * EN QUÉ PUNTO DEL CIRCUITO ESTÁ LA OBRA. Sólo lo que las fechas prueban.
 *
 * El circuito es certificar → facturar → cobrar, y se lee al revés: la fecha más avanzada que
 * exista es el estado. Un certificado con `fecha_cobranza` ya pasó por las dos anteriores.
 */
export function certificacionDe(
  certificados: FilaCertificado[] | null, obraId: string,
): EstadoCertificacion {
  if (certificados === null) return { texto: 'certificación sin leer', reclama: true }
  const suyos = certificados.filter((c) => c.obra_canonica_id === obraId)
  if (suyos.length === 0) return { texto: 'sin certificar', reclama: false }
  const ultimo = suyos[suyos.length - 1]
  const n = ultimo.numero?.trim() ? `cert. ${ultimo.numero.trim()}` : 'certificado'
  if (ultimo.fecha_cobranza) return { texto: `${n} cobrado`, reclama: false }
  if (ultimo.fecha_facturacion) return { texto: `${n} facturado`, reclama: false }
  if (ultimo.fecha_certificacion) return { texto: `${n} certificado`, reclama: false }
  // Existe la fila y no tiene ni una fecha: nadie puede decir en qué punto está.
  return { texto: `${n} sin fechas`, reclama: true }
}

/** `2026-08-25` con hoy `2026-08-25` → `hoy`. La columna «Últ. mov.» se retiró de `/clientes` el
 *  10/09/2026 («esa columna sin movimientos quitarla»); esto se queda porque es la única forma
 *  probada de escribir una fecha relativa en esta capa. */
export function diaRelativo(fecha: string | null, hoy: string): string | null {
  if (!fecha) return null
  if (fecha === hoy) return 'hoy'
  const ayer = new Date(`${hoy}T00:00:00Z`)
  ayer.setUTCDate(ayer.getUTCDate() - 1)
  if (fecha === ayer.toISOString().slice(0, 10)) return 'ayer'
  const [, m, d] = fecha.split('-')
  return m && d ? `${d}/${m}` : fecha
}

/** El día de HOY en la hora de la empresa, no en la del proceso: Vercel corre en UTC. */
export function hoyEnLaEmpresa(ahora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
  return p
}

/**
 * ARMA LA CARTERA. Puro: cuatro listas entran, las filas que se dibujan salen.
 *
 * «Últ. mov.» del cliente es el HECHO más reciente que el OS registró de él: el último parte de
 * alguna de sus obras, o la fecha más avanzada de alguno de sus certificados. NO es
 * `clientes.updated_at` —eso es la última vez que alguien corrigió un teléfono— y por eso la
 * columna lleva su definición en el `title`: un rótulo de tres letras no puede cargar solo con
 * decir de qué está hablando.
 */
export function armarCartera({
  clientes, obras, cobrado, certificados, economia = null, contratos = null, economiaCliente = null,
}: {
  clientes: ClientePanel[]
  obras: ObraDeCartera[] | null
  /** obra_id → lo cobrado (percibido). `null` = no se pudo leer o el rol no ve economía. */
  cobrado: Map<string, number> | null
  certificados: FilaCertificado[] | null
  /** Lo que OBRAS publica por obra (`obra_economia_cartera`). `null` = no se pudo leer. */
  economia?: Map<string, EconomiaDeObra> | null
  /** Los clientes con un documento `contrato` cargado. `null` = no se pudo leer. */
  contratos?: Set<string> | null
  /**
   * LA ECONOMÍA DEL CLIENTE (`public.cliente_economia`): contratado, cobrado y pendiente, sumados
   * por la base. `null` = no se pudo leer o el rol no ve economía, y entonces las columnas del
   * cliente dicen «—»: NO se cae a sumar las filas acá, que es la segunda definición que este hito
   * vino a borrar.
   */
  economiaCliente?: Map<string, EconomiaDeCliente> | null
}): ClienteEnCartera[] {
  const porCliente = new Map<string, ObraDeCartera[]>()
  for (const o of obras ?? []) {
    if (!o.cliente_id) continue
    porCliente.set(o.cliente_id, [...(porCliente.get(o.cliente_id) ?? []), o])
  }

  return clientes.map((c) => {
    const enCurso: ObraEnCurso[] = (porCliente.get(c.cliente_id) ?? []).map((o) => {
      // EL PRECIO ES EL DE OBRAS (la OC de Cobranzas) Y NO TIENE RESPALDO. El del formulario
      // (`obra_panel.monto_contratado`) se retiró el 10/09/2026: era la otra definición, la que
      // sumaba las obras cerradas de Messina. Sin precio en OBRAS, la fila lo dice.
      const e = economia?.get(o.obra_id) ?? null
      const contratado = e?.contratado ?? null
      // UNA sola definición del margen, y `null` cuando falta un sumando: ver `margenDeLaFila`.
      const margen = margenDeLaFila({
        margenPublicado: e?.margen ?? null,
        contratado,
        costoMo: e?.costo_mo ?? null,
        costoMateriales: e?.costo_materiales ?? null,
      })
      return {
        obra_id: o.obra_id,
        nombre: o.nombre,
        avance: o.avance_pct,
        jefe: o.jefe_obra?.trim() || null,
        contratado,
        costoMo: e?.costo_mo ?? null,
        costoMateriales: e?.costo_materiales ?? null,
        margen,
        margenPct: margenPct(margen, contratado),
        certificacion: certificacionDe(certificados, o.obra_id),
        cobrado: cobrado?.get(o.obra_id) ?? null,
      }
    })
    // ═══ LO CONTRATADO Y LO COBRADO DEL CLIENTE LOS DICE LA VISTA, NO ESTA FUNCIÓN ═══
    //
    // Hasta el 10/09/2026 `contratado` era `sumaConHuecos` de las filas de obra y `cobrado` la suma
    // de `obra_cobranza` de esas mismas obras. Las dos sumas eran correctas y ninguna era la
    // definición: el panel lateral sumaba otra cosa, el esquema de pago otra y el portal no sumaba
    // nada. `cliente_economia` es la única, y acá sólo se lee — si no se pudo leer, las columnas
    // dicen «—» en vez de caer a una segunda cuenta que nadie más hace igual.
    const ec = economiaCliente?.get(c.cliente_id) ?? null
    const tMo = sumaConHuecos(enCurso.map((o) => o.costoMo))
    const tMat = sumaConHuecos(enCurso.map((o) => o.costoMateriales))
    const tMargen = sumaConHuecos(enCurso.map((o) => o.margen))
    // `economiaParcial` sigue mirando las filas: es «alguna obra en curso no tiene precio», un hecho
    // de las obras dibujadas, no del total. La vista lo publica como `n_obras_sin_precio` y las dos
    // cuentas tienen que coincidir; se prefiere la de las filas porque es la que se está mostrando.
    const contratadoParcial = sumaConHuecos(enCurso.map((o) => o.contratado)).parcial

    // «TIENE CONTRATO» ES UN PAPEL, NO UN MONTO (09/09/2026). Antes esta fila derivaba
    // «sin contrato» de `contratado === null`, que es el hueco de PRECIO de OBRAS: por eso el mismo
    // cliente aparecía con $156.174.253 contratado en una pantalla y «sin contrato» en la otra.
    const tieneContrato = contratos === null ? null : contratos.has(c.cliente_id)
    return {
      cliente_id: c.cliente_id,
      slug: c.slug,
      nombre: c.nombre_comercial,
      aviso: avisoDeDatos(c),
      tieneContrato,
      chips: chipsDeCliente({ cuit: c.cuit, telefono: c.telefono, tieneContrato }),
      faltaUnDato: leFaltaUnDato({ cuit: c.cuit, telefono: c.telefono, tieneContrato }),
      obras: c.n_obras,
      contratado: ec?.contratado_en_curso ?? null,
      contratadoTotal: ec?.contratado ?? null,
      costoMo: tMo.total,
      costoMateriales: tMat.total,
      margen: tMargen.total,
      margenPct: margenPct(tMargen.total, ec?.contratado_en_curso ?? null),
      economiaParcial: contratadoParcial || tMargen.parcial,
      cobrado: ec?.cobrado_neto_total ?? null,
      pendienteContractual: ec?.pendiente_contractual ?? null,
      enCurso,
    }
  })
}
