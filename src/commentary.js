const app = document.querySelector('#commentary-app');

if (app) {
  const questionId = app.dataset.questionId;
  const status = app.querySelector('#commentary-status');
  const login = app.querySelector('#linkedin-login');
  const account = app.querySelector('#commentary-account');
  const memberName = app.querySelector('#commentary-member');
  const badge = app.querySelector('#commentary-badge');
  const logout = app.querySelector('#commentary-logout');
  const deleteAccount = app.querySelector('#commentary-delete-account');
  const form = app.querySelector('#commentary-form');
  const body = app.querySelector('#commentary-body');
  const consent = app.querySelector('#commentary-consent');
  const formStatus = app.querySelector('#commentary-form-status');
  const published = app.querySelector('#published-commentary');
  let csrfToken = null;

  async function getJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Request failed');
    return payload;
  }

  function renderComments(comments) {
    published.replaceChildren();
    if (!comments.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-commentary';
      empty.textContent = 'No perspectives have been published.';
      published.append(empty);
      return;
    }
    for (const comment of comments) {
      const item = document.createElement('li');
      const attribution = document.createElement('p');
      attribution.className = 'commentary-attribution';
      attribution.textContent = `${comment.contributor.name}${comment.contributor.verifiedIndustry ? ' · Verified industry contributor' : ' · LinkedIn-authenticated contributor'}`;
      const copy = document.createElement('p');
      copy.textContent = comment.body;
      item.append(attribution, copy);
      published.append(item);
    }
  }

  async function refreshComments() {
    const payload = await getJson(`/api/questions/${encodeURIComponent(questionId)}/comments`);
    renderComments(payload.comments || []);
  }

  async function refreshSession() {
    const session = await getJson('/api/session');
    csrfToken = session.csrfToken || null;
    if (!session.commentaryEnabled) {
      status.textContent = 'Commentary login is not active in this preview.';
      login.hidden = true;
      account.hidden = true;
      form.hidden = true;
      return;
    }
    if (!session.authenticated) {
      status.textContent = 'Sign in with LinkedIn to submit an identified perspective for editorial review.';
      login.hidden = false;
      account.hidden = true;
      form.hidden = true;
      return;
    }
    status.textContent = 'LinkedIn account authenticated. Every submission is moderated before publication.';
    login.hidden = true;
    account.hidden = false;
    form.hidden = false;
    memberName.textContent = session.member.name;
    badge.textContent = session.member.verifiedIndustry ? 'Verified industry contributor' : 'LinkedIn-authenticated';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    formStatus.textContent = 'Submitting for review…';
    try {
      await getJson(`/api/questions/${encodeURIComponent(questionId)}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ body: body.value, consent: consent.checked }),
      });
      body.value = '';
      consent.checked = false;
      formStatus.textContent = 'Submitted. It will appear only if an editor approves it.';
    } catch (error) {
      formStatus.textContent = error.message;
      if (/CSRF|Authentication/i.test(error.message)) await refreshSession().catch(() => {});
    } finally {
      submit.disabled = false;
    }
  });

  logout.addEventListener('click', async () => {
    logout.disabled = true;
    try {
      await getJson('/api/session/logout', { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
      await refreshSession();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      logout.disabled = false;
    }
  });

  deleteAccount.addEventListener('click', async () => {
    const confirmed = window.confirm('Permanently delete your commentary account and all submitted perspectives? This cannot be undone.');
    if (!confirmed) return;
    deleteAccount.disabled = true;
    try {
      await getJson('/api/account', { method: 'DELETE', headers: { 'x-csrf-token': csrfToken } });
      csrfToken = null;
      account.hidden = true;
      form.hidden = true;
      status.textContent = 'Your account and submitted perspectives were deleted.';
      await refreshComments();
    } catch (error) {
      status.textContent = error.message;
      deleteAccount.disabled = false;
    }
  });

  Promise.all([refreshComments(), refreshSession()]).catch(() => {
    status.textContent = 'Commentary is temporarily unavailable.';
    login.hidden = true;
    form.hidden = true;
  });
}
