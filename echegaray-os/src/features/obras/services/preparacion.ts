// ¿QUÉ LE FALTA A ESTA OBRA PARA PONERSE A PRODUCIR? — la lista, calculada de la base.
//
// ═══ QUÉ ES Y QUÉ NO ES ═══
//
// El dueño lo dijo con todas las letras: *"Esto NO es un dashboard. Es un checklist operativo de
// preparación."* La diferencia no es de estilo. Un tablero informa; un checklist se AGOTA: cada
// línea nombra un trabajo concreto, dice quién lo tiene pendiente y enlaza a donde se hace. Por eso
// no hay porcentajes, no hay semáforos y no hay tarjetas — hay una lista que un día queda entera en
// ✓ y desaparece.
//
// ═══ POR QUÉ SE CALCULA Y NO SE GUARDA ═══
//
// La alternativa era una columna `preparada` (o siete banderitas) en `obra_canonica`. Se descarta
// por la misma razón por la que este repo ya pagó caro dos veces: una bandera que alguien tiene que
// acordarse de apagar miente en silencio. Si mañana archivan las 344 actividades de una obra, la
// bandera de «Cronograma ✓» seguiría en verde y nadie se enteraría. Acá cada línea se vuelve a
// contar contra las filas reales en cada visita, así que el checklist no puede quedar viejo.
//
// ═══ LA REGLA QUE HACE CUMPLIR ═══
//
// EL FALTANTE ES CONCRETO O NO SIRVE. «Línea base: pendiente» no le dice a nadie qué hacer. «0 de
// 344 actividades con línea base» sí: dice cuánto falta, dice que el cronograma existe, y dice que
// el trabajo es sellar. Medido contra producción el 19/08/2026, las ocho obras tienen 0 actividades
// con `inicio_base` — el checklist tiene que poder decir eso sin adornarlo.
//
// Este módulo es PURO a propósito: no toca Supabase, no arma marcado y se prueba entero en
// `orquestador/lib/preparacion-obra.test.mjs`. Quien lee la base es `preparacionService.ts`.

/** Las siete líneas del checklist, en el orden en que el dueño las escribió. */
export type ClavePreparacion =
  | 'cronograma' | 'baseline' | 'responsable' | 'personal' | 'contrato' | 'drive' | 'hh_plan'

export interface LineaPreparacion {
  clave: ClavePreparacion
  titulo: string
  /** ✓ o pendiente. Nunca «parcial»: media línea base no habilita medir un desvío. */
  listo: boolean
  /** El faltante CONCRETO, con sus números. Es lo único que convierte la línea en trabajo. */
  detalle: string
  /** Dónde se resuelve. Sin esto el checklist es una queja: dice qué falta y no dónde arreglarlo. */
  href: string
}

/** Lo que hace falta de UNA actividad para contarla. Es un subconjunto de `Actividad` a propósito:
 *  la lectura pide sólo estas columnas y la prueba puede construirlas a mano. */
export interface ActividadPreparacion {
  archivada: boolean
  inicio_plan: string | null
  fin_plan: string | null
  inicio_base: string | null
  fin_base: string | null
  responsable_id: string | null
  hh_plan: number | null
}

export interface InsumosPreparacion {
  obraId: string
  jefeObra: string | null
  /** Sólo se consulta cuando `verContrato` es true. Nunca se publica su valor: ver abajo. */
  montoContratado: number | null
  inicioPlan: string | null
  finPlan: string | null
  driveCarpetaId: string | null
  /** TODAS las actividades de la obra, archivadas incluidas: acá se decide a cuáles mirar. */
  actividades: ActividadPreparacion[]
  /** Filas de `obra_asignacion` para esta obra. */
  personasAsignadas: number
  /**
   * ═══ POR QUÉ LA LÍNEA «CONTRATO» DESAPARECE EN VEZ DE DECIR «PENDIENTE» ═══
   *
   * `obra_panel.monto_contratado` ya devuelve NULL a quien no es Administración —lo enmascara
   * Postgres, ver `20260819T0400_economia_comercial_solo_administracion.sql`—. Bien para la
   * pantalla de Economía: un guión no es un número. Pero acá ese NULL sería catastrófico, porque el
   * checklist lo LEE como respuesta: un jefe de obra vería «Contrato · pendiente» en una obra con el
   * contrato cargado hace meses, iría a cargarlo, y no podría. Peor: «pendiente» y «no puedo verlo»
   * son indistinguibles, así que la pantalla estaría AFIRMANDO algo falso sobre plata.
   *
   * La salida no es mostrar la cifra a nadie más ni inventar un tercer estado: es que la línea no
   * exista para quien no es Administración. Preparar el contrato no es trabajo de Obras — no hay
   * nada que esa persona pueda tachar de esta lista. Y para quien SÍ la ve, el detalle dice
   * «cargado» o «sin cargar»: la cifra no entra al checklist ni siquiera para Administración,
   * porque un checklist de preparación no es el lugar donde se consulta el monto de un contrato.
   */
  verContrato: boolean
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * EL CHECKLIST DE UNA OBRA. Devuelve las siete líneas (seis si quien mira no es Administración),
 * siempre en el mismo orden y siempre completas: las que están en ✓ también se devuelven, porque
 * quien pinta decide si muestra la lista entera o sólo lo que falta.
 */
export function preparacionDeObra(i: InsumosPreparacion): LineaPreparacion[] {
  // LAS ARCHIVADAS NO CUENTAN, NI ARRIBA NI ABAJO DE LA FRACCIÓN. Una actividad archivada salió del
  // cronograma: exigirle línea base dejaría el checklist en rojo para siempre por trabajo que ya
  // nadie va a hacer.
  const vivas = i.actividades.filter((a) => !a.archivada)
  const n = vivas.length
  const conFecha = vivas.filter((a) => a.inicio_plan || a.fin_plan).length
  const conBase = vivas.filter((a) => a.inicio_base && a.fin_base).length
  const conResponsable = vivas.filter((a) => a.responsable_id).length
  const conHH = vivas.filter((a) => a.hh_plan != null).length

  const ficha = `/obras/${i.obraId}?vista=resumen`
  const cronograma = `/obras/${i.obraId}?vista=cronograma`

  const lineas: LineaPreparacion[] = [
    {
      clave: 'cronograma',
      titulo: 'Cronograma',
      listo: n > 0,
      detalle: n > 0 ? `${plural(n, 'actividad cargada', 'actividades cargadas')}` : 'sin ninguna actividad cargada',
      href: cronograma,
    },
    {
      clave: 'baseline',
      titulo: 'Línea base',
      // Media línea base no sirve: el desvío de plazo se calcula sobre el mínimo y el máximo de
      // TODAS las actividades, así que una sola sin sellar mueve el resultado. Por eso el ✓ exige
      // el total y no una mayoría.
      listo: n > 0 && conBase === n,
      detalle: n === 0
        ? 'no hay cronograma que sellar'
        // `sellarBaseline` sólo sella lo que tiene fecha de plan. Decirlo acá evita el viaje al
        // cronograma para encontrarse con «No hay ninguna actividad con fecha».
        //
        // `conBase === 0` no sobra en esta condición y su ausencia la atrapó la prueba: sin él, una
        // obra con la línea base sellada a la que después le vaciaran las fechas de plan diría
        // «todavía no hay línea base que sellar» ESTANDO sellada. Cuando ya hay aunque sea una
        // actividad con base, la respuesta correcta es siempre la fracción.
        : conFecha === 0 && conBase === 0
          ? 'sin fechas de plan: todavía no hay línea base que sellar'
          : `${conBase} de ${plural(n, 'actividad', 'actividades')} con línea base`,
      href: cronograma,
    },
    {
      clave: 'responsable',
      titulo: 'Responsable',
      // EL ✓ LO DECIDE EL JEFE DE OBRA, no el responsable de cada actividad, y la asimetría con
      // «Línea base» es deliberada: sin jefe de obra no hay a quién preguntarle por la obra, y eso
      // bloquea el arranque. El responsable por actividad es refinamiento del cronograma —se carga
      // a medida que se planifica—, así que se INFORMA en el detalle y no cierra la línea.
      listo: Boolean(i.jefeObra),
      detalle: [
        i.jefeObra ? `jefe de obra: ${i.jefeObra}` : 'sin jefe de obra',
        n > 0 ? `${conResponsable} de ${plural(n, 'actividad', 'actividades')} con responsable` : null,
      ].filter(Boolean).join(' · '),
      href: ficha,
    },
    {
      clave: 'personal',
      titulo: 'Personal',
      listo: i.personasAsignadas > 0,
      detalle: i.personasAsignadas > 0
        ? plural(i.personasAsignadas, 'persona asignada', 'personas asignadas')
        : 'nadie asignado a la obra',
      href: `/obras/${i.obraId}?vista=personal`,
    },
    {
      clave: 'drive',
      titulo: 'Drive',
      listo: Boolean(i.driveCarpetaId),
      detalle: i.driveCarpetaId ? 'carpeta de obra vinculada' : 'sin carpeta de Drive vinculada',
      href: `/obras/${i.obraId}?vista=documentos`,
    },
    {
      clave: 'hh_plan',
      titulo: 'HH plan',
      listo: n > 0 && conHH === n,
      detalle: n === 0
        ? 'no hay actividades a las que cargarles horas'
        : `${conHH} de ${plural(n, 'actividad', 'actividades')} con HH plan`,
      href: cronograma,
    },
  ]

  if (!i.verContrato) return lineas

  const faltaContrato = [
    i.montoContratado == null ? 'monto contratado sin cargar' : null,
    !i.inicioPlan ? 'sin inicio previsto' : null,
    !i.finPlan ? 'sin fin previsto' : null,
  ].filter(Boolean) as string[]

  // Va entre «Personal» y «Drive», que es el orden en que el dueño escribió la lista.
  lineas.splice(4, 0, {
    clave: 'contrato',
    titulo: 'Contrato',
    listo: faltaContrato.length === 0,
    // LA CIFRA NO ENTRA ACÁ NI PARA ADMINISTRACIÓN. Un checklist dice si el trabajo está hecho;
    // el monto se consulta en Economía, que es donde se decide algo con él.
    detalle: faltaContrato.length === 0 ? 'monto y fechas de plan cargados' : faltaContrato.join(' · '),
    href: ficha,
  })
  return lineas
}

/** Lo que todavía no está. Es lo que decide si el bloque se dibuja: sin pendientes, no se dibuja. */
export function loQueFalta(lineas: LineaPreparacion[]): LineaPreparacion[] {
  return lineas.filter((l) => !l.listo)
}
