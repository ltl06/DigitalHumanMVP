import { create } from 'zustand';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface JobStore {
  currentJobId: string | null;
  currentJobName: string;
  notifications: Notification[];
  sidebarOpen: boolean;
  setCurrentJob: (id: string | null, name?: string) => void;
  addNotification: (type: Notification['type'], message: string) => void;
  removeNotification: (id: string) => void;
  toggleSidebar: () => void;
  clearCurrentJob: () => void;
}

interface TimeoutEntry {
  id: string;
  timeoutId: ReturnType<typeof setTimeout>;
}

const _activeTimeouts: TimeoutEntry[] = [];

function _clearAllTimeouts() {
  for (const entry of _activeTimeouts) {
    clearTimeout(entry.timeoutId);
  }
  _activeTimeouts.length = 0;
}

export const useJobStore = create<JobStore>((set) => ({
  currentJobId: null,
  currentJobName: '',

  notifications: [],

  sidebarOpen: false,

  setCurrentJob: (id, name = '') =>
    set({ currentJobId: id, currentJobName: name }),

  addNotification: (type, message) => {
    const id = `${Date.now()}-${Math.random()}`;
    const timeoutId = setTimeout(() => {
      set((s) => ({
        notifications: s.notifications.filter((n) => n.id !== id),
      }));
      const idx = _activeTimeouts.findIndex((e) => e.id === id);
      if (idx !== -1) _activeTimeouts.splice(idx, 1);
    }, 5000);
    _activeTimeouts.push({ id, timeoutId });
    set((s) => ({
      notifications: [...s.notifications, { id, type, message }],
    }));
  },

  removeNotification: (id) => {
    const idx = _activeTimeouts.findIndex((e) => e.id === id);
    if (idx !== -1) {
      clearTimeout(_activeTimeouts[idx].timeoutId);
      _activeTimeouts.splice(idx, 1);
    }
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  clearCurrentJob: () => set({ currentJobId: null, currentJobName: '' }),
}));
