# Como gerar o ProjetEletrico.exe

## Passo a passo (uma vez so)

### 1. Criar conta GitHub
Acesse https://github.com e crie uma conta gratuita.

### 2. Criar repositorio PRIVADO
- Clique em "New repository"
- Nome: projeletrico
- Marque: **Private** (importante!)
- Clique "Create repository"

### 3. Fazer upload do projeto
Na pagina do repositorio clique em "uploading an existing file"
Arraste todos os arquivos desta pasta para la.
Clique "Commit changes".

### 4. O .exe e gerado automaticamente
O GitHub Actions compila o .exe em ~5 minutos.
Voce vera uma bolinha amarela girando no repositorio.
Quando ficar verde = pronto.

### 5. Baixar o .exe
- Clique na aba "Actions"
- Clique no workflow mais recente
- Role para baixo ate "Artifacts"
- Clique em "ProjetEletrico-Windows" para baixar

### Proximas vezes
Sempre que voce alterar algo e fazer upload novamente,
o .exe e gerado automaticamente. Voce so baixa.

## O repositorio e privado?
SIM. Apenas voce tem acesso. Nao aparece para ninguem.
