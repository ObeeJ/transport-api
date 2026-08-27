// Package notification provides the copy engine — emotional, human notifications.
// Never "Error 500". Always actionable, warm copy.
package notification

import "fmt"

type Template struct {
	Title string
	Body  string
}

var templates = map[string]func(data map[string]any) Template{
	"wallet.credited": func(d map[string]any) Template {
		amount := fmt.Sprintf("₦%v", d["amount"])
		return Template{
			Title: "Money's in 🎉",
			Body:  amount + " just landed in your wallet. It's yours — withdraw whenever you're ready.",
		}
	},
	"wings.issued": func(d map[string]any) Template {
		amount := fmt.Sprintf("%vW", d["amount"])
		return Template{
			Title: "Someone's got your back ✨",
			Body:  amount + " in ride credits just arrived. They expire in 7 days — use them for your next trip.",
		}
	},
	"wings.expiring_soon": func(d map[string]any) Template {
		amount := fmt.Sprintf("%vW", d["amount"])
		return Template{
			Title: "Your credits expire tomorrow",
			Body:  amount + " in ride credits expire in 24 hours. Book a trip before they're gone.",
		}
	},
	"kyc.verified": func(_ map[string]any) Template {
		return Template{
			Title: "Identity verified ✅",
			Body:  "You're now fully verified. Your trust score just went up.",
		}
	},
	"kyc.failed": func(_ map[string]any) Template {
		return Template{
			Title: "Verification needs another look",
			Body:  "We couldn't verify your NIN automatically. Tap here to try again or contact support.",
		}
	},
	"ride.matched": func(d map[string]any) Template {
		driver := fmt.Sprintf("%v", d["driver_name"])
		return Template{
			Title: "Driver found! 🚗",
			Body:  driver + " is on the way. Track them live in the app.",
		}
	},
	"ride.completed": func(_ map[string]any) Template {
		return Template{
			Title: "Safe and sound 🏁",
			Body:  "Trip complete. How was your ride? Your rating helps the whole community.",
		}
	},
	"payout.initiated": func(d map[string]any) Template {
		amount := fmt.Sprintf("₦%v", d["amount"])
		return Template{
			Title: "Withdrawal on its way",
			Body:  amount + " is being sent to your bank. Usually arrives within minutes.",
		}
	},
	"payout.failed": func(_ map[string]any) Template {
		return Template{
			Title: "Transfer hit a snag",
			Body:  "Your withdrawal didn't go through. Your balance is safe — tap here to try again.",
		}
	},
	"ambassador.reward_earned": func(d map[string]any) Template {
		return Template{
			Title: "Referral reward unlocked 🎁",
			Body:  fmt.Sprintf("Your referral just completed their first ride. %v has been added to your earnings.", d["amount"]),
		}
	},
	"transparency.hold": func(_ map[string]any) Template {
		return Template{
			Title: "Post to unlock your credits",
			Body:  "Your ride credits are ready — just share a quick thank-you post first. It takes 10 seconds.",
		}
	},
	"circle.membership_active": func(_ map[string]any) Template {
		return Template{
			Title: "Welcome to Akin Circle ⭕",
			Body:  "No ads, verified badge, and priority support. Thanks for being part of this.",
		}
	},
}

// Render returns the notification copy for an event type.
func Render(eventType string, data map[string]any) Template {
	if fn, ok := templates[eventType]; ok {
		return fn(data)
	}
	return Template{Title: "Update from Akin", Body: "Something happened on your account. Open the app to see."}
}
