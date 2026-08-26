// 19 · PERSONAL v2 — el plantel sin caja. Porte literal de `19 · Personal v2.dc.html`.
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
//   PAPELES              se retira de la fila. Medido el 24/08 sobre la base real: 847 papeles
//                        cargados y CERO con vencimiento, así que la columna decía «al día» en 61
//                        filas — un control que nadie está haciendo. Lo que sí queda es la SEÑAL de
//                        arriba, que sólo aparece cuando hay un vencimiento de verdad.
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
import { oficioVisible } from '../services/vocabularioPersona'
import {
  HOY_LABEL, estadoHoy, horasVisibles, type EstadoDePapeles, type EstadoHoy, type MarcaDeHoy,
} from '../services/pulsoDelPlantel'

/** Las tres lecturas del día, ya agrupadas por persona. Cada `disponible` en false apaga SU columna:
 *  una lectura que falló no se dibuja como «no hay nada». */
export interface PulsoDelPlantel {
  marcas: Map<string, MarcaDeHoy>
  hh: Map<string, number>
  papeles: Map<string, EstadoDePapeles>
  hoyDisponible: boolean
  hhDisponible: boolean
  /** Hoy siempre `false`: no hay ni un vencimiento cargado. Alimenta la SEÑAL, no una columna. */
  papelesDisponible: boolean
}

/** `19v2:139`. Literales porque Tailwind no compila una clase armada en runtime. */
const COLS
  = 'grid-cols-[minmax(230px,1.5fr)_minmax(0,1fr)_minmax(0,130px)_minmax(0,90px)]'
  + ' max-[1249px]:grid-cols-[minmax(200px,1.5fr)_minmax(0,1fr)]'
/** En «Inactivos» no hay HOY ni HH que preguntarle a quien ya no está: la baja ocupa su lugar. */
const COLS_BAJA
  = 'grid-cols-[minmax(230px,1.5fr)_minmax(0,1fr)_minmax(0,220px)]'
  + ' max-[1249px]:grid-cols-[minmax(200px,1.5fr)_minmax(0,1fr)]'
const SOLO_ANCHO = 'max-[1249px]:hidden'

/** `19v2:37`. El punto de HOY. La palabra viaja al lado: nunca sólo el color. */
const PUNTO: Record<EstadoHoy, string> = {
  en_obra: '#067647',
  ya_cerro: V.lupa,
  sin_fichar: V.warn,
}
const TINTA: Record<EstadoHoy, string> = {
  en_obra: V.tintaSuave,
  ya_cerro: V.apagado,
  sin_fichar: V.warn,
}

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

  return (
    <div data-testid="tabla-personas">
      <div className={`grid gap-[14px] ${cols}`} style={ENCABEZADO}>
        <RotuloCol>Persona</RotuloCol>
        <RotuloCol>{conBaja ? 'Última obra' : 'Obra asignada'}</RotuloCol>
        {conBaja
          ? <RotuloCol>Baja</RotuloCol>
          : (
              <>
                <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Hoy</RotuloCol></span>
                <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>HH del mes</RotuloCol></span>
              </>
            )}
      </div>

      {personas.map((p) => {
        const hoy = conPulso && pulso?.hoyDisponible ? estadoHoy(pulso.marcas.get(p.id)) : null
        const oficio = oficioVisible(p.especialidad, p.puesto)
        return (
          <Link
            key={p.id}
            href={`/administracion/personas/${p.id}`}
            prefetch={false}
            role="row"
            data-testid="fila-persona"
            className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${cols} hover:bg-[#F2F1ED]`}
            style={{
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
              {/* EL OFICIO, no la categoría UOCRA: lo que sabe hacer, no lo que cobra. La regla y su
                  prueba viven en `services/vocabularioPersona.ts` — un `??` pelado no MIRABA el
                  valor y dejaba pasar códigos importados como si fueran oficios. */}
              <span style={{ fontSize: '11.5px', color: V.tenue, flexShrink: 0 }}>
                {oficio ?? 'sin oficio'}
              </span>
            </span>

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
                    <span className={`flex items-center gap-[7px] ${SOLO_ANCHO}`} style={{ minWidth: 0 }} data-testid="hoy-persona">
                      {hoy
                        ? (
                            <>
                              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: PUNTO[hoy], flexShrink: 0 }} />
                              <span className="truncate" style={{ fontSize: '12px', color: TINTA[hoy] }}>{HOY_LABEL[hoy]}</span>
                            </>
                          )
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
                  </>
                )}
          </Link>
        )
      })}

      {personas.length === 0 && (
        <div style={{ padding: '24px 2px', fontSize: '12.5px', color: V.apagado }} data-testid="personas-vacio">
          {vacio}
        </div>
      )}
    </div>
  )
}

/** dd/mm/aa. Una fecha sin cargar se dice con palabras; un guión se lee como «no aplica». */
function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a.slice(2)}`
}
