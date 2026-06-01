package service

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrNotFound          = errors.New("not_found")
	ErrAlreadyDecided    = errors.New("already_decided")
	ErrSelfReview        = errors.New("self_review_forbidden")
	ErrAlreadyRecorded   = errors.New("already_recorded")
	ErrInvalidDecision   = errors.New("invalid_decision")
	ErrWeeklyCapTooSmall = errors.New("weekly_cap_too_small")
)

type StewardService struct {
	repo       *repository.StewardRepo
	recipients *repository.RecipientRepo
	notify     *NotificationService
	db         *gorm.DB
}

func NewStewardService(repo *repository.StewardRepo, recipients *repository.RecipientRepo, notify *NotificationService, db *gorm.DB) *StewardService {
	return &StewardService{repo: repo, recipients: recipients, notify: notify, db: db}
}

// Queue returns the pending-recipient review queue for one institution.
func (s *StewardService) Queue(institutionID uuid.UUID) ([]models.Recipient, error) {
	return s.recipients.ListPending(institutionID)
}

// Workload returns a 4 × 6 intensity matrix (0-4) of pending items across the
// four steward queues, distributed by the day-of-week each item was created.
// Surfaces "when work piles up" — Mondays heavy on driver intake, etc.
// Saturday/Friday peaks tell stewards when to rally; flat rows mean a calm
// queue. Items created on Sunday are folded into the Monday column to keep
// the 6-day grid clean.
type StewardWorkload struct {
	Queues []string `json:"queues"`
	Days   []string `json:"days"`
	Matrix [][]int  `json:"matrix"`
}

func (s *StewardService) Workload() (*StewardWorkload, error) {
	queues := []struct {
		Label string
		SQL   string
	}{
		{"Commuter intake", `SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*) AS cnt FROM recipients       WHERE status = 'pending'           GROUP BY 1`},
		{"Driver onboard", `SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*) AS cnt FROM driver_profiles  WHERE status = 'pending'           GROUP BY 1`},
		{"SOS alerts",     `SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*) AS cnt FROM sos_alerts       WHERE status = 'open'              GROUP BY 1`},
		{"Payout auths",   `SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*) AS cnt FROM payouts          WHERE status = 'awaiting_confirm'  GROUP BY 1`},
	}

	out := &StewardWorkload{
		Queues: make([]string, len(queues)),
		Days:   []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat"},
		Matrix: make([][]int, len(queues)),
	}
	counts := make([][]int, len(queues))
	for i := range counts {
		counts[i] = make([]int, 6)
		out.Queues[i] = queues[i].Label
		out.Matrix[i] = make([]int, 6)
	}
	max := 0
	for qi, q := range queues {
		var rows []struct {
			Dow int
			Cnt int
		}
		if err := s.db.Raw(q.SQL).Scan(&rows).Error; err != nil {
			return nil, err
		}
		for _, r := range rows {
			// Map dow (0=Sun..6=Sat) → col idx (0=Mon..5=Sat). Fold Sunday
			// into Monday so the grid stays full-width.
			col := r.Dow - 1
			if col < 0 {
				col = 0
			}
			if col > 5 {
				continue
			}
			counts[qi][col] += r.Cnt
			if counts[qi][col] > max {
				max = counts[qi][col]
			}
		}
	}
	if max == 0 {
		return out, nil
	}
	for i := 0; i < len(queues); i++ {
		for j := 0; j < 6; j++ {
			out.Matrix[i][j] = (counts[i][j]*4 + max/2) / max
		}
	}
	return out, nil
}

type ApplicationDetail struct {
	Recipient    models.Recipient
	Actions      []models.StewardAction
	YourDecision *models.StewardAction
}

func (s *StewardService) GetApplication(id, stewardID uuid.UUID) (*ApplicationDetail, error) {
	r, err := s.recipients.FindByID(id)
	if err != nil {
		return nil, ErrNotFound
	}
	actions, _ := s.repo.ListActionsBySubject(r.ID, "recipient")

	detail := &ApplicationDetail{Recipient: *r, Actions: actions}
	for i := range actions {
		if actions[i].StewardID == stewardID {
			detail.YourDecision = &actions[i]
			break
		}
	}
	return detail, nil
}

type DecideInput struct {
	RecipientID   uuid.UUID
	StewardID     uuid.UUID
	Decision      string // approve | decline
	WeeklyCapKobo int64
	Note          string
}

type DecideResult struct {
	Action       *models.StewardAction
	Transitioned bool
	SignoffsSoFar int
	Recipient    models.Recipient
}

func (s *StewardService) Decide(input DecideInput) (*DecideResult, error) {
	if input.Decision != "approve" && input.Decision != "decline" {
		return nil, ErrInvalidDecision
	}
	if input.Decision == "approve" && input.WeeklyCapKobo < 100 {
		return nil, ErrWeeklyCapTooSmall
	}

	r, err := s.recipients.FindByID(input.RecipientID)
	if err != nil {
		return nil, ErrNotFound
	}
	if r.Status != "pending" {
		return nil, ErrAlreadyDecided
	}
	// Conflict of interest guard.
	if r.UserID == input.StewardID {
		return nil, ErrSelfReview
	}
	// Duplicate sign-off guard.
	if _, err := s.repo.FindActionByStewardAndSubject(input.StewardID, r.ID, "recipient"); err == nil {
		return nil, ErrAlreadyRecorded
	}

	action := &models.StewardAction{
		StewardID:     input.StewardID,
		SubjectType:   "recipient",
		SubjectID:     r.ID,
		Decision:      input.Decision,
		WeeklyCapKobo: input.WeeklyCapKobo,
		Note:          input.Note,
	}
	if err := s.repo.CreateAction(action); err != nil {
		return nil, err
	}

	// Count distinct stewards with matching decision.
	matching, _ := s.repo.ListActionsBySubjectAndDecision(r.ID, "recipient", input.Decision)
	unique := uniqueStewardActions(matching)

	result := &DecideResult{Action: action, SignoffsSoFar: len(unique), Recipient: *r}

	if len(unique) >= 2 {
		now := time.Now()
		newStatus := map[string]string{"approve": "approved", "decline": "declined"}[input.Decision]
		updates := map[string]any{"status": newStatus, "decided_at": &now}
		if newStatus == "approved" {
			updates["weekly_cap_kobo"] = input.WeeklyCapKobo
		}
		if err := s.recipients.UpdateStatus(r.ID, updates); err != nil {
			return nil, err
		}
		result.Transitioned = true
		result.Recipient.Status = newStatus

		if s.notify != nil {
			titles := map[string]string{"approved": "Your application was approved", "declined": "Your application update"}
			bodies := map[string]string{
				"approved": "Your support application has been approved. A steward will be in touch about next steps.",
				"declined": "Your support application was reviewed and was not approved at this time.",
			}
			_ = s.notify.Send(r.UserID, "recipient_"+newStatus, titles[newStatus], bodies[newStatus])
		}

		audit.Record(s.db, input.StewardID.String(), "recipient_"+newStatus, r.ID.String(), map[string]any{
			"pseudonymousId": r.PseudonymousID,
			"weeklyCapKobo":  input.WeeklyCapKobo,
			"stewardActions": len(unique),
		})
	} else {
		audit.Record(s.db, input.StewardID.String(), "steward_decision_recorded", r.ID.String(), map[string]any{
			"pseudonymousId": r.PseudonymousID,
			"decision":       input.Decision,
			"signoffsSoFar":  len(unique),
		})
	}

	return result, nil
}

func (s *StewardService) ListAudit(limit int) ([]models.AuditEntry, error) {
	return s.repo.ListAudit(limit)
}

func (s *StewardService) ListAuditCursor(cursor time.Time, limit int) ([]models.AuditEntry, error) {
	return s.repo.ListAuditCursor(cursor, limit)
}

func uniqueStewardActions(actions []models.StewardAction) map[uuid.UUID]models.StewardAction {
	m := map[uuid.UUID]models.StewardAction{}
	for _, a := range actions {
		if existing, ok := m[a.StewardID]; !ok || a.CreatedAt.After(existing.CreatedAt) {
			m[a.StewardID] = a
		}
	}
	return m
}
