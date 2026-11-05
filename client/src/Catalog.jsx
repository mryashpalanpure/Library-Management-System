import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { Cover, Modal, useToast } from './ui';

function BookForm({ book, onDone }) {
  const toast = useToast();
  const [f, setF] = useState(book || { title: '', author: '', genre: '', isbn: '', shelf: '', year: '', copies: 1, description: '' });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async e => {
    e.preventDefault();
    try { await api(book ? '/books/' + book._id : '/books', book ? 'PUT' : 'POST', f); toast(book ? 'Book updated' : 'Book added'); onDone(); } catch (x) { toast(x.message, 1); }
  };
  return (
    <form className="formgrid" onSubmit={save}>
      <input placeholder="Title" value={f.title} onChange={set('title')} required />
      <input placeholder="Author" value={f.author} onChange={set('author')} required />
      <input placeholder="Genre (e.g. Fiction)" value={f.genre} onChange={set('genre')} />
      <input placeholder="ISBN" value={f.isbn || ''} onChange={set('isbn')} />
      <input placeholder="Shelf (e.g. C-02)" value={f.shelf || ''} onChange={set('shelf')} />
      <input type="number" placeholder="Year" value={f.year || ''} onChange={set('year')} />
      <input type="number" min="1" placeholder="Copies" value={f.copies} onChange={set('copies')} />
      <textarea className="wide" rows="3" placeholder="Short description" value={f.description || ''} onChange={set('description')} />
      <button type="submit" className="btn wide">{book ? 'Save changes' : 'Add book'}</button>    </form>
  );
}

export default function Catalog({ user }) {
  const admin = user.role === 'admin', toast = useToast();
  const [books, setBooks] = useState([]), [res, setRes] = useState([]), [q, setQ] = useState(''), [genre, setGenre] = useState('All');
  const [open, setOpen] = useState(null), [form, setForm] = useState(null);
  const load = useCallback(() => {
    api('/books?q=' + encodeURIComponent(q)).then(setBooks).catch(e => toast(e.message, 1));
    if (!admin) api('/reservations').then(setRes).catch(() => { });
  }, [q, admin, toast]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  const act = async (fn, ok) => { try { await fn(); toast(ok); load(); } catch (e) { toast(e.message, 1); } };
  const genres = ['All', ...new Set(books.map(b => b.genre))];
  const b = books.find(x => x._id === open);

  const actions = () => {
    if (admin) return <div className="acts">
      <button className="btn sm" onClick={() => { setForm(b); setOpen(null); }}>Edit book</button>
      <button className="btn sm danger" onClick={() => confirm('Delete this book?') && act(async () => { await api('/books/' + b._id, 'DELETE'); setOpen(null); }, 'Book deleted')}>Delete</button>
    </div>;
    const ready = res.find(r => r.book?._id === b._id && r.status === 'ready'), wait = res.find(r => r.book?._id === b._id && r.status === 'waiting');
    const borrow = label => <button className="btn" onClick={() => act(() => api('/loans', 'POST', { bookId: b._id }), 'Borrowed. Due in 14 days')}>{label}</button>;
    if (ready) return borrow('Borrow your reserved copy');
    if (b.available > 0) return borrow('Borrow this book');
    if (wait) return <button className="btn" disabled>Reserved · you are #{wait.position} in the queue</button>;
    return <button className="btn ghost" onClick={() => act(() => api('/reservations', 'POST', { bookId: b._id }), 'Reserved. We will hold a copy for you')}>Reserve this book</button>;
  };

  return (
    <>
      <div className="bar">
        <input className="search" placeholder="Search by title, author, genre or ISBN" value={q} onChange={e => setQ(e.target.value)} />
        <div className="chips">{genres.map(g => <button key={g} className={g === genre ? 'chip on' : 'chip'} onClick={() => setGenre(g)}>{g}</button>)}</div>
        {admin && <button className="btn sm addbtn" onClick={() => setForm({})}>Add a book</button>}
      </div>
      {!books.length && <p className="empty">No books match that search. Try a different title, author or ISBN.</p>}
      <div className="grid">
        {books.filter(x => genre === 'All' || x.genre === genre).map(x => (
          <div
            key={x._id}
            className="book"
            role="button"
            tabIndex={0}
            onClick={() => setOpen(x._id)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(x._id)}
          >            <Cover b={x} />
            <span className={x.available ? 'badge ok' : 'badge no'}>{x.available ? `${x.available} of ${x.copies} available` : 'All copies out'}</span>
          </div>
        ))}
      </div>
      {b && <Modal title={b.title} onClose={() => setOpen(null)}>
        <div className="detail"><Cover b={b} />
          <div>
            <p className="muted">{b.author} · {b.genre}{b.year ? ' · ' + b.year : ''}</p>
            <p>{b.description || 'No description yet.'}</p>
            <dl><dt>Shelf</dt><dd>{b.shelf || '–'}</dd><dt>ISBN</dt><dd>{b.isbn || '–'}</dd><dt>Copies</dt><dd>{b.available} of {b.copies} available</dd></dl>
            {actions()}
          </div>
        </div>
      </Modal>}
      {form && <Modal title={form._id ? 'Edit book' : 'Add a book'} onClose={() => setForm(null)}>
        <BookForm book={form._id ? form : null} onDone={() => { setForm(null); load(); }} />
      </Modal>}
    </>
  );
}
