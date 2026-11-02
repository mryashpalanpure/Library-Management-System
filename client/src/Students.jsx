import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { useToast } from './ui';

export default function Students() {
  const toast = useToast(), [us, setUs] = useState([]), [q, setQ] = useState('');
  const load = useCallback(
    () => api('/users').then(setUs).catch(e => toast(e.message, 1)),
    [toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  const flip = async u => { try { await api(`/users/${u._id}/block`, 'PUT'); toast(u.blocked ? 'Student unblocked' : 'Student blocked'); load(); } catch (e) { toast(e.message, 1); } };
  const shown = us.filter(u => (u.name + u.studentId + u.email).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="bar"><input className="search" placeholder="Search by name, student ID or email" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="card tablewrap">
        <table>
          <thead><tr><th>Student</th><th>ID</th><th>Department</th><th>Books out</th><th>Fines due</th><th></th></tr></thead>
          <tbody>
            {shown.map(u => (
              <tr key={u._id}>
                <td><b>{u.name}</b><br /><span className="muted">{u.email}</span></td><td data-label="Student ID">{u.studentId}</td><td data-label="Department">{u.department}</td>
                <td data-label="Books out">{u.active} / 3</td><td data-label="Fines due">{u.owed ? <span className="badge no">₹{u.owed}</span> : '–'}</td>
                <td><button className={u.blocked ? 'btn sm' : 'btn sm ghost'} onClick={() => flip(u)}>{u.blocked ? 'Unblock' : 'Block'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="empty pad">No students found.</p>}
      </div>
    </>
  );
}
