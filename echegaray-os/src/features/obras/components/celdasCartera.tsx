// LAS CELDAS DE LA CARTERA DE OBRAS — una columna, una decisión de lectura.
//
// ═══ POR QUÉ NO VIVEN EN LA PÁGINA ═══
//
// Estaban en `app/(main)/obras/page.tsx`. Con las columnas que agregó el Design canónico 01 —estado
// y HH— ese archivo pasaba de 500 líneas, que es el tope del repo, y la mitad de lo que tenía no era
// la página: era CÓMO se escribe cada dato. La página decide qué se lee, con qué permiso y en qué
// orden; acá vive la regla de cada celda, que es lo que hay que poder revisar de un vistazo cuando
// se discute si un «$0» es un dato o un hueco.
//
// LA REGLA COMÚN A TODAS: la ausencia se escribe con la palabra que le corresponde —«sin cargar»,
// «sin plan», «sin comprobantes»— y nunca con un cero. Un cero es una afirmación.

import Link from 'next/link'
import { Estado, Nulo, Num } from '@/shared/components/ds'
import { IconoCompletar, IconoHH, IconoProblema } from '@/shared/components/iconos'
import { ETAPAS, ETAPA_LABEL, type ObraPanel } from '@/features/obras/types'
// El tipo de lo que la cartera LEE, no el de la vista entera: `getPlanVsRealPortafolio` pide siete
// columnas y estas dos celdas son las únicas que las dibujan. Pedir el tipo ancho acá obligaba a
// traer las ~40 columnas de `obra_plan_vs_real` para usar siete.
import type { PlazoYHHDeCartera } from '@/features/obras/services/obrasService'
import { PALABRA_SEMAFORO, type Semaforo } from '@/features/obras/services/ganttObras'
import { tituloImpedimentos } from '@/features/obras/services/senalesCartera'

/**
 * `dd/mm` A PARTIR DEL TEXTO ISO, sin `new Date` y sin `Intl`. Dos razones, las dos ya pagadas:
 * `new Date('2026-08-04')` sobre una fecha sin hora abre la puerta al corrimiento de un día por
 * huso horario, y el patrón de `es-AR` es `d/M/yy`, así que `toLocaleDateString` con `2-digit`
 * devuelve `4/8` — un ancho que cambia de fila en fila en una columna que existe para comparar.
 */
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * PLAZO — una de las dos preguntas que hacen que la cartera sirva de tablero: ¿esta obra llega?
 * Sale de `obra_plan_vs_real`, la misma vista que la ficha, y NO se recalcula acá: si la cartera
 * hiciera su propia cuenta, un día diría una cosa distinta de la ficha de la obra y no habría
 * manera de saber cuál de las dos miente.
 */
export function Plazo({ p }: { p: PlazoYHHDeCartera | undefined }) {
  if (!p) return <Nulo>sin plan</Nulo>
  if (p.desvio_plazo_dias != null) {
    const d = p.desvio_plazo_dias
    // ═══ EL CERO DECÍA «EN FECHA» EN VERDE, Y NO ES ESO LO QUE MIDE (20/08/2026) ═══
    //
    // `desvio_plazo_dias` compara el fin PLANIFICADO contra el fin de la LÍNEA BASE. Medido contra
    // producción hoy, las once obras vivas con fechas tienen `fin_base == fin_plan` —el sellado
    // copió el plan— así que el desvío da 0 en TODAS, y la columna pintaba once «en fecha» en
    // verde. Entre ellas, la Oficina de La Estrella: terminaba el 04/08, hoy es el 20 y va 94%.
    //
    // Es un control validado contra la misma información que produce, y encima en el color que
    // significa «esto está bien». El número no se toca —es el de la ficha, y las dos tienen que
    // decir lo mismo— pero se lo nombra por lo que mide y se le saca el verde: verde es «dentro de
    // objetivo real», y acá lo único comprobado es que el plan no se movió. Si la obra LLEGA lo
    // contesta el Gantt de cartera, que compara el avance contra el calendario consumido.
    if (d === 0) {
      return (
        <span
          className="font-mono text-[12.5px] tabular-nums text-muted"
          title="El fin planificado coincide con la línea base sellada: el plan no se corrió. No dice si la obra llega — eso lo contesta el Gantt de cartera."
        >sin corrimiento</span>
      )
    }
    return (
      <Num className={d > 0 ? 'font-medium text-neg' : 'text-pos'}>
        {d > 0 ? `+${d} d` : `${d} d`}
      </Num>
    )
  }
  // SIN LÍNEA BASE NO HAY DESVÍO, Y UN CERO SERÍA UNA MENTIRA PROLIJA: diría "vamos en fecha"
  // cuando nadie aprobó todavía una fecha contra la cual medir. Se dice la fecha de fin que sí
  // existe, y al lado por qué no hay desvío.
  return (
    <span className="block leading-tight">
      {p.fin_plan
        ? <Num className="text-muted">fin {ddmm(p.fin_plan)}</Num>
        : <Nulo>sin fechas</Nulo>}
      <span className="mt-0.5 block text-[11px] text-faint" data-nulo="">sin línea base</span>
    </span>
  )
}

/** La etapa se lee de un vistazo por su posición en la línea, no por un color arbitrario. */
export function Etapa({ etapa }: { etapa: ObraPanel['etapa'] }) {
  // Sin etapa declarada NO se dibuja una: el default de la columna ponía "Desarrollo" hasta en una
  // obra cerrada, y un default presentado como estado del ciclo de vida es un dato fabricado.
  if (!etapa) return <Nulo>etapa sin declarar</Nulo>
  const i = ETAPAS.indexOf(etapa)
  return (
    <span className="inline-flex items-center gap-2" title={ETAPA_LABEL[etapa]}>
      <span className="flex gap-[3px]">
        {ETAPAS.map((_, k) => (
          <i key={k} className={`h-1.5 w-1.5 rounded-full ${k <= i ? 'bg-accent' : 'bg-line-strong'}`} />
        ))}
      </span>
      <span className="text-[12px] text-muted">{ETAPA_LABEL[etapa]}</span>
    </span>
  )
}

// EL AVANCE, SIN LA COBERTURA. Hasta el 19/08 esta celda publicaba también «24/80» —sobre cuántas
// actividades se tomó el promedio—, y era correcto: un promedio sin su población es medio dato. Se
// saca de ACÁ igual, porque contar actividades es exactamente el tipo de detalle que el dueño mandó
// bajar al workspace de la obra. La cobertura sigue publicada en la ficha, al lado del cronograma
// que la explica. El cálculo no cambia: sigue siendo la vista `obra_avance`, la única del OS.
//
// LA BARRA ES GRAFITO. Era `bg-sky-600`, un color que no existe en `design/system/COLOR.md`: *"Un
// color que aparece en una pantalla y no está en esta tabla es un error"*. El avance no es un
// estado —estar al 40% no es bueno ni malo—, así que se pinta con la estructura, no con semántica.
export function Avance({ pct, total }: { pct: number | null; total: number }) {
  if (pct == null) return <Nulo>{total ? 'sin avance cargado' : 'sin cronograma'}</Nulo>
  return (
    <span className="flex items-center gap-2.5">
      <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface-sunken">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <Num className="w-9 shrink-0 text-right text-ink">{pct}%</Num>
    </span>
  )
}

/**
 * ESTADO — la situación de la obra en una palabra, con su punto (Design canónico 01).
 *
 * ═══ LA CARTERA NO DECÍA SI UNA OBRA ESTABA PAUSADA ═══
 *
 * `obra_panel.estado` distingue `activa`, `pausada` y `cerrada`, y ninguna columna lo mostraba: una
 * obra frenada hace tres semanas se leía exactamente igual que una que se está ejecutando hoy. La
 * etapa no lo contesta —una obra pausada sigue teniendo etapa— y el pie de archivadas sólo habla de
 * las cerradas.
 *
 * EL ATRASO SE PEGA AL ESTADO, y no es un semáforo nuevo: sale de `desvioDePlazo`, la MISMA función
 * que pinta las barras de la línea de tiempo. Si las dos vistas de la cartera dieran atrasos
 * distintos de la misma obra, no habría forma de saber cuál miente.
 *
 * PUNTO + PALABRA, NUNCA PASTILLA DE COLOR (`COMPONENTS.md` §Status badges): trece pastillas
 * rellenas convierten la columna de estado en lo más ruidoso de una pantalla donde el estado casi
 * nunca es lo que se vino a leer.
 */
export function EstadoObra({ estado, semaforo }: { estado: string; semaforo: Semaforo }) {
  if (estado === 'cerrada') return <Estado tono="pos" clave="cerrada">terminada</Estado>
  // PAUSADA VA EN PUNTO HUECO, no en rojo: parar una obra puede ser una decisión tomada, no un
  // problema. Lo que sí es un problema —que no avance sin que nadie lo haya decidido— lo dice el
  // atraso de la de al lado.
  if (estado === 'pausada') return <Estado tono="pendiente" clave="pausada">pausada</Estado>
  // UN ESTADO QUE ESTA PANTALLA NO CONOCE SE MUESTRA COMO VINO. Si mañana la base agrega uno, el
  // default de «en ejecución» afirmaría que la obra está trabajando sin que nadie lo haya dicho.
  if (estado !== 'activa') return <Estado tono="pendiente" clave={estado}>{estado}</Estado>
  if (semaforo === 'atraso_critico') {
    return <Estado tono="neg" clave="atraso_critico">en ejecución · {PALABRA_SEMAFORO.atraso_critico}</Estado>
  }
  if (semaforo === 'atraso_menor') {
    return <Estado tono="warn" clave="atraso_menor">en ejecución · {PALABRA_SEMAFORO.atraso_menor}</Estado>
  }
  // `sin_datos` NO agrega palabra: el hueco que lo produce —sin fechas o sin avance— ya está escrito
  // en las columnas de PLAZO y AVANCE, y repetirlo acá ensancha la columna sin decir nada nuevo.
  return <Estado tono="curso" clave="activa">en ejecución</Estado>
}

/**
 * HH — imputadas contra planificadas. Es la tercera dimensión de la obra (`design/README.md`: *"HH
 * no es avance. Van al lado, con su propio rótulo"*), y el dato ya viajaba en la misma lectura del
 * plazo sin que ninguna columna lo usara.
 *
 * SIN PLAN NO HAY «/ 0»: se dice «sin plan». Y sin imputar no es cero horas trabajadas, es que
 * todavía no se imputó ninguna — dos huecos distintos con dos palabras distintas.
 */
export function HH({ p }: { p: PlazoYHHDeCartera | undefined }) {
  const plan = p?.hh_plan ?? p?.hh_estimada ?? null
  const real = p?.hh_real ?? null
  const n = (x: number) => Math.round(x).toLocaleString('es-AR')
  if (real == null && plan == null) return <Nulo>sin plan</Nulo>
  if (real == null) return <span className="text-faint" data-nulo="">sin imputar / {n(plan!)}</span>
  // EL COLOR SÓLO CUANDO PASA EL PLAN, que es lo único que hay que ir a mirar. Un 41% consumido no
  // es una noticia; haberse pasado, sí.
  const excedida = plan != null && real > plan
  return (
    <span className={excedida ? 'text-warn' : undefined} title={excedida ? 'HH imputadas por encima del plan' : undefined}>
      {n(real)} / {plan == null ? 'sin plan' : n(plan)}
    </span>
  )
}

/**
 * «HOY» — columna propia (Design canónico 01: encabezado HOY, celda centrada, icono de 14px).
 *
 * ═══ LOS DOS ICONOS DEL CANON, Y QUÉ AFIRMA CADA UNO ═══
 *
 * El check verde afirma un HECHO: hoy se cargó parte de ejecución en esa obra. El reloj ámbar
 * afirma OTRO hecho, y sólo ése: todavía no se cargó. No dice que la obra esté parada ni que nadie
 * haya trabajado —eso no lo sabe el OS a las nueve de la mañana— y por eso el título lo escribe con
 * «todavía» y el icono es un reloj, no una alarma. Hasta el 24/08 la señal negativa no se dibujaba
 * por miedo a que gritara toda la mañana; el canon la dibuja y la fila muda era peor: no se
 * distinguía «no cargó» de «esta obra no lleva parte».
 *
 * SÓLO SOBRE OBRAS ACTIVAS. A una obra pausada o cerrada nadie le espera un parte, así que ahí la
 * celda queda vacía en vez de mentir un pendiente.
 */
export function SenalHoy({ conParte, activa }: { conParte: boolean; activa: boolean }) {
  if (conParte) {
    return (
      <span
        className="inline-flex text-pos"
        title="Hoy se cargó parte de ejecución en esta obra"
        data-testid="senal-hoy"
      >
        <IconoCompletar className="h-[14px] w-[14px]" />
      </span>
    )
  }
  if (!activa) return null
  return (
    <span
      className="inline-flex text-warn"
      title="Todavía no se cargó parte de ejecución hoy. No dice que la obra esté parada."
      data-testid="senal-sin-parte"
    >
      <IconoHH className="h-[14px] w-[14px]" />
    </span>
  )
}

/**
 * ⚠ N — impedimentos ABIERTOS de la obra (Design canónico 01, la columna del triángulo).
 *
 * Es el único dato de la cartera que no describe cómo viene la obra sino qué hay que ir a destrabar
 * hoy, y por eso entra en una pantalla que el dueño mandó no convertir en dashboard: no es un
 * indicador, es una fila de trabajo esperando a alguien.
 *
 * EL NÚMERO VA AL LADO DEL ICONO: un triángulo solo dice «pasa algo» y obliga a entrar a la obra
 * para saber si es uno o son nueve.
 *
 * COLUMNA PROPIA, CON EL GUION DEL CANON. Ahora que la señal tiene su columna, el «—» significa lo
 * que el canon quiere que signifique: contamos y no hay ninguno. Cuando la consulta NO se pudo
 * hacer llega `null` y la celda queda vacía —un control que no pudo mirar no dice «no hay»—; el pie
 * de la pantalla nombra la lectura caída.
 */
export function SenalImpedimentos({ n }: { n: number | null }) {
  if (n == null) return null
  if (n <= 0) return <span className="text-faint" data-nulo="">—</span>
  return (
    <span
      className="inline-flex items-center gap-1 text-warn"
      title={tituloImpedimentos(n)}
      data-testid="senal-impedimentos"
      data-impedimentos={n}
    >
      {/* 14px, el tamaño del canon. El icono es el de `/campo` re-exportado por el design system:
          el mismo triángulo que ve el jefe en el teléfono cuando reporta el problema. */}
      <IconoProblema className="h-[14px] w-[14px]" />
      <Num className="text-[11.5px]">{n}</Num>
    </span>
  )
}

/**
 * LA CELDA DEL CLIENTE — el segundo eje de la jerarquía, y la única puerta al CRM desde esta
 * pantalla.
 *
 * El cliente que manda es el CANÓNICO (`cliente_slug` + `cliente_nombre`). `cliente_texto` es lo
 * que decía la fuente y se conserva como procedencia: tres obras de La Estrella eran tres cadenas
 * iguales de casualidad, no un cliente. Cuando sólo existe el texto se muestra el texto y no se
 * enlaza — vincularlo es trabajo de Administración, no una suposición de esta tabla.
 */
export function Cliente({ o }: { o: ObraPanel }) {
  if (o.cliente_slug && o.cliente_nombre) {
    return (
      <Link href={`/clientes/${o.cliente_slug}`} prefetch={false} className="text-ink transition-colors hover:underline">
        {o.cliente_nombre}
      </Link>
    )
  }
  const texto = o.cliente_nombre ?? o.cliente_texto
  if (texto) return <span className="text-ink-soft">{texto}</span>
  return <Nulo>sin cliente declarado</Nulo>
}
