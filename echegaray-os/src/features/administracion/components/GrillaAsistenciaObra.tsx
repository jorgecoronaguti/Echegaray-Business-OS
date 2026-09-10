'use client'

import { Fragment, useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import { hs, leerHoras } from '../services/jornadaPorObra'
import type { CeldaObra, FilaQuincena } from '../services/quincenaPorObra'
import { SIN_OBRA, totalDeLaQuincena } from '../services/quincenaPorObra'
import { agruparPorRolOrganizacional } from '../services/vocabularioPersona'
import { guardarJornada } from '../services/jornadaPorObraActions'
import { cambiarObraActual } from '../services/obraActualActions'
import { PlanDeObraPanel } from './PlanDeObraPanel'
import { PanelCorreccionJornada, type ObraElegible } from './PanelCorreccionJornada'
import { CeldaDia, type EntradaCeldaDia } from '@/shared/components/ds'

// 02 · LA QUINCENA, POR OBRA. La misma jornada que el jefe carga en el teléfono, a la distancia de
// Administración: una fila por par (persona, obra) y una columna por día del período que se paga.
//
// ═══ LOS DÍAS QUE NO SE TRABAJAN SE VEN, PERO APAGADOS ═══
//
// Con quince o dieciséis columnas, los fines de semana son casi un tercio de la grilla. Sacarlos
// escondería el sábado trabajado —que existe y se paga—, así que se dibujan con la columna en el
// fondo hundido: presentes, sin competir por la lectura. Qué columna va apagada lo decide el
// servidor (`columnasTenues`) y no la celda: es una propiedad del DÍA, no de lo que hizo cada uno.
//
// ═══ CADA CELDA SE EDITA Y GUARDA AL SALIR DEL CAMPO ═══
//
// No hay botón de guardar. Cada celda es una jornada de una persona en una obra en un día — la
// misma unidad que escribe `/campo/asistencia` y con la misma acción. Un «Guardar todo» abajo
// obligaría a mandar 200 celdas para corregir una, y a decidir qué hacer con las 199 que nadie tocó.
//
// ═══ LOS SILENCIOS NO SE ESCRIBEN SOLOS ═══
//
// Una celda vacía se deja vacía: salir de ella sin escribir nada no guarda nada. Sólo un número
// escribe, y sólo esa celda.
//
// ═══ UN DÍA REPARTIDO EN DOS OBRAS NO SE EDITA EN LA CELDA ═══
//
// La fila es la persona y la celda es la SUMA del día. Cuando ese día tiene dos obras, escribir un
// número obligaría a elegir a cuál de las dos se le imputa —y elegirla en silencio mueve el costo
// de mano de obra de una obra a otra sin que nadie lo decida—. Esas celdas muestran el total con un
// punto al lado y se corrigen desde el panel, que enseña el desglose antes de tocar nada.

// ═══ JEFES DE OBRA ARRIBA, EL RESTO ABAJO (dueño, 08/09/2026) ═══
//
// *«dividir en la pestaña asistencia y plantel a los jefes de obra del resto de los obreros»*. Los
// dos grupos salen del MISMO criterio que el plantel —`esJefeDeObra(personas.puesto)`, ya resuelto
// en el servidor y publicado en `fila.esJefe`—, así que una persona no puede ser jefe en una
// pantalla y obrero en la otra.
//
// EL «TOTAL DE LA QUINCENA» SIGUE SIENDO GLOBAL. La fila del pie suma a todos, jefes incluidos: es
// la HH de la empresa en el período y partirla cambiaría lo que ese número significa. El subtotal
// del grupo va en su propio rótulo, apagado y en 11,5px, para que no compita con el total de abajo.
const ROJO = '#B42318'

// ═══ EL NOMBRE NO ENSANCHA LA COLUMNA, PERO LA TABLA SIGUE OCUPANDO TODO ═══
//
// Se probó llevar la tabla al ancho de su contenido para acercar los días al nombre. El dueño lo
// rechazó al verlo desplegado: *«están corridos los valores… no sé por qué achicaste el margen»* —
// quedaban 550 px muertos a la derecha y el total de cada fila caía por la mitad de la pantalla en
// vez del borde. La tabla vuelve al 100% con sus columnas de siempre; lo único que queda del
// intento es el techo del NOMBRE, que era el defecto real: un nombre largo corría la quincena.
const ANCHO_PERSONA = 320

// ═══ LA COLUMNA PERSONA NO SE VA CON EL SCROLL (390 px, verificado en producción 08/09/2026) ═══
//
// En el teléfono la tabla se corre de costado —dieciséis columnas no entran en 390 px— y al llegar
// a los días del final ya no se sabe de quién son las horas que se están mirando. Se queda pegada
// a la izquierda. El fondo es OBLIGATORIO y no cosmético: sin él las celdas de los días pasan por
// debajo y se leen los dos textos encimados.
const PEGADA: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 2 }

/** `2026-09-10` → `jue 10/09`. El día de la semana es con lo que se planifica; una fecha sola
 *  obliga a ir a buscar el calendario. Se arma en UTC para no correr el día por la zona. */
function diaCorto(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  const dia = d.toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${dia} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

function textoDe(c: CeldaObra): string {
  if (c.estado === 'horas') return c.horas === null ? '' : hs(c.horas)
  // La ausencia NO se escribe en el CAMPO EDITABLE: la dice la capa de presencia de `CeldaDia` («A»
  // en rojo) y sus horas se dibujan aparte, fijas (ver `editable`). Un número editable ahí adentro
  // sería el mismo control para dos cosas distintas — corregir las horas de una ausencia y
  // convertir el día en trabajado— y la segunda le imputa costo a una obra.
  return ''
}

// ═══ LA CELDA TIENE DOS CAPAS (dueño, 08/09/2026: «una cosa es asistir y otra la carga de horas») ═══
//
// Arriba la PRESENCIA como estado —«A» ausencia, «L» licencia, ● cuando haya marca de fichaje—; abajo
// las HORAS como cantidad, sin color de estado. Qué se dibuja en cada capa lo decide
// `decidirCeldaDia` (shared/components/ds/celdaDia.ts). Esta grilla todavía no lee
// `asistencia_marca` —el fichaje desde el celular no está en uso—, así que la capa de arriba sólo
// conoce lo declarado en `registros_hh`; el ● se prende solo cuando la fuente exista.
function entradaDe(c: CeldaObra): EntradaCeldaDia {
  return {
    presencia: c.estado === 'ausente' ? 'ausente' : c.estado === 'licencia' ? 'licencia' : 'sin_marca',
    // TAMBIÉN LAS DE UNA AUSENCIA O UNA LICENCIA: la capa de abajo dice CUÁNTAS horas tiene el día,
    // y la de arriba QUÉ es ese día. Filtrar por estado acá volvía a fundir las dos preguntas.
    horas: c.horas,
    dia: c.estado === 'no_laborable' ? 'no_laborable'
      : c.estado === 'futuro' ? 'futuro'
      : c.estado === 'hoy' ? 'hoy'
      : 'habil',
    motivo: c.motivo,
  }
}

/** El tooltip de una celda que no se edita. La licencia dice de qué es; el día repartido, en qué
 *  obras estuvo. `undefined` cuando no hay nada que agregar: un `title` vacío es ruido. */
function tituloDe(c: CeldaObra): string | undefined {
  if (c.estado === 'licencia') return `Licencia${c.motivo ? `: ${c.motivo.toLowerCase()}` : ''}`
  if (c.tramos.length > 1) {
    return c.tramos.map((t) => `${t.nombre}: ${t.horas === null ? 'no vino' : `${hs(t.horas)} hs`}`).join(' · ')
  }
  return undefined
}

/** El placeholder del campo cuando no hay horas. La letra del estado («A», «L») ya no va acá:
 *  vive en la capa de presencia de `CeldaDia`. El marco punteado de «sin cargar» también es de la
 *  celda, y es NEUTRO: que nadie haya cargado no es una falta de la persona. */
function vacioDe(estado: CeldaObra['estado']): { texto: string; color: string } {
  if (estado === 'no_laborable' || estado === 'sin_dato') return { texto: '—', color: V.inerte }
  return { texto: '', color: V.inerte }
}

export function GrillaAsistenciaObra({
  filas, dias, etiquetas, titulos, columnasTenues, totalesDia, total, jornadaPorObra, obras,
  puedeCorregir, puedeCambiarObra, hoy,
}: {
  filas: FilaQuincena[]
  dias: string[]
  /** `L 1`, `M 2`… Una por día de la quincena. */
  etiquetas: string[]
  /** El nombre completo del día, para el `title` de la columna: `L` y `M` solas son ambiguas. */
  titulos: string[]
  /** Fin de semana o feriado. Es del día, no de la persona: la columna entera se apaga. */
  columnasTenues: boolean[]
  totalesDia: (number | null)[]
  /** `null` cuando nadie declaró una hora. Un `0` afirmaría que la empresa trabajó cero. */
  total: number | null
  jornadaPorObra: Record<string, number>
  /** Las obras a las que se puede mover un día. Vienen del servidor con el RLS ya aplicado. */
  obras: ObraElegible[]
  /** Sólo Administración corrige la obra de un día. La puerta de verdad es la policy; esto evita
   *  ofrecer un botón que va a rebotar contra un `permission denied`. */
  puedeCorregir: boolean
  /** SEPARADO DE `puedeCorregir` A PROPÓSITO (dueño, 08/09/2026): el jefe de obra corrige la
   *  jornada —es su trabajo— pero NO mueve gente de obra. Son dos permisos distintos sobre la misma
   *  grilla, y unirlos en uno le daría al jefe el desplegable. La puerta es la acción. */
  puedeCambiarObra: boolean
  /** EL DÍA SEGÚN EL SERVIDOR. Lo baja al panel de plan, que hasta ahora resolvía «Mañana» y «Lunes
   *  próximo» con la fecha local del navegador: a las 23:55 de un teléfono con otra zona esos
   *  atajos apuntaban a un día distinto del que la acción iba a validar. La grilla ya lo recibe
   *  para decidir qué día está en curso — no es un dato nuevo, es el mismo que baja una capa más. */
  hoy: string
}) {
  const [borradores, setBorradores] = useState<Record<string, string>>({})
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null)
  const [copia, setCopia] = useState<FilaQuincena | null>(null)
  // SOBRE QUÉ DÍA SE ABRE EL PANEL. `null` = el que el panel elige solo (el primero con datos).
  // Cuando se toca una celda que no se edita en línea —licencia, ausencia, futuro— el panel tiene
  // que abrir EN ESE DÍA: abrir en otro es pedirle a quien tocó el viernes que lo busque de nuevo,
  // y ya pasó que se corrigiera el día equivocado por eso.
  const [diaFoco, setDiaFoco] = useState<string | null>(null)
  // EL ACUSE ES POR PERSONA Y ES LO QUE DIJO LA BASE, no lo que se pidió: la acción devuelve el
  // texto ya armado con los nombres de las dos obras.
  const [acuses, setAcuses] = useState<Record<string, { texto: string; error: boolean }>>({})
  const [cambiando, setCambiando] = useState<string | null>(null)
  // QUÉ PERSONA TIENE EL PANEL DE PLAN ABIERTO. Uno solo a la vez: dos panales abiertos sobre la
  // misma grilla dejarían de saber a quién se le está programando el pase.
  const [planDe, setPlanDe] = useState<FilaQuincena | null>(null)
  // LO QUE EL DUEÑO ACABA DE ELEGIR, hasta que el servidor lo confirme. Sin esto el <select>,
  // controlado por el dato del servidor, volvía a mostrar la obra vieja apenas se soltaba el clic y
  // el dueño creía que no había guardado, elegía de nuevo y recibía «Ya estaba en…» (08/09/2026).
  const [elegidas, setElegidas] = useState<Record<string, string>>({})
  const [, arrancar] = useTransition()
  const router = useRouter()

  // LO QUE EL DESPLEGABLE MUESTRA SELECCIONADO. La obra a la que se le imputa lo que se escriba si
  // se le puede imputar; si su asignación vigente está en una obra que ya no admite horas, ESA obra
  // —en una opción deshabilitada—, porque es la verdad de la base. Nunca la primera activa de la
  // lista: eso es lo que le ponía «SF - PISOS INDUSTRIALES» a quien estaba en MAMPOSTERÍA.
  const seleccionada = (fila: FilaQuincena) =>
    fila.obraPorDefecto?.id ?? fila.obraVigenteNoElegible?.id ?? ''

  const mostrada = (fila: FilaQuincena) => elegidas[fila.clave] ?? seleccionada(fila)

  const cambiarObra = (fila: FilaQuincena, valor: string) => {
    if (mostrada(fila) === valor) return
    setCambiando(fila.clave)
    setElegidas((e) => ({ ...e, [fila.clave]: valor }))
    setAcuses((a) => { const n = { ...a }; delete n[fila.clave]; return n })
    arrancar(async () => {
      const r = await cambiarObraActual({ persona_id: fila.persona.id, obra_id: valor || null })
      setCambiando(null)
      if (!r.ok) setElegidas((e) => { const n = { ...e }; delete n[fila.clave]; return n })
      setAcuses((a) => ({
        ...a,
        [fila.clave]: r.ok ? { texto: r.mensaje, error: false } : { texto: r.error, error: true },
      }))
      // EL DATO VUELVE DEL SERVIDOR: la fila, los chips del encabezado y la obra de cada celda se
      // releen; la elección local queda hasta entonces para que el <select> no dé un salto atrás.
      if (r.ok) router.refresh()
    })
  }

  const claveDe = (fila: FilaQuincena, fecha: string) => `${fila.clave}·${fecha}`

  // ═══ EL ERROR DE UNA CELDA NO SE DIBUJA ADENTRO DE LA CELDA ═══
  //
  // El defecto (dueño, 08/09, captura de producción): el mensaje de la acción —tres renglones de
  // texto— se pintaba DENTRO del `<td>` de 44px de ancho. Se partía en diez líneas, estiraba la
  // fila a cinco veces su alto y empujaba la quincena entera. Corregir un número dejaba la pantalla
  // inservible, que es peor que el error que estaba avisando.
  //
  // Ahora: una línea bajo la fila, con la fecha adelante para saber QUÉ celda falló, truncada con
  // el texto completo en `title`. La celda vuelve a su valor anterior con borde de error —lo que se
  // tipeó no se guardó, así que dejarlo escrito afirmaría lo contrario— y el borde se apaga solo en
  // cuanto se vuelve a escribir.
  const fallar = (k: string, texto: string) => setErrores((e) => ({ ...e, [k]: texto }))

  const guardar = (fila: FilaQuincena, celda: CeldaObra, bruto: string) => {
    const k = claveDe(fila, celda.fecha)
    const original = textoDe(celda)
    if (bruto.trim() === original.trim()) return
    // A QUÉ OBRA SE IMPUTA. La del tramo que ya existe ese día si hay uno solo —corregir no cambia
    // de obra—, y si no la obra activa de la persona. Sin ninguna de las dos no hay destino y no se
    // escribe: elegir una sería mover el costo de mano de obra sin que nadie lo decida.
    const destino = celda.tramos.length === 1
      ? { id: celda.tramos[0].obra_id, nombre: celda.tramos[0].nombre }
      : fila.obraPorDefecto
    if (!destino) {
      volverAlValorAnterior(k)
      fallar(k, 'Esa persona no tiene obra activa: la corrección se hace desde el panel.')
      return
    }
    const letra = bruto.trim().toUpperCase()
    if (letra === 'A') {
      const jornada = jornadaPorObra[destino.id] ?? 0
      if (jornada <= 0) {
        volverAlValorAnterior(k)
        fallar(k, 'Esa obra no tiene jornada pactada: la ausencia no se puede medir.')
        return
      }
      enviar(destino.id, celda.fecha, { persona_id: fila.persona.id, estado: 'ausente', horas: jornada }, k, fila.clave)
      return
    }
    const { horas, error } = leerHoras(bruto)
    if (error) { volverAlValorAnterior(k); fallar(k, error); return }
    // En blanco NO borra: dejar de escribir no es una decisión de nadie. Borrar una jornada
    // cargada es un acto y necesita su propia puerta, que esta pantalla todavía no tiene.
    if (horas === null) { setBorradores((b) => ({ ...b, [k]: original })); return }
    enviar(destino.id, celda.fecha, { persona_id: fila.persona.id, estado: 'presente', horas }, k, fila.clave)
  }

  /** Lo tipeado se descarta: no se guardó. El valor lo vuelve a poner `textoDe(celda)`. */
  const volverAlValorAnterior = (k: string) =>
    setBorradores((b) => { const n = { ...b }; delete n[k]; return n })

  const enviar = (
    obraId: string,
    fecha: string,
    marca: { persona_id: string; estado: 'presente' | 'ausente'; horas: number },
    k: string,
    /** La fila, para colgarle el aviso del acuse. Es la misma clave que usa `cambiarObra`. */
    claveFila: string,
  ) => {
    setErrores((e) => { const n = { ...e }; delete n[k]; return n })
    arrancar(async () => {
      const r = await guardarJornada({ obra_id: obraId, fecha, marcas: [marca] })
      if (!r.ok) { volverAlValorAnterior(k); fallar(k, r.error); return }
      // SÓLO LA EXCEPCIÓN SE DIBUJA. El acuse normal («1 marca nueva») ya se ve en la celda, que
      // muestra el número guardado; repetirlo en cada tecleo sería ruido. Lo que no se ve en ningún
      // lado es que esa persona no estaba asignada a la obra ese día, y eso se dice.
      const aviso = r.aviso
      if (aviso) setAcuses((a) => ({ ...a, [claveFila]: { texto: aviso, error: false } }))
    })
  }

  // ═══ EL PANEL NO SE DESMONTA CUANDO LA FILA DESAPARECE ═══
  //
  // «Sacar lo cargado» sobre alguien sin asignación vigente lo saca de `filas`: la persona ya no
  // tiene ni asignación ni registros, así que la grilla deja de dibujarla. Con el panel atado sólo
  // a `filas`, `abierta` pasaba a `null`, React lo desmontaba y se llevaba el acuse de la escritura
  // que acababa de ocurrir. El usuario ve desaparecer el panel y no sabe si guardó.
  // La copia se toma AL ABRIR, en el propio clic. Mientras la fila siga existiendo manda la viva
  // —el panel ve el dato recién releído—; la copia sólo entra cuando la fila desapareció, y ahí lo
  // que muestra es su último estado conocido, que es todo lo que queda de ella. Un efecto que
  // sincronizara la copia en cada render encadenaría renders por nada.
  // ═══ EL INDICIO DE QUE LA TABLA SIGUE ═══
  //
  // Una tabla que se desplaza de costado sin decirlo se lee como una tabla que termina donde
  // termina la pantalla: en el teléfono la quincena parecía tener cinco días. La sombra del borde
  // derecho aparece sólo cuando queda contenido y se apaga al llegar al final, que es la única
  // forma de que signifique algo.
  const cinta = useRef<HTMLDivElement | null>(null)
  const [quedaALaDerecha, setQuedaALaDerecha] = useState(false)
  const medir = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    // Un píxel de tolerancia: con zoom o pantallas fraccionarias `scrollLeft` es decimal y la
    // igualdad exacta dejaría la sombra encendida para siempre en el final del recorrido.
    setQuedaALaDerecha(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])
  // El `ref` mide al montar: un estado que arranca en `false` y sólo se actualiza al scrollear
  // nunca mostraría la sombra a quien todavía no scrolleó, que es justo a quien hay que avisarle.
  const montarCinta = useCallback((el: HTMLDivElement | null) => {
    cinta.current = el
    medir(el)
  }, [medir])

  const viva = puedeCorregir ? (filas.find((f) => f.clave === corrigiendo) ?? null) : null
  const abierta = corrigiendo === null
    ? null
    : (viva ?? (copia?.clave === corrigiendo ? copia : null))

  return (
    <>
    {/* EL PANEL NO TAPA LA COLUMNA HORAS. Con el drawer abierto la grilla se reserva su ancho a la
        derecha desde 1024px: las quince columnas y el total siguen a la vista mientras se corrige,
        que es justo lo que hay que mirar. Abajo de 1024 el panel va entero encima — no hay ancho
        para dos zonas y reservar 400px dejaría la tabla en 0. */}
    <div className={abierta ? 'lg:pr-[400px]' : undefined} style={{ position: 'relative' }}>
    <div ref={montarCinta} onScroll={(e) => medir(e.currentTarget)} style={{ overflowX: 'auto' }}
      data-testid="cinta-grilla">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }} data-testid="grilla-asistencia">
        <thead>
          <tr style={{ borderBottom: `1px solid ${V.lineaFuerte}` }}>
            <Rotulo ancho="34%" pegada>Persona</Rotulo>
            {/* «ACTUAL» porque la obra de una persona cambia con el tiempo: acá se ve la de hoy; la de
                cada día queda guardada en su marca y se lee en la cronología de la persona (ficha → Horas). */}
            <Rotulo ancho="18%">Obra actual</Rotulo>
            {etiquetas.map((e, i) => (
              <Rotulo key={dias[i]} centro tenue={columnasTenues[i]} titulo={titulos[i]}>{e}</Rotulo>
            ))}
            <Rotulo derecha>Horas</Rotulo>
            {puedeCorregir && <Rotulo />}
          </tr>
        </thead>
        <tbody>
          {agruparPorRolOrganizacional(filas, (f) => f.esJefe).map((grupo, iGrupo, grupos) => (
          <Fragment key={grupo.clave}>
          {grupos.length > 1 && (
            <FilaDeGrupo
              rotulo={grupo.rotulo}
              horas={totalDeLaQuincena(grupo.integrantes)}
              dias={dias.length}
              conCorreccion={puedeCorregir}
              primero={iGrupo === 0}
            />
          )}
          {grupo.integrantes.map((fila) => {
            // EL PRIMER ERROR DE LA FILA, con su día adelante: la línea está abajo y sin la fecha no
            // se sabe a qué celda se refiere. Uno solo — dos avisos apilados vuelven a romper la fila.
            const fallo = fila.celdas
              .map((c) => ({ fecha: c.fecha, texto: errores[claveDe(fila, c.fecha)] }))
              .find((x) => x.texto)
            return (
            <Fragment key={fila.clave}>
            <tr style={{ borderBottom: fallo ? undefined : `1px solid ${V.lineaFila}` }} data-testid="fila-quincena">
              <td className="bg-canvas" style={{ ...PEGADA, padding: '7px 8px 7px 0', verticalAlign: 'middle' }}>
                {/* EL NOMBRE ES LA PUERTA A SU CARPETA. El dueño: *"cada persona debe tener su
                    cronología de trabajo en su propia carpeta, no que se tiene que mostrar todo de
                    todos en la pantalla asistencia"*. Esta grilla es SÓLO la quincena elegida; el
                    año entero —lo importado de JORNALES incluido— vive en la ficha. */}
                {/* UNA LÍNEA, SIEMPRE. Un nombre largo no puede correr la quincena a la derecha:
                    se recorta con puntos suspensivos y el nombre entero queda en el `title`. */}
                <Link href={`/administracion/personas/${fila.persona.id}?v=horas`} prefetch={false}
                  data-testid="link-ficha-persona" title={fila.persona.nombre}
                  style={{
                    color: V.tinta, display: 'block', maxWidth: ANCHO_PERSONA - 8,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                  {fila.persona.nombre}
                </Link>
                {/* SIN NOTA NO HAY SEGUNDO RENGLÓN. El `<span>` vacío igual ocupaba su línea, y con
                    la celda centrada eso subía el nombre 7,5 px por encima de sus propias horas:
                    la fila se seguía leyendo torcida aunque el número ya estuviera en el eje. */}
                {fila.persona.nota && (
                  <span data-testid="nota-persona" title={fila.persona.nota} style={{
                    display: 'block', fontSize: '11.5px', color: V.apagado,
                    maxWidth: ANCHO_PERSONA - 8,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {fila.persona.nota}
                  </span>
                )}
              </td>
              {/* EL DESPLEGABLE ESTÁ EN EL EJE DE LA FILA, NO EL BLOQUE. Debajo del select cuelgan
                  una o dos líneas de texto («programar cambio», «→ Obra desde …», «horas en …») y,
                  con la celda centrada como cualquier otra, lo que quedaba en el eje era el bloque
                  entero: el control subía 7,5 px y la fila dejaba de leerse en una línea.
                  El grid `1fr auto 1fr` pone ARRIBA del select el mismo espacio que ocupa el pie
                  —las dos pistas `1fr` se resuelven al mismo alto, sea el pie de una línea o de
                  dos—, así que el select cae en el centro del conjunto: el ojo alinea el control.
                  El padding vertical del `td` pasa a 0 porque ese aire ahora lo da la pista de
                  arriba; con los 7 px de antes la fila crecía sin necesidad. */}
              <td data-testid="celda-obra" style={{
                padding: '0 8px', color: V.apagado, verticalAlign: 'middle',
              }}>
               <div data-testid="bloque-obra" style={{
                 display: 'grid', gridTemplateRows: '1fr auto 1fr', alignItems: 'center',
               }}>
                <div aria-hidden="true" />
                {/* ═══ UN DESPLEGABLE, NO UN FORMULARIO (pedido del dueño, 08/09/2026) ═══
                    Elegir otra obra cambia la asignación vigente DESDE HOY: cierra la anterior y
                    abre la nueva. No pide rol, ni cuadrilla, ni actividad, ni fechas — eso es lo
                    que hacía la asignación imposible de entender. Lo que no se pregunta tiene un
                    valor honesto: rol «integrante» y desde hoy. */}
                {puedeCambiarObra ? (
                  <select
                    data-testid="select-obra-actual"
                    aria-label={`Obra actual de ${fila.persona.nombre}`}
                    value={mostrada(fila)}
                    disabled={cambiando === fila.clave}
                    onChange={(e) => cambiarObra(fila, e.target.value)}
                    style={{
                      width: '100%', maxWidth: 210, fontSize: '12.5px', color: V.tinta,
                      background: 'transparent', border: `1px solid ${V.linea}`, borderRadius: 5,
                      padding: '3px 4px', opacity: cambiando === fila.clave ? 0.5 : 1,
                    }}
                  >
                    <option value="">Sin obra</option>
                    {/* SU OBRA VIGENTE, QUE YA NO ADMITE HORAS. Deshabilitada: no se puede dejar a
                        alguien ahí, pero mostrar otra sería decir que está donde no está. El texto
                        pide explícitamente la decisión que falta. */}
                    {fila.obraVigenteNoElegible && (
                      <option value={fila.obraVigenteNoElegible.id} disabled>
                        {fila.rotuloObra}
                      </option>
                    )}
                    {obras.map((o) => (
                      <option key={o.id} value={o.id}>{o.nombre}</option>
                    ))}
                  </select>
                ) : (
                  <span>{fila.rotuloObra}</span>
                )}
                {/* EL PIE ES LA TERCERA PISTA DEL GRID Y VA ENTERO EN UN SOLO HIJO: si cada línea
                    fuera hija del grid se abrirían pistas implícitas y el select dejaría de estar
                    en el medio. Lo que crece acá abajo crece también arriba, y el eje no se mueve. */}
                <div>
                {/* ═══ PLANIFICAR ES UNA LÍNEA DE TEXTO, NO UN BOTÓN ═══
                    El dueño (08/09/2026): «una cosa es hoy y cuando planifico quiero poner lo de
                    mañana y siguientes». El desplegable de arriba sigue siendo HOY y no cambió.
                    Esto es texto y no un botón a propósito: en una grilla de diecisiete filas,
                    diecisiete botones compiten con el gesto que se usa todos los días —marcar
                    asistencia— y lo empujan hacia abajo. Cuando hay un pase programado la línea lo
                    DICE, porque un plan invisible es un plan que nadie mira. */}
                {puedeCambiarObra && (
                  <span style={{ display: 'block', fontSize: '11px', marginTop: 2 }}>
                    {fila.proximoTramo && (
                      <span data-testid="proximo-tramo" style={{ color: V.tenue, marginRight: 6 }}>
                        → {fila.proximoTramo.nombre} desde {diaCorto(fila.proximoTramo.desde)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPlanDe(fila)}
                      data-testid="abrir-plan-obra"
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        font: 'inherit', color: V.tenue, textDecoration: 'underline',
                      }}
                    >
                      {fila.proximoTramo ? 'cambiar' : 'programar cambio'}
                    </button>
                  </span>
                )}
                {/* SIN ASIGNACIÓN PERO CON HORAS. El desplegable dice «Sin obra» —que es la verdad
                    de la asignación—, y esta línea dice dónde están sus horas, que es el otro dato
                    real y el que explica por qué la persona aparece en la grilla. */}
                {puedeCambiarObra && !fila.obraPorDefecto && !fila.obraVigenteNoElegible
                  && fila.rotuloObra !== SIN_OBRA && (
                  <span style={{ display: 'block', fontSize: '11px', color: V.tenue, marginTop: 2 }}>
                    horas en {fila.rotuloObra}
                  </span>
                )}
                {/* LA INDICACIÓN NO ENTRA EN LA OPCIÓN. «MAMPOSTERÍA (cerrada) — elegí la obra
                    actual» se cortaba en «— elegí la ob» dentro de los ~230 px del desplegable, y
                    lo único que se leía era basura. La opción dice la verdad de la base —dónde está
                    hoy, cerrada y todo— y la decisión que falta se pide acá abajo, con el mismo
                    tratamiento que «horas en …». */}
                {puedeCambiarObra && fila.obraVigenteNoElegible && (
                  <span data-testid="pide-obra-actual"
                    style={{ display: 'block', fontSize: '11px', color: V.tenue, marginTop: 2 }}>
                    elegí la obra actual
                  </span>
                )}
                </div>
               </div>
              </td>

              {fila.celdas.map((celda, i) => {
                const k = claveDe(fila, celda.fecha)
                const valor = borradores[k] ?? textoDe(celda)
                const hueco = vacioDe(celda.estado)
                const repartido = celda.tramos.length > 1
                // LA LICENCIA NO SE PISA DESDE LA GRILLA. Escribir un número encima convertiría en
                // horas trabajadas un día que alguien autorizó con respaldo documental, sin
                // preguntar y sin dejar rastro. Se corrige desde el panel, que muestra el motivo.
                // LA AUSENCIA TAMPOCO SE EDITA DESDE LA CELDA (08/09/2026). Desde que lleva horas
                // —las que corresponden por ley—, un campo editable encima significaría dos cosas a
                // la vez: «corregile las horas reconocidas» y «en realidad trabajó», y la segunda
                // mueve costo a una obra. Las dos se hacen en el panel, que muestra el motivo y las
                // horas juntos. Marcar «A» sobre una celda vacía sigue funcionando igual.
                const editable = celda.estado !== 'no_laborable' && celda.estado !== 'futuro'
                  && celda.estado !== 'licencia' && celda.estado !== 'ausente'
                  && !repartido && (fila.obraPorDefecto !== null || celda.tramos.length === 1)
                // Lo que escribe una celda que NO se edita. Vacío en licencia, ausencia y futuro:
                // el día ya está dicho arriba, y un «—» ahí afirmaría que no era laborable.
                // LAS HORAS DE LA AUSENCIA SE VEN DEBAJO DE LA «A» (dueño, 08/09/2026): «las
                // ausencias que tienen motivo registrado dan la posibilidad de que se le registre
                // hs». Sin número, la celda no distingue una ausencia con horas reconocidas de una
                // sin nada, que es la diferencia entre lo que se paga y lo que no.
                const textoFijo = celda.estado === 'horas' ? hs(celda.horas ?? 0)
                  : celda.estado === 'licencia' || celda.estado === 'ausente'
                    ? (celda.horas !== null ? hs(celda.horas) : '')
                    : celda.estado === 'futuro' ? '' : hueco.texto
                return (
                  <td key={celda.fecha} style={{
                    padding: '4px 2px', textAlign: 'center', verticalAlign: 'middle',
                    background: columnasTenues[i] ? V.fondo : undefined,
                  }}>
                    {/* EL PUNTO DEL DÍA REPARTIDO NO PUEDE ALARGAR LA CELDA: colgado abajo en el
                        flujo, esa fila crecía 9 px y su número quedaba más alto que el de la fila
                        de al lado. Va superpuesto, dentro de los mismos 44 px. */}
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                    <CeldaDia
                      entrada={entradaDe(celda)}
                      testid={editable ? 'celda-dia' : 'celda-fija'}
                      estado={editable ? undefined : celda.estado}
                      // CON EL CAMPO VACÍO, LA «A» O LA «L» SON TODO LO QUE LA CELDA DICE, y van al
                      // centro. El componente no puede verlo solo: lo que hay adentro del `<input>`
                      // lo sabe esta grilla.
                      horasVacias={editable ? valor === '' : textoFijo === ''}
                    >
                    {editable ? (
                      <input
                        aria-label={`${fila.persona.nombre} · ${fila.rotuloObra} · ${celda.fecha}`}
                        data-testid="celda-hora"
                        data-estado={celda.estado}
                        value={valor}
                        placeholder={hueco.texto}
                        onChange={(e) => {
                          setBorradores((b) => ({ ...b, [k]: e.target.value }))
                          if (errores[k]) setErrores((x) => { const n = { ...x }; delete n[k]; return n })
                        }}
                        onBlur={(e) => guardar(fila, celda, e.target.value)}
                        className="font-mono tabular-nums"
                        style={{
                          width: 42, height: 28, textAlign: 'center', fontSize: '12.5px',
                          color: V.tinta, background: 'transparent',
                          border: errores[k] ? `1px solid ${ROJO}` : '1px solid transparent',
                          borderRadius: 5,
                        }}
                      />
                    ) : (
                      // ═══ LA CELDA QUE NO SE EDITA EN LÍNEA IGUAL SE TOCA (dueño, 10/09/2026) ═══
                      //
                      // *«no me sirve no poder editar las horas desde ahí mismo (…) quiero
                      // cambiarle ese estado y no puedo»*. Una licencia, una ausencia y un día
                      // futuro siguen SIN campo de horas —el porqué está arriba: un número encima de
                      // una «L» significaría dos cosas a la vez—, pero ahora abren el panel EN ESE
                      // DÍA, que es donde el estado sí se cambia. Antes eran las únicas celdas
                      // muertas de la grilla: había que buscar «corregir» al final de la fila y
                      // volver a elegir el día en un desplegable de quince.
                      puedeCorregir ? (
                        <button
                          type="button"
                          data-testid="celda-abrir-panel"
                          data-estado={celda.estado}
                          title={`${tituloDe(celda) ?? ''}${tituloDe(celda) ? ' · ' : ''}Tocá para corregir este día`.trim()}
                          aria-label={`Corregir el ${celda.fecha} de ${fila.persona.nombre}`}
                          onClick={() => {
                            setCopia(fila)
                            setDiaFoco(celda.fecha)
                            setCorrigiendo(fila.clave)
                          }}
                          className="font-mono tabular-nums"
                          style={{
                            display: 'flex', width: 42, height: 28, alignItems: 'center',
                            justifyContent: 'center', fontSize: '12.5px', background: 'transparent',
                            border: '1px solid transparent', borderRadius: 5, cursor: 'pointer',
                            color: celda.estado === 'horas' ? V.tinta : hueco.color,
                          }}
                        >
                          {textoFijo}
                        </button>
                      ) : (
                      <span
                        data-capa="horas"
                        title={tituloDe(celda)}
                        className="font-mono tabular-nums"
                        style={{
                          display: 'flex', height: 28, alignItems: 'center', fontSize: '12.5px',
                          color: celda.estado === 'horas' ? V.tinta : hueco.color,
                        }}
                      >
                        {textoFijo}
                      </span>
                      )
                    )}
                    </CeldaDia>
                    {repartido && (
                      <span data-testid="celda-repartida" title={`${celda.tramos.length} obras ese día`}
                        style={{
                          position: 'absolute', left: 0, right: 0, bottom: 1,
                          fontSize: '9px', color: V.tenue, lineHeight: 1, pointerEvents: 'none',
                        }}>
                        ●
                      </span>
                    )}
                    </span>
                  </td>
                )
              })}

              {/* EL TOTAL NO SE PINTA DE ROJO (regla: horas = cantidad, sin color de estado).
                  Pintaba en ROJO cuando la persona tenía días sin cargar, y eso decía dos mentiras
                  a la vez: que sus 96 horas son un problema, y que el problema es de ella cuando lo
                  que falta es que Administración cargue. Los días pendientes ya los dice el marco
                  punteado de cada celda y el rótulo del encabezado. */}
              <td data-testid="total-persona" style={{
                padding: '7px 0 7px 8px', textAlign: 'right', verticalAlign: 'middle',
                fontVariantNumeric: 'tabular-nums',
                color: fila.horas === null ? V.inerte : V.tinta,
              }}>
                {/* `—` Y NO `0`: cero afirma que trabajó cero horas esa quincena; lo que hay es que
                    nadie declaró ninguna. */}
                {fila.horas === null ? '—' : hs(fila.horas)}
              </td>
              {puedeCorregir && (
                <td style={{ padding: '7px 0 7px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                  <button
                    type="button"
                    data-testid="abrir-correccion"
                    onClick={() => {
                      setCopia(fila)
                      setDiaFoco(null)
                      setCorrigiendo(corrigiendo === fila.clave ? null : fila.clave)
                    }}
                    style={{ fontSize: '11.5px', color: corrigiendo === fila.clave ? V.tinta : V.apagado }}
                  >
                    corregir
                  </button>
                </td>
              )}
            </tr>
            {fallo && (
              <tr style={{ borderBottom: `1px solid ${V.lineaFila}` }} data-testid="fila-error">
                <td colSpan={3 + dias.length + (puedeCorregir ? 1 : 0)}
                  style={{ padding: '0 0 6px', color: ROJO, fontSize: '11.5px' }}>
                  {/* UNA SOLA LÍNEA, PASE LO QUE PASE. `nowrap` + `ellipsis` sobre un ancho de 0 con
                      `max-width: 100%`: sin el 0 la celda crece con el texto y la tabla se ensancha
                      hasta sacar la quincena de la pantalla — el mismo defecto, movido de lugar.
                      El texto entero queda en `title`. */}
                  <div title={fallo.texto} style={{
                    width: 0, minWidth: '100%', overflow: 'hidden',
                    whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  }}>
                    {fechaCorta(fallo.fecha)} · {fallo.texto}
                  </div>
                </td>
              </tr>
            )}
            {/* EL ACUSE VA DEBAJO DE LA FILA Y NO EN LA CELDA: «Desde hoy en SALÓN COMERCIAL · antes
                PISOS INDUSTRIALES» no entra en una columna del 18% sin partirse en cinco renglones.
                Queda hasta el próximo cambio: quien lo hizo tiene que poder leerlo después de que
                la fila se refrescó. Es una fila aparte de la del error de carga: son dos hechos
                distintos —dónde trabaja y qué pasó con una hora— y apilarlos en la misma línea
                haría que uno tapara al otro. */}
            {acuses[fila.clave] && (
              <tr data-testid="acuse-obra-actual">
                <td colSpan={3 + dias.length + (puedeCorregir ? 1 : 0)} style={{
                  padding: '0 0 7px', fontSize: '11.5px',
                  color: acuses[fila.clave].error ? ROJO : V.apagado,
                }}>
                  {acuses[fila.clave].texto}
                </td>
              </tr>
            )}
            </Fragment>
            )
          })}
          </Fragment>
          ))}

          <tr style={{ borderTop: `1px solid ${V.lineaFuerte}` }} data-testid="total-quincena">
            <td colSpan={2} style={{ padding: '8px 8px 8px 0', color: V.apagado }}>Total de la quincena</td>
            {totalesDia.map((t, i) => (
              <td key={dias[i]} style={{
                padding: '8px 2px', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                color: t === null ? V.inerte : V.tinta,
                background: columnasTenues[i] ? V.fondo : undefined,
              }}>
                {t === null ? '—' : hs(t)}
              </td>
            ))}
            <td data-testid="total-quincena-valor" style={{
              padding: '8px 0 8px 8px', textAlign: 'right', fontWeight: 600,
              fontVariantNumeric: 'tabular-nums', color: total === null ? V.inerte : V.tinta,
            }}>
              {total === null ? '—' : hs(total)}
            </td>
            {puedeCorregir && <td />}
          </tr>
        </tbody>
      </table>
    </div>
    {/* FUERA DEL ELEMENTO QUE SCROLLEA: adentro se arrastraría con el contenido y la sombra
        terminaría en el medio de la tabla. `pointer-events-none` para que no coma clics. */}
    {quedaALaDerecha && (
      <div aria-hidden data-testid="hay-mas-grilla"
        // `from-line-strong` Y NO `from-ink/15`: en este Tailwind los colores son `var(--os-…)` planos
        // y el modificador de opacidad se DESCARTA — la clase no genera ninguna regla y la sombra no
        // existiría. Verificado sobre el CSS compilado.
        className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-line-strong to-transparent" />
    )}
    </div>

    {/* FUERA DEL CONTENEDOR CON `overflow-x`. Un `position: fixed` adentro de un elemento que
        scrollea de costado se arrastra con el scroll en cuanto aparece un ancestro con
        `transform`: el panel quedaría a mitad de camino de la pantalla sin que nadie lo vea venir. */}
    {abierta && (
      <PanelCorreccionJornada
        fila={abierta}
        dias={dias}
        etiquetas={etiquetas}
        obras={obras}
        jornadaPorObra={jornadaPorObra}
        diaInicial={diaFoco}
        alCerrar={() => setCorrigiendo(null)}
      />
    )}

    {/* MISMA RAZÓN QUE ARRIBA: fuera del contenedor que scrollea de costado. */}
    {planDe && (
      <PlanDeObraPanel
        persona={planDe.persona}
        obras={obras}
        hoy={hoy}
        onCerrar={() => setPlanDe(null)}
      />
    )}
    </>
  )
}

/** `2026-09-04` → `04/09`. La línea de error tiene que decir de qué día habla. */
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * EL RÓTULO DE UNA SECCIÓN DE LA GRILLA — un filo y una palabra.
 *
 * Misma tipografía que los rótulos de columna (11px, versalita, tenue): dentro de una tabla no
 * puede aparecer un tercer nivel tipográfico, y un fondo de color por grupo convertiría la
 * quincena en dos tableros. El filo va ARRIBA y sólo en los grupos que siguen al primero — el
 * encabezado de columnas ya trae el suyo y dos líneas seguidas se leen como un borde grueso.
 *
 * El subtotal cae en la columna HORAS, la misma en la que cada fila publica su total: leído de
 * arriba abajo, el número siempre significa lo mismo.
 */
function FilaDeGrupo({ rotulo, horas, dias, conCorreccion, primero }: {
  rotulo: string; horas: number | null; dias: number; conCorreccion: boolean; primero: boolean
}) {
  const filo = { borderBottom: `1px solid ${V.linea}`, borderTop: primero ? undefined : `1px solid ${V.linea}` }
  // Más aire arriba cuando el grupo NO es el primero: ahí el espacio es lo que separa una sección
  // de la anterior. Múltiplos de 2 sobre la grilla de 8, como el resto de la tabla.
  const arriba = primero ? 10 : 16
  return (
    <tr data-testid="fila-grupo" data-grupo={rotulo}>
      <td colSpan={2} style={{
        ...filo, padding: `${arriba}px 8px 6px 0`,
        fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
        color: V.tenue,
      }}>
        {rotulo}
      </td>
      <td colSpan={dias} style={filo} />
      {/* `—` Y NO `0`: nadie declaró una hora de este grupo no es lo mismo que trabajó cero. */}
      <td data-testid="subtotal-grupo" style={{
        ...filo, padding: `${arriba}px 0 6px 8px`,
        textAlign: 'right', fontSize: '11.5px', fontVariantNumeric: 'tabular-nums',
        color: horas === null ? V.inerte : V.apagado,
      }}>
        {horas === null ? '—' : hs(horas)}
      </td>
      {conCorreccion && <td style={filo} />}
    </tr>
  )
}

function Rotulo({ children, ancho, centro, derecha, tenue, titulo, pegada }: {
  children?: React.ReactNode; ancho?: string; centro?: boolean; derecha?: boolean
  tenue?: boolean; titulo?: string
  /** Se queda a la izquierda cuando la tabla se corre: ver `PEGADA`. */
  pegada?: boolean
}) {
  return (
    <th title={titulo} className={pegada ? 'bg-canvas' : undefined} style={{
      ...(pegada ? PEGADA : null),
      width: ancho,
      padding: '0 2px 8px',
      textAlign: derecha ? 'right' : centro ? 'center' : 'left',
      fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
      color: V.tenue, height: 30,
      background: tenue ? V.fondo : undefined,
    }}>
      {children}
    </th>
  )
}
