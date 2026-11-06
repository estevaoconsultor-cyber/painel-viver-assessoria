// viver-usuarios: o gestor cria, pausa, reativa e exclui usuários do Portal Viver.
// Só funciona para quem está logado como gestor ativo. Usa a chave de serviço (nunca vai para o navegador).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const DOMINIO_LOGIN = "acesso.viverassessoriacomercial.com.br"; // quem entra com nome.sobrenome ganha um e-mail interno neste domínio
const PAPEIS = ["gestor", "hapvida", "corretor"];
function loginPara(t: string) {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
}
function senhaTemporaria() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(10));
  return "Viver@" + Array.from(r, (n) => a[n % a.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return resp({ ok: true });
  if (req.method !== "POST") return resp({ erro: "Método não permitido" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const adm = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // quem está chamando
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: eu } = await adm.auth.getUser(token);
  if (eu || !u?.user) return resp({ erro: "Faça login de novo." }, 401);
  const { data: eu2 } = await adm.from("perfis").select("id,email,nome,papel,status").eq("id", u.user.id).maybeSingle();
  if (!eu2 || eu2.papel !== "gestor" || eu2.status !== "ativo") return resp({ erro: "Só gestores podem gerenciar usuários." }, 403);

  let b: any = {};
  try { b = await req.json(); } catch { b = {}; }
  const acao = String(b.acao || "");
  const log = (a: string, alvo: string, detalhe: unknown = null) =>
    adm.from("log_acoes").insert({ usuario_email: eu2.email, acao: a, alvo, detalhe });

  if (acao === "listar") {
    const { data, error } = await adm.from("perfis")
      .select("id,email,login,nome,papel,status,corretora_id,criado_em,criado_por,corretoras(nome)")
      .order("papel").order("nome");
    if (error) return resp({ erro: error.message }, 500);
    return resp({ itens: data });
  }

  if (acao === "criar") {
    const acesso = String(b.email || b.login || "").trim().toLowerCase();
    const nome = String(b.nome || "").trim();
    const papel = PAPEIS.includes(b.papel) ? b.papel : "corretor";
    const corretora_id = papel === "corretor" && b.corretora_id ? Number(b.corretora_id) : null;
    // e-mail ou usuário (nome.sobrenome)
    let email = acesso, login: string | null = null;
    if (!acesso.includes("@")) { login = loginPara(acesso); email = login + "@" + DOMINIO_LOGIN; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (login !== null && login.length < 3)) return resp({ erro: "Informe um e-mail válido ou um usuário (ex.: nome.sobrenome)." }, 400);
    if (nome.length < 2) return resp({ erro: "Informe o nome." }, 400);
    if (papel === "corretor" && !corretora_id) return resp({ erro: "Escolha a corretora deste corretor." }, 400);
    const senha = String(b.senha || "").length >= 8 ? String(b.senha) : senhaTemporaria();
    const { data: novo, error } = await adm.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
    if (error) return resp({ erro: /already|registered|exists/i.test(error.message) ? "Este e-mail ou usuário já tem acesso ao portal." : error.message }, 400);
    const { error: ep } = await adm.from("perfis").insert({ id: novo.user!.id, email, login, nome, papel, corretora_id, criado_por: eu2.email });
    if (ep) { await adm.auth.admin.deleteUser(novo.user!.id); return resp({ erro: ep.message }, 500); }
    await log("criar_usuario", email, { papel, corretora_id });
    return resp({ ok: true, id: novo.user!.id, senha, acesso: login || email });
  }

  const id = String(b.id || "");
  if (!id) return resp({ erro: "Usuário não informado." }, 400);
  const { data: alvo } = await adm.from("perfis").select("id,email,papel,status").eq("id", id).maybeSingle();
  if (!alvo) return resp({ erro: "Usuário não encontrado." }, 404);
  if (alvo.id === eu2.id && acao !== "nova_senha" && acao !== "senha") return resp({ erro: "Você não pode pausar ou excluir o seu próprio acesso." }, 400);

  if (acao === "pausar" || acao === "reativar") {
    const status = acao === "pausar" ? "pausado" : "ativo";
    const { error } = await adm.auth.admin.updateUserById(id, { ban_duration: acao === "pausar" ? "876000h" : "none" });
    if (error) return resp({ erro: error.message }, 500);
    await adm.from("perfis").update({ status }).eq("id", id);
    await log(acao + "_usuario", alvo.email);
    return resp({ ok: true, status });
  }
  if (acao === "excluir") {
    const { error } = await adm.auth.admin.deleteUser(id); // apaga o perfil junto (cascade)
    if (error) return resp({ erro: error.message }, 500);
    await log("excluir_usuario", alvo.email);
    return resp({ ok: true });
  }
  if (acao === "nova_senha" || acao === "senha") {
    // "senha": o gestor digita a nova senha; "nova_senha": o portal gera uma
    const digitada = String(b.senha || "");
    if (acao === "senha" && digitada.length < 8) return resp({ erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    const senha = acao === "senha" ? digitada : senhaTemporaria();
    const { error } = await adm.auth.admin.updateUserById(id, { password: senha });
    if (error) return resp({ erro: error.message }, 500);
    await log("senha_usuario", alvo.email);
    return resp({ ok: true, senha });
  }
  return resp({ erro: "Ação desconhecida." }, 400);
});
