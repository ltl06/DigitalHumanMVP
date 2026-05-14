import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useJobStore } from '../stores/jobStore';

export default function NotificationToast() {
  const { notifications, removeNotification } = useJobStore();

  if (notifications.length === 0) return null;

  return (
    <div className="notification-container">
      {notifications.map((n) => (
        <div key={n.id} className={`notification-item ${n.type}`}>
          {n.type === 'success' && <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />}
          {n.type === 'error' && <XCircle size={16} style={{ color: 'var(--error)', flexShrink: 0 }} />}
          {n.type === 'info' && <Info size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
          <span style={{ flex: 1 }}>{n.message}</span>
          <button
            className="notification-close"
            onClick={() => removeNotification(n.id)}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
