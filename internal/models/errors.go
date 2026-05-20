package models

import "errors"

var ErrAuditImmutable = errors.New("audit_entries is append-only: update/delete are not allowed")
