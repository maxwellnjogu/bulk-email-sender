import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, FileText, RefreshCw, X, Check } from 'lucide-react';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../api';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';

export default function Templates() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ name: '', subject: '', content: '' });

  const load = () => {
    setLoading(true);
    getTemplates().then(r => setTemplates(r.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openEdit = (t) => { setEditing(t); setForm({ name: t.name, subject: t.subject, content: t.content }); setShowModal(true); };
  const openNew  = ()  => { setEditing(null); setForm({ name: '', subject: '', content: '' }); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await updateTemplate(editing.id, form);
      else         await createTemplate(form);
      toast.success(editing ? 'Template updated' : 'Template created');
      setShowModal(false);
      load();
    } catch { toast.error('Failed to save template'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this template?')) return;
    await deleteTemplate(id);
    toast.success('Template deleted');
    load();
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Email Templates</div>
          <div className="page-subtitle">Reusable templates for your campaigns</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={load}><RefreshCw size={15} /></button>
          <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> New Template</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner spinner-lg" /></div>
      ) : templates.length === 0 ? (
        <div className="empty-state" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <div className="empty-icon"><FileText size={28} /></div>
          <div className="empty-title">No templates yet</div>
          <div className="empty-desc">Save reusable email templates to quickly spin up campaigns.</div>
          <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={14} /> New Template</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {templates.map(t => (
            <div key={t.id} className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={16} color="var(--success)" />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}><Edit2 size={13} /></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(t.id)} style={{ color: 'var(--danger)' }}><Trash2 size={13} /></button>
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{t.subject}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {t.content}
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                Updated {new Date(t.updated_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal
          title={editing ? 'Edit Template' : 'New Template'}
          size="lg"
          onClose={() => setShowModal(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}><X size={14} /> Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name || !form.subject || !form.content}>
              {saving ? <span className="spinner" /> : <Check size={14} />}
              {editing ? 'Save Changes' : 'Create Template'}
            </button>
          </>}
        >
          <div className="form-group">
            <label className="form-label">Template Name *</label>
            <input className="form-input" placeholder="e.g. Monthly Newsletter"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Subject *</label>
            <input className="form-input" placeholder="e.g. Hey {{first_name}}, check this out!"
              value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Content *</label>
            <textarea className="form-textarea" rows={10}
              placeholder={'Hi {{first_name}},\n\nYour content here...\n\nTo unsubscribe: {{unsubscribe_url}}'}
              value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Placeholders: <code>{'{{first_name}}'}</code> <code>{'{{last_name}}'}</code> <code>{'{{email}}'}</code> <code>{'{{unsubscribe_url}}'}</code>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
