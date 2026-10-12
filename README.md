# 去背實驗室

用一個可互動的靜態網站，說明綠幕、洋紅幕、藍幕和一般照片背景，分別適合怎麼去背。

網站：<https://yazelin.github.io/cutout-lab/>

## 可以做什麼

- 切換綠幕、洋紅幕、藍幕和自訂幕色。
- 載入本機圖片，或切換七張 B2 洋紅幕參考素材。
- 比較 RGB 色差、通道優勢加 alpha 估算，以及只清除連到邊界的幕色。
- 調整容差、邊緣去溢色和侵蝕，並檢查透明像素分布。
- 用不同底色觀察髒邊、半透明髮絲和誤刪的主體細節。

載入的圖片只在瀏覽器記憶體中處理，不會上傳。

## 內容範圍

色鍵去背利用前景和幕色的差異估算 alpha。色差門檻容易理解、運算快速；通道優勢和覆蓋率估算能保留柔邊；從畫面邊界追蹤連通區域，則可能保住主體內封閉的同色細節。這些方法都不能安全拆開「顏色相同而且碰在一起」的前景和背景。

一般照片、漸層背景或主體撞色，通常要改用主體分割、AI 遮罩或人工遮罩。綠、洋紅、藍沒有固定的優劣順序；幕色要避開主體顏色，且背景要夠均勻。

通道優勢分數會隨幕色改變：綠幕看 G − max(R, B)，洋紅幕看 min(R, B) − G，藍幕看 B − max(R, G)。分數越高，像素越偏向該幕色。混色像素可用 α ≈ 1 − score(像素) / score(純幕) 估算主體覆蓋率；這只在主體本身不帶相同色偏、幕色取樣可靠時近似成立。實際專案還要處理邊界連通、幕色溢出、侵蝕、縮放和驗收。

互動頁以七張洋紅幕參考圖呈現姿勢、髮絲、衣袖、小碎片和人物比例帶來的差異；它用來解說算法取捨，並非任何一個專案程式碼的逐像素重現。綠幕、洋紅幕、藍幕的效果要依素材顏色比較；畫面中有綠色服飾與葉片，也能觀察把幕色選錯時主體細節如何受影響。實際案例請看：

- [cutout-skill](https://github.com/yazelin/cutout-skill)：綠／洋紅自動判幕；藍、青、黃等第三色明確指定；另有 alpha 估算、邊界連通、despill、縮放後驗收。
- [line-sticker-studio](https://github.com/yazelin/line-sticker-studio)：貼圖工作流程與逐張參數調整。
- [bye-bg](https://github.com/yazelin/bye-bg)：單色背景走色鍵，一般照片走瀏覽器端 AI 遮罩。
- [ai-sticker-starter](https://github.com/yazelin/ai-sticker-starter)：從綠幕九宮格比較簡易門檻與完整處理流程。

## 本機預覽

不需要安裝套件或建置工具。進入專案資料夾後執行：

    python3 -m http.server 8000

在瀏覽器開啟 <http://localhost:8000/>。

## GitHub Pages

此 repo 用 GitHub Actions 將根目錄部署到 GitHub Pages。推送至 main 後，Actions 會發布網站；也可以在 Actions 頁面手動執行 Deploy Pages。

## 授權

MIT License，詳見 [LICENSE](LICENSE)。
