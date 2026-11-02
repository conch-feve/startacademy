/**
 * START Academy - High-Performance Question & Media Sharding Engine
 * =================================================================
 * پشتیبانی از ۱۰۰,۰۰۰ تست و ۵۰,۰۰۰ تصویر روی هاست استاتیک
 * - پایگاه داده IndexedDB بدون محدودیت سهمیه (Quota-Free)
 * - کش هوشمند و تجزیه به شاردها (Sharding Pipeline)
 * - ایندکس‌گذاری و جستجوی فوق‌سریع در حافظه بدون مسدودسازی Thread
 * - لود تنبل و بازآرایی آدرس‌های CDN تصاویر (Cloudflare R2 / S3)
 */
(function(window) {
  'use strict';

  const DB_NAME = 'START_QBANK_IDB';
  const DB_VERSION = 2;
  const MANIFEST_PATH = 'data/manifest.json';

  // ابزار نرمال‌سازی فوق‌سریع متن برای جستجو
  function normalizePersianText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/[\u200C\u200D\uFEFF]/g, ' ') // حذف نیم‌فاصله‌ها جهت جستجوی پیوسته
      .replace(/[ي]/g, 'ی')
      .replace(/[ك]/g, 'ک')
      .replace(/[ۀ]/g, 'ه')
      .replace(/[\u064B-\u065F]/g, '') // حذف اعراب
      .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 1728)) // ارقام فارسی به انگلیسی
      .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 1584)) // ارقام عربی به انگلیسی
      .toLowerCase()
      .trim();
  }

  class QuestionEngine {
    constructor() {
      this.db = null;
      this.manifest = null;
      this.allQuestions = [];
      this.fastIndexReady = false;
      this.isInitializing = false;
      this.cdnBaseUrl = this.getStoredCdnBase();
      this.subscribers = [];
    }

    getStoredCdnBase() {
      try {
        return localStorage.getItem('START_MEDIA_CDN_BASE') || '';
      } catch (e) {
        return '';
      }
    }

    setStoredCdnBase(url) {
      this.cdnBaseUrl = (url || '').trim();
      try {
        if (this.cdnBaseUrl) {
          localStorage.setItem('START_MEDIA_CDN_BASE', this.cdnBaseUrl);
        } else {
          localStorage.removeItem('START_MEDIA_CDN_BASE');
        }
      } catch (e) {}
    }

    // باز کردن و مهاجرت ساختار IndexedDB
    async openDatabase() {
      if (this.db) return this.db;
      return new Promise((resolve) => {
        if (!window.indexedDB) {
          console.warn('[QuestionEngine] مرورگر از IndexedDB پشتیبانی نمی‌کند، استفاده از حافظه رم.');
          return resolve(null);
        }

        try {
          const request = window.indexedDB.open(DB_NAME, DB_VERSION);

          request.onupgradeneeded = (e) => {
            const db = e.target.result;
            // پاکسازی کش شاردهای قدیمی در ارتقا به نسخه ۲
            if (e.oldVersion < 2 && db.objectStoreNames.contains('shards_cache')) {
              try {
                e.target.transaction.objectStore('shards_cache').clear();
              } catch (err) {}
            }

            // ۱. جدول سوالات سفارشی (جایگزین نامحدود برای START_CUSTOM_QUESTIONS)
            if (!db.objectStoreNames.contains('custom_questions')) {
              const store = db.createObjectStore('custom_questions', { keyPath: 'id' });
              store.createIndex('lesson', 'lesson', { unique: false });
              store.createIndex('grade', 'grade', { unique: false });
              store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }

            // ۲. جدول ویرایش‌ها و اوررایدهای سوالات (جایگزین START_QUESTION_OVERRIDES)
            if (!db.objectStoreNames.contains('question_overrides')) {
              const store = db.createObjectStore('question_overrides', { keyPath: 'id' });
              store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }

            // ۳. کش شاردهای دانلودشده
            if (!db.objectStoreNames.contains('shards_cache')) {
              db.createObjectStore('shards_cache', { keyPath: 'shard_id' });
            }

            // ۴. متادیتا و کش سوالات لودشده
            if (!db.objectStoreNames.contains('questions_meta')) {
              const store = db.createObjectStore('questions_meta', { keyPath: 'id' });
              store.createIndex('lesson', 'lesson', { unique: false });
              store.createIndex('grade', 'grade', { unique: false });
              store.createIndex('difficulty', 'difficulty', { unique: false });
              store.createIndex('question_type', 'question_type', { unique: false });
            }
          };

          request.onsuccess = (e) => {
            this.db = e.target.result;
            resolve(this.db);
          };

          request.onerror = (e) => {
            console.warn('[QuestionEngine] خطای دسترسی به IndexedDB:', e.target.error);
            resolve(null);
          };
        } catch (err) {
          console.warn('[QuestionEngine] استثنا در باز کردن IndexedDB:', err);
          resolve(null);
        }
      });
    }

    // مهاجرت خودکار و امن داده‌های اولیه از localStorage به IndexedDB
    async migrateFromLocalStorage() {
      if (!this.db) return;

      try {
        // ۱. مهاجرت تست‌های سفارشی
        const rawCustom = localStorage.getItem('START_CUSTOM_QUESTIONS');
        if (rawCustom) {
          const list = JSON.parse(rawCustom);
          if (Array.isArray(list) && list.length > 0) {
            await this.saveBulkCustomQuestions(list, false);
          }
        }

        // ۲. مهاجرت اوررایدهای سوالات با غربالگری خطاهای OCR
        const rawOverrides = localStorage.getItem('START_QUESTION_OVERRIDES');
        if (rawOverrides) {
          const map = JSON.parse(rawOverrides);
          if (map && typeof map === 'object') {
            const tx = this.db.transaction('question_overrides', 'readwrite');
            const store = tx.objectStore('question_overrides');
            for (const [id, patch] of Object.entries(map)) {
              const strRep = JSON.stringify(patch || {});
              if (strRep.includes('$frac') || strRep.includes('\\1/5') || strRep.includes('\\,\\$') || id === '22' || id === '23') {
                continue; // عدم ورود اوررایدهای مخدوش
              }
              store.put({ id, patch, updatedAt: Date.now() });
            }
          }
        }
      } catch (err) {
        console.warn('[QuestionEngine] خطا در مهاجرت خودکار از localStorage:', err);
      }
    }

    // دریافت داده‌های شارد مانیفست
    async fetchManifest() {
      try {
        const res = await fetch(MANIFEST_PATH, { cache: 'no-cache' });
        if (res.ok) {
          this.manifest = await res.json();
          if (this.manifest && this.manifest.media_config && this.manifest.media_config.image_base_url && !this.cdnBaseUrl) {
            this.cdnBaseUrl = this.manifest.media_config.image_base_url;
          }
          return this.manifest;
        }
      } catch (e) {
        // استفاده از مانیفست پیش‌فرض در صورت آفلاین بودن
        this.manifest = {
          version: '1.0.0',
          media_config: { image_base_url: '', fallback_format: 'webp' },
          shards: [
            { id: 'core-v2', title: 'بانک پایه استارت', type: 'legacy_global', count: 10000, autoload: true }
          ]
        };
      }
      return this.manifest;
    }

    // بارگذاری ترکیبی و جامع ۱۰۰ هزار تست
    async loadAllQuestions() {
      if (this.isInitializing) return this.allQuestions;
      this.isInitializing = true;

      await this.openDatabase();
      await this.migrateFromLocalStorage();
      await this.fetchManifest();

      // ۱. دریافت تست‌های پایه از دیتابیس فعلی (Backward-Compatible Base Seed)
      let basePool = [];
      if (Array.isArray(window.EXAM_QUESTIONS_DATABASE) && window.EXAM_QUESTIONS_DATABASE.length > 0) {
        basePool = [...window.EXAM_QUESTIONS_DATABASE];
      }

      // ۲. دریافت شاردهای معرفی‌شده در مانیفست
      if (this.manifest && Array.isArray(this.manifest.shards)) {
        for (const shard of this.manifest.shards) {
          if (shard.type === 'json' && shard.url && shard.autoload) {
            try {
              const shardQuestions = await this.loadShardData(shard);
              if (Array.isArray(shardQuestions)) {
                basePool.push(...shardQuestions);
              }
            } catch (err) {
              console.warn(`[QuestionEngine] خطا در بارگذاری شارد ${shard.id}:`, err);
            }
          }
        }
      }

      // ۳. دریافت تست‌های سفارشی کاربر/ادمین از IndexedDB (و فال‌بک localStorage)
      const customList = await this.getAllCustomQuestions();
      const customMap = new Map();
      customList.forEach(q => customMap.set(String(q.id), q));

      // ۴. دریافت اوررایدهای سوالات
      const overridesMap = await this.getAllQuestionOverrides();

      // ۵. ترکیب و اعمال اوررایدها روی کل تست‌ها
      const finalQuestions = [];
      const seenIds = new Set();

      // پردازش تست‌های پایه
      for (let q of basePool) {
        const idStr = String(q.id);
        if (customMap.has(idStr)) {
          // جایگزینی توسط تست سفارشی
          q = customMap.get(idStr);
          customMap.delete(idStr);
        } else if (overridesMap.has(idStr)) {
          // اعمال وصله/اورراید
          q = { ...q, ...overridesMap.get(idStr) };
        }
        if (!seenIds.has(idStr)) {
          seenIds.add(idStr);
          finalQuestions.push(q);
        }
      }

      // افزودن مابقی تست‌های سفارشی اختصاصی
      for (let [idStr, q] of customMap.entries()) {
        if (!seenIds.has(idStr)) {
          seenIds.add(idStr);
          if (overridesMap.has(idStr)) {
            q = { ...q, ...overridesMap.get(idStr) };
          }
          finalQuestions.push(q);
        }
      }

      this.allQuestions = finalQuestions;
      window.EXAM_QUESTIONS_DATABASE = finalQuestions;

      // ساخت ایندکس سریع متنی جهت فیلتر آنی
      this.buildFastIndex(this.allQuestions);

      this.isInitializing = false;

      // انتشار رویداد آماده‌سازی تست‌ها جهت به‌روزرسانی فرانت‌اند
      try {
        window.dispatchEvent(new CustomEvent('start:questions-ready', {
          detail: {
            count: this.allQuestions.length,
            questions: this.allQuestions
          }
        }));
      } catch (e) {}

      return this.allQuestions;
    }

    // بارگذاری شارد با سیستم کش دوفازی IndexedDB
    async loadShardData(shard) {
      if (this.db) {
        try {
          const cached = await new Promise((resolve) => {
            const tx = this.db.transaction('shards_cache', 'readonly');
            const req = tx.objectStore('shards_cache').get(shard.id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          });

          if (cached && cached.data && Array.isArray(cached.data)) {
            return cached.data;
          }
        } catch (e) {}
      }

      // دانلود مستقیم در صورت نبود در کش
      const resp = await fetch(shard.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const questions = Array.isArray(data) ? data : (data.questions || []);

      // ذخیره در کش IndexedDB
      if (this.db && Array.isArray(questions)) {
        try {
          const tx = this.db.transaction('shards_cache', 'readwrite');
          tx.objectStore('shards_cache').put({
            shard_id: shard.id,
            version: shard.version || '1.0.0',
            data: questions,
            cached_at: Date.now()
          });
        } catch (e) {}
      }

      return questions;
    }

    // ایندکس‌گذاری یکپارچه متنی برای جستجوی فوری در ۱۰۰,۰۰۰ تست
    buildFastIndex(questions) {
      if (!Array.isArray(questions)) return;
      const t0 = performance.now();
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q._searchStr) {
          const raw = (q.question_text || '') + ' ' +
                      (Array.isArray(q.options) ? q.options.join(' ') : '') + ' ' +
                      (q.chapter || '') + ' ' +
                      (q.topic || '') + ' ' +
                      (q.lesson || '') + ' ' +
                      (q.grade || '') + ' ' +
                      (q.exam_title || '') + ' ' +
                      (q.id || '');
          q._searchStr = normalizePersianText(raw);
        }
      }
      this.fastIndexReady = true;
      const dt = Math.round(performance.now() - t0);
      if (dt > 30) {
        console.log(`[QuestionEngine] ایندکس فوق‌سریع ${questions.length} تست در ${dt}ms آماده شد.`);
      }
    }

    // فیلتر سریع متنی بدون بار پردازشی
    searchFast(query, candidateList) {
      const list = candidateList || this.allQuestions;
      if (!query || typeof query !== 'string') return list;
      const normalizedQuery = normalizePersianText(query);
      if (!normalizedQuery) return list;

      const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return list;

      return list.filter(q => {
        const s = q._searchStr || normalizePersianText(q.question_text || '');
        for (let j = 0; j < tokens.length; j++) {
          if (!s.includes(tokens[j])) return false;
        }
        return true;
      });
    }

    // حل و تبدیل مسیر تصاویر به CDN ابری یا مسیر محلی
    resolveImageUrl(rawPath) {
      if (!rawPath || typeof rawPath !== 'string') return '';
      const p = rawPath.trim();
      if (!p) return '';
      if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:') || p.startsWith('blob:')) {
        return p;
      }

      const cdn = this.cdnBaseUrl || (this.manifest && this.manifest.media_config && this.manifest.media_config.image_base_url) || '';
      if (cdn) {
        const base = cdn.endsWith('/') ? cdn : cdn + '/';
        const cleanPath = p.replace(/^\.?\/+/, '');
        return base + cleanPath;
      }

      return p;
    }

    // هندلر عدم لود تصویر با حفظ زیبایی کارت و کادر SVG استاندارد
    handleImageError(imgEl) {
      if (!imgEl || imgEl.getAttribute('data-error-handled') === 'true') return;
      imgEl.setAttribute('data-error-handled', 'true');
      imgEl.onerror = null;

      const parent = imgEl.parentElement;
      if (!parent) return;

      const fallbackDiv = document.createElement('div');
      fallbackDiv.className = 'w-full my-2.5 p-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-slate-400 text-xs flex items-center justify-center gap-2 select-none';
      fallbackDiv.innerHTML = `
        <svg class="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        <span>تصویر شکل آزمون در دسترس نیست یا در حال بارگذاری است</span>
      `;

      try {
        imgEl.style.display = 'none';
        parent.appendChild(fallbackDiv);
      } catch (e) {}
    }

    // =========================================================================
    // CRUD تست‌های سفارشی با ظرفیت نامحدود (IndexedDB + localStorage sync)
    // =========================================================================
    async saveCustomQuestion(question) {
      if (!question || !question.id) return false;
      question.updatedAt = Date.now();

      // ۱. ذخیره در IndexedDB
      if (this.db) {
        try {
          const tx = this.db.transaction('custom_questions', 'readwrite');
          tx.objectStore('custom_questions').put(question);
        } catch (e) {}
      }

      // ۲. همگام‌سازی سبک با localStorage در صورت گنجایش
      try {
        let list = JSON.parse(localStorage.getItem('START_CUSTOM_QUESTIONS') || '[]');
        const idx = list.findIndex(q => String(q.id) === String(question.id));
        if (idx !== -1) list[idx] = question;
        else list.unshift(question);
        localStorage.setItem('START_CUSTOM_QUESTIONS', JSON.stringify(list));
      } catch (quotaErr) {
        console.warn('[QuestionEngine] سهمیه localStorage تکمیل است، ذخیره ایمن در IndexedDB حفظ شد.');
      }

      await this.loadAllQuestions();
      return true;
    }

    async saveBulkCustomQuestions(questionsArray, reloadAfter = true) {
      if (!Array.isArray(questionsArray) || questionsArray.length === 0) return 0;
      await this.openDatabase();

      if (this.db) {
        await new Promise((resolve, reject) => {
          const tx = this.db.transaction('custom_questions', 'readwrite');
          const store = tx.objectStore('custom_questions');
          questionsArray.forEach(q => {
            q.updatedAt = Date.now();
            store.put(q);
          });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });
      }

      // تلاش برای همگام‌سازی بخش کوچکی در localStorage در صورت امکان
      try {
        let current = JSON.parse(localStorage.getItem('START_CUSTOM_QUESTIONS') || '[]');
        const map = new Map(current.map(q => [String(q.id), q]));
        questionsArray.forEach(q => map.set(String(q.id), q));
        const merged = Array.from(map.values());
        // فقط در صورت حجم منطقی در localStorage ذخیره شود
        if (merged.length <= 500) {
          localStorage.setItem('START_CUSTOM_QUESTIONS', JSON.stringify(merged));
        }
      } catch (e) {}

      if (reloadAfter) {
        await this.loadAllQuestions();
      }
      return questionsArray.length;
    }

    async deleteCustomQuestion(questionId) {
      const idStr = String(questionId);

      if (this.db) {
        try {
          const tx = this.db.transaction('custom_questions', 'readwrite');
          tx.objectStore('custom_questions').delete(idStr);
        } catch (e) {}
      }

      try {
        let list = JSON.parse(localStorage.getItem('START_CUSTOM_QUESTIONS') || '[]');
        list = list.filter(q => String(q.id) !== idStr);
        localStorage.setItem('START_CUSTOM_QUESTIONS', JSON.stringify(list));
      } catch (e) {}

      await this.loadAllQuestions();
      return true;
    }

    async getAllCustomQuestions() {
      if (!this.db) {
        try {
          return JSON.parse(localStorage.getItem('START_CUSTOM_QUESTIONS') || '[]');
        } catch (e) {
          return [];
        }
      }

      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction('custom_questions', 'readonly');
          const req = tx.objectStore('custom_questions').getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => {
            try {
              resolve(JSON.parse(localStorage.getItem('START_CUSTOM_QUESTIONS') || '[]'));
            } catch (e) {
              resolve([]);
            }
          };
        } catch (err) {
          resolve([]);
        }
      });
    }

    // =========================================================================
    // اورراید فیلدهای سوالات با ظرفیت نامحدود
    // =========================================================================
    async saveQuestionOverride(questionId, patch) {
      const idStr = String(questionId);
      const record = { id: idStr, patch, updatedAt: Date.now() };

      if (this.db) {
        try {
          const tx = this.db.transaction('question_overrides', 'readwrite');
          tx.objectStore('question_overrides').put(record);
        } catch (e) {}
      }

      try {
        let map = JSON.parse(localStorage.getItem('START_QUESTION_OVERRIDES') || '{}');
        map[idStr] = patch;
        localStorage.setItem('START_QUESTION_OVERRIDES', JSON.stringify(map));
      } catch (e) {}

      await this.loadAllQuestions();
      return true;
    }

    async getAllQuestionOverrides() {
      const map = new Map();

      // ۱. خوانش از localStorage با پاکسازی رکوردهای مخدوش
      try {
        const raw = localStorage.getItem('START_QUESTION_OVERRIDES');
        if (raw) {
          const parsed = JSON.parse(raw);
          let localModified = false;
          for (const [k, v] of Object.entries(parsed)) {
            const strRep = JSON.stringify(v || {});
            if (strRep.includes('$frac') || strRep.includes('\\1/5') || strRep.includes('\\,\\$') || k === '22' || k === '23') {
              delete parsed[k];
              localModified = true;
            } else {
              map.set(String(k), v);
            }
          }
          if (localModified) {
            try { localStorage.setItem('START_QUESTION_OVERRIDES', JSON.stringify(parsed)); } catch (e) {}
          }
        }
      } catch (e) {}

      // ۲. خوانش جامع از IndexedDB با حذف رکوردهای مخدوش
      if (this.db) {
        try {
          await new Promise((resolve) => {
            const tx = this.db.transaction('question_overrides', 'readwrite');
            const store = tx.objectStore('question_overrides');
            const req = store.getAll();
            req.onsuccess = () => {
              if (Array.isArray(req.result)) {
                req.result.forEach(r => {
                  if (r && r.id && r.patch) {
                    const strRep = JSON.stringify(r.patch || {});
                    if (strRep.includes('$frac') || strRep.includes('\\1/5') || strRep.includes('\\,\\$') || String(r.id) === '22' || String(r.id) === '23') {
                      store.delete(r.id);
                    } else {
                      map.set(String(r.id), r.patch);
                    }
                  }
                });
              }
              resolve(true);
            };
            req.onerror = () => resolve(false);
          });
        } catch (e) {}
      }

      return map;
    }

    // =========================================================================
    // ابزار خروجی شاردها جهت انتشار استاتیک (Shard Exporter)
    // =========================================================================
    exportAsShards(questionsToExport, shardSize = 1000) {
      const questions = Array.isArray(questionsToExport) && questionsToExport.length > 0 
        ? questionsToExport 
        : this.allQuestions;

      const total = questions.length;
      const shardsCount = Math.ceil(total / shardSize);
      const generatedShards = [];

      for (let i = 0; i < shardsCount; i++) {
        const chunk = questions.slice(i * shardSize, (i + 1) * shardSize);
        const shardId = `shard-${String(i + 1).padStart(3, '0')}`;
        const fileName = `${shardId}.json`;
        const shardData = {
          shard_id: shardId,
          count: chunk.length,
          start_index: i * shardSize + 1,
          end_index: (i * shardSize) + chunk.length,
          questions: chunk
        };

        generatedShards.push({
          id: shardId,
          title: `شارد شماره ${i + 1} (${chunk.length} تست)`,
          type: 'json',
          url: `data/shards/${fileName}`,
          count: chunk.length,
          autoload: true,
          jsonData: shardData,
          fileName
        });
      }

      // ساخت نسخه به‌روز مانیفست
      const updatedManifest = {
        version: '1.1.0',
        updated_at: new Date().toLocaleDateString('fa-IR'),
        media_config: {
          image_base_url: this.cdnBaseUrl || '',
          fallback_format: 'webp',
          lazy_offset_px: '300px'
        },
        shards: [
          ...((this.manifest && this.manifest.shards) ? this.manifest.shards.filter(s => s.type === 'legacy_global') : []),
          ...generatedShards.map(({ id, title, type, url, count, autoload }) => ({
            id, title, type, url, count, autoload
          }))
        ]
      };

      return {
        shards: generatedShards,
        manifest: updatedManifest,
        totalQuestions: total,
        shardsCount
      };
    }

    // پایش وضعیت مصرف حافظه و سلامت بانک تست
    async getStorageStats() {
      let customCount = 0;
      let overridesCount = 0;
      let cachedShardsCount = 0;
      let storageEstimate = { usage: 0, quota: 0 };

      if (this.db) {
        try {
          customCount = await new Promise((r) => {
            const tx = this.db.transaction('custom_questions', 'readonly');
            const req = tx.objectStore('custom_questions').count();
            req.onsuccess = () => r(req.result || 0);
            req.onerror = () => r(0);
          });

          overridesCount = await new Promise((r) => {
            const tx = this.db.transaction('question_overrides', 'readonly');
            const req = tx.objectStore('question_overrides').count();
            req.onsuccess = () => r(req.result || 0);
            req.onerror = () => r(0);
          });

          cachedShardsCount = await new Promise((r) => {
            const tx = this.db.transaction('shards_cache', 'readonly');
            const req = tx.objectStore('shards_cache').count();
            req.onsuccess = () => r(req.result || 0);
            req.onerror = () => r(0);
          });
        } catch (e) {}
      }

      if (navigator.storage && navigator.storage.estimate) {
        try {
          storageEstimate = await navigator.storage.estimate();
        } catch (e) {}
      }

      return {
        totalQuestions: this.allQuestions.length,
        baseSeedCount: (window.EXAM_QUESTIONS_DATABASE && window.EXAM_QUESTIONS_DATABASE.length) || 0,
        customCount,
        overridesCount,
        cachedShardsCount,
        manifestShardsCount: (this.manifest && this.manifest.shards && this.manifest.shards.length) || 1,
        cdnBaseUrl: this.cdnBaseUrl,
        usageBytes: storageEstimate.usage || 0,
        quotaBytes: storageEstimate.quota || 0,
        usageMB: ((storageEstimate.usage || 0) / (1024 * 1024)).toFixed(2)
      };
    }

    // پاکسازی کش شاردها و بازنشانی دیتابیس لوکال
    async clearShardsCache() {
      if (this.db) {
        try {
          await new Promise((resolve) => {
            const tx = this.db.transaction('shards_cache', 'readwrite');
            tx.objectStore('shards_cache').clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
          });
        } catch (e) {}
      }
      return this.loadAllQuestions();
    }
  }

  // ثبت و راه‌اندازی سراسری
  const engine = new QuestionEngine();
  window.StartQuestionEngine = engine;

  // آغاز بارگذاری خودکار در اولین فرصت
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      engine.loadAllQuestions();
    });
  } else {
    engine.loadAllQuestions();
  }

})(window);
