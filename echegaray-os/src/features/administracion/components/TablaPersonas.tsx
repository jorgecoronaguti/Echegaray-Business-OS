// 19 · PERSONAL — el plantel sin caja, con la geometría del handoff CRM / Administración v4.
//
// `design_handoff_crm_v4/pantallas/Administración v4 · Pantallas.dc.html`, bloque «1 · PERSONAL»:
//   `minmax(220px,1.5fr) minmax(150px,1fr) 130px 110px 90px 130px`, gap 16
//   PERSONA · PUESTO · OBRA · HOY · HH MES · PAPELES
//
// ═══ QUÉ CAMBIÓ RESPECTO DEL PORTE DE AGOSTO (05/09/2026) ═══
//
// EL OFICIO SUBE A COLUMNA PROPIA — «PUESTO». Estaba pegado al nombre en 11,5px tenue, donde compite
// por el mismo ancho que lo único que identifica una fila. En su columna se puede BARRER: leer de
// arriba abajo quién es capataz y quién ayudante sin abrir 62 legajos.
//
// Lo que la columna dice y lo que NO: sale de `oficioVisible(especialidad, puesto)`, la misma regla
// probada que ya alimentaba el rótulo pegado al nombre. Medido el 05/09/2026 sobre `personas`: 53 de
// 78 filas tienen con qué llenarla (52 por `especialidad`, 1 por `puesto`) y 25 quedan en «sin
// puesto». Las 25 NO son motivo para no dibujar la columna —el mockup dibuja «sin puesto» como un
// valor más (`Ledesma, Marcos`)— pero sí para que la ausencia vaya APAGADA y no en ámbar: no saber
// el oficio de alguien no bloquea ninguna decisión de la pantalla, a diferencia de no saber su obra.
//
// ═══ 08/09/2026 · PAPELES SE RETIRA; ENTRAN LEGAJO Y ALTA ═══
//
// Orden del dueño, textual: «quitar la columna Papeles de la sección Plantel» y «el módulo
// asistencia en lo que respecta a plantel tiene que reflejar esas categorías, las fechas de alta y
// el número de legajo que sale en el recibo de sueldo». Las dos columnas nuevas publican
// `personas.legajo` y `personas.fecha_ingreso`, cargados desde el recibo de sueldo (2ª quincena
// 08/2026) con su rastro en `notas`. La celda de papeles y su tinta se fueron con la columna; la
// regla `rotuloDePapeles` sigue viva en `pulsoDelPlantel` para la ficha.
//
// ═══ DE SIETE COLUMNAS A CUATRO ═══
//
// PERSONA · OBRA ASIGNADA · HOY · HH DEL MES. El porte de agosto dibujaba siete —persona, oficio/
// categoría, obra/cuadrilla, hoy, HH, papeles y el `···`— dentro de una tarjeta con encabezado gris
// y pie de totales. Qué se fue y adónde:
//
//   OFICIO / CATEGORÍA   el oficio sube al lado del nombre, en 11,5px tenue (`19v2:113`). La
//                        categoría UOCRA baja al legajo: es lo que cobra, no lo que hace, y en una
//                        lista de trabajo no decide nada.
//   CUADRILLA            baja al legajo. La lista contesta «¿en qué obra está?», no «¿con quién?».
//   PAPELES              se retiró en agosto y VUELVE con el handoff v4, pero diciendo otra cosa.
//                        Antes escribía «al día» sobre un control que nadie hace: 847 papeles
//                        cargados y CERO con vencimiento (24/08). Ahora dice CUÁNTOS HAY —«6
//                        cargados», «sin cargar»—, que es un conteo y no una afirmación de
//                        vigencia. El vencimiento sólo aparece el día que exista uno cargado, y
//                        entonces gana la celda: es lo que impide entrar a la obra.
//   ···                  se fue. Una columna de menús en una lista que existe para encontrar y abrir
//                        es una columna de ruido; las acciones viven en el legajo.
//   AVATAR               pasa a ser el icono de persona del §11 (15px, `19v2:112`). Las iniciales
//                        teñidas por el estado del día decían lo mismo que la columna HOY, dos veces.
//
// ═══ EL NOMBRE NUNCA SE ESTRANGULA ═══
//
// Por debajo de 1250px se sueltan HOY y HH DEL MES y quedan PERSONA · OBRA ASIGNADA (`19v2:139`).
// Lo decide una media query y no `window.innerWidth`, para no volver la tabla un componente de
// cliente. Su `display` NUNCA va inline: un estilo inline le gana a cualquier media query y el
// rótulo se queda dibujado sobre una grilla que ya no tiene su columna.
//
// Y lo que la tabla no muestra TAMPOCO SE LE PIDE A LA BASE: `personasService` sigue nombrando sus
// columnas una por una, así que ni DNI, ni CUIL, ni retribución viajan al navegador.

import Link from 'next/link'
import { IconoPersona } from '@/shared/components/iconos'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from '@/shared/components/v2/patron'
import { oracion } from '@/shared/utils/texto'
import type { PersonaEnDirectorio } from '../types'
import { agruparPorRolOrganizacional, categoriaVisible, esJefeDeObra } from '../services/vocabularioPersona'
import {
  SIN_MARCAR, hayMarcaDeHoy, horasVisibles, rotuloHoy,
  type EstadoDePapeles, type MarcaDeHoy,
} from '../services/pulsoDelPlantel'
import type { ClasificacionDelDia } from '../services/asistenciaDelDia'
import type { RotuloHoy } from '../services/pulsoDelPlantel'

/** Las tres lecturas del día, ya agrupadas por persona. Cada `disponible` en false apaga SU columna:
 *  una lectura que falló no se dibuja como «no hay nada». */
export interface PulsoDelPlantel {
  marcas: Map<string, MarcaDeHoy>
  /** La asistencia de HOY por persona, ya clasificada por `clasificar()`. Quien no está en el Map
   *  no tiene nada declarado ni cargado, y eso es `SIN_MARCAR` — no una ausencia. */
  asistencia: Map<string, ClasificacionDelDia>
  hh: Map<string, number>
  papeles: Map<string, EstadoDePapeles>
  hoyDisponible: boolean
  hhDisponible: boolean
  /**
   * SE PUDO LEER `documentacion_legajo`. Es lo único que habilita a escribir «sin cargar» en una
   * fila: un control que no pudo mirar no dice «no está», dice «sin lectura».
   */
  papelesLeidos: boolean
  /**
   * HAY DE VERDAD UN CONTROL DE VENCIMIENTOS. Hoy siempre `false`: 847 papeles cargados y ninguno
   * con fecha. Habilita el rótulo «N vencidos», no el conteo — el conteo sale igual sin él.
   */
  papelesDisponible: boolean
}

/**
 * LA GRILLA DEL HANDOFF v4, carácter por carácter. Literal porque Tailwind no compila una clase
 * armada en runtime.
 *
 * En angosto se sueltan PUESTO, HOY, HH MES y PAPELES y quedan PERSONA · OBRA: el déficit de ancho
 * NUNCA cae sobre el nombre, que es lo único que identifica una fila, ni sobre la obra, que es la
 * pregunta que la lista contesta. El oficio se sigue leyendo en el legajo.
 */
const COLS
  = 'grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_130px_110px_90px_70px_90px]'
  + ' max-[1249px]:grid-cols-[minmax(200px,1.5fr)_minmax(0,1fr)]'
/** En «Inactivos» no hay HOY ni HH que preguntarle a quien ya no está: la baja ocupa su lugar. */
const COLS_BAJA
  = 'grid-cols-[minmax(230px,1.5fr)_minmax(0,1fr)_minmax(0,220px)]'
  + ' max-[1249px]:grid-cols-[minmax(200px,1.5fr)_minmax(0,1fr)]'
const SOLO_ANCHO = 'max-[1249px]:hidden'
/** `gap:16` del bloque «1 · PERSONAL». El patrón v2 declara 14 y esta pantalla lo corre a 16. */
const GAP = 16

export function TablaPersonas({
  personas, conBaja = false, pulso, vacio = 'Nada coincide.',
}: {
  personas: PersonaEnDirectorio[]
  /** El listado de Inactivos cambia la geometría: sin HOY ni HH, y con la baja. */
  conBaja?: boolean
  /** Sin pulso la lista es la de siempre: el día de hoy no se le pregunta a quien ya no está. */
  pulso?: PulsoDelPlantel
  /** Qué decir cuando ningún filtro deja nada. Lo decide la página: depende del corte activo. */
  vacio?: string
}) {
  const conPulso = Boolean(pulso) && !conBaja
  const cols = conBaja ? COLS_BAJA : COLS
  // ═══ JEFES DE OBRA ARRIBA, EL RESTO ABAJO (dueño, 08/09/2026) ═══
  //
  // *«dividir en la pestaña asistencia y plantel a los jefes de obra del resto de los obreros»*.
  // Quién es jefe lo decide `esJefeDeObra(puesto)` —una sola definición para las dos pantallas, con
  // su fuente y su prueba en `services/vocabularioPersona.ts`—; acá sólo se dibuja.
  //
  // El orden DENTRO de cada grupo es el que llegó: la página ya ordenó, y reordenar acá sería una
  // segunda regla de orden que nadie pidió. Cuando no hay jefes queda un solo grupo y la lista se
  // ve exactamente como antes — sin rótulo, sin hairline y sin un «· 0» que no dice nada.
  const grupos = agruparPorRolOrganizacional(personas, (p) => esJefeDeObra(p.puesto))

  return (
    <div data-testid="tabla-personas">
      <div className={`grid ${cols}`} style={{ ...ENCABEZADO, gap: conBaja ? 14 : GAP }}>
        <RotuloCol>Persona</RotuloCol>
        {/* «CATEGORÍA», NO «PUESTO» (07/09/2026, pedido del dueño). El campo guarda la categoría de
            convenio —oficial, ayudante, oficial especializado—, que es lo que decide la tarifa; el
            rótulo anterior sugería un cargo. El nombre del campo en la base no cambia: renombrarlo
            arrastraría el legajo, la auditoría de cambios y el formulario, y lo que estaba mal era
            cómo se lee, no dónde vive.
            SU RÓTULO NO PUEDE LLEVAR `display` INLINE: se suelta en angosto junto con las otras tres,
            y un estilo inline le gana a cualquier media query — el rótulo quedaría dibujado sobre una
            grilla que ya no tiene su columna. */}
        {!conBaja && <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Categoría</RotuloCol></span>}
        <RotuloCol>{conBaja ? 'Última obra' : 'Obra'}</RotuloCol>
        {conBaja
          ? <RotuloCol>Baja</RotuloCol>
          : (
              <>
                <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Hoy</RotuloCol></span>
                <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>HH mes</RotuloCol></span>
                <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Legajo</RotuloCol></span>
                <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Alta</RotuloCol></span>
              </>
            )}
      </div>

      {grupos.map((g, iGrupo) => (
        <div key={g.clave} data-testid={`grupo-${g.clave}`}>
          {grupos.length > 1 && <RotuloDeGrupo texto={g.rotulo} primero={iGrupo === 0} />}
          {g.integrantes.map((p) => {
        // LAS DOS CAPAS DEL DÍA, CADA UNA CON SU FUENTE Y SU DISPONIBILIDAD. La asistencia sale de
        // `registros_hh` (la lectura de HH); el ● de presencia, de una marca real. Que una falle no
        // apaga la otra, y ninguna se deriva de la otra.
        const asistencia = conPulso && pulso?.hhDisponible
          ? (pulso.asistencia.get(p.id) ?? SIN_MARCAR)
          : null
        const ficho = Boolean(conPulso && pulso?.hoyDisponible && hayMarcaDeHoy(pulso.marcas.get(p.id)))
        const categoria = categoriaVisible(p.categoria, p.puesto)
        return (
          <Link
            key={p.id}
            href={`/administracion/personas/${p.id}`}
            prefetch={false}
            role="row"
            data-testid="fila-persona"
            className={`grid items-center ${CAJA_CONTENIDO} ${cols} hover:bg-[#F2F1ED]`}
            style={{
              gap: conBaja ? 14 : GAP,
              height: ALTO_V2.fila,
              borderBottom: `1px solid ${V.lineaFila}`,
              // El filo ámbar dice «esto bloquea»: activo y sin obra. A quien ya no está no se le
              // reclama nada, y por eso «Inactivos» no lleva ni un filo.
              boxShadow: !conBaja && p.en_la_empresa && !p.obra_actual_id ? FILO_BLOQUEA : undefined,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                <IconoPersona className="h-[15px] w-[15px]" />
              </span>
              {/* EL NOMBRE LLEVA SU PROPIO IDENTIFICADOR aunque la fila entera sea el enlace: es lo
                  que lee quien prueba para saber QUIÉN está en la lista, y la fila completa incluye
                  el oficio, la obra y las HH. */}
              <span data-testid="abrir-persona" className="truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
                {oracion(p.nombre_completo)}
              </span>
            </span>

            {/* PUESTO — EL OFICIO, no la categoría UOCRA: lo que sabe hacer, no lo que cobra. La
                regla y su prueba viven en `services/vocabularioPersona.ts` — un `??` pelado no
                MIRABA el valor y dejaba pasar códigos del convenio importados como si fueran
                oficios.
                «SIN PUESTO» VA APAGADO Y NO EN ÁMBAR: es la palabra del mockup y el color de su
                consecuencia. No conocer el oficio de alguien no impide nada en esta pantalla; no
                conocer su obra sí, y por eso la celda de al lado sí puede ponerse ámbar. */}
            {!conBaja && (
              <span
                className={`truncate ${SOLO_ANCHO}`}
                style={{ fontSize: '12px', color: categoria ? V.tintaSuave : V.tenue }}
                data-testid="categoria-persona"
              >
                {categoria ?? 'sin categoría'}
              </span>
            )}

            {/* SIN ASIGNAR NO ES UN HUECO: es una respuesta, y va en ámbar (`19v2:127`). */}
            <span
              className="truncate"
              style={{ fontSize: '12px', color: p.obra_actual_id ? V.tintaSuave : conBaja ? V.lupa : V.warn }}
            >
              {p.obra_actual_id ? (p.obra_actual ?? p.obra_actual_id) : 'sin asignar'}
            </span>

            {conBaja
              ? (
                  // SE FUE SIN FECHA NO ES LO MISMO QUE NO SE FUE. De los 45 legajos cerrados, 22 no
                  // tienen baja documentada: «sin papel de baja» ES el dato.
                  <span className="font-mono tabular-nums truncate" style={{ fontSize: '11.5px', color: p.fecha_egreso ? V.apagado : V.warn }}>
                    {fechaCorta(p.fecha_egreso) ?? 'sin papel de baja'}
                  </span>
                )
              : (
                  <>
                    <span
                      className={`flex items-center gap-1 ${SOLO_ANCHO}`}
                      style={{ minWidth: 0 }}
                      data-testid="hoy-persona"
                      data-estado={asistencia?.presencia}
                      data-horas={asistencia?.horas ?? ''}
                      data-ficho={ficho ? 'si' : undefined}
                    >
                      {asistencia
                        ? <CeldaHoy clasificacion={asistencia} ficho={ficho} />
                        : <span style={{ fontSize: '12px', color: V.lupa }}>sin lectura</span>}
                    </span>

                    {/* LA PERSONA SIN IMPUTACIONES DICE «SIN HH», NO 0: un 0 acá afirmaría que no
                        trabajó en todo el mes. */}
                    <span
                      className={`font-mono tabular-nums ${SOLO_ANCHO}`}
                      style={{
                        fontSize: '12px', textAlign: 'right',
                        color: pulso?.hhDisponible && pulso.hh.has(p.id) ? V.tinta : V.lupa,
                      }}
                      data-testid="hh-mes"
                    >
                      {!pulso?.hhDisponible
                        ? 'sin lectura'
                        : pulso.hh.has(p.id) ? horasVisibles(pulso.hh.get(p.id) ?? 0) : 'sin HH'}
                    </span>

                    {/* LEGAJO Y ALTA SON LOS DEL RECIBO DE SUELDO. Sin legajo se dice «sin legajo»,
                        no un guión: un guión se lee como «no aplica», y a todo UOCRA le aplica. */}
                    <span className={`font-mono tabular-nums truncate ${SOLO_ANCHO}`} style={{ fontSize: '12px', color: p.legajo ? V.tinta : V.tenue }} data-testid="legajo-persona">
                      {p.legajo ?? 'sin legajo'}
                    </span>
                    <span className={`font-mono tabular-nums truncate ${SOLO_ANCHO}`} style={{ fontSize: '11.5px', color: p.fecha_ingreso ? V.apagado : V.tenue }} data-testid="alta-persona">
                      {fechaCorta(p.fecha_ingreso) ?? 'sin fecha de alta'}
                    </span>
                  </>
                )}
          </Link>
        )
          })}
        </div>
      ))}

      {personas.length === 0 && (
        <div style={{ padding: '24px 2px', fontSize: '12.5px', color: V.apagado }} data-testid="personas-vacio">
          {vacio}
        </div>
      )}
    </div>
  )
}

/**
 * LA CELDA «HOY» — DOS CAPAS EN HORIZONTAL QUE NO HABLAN UNA POR LA OTRA.
 *
 * El dueño, 08/09/2026, por tercera vez: *«todas las pantallas en donde aparezca el concepto de
 * fichado no tiene que resolverse con las hs; está mal: una cosa es asistencia o activo en el día y
 * otra cosa son las cantidades de hs»*. La celda escribía «9 h» y nada más: la CANTIDAD ocupaba el
 * lugar del ESTADO, y la columna quedaba afirmando que vino todo el que tenía un número.
 *
 *   ESTADO  ● presente (verde) · A ausente (rojo) · L licencia (neutro) · «sin marcar» (el gris más
 *           tenue). Sale de `asistencia_dia`, de una marca real o de una ausencia declarada en
 *           `registros_hh`. NUNCA de un número de horas.
 *   HORAS   la cantidad, monoespaciada y en tinta. Sin color de estado. Cuando no hay, no se
 *           escribe nada.
 *
 * «Sin marcar · 9 h» es una fila NORMAL, no una contradicción: mientras el fichaje no esté en uso y
 * el jefe no declare, es lo que va a decir casi toda la columna. La contradicción de verdad —una
 * ausencia declarada con horas cargadas— sí se marca, y en rojo.
 *
 * Es la misma anatomía de `CeldaDia`, en horizontal: la celda apilada de 44 px se diseñó para una
 * grilla de quince columnas y acá rompería el alto de fila del handoff v4.
 */
/** La tinta del ESTADO. Rojo SÓLO para la ausencia, que es lo único que reclama una decisión de
 *  quien liquida; la licencia ya está resuelta y va en neutro; el silencio, en el gris de «sin HH».
 *  Las horas NO entran acá: van siempre en tinta plena, sin color de estado. */
const TINTA_ESTADO: Record<RotuloHoy['tono'], string> = {
  pos: 'var(--os-pos)', neg: V.neg, neutro: V.apagado, silencio: V.lupa,
}

function CeldaHoy({ clasificacion, ficho }: { clasificacion: ClasificacionDelDia; ficho: boolean }) {
  const r = rotuloHoy(clasificacion)
  return (
    <>
      {/* EL FICHAJE TIENE SU PROPIA MARCA, y sólo si hay una marca REAL de hoy. Sin ella no se
          escribe nada: el silencio de una capacidad sin estrenar no es una novedad sobre la gente. */}
      {ficho && (
        <span
          className="text-pos"
          title="Fichó hoy"
          data-capa="fichaje"
          style={{ fontSize: '9px', lineHeight: 1, flexShrink: 0 }}
        >
          ●
        </span>
      )}
      <span
        className="truncate"
        data-capa="presencia"
        data-presencia={r.estado}
        title={r.conflicto ? 'Ausencia declarada y horas cargadas el mismo día' : undefined}
        style={{ fontSize: '12px', color: r.conflicto ? 'var(--os-neg)' : TINTA_ESTADO[r.tono], flexShrink: 0 }}
      >
        {r.simbolo && <span style={{ fontWeight: 600 }}>{r.simbolo} </span>}
        {r.texto}
      </span>
      {/* LAS HORAS NO VAN ACÁ. Dueño, 08/09/2026: «no mezclemos eso de presente con las hs al lado, no
          sirve». La columna HOY dice sólo la presencia; la cantidad ya tiene su columna (HH MES) y su
          pantalla (Asistencia). */}
    </>
  )
}

/**
 * EL RÓTULO DE SECCIÓN — un filo y una palabra, no una tarjeta.
 *
 * Es el mismo rótulo de 11px versalita tenue que ya usan las columnas (`RotuloCol`): dentro de la
 * lista no puede aparecer un tercer nivel tipográfico. Va SIN card, sin fondo y sin icono — un
 * bloque con caja por grupo convertiría una lista de trabajo en dos tableros.
 *
 * El primero no lleva filo arriba: el encabezado de columnas ya trae el suyo y dos líneas seguidas
 * a 8px se leen como un borde grueso. Los que siguen sí, con 8px de aire, que es lo que separa un
 * grupo del anterior sin abrir un hueco.
 */
function RotuloDeGrupo({ texto, primero }: { texto: string; primero: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 32,
      marginTop: primero ? 0 : 8,
      paddingTop: primero ? 0 : 8,
      borderTop: primero ? undefined : `1px solid ${V.linea}`,
    }}>
      <RotuloCol>{texto}</RotuloCol>
    </div>
  )
}

/** dd/mm/aa. Una fecha sin cargar se dice con palabras; un guión se lee como «no aplica». */
function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a.slice(2)}`
}
