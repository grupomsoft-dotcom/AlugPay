const express = require('express');
const cors = require('cors');
const axios = require('axios');
const supabase = require('./supabase');

const app = express();
app.use(cors());
app.use(express.json());

// --- AJUSTE PARA O RAILWAY ---
// O Railway injeta a porta automaticamente na variável process.env.PORT
const PORT = process.env.PORT || 3001;

const autenticar = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    
    req.user = user;
    next();
};

/* --- ROTAS PÚBLICAS --- */

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(400).json({ erro: 'E-mail ou senha incorretos.' });
    res.json(data);
});

app.get('/buscar-cnpj/:cnpj', async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '');
        const response = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        res.json({ 
            nome: response.data.razao_social, 
            cidade: response.data.municipio, 
            telefone: response.data.ddd_telefone_1 || '' 
        });
    } catch (err) { 
        res.status(400).json({ erro: 'CNPJ não encontrado ou erro na API externa.' }); 
    }
});

/* --- ROTAS PROTEGIDAS --- */
app.use(autenticar);

app.get('/clientes', async (req, res) => {
    const { data, error } = await supabase.from('clientes').select('*').order('nome', { ascending: true });
    if (error) return res.status(400).json({ erro: error.message });
    res.json(data || []);
});

app.post('/clientes', async (req, res) => {
    const { nome, cidade, telefone, cnpj, dia_vencimento, valor, custo, observacao } = req.body;
    const { data, error } = await supabase.from('clientes').insert([{ 
        nome, cidade, telefone: telefone.replace(/\D/g, ''), 
        cnpj: cnpj.replace(/\D/g, ''), dia_vencimento: parseInt(dia_vencimento), 
        valor: parseFloat(valor), custo: parseFloat(custo || 0), observacao, ativo: true 
    }]).select();
    if (error) return res.status(400).json({ erro: error.message });
    res.json(data);
});

app.put('/clientes/:id', async (req, res) => {
    const { nome, cidade, telefone, cnpj, dia_vencimento, valor, custo, observacao } = req.body;
    const { data, error } = await supabase.from('clientes').update({ 
        nome, cidade, telefone: telefone.replace(/\D/g, ''), 
        cnpj: cnpj.replace(/\D/g, ''), dia_vencimento: parseInt(dia_vencimento), 
        valor: parseFloat(valor), custo: parseFloat(custo || 0), observacao 
    }).eq('id', req.params.id).select();
    if (error) return res.status(400).json({ erro: error.message });
    res.json(data);
});

app.delete('/clientes/:id', async (req, res) => {
    const { error } = await supabase.from('clientes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ erro: error.message });
    res.json({ ok: true });
});

app.get('/mensalidades', async (req, res) => {
    const { data, error } = await supabase.from('view_mensalidades_com_cliente').select('*, clientes(*)').order('ano', { ascending: false }).order('mes', { ascending: false });
    if (error) return res.status(400).json({ erro: error.message });
    res.json(data || []);
});

app.put('/mensalidades/:id/pagar', async (req, res) => {
    const { tipo } = req.body;
    const { error } = await supabase.from('mensalidades').update({ 
        status: (tipo || 'PAGO').toUpperCase(), 
        data_pagamento: new Date() 
    }).eq('id', req.params.id);
    if (error) return res.status(400).json({ erro: error.message });
    res.json({ ok: true });
});

app.put('/mensalidades/:id/estornar', async (req, res) => {
    const { error } = await supabase.from('mensalidades').update({ 
        status: 'PENDENTE', 
        data_pagamento: null 
    }).eq('id', req.params.id);
    if (error) return res.status(400).json({ erro: error.message });
    res.json({ ok: true });
});

app.get('/gerar-mensalidades', async (req, res) => {
    const { error } = await supabase.rpc('gerar_mensalidades');
    if (error) return res.status(400).json({ erro: error.message });
    res.json({ ok: true });
});

// IMPORTANTE: Escutar em 0.0.0.0 para que o Railway consiga rotear o tráfego
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Backend AlugPay da MegaSoft rodando na porta ${PORT}`));