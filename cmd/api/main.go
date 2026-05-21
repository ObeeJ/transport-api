package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	fiberws "github.com/gofiber/websocket/v2"
	"github.com/joho/godotenv"
	"github.com/obeej/akin/internal/config"
	"github.com/obeej/akin/internal/db"
	"github.com/obeej/akin/internal/email"
	"github.com/obeej/akin/internal/handlers"
	"github.com/obeej/akin/internal/middleware"
	"github.com/obeej/akin/internal/payments"
	"github.com/obeej/akin/internal/payments/paystack"
	"github.com/obeej/akin/internal/reconciler"
	"github.com/obeej/akin/internal/repository"
	"github.com/obeej/akin/internal/service"
	"github.com/obeej/akin/internal/ws"
)

func main() {
	_ = godotenv.Load()

	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load", "err", err)
		os.Exit(1)
	}
	for _, w := range cfg.Warnings() {
		slog.Warn("config", "msg", w)
	}

	gdb, err := db.Open(cfg.DatabaseURL, cfg.AppEnv)
	if err != nil {
		slog.Error("db open", "err", err)
		os.Exit(1)
	}
	if err := db.AutoMigrate(gdb); err != nil {
		slog.Error("db migrate", "err", err)
		os.Exit(1)
	}
	if err := db.RunGooseUp(gdb); err != nil {
		slog.Error("goose up", "err", err)
		os.Exit(1)
	}

	// Redis + WebSocket hub (optional — degrades gracefully if Redis is down)
	var seatHub *ws.Hub
	rdb, redisErr := db.OpenRedis(cfg.RedisURL)
	if redisErr != nil {
		slog.Warn("redis unavailable — live seat updates disabled", "err", redisErr)
	} else {
		seatHub = ws.NewHub(rdb)
		slog.Info("redis connected — websocket hub ready")
	}

	var paymentProvider payments.DisbursementProvider
	if cfg.PaystackConfigured() {
		paymentProvider = paystack.New(cfg.PaystackSecretKey)
		slog.Info("paystack configured")
	} else {
		slog.Warn("paystack NOT configured — deposit endpoints will return 503")
	}

	// Email sender
	mailer := email.New(email.SMTPConfig{
		Host:     cfg.SMTPHost,
		Port:     cfg.SMTPPort,
		Username: cfg.SMTPUsername,
		Password: cfg.SMTPPassword,
		From:     cfg.EmailFrom,
	})
	if mailer.Configured() {
		slog.Info("smtp email configured", "from", cfg.EmailFrom, "host", cfg.SMTPHost)
	} else {
		slog.Warn("email NOT configured — verification tokens will be logged server-side (set SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD)")
	}

	// --- Repositories ---
	userRepo := repository.NewUserRepo(gdb)
	sessionRepo := repository.NewSessionRepo(gdb)
	depositRepo := repository.NewDepositRepo(gdb)
	recipientRepo := repository.NewRecipientRepo(gdb)
	stewardRepo := repository.NewStewardRepo(gdb)
	payoutRepo := repository.NewPayoutRepo(gdb)
	rideRepo := repository.NewRideRepo(gdb)
	notifyRepo := repository.NewNotificationRepo(gdb)
	walletRepo := repository.NewWalletRepo(gdb)
	driverRepo := repository.NewDriverRepo(gdb)
	attendanceRepo := repository.NewAttendanceRepo(gdb)
	rosterRepo := repository.NewRosterRepo(gdb)
	ratingRepo := repository.NewRatingRepo(gdb)
	impactRepo := repository.NewDriverImpactRepo(gdb)
	noteRepo := repository.NewNoteRepo(gdb)
	sosRepo := repository.NewSOSRepo(gdb)
	gpsRepo := repository.NewGPSRepo(gdb)
	appealRepo := repository.NewAppealRepo(gdb)

	// --- Services ---
	notifySvc := service.NewNotificationService(notifyRepo)
	walletSvc := service.NewWalletService(walletRepo, notifySvc, gdb)
	authSvc := service.NewAuthService(userRepo, sessionRepo, cfg, mailer, gdb)
	emailVerifySvc := service.NewEmailVerifyService(userRepo, notifySvc, mailer, cfg.AppBaseURL, gdb)
	depositSvc := service.NewDepositService(depositRepo, recipientRepo, paymentProvider, cfg, notifySvc, gdb)
	poolSvc := service.NewPoolService(depositRepo)
	recipientSvc := service.NewRecipientService(recipientRepo, userRepo, paymentProvider, gdb)
	stewardSvc := service.NewStewardService(stewardRepo, recipientRepo, notifySvc, gdb)
	rideSvc := service.NewRideService(rideRepo, driverRepo, userRepo, seatHub, gdb)
	driverSvc := service.NewDriverService(driverRepo, stewardRepo, rideRepo, notifySvc, gdb)
	attendanceSvc := service.NewAttendanceService(attendanceRepo, userRepo, driverRepo, recipientRepo, gdb)
	payoutSvc := service.NewPayoutService(payoutRepo, recipientRepo, stewardRepo, userRepo, paymentProvider, walletSvc, notifySvc, attendanceSvc, cfg.MockTransfers, gdb)
	rosterSvc := service.NewRosterService(rosterRepo, userRepo, gdb)
	ratingSvc := service.NewRatingService(ratingRepo, impactRepo, rideRepo, notifySvc, gdb)
	noteSvc := service.NewNoteService(noteRepo)
	sosSvc := service.NewSOSService(sosRepo, rideRepo, notifySvc, gdb)
	gpsSvc := service.NewGPSService(gpsRepo, rideRepo, gdb)
	appealSvc := service.NewAppealService(appealRepo, recipientRepo, stewardRepo, notifySvc, gdb)
	reportSvc := service.NewReportService(depositRepo, payoutRepo, recipientRepo, rideRepo, attendanceRepo, ratingRepo, impactRepo)

	// --- Handlers ---
	authH := handlers.NewAuthHandler(authSvc, cfg)
	emailVerifyH := handlers.NewEmailVerifyHandler(emailVerifySvc, cfg.AppBaseURL)
	giverH := handlers.NewGiverHandler(depositSvc)
	poolH := handlers.NewPoolHandler(poolSvc)
	recipientH := handlers.NewRecipientHandler(recipientSvc)
	stewardH := handlers.NewStewardHandler(stewardSvc)
	payoutH := handlers.NewPayoutHandler(payoutSvc)
	ridesH := handlers.NewRidesHandler(rideSvc)
	banksH := handlers.NewBanksHandler(paymentProvider)
	webhookH := handlers.NewWebhookHandler(paymentProvider, depositSvc, payoutSvc, gdb)
	resendWebhookH := handlers.NewResendWebhookHandler(cfg.ResendWebhookSecret, userRepo, notifyRepo, gdb)
	notifyH := handlers.NewNotificationHandler(notifySvc)
	walletH := handlers.NewWalletHandler(walletSvc)
	driverH := handlers.NewDriverHandler(driverSvc)
	attendanceH := handlers.NewAttendanceHandler(attendanceSvc)
	rosterH := handlers.NewRosterHandler(rosterSvc)
	ratingH := handlers.NewRatingHandler(ratingSvc)
	noteH := handlers.NewNoteHandler(noteSvc)
	sosH := handlers.NewSOSHandler(sosSvc)
	gpsH := handlers.NewGPSHandler(gpsSvc)
	appealH := handlers.NewAppealHandler(appealSvc)
	reportH := handlers.NewReportHandler(reportSvc)
	wsH := handlers.NewWSHandler(seatHub)

	// --- App ---
	app := fiber.New(fiber.Config{
		AppName:      "akin-api",
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	})

	prod := cfg.AppEnv == "production"

	// Order matters — request ID first so every later log line carries it.
	app.Use(middleware.RequestID())
	app.Use(middleware.Logger())
	app.Use(middleware.SecurityHeaders(prod))
	app.Use(middleware.CORS(cfg.CORSAllowedOrigin))
	app.Use(middleware.CSRFCookie(prod))
	app.Use(middleware.CSRF())

	// --- Health (mounted before CSRF check so probes don't need a token) ---
	healthH := handlers.NewHealthHandler(gdb, rdb)
	app.Get("/healthz", healthH.Live)
	app.Get("/readyz", healthH.Ready)
	// /auth/csrf — frontends call this once on boot to obtain the
	// double-submit token in the JSON body. Necessary because Firefox
	// Total Cookie Protection and Chrome's 3PCD partition prevent
	// document.cookie from reading the cross-site cookie from JS, even
	// though the cookie is still SENT on requests. CSRFCookie middleware
	// publishes the effective token via c.Locals(middleware.CSRFLocalKey).
	app.Get("/auth/csrf", func(c *fiber.Ctx) error {
		tok, _ := c.Locals(middleware.CSRFLocalKey).(string)
		return c.JSON(fiber.Map{"token": tok})
	})

	// --- Rate limiters ---
	// Auth: 10 attempts / 5 min, keyed by (IP + email) so a shared NAT doesn't
	// lock out everyone behind it.
	authLimit := middleware.NewLimiter(10, 5*time.Minute, middleware.ByIPAndEmail, "too_many_auth_attempts").Middleware()
	// Webhook: 60 / min by IP — Paystack delivers a steady trickle, this gives
	// a lot of headroom while blocking spray attempts.
	webhookLimit := middleware.NewLimiter(60, time.Minute, nil, "too_many_webhooks").Middleware()
	// Payments-initiate: 10 / min — generous for legit traffic, tight enough
	// to block enumeration of references.
	paymentLimit := middleware.NewLimiter(10, time.Minute, nil, "too_many_requests").Middleware()

	authed := middleware.RequireAuth(gdb, cfg.SessionCookieName)

	// Auth (rate-limited — CSRF is applied globally above)
	app.Post("/auth/signup", authLimit, authH.Signup)
	app.Post("/auth/login", authLimit, authH.Login)
	app.Post("/auth/password/reset/request", authLimit, authH.RequestPasswordReset)
	app.Post("/auth/password/reset/confirm", authLimit, authH.ConfirmPasswordReset)
	app.Post("/auth/logout", authed, authH.Logout)
	app.Get("/auth/me", authed, authH.Me)
	app.Post("/auth/password/reset-request", authLimit, authH.RequestPasswordReset)
	app.Post("/auth/password/reset-confirm", authLimit, authH.ConfirmPasswordReset)
	app.Post("/auth/email/verify/send", authed, emailVerifyH.Send)
	app.Post("/auth/email/verify/confirm", authed, emailVerifyH.Confirm)
	// GET — no auth needed, token is the credential (clicked from email)
	app.Get("/auth/email/verify/confirm", emailVerifyH.ConfirmViaLink)

	// Roster
	app.Post("/roster/verify", authed, rosterH.Verify)
	app.Get("/roster/me", authed, rosterH.Me)

	// Giver — payment initiation is rate-limited and CSRF-protected
	app.Post("/giver/deposits/initialize", authed, paymentLimit, giverH.InitializeDeposit)
	app.Get("/giver/deposits/:reference", authed, giverH.GetDeposit)

	// Encouragement notes
	app.Post("/notes", authed, noteH.Submit)
	app.Get("/notes", authed, noteH.Feed)

	// Recipients
	app.Post("/recipients/apply", authed, recipientH.Apply)
	app.Get("/recipients/me", authed, recipientH.Me)
	app.Get("/recipients/me/bank", authed, recipientH.GetBank)
	app.Post("/recipients/me/bank/resolve", authed, recipientH.ResolveBank)
	app.Post("/recipients/me/bank", authed, recipientH.SaveBank)
	app.Post("/recipients/me/appeal", authed, appealH.Submit)

	// Banks
	app.Get("/banks", authed, banksH.List)

	// Notifications
	app.Get("/notifications", authed, notifyH.List)
	app.Post("/notifications/:id/read", authed, notifyH.MarkRead)
	app.Post("/notifications/read-all", authed, notifyH.MarkAllRead)

	// Wallet
	app.Get("/wallet", authed, walletH.Balance)
	app.Get("/wallet/transactions", authed, walletH.Transactions)
	app.Post("/wallet/debit", authed, walletH.Debit)
	// Recipient self-service withdrawal: wallet → bank. Rate-limited like
	// other payment-initiating endpoints; auth + CSRF apply via middleware.
	app.Post("/wallet/withdraw", authed, paymentLimit, payoutH.Withdraw)

	// Driver
	app.Post("/driver/apply", authed, driverH.Apply)
	app.Get("/driver/me", authed, driverH.Me)
	app.Get("/driver/impact", authed, ratingH.MyImpact)
	app.Get("/driver/average", authed, ratingH.MyAverage)

	// Attendance
	app.Get("/attendance/me", authed, attendanceH.Me)

	// Ride Network
	app.Get("/hubs", authed, ridesH.ListHubs)
	app.Get("/trips/demand", authed, ridesH.TripDemand)
	app.Get("/trips", authed, ridesH.ListTrips)
	app.Post("/trips", authed, ridesH.PublishTrip)
	app.Get("/trips/:id", authed, ridesH.GetTrip)
	app.Post("/trips/:id/start", authed, ridesH.StartTrip)
	app.Post("/trips/:id/complete", authed, ridesH.CompleteTrip)
	app.Post("/trips/:id/cancel", authed, ridesH.CancelTrip)
	app.Post("/trips/:id/bookings", authed, ridesH.BookSeat)
	app.Delete("/trips/:id/bookings/me", authed, ridesH.CancelBooking)
	app.Post("/trips/:id/attendance", authed, driverH.MarkAttendance)
	app.Post("/trips/:id/ratings", authed, ratingH.Submit)
	app.Post("/trips/:id/sos", authed, sosH.Trigger)
	app.Post("/trips/:id/gps", authed, gpsH.Record)
	app.Get("/trips/:id/gps", authed, gpsH.Track)
	app.Get("/trips/:id/gps/latest", authed, gpsH.Latest)
	app.Get("/drive/trips", authed, ridesH.MyDriverTrips)
	app.Get("/ride/bookings", authed, ridesH.MyRiderBookings)

	// WebSocket — live seat count (no auth middleware, hub checks internally)
	if seatHub != nil {
		app.Use("/ws", wsH.Upgrade)
		app.Get("/ws/trips/:id/seats", fiberws.New(wsH.TripSeats))
	}

	// Transparency report (public)
	app.Get("/reports/monthly", reportH.Monthly)

	// Steward (role-gated)
	if cfg.MockTransfers {
		slog.Warn("MOCK_TRANSFERS=true — payouts will be simulated")
	}
	steward := app.Group("/steward", authed, middleware.RequireSteward())
	steward.Get("/queue", stewardH.Queue)
	steward.Get("/applications/:id", stewardH.Application)
	steward.Post("/applications/:id/decisions", stewardH.Decide)
	steward.Get("/audit", stewardH.Audit)
	steward.Get("/recipients/approved", payoutH.ApprovedRecipients)
	steward.Get("/payouts", payoutH.List)
	steward.Get("/payouts/preview", payoutH.Preview)
	steward.Post("/payouts", payoutH.Initiate)
	steward.Post("/payouts/batch", payoutH.InitiateBatch)
	steward.Post("/payouts/batch/:batchId/confirm", payoutH.ConfirmBatch)
	steward.Post("/payouts/:id/confirm", payoutH.Confirm)
	steward.Get("/drivers/queue", driverH.Queue)
	steward.Post("/drivers/:id/decisions", driverH.Decide)
	steward.Post("/attendance", attendanceH.Upload)
	steward.Post("/attendance/manual", attendanceH.Manual)
	steward.Post("/roster/import", rosterH.Import)
	steward.Get("/roster/stats", rosterH.Stats)
	steward.Get("/sos", sosH.Queue)
	steward.Post("/sos/:id/acknowledge", sosH.Acknowledge)
	steward.Post("/sos/:id/resolve", sosH.Resolve)
	steward.Get("/appeals", appealH.Queue)
	steward.Post("/appeals/:id/review", appealH.Review)
	steward.Post("/appeals/:id/decide", appealH.Decide)

	// Webhooks (no auth, signature-verified)
	// Webhooks — no auth (signature-verified), no CSRF (Paystack can't carry our cookie),
	// but rate-limited per IP to blunt signature-brute-force attempts.
	app.Post("/webhooks/paystack", webhookLimit, webhookH.Paystack)
	app.Post("/webhooks/resend", resendWebhookH.Handle)

	// Pool (public aggregate)
	app.Get("/pool/this-week", poolH.ThisWeek)

	// Boot
	weeklyCredit := reconciler.NewWeeklyCreditJob(recipientRepo, walletSvc, attendanceSvc, gdb)
	rec := reconciler.New(gdb, 5*time.Minute).WithWeeklyCredit(weeklyCredit)
	rec.Start()

	go func() {
		addr := ":" + cfg.APIPort
		slog.Info("api listening", "addr", addr)
		if err := app.Listen(addr); err != nil {
			slog.Error("listen", "err", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("shutting down")
	rec.Stop()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(ctx); err != nil {
		slog.Error("shutdown", "err", err)
	}
}
