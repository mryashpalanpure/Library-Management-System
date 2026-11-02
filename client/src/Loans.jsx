import { useState, useEffect, useCallback } from 'react';
import { api, fmt, loanState } from './api';
import { Cover, Modal, useToast } from './ui';

function Issue({ onClose, onDone }) {
  const toast = useToast();
  const [users, setUsers] = useState([]), [books, setBooks] = useState([]), [f, setF] = useState({ userId: '', bookId: '' });
  useEffect(() => { api('/users').then(setUsers); api('/books').then(setBooks); }, []);
  const go = async e => {
    e.preventDefault();
    try { await api('/loans', 'POST', f); toast('Book issued for 14 days'); onDone(); } catch (x) { toast(x.message, 1); }
  };
  return (
    <Modal title="Issue a book" onClose={onClose}>
      <form className="formgrid" onSubmit={go}>
        <select className="wide" required value={f.userId} onChange={e => setF({ ...f, userId: e.target.value })}>
          <option value="">Choose a student</option>{users.filter(u => !u.blocked).map(u => <option key={u._id} value={u._id}>{u.name} ({u.studentId})</option>)}
        </select>
        <select className="wide" required value={f.bookId} onChange={e => setF({ ...f, bookId: e.target.value })}>
          <option value="">Choose a book</option>{books.filter(b => b.available > 0).map(b => <option key={b._id} value={b._id}>{b.title} · {b.available} left</option>)}
        </select>
        <button className="btn wide">Issue book</button>
      </form>
    </Modal>
  );
}

export default function Loans({ user }) {
  const admin = user.role === 'admin', toast = useToast();
  const [loans, setLoans] = useState([]), [res, setRes] = useState([]), [tab, setTab] = useState('active'), [issue, setIssue] = useState(false);
  const load = useCallback(() => {
    api('/loans').then(setLoans).catch(e => toast(e.message, 1));
    api('/reservations').then(setRes).catch(() => { });
  }, [toast]);

  useEffect(load, [load]);
  const run = async (fn, ok) => { try { await fn(); toast(ok); load(); } catch (e) { toast(e.message, 1); } };
  const tabs = admin ? [['active', 'Active'], ['overdue', 'Overdue'], ['fines', 'Unpaid fines'], ['history', 'History'], ['res', 'Reservations']]
    : [['active', 'On loan'], ['res', 'Reservations'], ['history', 'History']];
  const now = Date.now();
  const filters = { active: l => !l.returnedAt, overdue: l => !l.returnedAt && new Date(l.dueAt) < now, fines: l => l.fine > 0 && !l.finePaid, history: l => l.returnedAt };
  const list = tab === 'res' ? res : loans.filter(filters[tab]);
  const who = x => admin && x.user ? `${x.user.name} (${x.user.studentId || 'staff'}) · ` : '';

  return (
    <>
      <div className="bar split">
        <div className="chips">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'chip on' : 'chip'} onClick={() => setTab(k)}>{l}</button>)}</div>
        {admin && <button className="btn sm" onClick={() => setIssue(true)}>Issue a book</button>}
      </div>
      {!list.length && <p className="empty">{tab === 'res' ? 'No active reservations.' : tab === 'active' && !admin ? 'You have no books on loan. Browse the catalogue to borrow one.' : 'Nothing here right now.'}</p>}
      {!!list.length && <div className="card table">
        {tab === 'res' ? list.map(r => (
          <div className="row" key={r._id}>
            <Cover b={r.book || { title: 'Removed', author: '' }} mini />
            <div className="info"><h4>{r.book?.title}</h4><p className="muted">{who(r)}Reserved {fmt(r.createdAt)}</p></div>
            <div className="acts">
              <span className={r.status === 'ready' ? 'badge ok' : 'badge warn'}>{r.status === 'ready' ? 'Ready. Borrow it now' : `Waiting · #${r.position} in queue`}</span>
              <button className="btn sm ghost" onClick={() => run(() => api('/reservations/' + r._id, 'DELETE'), 'Reservation cancelled')}>Cancel</button>
            </div>
          </div>
        )) : list.map(l => {
          const [c, t] = loanState(l);
          return (
            <div className="row" key={l._id}>
              <Cover b={l.book || { title: 'Removed', author: '' }} mini />
              <div className="info"><h4>{l.book?.title}</h4><p className="muted">{who(l)}Borrowed {fmt(l.issuedAt)}{l.renewals ? ' · renewed' : ''}</p></div>
              <div className="acts">
                <span className={'badge ' + c}>{t}</span>
                {l.fine > 0 && <span className={l.finePaid ? 'badge ok' : 'badge no'}>₹{l.fine} {l.finePaid ? 'paid' : 'fine'}</span>}
                {!l.returnedAt && <>
                  <button className="btn sm ghost" onClick={() => run(() => api(`/loans/${l._id}/renew`, 'PUT'), 'Renewed for 7 more days')}>Renew</button>
                  <button className="btn sm" onClick={() => run(() => api(`/loans/${l._id}/return`, 'PUT'), 'Book returned')}>Return</button>
                </>}
                {admin && l.returnedAt && l.fine > 0 && !l.finePaid && <button className="btn sm" onClick={() => run(() => api(`/loans/${l._id}/payfine`, 'PUT'), 'Fine marked as paid')}>Mark paid</button>}
              </div>
            </div>
          );
        })}
      </div>}
      {issue && <Issue onClose={() => setIssue(false)} onDone={() => { setIssue(false); load(); }} />}
    </>
  );
}
