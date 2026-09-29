import { useState, useEffect } from 'react';
import { Plus, Trash2, ShieldOff, RefreshCw } from 'lucide-react';
import { getSuppression, createSuppression, deleteSuppression } from '../api';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';

const REASONS = ['UNSUBSCRIBED', 'BOUNCE', 'COMPLAINT', 'MANUAL'];

export default function Suppression() {
  const toast = useToast();
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ email: '', reason: 'MANUAL' });

  const load = () => {
    setLoading(true);
    getSuppression().then(r => setList(r.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createSuppression(form);
      toast.success('Email suppressed');
      setShowAdd(false);
      setForm({ email: '', reason: 'MANUAL' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.non_field_errors?.[0] || 'Already suppressed or invalid email');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove from suppression list?')) return;
    await deleteSuppression(id);
    toast.success('Removed from suppression');
    load();
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Suppression List</div>
          <div className="page-subtitle">{list.length} suppressed addresses</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={load}><RefreshCw size={15} /></button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add to Suppression
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Reason</th>
              <th>Suppressed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4}><div className="loading-center"><div className="spinner" /></div></td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={4}>
                <div className="empty-state">
                  <div className="empty-icon"><ShieldOff size={28} /></div>
                  <div className="empty-title">Suppression list is empty</div>
                  <div className="empty-desc">Bounced, complained, and unsubscribed emails are automatically added here.</div>
                </div>
              </td></tr>
            ) : list.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.email}</td>
                <td><StatusBadge status={s.reason} /></td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {new Date(s.created_at).toLocaleString()}
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                    onClick={() => handleDelete(s.id)} title="Remove from suppression">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal
          title="Add to Suppression"
          onClose={() => setShowAdd(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !form.email}>
              {saving ? <span className="spinner" /> : <ShieldOff size={14} />} Suppress
            </button>
          </>}
        >
          <div className="alert alert-warning">
            Suppressed emails will never receive campaigns, regardless of contact list membership.
          </div>
          <div className="form-group">
            <label className="form-label">Email Address *</label>
            <input className="form-input" type="email" placeholder="spammer@example.com"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <select className="form-select form-input" value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </Modal>
      )}
    </div>
  );
}
