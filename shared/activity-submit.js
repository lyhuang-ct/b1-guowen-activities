/**
 * 活動結果送出與截圖上傳共用模組
 * 依賴：html2canvas（CDN）、window.ACTIVITY_CONFIG.GAS_URL
 *
 * 用法：
 *   ActivitySubmit.saveStudent({ className, seat, name })
 *   await ActivitySubmit.submit({
 *     activityId: 'B1L1',
 *     activityName: '尋找你的專屬桃花源',
 *     result: '繁華都會客',
 *     extra: '選填補充',
 *     captureEl: document.getElementById('result-section')
 *   })
 */
(function (global) {
  const student = { className: '', seat: '', name: '' };

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function yyyymmdd(d) {
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  }

  function sanitizeFilePart(s) {
    return String(s || '')
      .trim()
      .replace(/[\\/:*?"<>|\s]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || '未知';
  }

  function buildFileName(activityName) {
    const d = yyyymmdd(new Date());
    return [
      sanitizeFilePart(student.className),
      sanitizeFilePart(student.seat),
      sanitizeFilePart(activityName),
      sanitizeFilePart(student.name),
      d
    ].join('_') + '.png';
  }

  function ensureHtml2Canvas() {
    if (global.html2canvas) return Promise.resolve(global.html2canvas);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = () => resolve(global.html2canvas);
      s.onerror = () => reject(new Error('html2canvas 載入失敗'));
      document.head.appendChild(s);
    });
  }

  async function captureToBase64(el) {
    const target = el || document.body;
    const html2canvas = await ensureHtml2Canvas();
    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: Math.min(2, global.devicePixelRatio || 1.5),
      useCORS: true,
      logging: false,
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight
    });
    return canvas.toDataURL('image/png');
  }

  function getGasUrl() {
    const cfg = global.ACTIVITY_CONFIG || {};
    return (cfg.GAS_URL || '').trim();
  }

  const ActivitySubmit = {
    saveStudent({ className, seat, name }) {
      student.className = String(className || '').trim();
      student.seat = String(seat || '').trim();
      student.name = String(name || '').trim();
      return { ...student };
    },

    getStudent() {
      return { ...student };
    },

    isStudentReady() {
      return !!(student.className && student.seat && student.name);
    },

    /**
     * 截圖結果畫面 → 上傳雲端硬碟 → 寫入試算表對應工作表
     */
    async submit({
      activityId,
      activityName,
      result,
      extra = '',
      captureEl = null,
      onStatus = null
    }) {
      const notify = (msg, kind) => {
        if (typeof onStatus === 'function') onStatus(msg, kind);
      };

      if (!this.isStudentReady()) {
        notify('請先填寫班級、座號、姓名', 'error');
        throw new Error('學生資料未填寫');
      }

      const fileName = buildFileName(activityName);
      notify('正在產生畫面截圖…', 'loading');

      let imageBase64 = '';
      try {
        imageBase64 = await captureToBase64(captureEl);
      } catch (err) {
        console.error(err);
        notify('截圖失敗，仍會嘗試寫入試算表', 'warn');
      }

      const payload = {
        action: 'submitActivity',
        answeredAt: new Date().toISOString(),
        className: student.className,
        seat: student.seat,
        name: student.name,
        activityId: activityId || '',
        activityName: activityName || '',
        result: result || '',
        extra: extra || '',
        fileName,
        imageBase64
      };

      const gasUrl = getGasUrl();
      if (!gasUrl) {
        console.log('[ActivitySubmit] 尚未設定 GAS_URL，本機模擬送出：', {
          ...payload,
          imageBase64: imageBase64 ? `(${Math.round(imageBase64.length / 1024)} KB base64)` : ''
        });
        notify('已完成本機模擬（尚未連線雲端紀錄）', 'warn');
        return { ok: true, simulated: true, fileName };
      }

      notify('正在上傳截圖並寫入試算表…', 'loading');

      // 使用 text/plain 避免部分環境的 CORS preflight；GAS 仍可從 postData 讀取
      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      notify('✅ 已送出：試算表與雲端硬碟截圖', 'success');
      return { ok: true, fileName };
    }
  };

  global.ActivitySubmit = ActivitySubmit;
})(window);
