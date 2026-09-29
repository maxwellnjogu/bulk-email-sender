import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Send, Users, List, FileText,
  ShieldOff, LogOut, Mail, BarChart2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const nav = [
  { label: 'Main', items: [
    { to: '/',           icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/campaigns',  icon: Send,            label: 'Campaigns' },
  ]},
  { label: 'Audience', items: [
    { to: '/contacts',       icon: Users,    label: 'Contacts' },
    { to: '/contact-lists',  icon: List,     label: 'Lists' },
    { to: '/suppression',    icon: ShieldOff,label: 'Suppression' },
  ]},
  { label: 'Content', items: [
    { to: '/templates', icon: FileText, label: 'Templates' },
  ]},
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = user?.username?.[0]?.toUpperCase() ?? 'U';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Mail size={18} color="white" />
        </div>
        <span>MailFlow</span>
      </div>

      <nav className="sidebar-nav">
        {nav.map(section => (
          <div key={section.label}>
            <div className="nav-section-label">{section.label}</div>
            {section.items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-card" onClick={handleLogout} title="Log out">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{user?.username}</div>
            <div className="user-email">Click to log out</div>
          </div>
          <LogOut size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </div>
      </div>
    </aside>
  );
}
