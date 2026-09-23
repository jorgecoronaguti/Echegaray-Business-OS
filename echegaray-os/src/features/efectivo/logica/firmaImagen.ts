// LA FIRMA SE VE, NO SE DICE. El trazo del teléfono se guarda como SVG (shared/firma/firma.ts); para
// mostrarlo en la ficha alcanza con una imagen con data URL: no se inyecta HTML y el navegador lo dibuja
// como cualquier foto. Dueño, 23/09/2026: «¿cómo veo las firmas de que se entregó el dinero? quiero ver eso».

/** `null` si no es un SVG de firma (cualquier otra cosa no se dibuja). */
export function imagenDeFirma(svg: string | null | undefined): string | null {
  const s = String(svg ?? '').trim()
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s) || /<script/i.test(s)) return null
  return `data:image/svg+xml;utf8,${encodeURIComponent(s)}`
}
