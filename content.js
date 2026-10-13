(function() {
    'use strict';

    // Geminiサイト上での自動送信処理（?q=... が付いていれば質問を送信）
    if (location.hostname === 'gemini.google.com') {
        // SPAが後からURLを書き換えてクエリを消すことがあるため、document_start時点で確保しておく
        const initialQuery = new URLSearchParams(window.location.search).get('q');

        // 送信ボタンを段階的に探す。
        // 注意: aria-label の部分一致だけに頼ると、サイドバーの履歴タイトルに
        // 「送信」を含むチャットがあった場合にそのメニューボタンへ誤マッチする。
        const findSendButton = (inputField) => {
            // 1) 既知の正確なラベル（日/英）
            const exact = document.querySelector(
                'button[aria-label="プロンプトを送信"], button[aria-label="Send message"], button[aria-label="Submit"]'
            );
            if (exact) return exact;

            // 2) 入力欄の近くのコンテナ内に限定して部分一致（履歴メニュー等を除外）
            let scope = inputField;
            for (let i = 0; i < 6 && scope; i++) {
                const candidates = scope.querySelectorAll('button[aria-label*="送信"], button[aria-label*="Send"], button[aria-label*="send"]');
                for (const b of candidates) {
                    const label = b.getAttribute('aria-label') || '';
                    if (!label.includes('オプション') && !/option/i.test(label)) return b;
                }
                scope = scope.parentElement;
            }

            // 3) send アイコンを持つボタン
            const icon = document.querySelector('button mat-icon[fonticon="send"], button [data-mat-icon-name="send"]');
            if (icon) return icon.closest('button');

            return null;
        };

        const autoSubmit = () => {
            const query = initialQuery;
            if (!query) return;

            const getEditor = () => document.querySelector(
                '.ql-editor[contenteditable="true"], rich-textarea [contenteditable="true"], [contenteditable="true"][role="textbox"], [contenteditable="true"]'
            );

            // 送信済みかどうか: 送信されるとエディタが空になり、URLが /app/<chatId> に変わる
            const isSubmitted = (inputField) =>
                /\/app\/[0-9a-f]+/.test(location.pathname) ||
                (inputField && inputField.isConnected && inputField.innerText.trim() === '');

            // 挿入→送信ボタン待ち→クリック→送信確認。失敗したらクリアして最初からやり直す。
            // ページ初期化の早い段階で挿入すると、見た目上は文字が入っても
            // エディタ(Quill)の内部状態に反映されず送信ボタンが出現しないことがあるため、
            // 「送信を確認できるまでリトライ」する構造にしている。
            let attempts = 0;
            const MAX_ATTEMPTS = 6;

            const pressEnter = (inputField) => {
                inputField.focus();
                const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
                inputField.dispatchEvent(new KeyboardEvent('keydown', opts));
                inputField.dispatchEvent(new KeyboardEvent('keyup', opts));
            };

            const attempt = () => {
                attempts++;
                // UIが要素を差し替えることがあるため、試行のたびにエディタを取り直す
                const inputField = getEditor();
                if (!inputField) {
                    if (attempts < MAX_ATTEMPTS) setTimeout(attempt, 1000);
                    return;
                }
                // ピル型UI等、クリックで本来のエディタに切り替わる場合に備えて一度クリック
                inputField.click();
                inputField.focus();
                // 前回試行の残りをクリアしてから入れ直す（入力イベントを再発火させる）
                window.getSelection().selectAllChildren(inputField);
                document.execCommand('delete', false, null);
                document.execCommand('insertText', false, query);

                const start = Date.now();
                let clicked = false;
                const btnTimer = setInterval(() => {
                    if (isSubmitted(inputField)) {
                        clearInterval(btnTimer);
                        return;
                    }
                    if (!inputField.isConnected) {
                        // エディタ要素が差し替えられた → 新しい要素で最初からやり直す
                        clearInterval(btnTimer);
                        if (attempts < MAX_ATTEMPTS) attempt();
                        return;
                    }
                    if (!clicked) {
                        const sendButton = findSendButton(inputField);
                        if (sendButton && !sendButton.disabled && sendButton.getAttribute('aria-disabled') !== 'true') {
                            sendButton.click();
                            clicked = true;
                            return;
                        }
                    }
                    if (Date.now() - start > 2500) {
                        clearInterval(btnTimer);
                        // ボタンが見つからないUIかもしれないので、途中からはEnter送信も並行して試す
                        if (attempts >= 3) pressEnter(inputField);
                        if (attempts < MAX_ATTEMPTS && !isSubmitted(inputField)) {
                            attempt();
                        }
                    }
                }, 250);
            };

            // エディタが見つかり次第、即座に試行を開始する。
            // 「初期化完了を示す要素を待つ」ようなゲートは置かない——UIバリエーションで
            // その要素が存在しないと永遠に発火しなくなるため。早すぎた挿入はリトライで回収する。
            const waitTimer = setInterval(() => {
                if (!getEditor()) return;
                clearInterval(waitTimer);

                // クエリは確保済みなので、URLは先に綺麗にしておく
                const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({path: cleanUrl}, '', cleanUrl);

                // 初期化直後の挿入は取りこぼされやすいので少し置いてから
                setTimeout(attempt, 500);
            }, 300);
            setTimeout(() => clearInterval(waitTimer), 20000);
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