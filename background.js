// content.jsからのメッセージを受け取って処理する
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "close_active_tab") {
        // 命令を送ってきたタブ（自分自身）を閉じる
        chrome.tabs.remove(sender.tab.id);
    }

    if (message.action === "open_gemini_window") {
        const screenHeight = message.screenHeight || 1080;
        const windowWidth = 600;
        chrome.windows.create({
            url: "https://gemini.google.com/",
            type: "popup",
            left: 0,
            top: 0,
            width: windowWidth,
            height: screenHeight
        });
    }
});