AERONAV RC11.53 — CLIENTES FAMILY EM RAIZ (SEM PASTAS)

Este pacote evita pastas /mathia/ e /wendler/.
Carregue TODOS os ficheiros diretamente na raiz do repositório.

Mathia: family-viewer.html
Wendler: wendler.html

Os perfis não se misturam:
- Mathia usa namespace localStorage aeronav.mathia.*
- Wendler usa namespace localStorage aeronav.wendler.*
- manifests e ícones são separados
- ambos usam o mesmo sw.js da aplicação principal, evitando conflito de service workers
- os QR gerados no app Jorge apontam para o ficheiro correto

Não é necessário criar pastas no GitHub.
