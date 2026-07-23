/**
 * 活動結果送出與截圖上傳共用模組
 * 依賴：html2canvas（CDN）、window.ACTIVITY_CONFIG.GAS_URL
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

  function waitFrames(ms) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, ms);
        });
      });
    });
  }

  function collectIgnoreNodes(root) {
    const list = [];
    if (!root) return list;
    const scope = root.querySelectorAll
      ? root
      : document;
    scope.querySelectorAll('#upload-status, #upload-status-success, [data-capture-ignore]').forEach((n) => list.push(n));
    return list;
  }

  async function captureToBase64(el) {
    const target = el || document.body;
    const html2canvas = await ensureHtml2Canvas();

    // 等淡入動畫結束，避免截到半透明畫面
    await waitFrames(900);

    const ignored = collectIgnoreNodes(target);
    const ignoredPrev = ignored.map((n) => ({
      n,
      visibility: n.style.visibility
    }));
    ignored.forEach((n) => {
      n.style.visibility = 'hidden';
    });

    const prev = {
      animation: target.style.animation,
      opacity: target.style.opacity,
      transition: target.style.transition
    };
    target.classList.remove('fade-in', 'fade-enter', 'fade-enter-active');
    target.style.animation = 'none';
    target.style.transition = 'none';
    target.style.opacity = '1';

    await waitFrames(80);

    try {
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: Math.min(2, global.devicePixelRatio || 1.5),
        useCORS: true,
        allowTaint: true,
        logging: false,
        imageTimeout: 5000,
        onclone: (clonedDoc, clonedEl) => {
          const nodes = clonedDoc.querySelectorAll('body, body *');
          nodes.forEach((node) => {
            node.style.setProperty('opacity', '1', 'important');
            node.style.setProperty('animation', 'none', 'important');
            node.style.setProperty('transition', 'none', 'important');
            node.style.setProperty('filter', 'none', 'important');
            node.style.setProperty('-webkit-filter', 'none', 'important');
          });

          // 隱藏狀態列，避免「正在產生畫面截圖…」進圖
          clonedDoc
            .querySelectorAll('#upload-status, #upload-status-success, [data-capture-ignore]')
            .forEach((n) => n.remove());

          if (clonedEl) {
            clonedEl.style.setProperty('opacity', '1', 'important');
            clonedEl.style.setProperty('animation', 'none', 'important');
            clonedEl.style.setProperty('transform', 'none', 'important');
          }

          // 把結果區半透明底改成實色，提高對比
          clonedDoc.querySelectorAll('[class*="bg-orange-50"], [class*="bg-gray-50"]').forEach((n) => {
            n.style.setProperty('background-color', '#fff7ed', 'important');
          });
        }
      });
      return canvas.toDataURL('image/png');
    } finally {
      target.style.animation = prev.animation;
      target.style.opacity = prev.opacity;
      target.style.transition = prev.transition;
      ignoredPrev.forEach(({ n, visibility }) => {
        n.style.visibility = visibility;
      });
    }
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

      // 先截圖（不要先改狀態文字，避免被拍進去）
      let imageBase64 = '';
      try {
        imageBase64 = await captureToBase64(captureEl);
        notify('截圖完成，正在上傳…', 'loading');
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

      const body = JSON.stringify(payload);
      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body
        });
        const text = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}

        if (!res.ok) {
          notify(`送出失敗（HTTP ${res.status}）。請確認 GAS 部署為「任何人」可存取`, 'error');
          throw new Error(`GAS HTTP ${res.status}`);
        }
        if (parsed && parsed.ok === false) {
          notify(`後端錯誤：${parsed.error || '未知'}（請檢查試算表ID／資料夾ID）`, 'error');
          throw new Error(parsed.error || 'GAS returned ok:false');
        }
        notify('✅ 已送出：試算表與雲端硬碟截圖', 'success');
        return { ok: true, fileName, response: parsed };
      } catch (corsErr) {
        console.warn('[ActivitySubmit] cors 送出失敗，改試 no-cors', corsErr);
        await fetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body
        });
        notify('已送出（無法確認伺服器回應）。若試算表沒資料，請檢查 GAS 權限設定', 'warn');
        return { ok: true, fileName, unverified: true };
      }
    }
  };

  global.ActivitySubmit = ActivitySubmit;
})(window);
