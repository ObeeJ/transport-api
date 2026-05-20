package audit

import (
	"encoding/json"
	"log/slog"

	"github.com/obeej/akin/internal/models"
	"gorm.io/gorm"
)

// Record appends an audit entry. Errors are logged but never propagated —
// audit failures must not block business operations. The append-only
// guarantee is enforced at the model level (BeforeUpdate/BeforeDelete).
func Record(gdb *gorm.DB, actor, action, subject string, meta any) {
	entry := &models.AuditEntry{
		Actor:   actor,
		Action:  action,
		Subject: subject,
	}
	if meta != nil {
		b, err := json.Marshal(meta)
		if err != nil {
			slog.Warn("audit metadata marshal failed", "err", err, "action", action)
		} else {
			s := string(b)
			entry.Metadata = &s
		}
	}
	if err := gdb.Create(entry).Error; err != nil {
		slog.Error("audit record failed", "err", err, "action", action, "actor", actor)
	}
}
