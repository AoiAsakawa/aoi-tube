package controllers

import (
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/aoiasakawa/aoitube/models"
)

// The post-payment redirect pages (PayPay/Stripe/PayPal) are server-rendered
// outside the web app's i18n stack, so they carry their own small string
// catalog and negotiate the language from the Accept-Language header. The
// languages mirror the web app's supported locales, with English as the
// fallback for the internationally generic platform.
var paymentPageStrings = map[string]map[string]string{
	"en": {
		"title.success":       "Purchase complete",
		"title.error":         "Error",
		"title.pending":       "Pending confirmation",
		"title.cancelled":     "Cancelled",
		"msg.thanksSuperchat": "Thank you for your Super Chat purchase!",
		"msg.thanksEffect":    "Thank you for purchasing a screen effect!",
		"msg.thanksArchive":   "Thank you for purchasing archive access!",
		"msg.fetchFailed":     "Failed to retrieve payment information.",
		"msg.notFound":        "Payment information not found.",
		"msg.confirmFailed":   "Failed to confirm the payment.",
		"msg.captureFailed":   "Failed to finalize the payment.",
		"msg.notCompleted":    "The payment has not been completed.",
		"msg.cancelled":       "The payment was cancelled.",
		"note.returnToStream": "You can close this tab and return to the stream page.",
		"note.autoReflect":    "Your purchase will be applied automatically.",
		"button.close":        "Close this tab",
	},
	"ja": {
		"title.success":       "ご購入完了",
		"title.error":         "エラー",
		"title.pending":       "確認中",
		"title.cancelled":     "キャンセル",
		"msg.thanksSuperchat": "スーパーチャットのご購入ありがとうございます！",
		"msg.thanksEffect":    "画面演出のご購入ありがとうございます！",
		"msg.thanksArchive":   "アーカイブのご購入ありがとうございます！",
		"msg.fetchFailed":     "決済情報の取得に失敗しました",
		"msg.notFound":        "決済情報が見つかりません",
		"msg.confirmFailed":   "決済の確認に失敗しました",
		"msg.captureFailed":   "決済の確定に失敗しました",
		"msg.notCompleted":    "決済が完了していません",
		"msg.cancelled":       "決済がキャンセルされました",
		"note.returnToStream": "このタブを閉じて、配信ページに戻ってください。",
		"note.autoReflect":    "ご購入内容は自動的に反映されます。",
		"button.close":        "このタブを閉じる",
	},
	"zh": {
		"title.success":       "购买完成",
		"title.error":         "错误",
		"title.pending":       "确认中",
		"title.cancelled":     "已取消",
		"msg.thanksSuperchat": "感谢您购买超级留言！",
		"msg.thanksEffect":    "感谢您购买画面特效！",
		"msg.thanksArchive":   "感谢您购买存档观看权限！",
		"msg.fetchFailed":     "获取支付信息失败",
		"msg.notFound":        "未找到支付信息",
		"msg.confirmFailed":   "确认支付失败",
		"msg.captureFailed":   "完成支付失败",
		"msg.notCompleted":    "支付尚未完成",
		"msg.cancelled":       "支付已取消",
		"note.returnToStream": "请关闭此标签页并返回直播页面。",
		"note.autoReflect":    "您的购买将自动生效。",
		"button.close":        "关闭此标签页",
	},
	"zh-TW": {
		"title.success":       "購買完成",
		"title.error":         "錯誤",
		"title.pending":       "確認中",
		"title.cancelled":     "已取消",
		"msg.thanksSuperchat": "感謝您購買超級留言！",
		"msg.thanksEffect":    "感謝您購買畫面特效！",
		"msg.thanksArchive":   "感謝您購買存檔觀看權限！",
		"msg.fetchFailed":     "取得付款資訊失敗",
		"msg.notFound":        "找不到付款資訊",
		"msg.confirmFailed":   "確認付款失敗",
		"msg.captureFailed":   "完成付款失敗",
		"msg.notCompleted":    "付款尚未完成",
		"msg.cancelled":       "付款已取消",
		"note.returnToStream": "請關閉此分頁並返回直播頁面。",
		"note.autoReflect":    "您的購買將自動生效。",
		"button.close":        "關閉此分頁",
	},
	"ko": {
		"title.success":       "구매 완료",
		"title.error":         "오류",
		"title.pending":       "확인 중",
		"title.cancelled":     "취소됨",
		"msg.thanksSuperchat": "슈퍼챗을 구매해 주셔서 감사합니다!",
		"msg.thanksEffect":    "화면 연출을 구매해 주셔서 감사합니다!",
		"msg.thanksArchive":   "아카이브 시청 권한을 구매해 주셔서 감사합니다!",
		"msg.fetchFailed":     "결제 정보를 가져오지 못했습니다",
		"msg.notFound":        "결제 정보를 찾을 수 없습니다",
		"msg.confirmFailed":   "결제 확인에 실패했습니다",
		"msg.captureFailed":   "결제 확정에 실패했습니다",
		"msg.notCompleted":    "결제가 완료되지 않았습니다",
		"msg.cancelled":       "결제가 취소되었습니다",
		"note.returnToStream": "이 탭을 닫고 방송 페이지로 돌아가세요.",
		"note.autoReflect":    "구매 내용은 자동으로 반영됩니다.",
		"button.close":        "이 탭 닫기",
	},
}

// negotiatePaymentPageLanguage picks the best supported page language from the
// request's Accept-Language header, defaulting to English.
func negotiatePaymentPageLanguage(r *http.Request) string {
	type candidate struct {
		tag string
		q   float64
	}
	var candidates []candidate
	for _, part := range strings.Split(r.Header.Get("Accept-Language"), ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		tag := part
		q := 1.0
		if idx := strings.Index(part, ";"); idx >= 0 {
			tag = strings.TrimSpace(part[:idx])
			if qi := strings.Index(part[idx:], "q="); qi >= 0 {
				if v, err := strconv.ParseFloat(strings.TrimSpace(part[idx+qi+2:]), 64); err == nil {
					q = v
				}
			}
		}
		candidates = append(candidates, candidate{strings.ToLower(tag), q})
	}
	sort.SliceStable(candidates, func(a, b int) bool { return candidates[a].q > candidates[b].q })

	for _, c := range candidates {
		switch {
		case c.tag == "ja" || strings.HasPrefix(c.tag, "ja-"):
			return "ja"
		case c.tag == "ko" || strings.HasPrefix(c.tag, "ko-"):
			return "ko"
		// Traditional Chinese regions/scripts map to zh-TW; everything else
		// under zh (zh-CN, zh-Hans, zh-SG, ...) maps to Simplified.
		case c.tag == "zh-tw" || c.tag == "zh-hk" || c.tag == "zh-mo" || strings.HasPrefix(c.tag, "zh-hant"):
			return "zh-TW"
		case c.tag == "zh" || strings.HasPrefix(c.tag, "zh-"):
			return "zh"
		case c.tag == "en" || strings.HasPrefix(c.tag, "en-"):
			return "en"
		}
	}
	return "en"
}

// paymentPageString resolves a catalog string with English fallback.
func paymentPageString(lang, key string) string {
	if s, ok := paymentPageStrings[lang][key]; ok {
		return s
	}
	return paymentPageStrings["en"][key]
}

// successMessageKeyForItem returns the thanks-message key matching the
// purchased item type.
func successMessageKeyForItem(itemType string) string {
	switch itemType {
	case models.DonationItemEffect:
		return "msg.thanksEffect"
	case models.DonationItemArchive:
		return "msg.thanksArchive"
	default:
		return "msg.thanksSuperchat"
	}
}

// renderPaymentResultPage renders the shared post-payment result page used by
// the PayPay, Stripe and PayPal redirect handlers. provider is the payment
// brand shown in the document title, successColor its brand color; all
// user-visible strings come from the built-in catalog (never from request
// input), keyed by messageKey.
func renderPaymentResultPage(w http.ResponseWriter, r *http.Request, provider, successColor, status, messageKey string) {
	lang := negotiatePaymentPageLanguage(r)

	var bgColor, icon, titleKey string
	switch status {
	case "success":
		bgColor = successColor
		icon = "✓"
		titleKey = "title.success"
	case "error":
		bgColor = "#f44336"
		icon = "✕"
		titleKey = "title.error"
	case "cancelled":
		bgColor = "#757575"
		icon = "✕"
		titleKey = "title.cancelled"
	default:
		bgColor = "#FF9800"
		icon = "!"
		titleKey = "title.pending"
	}

	title := paymentPageString(lang, titleKey)
	message := paymentPageString(lang, messageKey)

	html := `<!DOCTYPE html>
<html lang="` + lang + `">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>` + title + ` - ` + provider + `</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: linear-gradient(135deg, ` + bgColor + ` 0%, ` + bgColor + `dd 100%);
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			color: white;
		}
		.container {
			text-align: center;
			padding: 40px;
			background: rgba(255,255,255,0.1);
			border-radius: 20px;
			backdrop-filter: blur(10px);
			max-width: 400px;
			margin: 20px;
		}
		.icon {
			width: 80px;
			height: 80px;
			border-radius: 50%;
			background: white;
			color: ` + bgColor + `;
			font-size: 40px;
			display: flex;
			align-items: center;
			justify-content: center;
			margin: 0 auto 20px;
			font-weight: bold;
		}
		h1 { font-size: 24px; margin-bottom: 10px; }
		p { font-size: 16px; opacity: 0.9; margin-bottom: 20px; }
		.note {
			font-size: 14px;
			opacity: 0.8;
			padding: 15px;
			background: rgba(255,255,255,0.1);
			border-radius: 10px;
		}
		.close-btn {
			margin-top: 20px;
			padding: 12px 30px;
			background: white;
			color: ` + bgColor + `;
			border: none;
			border-radius: 25px;
			font-size: 16px;
			font-weight: bold;
			cursor: pointer;
		}
		.close-btn:hover { opacity: 0.9; }
	</style>
</head>
<body>
	<div class="container">
		<div class="icon">` + icon + `</div>
		<h1>` + title + `</h1>
		<p>` + message + `</p>
		<div class="note">
			` + paymentPageString(lang, "note.returnToStream") + `<br>
			` + paymentPageString(lang, "note.autoReflect") + `
		</div>
		<button class="close-btn" onclick="window.close()">` + paymentPageString(lang, "button.close") + `</button>
	</div>
	<script>
		// Auto close after 10 seconds
		setTimeout(function() {
			window.close();
		}, 10000);
	</script>
</body>
</html>`

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if _, err := w.Write([]byte(html)); err != nil {
		return
	}
}
