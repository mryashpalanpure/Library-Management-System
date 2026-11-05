import { createContext, useContext, useEffect, useState } from 'react';
import { hue } from './api';
export const ToastCtx = createContext(() => { });
export const useToast = () => useContext(ToastCtx);

export const Cover = ({ b, mini }) => (
  <div className={'cover' + (mini ? ' mini' : '')} style={{ '--h': hue(b.title) }}>
    <i className="spine" /><h4>{b.title}</h4><p>{b.author}</p>
  </div>
);

export function Modal({ title, onClose, children }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="scrim" role="presentation" onClick={onClose}>
      <div className="modal card" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <header><h3>{title}</h3><button className="x" onClick={onClose} aria-label="Close">×</button></header>
        {children}
      </div>
    </div>
  );
}

// Password box with a show / hide toggle
export function PasswordInput(props) {
  const [show, setShow] = useState(false), label = show ? 'Hide password' : 'Show password';
  return (
    <div className="pw">
      <input {...props} type={show ? 'text' : 'password'} />
      <button type="button" onClick={() => setShow(!show)} aria-label={label} aria-pressed={show} title={label}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{show && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  );
}
