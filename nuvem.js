/* ══════════════════════════════════════════════════════════════════
   PORTAL VIVER — versão hospedada (site)
   Login real (Supabase), dados reais das corretoras, esteira gravada no banco,
   acessos das corretoras e da equipe, e aviso "+1 corretor concluído".
   Perfis: gestor (Viver, vê tudo), hapvida (vê tudo menos Pedidos e Acessos), corretor (só a própria corretora).
   ══════════════════════════════════════════════════════════════════ */
const SB_URL = "https://bxkbqzepjvpxapfsrlvg.supabase.co";
const SB_KEY = "sb_publishable_K6UzVcLfCprWVwdn1S2ACw_Um5bsckR";   // chave pública (o que cada um vê é controlado no banco)
const DOMINIO_LOGIN = "acesso.viverassessoriacomercial.com.br";    // quem entra com nome.sobrenome
const lembrarLogin = ()=>{ try{ return localStorage.getItem("viverLembrar")!=="0"; }catch(e){ return true; } };
const sbStorage = {
  getItem:k=>{ try{ return localStorage.getItem(k) ?? sessionStorage.getItem(k); }catch(e){ return null; } },
  setItem:(k,v)=>{ try{ (lembrarLogin()?localStorage:sessionStorage).setItem(k,v); }catch(e){} },
  removeItem:k=>{ try{ localStorage.removeItem(k); sessionStorage.removeItem(k); }catch(e){} },
};
const sb = window.supabase.createClient(SB_URL, SB_KEY, {auth:{persistSession:true, autoRefreshToken:true, storage:sbStorage, storageKey:"viver-portal"}});

const N = {H:{}, perfil:null, uid:null, corretoras:[], usuarios:null, carregadoEm:0, canal:null, notifFila:[], acSel:null, acForm:null, acSenha:null, acExcluir:null, acBusca:"", acResult:null};
const papel = ()=>N.perfil?N.perfil.papel:"";
const ehGestorViver = ()=>papel()==="gestor";
const ehHapvida = ()=>papel()==="hapvida";
const ehEquipe = ()=>ehGestorViver()||ehHapvida();
const esc = t=>String(t==null?"":t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dataMs = s=>{ if(!s) return null; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return null; return new Date(+m[1],+m[2]-1,+m[3]).getTime(); };
const soDia = iso=>/^\d{4}-\d{2}-\d{2}([T ]00:00:00(\.0+)?(Z|\+00(:?00)?))?$/.test(String(iso||""));   // registro da planilha: só o dia, sem hora
const diaMs = iso=>{ if(soDia(iso)) return dataMs(iso); const d=new Date(iso); d.setHours(0,0,0,0); return d.getTime(); };
const quandoFmt = iso=>{ if(soDia(iso)) return fmtData(iso).slice(0,5); const d=new Date(iso); return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); };
const fmtData = s=>{ const t=dataMs(s); if(t==null) return "—"; const d=new Date(t); return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear(); };
const isoHoje = ()=>{ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const soDig = s=>String(s||"").replace(/\D/g,"");
const fmtCnpj = s=>{ const d=soDig(s); return d.length===14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5") : (s||""); };
const fmtTel = s=>{ const d=soDig(s); return d.length===11?d.replace(/^(\d{2})(\d{5})(\d{4})$/,"($1) $2-$3"):d.length===10?d.replace(/^(\d{2})(\d{4})(\d{4})$/,"($1) $2-$3"):(s||""); };
const pctGrade = g=>{ const m=String(g||"").match(/(\d+(?:[.,]\d+)?)\s*%/); return m?parseFloat(m[1].replace(",",".")):null; };
const WHATS_VIVER = "11995588188";   // comercial da Viver: vale para gestores sem WhatsApp cadastrado
const COM_QUEM = {viver:"Viver", corretor:"Corretor", hapvida:"Hapvida", concluido:"Concluído", declinado:"Declinado"};
const ETAPA_DE = {corretor:0, viver:1, hapvida:3, concluido:4, declinado:0};
const respNome = c=>{ const r=(c.responsaveis||[])[0]; return (r&&r.nome) || (c.contato&&c.contato!=="CONCLUÍDO"&&c.contato!=="AGENDAR"?String(c.contato).split(" - ")[0]:"") || "Responsável não informado"; };

async function chamarUsuarios(body){
  const r = await sb.functions.invoke("viver-usuarios",{body});
  if(r.error){ let m="Não foi possível concluir agora."; try{ const j=await r.error.context.json(); if(j&&j.erro) m=j.erro; }catch(e){} throw new Error(m); }
  return r.data||{};
}

/* ───────── menu por perfil ───────── */
ICON.key = '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14.5 8.5l2.5 2.5"/>';
const MENU_GESTOR_BASE = MENUS.gestor.slice();
const PAGINAS_PEDIDOS = ["g-treinos","g-apoio","g-leads"];
TITLES.acessos = ["Acessos","Usuários das corretoras e da equipe: adicionar, pausar, excluir e trocar senha"];
function montarMenu(){
  let m = MENU_GESTOR_BASE.slice();
  if(ehHapvida()) m = m.filter(x=>x.lbl!=="Pedidos" && !PAGINAS_PEDIDOS.includes(x.id));
  if(ehGestorViver()) m.push({lbl:"Acessos"},{id:"acessos",t:"Acessos das corretoras",i:"key"});
  MENUS.gestor.length = 0; MENUS.gestor.push(...m);
}
const paginaBloqueada = p=> (ehHapvida() && (PAGINAS_PEDIDOS.includes(p)||p==="acessos")) || (p==="acessos" && !ehGestorViver());
const goBase = go;
go = function(p){ if(paginaBloqueada(p)) return; goBase(p); };
const renderNavBase = renderNav;
renderNav = function(){
  renderNavBase();
  if(ehHapvida()){ document.querySelector(".role").hidden = true; if(role==="gestor") $("#whoName").textContent = USER.nome+" · Hapvida"; }
};

/* ───────── carregar dados reais ───────── */
function aplicarSla(v){
  if(!v) return;
  ["existente","novo"].forEach(k=>{ (v[k]||[]).forEach((d,i)=>{ if(FLUXOS[k].etapas[i]) FLUXOS[k].etapas[i].sla = +d||0; }); });
  if(v.pend!=null) SLA_PEND.v = +v.pend||0;
}
function semanasRecentes(){
  const meses=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  for(let i=0;i<SEMANAS.length;i++){ const d=new Date(); d.setDate(d.getDate()-7*(SEMANAS.length-1-i)); SEMANAS[i]=String(d.getDate()).padStart(2,"0")+"/"+meses[d.getMonth()]; }
}
function montarHist(c, hs){
  const fl = FLUXOS[c.tipo]||FLUXOS.existente;
  const segs = [];
  hs.forEach(h=>{
    const pend = !!h.pend;
    const et = h.etapa!=null ? h.etapa : (ETAPA_DE[h.com_quem]??0);
    const resp = pend ? "corretor" : (RESP[h.com_quem] ? h.com_quem : "viver");
    const ult = segs[segs.length-1];
    if(ult && ult.resp===resp && ult.etapa===(pend?null:et) && ult.pend===pend){ ult.pendTxt = h.pendencia; return; }   // só mudou pendência/prazo/observação: mesmo trecho
    segs.push({etapa:pend?null:et, pend, motivo:h.pendencia||"", pendTxt:h.pendencia, resp, t: pend?`Pendência: ${h.pendencia||"documentos do corretor"}`:(fl.etapas[Math.min(et,fl.etapas.length-1)]||{}).t||"", ini:diaMs(h.em), fim:null});
  });
  if(!segs.length){ const et=c.est_etapa||0; segs.push({etapa:et, pend:false, resp:RESP[c.com_quem]?c.com_quem:"viver", t:fl.etapas[et].t, ini:dataMs(c.desde)||hoje0(), fim:null}); }
  // o trecho atual começa quando o status mudou pela última vez
  const atual = segs[segs.length-1]; const desde = dataMs(c.desde); if(desde!=null) atual.ini = Math.max(desde, segs.length>1?segs[segs.length-2].ini:desde);
  for(let i=0;i<segs.length-1;i++) segs[i].fim = segs[i+1].ini;
  return segs;
}
async function carregar(){
  const [rc, rh, rcf, rp] = await Promise.all([
    sb.from("corretoras").select("*").order("nome"),
    sb.from("corretora_historico").select("id,corretora_id,com_quem,situacao,etapa,pend,pendencia,prazo,em,por").order("em").order("id"),
    sb.from("config").select("chave,valor"),
    (ehHapvida() ? Promise.resolve({data:[]}) : sb.from("pedidos").select("*").order("id")),
  ]);
  const erro = rc.error||rh.error||rcf.error||rp.error;
  if(erro) throw new Error(erro.message);
  N.corretoras = rc.data||[]; N.carregadoEm = Date.now();
  const sla = (rcf.data||[]).find(x=>x.chave==="sla"); if(sla) aplicarSla(sla.valor);
  const H = {}; (rh.data||[]).forEach(h=>{ (H[h.corretora_id]=H[h.corretora_id]||[]).push(h); }); N.H = H;
  const ativas = N.corretoras.filter(c=>c.com_quem!=="declinado");
  // ESTEIRA
  EST = ativas.map(c=>{
    const hist = montarHist(c, H[c.id]||[]);
    const ultNaoPend = [...hist].reverse().find(h=>!h.pend);
    return {id:c.id, corretora:c.nome, cnpj: c.cnpj?fmtCnpj(c.cnpj):(c.codigo?"Cód. Hapvida "+c.codigo:(c.chamado||"CNPJ não informado")), corretor:respNome(c), tipo:FLUXOS[c.tipo]?c.tipo:"existente", etapa: ultNaoPend?ultNaoPend.etapa:(c.est_etapa||0), hist, _row:c};
  });
  // CORRETORES (todas as corretoras no fluxo, menos as declinadas)
  semanasRecentes();
  C.length = 0;
  ativas.forEach(c=>{
    const p = EST.find(x=>x.id===c.id), st = estStatus(p), a = estAtual(p);
    const s = st.k==="crit"?"crit":st.k==="warn"?"warn":"ok";
    const quem = a.resp==="concluido" ? "" : `com ${RESP[a.resp].t}`;
    const detalhe = c.pendencia || c.situacao || a.t;
    C.push({id:c.id, nome: papel()==="corretor"?N.perfil.nome:respNome(c), corr:c.nome, desde:fmtData(c.abertura||c.criado_em),
      etapa: c.com_quem==="concluido"||c.com_quem==="hapvida" ? 2 : 0, vidas:0, sem:SEMANAS.map(()=>0),
      st:s, motivo: s==="ok" ? "" : `${st.t} ${quem}${detalhe?" · "+detalhe:""}`, tel: soDig((papel()==="corretor"&&N.perfil.telefone) || ((c.responsaveis||[]).find(r=>soDig(r.telefone).length>=10)||{}).telefone || c.telefone || (String(c.contato||"").match(/\d[\d\s-]{8,}\d/)||[""])[0]), gradePct:pctGrade(c.grade_comissao), grade:c.grade_comissao||"", _row:c});
  });
  // FUNIL com a base real
  const total = N.corretoras.length, concl = N.corretoras.filter(c=>c.com_quem==="concluido").length;
  FUNIL[0] = {t:"Corretoras na base (inclui declinadas)", v:total, m:total||1};
  FUNIL[1] = {t:"Em vínculo (Viver, corretor ou Hapvida)", v:ativas.length-concl, m:total||1};
  FUNIL[2] = {t:"Vínculo concluído", v:concl, m:total||1};
  // PEDIDOS
  PED = (rp.data||[]).filter(p=>C.some(c=>c.id===p.corretora_id)).map(p=>({id:p.id, tipo:p.tipo, c:p.corretora_id, cat:p.categoria, assunto:p.assunto, obs:p.obs, pack:p.pacote, valor:+p.valor||0,
    data:(d=>String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0"))(new Date(p.criado_em)), st:p.status}));
  // corretor sem corretora vinculada (ou declinada): mostra a área com o nome dele
  if(papel()==="corretor" && !C.some(c=>c.id===N.perfil.corretora_id)){
    C.push({id:-1, tel:soDig(N.perfil.telefone), nome:N.perfil.nome, corr:"Corretora parceira Viver", desde:"—", etapa:0, vidas:0, sem:SEMANAS.map(()=>0), st:"ok", motivo:"", gradePct:null, grade:""});
  }
}
async function recarregar(msgOk){
  try{ await carregar(); if(msgOk) toast(msgOk); render(); }
  catch(e){ toast("Não foi possível atualizar os dados: "+e.message); }
}

/* ───────── SLA: prazo padrão da etapa ou o novo prazo de análise definido na esteira ───────── */
estStatus = function(p){
  const a=estAtual(p), d=diasDesde(a.ini), r=p._row||{};
  if(a.resp==="concluido") return {k:"ok", t:p.hist.length>1?`Concluído em ${diasDesde(p.hist[0].ini,a.ini)} dias`:"Concluído", d, sla:0};
  const prazo = dataMs(r.prazo);
  const sla = prazo!=null ? Math.max(0,Math.round((prazo-a.ini)/DIA)) : (a.pend?SLA_PEND.v:((FLUXOS[p.tipo].etapas[a.etapa]||{}).sla||0));
  const vence = prazo!=null ? prazo : a.ini+sla*DIA;
  const atraso = Math.round((hoje0()-vence)/DIA);
  if(atraso>0) return {k:"crit", t:`Atrasado há ${atraso} dia${atraso>1?"s":""}`, d, sla, prazo};
  if(atraso===0) return {k:"warn", t:"Vence hoje", d, sla, prazo};
  if(a.resp==="hapvida") return {k:"info", t:prazo!=null?`Em análise · prazo ${fmtD(prazo)}`:"Em análise", d, sla, prazo};
  return {k:"ok", t:prazo!=null?`No prazo · até ${fmtD(prazo)}`:"No prazo", d, sla, prazo};
};

/* ───────── pedidos gravados no banco ───────── */
addPed = function(o){
  const tmp = {id:"t"+Date.now(), c:ME, data:today(), st:"aberto", ...o};
  PED.push(tmp);
  sb.from("pedidos").insert({usuario_id:N.uid, corretora_id:ME>0?ME:null, tipo:o.tipo, categoria:o.cat||null, assunto:o.assunto, obs:o.obs||null, pacote:o.pack||null, valor:o.valor||null, status:o.st||"aberto"})
    .select("id").single().then(({data,error})=>{
      if(error){ PED = PED.filter(x=>x!==tmp); toast("O pedido não foi salvo: "+error.message); render(); return; }
      tmp.id = data.id;
    });
};
advance = function(id){
  const p=PED.find(x=>x.id===id); if(!p) return;
  const flow = p.tipo==="leads"?{"aguardando pagamento":"pago","pago":"entregue"}
    : p.tipo==="treinamento"?{"aberto":"agendado","agendado":"concluído"}:{"aberto":"em andamento","em andamento":"concluído"};
  const novo = flow[p.st]; if(!novo) return;
  sb.from("pedidos").update({status:novo, atualizado_em:new Date().toISOString()}).eq("id",id).then(({error})=>{
    if(error) return toast("Não foi possível atualizar o pedido: "+error.message);
    p.st = novo; toast(`Pedido atualizado: ${novo}`); render();
  });
};

/* ───────── ESTEIRA DE VÍNCULOS ───────── */
let estEdit = false;
const GRADES_SUGERIDAS = ["300% + 2%"];
function formNovoCorretor(){
  const grades = [...new Set([...GRADES_SUGERIDAS, ...N.corretoras.map(c=>c.grade_comissao).filter(Boolean)])];
  return `<form class="form" id="fNovoCorr" style="margin-top:14px">
    <div class="nv-grid">
      <label for="nCnpj">CNPJ<input id="nCnpj" inputmode="numeric" placeholder="00.000.000/0001-00" required></label>
      <label for="nRazao">Razão social<input id="nRazao" placeholder="Nome da corretora" required></label>
      <label for="nTemCod">Já possui código Hapvida?<select id="nTemCod"><option value="sim">Sim, vincular o código existente</option><option value="nao">Não, abrir código novo</option></select></label>
      <label for="nCod" id="nCodLbl">Código Hapvida<input id="nCod" placeholder="Ex.: 54WF"></label>
      <label for="nGrade">Grade de comissão escolhida<input id="nGrade" list="nGrades" placeholder="Ex.: 300% + 2%"><datalist id="nGrades">${grades.map(g=>`<option value="${esc(g)}">`).join("")}</datalist></label>
    </div>
    <div class="nv-resp-h"><b>Responsáveis</b><button class="btn sm" type="button" id="nAddResp">+ Adicionar responsável</button></div>
    <div id="nResps"></div>
    <div class="row"><button class="btn pri" type="submit">Adicionar corretor</button><button class="btn" type="button" id="estCancel">Cancelar</button></div>
    <div id="estErr" class="note" style="color:var(--crit)"></div>
  </form>`;
}
const linhaResp = (i,r={})=>`<div class="nv-resp" data-ri="${i}">
  <label>Nome<input data-rf="nome" value="${esc(r.nome||"")}" placeholder="Nome do responsável"></label>
  <label>Telefone<input data-rf="telefone" inputmode="tel" value="${esc(r.telefone||"")}" placeholder="(11) 99999-9999"></label>
  <label>E-mail<input data-rf="email" type="email" value="${esc(r.email||"")}" placeholder="nome@corretora.com.br"></label>
  <button class="btn sm" type="button" data-rmresp="${i}" title="Remover responsável" aria-label="Remover responsável">✕</button></div>`;

function ultimasAtualizacoes(id){
  const itens=[]; let ant=null;
  (N.H[id]||[]).forEach(h=>{
    const hap = h.com_quem==="hapvida", pend = !!(h.pendencia||h.pend);
    const chave = [h.com_quem,h.situacao||"",h.pendencia||"",h.prazo||""].join("|");
    if((hap||pend) && chave!==ant) itens.push({em:h.em, tipo:pend?"pend":"hap", texto: pend?(h.pendencia||"Pendência com o corretor"):(h.situacao||"Em análise na Hapvida"), extra: pend&&hap&&h.situacao?h.situacao:"", prazo:h.prazo, por:h.por});
    ant = chave;
  });
  return itens.reverse();
}
function blocoAtualizacoes(p){
  const its = ultimasAtualizacoes(p.id);
  return `<div class="vc-upd"><div class="vc-upd-h">Últimas atualizações<small>Hapvida e pendências</small></div>
    ${its.length?`<ol>${its.slice(0,6).map(i=>`<li class="${i.tipo}"><div class="vc-upd-l"><span class="vc-upd-tag">${i.tipo==="pend"?"Pendência":"Hapvida"}</span><span class="vc-upd-q num">${quandoFmt(i.em)}</span></div>
      <p>${esc(i.texto)}${i.extra?`<br><small>${esc(i.extra)}</small>`:""}</p>${i.prazo?`<small class="num">Prazo de análise: ${fmtData(i.prazo)}</small>`:""}${i.por&&!/planilha/i.test(i.por)?`<small>por ${esc(String(i.por).replace("@"+DOMINIO_LOGIN,""))}</small>`:""}</li>`).join("")}</ol>${its.length>6?`<small class="vc-upd-mais">+${its.length-6} anteriores no histórico</small>`:""}`
      :`<p class="vc-upd-vazio">Nenhuma movimentação da Hapvida ou pendência registrada ainda.</p>`}</div>`;
}
VIEWS.esteira = function(){
  const lista = EST.filter(p=>estFiltro==="todos"||p.tipo===estFiltro);
  const ativos = lista.filter(p=>estResp(p)!=="concluido");
  const kpi = r=>{ const ps=ativos.filter(p=>estResp(p)===r); const at=ps.filter(p=>estStatus(p).k==="crit").length;
    return `<div class="card kpi"><div class="k"><span class="resp" style="--rc:${RESP[r].c}">Na mão ${r==="viver"?"da Viver":r==="corretor"?"do corretor":"da Hapvida"}</span></div><div class="v num">${ps.length}</div><div class="d">${at?`<span class="chip crit">${at} atrasado${at>1?"s":""}</span>`:`<span class="chip ok">Nenhum atrasado</span>`}</div></div>`; };
  const atrasados = ativos.filter(p=>estStatus(p).k==="crit").length;
  const concl = lista.filter(p=>estResp(p)==="concluido");
  const media = concl.length? Math.round(concl.reduce((a,p)=>a+diasDesde(p.hist[0].ini,estAtual(p).ini),0)/concl.length):0;
  const card = p=>{ const st=estStatus(p), a=estAtual(p), fl=FLUXOS[p.tipo], r=p._row||{};
    const cor={crit:"var(--crit)",warn:"var(--warn)",info:"var(--brand)",ok:"var(--ok)"}[st.k];
    return `<button class="vcard" data-proc="${p.id}" aria-pressed="${estSel===p.id}" style="--sc:${cor}">
      <div class="vc-row"><span class="tipo ${p.tipo==="novo"?"novo":""}">${fl.curto}</span></div>
      <div class="vc-t">${esc(p.corretora)}</div><div class="vc-s num">${esc(p.cnpj)} · ${esc(p.corretor)}</div>
      <div class="steps">${fl.etapas.map((_,i)=>`<i class="${i<=p.etapa?"on":""}"></i>`).join("")}</div>
      <div class="vc-s">${a.pend?`<b style="color:var(--gold)">${esc(a.t)}</b>`:esc(a.t)}</div>
      ${r.pendencia&&!a.pend&&a.resp!=="concluido"?`<div class="vc-s"><b style="color:var(--gold)">Pendência: ${esc(r.pendencia)}</b></div>`:""}
      <div class="vc-row"><span class="chip ${st.k}">${st.t}</span>${a.resp!=="concluido"?`<span class="vc-s num">há ${st.d} dia${st.d!==1?"s":""} · ${st.prazo!=null?"prazo "+fmtD(st.prazo):"SLA "+st.sla+"d"}</span>`:`<span class="vc-s">desde ${fmtD(a.ini)}</span>`}</div>
    </button>`; };
  const ordem = (x,y)=>{ const sx=estStatus(x), sy=estStatus(y); return (sy.d-sy.sla)-(sx.d-sx.sla); };
  const col = (r,titulo)=>{ const ps=lista.filter(p=>estResp(p)===r).sort(r==="concluido"?(x,y)=>estAtual(y).ini-estAtual(x).ini:ordem);
    return `<div class="col"><div class="col-h" style="--rc:${RESP[r].c}"><b>${titulo}</b><span class="num">${ps.length}</span></div>${ps.length?`<div class="col-cards">${ps.map(card).join("")}</div>${ps.length>5?`<div class="col-mais">Role para ver os outros ${ps.length-5} ↓</div>`:""}`:`<div class="col-empty">Nada aqui agora.</div>`}</div>`; };
  const podeSla = ehGestorViver();
  return `
  <div class="grid kpis">
    <div class="card kpi"><div class="k">Em andamento</div><div class="v num">${ativos.length}</div><div class="d">${atrasados?`<span class="chip crit">${atrasados} com SLA atrasado</span>`:`<span class="chip ok">Todos no prazo</span>`}</div></div>
    ${kpi("viver")}${kpi("corretor")}${kpi("hapvida")}
  </div>
  <div class="card" style="margin-top:16px"><div class="est-bar">
    <div class="tabs" id="estFil"><button data-ef="todos" aria-pressed="${estFiltro==="todos"}">Todos</button><button data-ef="existente" aria-pressed="${estFiltro==="existente"}">Vínculo de código existente</button><button data-ef="novo" aria-pressed="${estFiltro==="novo"}">Abertura de código novo</button></div>
    <div class="row"><span class="note num">${concl.length} concluído${concl.length!==1?"s":""} · tempo médio ${media} dias</span><button class="btn pri sm" id="estNovoBtn">+ Novo corretor</button></div>
  </div>
  ${estNovo?formNovoCorretor():""}
  </div>
  <div class="board">${col("viver","Viver")}${col("corretor","Corretor")}${col("hapvida","Hapvida")}${col("concluido","Concluídos")}</div>
  <div id="estDet"></div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h2>SLA por etapa</h2><p>Dias corridos · ${podeSla?"altere e a esteira recalcula na hora (vale para todos)":"definido pela gestão da Viver"}</p></div>
    <div class="grid half">${Object.entries(FLUXOS).map(([k,fl])=>`<div><h3 style="margin-bottom:8px">${fl.nome}</h3><div class="tl">${fl.etapas.map((e,i)=>`<div class="tl-r"><span class="resp" style="--rc:${RESP[e.resp].c}">${RESP[e.resp].t}</span><span>${e.t}</span>${e.resp==="concluido"?"<span></span>":`<input class="sla-in num" type="number" min="0" max="60" id="sla-${k}-${i}" data-sla="${k}|${i}" value="${e.sla}" aria-label="SLA em dias" ${podeSla?"":"disabled"}>`}</div>`).join("")}
      ${k==="novo"?`<div class="tl-r"><span class="resp" style="--rc:${RESP.corretor.c}">Corretor</span><span>Resolver pendência devolvida (qualquer caminho)</span><input class="sla-in num" type="number" min="0" max="60" id="sla-pend" data-sla="pend" value="${SLA_PEND.v}" aria-label="SLA em dias" ${podeSla?"":"disabled"}></div>`:""}</div></div>`).join("")}</div>
  </div>`;
};

// ── janela do corretor na esteira: dados para completar, status, últimas atualizações e histórico ──
let estCad=false, estFoco=null;
function fecharFichaEsteira(){
  estSel=null; estEdit=false; estCad=false;
  const d=$("#estDet"); if(d) d.innerHTML="";
  document.body.classList.remove("ficha-aberta");
  document.querySelectorAll(".vcard[aria-pressed=true]").forEach(b=>b.setAttribute("aria-pressed","false"));
  if(estFoco&&document.body.contains(estFoco)) estFoco.focus(); estFoco=null;
}
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&document.body.classList.contains("ficha-aberta")) fecharFichaEsteira(); });
function fichaEsteira(){
  const p=EST.find(x=>x.id===estSel), box=$("#estDet"); if(!box) return;
  if(!p){ box.innerHTML=""; document.body.classList.remove("ficha-aberta"); return; }
  document.querySelectorAll(".vcard").forEach(b=>b.setAttribute("aria-pressed", String(+b.dataset.proc===estSel)));
  const fl=FLUXOS[p.tipo], a=estAtual(p), st=estStatus(p), tot=estTotais(p), fim=a.resp==="concluido", r=p._row||{};
  const prox=fl.etapas[p.etapa+1];
  const resps=(r.responsaveis||[]);
  const faltam=[!r.cnpj&&"CNPJ", r.tem_codigo!==false&&!r.codigo&&"código Hapvida", !r.grade_comissao&&"grade de comissão", !resps.some(x=>x.nome)&&"responsável", !resps.some(x=>soDig(x.telefone).length>=10)&&"telefone", !resps.some(x=>x.email)&&"e-mail"].filter(Boolean);
  const ficha=[["CNPJ",r.cnpj?fmtCnpj(r.cnpj):""],["Razão social",r.nome],["Código Hapvida",r.codigo||(r.tem_codigo===false?"Abrir código novo":"")],["Grade de comissão",r.grade_comissao||""],["Chamado",r.chamado||""]];
  const opcoesQuem = ["viver","corretor","hapvida","concluido","declinado"].map(k=>`<option value="${k}" ${r.com_quem===k?"selected":""}>${k==="concluido"?(p.tipo==="novo"?"Concluído · código aberto":"Concluído · vínculo finalizado"):COM_QUEM[k]}</option>`).join("");
  const opcoesEtapa = fl.etapas.map((e,i)=>`<option value="${i}" ${i===(r.est_etapa??p.etapa)?"selected":""}>${i+1}. ${esc(e.t)}</option>`).join("");
  const grades=[...new Set([...GRADES_SUGERIDAS, ...N.corretoras.map(c=>c.grade_comissao).filter(Boolean)])];
  box.innerHTML=`<div class="est-modal" id="estModal"><div class="est-box" role="dialog" aria-modal="true" aria-labelledby="estModalT">
    <div class="est-top"><div><span class="tipo ${p.tipo==="novo"?"novo":""}">${fl.curto}</span><h2 id="estModalT">${esc(p.corretora)}</h2><p class="num">${esc(p.cnpj)} · ${esc(p.corretor)} · iniciado em ${fmtD(p.hist[0].ini)}</p></div>
      <div class="est-top-d"><span class="chip ${st.k}">${st.t}</span><button type="button" class="est-x" id="estFechar" aria-label="Fechar">✕</button></div></div>
    <div class="est-cols">
      <div class="est-col">
        <section class="est-sec"><div class="est-sec-h"><h3>Dados do corretor</h3><button class="btn sm" type="button" id="estCadBtn">${faltam.length?"Adicionar dados":"Editar dados"}</button></div>
          ${faltam.length?`<div class="est-falta">Faltam: <b>${faltam.join(", ")}</b></div>`:""}
          <div class="ficha">${ficha.map(([k,v])=>`<div class="${v?"":"vazio"}"><span>${k}</span><b>${v?esc(v):"a adicionar"}</b></div>`).join("")}</div>
          ${resps.length?`<div class="ficha-resp">${resps.map(x=>`<div><b>${esc(x.nome||"Responsável")}</b><span class="num">${[x.telefone?fmtTel(x.telefone):"",x.email||""].filter(Boolean).map(esc).join(" · ")||"sem contato"}</span>${x.telefone&&soDig(x.telefone).length>=10?`<a class="btn sm wa" target="_blank" rel="noopener" href="${wa("55"+soDig(x.telefone))}">WhatsApp</a>`:""}</div>`).join("")}</div>`:""}
          <form class="form" id="fCad" ${estCad?"":"hidden"} style="margin-top:12px">
            <div class="nv-grid">
              <label for="eCnpj">CNPJ<input id="eCnpj" inputmode="numeric" value="${esc(r.cnpj?fmtCnpj(r.cnpj):"")}" placeholder="00.000.000/0001-00"></label>
              <label for="eRazao">Razão social<input id="eRazao" value="${esc(r.nome||"")}"></label>
              <label for="eTemCod">Já possui código Hapvida?<select id="eTemCod"><option value="sim" ${r.tem_codigo!==false?"selected":""}>Sim, vincular o código existente</option><option value="nao" ${r.tem_codigo===false?"selected":""}>Não, abrir código novo</option></select></label>
              <label for="eCod" id="eCodLbl" ${r.tem_codigo===false?"hidden":""}>Código Hapvida<input id="eCod" value="${esc(r.codigo||"")}" placeholder="Ex.: 54WF"></label>
              <label for="eGrade">Grade de comissão escolhida<input id="eGrade" list="eGrades" value="${esc(r.grade_comissao||"")}" placeholder="Ex.: 300% + 2%"><datalist id="eGrades">${grades.map(g=>`<option value="${esc(g)}">`).join("")}</datalist></label>
            </div>
            <div class="nv-resp-h"><b>Responsáveis</b><button class="btn sm" type="button" id="eAddResp">+ Adicionar responsável</button></div>
            <div id="eResps"></div>
            <div class="row"><button class="btn pri" type="submit">Salvar dados</button><button class="btn" type="button" id="eCancel">Cancelar</button></div>
            <div id="eErr" class="note" style="color:var(--crit)"></div>
          </form>
        </section>
        <section class="est-sec"><div class="est-sec-h"><h3>Status na esteira</h3></div>
          <div class="est-status"><span class="resp" style="--rc:${RESP[a.resp].c}">${RESP[a.resp].t}</span><span>${a.pend?`<b style="color:var(--gold)">${esc(a.t)}</b>`:esc(a.t)}</span></div>
          ${r.situacao?`<p class="note" style="margin-top:8px"><b>Situação:</b> ${esc(r.situacao)}</p>`:""}
          ${r.pendencia?`<p class="note" style="margin-top:4px;color:var(--gold)"><b>Pendência:</b> ${esc(r.pendencia)}${r.prazo?` · prazo de análise até ${fmtData(r.prazo)}`:""}</p>`:r.prazo?`<p class="note" style="margin-top:4px"><b>Prazo de análise:</b> até ${fmtData(r.prazo)}</p>`:""}
          <div class="tot" style="margin-top:10px">${["viver","corretor","hapvida"].map(x=>`<div><span class="resp" style="--rc:${RESP[x].c}">${RESP[x].t}</span><b class="num">${tot[x]} dia${tot[x]!==1?"s":""}</b></div>`).join("")}<div><span class="note">Total</span><b class="num">${diasDesde(p.hist[0].ini,fim?a.ini:null)} dias</b></div></div>
          <div class="row" style="margin-top:12px">
            ${fim?"":a.pend?`<button class="btn pri" data-act="resolver">Pendência resolvida: volta para ${RESP[fl.etapas[p.etapa].resp].t}</button>`:prox?`<button class="btn pri" data-act="avancar">Avançar: ${esc(prox.t)}</button>`:""}
            ${fim||a.pend?"":`<button class="btn" data-act="pendForm">Devolver ao corretor com pendência</button>`}
            <button class="btn" data-act="editar">Editar status e pendência</button>
          </div>
          <form class="form" id="fPend" hidden style="margin-top:12px;grid-template-columns:minmax(0,1fr) auto;align-items:end">
            <label for="pMot">Qual é a pendência?<input id="pMot" placeholder="Ex.: comprovante bancário em conta PF"></label>
            <button class="btn pri" type="submit">Registrar pendência</button><div id="pErr" class="note" style="color:var(--crit)"></div></form>
          <form class="form" id="fStatus" ${estEdit?"":"hidden"} style="margin-top:12px">
            <div class="nv-grid">
              <label for="sQuem">Status: com quem está<select id="sQuem">${opcoesQuem}</select></label>
              <label for="sEtapa">Etapa<select id="sEtapa">${opcoesEtapa}</select></label>
              <label for="sPrazo">Novo prazo de análise<input id="sPrazo" type="date" min="${isoHoje()}" value="${r.prazo&&r.prazo>=isoHoje()?r.prazo:""}"></label>
            </div>
            <label for="sPend">Pendência<input id="sPend" value="${esc(r.pendencia||"")}" placeholder="O que falta para seguir (deixe em branco se não houver)"></label>
            <label for="sSit">Situação / observação<input id="sSit" value="${esc(r.situacao||"")}" placeholder="Ex.: LECOM aberto, aguardando operadora"></label>
            <p class="note">Sem novo prazo, vale o SLA padrão da etapa. Se o prazo vencer sem atualização, o processo aparece em atraso para todos.</p>
            <div class="row"><button class="btn pri" type="submit">Salvar status</button><button class="btn" type="button" id="sCancel">Cancelar</button></div>
            <div id="sErr" class="note" style="color:var(--crit)"></div>
          </form>
        </section>
      </div>
      <div class="est-col">
        <section class="est-sec">${blocoAtualizacoes(p)}</section>
        <section class="est-sec"><div class="est-sec-h"><h3>Histórico na esteira</h3></div>
          <div class="tl">${p.hist.map(h=>{const d=diasDesde(h.ini,h.fim);return `<div class="tl-r"><span class="resp" style="--rc:${RESP[h.resp].c}">${RESP[h.resp].t}</span><span>${h.pend?`<b style="color:var(--gold)">${esc(h.t)}</b>`:esc(h.t)}<br><small class="num">${fmtD(h.ini)}${h.fim?` → ${fmtD(h.fim)}`:" → agora"}</small></span><span class="num" style="font-weight:600">${h.resp==="concluido"?"":`${d} dia${d!==1?"s":""}`}</span></div>`}).join("")}</div>
        </section>
      </div>
    </div>
  </div></div>`;
  document.body.classList.add("ficha-aberta");
  const modal=$("#estModal");
  modal.addEventListener("mousedown",e=>{ if(e.target===modal) fecharFichaEsteira(); });
  $("#estFechar").onclick=fecharFichaEsteira;
  if(!estCad && !estEdit) setTimeout(()=>{ const x=$("#estFechar"); if(x) x.focus({preventScroll:true}); },30);
  // dados do corretor
  let resps2=resps.length?resps.map(x=>({...x})):[{}];
  const desenhar=()=>{ $("#eResps").innerHTML=resps2.map((x,i)=>linhaResp(i,x)).join(""); };
  const guardar=()=>{ resps2=[...document.querySelectorAll("#eResps .nv-resp")].map(l=>{ const o={}; l.querySelectorAll("[data-rf]").forEach(i=>o[i.dataset.rf]=i.value); return o; }); };
  desenhar();
  $("#estCadBtn").onclick=()=>{ estCad=true; $("#fCad").hidden=false; $("#eCnpj").focus(); };
  $("#eCancel").onclick=()=>{ estCad=false; $("#fCad").hidden=true; };
  $("#eAddResp").onclick=()=>{ guardar(); resps2.push({}); desenhar(); const ls=document.querySelectorAll("#eResps .nv-resp [data-rf=nome]"); ls[ls.length-1].focus(); };
  $("#eResps").onclick=e=>{ const b=e.target.closest("[data-rmresp]"); if(!b) return; guardar(); resps2.splice(+b.dataset.rmresp,1); if(!resps2.length) resps2=[{}]; desenhar(); };
  $("#eTemCod").onchange=()=>{ $("#eCodLbl").hidden=$("#eTemCod").value!=="sim"; };
  $("#fCad").addEventListener("submit",async e=>{e.preventDefault();
    const err=t=>{$("#eErr").textContent=t;};
    const cnpj=soDig($("#eCnpj").value), razao=$("#eRazao").value.trim(), temCod=$("#eTemCod").value==="sim", cod=$("#eCod").value.trim().toUpperCase(), grade=$("#eGrade").value.trim();
    const rs=lerResponsaveis("#eResps");
    if(cnpj && cnpj.length!==14) return err("O CNPJ precisa ter 14 números.");
    if(!razao) return err("Informe a razão social.");
    if(rs.some(x=>!x.nome)) return err("Informe o nome de cada responsável.");
    if(rs.some(x=>x.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email))) return err("Confira o e-mail dos responsáveis.");
    const dup=cnpj&&N.corretoras.find(c=>c.id!==p.id&&soDig(c.cnpj)===cnpj); if(dup) return err(`Este CNPJ já está na esteira: ${dup.nome}.`);
    const campos={nome:razao, cnpj:cnpj||null, tem_codigo:temCod, codigo:temCod?(cod||null):null, grade_comissao:grade||null,
      responsaveis:rs.map(x=>({nome:x.nome, telefone:x.telefone, email:(x.email||"").toLowerCase()})),
      contato:rs.length?rs.map(x=>[x.nome,x.telefone].filter(Boolean).join(" - ")).join(" / "):r.contato, telefone:(rs.find(x=>x.telefone)||{}).telefone||null, email:(rs.find(x=>x.email)||{}).email||null};
    if(temCod!==(r.tipo!=="novo")) campos.tipo=temCod?"existente":"novo";
    estCad=false;
    await atualizarCorretora(p.id, campos, "Dados do corretor salvos");
  });
  $("#estModal").querySelectorAll("[data-act]").forEach(b=>b.onclick=async()=>{
    const act=b.dataset.act;
    if(act==="pendForm"){ $("#fPend").hidden=false; $("#pMot").focus(); return; }
    if(act==="editar"){ estEdit=true; $("#fStatus").hidden=false; $("#sQuem").focus(); return; }
    b.disabled=true;
    if(act==="avancar"){ const n=p.etapa+1, e=fl.etapas[n];
      await atualizarCorretora(p.id,{est_etapa:n, com_quem:e.resp, est_pend:false, pendencia:null, situacao:e.t}, e.resp==="concluido"?"Vínculo concluído":`Agora com ${RESP[e.resp].t}: ${e.t}`); }
    if(act==="resolver"){ const e=fl.etapas[p.etapa];
      await atualizarCorretora(p.id,{est_pend:false, com_quem:e.resp, pendencia:null}, `Pendência resolvida: volta para ${RESP[e.resp].t}`); }
  });
  const fp=$("#fPend"); fp.addEventListener("submit",async e=>{e.preventDefault(); const m=$("#pMot").value.trim(); if(!m){$("#pErr").textContent="Descreva a pendência para o corretor saber o que resolver.";return}
    await atualizarCorretora(p.id,{est_pend:true, com_quem:"corretor", pendencia:m}, "Pendência registrada: agora com o corretor"); });
  $("#sCancel").onclick=()=>{ estEdit=false; $("#fStatus").hidden=true; };
  $("#sQuem").onchange=()=>{ const q=$("#sQuem").value; if(q==="concluido") $("#sEtapa").value=String(fl.etapas.length-1); else if($("#sEtapa").value===String(fl.etapas.length-1)) $("#sEtapa").value=String(ETAPA_DE[q]||0); };
  $("#sEtapa").onchange=()=>{ const i=+$("#sEtapa").value, resp=fl.etapas[i].resp; if(resp==="concluido") $("#sQuem").value="concluido"; else if($("#sQuem").value==="concluido") $("#sQuem").value=resp; };
  $("#fStatus").addEventListener("submit",async e=>{e.preventDefault();
    const quem=$("#sQuem").value, pend=$("#sPend").value.trim(), prazo=$("#sPrazo").value||null;
    let et=+$("#sEtapa").value; if(quem==="concluido") et=fl.etapas.length-1; else if(et===fl.etapas.length-1) et=Math.max(0,ETAPA_DE[quem]||0);
    if(prazo&&prazo<isoHoje()){ $("#sErr").textContent="O novo prazo não pode ser uma data passada."; return; }
    const campos={com_quem:quem, est_etapa:et, est_pend:quem==="corretor"&&!!pend, pendencia:pend||null, prazo:quem==="concluido"||quem==="declinado"?null:prazo, situacao:$("#sSit").value.trim()||null};
    estEdit=false;
    const ok=await atualizarCorretora(p.id,campos, quem==="declinado"?"Corretora marcada como declinada (sai da esteira)":quem==="concluido"?"Corretor concluído":"Status atualizado");
    if(ok&&quem==="declinado") estSel=null;
  });
}

async function atualizarCorretora(id, campos, msgOk){
  const {error} = await sb.from("corretoras").update(campos).eq("id", id);
  if(error){ toast("Não foi possível salvar: "+error.message); return false; }
  await recarregar(msgOk); return true;
}
function lerResponsaveis(box="#nResps"){
  return [...document.querySelectorAll(box+" .nv-resp")].map(l=>{ const o={}; l.querySelectorAll("[data-rf]").forEach(i=>o[i.dataset.rf]=i.value.trim()); return o; }).filter(r=>r.nome||r.telefone||r.email);
}
AFTER.esteira = function(){
  $("#estFil").addEventListener("click",e=>{const b=e.target.closest("[data-ef]");if(!b)return;estFiltro=b.dataset.ef;render()});
  $("#estNovoBtn").onclick=()=>{estNovo=true;render();$("#nCnpj").focus()};
  if(estNovo){
    let resps=[{}];
    const desenhar=()=>{ $("#nResps").innerHTML=resps.map((r,i)=>linhaResp(i,r)).join(""); };
    const guardar=()=>{ resps=[...document.querySelectorAll("#nResps .nv-resp")].map(l=>{ const o={}; l.querySelectorAll("[data-rf]").forEach(i=>o[i.dataset.rf]=i.value); return o; }); };
    desenhar();
    $("#nAddResp").onclick=()=>{ guardar(); resps.push({}); desenhar(); const ls=document.querySelectorAll("#nResps .nv-resp [data-rf=nome]"); ls[ls.length-1].focus(); };
    $("#nResps").onclick=e=>{ const b=e.target.closest("[data-rmresp]"); if(!b) return; guardar(); resps.splice(+b.dataset.rmresp,1); if(!resps.length) resps=[{}]; desenhar(); };
    const temCod=()=>$("#nTemCod").value==="sim";
    $("#nTemCod").onchange=()=>{ $("#nCodLbl").hidden=!temCod(); };
    $("#estCancel").onclick=()=>{estNovo=false;render()};
    $("#fNovoCorr").addEventListener("submit",async e=>{e.preventDefault();
      const err=t=>{$("#estErr").textContent=t;};
      const cnpj=soDig($("#nCnpj").value), razao=$("#nRazao").value.trim(), cod=$("#nCod").value.trim().toUpperCase(), grade=$("#nGrade").value.trim();
      const rs=lerResponsaveis();
      if(cnpj.length!==14) return err("O CNPJ precisa ter 14 números.");
      if(!razao) return err("Informe a razão social.");
      if(temCod()&&!cod) return err("Informe o código Hapvida (ou escolha \"Não, abrir código novo\").");
      if(!grade) return err("Informe a grade de comissão escolhida.");
      if(!rs.length||!rs[0].nome) return err("Informe pelo menos um responsável com nome.");
      if(rs.some(r=>!r.telefone&&!r.email)) return err("Cada responsável precisa de telefone ou e-mail.");
      if(rs.some(r=>r.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email))) return err("Confira o e-mail dos responsáveis.");
      const dup=N.corretoras.find(c=>soDig(c.cnpj)===cnpj); if(dup) return err(`Este CNPJ já está na esteira: ${dup.nome}.`);
      const btn=e.submitter||$("#fNovoCorr button[type=submit]"); btn.disabled=true; err("");
      const tipo=temCod()?"existente":"novo";
      const {data,error}=await sb.from("corretoras").insert({
        nome:razao, cnpj, tem_codigo:temCod(), tipo, codigo:temCod()?cod:null, grade_comissao:grade,
        responsaveis:rs.map(r=>({nome:r.nome, telefone:r.telefone, email:r.email.toLowerCase()})),
        contato:rs.map(r=>[r.nome,r.telefone].filter(Boolean).join(" - ")).join(" / "), telefone:rs[0].telefone||null, email:(rs.find(r=>r.email)||{}).email||null,
        com_quem:"corretor", est_etapa:0, abertura:isoHoje(), desde:isoHoje(), situacao:FLUXOS[tipo].etapas[0].t, evento:"Cadastro no portal", atualizado_por:USER.email
      }).select("id").single();
      btn.disabled=false;
      if(error) return err("Não foi possível adicionar: "+error.message);
      estNovo=false; estSel=data.id; await recarregar(`${razao} entrou na esteira: aguardando documentos do corretor`);
    });
  }
  $(".board").addEventListener("click",e=>{
    const c=e.target.closest("[data-proc]"); if(!c) return;
    estEdit=false; estCad=false; estSel=+c.dataset.proc; estFoco=c; fichaEsteira();
  });
  // cada coluna mostra no máximo 5 corretores; os demais aparecem rolando a coluna
  document.querySelectorAll(".col-cards").forEach(cx=>{
    const cards=[...cx.querySelectorAll(":scope > .vcard")];
    if(cards.length<=5){ cx.style.maxHeight=""; return; }
    const quinto=cards[4], extra=quinto.nextElementSibling&&quinto.nextElementSibling.classList.contains("vc-upd")?quinto.nextElementSibling:null;
    const fim=(extra||quinto).offsetTop+(extra||quinto).offsetHeight;   // .col-cards é a referência (position:relative)
    cx.style.maxHeight=(fim+2)+"px"; cx.classList.add("rola");
  });
  document.querySelectorAll("[data-sla]").forEach(inp=>inp.addEventListener("change",async()=>{
    if(!ehGestorViver()) return;
    const v=Math.max(0,Math.min(60,parseInt(inp.value,10)||0));
    if(inp.dataset.sla==="pend") SLA_PEND.v=v; else {const [k,i]=inp.dataset.sla.split("|"); FLUXOS[k].etapas[+i].sla=v;}
    const valor={existente:FLUXOS.existente.etapas.map(e=>e.sla), novo:FLUXOS.novo.etapas.map(e=>e.sla), pend:SLA_PEND.v};
    const {error}=await sb.from("config").upsert({chave:"sla", valor, atualizado_em:new Date().toISOString(), atualizado_por:USER.email});
    if(error) toast("SLA não foi salvo: "+error.message); else toast("SLA atualizado para todos");
    render();
  }));
  fichaEsteira();
};

/* ───────── ACESSOS (só gestor Viver) ───────── */
const chipStatus = s=>s==="ativo"?'<span class="chip ok">Ativo</span>':'<span class="chip warn">Pausado</span>';
const acessoDe = u=>u.login||u.email;
function linhaUsuario(u){
  const eu = u.id===N.uid;
  const acoes = eu ? `<span class="note">Seu acesso</span>` : `
    <button class="btn sm" data-ua="${u.status==="ativo"?"pausar":"reativar"}" data-uid="${u.id}">${u.status==="ativo"?"Pausar":"Reativar"}</button>
    <button class="btn sm" data-ua="senhaForm" data-uid="${u.id}">Editar senha</button>
    <button class="btn sm" data-ua="telForm" data-uid="${u.id}">WhatsApp</button>
    <button class="btn sm ${N.acExcluir===u.id?"pri":""}" data-ua="excluir" data-uid="${u.id}" ${N.acExcluir===u.id?'style="background:var(--crit);border-color:var(--crit)"':""}>${N.acExcluir===u.id?"Confirmar exclusão":"Excluir"}</button>`;
  return `<div class="ac-u"><div><b>${esc(u.nome)}</b><small class="num">${esc(acessoDe(u))}${u.telefone?" · WhatsApp "+esc(fmtTel(u.telefone)):""}</small></div>${chipStatus(u.status)}<div class="ac-acoes">${acoes}</div>
    ${N.acSenha===u.id?`<form class="ac-senha" data-senha="${u.id}"><input type="text" minlength="8" placeholder="Nova senha (mín. 8 caracteres)" aria-label="Nova senha" autocomplete="new-password"><button class="btn sm pri" type="submit">Salvar senha</button><button class="btn sm" type="button" data-ua="senhaCancel">Cancelar</button></form>`:""}
    ${N.acTel===u.id?`<form class="ac-senha ac-tel" data-tel="${u.id}"><input type="text" inputmode="tel" value="${esc(fmtTel(u.telefone||""))}" placeholder="WhatsApp com DDD (vai no PDF dos orçamentos)" aria-label="WhatsApp"><button class="btn sm pri" type="submit">Salvar WhatsApp</button><button class="btn sm" type="button" data-ua="telCancel">Cancelar</button></form>`:""}</div>`;
}
function formNovoUsuario(alvo){
  const equipe = alvo==="equipe";
  return `<form class="ac-novo" data-novo="${alvo}">
    <label>Nome<input name="nome" placeholder="Nome e sobrenome" required></label>
    <label>Login (e-mail ou nome.sobrenome)<input name="acesso" placeholder="${equipe?"nome@empresa.com.br ou nome.sobrenome":"nome@corretora.com.br"}" required autocomplete="off"></label>
    <label>Senha<input name="senha" type="text" minlength="8" placeholder="Mín. 8 caracteres" required autocomplete="new-password"></label>
    <label>WhatsApp<input name="telefone" inputmode="tel" placeholder="(11) 99999-9999" autocomplete="off"></label>
    ${equipe?`<label>Perfil<select name="papel"><option value="gestor">Gestor Viver (vê tudo)</option><option value="hapvida">Hapvida (sem Pedidos e Acessos)</option></select></label>`:""}
    <div class="row"><button class="btn pri sm" type="submit">Criar acesso</button><button class="btn sm" type="button" data-ua="novoCancel">Cancelar</button></div>
    <div class="note ac-err" style="color:var(--crit)"></div></form>`;
}
VIEWS.acessos = function(){
  if(!ehGestorViver()) return "";
  if(N.usuarios===null) return `<div class="card"><p class="empty">Carregando acessos…</p></div>`;
  const us=N.usuarios, q=N.acBusca.trim().toLowerCase();
  const corrs=N.corretoras.filter(c=>c.com_quem!=="declinado").filter(c=>!q||c.nome.toLowerCase().includes(q)||us.some(u=>u.corretora_id===c.id&&(u.nome+" "+acessoDe(u)).toLowerCase().includes(q)));
  const equipe=us.filter(u=>u.papel!=="corretor");
  const nCorrUsers=us.filter(u=>u.papel==="corretor").length;
  const res=N.acResult?`<div class="confirm" style="margin-bottom:14px"><div><b>Acesso criado para ${esc(N.acResult.nome)}</b><div class="note num">Login: <b>${esc(N.acResult.acesso)}</b> · Senha: <b>${esc(N.acResult.senha)}</b> · Site: ${esc(location.origin)}</div></div><button class="btn sm" data-ua="copiar">Copiar dados de acesso</button></div>`:"";
  return `${res}
  <div class="grid kpis">
    <div class="card kpi"><div class="k">Corretoras no fluxo</div><div class="v num">${N.corretoras.filter(c=>c.com_quem!=="declinado").length}</div><div class="d">Com acesso: ${new Set(us.filter(u=>u.papel==="corretor").map(u=>u.corretora_id)).size}</div></div>
    <div class="card kpi"><div class="k">Usuários de corretoras</div><div class="v num">${nCorrUsers}</div><div class="d">${us.filter(u=>u.papel==="corretor"&&u.status!=="ativo").length} pausados</div></div>
    <div class="card kpi"><div class="k">Equipe Viver</div><div class="v num">${us.filter(u=>u.papel==="gestor").length}</div><div class="d">Gestores, veem tudo</div></div>
    <div class="card kpi"><div class="k">Equipe Hapvida</div><div class="v num">${us.filter(u=>u.papel==="hapvida").length}</div><div class="d">Sem Pedidos e Acessos</div></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h2>Acessos das corretoras</h2><input type="search" id="acBusca" class="ac-busca" placeholder="Buscar corretora ou usuário" value="${esc(N.acBusca)}" aria-label="Buscar corretora ou usuário"></div>
    <div class="ac-lista">${corrs.map(c=>{ const uc=us.filter(u=>u.corretora_id===c.id);
      return `<div class="ac-c"><div class="ac-c-h"><div><b>${esc(c.nome)}</b><small>${esc(respNome(c))} · ${COM_QUEM[c.com_quem]||c.com_quem}</small></div><button class="btn sm" data-ua="novo" data-cid="${c.id}">+ Adicionar usuário</button></div>
        ${N.acForm===c.id?formNovoUsuario(c.id):""}
        ${uc.length?uc.map(linhaUsuario).join(""):`<p class="note" style="padding:4px 0 2px">Nenhum usuário ainda.</p>`}</div>`; }).join("")||`<p class="empty">Nenhuma corretora encontrada.</p>`}</div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h2>Equipe Viver e Hapvida</h2><button class="btn sm" data-ua="novo" data-cid="equipe">+ Adicionar pessoa</button></div>
    ${N.acForm==="equipe"?formNovoUsuario("equipe"):""}
    ${["gestor","hapvida"].map(pp=>`<h3 style="margin:12px 0 4px">${pp==="gestor"?"Gestores Viver":"Hapvida"}</h3>${equipe.filter(u=>u.papel===pp).map(linhaUsuario).join("")||`<p class="note">Ninguém ainda.</p>`}`).join("")}
  </div>`;
};
async function carregarUsuarios(){
  try{ const d=await chamarUsuarios({acao:"listar"}); N.usuarios=d.itens||[]; }
  catch(e){ N.usuarios=[]; toast(e.message); }
  if(page==="acessos") render();
}
AFTER.acessos = function(){
  if(!ehGestorViver()) return;
  if(N.usuarios===null){ carregarUsuarios(); return; }
  const busca=$("#acBusca"); if(busca){ busca.oninput=()=>{ N.acBusca=busca.value; const pos=busca.selectionStart; render(); const b=$("#acBusca"); b.focus(); try{b.setSelectionRange(pos,pos)}catch(e){} }; }
  $("#view").onclick = async e=>{
    const b=e.target.closest("[data-ua]"); if(!b) return;
    const ua=b.dataset.ua, id=b.dataset.uid;
    if(ua==="novo"){ N.acForm = b.dataset.cid==="equipe"?"equipe":+b.dataset.cid; N.acResult=null; render(); const f=document.querySelector(".ac-novo [name=nome]"); if(f) f.focus(); return; }
    if(ua==="novoCancel"){ N.acForm=null; render(); return; }
    if(ua==="senhaForm"){ N.acSenha=id; render(); const f=document.querySelector(`[data-senha="${id}"] input`); if(f) f.focus(); return; }
    if(ua==="senhaCancel"){ N.acSenha=null; render(); return; }
    if(ua==="telForm"){ N.acTel=id; render(); const f=document.querySelector(`[data-tel="${id}"] input`); if(f) f.focus(); return; }
    if(ua==="telCancel"){ N.acTel=null; render(); return; }
    if(ua==="copiar"){ const r=N.acResult; if(!r) return; const t=`Portal Viver Assessoria\nSite: ${location.origin}\nLogin: ${r.acesso}\nSenha: ${r.senha}`;
      try{ navigator.clipboard.writeText(t).then(()=>toast("Dados de acesso copiados"),()=>toast("Selecione e copie os dados.")); }catch(err){ toast("Selecione e copie os dados."); } return; }
    if(ua==="excluir" && N.acExcluir!==id){ N.acExcluir=id; render(); setTimeout(()=>{ if(N.acExcluir===id){ N.acExcluir=null; if(page==="acessos") render(); } },5000); return; }
    if(["pausar","reativar","excluir"].includes(ua)){
      b.disabled=true;
      try{ await chamarUsuarios({acao:ua, id}); N.acExcluir=null; toast(ua==="pausar"?"Acesso pausado: o usuário não consegue mais entrar":ua==="reativar"?"Acesso reativado":"Usuário excluído do portal"); }
      catch(err){ toast(err.message); }
      await carregarUsuarios();
    }
  };
  document.querySelectorAll("form.ac-tel").forEach(f=>f.addEventListener("submit",async e=>{e.preventDefault(); e.stopImmediatePropagation();
    const t=soDig(f.querySelector("input").value); if(t && t.length<10) return toast("Digite o WhatsApp com DDD.");
    try{ await chamarUsuarios({acao:"telefone", id:f.dataset.tel, telefone:t}); N.acTel=null; toast("WhatsApp salvo"); await carregarUsuarios(); }catch(err){ toast(err.message); }
  }));
  document.querySelectorAll("form.ac-senha:not(.ac-tel)").forEach(f=>f.addEventListener("submit",async e=>{e.preventDefault();
    const s=f.querySelector("input").value; if(s.length<8) return toast("A senha precisa ter pelo menos 8 caracteres.");
    try{ await chamarUsuarios({acao:"senha", id:f.dataset.senha, senha:s}); N.acSenha=null; toast("Senha alterada"); render(); }catch(err){ toast(err.message); }
  }));
  document.querySelectorAll("form.ac-novo").forEach(f=>f.addEventListener("submit",async e=>{e.preventDefault();
    const v=n=>(f.elements[n]?f.elements[n].value:"").trim(), errEl=f.querySelector(".ac-err");
    const alvo=f.dataset.novo, equipe=alvo==="equipe";
    if(v("nome").length<2) return errEl.textContent="Informe o nome.";
    if(!v("acesso")) return errEl.textContent="Informe o e-mail ou o usuário (nome.sobrenome).";
    if(v("senha").length<8) return errEl.textContent="A senha precisa ter pelo menos 8 caracteres.";
    const btn=f.querySelector("[type=submit]"); btn.disabled=true; errEl.textContent="";
    try{
      const d=await chamarUsuarios({acao:"criar", nome:v("nome"), email:v("acesso"), senha:v("senha"), telefone:soDig(v("telefone")), papel:equipe?v("papel"):"corretor", corretora_id:equipe?null:+alvo});
      N.acResult={nome:v("nome"), acesso:d.acesso, senha:d.senha}; N.acForm=null;
      toast("Acesso criado"); await carregarUsuarios(); window.scrollTo({top:0,behavior:"smooth"});
    }catch(err){ btn.disabled=false; errEl.textContent=err.message; }
  }));
};

/* ───────── "+1 corretor concluído" com confetes ───────── */
function confetes(){
  if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv=document.createElement("canvas"); cv.className="confete"; document.body.appendChild(cv);
  const ctx=cv.getContext("2d"), dpr=window.devicePixelRatio||1;
  const tam=()=>{ cv.width=innerWidth*dpr; cv.height=innerHeight*dpr; }; tam();
  const cs=getComputedStyle(document.documentElement), cor=v=>cs.getPropertyValue(v).trim();
  const cores=[cor("--brand")||"#3aa0e0", cor("--gold")||"#e8b04a", cor("--ok")||"#2bb673", cor("--navy")||"#123a6b", "#ffffff", "#ff7a9a"];
  const ps=Array.from({length:180},()=>({x:Math.random()*cv.width, y:-Math.random()*cv.height*0.6, w:(6+Math.random()*6)*dpr, h:(8+Math.random()*10)*dpr,
    vx:(Math.random()-.5)*3*dpr, vy:(2+Math.random()*3.5)*dpr, r:Math.random()*Math.PI, vr:(Math.random()-.5)*.25, c:cores[Math.floor(Math.random()*cores.length)]}));
  const t0=performance.now();
  (function quadro(t){
    const dt=t-t0; ctx.clearRect(0,0,cv.width,cv.height);
    ps.forEach(p=>{ p.x+=p.vx+Math.sin((t/400)+p.r)*.6*dpr; p.y+=p.vy; p.r+=p.vr; ctx.save(); ctx.globalAlpha=dt>3200?Math.max(0,1-(dt-3200)/800):1; ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.fillStyle=p.c; ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h); ctx.restore(); });
    if(dt<4000) requestAnimationFrame(quadro); else cv.remove();
  })(t0);
}
function mostrarNotificacao(n){
  N.notifFila.push(n); if(N.notifFila.length>1) return;
  const proxima=()=>{
    const atual=N.notifFila[0]; if(!atual) return;
    const el=document.createElement("div"); el.className="festa"; el.setAttribute("role","status");
    el.innerHTML=`<div class="festa-i">🎉</div><div><b>${esc(atual.titulo)}</b><span>${esc(atual.corpo||"")}</span></div><button type="button" aria-label="Fechar">✕</button>`;
    document.body.appendChild(el); confetes();
    const fechar=()=>{ if(!el.isConnected) return; el.classList.add("sai"); setTimeout(()=>{ el.remove(); N.notifFila.shift(); proxima(); },250); };
    el.querySelector("button").onclick=fechar; setTimeout(fechar,7000);
    sb.from("notificacoes_lidas").insert({notificacao_id:atual.id, usuario_id:N.uid}).then(()=>{});
  };
  proxima();
}
async function verNotificacoes(){
  if(!ehEquipe()) return;
  const [rn, rl] = await Promise.all([
    sb.from("notificacoes").select("*").gte("criado_em", N.perfil.criado_em).order("criado_em").limit(30),
    sb.from("notificacoes_lidas").select("notificacao_id"),
  ]);
  if(rn.error||rl.error) return;
  const lidas=new Set((rl.data||[]).map(x=>x.notificacao_id));
  (rn.data||[]).filter(n=>!lidas.has(n.id)).forEach(mostrarNotificacao);
}
function ouvirNotificacoes(){
  if(!ehEquipe()||N.canal) return;
  N.canal = sb.channel("viver-notificacoes")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"notificacoes"},ev=>{ const n=ev.new; if(!n) return; mostrarNotificacao(n);
      const a=document.activeElement; if(!(a&&a.closest&&a.closest("form"))) recarregar(); })
    .subscribe();
}

/* ───────── Carol (IA pelo Supabase) e PDF dos orçamentos ───────── */
window.viverCarolIA = async function(turns){
  const r = await sb.functions.invoke("carol",{body:{mensagens:turns}});
  if(r.error){ let m="A Carol não conseguiu responder agora."; try{ const j=await r.error.context.json(); if(j&&j.erro) m=j.erro; }catch(e){} throw new Error(m); }
  if(!r.data||!r.data.resposta) throw new Error("A Carol não conseguiu responder agora.");
  return r.data.resposta;
};
window.viverSalvarPDF = async function(blob, nome){
  if(!N.uid) return null;
  const caminho = N.uid + "/" + Date.now() + "-" + String(nome||"cotacao.pdf").replace(/[^A-Za-z0-9._-]+/g,"-");
  const up = await sb.storage.from("orcamentos").upload(caminho, blob, {contentType:"application/pdf", upsert:false});
  if(up.error) return null;
  const s = await sb.storage.from("orcamentos").createSignedUrl(caminho, 60*24*3600);   // link vale 60 dias
  return s.error ? null : s.data.signedUrl;
};

/* ───────── LOGIN ───────── */
function loginParaEmail(t){
  t=String(t||"").trim().toLowerCase();
  if(t.includes("@")) return t;
  return t.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g,".").replace(/[^a-z0-9._-]/g,"")+"@"+DOMINIO_LOGIN;
}
async function entrarNuvem(user, avisar){
  const {data:pf, error} = await sb.from("perfis").select("*").eq("id",user.id).maybeSingle();
  if(error||!pf){ await sb.auth.signOut(); msg("Este login não tem perfil no portal. Fale com a Viver.",true); return; }
  if(pf.status!=="ativo"){ await sb.auth.signOut(); msg("Seu acesso está pausado. Fale com a Viver.",true); return; }
  N.perfil=pf; N.uid=user.id; N.usuarios=null; N.acResult=null;
  USER={email:pf.email, perfil:pf.papel==="corretor"?"corretor":"gestor", papel:pf.papel, nome:pf.nome, tel:soDig(pf.telefone)||WHATS_VIVER};
  montarMenu();
  try{ await carregar(); }catch(e){ msg("Não foi possível carregar os dados: "+e.message,true); await sb.auth.signOut(); return; }
  ME = pf.papel==="corretor" ? (C.some(c=>c.id===pf.corretora_id)?pf.corretora_id:-1) : ((C.find(c=>c._row&&c._row.com_quem==="concluido")||C[0]||{id:-1}).id);
  role=USER.perfil; page=role==="gestor"?"visao":"inicio";
  $("#login").hidden=true; $("#app").hidden=false; render();
  if(avisar){
    if(pf.papel==="corretor"&&loginTipo==="gestor") toast("Este login não tem acesso de gestor. Abrimos a área do corretor.");
    else toast(pf.papel==="gestor"?"Bem-vindo, gestor. Você vê as visões Gestor e Corretor.":pf.papel==="hapvida"?`Bem-vindo(a), ${pf.nome.split(" ")[0]}.`:"Bem-vindo à sua área de corretor.");
  }
  verNotificacoes(); ouvirNotificacoes();
}
$("#lEmail").type="text"; $("#lEmail").setAttribute("autocapitalize","none"); $("#lEmail").placeholder="E-mail ou usuário";
document.querySelector('label[for="lEmail"]').firstChild.textContent="E-mail ou usuário";
document.querySelector("#fLogin .sub").textContent="Entre com o login e a senha cadastrados na Viver.";
document.querySelector(".lg-tabs").addEventListener("click",()=>{ $("#lEmail").placeholder="E-mail ou usuário"; });
$("#lEsq").onclick=()=>msg("Peça a um gestor da Viver para redefinir sua senha (menu Acessos). Pelo WhatsApp: Suporte Administrativo.");
$("#fLogin").addEventListener("submit",async e=>{e.preventDefault();
  const login=$("#lEmail").value.trim(), pw=$("#lSenha").value;
  if(!login) return msg("Digite seu e-mail ou usuário.",true);
  if(!pw) return msg("Digite sua senha.",true);
  try{ localStorage.setItem("viverLembrar",$("#lLembrar").checked?"1":"0"); }catch(err){}
  const btn=$("#fLogin button[type=submit]"); btn.disabled=true; msg("Entrando…");
  const {data,error}=await sb.auth.signInWithPassword({email:loginParaEmail(login), password:pw});
  btn.disabled=false;
  if(error){ return msg(/banned/i.test(error.message)?"Seu acesso está pausado. Fale com a Viver.":/invalid/i.test(error.message)?"Login ou senha incorretos.":"Não foi possível entrar: "+error.message,true); }
  $("#lMsg").hidden=true;
  await entrarNuvem(data.user,true);
});
function sairNuvem(){
  if(CR.ctl) CR.ctl.abort(); CR.conversa=[]; CR.carregou="";
  if(N.canal){ try{ sb.removeChannel(N.canal); }catch(e){} N.canal=null; }
  N.perfil=null; N.uid=null; N.usuarios=null; N.acResult=null; USER=null; window.VIVER_GESTOR=false;
  C.length=0; EST=[]; PED=[]; estSel=null; estNovo=false;
  descarregarFinanceiro(); $("#app").hidden=true; $("#login").hidden=false; $("#fab").hidden=true; closeSide(); $("#lSenha").value=""; $("#lMsg").hidden=true;
}
$("#logout").onclick=async()=>{ try{ await sb.auth.signOut(); }catch(e){} sairNuvem(); };
sb.auth.onAuthStateChange((ev)=>{ if(ev==="SIGNED_OUT" && USER) sairNuvem(); });
// atualiza os dados quando a pessoa volta para a aba (sem atrapalhar quem está preenchendo um formulário)
document.addEventListener("visibilitychange",()=>{
  if(document.hidden||!USER||Date.now()-N.carregadoEm<60e3) return;
  const ativo=document.activeElement; if(ativo&&ativo.closest&&ativo.closest("form")) return;
  recarregar();
});
sb.auth.getSession().then(({data})=>{ if(data&&data.session) entrarNuvem(data.session.user,false); });
// versão nova publicada: recarrega sozinho (quando ninguém está preenchendo algo), para ninguém ficar com o portal antigo aberto
async function checarVersao(){
  try{
    const r=await fetch("version.json?t="+Date.now(),{cache:"no-store"}); if(!r.ok) return;
    const v=(await r.json()).v; if(!v||!window.VIVER_VERSAO||v===window.VIVER_VERSAO) return;
    const ativo=document.activeElement, ocupado=(ativo&&ativo.closest&&ativo.closest("form"))||document.body.classList.contains("ficha-aberta")||(typeof CR!=="undefined"&&CR.ocupado);
    if(ocupado){ toast("Há uma versão nova do portal. Ela abre quando você terminar o que está fazendo."); return; }
    location.reload();
  }catch(e){}
}
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) checarVersao(); });
setInterval(checarVersao, 3*60e3);
