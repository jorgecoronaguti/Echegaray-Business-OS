// Función que corre en la página: vuelca cada elemento con texto propio (o control/barra) con su estilo.
export function digestFn(rootSel) {
  const root = rootSel ? document.querySelector(rootSel) : document.body
  const R = (root.__frame || root).getBoundingClientRect()
  const out = []
  const walk = (el) => {
    const st = getComputedStyle(el)
    if (st.display === 'none' || st.visibility === 'hidden') return
    const b = el.getBoundingClientRect()
    let own = ''
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent
    own = own.replace(/\s+/g, ' ').trim()
    const isCtl = /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)
    if ((own || isCtl) && b.width > 0 && b.height > 0) {
      out.push({
        t: (own || el.value || el.placeholder || el.getAttribute('aria-label') || '').slice(0, 60), tag: el.tagName.toLowerCase(),
        x: Math.round(b.left - R.left), y: Math.round(b.top - R.top), w: Math.round(b.width), h: Math.round(b.height),
        fs: st.fontSize, fw: st.fontWeight, ff: st.fontFamily.split(',')[0].replace(/"/g, '').slice(0, 18), c: st.color,
        bg: st.backgroundColor === 'rgba(0, 0, 0, 0)' ? '' : st.backgroundColor, tt: st.textTransform === 'none' ? '' : st.textTransform,
        ls: st.letterSpacing === 'normal' ? '' : st.letterSpacing, bd: st.borderTopWidth !== '0px' || st.borderBottomWidth !== '0px' ? `${st.borderTopWidth}/${st.borderBottomWidth} ${st.borderColor}` : '', rad: st.borderRadius === '0px' ? '' : st.borderRadius,
      })
    }
    for (const c of el.children) walk(c)
  }
  walk(root)
  return { W: Math.round(R.width), H: Math.round(R.height), items: out }
}
