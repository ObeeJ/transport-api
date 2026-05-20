package identity

import (
	"crypto/rand"
	"fmt"
	"math/big"
)

// NewPseudonymousID returns a short, memorable, non-sequential identifier
// for a recipient, e.g. "R-7421". Stewards see this in their queue
// instead of names. Four random digits gives 9,000 possibilities — more
// than enough for a single 500-person cohort, and collisions are
// rejected at the database level by a unique index.
func NewPseudonymousID() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(9000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("R-%04d", n.Int64()+1000), nil
}
