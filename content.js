(function() {
    'use strict';

    // Geminiサイト上での自動送信処理（?q=... が付いていれば質問を送信）
    if (location.hostname === 'gemini.google.com') {
        const autoSubmit = () => {
            const params = new URLSearchParams(window.location.search);
            const query = params.get('q');
            if (!query) return;

            const timer = setInterval(() => {
                const inputField = document.querySelector('.ql-editor[contenteditable="true"]');
                const sendButton = document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]');

                if (inputField && sendButton) {
                    clearInterval(timer);
                    inputField.focus();
                    document.execCommand('insertText', false, query);

                    setTimeout(() => {
                        sendButton.click();
                        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                        window.history.replaceState({path: cleanUrl}, '', cleanUrl);
                    }, 300);
                }
            }, 500);
            setTimeout(() => clearInterval(timer), 10000);
        };

        if (document.readyState === 'complete') autoSubmit();
        else window.addEventListener('load', autoSubmit);
    }

    let mouseX = 0, mouseY = 0;

    // マウス位置を追跡
    window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }, { passive: true });

    // 単語を選択する共通関数
    function selectWord(x, y) {
        const active = document.activeElement;
        if (["INPUT", "TEXTAREA"].includes(active.tagName) || active.isContentEditable) return null;

        const sel = window.getSelection();
        const range = document.caretRangeFromPoint(x, y);

        if (range) {
            sel.removeAllRanges();
            sel.addRange(range);
            try {
                sel.modify('move', 'backward', 'word');
                sel.modify('extend', 'forward', 'word');
            } catch (e) {}
            return sel.toString().trim();
        }
        return null;
    }

    // クリック（mouseup）時の動作：選択のみ
    window.addEventListener('mouseup', (e) => {
        if (e.button === 0 && window.getSelection().isCollapsed) {
            setTimeout(() => selectWord(e.clientX, e.clientY), 10);
        }
    }, true);

    // キーボード操作
    window.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        // 入力フォーム等では無効化
        if (["INPUT", "TEXTAREA"].includes(active.tagName) || active.isContentEditable) return;

        const key = e.key.toLowerCase();

        // 既存の選択を優先し、なければマウス位置の単語を取得
        function getTargetWord() {
            let word = window.getSelection().toString().trim();
            if (!word) word = selectWord(mouseX, mouseY);
            return word;
        }

        // 【wキー】検索（選択範囲があればそれを優先、なければマウス位置の単語）
        if (key === 'w') {
            const word = getTargetWord();
            if (word && word.length > 0) {
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(word)}`;
                window.open(searchUrl, '_blank');
            }
        }

        // 【eキー】Geminiで「<単語> とは？」を質問（自動送信）
        if (key === 'e') {
            const word = getTargetWord();
            if (word) {
                const prompt = `${word} とは？`;
                window.open(`https://gemini.google.com/app?q=${encodeURIComponent(prompt)}`, '_blank');
            }
        }

        // 【qキー】タブを閉じる（元のwから変更）
        if (key === 'q') {
            if (chrome.runtime && chrome.runtime.id) {
                chrome.runtime.sendMessage({action: "close_active_tab"});
            }
        }

        // 【dキー】Geminiを新しいポップアップウィンドウで開く
        if (key === 'd') {
            if (chrome.runtime && chrome.runtime.id) {
                chrome.runtime.sendMessage({
                    action: "open_gemini_window",
                    screenHeight: window.screen.availHeight
                });
            }
        }
    }, true);
})();