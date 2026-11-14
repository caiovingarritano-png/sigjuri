"""Empacota a skill calculo-judicial em dist/calculo-judicial.zip (para upload em claude.ai → Settings → Capabilities → Skills)."""
import os
import zipfile

ORIGEM = os.path.join('.claude', 'skills', 'calculo-judicial')
DESTINO = os.path.join('dist', 'calculo-judicial.zip')

os.makedirs('dist', exist_ok=True)
with zipfile.ZipFile(DESTINO, 'w', zipfile.ZIP_DEFLATED) as z:
    for raiz, _, arquivos in os.walk(ORIGEM):
        for a in sorted(arquivos):
            caminho = os.path.join(raiz, a)
            z.write(caminho, os.path.join('calculo-judicial', os.path.relpath(caminho, ORIGEM)))
print('Gerado', DESTINO)
