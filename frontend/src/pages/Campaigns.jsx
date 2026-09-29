import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Send, XCircle, Calendar, RefreshCw, Eye } from 'lucide-react';
import { getCampaigns, createCampaign, deleteCampaign, cancelCampaign, getLists, getTemplates } from '../api';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';

export default function Campaigns() {
  const toast = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [lists, setLists]         = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm] = useState({
    name: '', subject: '', content: '', contact_list: '', scheduled_at: '',
  });

  const load = () => {
    setLoading(true);
    Promise.all([getCampaigns(), getLists(), getTemplates()])
      .then(([c, l, t]) => { setCampaigns(c.data); setLists(l.data); setTemplates(t.data); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        subject: form.subject,
        content: form.content,
        contact_list: Number(form.contact_list),
        ...(form.scheduled_at ? { scheduled_at: new Date(form.scheduled_at).toISOString() } : {}),
      };
      await createCampaign(payload);
      toast.success(form.scheduled_at ? 'Campaign scheduled' : 'Campaign queued for sending');
      setShowAdd(false);
      setForm({ name: '', subject: '', content: '', contact_list: '', scheduled_at: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.contact_list?.[0] || 'Failed to create campaign');
    } finally { setSaving(false); }
  };

  const handleCancel = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Cancel this scheduled campaign?')) return;
    try {
      await cancelCampaign(id);
      toast.success('Campaign cancelled');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to cancel'); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this campaign?')) return;
    await deleteCampaign(id);
    toast.success('Campaign deleted');
    load();
  };

  const applyTemplate = (id) => {
    const tpl = templates.find(t => t.id === Number(id));
    if (tpl) setForm(f => ({ ...f, subject: tpl.subject, content: tpl.content }));
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Campaigns</div>
          <div className="page-subtitle">{campaigns.length} total campaigns</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={load}><RefreshCw size={15} /></button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> New Campaign
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th>Scheduled</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}><div className="loading-center"><div className="spinner" /></div></td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={5}>
                <div className="empty-state">
                  <div className="empty-icon"><Send size={28} /></div>
                  <div className="empty-title">No campaigns yet</div>
                  <div className="empty-desc">Create your first campaign to start reaching your audience.</div>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={14} /> New Campaign</button>
                </div>
              </td></tr>
            ) : campaigns.map(c => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/campaigns/${c.id}`)}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }} className="truncate">{c.subject}</div>
                </td>
                <td><StatusBadge status={c.status} /></td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : '—'}
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" title="View" onClick={() => navigate(`/campaigns/${c.id}`)}>
                      <Eye size={14} />
                    </button>
                    {c.status === 'SCHEDULED' && (
                      <button className="btn btn-ghost btn-sm" title="Cancel" onClick={e => handleCancel(c.id, e)}
                        style={{ color: 'var(--warning)' }}>
                        <XCircle size={14} />
                      </button>
                    )}
                    {['DRAFT', 'CANCELLED', 'FAILED', 'SENT', 'PARTIAL'].includes(c.status) && (
                      <button className="btn btn-ghost btn-sm" title="Delete" onClick={e => handleDelete(c.id, e)}
                        style={{ color: 'var(--danger)' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Campaign Modal */}
      {showAdd && (
        <Modal
          title="New Campaign"
          size="lg"
          onClose={() => setShowAdd(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate}
              disabled={saving || !form.name || !form.subject || !form.content || !form.contact_list}>
              {saving ? <span className="spinner" /> : <Send size={14} />}
              {form.scheduled_at ? 'Schedule' : 'Send Now'}
            </button>
          </>}
        >
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Campaign Name *</label>
              <input className="form-input" placeholder="e.g. October Newsletter"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Contact List *</label>
              <select className="form-select form-input" value={form.contact_list}
                onChange={e => setForm(f => ({ ...f, contact_list: e.target.value }))}>
                <option value="">— Select a list —</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.contacts.length} contacts)</option>)}
              </select>
            </div>
          </div>

          {templates.length > 0 && (
            <div className="form-group">
              <label className="form-label">Load from Template (optional)</label>
              <select className="form-select form-input" onChange={e => applyTemplate(e.target.value)} defaultValue="">
                <option value="">— Choose a template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Subject *</label>
            <input className="form-input" placeholder="e.g. Hey {{first_name}}, here's what's new"
              value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
          </div>

          <div className="form-group">
            <label className="form-label">Email Content *</label>
            <textarea className="form-textarea" rows={7}
              placeholder={'Hi {{first_name}},\n\nYour message here...\n\nTo unsubscribe: {{unsubscribe_url}}'}
              value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Placeholders: <code>{'{{first_name}}'}</code> <code>{'{{last_name}}'}</code> <code>{'{{email}}'}</code> <code>{'{{unsubscribe_url}}'}</code>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} /> Schedule (optional — leave blank to send immediately)
            </label>
            <input className="form-input" type="datetime-local"
              value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
          </div>
        </Modal>
      )}
    </div>
  );
}
