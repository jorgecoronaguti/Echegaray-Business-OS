# EXTRAER EL TEXTO DE UN PDF. Se llama desde `buscar.mjs` y no hace nada más.
#
# Vive en su propio archivo, y no como un string adentro del .mjs, por una razón concreta: un guion
# embebido se pasa por `python3 -c` y ahí el escapado de comillas y barras se rompe callado —
# produce texto vacío en vez de un error. Un archivo se puede leer, versionar y probar.
#
# ═══ POR QUÉ DEVUELVE `utiles` ═══
#
# La primera versión armaba el texto intercalando «=== p.N ===» entre páginas, y arriba se
# preguntaba `if not texto.trim()`. Con eso el control de «este PDF no tiene capa de texto» era
# INCAPAZ de dispararse: los marcadores de página SON texto, así que un reglamento escaneado —el
# caso exacto para el que se escribió el control— pasaba como lectura buena, se cacheaba, y de yapa
# ascendía la fuente en el padrón por haber «servido». Ahora se informa aparte cuántos caracteres
# hay de CONTENIDO, sin contar los marcadores, y la decisión se toma sobre ese número.
import sys, json

try:
    import fitz  # PyMuPDF
except Exception as e:  # noqa: BLE001 — la ausencia de la dependencia es un DATO, no una excepción
    print(json.dumps({"error": "PyMuPDF no está disponible: %s" % e}))
    sys.exit(0)

try:
    doc = fitz.open(sys.argv[1])
except Exception as e:  # noqa: BLE001
    print(json.dumps({"error": "no se pudo abrir el PDF: %s" % e}))
    sys.exit(0)

tope = min(doc.page_count, int(sys.argv[2]))
partes = []
utiles = 0
paginas_con_texto = 0
for i in range(tope):
    crudo = doc[i].get_text()
    limpio = crudo.strip()
    if limpio:
        paginas_con_texto += 1
        utiles += len(limpio)
    partes.append("=== p.%d ===\n%s" % (i + 1, crudo))

print(json.dumps({
    "paginas": doc.page_count,
    "leidas": tope,
    "utiles": utiles,                      # caracteres de CONTENIDO, sin los marcadores de página
    "paginasConTexto": paginas_con_texto,
    "texto": "\n".join(partes),
}))
