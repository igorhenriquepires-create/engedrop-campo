# Engedrop Campo

Aplicação PWA para registrar e acompanhar visitas técnicas agrícolas da Engedrop. Ela é **local-first**: continua registrando clientes, talhões, avaliações, fotos e rascunhos sem sinal; quando o Supabase estiver configurado e o técnico autenticado, a fila é sincronizada automaticamente ao voltar a conexão.

## Recursos entregues

- Dashboard com indicadores e últimas visitas.
- Clientes, propriedades e talhões, com pesquisa, edição de clientes e histórico individual.
- Visita multi-talhão, rascunho e finalização, com cultura, estádio, nós, nódulos e observações.
- Stand por repetições, média ponderada e cálculo `plantas/m × 10.000 ÷ espaçamento (m)`, mantendo um valor manual quando informado.
- Estádios de soja (V1–Vn e R1–R8 com subdivisões) e milho (VE, V1–Vn, VT e R1–R6), além de texto livre para outras culturas.
- Fotos da câmera/galeria, legendas por imagem, ordenação e visualização prévia; os blobs ficam no IndexedDB enquanto offline e são enviados ao Storage privado depois.
- PDF consolidado da visita com pré-visualização, download e compartilhamento nativo quando disponível.
- Texto de relatório profissional para edição, cópia e abertura no WhatsApp, sem campos vazios.
- Histórico filtrável por cliente, propriedade, talhão, cultura, safra e data; PDFs gerados ficam acessíveis dentro da visita.
- PWA instalável, cache de aplicação e banco local IndexedDB (Dexie).
- Estrutura Supabase completa: migration, RLS e buckets privados.

## Início rápido (modo local, sem Supabase)

Pré-requisito: Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite. Neste modo a aplicação é plenamente utilizável no mesmo navegador/dispositivo. Os dados ficam em IndexedDB e não são enviados a nenhum serviço externo.

Para validar e gerar uma compilação de produção:

```bash
npm test
npm run build
npm run preview
```

## Conectar ao Supabase

1. Crie um projeto no Supabase.
2. Execute o arquivo [supabase/migrations/20261102120000_engedrop_campo.sql](supabase/migrations/20261102120000_engedrop_campo.sql) pelo SQL Editor, ou use a CLI:

   ```bash
   supabase login
   supabase link --project-ref SEU_PROJECT_REF
   supabase db push
   ```

3. Em **Authentication > Providers**, habilite e-mail/senha e crie os usuários internos da Engedrop. Não crie contas para clientes.
4. Ative cada colaborador autorizado após a criação. No SQL Editor, por exemplo:

   ```sql
   update public.profiles
   set active = true
   where email = 'tecnico@engedrop.com.br';
   ```

   Para um usuário que já existia antes de aplicar a migration, crie/ative o perfil uma vez:

   ```sql
   insert into public.profiles (id, email, active)
   select id, email, true from auth.users where email = 'tecnico@engedrop.com.br'
   on conflict (id) do update set active = true;
   ```

5. Copie `.env.example` para `.env` e informe somente as credenciais públicas do projeto:

   ```dotenv
   VITE_SUPABASE_URL=https://SEU_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
   VITE_COMPANY_NAME=Engedrop
   VITE_TECHNICAL_MANAGER=Nome do responsável técnico
   ```

6. Reinicie `npm run dev`, abra **Configurações** e entre com a conta interna.

`VITE_SUPABASE_ANON_KEY` é a chave pública apropriada para navegador. **Nunca** coloque `service_role`, senha de banco ou tokens administrativos em `.env` exposto ao Vite.

### Segurança e armazenamento

A migration cria as tabelas relacionais, chaves estrangeiras, índices, atualização automática de `updated_at`, políticas RLS e os buckets privados `visit-photos` e `visit-reports`. A leitura e escrita exigem uma sessão autenticada cujo perfil tenha `active = true`. O app usa IDs UUID locais e `upsert` no servidor; a fila IndexedDB possui uma única entrada por entidade, prevenindo duplicações previsíveis após reconexão.

## Publicação

```bash
npm run build
```

Publique o conteúdo de `dist/` em uma hospedagem HTTPS (Vercel, Netlify, Cloudflare Pages, S3/CloudFront etc.), configurando as mesmas variáveis `VITE_*` no ambiente de build. Configure fallback de SPA para `index.html`. HTTPS é necessário para instalação PWA, câmera e compartilhamento em dispositivos móveis.

### Publicação automática no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` já está preparado. Depois de criar/enviar este projeto a um repositório GitHub:

1. Em **Settings > Pages**, escolha **GitHub Actions** como fonte.
2. Em **Settings > Secrets and variables > Actions > Variables**, cadastre `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_COMPANY_NAME` e `VITE_TECHNICAL_MANAGER`. As duas primeiras podem ficar vazias se for utilizar apenas o modo local.
3. Envie o código para o branch `main`. A aba **Actions** informará a URL pública ao final do primeiro deploy.

No celular, abra essa URL HTTPS e escolha **Instalar aplicativo** (Android) ou **Adicionar à Tela de Início** (iPhone).

## Estrutura principal

```text
src/
  App.tsx             telas e fluxos de campo
  lib/db.ts           IndexedDB/Dexie
  lib/repository.ts   persistência e fila local
  lib/sync.ts         sincronização Supabase + Storage
  lib/reporting.ts    PDF e texto para WhatsApp
  lib/stand.ts        regra agronômica de cálculo
supabase/migrations/  schema, RLS e Storage
```

## Personalização de marca

O projeto traz um marcador vetorial verde temporário para evitar reproduzir indevidamente uma marca sem o arquivo oficial. Antes da publicação, substitua `public/icon-192.svg`, `public/icon-512.svg` e o cabeçalho de `src/lib/reporting.ts` pela logomarca original licenciada da Engedrop.

## Limites conhecidos

- Não há credenciais Supabase neste repositório; por isso a sincronização na nuvem depende da configuração descrita acima.
- Fotos HEIC dependem de suporte do navegador/PDF do aparelho. JPEG, PNG e WebP são os formatos recomendados para relatórios consistentes.
