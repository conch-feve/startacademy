/**
 * START Academy - Universal CMS & Site Customization Engine
 * ==========================================================
 * مدیریت متمرکز محتوا، تنظیمات، تعرفه‌ها، بانک سوالات، مشاوران و همگام‌سازی پنل ادمین
 */
(function(window) {
  'use strict';

  const STORAGE_KEYS = {
    CONFIG: 'START_CMS_CONFIG',
    CUSTOM_QUESTIONS: 'START_CUSTOM_QUESTIONS',
    ADVISORS: 'START_ADVISORS_DATA',
    DISCOUNT_CODES: 'START_DISCOUNT_CODES',
    ACTIVITY_LOG: 'START_ACTIVITY_LOG',
    LEADS: 'START_LEADS'
  };

  const DEFAULT_CONFIG = {
    siteTitle: 'موسسه مشاوره و برنامه‌ریزی آموزشی استارت',
    siteSlogan: 'JUST START • متدولوژی هدایت تحصیلی و پایش شبانه ۲۳:۳۰',
    aboutShort: 'آکادمی تخصصی مشاوره و برنامه‌ریزی کنکور استارت: برنامه‌ریزی هفتگی شخصی، پیگیری هر شب ساعت ۲۳:۳۰، تماس هفتگی با مشاور ارشد و بانک جامع +۱۰,۰۰۰ تست آزمون آزمایشی با حل تشریحی.',
    contactPhone: '۰۲۱-۸۸۹۹۰۰۱۱',
    contactMobile: '۰۹۱۲۳۴۵۶۷۸۹',
    supportTelegram: '@start_acdmy',
    supportBale: '@start_acdmy',
    channelTelegram: 'https://t.me/start_acdmy',
    address: 'تبریز، بلوار دانشگاه، مجتمع نوآوری و رشد دانشگاه علوم پزشکی تبریز، طبقه ۴',
    
    // Announcement Banner (Disabled by default to preserve 0.0000 CLS and prevent dynamic body.prepend shifts)
    announcement: {
      enabled: false,
      text: 'شروع ثبت‌نام رسمی دوره‌های جامع آمادگی کنکور ۱۴۰۵ با پایش اختصاصی شبانه ۲۳:۳۰ و ظرفیت محدود.',
      link: 'pricing.html',
      linkText: 'مشاهده پلن‌ها و تعرفه‌ها'
    },

    // Pricing & Plans (Pure Mentorship Focus & Annual 15% Discount)
    priceSilver: '۱,۶۰۰,۰۰۰',
    priceSilverAnnual: '۱۶,۳۲۰,۰۰۰',
    priceGold: '۲,۵۰۰,۰۰۰',
    priceGoldAnnual: '۲۵,۵۰۰,۰۰۰',
    priceVip: '۴,۰۰۰,۰۰۰',
    priceVipAnnual: '۴۰,۸۰۰,۰۰۰',
    annualDiscountPercent: 15,

    featuresFreeTier: [
      'دسترسی رایگان به ۲۵٪ سوالات بانک تست',
      '۴ سوال رفع اشکال در هر هفته (رایگان)',
      'هدیه عضویت: ۱ هفته استفاده رایگان از پلن طلایی',
      'برنامه هفتگی اختصاصی مخصوص دانش‌آموز (هفته اول)',
      '۲ تماس تلفنی در هفته نخست با مشاور ارشد'
    ],
    featuresSilver: [
      'برنامه هفتگی اختصاصی و شخصی‌سازی‌شده مخصوص هر دانش‌آموز',
      '۱ بار تماس تلفنی در هفته با مشاور تحصیلی (۴ تماس در ماه)',
      'تحلیل اختصاصی سوالات و کارنامه آزمون',
      'آزمون جامع: ندارد (بدون آزمون)',
      'دسترسی به ۵۰٪ بانک سوالات استارت',
      'رفع اشکال هر هفته فقط ۸ سوال',
      'پایش و ثبت گزارش کار ۷ شب در هفته (راس ۲۳:۳۰)'
    ],
    featuresGold: [
      '۱ هفته تست کاملاً رایگان برای شروع بدون پرداخت اولیه',
      'برنامه هفتگی اختصاصی و شخصی‌سازی‌شده مخصوص هر دانش‌آموز',
      '۲ بار تماس تلفنی در هفته با مشاور ارشد (۸ تماس در ماه)',
      'آزمون جامع: ماهی ۱ آزمون با شبیه‌ساز استاندارد',
      'تحلیل اختصاصی سوالات و کارنامه آزمون',
      'دسترسی به ۷۵٪ سوالات بانک تست استارت',
      'رفع اشکال هر هفته ۱۲ سوال',
      'پایش اختصاصی هر شب راس ساعت ۲۳:۳۰'
    ],
    featuresVip: [
      'برنامه هفتگی اختصاصی و شخصی‌سازی‌شده مخصوص هر دانش‌آموز',
      '۳ بار تماس تلفنی در هفته با مشاور ارشد (۱۲ تماس در ماه)',
      '۱ جلسه مشاوره حضوری در ماه (مخصوص داوطلبان تبریز)',
      'تحلیل اختصاصی سوالات و کارنامه آزمون',
      'آزمون جامع: ۴ آزمون جامع شبیه‌ساز در ماه',
      'دسترسی ۱۰۰٪ کامل به بانک سوالات (+۱۰,۰۰۰ تست آزمون آزمایشی)',
      'رفع اشکال تست: ۲۰ سوال در هفته',
      'پایش اختصاصی هر شب راس ساعت ۲۳:۳۰'
    ]
  };

  const DEFAULT_ADVISORS = [
    {
      id: 'adv_ekhtiar',
      name: 'دکتر اختیار',
      role: 'موسس موسسه استارت',
      title: 'دانشجوی پزشکی تبریز • دپارتمان تجربی',
      field: 'موسس استارت و مدرس تخصصی زیست‌شناسی کنکور',
      experience: '+۴ سال در مشاوره',
      ranksBadge: 'پذیرش رتبه‌های ۲ و ۳ رقمی',
      image: 'Ekhtiar.webp',
      teaching: 'آموزش شیوه تفکر طراحان کنکور و آزمون‌های آزمایشی، با تمرکز بر پاسخ‌گویی دقیق و تبدیل درصد زیست به اهرم جهش تراز بالای ۷,۲۰۰.',
      highlights: [
        'رتبه ۹۴، ۹۶۱ و ۱۲۰۰ در سه دوره کنکور سراسری',
        'کسب درصد ۹۲ زیست‌شناسی در کنکور سراسری',
        'طراح آزمون‌های آزمایشی و مولف بانک تست استارت'
      ]
    },
    {
      id: 'adv_yekan',
      name: 'دکتر یکان',
      role: 'موسس موسسه استارت',
      title: 'دانشجوی پزشکی تبریز • دپارتمان ریاضیات و محاسبات',
      field: 'موسس استارت و مدرس تخصصی ریاضیات تجربی و فیزیک',
      experience: '+۳ سال در مشاوره',
      ranksBadge: 'تخصص در جهش درصدهای منفی به بالای ۷۰٪',
      image: 'Yekan.webp?v=140502',
      teaching: 'تدریس متدهای محاسبات سریع ذهنی، دور زدن فرمول‌های حجیم و تحلیل گزینه‌های انحرافی طراحان آزمون سراسری.',
      highlights: [
        'رتبه ۴۸۰ کنکور سراسری تجربی',
        'متخصص مهندسی معکوس سوالات فیزیک و شیمی',
        'معمار پروتکل پایش شبانه ۲۳:۳۰ و ایستگاه‌های مرور'
      ]
    }
  ];

  const DEFAULT_DISCOUNTS = [
    { code: 'START1405', percent: 20, maxDiscount: 500000, expiresAt: '1405/01/01', usageCount: 14, maxUsage: 100, active: true },
    { code: 'NOROOZ', percent: 30, maxDiscount: 800000, expiresAt: '1405/01/15', usageCount: 42, maxUsage: 50, active: true },
    { code: 'MEDICINE', percent: 15, maxDiscount: 600000, expiresAt: '1405/04/01', usageCount: 8, maxUsage: 30, active: true }
  ];

  const StartCMS = {
    // دریافت تنظیمات جامع سایت
    getConfig() {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG) || '{}');
        return { ...DEFAULT_CONFIG, ...stored };
      } catch (e) {
        return DEFAULT_CONFIG;
      }
    },

    // ذخیره تنظیمات جامع سایت
    saveConfig(newConfig) {
      try {
        const current = this.getConfig();
        const merged = { ...current, ...newConfig };
        localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(merged));
        this.logActivity('ویرایش تنظیمات سایت', 'تنظیمات عمومی سایت توسط ادمین به‌روزرسانی شد.');
        return { success: true, config: merged };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    // دریافت لیست مشاوران
    getAdvisors() {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.ADVISORS) || 'null');
        return stored || DEFAULT_ADVISORS;
      } catch (e) {
        return DEFAULT_ADVISORS;
      }
    },

    // ذخیره لیست مشاوران
    saveAdvisors(advisors) {
      try {
        localStorage.setItem(STORAGE_KEYS.ADVISORS, JSON.stringify(advisors));
        this.logActivity('ویرایش مشاوران', 'کادر مشاوران ارشد استارت به‌روزرسانی شد.');
        return { success: true };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    // دریافت کدهای تخفیف
    getDiscountCodes() {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.DISCOUNT_CODES) || 'null');
        return stored || DEFAULT_DISCOUNTS;
      } catch (e) {
        return DEFAULT_DISCOUNTS;
      }
    },

    // ذخیره کدهای تخفیف
    saveDiscountCodes(codes) {
      try {
        localStorage.setItem(STORAGE_KEYS.DISCOUNT_CODES, JSON.stringify(codes));
        return { success: true };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    // اعتبارسنجی کد تخفیف
    validateDiscount(code) {
      if (!code) return { valid: false, message: 'کد تخفیف وارد نشده است.' };
      const normalized = String(code).trim().toUpperCase();
      const list = this.getDiscountCodes();
      const item = list.find(c => c.code.toUpperCase() === normalized && c.active);
      if (!item) {
        return { valid: false, message: 'کد تخفیف معتبر نیست یا منقضی شده است.' };
      }
      if (item.usageCount >= item.maxUsage) {
        return { valid: false, message: 'ظرفیت استفاده از این کد تخفیف به پایان رسیده است.' };
      }
      return { valid: true, discount: item };
    },

    // دریافت سوالات سفارشی افزوده شده توسط ادمین
    getCustomQuestions() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_QUESTIONS) || '[]');
      } catch (e) {
        return [];
      }
    },

    // افزودن سوال تستی جدید به بانک سوالات
    addCustomQuestion(q) {
      try {
        const list = this.getCustomQuestions();
        const newQ = {
          id: 'custom_' + Date.now(),
          question_number: (window.EXAM_QUESTIONS_DATABASE ? window.EXAM_QUESTIONS_DATABASE.length : 560) + list.length + 1,
          lesson: q.lesson || 'زیست‌شناسی',
          grade: q.grade || 'دوازدهم',
          chapter: q.chapter || 'فصل ۱',
          section: q.section || 'مبحث تخصصی',
          sub_topic: q.sub_topic || '',
          difficulty: q.difficulty || 'متوسط',
          question_type: q.question_type || 'مفهومی',
          estimated_time_seconds: parseInt(q.estimated_time_seconds, 10) || 60,
          has_trap: !!q.has_trap,
          trap_note: q.trap_note || '',
          question_text: q.question_text || '',
          options: q.options || ['گزینه ۱', 'گزینه ۲', 'گزینه ۳', 'گزینه ۴'],
          correct_option: parseInt(q.correct_option, 10) || 1,
          detailed_solution: q.detailed_solution || '',
          exam_title: q.exam_title || 'سوال تالیفی دپارتمان تخصصی استارت',
          createdAt: new Date().toLocaleDateString('fa-IR')
        };
        list.unshift(newQ);
        localStorage.setItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(list));
        this.logActivity('افزودن سوال جدید', `تست جدید در مبحث «${newQ.lesson} - ${newQ.chapter}» ثبت شد.`);
        return { success: true, question: newQ };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    // حذف سوال سفارشی
    deleteCustomQuestion(id) {
      try {
        let list = this.getCustomQuestions();
        list = list.filter(q => q.id !== id);
        localStorage.setItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(list));
        this.logActivity('حذف سوال', `سوال با شناسه ${id} حذف گردید.`);
        return { success: true };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    // دریافت درخواست‌های مشاوره (Leads)
    getLeads() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.LEADS) || '[]');
      } catch (e) {
        return [];
      }
    },

    // به‌روزرسانی وضعیت لید مشاوره
    updateLeadStatus(leadIndex, status, adminNotes = '') {
      try {
        const leads = this.getLeads();
        if (leads[leadIndex]) {
          leads[leadIndex].status = status;
          if (adminNotes) leads[leadIndex].notes = adminNotes;
          leads[leadIndex].updatedAt = new Date().toLocaleDateString('fa-IR');
          localStorage.setItem(STORAGE_KEYS.LEADS, JSON.stringify(leads));
          return { success: true };
        }
        return { success: false, message: 'لید یافت نشد.' };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    // ثبت لاگ فعالیت‌های سیستمی
    logActivity(action, details) {
      try {
        const logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOG) || '[]');
        logs.unshift({
          id: 'log_' + Date.now(),
          action,
          details,
          timestamp: new Date().toLocaleDateString('fa-IR') + ' ' + new Date().toLocaleTimeString('fa-IR')
        });
        if (logs.length > 50) logs.length = 50; // نگهداری ۵۰ لاگ اخیر
        localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOG, JSON.stringify(logs));
      } catch (e) {}
    },

    // دریافت لاگ فعالیت‌های اخیر
    getLogs() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOG) || '[]');
      } catch (e) {
        return [];
      }
    },

    // پشتیبان‌گیری کامل دیتابیس به صورت JSON
    exportDatabase() {
      const db = {
        meta: {
          platform: 'START Academy Administration Engine',
          exportedAt: new Date().toISOString(),
          exportedDateFa: new Date().toLocaleDateString('fa-IR'),
          version: '4.0.0'
        },
        users: JSON.parse(localStorage.getItem('START_REGISTERED_USERS') || '[]'),
        cmsConfig: this.getConfig(),
        customQuestions: this.getCustomQuestions(),
        advisors: this.getAdvisors(),
        discountCodes: this.getDiscountCodes(),
        leads: this.getLeads(),
        mentorBookings: JSON.parse(localStorage.getItem('START_MENTOR_BOOKING') || 'null'),
        activityLogs: this.getLogs()
      };
      return JSON.stringify(db, null, 2);
    },

    // بازیابی کامل دیتابیس از فایل JSON
    importDatabase(jsonString) {
      try {
        const db = JSON.parse(jsonString);
        if (!db.meta || !db.users) {
          return { success: false, message: 'ساختار فایل پشتیبان معتبر نیست.' };
        }
        if (Array.isArray(db.users)) {
          localStorage.setItem('START_REGISTERED_USERS', JSON.stringify(db.users));
        }
        if (db.cmsConfig) {
          localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(db.cmsConfig));
        }
        if (Array.isArray(db.customQuestions)) {
          localStorage.setItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(db.customQuestions));
        }
        if (Array.isArray(db.advisors)) {
          localStorage.setItem(STORAGE_KEYS.ADVISORS, JSON.stringify(db.advisors));
        }
        if (Array.isArray(db.discountCodes)) {
          localStorage.setItem(STORAGE_KEYS.DISCOUNT_CODES, JSON.stringify(db.discountCodes));
        }
        if (Array.isArray(db.leads)) {
          localStorage.setItem(STORAGE_KEYS.LEADS, JSON.stringify(db.leads));
        }
        this.logActivity('بازیابی دیتابیس', 'اطلاعات کامل سامانه از فایل پشتیبان با موفقیت بازیابی شد.');
        return { success: true };
      } catch (e) {
        return { success: false, message: 'خطا در خواندن فایل JSON: ' + e.message };
      }
    },

    // اعمال خودکار مقادیر سفارشی به صفحات سایت در زمان لود
    applyToDOM() {
      const cfg = this.getConfig();

      // قیمت‌ها
      const pSilver = document.getElementById('price-display-silver');
      if (pSilver) pSilver.innerHTML = `${cfg.priceSilver} <span class="text-xs font-normal text-slate-500">تومان / ماهانه</span>`;

      const pGold = document.getElementById('price-display-gold');
      if (pGold) pGold.innerHTML = `${cfg.priceGold} <span class="text-xs font-normal text-slate-500">تومان / ماهانه</span>`;

      const pVip = document.getElementById('price-display-vip');
      if (pVip) pVip.innerHTML = `${cfg.priceVip} <span class="text-xs font-normal text-slate-500">تومان / ماهانه</span>`;

      // بنر سراسری اطلاعیه (بروزرسانی صرفاً روی کانتینر استاتیک موجود؛ بدون هرگونه تزریق پویا جهت تضمین CLS 0.0000)
      if (cfg.announcement && cfg.announcement.enabled && cfg.announcement.text) {
        const existingBanner = document.getElementById('global-cms-announcement');
        if (existingBanner) {
          existingBanner.classList.remove('hidden');
          existingBanner.innerHTML = `
            <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>${this.escapeHtml(cfg.announcement.text)}</span>
            ${cfg.announcement.link ? `<a href="${cfg.announcement.link}" class="underline text-sky-400 hover:text-sky-300 font-bold ml-1">${this.escapeHtml(cfg.announcement.linkText || 'اطلاعات بیشتر')} ←</a>` : ''}
          `;
        }
      } else {
        const existingBanner = document.getElementById('global-cms-announcement');
        if (existingBanner) existingBanner.classList.add('hidden');
      }

      // ادغام سوالات سفارشی در بانک سوالات در صورت باز بودن bank.html یا exam.html
      if (window.EXAM_QUESTIONS_DATABASE) {
        const customs = this.getCustomQuestions();
        if (customs && customs.length > 0) {
          // جلوگیری از تکرار ادغام
          if (!window.__CUSTOM_QUESTIONS_MERGED__) {
            window.EXAM_QUESTIONS_DATABASE = [...customs, ...window.EXAM_QUESTIONS_DATABASE];
            window.__CUSTOM_QUESTIONS_MERGED__ = true;
          }
        }
      }
    },

    escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };

  // اجرای اعمال DOM در زمان بارگذاری صفحه
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => StartCMS.applyToDOM());
  } else {
    StartCMS.applyToDOM();
  }

  window.StartCMS = StartCMS;
})(window);
