import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8001/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh token on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const { data } = await axios.post('http://localhost:8001/api/token/refresh/', { refresh });
          localStorage.setItem('access_token', data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// ─── Auth ────────────────────────────────────────────────────────────────
export const login = (username, password) =>
  axios.post('http://localhost:8001/api/token/', { username, password });

export const register = (username, email, password) =>
  axios.post('http://localhost:8001/api/register/', { username, email, password });

// ─── Contacts ────────────────────────────────────────────────────────────
export const getContacts    = ()       => api.get('/contacts/');
export const createContact  = (data)   => api.post('/contacts/', data);
export const updateContact  = (id, d)  => api.patch(`/contacts/${id}/`, d);
export const deleteContact  = (id)     => api.delete(`/contacts/${id}/`);
export const unsubContact   = (id)     => api.post(`/contacts/${id}/unsubscribe/`);
export const importCSV      = (form)   => api.post('/contacts/import_csv/', form, {
  headers: { 'Content-Type': 'multipart/form-data' },
});

// ─── Contact Lists ────────────────────────────────────────────────────────
export const getLists    = ()      => api.get('/contact-lists/');
export const createList  = (data)  => api.post('/contact-lists/', data);
export const updateList  = (id, d) => api.patch(`/contact-lists/${id}/`, d);
export const deleteList  = (id)    => api.delete(`/contact-lists/${id}/`);

// ─── Campaigns ────────────────────────────────────────────────────────────
export const getCampaigns    = ()      => api.get('/campaigns/');
export const getCampaign     = (id)    => api.get(`/campaigns/${id}/`);
export const createCampaign  = (data)  => api.post('/campaigns/', data);
export const updateCampaign  = (id, d) => api.patch(`/campaigns/${id}/`, d);
export const deleteCampaign  = (id)    => api.delete(`/campaigns/${id}/`);
export const cancelCampaign  = (id)    => api.post(`/campaigns/${id}/cancel/`);
export const rescheduleCampaign = (id, t) => api.patch(`/campaigns/${id}/reschedule/`, { scheduled_at: t });
export const getCampaignAnalytics = (id) => api.get(`/campaigns/${id}/analytics/`);

// ─── Email Templates ──────────────────────────────────────────────────────
export const getTemplates   = ()      => api.get('/email-templates/');
export const createTemplate = (data)  => api.post('/email-templates/', data);
export const updateTemplate = (id, d) => api.patch(`/email-templates/${id}/`, d);
export const deleteTemplate = (id)    => api.delete(`/email-templates/${id}/`);

// ─── Suppression ──────────────────────────────────────────────────────────
export const getSuppression    = ()      => api.get('/suppression/');
export const createSuppression = (data)  => api.post('/suppression/', data);
export const deleteSuppression = (id)    => api.delete(`/suppression/${id}/`);

// ─── Email Sends ──────────────────────────────────────────────────────────
export const getEmailSends = () => api.get('/email-sends/');
