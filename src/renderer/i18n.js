/*
 * Screen language: English or Simplified Chinese.
 *
 * The English text is the key. App.t('...') returns the Chinese text from
 * zh.js when Chinese is chosen (falls back to English if a line is missing).
 *   {name}    is filled in from vars
 *   **text**  is shown in bold (App.tx only)
 * Keys must be plain '...' strings so test/i18n.test.js can check that every
 * key has a Chinese line.
 *
 * Printouts stay in English (same format as the HQ report).
 */
(function () {
  'use strict';
  const I18N = { lang: 'en', zh: {} };
  window.I18N = I18N;

  function pick(key) {
    return (I18N.lang === 'zh' && I18N.zh[key]) || key;
  }
  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
  }

  // plain text
  I18N.t = function (key, vars) {
    return fill(pick(key), vars);
  };

  // text with **bold** parts; vars may also be elements (buttons, links, ...)
  I18N.tx = function (key, vars) {
    const out = [];
    const parts = pick(key).split(/(\*\*[^*]+\*\*|\{\w+\})/);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('**')) {
        const b = document.createElement('b');
        b.textContent = fill(part.slice(2, -2), vars);
        out.push(b);
      } else if (/^\{\w+\}$/.test(part)) {
        const v = vars ? vars[part.slice(1, -1)] : undefined;
        if (v instanceof Node) out.push(v);
        else out.push(document.createTextNode(v === undefined ? part : String(v)));
      } else {
        out.push(document.createTextNode(fill(part, vars)));
      }
    }
    return out;
  };

  // small Chinese word under the English column codes (TOTAL, SHOP, S.OUT ...)
  const COLS = {
    CODE: '代码', BRAND: '品牌', PRODUCT: '产品', TOTAL: '总数', SHOP: '店内', KEEP: '保留', RP: '维修',
    DEP: '订金', 'TF IN': '调入', 'TF OUT': '调出', IN: '进货', 'S.OUT': '售出', OUT: '售出', BAL: '余额',
    DATE: '日期', SALE: '销售', CARD: '刷卡', CASH: '现金', 'BANK IN DATE': '存款日期', 'BANK IN (RM)': '存款',
  };
  I18N.colSub = function (code) {
    return I18N.lang === 'zh' ? COLS[code] || null : null;
  };
})();
