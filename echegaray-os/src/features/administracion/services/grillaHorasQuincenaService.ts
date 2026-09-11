// LAS LECTURAS DE LA SOLAPA «HORAS». Ni una regla de negocio acá: trae filas y nada más.
//
// La grilla la arma `grillaHorasQuincena.ts` y el panel de la persona `panelDePersona.ts`, los dos
// puros y probados sin Supabase. Este archivo sólo decide QUÉ se pide y en cuántos viajes.
//
// ═══ DOS VENTANAS, CADA UNA CON SUS COLUMNAS (10/09/2026, medido) ═══
//
// Había UNA sola ventana ancha —cinco meses— con las once columnas y los dos `obra_canonica(nombre)`
// / `obra_actividad(nombre)` que sólo necesita el detalle de la quincena. Costaba esto, leído en la
// base real: 2.069 filas y 903 KB por carga, y en pg_stat_statements 201 llamadas con 15 s de
// máximo. Lo caro no eran las filas: era el `left join lateral` a `obra_canonica`, que tiene RLS por
// `ve_obra(id)` y por lo tanto se evaluaba una vez POR FILA — 2.069 veces para dibujar 138 renglones.
//
// Ahora se piden las dos cosas que de verdad se necesitan, cada una con su forma:
//
//   LA QUINCENA         las once columnas y los dos nombres de obra. 138 filas · 57 KB.
//   LOS CINCO MESES     `persona_id, fecha, horas` y nada más, y sólo hasta el día ANTERIOR a la
//                       quincena: lo de la quincena ya vino arriba. 1.671 filas · 154 KB, sin un
//                       solo lateral y por lo tanto sin RLS por fila.
//
// Y el gráfico «HH por mes» se AGRUPA EN EL SERVIDOR con `hhPorMes` —la misma función que llamaba el
// panel—, así que al navegador ya no viajan 2.069 filas: viajan cinco números por persona. La
// ventana de esos cinco meses la decide `desdeDeHHPorMes`, que vive al lado de `hhPorMes`: lo que se
// le pide a la base y lo que se dibuja son la misma decisión y no pueden separarse.
//
// ═══ UNA FUENTE QUE FALLÓ SE DICE CON SU ERROR ═══
//
// Una grilla vacía porque la RLS rechazó la consulta es indistinguible de una quincena sin cargar.
//
// ═══ Y UNA FUENTE QUE SE CORTÓ TAMPOCO SE PUEDE CALLAR (10/09/2026) ═══
//
// Esa ventana ancha es de 2.400 filas y PostgREST devolvía las primeras 1.000 con `error: null`:
// las de la quincena en curso, que son las más nuevas, quedaban afuera. La grilla dibujaba «·»
// sobre nueve horas trabajadas y el pie publicaba 206 h donde Asistencia mostraba 1.019. Las horas
// se leen ahora por `leerRegistrosHH`, la MISMA función que usa la solapa Asistencia: una fuente,
// una paginación, y un error declarado si la ventana no entra.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersonaDeGrilla } from './grillaHorasQuincena.ts'
import { desdeDeHHPorMes, hhPorMes } from './panelDePersona.ts'
import type { CorreccionDeDia, MesDeHH, RegistroDelPanel } from './panelDePersona.ts'
import type { PresenciaDeQuincena, RegistroDeQuincena } from './liquidacionQuincena.ts'
import { modalidadDe, type ModalidadDeLiquidacion } from './liquidacionQuincena.ts'
import { correrQuincena, type Quincena } from './quincena.ts'
import { leerRegistrosHH } from './registrosHHService.ts'
import { leerCuilesDelLegajo, leerPresenciasDeLaQuincena } from './lecturasCompartidasDeQuincena.ts'
import { esJefeDeObra } from './vocabularioPersona.ts'

export interface DatosDePersona {
  id: string
  legajo: { rotulo: string; valor: string | null; mono?: boolean }[]
  laboral: { rotulo: string; valor: string | null; mono?: boolean }[]
  asignacion: { rotulo: string; valor: string | null; mono?: boolean }[]
  encabezado: string
  nombre: string
  numeroLegajo: string | null
  valorHora: number | null
  convenio: string | null
  /** Los cinco meses del gráfico, YA SUMADOS. Antes viajaban las filas de cinco meses de las 17
   *  personas para que el panel las agrupara en el navegador: 2.069 filas para dibujar 85 barras. */
  mesesHH: MesDeHH[]
  registrosDeLaQuincena: RegistroDelPanel[]
  adelanto: number | null
}

export interface DatosDeLaSolapaHoras {
  personas: PersonaDeGrilla[]
  /**
   * `id` VIAJA DECLARADO, no «de hecho». La lectura ya lo pedía (línea 156) y el tipo no lo decía, así
   * que la vista «Quincena» —que escribe sobre el registro del día— tenía que adivinar que estaba ahí.
   * Un `id` que existe en el JSON y no en el tipo es una escritura esperando ir a ciegas.
   */
  registros: (RegistroDeQuincena & { persona_id: string; id: string })[]
  presencias: (PresenciaDeQuincena & { persona_id: string })[]
  porPersona: Record<string, DatosDePersona>
  correcciones: Record<string, CorreccionDeDia[]>
  cerrada: boolean
  errores: { que: string; error: string }[]
}

const numeroONulo = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const fechaCorta = (iso: string | null): string | null =>
  iso == null ? null : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/** El día de antes, en UTC. La ventana de los meses cierra acá para no traer dos veces la quincena. */
const diaAnterior = (iso: string): string =>
  new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) - 1))
    .toISOString().slice(0, 10)

interface FilaDirectorio {
  id: string; nombre_completo: string; en_la_empresa: boolean | null; categoria: string | null
  especialidad: string | null; puesto: string | null; fecha_ingreso: string | null
  fecha_egreso: string | null; cuadrilla: string | null; obra_actual: string | null
  rol_en_obra: string | null; asignada_desde: string | null; legajo: string | number | null
}

interface FilaPersona {
  id: string; dni: string | null; cuil: string | null; fecha_nacimiento: string | null
  nacionalidad: string | null; telefono: string | null; email: string | null
  domicilio: string | null; contacto_emergencia: string | null; convenio_colectivo: string | null
  modalidad_liquidacion: string | null; notas: string | null
}

/** Las tres columnas de la ventana de los meses. Todo lo que `hhPorMes` mira, y nada más. */
interface FilaDeMes { persona_id: string | null; fecha: string; horas: number | string | null }

interface FilaHH {
  id: string; persona_id: string; fecha: string; horas: number | string | null
  tipo_hora: string | null; notas: string | null; fuente_legacy: string | null
  created_at: string | null; creado_por: string | null
  obra_canonica: { nombre: string } | null
  obra_actividad: { nombre: string } | null
}

/**
 * LAS OCHO LECTURAS EN UNA TANDA. Ninguna depende de otra salvo los nombres de quien cargó, que
 * necesitan los ids de las filas de HH y por eso van en un segundo viaje.
 */
export async function getDatosDeLaSolapaHoras(
  supabase: SupabaseClient, q: Quincena,
): Promise<DatosDeLaSolapaHoras> {
  // EL 1º DEL MES MÁS VIEJO QUE EL GRÁFICO DIBUJA. Era `correrQuincena(q, -9).desde` —diez
  // quincenas— que no es lo mismo que cinco meses calendario: pedía medio mes de más y el gráfico
  // igual lo tiraba.
  const desdeDeLosMeses = desdeDeHHPorMes(q.hasta)
  // LAS CORRECCIONES NO CAMBIAN DE VENTANA. `corregido_en` es CUÁNDO alguien corrigió, no qué día
  // corrigió, y esa lectura ya era chica: tocarla acá sería un cambio de criterio colado dentro de
  // un cambio de performance.
  const desdeAncho = correrQuincena(q, -9).desde
  const [directorio, personas, tarifas, hh, mensuales, presencias, legajos, adelantos, cabeceras, correcciones] =
    await Promise.all([
      supabase.from('persona_directorio').select(
        'id, nombre_completo, en_la_empresa, categoria, especialidad, puesto, fecha_ingreso, ' +
        'fecha_egreso, cuadrilla, obra_actual, rol_en_obra, asignada_desde, legajo'),
      // ═══ EL LEGAJO SE LEE POR `persona_legajo`, NUNCA POR `personas` ═══
      //
      // Medido el 09/09/2026 con la sesión de Dirección: `personas` devuelve «permission denied for
      // table personas» y los ocho campos del bloque LEGAJO salían escritos «sin cargar» — una
      // afirmación falsa sobre el legajo de diecisiete personas producida por un control que no
      // pudo mirar. `persona_legajo` es la vista con portero que ya usa la ficha 360, y es el único
      // camino de la web a esos campos. `retribucion_pactada` sigue sin pedirse: su GRANT está
      // cerrado y el $/h que liquida es `persona_tarifa`.
      supabase.from('persona_legajo').select(
        'id, dni, cuil, fecha_nacimiento, nacionalidad, telefono, email, domicilio, ' +
        'contacto_emergencia, convenio_colectivo, modalidad_liquidacion, notas'),
      // `neto_mensual` VIAJA. Sin él, Oficina —que cobra un neto acordado y por definición no tiene
      // valor hora— salía «sin retribución cargada» y trababa el cierre desde esta pantalla.
      supabase.from('persona_tarifa')
        .select('persona_id, desde, valor_hora, neto_mensual').lte('desde', q.hasta),
      // LA QUINCENA, con todo lo que el detalle del día necesita: quién cargó, cuándo, en qué obra y
      // en qué actividad. Los dos nombres de obra viajan por `left join lateral`, que con la RLS de
      // `obra_canonica` cuesta una evaluación por fila: acá son 138, antes eran 2.069.
      leerRegistrosHH(supabase, {
        desde: q.desde,
        hasta: q.hasta,
        columnas: 'id, persona_id, fecha, horas, tipo_hora, notas, fuente_legacy, created_at, '
          + 'creado_por, obra_canonica(nombre), obra_actividad(nombre)',
      }),
      // LOS MESES DEL GRÁFICO, hasta el día ANTERIOR a la quincena. Tres columnas y ningún lateral:
      // `hhPorMes` suma `horas` por mes y no mira nada más. Pedirle acá el nombre de la obra sería
      // pagar 1.671 evaluaciones de `ve_obra()` para un gráfico de cinco barras.
      leerRegistrosHH(supabase, {
        desde: desdeDeLosMeses,
        hasta: diaAnterior(q.desde),
        columnas: 'persona_id, fecha, horas',
      }),
      // POR LA PUERTA COMPARTIDA: `getLiquidacionDeLaQuincena()` pide EXACTAMENTE esta consulta en
      // el mismo `Promise.all` de `SolapaHoras.tsx`. Eran dos viajes idénticos por render.
      leerPresenciasDeLaQuincena(supabase, q.desde, q.hasta),
      // El CUIL ya viene con el legajo; esta lectura queda para el día que el portero de la vista
      // deje afuera a alguien que igual tiene adelantos. Por la puerta compartida, por lo mismo
      // que las presencias: Liquidación pide estas dos columnas en el mismo render.
      leerCuilesDelLegajo(supabase),
      supabase.from('nomina_adelanto').select('cuil, importe')
        .gte('fecha', q.desde).lte('fecha', q.hasta),
      supabase.from('liquidacion_quincena').select('estado').eq('desde', q.desde).eq('hasta', q.hasta),
      supabase.from('registro_hh_correccion')
        .select('registro_id, horas_antes, horas_despues, autor, corregido_en')
        .gte('corregido_en', desdeAncho),
    ])

  const errores: { que: string; error: string }[] = []
  const anotar = (que: string, e: { message: string } | null) => {
    if (e) errores.push({ que, error: e.message })
  }
  anotar('el plantel', directorio.error)
  anotar('el legajo', personas.error)
  anotar('las tarifas', tarifas.error)
  anotar('las horas', hh.error == null ? null : { message: hh.error })
  // UNA LECTURA QUE FALLÓ NO ES UN GRÁFICO VACÍO: sin los meses, `hhPorMes` dibujaría «sin cargar»
  // en las cinco barras de las diecisiete personas, que es una afirmación sobre sus legajos.
  anotar('las horas de los meses anteriores', mensuales.error == null ? null : { message: mensuales.error })
  anotar('la presencia declarada', presencias.error)
  anotar('los adelantos', adelantos.error)
  anotar('el estado de la quincena', cabeceras.error)
  anotar('las correcciones', correcciones.error)

  const filasHH = (hh.data ?? []) as unknown as FilaHH[]
  // LAS DOS VENTANAS SE UNEN PARA EL GRÁFICO Y SÓLO PARA EL GRÁFICO: el mes en curso está partido
  // entre las dos lecturas —los meses llegan hasta el día ANTERIOR a la quincena— y sumar una sola
  // dibujaría la barra del mes actual a la mitad.
  const mesesDe = new Map<string, { fecha: string; horas: number | null }[]>()
  const anotarMes = (personaId: string | null, fecha: string, horas: unknown) => {
    if (!personaId) return
    const fila = { fecha, horas: numeroONulo(horas) }
    const suyas = mesesDe.get(personaId)
    if (suyas) suyas.push(fila)
    else mesesDe.set(personaId, [fila])
  }
  for (const f of (mensuales.data ?? []) as FilaDeMes[]) anotarMes(f.persona_id, f.fecha, f.horas)
  for (const f of filasHH) anotarMes(f.persona_id, f.fecha, f.horas)
  const nombres = await nombresDePerfil(supabase, [
    ...filasHH.map((f) => f.creado_por),
    ...((correcciones.data ?? []) as { autor: string | null }[]).map((c) => c.autor),
  ])

  const tarifaDe = vigentes((tarifas.data ?? []) as FilaTarifa[])
  const legajoDe = new Map(((personas.data ?? []) as unknown as FilaPersona[]).map((p) => [p.id, p]))
  const cuilDe = new Map(((legajos.data ?? []) as { id: string; cuil: string | null }[])
    .map((r) => [r.id, r.cuil]))
  const adelantoDe = new Map<string, number>()
  for (const a of (adelantos.data ?? []) as { cuil: string | null; importe: unknown }[]) {
    if (a.cuil) adelantoDe.set(a.cuil, (adelantoDe.get(a.cuil) ?? 0) + (numeroONulo(a.importe) ?? 0))
  }

  const directorioFilas = ((directorio.data ?? []) as unknown as FilaDirectorio[])
    .filter((p) => p.en_la_empresa !== false)
  const porPersona: Record<string, DatosDePersona> = {}
  for (const p of directorioFilas) {
    const suyas = filasHH.filter((f) => f.persona_id === p.id)
    const cuil = cuilDe.get(p.id) ?? legajoDe.get(p.id)?.cuil ?? null
    porPersona[p.id] = armarPersona(p, legajoDe.get(p.id), tarifaDe.get(p.id)?.valorHora ?? null, suyas, q, nombres,
      cuil ? (adelantoDe.get(cuil) ?? null) : null,
      // SIN LECTURA NO HAY GRÁFICO. `hhPorMes([])` devuelve cinco `null`, que el panel escribe «sin
      // cargar» — y eso es correcto sólo cuando la lectura SÍ se hizo. El error ya está anotado
      // arriba y la pantalla lo muestra; acá el gráfico queda como lo que es: sin dato.
      hhPorMes(mesesDe.get(p.id) ?? [], q.hasta))
  }

  return {
    personas: directorioFilas.map((p) => ({
      id: p.id,
      nombre: p.nombre_completo,
      // EL MISMO CORTE QUE EL PLANTEL Y LA ASISTENCIA: `esJefeDeObra(puesto)`, una sola definición.
      esJefe: esJefeDeObra(p.puesto),
      valorHora: tarifaDe.get(p.id)?.valorHora ?? null,
      netoMensual: tarifaDe.get(p.id)?.netoMensual ?? null,
      convenio: legajoDe.get(p.id)?.convenio_colectivo ?? null,
      // LA MISMA REGLA QUE `armarCuadros`: quien tiene neto mensual vigente es Oficina, el resto se
      // liquida por hora. El campo `modalidad_liquidacion` del legajo está vacío en las diecisiete
      // personas de la base y publicaba «Modalidad mensual sin cargar» sobre gente que cobra por mes.
      modalidad: modalidadDeLaTarifa(tarifaDe.get(p.id) ?? null),
    })),
    registros: filasHH
      .filter((f) => f.fecha >= q.desde && f.fecha <= q.hasta)
      .map((f) => ({
        // EL `id` VIAJA: es la fila sobre la que la vista «Quincena» escribe cuando se corrige un
        // día. La lectura ya lo pedía y el mapeo lo tiraba, así que la grilla tenía el número a la
        // vista y ninguna forma de decir a qué registro pertenecía.
        id: f.id,
        persona_id: f.persona_id, fecha: f.fecha, horas: numeroONulo(f.horas) ?? 0,
        tipo_hora: f.tipo_hora ?? 'normal', notas: f.notas,
      })),
    presencias: (presencias.data ?? []) as (PresenciaDeQuincena & { persona_id: string })[],
    porPersona,
    correcciones: agruparCorrecciones(correcciones.data, nombres),
    // FALLA CERRADO: si no se pudo leer el estado, la quincena se trata como sellada. Editar un día
    // de una quincena que quizá está cerrada reescribe plata ya firmada.
    cerrada: cabeceras.error != null
      || ((cabeceras.data ?? []) as { estado: string }[]).some((c) => c.estado === 'cerrada'),
    errores,
  }
}

interface FilaTarifa { persona_id: string; desde: string; valor_hora: unknown; neto_mensual: unknown }

/** Las dos mitades de la tarifa vigente. Exactamente una está cargada, nunca las dos. */
interface TarifaDeGrilla { valorHora: number | null; netoMensual: number | null }

/** La tarifa vigente de cada persona: la del `desde` más alto que no pasa de la quincena. */
function vigentes(filas: readonly FilaTarifa[]): Map<string, TarifaDeGrilla> {
  const m = new Map<string, TarifaDeGrilla & { desde: string }>()
  for (const f of filas) {
    const previa = m.get(f.persona_id)
    if (!previa || f.desde > previa.desde) {
      m.set(f.persona_id, {
        desde: f.desde,
        valorHora: numeroONulo(f.valor_hora),
        netoMensual: numeroONulo(f.neto_mensual),
      })
    }
  }
  return new Map([...m].map(([id, v]) => [id, { valorHora: v.valorHora, netoMensual: v.netoMensual }]))
}

/**
 * EL CORTE OBRERO/OFICINA, POR LA FUNCIÓN DE LA LIQUIDACIÓN.
 *
 * `armarCuadros` manda a Oficina a quien tiene neto mensual vigente; `modalidadDe` traduce el
 * cuadro a la modalidad. Escribir acá `netoMensual != null ? 'mensual' : 'hora'` sería la misma
 * cuenta con otra cara y se despegaría de la liquidación en el primer cambio de criterio.
 */
function modalidadDeLaTarifa(t: TarifaDeGrilla | null): ModalidadDeLiquidacion {
  return modalidadDe(t?.netoMensual != null ? 'oficina' : 'obreros')
}

function agruparCorrecciones(
  data: unknown, nombres: Map<string, string>,
): Record<string, CorreccionDeDia[]> {
  const filas = (data ?? []) as {
    registro_id: string; horas_antes: unknown; horas_despues: unknown
    autor: string | null; corregido_en: string
  }[]
  const out: Record<string, CorreccionDeDia[]> = {}
  for (const f of filas) {
    (out[f.registro_id] ??= []).push({
      horasAntes: numeroONulo(f.horas_antes),
      horasDespues: numeroONulo(f.horas_despues),
      autor: f.autor ? (nombres.get(f.autor) ?? null) : null,
      corregidoEn: f.corregido_en,
    })
  }
  return out
}

/** Los cuatro bloques del legajo real. «sin cargar» lo escribe la pantalla: acá `null` viaja como es. */
function armarPersona(
  p: FilaDirectorio, l: FilaPersona | undefined, valorHora: number | null,
  suyas: FilaHH[], q: Quincena, nombres: Map<string, string>, adelanto: number | null,
  mesesHH: MesDeHH[],
): DatosDePersona {
  const convenio = l?.convenio_colectivo ?? null
  return {
    id: p.id,
    nombre: p.nombre_completo,
    numeroLegajo: p.legajo == null ? null : String(p.legajo),
    valorHora,
    convenio,
    encabezado: [p.especialidad, convenio, p.fecha_ingreso ? `en la empresa desde ${fechaCorta(p.fecha_ingreso)}` : null]
      .filter(Boolean).join(' · '),
    legajo: [
      { rotulo: 'DNI', valor: l?.dni ?? null, mono: true },
      { rotulo: 'CUIL', valor: l?.cuil ?? null, mono: true },
      { rotulo: 'Nacimiento', valor: fechaCorta(l?.fecha_nacimiento ?? null), mono: true },
      { rotulo: 'Nacionalidad', valor: l?.nacionalidad ?? null },
      { rotulo: 'Teléfono', valor: l?.telefono ?? null },
      { rotulo: 'Email', valor: l?.email ?? null },
      { rotulo: 'Domicilio', valor: l?.domicilio ?? null },
      { rotulo: 'Emergencia', valor: l?.contacto_emergencia ?? null },
    ],
    laboral: [
      { rotulo: 'Legajo', valor: p.legajo == null ? null : String(p.legajo), mono: true },
      { rotulo: 'Ingreso', valor: fechaCorta(p.fecha_ingreso), mono: true },
      // NO EGRESÓ NO ES «SIN CARGAR»: es una afirmación sobre el legajo, y la pantalla la dice.
      { rotulo: 'Baja', valor: p.fecha_egreso ? fechaCorta(p.fecha_egreso) : 'no egresó', mono: true },
      { rotulo: 'Convenio', valor: convenio },
      { rotulo: 'Categoría', valor: p.categoria },
      { rotulo: 'Oficio', valor: p.especialidad },
      { rotulo: 'Puesto', valor: p.puesto },
      { rotulo: 'Modalidad', valor: l?.modalidad_liquidacion ?? null },
      { rotulo: 'Retribución', valor: valorHora == null ? null : `${valorHora.toLocaleString('es-AR')} $/h` },
      { rotulo: 'Notas', valor: l?.notas ?? null },
    ],
    asignacion: [
      { rotulo: 'Obra', valor: p.obra_actual },
      { rotulo: 'Actividad', valor: null },
      { rotulo: 'Cuadrilla', valor: p.cuadrilla },
      { rotulo: 'Rol', valor: p.rol_en_obra },
      { rotulo: 'Desde', valor: fechaCorta(p.asignada_desde), mono: true },
    ],
    mesesHH,
    registrosDeLaQuincena: suyas
      .filter((f) => f.fecha >= q.desde && f.fecha <= q.hasta)
      .map((f) => ({
        id: f.id,
        fecha: f.fecha,
        horas: numeroONulo(f.horas),
        tipo_hora: f.tipo_hora,
        obra: f.obra_canonica?.nombre ?? null,
        actividad: f.obra_actividad?.nombre ?? null,
        cargo: f.creado_por ? (nombres.get(f.creado_por) ?? null) : null,
        fuenteLegacy: f.fuente_legacy,
        creadoEn: f.created_at,
      })),
    adelanto,
  }
}

/** Los nombres de quien cargó y de quien corrigió. `actualizado_por` no tiene FK: va por ids. */
async function nombresDePerfil(
  supabase: SupabaseClient, ids: (string | null)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))] as string[]
  const m = new Map<string, string>()
  if (unicos.length === 0) return m
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', unicos)
  for (const p of (data ?? []) as { id: string; nombre: string | null }[]) {
    if (p.nombre) m.set(p.id, p.nombre)
  }
  return m
}
