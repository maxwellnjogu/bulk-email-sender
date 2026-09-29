import { useState, useEffect, useRef } from 'react';
import { Plus, Search, Trash2, UserMinus, Upload, RefreshCw } from 'lucide-react';
import { getContacts, createContact, deleteContact, unsubContact, importCSV } from '../api';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';

export default function Contacts() {
  const toast = useToast();
  const [contacts, setContacts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm]           = useState({ email: '', first_name: '', last_name: '' });
  const [saving, setSaving]       = useState(false);
  const [csvFile, setCsvFile]     = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef();

  const load = () => {
    setLoading(true);
    getContacts()
      .then(r => setContacts(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = contacts.filter(c =>
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createContact(form);
      toast.success('Contact added');
      setShowAdd(false);
      setForm({ email: '', first_name: '', last_name: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.email?.[0] || 'Failed to add contact');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this contact?')) return;
    await deleteContact(id);
    toast.success('Contact deleted');
    load();
  };

  const handleUnsub = async (id) => {
    await unsubContact(id);
    toast.success('Contact unsubscribed');
    load();
  };

  const handleImport = async () => {
    if (!csvFile) return;
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', csvFile);
    try {
      const { data } = await importCSV(fd);
      setImportResult(data);
      toast.success(`Imported ${data.created} contacts`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally { setImporting(false); }
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Contacts</div>
          <div className="page-subtitle">{contacts.length} total contacts</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
            <Upload size={15} /> Import CSV
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add Contact
          </button>
        </div>
      </div>

      {/* Search + refresh */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <div className="search-bar">
          <Search size={15} />
          <input
            placeholder="Search contacts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-ghost" onClick={load}><RefreshCw size={15} /></button>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Status</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}><div className="loading-center"><div className="spinner" /></div></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5}>
                <div className="empty-state">
                  <div className="empty-title">{search ? 'No matches' : 'No contacts yet'}</div>
                  <div className="empty-desc">{search ? 'Try a different search term.' : 'Add contacts or import a CSV file.'}</div>
                </div>
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 500 }}>{c.email}</td>
                <td style={{ color: 'var(--text-secondary)' }}>
                  {`${c.first_name} ${c.last_name}`.trim() || '—'}
                </td>
                <td>
                  <span className={`badge ${c.is_subscribed ? 'badge-sent' : 'badge-cancelled'}`}>
                    {c.is_subscribed ? 'Subscribed' : 'Unsubscribed'}
                  </span>
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {c.is_subscribed && (
                      <button className="btn btn-ghost btn-sm" title="Unsubscribe" onClick={() => handleUnsub(c.id)}>
                        <UserMinus size={14} />
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => handleDelete(c.id)}
                      style={{ color: 'var(--danger)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Contact Modal */}
      {showAdd && (
        <Modal
          title="Add Contact"
          onClose={() => setShowAdd(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
              {saving ? <span className="spinner" /> : <Plus size={14} />} Add Contact
            </button>
          </>}
        >
          <div className="form-group">
            <label className="form-label">Email *</label>
            <input className="form-input" type="email" placeholder="jane@example.com"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">First name</label>
              <input className="form-input" placeholder="Jane"
                value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Last name</label>
              <input className="form-input" placeholder="Doe"
                value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}

      {/* Import CSV Modal */}
      {showImport && (
        <Modal
          title="Import CSV"
          onClose={() => { setShowImport(false); setImportResult(null); setCsvFile(null); }}
          footer={<>
            <button className="btn btn-secondary" onClick={() => { setShowImport(false); setImportResult(null); setCsvFile(null); }}>Close</button>
            <button className="btn btn-primary" onClick={handleImport} disabled={!csvFile || importing}>
              {importing ? <span className="spinner" /> : <Upload size={14} />} Import
            </button>
          </>}
        >
          <div
            className={`file-drop ${csvFile ? 'dragging' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); setCsvFile(e.dataTransfer.files[0]); setImportResult(null); }}
          >
            <Upload size={28} color="var(--text-muted)" />
            {csvFile
              ? <span style={{ color: 'var(--purple-light)', fontWeight: 600 }}>{csvFile.name}</span>
              : <>
                  <span style={{ fontWeight: 600 }}>Drop CSV file here or click to browse</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Required column: <code>email</code>. Optional: <code>first_name</code>, <code>last_name</code>
                  </span>
                </>
            }
          </div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { setCsvFile(e.target.files[0]); setImportResult(null); }} />

          {importResult && (
            <div className="alert alert-success">
              ✅ Created <b>{importResult.created}</b> · Skipped <b>{importResult.skipped}</b>
              {importResult.errors?.length > 0 && (
                <span> · <b>{importResult.errors.length}</b> errors</span>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
