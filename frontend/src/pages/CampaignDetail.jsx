import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart2, XCircle, Calendar, RefreshCw } from 'lucide-react';
import { getCampaign, getCampaignAnalytics, cancelCampaign, rescheduleCampaign } from '../api';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [campaign, setCampaign]     = useState(null);
  const [analytics, setAnalytics]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showReschedule, setShowReschedule] = useState(false);
  const [newTime, setNewTime]       = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getCampaign(id), getCampaignAnalytics(id)])
      .then(([c, a]) => { setCampaign(c.data); setAnalytics(a.data); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleCancel = async () => {
    if (!confirm('Cancel this campaign?')) return;
    try {
      await cancelCampaign(id);
      toast.success('Campaign cancelled');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleReschedule = async () => {
    if (!newTime) return;
    setRescheduling(true);
    try {
      await rescheduleCampaign(id, new Date(newTime).toISOString());
      toast.success('Campaign rescheduled');
      setShowReschedule(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to reschedule'); }
    finally { setRescheduling(false); }
  };

  if (loading) return <div className="page loading-center"><div className="spinner spinner-lg" /></div>;
  if (!campaign) return <div className="page"><div className="empty-state"><div className="empty-title">Campaign not found</div></div></div>;

  const total = analytics?.total || 0;
  const sent  = analytics?.sent  || 0;
  const failed= analytics?.failed|| 0;
  const rate  = total > 0 ? Math.round((sent / total) * 100) : 0;

  return (
    <div className="page animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost" onClick={() => navigate('/campaigns')}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Created {new Date(campaign.created_at).toLocaleString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={load}><RefreshCw size={15} /></button>
          {campaign.status === 'SCHEDULED' && <>
            <button className="btn btn-secondary" onClick={() => setShowReschedule(true)}>
              <Calendar size={15} /> Reschedule
            </button>
            <button className="btn btn-danger" onClick={handleCancel}>
              <XCircle size={15} /> Cancel
            </button>
          </>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
        {/* Left: details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Campaign info */}
          <div className="card" style={{ padding: 24 }}>
            <div className="section-title">Campaign Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { label: 'Subject',    value: campaign.subject },
                { label: 'Status',     value: <StatusBadge status={campaign.status} /> },
                { label: 'Scheduled',  value: campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : 'Immediate' },
                { label: 'Updated',    value: new Date(campaign.updated_at).toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 14 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>Email Content</div>
              <pre style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', background: 'var(--bg-elevated)', padding: 16, borderRadius: 8, border: '1px solid var(--border)', lineHeight: 1.7 }}>
                {campaign.content}
              </pre>
            </div>
          </div>
        </div>

        {/* Right: analytics */}
        <div className="card" style={{ padding: 24 }}>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={16} color="var(--purple-primary)" /> Analytics
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total',   value: total,  color: 'var(--text-primary)' },
              { label: 'Sent',    value: sent,   color: 'var(--success)' },
              { label: 'Failed',  value: failed, color: 'var(--danger)' },
              { label: 'Pending', value: analytics?.pending || 0, color: 'var(--warning)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="analytics-card">
                <div className="analytics-card-value" style={{ color }}>{value}</div>
                <div className="analytics-card-label">{label}</div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Delivery rate</span>
              <span style={{ fontWeight: 700, color: rate > 90 ? 'var(--success)' : rate > 60 ? 'var(--warning)' : 'var(--danger)' }}>
                {analytics?.success_rate || '0%'}
              </span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${rate}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Reschedule Modal */}
      {showReschedule && (
        <Modal
          title="Reschedule Campaign"
          onClose={() => setShowReschedule(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowReschedule(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleReschedule} disabled={!newTime || rescheduling}>
              {rescheduling ? <span className="spinner" /> : <Calendar size={14} />} Reschedule
            </button>
          </>}
        >
          <div className="form-group">
            <label className="form-label">New Send Time</label>
            <input className="form-input" type="datetime-local" value={newTime}
              onChange={e => setNewTime(e.target.value)} />
          </div>
          {campaign.scheduled_at && (
            <div className="alert alert-warning">
              Current time: {new Date(campaign.scheduled_at).toLocaleString()}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
