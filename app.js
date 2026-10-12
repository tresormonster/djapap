const API_BASE_URL = 'https://wifi-backend-y5v6.onrender.com';
const STORE = { token: 'meneckdem.token' };
const state = { token: localStorage.getItem(STORE.token), user: null, role: null, page: 'overview', routers: [], adminUsers: [], selectedRouter: null };
const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = (value) => `${new Intl.NumberFormat('fr-FR').format(Number(value) || 0)} FCFA`;
const listOf = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : Array.isArray(value?.items) ? value.items : Array.isArray(value?.users) ? value.users : [];
const endpoint = (path) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3600);
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(endpoint(path), { ...options, headers });
  if (!response.ok) {
    let message = `Erreur ${response.status}`;
    try { const body = await response.json(); message = body.message || body.error || message; if (Array.isArray(message)) message = message.join(' · '); } catch { /* réponse sans JSON */ }
    if (response.status === 401) logout(false);
    throw new Error(message);
  }
  if (options.responseType === 'blob') return response.blob();
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') || '';
  return type.includes('application/json') ? response.json() : response.text();
}

function decodeToken(token) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
}

function logout(showToast = true) {
  localStorage.removeItem(STORE.token); state.token = null; state.user = null; state.role = null;
  $('#application').classList.add('hidden'); $('#login-screen').classList.remove('hidden');
  if (showToast) toast('Vous êtes déconnecté.');
}

async function login(event) {
  event.preventDefault(); const form = new FormData(event.target);
  const submit = $('button[type="submit"]', event.target); submit.disabled = true; submit.textContent = 'Connexion…';
  try {
    const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
    state.token = result.access_token; localStorage.setItem(STORE.token, state.token);
    const claims = decodeToken(state.token); state.role = claims.role;
    await loadProfile();
    if (!state.role) state.role = state.user?.role;
    if (!['ADMIN', 'USER'].includes(state.role)) throw new Error('Le rôle du compte n’est pas reconnu.');
    startApp(); toast('Connexion réussie.');
  } catch (error) { state.token = null; localStorage.removeItem(STORE.token); toast(error.message || 'Connexion impossible.', true); }
  finally { submit.disabled = false; submit.innerHTML = 'Se connecter <span>→</span>'; }
}

function showRegistration() {
  $('#auth-extra').innerHTML = `<section class="auth-extra-card"><h2>Créer un compte client</h2><p>Les comptes ADMIN sont créés par l’administrateur. Les clients confirment leur email et leur téléphone avant la connexion.</p><form id="register-form" class="stack"><label>Nom complet<input name="name" required minlength="2"></label><label>Email<input name="email" type="email" required></label><label>Téléphone<input name="phone" type="tel" placeholder="+237…" required></label><label>Mot de passe<input name="password" type="password" minlength="8" required></label><button class="button primary" type="submit">Créer le compte</button></form></section>`;
}

function showVerification(email) {
  $('#auth-extra').innerHTML = `<section class="auth-extra-card"><h2>Vérifier le compte</h2><p>Entre le code reçu par email puis celui reçu par téléphone. Adresse : <b>${esc(email)}</b></p><form id="verify-form" class="stack"><input type="hidden" name="email" value="${esc(email)}"><label>Code email<input name="emailCode" inputmode="numeric" autocomplete="one-time-code"></label><div class="verify-grid"><button class="button primary" type="submit" data-channel="email">Confirmer l’email</button><button class="button secondary" type="button" data-resend="email">Renvoyer le code email</button></div><label>Code téléphone<input name="phoneCode" inputmode="numeric" autocomplete="one-time-code"></label><div class="verify-grid"><button class="button primary" type="submit" data-channel="phone">Confirmer le téléphone</button><button class="button secondary" type="button" data-resend="phone">Renvoyer le code téléphone</button></div></form></section>`;
}

function showPasswordReset(email = '') {
  $('#auth-extra').innerHTML = `<section class="auth-extra-card"><h2>Réinitialiser le mot de passe</h2><p>Un code de récupération sera envoyé si cette adresse correspond à un compte.</p><form id="reset-request-form" class="stack"><label>Email<input name="email" type="email" value="${esc(email)}" required></label><button class="button secondary" type="submit">Recevoir un code</button></form><form id="reset-confirm-form" class="stack hidden"><input type="hidden" name="email" value="${esc(email)}"><label>Code reçu<input name="code" inputmode="numeric" required></label><label>Nouveau mot de passe<input name="newPassword" type="password" minlength="8" required></label><button class="button primary" type="submit">Changer le mot de passe</button></form></section>`;
}

async function registerAccount(event) {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
  try { const result = await request('/auth/register', { method: 'POST', body: JSON.stringify(data) }); toast(result.message || 'Compte créé.'); showVerification(data.email); }
  catch (error) { toast(error.message, true); }
}

async function confirmVerification(event) {
  event.preventDefault(); const channel = event.submitter?.dataset.channel; if (!channel) return;
  const data = Object.fromEntries(new FormData(event.target)); const code = channel === 'email' ? data.emailCode : data.phoneCode;
  try { const result = await request(`/auth/verify/${channel}`, { method: 'POST', body: JSON.stringify({ email: data.email, code }) }); toast(result.message || `Adresse ${channel === 'email' ? 'email' : 'téléphone'} confirmée.`); }
  catch (error) { toast(error.message, true); }
}

async function resendVerification(button) {
  const form = $('#verify-form'); const email = new FormData(form).get('email');
  try { const result = await request(`/auth/verify/${button.dataset.resend}/resend`, { method: 'POST', body: JSON.stringify({ email }) }); toast(result.message || 'Nouveau code envoyé.'); }
  catch (error) { toast(error.message, true); }
}

async function loadProfile() { state.user = await request('/users/me'); }

const ADMIN_NAV = [
  { id: 'overview', label: 'Vue d’ensemble', icon: '◫' },
  { id: 'users', label: 'Clients', icon: '♙' },
  { id: 'routers', label: 'Routeurs', icon: '⌁' },
  { id: 'offers', label: 'Forfaits', icon: '▤' },
  { id: 'finances', label: 'Finances', icon: '◈' },
];
const USER_NAV = [
  { id: 'overview', label: 'Vue d’ensemble', icon: '◫' },
  { id: 'routers', label: 'Mes routeurs', icon: '⌁' },
  { id: 'offers', label: 'Mes forfaits', icon: '▤' },
  { id: 'wallet', label: 'Portefeuille', icon: '◈' },
  { id: 'portal', label: 'Portail captif', icon: '◉' },
];

function startApp() {
  $('#login-screen').classList.add('hidden'); $('#application').classList.remove('hidden');
  $('#role-label').textContent = state.role === 'ADMIN' ? 'ADMINISTRATION' : 'ESPACE CLIENT';
  $('#user-name').textContent = state.user?.name || state.user?.email || 'Utilisateur';
  $('#user-email').textContent = state.user?.email || '';
  $('#avatar').textContent = (state.user?.name || state.user?.email || 'M').slice(0, 1).toUpperCase();
  renderNav(); loadPage(state.page);
}

function renderNav() {
  const items = state.role === 'ADMIN' ? ADMIN_NAV : USER_NAV;
  $('#navigation').innerHTML = items.map((item) => `<button class="nav-item ${state.page === item.id ? 'active' : ''}" data-page="${item.id}"><span class="nav-icon">${item.icon}</span>${item.label}</button>`).join('');
}

const PAGE_NAMES = { overview: 'Vue d’ensemble', users: 'Clients', routers: 'Routeurs', offers: 'Forfaits', finances: 'Finances', wallet: 'Portefeuille', portal: 'Portail captif', 'router-offers': 'Forfaits du routeur' };
function heading(title, description, action = '') {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${action}</div></div>`;
}
function stat(label, value, icon, note = '') {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${note}</div></article>`;
}
function card(title, content, action = '', subtitle = '') {
  return `<section class="card"><div class="card-header"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${action}</div>${content}</section>`;
}
function empty(message) { return `<div class="empty-state">${message}</div>`; }
function table(headers, rows) {
  if (!rows.length) return empty('Aucune donnée à afficher pour le moment.');
  return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function statusBadge(value) {
  const normalized = String(value || '—').toUpperCase();
  const klass = ['SUCCESS', 'ACTIVE', 'PAID', 'COMPLETED'].includes(normalized) ? 'success' : ['FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(normalized) ? 'danger' : ['PENDING', 'PROCESSING'].includes(normalized) ? 'pending' : 'blue';
  return `<span class="badge ${klass}">${esc(normalized)}</span>`;
}
function date(value) { if (!value) return '—'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? esc(value) : parsed.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
function errorView(error) { return `<section class="card"><div class="info-box">Impossible de charger ces informations : ${esc(error.message)}. Vérifie l’adresse de l’API, CORS et les autorisations du compte.</div></section>`; }

async function loadPage(page) {
  state.page = page; renderNav(); $('#page-title').textContent = PAGE_NAMES[page] || 'Espace'; $('#page-content').innerHTML = '<div class="loading"><span class="spinner"></span>Chargement de vos données…</div>';
  try {
    if (state.role === 'ADMIN') await renderAdmin(page); else await renderUser(page);
  } catch (error) { $('#page-content').innerHTML = errorView(error); }
}

async function renderAdmin(page) {
  if (page === 'overview') {
    const [usersResult, routersResult, offersResult, financeResult] = await Promise.allSettled([
      request('/users?page=1&pageSize=100'), request('/routers'), request('/offers/admin'), request('/payments/admin/platform-summary'),
    ]);
    const users = usersResult.status === 'fulfilled' ? listOf(usersResult.value) : [];
    const routers = routersResult.status === 'fulfilled' ? listOf(routersResult.value) : [];
    const offers = offersResult.status === 'fulfilled' ? listOf(offersResult.value) : [];
    const finance = financeResult.status === 'fulfilled' ? financeResult.value : {};
    state.routers = routers;
    const recentUsers = users.slice(0, 5).map((user) => `<tr><td class="cell-strong">${esc(user.name)}</td><td>${esc(user.email)}</td><td>${statusBadge(user.role)}</td><td>${date(user.createdAt)}</td></tr>`);
    $('#page-content').innerHTML = heading('Vue d’ensemble', 'Voici l’activité de votre plateforme WiFi.') +
      `<div class="grid stats-grid">${stat('CLIENTS', users.length, '♙', 'Comptes enregistrés')}${stat('ROUTEURS', routers.length, '⌁', 'Routeurs suivis')}${stat('FORFAITS', offers.filter((offer) => offer.active !== false).length, '▤', 'Forfaits actifs')}${stat('SOLDE PLATEFORME', money(finance.balance ?? finance.totalBalance ?? finance.total ?? 0), '◈', 'Synthèse du portefeuille')}</div>`+
      `<div class="grid two-column">${card('Derniers clients', table(['CLIENT', 'EMAIL', 'RÔLE', 'INSCRIPTION'], recentUsers), '<button class="text-link" data-page="users">Voir les clients →</button>')}${card('État de la plateforme', `<div class="info-box">${routers.length} routeur(s) chargé(s). Les données affichées viennent de l’API sécurisée. Utilise les menus pour gérer les clients, routeurs, forfaits et finances.</div><div class="router-detail"><span>Forfaits actifs : <b>${offers.filter((offer) => offer.active !== false).length}</b></span><span>API : <b>connectée</b></span></div>`, '<span class="badge success">EN LIGNE</span>')}</div>`;
    return;
  }
  if (page === 'users') return renderAdminUsers();
  if (page === 'routers') return renderAdminRouters();
  if (page === 'offers') return renderAdminOffers();
  if (page === 'finances') return renderAdminFinances();
  if (page === 'router-offers') return renderAdminRouterOffers();
}

async function renderAdminUsers() {
  const [result, routerResult] = await Promise.all([request('/users?page=1&pageSize=100'), request('/routers')]);
  const users = listOf(result); const routers = listOf(routerResult); state.adminUsers = users; state.routers = routers;
  const rows = users.map((user) => {
    const ownedRouters = routers.filter((router) => router.ownerId === user.id);
    const routerLabels = ownedRouters.length ? ownedRouters.map((router) => esc(router.name)).join(', ') : 'Aucun routeur lié';
    return `<tr><td class="cell-strong">${esc(user.name)}</td><td>${esc(user.email)}</td><td>${esc(user.phone || '—')}</td><td>${statusBadge(user.role)}</td><td>${routerLabels}</td><td>${statusBadge(user.emailVerifiedAt ? 'VERIFIED' : 'EMAIL PENDING')} ${statusBadge(user.phoneVerifiedAt ? 'PHONE OK' : 'PHONE PENDING')}</td><td>${date(user.createdAt)}</td><td><div class="inline-actions"><button class="small-button" data-client-routers="${esc(user.id)}" data-user-name="${esc(user.name)}">Gérer routeurs (${ownedRouters.length})</button><button class="small-button" data-wallet-user="${esc(user.id)}" data-user-name="${esc(user.name)}">Portefeuille</button><button class="small-button" data-role-id="${esc(user.id)}" data-role="${user.role === 'ADMIN' ? 'USER' : 'ADMIN'}">${user.role === 'ADMIN' ? 'Rétrograder' : 'Promouvoir admin'}</button></div></td></tr>`;
  }).join('');
  $('#page-content').innerHTML = heading('Clients', 'Chaque client doit avoir ses routeurs attribués; les forfaits se règlent ensuite routeur par routeur.', '<button class="button primary" data-action="new-client">+ Créer un client</button>') + card('Comptes et routeurs attribués', table(['NOM', 'EMAIL', 'TÉLÉPHONE', 'RÔLE', 'ROUTEURS', 'VÉRIFICATIONS', 'INSCRIPTION', 'ACTIONS'], rows));
}

async function renderAdminRouters() {
  const [routerResult, userResult] = await Promise.all([request('/routers'), request('/users?page=1&pageSize=100')]);
  const routers = listOf(routerResult); state.routers = routers; state.adminUsers = listOf(userResult);
  const userNames = new Map(state.adminUsers.map((user) => [user.id, user.name]));
  const rows = routers.map((router) => `<tr><td class="cell-strong">${esc(router.name)}</td><td>${esc(router.code)}</td><td>${esc(router.ipAddress)}</td><td>${esc(router.location || '—')}</td><td>${router.ownerId ? esc(userNames.get(router.ownerId) || 'Client') : 'Non attribué'}</td><td>${statusBadge(router.active === false ? 'INACTIVE' : 'ACTIVE')}</td><td><div class="inline-actions"><button class="small-button" data-admin-router-offers="${esc(router.id)}">Forfaits</button><button class="small-button" data-router-portal="${esc(router.id)}">Portail</button></div></td></tr>`);
  $('#page-content').innerHTML = heading('Routeurs', 'Attribue chaque MikroTik à son client, puis règle les forfaits disponibles sur ce routeur.', '<button class="button primary" data-action="new-router">+ Ajouter un routeur</button>') + card('Routeurs et propriétaires', table(['NOM', 'CODE', 'ADRESSE IP', 'EMPLACEMENT', 'CLIENT LIÉ', 'ÉTAT', 'GESTION'], rows), '', `${routers.length} routeur(s)`);
}

async function renderAdminRouterOffers() {
  const router = state.routers.find((item) => item.id === state.selectedRouter);
  if (!router) throw new Error('Routeur sélectionné introuvable.');
  const [assignedRows, offers] = await Promise.all([
    request(`/routers/${encodeURIComponent(router.id)}/offers`), request('/offers/admin'),
  ]);
  const assigned = new Set(listOf(assignedRows).map((entry) => entry.offerId || entry.offer?.id).filter(Boolean));
  const cards = listOf(offers).map((offer) => {
    const enabled = assigned.has(offer.id);
    return `<article class="offer-card"><div class="router-card-head"><h3>${esc(offer.name)}</h3><button class="toggle ${enabled ? 'on' : ''}" aria-label="Activer forfait" data-admin-offer="${esc(offer.id)}" data-enabled="${enabled}" data-router-id="${esc(router.id)}"></button></div><div class="offer-price">${money(offer.price)}</div><div class="offer-sub">${offer.durationMinutes ? `${esc(offer.durationMinutes)} min` : offer.duration ? `${esc(offer.duration)} h` : 'Durée libre'} · ${offer.dataLimitMb ? `${esc(offer.dataLimitMb)} Mo` : 'Volume illimité'}</div><div class="offer-meta"><span>${esc(offer.profileName || offer.type || 'WiFi')}</span><span>${enabled ? 'Proposé sur le routeur' : 'Non proposé'}</span></div></article>`;
  }).join('');
  $('#page-content').innerHTML = heading(`Forfaits · ${esc(router.name)}`, `Choisis les forfaits visibles sur ${esc(router.code)}.`, '<button class="button secondary" data-page="routers">← Retour aux routeurs</button>') + card('Catalogue du routeur', cards ? `<div class="grid offer-grid">${cards}</div>` : empty('Crée d’abord des forfaits dans le catalogue.'), '', 'Activer ou retirer un forfait ne supprime pas les tickets et paiements existants.');
}

async function renderAdminOffers() {
  const offers = listOf(await request('/offers/admin'));
  const rows = offers.map((offer) => `<tr><td class="cell-strong">${esc(offer.name)}</td><td>${esc(offer.code)}</td><td>${money(offer.price)}</td><td>${offer.durationMinutes ? `${esc(offer.durationMinutes)} min` : offer.duration ? `${esc(offer.duration)} h` : '—'}</td><td>${offer.dataLimitMb ? `${esc(offer.dataLimitMb)} Mo` : 'Illimité'}</td><td>${statusBadge(offer.active === false ? 'INACTIVE' : 'ACTIVE')}</td><td><div class="inline-actions"><button class="small-button" data-offer-edit="${esc(offer.id)}">Modifier</button><button class="small-button ${offer.active === false ? '' : 'warn'}" data-offer-toggle="${esc(offer.id)}" data-active="${offer.active !== false}">${offer.active === false ? 'Activer' : 'Désactiver'}</button></div></td></tr>`);
  $('#page-content').innerHTML = heading('Forfaits', 'Crée des offres WiFi et contrôle leur disponibilité.', '<button class="button primary" data-action="new-offer">+ Créer un forfait</button>') + card('Catalogue des forfaits', table(['FORFAIT', 'CODE', 'PRIX', 'DURÉE', 'VOLUME', 'ÉTAT', 'ACTIONS'], rows), '', `${offers.length} forfait(s)`);
}

async function renderAdminFinances() {
  const [summaryResult, historyResult, withdrawalsResult] = await Promise.allSettled([
    request('/payments/admin/platform-summary'), request('/payments/admin/platform-history?page=1&pageSize=25'), request('/wallet/admin/withdrawals?page=1&pageSize=25'),
  ]);
  const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : {};
  const payments = historyResult.status === 'fulfilled' ? listOf(historyResult.value) : [];
  const withdrawals = withdrawalsResult.status === 'fulfilled' ? listOf(withdrawalsResult.value) : [];
  const rows = payments.map((payment) => `<tr><td>${date(payment.createdAt)}</td><td class="cell-strong">${esc(payment.reference || payment.id)}</td><td>${esc(payment.phone || '—')}</td><td>${money(payment.amount)}</td><td>${statusBadge(payment.status)}</td></tr>`);
  const withdrawRows = withdrawals.map((item) => `<tr><td class="cell-strong">${esc(item.reference || item.id)}</td><td>${esc(item.phone || '—')}</td><td>${money(item.amount)}</td><td>${statusBadge(item.status)}</td><td>${item.reference ? `<button class="small-button" data-withdraw-submit="${esc(item.reference)}">Traiter</button>` : '—'}</td></tr>`);
  $('#page-content').innerHTML = heading('Finances', 'Suivi des paiements et des demandes de retrait.') + `<div class="grid stats-grid">${stat('SOLDE PLATEFORME', money(summary.balance ?? summary.totalBalance ?? 0), '◈')}${stat('COMMISSIONS', money(summary.commission ?? summary.totalCommission ?? 0), '↗')}${stat('PAIEMENTS', esc(summary.paymentCount ?? payments.length), '▤')}${stat('RETRAITS EN ATTENTE', withdrawals.filter((item) => item.status === 'PENDING').length, '◷')}</div>` + card('Historique des paiements', table(['DATE', 'RÉFÉRENCE', 'TÉLÉPHONE', 'MONTANT', 'ÉTAT'], rows)) + card('Demandes de retrait', table(['RÉFÉRENCE', 'DESTINATAIRE', 'MONTANT', 'ÉTAT', 'ACTION'], withdrawRows));
}

async function renderUser(page) {
  if (page === 'overview') {
    const [routersResult, walletResult, transactionsResult] = await Promise.allSettled([
      request('/routers/my'), request('/wallet'), request('/wallet/transactions?page=1&pageSize=5'),
    ]);
    const routers = routersResult.status === 'fulfilled' ? listOf(routersResult.value) : [];
    const wallet = walletResult.status === 'fulfilled' ? walletResult.value : {};
    const transactions = transactionsResult.status === 'fulfilled' ? listOf(transactionsResult.value) : [];
    state.routers = routers;
    const rows = transactions.map((item) => `<tr><td>${date(item.createdAt)}</td><td class="cell-strong">${esc(item.description || item.type || 'Opération')}</td><td>${money(item.amount)}</td><td>${statusBadge(item.status || item.direction)}</td></tr>`);
    $('#page-content').innerHTML = heading(`Bonjour ${esc((state.user?.name || '').split(' ')[0] || 'et bienvenue')}`, 'Retrouve ici les informations principales de ton espace client.', '<button class="button primary" data-action="new-router">+ Enregistrer un routeur</button>') + `<div class="grid stats-grid">${stat('MES ROUTEURS', routers.length, '⌁', 'Routeurs enregistrés')}${stat('SOLDE DISPONIBLE', money(wallet.balance ?? wallet.availableBalance ?? 0), '◈', 'Portefeuille client')}${stat('RETRAITS EN ATTENTE', wallet.pendingWithdrawals ?? 0, '◷', 'Demandes en traitement')}${stat('COMPTE', statusBadge('ACTIVE'), '♙', 'Accès utilisateur')}</div>` + `<div class="grid two-column">${card('Mes routeurs', routers.length ? `<div class="grid">${routers.slice(0, 4).map(routerTile).join('')}</div>` : empty('Aucun routeur enregistré. Ajoute ton MikroTik pour commencer.'), '<button class="text-link" data-page="routers">Voir mes routeurs →</button>')}${card('Dernières opérations', table(['DATE', 'OPÉRATION', 'MONTANT', 'ÉTAT'], rows))}</div>`;
    return;
  }
  if (page === 'routers') return renderUserRouters();
  if (page === 'offers') return renderUserOffers();
  if (page === 'wallet') return renderUserWallet();
  if (page === 'portal') return renderUserPortal();
}

function routerTile(router) {
  return `<article class="router-card"><div class="router-card-head"><div><h3>${esc(router.name)}</h3><p>${esc(router.code)} · ${esc(router.location || router.ipAddress || 'MikroTik')}</p></div>${statusBadge(router.active === false ? 'INACTIVE' : 'ACTIVE')}</div><div class="router-detail"><span>IP : <b>${esc(router.ipAddress || '—')}</b></span><span>Code : <b>${esc(router.code)}</b></span></div><div class="inline-actions"><button class="small-button" data-router-offers="${esc(router.id)}">Forfaits</button><button class="small-button" data-router-portal="${esc(router.id)}">Portail captif</button></div></article>`;
}

async function renderUserRouters() {
  const routers = listOf(await request('/routers/my')); state.routers = routers;
  const content = routers.length ? `<div class="grid two-column">${routers.map(routerTile).join('')}</div>` : empty('Tu n’as pas encore enregistré de routeur.');
  $('#page-content').innerHTML = heading('Mes routeurs', 'Enregistre tes MikroTik et configure les forfaits proposés à tes clients.', '<button class="button primary" data-action="new-router">+ Enregistrer un routeur</button>') + `<section class="card">${content}</section><div class="info-box">Les identifiants MikroTik sont transmis à l’API de manière sécurisée. Le portail téléchargé est un fichier ZIP à importer dans le dossier HotSpot du routeur.</div>`;
}

async function renderUserOffers() {
  if (!state.routers.length) state.routers = listOf(await request('/routers/my'));
  if (!state.selectedRouter && state.routers.length) state.selectedRouter = state.routers[0].id;
  const selector = `<select id="offer-router" class="search-input">${state.routers.map((router) => `<option value="${esc(router.id)}" ${state.selectedRouter === router.id ? 'selected' : ''}>${esc(router.name)} · ${esc(router.code)}</option>`).join('')}</select>`;
  if (!state.selectedRouter) { $('#page-content').innerHTML = heading('Mes forfaits', 'Choisis les offres vendues par chacun de tes routeurs.') + card('Routeur requis', empty('Enregistre d’abord un routeur pour gérer les forfaits.')); return; }
  const offers = listOf(await request(`/routers/my/${encodeURIComponent(state.selectedRouter)}/offers`));
  const cards = offers.map((entry) => { const offer = entry.offer || entry; const active = entry.enabled ?? entry.active ?? entry.isEnabled ?? true; return `<article class="offer-card"><div class="router-card-head"><h3>${esc(offer.name)}</h3><button class="toggle ${active ? 'on' : ''}" aria-label="Activer forfait" data-owner-offer="${esc(offer.id)}" data-enabled="${active}" data-router-id="${esc(state.selectedRouter)}"></button></div><div class="offer-price">${money(offer.price)}</div><div class="offer-sub">${offer.durationMinutes ? `${esc(offer.durationMinutes)} min` : offer.duration ? `${esc(offer.duration)} h` : 'Durée libre'} · ${offer.dataLimitMb ? `${esc(offer.dataLimitMb)} Mo` : 'Volume illimité'}</div><div class="offer-meta"><span>${esc(offer.profileName || offer.type || 'WiFi')}</span><span>${active ? 'Proposé' : 'Masqué'}</span></div></article>`; }).join('');
  $('#page-content').innerHTML = heading('Mes forfaits', 'Active les offres disponibles sur le routeur sélectionné.') + card('Forfaits du routeur', `<div class="toolbar">${selector}</div>${cards ? `<div class="grid offer-grid">${cards}</div>` : empty('Aucun forfait associé à ce routeur.')}`, '', 'Les changements s’appliquent au catalogue affiché sur le portail captif.');
}

async function renderUserWallet() {
  const [wallet, history] = await Promise.all([request('/wallet'), request('/wallet/transactions?page=1&pageSize=50')]);
  const transactions = listOf(history);
  const rows = transactions.map((item) => `<tr><td>${date(item.createdAt)}</td><td class="cell-strong">${esc(item.description || item.type || 'Opération')}</td><td>${esc(item.direction || item.type || '—')}</td><td>${money(item.amount)}</td><td>${statusBadge(item.status || 'SUCCESS')}</td></tr>`);
  $('#page-content').innerHTML = heading('Portefeuille', 'Consulte ton solde et l’historique des mouvements.') + `<div class="grid stats-grid">${stat('SOLDE DISPONIBLE', money(wallet.balance ?? wallet.availableBalance ?? 0), '◈')}${stat('OPÉRATIONS', transactions.length, '▤', 'Dernières transactions')}</div>` + card('Historique du portefeuille', table(['DATE', 'OPÉRATION', 'TYPE', 'MONTANT', 'ÉTAT'], rows)) + `<div class="info-box">Les dépôts et retraits doivent être confirmés par les services de paiement configurés. Pour l’instant, contacte l’administrateur pour toute opération financière.</div>`;
}

async function renderUserPortal() {
  if (!state.routers.length) state.routers = listOf(await request('/routers/my'));
  if (!state.selectedRouter && state.routers.length) state.selectedRouter = state.routers[0].id;
  if (!state.selectedRouter) { $('#page-content').innerHTML = heading('Portail captif', 'Personnalise le portail HotSpot de ton routeur.') + card('Routeur requis', empty('Enregistre d’abord un routeur pour personnaliser son portail.')); return; }
  const router = state.routers.find((item) => item.id === state.selectedRouter);
  const prefix = state.role === 'ADMIN' ? '/routers' : '/routers/my'; const settings = await request(`${prefix}/${encodeURIComponent(state.selectedRouter)}/portal`);
  $('#page-content').innerHTML = heading('Portail captif', 'Personnalise les couleurs et les informations visibles sur ton HotSpot.') + card('Identité du portail', `<div class="toolbar"><label class="field">Routeur<select id="portal-router" class="search-input">${state.routers.map((item) => `<option value="${esc(item.id)}" ${state.selectedRouter === item.id ? 'selected' : ''}>${esc(item.name)} · ${esc(item.code)}</option>`).join('')}</select></label><span class="badge blue">${esc(router?.code || '')}</span></div><form id="portal-form" class="form-grid"><label class="field">Nom commercial<input name="brandName" maxlength="80" value="${esc(settings.brandName || '')}" placeholder="Mon WiFi"></label><label class="field">Téléphone de contact<input name="contactPhone" maxlength="32" value="${esc(settings.contactPhone || '')}" placeholder="+237…"></label><label class="field full">URL HTTPS du logo<input name="logoUrl" type="url" value="${esc(settings.logoUrl || '')}" placeholder="https://…"></label><label class="field">Couleur principale<input name="primaryColor" pattern="#[0-9a-fA-F]{6}" value="${esc(settings.primaryColor || '#365CF5')}" placeholder="#365CF5"></label><label class="field">Couleur secondaire<input name="accentColor" pattern="#[0-9a-fA-F]{6}" value="${esc(settings.accentColor || '#F5DB94')}" placeholder="#F5DB94"></label><div class="form-actions full"><button class="button secondary" type="submit">Enregistrer les réglages</button><button class="button primary" type="button" data-download-portal="${esc(state.selectedRouter)}">Télécharger le portail ZIP</button></div></form>`, '', 'Les fichiers téléchargés sont à importer dans le dossier HotSpot du MikroTik.');
}

function modal(title, body) {
  $('#modal-root').innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true"><button class="modal-close" data-close-modal aria-label="Fermer">×</button><h2>${title}</h2>${body}</section></div>`;
}

function newOfferModal() {
  modal('Créer un forfait', `<form id="offer-form" class="form-grid"><label class="field">Nom du forfait<input name="name" required placeholder="Pass 24 heures"></label><label class="field">Code numérique<input name="code" type="number" min="1" required></label><label class="field">Prix (FCFA)<input name="price" type="number" min="0" required></label><label class="field">Type<select name="type"><option value="STANDARD">Durée</option><option value="DATA">Volume</option><option value="VIP">Durée + volume</option></select></label><label class="field">Durée (minutes)<input name="durationMinutes" type="number" min="1" placeholder="ex. 1440"></label><label class="field">Volume (Mo)<input name="dataLimitMb" type="number" min="1" placeholder="laisser vide = illimité"></label><label class="field">Profil MikroTik<input name="profileName" required placeholder="PASS-24H"></label><label class="field">Connexions simultanées<input name="sharedUsers" type="number" min="1" value="1"></label><label class="field">Débit descendant (Kbit/s)<input name="downloadLimitKbps" type="number" min="1"></label><label class="field">Débit montant (Kbit/s)<input name="uploadLimitKbps" type="number" min="1"></label><div class="form-actions full"><button class="button secondary" type="button" data-close-modal>Annuler</button><button class="button primary" type="submit">Créer le forfait</button></div></form>`);
}

function newClientModal() {
  modal('Créer un compte client', `<form id="client-form" class="form-grid"><label class="field">Nom complet<input name="name" required minlength="2"></label><label class="field">Email<input name="email" type="email" required></label><label class="field">Téléphone<input name="phone" type="tel" placeholder="+237…" required></label><label class="field">Mot de passe provisoire<input name="password" type="password" minlength="8" required></label><div class="info-box full">Le compte sera créé avec le rôle USER. Le client devra confirmer son email et son téléphone avec les codes envoyés avant de pouvoir se connecter.</div><div class="form-actions full"><button class="button secondary" type="button" data-close-modal>Annuler</button><button class="button primary" type="submit">Créer le compte</button></div></form>`);
}

function walletAdjustmentModal(userId, userName) {
  modal(`Portefeuille · ${esc(userName)}`, `<form id="wallet-adjustment-form" class="form-grid"><input type="hidden" name="userId" value="${esc(userId)}"><label class="field">Opération<select name="direction"><option value="CREDIT">Créditer le compte</option><option value="DEBIT">Débiter le compte</option></select></label><label class="field">Montant (FCFA)<input name="amount" type="number" min="1" required></label><label class="field full">Référence<input name="reference" minlength="8" required placeholder="ADMIN-…"></label><label class="field full">Motif obligatoire<input name="reason" minlength="5" required placeholder="Correction approuvée…"></label><div class="info-box full">Cette opération est inscrite au journal financier avec l’identité de l’administrateur.</div><div class="form-actions full"><button class="button secondary" type="button" data-close-modal>Annuler</button><button class="button primary" type="submit">Enregistrer l’ajustement</button></div></form>`);
}

async function openAdminWallet(userId, userName) {
  try {
    const [summary, history] = await Promise.all([
      request(`/wallet/admin/users/${encodeURIComponent(userId)}/summary`),
      request(`/wallet/admin/users/${encodeURIComponent(userId)}/transactions?page=1&pageSize=25`),
    ]);
    const rows = listOf(history).map((item) => `<tr><td>${date(item.createdAt)}</td><td>${esc(item.description || item.type || 'Opération')}</td><td>${money(item.amount)}</td><td>${statusBadge(item.direction || item.type)}</td></tr>`);
    modal(`Portefeuille · ${esc(userName)}`, `<div class="stat-card"><div class="stat-top"><span>SOLDE DISPONIBLE</span><span class="stat-icon">◈</span></div><div class="stat-value">${money(summary.balance ?? summary.availableBalance ?? 0)}</div></div><div style="height:14px"></div>${table(['DATE', 'OPÉRATION', 'MONTANT', 'TYPE'], rows)}<div class="form-actions"><button class="button primary" type="button" data-wallet-adjust-user="${esc(userId)}" data-user-name="${esc(userName)}">Ajuster le solde</button></div>`);
  } catch (error) { toast(error.message, true); }
}

async function openClientRouters(userId, userName) {
  try {
    const routers = listOf(await request('/routers')); state.routers = routers;
    const rows = routers.map((router) => {
      const ownerName = state.adminUsers.find((user) => user.id === router.ownerId)?.name || 'Autre client';
      let action;
      if (router.ownerId === userId) {
        action = `<div class="inline-actions"><button class="small-button" data-admin-router-offers="${esc(router.id)}">Forfaits</button><button class="small-button warn" data-detach-client-router="${esc(router.id)}" data-client-id="${esc(userId)}" data-user-name="${esc(userName)}">Délier</button></div>`;
      } else if (!router.ownerId) {
        action = `<button class="small-button" data-attach-client-router="${esc(router.id)}" data-client-id="${esc(userId)}" data-user-name="${esc(userName)}">Attribuer</button>`;
      } else {
        action = `<span class="muted">Attribué à ${esc(ownerName)}</span>`;
      }
      return `<tr><td class="cell-strong">${esc(router.name)}</td><td>${esc(router.code)}</td><td>${router.ownerId === userId ? statusBadge('LIÉ') : router.ownerId ? esc(ownerName) : 'Disponible'}</td><td>${action}</td></tr>`;
    }).join('');
    const content = rows ? table(['ROUTEUR', 'CODE HOTSPOT', 'ATTRIBUTION', 'ACTIONS'], rows) : empty('Aucun routeur enregistré.');
    modal(`Routeurs · ${esc(userName)}`, `<div class="info-box">Attribue ici les MikroTik de ce client. « Forfaits » règle ensuite les offres activées sur chaque routeur.</div><div style="height:14px"></div>${content}<div class="form-actions"><button class="button secondary" type="button" data-close-modal>Fermer</button></div>`);
  } catch (error) { toast(error.message, true); }
}

function newRouterModal(isAdmin) {
  modal(isAdmin ? 'Ajouter un routeur' : 'Enregistrer un routeur', `<form id="router-form" class="form-grid"><label class="field">Nom du routeur<input name="name" required placeholder="Boutique centre"></label><label class="field">Code HotSpot<input name="code" required placeholder="WIFI-CENTRE"></label><label class="field">Adresse IP<input name="ipAddress" required placeholder="192.168.88.1"></label><label class="field">Port API<input name="apiPort" type="number" min="1" value="8728" required></label><label class="field">Identifiant RouterOS<input name="username" required></label><label class="field">Mot de passe RouterOS<input name="password" type="password" required></label><label class="field full">Emplacement<input name="location" placeholder="Ville, quartier…"></label>${isAdmin ? '<label class="field full">ID du propriétaire (facultatif)<input name="ownerId" placeholder="UUID client"></label>' : ''}<div class="info-box full">Vérifie l’IP, le port API et les identifiants RouterOS avant l’enregistrement.</div><div class="form-actions full"><button class="button secondary" type="button" data-close-modal>Annuler</button><button class="button primary" type="submit">Enregistrer</button></div></form>`);
}

async function createOffer(event) {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
  for (const key of ['code', 'price', 'durationMinutes', 'dataLimitMb', 'downloadLimitKbps', 'uploadLimitKbps', 'sharedUsers']) data[key] = data[key] === '' || data[key] == null ? undefined : Number(data[key]);
  data.active = true;
  try { await request('/offers', { method: 'POST', body: JSON.stringify(data) }); $('#modal-root').innerHTML = ''; toast('Forfait créé.'); loadPage('offers'); }
  catch (error) { toast(error.message, true); }
}

async function createRouter(event) {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
  data.apiPort = Number(data.apiPort); if (!data.location) delete data.location; if (!data.ownerId) delete data.ownerId;
  const route = state.role === 'ADMIN' ? '/routers' : '/routers/my';
  try { await request(route, { method: 'POST', body: JSON.stringify(data) }); $('#modal-root').innerHTML = ''; toast('Routeur enregistré.'); loadPage('routers'); }
  catch (error) { toast(error.message, true); }
}

async function createClient(event) {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
  try {
    const result = await request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
    $('#modal-root').innerHTML = ''; toast(result.message || 'Compte client créé; les vérifications restent à confirmer.'); loadPage('users');
  } catch (error) { toast(error.message, true); }
}

async function adjustWallet(event) {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
  data.amount = Number(data.amount); data.idempotencyKey = crypto.randomUUID();
  if (!data.reference) data.reference = `ADMIN-${Date.now()}`;
  try {
    await request('/wallet/admin/adjustments', { method: 'POST', body: JSON.stringify(data) });
    $('#modal-root').innerHTML = ''; toast('Ajustement du portefeuille enregistré.'); loadPage('users');
  } catch (error) { toast(error.message, true); }
}

async function downloadPortal(id) {
  try { const prefix = state.role === 'ADMIN' ? '/routers' : '/routers/my'; const blob = await request(`${prefix}/${encodeURIComponent(id)}/portal/download`, { responseType: 'blob' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'portail-captif.zip'; link.click(); URL.revokeObjectURL(url); toast('Téléchargement du portail lancé.'); }
  catch (error) { toast(error.message, true); }
}

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'login-form') return login(event);
  if (event.target.id === 'register-form') return registerAccount(event);
  if (event.target.id === 'verify-form') return confirmVerification(event);
  if (event.target.id === 'reset-request-form') {
    event.preventDefault(); const email = new FormData(event.target).get('email');
    try { const result = await request('/auth/password/reset/request', { method: 'POST', body: JSON.stringify({ email }) }); $('#reset-confirm-form').classList.remove('hidden'); $('#reset-confirm-form [name="email"]').value = email; toast(result.message || 'Si le compte existe, un code a été envoyé.'); }
    catch (error) { toast(error.message, true); } return;
  }
  if (event.target.id === 'reset-confirm-form') {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
    try { const result = await request('/auth/password/reset/confirm', { method: 'POST', body: JSON.stringify(data) }); toast(result.message || 'Mot de passe modifié.'); $('#auth-extra').innerHTML = ''; }
    catch (error) { toast(error.message, true); } return;
  }
  if (event.target.id === 'offer-form') return createOffer(event);
  if (event.target.id === 'router-form') return createRouter(event);
  if (event.target.id === 'client-form') return createClient(event);
  if (event.target.id === 'wallet-adjustment-form') return adjustWallet(event);
  if (event.target.id === 'portal-form') {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); for (const key of Object.keys(data)) if (data[key] === '') data[key] = null;
    try { const prefix = state.role === 'ADMIN' ? '/routers' : '/routers/my'; await request(`${prefix}/${encodeURIComponent(state.selectedRouter)}/portal`, { method: 'PATCH', body: JSON.stringify(data) }); toast('Paramètres du portail enregistrés.'); }
    catch (error) { toast(error.message, true); } return;
  }
});

document.addEventListener('change', async (event) => {
  if (event.target.id === 'offer-router') { state.selectedRouter = event.target.value; return loadPage('offers'); }
  if (event.target.id === 'portal-router') { state.selectedRouter = event.target.value; return loadPage('portal'); }
  if (event.target.matches('[data-owner-offer]')) {
    const id = event.target.dataset.ownerOffer; const routerId = event.target.dataset.routerId; const enabled = event.target.dataset.enabled === 'true';
    try { await request(`/routers/my/${encodeURIComponent(routerId)}/offers/${encodeURIComponent(id)}`, { method: enabled ? 'DELETE' : 'POST' }); toast(enabled ? 'Forfait retiré de ce routeur.' : 'Forfait activé sur ce routeur.'); loadPage('offers'); }
    catch (error) { toast(error.message, true); loadPage('offers'); }
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.id === 'show-register') return showRegistration();
  if (button.id === 'show-reset') return showPasswordReset();
  if (button.dataset.resend) return resendVerification(button);
  if (button.dataset.page) { $('#sidebar').classList.remove('open'); return loadPage(button.dataset.page); }
  if (button.id === 'logout-button') return logout();
  if (button.id === 'refresh-button') { if (state.user) await loadProfile(); return loadPage(state.page); }
  if (button.id === 'menu-button') return $('#sidebar').classList.toggle('open');
  if (button.hasAttribute('data-close-modal')) { if (event.target === button || button.classList.contains('modal-close') || button.closest('.form-actions')) $('#modal-root').innerHTML = ''; return; }
  if (button.dataset.action === 'new-offer') return newOfferModal();
  if (button.dataset.action === 'new-router') return newRouterModal(state.role === 'ADMIN');
  if (button.dataset.action === 'new-client') return newClientModal();
  if (button.dataset.clientRouters) return openClientRouters(button.dataset.clientRouters, button.dataset.userName || 'Client');
  if (button.dataset.attachClientRouter || button.dataset.detachClientRouter) {
    const routerId = button.dataset.attachClientRouter || button.dataset.detachClientRouter;
    const clientId = button.dataset.clientId; const userName = button.dataset.userName || 'Client';
    const ownerId = button.dataset.attachClientRouter ? clientId : null;
    try {
      await request(`/routers/${encodeURIComponent(routerId)}`, { method: 'PATCH', body: JSON.stringify({ ownerId }) });
      toast(ownerId ? 'Routeur attribué au client.' : 'Routeur retiré du client.');
      await loadPage('users');
      return openClientRouters(clientId, userName);
    } catch (error) { toast(error.message, true); }
    return;
  }
  if (button.dataset.walletUser) return openAdminWallet(button.dataset.walletUser, button.dataset.userName || 'Client');
  if (button.dataset.walletAdjustUser) { $('#modal-root').innerHTML = ''; return walletAdjustmentModal(button.dataset.walletAdjustUser, button.dataset.userName || 'Client'); }
  if (button.dataset.adminRouterOffers) { $('#modal-root').innerHTML = ''; state.selectedRouter = button.dataset.adminRouterOffers; return loadPage('router-offers'); }
  if (button.dataset.downloadPortal) return downloadPortal(button.dataset.downloadPortal);
  if (button.dataset.routerPortal) { state.selectedRouter = button.dataset.routerPortal; return loadPage('portal'); }
  if (button.dataset.routerOffers) { state.selectedRouter = button.dataset.routerOffers; return loadPage('offers'); }
  if (button.dataset.offerToggle) {
    const offerId = button.dataset.offerToggle; const active = button.dataset.active === 'true';
    try { await request(`/offers/${encodeURIComponent(offerId)}`, { method: 'PATCH', body: JSON.stringify({ active: !active }) }); toast(active ? 'Forfait désactivé.' : 'Forfait activé.'); loadPage('offers'); }
    catch (error) { toast(error.message, true); } return;
  }
  if (button.dataset.adminOffer) {
    const offerId = button.dataset.adminOffer; const routerId = button.dataset.routerId; const enabled = button.dataset.enabled === 'true';
    try { await request(`/routers/${encodeURIComponent(routerId)}/offers/${encodeURIComponent(offerId)}`, { method: enabled ? 'DELETE' : 'POST' }); toast(enabled ? 'Forfait retiré du routeur.' : 'Forfait activé sur le routeur.'); loadPage('router-offers'); }
    catch (error) { toast(error.message, true); }
  }
  if (button.dataset.offerEdit) {
    const offerId = button.dataset.offerEdit;
    try { const offer = await request(`/offers/${encodeURIComponent(offerId)}`); modal('Modifier le forfait', `<form id="offer-edit-form" class="form-grid"><label class="field">Nom<input name="name" value="${esc(offer.name)}" required></label><label class="field">Prix (FCFA)<input name="price" type="number" min="0" value="${esc(offer.price)}" required></label><label class="field">Durée (minutes)<input name="durationMinutes" type="number" min="1" value="${esc(offer.durationMinutes || '')}"></label><label class="field">Volume (Mo)<input name="dataLimitMb" type="number" min="1" value="${esc(offer.dataLimitMb || '')}"></label><label class="field">Profil MikroTik<input name="profileName" value="${esc(offer.profileName || '')}" required></label><div class="form-actions full"><button class="button secondary" type="button" data-close-modal>Annuler</button><button class="button primary">Enregistrer</button></div></form>`); $('#offer-edit-form').addEventListener('submit', async (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); for (const key of ['price', 'durationMinutes', 'dataLimitMb']) data[key] = data[key] === '' ? undefined : Number(data[key]); try { await request(`/offers/${encodeURIComponent(offerId)}`, { method: 'PATCH', body: JSON.stringify(data) }); $('#modal-root').innerHTML = ''; toast('Forfait modifié.'); loadPage('offers'); } catch (error) { toast(error.message, true); } }); }
    catch (error) { toast(error.message, true); } return;
  }
  if (button.dataset.roleId) {
    const nextRole = button.dataset.role;
    if (!confirm(`Confirmer le changement de rôle vers ${nextRole} ?`)) return;
    try { await request(`/users/${encodeURIComponent(button.dataset.roleId)}/role`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) }); toast('Rôle mis à jour.'); loadPage('users'); }
    catch (error) { toast(error.message, true); } return;
  }
  if (button.dataset.withdrawSubmit) {
    const reference = button.dataset.withdrawSubmit;
    if (!confirm('Soumettre cette demande de retrait au prestataire de paiement ?')) return;
    try { await request(`/wallet/admin/withdrawals/${encodeURIComponent(reference)}/submit`, { method: 'POST' }); toast('Demande transmise.'); loadPage('finances'); }
    catch (error) { toast(error.message, true); } return;
  }
});

if (state.token) {
  const claims = decodeToken(state.token); state.role = claims.role;
  loadProfile().then(() => { if (!state.role) state.role = state.user?.role; if (['ADMIN', 'USER'].includes(state.role)) startApp(); else logout(false); }).catch(() => logout(false));
}
