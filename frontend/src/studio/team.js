// Team: who can use Studio. People sign in once at /admin with Google, then an admin sets their role.
import { api } from './api.js';
import { $, esc, ago } from './util.js';

const ROLES = { user: 'No Studio access', editor: 'Editor: places, events, live, moderation', admin: 'Admin: everything + team' };

export default async function team(el, ctx) {
  const users = await api.get('/accounts/v1/users');
  el.innerHTML = `<div class="card st-panel"><div class="st-list-head"><h1>Team</h1></div>
    <p class="muted">To add someone: ask them to open <b>${esc(location.origin)}/admin</b> and sign in with Google once. They’ll appear here; then give them a role.</p>
    <div class="st-table" role="table" aria-label="Accounts">
      <div class="st-tr st-th" role="row"><span role="columnheader">Name</span><span role="columnheader">Email</span><span role="columnheader">Last sign-in</span><span role="columnheader">Role</span></div>
      ${users.map(u => `<div class="st-tr" role="row"><span role="cell"><b>${esc(u.name)}</b></span><span role="cell">${esc(u.email)}</span><span role="cell">${ago(u.last_login_at)}</span>
        <span role="cell"><select class="st-input" data-id="${u.id}" aria-label="Role for ${esc(u.name)}" ${u.id === ctx.user.id ? 'disabled title="You can’t change your own role"' : ''}>${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></span></div>`).join('')}
    </div></div>`;
  el.querySelector('.st-table').addEventListener('change', async e => {
    const s = e.target.closest('select'); if (!s) return;
    try { const u = await api.patch(`/accounts/v1/users/${s.dataset.id}/role`, { role: s.value }); ctx.snack(`${u.name} is now ${u.role === 'user' ? 'without Studio access' : 'an ' + u.role}`); }
    catch (err) { ctx.snack(`Couldn’t change the role: ${err.message}`); }
  });
}
