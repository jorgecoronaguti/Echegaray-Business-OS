// Fechas como las escribe el diseño: «21/09/2026 15:42», «30/08», «Hoy 15:42», «Ayer 17:20».
// Siempre en la hora de San Juan: el servidor corre en UTC y un movimiento de las 22 h no puede
// aparecer al día siguiente.

const ZONA = 'America/Argentina/San_Juan'

const partes = (iso: string) => {
  const f = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? ''
  return { d: v('day'), m: v('month'), a: v('year'), h: v('hour'), min: v('minute') }
}

export function fechaHora(iso: string): string {
  const p = partes(iso)
  return `${p.d}/${p.m}/${p.a} ${p.h}:${p.min}`
}

export function diaMes(iso: string): string {
  const p = partes(iso)
  return `${p.d}/${p.m}`
}

export function diaMesAnio(iso: string): string {
  const p = partes(iso)
  return `${p.d}/${p.m}/${p.a}`
}

export function mesAnio(iso: string): string {
  const p = partes(iso)
  return `${p.m}/${p.a}`
}

/** «Hoy 15:42» · «Ayer 17:20» · «18/09 16:30» · «18/09/2025» si es de otro año. */
export function cuando(iso: string, hoy: Date = new Date()): string {
  const p = partes(iso)
  const h = partes(hoy.toISOString())
  const ayer = partes(new Date(hoy.getTime() - 86_400_000).toISOString())
  const hora = `${p.h}:${p.min}`
  if (p.d === h.d && p.m === h.m && p.a === h.a) return `Hoy ${hora}`
  if (p.d === ayer.d && p.m === ayer.m && p.a === ayer.a) return `Ayer ${hora}`
  if (p.a !== h.a) return `${p.d}/${p.m}/${p.a}`
  return `${p.d}/${p.m} ${hora}`
}

export function pesos(n: number): string {
  return `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)}`
}
