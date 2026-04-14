import { useState, useEffect } from 'react';
import { Bell, Check, CheckCheck, Briefcase, IndianRupee, Gift, AlertTriangle, Info, Trash2 } from 'lucide-react';
import { useWorker } from '../WorkerContext';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../workerSupabase';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
}

export default function NotificationsSection() {
  const { showToast, t } = useWorker();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const res = await getNotifications();
      setNotifications(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      showToast('Failed to mark as read', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      showToast('All notifications marked as read', 'success');
    } catch (err) {
      showToast('Failed to mark all as read', 'error');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'job': return <Briefcase size={20} />;
      case 'payment': return <IndianRupee size={20} />;
      case 'promo': return <Gift size={20} />;
      case 'alert': return <AlertTriangle size={20} />;
      default: return <Info size={20} />;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'job': return '#3b82f6';
      case 'payment': return '#22c55e';
      case 'promo': return '#f59e0b';
      case 'alert': return '#ef4444';
      default: return '#0ceded';
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('time_just_now');
    if (minutes < 60) return `${minutes}${t('time_m_ago')}`;
    if (hours < 24) return `${hours}${t('time_h_ago')}`;
    if (days < 7) return `${days}${t('time_d_ago')}`;
    return date.toLocaleDateString();
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.isRead)
    : notifications;

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div>
      {/* Header */}
      <div className="w-glass w-card" style={{ marginBottom: 24 }}>
        <div className="w-card-header">
          <div className="w-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={20} className="icon" />
            {t('notifications') || 'Notifications'}
            {unreadCount > 0 && (
              <span style={{
                background: 'var(--error)',
                color: 'white',
                borderRadius: 12,
                padding: '2px 8px',
                fontSize: 12,
                fontWeight: 600,
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="w-btn w-btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}
            >
          <CheckCheck size={14} /> {t('mark_all_read')}
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              border: 'none',
              background: filter === 'all' ? 'var(--logo-accent)' : 'rgba(255,255,255,0.1)',
              color: filter === 'all' ? '#000' : 'var(--text-main)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('filter_all')} ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              border: 'none',
              background: filter === 'unread' ? 'var(--logo-accent)' : 'rgba(255,255,255,0.1)',
              color: filter === 'unread' ? '#000' : 'var(--text-main)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('filter_unread')} ({unreadCount})
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="w-glass w-card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            {t('loading_notifications')}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Bell size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
            <p>{t('no_notifications')}</p>
          </div>
        ) : (
          filteredNotifications.map((notification, idx) => (
            <div
              key={notification.id}
              onClick={() => !notification.isRead && handleMarkRead(notification.id)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                padding: 16,
                borderBottom: idx < filteredNotifications.length - 1 ? '1px solid var(--card-border)' : 'none',
                background: notification.isRead ? 'transparent' : 'rgba(12, 237, 237, 0.05)',
                cursor: notification.isRead ? 'default' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {/* Icon */}
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: `${getIconColor(notification.type)}20`,
                color: getIconColor(notification.type),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {getIcon(notification.type)}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h4 style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: notification.isRead ? 500 : 700,
                    color: 'var(--text-main)',
                  }}>
                    {notification.title}
                  </h4>
                  {!notification.isRead && (
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--logo-accent)',
                    }} />
                  )}
                </div>
                <p style={{
                  margin: 0,
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  lineHeight: 1.4,
                }}>
                  {notification.message}
                </p>
                <span style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginTop: 6,
                  display: 'block',
                }}>
                  {formatTime(notification.createdAt)}
                </span>
              </div>

              {/* Read indicator */}
              {notification.isRead && (
                <Check size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
