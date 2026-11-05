import { useState } from 'react';
import { api } from './api';
import { PasswordInput } from './ui';

const DEPTS = ['Information Technology', 'Computer Science', 'Electronics', 'Mechanical', 'Civil', 'Management', 'Other'];
const resetToken = new URLSearchParams(location.search).get('reset'); // set when a student opens the link from the email
const TITLES = { login: 'Welcome back', register: 'Student sign up', forgot: 'Forgot your password?', reset: 'Choose a new password' };

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login'), [err, setErr] = useState(''), [info, setInfo] = useState(''), [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', studentId: '', department: DEPTS[0], remember: true });
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const to = m => e => { e.preventDefault(); setMode(m); setErr(''); setInfo(''); };
  const go = async e => {
    e.preventDefault(); setErr(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'forgot') setInfo((await api('/auth/forgot', 'POST', { email: f.email })).message);
      else if (mode === 'reset') {
        const d = await api('/auth/reset', 'POST', { token: resetToken, password: f.password });
        history.replaceState(null, '', location.pathname); setF({ ...f, password: '' }); setMode('login'); setInfo(d.message);
      } else onLogin(await api(mode === 'register' ? '/auth/register' : '/auth/login', 'POST', f), f.remember);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const spines = Array.from({ length: 16 }, (_, i) => ({ h: (i * 47) % 360, t: 120 + ((i * 53) % 110) }));
  return (
    <div className="auth">
      <section className="hero">
        <h1>Chapter One</h1>
        <p>Your next adventure starts here. One library, a million possibilities.</p>
        <div className="shelf">{spines.map((s, i) => <span key={i} style={{ '--h': s.h, '--t': s.t }} />)}</div>
      </section>
      <form className="card authform" onSubmit={go}>
        <h2>{TITLES[mode]}</h2>
        {mode === 'forgot' && <p className="muted">Enter your registered email and we will send you a link to update your password.</p>}
        {mode === 'register' && <>
          <input placeholder="Full name" autoComplete="name" value={f.name} onChange={set('name')} required />
          <div className="two">
            <input placeholder="Student ID" value={f.studentId} onChange={set('studentId')} required />
            <select value={f.department} onChange={set('department')}>{DEPTS.map(d => <option key={d}>{d}</option>)}</select>
          </div>
        </>}
        {mode !== 'reset' && <input type="email" placeholder="Email" name="email" autoComplete="username" value={f.email} onChange={set('email')} required />}
        {mode !== 'forgot' && <PasswordInput name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder={mode === 'login' ? 'Password' : 'New password (6+ characters)'} value={f.password} onChange={set('password')} required />}
        {mode === 'login' && <div className="opts">
          <label><input type="checkbox" checked={f.remember} onChange={set('remember')} /> Remember me</label>
          <a href="#" onClick={to('forgot')}>Forgot password?</a>
        </div>}
        {err && <p className="err" role="alert">{err}</p>}
        {info && <p className="note" role="status">{info}</p>}
        <button type="submit" className="btn" disabled={busy}>{{ login: 'Log in', register: 'Create account', forgot: 'Email me a link', reset: 'Update password' }[mode]}</button>        {mode === 'login' && <p className="muted">New student? <a href="#" onClick={to('register')}>Create an account</a></p>}
        {mode !== 'login' && <p className="muted"><a href="#" onClick={to('login')}>Back to log in</a></p>}
      </form>
    </div>
  );
}
