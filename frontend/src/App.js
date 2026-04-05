import React, { useEffect, useState, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
    body { font-family: 'Inter', sans-serif; margin: 0; background-color: #f8fafc; color: #1e293b; }
    button { transition: all 0.2s ease; cursor: pointer; border: none; }
    button:hover { opacity: 0.85; transform: translateY(-1px); }
    input:focus { border-color: #2563eb !important; outline: none; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
    .table-row:hover { background-color: #f1f5f9; }
    select { cursor: pointer; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px; font-size: 11px; outline: none; }
    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  `}</style>
);

export default function App() {
  const [session, setSession] = useState(localStorage.getItem("token"));
  const [activeTab, setActiveTab] = useState("financeiro");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [mensalidades, setMensalidades] = useState([]);
  const [busca, setBusca] = useState("");
  const [stats, setStats] = useState({ faturamento: 0, pendente: 0, lucro: 0, custoTotal: 0, totalClientes: 0 });
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({ nome: "", cidade: "", telefone: "", cnpj: "", dia_vencimento: "", valor: "", custo: "", observacao: "" });

  const API = process.env.REACT_APP_API_URL || "http://localhost:3001";

  const maskCNPJ = (v) => v.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5").substring(0, 18);
  const maskPhone = (v) => v.replace(/\D/g, "").replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3").substring(0, 15);

  const fetchProtegido = useCallback(async (url, options = {}) => {
    try {
        const res = await fetch(url, { 
          ...options, 
          headers: { ...options.headers, "Authorization": `Bearer ${session}`, "Content-Type": "application/json" } 
        });
        if (res.status === 401) { localStorage.removeItem("token"); setSession(null); return null; }
        return res;
    } catch (e) { return null; }
  }, [session]);

  const carregarDados = useCallback(async () => {
    if (!session) return;
    try {
      const resC = await fetchProtegido(`${API}/clientes`);
      const resM = await fetchProtegido(`${API}/mensalidades`);
      if (resC && resM) {
        const cData = await resC.json();
        const mData = await resM.json();
        setClientes(Array.isArray(cData) ? cData : []);
        setMensalidades(Array.isArray(mData) ? mData : []);
      }
    } catch (e) { console.error(e); }
  }, [session, fetchProtegido]);

  useEffect(() => { if (session) carregarDados(); }, [session, carregarDados]);

  // Busca Automática de CNPJ
  useEffect(() => {
    const cnpjLimpo = form.cnpj.replace(/\D/g, "");
    if (cnpjLimpo.length === 14 && !editandoId) {
        fetch(`${API}/buscar-cnpj/${cnpjLimpo}`)
            .then(res => res.json())
            .then(data => {
                if (data.nome) setForm(prev => ({ ...prev, nome: data.nome, cidade: data.cidade }));
            }).catch(() => {});
    }
  }, [form.cnpj, editandoId]);

  // Cálculo de Estatísticas
  useEffect(() => {
    const resumo = mensalidades.reduce((acc, m) => {
      const v = parseFloat(m.valor) || 0;
      const c = m.clientes?.custo || 0;
      const st = String(m.status || "").toUpperCase();
      if (["PAGO", "PERMUTA", "ANTECIPADO"].includes(st)) {
        acc.faturamento += v; acc.lucro += (v - c); acc.custoTotal += c;
      } else { acc.pendente += v; }
      return acc;
    }, { faturamento: 0, pendente: 0, lucro: 0, custoTotal: 0 });
    setStats({ ...resumo, totalClientes: clientes.length });
  }, [mensalidades, clientes]);

  const salvarCliente = async () => {
    const method = editandoId ? "PUT" : "POST";
    const url = editandoId ? `${API}/clientes/${editandoId}` : `${API}/clientes`;
    const res = await fetchProtegido(url, { method, body: JSON.stringify(form) });
    if (res && res.ok) { 
        setEditandoId(null); 
        setMostrarForm(false); 
        setForm({ nome: "", cidade: "", telefone: "", cnpj: "", dia_vencimento: "", valor: "", custo: "", observacao: "" }); 
        carregarDados(); 
    }
  };

  const prepararEdicao = (c) => {
    setEditandoId(c.id);
    setForm({ nome: c.nome, cidade: c.cidade, dia_vencimento: c.dia_vencimento, valor: c.valor, custo: c.custo, observacao: c.observacao || "", telefone: maskPhone(c.telefone || ""), cnpj: maskCNPJ(c.cnpj || "") });
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pagar = async (id, tipo = "PAGO") => {
    await fetchProtegido(`${API}/mensalidades/${id}/pagar`, { method: "PUT", body: JSON.stringify({ tipo }) });
    carregarDados();
  };

  const estornar = async (id) => {
    if (window.confirm("Deseja estornar esse pagamento?")) {
      await fetchProtegido(`${API}/mensalidades/${id}/estornar`, { method: "PUT" });
      carregarDados();
    }
  };

  const cobrarWhatsApp = (m) => {
    const tel = m.clientes?.telefone || "";
    const msg = `Olá ${m.cliente_nome}, a mensalidade de ${m.mes}/${m.ano} está em aberto. MegaSoft Tecnologia!`;
    window.open(`https://wa.me/55${tel.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // Dados dos Gráficos
  const dataPizza = [{ name: 'Lucro', value: stats.lucro }, { name: 'Custo', value: stats.custoTotal }];
  const COLORS = ['#10b981', '#f43f5e'];
  
  const projecaoData = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() + i);
    const receita = clientes.reduce((acc, c) => acc + (parseFloat(c.valor) || 0), 0);
    const custo = clientes.reduce((acc, c) => acc + (parseFloat(c.custo) || 0), 0);
    return { mes: d.toLocaleString('pt-BR', { month: 'short' }).toUpperCase(), Receita: receita, Lucro: receita - custo };
  });

  if (!session) return (
    <div style={styles.loginPage}>
      <GlobalStyle />
      <div style={styles.loginCard}>
        <h1 style={{ color: '#2563eb' }}>AlugPay</h1>
        <input style={styles.input} type="email" placeholder="E-mail" onChange={e => setEmail(e.target.value)} />
        <input style={styles.input} type="password" placeholder="Senha" onChange={e => setPassword(e.target.value)} />
        <button style={styles.btnPrimary} onClick={async () => {
          const res = await fetch(`${API}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
          const data = await res.json();
          if (res.ok) { localStorage.setItem("token", data.session.access_token); setSession(data.session.access_token); }
        }}>Entrar</button>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <GlobalStyle />
      <header style={styles.topBar}>
        <div style={styles.brand}><div style={styles.logoCircle}>M</div><h2>AlugPay</h2></div>
        <nav style={styles.navLinks}>
          <button style={activeTab === "financeiro" ? styles.navBtnActive : styles.navBtn} onClick={() => setActiveTab("financeiro")}>Financeiro</button>
          <button style={activeTab === "clientes" ? styles.navBtnActive : styles.navBtn} onClick={() => setActiveTab("clientes")}>Clientes</button>
          <button style={activeTab === "relatorios" ? styles.navBtnActive : styles.navBtn} onClick={() => setActiveTab("relatorios")}>Relatórios</button>
        </nav>
        <button style={styles.btnLogout} onClick={() => { localStorage.removeItem("token"); setSession(null); }}>Sair</button>
      </header>

      <main style={styles.mainContent}>
        <div style={styles.dashboardGridStats}>
          <div style={styles.statCard}><small>CLIENTES</small><h3>{stats.totalClientes}</h3></div>
          <div style={styles.statCard}><small>LUCRO REAL</small><h3 style={{color:'#10b981'}}>R$ {stats.lucro.toFixed(2)}</h3></div>
          <div style={styles.statCard}><small>A RECEBER</small><h3 style={{color:'#f43f5e'}}>R$ {stats.pendente.toFixed(2)}</h3></div>
        </div>

        {activeTab !== "relatorios" && (
            <div style={{marginBottom: 20, display:'flex', justifyContent:'flex-end'}}>
                <button onClick={() => { setMostrarForm(!mostrarForm); if(mostrarForm) setEditandoId(null); }} 
                style={{...styles.btnAction, background: mostrarForm ? '#f1f5f9' : '#2563eb', color: mostrarForm ? '#1e293b' : '#fff'}}>
                    {mostrarForm ? "✖ Cancelar" : "➕ Novo Cliente"}
                </button>
            </div>
        )}

        {mostrarForm && (
            <section style={{...styles.card, border: '2px solid #2563eb'}} className="fade-in">
                <h3>{editandoId ? "📝 Editar Cliente" : "✨ Novo Cadastro"}</h3>
                <div style={styles.gridForm}>
                    <input style={styles.input} placeholder="CNPJ" value={form.cnpj} onChange={e => setForm({...form, cnpj: maskCNPJ(e.target.value)})} />
                    <input style={styles.input} placeholder="Nome" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} />
                    <input style={styles.input} type="number" placeholder="Valor" value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} />
                    <input style={styles.input} type="number" placeholder="Custo" value={form.custo} onChange={e => setForm({...form, custo: e.target.value})} />
                    <input style={styles.input} placeholder="WhatsApp" value={form.telefone} onChange={e => setForm({...form, telefone: maskPhone(e.target.value)})} />
                    <input style={styles.input} type="number" placeholder="Vencimento" value={form.dia_vencimento} onChange={e => setForm({...form, dia_vencimento: e.target.value})} />
                </div>
                <button style={styles.btnPrimary} onClick={salvarCliente}>{editandoId ? "Salvar" : "Cadastrar"}</button>
            </section>
        )}

        {activeTab === "relatorios" ? (
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(350px, 1fr))', gap:20}} className="fade-in">
            <div style={styles.card}>
                <h4>Composição Financeira</h4>
                <div style={{height:300}}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dataPizza} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">{dataPizza.map((e,i)=><Cell key={i} fill={COLORS[i]}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></div>
            </div>
            <div style={styles.card}>
                <h4>Projeção 6 Meses</h4>
                <div style={{height:300}}><ResponsiveContainer width="100%" height="100%"><BarChart data={projecaoData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="mes"/><YAxis/><Tooltip/><Legend/><Bar dataKey="Receita" fill="#3b82f6"/><Bar dataKey="Lucro" fill="#10b981"/></BarChart></ResponsiveContainer></div>
            </div>
          </div>
        ) : activeTab === "financeiro" ? (
          <section style={styles.card} className="fade-in">
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:15, alignItems:'center'}}>
                <h3 style={{margin:0}}>Mensalidades</h3>
                <button onClick={() => fetchProtegido(`${API}/gerar-mensalidades`).then(()=>carregarDados())} style={styles.btnAction}>🔄 Gerar Mês</button>
            </div>
            <input style={styles.inputSearch} placeholder="🔍 Buscar cliente..." onChange={e => setBusca(e.target.value)} />
            <table style={styles.table}>
                <thead><tr><th align="left">Cliente</th><th align="center">Mês</th><th>Status</th><th align="right">Ação</th></tr></thead>
                <tbody>
                {mensalidades.filter(m => m.cliente_nome?.toLowerCase().includes(busca.toLowerCase())).map(m => {
                    const statusU = m.status?.toUpperCase();
                    const pago = ["PAGO", "PERMUTA", "ANTECIPADO"].includes(statusU);
                    return (
                    <tr key={m.id} className="table-row" style={{borderBottom:'1px solid #f1f5f9', height:55}}>
                        <td>{m.cliente_nome}</td>
                        <td align="center" style={{fontSize:12}}>{m.mes}/{m.ano}</td>
                        <td align="center"><span style={{...styles.badge, background: pago ? (statusU === 'PERMUTA' ? '#e0f2fe':'#dcfce7') : '#fee2e2'}}>{m.status}</span></td>
                        <td align="right">
                        {pago ? <button style={styles.btnDanger} onClick={()=>estornar(m.id)}>Estornar</button> : 
                        <div style={{display:'flex', gap:5, justifyContent:'flex-end', alignItems:'center'}}>
                            <button style={styles.btnSuccess} onClick={()=>pagar(m.id, "PAGO")}>Pagar</button>
                            <select onChange={(e) => pagar(m.id, e.target.value)} defaultValue="">
                                <option value="" disabled>+</option>
                                <option value="PERMUTA">Permuta</option>
                                <option value="ANTECIPADO">Antecipado</option>
                            </select>
                            <button style={styles.btnZap} onClick={()=>cobrarWhatsApp(m)}>💬</button>
                        </div>}
                        </td>
                    </tr>
                )})}
                </tbody>
            </table>
          </section>
        ) : (
          <section style={styles.card} className="fade-in">
            <h3>Clientes Ativos</h3>
            <table style={styles.table}>
                <thead><tr><th align="left">Nome</th><th align="right">Mensalidade</th><th align="right">Ações</th></tr></thead>
                <tbody>
                {clientes.map(c => (
                    <tr key={c.id} className="table-row" style={{borderBottom:'1px solid #f1f5f9', height:50}}>
                        <td><strong>{c.nome}</strong></td>
                        <td align="right">R$ {parseFloat(c.valor).toFixed(2)}</td>
                        <td align="right">
                            <button style={styles.btnEdit} onClick={()=>prepararEdicao(c)}>Editar</button>
                            <button style={styles.btnDelete} onClick={() => { if(window.confirm("Excluir?")) fetchProtegido(`${API}/clientes/${c.id}`,{method:'DELETE'}).then(()=>carregarDados()) }}>Excluir</button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: '#f8fafc' },
  topBar: { display:'flex', justifyContent:'space-between', padding:'0 40px', height:'70px', background:'#fff', alignItems:'center', borderBottom:'1px solid #e2e8f0', position:'sticky', top:0, zIndex:10 },
  brand: { display:'flex', alignItems:'center', gap:'10px' },
  logoCircle: { width:32, height:32, borderRadius:8, background:'#2563eb', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold' },
  navLinks: { display:'flex', gap:10 },
  navBtn: { border:'none', background:'none', padding:'8px 15px', color:'#64748b', fontWeight:600, borderRadius:8 },
  navBtnActive: { border:'none', background:'#eff6ff', padding:'8px 15px', color:'#2563eb', fontWeight:600, borderRadius:8 },
  btnLogout: { border:'1px solid #fee2e2', background:'#fff', color:'#f43f5e', padding:'8px 16px', borderRadius:8 },
  mainContent: { maxWidth:1100, margin:'30px auto', padding:'0 20px' },
  dashboardGridStats: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:20, marginBottom:30 },
  statCard: { background:'#fff', padding:20, borderRadius:15, border:'1px solid #e2e8f0' },
  card: { background:'#fff', padding:25, borderRadius:20, border:'1px solid #e2e8f0', marginBottom:20 },
  gridForm: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:15, marginBottom:20 },
  input: { padding:12, borderRadius:10, border:'1px solid #cbd5e1', width:'100%', boxSizing:'border-box' },
  btnPrimary: { width:'100%', padding:12, background:'#2563eb', color:'#fff', borderRadius:10, fontWeight:700 },
  table: { width:'100%', borderCollapse:'collapse' },
  badge: { padding:'4px 10px', borderRadius:20, fontSize:10, fontWeight:700, textTransform:'uppercase' },
  inputSearch: { width:'100%', padding:12, borderRadius:10, border:'1px solid #e2e8f0', marginBottom:20 },
  btnSuccess: { background:'#10b981', color:'#fff', padding:'6px 12px', borderRadius:6, fontSize:11 },
  btnDanger: { background:'#fff', border:'1px solid #fee2e2', color:'#f43f5e', padding:'6px 12px', borderRadius:6, fontSize:11 },
  btnZap: { background:'#22c55e', color:'#fff', padding:'5px 8px', borderRadius:6 },
  btnEdit: { background:'#f1f5f9', padding:'8px 12px', borderRadius:6, marginRight:5, fontSize:11 },
  btnDelete: { background:'#fff', border:'1px solid #fee2e2', color:'#f43f5e', padding:'8px 12px', borderRadius:6, fontSize:11 },
  btnAction: { border:'1px solid #cbd5e1', padding:'8px 16px', borderRadius:8, fontSize:12, fontWeight:600 },
  loginPage: { height:'100vh', display:'flex', alignItems:'center', justifyContent:'center' },
  loginCard: { background:'#fff', padding:40, borderRadius:25, width:300, textAlign:'center', boxShadow:'0 10px 25px rgba(0,0,0,0.05)' }
};