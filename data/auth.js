/**
 * START Academy Unified Authentication & User Session Engine
 * مدیریت متمرکز ثبت‌نام داوطلبان با رمز عبور، احراز هویت، نشست‌های کاربری و همگام‌سازی پنل
 */
(function(window) {
  'use strict';

  const safeStorage = {
    getItem(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    setItem(key, val) { try { localStorage.setItem(key, val); return true; } catch (e) { return false; } },
    removeItem(key) { try { localStorage.removeItem(key); } catch (e) {} }
  };
  window.safeStorage = safeStorage;

  const StartAuth = {
    // ابزار هش قطعی رمز عبور و اعتبارسنجی امن
    _hashPassword(plain) {
      if (!plain || typeof plain !== 'string') return '';
      let hash = 0x811c9dc5;
      const str = 'START_SALT_V1_' + plain;
      for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      return 's1$' + (hash >>> 0).toString(16).padStart(8, '0');
    },

    _verifyPassword(plain, stored) {
      if (!stored) return false;
      if (typeof stored === 'string' && stored.startsWith('s1$')) {
        return this._hashPassword(plain) === stored;
      }
      return stored === plain;
    },

    // پاکسازی تمامی کلیدهای موقت و نشست قبلی جهت جلوگیری از نشت داده
    _clearSessionData() {
      const keys = [
        'START_EXAM_HISTORY',
        'START_MISTAKES_NOTEBOOK',
        'START_BOOKMARKED_QUESTIONS',
        'START_BOOKMARKED_QUESTIONS_DATA',
        'START_SYLLABUS_PROGRESS',
        'START_NIGHTLY_LOGS_V1',
        'START_STUDY_LOGS',
        'START_OFFLINE_EXAMS',
        'START_STUDENT_WEEKLY_PLAN',
        'START_WEEKLY_PLAN_PROGRESS',
        'START_PAYMENT_RECEIPTS',
        'START_MENTOR_BOOKING',
        'START_USER_RESOURCES'
      ];
      keys.forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
      });
    },

    // بازیابی داده‌های ذخیره‌شده اختصاصی کاربر
    _restoreUserData(user) {
      this._clearSessionData();
      if (!user) return;

      const archived = user.archivedStudyData || {};
      try {
        if (archived.studyLogs) localStorage.setItem('START_STUDY_LOGS', archived.studyLogs);
        if (archived.offlineExams) localStorage.setItem('START_OFFLINE_EXAMS', archived.offlineExams);
        if (archived.examHistory) localStorage.setItem('START_EXAM_HISTORY', archived.examHistory);
        if (archived.mistakesNotebook) localStorage.setItem('START_MISTAKES_NOTEBOOK', archived.mistakesNotebook);
        if (archived.bookmarkedQuestions) localStorage.setItem('START_BOOKMARKED_QUESTIONS', archived.bookmarkedQuestions);
        if (archived.bookmarkedQuestionsData) localStorage.setItem('START_BOOKMARKED_QUESTIONS_DATA', archived.bookmarkedQuestionsData);
        if (archived.syllabusProgress) localStorage.setItem('START_SYLLABUS_PROGRESS', archived.syllabusProgress);
        if (archived.nightlyLogs) localStorage.setItem('START_NIGHTLY_LOGS_V1', archived.nightlyLogs);
        if (archived.weeklyPlan) localStorage.setItem('START_STUDENT_WEEKLY_PLAN', archived.weeklyPlan);
        if (archived.weeklyPlanProgress) localStorage.setItem('START_WEEKLY_PLAN_PROGRESS', archived.weeklyPlanProgress);
        if (archived.receipts) localStorage.setItem('START_PAYMENT_RECEIPTS', archived.receipts);
        if (archived.resources) localStorage.setItem('START_USER_RESOURCES', archived.resources);
      } catch (e) {}
    },

    // بایگانی داده‌های اختصاصی کاربر جاری قبل از خروج
    _archiveUserData(user) {
      if (!user || (!user.id && !user.email)) return;
      try {
        user.archivedStudyData = {
          studyLogs: localStorage.getItem('START_STUDY_LOGS'),
          offlineExams: localStorage.getItem('START_OFFLINE_EXAMS'),
          examHistory: localStorage.getItem('START_EXAM_HISTORY'),
          mistakesNotebook: localStorage.getItem('START_MISTAKES_NOTEBOOK'),
          bookmarkedQuestions: localStorage.getItem('START_BOOKMARKED_QUESTIONS'),
          bookmarkedQuestionsData: localStorage.getItem('START_BOOKMARKED_QUESTIONS_DATA'),
          syllabusProgress: localStorage.getItem('START_SYLLABUS_PROGRESS'),
          nightlyLogs: localStorage.getItem('START_NIGHTLY_LOGS_V1'),
          weeklyPlan: localStorage.getItem('START_STUDENT_WEEKLY_PLAN'),
          weeklyPlanProgress: localStorage.getItem('START_WEEKLY_PLAN_PROGRESS'),
          receipts: localStorage.getItem('START_PAYMENT_RECEIPTS'),
          resources: localStorage.getItem('START_USER_RESOURCES')
        };
        const users = this.getUsers();
        const idx = users.findIndex(u => (user.id && u.id === user.id) || (u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase()));
        if (idx !== -1) {
          users[idx].archivedStudyData = user.archivedStudyData;
          localStorage.setItem('START_REGISTERED_USERS', JSON.stringify(users));
        }
      } catch (e) {}
    },

    // داده‌های نمونه اولیه جهت راه‌اندازی و پویایی آنی سامانه
    getDefaultSeedUsers() {
      const now = Date.now();
      return [
        {
          id: 'usr_sara',
          name: 'سارا محمدی',
          email: 'sara@example.com',
          password: 'password123',
          phone: '۰۹۱۲۳۴۵۶۷۸۱',
          grade: 'دوازدهم',
          major: 'تجربی',
          plan: 'gold',
          planName: 'پلن طلایی (مربیگری حرفه‌ای)',
          planStatus: 'active',
          billingCycle: 'monthly',
          planExpiresAt: '۱۴۰۵/۰۴/۱۵',
          planDaysLeft: 180,
          joinedAt: '۱۴۰۴/۰۸/۰۱',
          targetScore: '+۷,۲۰۰ سنجش',
          studyHoursTarget: 8.5,
          notes: 'عالی در زیست و شیمی، نیازمند تمرین زمان‌های نقصانی ریاضی.',
          bankPercent: 75,
          troubleshootingWeeklyQuota: 12,
          troubleshootingUsedThisWeek: 3,
          callsPerMonth: 2,
          callsUsedThisMonth: 1,
          subjectAnalysisCount: 'all',
          comprehensiveExamsPerMonth: 1
        },
        {
          id: 'usr_ali',
          name: 'علی رضایی',
          email: 'ali.rezaei@example.com',
          password: 'password123',
          phone: '۰۹۱۴۱۱۱۲۲۳۳',
          grade: 'دوازدهم',
          major: 'ریاضی',
          plan: 'silver',
          planName: 'پلن نقره‌ای (هدایت پایه)',
          planStatus: 'active',
          billingCycle: 'monthly',
          planExpiresAt: '۱۴۰۴/۱۱/۳۰',
          planDaysLeft: 65,
          joinedAt: '۱۴۰۴/۰۸/۱۵',
          targetScore: '+۶,۸۰۰ آزمون آزمایشی',
          studyHoursTarget: 7.5,
          notes: 'تثبیت حسابان دوازدهم و هندسه پایه.',
          bankPercent: 50,
          troubleshootingWeeklyQuota: 8,
          troubleshootingUsedThisWeek: 2,
          callsPerMonth: 1,
          callsUsedThisMonth: 0,
          subjectAnalysisCount: 'all',
          comprehensiveExamsPerMonth: 0
        },
        {
          id: 'usr_mobina',
          name: 'مبینا رحیمی',
          email: 'mobina.r@example.com',
          password: 'password123',
          phone: '۰۹۱۸۲۲۲۳۳۴۴',
          grade: 'فارغ‌التحصیل',
          major: 'تجربی',
          plan: 'vip',
          planName: 'پلن VIP الماس (مربیگری جامع)',
          planStatus: 'active',
          billingCycle: 'annual',
          planExpiresAt: '۱۴۰۵/۰۴/۲۰',
          planDaysLeft: 240,
          joinedAt: '۱۴۰۴/۰۷/۱۰',
          targetScore: '+۷,۶۰۰ آزمون آزمایشی (پزشکی تهران)',
          studyHoursTarget: 10.5,
          notes: 'پایش دوبار در شبانه‌روز، تحلیل تله‌های گیاهی آزمون آزمایشی.',
          bankPercent: 100,
          troubleshootingWeeklyQuota: 20,
          troubleshootingUsedThisWeek: 5,
          callsPerMonth: 4,
          callsUsedThisMonth: 2,
          subjectAnalysisCount: 'all',
          comprehensiveExamsPerMonth: 4
        },
        {
          id: 'usr_mohammad',
          name: 'محمد حسینی',
          email: 'mohammad.h@example.com',
          password: 'password123',
          phone: '۰۹۳۵۳۳۳۴۴۵۵',
          grade: 'یازدهم',
          major: 'انسانی',
          plan: 'free',
          planName: 'حساب پایه (رایگان)',
          planStatus: 'free',
          billingCycle: 'monthly',
          planExpiresAt: 'همیشگی',
          planDaysLeft: 9999,
          registeredTimestamp: now - (30 * 86400000), // ۳۰ روز قبل ثبت‌نام کرده
          trialExpiresAt: now - (23 * 86400000), // دوره آزمایشی تمام شده
          trialCallsRemaining: 0,
          trialStudyPlanUsed: true,
          lifetimeBankPercent: 25,
          troubleshootingWeeklyQuota: 4,
          troubleshootingUsedThisWeek: 1,
          joinedAt: '۱۴۰۴/۰۹/۰۱',
          targetScore: '+۶,۲۰۰ آزمون آزمایشی',
          studyHoursTarget: 6.0,
          notes: 'اکانت پایه رایگان: ۲۵٪ بانک تست و ۴ رفع اشکال هفتگی فعال است.'
        },
        {
          id: 'usr_fatemeh',
          name: 'فاطمه کریمی',
          email: 'fatemeh.k@example.com',
          password: 'password123',
          phone: '۰۹۱۲۹۹۹۸۸۷۷',
          grade: 'دهم',
          major: 'تجربی',
          plan: 'free',
          planName: 'حساب پایه (هدیه آزمایشی ۷ روزه مشاوره)',
          planStatus: 'trial',
          billingCycle: 'monthly',
          registeredTimestamp: now - (2 * 86400000), // ۲ روز قبل ثبت‌نام کرده
          trialExpiresAt: now + (5 * 86400000), // ۵ روز دیگر مهلت دارد
          trialCallsRemaining: 1,
          trialStudyPlanUsed: false,
          lifetimeBankPercent: 25,
          troubleshootingWeeklyQuota: 4,
          troubleshootingUsedThisWeek: 0,
          joinedAt: '۱۴۰۴/۰۹/۰۸',
          targetScore: '+۷,۰۰۰ سنجش',
          studyHoursTarget: 6.5,
          notes: 'در حال استفاده از هدیه آزمایشی ۷ روزه مشاوره استارت.'
        }
      ];
    },

    // دریافت لیست کل کاربران ثبت‌نام‌شده
    getUsers() {
      try {
        let users = JSON.parse(localStorage.getItem('START_REGISTERED_USERS') || 'null');
        if (!users || users.length === 0) {
          users = this.getDefaultSeedUsers();
          localStorage.setItem('START_REGISTERED_USERS', JSON.stringify(users));
        }
        return users;
      } catch (e) {
        return this.getDefaultSeedUsers();
      }
    },

    // دریافت اطلاعات کاربر فعال جاری (Session)
    getSession() {
      try {
        const u = JSON.parse(localStorage.getItem('START_USER_SESSION') || 'null');
        if (u && !u.plan) {
          u.plan = 'free';
          u.planName = 'حساب کاربری پایه (رایگان)';
          u.planStatus = 'free';
        }
        return u;
      } catch (e) {
        return null;
      }
    },

    // اطلاعات و مشخصات متمرکز پلن‌های آموزشی استارت
    getPlanInfo(planKey, billingCycle = 'monthly') {
      const isAnnual = billingCycle === 'annual';
      const plans = {
        free: {
          id: 'free',
          name: 'اکانت پایه (۱ هفته تست رایگان طلایی)',
          badge: 'کاربر رایگان',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
          price: 'رایگان',
          priceMonthly: 'رایگان',
          priceAnnual: 'رایگان',
          priceMonthlyNum: 0,
          priceAnnualNum: 0,
          isPaid: false,
          color: 'slate',
          mentorTitle: 'فاقد مشاور ثابت (شامل ۲ تماس ارزیابی در هفته اول تست طلایی)',
          bankAccessPercent: 25,
          troubleshootingWeeklyQuota: 4,
          callsPerWeek: 0,
          callsPerMonth: 0,
          subjectAnalysisCount: 0,
          comprehensiveExams: 0,
          trialDurationDays: 7,
          weeklyPlanText: '۱ هفته برنامه مطالعاتی رایگان مخصوص دانش‌آموز (هدیه تست طلایی)',
          trialFeatures: '۱ هفته استفاده کاملاً رایگان از امکانات پلن طلایی (۲ تماس در هفته + برنامه اختصاصی)',
          features: {
            weeklyPlanText: '۱ هفته برنامه مطالعاتی رایگان مخصوص دانش‌آموز',
            studyLog: false, // پس از دوره آزمایشی قفل است
            studyLogNotice: 'ثبت گزارش کار شبانه مختص پلن‌های مشاوره است.',
            mentorBooking: false,
            advisorExamReview: false,
            homeworkChecklist: false,
            bankAccessPercent: 25,
            bankAccessText: 'دسترسی رایگان به ۲۵٪ سوالات بانک تست',
            troubleshootingWeekly: 4,
            troubleshootingText: '۴ سوال رفع اشکال در هر هفته (رایگان)',
            callsPerWeek: 0,
            callsText: 'بدون تماس دوره‌ای (۲ تماس در هفته اول هدیه تست طلایی)',
            subjectAnalysisText: 'بدون تحلیل کارنامه و دروس',
            comprehensiveExamsText: 'بدون آزمون‌ساز جامع'
          }
        },
        silver: {
          id: 'silver',
          name: 'پلن نقره‌ای',
          badge: 'پلن نقره‌ای',
          badgeClass: 'bg-slate-200 text-slate-800 border-slate-300 font-bold',
          price: isAnnual ? '۱۶,۳۲۰,۰۰۰ تومان / سالانه' : '۱,۶۰۰,۰۰۰ تومان / ماهانه',
          priceMonthly: '۱,۶۰۰,۰۰۰ تومان / ماهانه',
          priceAnnual: '۱۶,۳۲۰,۰۰۰ تومان / سالانه',
          priceMonthlyEquivalent: '۱,۳۶۰,۰۰۰ تومان / ماهانه',
          priceMonthlyNum: 1600000,
          priceAnnualNum: 16320000,
          annualSavingsText: 'صرفه‌جویی ۲,۸۸۰,۰۰۰ تومان در سال (۱۵٪ تخفیف)',
          isPaid: true,
          color: 'slate',
          mentorTitle: 'مشاور تحصیلی: ۱ تماس در هفته + برنامه هفتگی اختصاصی',
          bankAccessPercent: 50,
          troubleshootingWeeklyQuota: 8,
          callsPerWeek: 1,
          callsPerMonth: 4,
          subjectAnalysisCount: 'all',
          comprehensiveExams: 0,
          weeklyPlanText: 'برنامه هفتگی اختصاصی و شخصی‌سازی‌شده مخصوص هر دانش‌آموز',
          features: {
            weeklyPlanText: 'برنامه هفتگی اختصاصی و شخصی‌سازی‌شده مخصوص هر دانش‌آموز',
            studyLog: true,
            studyLogFrequency: 'پایش و ثبت گزارش کار ۷ شب در هفته (راس ۲۳:۳۰)',
            mentorBooking: true,
            callsPerWeek: 1,
            callsPerMonth: 4,
            callsText: 'تماس تلفنی: ۱ بار در هفته با مشاور تحصیلی',
            advisorExamReview: true,
            subjectAnalysisCount: 'all',
            subjectAnalysisText: 'تحلیل اختصاصی سوالات و کارنامه آزمون',
            comprehensiveExams: 0,
            comprehensiveExamsText: 'آزمون جامع: ندارد (بدون آزمون)',
            bankAccessPercent: 50,
            bankAccessText: 'دسترسی به ۵۰٪ بانک سوالات',
            troubleshootingWeekly: 8,
            troubleshootingText: 'رفع اشکال هر هفته فقط ۸ سوال',
            homeworkChecklist: true
          }
        },
        gold: {
          id: 'gold',
          name: 'پلن طلایی (با ۱ هفته تست رایگان)',
          badge: 'پلن طلایی فعال',
          badgeClass: 'bg-sky-50 text-sky-800 border-sky-300 font-black',
          price: isAnnual ? '۲۵,۵۰۰,۰۰۰ تومان / سالانه' : '۲,۵۰۰,۰۰۰ تومان / ماهانه',
          priceMonthly: '۲,۵۰۰,۰۰۰ تومان / ماهانه',
          priceAnnual: '۲۵,۵۰۰,۰۰۰ تومان / سالانه',
          priceMonthlyEquivalent: '۲,۱۲۵,۰۰۰ تومان / ماهانه',
          priceMonthlyNum: 2500000,
          priceAnnualNum: 25500000,
          annualSavingsText: 'صرفه‌جویی ۴,۵۰۰,۰۰۰ تومان در سال (۱۵٪ تخفیف)',
          hasFreeTrial: true,
          freeTrialDays: 7,
          isPaid: true,
          color: 'sky',
          mentorTitle: 'مشاور ارشد: ۲ تماس در هفته + پایش شبانه ۲۳:۳۰',
          bankAccessPercent: 75,
          troubleshootingWeeklyQuota: 12,
          callsPerWeek: 2,
          callsPerMonth: 8,
          subjectAnalysisCount: 'all',
          comprehensiveExams: 1,
          weeklyPlanText: 'برنامه هفتگی اختصاصی و شخصی‌سازی‌شده مخصوص هر دانش‌آموز',
          features: {
            freeTrialNotice: '۱ هفته تست کاملاً رایگان برای شروع بدون پرداخت اولیه',
            weeklyPlanText: 'برنامه هفتگی اختصاصی و شخصی‌سازی‌شده مخصوص هر دانش‌آموز',
            studyLog: true,
            studyLogFrequency: 'پایش و ثبت گزارش کار ۷ شب در هفته (راس ۲۳:۳۰)',
            mentorBooking: true,
            callsPerWeek: 2,
            callsPerMonth: 8,
            callsText: 'تماس تلفنی: ۲ بار در هفته با مشاور',
            advisorExamReview: true,
            subjectAnalysisCount: 'all',
            subjectAnalysisText: 'تحلیل اختصاصی سوالات و کارنامه آزمون',
            comprehensiveExams: 1,
            comprehensiveExamsText: 'آزمون جامع: ماهی ۱ آزمون',
            bankAccessPercent: 75,
            bankAccessText: 'دسترسی به ۷۵٪ سوالات بانک تست',
            troubleshootingWeekly: 12,
            troubleshootingText: 'رفع اشکال هر هفته ۱۲ سوال',
            homeworkChecklist: true
          }
        },
        vip: {
          id: 'vip',
          name: 'پلن VIP الماس',
          badge: 'پلن VIP الماس',
          badgeClass: 'bg-indigo-50 text-indigo-900 border-indigo-300 font-black',
          price: isAnnual ? '۴۰,۸۰۰,۰۰۰ تومان / سالانه' : '۴,۰۰۰,۰۰۰ تومان / ماهانه',
          priceMonthly: '۴,۰۰۰,۰۰۰ تومان / ماهانه',
          priceAnnual: '۴۰,۸۰۰,۰۰۰ تومان / سالانه',
          priceMonthlyEquivalent: '۳,۴۰۰,۰۰۰ تومان / ماهانه',
          priceMonthlyNum: 4000000,
          priceAnnualNum: 40800000,
          annualSavingsText: 'صرفه‌جویی ۷,۲۰۰,۰۰۰ تومان در سال (۱۵٪ تخفیف)',
          isPaid: true,
          color: 'indigo',
          mentorTitle: 'مشاور ارشد: ۳ تماس در هفته + ۱ جلسه حضوری در تبریز',
          bankAccessPercent: 100,
          troubleshootingWeeklyQuota: 20,
          callsPerWeek: 3,
          callsPerMonth: 12,
          inPersonLocation: 'تبریز',
          subjectAnalysisCount: 'all',
          comprehensiveExams: 4,
          weeklyPlanText: 'برنامه هفتگی اختصاصی و شخصی‌سازی‌شده مخصوص هر دانش‌آموز',
          features: {
            weeklyPlanText: 'برنامه هفتگی اختصاصی و شخصی‌سازی‌شده مخصوص هر دانش‌آموز',
            studyLog: true,
            studyLogFrequency: 'پایش و پیگیری اختصاصی هر شب راس ساعت ۲۳:۳۰',
            mentorBooking: true,
            callsPerWeek: 3,
            callsPerMonth: 12,
            callsText: 'تماس تلفنی: ۳ بار در هفته با مشاور',
            inPersonSessionText: '۱ جلسه مشاوره حضوری در ماه (مخصوص داوطلبان تبریز)',
            advisorExamReview: true,
            subjectAnalysisCount: 'all',
            subjectAnalysisText: 'تحلیل اختصاصی سوالات و کارنامه آزمون',
            comprehensiveExams: 4,
            comprehensiveExamsText: 'آزمون جامع: ۴ آزمون جامع شبیه‌ساز در ماه',
            bankAccessPercent: 100,
            bankAccessText: 'دسترسی ۱۰۰٪ کامل به بانک سوالات (+۱۰,۰۰۰ تست آزمون آزمایشی)',
            troubleshootingWeekly: 20,
            troubleshootingText: 'رفع اشکال تست: ۲۰ سوال در هفته',
            homeworkChecklist: true
          }
        }
      };
      return plans[planKey] || plans.free;
    },

    // به‌روزرسانی یا تغییر پلن کاربر جاری
    updatePlan(planKey, billingCycle = 'monthly') {
      const session = this.getSession();
      if (!session) return { success: false, message: 'ابتدا وارد حساب کاربری شوید.' };
      const planInfo = this.getPlanInfo(planKey, billingCycle);
      session.plan = planInfo.id;
      session.planName = planInfo.name;
      session.billingCycle = billingCycle;
      session.planStatus = planInfo.isPaid ? 'active' : 'free';
      session.bankPercent = planInfo.bankAccessPercent;
      session.troubleshootingWeeklyQuota = planInfo.troubleshootingWeeklyQuota;
      session.callsPerMonth = planInfo.callsPerMonth;
      session.planUpdatedAt = new Date().toLocaleDateString('fa-IR');

      const users = this.getUsers();
      const idx = users.findIndex(u => u.email.toLowerCase() === session.email.toLowerCase());
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...session };
        try {
          localStorage.setItem('START_REGISTERED_USERS', JSON.stringify(users));
        } catch (e) {}
      }

      try {
        localStorage.setItem('START_USER_SESSION', JSON.stringify(this._sanitizeSessionUser(session)));
      } catch (e) {}

      return { success: true, plan: planInfo };
    },

    // محاسبه وضعیت دوره آزمایشی ۷ روزه کاربر
    getUserTrialStatus(user) {
      if (!user) user = this.getSession();
      if (!user) return { isTrialActive: false, trialNotStarted: true, daysRemaining: 0, callsRemaining: 0, hasLifetimeFree: true };

      // اگر پلن پولی باشد، محدودیت آزمایشی ندارد
      if (user.plan && user.plan !== 'free' && user.planStatus !== 'trial') {
        const planInfo = this.getPlanInfo(user.plan);
        return {
          isPaidUser: true,
          isTrialActive: false,
          trialNotStarted: false,
          daysRemaining: user.planDaysLeft || 180,
          callsRemaining: user.callsPerMonth || 2,
          bankPercent: planInfo.bankAccessPercent,
          troubleshootingQuota: planInfo.troubleshootingWeeklyQuota,
          hasLifetimeFree: true
        };
      }

      // اگر کاربر در حال استفاده از دوره آزمایشی فعال باشد
      if (user.trialExpiresAt && user.planStatus === 'trial') {
        const now = Date.now();
        const diffMs = user.trialExpiresAt - now;
        const daysRemaining = Math.max(0, Math.ceil(diffMs / 86400000));
        const isTrialActive = diffMs > 0;
        return {
          isPaidUser: false,
          isTrialActive,
          trialNotStarted: false,
          trialPlan: 'gold',
          daysRemaining: isTrialActive ? daysRemaining : 0,
          callsRemaining: isTrialActive ? (user.trialCallsRemaining !== undefined ? user.trialCallsRemaining : 2) : 0,
          trialStudyPlanUsed: !!user.trialStudyPlanUsed,
          bankPercent: isTrialActive ? 75 : 25,
          troubleshootingQuota: isTrialActive ? 12 : 4,
          hasLifetimeFree: true,
          statusBadge: isTrialActive ? `طرح ۱ هفته رایگان طلایی (${daysRemaining} روز مانده)` : 'اکانت پایه رایگان (۲۵٪ بانک + ۴ رفع اشکال)'
        };
      }

      // کاربر رایگان پایه که هنوز دوره آزمایشی ۷ روزه را فعال نکرده است
      return {
        isPaidUser: false,
        isTrialActive: false,
        trialNotStarted: true,
        daysRemaining: 0,
        callsRemaining: 0,
        trialStudyPlanUsed: false,
        bankPercent: 25,
        troubleshootingQuota: 4,
        hasLifetimeFree: true,
        statusBadge: 'اکانت پایه رایگان (۲۵٪ بانک + ۴ رفع اشکال)'
      };
    },

    // داده‌های نمونه اولیه سوالات رفع اشکال درسی
    getDefaultTroubleshootingTickets() {
      return [
        {
          id: 'tb_1001',
          trackingCode: 'TB-849201',
          userId: 'usr_mobina',
          userName: 'مبینا رحیمی',
          userPhone: '۰۹۱۸۲۲۲۳۳۴۴',
          userEmail: 'mobina.r@example.com',
          plan: 'vip',
          planName: 'پلن VIP الماس',
          lesson: 'زیست‌شناسی',
          topic: 'گردش مواد و ساختار قلب در دهم (تست ۴۱ آزمون آزمایشی)',
          text: 'در تست ۴۱ آزمون آزمایشی، تفاوت دریچه سه‌لختی و میترال رو در هنگام انقباض بطن‌ها چطور تحلیل کنیم؟ در گزینه ۳ اشاره شده که فشار بطن مانع باز شدن دریچه سینی میشه در حالی که برعکسه. لطفاً دام طراح رو تشریح کنید.',
          hasPhoto: false,
          photoData: null,
          status: 'pending',
          submittedAt: '۱۴۰۴/۰۹/۱۴ ۱۱:۲۰',
          response: null,
          responderName: null,
          respondedAt: null
        },
        {
          id: 'tb_1002',
          trackingCode: 'TB-849202',
          userId: 'usr_sara',
          userName: 'سارا محمدی',
          userPhone: '۰۹۱۲۳۴۵۶۷۸۱',
          userEmail: 'sara@example.com',
          plan: 'gold',
          planName: 'پلن طلایی',
          lesson: 'شیمی',
          topic: 'استوکیومتری و واکنش‌های رسوبی دهم',
          text: 'سلام استاد، در محاسبه درصد خلوص کلسیم کربنات، آیا جرم گاز کربن دی‌اکسید آزاد شده همیشه باید در شرایط STP ضرب در ۲۲.۴ بشه یا فقط وقتی دما صفر و فشار ۱ اتمسفره؟',
          hasPhoto: false,
          photoData: null,
          status: 'answered',
          submittedAt: '۱۴۰۴/۰۹/۱۳ ۱۸:۴۵',
          response: 'سلام سارا جان، نکته بسیار کلیدی طراحان سنجش دقیقاً همینجاست: حجم مولی ۲۲.۴ لیتر فقط و فقط در شرایط STP (دما صفر درجه سلسیوس و فشار ۱ اتمسفر) معتبر است. اگر در صورت تست شرایط اتاق (۲۵ درجه سلسیوس) ذکر شود باید از حجم مولی ۲۴ یا ۲۴.۵ لیتر استفاده کنید. در این سوال طراح عبارت «شرایط استاندارد» را آورده بود، پس ۲۲.۴ صحیح است.',
          responderName: 'استاد علیرضا جباری (دپارتمان شیمی استارت)',
          respondedAt: '۱۴۰۴/۰۹/۱۳ ۲۰:۱۵'
        },
        {
          id: 'tb_1003',
          trackingCode: 'TB-849203',
          userId: 'usr_ali',
          userName: 'علی رضایی',
          userPhone: '۰۹۱۴۱۱۱۲۲۳۳',
          userEmail: 'ali.rezaei@example.com',
          plan: 'silver',
          planName: 'پلن نقره‌ای',
          lesson: 'ریاضی',
          topic: 'تابع وارون و دامنه توابع مرکب',
          text: 'استاد در تعیین ضابطه وارون تابع درجه دو، وقتی دامنه محدود شده مثلا x>=2، چطور علامت پشت رادیکال رو مثبت یا منفی انتخاب کنیم؟',
          hasPhoto: false,
          photoData: null,
          status: 'pending',
          submittedAt: '۱۴۰۴/۰۹/۱۴ ۰۹:۱۵',
          response: null,
          responderName: null,
          respondedAt: null
        }
      ];
    },

    // دریافت لیست کل سوالات رفع اشکال (با فیلتر کاربر یا کل برای ادمین)
    getTroubleshootingTickets(userId = null) {
      try {
        let tickets = JSON.parse(localStorage.getItem('START_TROUBLESHOOTING_TICKETS') || 'null');
        if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
          tickets = this.getDefaultTroubleshootingTickets();
          localStorage.setItem('START_TROUBLESHOOTING_TICKETS', JSON.stringify(tickets));
        }
        if (userId) {
          return tickets.filter(t => t.userId === userId || t.userPhone === userId || (t.userEmail && t.userEmail === userId));
        }
        return tickets;
      } catch (e) {
        return this.getDefaultTroubleshootingTickets();
      }
    },

    // دریافت وضعیت سهمیه هفتگی رفع اشکال و ریست خودکار هر شنبه
    getTroubleshootingStatus(user) {
      if (!user) user = this.getSession();
      const planKey = user ? (user.plan || 'free') : 'free';
      const planInfo = this.getPlanInfo(planKey);
      const maxQuota = planInfo.troubleshootingWeeklyQuota || 4;
      const isUnlimited = maxQuota >= 999;

      const now = Date.now();
      let weekStart = user ? (user.troubleshootingWeekStart || 0) : 0;
      let used = user ? (user.troubleshootingUsedThisWeek || 0) : 0;

      // بررسی گذشت یک هفته کامل (۷ روز)
      if (!weekStart || (now - weekStart) >= 7 * 86400000) {
        weekStart = now;
        used = 0;
        if (user) {
          user.troubleshootingWeekStart = weekStart;
          user.troubleshootingUsedThisWeek = 0;
          this.updateUserSessionState(user);
        }
      }

      const remaining = isUnlimited ? 999 : Math.max(0, maxQuota - used);
      const daysUntilReset = Math.max(1, Math.ceil((weekStart + 7 * 86400000 - now) / 86400000));

      return {
        quota: maxQuota,
        used,
        remaining,
        isUnlimited,
        daysUntilReset,
        planName: planInfo.name
      };
    },

    // ثبت درخواست رفع اشکال جدید و کسر از سهمیه هفتگی
    submitTroubleshooting(questionId, lesson, text, photoData = null, topic = '') {
      const user = this.getSession();
      if (!user) {
        return { success: false, message: 'جهت ثبت سوال رفع اشکال، ابتدا وارد حساب کاربری شوید.' };
      }

      const status = this.getTroubleshootingStatus(user);
      if (!status.isUnlimited && status.remaining <= 0) {
        return { 
          success: false, 
          message: `سهمیه رفع اشکال این هفته شما (${status.quota} سوال) به پایان رسیده است. تا ${status.daysUntilReset} روز دیگر سهمیه هفتگی شما تمدید خواهد شد یا می‌توانید پلن خود را ارتقا دهید.` 
        };
      }

      // کسر سهمیه
      if (!status.isUnlimited) {
        user.troubleshootingUsedThisWeek = (user.troubleshootingUsedThisWeek || 0) + 1;
        this.updateUserSessionState(user);
      }

      const code = 'TB-' + Math.floor(100000 + Math.random() * 900000);
      const ticket = {
        id: 'tb_' + Date.now(),
        trackingCode: code,
        userId: user.id || user.phone || 'guest',
        userName: user.name || 'داوطلب استارت',
        userPhone: user.phone || user.email || '—',
        userEmail: user.email || '',
        plan: user.plan || 'free',
        planName: user.planName || 'حساب کاربری',
        questionId: questionId || null,
        lesson: lesson || 'عمومی',
        topic: (topic || '').trim(),
        text: (text || '').trim(),
        hasPhoto: !!photoData,
        photoData: photoData || null,
        submittedAt: new Date().toLocaleDateString('fa-IR') + ' ' + new Date().toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'}),
        status: 'pending', // pending, answered
        response: null,
        responderName: null,
        respondedAt: null
      };

      try {
        let tickets = this.getTroubleshootingTickets();
        tickets.unshift(ticket);
        localStorage.setItem('START_TROUBLESHOOTING_TICKETS', JSON.stringify(tickets));
      } catch (e) {}

      return {
        success: true,
        message: `سوال رفع اشکال شما با شناسه پیگیری ${code} با موفقیت ثبت شد و در اولویت پاسخ‌گویی اساتید استارت قرار گرفت.`,
        remaining: status.isUnlimited ? 'نامحدود' : Math.max(0, status.remaining - 1),
        ticket
      };
    },

    // پاسخ رسمی اساتید و ادمین به سوال رفع اشکال داوطلب
    replyTroubleshootingTicket(ticketId, replyText, responderName = 'استاد و مشاور ارشد استارت') {
      if (!ticketId || !replyText) return { success: false, message: 'شناسه سوال و متن پاسخ الزامی است.' };
      const tickets = this.getTroubleshootingTickets();
      const idx = tickets.findIndex(t => t.id === ticketId);
      if (idx === -1) return { success: false, message: 'سوال رفع اشکال مورد نظر یافت نشد.' };

      tickets[idx].response = replyText.trim();
      tickets[idx].responderName = (responderName || 'استاد رفع اشکال استارت').trim();
      tickets[idx].respondedAt = new Date().toLocaleDateString('fa-IR') + ' ' + new Date().toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'});
      tickets[idx].status = 'answered';

      try {
        localStorage.setItem('START_TROUBLESHOOTING_TICKETS', JSON.stringify(tickets));
      } catch (e) {}

      return { success: true, ticket: tickets[idx], message: 'پاسخ رفع اشکال با موفقیت برای داوطلب ثبت و ارسال شد.' };
    },

    // بررسی دسترسی کاربر به تست مشخص (بر اساس سهمیه درصدی بانک تست)
    canAccessBankQuestion(question, allQuestions = null, user = null) {
      if (!user) user = this.getSession();
      const planKey = user ? (user.plan || 'free') : 'free';
      const planInfo = this.getPlanInfo(planKey);
      const allowedPercent = planInfo.bankAccessPercent !== undefined ? planInfo.bankAccessPercent : 25;

      if (allowedPercent >= 100) return true;

      // محاسبه عادلانه و تفکیک‌شده بر اساس هر درس: ۲۵٪ هر درس باز است
      if (question && typeof question === 'object' && question.lesson && Array.isArray(allQuestions) && allQuestions.length > 0) {
        const lessonQuestions = allQuestions.filter(x => x.lesson === question.lesson);
        const idxInLesson = lessonQuestions.findIndex(x => x.id === question.id);
        if (idxInLesson >= 0 && lessonQuestions.length > 0) {
          const rank = (idxInLesson / lessonQuestions.length) * 100;
          return rank < allowedPercent;
        }
      }

      // اگر آرایه داده نشده باشد، تست‌ها را به صورت چرخشی بررسی می‌کند
      if (question && typeof question === 'object' && question.id) {
        return ((question.id - 1) % 4) === 0 || ((question.id - 1) % 100) < allowedPercent;
      }

      const qIdx = (typeof question === 'number') ? question : 0;
      return (qIdx % 100) < allowedPercent;
    },

    // ذخیره وضعیت جاری کاربر در سشن و کاربران دیتابیس لوکال
    updateUserSessionState(user) {
      try {
        localStorage.setItem('START_USER_SESSION', JSON.stringify(this._sanitizeSessionUser(user)));
        const users = this.getUsers();
        const idx = users.findIndex(u => u.email.toLowerCase() === user.email.toLowerCase());
        if (idx !== -1) {
          users[idx] = { ...users[idx], ...user };
          localStorage.setItem('START_REGISTERED_USERS', JSON.stringify(users));
        }
      } catch (e) {}
    },

    // تبدیل ارقام فارسی و عربی به انگلیسی و استانداردسازی شماره موبایل
    normalizePhone(phone) {
      if (!phone) return '';
      let str = String(phone).trim();
      const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
      const arDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      for (let i = 0; i < 10; i++) {
        str = str.split(faDigits[i]).join(String(i)).split(arDigits[i]).join(String(i));
      }
      str = str.replace(/[^\d+]/g, '');
      if (str.startsWith('+98')) str = '0' + str.slice(3);
      else if (str.startsWith('0098')) str = '0' + str.slice(4);
      else if (str.length === 10 && str.startsWith('9')) str = '0' + str;
      return str;
    },

    // فعال‌سازی فوری دوره ۱ هفته تست رایگان پلن طلایی برای کاربر جاری به همراه لینک تلگرام
    activateGoldTrial() {
      const user = this.getSession();
      if (!user) return { success: false, message: 'لطفاً ابتدا وارد حساب کاربری خود شوید.' };

      const now = Date.now();
      user.plan = 'gold';
      user.planName = 'پلن طلایی (۱ هفته تست رایگان)';
      user.planStatus = 'trial';
      user.trialExpiresAt = now + (7 * 86400000);
      user.trialCallsRemaining = 2; // ۲ تماس رایگان هفته اول
      user.trialStudyPlanUsed = false;
      user.bankPercent = 75; // ۷۵ درصد بانک تست پلن طلایی
      user.troubleshootingWeeklyQuota = 12; // ۱۲ سوال هفتگی پلن طلایی
      user.troubleshootingUsedThisWeek = 0;
      user.troubleshootingWeekStart = now;
      user.callsPerMonth = 8;

      this.updateUserSessionState(user);
      return { 
        success: true, 
        message: '۱ هفته استفاده کاملاً رایگان از امکانات پلن طلایی (۲ تماس در هفته + برنامه اختصاصی + ۷۵٪ بانک تست + ۱۲ رفع اشکال) برای شما فعال شد!',
        telegramUrl: 'https://t.me/start_acdmy',
        user 
      };
    },

    // ثبت‌نام داوطلب جدید به عنوان اکانت پایه (بدون فعال‌سازی خودکار تست رایگان)
    register(name, phoneOrEmail, password, grade, major, plan = 'free', billingCycle = 'monthly') {
      name = (name || '').trim();
      const rawInput = (phoneOrEmail || '').trim();
      password = (password || '').trim();
      grade = grade || 'دوازدهم';
      major = major || 'تجربی';

      if (!name || !rawInput || !password) {
        return { success: false, message: 'تکمیل تمامی فیلدها از جمله نام، شماره موبایل و رمز عبور الزامی است.' };
      }

      if (password.length < 6) {
        return { success: false, message: 'رمز عبور باید حداقل ۶ کاراکتر داشته باشد.' };
      }

      const isEmail = rawInput.includes('@');
      let phone = '';
      let email = '';

      if (isEmail) {
        email = rawInput.toLowerCase();
      } else {
        phone = this.normalizePhone(rawInput);
        if (phone.length < 10) {
          return { success: false, message: 'شماره موبایل وارد شده معتبر نیست. لطفاً یک شماره ۱۱ رقمی (مانند ۰۹۱۲۳۴۵۶۷۸۹) وارد فرمایید.' };
        }
        email = phone + '@start.ir';
      }

      const users = this.getUsers();
      const existing = users.find(u => {
        if (phone && u.phone && this.normalizePhone(u.phone) === phone) return true;
        if (email && u.email && u.email.toLowerCase() === email.toLowerCase()) return true;
        return false;
      });

      if (existing) {
        return { success: false, message: 'این شماره یا حساب قبلاً در سامانه ثبت شده است. لطفاً از تب «ورود به حساب» استفاده فرمایید.' };
      }

      const now = Date.now();

      // ثبت‌نام داوطلب منحصراً در حساب پایه بدون فعال‌سازی خودکار تست رایگان ۷ روزه
      const newUser = {
        id: 'usr_' + now,
        name,
        phone: phone || rawInput,
        email,
        password: this._hashPassword(password),
        grade,
        major,
        plan: 'free',
        planName: 'اکانت پایه (رایگان)',
        billingCycle: 'monthly',
        planStatus: 'free',
        registeredTimestamp: now,
        trialExpiresAt: null, // تست رایگان به صورت خودکار فعال نمی‌شود؛ در صورت تمایل کاربر کلیک می‌کند
        trialCallsRemaining: 0,
        trialStudyPlanUsed: false,
        lifetimeBankPercent: 25,
        bankPercent: 25, // ۲۵٪ بانک تست رایگان دائمی در همه دروس
        troubleshootingWeeklyQuota: 4, // ۴ سوال رفع اشکال هفتگی رایگان
        troubleshootingUsedThisWeek: 0,
        troubleshootingWeekStart: now,
        callsPerMonth: 0,
        joinedAt: new Date().toLocaleDateString('fa-IR'),
        targetScore: '+۷,۲۰۰ سنجش',
        studyHoursTarget: 8.5
      };

      users.unshift(newUser);
      try {
        localStorage.setItem('START_REGISTERED_USERS', JSON.stringify(users));
        localStorage.setItem('START_USER_SESSION', JSON.stringify(this._sanitizeSessionUser(newUser)));
        // پاکسازی کامل تمامی کلیدهای موقت تا حساب جدید ۱۰۰٪ با مقادیر صفر و ریست آغاز شود
        this._clearSessionData();

        // همگام‌سازی بلادرنگ با سرور و دیتابیس در صورت فعال بودن بک‌اند
        if (window.StartApi && typeof window.StartApi.auth?.register === 'function') {
          window.StartApi.auth.register({
            phone: newUser.phone,
            password: password,
            full_name: newUser.name,
            grade: newUser.grade,
            major: newUser.major
          }).catch(function() {});
        }
      } catch (e) {
        console.error('Storage error:', e);
      }

      return { success: true, user: this._sanitizeSessionUser(newUser) };
    },

    // ثبت‌نام داوطلب جدید (همزمان لوکال و ابری در D1)
    async registerAsync(name, phoneOrEmail, password, grade, major, plan = 'free') {
      const localRes = this.register(name, phoneOrEmail, password, grade, major, plan);
      if (!localRes.success) return localRes;

      if (window.StartApi && typeof window.StartApi.auth?.register === 'function') {
        try {
          const apiRes = await window.StartApi.auth.register({
            phone: localRes.user.phone,
            password: password,
            full_name: localRes.user.name,
            grade: localRes.user.grade,
            major: localRes.user.major
          });
          if (apiRes && apiRes.user) {
            localRes.user.id = apiRes.user.id;
            localRes.user.daily_question_quota = apiRes.user.daily_question_quota;
            localRes.user.bank_percent_allowed = apiRes.user.bank_percent_allowed;
            this.updateUserSessionState(localRes.user);
          }
        } catch (e) {
          console.warn('[StartAuth] D1 registration warning (fallback active):', e);
        }
      }
      return localRes;
    },

    // ورود به حساب کاربری هوشمند (همگام‌سازی کامل بین تمام دستگاه‌ها با دیتابیس ابری D1)
    async loginAsync(identifier, password) {
      const rawInput = (identifier || '').trim();
      password = (password || '').trim();

      if (!rawInput || !password) {
        return { success: false, message: 'لطفاً شماره موبایل و رمز عبور خود را وارد نمایید.' };
      }

      const normalizedPhone = this.normalizePhone(rawInput);

      // ۱. تلاش اولیه برای لاگین ابری از دیتابیس متمرکز D1
      if (window.StartApi && typeof window.StartApi.auth?.login === 'function') {
        try {
          const cloudRes = await window.StartApi.auth.login(normalizedPhone || rawInput, password);
          if (cloudRes && cloudRes.success && cloudRes.user) {
            const u = cloudRes.user;
            const syncedUser = {
              id: u.id,
              name: u.full_name || u.name,
              phone: u.phone,
              email: u.email || (u.phone + '@start.ir'),
              password: this._hashPassword(password),
              grade: u.grade || 'دوازدهم',
              major: u.major || 'تجربی',
              plan: u.plan || 'free',
              planName: u.plan_name || 'اکانت پایه',
              daily_question_quota: u.daily_question_quota || 50,
              bankPercent: u.bank_percent_allowed || 25,
              role: u.role || 'student'
            };

            // پاکسازی داده‌های سشن قبلی و ثبت سشن جدید
            this._clearSessionData();
            safeStorage.setItem('START_USER_SESSION', JSON.stringify(this._sanitizeSessionUser(syncedUser)));

            // افزودن/به‌روزرسانی در لیست کاربران مرورگر
            const users = this.getUsers();
            const existIdx = users.findIndex(x => x.phone === syncedUser.phone || x.id === syncedUser.id);
            if (existIdx !== -1) users[existIdx] = syncedUser;
            else users.unshift(syncedUser);
            safeStorage.setItem('START_REGISTERED_USERS', JSON.stringify(users));

            // دانلود کامل تمام آزمون‌ها، گزارش‌های شبانه، کارنامه‌ها و اشتباهات از دیتابیس D1
            if (window.StartApi.user && typeof window.StartApi.user.getData === 'function') {
              try {
                const pullRes = await window.StartApi.user.getData();
                if (pullRes && pullRes.data) {
                  const d = pullRes.data;
                  if (Array.isArray(d.studyLogs) && d.studyLogs.length) safeStorage.setItem('START_STUDY_LOGS', JSON.stringify(d.studyLogs));
                  if (Array.isArray(d.offlineExams) && d.offlineExams.length) safeStorage.setItem('START_OFFLINE_EXAMS', JSON.stringify(d.offlineExams));
                  if (Array.isArray(d.onlineExams) && d.onlineExams.length) safeStorage.setItem('START_EXAM_HISTORY', JSON.stringify(d.onlineExams));
                  if (Array.isArray(d.mistakes) && d.mistakes.length) safeStorage.setItem('START_MISTAKES_NOTEBOOK', JSON.stringify(d.mistakes));
                  if (Array.isArray(d.bookmarks) && d.bookmarks.length) safeStorage.setItem('START_BOOKMARKED_QUESTIONS_DATA', JSON.stringify(d.bookmarks));
                  if (Array.isArray(d.tickets) && d.tickets.length) safeStorage.setItem('START_TROUBLESHOOTING_TICKETS', JSON.stringify(d.tickets));
                  if (Array.isArray(d.nightlyReports) && d.nightlyReports.length) safeStorage.setItem('START_NIGHTLY_LOGS_V1', JSON.stringify(d.nightlyReports));
                  if (d.syllabusProgress && typeof d.syllabusProgress === 'object') safeStorage.setItem('START_SYLLABUS_PROGRESS', JSON.stringify(d.syllabusProgress));
                  if (d.weeklyPlan && typeof d.weeklyPlan === 'object') safeStorage.setItem('START_STUDENT_WEEKLY_PLAN', JSON.stringify(d.weeklyPlan));
                }
              } catch (errSync) {
                console.warn('[StartAuth] D1 data pull warning:', errSync);
              }
            }

            return { success: true, user: this._sanitizeSessionUser(syncedUser), isCloudSynced: true };
          }
        } catch (cloudErr) {
          console.warn('[StartAuth] Cloud login failed, falling back to local storage:', cloudErr);
        }
      }

      // ۲. در صورت آفلاین بودن سرور یا عدم برقراری ارتباط، استفاده از سشن محلی
      return this.login(identifier, password);
    },

    // ورود به حساب کاربری با شماره موبایل یا ایمیل (نسخه همگام)
    login(identifier, password) {
      const rawInput = (identifier || '').trim();
      password = (password || '').trim();

      if (!rawInput || !password) {
        return { success: false, message: 'لطفاً شماره موبایل و رمز عبور خود را وارد نمایید.' };
      }

      const normalizedPhone = this.normalizePhone(rawInput);
      const inputLower = rawInput.toLowerCase();
      const users = this.getUsers();

      const user = users.find(u => {
        if (normalizedPhone && u.phone && this.normalizePhone(u.phone) === normalizedPhone) return true;
        if (u.email && (u.email.toLowerCase() === inputLower || u.email.toLowerCase() === (normalizedPhone + '@start.ir'))) return true;
        if (u.name && u.name.trim().toLowerCase() === inputLower) return true;
        return false;
      });

      if (!user) {
        return { success: false, message: 'حسابی با این مشخصات یافت نشد. لطفاً ابتدا ثبت‌نام نمایید.' };
      }

      // تطبیق رمز عبور امن
      if (user.password && !this._verifyPassword(password, user.password)) {
        return { success: false, message: 'رمز عبور وارد شده نادرست است. لطفاً مجدداً بررسی فرمایید.' };
      }

      if (!user.plan) {
        user.plan = 'gold';
        user.planName = 'پلن طلایی (۱ هفته تست رایگان)';
        user.planStatus = 'trial';
      }

      // بازیابی داده‌های مطالعاتی اختصاصی داوطلب در صورت وجود (و پاکسازی در صورت حساب جدید)
      this._restoreUserData(user);

      try {
        localStorage.setItem('START_USER_SESSION', JSON.stringify(this._sanitizeSessionUser(user)));

        // همگام‌سازی ورود با توکن JWT و بازیابی اطلاعات بک‌اند
        if (window.StartApi && typeof window.StartApi.auth?.login === 'function') {
          window.StartApi.auth.login(user.phone || normalizedPhone, password).then(() => {
            if (window.StartApi.user && typeof window.StartApi.user.getData === 'function') {
              window.StartApi.user.getData().then(res => {
                if (res && res.data) {
                  const d = res.data;
                  if (Array.isArray(d.studyLogs) && d.studyLogs.length > 0) localStorage.setItem('START_STUDY_LOGS', JSON.stringify(d.studyLogs));
                  if (Array.isArray(d.offlineExams) && d.offlineExams.length > 0) localStorage.setItem('START_OFFLINE_EXAMS', JSON.stringify(d.offlineExams));
                  if (Array.isArray(d.onlineExams) && d.onlineExams.length > 0) localStorage.setItem('START_EXAM_HISTORY', JSON.stringify(d.onlineExams));
                  if (Array.isArray(d.mistakes) && d.mistakes.length > 0) localStorage.setItem('START_MISTAKES_NOTEBOOK', JSON.stringify(d.mistakes));
                  if (Array.isArray(d.bookmarks) && d.bookmarks.length > 0) localStorage.setItem('START_BOOKMARKED_QUESTIONS_DATA', JSON.stringify(d.bookmarks));
                  if (Array.isArray(d.tickets) && d.tickets.length > 0) localStorage.setItem('START_TROUBLESHOOTING_TICKETS', JSON.stringify(d.tickets));
                  if (Array.isArray(d.receipts) && d.receipts.length > 0) localStorage.setItem('START_PAYMENT_RECEIPTS', JSON.stringify(d.receipts));
                  if (d.syllabusProgress && typeof d.syllabusProgress === 'object' && Object.keys(d.syllabusProgress).length > 0) localStorage.setItem('START_SYLLABUS_PROGRESS', JSON.stringify(d.syllabusProgress));
                  if (d.weeklyPlan && typeof d.weeklyPlan === 'object') localStorage.setItem('START_STUDENT_WEEKLY_PLAN', JSON.stringify(d.weeklyPlan));
                }
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      } catch (e) {
        console.error('Storage error:', e);
      }

      return { success: true, user: this._sanitizeSessionUser(user) };
    },

    // خروج از حساب کاربری و جلوگیری از نشت داده در مرورگرهای اشتراکی
    logout() {
      try {
        const session = this.getSession();
        if (session) {
          this._archiveUserData(session);
        }
        this._clearSessionData();
        localStorage.removeItem('START_USER_SESSION');

        // خروج از سشن API
        if (window.StartApi && typeof window.StartApi.auth?.logout === 'function') {
          window.StartApi.auth.logout();
        }
      } catch (e) {
        console.error('Logout error:', e);
      }
    },
    },

    // تغییر رمز عبور داوطلب
    changePassword(oldPassword, newPassword) {
      const session = this.getSession();
      if (!session) return { success: false, message: 'ابتدا وارد حساب کاربری شوید.' };

      if (newPassword.length < 6) {
        return { success: false, message: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' };
      }

      const users = this.getUsers();
      const idx = users.findIndex(u => u.email.toLowerCase() === session.email.toLowerCase());
      if (idx === -1) return { success: false, message: 'حساب کاربری یافت نشد.' };

      if (users[idx].password && !this._verifyPassword(oldPassword, users[idx].password)) {
        return { success: false, message: 'رمز عبور فعلی نادرست است.' };
      }

      users[idx].password = this._hashPassword(newPassword);

      try {
        localStorage.setItem('START_REGISTERED_USERS', JSON.stringify(users));
        localStorage.setItem('START_USER_SESSION', JSON.stringify(this._sanitizeSessionUser(users[idx])));
      } catch (e) {}

      return { success: true, message: 'رمز عبور با موفقیت تغییر یافت.' };
    },

    // رندر وضعیت ورود یا تبدیل دکمه به پنل کاربری (کاملاً پایدار و ضد پرش چیدمان)
    renderNavbar(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const user = this.getSession();
      const safeName = user ? this.escapeHtml(user.name || user.email || 'داوطلب') : '';
      const expectedRendered = user 
        ? ('user:' + (user.id || safeName) + ':' + (user.plan || 'free')) 
        : 'guest';
      const currentRendered = container.getAttribute('data-auth-rendered');

      if (currentRendered === expectedRendered) {
        return; // وضعیت کاربر دقیقاً همگام است؛ بدون کوچک‌ترین تغییر DOM یا پرش چیدمان
      }

      if (user) {
        container.setAttribute('data-auth-rendered', expectedRendered);
        const planInfo = this.getPlanInfo(user.plan || 'free');
        let planBadgeHtml = '';
        if (planInfo && planInfo.isPaid) {
          const badgeClass = user.plan === 'vip' 
            ? 'bg-indigo-100 text-indigo-900 border-indigo-200' 
            : 'bg-amber-100 text-amber-800 border-amber-200';
          planBadgeHtml = `<span class="text-[9px] px-1.5 py-0.5 rounded ${badgeClass} font-black border hidden sm:inline-block">${planInfo.badge}</span>`;
        } else if (user.planStatus === 'trial') {
          planBadgeHtml = `<span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-black border border-amber-200 hidden sm:inline-block">تست رایگان</span>`;
        }

        container.innerHTML = `
          <div class="h-10 flex items-center gap-1.5 bg-slate-50 border border-slate-200/90 px-1.5 sm:px-2 rounded-xl text-xs shadow-2xs whitespace-nowrap">
            <a href="panel.html" class="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 font-extrabold transition-all" title="ورود به پنل کاربری و داشبورد">
              <svg class="w-4 h-4 text-sky-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span class="hidden sm:inline font-bold">پنل کاربری</span>
              <span class="text-[10px] text-sky-700 font-bold bg-white px-1.5 py-0.5 rounded border border-sky-200/80 max-w-[70px] xs:max-w-[90px] sm:max-w-[140px] md:max-w-[180px] truncate">${safeName}</span>
              ${planBadgeHtml}
            </a>
            <button onclick="window.StartAuth.logoutAndReload()" class="px-1.5 sm:px-2 py-1.5 text-[11px] text-slate-400 hover:text-rose-600 font-medium transition-colors cursor-pointer" title="خروج از حساب">
              خروج
            </button>
          </div>
        `;

        const consultBtn = document.getElementById('header-consultation-btn');
        if (consultBtn) {
          consultBtn.classList.add('hidden', '2xl:inline-flex');
          consultBtn.classList.remove('flex', 'inline-flex', 'sm:inline-flex');
        }
      } else {
        container.setAttribute('data-auth-rendered', 'guest');
        container.innerHTML = `
          <a href="login.html" class="h-10 px-3 sm:px-3.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shadow-2xs">
            <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>ورود / ثبت‌نام</span>
          </a>
        `;

        const consultBtn = document.getElementById('header-consultation-btn');
        if (consultBtn) {
          consultBtn.classList.remove('2xl:inline-flex');
          consultBtn.classList.add('hidden', 'sm:inline-flex');
        }
      }
    },

    logoutAndReload() {
      this.logout();
      if (window.location.pathname.endsWith('panel.html') || window.location.pathname.endsWith('exam.html')) {
        window.location.href = 'index.html';
      } else {
        window.location.reload();
      }
    },

    // هدایت به صفحه اختصاصی ورود/ثبت‌نام به جای باز کردن پاپ‌آپ
    openAuthModal(defaultTab = 'login', noticeMessage = '') {
      let url = 'login.html';
      const params = [];
      if (defaultTab && defaultTab !== 'login') params.push(`mode=${encodeURIComponent(defaultTab)}`);
      if (noticeMessage) params.push(`msg=${encodeURIComponent(noticeMessage)}`);
      const currentPath = window.location.pathname.split('/').pop() || 'index.html';
      if (currentPath && currentPath !== 'login.html') {
        params.push(`redirect=${encodeURIComponent(currentPath + window.location.search)}`);
      }
      if (params.length) url += '?' + params.join('&');
      window.location.href = url;
    },

    closeAuthModal() {
      const modal = document.getElementById('login-modal') || document.getElementById('auth-modal');
      if (modal) modal.classList.add('hidden');
    },

    // ================= ADMIN & SUBSCRIPTION ENGINE =================
    // احراز هویت ادمین سامانه
    adminLogin(email, password) {
      email = (email || '').trim().toLowerCase();
      password = (password || '').trim();
      let adminCfg = null;
      try {
        adminCfg = JSON.parse(localStorage.getItem('START_ADMIN_CONFIG') || 'null');
      } catch (e) {}
      if (!adminCfg) {
        adminCfg = {
          email: 'admin@startacademy.eu.cc',
          password: 'admin123456',
          name: 'مدیریت ارشد آکادمی استارت',
          role: 'superadmin'
        };
      }

      if (email === adminCfg.email.toLowerCase() && this._verifyPassword(password, adminCfg.password)) {
        const session = {
          id: 'admin_master',
          email: adminCfg.email,
          name: adminCfg.name,
          role: adminCfg.role || 'superadmin',
          loggedInAt: new Date().toLocaleDateString('fa-IR') + ' ' + new Date().toLocaleTimeString('fa-IR')
        };
        try {
          localStorage.setItem('START_ADMIN_SESSION', JSON.stringify(session));
        } catch (e) {}
        if (window.StartCMS) {
          window.StartCMS.logActivity('ورود ادمین', 'ورود موفق به پنل مدیریت کل استارت.');
        }
        return { success: true, session };
      }
      return { success: false, message: 'نشانی ایمیل یا رمز عبور ادمین نادرست است.' };
    },

    getAdminSession() {
      try {
        return JSON.parse(localStorage.getItem('START_ADMIN_SESSION') || 'null');
      } catch (e) {
        return null;
      }
    },

    isAdminLoggedIn() {
      return !!this.getAdminSession();
    },

    adminLogout() {
      try {
        localStorage.removeItem('START_ADMIN_SESSION');
      } catch (e) {}
    },

    changeAdminPassword(newPassword) {
      if (!newPassword || newPassword.length < 6) {
        return { success: false, message: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' };
      }
      let adminCfg = null;
      try {
        adminCfg = JSON.parse(localStorage.getItem('START_ADMIN_CONFIG') || 'null');
      } catch (e) {}
      if (!adminCfg) {
        adminCfg = {
          email: 'admin@startacademy.eu.cc',
          password: 'admin123456',
          name: 'مدیریت ارشد آکادمی استارت',
          role: 'superadmin'
        };
      }
      adminCfg.password = this._hashPassword(newPassword);
      try {
        localStorage.setItem('START_ADMIN_CONFIG', JSON.stringify(adminCfg));
      } catch (e) {}
      return { success: true, message: 'رمز عبور ادمین با موفقیت به‌روزرسانی گردید.' };
    },

    // تخصیص، تمدید یا ارتقای اشتراک داوطلب
    setSubscriptionForUser(userId, planKey, durationDays = 30, customNotes = '') {
      const users = this.getUsers();
      const idx = users.findIndex(u => u.id === userId || u.email.toLowerCase() === String(userId).toLowerCase());
      if (idx === -1) return { success: false, message: 'کاربر مورد نظر یافت نشد.' };

      const planInfo = this.getPlanInfo(planKey);
      const now = new Date();
      const expDate = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
      const expDateFa = expDate.toLocaleDateString('fa-IR');

      users[idx].plan = planInfo.id;
      users[idx].planName = planInfo.name;
      users[idx].planStatus = planInfo.isPaid ? 'active' : 'free';
      users[idx].planExpiresAt = planInfo.isPaid ? expDateFa : '—';
      users[idx].planDaysLeft = durationDays;
      users[idx].subscriptionUpdatedAt = new Date().toLocaleDateString('fa-IR');
      if (customNotes) users[idx].notes = customNotes;

      try {
        localStorage.setItem('START_REGISTERED_USERS', JSON.stringify(users));
        const currentSession = this.getSession();
        if (currentSession && (currentSession.id === users[idx].id || currentSession.email.toLowerCase() === users[idx].email.toLowerCase())) {
          localStorage.setItem('START_USER_SESSION', JSON.stringify(this._sanitizeSessionUser(users[idx])));
        }
      } catch (e) {
        return { success: false, message: e.message };
      }

      if (window.StartCMS) {
        window.StartCMS.logActivity('تخصیص اشتراک', `پلن «${planInfo.name}» به مدت ${durationDays} روز برای داوطلب «${users[idx].name}» فعال شد.`);
      }

      return { success: true, user: this._sanitizeSessionUser(users[idx]) };
    },

    // لغو اشتراک داوطلب
    cancelSubscriptionForUser(userId) {
      return this.setSubscriptionForUser(userId, 'free', 0, 'اشتراک توسط ادمین لغو شد.');
    },

    // به‌روزرسانی مشخصات داوطلب توسط ادمین
    updateUserDetails(userId, data) {
      const users = this.getUsers();
      const idx = users.findIndex(u => u.id === userId || u.email.toLowerCase() === String(userId).toLowerCase());
      if (idx === -1) return { success: false, message: 'کاربر یافت نشد.' };

      users[idx] = { ...users[idx], ...data };
      if (data.password) {
        users[idx].password = this._hashPassword(data.password);
      }
      try {
        localStorage.setItem('START_REGISTERED_USERS', JSON.stringify(users));
        const currentSession = this.getSession();
        if (currentSession && (currentSession.id === users[idx].id || currentSession.email.toLowerCase() === users[idx].email.toLowerCase())) {
          localStorage.setItem('START_USER_SESSION', JSON.stringify(this._sanitizeSessionUser(users[idx])));
        }
      } catch (e) {
        return { success: false, message: e.message };
      }
      return { success: true, user: this._sanitizeSessionUser(users[idx]) };
    },

    // حذف داوطلب
    deleteUser(userId) {
      let users = this.getUsers();
      const target = users.find(u => u.id === userId || u.email.toLowerCase() === String(userId).toLowerCase());
      users = users.filter(u => u.id !== userId && u.email.toLowerCase() !== String(userId).toLowerCase());
      try {
        localStorage.setItem('START_REGISTERED_USERS', JSON.stringify(users));
        const currentSession = this.getSession();
        if (currentSession && (currentSession.id === userId || currentSession.email.toLowerCase() === String(userId).toLowerCase())) {
          this.logout();
        }
      } catch (e) {}

      if (window.StartCMS && target) {
        window.StartCMS.logActivity('حذف کاربر', `کاربر «${target.name}» (${target.email}) از سامانه حذف گردید.`);
      }
      return { success: true };
    },

    // ثبت کاربر جدید مستقیم توسط ادمین
    createUserByAdmin(data) {
      const users = this.getUsers();
      if (!data.name || !data.email || !data.password) {
        return { success: false, message: 'نام، ایمیل و رمز عبور الزامی است.' };
      }
      const existing = users.find(u => u.email.toLowerCase() === data.email.trim().toLowerCase());
      if (existing) {
        return { success: false, message: 'کاربری با این نشانی ایمیل قبلاً ثبت شده است.' };
      }

      const planKey = data.plan || 'free';
      const planInfo = this.getPlanInfo(planKey);
      const durationDays = parseInt(data.durationDays, 10) || (planInfo.isPaid ? 30 : 0);
      const now = new Date();
      const expDate = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));

      const newUser = {
        id: 'usr_' + Date.now(),
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        password: this._hashPassword(data.password.trim()),
        phone: (data.phone || '').trim(),
        grade: data.grade || 'دوازدهم',
        major: data.major || 'تجربی',
        plan: planInfo.id,
        planName: planInfo.name,
        planStatus: planInfo.isPaid ? 'active' : 'free',
        planExpiresAt: planInfo.isPaid ? expDate.toLocaleDateString('fa-IR') : '—',
        planDaysLeft: durationDays,
        joinedAt: new Date().toLocaleDateString('fa-IR'),
        targetScore: data.targetScore || '+۷,۲۰۰ سنجش',
        studyHoursTarget: parseFloat(data.studyHoursTarget) || 8.5,
        notes: data.notes || 'ثبت توسط مدیریت'
      };

      users.unshift(newUser);
      try {
        localStorage.setItem('START_REGISTERED_USERS', JSON.stringify(users));
      } catch (e) {}

      if (window.StartCMS) {
        window.StartCMS.logActivity('ثبت کاربر جدید', `داوطلب جدید «${newUser.name}» با پلن «${planInfo.name}» ثبت شد.`);
      }

      return { success: true, user: this._sanitizeSessionUser(newUser) };
    },

    // ورود به پنل کاربری داوطلب به جای او (Impersonate)
    impersonateUser(userId) {
      const users = this.getUsers();
      const user = users.find(u => u.id === userId || u.email.toLowerCase() === String(userId).toLowerCase());
      if (!user) return { success: false, message: 'کاربر یافت نشد.' };

      try {
        localStorage.setItem('START_USER_SESSION', JSON.stringify(this._sanitizeSessionUser(user)));
      } catch (e) {}
      return { success: true, user: this._sanitizeSessionUser(user) };
    },

    // ================= سامانه تیکت‌های پشتیبانی آنلاین داوطلبان =================
    getDefaultSupportTickets() {
      return [
        {
          id: 'tkt_101',
          trackingCode: 'ST-849201',
          userId: 'usr_sara',
          userName: 'سارا محمدی',
          userPhone: '۰۹۱۲۳۴۵۶۷۸۱',
          department: 'مشاوره و برنامه‌ریزی',
          subject: 'درخواست تنظیم ساعت جبرانی زیست‌شناسی دوازدهم',
          priority: 'مهم',
          status: 'answered',
          createdAt: '۱۴۰۵/۰۸/۰۱ - ۱۸:۳۰',
          createdTimestamp: Date.now() - 86400000,
          messages: [
            {
              id: 'msg_1',
              sender: 'user',
              senderName: 'سارا محمدی',
              text: 'سلام دکتر اختیار، آزمون جمعه آزمون آزمایشی در پیش است. فصل ۳ دوازدهم را طبق برنامه نرساندم، لطفاً در برنامه این هفته تایم جبرانی قرار دهید.',
              timeFormatted: '۱۸:۳۰',
              timestamp: Date.now() - 86400000
            },
            {
              id: 'msg_2',
              sender: 'admin',
              senderName: 'دکتر اختیار (مدیریت دپارتمان تجربی)',
              text: 'سلام سارا خانم. برنامه روز چهارشنبه شما بازبینی شد. دو باکس ۹۰ دقیقه‌ای در تایم عصر برای مرور فعال و تست‌های پوششی گفتار ۲ و ۳ قرار داده شد. در تماس امشب نیز بررسی خواهیم کرد.',
              timeFormatted: '۲۰:۱۵',
              timestamp: Date.now() - 80000000
            }
          ]
        },
        {
          id: 'tkt_102',
          trackingCode: 'ST-931044',
          userId: 'usr_ali',
          userName: 'علی رضایی',
          userPhone: '۰۹۱۴۱۱۱۲۲۳۳',
          department: 'بانک تست و آزمون',
          subject: 'تنظیم ساعت تحویل گزارش کار در شب‌های آزمون',
          priority: 'معمولی',
          status: 'answered',
          createdAt: '۱۴۰۵/۰۸/۰۱ - ۱۱:۱۰',
          createdTimestamp: Date.now() - 172800000,
          messages: [
            {
              id: 'msg_1',
              sender: 'user',
              senderName: 'علی رضایی',
              text: 'سلام خسته نباشید، در شب‌های قبل از آزمون آزمایشی جمعه، پایش ساعت مطالعه ساعت چند باید ثبت بشه؟',
              timeFormatted: '۱۱:۱۰',
              timestamp: Date.now() - 172800000
            },
            {
              id: 'msg_2',
              sender: 'admin',
              senderName: 'پشتیبانی فنی استارت',
              text: 'درود علی عزیز؛ در تمام شب‌های هفته از جمله پنج‌شنبه‌های قبل از آزمون، گزارش کار راس ساعت ۲۳:۳۰ در پنل بررسی می‌شود و برای روز جمعه بعد از آزمون، زمان تحلیل کارنامه با مشاور هماهنگ خواهد شد.',
              timeFormatted: '۱۲:۰۰',
              timestamp: Date.now() - 165000000
            }
          ]
        }
      ];
    },

    getSupportTickets(userId = null) {
      try {
        let tickets = JSON.parse(localStorage.getItem('START_SUPPORT_TICKETS') || 'null');
        if (!tickets || !Array.isArray(tickets)) {
          tickets = this.getDefaultSupportTickets();
          localStorage.setItem('START_SUPPORT_TICKETS', JSON.stringify(tickets));
        }
        if (userId) {
          return tickets.filter(t => t.userId === userId || (t.userPhone && t.userPhone === userId));
        }
        return tickets;
      } catch (e) {
        return this.getDefaultSupportTickets();
      }
    },

    createSupportTicket(subject, department, priority, text) {
      const user = this.getSession();
      if (!user) return { success: false, message: 'لطفاً ابتدا وارد حساب کاربری شوید.' };
      if (!subject || !text) return { success: false, message: 'تکمیل عنوان و متن تیکت الزامی است.' };

      const tickets = this.getSupportTickets();
      const code = 'ST-' + Math.floor(100000 + Math.random() * 900000);
      const newTicket = {
        id: 'tkt_' + Date.now(),
        trackingCode: code,
        userId: user.id || user.phone || 'guest',
        userName: user.name || 'داوطلب استارت',
        userPhone: user.phone || user.email || '۰۹۱۲۳۴۵۶۷۸۹',
        department: department || 'مشاوره و برنامه‌ریزی',
        subject: subject.trim(),
        priority: priority || 'معمولی',
        status: 'pending',
        createdAt: new Date().toLocaleDateString('fa-IR') + ' - ' + new Date().toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'}),
        createdTimestamp: Date.now(),
        messages: [
          {
            id: 'msg_' + Date.now(),
            sender: 'user',
            senderName: user.name || 'داوطلب',
            text: text.trim(),
            timeFormatted: new Date().toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'}),
            timestamp: Date.now()
          }
        ]
      };

      tickets.unshift(newTicket);
      try {
        localStorage.setItem('START_SUPPORT_TICKETS', JSON.stringify(tickets));
      } catch (e) {}

      return { success: true, message: `تیکت شما با کد پیگیری ${code} با موفقیت ثبت شد و در اولویت پاسخ‌گویی مشاوران قرار گرفت.`, ticket: newTicket };
    },

    replySupportTicket(ticketId, text, sender = 'admin', senderName = 'مدیریت موسسه استارت') {
      if (!ticketId || !text) return { success: false, message: 'شناسه تیکت و متن پاسخ الزامی است.' };
      const tickets = this.getSupportTickets();
      const idx = tickets.findIndex(t => t.id === ticketId);
      if (idx === -1) return { success: false, message: 'تیکت مورد نظر یافت نشد.' };

      const replyMsg = {
        id: 'msg_' + Date.now(),
        sender,
        senderName,
        text: text.trim(),
        timeFormatted: new Date().toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'}),
        timestamp: Date.now()
      };

      tickets[idx].messages.push(replyMsg);
      tickets[idx].status = sender === 'admin' ? 'answered' : 'pending';
      tickets[idx].lastActivity = Date.now();

      try {
        localStorage.setItem('START_SUPPORT_TICKETS', JSON.stringify(tickets));
      } catch (e) {}

      return { success: true, ticket: tickets[idx], message: 'پاسخ با موفقیت ثبت شد.' };
    },

    closeSupportTicket(ticketId) {
      const tickets = this.getSupportTickets();
      const idx = tickets.findIndex(t => t.id === ticketId);
      if (idx !== -1) {
        tickets[idx].status = 'closed';
        try {
          localStorage.setItem('START_SUPPORT_TICKETS', JSON.stringify(tickets));
        } catch (e) {}
        return { success: true, message: 'تیکت با موفقیت بسته شد.' };
      }
      return { success: false, message: 'تیکت یافت نشد.' };
    },

    // ================= آمار و تله‌متری بازدیدهای زنده سایت =================
    getPageViewsData() {
      try {
        let stats = JSON.parse(localStorage.getItem('START_SITE_TRAFFIC_STATS') || 'null');
        const todayStr = new Date().toLocaleDateString('fa-IR');
        if (!stats) {
          stats = {
            totalViews: 14820,
            todayViews: 860,
            uniqueVisitors: 3240,
            lastDate: todayStr,
            pages: {
              'صفحه اصلی (index.html)': 6420,
              'بانک تست (bank.html)': 4180,
              'شبیه‌ساز آزمون (exam.html)': 2150,
              'تعرفه‌ها و خدمات (pricing.html)': 1210,
              'پنل داوطلب (panel.html)': 860
            },
            dailyViews: [
              { day: 'شنبه', count: 720 },
              { day: 'یکشنبه', count: 810 },
              { day: 'دوشنبه', count: 690 },
              { day: 'سه‌شنبه', count: 940 },
              { day: 'چهارشنبه', count: 880 },
              { day: 'پنج‌شنبه', count: 1020 },
              { day: 'جمعه (امروز)', count: 860 }
            ]
          };
          localStorage.setItem('START_SITE_TRAFFIC_STATS', JSON.stringify(stats));
        }
        return stats;
      } catch (e) {
        return null;
      }
    },

    recordPageView(pathName = '') {
      try {
        const stats = this.getPageViewsData();
        if (!stats) return;
        const todayStr = new Date().toLocaleDateString('fa-IR');
        if (stats.lastDate !== todayStr) {
          stats.todayViews = 1;
          stats.lastDate = todayStr;
        } else {
          stats.todayViews = (stats.todayViews || 0) + 1;
        }
        stats.totalViews = (stats.totalViews || 14820) + 1;

        let cleanPath = (pathName || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : 'index.html')) || 'index.html';
        if (!cleanPath || cleanPath === '/') cleanPath = 'index.html';

        const pageNameMap = {
          'index.html': 'صفحه اصلی (index.html)',
          'bank.html': 'بانک تست (bank.html)',
          'exam.html': 'شبیه‌ساز آزمون (exam.html)',
          'pricing.html': 'تعرفه‌ها و خدمات (pricing.html)',
          'panel.html': 'پنل داوطلب (panel.html)',
          'advisors.html': 'مشاوران ارشد (advisors.html)',
          'methodology.html': 'متدولوژی (methodology.html)',
          'resources.html': 'منابع (resources.html)'
        };
        const friendlyName = pageNameMap[cleanPath] || cleanPath;
        if (!stats.pages) stats.pages = {};
        stats.pages[friendlyName] = (stats.pages[friendlyName] || 0) + 1;

        localStorage.setItem('START_SITE_TRAFFIC_STATS', JSON.stringify(stats));
      } catch (e) {}
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

  // کنترل ناوبری کشویی موبایل و تبلت (Mobile Navigation Drawer)
  window.toggleMobileNav = function(open) {
    const drawer = document.getElementById('mobile-nav-drawer');
    const backdrop = document.getElementById('mobile-nav-backdrop');
    const panel = document.getElementById('mobile-nav-panel');
    if (!drawer) return;

    if (open) {
      drawer.removeAttribute('hidden');
      drawer.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
      requestAnimationFrame(() => {
        if (backdrop) {
          backdrop.classList.remove('opacity-0');
          backdrop.classList.add('opacity-100');
        }
        if (panel) {
          panel.classList.remove('translate-x-full');
          panel.classList.add('translate-x-0');
        }
      });
    } else {
      if (backdrop) {
        backdrop.classList.remove('opacity-100');
        backdrop.classList.add('opacity-0');
      }
      if (panel) {
        panel.classList.remove('translate-x-0');
        panel.classList.add('translate-x-full');
      }
      setTimeout(() => {
        drawer.classList.add('hidden');
        drawer.setAttribute('hidden', '');
        document.body.classList.remove('overflow-hidden');
      }, 300);
    }
  };

  // کنترل کشوی پاسخ‌برگ شناور موبایل برای شبیه‌ساز آزمون (Mobile OMR Bottom Sheet)
  window.toggleMobileOmrSheet = function(open) {
    const sheet = document.getElementById('mobile-omr-sheet');
    const backdrop = document.getElementById('mobile-omr-backdrop');
    const panel = document.getElementById('mobile-omr-panel');
    if (!sheet) return;

    if (open) {
      sheet.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
      requestAnimationFrame(() => {
        if (backdrop) {
          backdrop.classList.remove('opacity-0');
          backdrop.classList.add('opacity-100');
        }
        if (panel) {
          panel.classList.remove('translate-y-full');
          panel.classList.add('translate-y-0');
        }
      });
    } else {
      if (backdrop) {
        backdrop.classList.remove('opacity-100');
        backdrop.classList.add('opacity-0');
      }
      if (panel) {
        panel.classList.remove('translate-y-0');
        panel.classList.add('translate-y-full');
      }
      setTimeout(() => {
        sheet.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
      }, 300);
    }
  };

  // ================= UNIVERSAL SPRING MODAL MOTION ENGINE =================
  // ترنزیشن فنری پیشرفته برای کلیه پاپ‌آپ‌ها و دیالوگ‌ها (Swiss / Apple Spring Motion)
  window.openSpringModal = function(modalId, options = {}) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (!modal) return;

    const panel = options.panel || modal.querySelector('.spring-modal-panel') || modal.querySelector('[role="dialog"] > div') || modal.firstElementChild;

    modal.classList.remove('hidden');
    modal.classList.add('spring-modal-active');
    modal.style.overscrollBehavior = 'contain';

    // حالت اولیه پیش از فریم بعدی
    modal.classList.add('opacity-0');
    modal.style.transition = 'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1)';
    if (panel) {
      panel.classList.add('scale-95', 'translate-y-2', 'opacity-0');
      panel.style.transition = 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms cubic-bezier(0.16, 1, 0.3, 1)';
    }

    requestAnimationFrame(() => {
      modal.classList.remove('opacity-0');
      modal.classList.add('opacity-100');
      if (panel) {
        panel.classList.remove('scale-95', 'translate-y-2', 'opacity-0');
        panel.classList.add('scale-100', 'translate-y-0', 'opacity-100');
      }
    });
  };

  window.closeSpringModal = function(modalId, options = {}) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (!modal || modal.classList.contains('hidden')) return;

    const panel = options.panel || modal.querySelector('.spring-modal-panel') || modal.querySelector('[role="dialog"] > div') || modal.firstElementChild;

    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');
    if (panel) {
      panel.classList.remove('scale-100', 'translate-y-0', 'opacity-100');
      panel.classList.add('scale-95', 'translate-y-2', 'opacity-0');
    }

    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('spring-modal-active');
    }, 200);
  };

  // لیسنر سراسری کلید Escape برای بستن پاپ‌آپ‌ها با ترنزیشن نرم
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.toggleMobileNav(false);
      window.toggleMobileOmrSheet(false);
      const activeModal = document.querySelector('.spring-modal-active');
      if (activeModal) {
        window.closeSpringModal(activeModal);
      }
    }
  });

  document.addEventListener('click', (e) => {
    const activeModal = document.querySelector('.spring-modal-active');
    if (activeModal && e.target === activeModal) {
      window.closeSpringModal(activeModal);
    }
  });

  // خودکارسازی همگام‌سازی وضعیت کاربر در هدر در زمان بیکاری پردازنده جهت حفظ شتاب DOMContentLoaded
  const syncNavbarSession = () => {
    const c = document.getElementById('auth-nav-container');
    if (c && c.getAttribute('data-auth-rendered')?.startsWith('user:')) return;
    if (StartAuth.getSession()) {
      StartAuth.renderNavbar('auth-nav-container');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(syncNavbarSession);
      } else {
        setTimeout(syncNavbarSession, 0);
      }
    });
  } else {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(syncNavbarSession);
    } else {
      setTimeout(syncNavbarSession, 0);
    }
  }

  if (!window.StartAnalytics) {
    window.StartAnalytics = {
      track: function(eventName, props) {
        try {
          const key = 'START_TELEMETRY_EVENTS';
          const list = JSON.parse(safeStorage.getItem(key) || '[]');
          list.push(Object.assign({ event: eventName, ts: Date.now(), path: window.location.pathname }, props || {}));
          if (list.length > 300) list.splice(0, list.length - 300);
          safeStorage.setItem(key, JSON.stringify(list));
        } catch (e) {}
      }
    };
  }

  if (typeof document !== 'undefined') {
    const recordCurrentPage = function() {
      try {
        const page = (window.location.pathname.split('/').pop() || 'index.html').split('?')[0];
        if (window.StartAuth && typeof window.StartAuth.recordPageView === 'function') {
          window.StartAuth.recordPageView(page);
        }
      } catch (e) {}
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', recordCurrentPage, { once: true });
    } else {
      recordCurrentPage();
    }
  }

  StartAuth.getCurrentUser = StartAuth.getSession;
  window.StartAuth = StartAuth;
})(window);
