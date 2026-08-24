// PANTALLA 19 · LA LISTA DE PERSONAL — porte literal de `19 · Personal Cartera.dc.html`.
//
// ═══ LO QUE SE MIDIÓ DEL CANÓNICO ═══
//
//   grilla   `minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.3fr) 148px 82px 76px 26px` · `gap:10px`
//   fila     48px · `borderBottom:1px solid #F1F0EC` · `padding:0 14px` · hover `#FAFAF8`
//   avatar   26×26 radio 13, teñido por el estado del día (verde en obra, neutro el resto)
//   nombre   12,5px peso 500 · rol 12px `#3A3A38` · cuadrilla 11px `#91918B`
//   HOY      icono 14px + palabra, los dos del color del estado
//   HH MES   mono 12px a la derecha · PAPELES centrado · `···` 26px
//
// La caja, el encabezado de 38px y el pie viven en `shared/components/canon/ListaCanon`, que es el
// mismo dibujo en los canónicos 00, 17, 19 y 22/25.
//
// ═══ LO QUE ESTABA ANTES, Y POR QUÉ CAMBIA ═══
//
// Era una `ds/Tabla` de hasta diez columnas: PERSONA · CATEGORÍA UOCRA · CUADRILLA · OBRA ACTUAL ·
// HOY · HH MES · PAPELES · ALTA · [BAJA] · ESTADO. El canónico dibuja SIETE y junta dos pares. El
// argumento que defendía las diez —«son cinco hechos distintos y ninguno se deduce de otro: oficio,
// categoría UOCRA, rol en obra, cuadrilla y obra»— sigue siendo cierto y NO se descarta: los cinco
// siguen en pantalla. Lo que cambia es que se agrupan de a dos por columna, exactamente como el
// canónico ya hace con OBRA / CUADRILLA, en vez de gastar una columna cada uno.
//
//   OFICIO / CATEGORÍA   el oficio arriba (lo que sabe hacer), la categoría UOCRA abajo (lo que
//                        cobra). El canónico titula esta columna «ROL» y muestra una sola línea; el
//                        rótulo se cambia porque en este modelo «rol» es otra cosa —qué hace en ESTA
//                        obra— y usar la palabra para el oficio es el error que esta misma tabla ya
//                        corrigió una vez. DESVÍO DECLARADO respecto del canónico.
//   OBRA / CUADRILLA     la obra arriba, y abajo la cuadrilla con el rol en obra cuando existe
//                        («Cuadrilla 1 · capataz»).
//
// ALTA, BAJA y ESTADO se van de la lista: el canónico no las dibuja. ALTA se mira una vez por
// persona en la vida y vive en la ficha. En el filtro «Inactivos» la geometría cambia —no hay HOY ni
// HH que preguntarle a quien ya no está— y ahí BAJA vuelve, porque es el dato por el que se abre esa
// lista. `en_la_empresa` no necesita columna: es el filtro con el que se llegó.
//
// Y lo que la tabla no muestra TAMPOCO SE LE PIDE A LA BASE: `personasService` sigue nombrando sus
// columnas una por una, así que ni DNI, ni CUIL, ni retribución viajan al navegador.

import Link from 'next/link'
import { CabezaCanon, FilaCanon, ListaCanon, PieCanon, RotuloCanon, VacioCanon, type MetricaCanon } from '@/shared/components/canon/ListaCanon'
import { Avatar, type TonoAvatar } from '@/shared/components/Avatar'
import { oracion } from '@/shared/utils/texto'
import { esCategoriaDeConvenio, etiquetaCategoria, type PersonaEnDirectorio } from '../types'
import { oficioVisible } from '../services/vocabularioPersona'
import { AccionesPersona } from './AccionesPersona'
import {
  HOY_LABEL, estadoHoy, horasVisibles, lecturaDePapeles,
  type EstadoDePapeles, type EstadoHoy, type MarcaDeHoy,
} from '../services/pulsoDelPlantel'

/** Las tres lecturas del día, ya agrupadas por persona. Cada `disponible` en false apaga SU columna:
 *  una lectura que falló no se dibuja como «no hay nada». */
export interface PulsoDelPlantel {
  marcas: Map<string, MarcaDeHoy>
  hh: Map<string, number>
  papeles: Map<string, EstadoDePapeles>
  hoyDisponible: boolean
  hhDisponible: boolean
  /** En false la columna PAPELES no se dibuja: sin fuente de vencimientos sería una columna vacía
   *  prometiendo un control que nadie está haciendo. */
  papelesDisponible: boolean
}

// ── LOS ANCHOS, TAL COMO LOS FIJA EL CANÓNICO ───────────────────────────────────────────────────
//
// Las tres primeras columnas son fraccionales y las demás fijas: el nombre y la obra son lo que
// crece con la pantalla; «HOY», «HH MES» y «PAPELES» miden siempre lo mismo, y si respiraran, la
// columna de números dejaría de estar alineada entre una pantalla y otra.
const BASE = 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.3fr)'

function columnas({ pulso, conPapeles, conBaja }: { pulso: boolean; conPapeles: boolean; conBaja: boolean }): string {
  if (conBaja) return `${BASE} 96px 110px 26px`
  return [BASE, pulso ? '148px 82px' : null, conPapeles ? '76px' : null, '26px'].filter(Boolean).join(' ')
}

/** dd/mm/aa en mono. Una fecha sin cargar se dice; un guión se lee como cero o como «no aplica». */
function Fecha({ iso, falta }: { iso: string | null; falta: string }) {
  if (!iso) return <span className="text-[11.5px] text-faint">{falta}</span>
  const [a, m, d] = iso.slice(0, 10).split('-')
  return <span className="font-mono text-[11.5px] tabular-nums text-muted">{`${d}/${m}/${a.slice(2)}`}</span>
}

// EL ICONO Y EL COLOR DE «HOY», medidos del canónico (`P.ok`, `P.reloj`, `P.libre`).
//
// «ausente» NO existe acá y no es un olvido del porte: el mockup la dibuja y el modelo no la tiene.
// Que no haya marca incluye al que no tiene teléfono, al que no le dio permiso al GPS y al que
// faltó — el mismo silencio visto desde acá. Convertirlo en una falta fabricaría una novedad de
// liquidación. Quién faltó lo declara el jefe de obra, que es quien lo ve.
const HOY: Record<EstadoHoy, { d: string; color: string; avatar: TonoAvatar }> = {
  en_obra: { d: 'M5 13l4 4L19 7', color: 'text-pos', avatar: 'pos' },
  ya_cerro: { d: 'M12 8v4.5l3 2', color: 'text-muted', avatar: 'neutro' },
  sin_fichar: { d: 'M5 12h14', color: 'text-muted', avatar: 'neutro' },
}

function IconoHoy({ estado }: { estado: EstadoHoy }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {estado === 'ya_cerro' && <circle cx="12" cy="12" r="8.5" />}
      <path d={HOY[estado].d} />
    </svg>
  )
}

const TINTA_PAPELES: Record<'neg' | 'warn' | 'pos' | 'nulo', string> = {
  neg: 'text-neg', warn: 'text-warn', pos: 'text-pos', nulo: 'text-faint',
}

export function TablaPersonas({
  personas, conBaja = false, pulso, metricas, vacio = 'Nada coincide.',
}: {
  personas: PersonaEnDirectorio[]
  /** El listado de Inactivos cambia la geometría: sin HOY ni HH, y con BAJA. */
  conBaja?: boolean
  /** Sin pulso la lista es la de siempre: el día de hoy no se le pregunta a quien ya no está. */
  pulso?: PulsoDelPlantel
  /** El pie del canónico. Lo calcula el servidor (`resumenPersonal.metricasCanonicas`). */
  metricas?: MetricaCanon[]
  /** Qué decir cuando ningún filtro deja nada. Lo decide la página: depende del corte activo. */
  vacio?: string
}) {
  const conPapeles = (pulso?.papelesDisponible ?? false) && !conBaja
  const conPulso = Boolean(pulso) && !conBaja
  const cols = columnas({ pulso: conPulso, conPapeles, conBaja })

  return (
    <ListaCanon testid="tabla-personas">
      <CabezaCanon cols={cols}>
        <RotuloCanon>PERSONA</RotuloCanon>
        {/* El canónico dice «ROL»; acá dice qué es cada renglón, porque son dos hechos distintos. */}
        <RotuloCanon>OFICIO / CATEGORÍA</RotuloCanon>
        <RotuloCanon>OBRA / CUADRILLA</RotuloCanon>
        {conPulso && <RotuloCanon>HOY</RotuloCanon>}
        {conPulso && <RotuloCanon alinear="right">HH MES</RotuloCanon>}
        {conPapeles && <RotuloCanon alinear="center">PAPELES</RotuloCanon>}
        {conBaja && <RotuloCanon>ALTA</RotuloCanon>}
        {conBaja && <RotuloCanon>BAJA</RotuloCanon>}
        <RotuloCanon />
      </CabezaCanon>

      {personas.length === 0 && <VacioCanon testid="personas-vacio">{vacio}</VacioCanon>}

      {personas.map((p) => {
        const hoy = pulso && pulso.hoyDisponible ? estadoHoy(pulso.marcas.get(p.id)) : null
        const oficio = oficioVisible(p.especialidad, p.puesto)
        const papeles = lecturaDePapeles(pulso?.papeles.get(p.id))
        return (
          <FilaCanon key={p.id} cols={cols} alto={48} testid="fila-persona">
            {/* La fila entera lleva a la ficha: en un listado de trabajo, apuntar a un lápiz de
                16px con el dedo es la diferencia entre usarlo y no usarlo. */}
            <Link
              href={`/administracion/personas/${p.id}`}
              prefetch={false}
              data-testid="abrir-persona"
              className="flex min-w-0 items-center gap-[9px]"
            >
              {/* LAS INICIALES, NO UNA SILUETA. Y TEÑIDAS POR EL ESTADO DEL DÍA (canónico 19): es la
                  única señal de color de la fila que no cuesta una columna. Sin foto todavía:
                  `persona_directorio` no publica una URL de avatar y no se inventa una. */}
              <Avatar nombre={p.nombre_completo} url={null} lado={26} tono={hoy ? HOY[hoy].avatar : 'neutro'} />
              <span className="min-w-0 truncate text-[12.5px] font-medium text-ink hover:underline">
                {oracion(p.nombre_completo)}
              </span>
            </Link>

            <div className="min-w-0">
              {/* EL OFICIO ARRIBA, LA CATEGORÍA ABAJO, y cada uno donde se lo espera. El `??` pelado
                  no alcanzaba porque no MIRABA el valor: la regla y su prueba viven en
                  `services/vocabularioPersona.ts`. */}
              <div className="truncate text-[12px] text-ink-soft">
                {oficio ?? <span className="text-faint">sin oficio cargado</span>}
              </div>
              <div className="truncate text-[11px] text-faint">
                {etiquetaCategoria(p.categoria)}
                {/* Un código mal importado no se esconde ni se corrige solo: se marca. */}
                {p.categoria && !esCategoriaDeConvenio(p.categoria) && (
                  <span className="ml-1 text-warn">fuera de convenio</span>
                )}
              </div>
            </div>

            <div className="min-w-0">
              {/* SIN ASIGNAR NO ES UN HUECO: es una respuesta, y se escribe en ámbar como en el
                  canónico (`cobra: "#B54708"`). La obra va por su NOMBRE. */}
              <div className={`truncate text-[12px] ${p.obra_actual_id ? 'text-ink' : 'text-warn'}`}>
                {p.obra_actual_id ? (p.obra_actual ?? p.obra_actual_id) : 'sin asignar'}
              </div>
              <div className="truncate text-[11px] text-faint">
                {[p.cuadrilla ?? 'sin cuadrilla', p.rol_en_obra?.trim()].filter(Boolean).join(' · ')}
              </div>
            </div>

            {/* HOY — icono y palabra, y NUNCA la palabra «ausente». */}
            {conPulso && (
              <div className="flex min-w-0 items-center gap-[6px]" data-testid="hoy-persona">
                {hoy ? (
                  <>
                    <span className={`flex shrink-0 ${HOY[hoy].color}`}><IconoHoy estado={hoy} /></span>
                    <span className={`truncate text-[12px] ${HOY[hoy].color}`}>{HOY_LABEL[hoy]}</span>
                  </>
                ) : (
                  <span className="text-[12px] text-faint">sin lectura</span>
                )}
              </div>
            )}

            {/* HH MES — la persona sin imputaciones dice «sin HH», no 0: un 0 acá afirmaría que
                alguien no trabajó en todo el mes. */}
            {conPulso && (
              <div className="text-right">
                {!pulso?.hhDisponible ? (
                  <span className="text-[11.5px] text-faint">sin lectura</span>
                ) : pulso.hh.has(p.id) ? (
                  <span data-testid="hh-mes" className="font-mono text-[12px] tabular-nums text-ink">
                    {horasVisibles(pulso.hh.get(p.id) ?? 0)}
                  </span>
                ) : (
                  <span className="text-[11.5px] text-faint">sin HH</span>
                )}
              </div>
            )}

            {/* PAPELES — «sin legajo» y «al día» son dos respuestas opuestas que sin la cuenta de
                filas serían los mismos tres ceros. El canónico dibuja el ✓ verde y el ⚠ con su
                número; la palabra completa viaja en el `title`. */}
            {conPapeles && (
              <div
                className={`flex items-center justify-center gap-[3px] ${TINTA_PAPELES[papeles.tono]}`}
                title={papeles.texto}
                data-testid="papeles-persona"
              >
                {papeles.tono === 'pos' ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : papeles.tono === 'nulo' ? (
                  <span className="text-[11px]">sin legajo</span>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.01" />
                    </svg>
                    <span className="font-mono text-[11px] tabular-nums">{papeles.texto.split(' ')[0]}</span>
                  </>
                )}
              </div>
            )}

            {conBaja && <Fecha iso={p.fecha_ingreso} falta="sin cargar" />}
            {conBaja && (
              // SE FUE SIN FECHA NO ES LO MISMO QUE NO SE FUE. De los 45 legajos cerrados, 22 no
              // tienen baja documentada: «sin papel de baja» ES el dato.
              <Fecha iso={p.fecha_egreso} falta="sin papel de baja" />
            )}

            <AccionesPersona personaId={p.id} nombre={p.nombre_completo} enLaEmpresa={p.en_la_empresa} />
          </FilaCanon>
        )
      })}

      {metricas && metricas.length > 0 && <PieCanon metricas={metricas} testid="franja-personal" />}
    </ListaCanon>
  )
}
