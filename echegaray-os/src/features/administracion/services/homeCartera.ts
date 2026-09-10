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
import type { EconomiaDeObra } from '../../clientes/services/economiaObras.ts'
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
  /** El contrato en DÓLARES, cuando lo es. La fila publica los dos: la moneda del contrato y su
   *  valuación de hoy. Quattropani se contrató en U$S 63.000 y la pantalla mostraba sólo los pesos,
   *  que cambian solos cada día sin que nada lo explique. */
  contratadoUsd: number | null
  /** El TC con el que se valuó ese contrato. `null` = contrato en pesos. */
  tipoCambio: number | null
  /** El papel que respalda el contratado: «según OC 2256». `null` = no lo respalda ninguno. */
  referencia: string | null
  /** La discrepancia declarada contra las OC cargadas. Va al `title`, nunca dibujada al lado. */
  nota: string | null
  /** LAS OC DEL TRABAJO, CON IVA, DENTRO DE LA VENTANA DEL AÑO que acota el contratado, y las de
   *  otros años aparte. NO SE SUMAN: BSA absorbió `bsa-planta` con tres OC de 2024 por $38,3 M y la
   *  celda mostraba $49.886.583 al lado de un contratado de $17,7 M. */
  ocCivaVentana: number | null
  ocCivaHistorico: number | null
  ocNVentana: number | null
  ocNHistorico: number | null
  /**
   * DE QUÉ CAMINO SALIÓ ESE NÚMERO (`obra_economia_cartera.origen`). `suma-viva` NO es un precio
   * contratado: es lo que Cobranzas lleva registrado como venta, y la fila tiene que decirlo — ME -
   * BSA publica $14.120.243 por ese camino mientras el cliente mandó 5 OC por $49.886.583 c/IVA.
   */
  origenContratado: string | null
  certificacion: EstadoCertificacion
  /**
   * ═══ LAS CUATRO COLUMNAS DE LA PESTAÑA OBRAS, EN LA FILA DEL TRABAJO (10/09/2026) ═══
   *
   * El dueño cruzó `/clientes` contra la pestaña OBRAS del Flujo de Caja y los números no eran los
   * mismos: la app publicaba el cobrado NETO en una columna que en OBRAS es el TOTAL con IVA, así
   * que las nueve obras se leían mal. La fila del trabajo reproduce ahora la fila de OBRAS —
   * Contratado (neto) · Cobrado (total) · Por cobrar · ▲ Vencido · Próx. cobro— con la MISMA
   * definición: la del generador `orquestador/scripts/obras-pestana.mjs`.
   *
   * LO COBRADO, BRUTO Y CON IVA (`obra_cobranza.cobrado`). `null` = ninguna cobranza imputada a la
   * obra, que NO es «no cobró»: hoy Cobranzas anota casi todo el cobro contra el cliente.
   */
  cobradoTotal: number | null
  /** Lo mismo SIN IVA (`obra_cobranza.cobrado_neto`). NO se dibuja: es el único comparable contra
   *  lo contratado y queda leído para quien tenga que restar, nunca para la columna «Cobrado». */
  cobradoNeto: number | null
  /** Lo pendiente de cobro de esta obra, BRUTO (`obra_cobranza.por_cobrar_proyectado`). */
  porCobrar: number | null
  /**
   * LO VENCIDO, con el reloj de `orquestador/lib/cobranzas-vencido.mjs`: emisión + 30 días, NO
   * `fecha_cobro < hoy` —que se re-tipea cada vez que el cobro se posterga y está condenado a cero
   * por construcción—. `null` = la vista todavía no publica la columna, y entonces la celda calla:
   * un 0 acá diría que este cliente no debe nada vencido.
   */
  vencido: number | null
  /** Cuándo y cómo se espera el próximo cobro. `null` = la vista no lo publica todavía. */
  proximo: ProximoCobro | null
  /** Cómo llegó ese número a esta obra. `cliente` = no se pudo repartir y la fila lo dice. */
  imputacion: Imputacion | null
  /** ¿La base puede repartir el cobro por obra? `false` = la columna `imputacion` no existe todavía
   *  y esta celda NO dibuja nada. Ver `CobroPorObra`: es todo o nada. */
  cobroDisponible: boolean
}

export interface ClienteEnCartera {
  cliente_id: string
  slug: string | null
  nombre: string
  /**
   * ¿TIENE UN CONTRATO CARGADO? Sale de `cliente_documento.rol = 'contrato'` y NO del monto: son
   * dos conceptos y hasta el 09/09/2026 la pantalla los decía con la misma palabra. `null` = no se
   * pudo leer la tabla de documentos, y entonces la fila NO dice «sin contrato».
   */
  tieneContrato: boolean | null
  /**
   * CUÁNTAS OBRAS TIENE, EN TOTAL. Es `cliente_panel.n_obras` y NO cierra con las filas de abajo:
   * abajo cuelgan sólo las `activa`. Por eso la fila ya no escribe «11 obras» a secas —Messina
   * mostraba 11 con 5 filas debajo— sino el desglose de los dos campos que siguen.
   */
  obras: number
  /** De `cliente_economia.n_obras_en_curso`. `null` = no se pudo leer la vista (o el rol no ve
   *  economía), y entonces la fila cae a `obras` sin desglosar: nunca se inventa un cero. */
  nEnCurso: number | null
  /** De `cliente_economia.n_obras_cerradas`. Es el número que explica la resta que el dueño vio. */
  nCerradas: number | null
  /**
   * CUÁNTAS DE SUS OBRAS NO TIENEN PRECIO EN OBRAS (`n_obras_sin_precio`).
   *
   * ES LA CONDICIÓN DEL PORCENTAJE DE COBRO. `cobrado_neto_total` es de TODAS sus obras y
   * `contratado` sólo de las que tienen precio: mientras falte una, la fracción tiene arriba y
   * abajo dos universos distintos. San Francisco publicaba «100 % cobrado» dividiendo el cobro de
   * sus 5 obras por el contrato de 4. Con esto la pantalla publica el importe —que es un hecho— y
   * se guarda el porcentaje.
   */
  obrasSinPrecio: number | null
  /**
   * LO CONTRATADO DE SUS OBRAS EN CURSO, de `cliente_economia.contratado_en_curso` — la vista, no
   * una suma hecha acá. `null` = ninguna obra en curso tiene precio en OBRAS, o no se pudo leer.
   */
  contratado: number | null
  /** Lo contratado de TODAS sus obras no fusionadas (`cliente_economia.contratado`), incluidas las
   *  cerradas. Es el denominador de la barra de cobro: lo cobrado del cliente no distingue obra. */
  contratadoTotal: number | null
  /**
   * LO COBRADO DEL CLIENTE, ACUMULADO Y SIN IVA (`cliente_economia.cobrado_neto_total`).
   *
   * NO es la suma de `obra_cobranza` de sus obras en curso, que es lo que era hasta el 10/09/2026 y
   * daba `null` en TODAS las filas: `cobranzas.obra_cliente` guarda una etiqueta de CLIENTE, no de
   * obra, así que casi ninguna cobranza llega a una obra. El cobro del cliente sí existe y sale de
   * `cliente_id`.
   *
   * SE PUBLICAN LAS DOS ESPECIES Y LA COLUMNA DIBUJA EL TOTAL (10/09/2026). La pestaña OBRAS —que
   * es contra la que el dueño lee esta pantalla— publica «Cobrado (total)»: con IVA. Mientras la
   * app dibujaba el neto en una columna llamada igual, los dos sistemas decían números distintos
   * del mismo hecho. El neto sigue leído porque es el único comparable contra lo contratado, que
   * no lleva IVA — pero eso es una RESTA, no la columna.
   */
  cobradoTotal: number | null
  cobradoNeto: number | null
  /** `contratado (todas) − cobrado neto`. `null` si falta cualquiera de los dos. */
  pendienteContractual: number | null
  /**
   * LO COBRADO QUE NO LLEGÓ A NINGUNA OBRA — la suma de las cobranzas que quedaron con imputación
   * `cliente` en TODAS sus obras, incluidas las cerradas. `null` = no hay ninguna, o no se pudo leer.
   *
   * ES LA PIEZA QUE FALTABA PARA QUE EL % POR OBRA NO SE LEA COMO DEUDA. San Francisco tiene cuatro
   * filas «Saldo obras San Francisco — cuota n/4» por $47.659.263 que son del CLIENTE y no de una
   * obra: sus tres obras muestran 25–29 % cobrado mientras el cliente lleva el 50 %. Sin este
   * número, la diferencia se lee como plata que falta cobrar. Con él, se lee como plata cobrada que
   * todavía no se repartió.
   *
   * SÓLO CUENTA LO QUE QUEDÓ SIN REPARTIR DE VERDAD: se calcula DESPUÉS de `atribuirAlaUnicaObra`,
   * así que un cliente con una sola obra en curso —cuyo cobro ya se le atribuyó— no publica un
   * «sin asignar» que contradiga su propia barra.
   */
  cobradoSinObra: number | null
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
 * ═══ SE LEE `cobrado_neto` Y NO `cobrado` (10/09/2026) ═══
 *
 * `cobrado` es el BRUTO —lo que entró al banco, con IVA— y lo contratado de OBRAS es NETO. La fila
 * de Quattropani publicaba «100 %» con $102.606.669 cobrados sobre $95.270.932 contratados: el 7 %
 * de más era el IVA de las facturas, no un cobro por encima del contrato. Con el neto
 * ($84.697.935) la misma fila dice 89 %, que es lo que pasó. El bruto sigue vivo en la vista para
 * quien pregunte cuánta plata entró; lo que no puede es dividirse por un neto.
 *
 * LA VISTA LLEVA `WHERE ve_economia()`: al jefe de obra le devuelve CERO FILAS, no un error. Por eso
 * un mapa vacío no significa «nadie cobró nada» y la pantalla, además, no ofrece la celda cuando el
 * rol no ve economía — no ofrecer lo que la base va a negar.
 *
 * `null` = la lectura falló, que no es lo mismo que «no hay cobranzas».
 */
export async function getCobradoPorObra(
  supabase: SupabaseClient,
): Promise<CobroPorObra | null> {
  // ═══ SE LEE `obra_cuenta` Y NO `obra_cobranza` (10/09/2026, migración 20260910T2356) ═══
  //
  // `obra_cuenta` ES la fila de la pestaña OBRAS traducida a Postgres: contrato, cobro con IVA,
  // saldo, vencido con el reloj de la emisión + 30 días, y el próximo cobro con su medio — los
  // mismos criterios que `orquestador/scripts/obras-pestana.mjs`, y probados contra el Sheet en
  // `obra-cuenta.pg.test.mjs`. `obra_cobranza` sigue viva y sirve para otra pregunta (lo cobrado y
  // lo por cobrar de una obra, sin ventana de año); mezclarlas era cómo la pantalla terminaba
  // publicando el neto donde el Sheet publica el bruto.
  //
  // NO HAY `select` TOLERANTE ACÁ. Las columnas nacen todas juntas con la vista: si la lectura
  // falla, es «no pude leer» —y se devuelve `null`, que la pantalla dice con palabras— y no un
  // hueco que se dibuje como cero.
  const { data, error } = await supabase
    .from('obra_cuenta')
    .select('obra_id, cobrado_total, cobrado_neto, por_cobrar, vencido, proximo_cobro_fecha, proximo_cobro_medio, imputacion')
  if (error) return null
  const por = new Map<string, CobroDeObra>()
  for (const f of (data ?? []) as unknown as FilaCobro[]) {
    // UNA OBRA SIN NINGUNA FILA DE COBRANZAS NO ENTRA AL MAPA. Eso NO es cero cobrado: es que no
    // hay nada anotado contra ella, y la celda lo dice quedándose vacía.
    if (f.cobrado_total == null && f.cobrado_neto == null && f.por_cobrar == null) continue
    por.set(f.obra_id, {
      total: numero(f.cobrado_total),
      neto: numero(f.cobrado_neto),
      porCobrar: numero(f.por_cobrar),
      vencido: numero(f.vencido),
      proximo: f.proximo_cobro_fecha || f.proximo_cobro_medio
        ? { fecha: f.proximo_cobro_fecha ?? null, medio: f.proximo_cobro_medio?.trim() || null }
        : null,
      imputacion: esImputacion(f.imputacion) ? f.imputacion : null,
    })
  }
  // LA VISTA REPARTE POR OBRA POR CONSTRUCCIÓN: sale de `cobranza_imputacion`, que ata cada fila de
  // Cobranzas a su obra. Si se pudo leer, la base sabe repartir — la regla de «todo o nada» sigue
  // siendo la misma y ahora su respuesta es sí.
  return { por, disponible: true }
}

/** La fila cruda de `public.obra_cuenta`. `numeric` llega como texto y `null` se queda `null`. */
interface FilaCobro {
  obra_id: string
  cobrado_total?: unknown
  cobrado_neto?: unknown
  por_cobrar?: unknown
  vencido?: unknown
  proximo_cobro_fecha?: string | null
  proximo_cobro_medio?: string | null
  imputacion?: unknown
}

/** PostgREST devuelve `numeric` como texto. Un hueco NUNCA se vuelve cero. */
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const IMPUTACIONES = ['oc', 'alias', 'cliente'] as const
function esImputacion(v: unknown): v is Imputacion {
  return typeof v === 'string' && (IMPUTACIONES as readonly string[]).includes(v)
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

/**
 * CÓMO LLEGÓ EL COBRO A ESTA OBRA (`obra_cobranza.imputacion`).
 *
 *   `oc`       por el número de OC de la columna H de Cobranzas, atado a su obra por
 *              `cliente_orden.obra_id`. Es la atribución fuerte: la dice un papel.
 *   `alias`    porque la etiqueta de Cobranzas nombra a esa obra (`obra_alias`).
 *   `cliente`  NO se pudo repartir: la etiqueta nombra al CLIENTE y el cobro quedó en la bolsa.
 *              La fila lo dice con palabras y NO dibuja barra: repartirlo entre varias obras a ojo
 *              sería inventar.
 *   `null`     la columna todavía no existe en la base (la migración no está aplicada).
 *
 * `unica-obra` NO SALE DE LA BASE: lo DERIVA `armarCartera` cuando el cliente tiene UNA sola obra
 * en curso y por lo tanto no hay entre qué repartir. Es una DEDUCCIÓN, no una medición, y por eso
 * lleva nombre propio en vez de disfrazarse de `alias`. Ver `atribuirAlaUnicaObra`.
 */
export type Imputacion = 'oc' | 'alias' | 'cliente' | 'unica-obra'

/** Cuándo y con qué medio se espera el próximo cobro de una obra — la columna «Próx. cobro». */
export interface ProximoCobro {
  /** `YYYY-MM-DD`. `null` = la vista lo publica sin fecha. */
  fecha: string | null
  /** «Transferencia», «Efectivo», «Cheque»… tal como lo escribe Cobranzas. */
  medio: string | null
}

export interface CobroDeObra {
  /** BRUTO, con IVA (`obra_cobranza.cobrado`). Es lo que OBRAS publica como «Cobrado». */
  total: number | null
  /** SIN IVA (`obra_cobranza.cobrado_neto`). El comparable contra lo contratado. */
  neto: number | null
  /** Pendiente de cobro, bruto (`obra_cobranza.por_cobrar_proyectado`). */
  porCobrar: number | null
  /** Vencido con el reloj de la emisión + 30 días. `null` = la vista no lo publica todavía. */
  vencido: number | null
  proximo: ProximoCobro | null
  imputacion: Imputacion | null
}

/**
 * ═══ TODO O NADA (dueño, 10/09/2026 16:25: «uno con barra de progreso y otros no») ═══
 *
 * `disponible` dice si la BASE puede repartir el cobro por obra —o sea, si `obra_cobranza` ya
 * publica `imputacion`—. Mientras no pueda, NINGUNA fila de obra dibuja cobro: ni barra ni importe,
 * Quattropani incluida.
 *
 * NO ES COSMÉTICO. Sin `imputacion`, el único cobro que llega a una obra es el que la etiqueta de
 * Cobranzas resolvió por casualidad —`quattropani` es a la vez el nombre del cliente y el id de su
 * única obra—, y las demás quedan en «—». Una sola fila con barra en una columna vacía no se lee
 * como «la base sólo sabe de ésta»: se lee como que las otras no cobraron. Publicar el único caso
 * que la casualidad resuelve es peor que no publicar ninguno.
 *
 * Cuando la columna exista, TODAS las que tengan imputación `oc` o `alias` dibujan, y las `cliente`
 * dicen «cobro sin obra asignada». La fila del CLIENTE no entra en esta regla: su importe sale de
 * `cliente_economia` y no depende de que se pueda repartir nada.
 */
export interface CobroPorObra {
  por: Map<string, CobroDeObra>
  disponible: boolean
}

/**
 * ═══ UN CLIENTE CON UNA SOLA OBRA EN CURSO NO TIENE ENTRE QUÉ REPARTIR ═══
 *
 * `imputacion = 'cliente'` significa que la vista no pudo atar esa cobranza a una obra: ni por el
 * número de OC de la columna H ni por la etiqueta de Cobranzas. Pero cuando el cliente tiene UNA
 * sola obra en curso no hay ambigüedad que resolver — no hay dos candidatas—, y dejar la fila
 * diciendo «cobro sin obra asignada» es esconder un número que sí se sabe de quién es.
 *
 * ES EL CASO DE QUATTROPANI (medido el 10/09/2026): su etiqueta «Quattropani - Melisa García SAS»
 * resuelve por `obra_alias` al id `quattropani`, que es la obra bolsa y a la vez su ÚNICA obra en
 * curso. La vista la marca `cliente` porque llegó por el alias del cliente, no por la OC; la
 * pantalla puede afirmar sin inventar que ese cobro es de esa obra.
 *
 * ═══ LO QUE ESTA REGLA NO PUEDE VER, Y HAY QUE DECIRLO ═══
 *
 * Mira las obras EN CURSO. Un cliente con una obra en curso y varias CERRADAS que todavía deban
 * plata recibiría en la obra en curso un cobro que puede ser de una cerrada. Hoy no pasa —el único
 * cliente que entra en la regla, Quattropani, no tiene ninguna cerrada— pero el día que pase, el
 * número va a estar en la fila equivocada y nada se va a poner rojo. Por eso la atribución NO se
 * disfraza de medición: viaja marcada como `unica-obra` y el `title` dice que se dedujo.
 *
 * Con DOS o más obras en curso no se toca nada: repartir a ojo sería inventar, y la fila sigue
 * diciendo «cobro sin obra asignada».
 */
export function atribuirAlaUnicaObra(enCurso: ObraEnCurso[]): ObraEnCurso[] {
  if (enCurso.length !== 1) return enCurso
  const [o] = enCurso
  if (o.imputacion !== 'cliente' || o.cobradoTotal === null) return enCurso
  return [{ ...o, imputacion: 'unica-obra' }]
}

/**
 * CUÁNTO DEL COBRO DEL CLIENTE NO LLEGÓ A NINGUNA OBRA.
 *
 * Suma las cobranzas con imputación `cliente` de TODAS sus obras —las cerradas incluidas, porque la
 * obra bolsa donde caen casi siempre lo está— y descuenta las que `atribuirAlaUnicaObra` ya le
 * asignó a la única obra en curso: publicar un «sin asignar» al lado de una barra que dice lo
 * contrario sería contradecirse en la misma fila.
 *
 * `null` Y NO CERO cuando no hay nada sin repartir: la fila no dibuja el renglón. Un «$ 0 sin
 * asignar» es ruido que ocupa una línea en todas las filas para decir que no pasa nada.
 */
export function sinRepartir({ obrasDelCliente, cobrado, yaAtribuidas }: {
  obrasDelCliente: { obra_id: string }[] | null
  cobrado: CobroPorObra | null
  yaAtribuidas: Set<string>
}): number | null {
  if (!obrasDelCliente || !cobrado?.disponible) return null
  let total = 0
  for (const o of obrasDelCliente) {
    if (yaAtribuidas.has(o.obra_id)) continue
    const c = cobrado.por.get(o.obra_id)
    if (c?.imputacion === 'cliente' && (c.total ?? 0) > 0) total += c.total ?? 0
  }
  return total > 0 ? total : null
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
  todasLasObras = null,
}: {
  clientes: ClientePanel[]
  obras: ObraDeCartera[] | null
  /** Lo cobrado por obra Y si la base puede repartirlo. `null` = no se pudo leer o el rol no ve
   *  economía. */
  cobrado: CobroPorObra | null
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
  /**
   * TODAS las obras de cada cliente, incluidas las CERRADAS (`getObrasPorCliente`). Hace falta para
   * `cobradoSinObra`: el cobro que Cobranzas no pudo repartir cae en la obra bolsa del cliente, que
   * casi siempre está cerrada y por eso NO aparece en `obras` —que sólo trae las `activa`—.
   * `null`/ausente = no se pudo leer, y entonces el «sin asignar» no se afirma.
   */
  todasLasObras?: Map<string, { obra_id: string }[]> | null
}): ClienteEnCartera[] {
  const porCliente = new Map<string, ObraDeCartera[]>()
  for (const o of obras ?? []) {
    if (!o.cliente_id) continue
    porCliente.set(o.cliente_id, [...(porCliente.get(o.cliente_id) ?? []), o])
  }

  // Que la base sepa repartir el cobro por obra es un hecho de la LECTURA, no de cada fila: si no
  // se pudo leer nada (`null`), tampoco se puede afirmar que se pueda repartir.
  const cobroDisponible = cobrado?.disponible ?? false

  return clientes.map((c) => {
    const enCurso: ObraEnCurso[] = (porCliente.get(c.cliente_id) ?? []).map((o) => {
      // EL PRECIO ES EL DE OBRAS (la OC de Cobranzas) Y NO TIENE RESPALDO. El del formulario
      // (`obra_panel.monto_contratado`) se retiró el 10/09/2026: era la otra definición, la que
      // sumaba las obras cerradas de Messina. Sin precio en OBRAS, la fila lo dice.
      const e = economia?.get(o.obra_id) ?? null
      const contratado = e?.contratado ?? null
      return {
        obra_id: o.obra_id,
        nombre: o.nombre,
        avance: o.avance_pct,
        jefe: o.jefe_obra?.trim() || null,
        contratado,
        contratadoUsd: e?.contratado_usd ?? null,
        tipoCambio: e?.tipo_cambio ?? null,
        origenContratado: e?.origen ?? null,
        referencia: e?.referencia ?? null,
        nota: e?.nota ?? null,
        ocCivaVentana: e?.oc_civa_ventana ?? null,
        ocCivaHistorico: e?.oc_civa_historico ?? null,
        ocNVentana: e?.oc_n_ventana ?? null,
        ocNHistorico: e?.oc_n_historico ?? null,
        certificacion: certificacionDe(certificados, o.obra_id),
        // TODO O NADA: sin `imputacion` en la base, la fila de la obra no publica cobro. Se corta
        // ACÁ y no en el componente —dos pantallas podrían dibujar la misma fila— y así el control
        // se prueba sin montar nada.
        cobradoTotal: cobroDisponible ? cobrado?.por.get(o.obra_id)?.total ?? null : null,
        cobradoNeto: cobroDisponible ? cobrado?.por.get(o.obra_id)?.neto ?? null : null,
        // POR COBRAR Y VENCIDO NO ENTRAN EN «TODO O NADA», y es una diferencia con el cobrado: no
        // hay nada que repartir entre obras: la vista los publica por obra o no los publica. Si
        // faltan, la celda calla — nunca dice cero.
        porCobrar: cobrado?.por.get(o.obra_id)?.porCobrar ?? null,
        vencido: cobrado?.por.get(o.obra_id)?.vencido ?? null,
        proximo: cobrado?.por.get(o.obra_id)?.proximo ?? null,
        imputacion: cobroDisponible ? cobrado?.por.get(o.obra_id)?.imputacion ?? null : null,
        cobroDisponible,
      }
    })
    // UN CLIENTE CON UNA SOLA OBRA EN CURSO NO TIENE ENTRE QUÉ REPARTIR: ver `atribuirAlaUnicaObra`.
    // Se hace acá y no dentro del `map` de arriba porque la regla mira el CONJUNTO de las obras del
    // cliente, no una fila.
    const enCursoAtribuido = atribuirAlaUnicaObra(enCurso)
    const cobradoSinObra = sinRepartir({
      obrasDelCliente: todasLasObras?.get(c.cliente_id) ?? null,
      cobrado,
      yaAtribuidas: new Set(
        enCursoAtribuido.filter((o) => o.imputacion === 'unica-obra').map((o) => o.obra_id),
      ),
    })

    // ═══ LO CONTRATADO Y LO COBRADO DEL CLIENTE LOS DICE LA VISTA, NO ESTA FUNCIÓN ═══
    //
    // Hasta el 10/09/2026 `contratado` era `sumaConHuecos` de las filas de obra y `cobrado` la suma
    // de `obra_cobranza` de esas mismas obras. Las dos sumas eran correctas y ninguna era la
    // definición: el panel lateral sumaba otra cosa, el esquema de pago otra y el portal no sumaba
    // nada. `cliente_economia` es la única, y acá sólo se lee — si no se pudo leer, las columnas
    // dicen «—» en vez de caer a una segunda cuenta que nadie más hace igual.
    const ec = economiaCliente?.get(c.cliente_id) ?? null
    // «TIENE CONTRATO» ES UN PAPEL, NO UN MONTO (09/09/2026). Antes esta fila derivaba
    // «sin contrato» de `contratado === null`, que es el hueco de PRECIO de OBRAS: por eso el mismo
    // cliente aparecía con $156.174.253 contratado en una pantalla y «sin contrato» en la otra.
    const tieneContrato = contratos === null ? null : contratos.has(c.cliente_id)
    return {
      cliente_id: c.cliente_id,
      slug: c.slug,
      nombre: c.nombre_comercial,
      tieneContrato,
      obras: c.n_obras,
      nEnCurso: ec?.n_obras_en_curso ?? null,
      nCerradas: ec?.n_obras_cerradas ?? null,
      obrasSinPrecio: ec?.n_obras_sin_precio ?? null,
      contratado: ec?.contratado_en_curso ?? null,
      contratadoTotal: ec?.contratado ?? null,
      cobradoTotal: ec?.cobrado_total ?? null,
      cobradoNeto: ec?.cobrado_neto_total ?? null,
      cobradoSinObra,
      pendienteContractual: ec?.pendiente_contractual ?? null,
      enCurso: enCursoAtribuido,
    }
  })
}
