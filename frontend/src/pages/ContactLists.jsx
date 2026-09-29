import { useState, useEffect } from 'react';
import { Plus, Trash2, Users, RefreshCw } from 'lucide-react';
import { getLists, createList, deleteList, getContacts } from '../api';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';

export default function ContactLists() {
  const toast = useToast();
  const [lists, setLists]         = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ name: '', description: '', contacts: [] });

  const load = () => {
    setLoading(true);
    Promise.all([getLists(), getContacts()])
      .then(([l, c]) => { setLists(l.data); setContacts(c.data); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createList(form);
      toast.success('List created');
      setShowAdd(false);
      setForm({ name: '', description: '', contacts: [] });
      load();
    } catch { toast.error('Failed to create list'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this list? Campaigns using it won\'t be affected.')) return;
    await deleteList(id);
    toast.success('List deleted');
    load();
  };

  const toggleContact = (id) => {
    setForm(f => ({
      ...f,
      contacts: f.contacts.includes(id)
        ? f.contacts.filter(c => c !== id)
        : [...f.contacts, id],
    }));
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Contact Lists</div>
          <div className="page-subtitle">{lists.length} lists</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={load}><RefreshCw size={15} /></button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> New List
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner spinner-lg" /></div>
      ) : lists.length === 0 ? (
        <div className="empty-state" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <div className="empty-icon"><List size={28} /></div>
          <div className="empty-title">No lists yet</div>
          <div className="empty-desc">Organise your contacts into lists for targeted campaigns.</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Create List</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {lists.map(l => (
            <div key={l.id} className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={16} color="var(--purple-light)" />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{l.name}</span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(l.id)} style={{ color: 'var(--danger)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
              {l.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{l.description}</p>}
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{l.contacts.length}</span> contacts
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal
          title="New Contact List"
          onClose={() => setShowAdd(false)}
          size="lg"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !form.name}>
              {saving ? <span className="spinner" /> : <Plus size={14} />} Create List
            </button>
          </>}
        >
          <div className="form-group">
            <label className="form-label">List Name *</label>
            <input className="form-input" placeholder="e.g. Newsletter subscribers"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" placeholder="Optional description"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Add contacts ({form.contacts.length} selected)</label>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              {contacts.length === 0
                ? <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No contacts available</div>
                : contacts.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', cursor: 'pointer', borderRadius: 6, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <input type="checkbox" checked={form.contacts.includes(c.id)} onChange={() => toggleContact(c.id)}
                      style={{ accentColor: 'var(--purple-primary)', width: 15, height: 15 }} />
                    <span style={{ fontSize: 14 }}>{c.email}</span>
                    {(c.first_name || c.last_name) && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{`${c.first_name} ${c.last_name}`.trim()}</span>
                    )}
                  </label>
                ))
              }
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
