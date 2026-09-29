import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Users, List, FileText, ShieldOff, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { getCampaigns, getContacts, getLists, getTemplates } from '../api';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';

const hour = new Date().getHours();
const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns]   = useState([]);
  const [contacts, setContacts]     = useState([]);
  const [lists, setLists]           = useState([]);
  const [templates, setTemplates]   = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([getCampaigns(), getContacts(), getLists(), getTemplates()])
      .then(([c, co, l, t]) => {
        setCampaigns(c.data);
        setContacts(co.data);
        setLists(l.data);
        setTemplates(t.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const sent    = campaigns.filter(c => c.status === 'SENT').length;
  const partial = campaigns.filter(c => c.status === 'PARTIAL').length;
  const sched   = campaigns.filter(c => c.status === 'SCHEDULED').length;
  const failed  = campaigns.filter(c => c.status === 'FAILED').length;

  const stats = [
    { label: 'Total Campaigns', value: campaigns.length, icon: Send,    color: '#7c3aed', bg: 'rgba(124,58,237,0.12)', gradient: 'linear-gradient(90deg,#7c3aed,#6d28d9)' },
    { label: 'Contacts',        value: contacts.length,  icon: Users,   color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', gradient: 'linear-gradient(90deg,#3b82f6,#2563eb)' },
    { label: 'Contact Lists',   value: lists.length,     icon: List,    color: '#10b981', bg: 'rgba(16,185,129,0.12)', gradient: 'linear-gradient(90deg,#10b981,#059669)' },
    { label: 'Templates',       value: templates.length, icon: FileText,color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', gradient: 'linear-gradient(90deg,#f59e0b,#d97706)' },
  ];

  const quickActions = [
    { label: 'New Campaign',  icon: Send,     to: '/campaigns',     color: '#7c3aed' },
    { label: 'Add Contact',   icon: Users,    to: '/contacts',      color: '#3b82f6' },
    { label: 'New Template',  icon: FileText, to: '/templates',     color: '#10b981' },
    { label: 'New List',      icon: List,     to: '/contact-lists', color: '#f59e0b' },
  ];

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">{greeting}, {user?.username}! 👋</div>
          <div className="page-subtitle">Here's what's happening with your campaigns.</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/campaigns')}>
          <Plus size={15} /> New Campaign
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {stats.map(({ label, value, icon: Icon, color, bg, gradient }) => (
          <div key={label} className="stat-card" style={{ '--gradient': gradient }}>
            <div className="stat-icon" style={{ background: bg }}>
              <Icon size={20} color={color} />
            </div>
            <div className="stat-value">{loading ? '—' : value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        {/* Recent Campaigns */}
        <div className="card">
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>Recent Campaigns</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/campaigns')}>
              View all <ArrowRight size={13} />
            </button>
          </div>
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : campaigns.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Send size={28} /></div>
              <div className="empty-title">No campaigns yet</div>
              <div className="empty-desc">Create your first campaign to start sending.</div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/campaigns')}>
                <Plus size={14} /> Create Campaign
              </button>
            </div>
          ) : (
            <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 8).map(c => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/campaigns/${c.id}`)}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }} className="truncate">{c.subject}</div>
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Campaign status breakdown */}
          <div className="card" style={{ padding: 20 }}>
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={16} color="var(--purple-primary)" /> Campaign Status
            </div>
            {[
              { label: 'Sent',      value: sent,    color: 'var(--success)' },
              { label: 'Partial',   value: partial, color: 'var(--warning)' },
              { label: 'Scheduled', value: sched,   color: 'var(--info)' },
              { label: 'Failed',    value: failed,  color: 'var(--danger)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontWeight: 700, color }}>{value}</span>
                </div>
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: campaigns.length ? `${(value / campaigns.length) * 100}%` : '0%',
                      background: color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="card" style={{ padding: 20 }}>
            <div className="section-title">Quick Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {quickActions.map(({ label, icon: Icon, to, color }) => (
                <button
                  key={label}
                  className="btn btn-secondary"
                  onClick={() => navigate(to)}
                  style={{ justifyContent: 'flex-start', gap: 10 }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={14} color={color} />
                  </div>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
