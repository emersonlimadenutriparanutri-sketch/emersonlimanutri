# Edge Functions do convite — como implantar

Duas funções, ambas neste projeto (o do nutricionista). Elas **não** vão no
projeto do app do paciente: o Lovable Cloud não expõe a `service_role` key, e
sem ela não há como criar usuário no Auth. O app do paciente as chama por HTTP.

Efeito colateral bom dessa restrição: todo o código com privilégio fica num
lugar só.

| Função | Quem chama | Autenticação |
|---|---|---|
| `patient-invite` | app do nutricionista | sessão do nutricionista |
| `patient-accept-invite` | app do paciente | **nenhuma** — quem autoriza é o token |

---

## Antes de implantar: dois secrets

| Secret | Para quê | Exemplo |
|---|---|---|
| `PATIENT_APP_URL` | montar o link do convite | `https://app-paciente.lovable.app` |
| `PATIENT_APP_ORIGINS` | CORS — origens autorizadas, separadas por vírgula | `https://app-nutri.lovable.app,https://app-paciente.lovable.app` |

**`PATIENT_APP_ORIGINS` precisa das DUAS origens**, apesar do nome. As duas
funções compartilham o mesmo `cors.ts`, e elas são chamadas de lugares
diferentes: `patient-invite` vem do app do nutricionista, `patient-accept-invite`
vem do app do paciente. Listar só a do paciente faz o navegador bloquear a
resposta do convite — a função executa, mas o app do nutricionista nunca lê o
resultado.

Sintoma quando falta: erro de CORS no console, com a requisição aparecendo como
bem-sucedida na aba Network. É confuso justamente porque nada falhou no
servidor.

As três variáveis restantes (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) já são injetadas automaticamente.

Enquanto o app do paciente não existir, dá para apontar os dois para
`http://localhost:5173` e testar o `patient-invite` sozinho — ele só usa a URL
para montar a string do link.

**Sobre o CORS:** não é usado `*` de propósito. Estas funções criam contas e
vínculos; liberar qualquer origem convida qualquer site a chamá-las. Origem fora
da lista não recebe cabeçalho de permissão e o navegador bloqueia.

---

## As duas rodam com `verify_jwt = false`

```toml
[functions.patient-invite]
verify_jwt = false

[functions.patient-accept-invite]
verify_jwt = false
```

Pelos dois motivos diferentes abaixo. Na Lovable, peça explicitamente que ambas
sejam públicas.

**`patient-accept-invite`** porque o paciente ainda não tem conta quando a
chama. Se exigisse sessão, nunca seria possível criar a primeira. Quem autoriza
é o token do convite, e é por isso que ele carrega o peso todo: 256 bits
aleatórios, conferido por hash, com prazo e uso único.

**`patient-invite`** por causa do CORS. O `OPTIONS` de preflight que o navegador
manda antes do POST **não carrega cabeçalho de autenticação** — é assim por
especificação. Com `verify_jwt = true`, a plataforma rejeita esse OPTIONS com
401 antes de o código da função rodar, e um 401 da plataforma não traz
cabeçalho de CORS. O navegador então bloqueia, e o sintoma é confuso: erro de
CORS num endpoint cuja configuração de CORS está correta.

Isso **não deixa a função aberta**. Ela autentica por conta própria: lê o
`Authorization`, chama `getUser()`, devolve 401 sem sessão, e ainda confere que
o paciente pertence a quem está chamando. A verificação não desapareceu — saiu
da porta da plataforma e foi para dentro do código, onde consegue responder o
preflight antes de exigir sessão.

Sintoma de quando falta:

```
Access to fetch ... has been blocked by CORS policy: Response to preflight
request doesn't pass access control check: No 'Access-Control-Allow-Origin'
header is present on the requested resource.
```

## Secret novo exige reimplantação

O `cors.ts` lê `PATIENT_APP_ORIGINS` uma vez, quando o módulo carrega. Uma
instância já em execução continua com o valor antigo. Depois de mudar o secret,
reimplante as duas funções.

---

## O fluxo completo

```
1. Nutricionista clica "Convidar paciente"
     POST /functions/v1/patient-invite  { patient_id }
     → { link, expira_em, paciente_nome }
     → a tela mostra o link para copiar (ou abre o WhatsApp com a mensagem pronta)

2. Nutricionista envia pelo WhatsApp dele

3. Paciente abre  /convite?token=...  no app do paciente
     escolhe e-mail e senha, aceita os termos
     POST /functions/v1/patient-accept-invite
          { token, email, senha, nome, consentimento_versao }
     → { ok: true }

4. O app do paciente faz signIn normal com esse e-mail e senha
```

O link some depois do passo 1: só o hash fica no banco. Link perdido não se
recupera — gera-se outro, e o anterior é revogado automaticamente.

---

## Decisões que valem revisão

**E-mail criado como confirmado.** A conta nasce com `email_confirm: true`, para
o paciente entrar direto sem depender de servidor de e-mail configurado. O custo
é que o e-mail não é verificado — e é para ele que vai a recuperação de senha.
Aceitável no piloto; antes de abrir para assinantes, vale exigir confirmação.

**E-mail já cadastrado devolve 409, não cria conta.** Acontece de verdade: o
paciente também é assinante da plataforma, ou já aceitou um convite antes. Criar
uma segunda conta ou tentar adivinhar a senha seriam os dois caminhos errados. O
app deve dizer "esse e-mail já tem conta — entre e abra o link de novo", e essa
segunda metade (vincular um usuário já logado) ainda **não está implementada**.

**O convite é queimado por último.** Se a criação da conta ou do vínculo falhar,
o convite continua válido e o paciente tenta de novo com o mesmo link. E se o
vínculo falhar depois da conta criada, a conta é apagada — senão sobraria um
usuário sem vínculo, incapaz de usar o app e com o e-mail travado para uma
segunda tentativa.

---

## Como testar sem app do paciente

Com uma sessão de nutricionista no navegador, no console:

```js
const { data } = await supabase.functions.invoke('patient-invite', {
  body: { patient_id: 'UUID-DE-UM-PACIENTE-SEU' }
})
console.log(data)   // { link, expira_em, paciente_nome }
```

Esperado: um link. Chamar de novo para o mesmo paciente gera um link novo e
revoga o anterior — dá para conferir em `patient_invites`, onde o primeiro
aparece como `revogado`.

Testar o aceite exige a rota `/convite` do app do paciente, que ainda não
existe. Até lá, a função pode ser chamada direto com `fetch`, passando o token
extraído do link.
