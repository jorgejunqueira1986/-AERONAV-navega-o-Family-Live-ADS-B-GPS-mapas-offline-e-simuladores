AERONAV RC11.83 — SECURE LUANDA PHOTO 3D

OBJETIVO
- A chave GOOGLE_MAP_TILES_API_KEY permanece exclusivamente no Railway.
- AERONAV não precisa de receber nem guardar a chave Google real no iPhone/iPad.
- Pedidos Google Photorealistic 3D Tiles passam pelo endpoint seguro do aeronav-cockpit-token-server.

BACKEND CONFIRMADO
- /google3d/status => ok=true, configured=true, google_status=200
- Proxy Railway: /v1/3dtiles/*

FICHEIROS DESTE PATCH
- photo3d-proxy.js   NOVO
- sw.js              SUBSTITUI o sw.js da raiz
- README_RC11_83_SECURE_PHOTO3D.txt

INSTALAÇÃO
1. Na raiz do repositório GitHub AERONAV, Add file > Upload files.
2. Enviar estes 3 ficheiros.
3. Commit directly to main.
4. Aguardar pages build and deployment ficar verde.
5. Fechar completamente AERONAV e abrir novamente. O service worker RC11.83 força uma atualização automática da aplicação principal.
6. Abrir CARRO com Internet em Luanda e testar LUANDA PHOTO 3D.

SEGURANÇA
- Não colocar a chave Google em index.html, GitHub, localStorage ou campos da aplicação.
- O valor local usado pela compatibilidade RC11.82 é apenas um sentinel não secreto.
- Mathia e Wendler não são alterados por este patch.

FALLBACK
- Sem Internet ou se o Photo 3D falhar, AERONAV mantém o fallback LUANDA_3D.pmtiles + LUANDA_TERRAIN_3D.pmtiles.
