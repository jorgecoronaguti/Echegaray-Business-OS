import { C, R, pct } from '@/shared/components/movil/tokens'
import { Icono, type NombreIcono } from '@/shared/components/movil/Iconos'
import { Azulejo, RotuloSeccion, TarjetaLista, Vacio, mono } from '@/shared/components/movil/Piezas'
import type { CausaDeAtraso, Esperado, FinProyectado, GrupoDeAvance, HHDeLaObra } from '../services/progreso'

// J03 · CÓMO VIENE LA OBRA — porte literal de `J03 · Jefe Avance.dc.html`.
//
// ═══ EL JEFE NO VE UN PESO ACÁ, Y NO ES POR PRUDENCIA ═══
//
// Esta pantalla compara AVANCE FÍSICO contra PLAN y HORAS contra HORAS. Nada de eso necesita el
// contratado ni el costo: la pregunta que contesta es «¿llego?», no «¿gano?». La cerradura sigue
// siendo `ve_economia()` en la base; lo de acá es que la pregunta económica no vive en este perfil.
//
// ═══ LO QUE NO SE PUDO PORTAR, Y POR QUÉ ═══
//
//   1. LA CURVA S (real contra plan). El mockup dibuja dos series de seis puntos. La serie PLAN se
//      podría calcular; la serie REAL no existe: `obra_panel.avance_pct` es una foto de HOY y nadie
//      guarda el histórico del avance de la obra. Dibujar la curva plan sola sería un gráfico con
//      una sola línea rotulado «real vs plan», y dibujar la real interpolando entre 0 y hoy sería
//      inventar la única forma que el gráfico existe para mostrar. Se omite el bloque entero.
//   2. «HH PERDIDAS POR CAUSA» (la columna de la derecha de «Por qué se atrasó»). `obra_restriccion`
//      guarda qué frena y desde cuándo; nadie imputa las horas detenidas contra el impedimento. En
//      su lugar va la magnitud que SÍ es un hecho: cuántas tareas frena cada causa y desde hace
//      cuántos días. El porqué completo está en `progreso.ts`.
//
// La marca vertical de cada rubro —«lo que debería estar hecho hoy»— sí se porta: es el `wPlan` del
// mockup y sale de `avanceEsperado`, que es un cálculo declarado, no un dato inventado.

export function ComoVieneLaObra({
  real, esperado, hh, fin, frentes, causas,
}: {
  /** El avance de la obra tal como lo publica `obra_panel`. */
  real: number | null
  esperado: Esperado
  hh: HHDeLaObra
  fin: FinProyectado
  frentes: GrupoDeAvance[]
  causas: CausaDeAtraso[]
}) {
  const delta = real != null && esperado.pct != null ? Math.round((real - esperado.pct) * 10) / 10 : null

  return (
    <div style={{ padding: '16px 16px 24px' }}>
      {/* ── EL AVANCE FÍSICO, CON SU BARRA DE 9px Y LA MARCA DEL ESPERADO ──────────────── */}
      <div
        data-testid="avance-fisico"
        style={{ background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta, padding: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: C.muted }}>Avance físico</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ ...mono, fontSize: 26, fontWeight: 600, color: C.ink }}>
              {real == null ? '—' : pct(real)}
            </span>
            {delta != null && delta < 0 && (
              <span data-testid="delta-obra" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: C.neg }}>
                <Icono nombre="baja" tamano={12} grosor={2.6} />
                {Math.abs(delta)} pts
              </span>
            )}
            {delta != null && delta >= 0 && (
              <span data-testid="delta-obra" style={{ fontSize: 12, color: C.pos }}>en fecha</span>
            )}
          </div>
        </div>
        <div style={{ position: 'relative', height: 9, background: C.pista, borderRadius: 5, marginTop: 10, overflow: 'hidden' }}>
          {real != null && (
            <div style={{ height: '100%', width: `${clamp(real)}%`, background: C.info }} />
          )}
        </div>
        {/* La marca del esperado va FUERA del recorte del borde redondeado: adentro se comía el
            último píxel cuando el plan está al 100 %. */}
        {esperado.pct != null && (
          <div style={{ position: 'relative', height: 0 }}>
            <div style={{ position: 'absolute', left: `${clamp(esperado.pct)}%`, top: -11, width: 1.5, height: 13, background: C.muted }} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: C.muted }}>real</span>
          {/* SIN PLAN NO HAY ESPERADO, y no se dibuja un 0 %: nadie dijo cuándo iba cada tarea. */}
          <span style={{ fontSize: 12, color: C.muted }}>
            {esperado.pct == null
              ? 'sin plan cargado'
              : `esperado ${pct(esperado.pct)} · ${esperado.conPlan} de ${esperado.total} con plan`}
          </span>
        </div>
      </div>

      {/* ── LOS TRES AZULEJOS: HH, DESVÍO Y FIN PROYECTADO ────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }} data-testid="jefe-avance-metricas">
        <Azulejo
          icono="reloj"
          rotulo="HH"
          tamanoValor={18}
          valor={hh.real == null ? '—' : numero(hh.real)}
          detalle={hh.plan == null ? 'sin plan de horas' : `de ${numero(hh.plan)}`}
          colorIcono={C.faint}
        />
        <Azulejo
          icono="avance"
          rotulo="DESVÍO HH"
          tamanoValor={18}
          valor={hh.desvioCerrado == null ? '—' : `${hh.desvioCerrado > 0 ? '+' : ''}${numero(hh.desvioCerrado)}`}
          colorValor={hh.desvioCerrado != null && hh.desvioCerrado > 0 ? C.warn : C.ink}
          detalle={hh.terminadas === 0 ? 'sin tareas cerradas' : `sobre ${hh.terminadas} cerradas`}
          colorIcono={C.faint}
        />
        <Azulejo
          icono="fecha"
          rotulo="FIN PROY."
          tamanoValor={18}
          valor={fin.fecha == null ? '—' : `${fin.fecha.slice(8, 10)}/${fin.fecha.slice(5, 7)}`}
          colorValor={fin.dias != null && fin.dias > 0 ? C.neg : C.ink}
          detalle={fin.dias == null ? 'sin fin de plan' : fin.dias > 0 ? `+${fin.dias} d` : 'en fecha'}
          colorIcono={C.faint}
        />
      </div>

      {/* ── POR RUBRO, CON LA MARCA DE LO QUE DEBERÍA ESTAR HECHO HOY ─────────────────── */}
      <RotuloSeccion icono="avance">Por rubro</RotuloSeccion>
      <div style={{ marginTop: 9 }}>
        <TarjetaLista testid="avance-por-frente">
          {frentes.length === 0 ? (
            <Vacio testid="sin-rubros">
              Esta obra todavía no tiene tareas agrupadas. Se arman desde la planificación.
            </Vacio>
          ) : (
            <>
              {frentes.map((f) => (
                <div key={f.clave} data-testid="rubro" style={{ padding: '12px 14px', borderBottom: `1px solid ${C.divisor}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 13.5, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.nombre}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
                      <span style={{ ...mono, fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                        {f.pct == null ? '—' : pct(f.pct)}
                      </span>
                      <span style={{ ...mono, fontSize: 11.5, color: colorDelta(f.delta) }}>{textoDelta(f.delta)}</span>
                    </div>
                  </div>
                  <div style={{ position: 'relative', height: 6, background: C.pista, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                    {f.pct != null && (
                      <div style={{ height: '100%', width: `${clamp(f.pct)}%`, background: f.pct > 0 ? C.info : C.lineaFuerte }} />
                    )}
                  </div>
                  {f.esperado != null && (
                    <div style={{ position: 'relative', height: 0 }}>
                      <div style={{ position: 'absolute', left: `${clamp(f.esperado)}%`, top: -9, width: 1.5, height: 12, background: C.muted }} />
                    </div>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: C.quiet }}>
                <span style={{ width: 1.5, height: 11, background: C.muted, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: C.muted }}>la marca es lo que debería estar hecho hoy</span>
              </div>
            </>
          )}
        </TarjetaLista>
      </div>

      {/* ── POR QUÉ SE ATRASÓ ─────────────────────────────────────────────────────────── */}
      <RotuloSeccion icono="alerta">Por qué se atrasó</RotuloSeccion>
      <div style={{ marginTop: 9 }}>
        <TarjetaLista testid="causas-de-atraso">
          {causas.length === 0 ? (
            <Vacio testid="sin-causas">
              No hay impedimentos abiertos en esta obra. Los carga quien encuentra el problema, desde
              la tarea que frena.
            </Vacio>
          ) : causas.map((c) => (
            <div
              key={c.clave}
              data-testid="causa"
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
                borderBottom: `1px solid ${C.divisor}`, minHeight: 52,
              }}
            >
              <span style={{ display: 'flex', color: C.neg, flexShrink: 0 }}>
                <Icono nombre={iconoDeCausa(c.tipo)} tamano={19} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.tipo}
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>
                  {c.n} {c.n === 1 ? 'episodio' : 'episodios'} · frena {c.tareas} {c.tareas === 1 ? 'tarea' : 'tareas'}
                </div>
              </div>
              <span style={{ ...mono, fontSize: 13, fontWeight: 600, color: C.neg, flexShrink: 0 }}>
                {c.diasElMasViejo == null ? '—' : `${c.diasElMasViejo} d`}
              </span>
            </div>
          ))}
        </TarjetaLista>
      </div>
      {causas.length > 0 && (
        <p style={{ marginTop: 8, fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
          El número de la derecha son los días abiertos del más viejo, no HH detenidas: nadie imputa
          horas contra un impedimento.
        </p>
      )}
    </div>
  )
}

const clamp = (v: number) => Math.max(0, Math.min(100, v))

/** `612.5` → `612,5`. Las HH son un dato y van en el separador del país. */
const numero = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n)

const colorDelta = (d: number | null) => (d == null ? C.faint : d < -5 ? C.neg : d < 0 ? C.warn : C.pos)

const textoDelta = (d: number | null) => (d == null ? 'sin plan' : d >= 0 ? 'en fecha' : `−${Math.abs(d)}`)

/**
 * El icono de la causa, por el `tipo` que escribió quien cargó el impedimento. Lo que no reconoce
 * cae en el triángulo genérico: inventarle un camión a un tipo desconocido diría algo que no se sabe.
 */
function iconoDeCausa(tipo: string): NombreIcono {
  const t = tipo.toLowerCase()
  if (t.includes('material')) return 'material'
  if (t.includes('equipo') || t.includes('herramienta')) return 'equipo'
  if (t.includes('gente') || t.includes('cuadrilla') || t.includes('personal')) return 'cuadrilla'
  if (t.includes('clima')) return 'clima'
  if (t.includes('plano') || t.includes('medida') || t.includes('proyecto')) return 'plano'
  if (t.includes('segur')) return 'seguridad'
  return 'alerta'
}
