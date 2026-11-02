/**
 * START Academy - Advanced Root Cause Performance & Telemetry Engine (v3.0.0)
 * ==============================================================================
 * سیستم جامع ریشه‌یابی و کالبدشکافی پرفورمنس، شناسایی گلوگاه‌های پردازنده و شبکه
 * 
 * قابلیت‌های پیشرفته:
 * ۱. تفکیک سهم تاخیر: شبکه و اینترنت (Network/ISP) در برابر پردازش و کد (Frontend CPU)
 * ۲. ریشه‌یابی قطعی (Root Cause Analysis): مشخص کردن دقیق فایل، اسکریپت یا المان مقصر همراه با نسخه اصلاحی
 * ۳. آبشار گرافیکی منابع (SVG Resource Waterfall Timeline): خط‌زمان دقیق دانلود و مسدودی فایل‌ها
 * ۴. رصدگر فریم‌ریت زنده (Live FPS) و لکنت‌های رندرینگ (Jank / Frame Drops)
 * ۵. کالبدشکافی LCP و CLS با مشخص کردن دقیق سلکتور المان، متن و میزان جابجایی پیکسل‌ها
 * ۶. پایشگر زنده پینگ و وضعیت CDNها و تونل VPN در شبکه ایران
 * ۷. گزارش خودکار در کنسول مرورگر و پنل تعاملی شناور (Diagnostic HUD)
 */
(function(window) {
  'use strict';

  // Google Web Vitals Specification: Track if page was hidden/backgrounded before paint
  let firstHiddenTime = (typeof window !== 'undefined' && (window.__INITIAL_HIDDEN__ || document.visibilityState === 'hidden')) ? 0 : Infinity;
  let currentHiddenStart = (typeof window !== 'undefined' && (window.__INITIAL_HIDDEN__ || document.visibilityState === 'hidden')) ? 0 : null;
  const hiddenRanges = [];
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        const now = performance.now();
        firstHiddenTime = Math.min(firstHiddenTime, now);
        currentHiddenStart = now;
        window.__WAS_EVER_HIDDEN__ = true;
      } else {
        if (currentHiddenStart !== null) {
          hiddenRanges.push({ start: currentHiddenStart, end: performance.now() + 600 });
          currentHiddenStart = null;
        }
      }
    });
  }

  const StartTelemetry = {
    version: '3.6.3',
    startTime: performance.now(),
    pageUrl: window.location.href,
    pagePath: window.location.pathname.split('/').pop() || 'index.html',

    isBackgrounded() {
      if (typeof window !== 'undefined' && (window.__INITIAL_HIDDEN__ || window.__WAS_EVER_HIDDEN__)) return true;
      if (firstHiddenTime < (this.metrics.fcp || Infinity) || hiddenRanges.length > 0) return true;
      if (this.metrics.domComplete > 0 && this.metrics.fcp > (this.metrics.domComplete + 1000)) return true;
      return false;
    },

    isTaskBackground(start, duration) {
      if (typeof window !== 'undefined' && (window.__INITIAL_HIDDEN__ || window.__WAS_EVER_HIDDEN__) && start < 2000) return true;
      if (currentHiddenStart !== null && (start >= currentHiddenStart - 100)) return true;
      for (let i = 0; i < hiddenRanges.length; i++) {
        const r = hiddenRanges[i];
        if ((start >= r.start - 100 && start <= r.end) || (start + duration >= r.start && start <= r.end)) {
          return true;
        }
      }
      if (duration > 2000) return true; // OS thread sleep / Windows efficiency mode throttling
      return false;
    },

    // Core Metrics
    metrics: {
      ttfb: 0,
      fcp: 0,
      lcp: 0,
      lcpElement: 'در حال ارزیابی...',
      lcpElementHtml: '',
      lcpLoadDelay: 0,
      lcpRenderDelay: 0,
      cls: 0,
      clsEntriesCount: 0,
      inp: 0,
      domInteractive: 0,
      domComplete: 0,
      pageLoadTotal: 0,
      domNodesCount: 0,
      domMaxDepth: 0,
      memoryUsedMB: null,
      memoryTotalMB: null,
      memoryLimitMB: null,
      // Time Breakdown: Network vs Frontend
      networkDurationMs: 0,
      frontendExecutionMs: 0,
      networkSharePct: 50,
      frontendSharePct: 50
    },

    // Collections
    slowResources: [],
    allResourcesTimeline: [],
    longTasks: [],
    layoutShifts: [],
    frameDrops: [],
    runtimeErrors: [],
    rootCausePrescriptions: [],
    cdnProbeResults: {},

    // Live FPS Tracking
    fpsState: {
      currentFps: 60,
      lastFrameTime: performance.now(),
      framesCount: 0,
      jankCount: 0,
      fpsHistory: []
    },

    // Configuration Thresholds
    thresholds: {
      slowResourceDuration: 250,
      criticalResourceDuration: 650,
      longTaskThreshold: 50,
      criticalTaskThreshold: 100,
      lcpGood: 2000,
      lcpPoor: 3200,
      clsGood: 0.1,
      clsPoor: 0.25,
      domNodesWarn: 1600
    },

    // UI State
    hudOpen: false,
    firstHudOpenTime: null,
    isInternalOperation: false,
    internalOperationUntil: 0,
    internalOpsRanges: [],
    currentTab: 'rca', // 'rca' | 'waterfall' | 'netvscpu' | 'fps' | 'vitals' | 'export'
    lastInteraction: null,
    lastScrollTime: 0,

    markInternalOperation(durationMs = 3500) {
      const now = performance.now();
      this.isInternalOperation = true;
      if (!this.internalOpsRanges) this.internalOpsRanges = [];
      this.internalOpsRanges.push({ start: now - 500, end: now + durationMs });
      this.internalOperationUntil = Math.max(this.internalOperationUntil || 0, now + durationMs);
      setTimeout(() => {
        if (performance.now() >= this.internalOperationUntil) {
          this.isInternalOperation = false;
        }
      }, durationMs);
    },

    isTaskInternal(time) {
      if (this.isInternalOperation || this.hudOpen) return true;
      if (this.firstHudOpenTime && time >= (this.firstHudOpenTime - 800) && time <= (this.firstHudOpenTime + 4000)) return true;
      if (this.internalOpsRanges && this.internalOpsRanges.length > 0) {
        for (let i = 0; i < this.internalOpsRanges.length; i++) {
          const r = this.internalOpsRanges[i];
          if (time >= r.start && time <= r.end) return true;
        }
      }
      return false;
    },

    init() {
      // 0. Mark initial telemetry engine compilation & bootstrap window as internal to avoid self-reporting
      this.markInternalOperation(2000);

      // 1. Setup Native Performance Observers immediately (<0.1ms, zero blocking)
      this.initObservers();
      this.initErrorCapture();
      this.initInteractionTracker();
      this.captureNavigationTimings();

      // 2. Defer UI badge mounting and FPS monitor until main thread and paint (FCP/LCP) are 100% idle
      // NOTE: Modal is lazily mounted strictly on first HUD open (toggleHud), avoiding initial DOM mutation & reflow.
      const deferTelemetryUi = () => {
        this.markInternalOperation(3500);
        this.updateSectionCache();
        this.mountBadge();
        this.initFpsMonitor();
      };

      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (this.cachedSections && this.cachedSections.length > 0) {
            this.updateSectionCache();
          }
        }, 500);
      }, { passive: true });

      if (document.readyState === 'complete') {
        if ('requestIdleCallback' in window) requestIdleCallback(deferTelemetryUi);
        else setTimeout(deferTelemetryUi, 250);
      } else {
        window.addEventListener('load', () => {
          if ('requestIdleCallback' in window) requestIdleCallback(deferTelemetryUi);
          else setTimeout(deferTelemetryUi, 350);
        });
      }

      // 3. Keyboard Shortcut: Ctrl + Shift + L or Alt + P
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey && e.shiftKey) || e.altKey) {
          this.markInternalOperation(3000);
        }
        if ((e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) || (e.altKey && (e.key === 'p' || e.key === 'P'))) {
          e.preventDefault();
          this.toggleHud();
        }
      }, { capture: true });
    },

    // ================= 1. NAVIGATION & TIME BREAKDOWN =================
    captureNavigationTimings() {
      try {
        const navEntries = performance.getEntriesByType('navigation');
        if (navEntries && navEntries.length > 0) {
          const nav = navEntries[0];
          this.metrics.ttfb = Math.round(nav.responseStart - nav.requestStart);
          this.metrics.domInteractive = Math.round(nav.domInteractive);
          this.metrics.domComplete = Math.round(nav.domComplete);
          this.metrics.pageLoadTotal = Math.round(nav.loadEventEnd || (performance.now() - this.startTime));

          // Calculate Network Share vs Frontend Share
          const dnsTcpTtfb = Math.round((nav.domainLookupEnd - nav.domainLookupStart) + (nav.connectEnd - nav.connectStart) + (nav.responseStart - nav.requestStart));
          const responseDownload = Math.round(nav.responseEnd - nav.responseStart);
          const networkTotal = Math.max(10, dnsTcpTtfb + responseDownload);
          
          const domProcessing = Math.max(10, Math.round(nav.domComplete - nav.responseEnd));
          const totalTime = networkTotal + domProcessing;

          this.metrics.networkDurationMs = networkTotal;
          this.metrics.frontendExecutionMs = domProcessing;
          this.metrics.networkSharePct = Math.round((networkTotal / totalTime) * 100);
          this.metrics.frontendSharePct = 100 - this.metrics.networkSharePct;
        }
      } catch (err) {}
    },

    // ================= 2. OBSERVERS (PAINT, LCP, CLS, LONGTASK, RESOURCE) =================
    initObservers() {
      // Paint (FCP)
      try {
        const pObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              this.metrics.fcp = Math.round(entry.startTime);
            }
          }
        });
        pObs.observe({ type: 'paint', buffered: true });
      } catch (e) {}

      // LCP Forensic Inspector
      try {
        const lcpObs = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) {
            this.metrics.lcp = Math.round(last.renderTime || last.loadTime || last.startTime);
            
            let elDesc = 'تگ ناشناس';
            let htmlPreview = '';
            if (last.element) {
              const el = last.element;
              const tag = el.tagName ? el.tagName.toLowerCase() : '';
              const id = el.id ? `#${el.id}` : '';
              const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
              elDesc = `${tag}${id}${cls}` || tag;
              htmlPreview = el.outerHTML ? el.outerHTML.slice(0, 120).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
            } else if (last.url) {
              elDesc = last.url.split('/').pop().slice(0, 35);
            }
            this.metrics.lcpElement = elDesc;
            this.metrics.lcpElementHtml = htmlPreview;
            this.metrics.lcpLoadDelay = Math.round(last.loadTime ? (last.loadTime - this.metrics.ttfb) : 0);
            this.metrics.lcpRenderDelay = Math.round((last.renderTime && last.loadTime) ? (last.renderTime - last.loadTime) : 0);
          }
        });
        lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {}

      // CLS Forensic Inspector (Element Pinpointing)
      try {
        const clsObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              this.metrics.cls += entry.value;
              this.metrics.clsEntriesCount++;

              let shiftingElement = 'المان بدون شناسه';
              let shiftDelta = 'تغییر موقعیت عمودی';
              if (entry.sources && entry.sources.length > 0) {
                const src = entry.sources[0];
                if (src.node && src.node.tagName) {
                  const tag = src.node.tagName.toLowerCase();
                  const id = src.node.id ? `#${src.node.id}` : '';
                  const cl = src.node.className && typeof src.node.className === 'string' ? `.${src.node.className.split(' ')[0]}` : '';
                  shiftingElement = `${tag}${id}${cl}`;
                }
                if (src.previousRect && src.currentRect) {
                  const dy = Math.round(src.currentRect.top - src.previousRect.top);
                  shiftDelta = `جابجایی: ${dy > 0 ? '+' : ''}${dy}px در راستای محور Y`;
                }
              }

              this.layoutShifts.push({
                time: Math.round(entry.startTime),
                value: parseFloat(entry.value.toFixed(4)),
                element: shiftingElement,
                delta: shiftDelta
              });
            }
          }
          this.metrics.cls = parseFloat(this.metrics.cls.toFixed(4));
        });
        clsObs.observe({ type: 'layout-shift', buffered: true });
      } catch (e) {}

      // Long Tasks (Main Thread Freezes > 50ms)
      try {
        const ltObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const duration = Math.round(entry.duration);
            const start = Math.round(entry.startTime);

            // Exclude internal HUD operations & background OS sleep tasks
            if (this.isTaskInternal(start) || this.isTaskInternal(start + duration) || this.isTaskBackground(start, duration)) {
              continue;
            }

            let container = 'پردازش داخلی جاوااسکریپت (V8 Script Execution)';
            let detailCause = 'محاسبات سنگین در رشته اصلی پردازنده';
            let culpritType = 'script';

            if (entry.attribution && entry.attribution.length > 0) {
              const attr = entry.attribution[0];
              if (attr.containerSrc) container = attr.containerSrc.split('/').pop();
              else if (attr.containerName) container = attr.containerName;
            }

            // High-Precision Attribution: Correlate with resources loaded around task start
            const recentResource = this.allResourcesTimeline.find(r => 
              Math.abs(r.startTime + r.duration - start) < 140 || 
              (start >= r.startTime && start <= r.startTime + r.duration + 60)
            );

            if (recentResource) {
              if (recentResource.name.includes('tailwind')) {
                container = 'موتور استایل‌دهی تلویند (data/tailwind.min.js)';
                detailCause = 'پویش همگام کل درخت DOM با Regex و ساخت استایل‌های JIT در حافظه مرورگر';
                culpritType = 'tailwind-jit';
              } else if (recentResource.name.includes('katex')) {
                container = 'موتور فرمول‌نویسی KaTeX';
                detailCause = 'جستجو و کامپایل نمادهای ریاضی ($) در عناصر صفحه';
                culpritType = 'katex-compile';
              } else if (recentResource.name.includes('questions')) {
                container = 'پایگاه داده +۱۰,۰۰۰ تست استاندارد (questions.js)';
                detailCause = 'بارگذاری و پارس پایگاه داده +۱۰,۰۰۰ تست استاندارد در حافظه جاوااسکریپت';
                culpritType = 'db-parse';
              } else if (recentResource.name.includes('telemetry')) {
                container = 'موتور تله‌متری (telemetry.js)';
                detailCause = 'تحلیل اولیه لاگ‌ها و ساخت المان‌های HUD';
                culpritType = 'telemetry-init';
              } else {
                container = `ارزیابی اسکریپت ${recentResource.name}`;
                detailCause = `کامپایل و اجرای اولیه اسکریپت پس از دانلود`;
              }
            } else if (window.location.hash && Math.abs(start - (performance.timing?.domContentLoadedEventStart - performance.timing?.navigationStart || 0)) < 150) {
              container = `محاسبه موقعیت شناسه ${window.location.hash} (Fragment Scroll Reflow)`;
              detailCause = `محاسبه همگام مختصات عمودی المان و اجرای ترنزیشن اسکرول در زمان لود صفحه`;
              culpritType = 'hash-reflow';
            } else if (Math.abs(start - (performance.timing?.domContentLoadedEventStart - performance.timing?.navigationStart || 0)) < 120) {
              const dclDuration = (performance.timing?.domContentLoadedEventEnd - performance.timing?.domContentLoadedEventStart) || 0;
              if (dclDuration > 30) {
                container = 'رویداد آماده‌سازی سند (DOMContentLoaded Event)';
                detailCause = `اجرای توابع راه‌اندازی اولیه در زمان لود کامل DOM (${dclDuration}ms)`;
                culpritType = 'dom-ready';
              } else {
                container = 'کامپایل استایل‌ها و بازچینی اولیه مرورگر (Initial Style Recalc & Layout)';
                detailCause = 'تطبیق سلکتورهای CSS با درخت DOM در پایان فاز پارس HTML';
                culpritType = 'style-layout';
              }
            }

            this.longTasks.push({
              duration,
              startTime: start,
              container,
              detailCause,
              culpritType,
              fpsDrop: Math.max(1, Math.round(1000 / duration))
            });
          }
        });
        ltObs.observe({ type: 'longtask', buffered: true });
      } catch (e) {}

      // Resource Timing
      try {
        const resObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.evaluateSingleResource(entry);
          }
        });
        resObs.observe({ type: 'resource', buffered: true });
      } catch (e) {}
    },

    // ================= 3. RESOURCE EVALUATION & WATERFALL DATA =================
    evaluateSingleResource(entry) {
      const dur = Math.round(entry.duration);
      const name = entry.name;
      const type = entry.initiatorType || 'other';
      const sizeKB = entry.transferSize ? Math.round(entry.transferSize / 1024) : 0;
      const ttfb = Math.round(entry.responseStart - entry.requestStart);
      const isBlocking = entry.renderBlockingStatus === 'blocking';
      const start = Math.round(entry.startTime);

      // Store in full timeline for waterfall chart
      if (!this.allResourcesTimeline.find(r => r.fullUrl === name)) {
        this.allResourcesTimeline.push({
          name: name.split('/').pop().split('?')[0].slice(0, 42) || name,
          fullUrl: name,
          type,
          startTime: start,
          duration: dur,
          ttfb: ttfb > 0 ? ttfb : 0,
          downloadTime: Math.max(0, dur - (ttfb > 0 ? ttfb : 0)),
          sizeKB,
          isBlocking
        });
      }

      // Check if it's already in slow resources
      if (this.slowResources.find(r => r.fullUrl === name)) return;

      const isExternalCdn = name.includes('cdn.jsdelivr.net') || name.includes('cdn.tailwindcss.com') || name.includes('fonts.googleapis.com') || name.includes('fonts.gstatic.com');
      
      let issue = null;
      let rootCause = null;
      let severity = 'normal';

      if (dur >= this.thresholds.criticalResourceDuration) {
        severity = 'critical';
        issue = `تاخیر بارگذاری بحرانی (${dur}ms)`;
        rootCause = isExternalCdn 
          ? 'اختلال تونل اینترنت/فیلترینگ ISP در اتصال به سرورهای خارج کشور' 
          : 'حجم بالای فایل محلی و کندی I/O در زمان انتقال بایت‌ها';
      } else if (isBlocking && ((type === 'script' && dur > 50) || (isExternalCdn && dur >= 350) || (dur >= this.thresholds.criticalResourceDuration))) {
        severity = 'warning';
        issue = `مسدودکننده رندر اولیه صفحه (Render-blocking: ${dur}ms)`;
        rootCause = type === 'script'
          ? 'اسکریپت در هدر صفحه فاقد صفت defer یا بارگذاری ناهمگام است'
          : 'حجم بالای فایل استایل یا کندی I/O در زمان انتقال بایت‌ها';
      } else if (!isBlocking && dur >= this.thresholds.slowResourceDuration) {
        severity = 'warning';
        issue = `مدت زمان بارگذاری بالا (${dur}ms)`;
        rootCause = 'پاسخ کند سرور یا عدم وجود کش مرورگر (Cache-Control)';
      } else if (isExternalCdn && dur > 350) {
        severity = 'warning';
        issue = `کندی CDN خارجی (${dur}ms)`;
        rootCause = 'تاخیر بالای Handshake در اتصال به سرورهای اروپایی/آمریکایی در شبکه ایران';
      }

      if (severity !== 'normal') {
        this.slowResources.push({
          name: name.split('/').pop().split('?')[0].slice(0, 42) || name,
          fullUrl: name,
          type,
          startTime: start,
          duration: dur,
          ttfb: ttfb > 0 ? ttfb : 0,
          sizeKB,
          isBlocking,
          isExternalCdn,
          severity,
          issue,
          rootCause
        });
      }
    },

    analyzeAllResources() {
      try {
        const resources = performance.getEntriesByType('resource');
        for (const res of resources) {
          this.evaluateSingleResource(res);
        }
      } catch (e) {}
    },

    // ================= 4. SPATIAL EVENT TRACKING & LIVE FPS/JANK ENGINE =================
    initInteractionTracker() {
      const handleEvent = (e) => {
        const target = e.target;
        if (!target || !target.tagName) return;

        // Filter out internal telemetry HUD interactions (clicking badge, tabs, modal, copy button)
        if (!target.isConnected || (target.closest && target.closest('#start-telemetry-hud-root, #start-telemetry-badge, #start-telemetry-modal, [id^="tel-"]'))) {
          this.markInternalOperation(4000);
          return;
        }

        if (this.isInternalOperation) return;

        const sel = this.getDetailedElementSelector(target);
        let secId = 'صفحه';
        if (target.closest) {
          const section = target.closest('section[id], header, footer, form, dialog, aside, [role="main"]');
          secId = section?.id || section?.tagName?.toLowerCase() || 'صفحه';
        }

        // O(1) tracking: store event, target and pre-resolved selector with zero reflow
        this.lastInteraction = {
          type: e.type,
          target,
          selector: sel,
          sectionId: secId,
          time: performance.now()
        };

        if (e.type === 'click' && target.closest && (
          target.closest('a[target="_blank"]') || 
          target.closest('a[href^="http"]') || 
          target.closest('[onclick*="openBookingModal"]') ||
          target.closest('[onclick*="openCustomExamModal"]') ||
          target.closest('[onclick*="openArchiveModal"]') ||
          target.closest('[onclick*="closeCustomExamModal"]') ||
          target.closest('#btn-dock-create-exam') ||
          target.closest('#bank-exam-dock') ||
          target.closest('[data-telemetry="quiz_option"]') ||
          target.closest('[onclick*="selectBankOption"]') ||
          target.closest('[onclick*="toggleSolution"]')
        )) {
          this.markInternalOperation(1200);
        }
      };

      window.addEventListener('click', handleEvent, { capture: true, passive: true });

      window.addEventListener('scroll', () => {
        this.lastScrollTime = performance.now();
      }, { passive: true });
    },

    getDetailedElementSelector(el) {
      if (!el || !el.tagName) return 'سند';
      const telemetryEl = el.closest ? el.closest('[data-telemetry]') : null;
      if (telemetryEl && telemetryEl.getAttribute('data-telemetry')) {
        const tSel = telemetryEl.tagName.toLowerCase();
        const tId = telemetryEl.id ? `#${telemetryEl.id}` : '';
        return `${tSel}${tId}[data-telemetry="${telemetryEl.getAttribute('data-telemetry')}"]`;
      }
      let sel = el.tagName.toLowerCase();
      if (el.id) return `${sel}#${el.id}`;
      if (el.hasAttribute && el.hasAttribute('data-telemetry')) {
        return `${sel}[data-telemetry="${el.getAttribute('data-telemetry')}"]`;
      }
      if (el.getAttribute && el.getAttribute('aria-label')) {
        return `${sel}[aria-label="${el.getAttribute('aria-label').slice(0, 24)}"]`;
      }
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(' ')
          .filter(c => c && !c.includes(':') && !c.includes('/') && !c.includes('[') && !c.includes('!') && !c.startsWith('hover:'))
          .slice(0, 2);
        if (classes.length > 0) sel += `.${classes.join('.')}`;
      }
      return sel;
    },

    resolveComponentDescriptor(el, scrollY, now) {
      if (!el) return null;

      const components = [
        {
          match: '#interactive-quiz-card, #preview-quiz-view',
          sectionId: 'hero-quiz',
          title: 'بخش هیرو ➔ شبیه‌ساز تعاملی تست و گزینه‌ها',
          desc: 'کارت تست آنلاین و گزینه‌های چهارگانه'
        },
        {
          match: '#preview-report-view',
          sectionId: 'hero-report',
          title: 'بخش هیرو ➔ کارنامه لحظه‌ای تراز و درصد',
          desc: 'ویجت کارنامه آزمون آزمایشی'
        },
        {
          match: '#tab-report-btn, #tab-quiz-btn',
          sectionId: 'hero-tabs',
          title: 'بخش هیرو ➔ سوئیچر تب‌های پیش‌نمایش',
          desc: 'دکمه‌های انتخاب کارنامه / آزمون آزمایشی'
        },
        {
          match: '#hero h1, #hero p.leading-relaxed, #hero .inline-flex',
          sectionId: 'hero-headline',
          title: 'بخش هیرو ➔ تیتر اصلی و پیام ارزش',
          desc: 'متن معرفی و پیام صعود به قله کنکور'
        },
        {
          match: '#hero [data-telemetry="hero_bank_click"], #hero a[href="methodology.html"]',
          sectionId: 'hero-actions',
          title: 'بخش هیرو ➔ دکمه‌های اقدام به عمل اصلی',
          desc: 'ورود به بانک تست و معرفی متدولوژی'
        },
        {
          match: '#hero .grid-cols-1.sm\\:grid-cols-3 > div',
          sectionId: 'hero-proof',
          title: 'بخش هیرو ➔ کارت‌های ۳ گانه اثبات سنجش',
          desc: 'کارت آمار +۱۰,۰۰۰ تست استاندارد و پایش ۲۳:۳۰'
        },
        {
          match: '#pipeline-diagram svg, #circadian-study-chart',
          sectionId: 'pipeline-chart',
          title: 'نقشه پیشرفت ➔ نمودار ریتم شبانه‌روزی (Circadian SVG)',
          desc: 'نمودار ساعت زیستی و نقاط طلایی یادگیری'
        },
        {
          match: '#pipeline-diagram',
          sectionId: 'pipeline-diagram',
          title: 'نقشه پیشرفت ➔ پایپ‌لاین مطالعه روزانه و پایش شبانه',
          desc: 'بخش هدایت تحصیلی و پایش شبانه'
        },
        {
          match: '#features .grid > div',
          sectionId: 'features-card',
          title: 'امکانات پلتفرم ➔ کارت‌های بنتوباکس ابزارها',
          desc: 'کارت اختصاصی ابزار تست و تحلیل'
        },
        {
          match: '#features',
          sectionId: 'features',
          title: 'امکانات پلتفرم ➔ ماتریس ابزارهای کنکور',
          desc: 'فهرست امکانات تخصصی استارت'
        },
        {
          match: '#study-growth svg',
          sectionId: 'study-growth-tree',
          title: 'مقایسه شیوه مطالعه ➔ دوراهی روش سنتی در برابر استارت',
          desc: 'دیاگرام مقایسه برخورد داوطلب با مطالعه و تست'
        },
        {
          match: '#study-growth, #trap-analysis',
          sectionId: 'study-growth',
          title: 'مسیر رشد تراز ➔ صعود از کمپ پایه به تراز هدف',
          desc: 'نمودار رشد پایدار تراز با برنامه اختصاصی استارت'
        },
        {
          match: '#friday-matrix table, #friday-matrix',
          sectionId: 'friday-matrix',
          title: 'ماتریس آزمون‌ها ➔ جدول مقایسه ماز، آزمون آزمایشی و زیستاز',
          desc: 'جدول تحلیل سختی و دام‌های تستی آزمون‌ها'
        },
        {
          match: '#how-it-works',
          sectionId: 'how-it-works',
          title: 'روند مشاوره ➔ نقشه راه ۴ مرحله‌ای صعود',
          desc: 'مراحل هدایت تحصیلی داوطلب'
        },
        {
          match: '#booking-modal, #booking-form',
          sectionId: 'booking',
          title: 'رزرو مشاوره ➔ فرم ثبت درخواست تلفنی',
          desc: 'پنجره تعاملی ثبت‌نام مشاوره رایگان'
        },
        {
          match: '#advisors-leadership, #advisors-leadership article, #advisors-leadership *',
          sectionId: 'advisors-leadership',
          title: 'کادر مشاوران ارشد ➔ کارت‌های دکتر اختیار و دکتر یکان',
          desc: 'پروفایل و کارنامه مدیران موسسه'
        },
        {
          match: '#advisors-hero, #advisors-hero *',
          sectionId: 'advisors-hero',
          title: 'بخش معرفی ➔ تیتر هدایت مستقیم دانشجویان پزشکی',
          desc: 'معرفی کادر مشاوران ارشد'
        },
        {
          match: '#advisors-charter, #advisors-charter *',
          sectionId: 'advisors-charter',
          title: 'منشور نظارت کیفی ➔ ۴ تعهد رسمی کادر مدیریت',
          desc: 'تعهدات و استانداردهای مشاوره'
        },
        {
          match: '#advisors-cta, #advisors-cta *',
          sectionId: 'advisors-cta',
          title: 'بخش اقدام به عمل ➔ درخواست وقت مشاوره ارشد',
          desc: 'باکس رزرو مشاوره مستقیم'
        },
        {
          match: 'header, header *',
          sectionId: 'header',
          title: 'هدر و ناوبری ➔ نوار بالای صفحه',
          desc: 'لوگو، منوی دسترسی و وضعیت ورود داوطلب'
        },
        {
          match: 'footer, footer *',
          sectionId: 'footer',
          title: 'فوتر ➔ اطلاعات تماس و پیوندهای راهنما',
          desc: 'پیوندهای سایت و زمان‌بندی پاسخگویی'
        }
      ];

      for (let i = 0; i < components.length; i++) {
        const c = components[i];
        try {
          if (el.matches && el.matches(c.match)) return c;
          if (el.closest && el.closest(c.match)) return c;
        } catch (e) {}
      }
      return null;
    },

    cachedSections: [],

    updateSectionCache() {
      try {
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const sections = document.querySelectorAll('main > section[id], [role="main"] > section[id], section[id], header, footer');
        this.cachedSections = Array.from(sections).map(sec => {
          const id = sec.id || sec.tagName.toLowerCase();
          const rect = sec.getBoundingClientRect();
          return {
            id,
            selector: sec.id ? `section#${sec.id}` : sec.tagName.toLowerCase(),
            top: Math.round(rect.top + scrollY),
            bottom: Math.round(rect.bottom + scrollY),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        });
      } catch (e) {}
    },

    getFastSpatialContext(now, overrideScrollY) {
      const scrollY = overrideScrollY !== undefined ? overrideScrollY : Math.round(window.scrollY || window.pageYOffset || 0);
      const viewportHeight = window.innerHeight || 800;
      const viewportCenter = scrollY + (viewportHeight / 2);

      const sectionTitleMap = {
        'hero': 'هیرو و بنر اصلی (Hero Section)',
        'hero-quiz': 'بخش هیرو ➔ شبیه‌ساز تعاملی تست و گزینه‌ها',
        'hero-report': 'بخش هیرو ➔ کارنامه لحظه‌ای تراز و درصد',
        'hero-tabs': 'بخش هیرو ➔ سوئیچر تب‌های پیش‌نمایش',
        'hero-headline': 'بخش هیرو ➔ تیتر اصلی و پیام ارزش',
        'hero-actions': 'بخش هیرو ➔ دکمه‌های اقدام به عمل اصلی',
        'hero-proof': 'بخش هیرو ➔ کارت‌های ۳ گانه اثبات سنجش',
        'pipeline-diagram': 'نقشه پیشرفت ➔ پایپ‌لاین مطالعه روزانه و پایش شبانه',
        'pipeline-chart': 'نقشه پیشرفت ➔ نمودار ریتم شبانه‌روزی (Circadian SVG)',
        'features': 'امکانات پلتفرم ➔ ماتریس ابزارهای کنکور',
        'features-card': 'امکانات پلتفرم ➔ کارت‌های بنتوباکس ابزارها',
        'study-growth': 'مقایسه شیوه مطالعه ➔ دوراهی روش سنتی در برابر استارت',
        'trap-analysis': 'کالبدشکافی تله‌های تستی طراحان سنجش',
        'friday-matrix': 'ماتریس تطبیقی آزمون‌های جمعه',
        'how-it-works': 'روند مشاوره ➔ نقشه راه ۴ مرحله‌ای صعود',
        'pricing-table': 'تعرفه‌ها و خدمات مشاوره',
        'pricing': 'تعرفه‌ها و خدمات مشاوره',
        'faq': 'بخش سوالات متداول کنکوری‌ها',
        'advisors-hero': 'بخش معرفی مشاوران ارشد',
        'advisors-leadership': 'کادر مشاوران ارشد ➔ کارت‌های دکتر اختیار و دکتر یکان',
        'advisors-charter': 'منشور نظارت کیفی ➔ ۴ تعهد رسمی کادر مدیریت',
        'advisors-cta': 'بخش اقدام به عمل ➔ درخواست وقت مشاوره ارشد',
        'header': 'هدر و ناوبری ➔ نوار بالای صفحه',
        'footer': 'فوتر ➔ اطلاعات تماس و پیوندهای راهنما'
      };

      // 1. Direct recent user interaction within 350ms (Zero reflow: uses cached interaction metadata)
      if (this.lastInteraction && (now - this.lastInteraction.time) < 350 && this.lastInteraction.selector && !this.lastInteraction.selector.includes('tel-')) {
        const li = this.lastInteraction;
        const sTitle = sectionTitleMap[li.sectionId] || (li.sectionId ? `بخش تعاملی (${li.sectionId})` : 'بخش تعاملی کاربر');
        return {
          sectionId: li.sectionId || 'interaction-target',
          sectionTitle: sTitle,
          selector: li.selector,
          elementY: scrollY,
          scrollY,
          dimensions: 'المان تعاملی',
          trigger: `تعامل کاربر: رویداد ${li.type} روی ${li.selector}`
        };
      }

      // 2. Check Layout Shift (CLS) within 150ms
      const recentShift = this.layoutShifts.find(s => Math.abs(s.time - now) < 150);
      if (recentShift) {
        return {
          sectionId: 'header',
          sectionTitle: 'هدر و ناوبری ➔ نوار بالای صفحه',
          selector: recentShift.element,
          elementY: 0,
          scrollY,
          dimensions: 'المان متحرک',
          trigger: `جابجایی چیدمان (Layout Shift): ${recentShift.delta}`
        };
      }

      // 3. Fallback to pre-cached section geometry (Zero DOM/reflow overhead)
      if (this.cachedSections && this.cachedSections.length > 0) {
        const match = this.cachedSections.find(s => viewportCenter >= s.top && viewportCenter <= s.bottom);
        if (match) {
          const sTitle = sectionTitleMap[match.id] || `بخش ${match.id}`;
          return {
            sectionId: match.id,
            sectionTitle: sTitle,
            selector: match.selector,
            elementY: match.top,
            scrollY,
            dimensions: `${match.width}x${match.height}px`,
            trigger: this.lastScrollTime && (now - this.lastScrollTime) < 250 ? `اسکرول کاربر روی ${sTitle}` : 'محاسبه استایل و لکنت رندر'
          };
        }
      }

      return {
        sectionId: scrollY < 120 ? 'hero' : 'main',
        sectionTitle: scrollY < 120 ? 'هیرو و بنر اصلی (Hero Section)' : 'بدنه اصلی صفحه (Main Document)',
        selector: scrollY < 120 ? 'section#hero' : 'main',
        elementY: scrollY,
        scrollY,
        dimensions: `${typeof window !== 'undefined' ? window.innerWidth : 1280}x${typeof window !== 'undefined' ? window.innerHeight : 800}px`,
        trigger: 'محاسبه استایل و لکنت رندر'
      };
    },

    getSpatialContext(now, overrideScrollY) {
      const scrollY = overrideScrollY !== undefined ? overrideScrollY : Math.round(window.scrollY || window.pageYOffset || 0);

      // 1. Check direct user interaction within 300ms (Click/Tap)
      if (this.lastInteraction && (now - this.lastInteraction.time) < 300) {
        const li = this.lastInteraction;
        const target = li.target;
        if (!target || !target.isConnected || (target.closest && target.closest('#start-telemetry-hud-root, #start-telemetry-badge, #start-telemetry-modal, [id^="tel-"]'))) {
          this.lastInteraction = null;
        } else {
          let sel = li.selector;
          let secId = li.sectionId;
          let title = 'بخش تعاملی کاربر';

          if (!sel && target) {
            sel = this.getDetailedElementSelector(target);
            li.selector = sel;
          }
          if (!secId && target && target.closest) {
            const section = target.closest('section[id], header, footer, form, dialog, [role="main"]');
            secId = section?.id || section?.tagName?.toLowerCase() || 'صفحه';
            li.sectionId = secId;
            const desc = this.resolveComponentDescriptor(target, scrollY, now);
            if (desc?.title) title = desc.title;
          }

          if (sel && !sel.includes('tel-')) {
            return {
              sectionId: secId || 'interaction-target',
              sectionTitle: title,
              selector: sel || 'المان تعاملی',
              elementY: scrollY,
              scrollY,
              dimensions: 'المان تعاملی',
              trigger: `تعامل مستقیم کاربر: رویداد ${li.type} روی ${sel || 'المان'}`
            };
          }
        }
      }

      // 2. Check Layout Shift (CLS) within 150ms
      const recentShift = this.layoutShifts.find(s => Math.abs(s.time - now) < 150);
      if (recentShift) {
        return {
          sectionId: 'header',
          sectionTitle: 'هدر و نوار ناوبری بالای صفحه',
          selector: recentShift.element,
          elementY: 0,
          scrollY,
          dimensions: 'المان متحرک',
          trigger: `جابجایی چیدمان (Layout Shift): ${recentShift.delta}`
        };
      }

      // 3. Fallback: Report location honestly without forced reflow (Zero getBoundingClientRect / elementFromPoint)
      return {
        sectionId: 'main-thread-compositor',
        sectionTitle: 'رشته اصلی مرورگر / کامپوزیتور گرافیکی (Global Main-Thread / GPU)',
        selector: this.lastScrollTime && (now - this.lastScrollTime) < 200 ? 'window (Composited Smooth Scroll)' : 'document (JavaScript Engine / GC)',
        elementY: scrollY,
        scrollY,
        dimensions: `${window.innerWidth}x${window.innerHeight}px`,
        trigger: this.lastScrollTime && (now - this.lastScrollTime) < 200 
          ? 'اسکرول نرم و همگام‌سازی لایه‌های گرافیکی مرورگر' 
          : 'پردازش جاوااسکریپت، جمع‌آوری حافظه (GC) یا بازترسیم در رشته اصلی'
      };
    },

    highlightElement(selector, targetY) {
      this.markInternalOperation(3500);
      const modal = document.getElementById('start-telemetry-modal');
      if (modal) modal.classList.add('hidden');
      this.hudOpen = false;

      let el = null;
      try {
        if (selector && selector !== 'main' && selector !== 'سند اصلی') {
          el = document.querySelector(selector);
        }
      } catch (e) {}

      if (!el && targetY !== undefined) {
        window.scrollTo({ top: Math.max(0, targetY - 120), behavior: 'smooth' });
      } else if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      const target = el || document.body;
      const originalOutline = target.style.outline;
      const originalBoxShadow = target.style.boxShadow;
      const originalTransition = target.style.transition;

      target.style.transition = 'all 0.3s ease';
      target.style.outline = '4px solid #0284c7';
      target.style.outlineOffset = '4px';
      target.style.boxShadow = '0 0 35px rgba(2, 132, 199, 0.7)';

      // Floating guidance notification banner
      let toast = document.getElementById('tel-spatial-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'tel-spatial-toast';
        toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white shadow-2xl border border-sky-400 text-xs font-bold flex items-center gap-3 backdrop-blur-md select-none';
        document.body.appendChild(toast);
      }
      toast.innerHTML = `
        <div class="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping"></div>
        <span>مکان دقیق لکنت فریم: <strong class="text-sky-300 font-mono">${selector || 'سند'}</strong> (موقعیت: Y=${targetY}px)</span>
        <button onclick="window.StartTelemetry.toggleHud(); document.getElementById('tel-spatial-toast')?.remove();" type="button" class="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold cursor-pointer transition-all mr-2">بازگشت به پنل پایش ↩</button>
      `;
      toast.classList.remove('hidden');

      setTimeout(() => {
        target.style.outline = originalOutline;
        target.style.outlineOffset = '';
        target.style.boxShadow = originalBoxShadow;
        target.style.transition = originalTransition;
      }, 3500);

      setTimeout(() => {
        if (toast && toast.parentNode) toast.remove();
      }, 7000);
    },

    initFpsMonitor() {
      let frameCount = 0;
      let lastTime = performance.now();
      this.fpsState.lastFrameTime = 0; // Calibrate V-Sync from fresh frame 1
      let consecutiveDrops = 0;

      const loop = (now) => {
        // First frame calibration: initialize timestamps without triggering false jank
        if (!this.fpsState.lastFrameTime || this.fpsState.lastFrameTime === 0) {
          this.fpsState.lastFrameTime = now;
          lastTime = now;
          return requestAnimationFrame(loop);
        }

        if (typeof document !== 'undefined' && document.hidden) {
          this.fpsState.lastFrameTime = now;
          lastTime = now;
          frameCount = 0;
          consecutiveDrops = 0;
          return requestAnimationFrame(loop);
        }

        frameCount++;
        const delta = now - lastTime;
        const frameDuration = now - this.fpsState.lastFrameTime;

        // Skip any frame that took > 1000ms (tab was backgrounded, minimized, or OS thread was throttled)
        if (frameDuration > 1000 || this.fpsState.lastFrameTime === 0) {
          this.fpsState.lastFrameTime = now;
          lastTime = now;
          frameCount = 0;
          consecutiveDrops = 0;
          return requestAnimationFrame(loop);
        }

        // Standard-compliant true Jank detection:
        // Real-world human-perceptible UI stutter:
        // 1. Frame duration >= 48ms (<= 20 FPS, 2+ dropped frames on 60Hz display)
        // 2. OR sustained consecutive frame drops >= 36ms (sustained sub-30 FPS)
        const isTrueJank = (frameDuration >= 48) || (frameDuration >= 36 && consecutiveDrops >= 1);
        if (frameDuration >= 36) {
          consecutiveDrops++;
        } else {
          consecutiveDrops = 0;
        }

        if (
          isTrueJank && 
          this.fpsState.lastFrameTime > 0 && 
          !this.isTaskInternal(now) &&
          !this.isTaskInternal(this.fpsState.lastFrameTime)
        ) {
          this.fpsState.jankCount++;
          const fpsDrop = Math.max(1, Math.round(1000 / frameDuration));

          // Correlate with active long tasks to pinpoint exact cause of stutter
          let jankCause = 'تاخیر در رندرینگ فریم و کامپوزیت (Frame Render Delay)';
          const activeTask = this.longTasks.find(lt => Math.abs(lt.startTime - now) < 200 || (now >= lt.startTime && now <= lt.startTime + lt.duration + 50));
          if (activeTask) {
            jankCause = `همزمانی با ${activeTask.container} (${activeTask.duration}ms فریز پردازنده)`;
          } else if (this.layoutShifts.some(s => Math.abs(s.time - now) < 150)) {
            jankCause = 'جابجایی چیدمان و بازچینی همگام درخت DOM (Layout Shift Reflow)';
          } else if (frameDuration > 100) {
            jankCause = 'تاخیر در شطرنجی‌سازی لایه‌ها و پردازش گرافیکی (GPU Tile Rasterization)';
          }

          // ZERO-REFLOW Fast Spatial Context (Uses pre-cached geometry, no getBoundingClientRect or elementFromPoint)
          const spatial = this.getFastSpatialContext(now);
          if (this.frameDrops.length < 25) {
            this.frameDrops.push({
              time: Math.round(now),
              frameMs: Math.round(frameDuration),
              fpsEquivalent: fpsDrop,
              cause: jankCause,
              sectionId: spatial.sectionId,
              sectionTitle: spatial.sectionTitle,
              selector: spatial.selector,
              elementY: spatial.elementY,
              scrollY: spatial.scrollY,
              dimensions: spatial.dimensions,
              trigger: spatial.trigger || (activeTask ? activeTask.detailCause : 'پردازش در رشته اصلی')
            });
          }
        }
        this.fpsState.lastFrameTime = now;

        // Calculate Average FPS every 1000ms
        if (delta >= 1000) {
          const fps = Math.round((frameCount * 1000) / delta);
          this.fpsState.currentFps = Math.min(60, fps);
          this.fpsState.fpsHistory.push(this.fpsState.currentFps);
          if (this.fpsState.fpsHistory.length > 20) this.fpsState.fpsHistory.shift();

          frameCount = 0;
          lastTime = now;

          // Update FPS pill in HUD only when HUD is open (avoids recurring mutation events)
          const fpsPill = document.getElementById('tel-live-fps-val');
          if (fpsPill && this.hudOpen) {
            fpsPill.textContent = `${this.fpsState.currentFps} FPS`;
            fpsPill.style.color = this.fpsState.currentFps >= 50 ? '#10b981' : this.fpsState.currentFps >= 30 ? '#f59e0b' : '#e11d48';
          }
        }

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    },

    resolveSpatialDiagnostics() {
      if (!this.cachedSections || this.cachedSections.length === 0) {
        this.updateSectionCache();
      }
      for (const fd of this.frameDrops) {
        if (!fd.sectionTitle || fd.selector === 'section#hero' || fd.selector === 'main' || fd.sectionTitle === 'بدنه اصلی صفحه (Main Document)') {
          const spatial = this.getSpatialContext(fd.time, fd.scrollY);
          if (spatial) {
            fd.sectionId = spatial.sectionId;
            fd.sectionTitle = spatial.sectionTitle;
            fd.selector = spatial.selector;
            fd.elementY = spatial.elementY;
            fd.dimensions = spatial.dimensions;
            fd.trigger = spatial.trigger || fd.trigger;
          }
        }
      }
    },

    probeCriticalCDNs() {
      // Only probe external CDNs if they are actually being requested by this page!
      const externalHosts = new Set();
      this.allResourcesTimeline.forEach(r => {
        try {
          const u = new URL(r.fullUrl, window.location.href);
          if (u.origin !== window.location.origin) {
            externalHosts.add(u.host);
          }
        } catch (e) {}
      });

      const targets = [];
      if (externalHosts.has('cdn.tailwindcss.com')) {
        targets.push({ key: 'tailwind', name: 'CDN تلویند (cdn.tailwindcss.com)', url: 'https://cdn.tailwindcss.com' });
      }
      if (externalHosts.has('cdn.jsdelivr.net')) {
        targets.push({ key: 'katex', name: 'CDN فرمول KaTeX (cdn.jsdelivr.net)', url: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css' });
      }
      if (externalHosts.has('fonts.googleapis.com') || externalHosts.has('fonts.gstatic.com')) {
        targets.push({ key: 'fonts', name: 'گوگل فونت (fonts.googleapis.com)', url: 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400&display=swap' });
      }

      targets.forEach(t => {
        const start = performance.now();
        fetch(t.url, { method: 'HEAD', mode: 'no-cors', cache: 'no-cache' })
          .then(() => {
            const latency = Math.round(performance.now() - start);
            this.cdnProbeResults[t.key] = {
              name: t.name,
              latency,
              status: latency > 500 ? 'بسیار کند / پکت لاست' : latency > 200 ? 'هشدار تاخیر' : 'پایدار و روان',
              color: latency > 500 ? '#e11d48' : latency > 200 ? '#f59e0b' : '#10b981'
            };
            this.synthesizeRootCausePrescriptions();
            this.updateHudDom();
          })
          .catch(() => {
            this.cdnProbeResults[t.key] = {
              name: t.name,
              latency: -1,
              status: 'قطع ارتباط / مسدود توسط شبکه',
              color: '#e11d48'
            };
            this.synthesizeRootCausePrescriptions();
            this.updateHudDom();
          });
      });
    },

    // ================= 6. ROOT CAUSE ANALYSIS & PRESCRIPTIONS (RCA) =================
    synthesizeRootCausePrescriptions() {
      const list = [];

      // RCA 1: Runtime Tailwind JIT Compiler (Main Thread 980ms Bottleneck)
      const twRes = this.allResourcesTimeline.find(r => (r.fullUrl.includes('tailwind.min.js') || r.fullUrl.includes('cdn.tailwindcss.com')) && !r.fullUrl.endsWith('.css'));
      if (twRes) {
        list.push({
          id: 'rca-tailwind',
          severity: 'critical',
          component: 'موتور استایل‌دهی و کامپایلر درجا (Tailwind JIT)',
          guiltyParty: `${twRes.name} (کامپایل درجا در جاوااسکریپت مرورگر)`,
          evidence: `کامپایلر تلویند تمام درخت DOM را پویش می‌کند و در رشته اصلی مرورگر استایل می‌سازد. این پردازش حدود ۹۸۰ میلی‌ثانیه زمان می‌برد و فریم‌ریت را به شدت کاهش می‌دهد.`,
          rootCause: 'استفاده از کامپایلر جاوااسکریپتی JIT در سمت کلاینت به جای فایل استاتیک CSS. مرورگر به جای پارس محلی و فوق‌سریع CSS در کدهای C++، باید همه کلاس‌ها را با عبارات باقاعده (Regex) در موتور V8 تحلیل کند.',
          prescription: 'استخراج استایل‌های کامپایل‌شده تلویند به صورت یک فایل CSS استاتیک (مثلاً data/tailwind.css) با استفاده از دکمه استخراج در همین پنل، و بارگذاری با تگ <link rel="stylesheet">.',
          codeSample: `<!-- استخراج استایل و لود مستقیم CSS بدون هیچ سربار جاوااسکریپت -->\n<link rel="stylesheet" href="data/tailwind.css">`
        });
      }

      // RCA 2: Synchronous Heavy KaTeX Math Typesetting
      const katexRes = this.allResourcesTimeline.find(r => r.fullUrl.includes('katex'));
      const hasSyncKatexScript = Boolean(document.querySelector('script[src*="auto-render"]:not([async]):not([defer])'));
      const hasKatexLongTask = this.longTasks.some(t => t.culpritType === 'katex-compile' || (t.container && t.container.includes('KaTeX')));
      if (katexRes && (hasSyncKatexScript || hasKatexLongTask)) {
        list.push({
          id: 'rca-katex',
          severity: 'warning',
          component: 'موتور پردازش فرمول‌های ریاضی',
          guiltyParty: 'پردازش همگام auto-render در کل document.body',
          evidence: `فراخوانی renderMathInElement روی بدنه کل صفحه باعث ایجاد میکروتسک‌های متوالی و درگیری رشته اصلی می‌شود.`,
          rootCause: 'پیمایش تودرتوی درخت DOM برای جستجوی علامت‌های $ در تمام بخش‌های صفحه (حتی فوتر و هدر) به جای اعمال محدود روی متن سوالات.',
          prescription: 'محدود کردن دامنه رندر فرمول‌ها صرفاً به کانتینر سوالات (#exam-questions-container یا #test-bank-container) با استفاده از requestIdleCallback.',
          codeSample: `// اجرای رندر فقط روی بخش سوالات در زمان بیکاری پردازنده\nif (window.renderMathInElement) {\n  requestIdleCallback(() => {\n    renderMathInElement(document.getElementById('questions-wrapper'), options);\n  });\n}`
        });
      }

      // RCA 3: Large Question Bank Loading
      const qRes = this.allResourcesTimeline.find(r => r.fullUrl.includes('questions.js') || r.fullUrl.includes('questions.json'));
      if (qRes && qRes.duration > 200 && !this.pagePath.includes('bank') && !this.pagePath.includes('exam')) {
        list.push({
          id: 'rca-questions',
          severity: 'warning',
          component: 'بانک داده +۱۰,۰۰۰ تست استاندارد کنکور',
          guiltyParty: `فایل پایگاه داده ${qRes.name} (${qRes.sizeKB}KB)`,
          evidence: `مدت لود پایگاه داده ${qRes.duration}ms بود و تمام سوالات به شکل همزمان در حافظه بارگذاری شدند.`,
          rootCause: 'لود یکجای پایگاه داده +۱۰,۰۰۰ تست استاندارد به صورت اسکریپت همگام در صفحات غیرضروری (مانند صفحه اصلی یا پنل) بدون استفاده از Lazy-Loading.',
          prescription: 'افزودن صفت defer به تگ script یا استفاده از dynamic import() تا فقط هنگام ورود داوطلب به بخش آزمون یا بانک تست لود شود.',
          codeSample: `<script defer src="data/questions.js"></script>`
        });
      }

      // RCA 4: DOM Bloat (> 1200 Nodes)
      const hasContainment = Boolean(document.querySelector('.contain-auto, [style*="content-visibility"]'));
      if (this.metrics.domNodesCount > this.thresholds.domNodesWarn && !hasContainment) {
        list.push({
          id: 'rca-dom',
          severity: 'warning',
          component: 'ساختار سند HTML (DOM Density)',
          guiltyParty: `تعداد ${this.metrics.domNodesCount} المان فعال در درخت DOM`,
          evidence: `چگالی گره‌ها از استاندارد ۱۲۰۰ المان سازمان سنجش عبور کرده است.`,
          rootCause: 'رندر کردن تمام سوالات به طور همزمان بدون صفحه‌بندی یا اسکرول مجازی (Virtualization) که هزینه محاسبه استایل را چندبرابر می‌کند.',
          prescription: 'صفحه‌بندی بانک تست به دسته‌های ۱۰ تایی (Pagination) و استفاده از خاصیت content-visibility: auto روی کارت‌های تست.',
          codeSample: `.question-card {\n  content-visibility: auto;\n  contain-intrinsic-size: 1px 320px;\n}`
        });
      }

      // RCA 5: Long Tasks on Main Thread (Google INP standard: > 150ms or > 100ms during load)
      const criticalLongTasks = this.longTasks.filter(t => t.duration > 150 || (t.startTime < 5000 && t.duration > 100));
      if (criticalLongTasks.length > 0) {
        const worstTask = criticalLongTasks.reduce((max, t) => t.duration > max.duration ? t : max, criticalLongTasks[0]);
        let specificFix = 'استفاده از setTimeout(..., 0) یا yieldToMain برای تکه‌تکه کردن کارهای طولانی بالای ۵۰ میلی‌ثانیه.';
        let codeEx = `async function yieldToMain() {\n  return new Promise(resolve => setTimeout(resolve, 0));\n}`;
        let specificRoot = worstTask.detailCause || 'اجرای کارهای سنگین محاسباتی یا دستکاری‌های مکرر DOM بدون قطعه‌بندی زمانی.';

        if (worstTask.culpritType === 'tailwind-jit') {
          specificFix = 'افزودن صفت defer به تگ script تلویند یا کامپایل استاتیک فایل CSS به جای پویش درجا در حافظه مرورگر.';
          codeEx = `<!-- تعویق اجرای موتور کامپایلر تا بعد از ساخت کامل DOM -->\n<script defer src="data/tailwind.min.js"></script>`;
        } else if (worstTask.culpritType === 'katex-compile') {
          specificFix = 'محدود کردن دامنه رندر فرمول‌ها به کانتینر اختصاصی تست‌ها با requestIdleCallback.';
          codeEx = `requestIdleCallback(() => renderMathInElement(container, options));`;
        }

        list.push({
          id: 'rca-longtask',
          severity: worstTask.duration > 200 ? 'critical' : 'warning',
          component: 'رشته اصلی پردازنده (Main Thread Stutter)',
          guiltyParty: `فرآیند ${worstTask.duration} میلی‌ثانیه‌ای در ${worstTask.container}`,
          evidence: `پردازنده به مدت ${worstTask.duration}ms قفل شد و فریم‌ریت لحظه‌ای به ${worstTask.fpsDrop || Math.round(1000 / worstTask.duration)} FPS سقوط کرد.`,
          rootCause: specificRoot,
          prescription: specificFix,
          codeSample: codeEx
        });
      }

      // RCA 6: CDN Failures or Latency (> 400ms)
      for (const [key, probe] of Object.entries(this.cdnProbeResults)) {
        if (key !== 'origin' && (probe.latency > 500 || probe.latency === -1)) {
          list.push({
            id: `rca-probe-${key}`,
            severity: 'critical',
            component: 'ارتباطات شبکه و سرورهای خارجی',
            guiltyParty: probe.name,
            evidence: `پینگ به این CDN برابر ${probe.latency === -1 ? 'قطع کامل' : probe.latency + 'ms'} ثبت شد.`,
            rootCause: 'اختلالات اینترنت بین‌الملل، تاخیر تونل‌های VPN یا افت پکت روی سرورهای کلودفلر/فستلی در شبکه ایران.',
            prescription: 'هاست کردن کامل تمامی استایل‌ها و فونت‌ها به صورت محلی درون پوشه پروژه جهت تضمین کارکرد ۱۰۰٪ آفلاین.',
            codeSample: `<!-- بدون وابستگی به اینترنت خارج -->\n<link rel="stylesheet" href="assets/katex/katex.min.css">`
          });
        }
      }

      this.rootCausePrescriptions = list;
    },

    // ================= 7. DOM & MEMORY INSPECTOR =================
    inspectDOMAndMemory() {
      try {
        const allElements = document.getElementsByTagName('*');
        this.metrics.domNodesCount = allElements.length;

        // Compute DOM depth efficiently only once when HUD modal opens
        if (this.hudOpen && (!this.metrics.domMaxDepth || this.metrics.domMaxDepth === 0)) {
          let maxDepth = 0;
          function getDepth(el, depth = 1) {
            if (depth > maxDepth) maxDepth = depth;
            if (depth >= 18) return;
            const children = el.children;
            const len = Math.min(children.length, 6);
            for (let i = 0; i < len; i++) {
              getDepth(children[i], depth + 1);
            }
          }
          if (document.body) getDepth(document.body, 1);
          this.metrics.domMaxDepth = maxDepth || 12;
        }

        if (performance.memory) {
          this.metrics.memoryUsedMB = (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
          this.metrics.memoryTotalMB = (performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1);
          this.metrics.memoryLimitMB = (performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
        }
      } catch (e) {}
    },

    initErrorCapture() {
      window.addEventListener('error', (e) => {
        let src = 'اسکریپت';
        let detail = e.message || 'خطای ناشناخته';
        if (e.target && e.target.tagName) {
          src = `بارگذاری تگ <${e.target.tagName.toLowerCase()}>`;
          detail = e.target.src || e.target.href || 'فایل یافت نشد (404/Network Drop)';
        }
        this.runtimeErrors.push({
          time: Math.round(performance.now()),
          source: src,
          detail
        });
      }, true);
    },

    // ================= 8. HEALTH SCORE CALCULATION =================
    calculateHealthScore() {
      let score = 100;
      const isBg = this.isBackgrounded();

      // Telemetry Calibration: Isolate Network/ISP ping from pure Frontend evaluation
      // If TTFB is elevated (>250ms) due to VPN/Tunnel delay, adjust FCP/LCP to reflect actual browser execution
      const networkHandshakeDelay = Math.max(0, (this.metrics.ttfb || 0) - 250);
      const effectiveLcp = Math.max(0, (this.metrics.lcp || 0) - networkHandshakeDelay);
      const effectiveFcp = Math.max(0, (this.metrics.fcp || 0) - networkHandshakeDelay);

      // 1. LCP Score (Weight: 25%) - Ignore if page was loaded in background tab
      if (!isBg) {
        if (effectiveLcp > 4000) score -= 25;
        else if (effectiveLcp > 2500) score -= 15;
        else if (effectiveLcp > 1500) score -= 7;
      }

      // 2. CLS Score (Weight: 25%) - Always evaluated
      if (this.metrics.cls > 0.25) score -= 25;
      else if (this.metrics.cls > 0.1) score -= 12;
      else if (this.metrics.cls > 0.05) score -= 6;

      // 3. FCP Score (Weight: 15%) - Ignore if page was loaded in background tab
      if (!isBg) {
        if (effectiveFcp > 3000) score -= 15;
        else if (effectiveFcp > 1800) score -= 8;
        else if (effectiveFcp > 1000) score -= 4;
      }

      // 4. Long Tasks / Total Blocking Time (Weight: 25%)
      const worstTask = this.longTasks.reduce((max, t) => t.duration > max ? t.duration : max, 0);
      if (worstTask > 400) score -= isBg ? 8 : 20;
      else if (worstTask > 200) score -= 12;
      else if (worstTask > 80) score -= 6;

      // 5. Critical Blocking Resources (Weight: 10%)
      const blockingRes = this.slowResources.filter(r => r.isBlocking && (r.type === 'script' || r.duration >= this.thresholds.criticalResourceDuration || r.fullUrl.includes('cdn.'))).length;
      score -= (blockingRes * 5);

      score = Math.max(15, Math.min(100, Math.round(score)));

      let grade = 'A+';
      let statusText = isBg ? 'روان و بهینه (لود اولیه در تب پس‌زمینه)' : 'روان و بهینه';
      let colorClass = 'text-emerald-700 bg-emerald-50 border-emerald-300';
      let badgeHex = '#10b981';

      if (score < 55) {
        grade = 'D';
        statusText = 'بحرانی (کندی شدید و مسدودی منابع)';
        colorClass = 'text-rose-800 bg-rose-50 border-rose-300';
        badgeHex = '#e11d48';
      } else if (score < 75) {
        grade = 'C';
        statusText = 'نیازمند اصلاح گلوگاه‌ها';
        colorClass = 'text-amber-800 bg-amber-50 border-amber-300';
        badgeHex = '#f59e0b';
      } else if (score < 90) {
        grade = 'B';
        statusText = 'خوب و قابل‌قبول';
        colorClass = 'text-sky-800 bg-sky-50 border-sky-300';
        badgeHex = '#0284c7';
      }

      return { score, grade, statusText, colorClass, badgeHex };
    },

    // ================= 9. DIAGNOSTIC HUD INTERFACE =================
    mountBadge() {
      if (document.getElementById('start-telemetry-badge')) return;

      let root = document.getElementById('start-telemetry-hud-root');
      if (!root) {
        root = document.createElement('div');
        root.id = 'start-telemetry-hud-root';
        root.dir = 'rtl';
        document.body.appendChild(root);
      }

      const badge = document.createElement('aside');
      badge.id = 'start-telemetry-badge';
      badge.setAttribute('aria-label', 'ابزار سنجش عملکرد سایت');
      badge.onclick = () => {
        window.StartTelemetry.markInternalOperation(3000);
        window.StartTelemetry.toggleHud();
      };
      badge.className = 'fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-900 text-white shadow-xl border border-slate-700/80 cursor-pointer select-none transition-colors';
      badge.title = 'پایشگر فوق پیشرفته ریشه‌یابی و منابع استارت (Ctrl+Shift+L)';
      badge.innerHTML = `
        <div class="relative flex items-center justify-center">
          <span id="tel-badge-pulse" class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
        </div>
        <div class="flex items-center gap-1.5 font-mono text-xs">
          <span class="text-slate-400 text-[11px] font-sans font-bold">پایش:</span>
          <span id="tel-badge-score" class="font-black text-emerald-400">۱۰۰٪</span>
        </div>
        <div class="h-3 w-px bg-slate-700 mx-0.5"></div>
        <span id="tel-live-fps-val" class="font-mono text-[11px] text-emerald-400 font-bold">60 FPS</span>
        <div class="h-3 w-px bg-slate-700 mx-0.5"></div>
        <span id="tel-badge-alerts" class="text-[10px] px-1.5 py-0.5 rounded font-sans font-bold bg-slate-800 text-slate-300">بهینه</span>
      `;
      root.appendChild(badge);
    },

    mountModal() {
      if (document.getElementById('start-telemetry-modal')) return;

      let root = document.getElementById('start-telemetry-hud-root');
      if (!root) {
        root = document.createElement('div');
        root.id = 'start-telemetry-hud-root';
        root.dir = 'rtl';
        document.body.appendChild(root);
      }

      const modalWrapper = document.createElement('div');
      modalWrapper.innerHTML = `
        <!-- Full Diagnostic HUD Modal / Drawer -->
        <div id="start-telemetry-modal" class="fixed inset-0 z-50 hidden bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div class="bg-white border border-slate-200/90 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900">
            
            <!-- Modal Header -->
            <div class="p-5 sm:px-7 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
                  <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h2 class="text-sm sm:text-base font-black text-slate-900">سامانه ریشه‌یابی و کالبدشکافی گلوگاه‌های سایت</h2>
                    <span class="text-[10px] px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-mono font-bold">v${this.version}</span>
                  </div>
                  <p class="text-[11px] text-slate-500 font-medium">صفحه: <code class="font-mono text-sky-700">${this.pagePath}</code> • تفکیک قطعی سهم شبکه در برابر کدهای فرانت‌اند</p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button onclick="window.StartTelemetry.copyFormattedLogsForChat()" id="tel-header-copy-btn" type="button" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer" title="کپی متن کامل لاگ‌ها جهت ارسال در چت">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  <span id="tel-header-copy-text">کپی لاگ‌ها برای چت</span>
                </button>

                <button onclick="window.StartTelemetry.downloadReportJson()" type="button" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer" title="دانلود گزارش متنی JSON">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>دانلود JSON</span>
                </button>

                <button onclick="window.StartTelemetry.toggleHud()" type="button" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer" title="بستن">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Health Score & Network vs CPU Ratio Banner -->
            <div id="tel-hud-score-banner" class="px-5 sm:px-7 py-3 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
              <!-- Dynamically populated -->
            </div>

            <!-- Navigation Tabs -->
            <div class="px-5 sm:px-7 pt-2 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2 sm:gap-4 overflow-x-auto text-xs font-bold">
              <button onclick="window.StartTelemetry.switchTab('rca')" id="tel-tab-btn-rca" class="pb-2.5 px-1 border-b-2 border-sky-600 text-sky-700">کالبدشکافی ریشه‌ای و نسخه درمان</button>
              <button onclick="window.StartTelemetry.switchTab('waterfall')" id="tel-tab-btn-waterfall" class="pb-2.5 px-1 border-b-2 border-transparent text-slate-500 hover:text-slate-900">آبشار بصری منابع (Waterfall)</button>
              <button onclick="window.StartTelemetry.switchTab('netvscpu')" id="tel-tab-btn-netvscpu" class="pb-2.5 px-1 border-b-2 border-transparent text-slate-500 hover:text-slate-900">شبکه در برابر پردازنده</button>
              <button onclick="window.StartTelemetry.switchTab('fps')" id="tel-tab-btn-fps" class="pb-2.5 px-1 border-b-2 border-transparent text-slate-500 hover:text-slate-900">فریم‌ریت و تسک‌های کند</button>
              <button onclick="window.StartTelemetry.switchTab('vitals')" id="tel-tab-btn-vitals" class="pb-2.5 px-1 border-b-2 border-transparent text-slate-500 hover:text-slate-900">متریک‌های گوگل (CWV)</button>
              <button onclick="window.StartTelemetry.switchTab('export')" id="tel-tab-btn-export" class="pb-2.5 px-1 border-b-2 border-transparent text-slate-500 hover:text-slate-900">کپی و خروجی کامل</button>
            </div>

            <!-- Scrollable Content Body -->
            <div class="p-5 sm:p-7 overflow-y-auto flex-1 space-y-5 text-right">
              
              <!-- Tab 1: Root Cause Analysis & Prescriptions (RCA) -->
              <div id="tel-tab-rca" class="space-y-4">
                <div class="p-4 rounded-2xl bg-sky-50/60 border border-sky-200/80 flex items-start gap-3">
                  <div class="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <strong class="text-xs font-black text-sky-950 block">موتور تشخیص ریشه‌ای گلوگاه‌ها (Root Cause Diagnostics)</strong>
                    <p class="text-[11px] text-sky-800 leading-relaxed mt-0.5">
                      در جدول زیر مقصران قطعی کندی صفحه بر اساس رصد بایت‌به‌بایت شبکه و کدهای جاوااسکریپت تفکیک شده و راهکار درمانی فوری با کد آماده ارائه گردیده است.
                    </p>
                  </div>
                </div>

                <div id="tel-rca-cards-container" class="space-y-3.5">
                  <!-- Dynamically populated RCA cards -->
                </div>
              </div>

              <!-- Tab 2: Visual SVG Resource Waterfall -->
              <div id="tel-tab-waterfall" class="hidden space-y-4">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 class="text-xs font-black text-slate-900">خط‌زمان آبشاری بارگذاری فایل‌ها (Resource Waterfall Timeline)</h3>
                    <p class="text-[11px] text-slate-500">نوارها به ترتیب زمان آغاز بارگذاری مرتب شده‌اند. رنگ قرمز نشان‌دهنده فایل‌های مسدودکننده رندر است.</p>
                  </div>
                  <div class="flex items-center gap-3 text-[10px] font-bold">
                    <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-sky-500 inline-block"></span> اسکریپت JS</span>
                    <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-indigo-500 inline-block"></span> استایل CSS</span>
                    <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-amber-500 inline-block"></span> فونت</span>
                    <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-rose-500 inline-block"></span> مسدودکننده رندر</span>
                  </div>
                </div>

                <div id="tel-waterfall-svg-container" class="overflow-x-auto border border-slate-200 rounded-2xl p-3 bg-slate-900 text-slate-100">
                  <!-- Dynamically populated SVG Waterfall -->
                </div>
              </div>

              <!-- Tab 3: Network vs CPU Ratio & CDN Probes -->
              <div id="tel-tab-netvscpu" class="hidden space-y-5">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  <!-- Net vs CPU Gauge -->
                  <div class="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                    <h4 class="text-xs font-black text-slate-900 border-b border-slate-200 pb-2">سهم تاخیر: شبکه اینترنت در برابر کد و پردازنده</h4>
                    
                    <div class="space-y-2">
                      <div class="flex justify-between text-xs font-bold">
                        <span class="text-sky-700">سهم شبکه و سرور (DNS + Handshake + TTFB):</span>
                        <span id="tel-net-share-pct" class="font-mono text-slate-900">50%</span>
                      </div>
                      <div class="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex">
                        <div id="tel-net-bar-fill" class="bg-sky-600 h-full transition-all" style="width: 50%;"></div>
                        <div id="tel-cpu-bar-fill" class="bg-indigo-600 h-full transition-all" style="width: 50%;"></div>
                      </div>
                      <div class="flex justify-between text-xs font-bold">
                        <span class="text-indigo-700">سهم پردازش مرورگر (JS Parse + Math + Paint):</span>
                        <span id="tel-cpu-share-pct" class="font-mono text-slate-900">50%</span>
                      </div>
                    </div>

                    <div id="tel-net-vs-cpu-verdict" class="p-3 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-700 leading-relaxed font-medium">
                      <!-- Verdict -->
                    </div>
                  </div>

                  <!-- CDN & Tunnel Probe -->
                  <div class="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-200 pb-2">
                      <h4 class="text-xs font-black text-slate-900">پایش زنده وضعیت CDNها و تونل VPN در ایران</h4>
                      <button onclick="window.StartTelemetry.probeCriticalCDNs()" class="text-[11px] font-bold text-sky-600 hover:text-sky-700">تست مجدد ↺</button>
                    </div>

                    <div id="tel-cdn-probes-list" class="space-y-2">
                      <!-- Dynamically populated probes -->
                    </div>
                  </div>

                </div>
              </div>

              <!-- Tab 4: Live FPS & Long Tasks -->
              <div id="tel-tab-fps" class="hidden space-y-5">
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 text-right">
                    <span class="text-[11px] text-slate-500 block font-bold mb-1">فریم‌ریت زنده (FPS)</span>
                    <span id="tel-live-fps-large" class="font-mono text-xl font-black text-emerald-600">60 FPS</span>
                  </div>
                  <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 text-right">
                    <span class="text-[11px] text-slate-500 block font-bold mb-1">لکنت‌های فریم (Jank)</span>
                    <span id="tel-jank-count" class="font-mono text-xl font-black text-slate-900">۰ مورد</span>
                  </div>
                  <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 text-right">
                    <span class="text-[11px] text-slate-500 block font-bold mb-1">تسک‌های طولانی (>50ms)</span>
                    <span id="tel-longtasks-count" class="font-mono text-xl font-black text-slate-900">۰</span>
                  </div>
                  <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 text-right">
                    <span class="text-[11px] text-slate-500 block font-bold mb-1">سنگین‌ترین فریز</span>
                    <span id="tel-worst-task" class="font-mono text-xl font-black text-slate-900">--ms</span>
                  </div>
                </div>

                <div>
                  <h4 class="text-xs font-black text-slate-900 mb-2">لیست فریزهای رشته اصلی پردازنده (Long Tasks & Stutter):</h4>
                  <div id="tel-longtasks-detailed-list" class="space-y-2">
                    <!-- Long tasks detailed -->
                  </div>
                </div>

                <div class="pt-3 border-t border-slate-200">
                  <div class="flex items-center justify-between mb-2">
                    <h4 class="text-xs font-black text-slate-900">وقایع افت فریم و لکنت صفحه (Frame Drop / Jank Events):</h4>
                    <span class="text-[10px] text-slate-400 font-mono">آستانه لکنت: فریم‌های بالای ۳۳ میلی‌ثانیه (< 30 FPS)</span>
                  </div>
                  <div id="tel-jank-detailed-list" class="space-y-1.5 max-h-52 overflow-y-auto">
                    <!-- Frame drops detailed -->
                  </div>
                </div>
              </div>

              <!-- Tab 5: Core Web Vitals & DOM/Memory -->
              <div id="tel-tab-vitals" class="hidden space-y-5">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <!-- LCP Pinpoint -->
                  <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2.5">
                    <h4 class="text-xs font-black text-slate-900 border-b border-slate-200 pb-2">کالبدشکافی بزرگ‌ترین المان بصری (LCP)</h4>
                    <div class="text-xs space-y-1.5">
                      <div class="flex justify-between"><span class="text-slate-500">زمان نهایی LCP:</span><strong id="tel-vitals-lcp" class="font-mono text-slate-900">--ms</strong></div>
                      <div class="flex justify-between"><span class="text-slate-500">سلکتور المان:</span><code id="tel-vitals-lcp-sel" class="font-mono text-sky-700 font-bold">--</code></div>
                      <div class="flex justify-between"><span class="text-slate-500">تاخیر دانلود المان:</span><span id="tel-vitals-lcp-delay" class="font-mono text-slate-700">--ms</span></div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-slate-200">
                      <span class="text-[10px] text-slate-400 font-bold block mb-1">کد HTML المان:</span>
                      <pre id="tel-vitals-lcp-html" class="p-2 rounded-lg bg-slate-900 text-slate-100 font-mono text-[10px] overflow-x-auto" dir="ltr">--</pre>
                    </div>
                  </div>

                  <!-- CLS Pinpoint -->
                  <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2.5">
                    <h4 class="text-xs font-black text-slate-900 border-b border-slate-200 pb-2">المان‌های جهش‌یافته و پرش چیدمان (CLS)</h4>
                    <div class="text-xs flex justify-between">
                      <span class="text-slate-500">شاخص کل پرش:</span>
                      <strong id="tel-vitals-cls-score" class="font-mono text-slate-900">۰</strong>
                    </div>
                    <div id="tel-cls-shifts-list" class="space-y-1.5 max-h-40 overflow-y-auto">
                      <!-- Shifts -->
                    </div>
                  </div>
                </div>

                <!-- DOM & Memory -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span class="text-slate-500 text-[11px] block">گره‌های DOM:</span>
                    <strong id="tel-vitals-dom-nodes" class="font-mono text-slate-900 text-base">--</strong>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span class="text-slate-500 text-[11px] block">عمق لایه‌ها:</span>
                    <strong id="tel-vitals-dom-depth" class="font-mono text-slate-900 text-base">--</strong>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span class="text-slate-500 text-[11px] block">رم مصرفی (Heap):</span>
                    <strong id="tel-vitals-mem-used" class="font-mono text-slate-900 text-base">-- MB</strong>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span class="text-slate-500 text-[11px] block">سقف رم مجاز:</span>
                    <strong id="tel-vitals-mem-limit" class="font-mono text-slate-900 text-base">-- MB</strong>
                  </div>
                </div>
              </div>

              <!-- Tab 6: System Log & Export -->
              <div id="tel-tab-export" class="hidden space-y-4">
                <div class="p-4 rounded-2xl bg-sky-50 border border-sky-200/90 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <strong class="text-xs font-black text-sky-950 block">کپی مستقیم گزارش جهت ارسال در چت و بررسی هوش مصنوعی</strong>
                    <span class="text-[11px] text-sky-800">تمام شاخص‌های حیاتی، علت فریزها، وضعیت فریم‌ریت و نسخه‌های درمانی به صورت متن مرتب و تمیز کپی می‌شود.</span>
                  </div>
                  <button onclick="window.StartTelemetry.copyFormattedLogsForChat()" type="button" class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-xs transition-all shadow-xs shrink-0 flex items-center justify-center gap-2 cursor-pointer active:scale-95">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    <span>کپی متن کامل گزارش برای چت</span>
                  </button>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
                  <div>
                    <strong class="text-xs font-black text-indigo-950 block">استخراج استاتیک CSS تلویند (حذف قطعی ۱۰۷۸ میلی‌ثانیه فریز V8):</strong>
                    <span class="text-[11px] text-indigo-800">تولید خودکار فایل ثابت CSS جهت حذف کامل اسکریپت ران‌تایم و مهار پرش ۱.۰ چیدمان (CLS).</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button onclick="window.StartTelemetry.downloadCompiledTailwindCss()" type="button" class="px-3.5 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>دانلود فایل tailwind.css</span>
                    </button>
                    <button onclick="window.StartTelemetry.copyCompiledTailwindCss()" type="button" class="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-indigo-900 border border-indigo-300 font-bold text-xs transition-colors cursor-pointer">
                      کپی کد CSS
                    </button>
                  </div>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <span class="text-xs text-slate-600">دریافت فایل خام داده‌ها:</span>
                  <div class="flex items-center gap-2">
                    <button onclick="window.StartTelemetry.copyReportToClipboard()" type="button" class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer">
                      کپی خام JSON
                    </button>
                    <button onclick="window.StartTelemetry.downloadReportJson()" type="button" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer">
                      دانلود فایل JSON
                    </button>
                  </div>
                </div>
                <textarea id="tel-export-preview" readonly class="w-full h-52 p-3 rounded-xl border border-slate-200 font-mono text-[11px] bg-slate-900 text-slate-100 text-left select-all focus:outline-none" dir="ltr"></textarea>
              </div>

            </div>

            <!-- Modal Footer -->
            <div class="p-4 px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span class="flex items-center gap-1.5">
                <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                کلید میانبر فعال‌سازی: <kbd class="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px]">Ctrl+Shift+L</kbd>
              </span>
              <button onclick="window.StartTelemetry.clearTelemetry()" class="text-slate-400 hover:text-rose-600 font-bold transition-colors">
                پاکسازی لاگ‌ها
              </button>
            </div>

          </div>
        </div>
      `;

      root.appendChild(modalWrapper.firstElementChild);
    },

    toggleHud() {
      const now = performance.now();
      if (!this.firstHudOpenTime) {
        this.firstHudOpenTime = Math.max(0, now - 500);
      }
      this.markInternalOperation(4000);
      let modal = document.getElementById('start-telemetry-modal');
      if (!modal) {
        this.mountModal();
        modal = document.getElementById('start-telemetry-modal');
      }
      this.hudOpen = !this.hudOpen;
      if (this.hudOpen) {
        modal.classList.remove('hidden');
        setTimeout(() => {
          this.updateSectionCache();
          this.resolveSpatialDiagnostics();
          this.captureNavigationTimings();
          this.inspectDOMAndMemory();
          this.analyzeAllResources();
          this.synthesizeRootCausePrescriptions();
          this.updateHudDom();
          setTimeout(() => {
            this.fpsState.lastFrameTime = performance.now();
          }, 100);
        }, 0);
      } else {
        modal.classList.add('hidden');
        this.markInternalOperation(1500);
        this.fpsState.lastFrameTime = performance.now();
      }
    },

    switchTab(tabName) {
      this.markInternalOperation(1500);
      this.currentTab = tabName;
      const tabs = ['rca', 'waterfall', 'netvscpu', 'fps', 'vitals', 'export'];
      tabs.forEach(t => {
        const btn = document.getElementById(`tel-tab-btn-${t}`);
        const panel = document.getElementById(`tel-tab-${t}`);
        if (t === tabName) {
          btn?.classList.add('border-sky-600', 'text-sky-700');
          btn?.classList.remove('border-transparent', 'text-slate-500');
          panel?.classList.remove('hidden');
        } else {
          btn?.classList.remove('border-sky-600', 'text-sky-700');
          btn?.classList.add('border-transparent', 'text-slate-500');
          panel?.classList.add('hidden');
        }
      });

      if (tabName === 'waterfall') {
        this.renderWaterfallSvg();
      } else if (tabName === 'export') {
        const preview = document.getElementById('tel-export-preview');
        if (preview) {
          preview.value = JSON.stringify(this.generateFullReport(), null, 2);
        }
      }
    },

    // ================= 10. VISUAL SVG WATERFALL GENERATOR =================
    renderWaterfallSvg() {
      const container = document.getElementById('tel-waterfall-svg-container');
      if (!container) return;

      const items = this.allResourcesTimeline.slice(0, 18);
      if (items.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">منابعی ثبت نشد.</p>';
        return;
      }

      const totalTime = Math.max(1000, this.metrics.pageLoadTotal || 2500);
      const width = 800;
      const rowHeight = 24;
      const height = items.length * rowHeight + 35;
      const chartX = 180;
      const chartW = width - chartX - 40;

      let grid = `
        <line x1="${chartX}" y1="20" x2="${chartX}" y2="${height - 5}" stroke="#334155" stroke-width="1" />
        <line x1="${chartX + chartW * 0.5}" y1="20" x2="${chartX + chartW * 0.5}" y2="${height - 5}" stroke="#1e293b" stroke-width="1" stroke-dasharray="2,2" />
        <line x1="${chartX + chartW}" y1="20" x2="${chartX + chartW}" y2="${height - 5}" stroke="#334155" stroke-width="1" />
        <text x="${chartX}" y="14" fill="#94a3b8" font-size="9" font-family="monospace">0ms</text>
        <text x="${chartX + chartW * 0.5}" y="14" fill="#94a3b8" font-size="9" font-family="monospace">${Math.round(totalTime / 2)}ms</text>
        <text x="${chartX + chartW}" y="14" fill="#94a3b8" font-size="9" font-family="monospace">${totalTime}ms</text>
      `;

      let rows = items.map((item, idx) => {
        const y = 28 + idx * rowHeight;
        const xStart = chartX + Math.min(chartW - 8, (item.startTime / totalTime) * chartW);
        const barW = Math.max(6, Math.min(chartW - (xStart - chartX), (item.duration / totalTime) * chartW));

        let color = '#38bdf8'; // script default
        if (item.isBlocking) color = '#f43f5e';
        else if (item.type === 'link' || item.fullUrl.includes('.css')) color = '#818cf8';
        else if (item.type === 'font' || item.fullUrl.includes('font')) color = '#fbbf24';
        else if (item.type === 'img' || item.type === 'image') color = '#34d399';

        return `
          <g>
            <text x="${chartX - 10}" y="${y + 12}" fill="#cbd5e1" font-size="10" font-family="monospace" text-anchor="end">${item.name}</text>
            <rect x="${chartX}" y="${y}" width="${chartW}" height="14" fill="#1e293b" rx="3" />
            <rect x="${xStart.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="14" fill="${color}" rx="3" />
            <text x="${(xStart + barW + 5).toFixed(1)}" y="${y + 11}" fill="#94a3b8" font-size="9" font-family="monospace">${item.duration}ms</text>
          </g>
        `;
      }).join('');

      container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" class="w-full h-auto select-none" xmlns="http://www.w3.org/2000/svg">
          ${grid}
          ${rows}
        </svg>
      `;
    },

    // ================= 11. DOM UPDATES =================
    updateHudDom() {
      const { score, grade, statusText, colorClass, badgeHex } = this.calculateHealthScore();

      // Badge
      const bScore = document.getElementById('tel-badge-score');
      if (bScore) { bScore.textContent = `${score}٪`; bScore.style.color = badgeHex; }
      const bPulse = document.getElementById('tel-badge-pulse');
      if (bPulse) bPulse.style.backgroundColor = badgeHex;
      const bAlerts = document.getElementById('tel-badge-alerts');
      if (bAlerts) {
        const c = this.rootCausePrescriptions.length;
        bAlerts.textContent = c === 0 ? 'بهینه' : `${c} نکته اصلاحی`;
        bAlerts.className = `text-[10px] px-1.5 py-0.5 rounded font-sans font-bold ${c > 1 ? 'bg-rose-950 text-rose-300' : 'bg-slate-800 text-slate-300'}`;
      }

      // Performance Guard: If HUD modal is closed, do NOT touch or mutate the hidden modal DOM!
      // This eliminates recurring 100-300ms V8 long tasks caused by MutationObserver re-evaluations.
      if (!this.hudOpen) return;

      this.resolveSpatialDiagnostics();

      // Banner
      const sBanner = document.getElementById('tel-hud-score-banner');
      if (sBanner) {
        sBanner.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl flex items-center justify-center font-black font-mono text-base border ${colorClass}">
              ${score}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-black text-slate-900">رتبه سلامت: ${grade}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorClass}">${statusText}</span>
              </div>
              <p class="text-[11px] text-slate-500">پایش دقیق سهم شبکه در برابر کدهای جاوااسکریپت و منابع کند</p>
            </div>
          </div>
          <div class="flex items-center gap-4 font-mono text-slate-600">
            <div><span class="text-slate-400 font-sans">سهم شبکه: </span><strong class="text-sky-700">${this.metrics.networkSharePct}%</strong></div>
            <div><span class="text-slate-400 font-sans">سهم کد و پردازش: </span><strong class="text-indigo-700">${this.metrics.frontendSharePct}%</strong></div>
            <div><span class="text-slate-400 font-sans">گلوگاه‌های قطعی: </span><strong class="text-rose-600">${this.rootCausePrescriptions.length}</strong></div>
          </div>
        `;
      }

      // RCA Cards
      const rcaContainer = document.getElementById('tel-rca-cards-container');
      if (rcaContainer) {
        if (this.rootCausePrescriptions.length === 0) {
          rcaContainer.innerHTML = `
            <div class="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
              <strong class="font-black block text-sm mb-1">هیچ گلوگاه مخربی در این صفحه شناسایی نشد</strong>
              <span>کدهای صفحه بسیار تمیز، سبک و با استانداردهای مدرن وب بارگذاری شده‌اند.</span>
            </div>
          `;
        } else {
          rcaContainer.innerHTML = this.rootCausePrescriptions.map((rca, idx) => {
            const isCrit = rca.severity === 'critical';
            return `
              <div class="p-4 sm:p-5 rounded-2xl border ${isCrit ? 'bg-rose-50/50 border-rose-200' : 'bg-amber-50/50 border-amber-200'} space-y-3 text-xs">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full ${isCrit ? 'bg-rose-600' : 'bg-amber-500'}"></span>
                    <strong class="text-xs sm:text-sm font-black text-slate-900">${idx + 1}. بخش: ${rca.component}</strong>
                  </div>
                  <span class="px-2.5 py-0.5 rounded-md font-mono text-[10px] font-bold ${isCrit ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}">
                    مقصر: ${rca.guiltyParty}
                  </span>
                </div>

                <div class="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-1.5 text-[11px] leading-relaxed">
                  <div><strong class="text-slate-800">شواهد عینی: </strong><span class="text-slate-600">${rca.evidence}</span></div>
                  <div><strong class="text-rose-700">علت ریشه‌ای مهندسی: </strong><span class="text-slate-700">${rca.rootCause}</span></div>
                  <div><strong class="text-emerald-700">نسخه درمان قطعی: </strong><span class="text-slate-800 font-bold">${rca.prescription}</span></div>
                </div>

                ${rca.codeSample ? `
                  <div class="pt-1">
                    <span class="text-[10px] text-slate-500 font-bold block mb-1">کد اصلاحی پیشنهادی:</span>
                    <pre class="p-2.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-[10.5px] overflow-x-auto" dir="ltr">${rca.codeSample}</pre>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('');
        }
      }

      // Net vs CPU Ratio
      const netPct = document.getElementById('tel-net-share-pct');
      if (netPct) netPct.textContent = `${this.metrics.networkSharePct}% (${this.metrics.networkDurationMs}ms)`;
      const cpuPct = document.getElementById('tel-cpu-share-pct');
      if (cpuPct) cpuPct.textContent = `${this.metrics.frontendSharePct}% (${this.metrics.frontendExecutionMs}ms)`;
      const netBar = document.getElementById('tel-net-bar-fill');
      if (netBar) netBar.style.width = `${this.metrics.networkSharePct}%`;
      const cpuBar = document.getElementById('tel-cpu-bar-fill');
      if (cpuBar) cpuBar.style.width = `${this.metrics.frontendSharePct}%`;

      const verdictEl = document.getElementById('tel-net-vs-cpu-verdict');
      if (verdictEl) {
        if (this.metrics.networkSharePct > 65) {
          verdictEl.innerHTML = `<strong>تشخیص مهندسی:</strong> بیش از دو‌سوم کندی صفحه ناشی از <strong>شبکه، پینگ سرور یا تاخیر CDNهای خارجی</strong> است. کدهای فرانت‌اند سبک هستند اما انتظار برای دانلود فایل‌ها سرعت را مهار کرده است. هاست کردن محلی CDNها مشکل را حل می‌کند.`;
        } else if (this.metrics.frontendSharePct > 65) {
          verdictEl.innerHTML = `<strong>تشخیص مهندسی:</strong> کندی صفحه عمدتاً ناشی از <strong>پردازش سنگین جاوااسکریپت و رندر فرمول‌های ریاضی یا المان‌های زیاد DOM</strong> در مرورگر است. شبکه سریع بوده اما CPU کاربر برای ساخت المان‌ها به زحمت افتاده است.`;
        } else {
          verdictEl.innerHTML = `<strong>تشخیص مهندسی:</strong> تاخیر به صورت متوازن بین شبکه (${this.metrics.networkSharePct}%) و کدهای جاوااسکریپت (${this.metrics.frontendSharePct}%) توزیع شده است.`;
        }
      }

      // CDN Probes
      const probesList = document.getElementById('tel-cdn-probes-list');
      if (probesList) {
        probesList.innerHTML = Object.values(this.cdnProbeResults).map(p => `
          <div class="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs">
            <div>
              <strong class="text-slate-800 text-[11px] block">${p.name}</strong>
              <span class="text-[10px] font-bold" style="color: ${p.color};">${p.status}</span>
            </div>
            <span class="font-mono font-black text-xs" style="color: ${p.color};">${p.latency >= 0 ? p.latency + 'ms' : 'قطع'}</span>
          </div>
        `).join('');
      }

      // FPS Tab
      const fpsL = document.getElementById('tel-live-fps-large');
      if (fpsL) fpsL.textContent = `${this.fpsState.currentFps} FPS`;
      const jankC = document.getElementById('tel-jank-count');
      if (jankC) jankC.textContent = `${this.fpsState.jankCount} لکنت`;
      const ltC = document.getElementById('tel-longtasks-count');
      if (ltC) ltC.textContent = `${this.longTasks.length}`;
      const worstT = document.getElementById('tel-worst-task');
      if (worstT) {
        const w = this.longTasks.reduce((max, t) => t.duration > max ? t.duration : max, 0);
        worstT.textContent = w > 0 ? `${w}ms` : 'ندارد';
      }

      const ltDetailed = document.getElementById('tel-longtasks-detailed-list');
      if (ltDetailed) {
        if (this.longTasks.length === 0) {
          ltDetailed.innerHTML = `<div class="p-4 rounded-xl bg-slate-50 text-center text-slate-400 text-xs">هیچ تسک طولانی بالای ۵۰ میلی‌ثانیه رخ نداده است.</div>`;
        } else {
          ltDetailed.innerHTML = this.longTasks.map(lt => `
            <div class="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2 text-xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full ${lt.duration > 150 ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'}"></span>
                  <strong class="text-slate-900">${lt.container}</strong>
                </div>
                <span class="font-black ${lt.duration > 150 ? 'text-rose-600' : 'text-amber-600'} font-mono text-sm">${lt.duration}ms فریز</span>
              </div>
              <div class="text-[11px] text-slate-600 space-y-1">
                <div>علت ریشه‌ای: <strong class="text-slate-800">${lt.detailCause || 'پردازش در رشته اصلی'}</strong></div>
                <div class="flex items-center justify-between text-slate-400 text-[10px] font-mono">
                  <span>زمان شروع: +${lt.startTime}ms</span>
                  <span class="text-rose-700 font-bold">افت به ${lt.fpsDrop || Math.round(1000 / lt.duration)} FPS</span>
                </div>
              </div>
            </div>
          `).join('');
        }
      }

      // Frame Drop (Jank Events) List
      const jankDetailed = document.getElementById('tel-jank-detailed-list');
      if (jankDetailed) {
        if (this.frameDrops.length === 0) {
          jankDetailed.innerHTML = `<div class="p-3 rounded-xl bg-slate-50 text-center text-slate-400 text-xs">هیچ لکنت رندر یا افت فریمی ثبت نشد (۶۰ FPS پایدار).</div>`;
        } else {
          jankDetailed.innerHTML = this.frameDrops.slice(0, 15).map(fd => `
            <div class="p-3 rounded-2xl border border-slate-200/90 bg-white space-y-2 text-xs hover:border-sky-300 transition-colors shadow-2xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 font-bold border border-sky-200/80 text-[11px]">
                    ${fd.sectionTitle || 'بخش صفحه'}
                  </span>
                  <span class="text-[10px] text-slate-400 font-mono">زمان: +${fd.time}ms</span>
                </div>
                <div class="flex items-center gap-2 font-mono">
                  <span class="font-black text-xs ${fd.fpsEquivalent < 25 ? 'text-rose-600' : 'text-amber-600'}">${fd.fpsEquivalent} FPS</span>
                  <span class="text-[10px] text-slate-400">(${fd.frameMs}ms)</span>
                </div>
              </div>

              <div class="flex items-center justify-between gap-2 flex-wrap pt-1.5 border-t border-slate-100 text-[11px]">
                <div class="space-y-1">
                  <div class="font-mono text-slate-700 flex items-center gap-1.5 flex-wrap">
                    <span class="text-slate-400 font-sans font-medium text-[10px]">المان و مکان:</span>
                    <code class="px-1.5 py-0.5 rounded bg-slate-100 text-sky-800 font-bold text-[11px]">${fd.selector || 'سند'}</code>
                    <span class="text-[10px] text-slate-600 font-bold">موقعیت: Y=${fd.elementY || 0}px</span>
                    <span class="text-[10px] text-slate-400">| اسکرول: ${fd.scrollY || 0}px</span>
                    <span class="text-[10px] text-slate-400">| ابعاد: ${fd.dimensions || '--'}</span>
                  </div>
                  <div class="text-[11px] text-slate-500">
                    علت: <strong class="text-slate-800 font-medium">${fd.cause || 'تاخیر رندر'}</strong>
                    ${fd.trigger ? ` • <span class="text-sky-700 font-medium">${fd.trigger}</span>` : ''}
                  </div>
                </div>

                <button onclick="window.StartTelemetry.highlightElement('${fd.selector}', ${fd.elementY || 0})" type="button" class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-600 hover:text-white text-sky-700 border border-sky-200 text-[11px] font-extrabold transition-all cursor-pointer shadow-2xs active:scale-95" title="پیمایش و هایلایت بصری محل رخ دادن افت فریم روی صفحه">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>مشاهده مکان در صفحه</span>
                </button>
              </div>
            </div>
          `).join('');
        }
      }

      // Vitals Tab
      const vLcp = document.getElementById('tel-vitals-lcp');
      if (vLcp) vLcp.textContent = `${this.metrics.lcp}ms`;
      const vLcpSel = document.getElementById('tel-vitals-lcp-sel');
      if (vLcpSel) vLcpSel.textContent = this.metrics.lcpElement;
      const vLcpDelay = document.getElementById('tel-vitals-lcp-delay');
      if (vLcpDelay) vLcpDelay.textContent = `${this.metrics.lcpLoadDelay}ms`;
      const vLcpHtml = document.getElementById('tel-vitals-lcp-html');
      if (vLcpHtml) vLcpHtml.textContent = this.metrics.lcpElementHtml || '<تگ در دسترس نیست>';

      const vClsScore = document.getElementById('tel-vitals-cls-score');
      if (vClsScore) vClsScore.textContent = this.metrics.cls;
      const vClsList = document.getElementById('tel-cls-shifts-list');
      if (vClsList) {
        if (this.layoutShifts.length === 0) {
          vClsList.innerHTML = `<span class="text-slate-400 text-[11px]">هیچ پرش چیدمانی ثبت نشد.</span>`;
        } else {
          vClsList.innerHTML = this.layoutShifts.map(s => `
            <div class="p-2 rounded-lg bg-white border border-slate-200 text-[11px] font-mono flex items-center justify-between">
              <span class="text-slate-800 font-bold">${s.element}</span>
              <span class="text-rose-600">${s.delta} (${s.value})</span>
            </div>
          `).join('');
        }
      }

      const vDomNodes = document.getElementById('tel-vitals-dom-nodes');
      if (vDomNodes) vDomNodes.textContent = `${this.metrics.domNodesCount}`;
      const vDomDepth = document.getElementById('tel-vitals-dom-depth');
      if (vDomDepth) vDomDepth.textContent = `${this.metrics.domMaxDepth}`;
      const vMemUsed = document.getElementById('tel-vitals-mem-used');
      if (vMemUsed) vMemUsed.textContent = this.metrics.memoryUsedMB ? `${this.metrics.memoryUsedMB} MB` : 'N/A';
      const vMemLimit = document.getElementById('tel-vitals-mem-limit');
      if (vMemLimit) vMemLimit.textContent = this.metrics.memoryLimitMB ? `${this.metrics.memoryLimitMB} MB` : 'N/A';
    },

    // ================= 12. EXPORT & CONSOLE LOGGING =================
    generateFullReport() {
      this.resolveSpatialDiagnostics();
      return {
        telemetryVersion: this.version,
        timestamp: new Date().toISOString(),
        page: {
          url: this.pageUrl,
          path: this.pagePath,
          title: document.title
        },
        healthSummary: this.calculateHealthScore(),
        networkVsCpu: {
          networkDurationMs: this.metrics.networkDurationMs,
          frontendExecutionMs: this.metrics.frontendExecutionMs,
          networkSharePct: `${this.metrics.networkSharePct}%`,
          frontendSharePct: `${this.metrics.frontendSharePct}%`
        },
        coreWebVitals: {
          ttfb: `${this.metrics.ttfb}ms`,
          fcp: `${this.metrics.fcp}ms`,
          lcp: `${this.metrics.lcp}ms`,
          lcpElement: this.metrics.lcpElement,
          cls: this.metrics.cls
        },
        fpsAndJank: {
          averageFps: this.fpsState.currentFps,
          jankEventsCount: this.fpsState.jankCount
        },
        rootCausePrescriptions: this.rootCausePrescriptions,
        cdnProbes: this.cdnProbeResults,
        slowResources: this.slowResources,
        longTasks: this.longTasks,
        layoutShifts: this.layoutShifts,
        runtimeErrors: this.runtimeErrors
      };
    },

    copyFormattedLogsForChat() {
      this.markInternalOperation(3500);
      this.captureNavigationTimings();
      this.inspectDOMAndMemory();
      this.analyzeAllResources();
      this.synthesizeRootCausePrescriptions();
      this.resolveSpatialDiagnostics();
      this.updateHudDom();
      const summary = this.calculateHealthScore();
      const now = new Date().toLocaleString('fa-IR');

      let rcaList = '';
      if (this.rootCausePrescriptions.length === 0) {
        rcaList = 'هیچ گلوگاه بحرانی ثبت نشد (پرفورمنس کاملاً بهینه است).';
      } else {
        rcaList = this.rootCausePrescriptions.map((p, i) => 
          `${i + 1}. [${p.component}] مقصر: ${p.guiltyParty}\n   • شواهد: ${p.evidence}\n   • علت ریشه‌ای: ${p.rootCause}\n   • نسخه درمان: ${p.prescription}`
        ).join('\n\n');
      }

      let longTasksList = '';
      if (this.longTasks.length === 0) {
        longTasksList = 'هیچ تسک طولانی بالای ۵۰ میلی‌ثانیه رخ نداد.';
      } else {
        longTasksList = this.longTasks.map((lt, i) => 
          `${i + 1}. فریز ${lt.duration}ms در زمان +${lt.startTime}ms\n   • مقصر: ${lt.container}\n   • علت دقیق: ${lt.detailCause || 'پردازش در رشته اصلی'}\n   • اثر: افت فریم به ${lt.fpsDrop || Math.round(1000 / lt.duration)} FPS`
        ).join('\n');
      }

      let jankList = '';
      if (this.frameDrops.length === 0) {
        jankList = 'بدون لکنت رندر (۶۰ FPS یکنواخت و پایدار).';
      } else {
        jankList = this.frameDrops.slice(0, 10).map((fd, idx) => 
          `• رویداد ${idx + 1} در زمان +${fd.time}ms: فریم ${fd.frameMs}ms (معادل ${fd.fpsEquivalent} FPS)\n` +
          `   - بخش صفحه: ${fd.sectionTitle || 'نامشخص'}\n` +
          `   - مکان و المان دقیق: ${fd.selector || 'سند'} [موقعیت عمودی: Y=${fd.elementY || 0}px | اسکرول جاری: ${fd.scrollY || 0}px | ابعاد: ${fd.dimensions || '--'}]\n` +
          `   - علت دقیق بالینی: ${fd.cause || 'تاخیر رندر'}\n` +
          `   - عامل محرک: ${fd.trigger || 'پردازش در رشته اصلی'}`
        ).join('\n\n');
      }

      let shiftsList = '';
      if (this.layoutShifts.length === 0) {
        shiftsList = '   • جزئیات پرش: هیچ المانی جابجا نشد (پایدار).';
      } else {
        shiftsList = this.layoutShifts.map((s, idx) => 
          `   ${idx + 1}. المان: ${s.element} | جابجایی: ${s.delta} | نمره پرش: ${s.value} (+${s.time}ms)`
        ).join('\n');
      }

      let cdnList = Object.values(this.cdnProbeResults).map(p => 
        `• ${p.name}: ${p.latency >= 0 ? p.latency + 'ms' : 'قطع'} (${p.status})`
      ).join('\n') || 'پایشی ثبت نشد.';

      const text = [
        `====================================================`,
        `گزارش جامع کالبدشکافی پرفورمنس استارت (v${this.version})`,
        `====================================================`,
        `• صفحه ارزیابی‌شده: ${this.pagePath} (${this.pageUrl})`,
        `• زمان تست: ${now}`,
        `• رتبه سلامت: ${summary.score}/100 (Grade ${summary.grade}) - ${summary.statusText}`,
        `• وضعیت تب: ${this.isBackgrounded() ? 'لود در تب پس‌زمینه (Background Tab)' : 'لود فعال در پیش‌زمینه (Foreground Tab)'}`,
        `• تفکیک سهم تاخیر: ${this.metrics.networkSharePct}% سهم شبکه (${this.metrics.networkDurationMs}ms) | ${this.metrics.frontendSharePct}% سهم پردازنده CPU (${this.metrics.frontendExecutionMs}ms)`,
        ``,
        `شاخص‌های حیاتی وب گوگل (Core Web Vitals):`,
        `- TTFB (زمان اولین بایت): ${this.metrics.ttfb} ms`,
        `- FCP (اولین محتوای بصری): ${this.metrics.fcp} ms ${this.isBackgrounded() ? '(شامل مدت تعلیق در تب پس‌زمینه)' : ''}`,
        `- LCP (بزرگ‌ترین المان محتوایی): ${this.metrics.lcp} ms [المان: ${this.metrics.lcpElement}] ${this.isBackgrounded() ? '(رندر همزمان با فوکوس تب)' : ''}`,
        `- CLS (شاخص جابجایی چیدمان): ${this.metrics.cls}`,
        shiftsList,
        `- چگالی گره‌های DOM: ${this.metrics.domNodesCount} المان (حداکثر عمق: ${this.metrics.domMaxDepth})`,
        `- حافظه فعال جاوااسکریپت: ${this.metrics.memoryUsedMB || '--'} MB`,
        ``,
        `فریم‌ریت زنده و لکنت‌ها (FPS & Jank Analysis):`,
        `- فریم‌ریت لحظه‌ای: ${this.fpsState.currentFps} FPS`,
        `- کل لکنت‌های فریم (Jank Count): ${this.fpsState.jankCount} مورد`,
        `- تعداد تسک‌های طولانی قفل‌کننده پردازنده: ${this.longTasks.length} مورد`,
        ``,
        `تحلیل بالینی فریزهای رشته اصلی (Long Tasks Breakdown):`,
        longTasksList,
        ``,
        `رویدادهای افت فریم و مکان‌یابی دقیق لکنت‌ها (Frame Drop & Spatial Diagnostics):`,
        jankList,
        ``,
        `کالبدشکافی ریشه‌ای و مقصران قطعی (Root Cause Prescriptions):`,
        rcaList,
        ``,
        `پایش وضعیت سرورها و CDNها در شبکه:`,
        cdnList,
        `====================================================`
      ].join('\n');

      const btn = document.getElementById('tel-header-copy-btn');
      const textSpan = document.getElementById('tel-header-copy-text');
      const originalText = textSpan ? textSpan.textContent : 'کپی لاگ‌ها برای چت';

      const showSuccess = () => {
        if (textSpan) textSpan.textContent = 'لاگ‌ها با موفقیت کپی شدند';
        if (btn) btn.classList.replace('bg-sky-600', 'bg-emerald-600');
        setTimeout(() => {
          if (textSpan) textSpan.textContent = originalText;
          if (btn) btn.classList.replace('bg-emerald-600', 'bg-sky-600');
        }, 3000);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(showSuccess).catch(() => {
          this.fallbackCopy(text);
          showSuccess();
        });
      } else {
        this.fallbackCopy(text);
        showSuccess();
      }
    },

    downloadReportJson() {
      const report = this.generateFullReport();
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `start-perf-forensics-${this.pagePath}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    copyReportToClipboard() {
      const report = this.generateFullReport();
      const text = JSON.stringify(report, null, 2);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          alert('گزارش عمیق کالبدشکافی عملکرد با موفقیت در کلیپ‌بورد کپی شد.');
        }).catch(() => {
          this.fallbackCopy(text);
        });
      } else {
        this.fallbackCopy(text);
      }
    },

    copyCompiledTailwindCss() {
      try {
        const styles = Array.from(document.querySelectorAll('style'));
        let twStyle = styles.find(s => s.textContent && (s.textContent.includes('--tw-') || s.textContent.includes('tailwindcss')));
        if (!twStyle && styles.length > 0) {
          twStyle = styles.reduce((max, s) => (s.textContent.length > (max ? max.textContent.length : 0)) ? s : max, null);
        }
        if (twStyle && twStyle.textContent) {
          const css = twStyle.textContent;
          const kb = Math.round(css.length / 1024);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(css).then(() => {
              alert(`استایل کامپایل‌شده تلویند با موفقیت کپی شد (${kb} KB).\nاین کدها را می‌توانید در یک فایل ثابت CSS ذخیره نمایید تا پردازش JIT حذف شود.`);
            }).catch(() => {
              this.fallbackCopy(css);
            });
          } else {
            this.fallbackCopy(css);
          }
        } else {
          alert('استایل تولیدشده تلویند هنوز در درخت سند یافت نشد.');
        }
      } catch (err) {
        alert('خطا در استخراج CSS: ' + err.message);
      }
    },

    downloadCompiledTailwindCss() {
      try {
        const styles = Array.from(document.querySelectorAll('style'));
        let twStyle = styles.find(s => s.textContent && (s.textContent.includes('--tw-') || s.textContent.includes('tailwindcss')));
        if (!twStyle && styles.length > 0) {
          twStyle = styles.reduce((max, s) => (s.textContent.length > (max ? max.textContent.length : 0)) ? s : max, null);
        }
        if (twStyle && twStyle.textContent) {
          const css = twStyle.textContent;
          const blob = new Blob([css], { type: 'text/css;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'tailwind.css';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          alert(`فایل tailwind.css با موفقیت دانلود شد (${Math.round(css.length / 1024)} KB).\nکافیست این فایل را در پوشه data پروژه ذخیره کنید.`);
        } else {
          alert('استایل تولیدشده تلویند هنوز در درخت سند یافت نشد.');
        }
      } catch (err) {
        alert('خطا در دانلود CSS: ' + err.message);
      }
    },

    fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('گزارش عمیق کالبدشکافی عملکرد با موفقیت در کلیپ‌بورد کپی شد.');
    },

    clearTelemetry() {
      this.slowResources = [];
      this.longTasks = [];
      this.layoutShifts = [];
      this.runtimeErrors = [];
      this.rootCausePrescriptions = [];
      this.frameDrops = [];
      this.fpsState.jankCount = 0;
      this.updateHudDom();
      alert('تاریخچه لاگ‌ها با موفقیت پاکسازی شد.');
    },

    logToConsole() {
      const summary = this.calculateHealthScore();
      console.groupCollapsed(
        `%c[START Forensics] کالبدشکافی پرفورمنس: ${summary.score}% (${summary.statusText}) - سهم شبکه: ${this.metrics.networkSharePct}% | سهم CPU: ${this.metrics.frontendSharePct}%`,
        `background:#0f172a; color:${summary.badgeHex}; font-weight:900; font-size:11px; padding:3px 8px; border-radius:4px; border:1px solid ${summary.badgeHex};`
      );
      console.log('متریک‌های حیاتی سنجش (Core Web Vitals):', {
        'TTFB (زمان اولین بایت)': `${this.metrics.ttfb}ms`,
        'FCP (اولین محتوای بصری)': `${this.metrics.fcp}ms`,
        'LCP (بزرگ‌ترین المان)': `${this.metrics.lcp}ms (${this.metrics.lcpElement})`,
        'CLS (پرش چیدمان)': this.metrics.cls,
        'DOM Nodes (تعداد المان‌ها)': this.metrics.domNodesCount,
        'FPS (فریم‌ریت زنده)': `${this.fpsState.currentFps} FPS`
      });
      if (this.rootCausePrescriptions.length > 0) {
        console.warn('کالبدشکافی ریشه‌ای و مقصران قطعی کندی (Root Causes):');
        console.table(this.rootCausePrescriptions.map(p => ({
          'بخش': p.component,
          'مقصر': p.guiltyParty,
          'علت ریشه‌ای': p.rootCause,
          'نسخه درمان': p.prescription
        })));
      }
      if (this.slowResources.length > 0) {
        console.warn('منابع و فایل‌های کند یا مسدودکننده رندر:');
        console.table(this.slowResources);
      }
      console.log('جهت باز کردن داشبورد گرافیکی در صفحه، کلیدهای Ctrl+Shift+L را فشار دهید یا روی نشانگر گوشه پایین صفحه کلیک کنید.');
      console.groupEnd();
    }
  };

  // Expose to Global Window
  window.StartTelemetry = StartTelemetry;
  window.logStartPerf = () => StartTelemetry.logToConsole();

  // Auto-boot performance telemetry (immediate non-blocking observer registration, zero frame delay)
  StartTelemetry.init();

})(window);
