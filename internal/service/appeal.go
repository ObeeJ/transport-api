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
	ErrAppealNotFound    = errors.New("appeal_not_found")
	ErrAppealNotOpen     = errors.New("appeal_not_open")
	ErrAppealSameSteward = errors.New("appeal_same_steward_forbidden")
	ErrTooManyAppeals    = errors.New("too_many_appeals")
	ErrInvalidOutcome    = errors.New("invalid_outcome")
)

const maxAppealsPerRecipient = 3

type AppealService struct {
	repo       *repository.AppealRepo
	recipients *repository.RecipientRepo
	stewards   *repository.StewardRepo
	notify     *NotificationService
	db         *gorm.DB
}

func NewAppealService(
	repo *repository.AppealRepo,
	recipients *repository.RecipientRepo,
	stewards *repository.StewardRepo,
	notify *NotificationService,
	db *gorm.DB,
) *AppealService {
	return &AppealService{repo: repo, recipients: recipients, stewards: stewards, notify: notify, db: db}
}

// Submit — recipient files an appeal against their declined/capped decision.
func (s *AppealService) Submit(userID uuid.UUID, reason string) (*models.RecipientAppeal, error) {
	r, err := s.recipients.FindByUserID(userID)
	if err != nil {
		return nil, ErrRecipientNotFound
	}

	// Cap appeals to prevent abuse.
	count, _ := s.repo.CountByRecipient(r.ID)
	if count >= maxAppealsPerRecipient {
		return nil, ErrTooManyAppeals
	}

	appeal := &models.RecipientAppeal{
		RecipientID: r.ID,
		Reason:      reason,
		Status:      "open",
	}
	if err := s.repo.Create(appeal); err != nil {
		return nil, err
	}

	audit.Record(s.db, userID.String(), "appeal_submitted", appeal.ID.String(), map[string]any{
		"pseudonymousId": r.PseudonymousID,
	})
	return appeal, nil
}

// Review — steward picks up an appeal for review.
func (s *AppealService) Review(appealID, stewardID uuid.UUID) (*models.RecipientAppeal, error) {
	appeal, err := s.repo.FindByID(appealID)
	if err != nil {
		return nil, ErrAppealNotFound
	}
	if appeal.Status != "open" {
		return nil, ErrAppealNotOpen
	}

	// Enforce: the reviewing steward must not have been involved in the
	// original decision on this recipient.
	r, _ := s.recipients.FindByID(appeal.RecipientID)
	if r != nil {
		if _, err := s.stewards.FindActionByStewardAndSubject(stewardID, r.ID, "recipient"); err == nil {
			return nil, ErrAppealSameSteward
		}
	}

	if err := s.repo.Update(appealID, map[string]any{
		"status":      "under_review",
		"reviewed_by": stewardID,
	}); err != nil {
		return nil, err
	}

	audit.Record(s.db, stewardID.String(), "appeal_under_review", appealID.String(), nil)
	return s.repo.FindByID(appealID)
}

// Decide — steward resolves the appeal: upheld | dismissed.
func (s *AppealService) Decide(appealID, stewardID uuid.UUID, outcome, note string) (*models.RecipientAppeal, error) {
	if outcome != "upheld" && outcome != "dismissed" {
		return nil, ErrInvalidOutcome
	}

	appeal, err := s.repo.FindByID(appealID)
	if err != nil {
		return nil, ErrAppealNotFound
	}
	if appeal.Status != "under_review" {
		return nil, ErrAppealNotOpen
	}

	now := time.Now()
	if err := s.repo.Update(appealID, map[string]any{
		"status":      outcome,
		"review_note": note,
		"resolved_at": &now,
	}); err != nil {
		return nil, err
	}

	// If upheld, reset the recipient back to pending for re-review.
	if outcome == "upheld" {
		r, err := s.recipients.FindByID(appeal.RecipientID)
		if err == nil {
			_ = s.recipients.UpdateStatus(r.ID, map[string]any{"status": "pending", "decided_at": nil})
			if s.notify != nil {
				_ = s.notify.Send(r.UserID, "appeal_upheld",
					"Your appeal was successful",
					"Your application has been returned for a fresh review by a different steward.",
				)
			}
		}
	} else {
		r, err := s.recipients.FindByID(appeal.RecipientID)
		if err == nil && s.notify != nil {
			_ = s.notify.Send(r.UserID, "appeal_dismissed",
				"Appeal outcome",
				"Your appeal has been reviewed. The original decision stands.",
			)
		}
	}

	audit.Record(s.db, stewardID.String(), "appeal_"+outcome, appealID.String(), map[string]any{"note": note})
	return s.repo.FindByID(appealID)
}

func (s *AppealService) ListOpen() ([]models.RecipientAppeal, error) {
	return s.repo.ListOpen()
}
