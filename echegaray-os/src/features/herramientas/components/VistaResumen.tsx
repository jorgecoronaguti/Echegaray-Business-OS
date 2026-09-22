// D01 · RESUMEN — lo que necesita una decisión hoy.
//
// Desvíos del diseño, todos por decisión del dueño o porque el dato no existe:
//   · Sin «Nuevo control» (Controles no es de esta etapa).
//   · «Sin verificar hoy» cuenta rodados y equipos vivos sin verificación de uso con fecha de hoy
//     (migración 20260922T1200). Sin esa migración dice «sin la migración», no un cero.
//   · «Papeles de rodados» dice «sin cargar»: los 6 rodados no tienen papeles en la base.
//   · «Depósito» no existe: Taller y almacén son un solo lugar, «Taller».
//   · «Necesita una decisión» suma lo que D09 listaba «a resolver» (la migración no tiene pantalla).

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cifras, decisiones, dondeEstaElParque, type Decision } from '../logica/resumen'
import { diasDesde, ETIQUETA_TIPO, type Parque } from '../logica/parque'
import { sinVerificarHoy } from '../logica/verificacion'
import { BotonMover } from './Botones'
import { COLOR_BARRA, IconoLugar, IcoAviso, IcoLista, IcoObra, IcoReloj, IcoTaller } from './iconos'
import { bajadaPagina, eyebrow, pagina, tituloBloque, tituloPagina, V } from './estilo'

const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`

export function VistaResumen({ parque, hoy = new Date() }: { parque: Parque; hoy?: Date }) {
  const c = cifras(parque, hoy)
  const ds = decisiones(parque, hoy)
  const filas = dondeEstaElParque(parque)
  const sv = sinVerificarHoy(parque, hoy)
  const max = Math.max(1, ...filas.filter((f) => f.tipo !== 'sin_ubicacion').map((f) => f.activos))
  const partes = [
    c.herramientas ? plural(c.herramientas, 'herramienta', 'herramientas') : null,
    c.equipos ? plural(c.equipos, 'equipo', 'equipos') : null,
    c.rodados ? plural(c.rodados, 'rodado', 'rodados') : null,
  ].filter(Boolean)

  return (
    <div style={pagina} data-testid="resumen-herramientas">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h1 style={tituloPagina}>Herramientas</h1>
          <div style={bajadaPagina}>{partes.length ? partes.join(' · ') : 'Todavía no hay activos cargados.'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BotonMover ids={[]} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 30, paddingBottom: 22, borderBottom: `1px solid ${V.linea}` }}>
        <Cifra rotulo="Requieren mantenimiento" valor={c.requierenMant} tono={c.requierenMant ? V.warn : V.tinta}
          pie={c.requierenMant ? `${c.requierenMantEnObra} ${c.requierenMantEnObra === 1 ? 'sigue' : 'siguen'} en obra` : 'nada reportado'} />
        <Cifra rotulo="En reparación externa" valor={c.reparacionExterna}
          pie={c.externaMas30 ? <span style={{ color: V.neg }}>{c.externaMas30} sin novedad hace más de 30 días</span> : 'ninguna vieja de 30 días'} />
        <Cifra rotulo="Sin ver hace +90 días" valor={c.sinVer90}
          pie={c.nuncaVistos ? `más ${c.nuncaVistos} sin ningún registro nunca` : 'ningún movimiento ni reporte'} />
        <Link href="/herramientas/rodados" prefetch={false} data-testid="cifra-sin-verificar" className="hover:bg-surface-quiet">
          <Cifra rotulo="Sin verificar hoy" valor={sv ? sv.sin : null} vacioTexto="sin la migración" tono={sv && sv.sin ? V.warn : V.tinta}
            pie={sv ? (sv.de ? `de ${sv.de} que se operan con gente` : 'no hay rodados ni equipos cargados') : 'falta aplicar la migración 20260922T1200'} />
        </Link>
        <Cifra rotulo="Papeles de rodados" valor={null}
          pie={c.rodados ? `${plural(c.rodados, 'rodado', 'rodados')}, ningún papel cargado` : 'no hay rodados cargados'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={tituloBloque}>Necesita una decisión</h2>
          {ds.length === 0 ? (
            <div style={{ fontSize: '13.5px', color: V.apagado, padding: '14px 0' }} data-testid="nada-pendiente">Nada pendiente.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="decisiones">
              <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px 110px', gap: 18, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
                <div>Qué pasa</div><div>Dónde</div><div style={{ textAlign: 'right' }}>Desde</div>
              </div>
              {ds.map((d, i) => <FilaDecision key={d.clave} d={d} ultima={i === ds.length - 1} hoy={hoy} />)}
            </div>
          )}
          <div style={{ fontSize: '12.5px', color: V.apagado }}>La lista es finita y se vacía. Cada fila lleva a los activos que la componen.</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={tituloBloque}>Dónde está el parque</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="donde-esta">
            <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 80px 200px', gap: 16, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
              <div>Ubicación</div><div style={{ textAlign: 'right' }}>Activos</div><div />
            </div>
            {filas.length === 0 && <div style={{ fontSize: '13px', color: V.tenue, padding: '12px 0' }}>Todavía no hay activos cargados.</div>}
            {filas.map((f, i) => (
              <Link
                key={f.tipo} prefetch={false}
                href={f.tipo === 'sin_ubicacion' ? '/herramientas/inventario?clase=todo&ubicacion=sin' : `/herramientas/ubicaciones?tipo=${f.tipo}`}
                className="hover:bg-surface-quiet"
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 80px 200px', gap: 16, minHeight: 42, alignItems: 'center', borderBottom: i < filas.length - 1 ? `1px solid ${V.linea}` : undefined, fontSize: '13.5px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <IconoLugar tipo={f.tipo} />
                  {f.tipo === 'sin_ubicacion' ? <span style={{ color: V.warn }}>Sin ubicación cargada</span> : ETIQUETA_TIPO[f.tipo]}
                  {(f.tipo === 'obra' || f.tipo === 'rodado' || f.tipo === 'servicio_tecnico' || f.tipo === 'tercero') && (
                    <span style={{ color: V.tenue, fontSize: '12px' }}>({f.lugares})</span>
                  )}
                </div>
                <div style={{ textAlign: 'right', fontWeight: 500, color: f.tipo === 'sin_ubicacion' ? V.warn : V.tinta }}>{f.activos}</div>
                {f.tipo === 'sin_ubicacion' ? (
                  <div style={{ fontSize: '12px', color: V.tenue }}>vinieron así del listado</div>
                ) : (
                  <div style={{ height: 6, background: V.linea, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(2, Math.round((f.activos / max) * 100))}%`, height: '100%', background: COLOR_BARRA[f.tipo] }} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Cifra({ rotulo, valor, tono = V.tinta, pie, vacioTexto = 'sin cargar' }: { rotulo: string; valor: number | null; tono?: string; pie: ReactNode; vacioTexto?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={eyebrow}>{rotulo}</div>
      {valor == null ? (
        <div style={{ fontSize: '19px', fontWeight: 500, fontStyle: 'italic', color: V.tenue, lineHeight: '35px' }}>{vacioTexto}</div>
      ) : (
        <div style={{ fontSize: '27px', fontWeight: 600, letterSpacing: '-.02em', color: tono }}>{valor}</div>
      )}
      <div style={{ fontSize: '12px', color: V.apagado }}>{pie}</div>
    </div>
  )
}

const ICONO: Record<Decision['clave'], (c: string) => ReactNode> = {
  externa_sin_novedad: (c) => <IcoReloj tam={15} color={c} />,
  problema_en_obra: (c) => <IcoTaller tam={15} color={c} />,
  alta_desde_obra: (c) => <IcoObra tam={15} color={c} />,
  sin_ubicacion: (c) => <IcoAviso tam={15} color={c} />,
  estado_asumido: (c) => <IcoLista tam={15} color={c} />,
  repetidos: (c) => <IcoLista tam={15} color={c} />,
}
const TONO: Record<Decision['tono'], string> = { neg: V.neg, warn: V.warn, info: '#175CD3' }

function FilaDecision({ d, ultima, hoy }: { d: Decision; ultima: boolean; hoy: Date }) {
  const dias = d.desde ? diasDesde(d.desde, hoy) : null
  return (
    <Link
      href={d.href} prefetch={false} data-testid={`decision-${d.clave}`} className="hover:bg-surface-quiet"
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px 110px', gap: 18, minHeight: 52, alignItems: 'center', borderBottom: ultima ? undefined : `1px solid ${V.linea}`, fontSize: '13.5px', padding: '6px 0' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ marginTop: 2 }}>{ICONO[d.clave](TONO[d.tono])}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontWeight: 500 }}>{d.titulo}</div>
          <div style={{ fontSize: '12px', color: V.apagado }}>{d.detalle}</div>
        </div>
      </div>
      <div style={{ color: V.tintaSuave }}>{d.donde}</div>
      <div style={{ textAlign: 'right', fontWeight: 500, color: dias == null ? V.tenue : d.tono === 'neg' ? V.neg : d.tono === 'warn' ? V.warn : V.tintaSuave }}>
        {dias == null ? '—' : dias <= 0 ? 'hoy' : `${d.clave === 'problema_en_obra' ? 'hasta ' : ''}${dias} ${dias === 1 ? 'día' : 'días'}`}
      </div>
    </Link>
  )
}
