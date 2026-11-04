/**
 * START Academy Unified Client API SDK
 * رابط یکپارچه فرانت‌اند با بک‌اند REST API و پایگاه داده تخصصی SQLite
 * همراه با قابلیت تشخیص برخط/آفلاین و پیشگیری از کرش سیستم در صورت عدم راه‌اندازی سرور
 */

(function(window) {
  'use strict';

  // تعیین آدرس سرور به صورت پویا و امن (مسیر مبهم‌سازی‌شده ابری کلودفلر)
  const isCloudflareLive = typeof window !== 'undefined' && (
    window.location.hostname.includes('pages.dev') ||
    window.location.hostname.includes('startacademy.eu.cc') ||
    (window.location.protocol === 'https:' && window.location.port === '')
  );

  const defaultBaseUrl = isCloudflareLive
    ? '/st_sec_8f93b1a4/api'
    : (window.location.protocol === 'http:' && window.location.port === '5000' ? '/api' : 'http://localhost:5000/api');

  const TOKEN_KEY = 'START_API_TOKEN';
  const USER_KEY = 'START_CURRENT_USER';

  const StartApi = {
    baseUrl: defaultBaseUrl,
    isOnline: false,
    _healthChecked: false,

    setBaseUrl(url) {
      this.baseUrl = url.replace(/\/+$/, '');
    },

    getToken() {
      try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
    },

    setToken(token) {
      try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
      } catch (e) {}
    },

    getUser() {
      try {
        const raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    setUser(user) {
      try {
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(USER_KEY);
      } catch (e) {}
    },

    // پایش وضعیت سلامت سرور و برقراری ارتباط با دیتابیس
    async checkHealth() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // ۲ ثانیه تایم‌اوت
        const res = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          this.isOnline = true;
          this._healthChecked = true;
          return data;
        }
      } catch (e) {
        this.isOnline = false;
        this._healthChecked = true;
      }
      return { status: 'offline', database: { connected: false } };
    },

    // موتور تخصصی و استاندارد محاسبه تراز آزمون آزمایشی (Exam Traz Engine)
    // کالیبره‌شده با توزیع واقعی داوطلبان کنکور سراسری و آزمون‌های آزمایشی
    calculateTraz(percentage) {
      const p = Math.max(-33.3, Math.min(100, Number(percentage) || 0));
      let traz;
      if (p <= 0) {
        traz = 3800 + (p * 20); // بازه نمره منفی: ۳۱۴۰ تا ۳۸۰۰
      } else if (p <= 20) {
        traz = 3800 + (p / 20) * 1250; // میانگین کشوری (درصد ۲۰ = تراز ۵۰۵۰)
      } else if (p <= 50) {
        traz = 5050 + Math.pow((p - 20) / 30, 0.92) * 1450; // درصد ۳۵ = ۵۸۲۰، درصد ۵۰ = ۶۵۰۰
      } else if (p <= 75) {
        traz = 6500 + Math.pow((p - 50) / 25, 0.95) * 1050; // درصد ۶۵ = ۷۱۵۰ (پزشکی)، درصد ۷۵ = ۷۵۵۰
      } else {
        traz = 7550 + Math.pow((p - 75) / 25, 0.90) * 900; // درصد ۸۵ = ۷۹۴۰، درصد ۱۰۰ = ۸۴۵۰
      }
      return Math.round(Math.max(3000, Math.min(8550, traz)));
    },

    // تخمین رتبه منطقه بر اساس تراز کانون (جامعه آماری منطقه: ۳۵,۰۰۰ داوطلب)
    calculateRank(traz) {
      if (traz >= 8200) return Math.max(1, Math.round(15 - (traz - 8200) * 0.04));
      if (traz >= 7800) return Math.round(15 + (8200 - traz) * 0.2);
      if (traz >= 7400) return Math.round(95 + (7800 - traz) * 0.9);
      if (traz >= 7000) return Math.round(455 + (7400 - traz) * 2.2);
      if (traz >= 6500) return Math.round(1335 + (7000 - traz) * 4.5);
      if (traz >= 6000) return Math.round(3585 + (6500 - traz) * 7.5);
      if (traz >= 5000) return Math.round(7335 + (6000 - traz) * 11.0);
      return Math.min(35000, Math.round(18335 + (5000 - traz) * 13.0));
    },

    // ارسال درخواست ایمن به همراه توکن احراز هویت
    async request(endpoint, options = {}) {
      const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
      const headers = {
        'Content-Type': 'application/json',
        'X-Start-Core-Key': 'start_core_9f82d1a4_sec',
        ...(options.headers || {})
      };

      const token = this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const response = await fetch(url, {
          ...options,
          headers
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          // اگر توکن منقضی شده باشد، کاربر از سیستم خارج می‌شود
          if (response.status === 401) {
            this.setToken(null);
            this.setUser(null);
          }
          throw new Error(data.error || `خطای سرور با کد وضعیت ${response.status}`);
        }

        this.isOnline = true;
        return data;
      } catch (err) {
        // ثبت در صورت خطای شبکه
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
          this.isOnline = false;
        }
        throw err;
      }
    },

    // ماژول احراز هویت
    auth: {
      async login(phone, password) {
        const res = await StartApi.request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ phone, password })
        });
        if (res.token) StartApi.setToken(res.token);
        if (res.user) StartApi.setUser(res.user);
        return res;
      },

      async register(userData) {
        const res = await StartApi.request('/auth/register', {
          method: 'POST',
          body: JSON.stringify(userData)
        });
        if (res.token) StartApi.setToken(res.token);
        if (res.user) StartApi.setUser(res.user);
        return res;
      },

      async me() {
        const res = await StartApi.request('/auth/me', { method: 'GET' });
        if (res.user) StartApi.setUser(res.user);
        return res;
      },

      async updateProfile(profileData) {
        const res = await StartApi.request('/auth/profile', {
          method: 'PUT',
          body: JSON.stringify(profileData)
        });
        if (res.user) StartApi.setUser(res.user);
        return res;
      },

      logout() {
        StartApi.setToken(null);
        StartApi.setUser(null);
        try {
          localStorage.removeItem('START_SESSION_USER');
        } catch (e) {}
      }
    },

    // ماژول بانک تست
    questions: {
      async list(params = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') qs.append(k, v);
        });
        return await StartApi.request(`/questions?${qs.toString()}`);
      },

      async getById(id) {
        return await StartApi.request(`/questions/${id}`);
      },

      async getTree() {
        return await StartApi.request('/questions/tree');
      }
    },

    // ماژول شبیه‌ساز آزمون و کارنامه استاندارد
    exams: {
      async start(payload) {
        return await StartApi.request('/exams/start', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      },

      async submit(examId, answers) {
        return await StartApi.request('/exams/submit', {
          method: 'POST',
          body: JSON.stringify({ exam_id: examId, answers })
        });
      },

      async getHistory() {
        return await StartApi.request('/exams/history');
      },

      async getById(id) {
        return await StartApi.request(`/exams/${id}`);
      },

      async setRootCause(examId, questionId, rootCause, addToNotebook = false) {
        return await StartApi.request('/exams/answers/root-cause', {
          method: 'PUT',
          body: JSON.stringify({
            exam_id: examId,
            question_id: questionId,
            root_cause: rootCause,
            add_to_notebook: addToNotebook
          })
        });
      },

      async delete(id) {
        return await StartApi.request(`/exams/${id}`, { method: 'DELETE' });
      },

      async saveOfflineExam(examData) {
        return await StartApi.request('/exams/offline', {
          method: 'POST',
          body: JSON.stringify(examData)
        });
      },

      async getOfflineExams() {
        return await StartApi.request('/exams/offline', { method: 'GET' });
      }
    },

    // ماژول پایش شبانه ۲۳:۳۰
    reports: {
      async submitNightly(reportData) {
        return await StartApi.request('/reports/nightly', {
          method: 'POST',
          body: JSON.stringify(reportData)
        });
      },

      async getNightly(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return await StartApi.request(`/reports/nightly?${qs}`);
      },

      async submitFeedback(reportId, feedback) {
        return await StartApi.request(`/reports/nightly/${reportId}/feedback`, {
          method: 'PUT',
          body: JSON.stringify({ feedback })
        });
      }
    },

    // ماژول کتابچه اشتباهات و جعبه لایتنر ۵ مرحله‌ای
    notebook: {
      async list(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return await StartApi.request(`/notebook?${qs}`);
      },

      async add(questionId, errorCause = 'علمی', userNotes = '') {
        return await StartApi.request('/notebook', {
          method: 'POST',
          body: JSON.stringify({
            question_id: questionId,
            error_cause: errorCause,
            user_notes: userNotes
          })
        });
      },

      async review(id, isCorrect) {
        return await StartApi.request(`/notebook/${id}/review`, {
          method: 'PUT',
          body: JSON.stringify({ is_correct: isCorrect })
        });
      },

      async remove(id) {
        return await StartApi.request(`/notebook/${id}`, { method: 'DELETE' });
      }
    },

    // ماژول تیکت‌های رفع اشکال درسی
    tickets: {
      async list(status) {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        return await StartApi.request(`/tickets${qs}`);
      },

      async create(ticketData) {
        return await StartApi.request('/tickets', {
          method: 'POST',
          body: JSON.stringify(ticketData)
        });
      },

      async reply(ticketId, message) {
        return await StartApi.request(`/tickets/${ticketId}/reply`, {
          method: 'POST',
          body: JSON.stringify({ message })
        });
      }
    },

    // ماژول همگام‌سازی و ذخیره‌سازی ابری داده‌های داوطلب در بک‌اند
    user: {
      async sync(syncData) {
        try {
          return await StartApi.request('/user/sync', {
            method: 'POST',
            body: JSON.stringify(syncData)
          });
        } catch (e) {
          return { success: false, error: e.message };
        }
      },

      async getData() {
        try {
          return await StartApi.request('/user/sync', { method: 'GET' });
        } catch (e) {
          return { success: false, data: null };
        }
      },

      async submitReceipt(receiptData) {
        return await StartApi.request('/payments/receipt', {
          method: 'POST',
          body: JSON.stringify(receiptData)
        });
      }
    },

    // ماژول مدیریت و میز کنترل مربی
    admin: {
      async getDashboard() {
        return await StartApi.request('/admin/dashboard');
      },

      async getUsers() {
        return await StartApi.request('/admin/users');
      },

      async updateUser(userId, data) {
        return await StartApi.request('/admin/users/update', {
          method: 'POST',
          body: JSON.stringify({ user_id: userId, ...data })
        });
      },

      async getNightlyDesk(date) {
        const qs = date ? `?date=${encodeURIComponent(date)}` : '';
        return await StartApi.request(`/admin/nightly-monitoring${qs}`);
      },

      async getStudents() {
        return await StartApi.request('/admin/users');
      },

      async sendTelemetry(eventName, payload = {}) {
        try {
          return await StartApi.request('/admin/telemetry', {
            method: 'POST',
            body: JSON.stringify({ event_name: eventName, payload })
          });
        } catch (e) {
          return { success: false };
        }
      }
    }
  };

  // بررسی وضعیت سلامت در پس‌زمینه
  StartApi.checkHealth().catch(() => {});

  window.StartApi = StartApi;
})(window);
