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
| `PATIENT_APP_ORIGINS` | CORS — origens autorizadas, separadas por vírgula | `https://app-paciente.lovable.app` |

As três variáveis restantes (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) já são injetadas automaticamente.

Enquanto o app do paciente não existir, dá para apontar os dois para
`http://localhost:5173` e testar o `patient-invite` sozinho — ele só usa a URL
para montar a string do link.

**Sobre o CORS:** não é usado `*` de propósito. Estas funções criam contas e
vínculos; liberar qualquer origem convida qualquer site a chamá-las. Origem fora
da lista não recebe cabeçalho de permissão e o navegador bloqueia.

---

## `patient-accept-invite` roda sem JWT

Precisa ser configurada com verificação de JWT **desativada**. O paciente ainda
não tem conta quando a chama — se exigisse sessão, nunca seria possível criar a
primeira.

No `supabase/config.toml`:

```toml
[functions.patient-accept-invite]
verify_jwt = false
```

Na Lovable, peça explicitamente que esta função seja pública.

Isso deixa a função exposta à internet, e é por isso que o token do convite
carrega o peso todo: 256 bits aleatórios, conferido por hash, com prazo e uso
único.

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
