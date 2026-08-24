// LA CABECERA DE LA OBRA — UNA SOLA, PARA TODAS LAS PANTALLAS DE LA OBRA.
//
// ═══ QUÉ DEFECTO CIERRA (QA 24/08 · C-CANON §12) ═══
//
// El workspace (`/obras/<obra>`) dibujaba `EntityHeader` + solapas sobre el fondo del OS, y sus
// cuatro pantallas hijas —Cronograma, Dotación, Subcontratos, Avance masivo— una banda grafito
// propia con KPI adentro. Eran dos cabeceras distintas para la MISMA entidad: entrar al cronograma
// parecía entrar a otra aplicación, y desde ahí no había forma de volver a Personal o a Economía
// sin pasar por el workspace. El contrato (pantallas 03/05/06/07/08/10) muestra en las cuatro la
// misma cabecera del workspace, con las seis solapas de la obra visibles.
//
// ═══ POR QUÉ RECIBE LA OBRA YA LEÍDA ═══
//
// No consulta nada. Las cuatro páginas ya leen `obra_panel` para lo suyo; una lectura propia acá
// sería una quinta consulta por visita para repetir un dato que la página tiene en la mano — y el
// día que las dos lecturas discrepen, el título diría una cosa y el cuerpo otra.
//
// ═══ LO QUE ESTA CABECERA NO HACE ═══
//
// NO DIBUJA EL TRACKER DE ETAPAS. Acá iba `<CicloDeVida>`: las cinco etapas en fila con la actual
// resaltada. Los mockups 02 y 03 —que son LA cabecera de la obra— no lo dibujan, y mirándolo de
// cerca decía dos veces lo mismo: la etapa vigente ya está escrita en la línea de identidad
// («Etapa: Estructura»), y lo único que el tracker agregaba era la SECUENCIA de las cinco, que es
// información de plan y no de identidad. Ocupaba además el ancho entero de la derecha, que es
// donde el zip pone las acciones. El componente `CicloDeVida.tsx` NO se borró y sigue exportado:
// retirar un uso es reversible en una línea; borrar el componente, no. Si el dueño lo quiere de
// vuelta, el lugar que le corresponde es la solapa Resumen o el menú «···», no la cabecera.
//
// No dibuja el nivel 3. El contrato marca en la 07 la sub-solapa «Cronograma» como activa, pero en
// este repositorio «Cronograma» es la sub-vista `?vista=tareas&sub=gantt` —el plan COMO ESTÁ
// CARGADO— y esta pantalla es otra cosa: el plan COMO LO IMPLICA LA SECUENCIA (ver el bloque largo
// de `services/vistasObra.ts`). Marcar esa sub-solapa como activa afirmaría que son la misma vista.
// Mientras esa ambigüedad no la resuelva el dueño, la pantalla se identifica por su nombre en la
// línea meta —que es honesto y no inventa navegación— y el nivel 3 lo pone cada página cuando su
// mapeo es inequívoco (Subcontratos).

import Link from 'next/link'
import type { ReactNode } from 'react'
import { EntityHeader, Tabs } from '@/shared/components/ds'
import { EstadoChip } from './EstadoChip'
import { fechaCorta } from './formato'
import { ETAPA_LABEL, type Etapa, type ObraPanel } from '../types'
import { VISTAS_OBRA, type VistaObra } from '../services/vistasObra'

/** Lo único que la cabecera necesita de la obra. Un `Pick` y no `ObraPanel` entero: así se ve de un
 *  vistazo qué la rompe si un día la vista cambia, y una página puede armarlo sin traer las 40
 *  columnas del panel. */
export type ObraDeCabecera = Pick<
  ObraPanel,
  'nombre' | 'estado' | 'etapa' | 'cliente_slug' | 'cliente_nombre' | 'cliente_texto'
  | 'fecha_inicio_plan' | 'fecha_fin_plan'
>

/**
 * Un número que contesta la pregunta de ESTA pantalla, no de la obra.
 *
 * `valor: null` NO se dibuja como 0 ni como un guión: se dibuja con la palabra de `falta` («sin
 * secuencia», «sin cargar»), porque «no lo sé» y «es cero» son dos hechos distintos y confundirlos
 * en una pantalla de plazos ya costó caro.
 */
export type KpiPantalla = {
  rotulo: string
  valor: ReactNode | null
  falta?: string
}

/** Los campos de identidad de la obra: los MISMOS en las cinco pantallas, calculados una sola vez.
 *  Rotulados desde el 20/08 — «La Estrella · 06/07/26 → 22/08/26» obligaba a adivinar cuál era el
 *  cliente, cuál la etapa y cuál de las dos fechas era el fin. */
function camposDeIdentidad(obra: ObraDeCabecera) {
  // El cliente es un LINK cuando existe en el eje canónico. Cuando la obra sólo tiene el nombre
  // escrito a mano, se muestra el texto y se dice que falta vincularlo: la ficha no se inventa.
  const deQuien = obra.cliente_slug ? (
    <Link href={`/clientes/${obra.cliente_slug}`} prefetch={false} className="text-ink hover:underline">
      {obra.cliente_nombre}
    </Link>
  ) : obra.cliente_texto ? (
    <>{obra.cliente_texto} <span className="text-faint">· sin ficha de cliente vinculada</span></>
  ) : null

  // EL PLAZO ES UN SOLO CAMPO, NO DOS (mockup 02/03: «03/08 → 05/09»). «Inicio: 03/08 · Fin plan:
  // 05/09» son dos islas que el ojo tiene que volver a juntar para leer un plazo, que es lo único
  // que significan. Cuando falta UNA de las dos NO se dibuja media flecha: se nombra cuál falta,
  // porque «empieza el 03/08 y no sé cuándo termina» es un hecho distinto de «no tiene plan».
  //
  // `fechaCorta` (dd/mm) y no `fecha` (dd/mm/aa) porque es lo que mide el zip. Se pierde el año:
  // aceptable en la cabecera de UNA obra abierta —el año lo da el contexto y está en Economía y en
  // el cronograma—, y sería inaceptable en una tabla de cartera, que compara obras de años
  // distintos. Por eso el cambio vive acá y no en el formateador.
  const desde = obra.fecha_inicio_plan ? fechaCorta(obra.fecha_inicio_plan) : null
  const hasta = obra.fecha_fin_plan ? fechaCorta(obra.fecha_fin_plan) : null
  const plazo = desde && hasta ? <span className="tabular-nums">{desde} → {hasta}</span> : null
  const faltaPlazo = desde ? 'sin fecha de fin' : hasta ? 'sin fecha de inicio' : 'sin fechas de plan'

  return [
    // El cliente va SIN rótulo, como en el zip: nadie necesita que le digan que «Orica» es el
    // cliente de la obra. La etapa sí lo lleva, porque «Estructura» sola no dice de qué es.
    ...(deQuien ? [{ rotulo: '', valor: deQuien }] : []),
    {
      rotulo: 'Etapa',
      valor: obra.etapa ? (ETAPA_LABEL[obra.etapa as Etapa] ?? obra.etapa) : null,
      falta: 'sin declarar',
    },
    { rotulo: '', valor: plazo, falta: faltaPlazo },
  ]
}

export function CabeceraDeObra({
  obraId, obra, vistaActiva, pantalla, kpis = [], acciones,
  volverA = '/obras', volverLabel = 'Obras',
}: {
  obraId: string
  obra: ObraDeCabecera
  /**
   * A dónde vuelve. Por defecto al portafolio, que es la migaja del contrato («Obras / <obra>»):
   * las seis solapas ya llevan a cualquier parte de la obra, así que la flecha sube un nivel.
   *
   * Se puede cambiar, y hay un caso donde hay que hacerlo: la pantalla de registrar avance se abre
   * DESDE una actividad concreta y su vuelta es a esa actividad. Mandarla al portafolio la
   * obligaría a buscar de nuevo la fila que acababa de tocar.
   */
  volverA?: string
  volverLabel?: ReactNode
  /** La solapa de nivel 2 a la que pertenece esta pantalla. El contrato la marca activa aunque la
   *  URL no sea la del workspace: Cronograma y Subcontratos SON Trabajo, Dotación ES Personal. */
  vistaActiva?: VistaObra
  /** Cómo se llama esta pantalla dentro de la obra. En el workspace no va: la solapa activa ya lo
   *  dice. En las hijas es lo único que las distingue entre sí, porque comparten solapa activa. */
  pantalla?: ReactNode
  kpis?: KpiPantalla[]
  /** Lo que se puede hacer desde acá (acciones rápidas, archivar, sellar). Lo pone cada página:
   *  no son de la obra, son de la pantalla. */
  acciones?: ReactNode
}) {
  const archivada = obra.estado === 'cerrada'
  const hayMeta = pantalla != null || kpis.length > 0

  return (
    <>
      <EntityHeader
        volverA={volverA}
        volverLabel={volverLabel}
        titulo={obra.nombre}
        campos={camposDeIdentidad(obra)}
        // EL ESTADO, PEGADO AL TÍTULO Y EN PASTILLA (mockup 02/03: «Escuela San Juan  [En
        // ejecución]»). Es el mismo `EstadoChip` que pintan la cartera y las tablas de actividades:
        // una obra no puede verse «En ejecución» en la lista y de otro color en su propia ficha.
        derecha={
          <div className="flex flex-wrap items-center gap-2" data-testid="cabecera-obra">
            <EstadoChip estado={obra.estado} />
            {/* ARCHIVADA SE DICE EN EL ENCABEZADO: es la única señal de que esta ficha se abrió por
                su URL y no desde el portafolio —porque del portafolio ya no cuelga—, y sin ella
                alguien podría cargar HH o avance sobre una obra archivada sin enterarse. */}
            {archivada && (
              <span className="rounded border border-line px-1.5 py-[1px] text-[11px] text-faint" data-testid="obra-archivada">
                archivada
              </span>
            )}
          </div>
        }
        acciones={acciones}
      />

      {/* LA LÍNEA META — el renglón que el contrato pone entre el título y las solapas (07, 08, 06):
          de qué pantalla se trata y los dos o tres números que contesta.
          EL KPI PROYECTADO NO VA EN AMARILLO acá: sobre el fondo claro del OS el amarillo de marca
          no llega al contraste mínimo de texto. El rótulo ya dice «Fin proyectado» — lo que en la
          banda grafito hacía el color, acá lo hace la palabra, que además se lee en blanco y negro. */}
      {hayMeta && (
        <div
          className="-mt-1 mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12px]"
          data-testid="kpis-obra"
        >
          {pantalla != null && <span className="font-medium text-ink">{pantalla}</span>}
          {kpis.map((k) => (
            <span key={k.rotulo} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-faint">{k.rotulo}:</span>
              {k.valor == null || k.valor === ''
                ? <span className="text-faint italic">{k.falta ?? 'sin dato'}</span>
                : <span className="tabular-nums text-ink-soft">{k.valor}</span>}
            </span>
          ))}
        </div>
      )}

      {/* Nivel 2: las SEIS solapas de la obra, iguales en las cinco pantallas. Los `href` vuelven al
          workspace y `Tabs` ya los emite con `prefetch={false}` — seis rutas `force-dynamic`
          prefetcheadas por página vista son seis renders de servidor que nadie pidió. */}
      <Tabs
        testid="tabs-obra"
        tabs={VISTAS_OBRA.map((v) => ({
          href: `/obras/${obraId}?vista=${v.id}`,
          label: v.label,
          activo: vistaActiva === v.id,
          testid: `tab-${v.id}`,
        }))}
      />
    </>
  )
}
