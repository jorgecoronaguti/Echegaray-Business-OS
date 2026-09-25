// LO QUE SE LE ESTÁ PAGANDO POR HORA, ARRIBA DEL TODO. Dueño, 15/09/2026.
//
// ═══ POR QUÉ NO SON TRES TARJETAS ═══
//
// Regla del dueño: *«no tarjetas por cada dato»*, *«casi ninguna sombra»*. Tres números con su
// rótulo chico arriba, separados por aire, en la misma tipografía y el mismo ritmo que la tira de
// cifras que ya vive dos bloques más abajo (`CifrasDeFicha`): la jerarquía la dan el tamaño y el
// espacio, no un borde.
//
// ═══ Y POR QUÉ EL HISTORIAL YA NO ESTÁ ACÁ ═══
//
// Hasta el 16/09/2026 se desplegaba debajo en un `<details>`. El dueño: *«quiero que sea una SECCIÓN»*.
// Ahora vive en la solapa Retribución (`RetribucionDelLegajo.tsx`), con lo liquidado y lo pagado del
// año; esta tira es el RESUMEN y sólo enlaza. El enlace se dibuja únicamente cuando el que mira puede
// entrar: ofrecerle la solapa al jefe de obra sería mandarlo a una pantalla que le dice «sin permiso».
//
// LA REGLA NO ESTÁ ACÁ: este archivo pinta lo que `valorHoraDelLegajo.ts` ya armó. Ni una cuenta,
// ni un formato de moneda, ni una decisión sobre qué decir cuando falta un dato.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import type { DatoDelRotulo, RotuloValorHora } from '../services/valorHoraDelLegajo'

const COLOR_TONO = { normal: V.tinta, falta: V.tenue, warn: V.warn } as const

const testidDe = (rotulo: string): string =>
  rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * Un número de la tira: rótulo en versalitas, el valor a 19px mono, y el detalle chico debajo.
 * Se exporta porque la sección Retribución escribe sus cifras del año con el mismo dibujo.
 */
export function DatoDelValorHora({ d }: { d: DatoDelRotulo }) {
  const hay = d.valor !== null
  return (
    <div
      title={d.titulo ?? undefined}
      data-testid={`vh-${testidDe(d.rotulo)}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}
    >
      <span
        style={{
          fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em',
          color: V.tenue, whiteSpace: 'nowrap',
        }}
      >
        {d.rotulo}
      </span>
      <span
        className="font-mono tabular-nums"
        style={{
          // El valor ausente baja a 13px: un «sin permiso» a 19px compite con el número que sí está.
          fontSize: hay ? '19px' : '13px', fontWeight: 600,
          color: hay ? COLOR_TONO[d.tono] : COLOR_TONO[d.tono === 'normal' ? 'falta' : d.tono],
          letterSpacing: '-.01em', whiteSpace: 'nowrap',
        }}
      >
        {hay ? d.valor : (d.falta ?? 'sin dato')}
      </span>
      {d.detalle && (
        <span style={{ fontSize: '11px', color: V.apagado }}>{d.detalle}</span>
      )}
    </div>
  )
}

/**
 * LA TIRA DE $/H DEL LEGAJO.
 *
 * `error` es lo que NO se pudo leer. Va debajo y en su color: una lectura que falló no puede
 * dibujarse como un dato ausente, que diría que nadie lo cargó.
 */
export function ValorHoraDelLegajo({ rotulo, error, hrefRetribucion = null, testid = 'valor-hora-legajo' }: {
  rotulo: RotuloValorHora
  error?: string | null
  /** La solapa Retribución. `null` = el que mira no puede entrar, y no se le ofrece. */
  hrefRetribucion?: string | null
  testid?: string
}) {
  return (
    <div data-testid={testid} style={{ padding: '18px 20px 0' }}>
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 34,
          flexWrap: 'wrap', rowGap: 14,
        }}
      >
        <DatoDelValorHora d={rotulo.pactado} />
        <DatoDelValorHora d={rotulo.recibo} />
        <DatoDelValorHora d={rotulo.piso} />
      </div>

      {hrefRetribucion && (
        <Link
          href={hrefRetribucion}
          data-testid="vh-ver-retribucion"
          // 44 de área en el teléfono con padding; los márgenes negativos devuelven el lugar (el texto no se mueve).
          className="max-md:!-mb-[14px] max-md:!mt-[-4px] max-md:!py-[14px]"
          style={{ display: 'inline-block', marginTop: 10, fontSize: '11px', color: V.apagado, textDecoration: 'underline' }}
        >
          historial de $/h y pagos del año
        </Link>
      )}

      {error && (
        <p data-testid="vh-error" style={{ margin: '10px 0 0', fontSize: '11px', color: V.warn }}>
          No pude leer {error}
        </p>
      )}
    </div>
  )
}
