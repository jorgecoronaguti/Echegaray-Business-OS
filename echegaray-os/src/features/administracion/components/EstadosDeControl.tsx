// LOS FILTROS Y LA BANDA DE ATENCIÓN — pantalla 24, §filtros y §alertas.
//
// No es un tablero decorativo: cada cifra se toca y la lista de abajo queda con esas filas. Es la
// regla 10 del CLAUDE.md raíz —*nunca crear un dashboard sin decisiones asociadas*— resuelta de la
// forma más barata que hay: el número ES el acceso al trabajo que representa.
//
// ═══ ERAN UNA SOLA FILA DE KPIs; EL CANÓNICO 24 LAS SEPARA EN DOS (Design 24/08/2026) ═══
//
// Antes los seis estados vivían en una banda única de cifras grandes entre dos líneas: «capturadas»
// y «estructura» —que NUNCA son trabajo pendiente— se dibujaban con el mismo peso visual que
// «duplicados». El resultado es el que enseña a ignorar el color: seis números gigantes de los
// cuales cuatro dicen que todo va bien.
//
// El mockup 24 lo parte en dos capas con jerarquías distintas:
//
//   1 · LOS FILTROS, arriba, como pastillas junto al buscador. Son NAVEGACIÓN: el conjunto entero
//       de vistas de la pantalla, siempre las seis, con su contador en mono al lado. Se dibujan con
//       `Filtros` del design system —la misma pastilla grafito de Presupuestos y Personal—, no con
//       una copia local: es lo que evita que la tercera pantalla invente su propio radio.
//
//   2 · LA BANDA DE ATENCIÓN, debajo, suave y SÓLO con lo que pide trabajo hoy. Superficie apenas
//       teñida, la cifra del color del problema y el texto en tinta normal. Sin pendientes no se
//       dibuja nada: normal silencioso.
//
// Que un pendiente aparezca dos veces —pastilla arriba, alerta abajo— es deliberado y no es
// redundancia: arriba responde «qué vistas hay», abajo responde «qué tengo que hacer». La segunda
// pregunta es la que trae a alguien a esta pantalla.

import Link from 'next/link'
import { Filtros, Num } from '@/shared/components/ds'
import { ROTULO_FILTRO, type FiltroCompras } from '../services/comprasEstado'
import type { Conteos } from '../services/comprasService'

const ORDEN: FiltroCompras[] = [
  'capturadas', 'por-revisar', 'sin-imputar', 'sin-resolver', 'estructura', 'duplicados',
]

/** Los que son trabajo pendiente: sólo ésos entran en la banda de atención, y sólo con algo. */
const PENDIENTE: { clave: FiltroCompras; tono: 'warn' | 'neg'; texto: (n: number) => string }[] = [
  {
    clave: 'sin-imputar',
    tono: 'neg',
    texto: (n) => `${n === 1 ? 'comprobante' : 'comprobantes'} sin imputar a obra`,
  },
  {
    clave: 'por-revisar',
    tono: 'warn',
    texto: (n) => `${n === 1 ? 'comprobante' : 'comprobantes'} por revisar`,
  },
  {
    // `sin_resolver` es peor que `sin_imputar`: el papel DICE una obra, así que nadie lo busca, y el
    // gasto igual no llega a ninguna. Por eso va en rojo aunque parezca imputado.
    clave: 'sin-resolver',
    tono: 'neg',
    texto: (n) => `${n === 1 ? 'rótulo que el diccionario no conoce' : 'rótulos que el diccionario no conoce'}`,
  },
  {
    clave: 'duplicados',
    tono: 'neg',
    texto: (n) => `${n === 1 ? 'comprobante parecido a otro' : 'comprobantes parecidos a otro'}`,
  },
]

// El color vive en la cifra y en el borde, no en el rótulo entero: cuatro bandas ámbar seguidas se
// leen como una alarma general y no se llega a leer CUÁL. Mismo criterio que `BarraAtencion` del
// home de Administración — y los mismos tokens, para que no se separen el día que se corrija uno.
const TONO: Record<'warn' | 'neg', { caja: string; cifra: string }> = {
  warn: { caja: 'border-warn/25 bg-warn-soft hover:border-warn/50', cifra: 'text-warn' },
  neg: { caja: 'border-neg/25 bg-neg-soft hover:border-neg/50', cifra: 'text-neg' },
}

/** Las seis vistas de la pantalla, como pastillas. Siempre las seis: es el índice, no la alarma. */
export function FiltrosCompras({
  conteos,
  activo,
  hrefDe,
}: {
  conteos: Conteos
  activo: FiltroCompras
  hrefDe: (f: FiltroCompras) => string
}) {
  return (
    <Filtros
      testid="estados-de-control"
      opciones={ORDEN.map((f) => ({
        href: hrefDe(f),
        activo: f === activo,
        testid: `kpi-${f}`,
        label: (
          <>
            {ROTULO_FILTRO[f]}
            {/* EL CONTADOR EN MONO, y apagado cuando la pastilla está encendida: sobre el grafito el
                gris del sistema no llega al contraste, y el número no es lo que se lee ahí. */}
            <span className={`font-mono text-[10.5px] tabular-nums ${f === activo ? 'text-white/65' : 'text-faint'}`}>
              {conteos[f].toLocaleString('es-AR')}
            </span>
          </>
        ),
      }))}
    />
  )
}

/** Lo que pide trabajo HOY. Sin pendientes no dibuja nada. */
export function AtencionCompras({
  conteos,
  hrefDe,
}: {
  conteos: Conteos
  hrefDe: (f: FiltroCompras) => string
}) {
  const chips = PENDIENTE.filter((p) => conteos[p.clave] > 0)
  if (chips.length === 0) return null
  return (
    <div data-testid="compras-atencion" className="mb-5 flex flex-wrap items-center gap-2">
      {chips.map((p) => (
        // `prefetch={false}`: son rutas dinámicas y cada prefetch es un render RSC completo de la
        // pantalla entera — el mismo motivo por el que lo apagaron los tabs.
        <Link
          key={p.clave}
          href={hrefDe(p.clave)}
          prefetch={false}
          data-testid={`atencion-${p.clave}`}
          className={`inline-flex items-baseline gap-2 rounded-md border px-3 py-1.5 transition-colors ${TONO[p.tono].caja}`}
        >
          <Num className={`text-[13px] font-semibold ${TONO[p.tono].cifra}`}>
            {conteos[p.clave].toLocaleString('es-AR')}
          </Num>
          <span className="text-[12px] text-ink-soft">{p.texto(conteos[p.clave])}</span>
        </Link>
      ))}
    </div>
  )
}
