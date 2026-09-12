// PANTALLA 1 DEL HANDOFF v2: «Horas · la quincena del plantel».
//
// 13 columnas de día × el plantel, con las horas esperadas por la JORNADA REAL (9 h de lunes a
// jueves, 8 los viernes) y no por un promedio. Las medidas salen del mockup
// `design/Liquidación de horas v2.dc.html`, que manda sobre el texto del README: fila 52–58 px,
// encabezado de columna 36 px alineado abajo, control 26 px, botón 30 px.
//
// ═══ EL PANEL DE LA DERECHA SE FUE, Y LO PIDIÓ EL DUEÑO (10/09/2026) ═══
//
// *«qué es la información que refleja la sección de la derecha, pésima UX, no sirve así»*. El
// mockup dibuja los filtros a la derecha y hasta hoy eso mandaba; una queja del dueño sobre la
// pantalla real le gana a un lienzo, y el propio README del handoff dice que el zip manda en lo
// COSMÉTICO. Esto no era cosmético: eran 230 px permanentes ocupados por cosas que no se deciden.
//
// Lo que había, y qué se hizo con cada cosa:
//
//   PERÍODO      DECIDE → subió a la cabecera, en línea y sin cortar el rótulo («1ª quincena de
//                septiemb…» era el mismo texto que ahora entra entero).
//   QUIÉN        Modalidad hora / mensual repetía el corte que la tabla YA hace con sus dos grupos
//                («JEFES DE OBRA · 2», «OBREROS · 15») → se fue.
//   CONVENIO     no se actúa sobre él, y el rótulo salía cortado («UOCRA — Ley 22.250 (const…»);
//                el convenio de cada persona está en su panel → pasó al `title` del pie.
//   PENDIENTE    ES lo accionable → quedó, arriba de la tabla, con el recorte a un clic y con cómo
//                quitarlo cuando está puesto.
//   PROYECCIÓN   seis renglones y dos párrafos para un total que la columna «Cobra est.» YA suma en
//                el pie → una línea con blanco y efectivo, y el desglose en el `title`.
//   Cargadas /   estaban dos veces en la misma pantalla: el pie de la tabla las publica en su
//   Esperadas    columna → se fueron del panel.
//
// «No párrafos explicativos permanentes» y «no tarjetas por cada dato» son dos de las 25 reglas del
// dueño, y el panel violaba las dos.
//
// ═══ ES PRESENTACIONAL A PROPÓSITO ═══
//
// No lee la base y no escribe: recibe filas y resumen ya calculados por `grillaHorasQuincena.ts`,
// que es donde vive la regla y donde está probada. Una grilla que además consultara sería la
// segunda definición de «cuántas horas esperaba esta quincena».
//
// ═══ EL BOTÓN GRIS DICE POR QUÉ ═══
//
// Mientras haya una ausencia sin motivo, alguien sin retribución cargada o un día vencido sin
// cargar, cerrar está deshabilitado y debajo se publica la lista de lo que lo traba. Un botón
// apagado sin explicación obliga a adivinar, y lo que se adivina se cierra igual.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import type {
  CeldaDeGrilla, EstadoDeFila, FilaDeGrilla, ResumenDeGrilla,
} from '../../services/grillaHorasQuincena'
import type { ProyeccionDeFila, ProyeccionDeQuincena } from '../../services/proyeccionDeMasa'
import { repartoDelAcuerdo } from '../../services/liquidacionAcuerdo'
import { ALTO_LIQ, COLUMNA_FIJA, MARCO_SCROLL } from './solapas/tabla'
import { agruparPorRolOrganizacional } from '../../services/vocabularioPersona'
import { RotuloDeGrupo } from '../RotuloDeGrupo'
import { InlineEdit } from '@/shared/components/ds'
import { corregirHorasDelDia } from '../../services/liquidacionDiaActions'
// LA REGLA DE QUÉ SE EDITA NO ES DE LA GRILLA: la grilla dibuja lo que la regla decide.
import type { EdicionDeCelda } from '../../services/edicionDeGrillaHoras'

// LA COLUMNA DEL IMPORTE ESTIMADO ENTRA ENTRE «Esper.» Y «Estado», y por eso el ancho mínimo de la
// grilla sube de 760 a 856: un «$ 1.234.567» de 96 px no se puede achicar sin partir el número.
const COLUMNAS = 'minmax(230px,1fr) repeat(13,30px) 50px 56px 96px 58px'

const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const

/** `L7`, `V11`: la inicial del día y el número, como en el mockup. */
function rotuloDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return `${DIAS_CORTOS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}${d}`
}

const numero = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/** Pesos sin centavos: esta pantalla estima una masa salarial, no cuenta monedas. */
const pesos = (n: number): string => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

const ESTADOS: Record<EstadoDeFila, { texto: string; color: string }> = {
  'al-dia': { texto: 'al día', color: '#067647' },
  motivo: { texto: 'motivo', color: V.neg },
  tarifa: { texto: 'tarifa', color: V.warn },
  'sin-cargar': { texto: 'sin cargar', color: V.warn },
  licencia: { texto: 'lic.', color: V.apagado },
}

const filaGrid = (alto: number): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: COLUMNAS, gap: 6, minHeight: alto,
  alignItems: 'center', borderBottom: `1px solid ${V.linea}`,
  fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
})

/**
 * ═══ LA CELDA DE LA GRILLA SE EDITA DONDE SE LEE (dueño, 11/09/2026) ═══
 *
 * Textual: *«tenés que permitirme editar en cada celda de ahí de la sección Horas del módulo
 * Personal, no sé por qué me quitaste esa opción»*. Hasta hoy esta grilla era de sólo lectura
 * entera: para corregir un 9 había que hacer clic en la persona, esperar el panel y buscar el día
 * en la lista de abajo. El número estaba a la vista y no se podía tocar.
 *
 * Ahora la celda con UN registro es el mismo `InlineEdit` que ya usa el panel, con la MISMA acción
 * (`corregirHorasDelDia`), que es la que verifica el efecto contra la base y deja el rastro de quién
 * corrigió. Dos definiciones de «corregir un día» serían dos historiales.
 *
 * ═══ LAS QUE NO SE EDITAN EN LÍNEA, Y POR QUÉ ═══
 *
 *   SIN CARGAR   no hay registro que corregir: crear uno exige decir a QUÉ OBRA se le imputa, y
 *                elegirla en silencio mueve costo de mano de obra. Va al panel, que lo pregunta.
 *   AUSENCIA ·   el número de esas celdas no son horas trabajadas: escribir encima significaría
 *   LICENCIA     «en realidad trabajó» y «corregile las horas reconocidas» a la vez. Es la misma
 *                regla que ya rige en la grilla de Horas (`GrillaAsistenciaObra`), y no se
 *                contradice acá.
 *   DÍA CON DOS   un solo campo tendría que elegir en silencio a CUÁL de los dos registros se le
 *   REGISTROS     imputa la corrección. No es «dos obras» —la auditoría del 11/09/2026 midió los dos
 *                 casos reales de la grilla y son `licencia + normal` de la MISMA obra—: es que hay
 *                 más de una fila candidata y el que corrige tiene que ver cuál elige. El panel las
 *                 muestra separadas, cada una con su celda.
 *
 * Ninguna de esas queda muerta: siguen abriendo el panel en esa persona, que es donde el caso se
 * resuelve. Lo que cambia es que el caso FÁCIL —corregir un número que ya existe— dejó de costar
 * tres clics y una búsqueda.
 */
function Celda({ celda, edicion }: { celda: CeldaDeGrilla; edicion?: EdicionDeCelda | null }) {
  if (celda.marca === 'sin-cargar') {
    return <div style={{ textAlign: 'center', color: V.lineaFuerte }}>·</div>
  }
  if (celda.marca === 'ausencia') {
    return <div style={{ textAlign: 'center', color: V.neg, fontWeight: 500 }}>A</div>
  }
  if (celda.marca === 'licencia') {
    return <div style={{ textAlign: 'center', color: '#175CD3' }}>L</div>
  }
  if (!edicion) {
    return <div style={{ textAlign: 'center' }}>{numero(celda.horas ?? 0)}</div>
  }
  return (
    // ═══ EL CLIC EN LA CELDA EDITA; EL CLIC EN EL NOMBRE ABRE LA PERSONA ═══
    //
    // Frenar la propagación es obligatorio: la fila entera es un botón que despliega el panel, y sin
    // esto tocar una celda para escribir abriría el panel debajo del campo.
    //
    // LO QUE ESO CAMBIÓ, Y SE DECIDE ACÁ (auditoría 11/09/2026): la franja de días dejó de ser un
    // camino al panel. Antes CUALQUIER punto de la fila lo abría; ahora los días editables abren su
    // campo, que es lo que el dueño pidió —«permitirme editar en cada celda»—, y el panel se abre
    // desde el NOMBRE, desde los totales y desde las celdas que no se editan (`·`, `A`, `L`), que
    // siguen siendo fila. No queda ninguna celda muerta: se verificó el inventario completo de la
    // grilla, 221 celdas, y todas editan o abren el panel.
    //
    // No se puede tener las dos cosas en el mismo punto: un clic que abre un campo Y despliega un
    // panel de 900 px debajo mueve el campo de lugar mientras se escribe.
    <div
      style={{ display: 'flex', justifyContent: 'center' }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* EL ANCHO ES 56 Y NO 42, Y SIN FLECHITAS. Con `w-[42px]` el `<input type=number>` medía
          28 px útiles contra 35 de contenido: el spinner del navegador se comía el dígito y se
          editaba A CIEGAS —el DOM decía «9» y la pantalla mostraba sólo el cursor y dos flechas de
          ±1 hora sobre datos de liquidación—. Lo cazó la auditoría del 11/09/2026 sobre la captura
          de cierre. `sin-spinner` está en `globals.css` y apaga el control en Chrome y Firefox. */}
      <InlineEdit
        valor={celda.horas ?? null}
        tipo="numero"
        falta="·"
        ancho="w-[56px] sin-spinner"
        alineado="center"
        etiqueta={`Horas del ${celda.fecha}`}
        testid={`grilla-hh-${edicion.registroId}`}
        guardar={corregirHorasDelDia.bind(null, edicion.registroId)}
      />
    </div>
  )
}

/**
 * «COBRA EST.» — LO QUE VA A COBRAR ESTA PERSONA SI CUMPLE LOS DÍAS QUE FALTAN.
 *
 * Es COBRA, el mismo de la solapa Pagos: BRUTO DE BOLSILLO, antes de restar adelanto y ya
 * transferido, y sin cargas sociales (eso es «costo real», otra columna y otra pantalla).
 *
 * ES UNA ESTIMACIÓN Y EL RÓTULO LO DICE. El `title` publica de dónde sale —horas cargadas, horas
 * por cumplir y la tarifa— porque un importe sin origen a la vista no se puede discutir con nadie.
 * Sin tarifa cargada NO escribe $ 0: escribe «sin tarifa», que es lo que hay que resolver.
 */
function ImporteEstimado({ p }: { p?: ProyeccionDeFila }) {
  if (!p) return <div />
  if (p.importeProyectado == null) {
    return (
      <div style={{ textAlign: 'right', fontSize: '11px', color: V.tenue }} title="Sin tarifa cargada: no se puede estimar">
        sin tarifa
      </div>
    )
  }
  const r = repartoDelAcuerdo(p.importeProyectado, p.modalidad)
  const detalle = p.modalidad === 'mensual'
    ? 'Neto mensual acordado · sin reparto 50/50'
    : `${numero(p.horasCargadas)} h cargadas + ${numero(p.horasPorCumplir)} h por cumplir`
      + `${p.valorHora == null ? '' : ` × ${pesos(p.valorHora)}`}`
      + `${r.blanco == null ? '' : ` · blanco est. ${pesos(r.blanco)} · efectivo est. ${pesos(r.efectivo ?? 0)}`}`
  return <div style={{ textAlign: 'right' }} title={`Estimado · ${detalle}`}>{pesos(p.importeProyectado)}</div>
}

function Fila({ fila, proyeccion, abrir, abierta, edicionDe }: {
  fila: FilaDeGrilla
  proyeccion?: ProyeccionDeFila
  /** Abrir la persona NO NAVEGA (handoff v2 §4): el panel se despliega al costado. */
  abrir?: (personaId: string) => void
  abierta?: boolean
  /** Qué celda de esta fila se puede corregir en línea. Sin esto la grilla es la de antes. */
  edicionDe?: (personaId: string, fecha: string) => EdicionDeCelda | null
}) {
  const estado = ESTADOS[fila.estado]
  return (
    <div
      style={{
        ...filaGrid(58),
        cursor: abrir ? 'pointer' : undefined,
        background: abierta ? '#FAFAF8' : undefined,
        // LA BARRA AMARILLA DE 3 px MARCA LA FILA ABIERTA. Es la única marca de marca del cuadro.
        // El mockup (línea 176) la mete DENTRO del cuadro: 12 px de padding compensados con 12 px
        // de margen negativo, para que la barra quede pegada al filo y el nombre no se corra.
        boxShadow: abierta ? `inset 3px 0 0 ${V.marca}` : undefined,
        paddingLeft: abierta ? 12 : undefined,
        marginLeft: abierta ? -12 : undefined,
        borderRadius: abierta ? '0 6px 6px 0' : undefined,
        fontWeight: abierta ? 500 : undefined,
      }}
      data-testid={`fila-${fila.personaId}`}
      onClick={abrir ? () => abrir(fila.personaId) : undefined}
    >
      <div style={{ ...COLUMNA_FIJA, background: abierta ? undefined : '#FFFFFF' }} title={fila.nombre}>{fila.nombre}</div>
      {fila.celdas.map((c) => (
        <Celda key={c.fecha} celda={c} edicion={edicionDe?.(fila.personaId, c.fecha) ?? null} />
      ))}
      <div style={{ textAlign: 'right', fontWeight: 600 }}>{numero(fila.cargadas)}</div>
      <div style={{ textAlign: 'right', color: V.apagado }}>{numero(fila.esperadas)}</div>
      <ImporteEstimado p={proyeccion} />
      <div style={{ textAlign: 'right', fontSize: '11px', color: estado.color }}>
        {/* «18 lic.» — el mockup publica las HORAS de licencia delante del rótulo: «lic.» sola no
            dice cuánto no se va a pagar. */}
        {fila.estado === 'licencia' ? `${numero(fila.horasDeLicencia)} ${estado.texto}` : estado.texto}
      </div>
    </div>
  )
}

/**
 * UN RECORTE QUE SE PUEDE ACCIONAR — nunca una etiqueta que sólo cuenta.
 *
 * `href` es obligatorio a propósito: la versión anterior admitía opciones sin destino y la mitad
 * del panel eran números que no llevaban a ninguna parte. Si no hay adónde ir, no es un recorte.
 */
export interface PendienteDeGrilla {
  /** «9 ausencias sin motivo» — el número ADENTRO del texto, que es como se lee en voz alta. */
  texto: string
  cuantos: number
  activo: boolean
  href: string
}

/** El período elegible. La ventana entera, sin cortar: el rótulo es el contrato de lo que se mira. */
export interface PeriodoDeGrilla {
  texto: string
  activo: boolean
  href: string
}

const MONO: React.CSSProperties = {
  fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)', fontSize: '10px',
  letterSpacing: '.06em', textTransform: 'uppercase', color: V.tenue,
}

/**
 * LA CABECERA: qué quincena se mira, cuánto pasó de ella, a cuál se puede saltar y el botón de
 * cierre. Todo lo que se DECIDE en esta pantalla y no está en una fila, en 8 px de ritmo.
 */
function Cabecera({ titulo, estado, subtitulo, periodos, accion }: {
  titulo: string
  estado?: string
  subtitulo: string
  periodos: readonly PeriodoDeGrilla[]
  accion?: React.ReactNode
}) {
  return (
    <div style={{
      padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center',
      columnGap: 16, rowGap: 8, borderBottom: `1px solid ${V.linea}`,
    }} data-testid="cabecera-quincena">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontSize: '14.5px', fontWeight: 600 }}>{titulo}</div>
          {estado && <div style={{ fontSize: '11.5px', color: V.tenue }}>{estado}</div>}
        </div>
        <div style={{ fontSize: '11.5px', color: V.apagado }} data-testid="grilla-subtitulo">
          {subtitulo}
        </div>
      </div>
      {/* LOS OTROS PERÍODOS, A LA DERECHA Y EN LÍNEA. Sin `overflow:hidden`: el rótulo cortado
          («1ª quincena de septiemb…») era el motivo por el que había que adivinar qué se miraba. */}
      {/* EN EL TELÉFONO ESTA FILA SE PARTE, NO EMPUJA LA PÁGINA. Dos rótulos de quincena y el botón
          suman 500 px: sin `wrap` la pantalla entera se desplaza de costado y deja de cumplir la
          regla que `tests/shell-dos-areas.spec.ts` mide. Lo que se recorre es la TABLA, nunca la
          pantalla. */}
      <div style={{
        marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
      }} data-testid="periodos">
        {periodos.filter((p) => !p.activo).map((p) => (
          <Link key={p.href} href={p.href} prefetch={false} style={{
            height: 26, padding: '0 10px', display: 'inline-flex', alignItems: 'center',
            border: `1px solid ${V.linea}`, borderRadius: 6, background: '#FFFFFF',
            fontSize: '11.5px', color: V.apagado, textDecoration: 'none', whiteSpace: 'nowrap',
          }}>{p.texto}</Link>
        ))}
        {accion}
      </div>
    </div>
  )
}

/**
 * LO QUE FALTA HACER ANTES DE CERRAR — y sólo eso.
 *
 * Se dibuja cuando hay algo pendiente o cuando hay un recorte puesto. Sin nada de eso la banda
 * DESAPARECE: una fila que dice «0, 0, 0» ocupa el mismo espacio que una que avisa, y enseña a no
 * mirarla. Con el recorte puesto aparece cómo quitarlo, que es lo que faltaba cuando los filtros
 * vivían en una columna que se leía de arriba abajo.
 */
function Pendientes({ pendientes, hrefSinRecorte }: {
  pendientes: readonly PendienteDeGrilla[]
  hrefSinRecorte: string
}) {
  const visibles = pendientes.filter((p) => p.cuantos > 0 || p.activo)
  if (visibles.length === 0) return null
  const hayRecorte = pendientes.some((p) => p.activo)
  return (
    <div data-testid="pendientes" style={{
      padding: '10px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center',
      columnGap: 16, rowGap: 6, borderBottom: `1px solid ${V.linea}`, fontSize: '12px',
    }}>
      <span style={MONO}>Pendiente</span>
      {visibles.map((p, i) => (
        // EL TESTID NO SE INDEXA CON UN DATO VIVO: `pendiente-${cuantos}` daba dos nodos con el
        // mismo testid en cuanto dos pendientes empataban en número. Va la posición, que es estable.
        <Link key={p.href} href={p.href} prefetch={false} data-testid={`pendiente-${i}`}
          style={{
            color: p.cuantos > 0 ? V.warn : V.apagado,
            fontWeight: p.activo ? 600 : 400,
            textDecoration: p.activo ? 'none' : 'underline',
            textUnderlineOffset: 3,
            textDecorationColor: V.lineaFuerte,
          }}>{p.texto}{p.activo ? '' : ' ›'}</Link>
      ))}
      {hayRecorte && (
        <Link href={hrefSinRecorte} prefetch={false} data-testid="quitar-recorte"
          style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.apagado }}>
          Ver el plantel entero
        </Link>
      )}
    </div>
  )
}

export function GrillaHorasQuincena({
  titulo, estado, jornadaTexto, habilesTexto, hoy, filas, resumen, proyeccion,
  periodos, pendientes, hrefSinRecorte, convenios, restaDeHoras, accion, abrir, abierta, edicionDe,
}: {
  /** «1ª quincena de septiembre · 1 al 15». */
  titulo: string
  /** «abierta» / «cerrada». Va al lado del título: es el estado de LO QUE SE ESTÁ MIRANDO. */
  estado?: string
  /** «9 h L a J · 8 h los viernes» — el prop del mockup, para poder validar R2 contra el dato real. */
  jornadaTexto: string
  /** «7 de 11 hábiles transcurridos» — cuánto de la quincena ya pasó. */
  habilesTexto?: string
  /** Para teñir la columna del día en curso. Sin él, el encabezado no distingue hoy. */
  hoy?: string
  filas: readonly FilaDeGrilla[]
  resumen: ResumenDeGrilla
  /**
   * LA MASA SALARIAL ESTIMADA — del PLANTEL ENTERO, igual que `resumen`.
   *
   * El bloque del panel mira todo el plantel y la columna mira la fila: es el mismo criterio con el
   * que ya conviven «Cargadas» (que se recorta) y `puedeCerrar` (que no). Un total que cambiara con
   * el filtro no sería la masa salarial de la quincena, sería la del recorte que alguien dejó puesto.
   */
  proyeccion?: ProyeccionDeQuincena
  /** La quincena en curso y las anteriores. La vigente no se dibuja: ya está en el título. */
  periodos: readonly PeriodoDeGrilla[]
  /** Lo que traba el cierre, cada uno con el recorte que lo muestra. */
  pendientes: readonly PendienteDeGrilla[]
  /** Adónde se vuelve cuando hay un recorte puesto. */
  hrefSinRecorte: string
  /** «UOCRA — Ley 22.250 · 14 · …» para el `title` del pie: se consulta, no se decide. */
  convenios?: string
  /**
   * QUÉ RESTAN LAS OTRAS TRES SOLAPAS DE ESTE TOTAL (QA visual, 11/09/2026).
   *
   * Esta pantalla publica «CARG. 1.289» y las de al lado 1.129 y 1.227 bajo el mismo rótulo. Los
   * tres son correctos y la única lectura posible era «uno está mal». Acá se dice de una vez qué se
   * va a restar allá — sale de `horasDeLaQuincena`, la misma cuenta que consumen las cuatro.
   */
  restaDeHoras?: string
  /** El botón de cierre. Se dibuja siempre; lo habilita `resumen.puedeCerrar`. */
  accion?: React.ReactNode
  /** Qué celda se corrige en línea. Sin esto la grilla es de sólo lectura, como hasta el 11/09. */
  edicionDe?: (personaId: string, fecha: string) => EdicionDeCelda | null
  /** Sin `abrir`, la grilla sigue siendo lo que era: una tabla que no responde al clic. */
  abrir?: (personaId: string) => void
  abierta?: string | null
}) {
  return (
    // UNA SOLA COLUMNA: la tabla ES la pantalla. Sin los 230 px del panel, las trece columnas de día
    // más el nombre entran enteras a 1240 px y a 390 se recorre sólo la tabla, no la pantalla.
    //
    // EL ANCHO ÚTIL TIENE TECHO Y ES UNO SOLO para la cabecera, los pendientes, la tabla y el pie:
    // 1.120 px es lo que medía el cuadro cuando el panel de 230 px estaba puesto. Sin el techo, el
    // botón de cierre y la masa salarial se iban al filo del monitor mientras la tabla terminaba
    // 300 px antes, y nada quedaba alineado con nada.
    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 1120 }}>
      <Cabecera
        titulo={titulo}
        estado={estado}
        subtitulo={habilesTexto ? `${habilesTexto} · ${jornadaTexto}` : jornadaTexto}
        periodos={periodos}
        accion={accion}
      />
      <Pendientes pendientes={pendientes} hrefSinRecorte={hrefSinRecorte} />

      <div className="min-w-0 flex-1" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* EL ANCHO REAL DE LA GRILLA SE RECORRE, no se aplasta: trece columnas de 30 px más el
            nombre no entran en 390 y encogerlas dejaría celdas ilegibles. */}
        {/* MARCO_SCROLL avisa que hay más a los lados y la columna del nombre se queda fija: a 400 px
            el nombre salía de pantalla al primer arrastre y los números quedaban sin dueño. */}
        <div style={{ ...MARCO_SCROLL, padding: '0 20px' }}>
        <div style={{ minWidth: 856, display: 'flex', flexDirection: 'column' }}>
          <div data-testid="encabezado-columnas" style={{
            display: 'grid', gridTemplateColumns: COLUMNAS, gap: 6, height: ALTO_LIQ.encabezadoAncho, alignItems: 'end',
            borderBottom: `1px solid ${V.linea}`, paddingBottom: 9,
            fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)', fontSize: '9.5px',
            letterSpacing: '.03em', color: V.tenue, textTransform: 'uppercase',
          }}>
            <div style={COLUMNA_FIJA}>Persona</div>
            {/* EL ENCABEZADO DEL DÍA DICE SI HAY ALGO ADENTRO. Mockup línea 145: el día que nadie
                cargó va en gris de línea (#D7D5CF) y el día en curso en tinta plena. Un encabezado
                todo del mismo gris obliga a bajar la vista para saber dónde está parado uno. */}
            {resumen.dias.map((f, i) => (
              <div key={f} style={{
                textAlign: 'center',
                color: f === hoy ? V.tinta : (resumen.porDia[i] == null ? V.lineaFuerte : V.tenue),
              }}>{rotuloDia(f)}</div>
            ))}
            <div style={{ textAlign: 'right' }}>Carg.</div>
            <div style={{ textAlign: 'right' }}>Esper.</div>
            {/* «COBRA EST.», NO «A PAGAR»: es el COBRA proyectado, y lo que se entrega en mano sale
                de restarle adelanto y ya transferido (eso lo publica Pagos). Un rótulo que promete
                el total y muestra el bruto es la clase de número que después nadie puede explicar. */}
            <div style={{ textAlign: 'right' }}>Cobra est.</div>
            <div style={{ textAlign: 'right' }}>Estado</div>
          </div>

          {/* LOS MISMOS DOS GRUPOS QUE PLANTEL Y ASISTENCIA — Jefes de obra arriba, Obreros abajo,
              con el mismo rótulo y el mismo orden alfabético adentro. `esJefe` ya viene resuelto por
              el servidor con `esJefeDeObra(puesto)`; con un solo grupo no hay rótulo, como allá. */}
          {agruparPorRolOrganizacional(filas, (f) => f.esJefe).map((g, iGrupo, grupos) => (
            <div key={g.clave} data-testid={`grupo-${g.clave}`}>
              {grupos.length > 1 && <RotuloDeGrupo texto={g.rotulo} primero={iGrupo === 0} />}
              {g.integrantes.map((f) => (
                <Fila
                  key={f.personaId}
                  fila={f}
                  proyeccion={proyeccion?.porPersona[f.personaId]}
                  abrir={abrir}
                  abierta={f.personaId === abierta}
                  edicionDe={edicionDe}
                />
              ))}
            </div>
          ))}

          <div style={{
            ...filaGrid(56), borderBottom: 'none', borderTop: `1px solid ${V.grafito}`, fontWeight: 600,
          }} data-testid="total-grilla">
            <div style={{ ...COLUMNA_FIJA, whiteSpace: 'normal' }}>
              {resumen.personas} persona{resumen.personas === 1 ? '' : 's'}
              {resumen.sinRetribucion > 0 && ` · ${resumen.sinRetribucion} sin retribución`}
            </div>
            {resumen.porDia.map((n, i) => (
              // NULL NO ES CERO, Y «SIN VALOR» SE ESCRIBE DE UNA SOLA FORMA EN TODA LA TABLA: el
              // mismo «·» gris que la celda del día, que la leyenda del pie ya explica. Hasta el
              // 10/09 la celda decía «·» y el pie dejaba el hueco en blanco: dos símbolos para la
              // misma ausencia en la misma columna, y el de abajo indistinguible de un 0 borrado.
              <div key={resumen.dias[i]} style={{ textAlign: 'center', color: n == null ? V.lineaFuerte : undefined }}>
                {n == null ? '·' : numero(n)}
              </div>
            ))}
            <div style={{ textAlign: 'right' }}>{numero(resumen.cargadas)}</div>
            <div style={{ textAlign: 'right' }}>{numero(resumen.esperadas)}</div>
            {/* EL TOTAL DE LA COLUMNA NO INCLUYE A QUIEN NO TIENE TARIFA, y la primera celda de
                esta misma fila ya publica cuántos son («N sin retribución»). */}
            <div style={{ textAlign: 'right' }} title={proyeccion
              ? `COBRA estimado de la quincena · ${proyeccion.sinTarifa} sin tarifa fuera del total`
              : undefined}>
              {proyeccion ? pesos(proyeccion.masaProyectada) : ''}
            </div>
            <div />
          </div>
        </div>
        </div>

        <div style={{
          padding: '12px 20px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline',
          columnGap: 16, rowGap: 6, fontSize: '11px', color: V.apagado,
        }}>
          <span title={convenios}>
            <strong style={{ color: V.neg, fontWeight: 600 }}>A</strong> ausencia ·{' '}
            <strong style={{ color: '#175CD3', fontWeight: 600 }}>L</strong> licencia ·{' '}
            <strong style={{ color: V.lineaFuerte }}>·</strong> sin horas cargadas
          </span>
          {restaDeHoras && (
            <span data-testid="horas-resta" title="Por eso «Pagos», «Cierre» y «Costo a la obra» publican menos horas que esta pantalla.">
              de estas horas, {restaDeHoras}
            </span>
          )}
          {proyeccion && <LineaDeMasa p={proyeccion} />}
        </div>
      </div>
    </div>
  )
}

/**
 * LA PREVISIBILIDAD QUE PIDIÓ EL DUEÑO, EN UNA LÍNEA.
 *
 * «necesito tener previsibilidad» (10/09/2026) — y el mismo día, sobre el panel que la publicaba en
 * seis renglones y dos párrafos: «pésima UX, no sirve así». Las dos cosas son verdad: el número hace
 * falta, la columna de la derecha no.
 *
 * Queda lo que se usa para decidir —cuánto sale la quincena y cómo se parte en blanco y efectivo— y
 * el resto pasa al `title`: obreros, oficina, ya cargado, por cumplir, y el supuesto («si cumplen
 * la jornada los días que faltan»). El total NO se repite: es el mismo que ya suma la columna
 * «Cobra est.» en el pie de la tabla, y por eso va acá abajo y no arriba.
 *
 * «BOLSILLO» PORQUE NO SON CARGAS SOCIALES: es la suma de los COBRA, el mismo concepto que la
 * columna BOLSILLO de «Costo a la obra». El costo real de esas horas es mayor.
 */
function LineaDeMasa({ p }: { p: ProyeccionDeQuincena }) {
  const r = repartoDelAcuerdo(p.obreros, 'hora')
  const detalle = [
    `Obreros ${pesos(p.obreros)}`,
    // EL TOTAL NO ES QUINCENAL DEL TODO, Y ESO NO SE PUEDE ESCONDER: el neto de Oficina es MENSUAL
    // y aparece entero en las dos quincenas del mes.
    `oficina ${pesos(p.oficina)} (neto mensual, entero en cada quincena)`,
    `ya cargado ${pesos(p.masaCargada)}`,
    `por cumplir ${pesos(p.masaPorCumplir)}`,
    'Est.: si cumplen la jornada los días que faltan.',
    // EL ACUERDO 50/50 SOBRE LO PROYECTADO. Oficina suma al total y NO al reparto.
    p.oficina > 0 ? 'Oficina sin reparto 50/50.' : null,
  ].filter(Boolean).join(' · ')
  return (
    <span data-testid="linea-masa" title={detalle}
      style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
      Masa salarial est. (bolsillo){' '}
      <strong style={{ color: V.tinta, fontWeight: 600 }}>{pesos(p.masaProyectada)}</strong>
      {' · '}blanco {pesos(r.blanco ?? 0)}
      {' · '}efectivo {pesos(r.efectivo ?? 0)}
      {/* ═══ LA LÍNEA TIENE QUE CERRAR A LA VISTA ═══ (11/09/2026, auditoría)
          Blanco + efectivo daban $8.111.692 contra un total de $11.711.691: faltaban los $3,6 M de
          Oficina, que suma al total y NO entra en el reparto 50/50, y la conciliación había quedado
          escondida en el `title`. Dos sumandos que no dan el total, en la pantalla que liquida, son
          peor que la columna que se sacó: quien mira tiene que poder sumar lo que ve. */}
      {p.oficina > 0 && <>{' · '}oficina {pesos(p.oficina)}</>}
      {/* SIN TARIFA NO ENTRA EN EL TOTAL Y POR ESO SE DICE ACÁ MISMO: un total que se calla a quién
          dejó afuera se lee como la quincena entera. */}
      {p.sinTarifa > 0 && (
        <span style={{ color: V.warn, fontWeight: 500 }}>
          {' · '}{p.sinTarifa} sin tarifa, fuera del total
        </span>
      )}
    </span>
  )
}
