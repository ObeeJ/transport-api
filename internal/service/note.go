package service

import (
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
)

var (
	ErrNoteEmpty    = errors.New("note_empty")
	ErrNoteTooLong  = errors.New("note_too_long")
)

const maxNoteLength = 280

type NoteService struct {
	repo *repository.NoteRepo
}

func NewNoteService(repo *repository.NoteRepo) *NoteService {
	return &NoteService{repo: repo}
}

// Submit — giver posts an anonymous note. GiverID is stored but never
// returned in any response — it exists only for abuse moderation.
func (s *NoteService) Submit(giverID uuid.UUID, body string) (*models.EncouragementNote, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, ErrNoteEmpty
	}
	if len(body) > maxNoteLength {
		return nil, ErrNoteTooLong
	}

	note := &models.EncouragementNote{
		GiverID: giverID,
		Body:    body,
		Active:  true,
	}
	if err := s.repo.Create(note); err != nil {
		return nil, err
	}
	return note, nil
}

// Feed returns active notes for the recipient encouragement feed.
// GiverID is structurally absent from the return type — anonymity
// is enforced by the type system, not just a JSON tag.
type NoteView struct {
	ID        string `json:"id"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

func (s *NoteService) Feed() ([]NoteView, error) {
	notes, err := s.repo.ListActive(20)
	if err != nil {
		return nil, err
	}
	out := make([]NoteView, 0, len(notes))
	for _, n := range notes {
		out = append(out, NoteView{
			ID:        n.ID.String(),
			Body:      n.Body,
			CreatedAt: n.CreatedAt.Format("2006-01-02"),
		})
	}
	return out, nil
}
