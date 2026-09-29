AERONAV RC11.84 — PHOTO 3D FREEZE HOTFIX

Correção urgente da RC11.83:
- remove o MutationObserver recursivo que podia bloquear/congelar a aplicação;
- mantém a chave Google apenas no Railway;
- mantém o proxy seguro para Google Photorealistic 3D Tiles;
- remove o reload automático do service worker na ativação;
- não altera Mathia, Wendler, Family, GPS, VOO, PMTiles ou rotas.

INSTALAÇÃO
Na raiz do GitHub, substituir/enviar:
- photo3d-proxy.js
- sw.js
- README_RC11_84_PHOTO3D_FREEZE_HOTFIX.txt

Depois aguardar GitHub Pages verde, fechar completamente a AERONAV e abrir novamente.
